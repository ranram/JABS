use super::{ReportedGame, ReportedGameSelection, normalized_id, optional_text, request};
use crate::{
    catalogs::character_names_match,
    diagnostics::{self, Area, Context, Event, Reason},
    runtime::RuntimeState,
    startgg_queries,
    state::GameResult,
};
use serde_json::{Value, json};
use std::collections::HashSet;

pub(crate) async fn reported_games(
    runtime: &RuntimeState,
    set_id: &str,
    history: Option<&[GameResult]>,
) -> Option<Vec<ReportedGame>> {
    let history = history?;
    let requested_count: usize = history.iter().map(|game| game.selections.len()).sum();
    let multiple_picks = has_multiple_picks_per_player(history);
    let (catalog, lookup_failure) = if requested_count == 0 || multiple_picks {
        (Vec::new(), None)
    } else {
        match request::<Value>(
            runtime,
            startgg_queries::SET_CHARACTER_CATALOG,
            json!({ "setId": set_id }),
        )
        .await
        {
            Ok(data) => (character_catalog(&data), None),
            Err(error) => (Vec::new(), Some(Reason::from_code(error.code))),
        }
    };
    let games = build_games(history, &catalog);
    let reported_count: usize = games.iter().map(|game| game.selections.len()).sum();
    if reported_count < requested_count {
        diagnostics::record(
            Event::ReportCharactersOmitted,
            Context {
                area: Area::Reporting,
                reason: lookup_failure
                    .or_else(|| (!multiple_picks).then_some(Reason::InvalidResponse)),
                ..Context::default()
            },
        );
    }
    Some(games)
}

fn has_multiple_picks_per_player(history: &[GameResult]) -> bool {
    history.iter().any(|game| {
        let mut entrants = HashSet::new();
        game.selections
            .iter()
            .any(|pick| !entrants.insert(&pick.entrant_id))
    })
}

fn character_catalog(data: &Value) -> Vec<(String, String)> {
    data.pointer("/set/event/videogame/characters")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|character| {
            Some((
                normalized_id(character.get("id")?)?,
                optional_text(character.get("name"))?,
            ))
        })
        .collect()
}

fn build_games(history: &[GameResult], catalog: &[(String, String)]) -> Vec<ReportedGame> {
    history
        .iter()
        .enumerate()
        .map(|(index, game)| ReportedGame {
            game_num: index + 1,
            winner_id: game.winner_id.clone(),
            selections: game
                .selections
                .iter()
                .filter_map(|selection| {
                    let mut matches = catalog
                        .iter()
                        .filter(|(_, name)| character_names_match(name, &selection.character));
                    let (character_id, _) = matches.next()?;
                    if matches.any(|(id, _)| id != character_id) {
                        return None;
                    }
                    Some(ReportedGameSelection {
                        entrant_id: selection.entrant_id.clone(),
                        character_id: character_id.clone(),
                    })
                })
                .collect(),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::GameCharacterSelection;

    #[test]
    fn multiple_picks_for_the_same_player_use_score_only() {
        let mut game = GameResult {
            winner_id: "2".into(),
            selections: ["Storm", "Magik", "Wolverine", "Danger"]
                .map(|character| GameCharacterSelection {
                    entrant_id: "2".into(),
                    character: character.into(),
                })
                .to_vec(),
        };
        assert!(has_multiple_picks_per_player(std::slice::from_ref(&game)));
        assert_eq!(
            serde_json::to_value(build_games(std::slice::from_ref(&game), &[])).unwrap(),
            json!([{ "gameNum": 1, "winnerId": "2" }])
        );

        game.selections[1].entrant_id = "1".into();
        game.selections.truncate(2);
        assert!(!has_multiple_picks_per_player(&[game]));
    }

    #[test]
    fn strive_score_keeps_game_winners_when_character_data_is_incomplete() {
        let game = GameResult {
            winner_id: "2".into(),
            selections: vec![
                GameCharacterSelection {
                    entrant_id: "1".into(),
                    character: "Sol Badguy".into(),
                },
                GameCharacterSelection {
                    entrant_id: "2".into(),
                    character: "Nagoriyuki".into(),
                },
            ],
        };
        let history = [game.clone(), game.clone(), game];
        // This fixture represents a partial roster, not the live event response.
        let data = json!({ "set": { "event": { "videogame": { "characters": [
            { "id": 42, "name": "Nagoriyuki" }
        ] } } } });
        let partial = build_games(&history, &character_catalog(&data));
        assert_eq!(
            serde_json::to_value(&partial[0]).unwrap(),
            json!({
                "gameNum": 1, "winnerId": "2",
                "selections": [{ "entrantId": "2", "characterId": "42" }]
            })
        );

        let missing = build_games(&history, &character_catalog(&Value::Null));
        assert_eq!(
            serde_json::to_value(missing).unwrap(),
            json!([
                { "gameNum": 1, "winnerId": "2" },
                { "gameNum": 2, "winnerId": "2" },
                { "gameNum": 3, "winnerId": "2" }
            ])
        );
    }
}
