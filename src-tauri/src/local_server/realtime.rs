use crate::runtime::RuntimeState;
use axum::extract::ws::{Message, WebSocket};
use futures_util::StreamExt;
use std::sync::Arc;
use tokio::sync::broadcast;

pub(super) async fn websocket_session(mut socket: WebSocket, runtime: Arc<RuntimeState>) {
    let mut queue_updates = runtime.match_queue.subscribe();
    let mut stinger_updates = runtime.stingers.subscribe();
    let mut photo_updates = runtime.scoreboard_photos.subscribe();
    let mut updates = runtime.overlay.subscribe();
    let mut commentator_updates = runtime.commentators.subscribe();
    let mut result_screen_updates = runtime.result_screen.subscribe();
    let mut stats_settings_updates = runtime.player_stats_settings.subscribe();
    let mut appearance_updates = runtime.appearance.subscribe();
    let mut bracket_updates = runtime.bracket_screen.subscribe();
    let mut versus_screen_updates = runtime.versus_screen.subscribe();
    let mut top_eight_matchups_updates = runtime.top_eight_matchups.subscribe();
    let mut asset_updates = runtime.asset_catalog_revision.subscribe();
    let Ok(initial) = runtime.overlay.current().and_then(overlay_state_message) else {
        return;
    };
    if socket.send(Message::Text(initial.into())).await.is_err() {
        return;
    }
    let assets = serde_json::json!({ "event": "asset-catalog", "revision": *asset_updates.borrow_and_update() }).to_string();
    if socket.send(Message::Text(assets.into())).await.is_err() {
        return;
    }

    loop {
        tokio::select! {
            update = queue_updates.recv() => match update {
                Ok(payload) => { if socket.send(Message::Text(payload.into())).await.is_err() { break; } },
                Err(broadcast::error::RecvError::Lagged(_)) => continue,
                Err(broadcast::error::RecvError::Closed) => break,
            },
            update = photo_updates.recv() => match update {
                Ok(payload) => { if socket.send(Message::Text(payload.into())).await.is_err() { break; } },
                Err(broadcast::error::RecvError::Lagged(_)) => continue,
                Err(broadcast::error::RecvError::Closed) => break,
            },
            update = stinger_updates.recv() => match update {
                Ok(payload) => { if socket.send(Message::Text(payload.into())).await.is_err() { break; } },
                Err(broadcast::error::RecvError::Lagged(_)) => continue,
                Err(broadcast::error::RecvError::Closed) => break,
            },
            update = stats_settings_updates.recv() => match update {
                Ok(payload) => { if socket.send(Message::Text(payload.into())).await.is_err() { break; } },
                Err(broadcast::error::RecvError::Lagged(_)) => continue,
                Err(broadcast::error::RecvError::Closed) => break,
            },
            update = appearance_updates.recv() => match update {
                Ok(payload) => { if socket.send(Message::Text(payload.into())).await.is_err() { break; } },
                Err(broadcast::error::RecvError::Lagged(_)) => continue,
                Err(broadcast::error::RecvError::Closed) => break,
            },
            update = bracket_updates.recv() => match update {
                Ok(payload) => { if socket.send(Message::Text(payload.into())).await.is_err() { break; } },
                Err(broadcast::error::RecvError::Lagged(_)) => continue,
                Err(broadcast::error::RecvError::Closed) => break,
            },
            changed = asset_updates.changed() => {
                if changed.is_err() { break; }
                let assets = serde_json::json!({ "event": "asset-catalog", "revision": *asset_updates.borrow_and_update() }).to_string();
                if socket.send(Message::Text(assets.into())).await.is_err() { break; }
            },
            update = updates.recv() => match update {
                Ok(update) => {
                    let Ok(update) = serde_json::from_str(&update)
                        .map_err(|_| "State serialization failed.".to_owned())
                        .and_then(overlay_state_message)
                    else {
                        continue;
                    };
                    if socket.send(Message::Text(update.into())).await.is_err() {
                        break;
                    }
                }
                Err(broadcast::error::RecvError::Lagged(_)) => continue,
                Err(broadcast::error::RecvError::Closed) => break,
            },
            update = commentator_updates.recv() => match update {
                Ok(update) => {
                    let Ok(payload) = serde_json::from_str::<serde_json::Value>(&update)
                        .map_err(|_| "State serialization failed.".to_owned())
                        .and_then(commentator_state_message)
                    else { continue; };
                    if socket.send(Message::Text(payload.into())).await.is_err() { break; }
                }
                Err(broadcast::error::RecvError::Lagged(_)) => continue,
                Err(broadcast::error::RecvError::Closed) => break,
            },
            update = result_screen_updates.recv() => match update {
                Ok(update) => {
                    let Ok(payload) = serde_json::from_str::<serde_json::Value>(&update)
                        .map_err(|_| "State serialization failed.".to_owned())
                        .and_then(result_screen_state_message)
                    else { continue; };
                    if socket.send(Message::Text(payload.into())).await.is_err() { break; }
                }
                Err(broadcast::error::RecvError::Lagged(_)) => continue,
                Err(broadcast::error::RecvError::Closed) => break,
            },
            update = versus_screen_updates.recv() => match update {
                Ok(update) => {
                    let Ok(payload) = serde_json::from_str::<serde_json::Value>(&update)
                        .map_err(|_| "State serialization failed.".to_owned())
                        .and_then(versus_screen_state_message)
                    else { continue; };
                    if socket.send(Message::Text(payload.into())).await.is_err() { break; }
                }
                Err(broadcast::error::RecvError::Lagged(_)) => continue,
                Err(broadcast::error::RecvError::Closed) => break,
            },
            update = top_eight_matchups_updates.recv() => match update {
                Ok(update) => {
                    let Ok(payload) = serde_json::from_str::<serde_json::Value>(&update)
                        .map_err(|_| "State serialization failed.".to_owned())
                        .and_then(top_eight_matchups_state_message)
                    else { continue; };
                    if socket.send(Message::Text(payload.into())).await.is_err() { break; }
                }
                Err(broadcast::error::RecvError::Lagged(_)) => continue,
                Err(broadcast::error::RecvError::Closed) => break,
            },
            incoming = socket.next() => match incoming {
                Some(Ok(Message::Ping(payload))) => {
                    if socket.send(Message::Pong(payload)).await.is_err() {
                        break;
                    }
                }
                Some(Ok(Message::Close(_))) | Some(Err(_)) | None => break,
                _ => {}
            }
        }
    }
}

fn commentator_state_message(state: serde_json::Value) -> Result<String, String> {
    serde_json::to_string(&serde_json::json!({
        "event": "commentator-state",
        "payload": state
    }))
    .map_err(|_| "State serialization failed.".to_owned())
}

fn result_screen_state_message(state: serde_json::Value) -> Result<String, String> {
    serde_json::to_string(&serde_json::json!({
        "event": "result-screen-state",
        "payload": state
    }))
    .map_err(|_| "State serialization failed.".to_owned())
}

fn versus_screen_state_message(state: serde_json::Value) -> Result<String, String> {
    serde_json::to_string(&serde_json::json!({
        "event": "versus-screen-state",
        "payload": state
    }))
    .map_err(|_| "State serialization failed.".to_owned())
}

fn top_eight_matchups_state_message(state: serde_json::Value) -> Result<String, String> {
    serde_json::to_string(&serde_json::json!({
        "event": "top-eight-matchups-state",
        "payload": state
    }))
    .map_err(|_| "State serialization failed.".to_owned())
}

fn overlay_state_message(state: serde_json::Value) -> Result<String, String> {
    serde_json::to_string(&serde_json::json!({
        "event": "overlay-state",
        "payload": state
    }))
    .map_err(|_| "State serialization failed.".to_owned())
}
