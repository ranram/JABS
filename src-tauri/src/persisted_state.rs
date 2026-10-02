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
