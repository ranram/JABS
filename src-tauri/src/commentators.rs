use crate::{catalogs, database::{Database, now_rfc3339}, moderation};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{path::Path, sync::RwLock};
use tokio::sync::broadcast;

const SURFACE_ID: &str = "commentators";

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Commentator {
    pub name: String,
    pub handle: String,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommentatorState {
    #[serde(default = "default_styling_game_id")]
    pub styling_game_id: String,
    pub tournament_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub logo_asset_id: Option<String>,
    pub commentators: Vec<Commentator>,
    pub presentation: String,
    pub updated_at: String,
}

pub struct CommentatorStore {
    state: RwLock<CommentatorState>,
    updates: broadcast::Sender<String>,
}

impl CommentatorStore {
    pub fn load(database: &Database, logo_directory: &Path) -> Result<Self, String> {
        let restored = database.load_broadcast_surface(SURFACE_ID)?
            .and_then(|payload| serde_json::from_str::<CommentatorState>(&payload).ok())
            .filter(|state| validate(state, logo_directory).is_ok());
        let state = restored.unwrap_or(CommentatorState {
            styling_game_id: default_styling_game_id(),
            tournament_name: "Tournament Broadcast".to_owned(),
            logo_asset_id: None,
            commentators: vec![
                Commentator { name: "Commentator 1".to_owned(), handle: "@handle".to_owned() },
                Commentator { name: "Commentator 2".to_owned(), handle: "@handle".to_owned() },
            ],
            presentation: "hidden".to_owned(),
            updated_at: now_rfc3339()?,
        });
        let payload = serde_json::to_string(&state)
            .map_err(|_| "Unable to serialize commentator state.".to_owned())?;
        database.save_broadcast_surface(SURFACE_ID, &payload, &state.updated_at)?;
        let (updates, _) = broadcast::channel(16);
        Ok(Self { state: RwLock::new(state), updates })
    }

    pub fn current(&self) -> Result<Value, String> {
        self.state.read()
            .map_err(|_| "Commentator state is unavailable.".to_owned())
            .and_then(|state| serde_json::to_value(&*state)
                .map_err(|_| "Unable to serialize commentator state.".to_owned()))
    }

    pub fn subscribe(&self) -> broadcast::Receiver<String> { self.updates.subscribe() }

    pub fn replace(
        &self,
        database: &Database,
        logo_directory: &Path,
        mut submitted: CommentatorState,
    ) -> Result<Value, String> {
        validate(&submitted, logo_directory)?;
        submitted.updated_at = now_rfc3339()?;
        let payload = serde_json::to_string(&submitted)
            .map_err(|_| "Unable to serialize commentator state.".to_owned())?;
        database.save_broadcast_surface(SURFACE_ID, &payload, &submitted.updated_at)?;
        *self.state.write().map_err(|_| "Commentator state is unavailable.".to_owned())? = submitted;
        let _ = self.updates.send(payload.clone());
        serde_json::from_str(&payload).map_err(|_| "Unable to serialize commentator state.".to_owned())
    }
}

fn validate(state: &CommentatorState, logo_directory: &Path) -> Result<(), String> {
    if !crate::state::is_supported_game_id(&state.styling_game_id) {
        return Err("Choose a recognized Styling game profile.".to_owned());
    }
    if state.tournament_name.trim().is_empty() || state.tournament_name.chars().count() > 80 {
        return Err("Tournament name must contain 1-80 characters.".to_owned());
    }
    if state.commentators.len() != 2 {
        return Err("The commentator overlay requires exactly two commentators.".to_owned());
    }
    for commentator in &state.commentators {
        if commentator.name.trim().is_empty() || commentator.name.chars().count() > 48 {
            return Err("Each commentator name must contain 1-48 characters.".to_owned());
        }
        if commentator.handle.chars().count() > 64 {
            return Err("Commentator handles may contain at most 64 characters.".to_owned());
        }
    }
    if !matches!(state.presentation.as_str(), "hidden" | "timed" | "persistent") {
        return Err("Choose a valid commentator presentation mode.".to_owned());
    }
    moderation::assert_safe(&[
        ("Tournament name", Some(state.tournament_name.as_str())),
        ("Commentator 1 name", Some(state.commentators[0].name.as_str())),
        ("Commentator 1 handle", Some(state.commentators[0].handle.as_str())),
        ("Commentator 2 name", Some(state.commentators[1].name.as_str())),
        ("Commentator 2 handle", Some(state.commentators[1].handle.as_str())),
    ])?;
    if let Some(asset_id) = state.logo_asset_id.as_deref() {
        if !catalogs::has_logo(logo_directory, asset_id) {
            return Err("Choose a tournament logo from JABS's reviewed catalog.".to_owned());
        }
    }
    Ok(())
}

fn default_styling_game_id() -> String { "street-fighter-6".to_owned() }
