use super::{
    default_state, next_timestamp, persist_stream_state, validate_state, OverlayStore,
    UpdateSelectedSetError,
};
use crate::database::Database;
use serde_json::Value;

impl OverlayStore {
    pub fn clear_players(
        &self,
        database: &Database,
        updated_at: &str,
    ) -> Result<Value, UpdateSelectedSetError> {
        let invalid = UpdateSelectedSetError::Invalid;
        let mut current = self
            .state
            .write()
            .map_err(|_| invalid("Local stream state is unavailable.".to_owned()))?;
        if current.selected_set.updated_at != updated_at {
            return Err(UpdateSelectedSetError::Conflict(
                "The stream match changed before clearing the players. Review it and try again."
                    .to_owned(),
            ));
        }
        let mut next = current.clone();
        let selected = &mut next.selected_set;
        let defaults = default_state().selected_set;
        selected.player_one = defaults.player_one;
        selected.player_two = defaults.player_two;
        selected.game_history = Some(Vec::new());
        // A manually prepared match must not report against the previous start.gg set.
        selected.set_id = None;
        selected.report_baseline = None;
        selected.event_id = None;
        selected.tournament_slug = None;
        selected.state = None;
        selected.reported_outcome = None;
        selected.upstream_reset = None;
        selected.winners_side_entrant_id = None;
        selected.updated_at = next_timestamp(&current.selected_set.updated_at).map_err(invalid)?;
        validate_state(&next).map_err(invalid)?;
        let payload = serde_json::to_string(&next)
            .map_err(|_| invalid("Unable to serialize local stream state.".to_owned()))?;
        // With no set ID, persistence updates the stream without replacing its old set override.
        persist_stream_state(database, &next, &payload).map_err(invalid)?;
        self.record_matchup_change(&current.selected_set, &next.selected_set);
        *current = next;
        drop(current);
        let _ = self.updates.send(payload.clone());
        serde_json::from_str(&payload)
            .map_err(|_| invalid("Unable to serialize local stream state.".to_owned()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        player_library::Profile,
        state::{GameResult, ReportOutcome, ReportOutcomeKind},
    };
    use std::path::Path;

    #[test]
    fn clearing_players_keeps_setup_profiles_and_previous_match_progress() {
        for tournament_match in [false, true] {
            let database = Database::open(Path::new(":memory:")).unwrap();
            database
                .observe_players(vec![(
                    "10".into(),
                    Profile {
                        name: "Alpha".into(),
                        ..Profile::default()
                    },
                )])
                .unwrap();
            let profile =
                serde_json::to_value(database.library_resolve(None, Some("10")).unwrap()).unwrap();
            let mut before = default_state();
            let selected = &mut before.selected_set;
            selected.player_one = serde_json::from_value(serde_json::json!({
                "entrantId": "10", "playerId": "10", "localPlayerId": "saved-alpha",
                "name": "Alpha", "prefix": "Team", "sponsor": "Sponsor", "score": 1,
                "country": "JP", "displayFlag": "pride:transgender", "state": "Tokyo",
                "pronouns": "they/them", "xHandle": "alpha", "seed": 4,
                "characters": ["Ryu"], "character": "Ryu", "characterAssetId": "Ryu.png",
                "portraitAssetId": "Ryu.png", "playerPhotoAssetId": "alpha.png"
            }))
            .unwrap();
            selected.player_two = selected.player_one.clone();
            selected.player_two.entrant_id = "20".into();
            selected.player_two.name = "Beta".into();
            selected.player_two.score = 0;
            selected.game_history = Some(vec![GameResult {
                winner_id: "10".into(),
                selections: vec![],
            }]);
            selected.game_name = Some("Street Fighter 6".into());
            selected.styling_game_id = Some("tekken-8".into());
            selected.broadcast.as_mut().unwrap().info_left = Some("!bracket".into());
            if tournament_match {
                selected.set_id = Some("100".into());
                selected.event_id = Some("200".into());
                selected.tournament_slug = Some("autumn-finals".into());
                selected.state = Some("3".into());
                selected.winners_side_entrant_id = Some("10".into());
                selected.upstream_reset = Some(true);
                selected.reported_outcome = Some(ReportOutcome {
                    kind: ReportOutcomeKind::WinLoss,
                    winner_id: "10".into(),
                });
            }
            let saved_set = serde_json::to_string(selected).unwrap();
            database
                .save_stream_state(
                    &serde_json::to_string(&before).unwrap(),
                    &before.selected_set.updated_at,
                    tournament_match.then_some(("100", saved_set.as_str())),
                )
                .unwrap();
            let store = OverlayStore::load(&database).unwrap();
            let original = serde_json::to_value(&before).unwrap();
            let cleared = store
                .clear_players(&database, &before.selected_set.updated_at)
                .unwrap();
            let selected = &cleared["selectedSet"];
            let defaults = serde_json::to_value(default_state()).unwrap();
            assert_eq!(selected["playerOne"], defaults["selectedSet"]["playerOne"]);
            assert_eq!(selected["playerTwo"], defaults["selectedSet"]["playerTwo"]);
            assert_eq!(selected["gameHistory"], serde_json::json!([]));
            for field in [
                "gameId",
                "gameName",
                "stylingGameId",
                "bestOf",
                "matchFormat",
                "broadcast",
                "displayName",
            ] {
                assert_eq!(selected[field], original["selectedSet"][field], "{field}");
            }
            for field in [
                "setId",
                "eventId",
                "tournamentSlug",
                "state",
                "reportedOutcome",
                "upstreamReset",
                "winnersSideEntrantId",
            ] {
                assert!(selected.get(field).is_none(), "{field}");
            }
            assert_eq!(
                serde_json::to_value(database.library_resolve(None, Some("10")).unwrap()).unwrap(),
                profile
            );
            if tournament_match {
                assert_eq!(
                    database.load_set_override("100").unwrap().as_deref(),
                    Some(saved_set.as_str())
                );
            }
            assert_eq!(
                OverlayStore::load(&database).unwrap().current().unwrap(),
                cleared
            );
        }
    }

    #[test]
    fn stale_clear_leaves_the_newer_match_untouched() {
        let database = Database::open(Path::new(":memory:")).unwrap();
        let store = OverlayStore::load(&database).unwrap();
        let version = store.selected_set().unwrap().updated_at;
        store.set_score(&database, "one", 1).unwrap();
        let before = store.current().unwrap();
        assert!(matches!(
            store.clear_players(&database, &version),
            Err(UpdateSelectedSetError::Conflict(_))
        ));
        assert_eq!(store.current().unwrap(), before);
    }
}
