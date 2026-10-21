use crate::{
    database::{Database, now_rfc3339},
    local_server::{reject_untrusted_mutation, secure_json, state_result},
    runtime::RuntimeState,
};
use axum::{Json, extract::State, http::HeaderMap, response::Response};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::sync::{Arc, RwLock};
use tokio::sync::broadcast;

const SURFACE_ID: &str = "player-stats";

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerStatsSettings {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    styling_game_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    logo_asset_id: Option<String>,
    #[serde(default = "default_true")]
    show_background: bool,
    #[serde(default = "default_true")]
    show_tournament_logo: bool,
    #[serde(default = "default_true")]
    show_placement_logos: bool,
    #[serde(default = "default_true")]
    show_sponsor_logo: bool,
    #[serde(default = "default_true")]
    show_player_photo: bool,
    #[serde(default = "default_true")]
    show_character: bool,
    updated_at: String,
}

pub struct SettingsStore {
    state: RwLock<PlayerStatsSettings>,
    updates: broadcast::Sender<String>,
}

impl SettingsStore {
    pub fn load(database: &Database) -> Result<Self, String> {
        let state = crate::persisted_state::restore(
            database,
            "Player Stats",
            database.load_broadcast_surface(SURFACE_ID)?,
            || {
                Ok(PlayerStatsSettings {
                    styling_game_id: None,
                    logo_asset_id: None,
                    show_background: true,
                    show_tournament_logo: true,
                    show_placement_logos: true,
                    show_sponsor_logo: true,
                    show_player_photo: true,
                    show_character: true,
                    updated_at: now_rfc3339()?,
                })
            },
            |settings: &mut PlayerStatsSettings| validate(settings),
        )?;
        let payload = serde_json::to_string(&state).map_err(|_| unavailable())?;
        database.save_broadcast_surface(SURFACE_ID, &payload, &state.updated_at)?;
        let (updates, _) = broadcast::channel(16);
        Ok(Self {
            state: RwLock::new(state),
            updates,
        })
    }

    pub fn current(&self) -> Result<Value, String> {
        let state = self.state.read().map_err(|_| unavailable())?;
        serde_json::to_value(&*state).map_err(|_| unavailable())
    }

    pub fn subscribe(&self) -> broadcast::Receiver<String> {
        self.updates.subscribe()
    }

    fn replace(
        &self,
        database: &Database,
        mut settings: PlayerStatsSettings,
    ) -> Result<Value, String> {
        validate(&settings)?;
        let mut current = self.state.write().map_err(|_| unavailable())?;
        crate::persisted_state::check_revision(&settings.updated_at, &current.updated_at)?;
        settings.updated_at = now_rfc3339()?;
        let payload = serde_json::to_string(&settings).map_err(|_| unavailable())?;
        let value = serde_json::to_value(&settings).map_err(|_| unavailable())?;
        database.save_broadcast_surface(SURFACE_ID, &payload, &settings.updated_at)?;
        *current = settings;
        let _ = self
            .updates
            .send(json!({ "event": "player-stats-settings", "payload": value }).to_string());
        Ok(value)
    }
}

fn default_true() -> bool {
    true
}
fn unavailable() -> String {
    "Player Stats settings are unavailable.".into()
}
fn validate(settings: &PlayerStatsSettings) -> Result<(), String> {
    if settings
        .logo_asset_id
        .as_deref()
        .is_some_and(|id| !crate::catalogs::valid_logo_id(id))
    {
        return Err("Choose a valid logo file.".into());
    }
    if settings
        .styling_game_id
        .as_deref()
        .is_some_and(|id| !crate::state::is_supported_game_id(id))
    {
        return Err("Choose a recognized Styling game profile.".into());
    }
    Ok(())
}

pub async fn current(State(runtime): State<Arc<RuntimeState>>) -> Response {
    match runtime.player_stats_settings.current() {
        Ok(settings) => secure_json(Json(settings)),
        Err(error) => state_result(Err(error)),
    }
}

pub async fn update(
    State(runtime): State<Arc<RuntimeState>>,
    headers: HeaderMap,
    Json(settings): Json<PlayerStatsSettings>,
) -> Response {
    if let Some(response) = reject_untrusted_mutation(&headers) {
        return response;
    }
    match runtime
        .player_stats_settings
        .replace(&runtime.database, settings)
    {
        Ok(settings) => secure_json(Json(settings)),
        Err(error) => state_result(Err(error)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn settings_persist_broadcast_and_reject_stale_writes_and_unsafe_logos() {
        let database = Database::open(std::path::Path::new(":memory:")).unwrap();
        let store = SettingsStore::load(&database).unwrap();
        let initial = store.current().unwrap();
        assert_eq!(initial["showBackground"], true);
        assert!(initial.get("logoAssetId").is_none());
        assert!(initial.get("stylingGameId").is_none());
        let mut updates = store.subscribe();
        let mut settings: PlayerStatsSettings = serde_json::from_value(initial.clone()).unwrap();
        settings.show_background = false;
        settings.show_sponsor_logo = false;
        settings.show_player_photo = false;
        settings.show_character = false;
        settings.show_placement_logos = false;
        settings.logo_asset_id = Some("local.png".into());
        settings.styling_game_id = Some("tekken-8".into());
        let saved = store.replace(&database, settings).unwrap();
        let message: Value = serde_json::from_str(&updates.try_recv().unwrap()).unwrap();
        assert_eq!(message["event"], "player-stats-settings");
        assert_eq!(message["payload"], saved);
        assert_eq!(
            SettingsStore::load(&database).unwrap().current().unwrap(),
            saved
        );
        let stale = serde_json::from_value(initial).unwrap();
        assert_eq!(
            store.replace(&database, stale).unwrap_err(),
            crate::persisted_state::STALE_SETTINGS
        );
        let mut invalid: PlayerStatsSettings = serde_json::from_value(saved.clone()).unwrap();
        invalid.logo_asset_id = Some("../outside.png".into());
        assert!(store.replace(&database, invalid.clone()).is_err());
        assert_eq!(store.current().unwrap(), saved);
        invalid.logo_asset_id = None;
        invalid.styling_game_id = Some("unknown".into());
        assert!(store.replace(&database, invalid.clone()).is_err());
        invalid.styling_game_id = None;
        invalid.show_tournament_logo = false;
        store.replace(&database, invalid).unwrap();
        let restored = SettingsStore::load(&database).unwrap().current().unwrap();
        assert!(restored.get("logoAssetId").is_none());
        assert!(restored.get("stylingGameId").is_none());
        assert_eq!(restored["showTournamentLogo"], false);
        assert!(crate::local_server::reject_untrusted_mutation(&HeaderMap::new()).is_some());
    }
}
