use super::{Kind, Video, routes::result};
use crate::{
    local_server::{reject_untrusted_mutation, secure_json},
    runtime::RuntimeState,
};
use axum::{
    body::{Body, Bytes},
    extract::{Path, Query, Request, State},
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
};
use futures_util::StreamExt;
use serde::Deserialize;
use std::{
    fs::File,
    io::{Read, Seek, SeekFrom, Write},
    path::PathBuf,
    sync::Arc,
};

const MAX_BYTES: u64 = 256 * 1024 * 1024;

// WebM shares its EBML signature with Matroska; check the header's document type too.
pub(super) fn is_webm(bytes: &[u8]) -> bool {
    let parse = || -> Option<bool> {
        if !bytes.starts_with(&[0x1a, 0x45, 0xdf, 0xa3]) {
            return None;
        }
        let (length, size) = vint(bytes.get(4..)?, false)?;
        let end = (4 + size).checked_add(usize::try_from(length).ok()?)?;
        let header = bytes.get(..end)?;
        let mut offset = 4 + size;
        let mut found = false;
        while offset < end {
            let (id, width) = vint(header.get(offset..)?, true)?;
            offset += width;
            let (length, width) = vint(header.get(offset..)?, false)?;
            offset += width;
            let next = offset.checked_add(usize::try_from(length).ok()?)?;
            let value = header.get(offset..next)?;
            if id == 0x4282 {
                if found || value != b"webm" {
                    return None;
                }
                found = true;
            }
            offset = next;
        }
        Some(found)
    };
    parse().unwrap_or(false)
}

fn vint(bytes: &[u8], id: bool) -> Option<(u64, usize)> {
    let first = *bytes.first()?;
    let width = first.leading_zeros() as usize + 1;
    if width > if id { 4 } else { 8 } {
        return None;
    }
    let mut value = if id {
        first as u64
    } else {
        first as u64 & (0xff_u64 >> width)
    };
    for byte in bytes.get(1..width)? {
        value = (value << 8) | u64::from(*byte);
    }
    if !id && value == (1_u64 << (width * 7)) - 1 {
        return None;
    }
    Some((value, width))
}

pub(super) fn valid_id(id: &str) -> bool {
    let Some((stem, extension)) = id.rsplit_once('.') else {
        return false;
    };
    !stem.is_empty()
        && id.len() <= 100
        && stem
            .bytes()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'-')
        && extension == "webm"
}
#[derive(Deserialize)]
pub(super) struct ImportQuery {
    pub name: String,
}
struct Temporary(PathBuf);
impl Drop for Temporary {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
    }
}

pub(super) async fn import(
    State(runtime): State<Arc<RuntimeState>>,
    Path(kind): Path<Kind>,
    Query(query): Query<ImportQuery>,
    request: Request,
) -> Response {
    if let Some(response) = reject_untrusted_mutation(request.headers()) {
        return response;
    }
    result(
        import_file(&runtime, kind, &query.name, request.into_body())
            .await
            .and_then(|()| runtime.stingers.current()),
    )
}
async fn import_file(
    runtime: &RuntimeState,
    kind: Kind,
    name: &str,
    body: Body,
) -> Result<(), String> {
    let extension = name
        .rsplit_once('.')
        .map(|(_, ext)| ext.to_ascii_lowercase())
        .unwrap_or_default();
    if extension != "webm" || name.len() > 240 || name.contains(['/', '\\', '\0']) {
        return Err(
            "Choose a WebM video up to 256 MB. Convert other formats before importing.".into(),
        );
    }
    std::fs::create_dir_all(&runtime.stinger_directory)
        .map_err(|_| "Unable to prepare stinger storage.")?;
    let id = format!("{}.{}", super::unique_id(), extension);
    let destination = runtime.stinger_directory.join(&id);
    let temporary = Temporary(runtime.stinger_directory.join(format!("{id}.part")));
    let mut file = File::options()
        .write(true)
        .create_new(true)
        .open(&temporary.0)
        .map_err(|_| "Unable to import the video.")?;
    let mut stream = body.into_data_stream();
    let mut total = 0;
    let mut signature = Vec::new();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|_| "The video upload was interrupted.")?;
        total += chunk.len() as u64;
        if total > MAX_BYTES {
            return Err("Stinger videos must be 256 MB or smaller.".into());
        }
        if signature.len() < 4096 {
            signature.extend(chunk.iter().take(4096 - signature.len()));
        }
        file = tokio::task::spawn_blocking(move || file.write_all(&chunk).map(|()| file))
            .await
            .map_err(|_| "Unable to import the video.")?
            .map_err(|_| "Unable to save the video.")?;
    }
    if !is_webm(&signature) {
        return Err(
            "Choose a valid WebM video. Renaming another format does not convert it.".into(),
        );
    }
    tokio::task::spawn_blocking(move || file.sync_all())
        .await
        .map_err(|_| "Unable to finish saving the video.")?
        .map_err(|_| "Unable to save the video.")?;
    std::fs::rename(&temporary.0, &destination)
        .map_err(|_| "Unable to finish importing the video.")?;
    match runtime.stingers.install(
        &runtime.database,
        kind,
        Some(Video {
            id,
            name: name.into(),
        }),
    ) {
        Ok(old) => {
            if let Some(old) = old {
                let _ = std::fs::remove_file(runtime.stinger_directory.join(old));
            }
            Ok(())
        }
        Err(error) => {
            let _ = std::fs::remove_file(destination);
            Err(error)
        }
    }
}

// Decode through the browser's video pipeline; never buffer a whole clip for playback.
pub(super) async fn serve(
    State(runtime): State<Arc<RuntimeState>>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Response {
    if !valid_id(&id) {
        return StatusCode::NOT_FOUND.into_response();
    }
    let path = runtime.stinger_directory.join(&id);
    let opened = tokio::task::spawn_blocking(move || {
        if !std::fs::symlink_metadata(&path)?.is_file() {
            return Err(std::io::Error::from(std::io::ErrorKind::NotFound));
        }
        File::open(path)
    })
    .await;
    let Ok(Ok(mut file)) = opened else {
        return StatusCode::NOT_FOUND.into_response();
    };
    let Ok(metadata) = file.metadata() else {
        return StatusCode::NOT_FOUND.into_response();
    };
    let total = metadata.len();
    let range_header = headers.get(header::RANGE).and_then(|v| v.to_str().ok());
    let range = byte_range(range_header, total);
    let Ok((start, end)) = range else {
        return secure_json((
            StatusCode::RANGE_NOT_SATISFIABLE,
            [(header::CONTENT_RANGE, format!("bytes */{total}"))],
        ));
    };
    if file.seek(SeekFrom::Start(start)).is_err() {
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    }
    let stream = futures_util::stream::try_unfold(
        (file, end - start + 1),
        |(mut file, remaining)| async move {
            if remaining == 0 {
                return Ok::<_, std::io::Error>(None);
            }
            tokio::task::spawn_blocking(move || {
                let mut buffer = vec![0; remaining.min(64 * 1024) as usize];
                let read = file.read(&mut buffer)?;
                if read == 0 {
                    return Err(std::io::Error::from(std::io::ErrorKind::UnexpectedEof));
                }
                buffer.truncate(read);
                Ok(Some((Bytes::from(buffer), (file, remaining - read as u64))))
            })
            .await
            .map_err(std::io::Error::other)?
        },
    );
    let mut response = Response::builder()
        .status(if range_header.is_some() {
            StatusCode::PARTIAL_CONTENT
        } else {
            StatusCode::OK
        })
        .header(header::CONTENT_TYPE, "video/webm")
        .header(header::ACCEPT_RANGES, "bytes")
        .header(header::CONTENT_LENGTH, end - start + 1);
    if range_header.is_some() {
        response = response.header(
            header::CONTENT_RANGE,
            format!("bytes {start}-{end}/{total}"),
        );
    }
    secure_json(response.body(Body::from_stream(stream)).unwrap())
}
pub(super) fn byte_range(header: Option<&str>, total: u64) -> Result<(u64, u64), ()> {
    if total == 0 {
        return Err(());
    }
    let Some(header) = header else {
        return Ok((0, total - 1));
    };
    let value = header.strip_prefix("bytes=").ok_or(())?;
    let (start, end) = value.split_once('-').ok_or(())?;
    if start.is_empty() {
        let length = end.parse::<u64>().map_err(|_| ())?;
        if length == 0 {
            return Err(());
        }
        return Ok((total.saturating_sub(length), total - 1));
    }
    let start = start.parse::<u64>().map_err(|_| ())?;
    let end = if end.is_empty() {
        total - 1
    } else {
        end.parse::<u64>().map_err(|_| ())?.min(total - 1)
    };
    if start >= total || end < start {
        return Err(());
    }
    Ok((start, end))
}
