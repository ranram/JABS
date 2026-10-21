use super::{Crop, Photo, respond};
use crate::{catalogs, runtime::RuntimeState};
use axum::{
    Json, Router,
    extract::{Path, State},
    http::HeaderMap,
    response::Response,
    routing::{get, post},
};
use serde::Deserialize;
use serde_json::json;
use std::{path::Path as FilePath, sync::Arc};

pub fn router() -> Router<Arc<RuntimeState>> {
    Router::new()
        .route("/api/scoreboard-photos/resolve", post(resolve))
        .route("/assets/player-headshots/{id}", get(asset))
}
fn directory<'a>(runtime: &'a RuntimeState, source: &str) -> Result<&'a FilePath, String> {
    match source {
        "headshot" => Ok(&runtime.player_headshot_directory),
        "photo" => Ok(&runtime.player_photo_directory),
        _ => Err("Unknown player photo catalog.".into()),
    }
}
pub(super) fn fingerprint(path: &FilePath, mime: &str) -> Result<String, String> {
    let bytes = std::fs::read(path).map_err(|_| "Player image is unavailable.")?;
    if bytes.len() > 20 * 1024 * 1024 || !catalogs::valid_raster_bytes(&bytes, mime) {
        return Err("Choose a valid PNG, JPEG, or WebP image.".into());
    }
    // Stable content revision for saved framing; it is not used for authentication.
    let hash = bytes.iter().fold(0xcbf29ce484222325u64, |hash, byte| {
        (hash ^ u64::from(*byte)).wrapping_mul(0x100000001b3)
    });
    Ok(format!("{hash:016x}"))
}
pub(super) fn source_fingerprint(
    runtime: &RuntimeState,
    source: &str,
    id: &str,
) -> Result<String, String> {
    let (path, mime) = catalogs::resolve_media_path(directory(runtime, source)?, id)
        .ok_or("Player image is unavailable.")?;
    fingerprint(&path, mime)
}
async fn asset(State(runtime): State<Arc<RuntimeState>>, Path(id): Path<String>) -> Response {
    crate::local_server::serve_resolved_raster(
        catalogs::resolve_media_path(&runtime.player_headshot_directory, &id),
        "Player headshot",
    )
    .await
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Identity {
    pub local_player_id: Option<String>,
    pub player_id: Option<String>,
    pub name: String,
    pub player_photo_asset_id: Option<String>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Resolve {
    pub players: Vec<Identity>,
}
fn named_photo(
    runtime: &RuntimeState,
    names: &[String],
    source: &str,
) -> Result<Option<Photo>, String> {
    let assets = catalogs::catalog_asset_ids_result(directory(runtime, source)?)?;
    for name in names {
        let matches = assets
            .iter()
            .filter(|id| catalogs::match_unique_asset_id(std::slice::from_ref(id), name).is_some())
            .collect::<Vec<_>>();
        if matches.len() > 1 {
            return Err("More than one image matches this player name.".into());
        }
        if let Some(id) = matches.first() {
            return Ok(source_fingerprint(runtime, source, id)
                .ok()
                .map(|fingerprint| Photo {
                    source: source.into(),
                    asset_id: (*id).clone(),
                    fingerprint,
                    crop: Crop::default(),
                    placements: Default::default(),
                }));
        }
    }
    Ok(None)
}
pub(super) fn resolve_photo(
    runtime: &RuntimeState,
    identity: &Identity,
) -> Result<Option<Photo>, String> {
    let record = runtime.database.library_resolve(
        identity.local_player_id.as_deref(),
        identity.player_id.as_deref(),
    )?;
    let mut names = vec![identity.name.clone()];
    if let Some(record) = &record {
        if let Some(name) = record.text("name", Some(&record.imported.name)) {
            names.push(name);
        }
    }
    let photo_override = identity.player_photo_asset_id.clone().or_else(|| {
        record
            .as_ref()
            .and_then(|record| record.text("playerPhotoAssetId", None))
    });
    let photo = named_photo(runtime, &names, "headshot")?;
    let photo = match photo {
        Some(photo) => Some(photo),
        None => match photo_override.filter(|id| !id.is_empty()) {
            Some(id) => source_fingerprint(runtime, "photo", &id)
                .ok()
                .map(|fingerprint| Photo {
                    source: "photo".into(),
                    asset_id: id,
                    fingerprint,
                    crop: Crop::default(),
                    placements: Default::default(),
                }),
            None => named_photo(runtime, &names, "photo")?,
        },
    };
    let Some(mut photo) = photo else {
        return Ok(None);
    };
    if let Some(saved) = record
        .as_ref()
        .and_then(|record| record.scoreboard_photo.as_ref())
    {
        saved.validate()?;
        if saved.source == photo.source
            && saved.asset_id == photo.asset_id
            && saved.fingerprint == photo.fingerprint
        {
            photo.crop = saved.crop.clone();
            photo.placements = saved.placements.clone();
        }
    }
    Ok(Some(photo))
}
pub(super) async fn resolve(
    State(runtime): State<Arc<RuntimeState>>,
    headers: HeaderMap,
    Json(body): Json<Resolve>,
) -> Response {
    if let Some(response) = crate::local_server::reject_untrusted_mutation(&headers) {
        return response;
    }
    if body.players.len() > 2
        || body.players.iter().any(|id| {
            id.name.len() > 480
                || id
                    .player_photo_asset_id
                    .as_deref()
                    .is_some_and(|id| !id.is_empty() && !catalogs::valid_media_id(id))
                || id
                    .local_player_id
                    .as_deref()
                    .is_some_and(|id| !crate::player_library::valid_local_id(id))
                || id
                    .player_id
                    .as_deref()
                    .is_some_and(|id| !crate::player_library::valid_startgg_id(id))
        })
    {
        return respond::<serde_json::Value>(Err("Invalid player identities.".into()));
    }
    respond(
        tokio::task::spawn_blocking(move || {
            let photos = body
                .players
                .iter()
                .map(|identity| resolve_photo(&runtime, identity).unwrap_or(None))
                .collect::<Vec<_>>();
            Ok(json!({"photos":photos}))
        })
        .await
        .unwrap_or_else(|_| Err("Unable to resolve player images.".into())),
    )
}
