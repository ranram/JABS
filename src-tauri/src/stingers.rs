mod media;
mod routes;
#[cfg(test)]
mod tests;
pub use routes::router;

use crate::{
    database::{Database, now_rfc3339},
    state::SelectedSet,
};
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, VecDeque},
    sync::{
        Mutex,
        atomic::{AtomicU64, Ordering},
    },
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tokio::sync::broadcast;
use crate::diagnostics::{self, Area, Context, Event};

fn diagnostic(event: Event) {
    diagnostics::record(event, Context { area: Area::Obs, ..Default::default() });
}

const MAX_DURATION_SECONDS: f64 = 120.0;
const CUE_LIFETIME_MILLIS: u64 = 125_000;
const SOURCE_TIMEOUT: Duration = Duration::from_secs(5);
const CLAIM_TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    Perfect,
    Winner,
}

#[derive(Clone, Deserialize, Serialize)]
pub struct Video {
    pub id: String,
    pub name: String,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Clip {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub video: Option<Video>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_seconds: Option<f64>,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub perfect: Clip,
    pub winner: Clip,
    pub automatic_winner: bool,
    pub media_delay_seconds: f64,
    pub video_layer: String,
    pub updated_at: String,
}
impl Settings {
    pub fn clip(&self, kind: Kind) -> &Clip {
        match kind {
            Kind::Perfect => &self.perfect,
            Kind::Winner => &self.winner,
        }
    }
    fn validate(&self) -> Result<(), String> {
        if !["background", "foreground"].contains(&self.video_layer.as_str())
            || !self.media_delay_seconds.is_finite()
            || !(0.0..=30.0).contains(&self.media_delay_seconds)
            || [&self.perfect, &self.winner].iter().any(|clip| {
                clip.duration_seconds
                    .is_some_and(|v| !v.is_finite() || !(0.5..=MAX_DURATION_SECONDS).contains(&v))
                    || clip
                        .video
                        .as_ref()
                        .is_some_and(|v| !media::valid_id(&v.id) || v.name.len() > 240)
            })
        {
            return Err("Choose valid stinger settings and a duration up to 120 seconds.".into());
        }
        Ok(())
    }
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Cue {
    pub id: String,
    pub kind: Kind,
    pub settings: Settings,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub selected_set: Option<SelectedSet>,
    pub expires_at: u64,
    pub claimed: bool,
    #[serde(skip)]
    owner: Option<String>,
    #[serde(skip)]
    created: Instant,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub connection_id: String,
    pub settings: Settings,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cue: Option<Cue>,
    pub ready_sources: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub playback_error: Option<String>,
}
struct Client {
    joined: Instant,
    seen: Instant,
    program: bool,
}
struct Inner {
    connection_id: String,
    settings: Settings,
    cue: Option<Cue>,
    clients: HashMap<String, Client>,
    playback_error: Option<String>,
    automatic_completions: VecDeque<String>,
}
pub struct StingerStore {
    inner: Mutex<Inner>,
    updates: broadcast::Sender<String>,
}

pub fn timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
pub fn unique_id() -> String {
    static SEQUENCE: AtomicU64 = AtomicU64::new(0);
    format!(
        "{}-{}",
        timestamp(),
        SEQUENCE.fetch_add(1, Ordering::Relaxed)
    )
}
impl StingerStore {
    pub fn load(database: &Database) -> Result<Self, String> {
        let settings = crate::persisted_state::restore(
            database,
            "Stingers",
            database.load_broadcast_surface("stingers")?,
            || {
                let clip = Clip {
                    video: None,
                    duration_seconds: None,
                };
                Ok(Settings {
                    perfect: clip.clone(),
                    winner: clip,
                    automatic_winner: false,
                    media_delay_seconds: 0.0,
                    video_layer: "foreground".into(),
                    updated_at: now_rfc3339()?,
                })
            },
            |s: &mut Settings| {
                // Keep framing and timing when retiring the earlier MP4/MOV choices.
                for clip in [&mut s.perfect, &mut s.winner] {
                    if clip
                        .video
                        .as_ref()
                        .is_some_and(|video| !media::valid_id(&video.id))
                    {
                        clip.video = None;
                    }
                }
                s.validate()
            },
        )?;
        database.save_broadcast_surface(
            "stingers",
            &serde_json::to_string(&settings).map_err(|_| "Unable to save stinger settings.")?,
            &settings.updated_at,
        )?;
        Ok(Self {
            inner: Mutex::new(Inner {
                connection_id: unique_id(),
                settings,
                cue: None,
                clients: HashMap::new(),
                playback_error: None,
                automatic_completions: VecDeque::new(),
            }),
            updates: broadcast::channel(32).0,
        })
    }
    pub fn subscribe(&self) -> broadcast::Receiver<String> {
        self.updates.subscribe()
    }
    fn snapshot(inner: &Inner) -> Snapshot {
        Snapshot {
            connection_id: inner.connection_id.clone(),
            settings: inner.settings.clone(),
            cue: inner.cue.clone(),
            ready_sources: inner.clients.len(),
            playback_error: inner.playback_error.clone(),
        }
    }
    fn publish(&self, inner: &Inner) {
        let _ = self.updates.send(
            serde_json::json!({"event": "stinger-state", "payload": Self::snapshot(inner)})
                .to_string(),
        );
    }
    pub fn current(&self) -> Result<Snapshot, String> {
        let inner = self.inner.lock().map_err(|_| "Stingers are unavailable.")?;
        Ok(Self::snapshot(&inner))
    }
    pub fn reconnect(&self) -> Result<Snapshot, String> {
        let mut inner = self.inner.lock().map_err(|_| "Stingers are unavailable.")?;
        diagnostic(Event::ObsReconnectRequested);
        inner.connection_id = unique_id();
        inner.clients.clear();
        inner.cue = None;
        inner.playback_error = None;
        self.publish(&inner);
        Ok(Self::snapshot(&inner))
    }
    pub fn replace(&self, database: &Database, mut settings: Settings) -> Result<Snapshot, String> {
        settings.validate()?;
        let mut inner = self.inner.lock().map_err(|_| "Stingers are unavailable.")?;
        crate::persisted_state::check_revision(&settings.updated_at, &inner.settings.updated_at)?;
        // File references may only be assigned by the import route.
        for (submitted, current) in [
            (&settings.perfect, &inner.settings.perfect),
            (&settings.winner, &inner.settings.winner),
        ] {
            if submitted.video.as_ref().map(|v| &v.id) != current.video.as_ref().map(|v| &v.id) {
                return Err("Import a video before selecting it.".into());
            }
        }
        settings.updated_at = now_rfc3339()?;
        Self::persist_settings(database, &mut inner, settings)?;
        self.publish(&inner);
        Ok(Self::snapshot(&inner))
    }
    fn persist_settings(
        database: &Database,
        inner: &mut Inner,
        settings: Settings,
    ) -> Result<(), String> {
        database.save_broadcast_surface(
            "stingers",
            &serde_json::to_string(&settings).map_err(|_| "Unable to save stingers.")?,
            &settings.updated_at,
        )?;
        inner.settings = settings;
        Ok(())
    }
    pub fn install(
        &self,
        database: &Database,
        kind: Kind,
        video: Option<Video>,
    ) -> Result<Option<String>, String> {
        let mut inner = self.inner.lock().map_err(|_| "Stingers are unavailable.")?;
        let old = inner
            .settings
            .clip(kind)
            .video
            .as_ref()
            .map(|v| v.id.clone());
        let mut settings = inner.settings.clone();
        match kind {
            Kind::Perfect => settings.perfect.video = video,
            Kind::Winner => settings.winner.video = video,
        }
        settings.updated_at = now_rfc3339()?;
        Self::persist_settings(database, &mut inner, settings)?;
        inner.cue = None;
        inner.playback_error = None;
        self.publish(&inner);
        Ok(old)
    }
    pub fn register(&self, id: &str, active: bool, program: bool) -> Result<Snapshot, String> {
        if id.len() < 8
            || id.len() > 80
            || !id.bytes().all(|v| v.is_ascii_alphanumeric() || v == b'-')
        {
            return Err("Invalid stinger source.".into());
        }
        let mut inner = self.inner.lock().map_err(|_| "Stingers are unavailable.")?;
        let before = inner.clients.len();
        if active {
            if inner.clients.len() >= 32 && !inner.clients.contains_key(id) {
                return Err("Too many stinger sources.".into());
            }
            inner
                .clients
                .entry(id.into())
                .and_modify(|c| {
                    c.seen = Instant::now();
                    c.program = program;
                })
                .or_insert(Client {
                    joined: Instant::now(),
                    seen: Instant::now(),
                    program,
                });
        } else {
            inner.clients.remove(id);
        }
        if before != inner.clients.len() {
            diagnostic(if before < inner.clients.len() { Event::ObsSourceConnected } else { Event::ObsSourceDisconnected });
            self.publish(&inner);
        }
        Ok(Self::snapshot(&inner))
    }
    pub fn play(&self, kind: Kind, selected: SelectedSet) -> Result<Snapshot, String> {
        let mut inner = self.inner.lock().map_err(|_| "Stingers are unavailable.")?;
        self.play_inner(&mut inner, kind, selected)?;
        Ok(Self::snapshot(&inner))
    }
    fn play_inner(
        &self,
        inner: &mut Inner,
        kind: Kind,
        selected: SelectedSet,
    ) -> Result<(), String> {
        self.expire_inner(inner);
        if inner.clients.is_empty() {
            return Err("No active Stingers OBS source is ready.".into());
        }
        if inner.settings.clip(kind).video.is_none() {
            return Err("Select a video for this stinger first.".into());
        }
        if kind == Kind::Winner && selected.winner().is_none() {
            return Err("Complete the score before playing the winner stinger.".into());
        }
        let created = timestamp();
        inner.cue = Some(Cue {
            id: unique_id(),
            kind,
            settings: inner.settings.clone(),
            selected_set: (kind == Kind::Winner).then_some(selected),
            expires_at: created + CUE_LIFETIME_MILLIS,
            claimed: false,
            owner: None,
            created: Instant::now(),
        });
        inner.playback_error = None;
        self.publish(inner);
        Ok(())
    }
    pub fn claim(&self, id: &str, cue_id: &str) -> Result<Option<Cue>, String> {
        let mut inner = self.inner.lock().map_err(|_| "Stingers are unavailable.")?;
        self.expire_inner(&mut inner);
        let Some(client) = inner.clients.get(id) else {
            return Ok(None);
        };
        let joined = client.joined;
        // Prefer a confirmed Program source over one awaiting its first OBS activity event.
        if !client.program && inner.clients.values().any(|client| client.program) {
            return Ok(None);
        }
        let Some(cue) = inner.cue.as_mut() else {
            return Ok(None);
        };
        if cue.id != cue_id
            || cue.claimed
            || joined > cue.created
            || cue.created.elapsed() > CLAIM_TIMEOUT
        {
            return Ok(None);
        }
        cue.claimed = true;
        diagnostic(Event::StingerStarted);
        cue.owner = Some(id.into());
        let result = cue.clone();
        self.publish(&inner);
        Ok(Some(result))
    }
    pub fn finish(
        &self,
        id: Option<&str>,
        cue_id: Option<&str>,
        error: Option<&str>,
    ) -> Result<Snapshot, String> {
        let mut inner = self.inner.lock().map_err(|_| "Stingers are unavailable.")?;
        if let Some(id) = id {
            if !inner
                .cue
                .as_ref()
                .is_some_and(|c| c.owner.as_deref() == Some(id) && Some(c.id.as_str()) == cue_id)
            {
                return Ok(Self::snapshot(&inner));
            }
        }
        if inner.cue.is_some() {
            diagnostic(if error.is_some() { Event::StingerFailed } else { Event::StingerFinished });
        }
        inner.cue = None;
        inner.playback_error =
            error.map(|_| "The stinger video could not play. Check its format in OBS.".into());
        self.publish(&inner);
        Ok(Self::snapshot(&inner))
    }
    fn expire_inner(&self, inner: &mut Inner) {
        let before = inner.clients.len();
        inner
            .clients
            .retain(|_, c| c.seen.elapsed() < SOURCE_TIMEOUT);
        let expired = inner.cue.as_ref().is_some_and(|cue| {
            timestamp() >= cue.expires_at
                || (!cue.claimed && cue.created.elapsed() > CLAIM_TIMEOUT)
                || cue
                    .owner
                    .as_ref()
                    .is_some_and(|id| !inner.clients.contains_key(id))
        });
        if expired {
            diagnostic(Event::StingerFailed);
            inner.cue = None;
        }
        if before != inner.clients.len() { diagnostic(Event::ObsSourceDisconnected); }
        if expired || before != inner.clients.len() {
            self.publish(inner);
        }
    }
    pub fn expire(&self) {
        if let Ok(mut inner) = self.inner.lock() {
            self.expire_inner(&mut inner);
        }
    }
    pub fn score_updated(&self, previous: &SelectedSet, next: &SelectedSet) {
        if next.reported_outcome.is_some() { return; }
        let key = |s: &SelectedSet| {
            serde_json::json!([
                s.set_id,
                s.event_id,
                s.game_id,
                s.match_format,
                s.best_of,
                s.player_one.entrant_id,
                s.player_one.local_player_id,
                s.player_one.name,
                s.player_two.entrant_id,
                s.player_two.local_player_id,
                s.player_two.name
            ])
            .to_string()
        };
        let score_changed = previous.player_one.score != next.player_one.score
            || previous.player_two.score != next.player_two.score;
        if !score_changed {
            return;
        }
        let next_key = key(next);
        if key(previous) != next_key {
            return;
        }
        if previous.upstream_reset == Some(true) && next.upstream_reset == Some(false) {
            if let Some(set_id) = next.set_id.as_deref() {
                self.reset_set_completion(set_id);
            }
        }
        if previous.winner().is_some() || next.winner().is_none() {
            return;
        }
        let Ok(mut inner) = self.inner.lock() else {
            return;
        };
        let completion = if let Some(set_id) = &next.set_id {
            format!("startgg-{set_id}")
        } else {
            next_key
        };
        if !inner.settings.automatic_winner || inner.automatic_completions.contains(&completion) {
            return;
        }
        // Consume this completion even if no source is ready; never play it later on reconnect.
        inner.automatic_completions.push_back(completion);
        if inner.automatic_completions.len() > 128 {
            inner.automatic_completions.pop_front();
        }
        if let Err(error) = self.play_inner(&mut inner, Kind::Winner, next.clone()) {
            diagnostic(Event::StingerFailed);
            inner.playback_error = Some(error);
            self.publish(&inner);
        }
    }
    pub fn reset_completion(&self) {
        if let Ok(mut inner) = self.inner.lock() {
            inner.automatic_completions.clear();
        }
    }
    pub fn reset_set_completion(&self, set_id: &str) {
        if let Ok(mut inner) = self.inner.lock() {
            let completion = format!("startgg-{set_id}");
            inner.automatic_completions.retain(|entry| entry != &completion);
        }
    }
}
