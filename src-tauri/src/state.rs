mod text_moderation;
mod bracket_status;
mod results;
mod players;
pub use results::ReportBaseline;

pub use text_moderation::censor_untrusted_selected_set;
use text_moderation::assert_safe_state;

use crate::{database::{Database, now_rfc3339}, moderation};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{collections::{HashMap, HashSet}, path::Path, sync::{LazyLock, RwLock, atomic::{AtomicU64, Ordering}}};
use time::{Duration, OffsetDateTime, format_description::well_known::Rfc3339};
use tokio::sync::broadcast;

const GAME_IDS: [&str; 15] = [
    "street-fighter-6",
    "tekken-8",
    "avatar-legends",
    "marvel-tokon",
    "guilty-gear-strive",
    "2xko",
    "blazblue-centralfiction",
    "fatal-fury-city-of-the-wolves",
    "granblue-fantasy-versus-rising",
    "king-of-fighters-xv",
    "melty-blood-type-lumina",
    "mortal-kombat-1",
    "ultimate-marvel-vs-capcom-3",
    "super-smash-bros-ultimate",
    "under-night-in-birth-ii-sys-celes",
];

static CHARACTER_TEAM_LIMITS: LazyLock<HashMap<String, usize>> = LazyLock::new(|| {
    serde_json::from_str(include_str!("../../src/shared/characterTeamPolicies.json"))
        .expect("shared character-team policies must be valid")
});

pub fn is_supported_game_id(game_id: &str) -> bool {
    GAME_IDS.contains(&game_id)
}

#[derive(Clone, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OverlayState {
    pub selected_set: SelectedSet,
}

#[derive(Clone, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SelectedSet {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub report_baseline: Option<ReportBaseline>,
    /// Confirmed W/L or DQ winner; recorded game scores remain unchanged.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reported_outcome: Option<ReportOutcome>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub set_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub event_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tournament_slug: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tournament_name: Option<String>,
    pub display_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub phase: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub phase_group: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub round: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub winners_side_entrant_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub station: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub state: Option<String>,
    /// True prevents scores retained after a bracket reset from deciding a new result.
    /// False follows a score edit/reset or confirmed report; None covers older/imported data.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub upstream_reset: Option<bool>,
    pub game_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub game_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub videogame_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub styling_game_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub custom_scoreboard_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub custom_scoreboard_revision: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub asset_catalog_slug: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub match_format: Option<String>,
    pub best_of: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub broadcast: Option<BroadcastPresentation>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub game_history: Option<Vec<GameResult>>,
    pub player_one: Player,
    pub player_two: Player,
    pub updated_at: String,
}

#[derive(Clone, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Player {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub local_player_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub player_photo_asset_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub portrait_asset_id: Option<String>,
    pub entrant_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub player_id: Option<String>,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prefix: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sponsor: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub x_handle: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub characters: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub character: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub character_asset_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub country: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub display_flag: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub state: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pronouns: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub seed: Option<u32>,
    pub score: u32,
}

#[derive(Clone, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BroadcastPresentation {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub seeds_enabled: Option<bool>,
    pub info_bar_enabled: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub info_left: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub info_right: Option<String>,
    pub logo_enabled: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub logo_asset_id: Option<String>,
}

#[derive(Clone, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameCharacterSelection {
    pub entrant_id: String,
    pub character: String,
}

#[derive(Clone, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameResult {
    pub winner_id: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub selections: Vec<GameCharacterSelection>,
}

pub struct OverlayStore {
    state: RwLock<OverlayState>,
    history_revision: AtomicU64,
    updates: broadcast::Sender<String>,
}

#[derive(Debug)]
pub enum UpdateSelectedSetError {
    Invalid(String),
    Conflict(String),
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ExhibitionGameSelection {
    pub game_id: String,
    pub game_name: String,
    pub videogame_id: String,
    pub asset_catalog_slug: String,
    pub updated_at: String,
}

#[derive(Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum ReportOutcomeKind {
    WinLoss,
    Disqualification,
}

#[derive(Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReportOutcome {
    pub kind: ReportOutcomeKind,
    pub winner_id: String,
}

pub struct ReportableResult {
    pub winner_id: String,
    pub winner_score: u32,
    pub loser_score: u32,
}

impl OverlayStore {
    pub fn load(database: &Database) -> Result<Self, String> {
        let state = crate::persisted_state::restore(
            database, "stream", database.load_overlay_state()?,
            || Ok(default_state()),
            |state: &mut OverlayState| {
                migrate_match_format(&mut state.selected_set);
                normalize_character_teams(&mut state.selected_set);
                validate_state(state)?;
                censor_untrusted_selected_set(&mut state.selected_set);
                Ok(())
            },
        )?;
        let payload = serde_json::to_string(&state)
            .map_err(|_| "Unable to serialize local stream state.".to_owned())?;
        database.save_overlay_state(&payload, &state.selected_set.updated_at)?;
        let (updates, _) = broadcast::channel(32);
        Ok(Self {
            state: RwLock::new(state),
            history_revision: AtomicU64::new(0),
            updates,
        })
    }

    pub fn current(&self) -> Result<Value, String> {
        let state = self.state.read()
            .map_err(|_| "Local stream state is unavailable.".to_owned())?;
        serde_json::to_value(&*state)
            .map_err(|_| "Unable to serialize local stream state.".to_owned())
    }

    pub fn subscribe(&self) -> broadcast::Receiver<String> {
        self.updates.subscribe()
    }

    pub fn selected_set(&self) -> Result<SelectedSet, String> {
        self.state.read()
            .map(|state| state.selected_set.clone())
            .map_err(|_| "Local stream state is unavailable.".to_owned())
    }

    // Score and artwork edits leave history requests running. A matchup change
    // makes older requests outdated, even after switching away and back to the same set.
    pub fn history_snapshot(&self) -> Result<(SelectedSet, u64), String> {
        let state = self.state.read().map_err(|_| "Local stream state is unavailable.")?;
        Ok((state.selected_set.clone(), self.history_revision.load(Ordering::Relaxed)))
    }

    pub fn with_history_revision<T>(
        &self,
        revision: u64,
        apply: impl FnOnce() -> Result<T, String>,
    ) -> Result<Option<T>, String> {
        let _state = self.state.read().map_err(|_| "Local stream state is unavailable.")?;
        if self.history_revision.load(Ordering::Relaxed) != revision {
            return Ok(None);
        }
        apply().map(Some)
    }

    fn record_matchup_change(&self, previous: &SelectedSet, next: &SelectedSet) {
        if crate::versus_history::HistoryMatch::from_set(previous)
            != crate::versus_history::HistoryMatch::from_set(next) {
            self.history_revision.fetch_add(1, Ordering::Relaxed);
        }
    }

    pub fn replace_selected_set(
        &self,
        database: &Database,
        logo_directory: &Path,
        game_asset_directory: &Path,
        selected_set: SelectedSet,
    ) -> Result<Value, String> {
        self.replace_selected_set_if_current(database, logo_directory, game_asset_directory, selected_set, None)
    }

    pub fn replace_selected_set_if_current(
        &self, database: &Database, logo_directory: &Path, game_asset_directory: &Path,
        mut selected_set: SelectedSet, expected: Option<&str>,
    ) -> Result<Value, String> {
        normalize_character_teams(&mut selected_set);
        let mut current = self.state.write()
            .map_err(|_| "Local stream state is unavailable.".to_owned())?;
        if expected.is_some_and(|version| version != current.selected_set.updated_at) {
            return Err("The live match changed while loading the queue. Review it before continuing.".into());
        }
        selected_set.updated_at = next_timestamp(&current.selected_set.updated_at)?;
        let mut next = OverlayState { selected_set };
        validate_state(&next)?;
        assert_safe_state(&next.selected_set)?;
        validate_characters(&next.selected_set, game_asset_directory)?;
        validate_logo(&next.selected_set, logo_directory)?;
        crate::catalogs::validate_player_location(&mut next.selected_set.player_one)?;
        crate::catalogs::validate_player_location(&mut next.selected_set.player_two)?;
        let payload = serde_json::to_string(&next)
            .map_err(|_| "Unable to serialize local stream state.".to_owned())?;
        persist_stream_state(database, &next, &payload)?;
        self.record_matchup_change(&current.selected_set, &next.selected_set);
        *current = next;
        drop(current);
        let _ = self.updates.send(payload.clone());
        serde_json::from_str(&payload)
            .map_err(|_| "Unable to serialize local stream state.".to_owned())
    }

    pub fn update_selected_set(
        &self,
        database: &Database,
        logo_directory: &Path,
        game_asset_directory: &Path,
        mut submitted: SelectedSet,
    ) -> Result<Value, UpdateSelectedSetError> {
        normalize_character_teams(&mut submitted);
        let mut current = self.state.write()
            .map_err(|_| UpdateSelectedSetError::Invalid("Local stream state is unavailable.".to_owned()))?;
        submitted.phase = current.selected_set.phase.clone();
        submitted.tournament_name = current.selected_set.tournament_name.clone();
        submitted.phase_group = current.selected_set.phase_group.clone();
        submitted.winners_side_entrant_id = current.selected_set.winners_side_entrant_id.clone();
        submitted.game_name = current.selected_set.game_name.clone();
        submitted.videogame_id = current.selected_set.videogame_id.clone();
        submitted.game_history = current.selected_set.game_history.clone();
        submitted.report_baseline = if submitted.set_id == current.selected_set.set_id {
            current.selected_set.report_baseline.clone()
        } else {
            None
        };
        if submitted.set_id == current.selected_set.set_id {
            if submitted.set_id.is_some() {
                submitted.state = current.selected_set.state.clone();
            }
            let scores_changed = [&submitted.player_one, &submitted.player_two]
                .iter()
                .any(|player| {
                    [&current.selected_set.player_one, &current.selected_set.player_two]
                        .iter()
                        .any(|previous| {
                            previous.entrant_id == player.entrant_id && previous.score != player.score
                        })
                });
            submitted.reported_outcome = if scores_changed {
                None
            } else {
                current.selected_set.reported_outcome.clone()
            };
            submitted.upstream_reset = if scores_changed {
                Some(false)
            } else {
                current.selected_set.upstream_reset
            };
        }
        if current.selected_set.set_id.is_some() {
            submitted.player_one.player_id = player_id_for_entrant(
                &current.selected_set,
                &submitted.player_one.entrant_id,
            );
            submitted.player_two.player_id = player_id_for_entrant(
                &current.selected_set,
                &submitted.player_two.entrant_id,
            );
        }
        for player in [&mut submitted.player_one, &mut submitted.player_two] {
            if let Some(local_id) = player.local_player_id.as_deref() {
                if database.library_player(local_id).map_err(UpdateSelectedSetError::Invalid)?.is_none() {
                    // Deleting a library record must not prevent editing the match already on stream.
                    player.local_player_id = None;
                } else {
                    database.library_resolve(Some(local_id), player.player_id.as_deref())
                        .map_err(UpdateSelectedSetError::Invalid)?;
                }
            }
        }
        validate_state(&OverlayState { selected_set: submitted.clone() })
            .map_err(UpdateSelectedSetError::Invalid)?;
        assert_safe_state(&submitted).map_err(UpdateSelectedSetError::Invalid)?;
        validate_characters(&submitted, game_asset_directory)
            .map_err(UpdateSelectedSetError::Invalid)?;
        validate_logo(&submitted, logo_directory).map_err(UpdateSelectedSetError::Invalid)?;
        crate::catalogs::validate_player_location(&mut submitted.player_one)
            .map_err(UpdateSelectedSetError::Invalid)?;
        crate::catalogs::validate_player_location(&mut submitted.player_two)
            .map_err(UpdateSelectedSetError::Invalid)?;
        if submitted.updated_at != current.selected_set.updated_at {
            let mut replay = submitted;
            replay.updated_at = current.selected_set.updated_at.clone();
            if replay == current.selected_set {
                return serde_json::to_value(&*current)
                    .map_err(|_| UpdateSelectedSetError::Invalid("Unable to serialize local stream state.".to_owned()));
            }
            return Err(UpdateSelectedSetError::Conflict(
                "Stream state changed on another control before this draft was saved. Review the refreshed live scores and player order, then save again.".to_owned()
            ));
        }
        submitted.updated_at = next_timestamp(&current.selected_set.updated_at)
            .map_err(UpdateSelectedSetError::Invalid)?;
        let next = OverlayState { selected_set: submitted };
        validate_state(&next).map_err(UpdateSelectedSetError::Invalid)?;
        let payload = serde_json::to_string(&next)
            .map_err(|_| UpdateSelectedSetError::Invalid("Unable to serialize local stream state.".to_owned()))?;
        persist_stream_state(database, &next, &payload)
            .map_err(UpdateSelectedSetError::Invalid)?;
        self.record_matchup_change(&current.selected_set, &next.selected_set);
        *current = next;
        drop(current);
        let _ = self.updates.send(payload.clone());
        serde_json::from_str(&payload)
            .map_err(|_| UpdateSelectedSetError::Invalid("Unable to serialize local stream state.".to_owned()))
    }

    pub fn select_exhibition_game(
        &self,
        database: &Database,
        selection: ExhibitionGameSelection,
    ) -> Result<Value, UpdateSelectedSetError> {
        let invalid = UpdateSelectedSetError::Invalid;
        let mut current = self
            .state
            .write()
            .map_err(|_| invalid("Local stream state is unavailable.".to_owned()))?;
        if current.selected_set.set_id.is_some()
            || current.selected_set.event_id.is_some()
            || current.selected_set.tournament_slug.is_some()
        {
            return Err(invalid(
                "Unload the tournament before choosing an exhibition game.".to_owned(),
            ));
        }
        if selection.updated_at != current.selected_set.updated_at {
            return Err(UpdateSelectedSetError::Conflict(
                "The stream match changed while you were choosing a game. Select the game again.".to_owned()
            ));
        }
        if selection.game_name.trim().is_empty()
            || selection.game_name.len() > 180
            || selection.videogame_id.is_empty()
            || selection.videogame_id.len() > 20
            || !selection
                .videogame_id
                .bytes()
                .all(|byte| byte.is_ascii_digit())
        {
            return Err(invalid("Choose a valid exhibition game.".to_owned()));
        }
        moderation::assert_safe(&[("Game name", Some(selection.game_name.as_str()))])
            .map_err(invalid)?;
        let mut next = current.clone();
        let selected = &mut next.selected_set;
        selected.game_id = selection.game_id;
        selected.game_name = Some(selection.game_name.trim().to_owned());
        selected.videogame_id = Some(selection.videogame_id);
        selected.asset_catalog_slug = Some(selection.asset_catalog_slug);
        if selected.custom_scoreboard_id.is_none() {
            selected.styling_game_id = Some(selected.game_id.clone());
        }
        // Keep the players and broadcast settings when changing exhibition games.
        // Reset gameplay and old artwork before loading the new game's library defaults.
        for player in [&mut selected.player_one, &mut selected.player_two] {
            player.score = 0;
            player.characters.clear();
            player.character = None;
            player.character_asset_id = None;
            player.portrait_asset_id = None;
        }
        crate::player_library::startgg::fill_defaults(database, selected).map_err(invalid)?;
        normalize_character_teams(selected);
        assert_safe_state(selected).map_err(invalid)?;
        selected.game_history = Some(Vec::new());
        selected.updated_at = next_timestamp(&current.selected_set.updated_at).map_err(invalid)?;
        validate_state(&next).map_err(invalid)?;
        let payload = serde_json::to_string(&next)
            .map_err(|_| invalid("Unable to serialize local stream state.".to_owned()))?;
        persist_stream_state(database, &next, &payload).map_err(invalid)?;
        self.record_matchup_change(&current.selected_set, &next.selected_set);
        *current = next;
        drop(current);
        let _ = self.updates.send(payload.clone());
        serde_json::from_str(&payload)
            .map_err(|_| invalid("Unable to serialize local stream state.".to_owned()))
    }

    pub fn clear_selected_set(&self, database: &Database) -> Result<Value, String> {
        let mut current = self.state.write()
            .map_err(|_| "Local stream state is unavailable.".to_owned())?;
        let mut next = default_state();
        next.selected_set.updated_at = next_timestamp(&current.selected_set.updated_at)?;
        let payload = serde_json::to_string(&next)
            .map_err(|_| "Unable to serialize local stream state.".to_owned())?;
        persist_stream_state(database, &next, &payload)?;
        self.record_matchup_change(&current.selected_set, &next.selected_set);
        *current = next;
        drop(current);
        let _ = self.updates.send(payload.clone());
        serde_json::from_str(&payload)
            .map_err(|_| "Unable to serialize local stream state.".to_owned())
    }

    pub fn set_score(&self, database: &Database, side: &str, requested_score: u32) -> Result<Value, String> {
        self.mutate(database, |selected_set| {
            let selections = recorded_character_selections(selected_set);
            let (winner_id, previous_score, other_score) = match side {
                "one" => (
                    selected_set.player_one.entrant_id.clone(),
                    selected_set.player_one.score,
                    selected_set.player_two.score,
                ),
                "two" => (
                    selected_set.player_two.entrant_id.clone(),
                    selected_set.player_two.score,
                    selected_set.player_one.score,
                ),
                _ => return Err("Choose player side one or two.".to_owned()),
            };
            // Corrections remain possible after deuce changes the target.
            let limit = if requested_score > previous_score {
                player_score_limit(selected_set, other_score).max(previous_score)
            } else {
                score_limit(selected_set)
            };
            let score = requested_score.min(limit);
            if score != previous_score {
                selected_set.reported_outcome = None;
                selected_set.upstream_reset = Some(false);
            }
            update_history(
                &mut selected_set.game_history,
                &winner_id,
                previous_score,
                score,
                other_score,
                &selections,
            );
            match side {
                "one" => selected_set.player_one.score = score,
                "two" => selected_set.player_two.score = score,
                _ => unreachable!(),
            }
            Ok(())
        })
    }

    pub fn reset_scores(&self, database: &Database) -> Result<Value, String> {
        self.mutate(database, |selected_set| {
            selected_set.player_one.score = 0;
            selected_set.player_two.score = 0;
            selected_set.game_history = Some(Vec::new());
            selected_set.reported_outcome = None;
            selected_set.upstream_reset = Some(false);
            Ok(())
        })
    }

    pub fn swap_players(&self, database: &Database) -> Result<Value, String> {
        self.mutate(database, |selected_set| {
            let generated_name = format!(
                "{} vs {}",
                selected_set.player_one.name,
                selected_set.player_two.name,
            );
            if selected_set.display_name == generated_name {
                selected_set.display_name = format!(
                    "{} vs {}",
                    selected_set.player_two.name,
                    selected_set.player_one.name,
                );
            }
            std::mem::swap(&mut selected_set.player_one, &mut selected_set.player_two);
            Ok(())
        })
    }

    pub fn mark_reported(
        &self,
        database: &Database,
        set_id: &str,
        reported_state: &str,
        outcome: Option<ReportOutcome>,
    ) -> Result<Value, String> {
        self.mutate(database, |selected_set| {
            if selected_set.set_id.as_deref() != Some(set_id) {
                return Err("The active stream set changed after start.gg accepted the report.".to_owned());
            }
            selected_set.state = Some(reported_state.to_owned());
            selected_set.reported_outcome = outcome;
            selected_set.upstream_reset = Some(false);
            Ok(())
        })
    }

    fn mutate(
        &self,
        database: &Database,
        mutation: impl FnOnce(&mut SelectedSet) -> Result<(), String>,
    ) -> Result<Value, String> {
        let mut current = self.state.write()
            .map_err(|_| "Local stream state is unavailable.".to_owned())?;
        let mut next = current.clone();
        mutation(&mut next.selected_set)?;
        next.selected_set.updated_at = next_timestamp(&current.selected_set.updated_at)?;
        validate_state(&next)?;
        let payload = serde_json::to_string(&next)
            .map_err(|_| "Unable to serialize local stream state.".to_owned())?;
        persist_stream_state(database, &next, &payload)?;
        self.record_matchup_change(&current.selected_set, &next.selected_set);
        *current = next;
        drop(current);
        let _ = self.updates.send(payload.clone());
        serde_json::from_str(&payload)
            .map_err(|_| "Unable to serialize local stream state.".to_owned())
    }
}

fn persist_stream_state(
    database: &Database,
    state: &OverlayState,
    state_payload: &str,
) -> Result<(), String> {
    let selected_payload = state.selected_set.set_id.as_ref().map(|_| {
        serde_json::to_string(&state.selected_set)
            .map_err(|_| "Unable to serialize saved set details.".to_owned())
    }).transpose()?;
    let set_override = state.selected_set.set_id.as_deref().zip(selected_payload.as_deref());
    database.save_stream_state(
        state_payload,
        &state.selected_set.updated_at,
        set_override,
    )
}

fn default_state() -> OverlayState {
    OverlayState {
        selected_set: SelectedSet {
            report_baseline: None,
            reported_outcome: None,
            upstream_reset: None,
            set_id: None,
            event_id: None,
            tournament_slug: None,
            tournament_name: None,
            display_name: "Waiting for set".to_owned(),
            phase: None,
            phase_group: None,
            round: None,
            winners_side_entrant_id: None,
            station: None,
            state: None,
            game_id: "street-fighter-6".to_owned(),
            game_name: None,
            videogame_id: None,
            styling_game_id: Some("street-fighter-6".to_owned()),
            custom_scoreboard_id: None,
            custom_scoreboard_revision: None,
            asset_catalog_slug: None,
            match_format: Some("best-of".to_owned()),
            best_of: 3,
            broadcast: Some(BroadcastPresentation {
                seeds_enabled: None,
                info_bar_enabled: false,
                info_left: None,
                info_right: None,
                logo_enabled: false,
                logo_asset_id: None,
            }),
            game_history: Some(Vec::new()),
            player_one: Player {
                local_player_id: None, player_photo_asset_id: None, portrait_asset_id: None,
                entrant_id: "p1".to_owned(),
                player_id: None,
                name: "Player 1".to_owned(),
                prefix: None,
                sponsor: None,
                x_handle: None,
                characters: Vec::new(),
                character: None,
                character_asset_id: None,
                country: None,
                display_flag: None,
                state: None,
                pronouns: None,
                seed: None,
                score: 0,
            },
            player_two: Player {
                local_player_id: None, player_photo_asset_id: None, portrait_asset_id: None,
                entrant_id: "p2".to_owned(),
                player_id: None,
                name: "Player 2".to_owned(),
                prefix: None,
                sponsor: None,
                x_handle: None,
                characters: Vec::new(),
                character: None,
                character_asset_id: None,
                country: None,
                display_flag: None,
                state: None,
                pronouns: None,
                seed: None,
                score: 0,
            },
            updated_at: now_rfc3339().unwrap_or_else(|_| "2026-08-12T00:00:00Z".to_owned()),
        },
    }
}

fn validate_state(state: &OverlayState) -> Result<(), String> {
    let selected_set = &state.selected_set;
    if selected_set.reported_outcome.as_ref().is_some_and(|outcome| {
        outcome.winner_id != selected_set.player_one.entrant_id
            && outcome.winner_id != selected_set.player_two.entrant_id
    }) {
        return Err("Choose the winning entrant.".to_owned());
    }
    required(&selected_set.display_name, "Display name")?;
    required(&selected_set.player_one.entrant_id, "Player one entrant ID")?;
    required(&selected_set.player_two.entrant_id, "Player two entrant ID")?;
    required(&selected_set.player_one.name, "Player one name")?;
    required(&selected_set.player_two.name, "Player two name")?;
    if [selected_set.player_one.seed, selected_set.player_two.seed]
        .into_iter()
        .flatten()
        .any(|seed| seed == 0)
    {
        return Err("Player seed must be a positive integer.".to_owned());
    }
    if [&selected_set.player_one, &selected_set.player_two]
        .into_iter()
        .filter_map(|player| player.character_asset_id.as_deref())
        .any(|asset_id| {
            asset_id.is_empty()
                || asset_id.len() > 255
                || asset_id.contains('/')
                || asset_id.contains('\\')
        })
    {
        return Err("Choose a valid local character outfit.".to_owned());
    }
    if !is_supported_game_id(&selected_set.game_id) {
        return Err("Choose a recognized game profile.".to_owned());
    }
    if selected_set.styling_game_id.as_deref().is_some_and(|game_id| {
        !is_supported_game_id(game_id)
    }) {
        return Err("Choose a recognized Styling game profile.".to_owned());
    }
    if selected_set.custom_scoreboard_id.as_deref().is_some_and(|id| {
        !crate::custom_scoreboards::valid_id(id)
    }) {
        return Err("Choose a valid custom scoreboard.".to_owned());
    }
    if selected_set.custom_scoreboard_revision.as_deref().is_some_and(|revision| {
        revision.trim().is_empty() || revision.len() > 64
    }) {
        return Err("Choose a valid custom scoreboard revision.".to_owned());
    }
    if selected_set.asset_catalog_slug.as_deref().is_some_and(|slug| {
        !crate::catalogs::valid_game_asset_catalog_slug(slug)
    }) {
        return Err("Choose a valid local game asset catalog.".to_owned());
    }
    if !matches!(selected_set.best_of, 3 | 5 | 9 | 13 | 19) {
        return Err("Choose a supported match length.".to_owned());
    }
    if !matches!(
        selected_set.match_format.as_deref(),
        None | Some("best-of") | Some("first-to") | Some("topanga")
    ) {
        return Err("Choose a supported match format.".to_owned());
    }
    if matches!(selected_set.match_format.as_deref(), None | Some("best-of"))
        && !matches!(selected_set.best_of, 3 | 5)
    {
        return Err("Best-of must be 3 or 5.".to_owned());
    }
    if selected_set.match_format.as_deref() == Some("topanga")
        && (selected_set.best_of != 13
            || selected_set.set_id.is_some()
            || selected_set.event_id.is_some()
            || selected_set.tournament_slug.is_some())
    {
        return Err("Topanga Rules are for exhibitions: first to 7, win by two, up to 10.".to_owned());
    }
    if selected_set.winners_side_entrant_id.as_ref().is_some_and(|entrant_id| {
        entrant_id != &selected_set.player_one.entrant_id
            && entrant_id != &selected_set.player_two.entrant_id
    }) {
        return Err("The winners-side entrant must be one of the selected set entrants.".to_owned());
    }
    let limit = score_limit(selected_set);
    if selected_set.player_one.score > limit || selected_set.player_two.score > limit {
        return Err("Score exceeds the selected match length.".to_owned());
    }
    OffsetDateTime::parse(&selected_set.updated_at, &Rfc3339)
        .map_err(|_| "State timestamp must be canonical RFC 3339.".to_owned())?;
    if let Some(history) = &selected_set.game_history {
        let counts = history.iter().fold(HashMap::<&str, u32>::new(), |mut counts, game| {
            *counts.entry(game.winner_id.as_str()).or_default() += 1;
            counts
        });
        if counts.get(selected_set.player_one.entrant_id.as_str()).copied().unwrap_or(0)
            != selected_set.player_one.score
            || counts.get(selected_set.player_two.entrant_id.as_str()).copied().unwrap_or(0)
                != selected_set.player_two.score
            || counts.len() > 2
        {
            return Err("Recorded game history must match both player scores.".to_owned());
        }
        for game in history {
            if game.selections.len() > 8 {
                return Err("A recorded game has too many character selections.".to_owned());
            }
            for selection in &game.selections {
                if selection.entrant_id != selected_set.player_one.entrant_id
                    && selection.entrant_id != selected_set.player_two.entrant_id
                {
                    return Err("Recorded character selections must belong to a set entrant.".to_owned());
                }
                let character = selection.character.trim();
                if character.is_empty() || character.chars().count() > 100 {
                    return Err("Recorded character selections must use a valid character name.".to_owned());
                }
            }
        }
    }
    Ok(())
}

pub fn migrate_match_format(selected_set: &mut SelectedSet) {
    if selected_set.best_of == 1 {
        selected_set.best_of = 3;
    }
    if selected_set.match_format.is_none() {
        selected_set.match_format = Some("best-of".to_owned());
    }
    if selected_set.styling_game_id.is_none() {
        selected_set.styling_game_id = Some(selected_set.game_id.clone());
    }
}

pub fn is_game_id(value: &str) -> bool {
    GAME_IDS.contains(&value)
}

pub fn validate_selected_set(selected_set: &SelectedSet) -> Result<(), String> {
    validate_state(&OverlayState { selected_set: selected_set.clone() })
}

pub fn report_readiness(
    selected_set: &SelectedSet,
    outcome: Option<&ReportOutcome>,
) -> Result<ReportableResult, String> {
    if selected_set.upstream_reset == Some(true) && outcome.is_none() {
        return Err("Reset or update the local score before reporting this result.".to_owned());
    }
    if selected_set.state.as_deref() == Some("3") {
        return Err("This set is already marked complete on start.gg.".to_owned());
    }
    if selected_set.set_id.is_none() {
        return Err("Load a start.gg set before reporting a result.".to_owned());
    }
    if matches!(
        selected_set.match_format.as_deref(),
        Some("first-to") | Some("topanga")
    ) {
        return Err("Exhibition scores stay in JABS and cannot be reported to start.gg.".to_owned());
    }
    required(&selected_set.player_one.entrant_id, "Player one entrant ID")?;
    required(&selected_set.player_two.entrant_id, "Player two entrant ID")?;
    if let Some(outcome) = outcome {
        validate_selected_set(selected_set)?;
        let (winner, loser) = if outcome.winner_id == selected_set.player_one.entrant_id {
            (&selected_set.player_one, &selected_set.player_two)
        } else if outcome.winner_id == selected_set.player_two.entrant_id {
            (&selected_set.player_two, &selected_set.player_one)
        } else {
            return Err("Choose the winning entrant.".to_owned());
        };
        return Ok(ReportableResult {
            winner_id: winner.entrant_id.clone(),
            winner_score: winner.score,
            loser_score: loser.score,
        });
    }
    let target = score_limit(selected_set);
    let player_one_won = selected_set.player_one.score == target
        && selected_set.player_two.score < target;
    let player_two_won = selected_set.player_two.score == target
        && selected_set.player_one.score < target;
    if !player_one_won && !player_two_won {
        return Err(format!(
            "Complete the local score first. This best-of-{} ends at {target} wins.",
            selected_set.best_of
        ));
    }
    validate_state(&OverlayState { selected_set: selected_set.clone() })?;
    let (winner, loser) = if player_one_won {
        (&selected_set.player_one, &selected_set.player_two)
    } else {
        (&selected_set.player_two, &selected_set.player_one)
    };
    Ok(ReportableResult {
        winner_id: winner.entrant_id.clone(),
        winner_score: winner.score,
        loser_score: loser.score,
    })
}

fn validate_characters(
    selected_set: &SelectedSet,
    game_asset_directory: &Path,
) -> Result<(), String> {
    let catalog_slug = selected_set
        .asset_catalog_slug
        .as_deref()
        .unwrap_or(&selected_set.game_id);
    let maximum = max_characters_for_game(&selected_set.game_id);
    for player in [&selected_set.player_one, &selected_set.player_two] {
        if player.characters.len() > maximum {
            return Err(format!(
                "This game supports at most {maximum} selected characters per player."
            ));
        }
        for character in &player.characters {
            if !crate::catalogs::is_character_for_game(catalog_slug, character)
                && !crate::catalogs::has_game_character_asset(
                    game_asset_directory,
                    catalog_slug,
                    character,
                )
                && crate::catalogs::canonical_character_for_catalog(
                    game_asset_directory,
                    catalog_slug,
                    character,
                )
                .as_deref()
                    != Some(character.as_str())
            {
                return Err("Choose a character from this event’s local game catalog.".to_owned());
            }
        }
    }
    Ok(())
}

fn normalize_character_teams(selected_set: &mut SelectedSet) {
    for player in [&mut selected_set.player_one, &mut selected_set.player_two] {
        if player.characters.is_empty() {
            player.characters.extend(player.character.clone());
        }
        let mut seen = HashSet::new();
        player.characters.retain(|character| {
            !character.trim().is_empty() && seen.insert(character.clone())
        });
        player.character = player.characters.first().cloned();
    }
}

pub(crate) fn max_characters_for_game(game_id: &str) -> usize {
    CHARACTER_TEAM_LIMITS.get(game_id).copied().unwrap_or(1)
}

fn player_id_for_entrant(selected_set: &SelectedSet, entrant_id: &str) -> Option<String> {
    [&selected_set.player_one, &selected_set.player_two]
        .into_iter()
        .find(|player| player.entrant_id == entrant_id)
        .and_then(|player| player.player_id.clone())
}

fn validate_logo(selected_set: &SelectedSet, logo_directory: &Path) -> Result<(), String> {
    let Some(broadcast) = selected_set.broadcast.as_ref() else { return Ok(()) };
    if broadcast.logo_enabled && broadcast.logo_asset_id.is_none() {
        return Err("Choose a local logo before enabling it on the overlay.".to_owned());
    }
    if let Some(asset_id) = broadcast.logo_asset_id.as_deref() {
        if !crate::catalogs::has_logo(logo_directory, asset_id) {
            return Err("Choose a logo from JABS’s local logo catalog.".to_owned());
        }
    }
    Ok(())
}

fn required(value: &str, label: &str) -> Result<(), String> {
    if value.trim().is_empty() {
        Err(format!("{label} cannot be empty."))
    } else {
        Ok(())
    }
}

fn score_limit(selected_set: &SelectedSet) -> u32 {
    if selected_set.match_format.as_deref() == Some("topanga") {
        10
    } else {
        selected_set.best_of / 2 + 1
    }
}

fn player_score_limit(selected_set: &SelectedSet, other_score: u32) -> u32 {
    if selected_set.match_format.as_deref() == Some("topanga") {
        // Start at seven; deuce requires two clear wins until the ten-win cap.
        (other_score + 2).clamp(7, 10)
    } else {
        score_limit(selected_set)
    }
}

fn update_history(
    history: &mut Option<Vec<GameResult>>,
    winner_id: &str,
    previous_score: u32,
    next_score: u32,
    other_score: u32,
    selections: &[GameCharacterSelection],
) {
    let Some(history) = history.as_mut() else {
        if next_score == 0 && other_score == 0 {
            *history = Some(Vec::new());
        }
        return;
    };
    if next_score > previous_score {
        for _ in previous_score..next_score {
            history.push(GameResult {
                winner_id: winner_id.to_owned(),
                selections: selections.to_vec(),
            });
        }
        return;
    }
    for _ in next_score..previous_score {
        if let Some(index) = history.iter().rposition(|game| game.winner_id == winner_id) {
            history.remove(index);
        }
    }
}

fn recorded_character_selections(selected_set: &SelectedSet) -> Vec<GameCharacterSelection> {
    [&selected_set.player_one, &selected_set.player_two]
        .into_iter()
        .flat_map(|player| {
            let characters = if player.characters.is_empty() {
                player.character.iter().collect::<Vec<_>>()
            } else {
                player.characters.iter().collect::<Vec<_>>()
            };
            characters.into_iter().map(|character| GameCharacterSelection {
                entrant_id: player.entrant_id.clone(),
                character: character.clone(),
            })
        })
        .collect()
}

pub(crate) fn next_timestamp(previous: &str) -> Result<String, String> {
    let previous = OffsetDateTime::parse(previous, &Rfc3339)
        .map_err(|_| "State timestamp must be canonical RFC 3339.".to_owned())?;
    let now = OffsetDateTime::now_utc();
    let next = if now > previous { now } else { previous + Duration::nanoseconds(1) };
    next.format(&Rfc3339)
        .map_err(|_| "Unable to create a local state timestamp.".to_owned())
}

#[cfg(test)]
mod tests {
    use super::{
        ExhibitionGameSelection, GameResult, OverlayStore, UpdateSelectedSetError, default_state, migrate_match_format,
        normalize_character_teams, report_readiness, validate_characters, validate_selected_set,
    };
    use crate::database::Database;

    #[test]
    fn topanga_deuce_targets_allow_corrections_and_persist_without_tournament_reporting() {
        let database = Database::open(std::path::Path::new(":memory:")).unwrap();
        let store = OverlayStore::load(&database).unwrap();
        let unused = std::path::Path::new("unused");
        let mut selected = store.selected_set().unwrap();
        selected.match_format = Some("topanga".to_owned());
        selected.best_of = 13;
        store
            .update_selected_set(&database, unused, unused, selected)
            .unwrap();

        for (side, other, player) in [("one", "two", "playerOne"), ("two", "one", "playerTwo")] {
            store.reset_scores(&database).unwrap();
            for score in 1..=5 {
                store.set_score(&database, side, score).unwrap();
                store.set_score(&database, other, score).unwrap();
            }
            store.set_score(&database, side, 6).unwrap();
            store.set_score(&database, side, 7).unwrap();
            // Seven wins with a two-game lead ends the match; an extra point is ignored.
            assert_eq!(
                store.set_score(&database, side, 8).unwrap()["selectedSet"][player]["score"],
                7
            );
            store.set_score(&database, other, 6).unwrap();
            assert_eq!(
                store.set_score(&database, side, 8).unwrap()["selectedSet"][player]["score"],
                8
            );
            assert_eq!(
                store.set_score(&database, side, 9).unwrap()["selectedSet"][player]["score"],
                8
            );
            store.set_score(&database, other, 7).unwrap();
            store.set_score(&database, other, 8).unwrap();
            store.set_score(&database, side, 9).unwrap();
            store.set_score(&database, other, 9).unwrap();
            let state = store.set_score(&database, side, 10).unwrap();
            assert_eq!(state["selectedSet"][player]["score"], 10);
            assert_eq!(
                state["selectedSet"]["gameHistory"]
                    .as_array()
                    .unwrap()
                    .len(),
                19
            );
            assert_eq!(
                OverlayStore::load(&database).unwrap().current().unwrap(),
                state
            );
            let capped = store.set_score(&database, side, 11).unwrap();
            assert_eq!(capped["selectedSet"][player]["score"], 10);
            assert_eq!(
                capped["selectedSet"]["gameHistory"],
                state["selectedSet"]["gameHistory"]
            );

            // Lowering the opponent's score must not block a one-point correction.
            store.set_score(&database, other, 5).unwrap();
            assert_eq!(
                store.set_score(&database, side, 11).unwrap()["selectedSet"][player]["score"],
                10
            );
            let state = store.set_score(&database, side, 9).unwrap();
            assert_eq!(state["selectedSet"][player]["score"], 9);
            assert_eq!(
                state["selectedSet"]["gameHistory"]
                    .as_array()
                    .unwrap()
                    .len(),
                14
            );
            store.swap_players(&database).unwrap();
            assert_eq!(
                store.selected_set().unwrap().player_one.score,
                if side == "one" { 5 } else { 9 }
            );
        }

        let mut selected = store.selected_set().unwrap();
        selected.best_of = 19;
        assert!(validate_selected_set(&selected).is_err());
        selected.best_of = 13;
        selected.set_id = Some("123".to_owned());
        assert!(validate_selected_set(&selected).is_err());
        assert!(report_readiness(&selected, None)
            .err()
            .unwrap()
            .contains("cannot be reported"));
    }

    #[test]
    fn first_to_scores_reach_their_target_and_preserve_history_after_corrections() {
        let database = Database::open(std::path::Path::new(":memory:")).unwrap();
        let store = OverlayStore::load(&database).unwrap();
        let unused = std::path::Path::new("unused");
        for target in [2, 3, 5, 7, 10] {
            store.clear_selected_set(&database).unwrap();
            let mut selected = store.selected_set().unwrap();
            selected.match_format = Some("first-to".to_owned());
            selected.best_of = target * 2 - 1;
            store
                .update_selected_set(&database, unused, unused, selected)
                .unwrap();
            for (side, player) in [("one", "playerOne"), ("two", "playerTwo")] {
                store.reset_scores(&database).unwrap();
                for score in 1..=target {
                    let state = store.set_score(&database, side, score).unwrap();
                    assert_eq!(
                        state["selectedSet"][player]["score"], score,
                        "FT{target}: {side}"
                    );
                }
                let state = store.set_score(&database, side, target + 1).unwrap();
                assert_eq!(state["selectedSet"][player]["score"], target);
                assert_eq!(
                    state["selectedSet"]["gameHistory"]
                        .as_array()
                        .unwrap()
                        .len(),
                    target as usize
                );
                assert_eq!(
                    OverlayStore::load(&database).unwrap().current().unwrap(),
                    state
                );
                let state = store.set_score(&database, side, target - 1).unwrap();
                assert_eq!(state["selectedSet"][player]["score"], target - 1);
                assert_eq!(
                    state["selectedSet"]["gameHistory"]
                        .as_array()
                        .unwrap()
                        .len(),
                    (target - 1) as usize
                );
                let mut linked = store.selected_set().unwrap();
                linked.set_id = Some("123".to_owned());
                assert!(report_readiness(&linked, None).is_err());
            }
        }
    }

    #[test]
    fn exhibition_game_changes_reset_gameplay_and_cannot_replace_a_tournament() {
        let database = Database::open(std::path::Path::new(":memory:")).unwrap();
        let store = OverlayStore::load(&database).unwrap();
        let unused = std::path::Path::new("unused");
        let mut selected = store.selected_set().unwrap();
        selected.player_one.name = "Local player".to_owned();
        selected.player_one.characters = vec!["Ryu".to_owned()];
        selected.broadcast.as_mut().unwrap().info_left = Some("Exhibition".to_owned());
        selected.match_format = Some("first-to".to_owned());
        selected.best_of = 9;
        store
            .update_selected_set(&database, unused, unused, selected)
            .unwrap();
        store.set_score(&database, "one", 1).unwrap();
        let selection = |updated_at: String| ExhibitionGameSelection {
            game_id: "street-fighter-6".to_owned(),
            game_name: "Samurai Shodown".to_owned(),
            videogame_id: "334".to_owned(),
            asset_catalog_slug: "samurai-shodown".to_owned(),
            updated_at,
        };
        let version = store.selected_set().unwrap().updated_at;
        let mut updates = store.subscribe();
        let state = store
            .select_exhibition_game(&database, selection(version.clone()))
            .unwrap();
        assert_eq!(state["selectedSet"]["gameName"], "Samurai Shodown");
        assert_eq!(state["selectedSet"]["videogameId"], "334");
        assert_eq!(state["selectedSet"]["assetCatalogSlug"], "samurai-shodown");
        assert_eq!(state["selectedSet"]["playerOne"]["name"], "Local player");
        assert_eq!(state["selectedSet"]["playerOne"]["score"], 0);
        assert!(store
            .selected_set()
            .unwrap()
            .player_one
            .characters
            .is_empty());
        assert!(state["selectedSet"]["gameHistory"]
            .as_array()
            .unwrap()
            .is_empty());
        assert_eq!(state["selectedSet"]["broadcast"]["infoLeft"], "Exhibition");
        assert_eq!(state["selectedSet"]["matchFormat"], "first-to");
        assert_eq!(state["selectedSet"]["bestOf"], 9);
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(&updates.try_recv().unwrap()).unwrap(),
            state
        );
        assert_eq!(
            OverlayStore::load(&database).unwrap().current().unwrap(),
            state
        );
        assert!(matches!(
            store.select_exhibition_game(&database, selection(version)),
            Err(UpdateSelectedSetError::Conflict(_))
        ));

        database.observe_players(vec![
            ("1".into(), crate::player_library::Profile { name: "Alpha".into(), ..Default::default() }),
            ("2".into(), crate::player_library::Profile { name: "Bravo".into(), ..Default::default() }),
        ]).unwrap();
        let mut linked = store.selected_set().unwrap();
        for (player, id, character) in [
            (&mut linked.player_one, "1", "Demitri"),
            (&mut linked.player_two, "2", "Morrigan"),
        ] {
            let mut record = database.library_resolve(None, Some(id)).unwrap().unwrap();
            record.games = vec![crate::player_library::GamePreferences {
                game_key: "vampire-savior-the-lord-of-vampire".into(),
                characters: vec![character.into()],
                character_asset_id: Some(format!("{character}.png")),
                portrait_asset_id: Some(format!("{character}-portrait.png")),
            }];
            let record = database.library_save(record).unwrap().player;
            player.local_player_id = Some(record.local_id);
            player.player_id = record.player_id;
            player.portrait_asset_id = Some("old-game-portrait.png".into());
        }
        store.update_selected_set(&database, unused, unused, linked).unwrap();
        let previous_revision = store.history_snapshot().unwrap().1;
        store.select_exhibition_game(&database, ExhibitionGameSelection {
            game_id: "street-fighter-6".into(),
            game_name: "Vampire Savior: The Lord of Vampire".into(),
            videogame_id: "582".into(),
            asset_catalog_slug: "vampire-savior-the-lord-of-vampire".into(),
            updated_at: store.selected_set().unwrap().updated_at,
        }).unwrap();
        let (switched, revision) = store.history_snapshot().unwrap();
        assert_ne!(revision, previous_revision);
        let context = crate::versus_history::HistoryMatch::from_set(&switched).unwrap();
        assert_eq!((context.game_id.as_str(), context.player_one_id.as_str(), context.player_two_id.as_str()), ("582", "1", "2"));
        for (player, character) in [(&switched.player_one, "Demitri"), (&switched.player_two, "Morrigan")] {
            assert_eq!(player.characters, [character]);
            assert_eq!(player.character.as_deref(), Some(character));
            assert_eq!(player.character_asset_id, Some(format!("{character}.png")));
            assert_eq!(player.portrait_asset_id, Some(format!("{character}-portrait.png")));
        }
        let deleted_id = switched.player_one.local_player_id.clone().unwrap();
        let deleted = database.library_player(&deleted_id).unwrap().unwrap();
        database.library_delete(&deleted_id, &deleted.updated_at).unwrap();
        store.select_exhibition_game(&database, selection(switched.updated_at)).unwrap();
        let switched = store.selected_set().unwrap();
        assert!(switched.player_one.local_player_id.is_none());
        assert!(switched.player_two.local_player_id.is_some());
        for player in [&switched.player_one, &switched.player_two] {
            assert!(player.characters.is_empty());
            assert!(player.character.is_none());
            assert!(player.character_asset_id.is_none());
            assert!(player.portrait_asset_id.is_none());
        }

        let mut tournament = store.selected_set().unwrap();
        tournament.set_id = Some("123".to_owned());
        store
            .replace_selected_set(&database, unused, unused, tournament)
            .unwrap();
        let before = store.current().unwrap();
        assert!(matches!(
            store.select_exhibition_game(
                &database,
                selection(store.selected_set().unwrap().updated_at)
            ),
            Err(UpdateSelectedSetError::Invalid(_))
        ));
        assert_eq!(store.current().unwrap(), before);
        let cleared = store.clear_selected_set(&database).unwrap();
        for field in [
            "setId",
            "eventId",
            "tournamentSlug",
            "gameName",
            "videogameId",
            "assetCatalogSlug",
        ] {
            assert!(cleared["selectedSet"].get(field).is_none(), "{field}");
        }
        assert!(store
            .select_exhibition_game(
                &database,
                selection(store.selected_set().unwrap().updated_at)
            )
            .is_ok());
    }

    #[test]
    fn score_history_correction_and_swap_are_persisted() {
        let database = Database::open(std::path::Path::new(":memory:")).unwrap();
        let store = OverlayStore::load(&database).unwrap();
        let mut selected = store.selected_set().unwrap();
        selected.player_one.characters = vec!["Ryu".to_owned()];
        selected.player_one.character = Some("Ryu".to_owned());
        selected.player_two.characters = vec!["Ken".to_owned()];
        selected.player_two.character = Some("Ken".to_owned());
        store.update_selected_set(
            &database,
            std::path::Path::new("unused"),
            std::path::Path::new("unused"),
            selected,
        ).unwrap();
        let state = store.set_score(&database, "one", 2).unwrap();
        assert_eq!(state["selectedSet"]["gameHistory"].as_array().unwrap().len(), 2);
        assert_eq!(
            state["selectedSet"]["gameHistory"][0]["selections"][0]["character"],
            "Ryu",
        );
        let mut selected = store.selected_set().unwrap();
        selected.player_one.characters = vec!["Chun-Li".to_owned()];
        selected.player_one.character = Some("Chun-Li".to_owned());
        store.update_selected_set(
            &database,
            std::path::Path::new("unused"),
            std::path::Path::new("unused"),
            selected,
        ).unwrap();
        let state = store.set_score(&database, "two", 1).unwrap();
        assert_eq!(
            state["selectedSet"]["gameHistory"][2]["selections"][0]["character"],
            "Chun-Li",
        );
        let state = store.set_score(&database, "one", 1).unwrap();
        assert_eq!(state["selectedSet"]["gameHistory"].as_array().unwrap().len(), 2);
        let state = store.swap_players(&database).unwrap();
        assert_eq!(state["selectedSet"]["playerTwo"]["score"], 1);

        let restored = OverlayStore::load(&database).unwrap().current().unwrap();
        assert_eq!(restored["selectedSet"]["playerTwo"]["score"], 1);
    }

    #[test]
    fn reporting_uses_ordered_history_only_when_it_is_known() {
        let database = Database::open(std::path::Path::new(":memory:")).unwrap();
        let store = OverlayStore::load(&database).unwrap();
        let mut selected = store.selected_set().unwrap();
        selected.set_id = Some("set-1".to_owned());
        selected.player_one.score = 2;
        selected.player_two.score = 1;
        selected.game_history = Some(vec![
            GameResult { winner_id: "p1".to_owned(), selections: Vec::new() },
            GameResult { winner_id: "p2".to_owned(), selections: Vec::new() },
            GameResult { winner_id: "p1".to_owned(), selections: Vec::new() },
        ]);
        let report = report_readiness(&selected, None).unwrap();
        assert_eq!(report.winner_id, "p1");

        selected.game_history = None;
        assert_eq!(report_readiness(&selected, None).unwrap().winner_id, "p1");
        selected.state = Some("3".to_owned());
        assert!(report_readiness(&selected, None).is_err());
    }

    #[test]
    fn legacy_state_migrates_character_teams_and_styling_safely() {
        let mut selected = default_state().selected_set;
        selected.game_id = "2xko".to_owned();
        selected.asset_catalog_slug = Some("2xko".to_owned());
        selected.player_one.character = Some("Ahri".to_owned());
        normalize_character_teams(&mut selected);
        assert_eq!(selected.player_one.characters, vec!["Ahri"]);

        selected.player_one.characters = vec!["Ahri".to_owned(), "Ekko".to_owned()];
        selected.player_one.character = Some("Ahri".to_owned());
        assert!(validate_characters(&selected, std::path::Path::new("unused")).is_ok());

        selected.player_one.characters.push("Darius".to_owned());
        assert!(validate_characters(&selected, std::path::Path::new("unused")).is_err());

        let mut legacy = default_state().selected_set;
        legacy.game_id = "tekken-8".to_owned();
        legacy.styling_game_id = None;
        migrate_match_format(&mut legacy);
        assert_eq!(legacy.styling_game_id.as_deref(), Some("tekken-8"));

        legacy.styling_game_id = Some("street-fighter-6".to_owned());
        assert!(validate_selected_set(&legacy).is_ok());
        assert_eq!(legacy.game_id, "tekken-8");
    }
}
