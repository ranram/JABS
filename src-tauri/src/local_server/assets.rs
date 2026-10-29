use super::{reject_untrusted_mutation, secure_json};
use crate::runtime::RuntimeState;
use axum::{
    Json,
    extract::State,
    http::{HeaderMap, StatusCode},
    response::Response,
};
use std::sync::Arc;

pub(super) async fn reload(
    State(runtime): State<Arc<RuntimeState>>,
    headers: HeaderMap,
) -> Response {
    refresh(runtime, headers, true).await
}

pub(super) async fn check(
    State(runtime): State<Arc<RuntimeState>>,
    headers: HeaderMap,
) -> Response {
    refresh(runtime, headers, false).await
}

async fn refresh(runtime: Arc<RuntimeState>, headers: HeaderMap, force: bool) -> Response {
    if let Some(response) = reject_untrusted_mutation(&headers) {
        return response;
    }
    let checking = runtime.clone();
    let changed = tokio::task::spawn_blocking(move || checking.asset_changes.changed()).await;
    let changed = match changed {
        Ok(Ok(changed)) => changed,
        _ if force => true,
        _ => {
            return secure_json((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({
                    "error": "Could not check artwork files."
                })),
            ));
        }
    };
    if force || changed {
        runtime.player_stats.invalidate_images();
        runtime
            .asset_catalog_revision
            .send_modify(|revision| *revision += 1);
    }
    secure_json(Json(serde_json::json!({
        "revision": *runtime.asset_catalog_revision.borrow(), "changed": force || changed
    })))
}
