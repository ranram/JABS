use super::{OverlayStore, SelectedSet};
use crate::database::Database;
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// The last fetched start.gg result, kept separate from local score edits.
#[derive(Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ReportBaseline {
    pub state: Option<String>,
    pub player_one_entrant_id: String,
    pub player_two_entrant_id: String,
    pub player_one_score: u32,
    pub player_two_score: u32,
}

impl ReportBaseline {
    pub fn from_set(set: &SelectedSet) -> Self {
        Self {
            state: set.state.clone(),
            player_one_entrant_id: set.player_one.entrant_id.clone(),
            player_two_entrant_id: set.player_two.entrant_id.clone(),
            player_one_score: set.player_one.score,
            player_two_score: set.player_two.score,
        }
    }

    pub fn same_entrants(&self, set: &SelectedSet) -> bool {
        let one = &set.player_one.entrant_id;
        let two = &set.player_two.entrant_id;
        (one == &self.player_one_entrant_id && two == &self.player_two_entrant_id)
            || (one == &self.player_two_entrant_id && two == &self.player_one_entrant_id)
    }
}

impl SelectedSet {
    pub(crate) fn winner(&self) -> Option<&'static str> {
        if self.upstream_reset == Some(true) {
            return None;
        }
        if let Some(outcome) = &self.reported_outcome {
            return if outcome.winner_id == self.player_one.entrant_id {
                Some("one")
            } else if outcome.winner_id == self.player_two.entrant_id {
                Some("two")
            } else {
                None
            };
        }
        let imported_result =
            self.match_format.as_deref() != Some("topanga") && self.state.as_deref() == Some("3");
        self.score_winner(imported_result)
    }

    fn score_winner(&self, allow_leading_score: bool) -> Option<&'static str> {
        let one = self.player_one.score;
        let two = self.player_two.score;
        if one == two {
            return None;
        }
        let (high, low) = (one.max(two), one.min(two));
        let topanga = self.match_format.as_deref() == Some("topanga");
        let complete = if topanga {
            high >= 7 && (high - low >= 2 || high == 10)
        } else {
            high > self.best_of / 2
        };
        (complete || allow_leading_score).then_some(if one > two { "one" } else { "two" })
    }

    fn has_broadcast_winner_conflict(&self) -> bool {
        self.set_id.is_some()
            && self.upstream_reset != Some(true)
            && self.reported_outcome.as_ref().is_some_and(|outcome| {
                let opponent = match self.score_winner(false) {
                    Some("one") => &self.player_two,
                    Some("two") => &self.player_one,
                    _ => return false,
                };
                outcome.winner_id == opponent.entrant_id
            })
    }

    pub(super) fn same_broadcast_result(&self, previous: &Self) -> bool {
        let current_scores = [
            (&self.player_one.entrant_id, self.player_one.score),
            (&self.player_two.entrant_id, self.player_two.score),
        ];
        let previous_scores = [
            (&previous.player_one.entrant_id, previous.player_one.score),
            (&previous.player_two.entrant_id, previous.player_two.score),
        ];
        self.set_id == previous.set_id
            && self.event_id == previous.event_id
            && self.state == previous.state
            && (current_scores == previous_scores
                || current_scores == [previous_scores[1], previous_scores[0]])
            && self.best_of == previous.best_of
            && self.match_format == previous.match_format
            && self.upstream_reset == previous.upstream_reset
            && self.reported_outcome == previous.reported_outcome
    }

    /// Keep old scores invalid after a bracket reset, including legacy saved results.
    pub(crate) fn result_reset_after_refresh(
        &self,
        upstream_state: &str,
        reset_observed: bool,
    ) -> Option<bool> {
        match upstream_state {
            "3" => Some(false),
            "1" | "2"
                if self.state.as_deref() == Some("3")
                    || reset_observed
                    || (self.upstream_reset.is_none() && self.winner().is_some()) =>
            {
                Some(true)
            }
            _ => self.upstream_reset,
        }
    }
}

impl OverlayStore {
    pub(crate) fn choose_broadcast_winner(
        &self,
        database: &Database,
        updated_at: &str,
        use_reported: bool,
    ) -> Result<Value, String> {
        self.mutate(database, |selected| {
            if selected.updated_at != updated_at || !selected.has_broadcast_winner_conflict() {
                return Err("The live set changed. Review it and try again.".to_owned());
            }
            selected.use_reported_broadcast_winner = use_reported;
            Ok(())
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn broadcast_choice_survives_presentation_edits_and_expires_when_the_result_changes() {
        let database = Database::open(Path::new(":memory:")).unwrap();
        let overlay = OverlayStore::load(&database).unwrap();
        let assets = Path::new("/jabs-no-test-assets");
        let mut set = overlay.selected_set().unwrap();
        set.set_id = Some("100".into());
        set.event_id = Some("456".into());
        set.best_of = 5;
        set.player_one.entrant_id = "10".into();
        set.player_two.entrant_id = "20".into();
        set.player_one.score = 3;
        set.game_history = None;
        overlay
            .replace_selected_set(&database, assets, assets, set)
            .unwrap();

        let report = |winner: &str| {
            serde_json::json!({
                "id": "100", "state": "3", "winnerId": winner,
                "entrantOne": {"id": "10"}, "entrantTwo": {"id": "20"}
            })
        };
        let observe = |summary: Value| {
            overlay
                .observe_bracket_state(&database, "456", &[summary], &[])
                .unwrap();
            overlay.selected_set().unwrap()
        };
        let wrong_report = observe(report("20"));
        assert_eq!(wrong_report.player_one.score, 3);
        assert!(!wrong_report.use_reported_broadcast_winner);

        // Generic stream edits cannot select the upstream winner.
        let mut draft = wrong_report.clone();
        draft.use_reported_broadcast_winner = true;
        overlay
            .update_selected_set(&database, assets, assets, draft)
            .unwrap();
        let current = overlay.selected_set().unwrap();
        assert!(!current.use_reported_broadcast_winner);
        assert!(
            overlay
                .choose_broadcast_winner(&database, &wrong_report.updated_at, true)
                .is_err()
        );

        let (_, mut updates) = overlay.subscribe_with_snapshot().unwrap();
        overlay
            .choose_broadcast_winner(&database, &current.updated_at, true)
            .unwrap();
        let published: crate::state::OverlayState =
            serde_json::from_str(&updates.try_recv().unwrap()).unwrap();
        assert!(published.selected_set.use_reported_broadcast_winner);
        let mut draft = published.selected_set;
        draft.display_name = "Stream label".into();
        draft.use_reported_broadcast_winner = false;
        overlay
            .update_selected_set(&database, assets, assets, draft)
            .unwrap();
        overlay.swap_players(&database).unwrap();
        let still_wrong = observe(report("20"));
        assert!(still_wrong.use_reported_broadcast_winner);
        assert_eq!(still_wrong.player_two.score, 3);

        overlay
            .choose_broadcast_winner(&database, &still_wrong.updated_at, false)
            .unwrap();
        let local = overlay.selected_set().unwrap();
        assert!(!local.use_reported_broadcast_winner);
        assert!(local.reported_outcome == still_wrong.reported_outcome);
        assert_eq!(local.player_two.score, 3);
        overlay
            .choose_broadcast_winner(&database, &local.updated_at, true)
            .unwrap();

        let corrected = observe(report("10"));
        assert!(!corrected.use_reported_broadcast_winner);
        assert!(
            overlay
                .choose_broadcast_winner(&database, &still_wrong.updated_at, true)
                .is_err()
        );
        assert!(
            overlay
                .choose_broadcast_winner(&database, &corrected.updated_at, true)
                .is_err()
        );

        let conflicting_again = observe(report("20"));
        assert!(!conflicting_again.use_reported_broadcast_winner);
        overlay
            .choose_broadcast_winner(&database, &conflicting_again.updated_at, true)
            .unwrap();
        let reopened = observe(serde_json::json!({"id": "100", "state": "1"}));
        assert!(!reopened.use_reported_broadcast_winner);
        assert!(reopened.reported_outcome.is_none());
    }
}
