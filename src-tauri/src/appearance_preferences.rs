use crate::{
    database::{now_rfc3339, Database},
    runtime::RuntimeState,
};
use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, RwLock};
use tokio::sync::broadcast;

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Appearance {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub winners_label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub losers_label: Option<String>,
    pub color_override: bool,
    pub primary_color: String,
    pub secondary_color: String,
    pub text_size: String,
    pub broadcast_language: String,
    pub entrance_animations: bool,
}
impl Default for Appearance {
    fn default() -> Self {
        Self {
            winners_label: None,
            losers_label: None,
            color_override: false,
            primary_color: "#f7b733".into(),
            secondary_color: "#ff554d".into(),
            text_size: "default".into(),
            broadcast_language: "follow".into(),
            entrance_animations: true,
        }
    }
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Preset {
    pub id: String,
    pub name: String,
    pub appearance: Appearance,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Preferences {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scoreboard_font: Option<String>,
    pub appearance: Appearance,
    pub presets: Vec<Preset>,
    pub operator_language: String,
    pub updated_at: String,
}

pub struct AppearanceStore {
    state: RwLock<Preferences>,
    updates: broadcast::Sender<String>,
}
impl AppearanceStore {
    pub fn load(database: &Database) -> Result<Self, String> {
        let state = crate::persisted_state::restore(
            database,
            "Appearance",
            database.load_broadcast_surface("appearance-preferences")?,
            || {
                Ok(Preferences {
                    scoreboard_font: None,
                    appearance: Appearance::default(),
                    presets: vec![],
                    operator_language: "en".into(),
                    updated_at: now_rfc3339()?,
                })
            },
            validate,
        )?;
        save(database, &state)?;
        Ok(Self {
            state: RwLock::new(state),
            updates: broadcast::channel(16).0,
        })
    }
    pub fn current(&self) -> Result<Preferences, String> {
        self.state
            .read()
            .map(|state| state.clone())
            .map_err(|_| "Appearance settings are unavailable.".into())
    }
    pub fn subscribe(&self) -> broadcast::Receiver<String> {
        self.updates.subscribe()
    }
    pub fn replace(
        &self,
        database: &Database,
        mut submitted: Preferences,
    ) -> Result<Preferences, String> {
        validate(&mut submitted)?;
        let mut state = self
            .state
            .write()
            .map_err(|_| "Appearance settings are unavailable.")?;
        crate::persisted_state::check_revision(&submitted.updated_at, &state.updated_at)?;
        submitted.updated_at = crate::state::next_timestamp(&state.updated_at)?;
        save(database, &submitted)?;
        *state = submitted.clone();
        let _ = self.updates.send(
            serde_json::json!({ "event": "appearance-preferences", "payload": submitted })
                .to_string(),
        );
        Ok(submitted)
    }
}
fn validate_text(value: &mut String) -> Result<(), String> {
    if value.encode_utf16().count() > 100 || value.chars().any(char::is_control) {
        return Err("Appearance labels must be at most 100 characters on one line.".into());
    }
    *value = crate::moderation::censor(Some(value.trim().to_owned())).unwrap_or_default();
    Ok(())
}
fn validate_appearance(value: &mut Appearance) -> Result<(), String> {
    for label in [&mut value.winners_label, &mut value.losers_label] {
        if let Some(text) = label {
            validate_text(text)?;
            if text.is_empty() {
                *label = None;
            }
        }
    }
    let valid_color = |color: &str| {
        color.len() == 7
            && color.starts_with('#')
            && color.as_bytes()[1..].iter().all(u8::is_ascii_hexdigit)
    };
    if !valid_color(&value.primary_color)
        || !valid_color(&value.secondary_color)
        || !matches!(value.text_size.as_str(), "default" | "large")
        || !matches!(
            value.broadcast_language.as_str(),
            "follow" | "en" | "es-419"
        )
    {
        return Err("Choose valid appearance colors, text size and language.".into());
    }
    Ok(())
}
fn validate(value: &mut Preferences) -> Result<(), String> {
    if value
        .scoreboard_font
        .as_deref()
        .is_some_and(|font| !crate::fonts::IDS.contains(&font))
    {
        return Err("Choose a bundled scoreboard font.".into());
    }
    validate_appearance(&mut value.appearance)?;
    if value.presets.len() > 20 || !matches!(value.operator_language.as_str(), "en" | "es-419") {
        return Err("Choose a supported language and keep at most 20 appearance presets.".into());
    }
    let mut ids = std::collections::HashSet::new();
    for preset in &mut value.presets {
        if preset.id.is_empty()
            || preset.id.len() > 64
            || !preset
                .id
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
            || !ids.insert(preset.id.clone())
        {
            return Err("Appearance preset identifiers must be unique and valid.".into());
        }
        validate_text(&mut preset.name)?;
        if preset.name.is_empty() {
            return Err("Give each appearance preset a name.".into());
        }
        validate_appearance(&mut preset.appearance)?;
    }
    Ok(())
}
fn save(database: &Database, value: &Preferences) -> Result<(), String> {
    let payload =
        serde_json::to_string(value).map_err(|_| "Could not save appearance settings.")?;
    database.save_broadcast_surface("appearance-preferences", &payload, &value.updated_at)
}
fn respond(result: Result<Preferences, String>) -> Response {
    match result {
        Ok(value) => crate::local_server::secure_json(Json(value)),
        Err(error) => crate::local_server::secure_json((
            StatusCode::UNPROCESSABLE_ENTITY,
            Json(serde_json::json!({ "error": error })),
        ))
        .into_response(),
    }
}
pub async fn current(State(runtime): State<Arc<RuntimeState>>) -> Response {
    respond(runtime.appearance.current())
}
pub async fn update(
    State(runtime): State<Arc<RuntimeState>>,
    headers: HeaderMap,
    Json(value): Json<Preferences>,
) -> Response {
    if let Some(response) = crate::local_server::reject_untrusted_mutation(&headers) {
        return response;
    }
    respond(runtime.appearance.replace(&runtime.database, value))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn appearance_presets_persist_validate_and_reject_stale_writes() {
        let db = Database::open(std::path::Path::new(":memory:")).unwrap();
        let store = AppearanceStore::load(&db).unwrap();
        let stale = store.current().unwrap();
        assert!(serde_json::to_value(&stale)
            .unwrap()
            .get("scoreboardFont")
            .is_none());
        let mut value = stale.clone();
        value.scoreboard_font = Some("oswald".into());
        value.appearance.losers_label = Some(" El Camino del Ninja ".into());
        value.appearance.color_override = true;
        value.presets.push(Preset {
            id: "weekly".into(),
            name: "Weekly".into(),
            appearance: value.appearance.clone(),
        });
        value.presets[0].appearance.losers_label = Some("Hell".into());
        let mut updates = store.subscribe();
        store.replace(&db, value).unwrap();
        assert!(updates
            .try_recv()
            .unwrap()
            .contains("appearance-preferences"));
        assert!(store.replace(&db, stale).is_err());
        let mut restored = AppearanceStore::load(&db).unwrap().current().unwrap();
        assert_eq!(restored.scoreboard_font.as_deref(), Some("oswald"));
        assert!(serde_json::to_value(&restored.presets[0])
            .unwrap()
            .get("scoreboardFont")
            .is_none());
        let mut invalid_font = restored.clone();
        invalid_font.scoreboard_font = Some("url(file:///tmp/font)".into());
        assert!(store.replace(&db, invalid_font).is_err());
        assert_eq!(
            restored.appearance.losers_label.as_deref(),
            Some("El Camino del Ninja")
        );
        assert_eq!(restored.presets.len(), 1);
        assert_eq!(
            restored.presets[0].appearance.losers_label.as_deref(),
            Some("Hell")
        );
        restored.presets[0].appearance.primary_color = "url(file:///tmp/image)".into();
        assert!(store.replace(&db, restored).is_err());
    }
}
