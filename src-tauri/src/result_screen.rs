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
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResultScreenState {
    #[serde(default)]
    pub composition: ResultComposition,
    #[serde(default = "default_styling_game_id")]
    pub styling_game_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub logo_asset_id: Option<String>,
    #[serde(default = "default_true")]
    pub show_background: bool,
    #[serde(default)]
    pub show_text_backdrop: bool,
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
        let state = crate::persisted_state::restore(
            database,
            "Winner/Champion",
            database.load_broadcast_surface(SURFACE_ID)?,
            || {
                Ok(ResultScreenState {
                    composition: ResultComposition::default(),
                    styling_game_id: default_styling_game_id(),
                    logo_asset_id: None,
                    show_background: true,
                    show_text_backdrop: false,
                    show_tournament_logo: true,
                    show_player_photo: true,
                    show_sponsor_logo: true,
                    show_character: true,
                    updated_at: now_rfc3339()?,
                })
            },
            |state: &mut ResultScreenState| {
                if crate::state::is_supported_game_id(&state.styling_game_id)
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
        if !crate::state::is_supported_game_id(&submitted.styling_game_id) {
            return Err("Choose a recognized Styling game profile.".to_owned());
        }
        if submitted
            .logo_asset_id
            .as_deref()
            .is_some_and(|id| !crate::catalogs::valid_logo_id(id))
        {
            return Err("Choose a valid logo file.".to_owned());
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

fn default_styling_game_id() -> String {
    "street-fighter-6".to_owned()
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
        assert_eq!(legacy["showTextBackdrop"], false);
        assert!(legacy.get("logoAssetId").is_none());
        let mut old_payload = legacy.clone();
        old_payload.as_object_mut().unwrap().remove("composition");
        old_payload.as_object_mut().unwrap().remove("showTextBackdrop");
        assert!(!serde_json::from_value::<ResultScreenState>(old_payload.clone()).unwrap().show_text_backdrop);
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
        settings.composition = ResultComposition::Victory;
        settings.show_text_backdrop = true;
        settings.logo_asset_id = Some("local.png".into());
        store.replace(&database, settings.clone()).unwrap();
        assert_eq!(ResultScreenStore::load(&database).unwrap().current().unwrap()["showTextBackdrop"], true);
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
        settings.show_text_backdrop = false;
        store.replace(&database, settings.clone()).unwrap();
        assert_eq!(ResultScreenStore::load(&database).unwrap().current().unwrap()["showTextBackdrop"], false);
        assert_eq!(
            ResultScreenStore::load(&database)
                .unwrap()
                .current()
                .unwrap()["composition"],
            "spotlight"
        );
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
