use crate::{database::{Database, now_rfc3339}, moderation};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{collections::{HashMap, HashSet}, path::Path, sync::{LazyLock, RwLock}};
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub set_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub event_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tournament_slug: Option<String>,
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
    pub game_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub game_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub styling_game_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub asset_catalog_slug: Option<String>,
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
    pub entrant_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub player_id: Option<String>,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prefix: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sponsor: Option<String>,
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
    updates: broadcast::Sender<String>,
}

#[derive(Debug)]
pub enum UpdateSelectedSetError {
    Invalid(String),
    Conflict(String),
}

pub struct ReportableResult {
    pub winner_id: String,
    pub winner_score: u32,
    pub loser_score: u32,
}

impl OverlayStore {
    pub fn load(database: &Database) -> Result<Self, String> {
        let restored = database
            .load_overlay_state()?
            .and_then(|payload| serde_json::from_str::<OverlayState>(&payload).ok())
            .map(|mut state| {
                migrate_match_format(&mut state.selected_set);
                normalize_character_teams(&mut state.selected_set);
                state
            })
            .filter(|state| validate_state(state).is_ok());
        let state = restored.unwrap_or_else(default_state);
        let payload = serde_json::to_string(&state)
            .map_err(|_| "Unable to serialize local stream state.".to_owned())?;
        database.save_overlay_state(&payload, &state.selected_set.updated_at)?;
        let (updates, _) = broadcast::channel(32);
        Ok(Self {
            state: RwLock::new(state),
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

    pub fn replace_selected_set(
        &self,
        database: &Database,
        logo_directory: &Path,
        game_asset_directory: &Path,
        mut selected_set: SelectedSet,
    ) -> Result<Value, String> {
        normalize_character_teams(&mut selected_set);
        let mut current = self.state.write()
            .map_err(|_| "Local stream state is unavailable.".to_owned())?;
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
        submitted.phase_group = current.selected_set.phase_group.clone();
        submitted.winners_side_entrant_id = current.selected_set.winners_side_entrant_id.clone();
        submitted.game_name = current.selected_set.game_name.clone();
        submitted.game_history = current.selected_set.game_history.clone();
        submitted.player_one.player_id = player_id_for_entrant(
            &current.selected_set,
            &submitted.player_one.entrant_id,
        );
        submitted.player_two.player_id = player_id_for_entrant(
            &current.selected_set,
            &submitted.player_two.entrant_id,
        );
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
        *current = next;
        drop(current);
        let _ = self.updates.send(payload.clone());
        serde_json::from_str(&payload)
            .map_err(|_| UpdateSelectedSetError::Invalid("Unable to serialize local stream state.".to_owned()))
    }

    pub fn set_score(&self, database: &Database, side: &str, requested_score: u32) -> Result<Value, String> {
        self.mutate(database, |selected_set| {
            let limit = score_limit(selected_set.best_of);
            let score = requested_score.min(limit);
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
    ) -> Result<Value, String> {
        self.mutate(database, |selected_set| {
            if selected_set.set_id.as_deref() != Some(set_id) {
                return Err("The active stream set changed after start.gg accepted the report.".to_owned());
            }
            selected_set.state = Some(reported_state.to_owned());
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
            set_id: None,
            event_id: None,
            tournament_slug: None,
            display_name: "Waiting for set".to_owned(),
            phase: None,
            phase_group: None,
            round: None,
            winners_side_entrant_id: None,
            station: None,
            state: None,
            game_id: "street-fighter-6".to_owned(),
            game_name: Some("Street Fighter 6".to_owned()),
            styling_game_id: Some("street-fighter-6".to_owned()),
            asset_catalog_slug: Some("street-fighter-6".to_owned()),
            best_of: 3,
            broadcast: Some(BroadcastPresentation {
                info_bar_enabled: false,
                info_left: None,
                info_right: None,
                logo_enabled: false,
                logo_asset_id: None,
            }),
            game_history: Some(Vec::new()),
            player_one: Player {
                entrant_id: "p1".to_owned(),
                player_id: None,
                name: "Player 1".to_owned(),
                prefix: None,
                sponsor: None,
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
                entrant_id: "p2".to_owned(),
                player_id: None,
                name: "Player 2".to_owned(),
                prefix: None,
                sponsor: None,
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
    if selected_set.asset_catalog_slug.as_deref().is_some_and(|slug| {
        !crate::catalogs::valid_game_asset_catalog_slug(slug)
    }) {
        return Err("Choose a valid local game asset catalog.".to_owned());
    }
    if !matches!(selected_set.best_of, 3 | 5) {
        return Err("Best-of must be 3 or 5.".to_owned());
    }
    if selected_set.winners_side_entrant_id.as_ref().is_some_and(|entrant_id| {
        entrant_id != &selected_set.player_one.entrant_id
            && entrant_id != &selected_set.player_two.entrant_id
    }) {
        return Err("The winners-side entrant must be one of the selected set entrants.".to_owned());
    }
    let limit = score_limit(selected_set.best_of);
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

pub fn report_readiness(selected_set: &SelectedSet) -> Result<ReportableResult, String> {
    if selected_set.state.as_deref() == Some("3") {
        return Err("This set is already marked complete on start.gg.".to_owned());
    }
    if selected_set.set_id.is_none() {
        return Err("Load a start.gg set before reporting a result.".to_owned());
    }
    required(&selected_set.player_one.entrant_id, "Player one entrant ID")?;
    required(&selected_set.player_two.entrant_id, "Player two entrant ID")?;
    let target = score_limit(selected_set.best_of);
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

pub fn censor_untrusted_selected_set(selected_set: &mut SelectedSet) {
    selected_set.display_name = censor_required(&selected_set.display_name);
    selected_set.phase = moderation::censor(selected_set.phase.take());
    selected_set.phase_group = moderation::censor(selected_set.phase_group.take());
    selected_set.round = moderation::censor(selected_set.round.take());
    selected_set.station = moderation::censor(selected_set.station.take());
    censor_player(&mut selected_set.player_one);
    censor_player(&mut selected_set.player_two);
    if let Some(broadcast) = &mut selected_set.broadcast {
        broadcast.info_left = moderation::censor(broadcast.info_left.take());
        broadcast.info_right = moderation::censor(broadcast.info_right.take());
    }
}

fn censor_player(player: &mut Player) {
    player.name = censor_required(&player.name);
    player.prefix = moderation::censor(player.prefix.take());
    player.sponsor = moderation::censor(player.sponsor.take());
    player.characters = player.characters.drain(..)
        .filter_map(|character| moderation::censor(Some(character)))
        .collect();
    player.character = player.characters.first().cloned();
    player.pronouns = moderation::censor(player.pronouns.take());
}

fn censor_required(value: &str) -> String {
    moderation::censor(Some(value.to_owned())).unwrap_or_else(|| "[blocked]".to_owned())
}

fn assert_safe_state(selected_set: &SelectedSet) -> Result<(), String> {
    moderation::assert_safe(&[
        ("Display name", Some(selected_set.display_name.as_str())),
        ("Phase", selected_set.phase.as_deref()),
        ("Pool", selected_set.phase_group.as_deref()),
        ("Round", selected_set.round.as_deref()),
        ("Station", selected_set.station.as_deref()),
        ("Player one name", Some(selected_set.player_one.name.as_str())),
        ("Player one prefix", selected_set.player_one.prefix.as_deref()),
        ("Player one sponsor", selected_set.player_one.sponsor.as_deref()),
        ("Player one pronouns", selected_set.player_one.pronouns.as_deref()),
        ("Player two name", Some(selected_set.player_two.name.as_str())),
        ("Player two prefix", selected_set.player_two.prefix.as_deref()),
        ("Player two sponsor", selected_set.player_two.sponsor.as_deref()),
        ("Player two pronouns", selected_set.player_two.pronouns.as_deref()),
        ("Left broadcast text", selected_set.broadcast.as_ref().and_then(|value| value.info_left.as_deref())),
        ("Right broadcast text", selected_set.broadcast.as_ref().and_then(|value| value.info_right.as_deref())),
    ])?;
    for (label, player) in [
        ("Player one character", &selected_set.player_one),
        ("Player two character", &selected_set.player_two),
    ] {
        for character in &player.characters {
            moderation::assert_safe(&[(label, Some(character.as_str()))])?;
        }
    }
    Ok(())
}

fn validate_characters(selected_set: &SelectedSet, game_asset_directory: &Path) -> Result<(), String> {
    let catalog_slug = selected_set
        .asset_catalog_slug
        .as_deref()
        .unwrap_or(&selected_set.game_id);
    let maximum = max_characters_for_game(&selected_set.game_id);
    for player in [&selected_set.player_one, &selected_set.player_two] {
        if player.characters.len() > maximum {
            return Err(format!("This game supports at most {maximum} selected characters per player."));
        }
        for character in &player.characters {
            if !crate::catalogs::is_character_for_game(catalog_slug, character)
                && !crate::catalogs::has_game_character_asset(
                    game_asset_directory,
                    catalog_slug,
                    character,
                )
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

fn max_characters_for_game(game_id: &str) -> usize {
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

fn score_limit(best_of: u32) -> u32 {
    best_of / 2 + 1
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

fn next_timestamp(previous: &str) -> Result<String, String> {
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
        GameResult, OverlayStore, default_state, migrate_match_format,
        normalize_character_teams, report_readiness, validate_characters, validate_selected_set,
    };
    use crate::database::Database;

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
        let report = report_readiness(&selected).unwrap();
        assert_eq!(report.winner_id, "p1");

        selected.game_history = None;
        assert_eq!(report_readiness(&selected).unwrap().winner_id, "p1");
        selected.state = Some("3".to_owned());
        assert!(report_readiness(&selected).is_err());
    }

    #[test]
    fn character_teams_migrate_legacy_state_and_enforce_game_limits() {
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
    }

    #[test]
    fn legacy_state_migrates_style_without_overwriting_game_identity() {
        let mut selected = default_state().selected_set;
        selected.game_id = "tekken-8".to_owned();
        selected.styling_game_id = None;
        migrate_match_format(&mut selected);
        assert_eq!(selected.styling_game_id.as_deref(), Some("tekken-8"));

        selected.styling_game_id = Some("street-fighter-6".to_owned());
        assert!(validate_selected_set(&selected).is_ok());
        assert_eq!(selected.game_id, "tekken-8");
    }
}
