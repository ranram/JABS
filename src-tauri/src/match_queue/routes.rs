use super::*;
use crate::{
    local_server::{reject_untrusted_mutation, secure_json},
    runtime::RuntimeState,
};
use axum::{
    Json, Router,
    extract::State,
    http::{HeaderMap, StatusCode},
    response::Response,
    routing::{get, post},
};
use std::sync::Arc;

pub fn router() -> Router<Arc<RuntimeState>> {
    Router::new()
        .route("/api/match-queue", get(current))
        .route("/api/match-queue/add", post(add))
        .route("/api/match-queue/action", post(action))
        .route("/api/match-queue/heartbeat", post(heartbeat))
}
fn result(value: Result<Snapshot, String>) -> Response {
    match value {
        Ok(s) => secure_json(Json(s)),
        Err(error) => secure_json((
            StatusCode::CONFLICT,
            Json(serde_json::json!({"error":error})),
        )),
    }
}
async fn current(State(runtime): State<Arc<RuntimeState>>) -> Response {
    result(runtime.match_queue.current())
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Add {
    revision: u64,
    context: Context,
    set_id: Option<String>,
    set_ids: Option<Vec<String>>,
}
async fn add(
    State(runtime): State<Arc<RuntimeState>>,
    headers: HeaderMap,
    Json(body): Json<Add>,
) -> Response {
    if let Some(response) = reject_untrusted_mutation(&headers) {
        return response;
    }
    let context = &body.context;
    let mut check = Snapshot {
        context: Some(context.clone()),
        ..Snapshot::default()
    };
    if let Err(error) = validate(&mut check) {
        return result(Err(error));
    }
    let batch = body.set_ids.is_some();
    let set_ids = match (body.set_id, body.set_ids) {
        (Some(id), None) => vec![id],
        (None, Some(ids)) => ids,
        _ => return result(Err("Invalid match queue entry.".into())),
    };
    if set_ids.is_empty()
        || set_ids.len() > 100
        || set_ids.iter().any(|id| id.is_empty() || id.len() > 80)
    {
        return result(Err("Invalid match queue entry.".into()));
    }
    let mut entries = Vec::new();
    for set_id in set_ids {
        let request = crate::local_server::SelectedSetBody {
            set_id,
            game_id: context.game_id.clone(),
            asset_catalog_slug: context.asset_catalog_slug.clone(),
            event_id: Some(context.event_id.clone()),
            tournament_slug: Some(context.tournament_slug.clone()),
            restore_overrides: false,
            preserve_broadcast: false,
            preserve_station: false,
            preserve_match_length: false,
        };
        match crate::local_server::fetch_selected_set(&runtime, &request).await {
            Ok(Some(mut set)) => {
                if set.event_id.as_deref() != Some(&context.event_id) {
                    return result(Err("The queued set belongs to another event.".into()));
                }
                crate::state::censor_untrusted_selected_set(&mut set);
                if batch && set.state.as_deref() == Some("3") {
                    continue;
                }
                match Entry::from_set(&set) {
                    Ok(entry) => entries.push(entry),
                    Err(error) => return result(Err(error)),
                }
            }
            Ok(None) => return result(Err("Set not found.".into())),
            Err(error) => return crate::local_server::startgg_error(error),
        }
    }
    if batch && entries.is_empty() {
        return result(runtime.match_queue.current());
    }
    if batch {
        result(runtime.match_queue.add_many(
            &runtime.database,
            body.revision,
            body.context,
            entries,
        ))
    } else {
        result(runtime.match_queue.add(
            &runtime.database,
            body.revision,
            body.context,
            entries.remove(0),
        ))
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Action {
    revision: u64,
    action: String,
    set_id: Option<String>,
    order: Option<Vec<String>>,
    mode: Option<Mode>,
    delay_minutes: Option<u32>,
}
async fn action(
    State(runtime): State<Arc<RuntimeState>>,
    headers: HeaderMap,
    Json(body): Json<Action>,
) -> Response {
    if let Some(response) = reject_untrusted_mutation(&headers) {
        return response;
    }
    match body.action.as_str() {
        "start" | "previous" | "next" | "jump" | "remove" => result(
            super::engine::navigate(
                &runtime,
                body.revision,
                &body.action,
                body.set_id.as_deref(),
            )
            .await,
        ),
        "resume" => result(runtime.overlay.selected_set().and_then(|live| {
            runtime
                .match_queue
                .resume(&runtime.database, body.revision, &live)
        })),
        _ => result(runtime.match_queue.edit(
            &runtime.database,
            body.revision,
            &body.action,
            body.set_id.as_deref(),
            body.order.as_deref(),
            body.mode,
            body.delay_minutes,
        )),
    }
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Heartbeat {
    client_id: String,
    event_id: Option<String>,
    busy: bool,
    sequence: u64,
    preserve_station: bool,
    preserve_match_length: bool,
}
async fn heartbeat(
    State(runtime): State<Arc<RuntimeState>>,
    headers: HeaderMap,
    Json(body): Json<Heartbeat>,
) -> Response {
    if let Some(response) = reject_untrusted_mutation(&headers) {
        return response;
    }
    match runtime.match_queue.heartbeat(
        body.client_id,
        body.event_id,
        body.busy,
        Some(body.sequence),
        Some((body.preserve_station, body.preserve_match_length)),
    ) {
        Ok(()) => secure_json(StatusCode::NO_CONTENT),
        Err(error) => result(Err(error)),
    }
}
