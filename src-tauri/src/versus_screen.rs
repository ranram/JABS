mod media;
mod layout_settings;
use layout_settings::{LayoutSettings, media_scope};
#[cfg(test)]
mod tests;
#[cfg(test)]
mod media_defaults_tests;

pub(crate) use media::{CharacterMediaDefault, PlayerMediaDefault};
use media::{MediaEdits, MediaLayerEdits, MediaMatch, default_media_placements, valid_media_placements};
pub use media::{MediaTransform, PlayerMediaPlacement};

use crate::database::{Database, now_rfc3339};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::RwLock;
use tokio::sync::broadcast;

const SURFACE_ID: &str = "versus-screen";
const STAT_ROWS: [&str; 6] = ["age", "sponsor", "seed", "nickname", "main", "pronouns"];

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

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VersusScreenState {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub styling_game_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub logo_asset_id: Option<String>,
    #[serde(default = "default_true")]
    pub show_background: bool,
    #[serde(default = "default_information_layout")]
    pub information_layout: String,
    #[serde(default = "default_true")]
    pub show_match_backdrop: bool,
    pub show_tournament_logo: bool,
    pub show_sponsor_logos: bool,
    #[serde(default = "default_true")]
    pub show_head_to_head: bool,
    #[serde(default = "default_true")]
    pub show_scrolling_rails: bool,
    #[serde(default = "default_stat_rows")]
    pub stat_rows: Vec<String>,
    #[serde(default = "default_media_mode")]
    pub media_mode: String,
    #[serde(default = "default_media_placements")]
    pub media_placements: [PlayerMediaPlacement; 2],
    #[serde(skip)]
    media_match: Option<MediaMatch>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub history: Option<VersusHistory>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub history_match: Option<crate::versus_history::HistoryMatch>,
    #[serde(default)]
    pub history_loading: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub history_error: Option<String>,
    pub updated_at: String,
    #[serde(default)]
    layout_settings: std::collections::BTreeMap<String, LayoutSettings>,
}

pub struct VersusScreenStore {
    state: RwLock<VersusScreenState>,
    updates: broadcast::Sender<String>,
}

impl VersusScreenStore {
    pub fn load(database: &Database) -> Result<Self, String> {
        let mut state = crate::persisted_state::restore(
            database,
            "Versus Screen",
            database.load_broadcast_surface(SURFACE_ID)?,
            default_state,
            |state: &mut VersusScreenState| {
                // Before layout isolation, Compact used Standard's framing records.
                if state.layout_settings.is_empty() && state.information_layout == "compact" {
                    state.layout_settings.insert("standard".into(), LayoutSettings::capture(state));
                    state.media_placements = default_media_placements();
                }
                if validate(state) {
                    Ok(())
                } else {
                    Err("Invalid Versus settings.".to_owned())
                }
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
        Ok(Self {
            state: RwLock::new(state),
            updates,
        })
    }

    pub fn current(&self) -> Result<Value, String> {
        self.state
            .read()
            .map_err(|_| "Versus Screen settings are unavailable.".to_owned())
            .and_then(|state| {
                serde_json::to_value(&*state)
                    .map_err(|_| "Unable to serialize Versus Screen settings.".to_owned())
            })
    }

    pub fn subscribe(&self) -> broadcast::Receiver<String> {
        self.updates.subscribe()
    }

    pub fn replace(
        &self,
        database: &Database,
        mut submitted: VersusScreenState,
    ) -> Result<Value, String> {
        let mut current = self
            .state
            .write()
            .map_err(|_| "Versus Screen settings are unavailable.".to_owned())?;
        crate::persisted_state::check_revision(&submitted.updated_at, &current.updated_at)?;
        submitted.layout_settings = current.layout_settings.clone();
        submitted.history = current.history.clone();
        submitted.history_match = current.history_match.clone();
        submitted.history_loading = current.history_loading;
        submitted.history_error = current.history_error.clone();
        submitted.media_match = current.media_match.clone();
        if submitted.information_layout != current.information_layout {
            let outgoing = LayoutSettings::capture(&current);
            if let Some(saved) = current.layout_settings.get(&submitted.information_layout) {
                saved.apply(&mut submitted);
            } else {
                // A new layout inherits display choices, with fresh artwork framing.
                outgoing.apply(&mut submitted);
                submitted.media_placements = default_media_placements();
            }
            if let Some(context) = &current.media_match {
                submitted.media_placements = context.restore_placements(database, &media_scope(&submitted))?;
                if let Some(saved) = current.layout_settings.get(&submitted.information_layout) {
                    saved.preserve_matching_framing(&mut submitted);
                }
            }
            submitted.layout_settings.insert(current.information_layout.clone(), outgoing);
            return self.save_settings(database, &mut current, submitted, None);
        }
        let framing_changed = std::array::from_fn(|side| {
            let next = &submitted.media_placements[side].character;
            let previous = &current.media_placements[side].character;
            next.x != previous.x || next.y != previous.y || next.scale != previous.scale
        });
        if let Some(context) = &submitted.media_match {
            context.mirror_character_edits(&mut submitted.media_placements, framing_changed);
        }
        let edited: [MediaLayerEdits; 2] = std::array::from_fn(|side| MediaLayerEdits {
            character: submitted.media_placements[side].character != current.media_placements[side].character,
            photo: submitted.media_placements[side].photo != current.media_placements[side].photo,
        });
        let scope = media_scope(&submitted);
        if submitted.media_mode != current.media_mode {
            let restored = match &submitted.media_match {
                Some(context) => context.restore_placements(database, &scope)?,
                None => default_media_placements(),
            };
            for (side, placement) in restored.into_iter().enumerate() {
                if !edited[side].character && !edited[side].photo {
                    submitted.media_placements[side] = placement;
                }
            }
        }
        let edits = match &submitted.media_match {
            Some(context) if edited.iter().any(|side| side.character || side.photo) => {
                Some(context.serialize_edits(
                    database,
                    &scope,
                    &submitted.media_placements,
                    edited,
                    framing_changed,
                )?)
            }
            _ => None,
        };
        self.save_settings(database, &mut current, submitted, edits.as_ref())
    }

    // A matchup change clears old rows; retrying the same matchup keeps its
    // last successful history visible while start.gg responds.
    pub fn begin_history(
        &self,
        database: &Database,
        context: Option<crate::versus_history::HistoryMatch>,
        clear: bool,
    ) -> Result<Value, String> {
        let mut current = self
            .state
            .write()
            .map_err(|_| "Versus Screen settings are unavailable.")?;
        if !clear
            && current.history_match == context
            && current.history_loading
            && current.history_error.is_none()
        {
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
        self.save(database, &mut current, next, None)
    }

    pub fn finish_history(
        &self,
        database: &Database,
        context: &crate::versus_history::HistoryMatch,
        result: &Result<VersusHistory, jabs_startgg_client::ApiError>,
    ) -> Result<Value, String> {
        let mut current = self
            .state
            .write()
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
        self.save(database, &mut current, next, None)
    }

    pub fn reset_media_placements(&self, database: &Database) -> Result<Value, String> {
        let mut current = self
            .state
            .write()
            .map_err(|_| "Versus Screen settings are unavailable.".to_owned())?;
        let mut next = current.clone();
        next.media_placements = default_media_placements();
        next.media_match = None;
        self.save_settings(database, &mut current, next, None)
    }

    pub fn restore_media_for_match_change(
        &self,
        database: &Database,
        previous_set: &crate::state::SelectedSet,
        selected_set: &crate::state::SelectedSet,
        artwork_directory: &std::path::Path,
        photo_directory: &std::path::Path,
    ) -> Result<(), String> {
        let mut current = self
            .state
            .write()
            .map_err(|_| "Versus Screen settings are unavailable.".to_owned())?;
        if current.media_match.is_some() && media::same_selection(previous_set, selected_set) {
            return Ok(());
        }
        let context =
            MediaMatch::resolve(database, artwork_directory, photo_directory, selected_set)?;
        let scope = media_scope(&current);
        let mut placements = context.restore_placements(database, &scope)?;
        let previous_context = match &current.media_match {
            Some(previous) => previous.clone(),
            None => MediaMatch::resolve(database, artwork_directory, photo_directory, previous_set)?,
        };
        if context.same_set(&previous_context) {
            for (side, placement) in placements.iter_mut().enumerate() {
                if !context.same_layout(&previous_context, side, &scope) {
                    continue;
                }
                let unchanged = context.unchanged_layers(&previous_context, side);
                if unchanged.character {
                    placement.character = current.media_placements[side].character.clone();
                }
                if unchanged.photo {
                    placement.photo = current.media_placements[side].photo.clone();
                }
            }
        }
        let mut next = current.clone();
        next.media_placements = placements;
        next.media_match = Some(context);
        self.save_settings(database, &mut current, next, None)
            .map(|_| ())
    }

    // Only settings edits change updated_at. A history refresh must not cause
    // a pending settings save to fail as outdated.
    fn save_settings(
        &self,
        database: &Database,
        current: &mut VersusScreenState,
        mut next: VersusScreenState,
        edits: Option<&MediaEdits>,
    ) -> Result<Value, String> {
        next.updated_at = crate::state::next_timestamp(&current.updated_at)?;
        self.save(database, current, next, edits)
    }

    fn save(
        &self,
        database: &Database,
        current: &mut VersusScreenState,
        next: VersusScreenState,
        edits: Option<&MediaEdits>,
    ) -> Result<Value, String> {
        if !validate(&next) {
            return Err("Choose valid Versus Screen settings.".to_owned());
        }
        let payload = serde_json::to_string(&next)
            .map_err(|_| "Unable to serialize Versus Screen settings.".to_owned())?;
        let match_media = edits
            .and_then(|edits| edits.set_media.as_ref())
            .map(|(id, payload)| (id.as_str(), payload.as_str()));
        let player_defaults = edits.map_or(&[][..], |edits| edits.player_defaults.as_slice());
        database.save_broadcast_surface_with_media(
            SURFACE_ID,
            &payload,
            &next.updated_at,
            match_media,
            player_defaults,
            edits.map_or(&[][..], |edits| edits.character_defaults.as_slice()),
        )?;
        *current = next;
        let _ = self.updates.send(payload.clone());
        serde_json::from_str(&payload)
            .map_err(|_| "Unable to serialize Versus Screen settings.".to_owned())
    }
}

fn validate(state: &VersusScreenState) -> bool {
    state.layout_settings.len() <= 2
        && state.layout_settings.iter().all(|(layout, settings)| {
            matches!(layout.as_str(), "standard" | "compact") && {
                let mut candidate = state.clone();
                candidate.layout_settings.clear();
                settings.apply(&mut candidate);
                validate_active(&candidate)
            }
        })
        && validate_active(state)
}

fn validate_active(state: &VersusScreenState) -> bool {
    state.styling_game_id.as_deref().is_none_or(crate::state::is_supported_game_id)
        && state
            .logo_asset_id
            .as_deref()
            .is_none_or(crate::catalogs::valid_logo_id)
        && matches!(
            state.media_mode.as_str(),
            "character" | "photo" | "combined"
        )
        && matches!(state.information_layout.as_str(), "standard" | "compact")
        && valid_stat_rows(&state.stat_rows)
        && valid_media_placements(&state.media_placements)
        && state.history.as_ref().is_none_or(|history| {
            history.player_one_placements.len() <= 3
                && history.player_two_placements.len() <= 3
                && history.head_to_head.len() <= 4
        })
}

fn valid_stat_rows(rows: &[String]) -> bool {
    rows.len() <= 4
        && rows.iter().all(|row| STAT_ROWS.contains(&row.as_str()))
        && rows.iter().collect::<std::collections::HashSet<_>>().len() == rows.len()
}

fn default_state() -> Result<VersusScreenState, String> {
    Ok(VersusScreenState {
        styling_game_id: None,
        logo_asset_id: None,
        show_background: true,
        information_layout: default_information_layout(),
        show_match_backdrop: true,
        show_tournament_logo: true,
        show_sponsor_logos: true,
        show_head_to_head: true,
        show_scrolling_rails: true,
        stat_rows: default_stat_rows(),
        media_mode: default_media_mode(),
        media_placements: default_media_placements(),
        media_match: None,
        history: None,
        history_match: None,
        history_loading: false,
        history_error: None,
        updated_at: now_rfc3339()?,
        layout_settings: Default::default(),
    })
}


fn default_stat_rows() -> Vec<String> {
    ["age", "sponsor", "seed", "nickname"].map(str::to_owned).to_vec()
}

fn default_information_layout() -> String {
    "standard".to_owned()
}

fn default_media_mode() -> String {
    "character".to_owned()
}

fn default_true() -> bool {
    true
}
