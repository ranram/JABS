use super::SelectedSet;
use serde::{Deserialize, Serialize};

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
        let imported_result = !topanga && self.state.as_deref() == Some("3");
        (complete || imported_result).then_some(if one > two { "one" } else { "two" })
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
