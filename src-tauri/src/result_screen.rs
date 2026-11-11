use crate::database::{Database, now_rfc3339};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::RwLock;
use tokio::sync::broadcast;

const SURFACE_ID: &str = "result-screen";

#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum ResultComposition {
    #[default]
    Classic,
    Victory,
    Spotlight,
    Highlight,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResultScreenState {
    #[serde(default)]
    pub composition: ResultComposition,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub styling_game_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub logo_asset_id: Option<String>,
    #[serde(default = "default_true")]
    pub show_background: bool,
    #[serde(default = "default_true")]
    pub show_identity: bool,
    #[serde(default = "default_true")]
    pub show_winner_title: bool,
    #[serde(default)]
    pub show_confetti: bool,
    pub show_tournament_logo: bool,
    pub show_player_photo: bool,
    pub show_sponsor_logo: bool,
    pub show_character: bool,
    #[serde(default)]
    pub artwork_framing: crate::artwork_framing::ArtworkFraming,
    pub updated_at: String,
}

pub struct ResultScreenStore {
    state: RwLock<ResultScreenState>,
    updates: broadcast::Sender<String>,
}

impl ResultScreenStore {
    pub fn load(database: &Database) -> Result<Self, String> {
        let state = crate::persisted_state::restore(
            database,
            "Winner/Champion",
            database.load_broadcast_surface(SURFACE_ID)?,
            || {
                Ok(ResultScreenState {
                    composition: ResultComposition::default(),
                    styling_game_id: None,
                    logo_asset_id: None,
                    show_background: true,
                    show_identity: true,
                    show_winner_title: true,
                    show_confetti: false,
                    show_tournament_logo: true,
                    show_player_photo: true,
                    show_sponsor_logo: true,
                    show_character: true,
                    artwork_framing: Default::default(),
                    updated_at: now_rfc3339()?,
                })
            },
            |state: &mut ResultScreenState| {
                if crate::artwork_framing::valid(&state.artwork_framing)
                    && state.styling_game_id.as_deref().is_none_or(crate::state::is_supported_game_id)
                    && state
                        .logo_asset_id
                        .as_deref()
                        .is_none_or(crate::catalogs::valid_logo_id)
                {
                    Ok(())
                } else {
                    Err("Invalid Winner/Champion settings.".to_owned())
                }
            },
        )?;
        let payload = serde_json::to_string(&state)
            .map_err(|_| "Unable to serialize Winner/Champion settings.".to_owned())?;
        database.save_broadcast_surface(SURFACE_ID, &payload, &state.updated_at)?;
        let (updates, _) = broadcast::channel(16);
        Ok(Self {
            state: RwLock::new(state),
            updates,
        })
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
        if !crate::artwork_framing::valid(&submitted.artwork_framing) {
            return Err("Invalid image framing.".into());
        }
        if submitted.styling_game_id.as_deref().is_some_and(|id| !crate::state::is_supported_game_id(id)) {
            return Err("Choose a recognized Styling game profile.".to_owned());
        }
        if submitted
            .logo_asset_id
            .as_deref()
            .is_some_and(|id| !crate::catalogs::valid_logo_id(id))
        {
            return Err("Choose a valid logo file.".to_owned());
        }
        let mut current = self.state.write()
            .map_err(|_| "Winner/Champion settings are unavailable.".to_owned())?;
        crate::persisted_state::check_revision(&submitted.updated_at, &current.updated_at)?;
        submitted.updated_at = now_rfc3339()?;
        let payload = serde_json::to_string(&submitted)
            .map_err(|_| "Unable to serialize Winner/Champion settings.".to_owned())?;
        database.save_broadcast_surface(SURFACE_ID, &payload, &submitted.updated_at)?;
        *current = submitted;
        let _ = self.updates.send(payload.clone());
        serde_json::from_str(&payload)
            .map_err(|_| "Unable to serialize Winner/Champion settings.".to_owned())
    }
}

fn default_true() -> bool {
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn logo_choices_persist_and_legacy_settings_inherit_without_accepting_paths() {
        let database = Database::open(std::path::Path::new(":memory:")).unwrap();
        let store = ResultScreenStore::load(&database).unwrap();
        let legacy = store.current().unwrap();
        assert_eq!(legacy["composition"], "classic");
        assert_eq!(legacy["showIdentity"], true);
        assert_eq!(legacy["showWinnerTitle"], true);
        assert_eq!(legacy["showConfetti"], false);
        assert!(legacy.get("logoAssetId").is_none());
        let mut old_payload = legacy.clone();
        old_payload.as_object_mut().unwrap().remove("artworkFraming");
        assert!(serde_json::from_value::<ResultScreenState>(old_payload.clone()).unwrap().artwork_framing.is_empty());
        old_payload.as_object_mut().unwrap().remove("composition");
        old_payload["showTextBackdrop"] = serde_json::json!(true);
        old_payload.as_object_mut().unwrap().remove("showIdentity");
        old_payload.as_object_mut().unwrap().remove("showWinnerTitle");
        old_payload.as_object_mut().unwrap().remove("showConfetti");
        let migrated: ResultScreenState = serde_json::from_value(old_payload.clone()).unwrap();
        assert!(migrated.show_identity);
        assert!(migrated.show_winner_title);
        assert!(!migrated.show_confetti);
        assert!(matches!(
            serde_json::from_value::<ResultScreenState>(old_payload)
                .unwrap()
                .composition,
            ResultComposition::Classic
        ));
        let mut invalid = legacy.clone();
        invalid["composition"] = serde_json::json!("unsupported");
        assert!(serde_json::from_value::<ResultScreenState>(invalid).is_err());
        let mut settings: ResultScreenState = serde_json::from_value(legacy).unwrap();
        settings.artwork_framing.insert("character-context".into(), crate::versus_screen::MediaTransform {
            x: -0.2, y: 0.1, scale: 5.0, flipped: false,
        });
        settings.artwork_framing.insert("photo-context".into(), crate::versus_screen::MediaTransform {
            x: 0.3, y: -0.1, scale: 3.0, flipped: true,
        });
        let mut bad_framing = settings.clone();
        bad_framing.artwork_framing.get_mut("photo-context").unwrap().x = 2.1;
        assert!(store.replace(&database, bad_framing).is_err());
        settings.composition = ResultComposition::Victory;
        settings.logo_asset_id = Some("local.png".into());
        let stale = settings.clone();
        let saved = store.replace(&database, settings.clone()).unwrap();
        assert_eq!(store.replace(&database, stale).unwrap_err(), crate::persisted_state::STALE_SETTINGS);
        assert_eq!(store.current().unwrap(), saved);
        settings = serde_json::from_value(saved).unwrap();
        let restored = ResultScreenStore::load(&database).unwrap().current().unwrap();
        assert_eq!(restored["artworkFraming"]["character-context"]["scale"], 5.0);
        assert_eq!(restored["artworkFraming"]["photo-context"]["scale"], 3.0);
        assert_eq!(
            ResultScreenStore::load(&database)
                .unwrap()
                .current()
                .unwrap()["logoAssetId"],
            "local.png"
        );
        assert_eq!(
            ResultScreenStore::load(&database)
                .unwrap()
                .current()
                .unwrap()["composition"],
            "victory"
        );
        settings.composition = ResultComposition::Spotlight;
        settings = serde_json::from_value(store.replace(&database, settings.clone()).unwrap()).unwrap();
        assert_eq!(
            ResultScreenStore::load(&database)
                .unwrap()
                .current()
                .unwrap()["composition"],
            "spotlight"
        );
        settings.composition = ResultComposition::Highlight;
        settings.show_confetti = true;
        settings.show_identity = false;
        settings.show_winner_title = false;
        settings.show_background = false;
        settings = serde_json::from_value(store.replace(&database, settings.clone()).unwrap()).unwrap();
        let highlight = ResultScreenStore::load(&database).unwrap().current().unwrap();
        assert_eq!(highlight["composition"], "highlight");
        assert_eq!(highlight["showConfetti"], true);
        assert_eq!(highlight["showIdentity"], false);
        assert_eq!(highlight["showWinnerTitle"], false);
        assert_eq!(highlight["showBackground"], false);
        settings.logo_asset_id = Some("../outside.png".into());
        assert!(store.replace(&database, settings.clone()).is_err());
        assert_eq!(store.current().unwrap()["logoAssetId"], "local.png");
        settings.logo_asset_id = None;
        store.replace(&database, settings).unwrap();
        assert!(
            ResultScreenStore::load(&database)
                .unwrap()
                .current()
                .unwrap()
                .get("logoAssetId")
                .is_none()
        );
    }
}
