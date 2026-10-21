use crate::{
    database::{now_rfc3339, Database},
    runtime::RuntimeState,
};
use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    response::Response,
    Json,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::{Arc, RwLock};
use tokio::sync::{broadcast, Mutex};

mod reader;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Scope {
    pub event_id: String,
    pub phase_id: String,
    pub phase_group_id: String,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub styling_game_id: String,
    pub show_background: bool,
    pub show_tournament_logo: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub logo_asset_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub heading: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub event_label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub winners_round: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub losers_round: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scope: Option<Scope>,
    pub updated_at: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ScreenState {
    settings: Settings,
    #[serde(skip)]
    scope_revision: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    snapshot: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

pub struct BracketScreenStore {
    state: RwLock<ScreenState>,
    updates: broadcast::Sender<String>,
    refresh: Mutex<()>,
}

impl BracketScreenStore {
    pub fn load(database: &Database) -> Result<Self, String> {
        let mut settings = crate::persisted_state::restore(
            database,
            "Bracket",
            database.load_broadcast_surface("bracket-screen")?,
            || {
                Ok(Settings {
                    styling_game_id: "street-fighter-6".into(),
                    show_background: true,
                    show_tournament_logo: true,
                    logo_asset_id: None,
                    heading: None,
                    event_label: None,
                    winners_round: None,
                    losers_round: None,
                    scope: None,
                    updated_at: now_rfc3339()?,
                })
            },
            validate,
        )?;
        // A new session keeps styling, but cannot present the previous tournament.
        settings.scope = None;
        settings.winners_round = None;
        settings.losers_round = None;
        settings.updated_at = now_rfc3339()?;
        save(database, &settings)?;
        let (updates, _) = broadcast::channel(16);
        Ok(Self {
            state: RwLock::new(ScreenState {
                settings,
                scope_revision: 0,
                snapshot: None,
                error: None,
            }),
            updates,
            refresh: Mutex::new(()),
        })
    }
    pub fn current(&self) -> Result<Value, String> {
        let state = self
            .state
            .read()
            .map_err(|_| "Bracket settings are unavailable.")?;
        serde_json::to_value(&*state).map_err(|_| "Could not read the bracket screen.".into())
    }
    pub fn subscribe(&self) -> broadcast::Receiver<String> {
        self.updates.subscribe()
    }
    fn publish(&self, state: &ScreenState) -> Result<Value, String> {
        let value =
            serde_json::to_value(state).map_err(|_| "Could not read the bracket screen.")?;
        let _ = self
            .updates
            .send(json!({ "event": "bracket-screen-state", "payload": value }).to_string());
        Ok(value)
    }
    pub fn replace(&self, database: &Database, mut submitted: Settings) -> Result<Value, String> {
        validate(&mut submitted)?;
        let mut state = self
            .state
            .write()
            .map_err(|_| "Bracket settings are unavailable.")?;
        crate::persisted_state::check_revision(&submitted.updated_at, &state.settings.updated_at)?;
        submitted.updated_at = crate::state::next_timestamp(&state.settings.updated_at)?;
        save(database, &submitted)?;
        if submitted.scope != state.settings.scope {
            state.scope_revision += 1;
            state.snapshot = None;
            state.error = None;
        }
        state.settings = submitted;
        self.publish(&state)
    }
    pub fn clear(&self, database: &Database) -> Result<(), String> {
        let mut state = self
            .state
            .write()
            .map_err(|_| "Bracket settings are unavailable.")?;
        state.settings.scope = None;
        state.scope_revision += 1;
        state.settings.winners_round = None;
        state.settings.losers_round = None;
        state.settings.updated_at = crate::state::next_timestamp(&state.settings.updated_at)?;
        state.snapshot = None;
        state.error = None;
        save(database, &state.settings)?;
        self.publish(&state)?;
        Ok(())
    }
    fn finish(
        &self,
        scope: &Scope,
        revision: u64,
        result: Result<Value, String>,
    ) -> Result<Value, String> {
        let mut state = self
            .state
            .write()
            .map_err(|_| "Bracket settings are unavailable.")?;
        if state.settings.scope.as_ref() == Some(scope) && state.scope_revision == revision {
            match result {
                Ok(snapshot) => {
                    state.snapshot = Some(snapshot);
                    state.error = None;
                }
                Err(error) => state.error = Some(error),
            }
            self.publish(&state)?;
        }
        serde_json::to_value(&*state).map_err(|_| "Could not read the bracket screen.".into())
    }
}

fn validate(settings: &mut Settings) -> Result<(), String> {
    if !crate::state::is_supported_game_id(&settings.styling_game_id)
        || settings
            .winners_round
            .is_some_and(|round| !(1..=100).contains(&round))
        || settings
            .losers_round
            .is_some_and(|round| !(-100..=-1).contains(&round))
        || settings
            .logo_asset_id
            .as_deref()
            .is_some_and(|id| !crate::catalogs::valid_logo_id(id))
    {
        return Err("Choose valid bracket styling, logo and view settings.".into());
    }
    for label in [&mut settings.heading, &mut settings.event_label] {
        if let Some(text) = label {
            if text.encode_utf16().count() > 100 || text.chars().any(char::is_control) {
                return Err(
                    "Bracket header labels must be at most 100 characters on one line.".into(),
                );
            }
            let trimmed = text.trim();
            *label = if trimmed.is_empty() {
                None
            } else {
                crate::moderation::censor(Some(trimmed.to_owned()))
            };
        }
    }
    if settings.scope.as_ref().is_some_and(|scope| {
        [&scope.event_id, &scope.phase_id, &scope.phase_group_id]
            .iter()
            .any(|id| {
                id.is_empty() || id.len() > 20 || !id.bytes().all(|byte| byte.is_ascii_digit())
            })
    }) {
        return Err("Select an event, phase and pool for the bracket.".into());
    }
    Ok(())
}
fn save(database: &Database, settings: &Settings) -> Result<(), String> {
    let payload =
        serde_json::to_string(settings).map_err(|_| "Could not save bracket settings.")?;
    database.save_broadcast_surface("bracket-screen", &payload, &settings.updated_at)
}
pub async fn current(State(runtime): State<Arc<RuntimeState>>) -> Response {
    respond(runtime.bracket_screen.current())
}
pub async fn update(
    State(runtime): State<Arc<RuntimeState>>,
    headers: HeaderMap,
    Json(settings): Json<Settings>,
) -> Response {
    if let Some(response) = crate::local_server::reject_untrusted_mutation(&headers) {
        return response;
    }
    let scope_changed = runtime
        .bracket_screen
        .current()
        .ok()
        .and_then(|state| serde_json::from_value::<Settings>(state["settings"].clone()).ok())
        .is_some_and(|previous| previous.scope != settings.scope);
    let result = runtime.bracket_screen.replace(&runtime.database, settings);
    if result.is_ok() && scope_changed {
        let next = runtime.clone();
        tokio::spawn(async move {
            let _ = refresh(&next, false).await;
        });
    }
    respond(result)
}
pub async fn refresh_route(
    State(runtime): State<Arc<RuntimeState>>,
    headers: HeaderMap,
) -> Response {
    if let Some(response) = crate::local_server::reject_untrusted_mutation(&headers) {
        return response;
    }
    respond(refresh(&runtime, true).await)
}
fn respond(result: Result<Value, String>) -> Response {
    match result {
        Ok(value) => crate::local_server::secure_json(Json(value)),
        Err(error) => crate::local_server::secure_json((
            StatusCode::UNPROCESSABLE_ENTITY,
            Json(json!({ "error": error })),
        )),
    }
}
async fn refresh(runtime: &RuntimeState, force: bool) -> Result<Value, String> {
    // All OBS clients share one refresh. A selector change starts a fresh request
    // after the old one ends, and finish() refuses to publish into a different pool.
    let _guard = runtime.bracket_screen.refresh.lock().await;
    let state = runtime
        .bracket_screen
        .state
        .read()
        .map_err(|_| "Bracket settings are unavailable.")?
        .clone();
    let Some(scope) = state.settings.scope else {
        return runtime.bracket_screen.current();
    };
    if !force
        && state.snapshot.as_ref().is_some_and(|snapshot| {
            (snapshot["completed"].as_bool() == Some(true)
                && snapshot["matches"]
                    .as_array()
                    .is_some_and(|matches| !matches.is_empty()))
                || snapshot["fetchedAt"]
                    .as_str()
                    .and_then(|value| {
                        time::OffsetDateTime::parse(
                            value,
                            &time::format_description::well_known::Rfc3339,
                        )
                        .ok()
                    })
                    .is_some_and(|fetched| {
                        time::OffsetDateTime::now_utc() - fetched < time::Duration::seconds(55)
                    })
        })
    {
        return runtime.bracket_screen.current();
    }
    let result = reader::read(runtime, &scope).await;
    runtime
        .bracket_screen
        .finish(&scope, state.scope_revision, result)
}
pub async fn run_refresh(runtime: Arc<RuntimeState>) {
    let mut tick = tokio::time::interval(std::time::Duration::from_secs(60));
    tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    loop {
        tick.tick().await;
        let _ = refresh(&runtime, false).await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn bracket_scope_changes_reject_late_results_and_preserve_only_styling_on_restart() {
        let db = Database::open(std::path::Path::new(":memory:")).unwrap();
        let store = BracketScreenStore::load(&db).unwrap();
        let mut settings: Settings =
            serde_json::from_value(store.current().unwrap()["settings"].clone()).unwrap();
        let first = Scope {
            event_id: "1".into(),
            phase_id: "2".into(),
            phase_group_id: "3".into(),
        };
        settings.scope = Some(first.clone());
        settings.styling_game_id = "tekken-8".into();
        settings.heading = Some(" Finals ".into());
        settings.event_label = Some("SF6".into());
        store.replace(&db, settings.clone()).unwrap();
        assert!(store.replace(&db, settings).is_err());
        store.clear(&db).unwrap();
        store
            .finish(&first, 1, Ok(json!({ "matches": [] })))
            .unwrap();
        assert!(store.current().unwrap().get("snapshot").is_none());
        let mut again: Settings =
            serde_json::from_value(store.current().unwrap()["settings"].clone()).unwrap();
        again.scope = Some(first.clone());
        store.replace(&db, again).unwrap();
        store
            .finish(&first, 1, Ok(json!({ "matches": [] })))
            .unwrap();
        assert!(store.current().unwrap().get("snapshot").is_none());
        let restored = BracketScreenStore::load(&db).unwrap().current().unwrap();
        assert_eq!(restored["settings"]["stylingGameId"], "tekken-8");
        assert_eq!(restored["settings"]["heading"], "Finals");
        assert_eq!(restored["settings"]["eventLabel"], "SF6");
        let mut labels: Settings = serde_json::from_value(restored["settings"].clone()).unwrap();
        labels.heading = Some(" ".into());
        labels.event_label = Some(" ".into());
        validate(&mut labels).unwrap();
        assert!(labels.heading.is_none() && labels.event_label.is_none());
        labels.heading = Some("x".repeat(101));
        assert!(validate(&mut labels).is_err());
        assert!(restored["settings"].get("scope").is_none());
    }
}
