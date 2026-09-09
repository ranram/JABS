use crate::database::{now_rfc3339, Database};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::RwLock;
use tokio::sync::broadcast;

const SURFACE_ID: &str = "result-screen";

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResultScreenState {
    #[serde(default = "default_styling_game_id")]
    pub styling_game_id: String,
    #[serde(default = "default_true")]
    pub show_background: bool,
    pub show_tournament_logo: bool,
    pub show_player_photo: bool,
    pub show_sponsor_logo: bool,
    pub show_character: bool,
    pub updated_at: String,
}

pub struct ResultScreenStore {
    state: RwLock<ResultScreenState>,
    updates: broadcast::Sender<String>,
}

impl ResultScreenStore {
    pub fn load(database: &Database) -> Result<Self, String> {
        let state = database
            .load_broadcast_surface(SURFACE_ID)?
            .and_then(|payload| serde_json::from_str::<ResultScreenState>(&payload).ok())
            .filter(|state| crate::state::is_supported_game_id(&state.styling_game_id))
            .unwrap_or(ResultScreenState {
                styling_game_id: default_styling_game_id(),
                show_background: true,
                show_tournament_logo: true,
                show_player_photo: true,
                show_sponsor_logo: true,
                show_character: true,
                updated_at: now_rfc3339()?,
            });
        let payload = serde_json::to_string(&state)
            .map_err(|_| "Unable to serialize Winner/Champion settings.".to_owned())?;
        database.save_broadcast_surface(SURFACE_ID, &payload, &state.updated_at)?;
        let (updates, _) = broadcast::channel(16);
        Ok(Self { state: RwLock::new(state), updates })
    }

    pub fn current(&self) -> Result<Value, String> {
        self.state
            .read()
            .map_err(|_| "Winner/Champion settings are unavailable.".to_owned())
            .and_then(|state| {
                serde_json::to_value(&*state)
                    .map_err(|_| "Unable to serialize Winner/Champion settings.".to_owned())
            })
    }

    pub fn subscribe(&self) -> broadcast::Receiver<String> {
        self.updates.subscribe()
    }

    pub fn replace(
        &self,
        database: &Database,
        mut submitted: ResultScreenState,
    ) -> Result<Value, String> {
        if !crate::state::is_supported_game_id(&submitted.styling_game_id) {
            return Err("Choose a recognized Styling game profile.".to_owned());
        }
        submitted.updated_at = now_rfc3339()?;
        let payload = serde_json::to_string(&submitted)
            .map_err(|_| "Unable to serialize Winner/Champion settings.".to_owned())?;
        database.save_broadcast_surface(SURFACE_ID, &payload, &submitted.updated_at)?;
        *self
            .state
            .write()
            .map_err(|_| "Winner/Champion settings are unavailable.".to_owned())? = submitted;
        let _ = self.updates.send(payload.clone());
        serde_json::from_str(&payload)
            .map_err(|_| "Unable to serialize Winner/Champion settings.".to_owned())
    }
}

fn default_styling_game_id() -> String { "street-fighter-6".to_owned() }
fn default_true() -> bool { true }
