use crate::{database::{now_rfc3339, Database}, moderation};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::RwLock;
use tokio::sync::broadcast;

const SURFACE_ID: &str = "top-eight-matchups";

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MatchupPlayer {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub entrant_id: Option<String>,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sponsor: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub character: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub character_asset_id: Option<String>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Matchup {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub set_id: Option<String>,
    pub bracket: String,
    pub players: [MatchupPlayer; 2],
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TopEightMatchupsState {
    pub styling_game_id: String,
    #[serde(default = "default_true")]
    pub show_background: bool,
    #[serde(default = "default_true")]
    pub show_tournament_logo: bool,
    #[serde(default)]
    pub flip_player_two_portraits: bool,
    pub asset_catalog_slug: String,
    pub tournament_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub event_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub logo_asset_id: Option<String>,
    pub matchups: Vec<Matchup>,
    pub updated_at: String,
}

pub struct TopEightMatchupsStore {
    state: RwLock<TopEightMatchupsState>,
    updates: broadcast::Sender<String>,
}

impl TopEightMatchupsStore {
    pub fn load(database: &Database) -> Result<Self, String> {
        let state = database.load_broadcast_surface(SURFACE_ID)?
            .and_then(|payload| serde_json::from_str::<TopEightMatchupsState>(&payload).ok())
            .filter(|state| validate(state).is_ok())
            .unwrap_or_else(default_state);
        let payload = serde_json::to_string(&state)
            .map_err(|_| "topEightMatchups.serializeFailed".to_owned())?;
        database.save_broadcast_surface(SURFACE_ID, &payload, &state.updated_at)?;
        let (updates, _) = broadcast::channel(16);
        Ok(Self { state: RwLock::new(state), updates })
    }

    pub fn current(&self) -> Result<Value, String> {
        self.state.read()
            .map_err(|_| "topEightMatchups.unavailable".to_owned())
            .and_then(|state| serde_json::to_value(&*state)
                .map_err(|_| "topEightMatchups.serializeFailed".to_owned()))
    }

    pub fn subscribe(&self) -> broadcast::Receiver<String> { self.updates.subscribe() }

    pub fn replace(&self, database: &Database, mut submitted: TopEightMatchupsState) -> Result<Value, String> {
        validate(&submitted)?;
        submitted.updated_at = now_rfc3339()?;
        let payload = serde_json::to_string(&submitted)
            .map_err(|_| "topEightMatchups.serializeFailed".to_owned())?;
        database.save_broadcast_surface(SURFACE_ID, &payload, &submitted.updated_at)?;
        *self.state.write().map_err(|_| "topEightMatchups.unavailable".to_owned())? = submitted;
        let _ = self.updates.send(payload.clone());
        serde_json::from_str(&payload).map_err(|_| "topEightMatchups.serializeFailed".to_owned())
    }
}

fn validate(state: &TopEightMatchupsState) -> Result<(), String> {
    if !crate::state::is_supported_game_id(&state.styling_game_id) {
        return Err("topEightMatchups.invalidStyling".to_owned());
    }
    if state.asset_catalog_slug.trim().is_empty() || state.asset_catalog_slug.chars().count() > 100 {
        return Err("topEightMatchups.invalidCatalog".to_owned());
    }
    if state.tournament_name.trim().is_empty() || state.tournament_name.chars().count() > 120 {
        return Err("topEightMatchups.invalidTournamentName".to_owned());
    }
    if state.matchups.len() != 4 {
        return Err("topEightMatchups.invalidMatchupCount".to_owned());
    }
    for (index, matchup) in state.matchups.iter().enumerate() {
        let expected = if index < 2 { "winners" } else { "losers" };
        if matchup.bracket != expected {
            return Err("topEightMatchups.invalidBracketOrder".to_owned());
        }
        for player in &matchup.players {
            if player.name.trim().is_empty() || player.name.chars().count() > 100 {
                return Err("topEightMatchups.invalidPlayerName".to_owned());
            }
            if player.character.as_deref().is_some_and(moderation::contains_blocked_text_for_character) {
                return Err("topEightMatchups.blockedCharacter".to_owned());
            }
        }
    }
    if moderation::contains_blocked_text(&state.tournament_name) {
        return Err("topEightMatchups.blockedTournamentName".to_owned());
    }
    if state.event_name.as_deref().is_some_and(moderation::contains_blocked_text) {
        return Err("topEightMatchups.blockedEventName".to_owned());
    }
    for matchup in &state.matchups {
        for player in &matchup.players {
            if moderation::contains_blocked_text(&player.name) {
                return Err("topEightMatchups.blockedPlayerName".to_owned());
            }
            if player.sponsor.as_deref().is_some_and(moderation::contains_blocked_text) {
                return Err("topEightMatchups.blockedSponsor".to_owned());
            }
        }
    }
    Ok(())
}

fn default_state() -> TopEightMatchupsState {
    let player = |number| MatchupPlayer {
        entrant_id: None,
        name: format!("Player {number}"),
        sponsor: None,
        character: None,
        character_asset_id: None,
    };
    TopEightMatchupsState {
        styling_game_id: "street-fighter-6".to_owned(),
        show_background: true,
        show_tournament_logo: true,
        flip_player_two_portraits: false,
        asset_catalog_slug: "street-fighter-6".to_owned(),
        tournament_name: "Tournament Top 8".to_owned(),
        event_name: None,
        logo_asset_id: None,
        matchups: vec![
            Matchup { set_id: None, bracket: "winners".to_owned(), players: [player(1), player(2)] },
            Matchup { set_id: None, bracket: "winners".to_owned(), players: [player(3), player(4)] },
            Matchup { set_id: None, bracket: "losers".to_owned(), players: [player(5), player(6)] },
            Matchup { set_id: None, bracket: "losers".to_owned(), players: [player(7), player(8)] },
        ],
        updated_at: now_rfc3339().unwrap_or_else(|_| "1970-01-01T00:00:00Z".to_owned()),
    }
}

fn default_true() -> bool { true }

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn logo_visibility_migrates_and_round_trips_for_both_overlays() {
        let mut top_eight = serde_json::to_value(default_state()).unwrap();
        top_eight.as_object_mut().unwrap().remove("showTournamentLogo");
        let mut restored: TopEightMatchupsState = serde_json::from_value(top_eight).unwrap();
        assert!(restored.show_tournament_logo);
        assert!(!restored.flip_player_two_portraits);
        restored.show_tournament_logo = false;
        restored.logo_asset_id = Some("tournament.png".to_owned());
        let saved = serde_json::to_value(&restored).unwrap();
        let restored: TopEightMatchupsState = serde_json::from_value(saved).unwrap();
        assert!(!restored.show_tournament_logo);
        assert_eq!(restored.logo_asset_id.as_deref(), Some("tournament.png"));

        let legacy = serde_json::json!({
            "tournamentName": "Tournament", "commentators": [],
            "presentation": "hidden", "updatedAt": "2026-09-08T00:00:00Z"
        });
        let mut restored: crate::commentators::CommentatorState = serde_json::from_value(legacy).unwrap();
        assert!(restored.show_tournament_logo);
        restored.show_tournament_logo = false;
        restored.logo_asset_id = Some("tournament.png".to_owned());
        let saved = serde_json::to_value(&restored).unwrap();
        let restored: crate::commentators::CommentatorState = serde_json::from_value(saved).unwrap();
        assert!(!restored.show_tournament_logo);
        assert_eq!(restored.logo_asset_id.as_deref(), Some("tournament.png"));
    }
}
