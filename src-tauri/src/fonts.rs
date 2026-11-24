use crate::{
    local_server::{reject_untrusted_mutation, secure_json, state_result},
    runtime::RuntimeState,
};
use axum::{
    body::{Body, Bytes},
    extract::{DefaultBodyLimit, Path as AssetPath, Query, State},
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::Response,
    routing::get,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::{fs, path::{Path, PathBuf}, sync::Arc};

pub const IDS: &[&str] = &[
    "anton",
    "archivo-black",
    "barlow-condensed",
    "bebas-neue",
    "bungee-shade",
    "inter",
    "lato",
    "montserrat",
    "oswald",
    "oxanium",
    "titan-one",
];

const MAX_FONT_BYTES: usize = 20 * 1024 * 1024;

#[derive(Deserialize, Serialize)]
struct ImportedFont {
    id: String,
    name: String,
}

pub fn valid_scoreboard_font(id: &str) -> bool {
    IDS.contains(&id) || valid_imported_id(id)
}

fn valid_imported_id(id: &str) -> bool {
    id.strip_prefix("file-").is_some_and(|suffix| {
        (1..=32).contains(&suffix.len())
            && suffix.bytes().all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    })
}

pub fn router() -> Router<Arc<RuntimeState>> {
    Router::new()
        .route("/api/fonts", get(list).post(import).delete(remove).layer(DefaultBodyLimit::max(MAX_FONT_BYTES)))
        .route("/assets/fonts/{font_id}", get(asset))
}

fn root(runtime: &RuntimeState) -> PathBuf {
    runtime.custom_scoreboard_directory.with_file_name("fonts")
}

async fn list(State(runtime): State<Arc<RuntimeState>>) -> Response {
    let fonts = fs::read_dir(root(&runtime))
        .into_iter()
        .flatten()
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let id = entry.file_name().into_string().ok()?;
            if !valid_imported_id(&id) || !entry.file_type().ok()?.is_dir() {
                return None;
            }
            let dir = entry.path();
            let name = fs::read_to_string(dir.join("name")).ok()?;
            (valid_name(&name) && dir.join("font").is_file()).then_some(ImportedFont { id, name })
        })
        .collect::<Vec<_>>();
    secure_json(Json(serde_json::json!({ "fonts": fonts })))
}

#[derive(Deserialize)]
struct ImportQuery {
    name: String,
}

async fn import(
    State(runtime): State<Arc<RuntimeState>>,
    headers: HeaderMap,
    Query(query): Query<ImportQuery>,
    body: Bytes,
) -> Response {
    if let Some(response) = reject_untrusted_mutation(&headers) {
        return response;
    }
    let directory = root(&runtime);
    match tokio::task::spawn_blocking(move || save_font(&directory, &query.name, &body)).await {
        Ok(Ok(font)) => secure_json((StatusCode::CREATED, Json(font))),
        Ok(Err(error)) => state_result(Err(error.to_owned())),
        Err(_) => state_result(Err("Could not save the font.".to_owned())),
    }
}

fn valid_name(name: &str) -> bool {
    !name.is_empty() && name.encode_utf16().count() <= 100 && !name.chars().any(char::is_control)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RemoveQuery {
    font_id: String,
}

async fn remove(
    State(runtime): State<Arc<RuntimeState>>,
    headers: HeaderMap,
    Query(query): Query<RemoveQuery>,
) -> Response {
    if let Some(response) = reject_untrusted_mutation(&headers) {
        return response;
    }
    let directory = root(&runtime);
    match tokio::task::spawn_blocking(move || remove_font(&directory, &query.font_id)).await {
        Ok(Ok(())) => {
            runtime.asset_catalog_revision.send_modify(|revision| *revision = revision.wrapping_add(1));
            secure_json(StatusCode::NO_CONTENT)
        }
        Ok(Err(error)) => state_result(Err(error.to_owned())),
        Err(_) => state_result(Err("Could not remove the font.".to_owned())),
    }
}

fn remove_font(root: &Path, id: &str) -> Result<(), &'static str> {
    if !valid_imported_id(id) {
        return Err("Choose an imported font.");
    }
    let directory = root.join(id);
    match fs::symlink_metadata(&directory) {
        Ok(metadata) if metadata.is_dir() => fs::remove_dir_all(directory).map_err(|_| "Could not remove the font."),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        _ => Err("Could not remove the font."),
    }
}

fn save_font(root: &Path, name: &str, bytes: &[u8]) -> Result<ImportedFont, &'static str> {
    let name = name.trim();
    if !valid_name(name) || font_content_type(bytes).is_none() {
        return Err("Choose a valid TTF or OTF font file.");
    }
    let id = format!("file-{:x}", time::OffsetDateTime::now_utc().unix_timestamp_nanos().unsigned_abs());
    let directory = root.join(&id);
    let save_error = "Could not save the font.";
    fs::create_dir_all(root).map_err(|_| save_error)?;
    fs::create_dir(&directory).map_err(|_| save_error)?;
    if fs::write(directory.join("font"), bytes)
        .and_then(|_| fs::write(directory.join("name"), name)).is_err()
    {
        let _ = fs::remove_dir_all(directory);
        return Err(save_error);
    }
    Ok(ImportedFont { id, name: name.to_owned() })
}

fn font_content_type(bytes: &[u8]) -> Option<&'static str> {
    if bytes.len() > MAX_FONT_BYTES {
        return None;
    }
    let mime = match bytes.get(..4)? {
        b"\x00\x01\x00\x00" | b"true" => "font/ttf",
        b"OTTO" => "font/otf",
        _ => return None,
    };
    let count = u16::from_be_bytes(bytes.get(4..6)?.try_into().ok()?) as usize;
    let directory_end = 12 + 16 * count;
    let tables = bytes.get(12..directory_end)?.chunks_exact(16);
    let mut head = false;
    let mut cmap = false;
    for table in tables {
        let offset = u32::from_be_bytes(table[8..12].try_into().ok()?) as usize;
        let length = u32::from_be_bytes(table[12..16].try_into().ok()?) as usize;
        if offset < directory_end || offset.checked_add(length)? > bytes.len() {
            return None;
        }
        head |= &table[..4] == b"head" && length >= 54;
        cmap |= &table[..4] == b"cmap" && length >= 4;
    }
    (head && cmap).then_some(mime)
}

async fn asset(State(runtime): State<Arc<RuntimeState>>, AssetPath(id): AssetPath<String>) -> Response {
    let Some((bytes, mime)) = read_asset(&root(&runtime), &id).await else {
        return secure_json(StatusCode::NOT_FOUND);
    };
    let mut response = secure_json(Response::new(Body::from(bytes)));
    response.headers_mut().insert(header::CONTENT_TYPE, HeaderValue::from_static(mime));
    response
}

async fn read_asset(root: &Path, id: &str) -> Option<(Vec<u8>, &'static str)> {
    if !valid_imported_id(id) {
        return None;
    }
    let directory = root.join(id);
    if !tokio::fs::symlink_metadata(&directory).await.ok()?.is_dir() || !directory.join("name").is_file() {
        return None;
    }
    let path = directory.join("font");
    let metadata = tokio::fs::symlink_metadata(&path).await.ok()?;
    if !metadata.is_file() || metadata.len() > MAX_FONT_BYTES as u64 {
        return None;
    }
    let bytes = tokio::fs::read(path).await.ok()?;
    let mime = font_content_type(&bytes)?;
    Some((bytes, mime))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn keeps_valid_font_files_for_overlays_and_rejects_invalid_ids_and_files() {
        let root = std::env::temp_dir().join(format!("jabs-font-test-{}-{}", std::process::id(),
            time::OffsetDateTime::now_utc().unix_timestamp_nanos()));
        let bytes = include_bytes!("../../src/renderer/src/assets/fonts/Anton-Regular.ttf");
        assert!(save_font(&root, "fake", b"OTTO").is_err());
        assert!(save_font(&root, "truncated", &bytes[..1024]).is_err());
        let font = save_font(&root, "My display font", bytes).unwrap();
        assert_eq!(font.name, "My display font");
        assert!(valid_scoreboard_font(&font.id));
        let (saved, mime) = read_asset(&root, &font.id).await.unwrap();
        assert_eq!(mime, "font/ttf");
        assert_eq!(saved, bytes);
        assert!(read_asset(&root, "../font").await.is_none());
        assert!(read_asset(&root, "file-0").await.is_none());
        assert!(remove_font(&root, "../font").is_err());
        assert!(remove_font(&root, "anton").is_err());
        remove_font(&root, &font.id).unwrap();
        remove_font(&root, &font.id).unwrap();
        assert!(read_asset(&root, &font.id).await.is_none());
        fs::remove_dir_all(root).unwrap();
    }
}
