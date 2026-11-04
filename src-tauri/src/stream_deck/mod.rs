mod socket;
#[cfg(test)]
mod tests;

use crate::runtime::RuntimeState;
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{Emitter, Manager};
use tokio::sync::{oneshot, watch};
use zeroize::Zeroizing;

#[derive(Clone, Copy, Deserialize, Serialize, PartialEq, Eq, Debug)]
#[serde(rename_all = "kebab-case")]
pub enum Action {
    ScoreP1Up,
    ScoreP1Down,
    ScoreP2Up,
    ScoreP2Down,
    SwapPlayers,
    ResetScores,
    SwapCommentators,
    OpenPlayers,
    OpenQueue,
    OpenSelector,
    QueueNext,
    QueuePrevious,
    QueueToggle,
    ClearQueue,
    ClearPlayers,
    Confirm,
    Cancel,
}
impl Action {
    fn needs_match(self) -> bool {
        matches!(
            self,
            Self::ScoreP1Up
                | Self::ScoreP1Down
                | Self::ScoreP2Up
                | Self::ScoreP2Down
                | Self::SwapPlayers
                | Self::ResetScores
                | Self::ClearPlayers
        )
    }
    fn needs_queue(self) -> bool {
        matches!(
            self,
            Self::QueueNext | Self::QueuePrevious | Self::QueueToggle | Self::ClearQueue
        )
    }
}
#[derive(Clone, Copy, Deserialize, Serialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum Outcome {
    Completed,
    Blocked,
    ConfirmationRequired,
    Failed,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Request {
    pub id: u64,
    pub action: Action,
    pub expected_version: Option<String>,
    pub queue_revision: Option<u64>,
    pub confirmation_id: Option<String>,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Command {
    id: String,
    action: Action,
    expires_at: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    expected_version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    queue_revision: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    confirmation_id: Option<String>,
}
struct Inner {
    key: Option<Zeroizing<String>>,
    local_enabled: bool,
    app: Option<tauri::AppHandle>,
    epoch: u64,
    serial: u64,
    pending: HashMap<String, oneshot::Sender<Outcome>>,
}
pub struct Bridge {
    inner: Mutex<Inner>,
    changed: watch::Sender<u64>,
    confirmation: watch::Sender<Option<String>>,
}
impl Default for Bridge {
    fn default() -> Self {
        Self {
            inner: Mutex::new(Inner {
                key: None,
                local_enabled: false,
                app: None,
                epoch: 0,
                serial: 0,
                pending: HashMap::new(),
            }),
            changed: watch::channel(0).0,
            confirmation: watch::channel(None).0,
        }
    }
}
impl Bridge {
    /// Trusted-local workstation mode: browser origins remain rejected by upgrade().
    pub fn start_local(&self, app: tauri::AppHandle) -> Result<(), String> {
        let mut inner = self.inner.lock().map_err(|_| "Bridge unavailable.")?;
        inner.app = Some(app);
        inner.local_enabled = true;
        self.confirmation.send_replace(None);
        inner.pending.clear();
        inner.epoch += 1;
        self.changed.send_replace(inner.epoch);
        Ok(())
    }
    fn local_epoch(&self) -> Option<u64> {
        let inner = self.inner.lock().ok()?;
        inner.local_enabled.then_some(inner.epoch)
    }
    fn begin(&self, key: String, app: tauri::AppHandle) -> Result<(), String> {
        if key.len() != 64 || !key.bytes().all(|c| c.is_ascii_hexdigit()) {
            return Err("Invalid pairing key.".into());
        }
        let mut inner = self.inner.lock().map_err(|_| "Bridge unavailable.")?;
        inner.key = Some(Zeroizing::new(key));
        self.confirmation.send_replace(None);
        inner.app = Some(app);
        inner.pending.clear();
        inner.epoch += 1;
        self.changed.send_replace(inner.epoch);
        Ok(())
    }
    pub fn stop(&self) -> Result<(), String> {
        let mut inner = self.inner.lock().map_err(|_| "Bridge unavailable.")?;
        inner.key = None;
        self.confirmation.send_replace(None);
        inner.local_enabled = false;
        inner.app = None;
        inner.pending.clear();
        inner.epoch += 1;
        self.changed.send_replace(inner.epoch);
        Ok(())
    }
    fn authenticate(&self, key: &str) -> Option<u64> {
        let inner = self.inner.lock().ok()?;
        let expected = inner.key.as_ref()?;
        if key.len() != 64 {
            return None;
        }
        let difference = key
            .bytes()
            .zip(expected.bytes())
            .fold(0u8, |diff, (a, b)| diff | (a ^ b));
        (difference == 0).then_some(inner.epoch)
    }
    async fn dispatch(&self, epoch: u64, request: Request) -> (Outcome, Option<String>) {
        let (tx, rx) = oneshot::channel();
        let (app, command) = {
            let Ok(mut inner) = self.inner.lock() else {
                return (Outcome::Failed, None);
            };
            if inner.epoch != epoch
                || (!inner.local_enabled && inner.key.is_none())
                || !inner.pending.is_empty()
            {
                return (Outcome::Blocked, None);
            }
            let Some(app) = inner.app.clone() else {
                return (Outcome::Blocked, None);
            };
            inner.serial += 1;
            let id = format!("{epoch}-{}", inner.serial);
            inner.pending.insert(id.clone(), tx);
            (
                app,
                Command {
                    id,
                    action: request.action,
                    expires_at: now_ms() + 10_000,
                    expected_version: request.expected_version,
                    queue_revision: request.queue_revision,
                    confirmation_id: request.confirmation_id,
                },
            )
        };
        let result = if app.emit_to("main", "stream-deck-command", &command).is_ok() {
            tokio::time::timeout(Duration::from_secs(10), rx)
                .await
                .ok()
                .and_then(Result::ok)
                .unwrap_or(Outcome::Failed)
        } else {
            Outcome::Failed
        };
        if result == Outcome::ConfirmationRequired
            || (result == Outcome::Completed
                && matches!(
                    command.action,
                    Action::OpenPlayers | Action::OpenQueue | Action::OpenSelector
                ))
        {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }
        if let Ok(mut inner) = self.inner.lock() {
            inner.pending.remove(&command.id);
        }
        (
            result,
            (result == Outcome::ConfirmationRequired).then_some(command.id),
        )
    }
    fn acknowledge(&self, id: &str, outcome: Outcome) -> Result<(), String> {
        if let Some(reply) = self
            .inner
            .lock()
            .map_err(|_| "Bridge unavailable.")?
            .pending
            .remove(id)
        {
            if outcome == Outcome::ConfirmationRequired {
                self.confirmation.send_replace(Some(id.to_owned()));
            }
            let _ = reply.send(outcome);
        }
        Ok(())
    }
    fn close_confirmation(&self, id: &str) {
        self.confirmation.send_if_modified(|current| {
            if current.as_deref() != Some(id) {
                return false;
            }
            *current = None;
            true
        });
    }
}
fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

#[tauri::command]
pub fn stream_deck_pair(
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<RuntimeState>>,
    pairing_key: String,
) -> Result<serde_json::Value, String> {
    let port = state.api_port.load(std::sync::atomic::Ordering::Acquire);
    if port == 0 {
        return Err("The local service is unavailable.".into());
    }
    state.stream_deck.begin(pairing_key, app)?;
    Ok(
        serde_json::json!({ "url": format!("ws://127.0.0.1:{port}/api/integrations/stream-deck"), "protocol": 1 }),
    )
}
#[tauri::command]
pub fn stream_deck_unpair(state: tauri::State<'_, Arc<RuntimeState>>) -> Result<(), String> {
    state.stream_deck.stop()
}
#[tauri::command]
pub fn stream_deck_ack(
    state: tauri::State<'_, Arc<RuntimeState>>,
    id: String,
    outcome: Outcome,
) -> Result<(), String> {
    state.stream_deck.acknowledge(&id, outcome)
}

#[tauri::command]
pub fn stream_deck_confirmation_closed(state: tauri::State<'_, Arc<RuntimeState>>, id: String) {
    state.stream_deck.close_confirmation(&id);
}

pub use socket::upgrade;
