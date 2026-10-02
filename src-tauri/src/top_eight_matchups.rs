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
        let state = crate::persisted_state::restore(
            database, "Top 8 Matchups", database.load_broadcast_surface(SURFACE_ID)?,
            || Ok(default_state()), |state| { normalize(state); validate(state) },
        )?;
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
        normalize(&mut submitted);
        validate(&submitted)?;
        let mut current = self.state.write().map_err(|_| "topEightMatchups.unavailable".to_owned())?;
        crate::persisted_state::check_revision(&submitted.updated_at, &current.updated_at)?;
        submitted.updated_at = crate::state::next_timestamp(&current.updated_at)?;
        let payload = serde_json::to_string(&submitted)
            .map_err(|_| "topEightMatchups.serializeFailed".to_owned())?;
        database.save_broadcast_surface(SURFACE_ID, &payload, &submitted.updated_at)?;
        *current = submitted;
        let _ = self.updates.send(payload.clone());
        serde_json::from_str(&payload).map_err(|_| "topEightMatchups.serializeFailed".to_owned())
    }
}

fn normalize(state: &mut TopEightMatchupsState) {
    // Match String.trim() in the renderer, including BOM but excluding NEL.
    fn trim_text(value: &str) -> String {
        value.trim_matches(|ch| matches!(ch,
            '\u{0009}'..='\u{000d}' | '\u{0020}' | '\u{00a0}' | '\u{1680}'
            | '\u{2000}'..='\u{200a}' | '\u{2028}' | '\u{2029}' | '\u{202f}'
            | '\u{205f}' | '\u{3000}' | '\u{feff}'
        )).to_owned()
    }
    fn trim(value: &mut Option<String>) {
        if let Some(value) = value { *value = trim_text(value); }
    }
    state.asset_catalog_slug = trim_text(&state.asset_catalog_slug);
    state.tournament_name = trim_text(&state.tournament_name);
    trim(&mut state.event_name);
    trim(&mut state.logo_asset_id);
    for matchup in &mut state.matchups {
        for player in &mut matchup.players {
            player.name = trim_text(&player.name);
            trim(&mut player.sponsor);
            trim(&mut player.character);
            trim(&mut player.character_asset_id);
        }
    }
}

fn text_length(value: &str, min: usize, max: usize) -> bool {
    // Zod string bounds count UTF-16 code units, including surrogate pairs.
    (min..=max).contains(&value.encode_utf16().count())
}

fn validate(state: &TopEightMatchupsState) -> Result<(), String> {
    if !crate::state::is_supported_game_id(&state.styling_game_id) {
        return Err("topEightMatchups.invalidStyling".to_owned());
    }
    if !text_length(&state.asset_catalog_slug, 1, 100) {
        return Err("topEightMatchups.invalidCatalog".to_owned());
    }
    if !text_length(&state.tournament_name, 1, 120) {
        return Err("topEightMatchups.invalidTournamentName".to_owned());
    }
    if state.event_name.as_deref().is_some_and(|value| !text_length(value, 0, 120))
        || state.logo_asset_id.as_deref().is_some_and(|value| !text_length(value, 1, 255))
        || time::OffsetDateTime::parse(&state.updated_at, &time::format_description::well_known::Rfc3339).is_err()
    {
        return Err("Choose valid Top 8 text fields and timestamp.".to_owned());
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
            if !text_length(&player.name, 1, 100) {
                return Err("topEightMatchups.invalidPlayerName".to_owned());
            }
            if player.sponsor.as_deref().is_some_and(|value| !text_length(value, 0, 100))
                || player.character.as_deref().is_some_and(|value| !text_length(value, 1, 100))
                || player.character_asset_id.as_deref().is_some_and(|value| !text_length(value, 1, 255))
            {
                return Err("Choose valid Top 8 player text fields.".to_owned());
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
    fn validates_and_persists_settings_without_accepting_stale_writes() {
        // Exercise the renderer's text bounds through real saves, including failed writes.
        let cases: &[(&str, bool, fn(&mut TopEightMatchupsState))] = &[
            ("legacy defaults", true, |_| {}),
            ("trimmed names", true, |state| state.matchups[0].players[0].name = "  Player One  ".to_owned()),
            ("trimmed tournament", true, |state| state.tournament_name = "  Finals  ".to_owned()),
            ("UTF-16 limit", true, |state| state.matchups[0].players[0].name = "😀".repeat(50)),
            ("UTF-16 overflow", false, |state| state.matchups[0].players[0].name = "😀".repeat(51)),
            ("empty name", false, |state| state.matchups[0].players[0].name = "  ".to_owned()),
            ("sponsor limit", true, |state| state.matchups[0].players[0].sponsor = Some("S".repeat(100))),
            ("sponsor overflow", false, |state| state.matchups[0].players[0].sponsor = Some("S".repeat(101))),
            ("event limit", true, |state| state.event_name = Some("E".repeat(120))),
            ("event overflow", false, |state| state.event_name = Some("E".repeat(121))),
            ("catalog overflow", false, |state| state.asset_catalog_slug = "a".repeat(101)),
            ("empty optional character", false, |state| state.matchups[0].players[0].character = Some(" ".to_owned())),
            ("asset overflow", false, |state| state.matchups[0].players[0].character_asset_id = Some("a".repeat(256))),
            ("wrong bracket order", false, |state| state.matchups[2].bracket = "winners".to_owned()),
            ("invalid timestamp", false, |state| state.updated_at = "yesterday".to_owned()),
            ("unknown game", false, |state| state.styling_game_id = "unknown-game".to_owned()),
            ("JavaScript whitespace trimming", true, |state| state.matchups[0].players[0].name = "\u{feff} Player One \u{feff}".to_owned()),
            ("non-trimmed Unicode character", true, |state| state.matchups[0].players[0].name = "\u{0085}Player One\u{0085}".to_owned()),
        ];
        for &(name, valid, edit) in cases {
            let database = Database::open(std::path::Path::new(":memory:")).unwrap();
            let store = TopEightMatchupsStore::load(&database).unwrap();
            let before = store.current().unwrap();
            let mut updates = store.subscribe();
            let mut submitted = serde_json::from_value(before.clone()).unwrap();
            edit(&mut submitted);
            let saved = store.replace(&database, submitted);
            assert_eq!(saved.is_ok(), valid, "{name}");
            if let Ok(saved) = saved {
                assert_ne!(saved["updatedAt"], before["updatedAt"]);
                let persisted: Value = serde_json::from_str(&database.load_broadcast_surface(SURFACE_ID).unwrap().unwrap()).unwrap();
                assert_eq!(saved, persisted);
                assert_eq!(saved, serde_json::from_str::<Value>(&updates.try_recv().unwrap()).unwrap());
                match name {
                    "trimmed names" | "JavaScript whitespace trimming" => assert_eq!(saved["matchups"][0]["players"][0]["name"], "Player One"),
                    "trimmed tournament" => assert_eq!(saved["tournamentName"], "Finals"),
                    "non-trimmed Unicode character" => assert_eq!(saved["matchups"][0]["players"][0]["name"], "\u{0085}Player One\u{0085}"),
                    _ => {}
                }
                assert_eq!(store.replace(&database, serde_json::from_value(before).unwrap()).unwrap_err(), crate::persisted_state::STALE_SETTINGS);
                assert_eq!(store.current().unwrap(), saved);
                assert!(updates.try_recv().is_err());
            } else {
                assert_eq!(store.current().unwrap(), before);
                assert!(updates.try_recv().is_err());
                let persisted: Value = serde_json::from_str(&database.load_broadcast_surface(SURFACE_ID).unwrap().unwrap()).unwrap();
                assert_eq!(persisted, before);
            }
        }
    }

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
