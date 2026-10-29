pub(crate) mod engine;
mod routes;
mod results;
pub use results::ResultStatus;
#[cfg(test)]
mod tests;
use crate::{database::Database, state::SelectedSet};
pub use routes::router;
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    sync::Mutex,
    time::{Duration, Instant, SystemTime},
};
use tokio::sync::broadcast;

const SURFACE: &str = "match-queue";
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum Mode {
    Manual,
    Report,
    WinnerDelay,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Context {
    pub event_id: String,
    pub event_name: String,
    pub tournament_slug: String,
    pub game_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub asset_catalog_slug: Option<String>,
    #[serde(default)]
    pub preserve_station: bool,
    #[serde(default)]
    pub preserve_match_length: bool,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub set_id: String,
    pub player_one: String,
    pub player_two: String,
    pub entrant_one_id: String,
    pub entrant_two_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub round: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub phase: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub result_status: Option<ResultStatus>,
    /// Blocks older report events after a reset until a new report is confirmed.
    /// Local scoring clears the match's reset flag while this one remains set.
    #[serde(default)]
    pub upstream_reset: bool,
}
impl Entry {
    pub fn from_set(set: &SelectedSet) -> Result<Self, String> {
        if set.player_one.entrant_id.is_empty()
            || set.player_two.entrant_id.is_empty()
            || set.player_one.entrant_id == set.player_two.entrant_id
        {
            return Err("Invalid match queue entry.".into());
        }
        Ok(Self {
            set_id: set.set_id.clone().ok_or("Load a start.gg set first.")?,
            player_one: if set.player_one.entrant_id.starts_with("set-") { "TBD".into() } else { set.player_one.name.clone() },
            player_two: if set.player_two.entrant_id.starts_with("set-") { "TBD".into() } else { set.player_two.name.clone() },
            entrant_one_id: set.player_one.entrant_id.clone(),
            entrant_two_id: set.player_two.entrant_id.clone(),
            round: set.round.clone(),
            phase: set.phase.clone(),
            result_status: results::result_status(set),
            upstream_reset: set.upstream_reset == Some(true),
        })
    }

    pub fn has_players(&self) -> bool {
        !self.entrant_one_id.starts_with("set-") && !self.entrant_two_id.starts_with("set-")
    }
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context: Option<Context>,
    pub entries: Vec<Entry>,
    pub cursor: Option<usize>,
    pub mode: Mode,
    pub delay_minutes: u32,
    pub running: bool,
    pub remaining_ms: Option<u64>,
    pub revision: u64,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}
impl Default for Snapshot {
    fn default() -> Self {
        Self {
            context: None,
            entries: vec![],
            cursor: None,
            mode: Mode::Manual,
            delay_minutes: 1,
            running: false,
            remaining_ms: None,
            revision: 0,
            status: "empty".into(),
            error: None,
        }
    }
}
#[derive(Clone)]
struct Client {
    event_id: Option<String>,
    busy: bool,
    seen: Instant,
    seen_wall: SystemTime,
    sequence: u64,
}
#[derive(Clone)]
struct Inner {
    waiting: Option<engine::Waiting>,
    snapshot: Snapshot,
    clients: HashMap<String, Client>,
    winner: Option<String>,
    reported: bool,
    activation: u64,
    last_tick: Instant,
    last_wall: SystemTime,
    loading: bool,
}
pub struct QueueStore {
    inner: Mutex<Inner>,
    updates: broadcast::Sender<String>,
}
impl QueueStore {
    pub fn load(database: &Database) -> Result<Self, String> {
        let mut snapshot: Snapshot = crate::persisted_state::restore(
            database,
            "Match queue",
            database.load_broadcast_surface(SURFACE)?,
            || Ok(Snapshot::default()),
            validate,
        )?;
        for entry in &mut snapshot.entries {
            entry.restore_result(database);
        }
        snapshot.running = false;
        snapshot.remaining_ms = None;
        snapshot.error = None;
        snapshot.status = stopped_status(&snapshot).into();
        snapshot.revision += 1;
        save(database, &snapshot)?;
        Ok(Self {
            inner: Mutex::new(Inner {
                waiting: None,
                snapshot,
                clients: HashMap::new(),
                winner: None,
                reported: false,
                activation: 0,
                last_tick: Instant::now(),
                last_wall: SystemTime::now(),
                loading: false,
            }),
            updates: broadcast::channel(32).0,
        })
    }
    pub fn subscribe(&self) -> broadcast::Receiver<String> {
        self.updates.subscribe()
    }
    pub fn current(&self) -> Result<Snapshot, String> {
        Ok(self
            .inner
            .lock()
            .map_err(|_| "The match queue is unavailable.")?
            .snapshot
            .clone())
    }
    fn publish(&self, inner: &Inner) {
        let _ = self
            .updates
            .send(serde_json::json!({"event":"match-queue", "payload":inner.snapshot}).to_string());
    }
    fn mutate(
        &self,
        database: &Database,
        revision: Option<u64>,
        change: impl FnOnce(&mut Inner) -> Result<(), String>,
    ) -> Result<Snapshot, String> {
        let mut inner = self
            .inner
            .lock()
            .map_err(|_| "The match queue is unavailable.")?;
        if revision.is_some_and(|r| r != inner.snapshot.revision) {
            return Err("The queue changed. Review its current order and try again.".into());
        }
        let mut next = inner.clone();
        change(&mut next)?;
        next.snapshot.revision += 1;
        if next.snapshot.status == "loading" {
            pause(&mut next);
        }
        next.loading = false;
        validate(&mut next.snapshot)?;
        save(database, &next.snapshot)?;
        *inner = next;
        self.publish(&inner);
        Ok(inner.snapshot.clone())
    }
    pub fn add(
        &self,
        database: &Database,
        revision: u64,
        context: Context,
        entry: Entry,
    ) -> Result<Snapshot, String> {
        self.add_many(database, revision, context, vec![entry])
    }
    pub fn add_many(
        &self,
        database: &Database,
        revision: u64,
        context: Context,
        mut entries: Vec<Entry>,
    ) -> Result<Snapshot, String> {
        for entry in &mut entries {
            entry.restore_fresh_result(database);
        }
        self.mutate(database, Some(revision), |inner| {
            let s = &mut inner.snapshot;
            if s.context
                .as_ref()
                .is_some_and(|c| c.event_id != context.event_id)
                && !s.entries.is_empty()
            {
                return Err("Clear the existing queue before queuing another event.".into());
            }
            s.context = Some(context);
            for entry in entries {
                if s.entries.iter().any(|e| e.set_id == entry.set_id) {
                    continue;
                }
                if s.entries.len() >= 100 {
                    return Err("The queue can hold up to 100 matches.".into());
                }
                s.entries.push(entry);
            }
            s.error = None;
            // A finished queue resumes after its last position when matches are added.
            if s.status == "empty" {
                s.status = "paused".into();
            }
            Ok(())
        })
    }
    pub fn fail(&self, database: &Database, revision: u64, message: &str) {
        let _ = self.mutate(database, Some(revision), |inner| {
            pause(inner);
            inner.snapshot.error = Some(message.into());
            Ok(())
        });
    }
    pub fn heartbeat(
        &self,
        client_id: String,
        event_id: Option<String>,
        busy: bool,
        sequence: Option<u64>,
        preserve: Option<(bool, bool)>,
    ) -> Result<(), String> {
        if client_id.len() > 80 || client_id.is_empty() {
            return Err("Invalid queue connection.".into());
        }
        let mut inner = self
            .inner
            .lock()
            .map_err(|_| "The match queue is unavailable.")?;
        let had_clients = !inner.clients.is_empty();
        inner.clients.retain(|_, c| client_active(c));
        if had_clients && inner.clients.is_empty() && inner.snapshot.running {
            pause(&mut inner);
            inner.snapshot.revision += 1;
            self.publish(&inner);
        }
        if sequence.is_some_and(|seq| {
            inner
                .clients
                .get(&client_id)
                .is_some_and(|c| c.sequence >= seq)
        }) {
            return Ok(());
        }
        if inner.clients.len() >= 16 && !inner.clients.contains_key(&client_id) {
            return Err("Too many queue connections.".into());
        }
        if let Some(event) = inner.snapshot.context.as_ref().map(|c| c.event_id.clone()) {
            if inner.snapshot.running && event_id.as_deref() != Some(&event) {
                pause(&mut inner);
                inner.snapshot.revision += 1;
                self.publish(&inner);
            }
        }
        if let Some(c) = inner.snapshot.context.as_mut() {
            if event_id.as_deref() == Some(&c.event_id) {
                if let Some((station, length)) = preserve {
                    c.preserve_station = station;
                    c.preserve_match_length = length;
                }
            }
        }
        inner.clients.insert(
            client_id,
            Client {
                event_id,
                busy,
                seen: Instant::now(),
                seen_wall: SystemTime::now(),
                sequence: sequence.unwrap_or(0),
            },
        );
        Ok(())
    }
    pub fn report_token(&self, set_id: &str) -> Option<u64> {
        let inner = self.inner.lock().ok()?;
        (inner.snapshot.mode == Mode::Report && current_id(&inner.snapshot) == Some(set_id))
            .then_some(inner.activation)
    }
    pub fn reported(&self, database: &Database, token: Option<u64>, set_id: &str, success: bool) {
        if success {
            let _ = self.record_result(
                database,
                set_id,
                Some(ResultStatus::Reported),
                results::ResultSource::Report(token),
            );
        }
        let Some(token) = token else {
            return;
        };
        let _ = self.mutate(database, None, |inner| {
            if inner.activation != token
                || inner.snapshot.mode != Mode::Report
                || current_id(&inner.snapshot) != Some(set_id)
                || inner.reported
            {
                // Ignore stale or duplicate receipts without invalidating another transition.
                return Err("The queue changed. Review its current order and try again.".into());
            }
            if success {
                inner.reported = true;
            } else {
                pause(inner);
                inner.snapshot.error = Some(
                    "The report was not confirmed. Refresh the bracket before continuing.".into(),
                );
            }
            Ok(())
        });
    }
}
fn current_id(s: &Snapshot) -> Option<&str> {
    s.cursor
        .and_then(|i| s.entries.get(i))
        .map(|e| e.set_id.as_str())
}
fn stopped_status(snapshot: &Snapshot) -> &'static str {
    if snapshot.entries.is_empty() {
        "empty"
    } else if snapshot.status == "finished" {
        "finished"
    } else {
        "paused"
    }
}
fn pause(inner: &mut Inner) {
    inner.waiting = None;
    inner.snapshot.running = false;
    inner.loading = false;
    inner.snapshot.status = stopped_status(&inner.snapshot).into();
}
fn reset_result(inner: &mut Inner) {
    inner.waiting = None;
    inner.activation += 1;
    inner.winner = None;
    inner.reported = false;
    inner.snapshot.remaining_ms = None;
}
fn validate(s: &mut Snapshot) -> Result<(), String> {
    if !(1..=30).contains(&s.delay_minutes)
        || s.entries.len() > 100
        || s.cursor.is_some_and(|i| i >= s.entries.len())
    {
        return Err("Invalid match queue settings.".into());
    }
    if let Some(c) = &s.context {
        if c.event_id.is_empty()
            || c.event_name.is_empty()
            || c.event_name.chars().count() > 200
            || c.tournament_slug.is_empty()
            || c.tournament_slug.len() > 300
            || !crate::state::is_game_id(&c.game_id)
            || c.asset_catalog_slug
                .as_ref()
                .is_some_and(|v| !crate::catalogs::valid_game_asset_catalog_slug(v))
        {
            return Err("Invalid match queue event.".into());
        }
    } else if !s.entries.is_empty() {
        return Err("Choose an event before adding matches.".into());
    }
    let mut ids = std::collections::HashSet::new();
    for e in &s.entries {
        if e.set_id.is_empty()
            || e.set_id.len() > 80
            || !ids.insert(&e.set_id)
            || e.entrant_one_id.is_empty()
            || e.entrant_two_id.is_empty()
            || e.entrant_one_id == e.entrant_two_id
            || e.player_one.chars().count() > 160
            || e.player_two.chars().count() > 160
        {
            return Err("Invalid match queue entry.".into());
        }
    }
    Ok(())
}
fn save(database: &Database, s: &Snapshot) -> Result<(), String> {
    database.save_broadcast_surface(
        SURFACE,
        &serde_json::to_string(s).map_err(|_| "Unable to save the match queue.")?,
        &crate::database::now_rfc3339()?,
    )
}

fn client_active(client: &Client) -> bool {
    client.seen.elapsed() < Duration::from_secs(6)
        && client
            .seen_wall
            .elapsed()
            .is_ok_and(|elapsed| elapsed < Duration::from_secs(6))
}
