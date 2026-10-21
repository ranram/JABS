use crate::versus_screen::MediaTransform;
use crate::{database::Database, runtime::RuntimeState};
use axum::{
    Json, Router,
    extract::State,
    http::{HeaderMap, StatusCode},
    response::Response,
    routing::get,
};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::sync::{Arc, RwLock};
use tokio::sync::broadcast;

mod media;
#[cfg(test)]
mod tests;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Crop {
    pub x: f64,
    pub y: f64,
    pub zoom: f64,
}
impl Default for Crop {
    fn default() -> Self {
        Self {
            x: 0.5,
            y: 0.35,
            zoom: 1.0,
        }
    }
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Photo {
    pub source: String,
    pub asset_id: String,
    pub fingerprint: String,
    pub crop: Crop,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub placements: BTreeMap<String, SidePlacements>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SidePlacements {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub left: Option<MediaTransform>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub right: Option<MediaTransform>,
}
impl Photo {
    pub fn validate(&self) -> Result<(), String> {
        if !matches!(self.source.as_str(), "headshot" | "photo")
            || self.asset_id.len() > 255
            || !crate::catalogs::valid_media_id(&self.asset_id)
            || self.fingerprint.len() != 16
            || !self
                .fingerprint
                .bytes()
                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
            || !self.crop.x.is_finite()
            || !(0.0..=1.0).contains(&self.crop.x)
            || !self.crop.y.is_finite()
            || !(0.0..=1.0).contains(&self.crop.y)
            || !self.crop.zoom.is_finite()
            || !(1.0..=5.0).contains(&self.crop.zoom)
            || self.placements.len() > 15
            || self.placements.iter().any(|(game, sides)| {
                !crate::state::is_supported_game_id(game)
                    || [&sides.left, &sides.right]
                        .into_iter()
                        .flatten()
                        .any(|transform| !transform.is_valid())
            })
        {
            return Err("Choose a valid local headshot and crop.".into());
        }
        Ok(())
    }
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Settings {
    pub enabled: bool,
    #[serde(default)]
    pub logo_backdrop: bool,
    #[serde(default)]
    pub sponsor_backdrop: bool,
    pub updated_at: String,
}
impl Settings {
    fn validate(&self) -> Result<(), String> {
        if self.logo_backdrop && self.sponsor_backdrop {
            return Err("Choose only one logo backdrop.".into());
        }
        Ok(())
    }
}
pub struct PhotoStore {
    state: RwLock<Settings>,
    updates: broadcast::Sender<String>,
}
impl PhotoStore {
    pub fn load(database: &Database) -> Result<Self, String> {
        let state = crate::persisted_state::restore(
            database,
            "Scoreboard photos",
            database.load_broadcast_surface("scoreboard-photos")?,
            || {
                Ok(Settings {
                    enabled: false,
                    logo_backdrop: false,
                    sponsor_backdrop: false,
                    updated_at: crate::database::now_rfc3339()?,
                })
            },
            |state: &mut Settings| state.validate(),
        )?;
        Ok(Self {
            state: RwLock::new(state),
            updates: broadcast::channel(16).0,
        })
    }
    pub fn current(&self) -> Result<Settings, String> {
        self.state
            .read()
            .map(|s| s.clone())
            .map_err(|_| "Photo settings are unavailable.".into())
    }
    pub fn subscribe(&self) -> broadcast::Receiver<String> {
        self.updates.subscribe()
    }
    pub fn replace(&self, database: &Database, mut next: Settings) -> Result<Settings, String> {
        let mut current = self
            .state
            .write()
            .map_err(|_| "Photo settings are unavailable.")?;
        crate::persisted_state::check_revision(&next.updated_at, &current.updated_at)?;
        next.validate()?;
        next.updated_at = crate::state::next_timestamp(&current.updated_at)?;
        database.save_broadcast_surface(
            "scoreboard-photos",
            &serde_json::to_string(&next).map_err(|_| "Unable to save photo settings.")?,
            &next.updated_at,
        )?;
        *current = next.clone();
        let _ = self
            .updates
            .send(serde_json::json!({"event":"scoreboard-photos", "payload":next}).to_string());
        Ok(next)
    }
}
pub fn router() -> Router<Arc<RuntimeState>> {
    Router::new()
        .route("/api/scoreboard-photos", get(settings).put(update))
        .merge(media::router())
}
pub(super) fn respond<T: Serialize>(result: Result<T, String>) -> Response {
    match result {
        Ok(value) => crate::local_server::secure_json(Json(value)),
        Err(error) => crate::local_server::secure_json((
            StatusCode::UNPROCESSABLE_ENTITY,
            Json(serde_json::json!({"error":error})),
        )),
    }
}
async fn settings(State(runtime): State<Arc<RuntimeState>>) -> Response {
    respond(runtime.scoreboard_photos.current())
}
async fn update(
    State(runtime): State<Arc<RuntimeState>>,
    headers: HeaderMap,
    Json(next): Json<Settings>,
) -> Response {
    if let Some(response) = crate::local_server::reject_untrusted_mutation(&headers) {
        return response;
    }
    respond(runtime.scoreboard_photos.replace(&runtime.database, next))
}
