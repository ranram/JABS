use crate::database::{now_rfc3339, Database};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::RwLock;
use tokio::sync::broadcast;

const SURFACE_ID: &str = "versus-screen";

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Placement {
    pub placement: u64,
    pub tournament_name: String,
    pub event_name: String,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HeadToHead {
    pub tournament_name: String,
    pub event_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub completed_at: Option<u64>,
    pub player_one_score: u64,
    pub player_two_score: u64,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VersusHistory {
    pub player_one_placements: Vec<Placement>,
    pub player_two_placements: Vec<Placement>,
    pub head_to_head: Vec<HeadToHead>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaTransform {
    pub x: f64,
    pub y: f64,
    pub scale: f64,
    #[serde(default)]
    pub flipped: bool,
}

impl Default for MediaTransform {
    fn default() -> Self { Self { x: 0.0, y: 0.0, scale: 1.0, flipped: false } }
}

#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerMediaPlacement {
    pub character: MediaTransform,
    pub photo: MediaTransform,
}

fn default_media_placements() -> [PlayerMediaPlacement; 2] {
    [PlayerMediaPlacement::default(), PlayerMediaPlacement::default()]
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VersusScreenState {
    #[serde(default = "default_styling_game_id")]
    pub styling_game_id: String,
    #[serde(default = "default_true")]
    pub show_background: bool,
    pub show_tournament_logo: bool,
    pub show_sponsor_logos: bool,
    #[serde(default = "default_media_mode")]
    pub media_mode: String,
    #[serde(default = "default_media_placements")]
    pub media_placements: [PlayerMediaPlacement; 2],
    #[serde(skip_serializing_if = "Option::is_none")]
    pub history: Option<VersusHistory>,
    pub updated_at: String,
}

pub struct VersusScreenStore {
    state: RwLock<VersusScreenState>,
    updates: broadcast::Sender<String>,
}

impl VersusScreenStore {
    pub fn load(database: &Database) -> Result<Self, String> {
        let state = database
            .load_broadcast_surface(SURFACE_ID)?
            .and_then(|payload| serde_json::from_str::<VersusScreenState>(&payload).ok())
            .filter(validate)
            .unwrap_or(VersusScreenState {
                styling_game_id: default_styling_game_id(),
                show_background: true,
                show_tournament_logo: true,
                show_sponsor_logos: true,
                media_mode: default_media_mode(),
                media_placements: default_media_placements(),
                history: None,
                updated_at: now_rfc3339()?,
            });
        let payload = serde_json::to_string(&state)
            .map_err(|_| "Unable to serialize Versus Screen settings.".to_owned())?;
        database.save_broadcast_surface(SURFACE_ID, &payload, &state.updated_at)?;
        let (updates, _) = broadcast::channel(16);
        Ok(Self { state: RwLock::new(state), updates })
    }

    pub fn current(&self) -> Result<Value, String> {
        self.state.read()
            .map_err(|_| "Versus Screen settings are unavailable.".to_owned())
            .and_then(|state| serde_json::to_value(&*state)
                .map_err(|_| "Unable to serialize Versus Screen settings.".to_owned()))
    }

    pub fn subscribe(&self) -> broadcast::Receiver<String> { self.updates.subscribe() }

    pub fn replace(&self, database: &Database, mut submitted: VersusScreenState) -> Result<Value, String> {
        submitted.history = self.state.read()
            .map_err(|_| "Versus Screen settings are unavailable.".to_owned())?
            .history
            .clone();
        if !validate(&submitted) {
            return Err("Choose valid Versus Screen settings.".to_owned());
        }
        submitted.updated_at = now_rfc3339()?;
        self.save(database, submitted)
    }

    pub fn replace_history(&self, database: &Database, history: VersusHistory) -> Result<Value, String> {
        let mut next = self.state.read()
            .map_err(|_| "Versus Screen settings are unavailable.".to_owned())?
            .clone();
        next.history = Some(history);
        next.updated_at = now_rfc3339()?;
        self.save(database, next)
    }

    fn save(&self, database: &Database, state: VersusScreenState) -> Result<Value, String> {
        let payload = serde_json::to_string(&state)
            .map_err(|_| "Unable to serialize Versus Screen settings.".to_owned())?;
        database.save_broadcast_surface(SURFACE_ID, &payload, &state.updated_at)?;
        *self.state.write().map_err(|_| "Versus Screen settings are unavailable.".to_owned())? = state;
        let _ = self.updates.send(payload.clone());
        serde_json::from_str(&payload)
            .map_err(|_| "Unable to serialize Versus Screen settings.".to_owned())
    }
}

fn validate(state: &VersusScreenState) -> bool {
    crate::state::is_supported_game_id(&state.styling_game_id)
        && matches!(state.media_mode.as_str(), "character" | "photo")
        && state.media_placements.iter().all(|placement| {
            [&placement.character, &placement.photo].iter().all(|transform| {
                transform.x.is_finite() && (-0.85..=0.85).contains(&transform.x)
                    && transform.y.is_finite() && (-0.85..=0.85).contains(&transform.y)
                    && transform.scale.is_finite() && (0.35..=2.5).contains(&transform.scale)
            })
        })
        && state.history.as_ref().is_none_or(|history| {
            history.player_one_placements.len() <= 3
                && history.player_two_placements.len() <= 3
                && history.head_to_head.len() <= 3
        })
}

fn default_styling_game_id() -> String { "street-fighter-6".to_owned() }
fn default_media_mode() -> String { "character".to_owned() }
fn default_true() -> bool { true }
