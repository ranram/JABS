use super::{Action, Outcome, Request};
use crate::runtime::RuntimeState;
use axum::{
    extract::{
        State, WebSocketUpgrade,
        ws::{Message, WebSocket},
    },
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
};
use futures_util::StreamExt;
use serde::Deserialize;
use std::{sync::Arc, time::Duration};

pub async fn upgrade(
    State(runtime): State<Arc<RuntimeState>>,
    headers: HeaderMap,
    upgrade: WebSocketUpgrade,
) -> Response {
    // This is a native integration, never a browser connection. Host validation
    // is still applied by the existing local-server middleware.
    if headers.contains_key(header::ORIGIN)
        || headers
            .get("x-jabs-action")
            .and_then(|value| value.to_str().ok())
            != Some("renderer-v1")
    {
        return StatusCode::FORBIDDEN.into_response();
    }
    upgrade
        .max_message_size(4096)
        .max_frame_size(4096)
        .on_upgrade(move |socket| session(socket, runtime))
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Hello {
    r#type: String,
    protocol: u8,
    #[serde(default, deserialize_with = "present_key")]
    key: Option<String>,
}
// Only an omitted key selects local mode; a supplied key must be a string.
fn present_key<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> Result<Option<String>, D::Error> {
    String::deserialize(deserializer).map(Some)
}

fn parse_request(text: &str) -> Result<Request, ()> {
    let mut value: serde_json::Value = serde_json::from_str(text).map_err(|_| ())?;
    if value.get("type").and_then(|v| v.as_str()) != Some("command") {
        return Err(());
    }
    value.as_object_mut().ok_or(())?.remove("type");
    serde_json::from_value(value).map_err(|_| ())
}

pub(super) fn snapshot(runtime: &RuntimeState) -> Result<serde_json::Value, String> {
    let live = runtime.overlay.selected_set()?;
    let queue = runtime.match_queue.current()?;
    Ok(serde_json::json!({
        "type": "state", "protocol": 1, "version": live.updated_at,
        "confirmationId": runtime.stream_deck.confirmation.borrow().clone(),
        "playerOne": { "name": live.player_one.name, "score": live.player_one.score },
        "playerTwo": { "name": live.player_two.name, "score": live.player_two.score },
        "queue": { "revision": queue.revision, "running": queue.running, "status": queue.status,
            "count": queue.entries.len(), "cursor": queue.cursor }
    }))
}
fn versions_match(runtime: &RuntimeState, request: &Request) -> bool {
    (!request.action.needs_match()
        || runtime
            .overlay
            .selected_set()
            .is_ok_and(|live| Some(live.updated_at) == request.expected_version))
        && (!request.action.needs_queue()
            || runtime
                .match_queue
                .current()
                .is_ok_and(|queue| Some(queue.revision) == request.queue_revision))
        && (!matches!(request.action, Action::Confirm | Action::Cancel)
            || request
                .confirmation_id
                .as_ref()
                .is_some_and(|id| !id.is_empty() && id.len() <= 80))
}
fn accept_request_id(last: &mut u64, id: u64) -> bool {
    if id <= *last || id > 9_007_199_254_740_991 {
        return false;
    }
    *last = id;
    true
}
async fn send(socket: &mut WebSocket, value: serde_json::Value) -> bool {
    socket
        .send(Message::Text(value.to_string().into()))
        .await
        .is_ok()
}
async fn session(mut socket: WebSocket, runtime: Arc<RuntimeState>) {
    // Subscribe before authentication so re-pairing cannot be missed.
    let mut revoked = runtime.stream_deck.changed.subscribe();
    let Some(Ok(Message::Text(text))) = tokio::time::timeout(Duration::from_secs(5), socket.next())
        .await
        .ok()
        .flatten()
    else {
        return;
    };
    let Ok(hello) = serde_json::from_str::<Hello>(&text) else {
        return;
    };
    if hello.r#type != "hello" || hello.protocol != 1 {
        return;
    }
    let epoch = match hello.key {
        Some(key) => runtime.stream_deck.authenticate(&key),
        None => runtime.stream_deck.local_epoch(),
    };
    let Some(epoch) = epoch else {
        return;
    };
    if *revoked.borrow_and_update() != epoch {
        return;
    }
    let mut overlays = runtime.overlay.subscribe();
    let mut queues = runtime.match_queue.subscribe();
    let mut confirmations = runtime.stream_deck.confirmation.subscribe();
    let Ok(initial) = snapshot(&runtime) else {
        return;
    };
    if !send(&mut socket, initial).await {
        return;
    }
    let mut last_id = 0;
    loop {
        tokio::select! {
            biased;
            _ = revoked.changed() => break,
            _ = overlays.recv() => {
                let Ok(next) = snapshot(&runtime) else { break; };
                if !send(&mut socket, next).await { break; }
            },
            _ = queues.recv() => {
                let Ok(next) = snapshot(&runtime) else { break; };
                if !send(&mut socket, next).await { break; }
            },
            _ = confirmations.changed() => {
                let Ok(next) = snapshot(&runtime) else { break; };
                if !send(&mut socket, next).await { break; }
            },
            incoming = socket.next() => match incoming {
                Some(Ok(Message::Ping(payload))) => { if socket.send(Message::Pong(payload)).await.is_err() { break; } },
                Some(Ok(Message::Text(text))) => {
                    let Ok(request) = parse_request(&text) else {
                        if !send(&mut socket, serde_json::json!({"type":"error", "code":"invalid-command"})).await { break; }
                        continue;
                    };
                    let id = request.id;
                    if !accept_request_id(&mut last_id, id) {
                        if !send(&mut socket, serde_json::json!({"type":"result", "id":id, "status":"blocked"})).await { break; }
                        continue;
                    }
                    let (outcome, confirmation) = if versions_match(&runtime, &request) {
                        runtime.stream_deck.dispatch(epoch, request).await
                    } else { (Outcome::Blocked, None) };
                    if !send(&mut socket, serde_json::json!({ "type":"result", "id":id, "status":outcome, "confirmationId":confirmation })).await { break; }
                },
                Some(Ok(Message::Close(_))) | Some(Err(_)) | None => break,
                _ => {}
            }
        }
    }
    let _ = socket.send(Message::Close(None)).await;
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn protocol_accepts_versioned_commands_and_rejects_unknown_actions_and_fields() {
        assert!(
            serde_json::from_str::<Hello>(r#"{"type":"hello","protocol":1}"#)
                .unwrap()
                .key
                .is_none()
        );
        assert!(
            serde_json::from_str::<Hello>(r#"{"type":"hello","protocol":1,"key":null}"#).is_err()
        );
        let mut last = 0;
        assert!(!accept_request_id(&mut last, 0));
        assert!(accept_request_id(&mut last, 1));
        assert!(!accept_request_id(&mut last, 1));
        assert!(accept_request_id(&mut last, 3));
        assert!(!accept_request_id(&mut last, 2));
        assert!(!accept_request_id(&mut last, 9_007_199_254_740_992));
        let request = parse_request(
            r#"{"type":"command","id":1,"action":"score-p1-up","expectedVersion":"v1"}"#,
        )
        .unwrap();
        assert_eq!(request.action, Action::ScoreP1Up);
        assert_eq!(
            parse_request(r#"{"type":"command","id":2,"action":"open-players"}"#)
                .unwrap()
                .action,
            Action::OpenPlayers
        );
        assert_eq!(request.expected_version.as_deref(), Some("v1"));
        assert!(parse_request(r#"{"type":"command","id":1,"action":"report-set"}"#).is_err());
        assert!(
            parse_request(r#"{"type":"command","id":1,"action":"open-queue","unknown":true}"#)
                .is_err()
        );
        assert!(
            serde_json::from_str::<Hello>(
                r#"{"type":"hello","protocol":1,"key":"secret","unknown":true}"#
            )
            .is_err()
        );
    }
}
