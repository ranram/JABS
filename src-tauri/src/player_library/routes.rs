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
            .player_library_revision
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
            .player_library_revision
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
    let writer = runtime.clone();
    let result = tokio::task::spawn_blocking(move || {
            let result = writer.database.library_import(players);
            if result.is_ok() { writer.player_library_revision.send_modify(|revision| *revision += 1); }
            result.map(|(added, skipped)| json!({ "added": added, "skipped": skipped }))
        })
        .await
        .unwrap_or_else(|_| Err("The library import could not finish.".into()));
    respond(result)
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
        Ok(result) => {
            if result.source == "startgg" { runtime.player_library_revision.send_modify(|revision| *revision += 1); }
            secure_json(Json(result))
        },
        Err(error) => startgg_error(error),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{database::Database, player_library::Profile};

    #[tokio::test]
    async fn importing_players_notifies_open_views_only_after_successful_writes() {
        let unused = std::path::PathBuf::from("/jabs-no-test-assets");
        let runtime = Arc::new(RuntimeState::new(
            Database::open(std::path::Path::new(":memory:")).unwrap(), unused.clone(),
            unused.clone(), unused.clone(), unused.clone(), unused.clone(), unused,
        ).unwrap());
        let mut headers = HeaderMap::new();
        headers.insert("X-JABS-Action", "renderer-v1".parse().unwrap());
        let mut changes = runtime.player_library_revision.subscribe();
        let image_revision = *runtime.asset_catalog_revision.borrow();
        let player = LibraryPlayer {
            local_id: "1".repeat(32), player_id: None,
            imported: Profile { name: "Imported player".into(), ..Profile::default() },
            overrides: Default::default(), aliases: vec![], games: vec![], scoreboard_photo: None,
            updated_at: String::new(), seen_at: String::new(),
        };
        let response = import_library(State(runtime.clone()), headers.clone(), Json(vec![player.clone()])).await;
        assert_eq!(response.status(), StatusCode::OK);
        assert!(changes.has_changed().unwrap());
        assert_eq!(*runtime.asset_catalog_revision.borrow(), image_revision);
        changes.borrow_and_update();
        assert!(runtime.database.library_player(&player.local_id).unwrap().is_some());
        let mut invalid = player;
        invalid.local_id = "invalid".into();
        let response = import_library(State(runtime.clone()), headers, Json(vec![invalid])).await;
        assert_eq!(response.status(), StatusCode::UNPROCESSABLE_ENTITY);
        assert!(!changes.has_changed().unwrap());
    }
}
