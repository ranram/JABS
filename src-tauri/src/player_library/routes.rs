use super::LibraryPlayer;
use crate::{
    local_server::{reject_untrusted_mutation, secure_json, startgg_error},
    runtime::RuntimeState,
};
use axum::{
    Json, Router,
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    response::Response,
    routing::{get, post},
};
use serde::Deserialize;
use serde_json::{Value, json};
use std::sync::Arc;

pub fn router() -> Router<Arc<RuntimeState>> {
    Router::new()
        .route("/api/players", get(search).post(save))
        .route("/api/players/resolve", post(resolve))
        .route("/api/players/lookup", post(lookup))
        .route("/api/players/import", post(import_library))
        .route("/api/players/import-event", post(import_event))
        .route("/api/players/{id}", get(detail).delete(delete))
}
fn respond(result: Result<Value, String>) -> Response {
    match result {
        Ok(value) => secure_json(Json(value)),
        Err(error) => secure_json((
            StatusCode::UNPROCESSABLE_ENTITY,
            Json(json!({ "error": error })),
        )),
    }
}
#[derive(Deserialize, Default)]
struct Search {
    #[serde(default)]
    q: String,
    #[serde(default)]
    offset: u32,
}
async fn search(State(runtime): State<Arc<RuntimeState>>, Query(query): Query<Search>) -> Response {
    if query.q.len() > 800 {
        return respond(Err("Search text is too long.".into()));
    }
    respond(
        tokio::task::spawn_blocking(move || {
            runtime
                .database
                .library_search(&query.q, query.offset)
                .map(|(players, total)| json!({ "players": players, "total": total }))
        })
        .await
        .unwrap_or_else(|_| Err("Player search could not finish.".into())),
    )
}
async fn detail(State(runtime): State<Arc<RuntimeState>>, Path(id): Path<String>) -> Response {
    respond(
        runtime
            .database
            .library_player(&id)
            .and_then(|p| p.ok_or_else(|| "Player not found.".into()))
            .map(|p| json!(p)),
    )
}
async fn save(
    State(runtime): State<Arc<RuntimeState>>,
    headers: HeaderMap,
    Json(player): Json<LibraryPlayer>,
) -> Response {
    if let Some(response) = reject_untrusted_mutation(&headers) {
        return response;
    }
    let result = runtime
        .database
        .library_save(player)
        .map(|saved| json!(saved));
    if result.is_ok() {
        runtime
            .asset_catalog_revision
            .send_modify(|revision| *revision += 1);
    }
    respond(result)
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Version {
    updated_at: String,
}
async fn delete(
    State(runtime): State<Arc<RuntimeState>>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(version): Json<Version>,
) -> Response {
    if let Some(response) = reject_untrusted_mutation(&headers) {
        return response;
    }
    let result = runtime
        .database
        .library_delete(&id, &version.updated_at)
        .map(|_| json!({ "ok": true }));
    if result.is_ok() {
        runtime
            .asset_catalog_revision
            .send_modify(|revision| *revision += 1);
    }
    respond(result)
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Identity {
    local_player_id: Option<String>,
    player_id: Option<String>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Resolve {
    game_key: String,
    players: Vec<Identity>,
}
async fn resolve(
    State(runtime): State<Arc<RuntimeState>>,
    headers: HeaderMap,
    Json(body): Json<Resolve>,
) -> Response {
    if let Some(response) = reject_untrusted_mutation(&headers) {
        return response;
    }
    if body.players.len() > 8 || body.game_key.len() > 150 {
        return respond(Err("Too many requested players.".into()));
    }
    respond(
        body.players
            .iter()
            .map(|id| {
                runtime
                    .database
                    .library_resolve(id.local_player_id.as_deref(), id.player_id.as_deref())
                    .map(|record| {
                        record.map(|record| super::startgg::presentation(&record, &body.game_key))
                    })
            })
            .collect::<Result<Vec<_>, _>>()
            .map(|players| json!(players)),
    )
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct EventImport {
    event_id: String,
    page: u32,
}
async fn import_event(
    State(runtime): State<Arc<RuntimeState>>,
    headers: HeaderMap,
    Json(body): Json<EventImport>,
) -> Response {
    if let Some(response) = reject_untrusted_mutation(&headers) {
        return response;
    }
    match super::startgg::import_page(&runtime, &body.event_id, body.page).await {
        Ok(value) => secure_json(Json(value)),
        Err(error) => startgg_error(error),
    }
}

async fn import_library(
    State(runtime): State<Arc<RuntimeState>>,
    headers: HeaderMap,
    Json(players): Json<Vec<LibraryPlayer>>,
) -> Response {
    if let Some(response) = reject_untrusted_mutation(&headers) {
        return response;
    }
    respond(
        tokio::task::spawn_blocking(move || {
            runtime
                .database
                .library_import(players)
                .map(|(added, skipped)| json!({ "added": added, "skipped": skipped }))
        })
        .await
        .unwrap_or_else(|_| Err("The library import could not finish.".into())),
    )
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Lookup {
    reference: String,
}
async fn lookup(
    State(runtime): State<Arc<RuntimeState>>,
    headers: HeaderMap,
    Json(body): Json<Lookup>,
) -> Response {
    if let Some(response) = reject_untrusted_mutation(&headers) {
        return response;
    }
    match super::lookup::find(&runtime, &body.reference).await {
        Ok(result) => secure_json(Json(result)),
        Err(error) => startgg_error(error),
    }
}
