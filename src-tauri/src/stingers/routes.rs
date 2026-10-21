use super::{Kind, Settings};
use crate::{
    local_server::{reject_untrusted_mutation, secure_json},
    runtime::RuntimeState,
};
use axum::{
    Json, Router,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    response::Response,
    routing::{get, post},
};
use serde::Deserialize;
use std::sync::Arc;

pub fn router() -> Router<Arc<RuntimeState>> {
    Router::new()
        .route("/api/broadcast/stingers", get(current).put(update))
        .route("/api/broadcast/stingers/play", post(play))
        .route("/api/broadcast/stingers/stop", post(stop))
        .route("/api/broadcast/stingers/reconnect", post(reconnect))
        .route("/api/broadcast/stingers/source", post(source))
        .route("/api/broadcast/stingers/claim", post(claim))
        .route("/api/broadcast/stingers/finish", post(finish))
        .route(
            "/api/broadcast/stingers/video/{kind}",
            post(super::media::import).delete(remove),
        )
        .route("/assets/stingers/{id}", get(super::media::serve))
}
pub(super) fn result<T: serde::Serialize>(value: Result<T, String>) -> Response {
    match value {
        Ok(value) => secure_json(Json(value)),
        Err(error) => secure_json((
            if error == crate::persisted_state::STALE_SETTINGS {
                StatusCode::CONFLICT
            } else {
                StatusCode::UNPROCESSABLE_ENTITY
            },
            Json(serde_json::json!({"error": error})),
        )),
    }
}
async fn current(State(runtime): State<Arc<RuntimeState>>) -> Response {
    result(runtime.stingers.current())
}
async fn update(
    State(runtime): State<Arc<RuntimeState>>,
    headers: HeaderMap,
    Json(settings): Json<Settings>,
) -> Response {
    if let Some(response) = reject_untrusted_mutation(&headers) {
        return response;
    }
    result(runtime.stingers.replace(&runtime.database, settings))
}
#[derive(Deserialize)]
struct Play {
    kind: Kind,
}
async fn play(
    State(runtime): State<Arc<RuntimeState>>,
    headers: HeaderMap,
    Json(body): Json<Play>,
) -> Response {
    if let Some(response) = reject_untrusted_mutation(&headers) {
        return response;
    }
    result(
        runtime
            .overlay
            .selected_set()
            .and_then(|selected| runtime.stingers.play(body.kind, selected)),
    )
}
async fn stop(State(runtime): State<Arc<RuntimeState>>, headers: HeaderMap) -> Response {
    if let Some(response) = reject_untrusted_mutation(&headers) {
        return response;
    }
    result(runtime.stingers.finish(None, None, None))
}
pub(super) async fn reconnect(
    State(runtime): State<Arc<RuntimeState>>,
    headers: HeaderMap,
) -> Response {
    if let Some(response) = reject_untrusted_mutation(&headers) {
        return response;
    }
    result(runtime.stingers.reconnect())
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Source {
    client_id: String,
    active: bool,
    #[serde(default)]
    program: bool,
}
async fn source(
    State(runtime): State<Arc<RuntimeState>>,
    headers: HeaderMap,
    Json(body): Json<Source>,
) -> Response {
    if let Some(response) = reject_untrusted_mutation(&headers) {
        return response;
    }
    result(
        runtime
            .stingers
            .register(&body.client_id, body.active, body.program),
    )
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Claim {
    client_id: String,
    cue_id: String,
}
async fn claim(
    State(runtime): State<Arc<RuntimeState>>,
    headers: HeaderMap,
    Json(body): Json<Claim>,
) -> Response {
    if let Some(response) = reject_untrusted_mutation(&headers) {
        return response;
    }
    result(
        runtime
            .stingers
            .claim(&body.client_id, &body.cue_id)
            .map(|cue| match cue {
                Some(cue) => serde_json::json!({"cue": cue}),
                None => serde_json::json!({}),
            }),
    )
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Finish {
    client_id: String,
    cue_id: String,
    error: Option<String>,
}
async fn finish(
    State(runtime): State<Arc<RuntimeState>>,
    headers: HeaderMap,
    Json(body): Json<Finish>,
) -> Response {
    if let Some(response) = reject_untrusted_mutation(&headers) {
        return response;
    }
    result(runtime.stingers.finish(
        Some(&body.client_id),
        Some(&body.cue_id),
        body.error.as_deref(),
    ))
}
async fn remove(
    State(runtime): State<Arc<RuntimeState>>,
    headers: HeaderMap,
    Path(kind): Path<Kind>,
) -> Response {
    if let Some(response) = reject_untrusted_mutation(&headers) {
        return response;
    }
    result(
        runtime
            .stingers
            .install(&runtime.database, kind, None)
            .and_then(|old| {
                if let Some(old) = old {
                    let _ = std::fs::remove_file(runtime.stinger_directory.join(old));
                }
                runtime.stingers.current()
            }),
    )
}
