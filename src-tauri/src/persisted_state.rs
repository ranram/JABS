use crate::database::Database;
use serde::de::DeserializeOwned;

pub const STALE_SETTINGS: &str = "These settings changed elsewhere. Reload them before saving again.";

pub fn restore<T: DeserializeOwned>(
    database: &Database,
    surface: &str,
    payload: Option<String>,
    defaults: impl FnOnce() -> Result<T, String>,
    migrate_and_validate: impl FnOnce(&mut T) -> Result<(), String>,
) -> Result<T, String> {
    let Some(payload) = payload else { return defaults(); };
    if let Ok(mut state) = serde_json::from_str::<T>(&payload) {
        if migrate_and_validate(&mut state).is_ok() {
            return Ok(state);
        }
    }
    // Preserve the original before a caller can persist replacement defaults.
    database.preserve_rejected_state(surface, &payload)?;
    defaults()
}

pub fn check_revision(submitted: &str, current: &str) -> Result<(), String> {
    if submitted != current { return Err(STALE_SETTINGS.to_owned()); }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        commentators::CommentatorStore, result_screen::ResultScreenStore,
        versus_screen::VersusScreenStore,
    };
    use serde_json::{Value, json};

    #[test]
    fn overlay_style_overrides_clear_persist_and_preserve_existing_choices() {
        let database = Database::open(std::path::Path::new(":memory:")).unwrap();
        let logos = std::env::temp_dir();
        let load = |surface| -> Value {
            match surface {
                "versus-screen" => VersusScreenStore::load(&database)
                    .unwrap()
                    .current()
                    .unwrap(),
                "result-screen" => ResultScreenStore::load(&database)
                    .unwrap()
                    .current()
                    .unwrap(),
                "commentators" => CommentatorStore::load(&database, &logos)
                    .unwrap()
                    .current()
                    .unwrap(),
                _ => unreachable!(),
            }
        };
        let save = |surface, value: Value| -> Result<Value, String> {
            match surface {
                "versus-screen" => VersusScreenStore::load(&database)
                    .unwrap()
                    .replace(&database, serde_json::from_value(value).unwrap()),
                "result-screen" => ResultScreenStore::load(&database)
                    .unwrap()
                    .replace(&database, serde_json::from_value(value).unwrap()),
                "commentators" => CommentatorStore::load(&database, &logos).unwrap().replace(
                    &database,
                    &logos,
                    serde_json::from_value(value).unwrap(),
                ),
                _ => unreachable!(),
            }
        };
        for surface in ["versus-screen", "result-screen", "commentators"] {
            let mut settings = load(surface);
            assert!(settings.get("stylingGameId").is_none());
            settings["stylingGameId"] = json!("tekken-8");
            save(surface, settings).unwrap();
            let mut settings = load(surface);
            assert_eq!(settings["stylingGameId"], "tekken-8");
            settings.as_object_mut().unwrap().remove("stylingGameId");
            save(surface, settings).unwrap();
            let mut settings = load(surface);
            assert!(settings.get("stylingGameId").is_none());
            settings["stylingGameId"] = json!("unknown-style");
            assert!(save(surface, settings).is_err());
            assert!(load(surface).get("stylingGameId").is_none());
        }
    }
}
