use crate::{
    database::Database,
    match_queue::{Entry, Snapshot},
    runtime::RuntimeState,
    state::{ReportOutcomeKind, SelectedSet},
};
use axum::{
    Json, Router,
    extract::State,
    http::{HeaderMap, StatusCode},
    response::Response,
    routing::get,
};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex, RwLock};
use tokio::sync::broadcast;

const SURFACE: &str = "queue-ticker";
#[derive(Clone, Default, Serialize, Deserialize, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub enum TickerStyle {
    Standard,
    #[default]
    Compact,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Settings {
    #[serde(default)]
    pub style: TickerStyle,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub styling_game_id: Option<String>,
    // Discard persisted color overrides; palettes come from the selected style.
    #[serde(default, skip_serializing, rename = "primaryColor")]
    pub _legacy_primary_color: Option<serde::de::IgnoredAny>,
    #[serde(default, skip_serializing, rename = "secondaryColor")]
    pub _legacy_secondary_color: Option<serde::de::IgnoredAny>,
    pub enabled: bool,
    pub upcoming_count: u8,
    pub show_results: bool,
    #[serde(default)]
    pub show_logo: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub logo_asset_id: Option<String>,
    pub updated_at: String,
}
impl Settings {
    fn validate(&self) -> Result<(), String> {
        if self
            .styling_game_id
            .as_ref()
            .is_some_and(|id| !crate::state::is_supported_game_id(id))
        {
            return Err("Unsupported overlay style.".into());
        }
        if !(1..=3).contains(&self.upcoming_count) {
            return Err("Choose one to three upcoming matches.".into());
        }
        if self
            .logo_asset_id
            .as_ref()
            .is_some_and(|id| id.len() > 255 || !crate::catalogs::valid_media_id(id))
        {
            return Err("Choose a valid local logo.".into());
        }
        Ok(())
    }
}
struct ProjectionCache {
    key: (String, u64, String),
    snapshot: TickerSnapshot,
}
pub struct TickerStore {
    state: RwLock<Settings>,
    updates: broadcast::Sender<String>,
    cache: Mutex<Option<ProjectionCache>>,
}
impl TickerStore {
    pub fn load(database: &Database) -> Result<Self, String> {
        let state = crate::persisted_state::restore(
            database,
            "Queue ticker",
            database.load_broadcast_surface(SURFACE)?,
            || {
                Ok(Settings {
                    enabled: false,
                    style: TickerStyle::default(),
                    styling_game_id: None,
                    _legacy_primary_color: None,
                    _legacy_secondary_color: None,
                    upcoming_count: 3,
                    show_results: false,
                    show_logo: false,
                    logo_asset_id: None,
                    updated_at: crate::database::now_rfc3339()?,
                })
            },
            |state: &mut Settings| state.validate(),
        )?;
        Ok(Self {
            state: RwLock::new(state),
            updates: broadcast::channel(16).0,
            cache: Mutex::new(None),
        })
    }
    fn settings(&self) -> Result<Settings, String> {
        self.state
            .read()
            .map(|s| s.clone())
            .map_err(|_| "Queue ticker unavailable.".into())
    }
    pub fn subscribe(&self) -> broadcast::Receiver<String> {
        self.updates.subscribe()
    }
    fn replace(&self, database: &Database, mut next: Settings) -> Result<Settings, String> {
        let mut current = self
            .state
            .write()
            .map_err(|_| "Queue ticker unavailable.")?;
        crate::persisted_state::check_revision(&next.updated_at, &current.updated_at)?;
        next.validate()?;
        next.updated_at = crate::state::next_timestamp(&current.updated_at)?;
        database.save_broadcast_surface(
            SURFACE,
            &serde_json::to_string(&next).map_err(|_| "Unable to save queue ticker.")?,
            &next.updated_at,
        )?;
        *current = next.clone();
        Ok(next)
    }
    fn publish(&self, snapshot: &TickerSnapshot) {
        let _ = self.updates.send(snapshot.message());
    }
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TickerMatch {
    set_id: String,
    player_one: String,
    player_two: String,
    round: Option<String>,
    phase: Option<String>,
}
impl From<&Entry> for TickerMatch {
    fn from(entry: &Entry) -> Self {
        Self {
            set_id: entry.set_id.clone(),
            player_one: entry.player_one.clone(),
            player_two: entry.player_two.clone(),
            round: entry.round.clone(),
            phase: entry.phase.clone(),
        }
    }
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TickerResult {
    #[serde(flatten)]
    game: TickerMatch,
    score_one: String,
    score_two: String,
    winner: String,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TickerSnapshot {
    settings: Settings,
    upcoming: Vec<TickerMatch>,
    results: Vec<TickerResult>,
}
impl TickerSnapshot {
    fn message(&self) -> String {
        serde_json::json!({"event":"queue-ticker", "payload":self}).to_string()
    }
}
fn project(
    database: &Database,
    settings: Settings,
    queue: &Snapshot,
    live: &SelectedSet,
) -> TickerSnapshot {
    let mut snapshot = TickerSnapshot {
        settings,
        upcoming: vec![],
        results: vec![],
    };
    let Some(context) = queue.context.as_ref().filter(|_| snapshot.settings.enabled) else {
        return snapshot;
    };
    let index = queue.cursor.or_else(|| {
        queue
            .entries
            .iter()
            .position(|entry| Some(entry.set_id.as_str()) == live.set_id.as_deref())
    });
    snapshot.upcoming = queue
        .entries
        .iter()
        .skip(index.map_or(0, |i| i + 1))
        .filter(|entry| entry.result_status.is_none())
        .take(snapshot.settings.upcoming_count as usize)
        .map(TickerMatch::from)
        .collect();
    if snapshot.settings.show_results {
        let event = &context.event_id;
        let mut completed: Vec<_> = queue.entries.iter().rev().collect();
        completed.sort_by(|one, two| two.completed_at.cmp(&one.completed_at));
        snapshot.results = completed.into_iter()
            .filter_map(|entry| {
                if entry.result_status == Some(crate::match_queue::ResultStatus::Reported) && !entry.upstream_reset {
                    if let Some(result) = &entry.reported_result {
                        let one_won = result.winner_id == entry.entrant_one_id;
                        let (score_one, score_two) = if result.disqualification || result.score_one == result.score_two {
                            let loser = if result.disqualification { "DQ" } else { "L" };
                            if one_won { ("W".into(), loser.into()) } else { (loser.into(), "W".into()) }
                        } else { (result.score_one.to_string(), result.score_two.to_string()) };
                        return Some(TickerResult { game: entry.into(), score_one, score_two,
                            winner: if one_won { "one" } else { "two" }.into() });
                    }
                }
                let saved = entry.completed_progress(database, event)?;
                let saved_winner = saved.winner()?;
                let first_is_one = entry.entrant_one_id == saved.player_one.entrant_id;
                let winner_is_one = (saved_winner == "one") == first_is_one;
                let (one, two) = if first_is_one {
                    (saved.player_one.score, saved.player_two.score)
                } else {
                    (saved.player_two.score, saved.player_one.score)
                };
                let (score_one, score_two) = if let Some(outcome) = &saved.reported_outcome {
                    let loser = if outcome.kind == ReportOutcomeKind::Disqualification {
                        "DQ"
                    } else {
                        "L"
                    };
                    if winner_is_one {
                        ("W".into(), loser.into())
                    } else {
                        (loser.into(), "W".into())
                    }
                } else {
                    (one.to_string(), two.to_string())
                };
                Some(TickerResult {
                    game: entry.into(),
                    score_one,
                    score_two,
                    winner: if winner_is_one { "one" } else { "two" }.into(),
                })
            })
            .take(3)
            .collect();
    }
    snapshot
}
fn current(runtime: &RuntimeState) -> Result<TickerSnapshot, String> {
    let settings = runtime.queue_ticker.settings()?;
    let queue = runtime.match_queue.current()?;
    let live = runtime.overlay.selected_set()?;
    let key = (
        settings.updated_at.clone(),
        queue.revision,
        live.updated_at.clone(),
    );
    let mut cache = runtime
        .queue_ticker
        .cache
        .lock()
        .map_err(|_| "Queue ticker unavailable.")?;
    if let Some(saved) = &*cache {
        if saved.key == key {
            return Ok(saved.snapshot.clone());
        }
    }
    let snapshot = project(&runtime.database, settings, &queue, &live);
    *cache = Some(ProjectionCache {
        key,
        snapshot: snapshot.clone(),
    });
    Ok(snapshot)
}

pub async fn run(runtime: Arc<RuntimeState>) {
    let mut queue = runtime.match_queue.subscribe();
    let mut overlay = runtime.overlay.subscribe();
    let mut last = String::new();
    loop {
        tokio::select! { _ = queue.recv() => {}, _ = overlay.recv() => {} }
        if let Ok(snapshot) = current(&runtime) {
            let next = snapshot.message();
            if next != last {
                let _ = runtime.queue_ticker.updates.send(next.clone());
                last = next;
            }
        }
    }
}
pub fn router() -> Router<Arc<RuntimeState>> {
    Router::new().route("/api/broadcast/queue-ticker", get(read).put(update))
}
fn respond(result: Result<TickerSnapshot, String>) -> Response {
    use axum::response::IntoResponse;
    match result {
        Ok(state) => crate::local_server::secure_json(Json(state)),
        Err(error) => crate::local_server::secure_json(
            (
                StatusCode::UNPROCESSABLE_ENTITY,
                Json(serde_json::json!({"error":error})),
            )
                .into_response(),
        ),
    }
}
async fn read(State(runtime): State<Arc<RuntimeState>>) -> Response {
    respond(current(&runtime))
}
async fn update(
    State(runtime): State<Arc<RuntimeState>>,
    headers: HeaderMap,
    Json(settings): Json<Settings>,
) -> Response {
    if let Some(response) = crate::local_server::reject_untrusted_mutation(&headers) {
        return response;
    }
    respond(
        runtime
            .queue_ticker
            .replace(&runtime.database, settings)
            .and_then(|_| {
                let snapshot = current(&runtime)?;
                runtime.queue_ticker.publish(&snapshot);
                Ok(snapshot)
            }),
    )
}
#[cfg(test)]
#[path = "queue_ticker_tests.rs"]
mod tests;
