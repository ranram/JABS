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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub set_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub round: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub phase: Option<String>,
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tournament_name: Option<String>,
    pub player_one_placements: Vec<Placement>,
    pub player_two_placements: Vec<Placement>,
    pub head_to_head: Vec<HeadToHead>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
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

impl MediaTransform {
    pub fn is_valid(&self) -> bool {
        self.x.is_finite() && (-0.85..=0.85).contains(&self.x)
            && self.y.is_finite() && (-0.85..=0.85).contains(&self.y)
            && self.scale.is_finite() && (0.35..=2.5).contains(&self.scale)
    }
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub logo_asset_id: Option<String>,
    #[serde(default = "default_true")]
    pub show_background: bool,
    #[serde(default = "default_true")]
    pub show_match_backdrop: bool,
    pub show_tournament_logo: bool,
    pub show_sponsor_logos: bool,
    #[serde(default = "default_true")]
    pub show_head_to_head: bool,
    #[serde(default = "default_stat_rows")]
    pub stat_rows: Vec<String>,
    #[serde(default = "default_media_mode")]
    pub media_mode: String,
    #[serde(default = "default_media_placements")]
    pub media_placements: [PlayerMediaPlacement; 2],
    #[serde(skip_serializing_if = "Option::is_none")]
    pub history: Option<VersusHistory>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub history_match: Option<crate::versus_history::HistoryMatch>,
    #[serde(default)]
    pub history_loading: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub history_error: Option<String>,
    pub updated_at: String,
}

pub struct VersusScreenStore {
    state: RwLock<VersusScreenState>,
    updates: broadcast::Sender<String>,
}

impl VersusScreenStore {
    pub fn load(database: &Database) -> Result<Self, String> {
        let mut state = crate::persisted_state::restore(
            database, "Versus Screen", database.load_broadcast_surface(SURFACE_ID)?,
            || Ok(VersusScreenState {
                styling_game_id: default_styling_game_id(),
                logo_asset_id: None,
                show_background: true,
                show_match_backdrop: true,
                show_tournament_logo: true,
                show_sponsor_logos: true,
                show_head_to_head: true,
                stat_rows: default_stat_rows(),
                media_mode: default_media_mode(),
                media_placements: default_media_placements(),
                history: None,
                history_match: None,
                history_loading: false,
                history_error: None,
                updated_at: now_rfc3339()?,
            }),
            |state: &mut VersusScreenState| {
                if validate(state) { Ok(()) } else { Err("Invalid Versus settings.".to_owned()) }
            },
        )?;
        // History belongs to a live matchup, never to a new app session.
        state.history = None;
        state.history_match = None;
        state.history_loading = false;
        state.history_error = None;
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
        let mut current = self.state.write()
            .map_err(|_| "Versus Screen settings are unavailable.".to_owned())?;
        crate::persisted_state::check_revision(&submitted.updated_at, &current.updated_at)?;
        submitted.history = current.history.clone();
        submitted.history_match = current.history_match.clone();
        submitted.history_loading = current.history_loading;
        submitted.history_error = current.history_error.clone();
        self.save_settings(database, &mut current, submitted)
    }

    // A matchup change clears old rows; retrying the same matchup keeps its
    // last successful history visible while start.gg responds.
    pub fn begin_history(
        &self,
        database: &Database,
        context: Option<crate::versus_history::HistoryMatch>,
        clear: bool,
    ) -> Result<Value, String> {
        let mut current = self.state.write()
            .map_err(|_| "Versus Screen settings are unavailable.")?;
        if !clear && current.history_match == context
            && current.history_loading && current.history_error.is_none() {
            return serde_json::to_value(&*current)
                .map_err(|_| "Unable to serialize Versus Screen settings.".to_owned());
        }
        let mut next = current.clone();
        if clear || next.history_match != context {
            next.history = None;
        }
        next.history_match = context;
        next.history_loading = next.history_match.is_some();
        next.history_error = None;
        self.save(database, &mut current, next)
    }

    pub fn finish_history(
        &self,
        database: &Database,
        context: &crate::versus_history::HistoryMatch,
        result: &Result<VersusHistory, jabs_startgg_client::ApiError>,
    ) -> Result<Value, String> {
        let mut current = self.state.write()
            .map_err(|_| "Versus Screen settings are unavailable.")?;
        if current.history_match.as_ref() != Some(context) {
            return Err("The matchup changed.".into());
        }
        let mut next = current.clone();
        next.history_loading = false;
        match result {
            Ok(history) => {
                next.history = Some(history.clone());
                next.history_error = None;
            }
            Err(error) => next.history_error = Some(error.code.to_owned()),
        }
        self.save(database, &mut current, next)
    }

    pub fn reset_media_placements(&self, database: &Database) -> Result<Value, String> {
        let mut current = self.state.write()
            .map_err(|_| "Versus Screen settings are unavailable.".to_owned())?;
        let mut next = current.clone();
        next.media_placements = default_media_placements();
        self.save_settings(database, &mut current, next)
    }

    pub fn reset_media_for_match_change(
        &self,
        database: &Database,
        previous: &crate::state::SelectedSet,
        next: &crate::state::SelectedSet,
    ) -> Result<(), String> {
        if previous.set_id != next.set_id
            || previous.event_id != next.event_id
            || previous.videogame_id != next.videogame_id
            || previous.asset_catalog_slug.as_deref().unwrap_or(&previous.game_id)
                != next.asset_catalog_slug.as_deref().unwrap_or(&next.game_id)
        {
            self.reset_media_placements(database)?;
        }
        Ok(())
    }

    // Only settings edits change updated_at. A history refresh must not cause
    // a pending settings save to fail as outdated.
    fn save_settings(&self, database: &Database, current: &mut VersusScreenState, mut next: VersusScreenState) -> Result<Value, String> {
        next.updated_at = crate::state::next_timestamp(&current.updated_at)?;
        self.save(database, current, next)
    }

    fn save(&self, database: &Database, current: &mut VersusScreenState, next: VersusScreenState) -> Result<Value, String> {
        if !validate(&next) {
            return Err("Choose valid Versus Screen settings.".to_owned());
        }
        let payload = serde_json::to_string(&next)
            .map_err(|_| "Unable to serialize Versus Screen settings.".to_owned())?;
        database.save_broadcast_surface(SURFACE_ID, &payload, &next.updated_at)?;
        *current = next;
        let _ = self.updates.send(payload.clone());
        serde_json::from_str(&payload)
            .map_err(|_| "Unable to serialize Versus Screen settings.".to_owned())
    }

}

fn validate(state: &VersusScreenState) -> bool {
    crate::state::is_supported_game_id(&state.styling_game_id)
        && state.logo_asset_id.as_deref().is_none_or(crate::catalogs::valid_logo_id)
        && matches!(state.media_mode.as_str(), "character" | "photo" | "combined")
        && state.stat_rows.len() <= 4
        && state.stat_rows.iter().all(|row| ["age", "sponsor", "seed", "nickname"].contains(&row.as_str()))
        && state.stat_rows.iter().collect::<std::collections::HashSet<_>>().len() == state.stat_rows.len()
        && state.media_placements.iter().all(|placement| {
            [&placement.character, &placement.photo].iter().all(|transform| {
                transform.is_valid()
            })
        })
        && state.history.as_ref().is_none_or(|history| {
            history.player_one_placements.len() <= 3
                && history.player_two_placements.len() <= 3
                && history.head_to_head.len() <= 4
        })
}

fn default_styling_game_id() -> String { "street-fighter-6".to_owned() }
fn default_stat_rows() -> Vec<String> {
    ["age", "sponsor", "seed", "nickname"].map(str::to_owned).to_vec()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn history_and_settings_writes_preserve_each_other_and_reject_stale_revisions() {
        let database = Database::open(std::path::Path::new(":memory:")).unwrap();
        let store = VersusScreenStore::load(&database).unwrap();
        let stale = store.current().unwrap();
        assert_eq!(stale["showMatchBackdrop"], true);
        let mut legacy = stale.clone();
        legacy.as_object_mut().unwrap().remove("showMatchBackdrop");
        assert!(serde_json::from_value::<VersusScreenState>(legacy).unwrap().show_match_backdrop);
        let mut updates = store.subscribe();
        let history = VersusHistory {
            tournament_name: None,
            player_one_placements: vec![Placement { placement: 1, tournament_name: "Finals".into(), event_name: "Singles".into() }],
            player_two_placements: vec![],
            head_to_head: (0..4).map(|index| HeadToHead {
                set_id: Some(index.to_string()), phase: Some("Top 8".into()), round: Some("Grand Final".into()),
                tournament_name: "Major".into(), event_name: "Singles".into(),
                completed_at: Some(100 + index), player_one_score: 3, player_two_score: 1,
            }).collect(),
        };
        let context = crate::versus_history::HistoryMatch { set_id: Some("1".into()), event_id: Some("2".into()), game_id: "3".into(), player_one_id: "4".into(), player_two_id: "5".into() };
        store.begin_history(&database, Some(context.clone()), true).unwrap();
        updates.try_recv().unwrap();
        let with_history = store.finish_history(&database, &context, &Ok(history)).unwrap();
        assert_eq!(with_history["history"]["headToHead"].as_array().unwrap().len(), 4);
        let mut excessive: VersusHistory = serde_json::from_value(with_history["history"].clone()).unwrap();
        excessive.head_to_head.push(excessive.head_to_head[0].clone());
        assert!(store.finish_history(&database, &context, &Ok(excessive)).is_err());
        assert_eq!(stale["updatedAt"], with_history["updatedAt"]);
        let mut submitted: VersusScreenState = serde_json::from_value(stale.clone()).unwrap();
        submitted.show_background = false;
        submitted.show_match_backdrop = false;
        submitted.logo_asset_id = Some("local.png".to_owned());
        submitted.stat_rows = vec!["seed".into(), "age".into()];
        submitted.show_head_to_head = false;
        submitted.media_mode = "combined".into();
        submitted.media_placements[0].character.scale = 1.25;
        submitted.history = None;
        let saved = store.replace(&database, submitted).unwrap();
        assert_eq!(saved["history"], with_history["history"]);
        assert_eq!(store.replace(&database, serde_json::from_value(stale).unwrap()).unwrap_err(), crate::persisted_state::STALE_SETTINGS);
        let reset = store.reset_media_placements(&database).unwrap();
        assert_eq!(reset["showBackground"], false);
        assert_eq!(reset["showMatchBackdrop"], false);
        assert_eq!(reset["logoAssetId"], "local.png");
        assert_eq!(reset["history"], saved["history"]);
        assert_ne!(reset["updatedAt"], saved["updatedAt"]);
        let persisted: Value = serde_json::from_str(&database.load_broadcast_surface(SURFACE_ID).unwrap().unwrap()).unwrap();
        assert_eq!(persisted, reset);
        for expected in [&with_history, &saved, &reset] {
            assert_eq!(&serde_json::from_str::<Value>(&updates.try_recv().unwrap()).unwrap(), expected);
        }
        assert!(updates.try_recv().is_err());
        store.begin_history(&database, None, true).unwrap();
        assert!(store.finish_history(&database, &context, &Ok(VersusHistory { tournament_name: None, player_one_placements: vec![], player_two_placements: vec![], head_to_head: vec![] })).is_err());
        assert!(store.current().unwrap().get("history").is_none());
        let restored = VersusScreenStore::load(&database).unwrap().current().unwrap();
        assert!(restored.get("history").is_none());
        assert_eq!(restored["logoAssetId"], "local.png");
        assert_eq!(restored["showMatchBackdrop"], false);
        assert_eq!(restored["statRows"], serde_json::json!(["seed", "age"]));
        assert_eq!(restored["showHeadToHead"], false);
        assert_eq!(restored["mediaMode"], "combined");
        for rows in [vec!["age", "age"], vec!["unknown"], vec!["age", "seed", "sponsor", "nickname", "age"]] {
            let mut invalid: VersusScreenState = serde_json::from_value(store.current().unwrap()).unwrap();
            invalid.stat_rows = rows.into_iter().map(str::to_owned).collect();
            assert!(store.replace(&database, invalid).is_err());
        }
        let mut invalid: VersusScreenState = serde_json::from_value(store.current().unwrap()).unwrap();
        invalid.logo_asset_id = Some("../outside.png".into());
        assert!(store.replace(&database, invalid).is_err());
    }
}
fn default_media_mode() -> String { "character".to_owned() }
fn default_true() -> bool { true }
