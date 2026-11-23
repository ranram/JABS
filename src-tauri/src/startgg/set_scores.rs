use super::{finite_i64, normalized_id};
use crate::state::{ReportOutcome, ReportOutcomeKind};
use serde_json::Value;

pub(super) fn completed_double_dq(state: Option<&str>, slots: &[&Value]) -> Option<bool> {
    let [one, two] = slots else { return None };
    if state != Some("3") {
        return None;
    }
    // A partial response cannot confirm or clear a double DQ.
    let scores = (raw_slot_score(one)?, raw_slot_score(two)?);
    Some(scores == (-1, -1))
}

pub(super) fn summary_reported_outcome(
    state: Option<&str>,
    winner_id: Option<&str>,
    slots: &[&Value],
) -> Option<ReportOutcome> {
    if state != Some("3") {
        return None;
    }
    let winner_id = winner_id?;
    let one = slots
        .first()?
        .pointer("/entrant/id")
        .and_then(normalized_id)?;
    let two = slots
        .get(1)?
        .pointer("/entrant/id")
        .and_then(normalized_id)?;
    if one == two || (winner_id != one && winner_id != two) {
        return None;
    }
    // Read DQ before slot_score clamps negative API values for numeric controls.
    let one_score = raw_slot_score(slots.first()?);
    let two_score = raw_slot_score(slots.get(1)?);
    let (winner_score, loser_score) = if winner_id == one {
        (one_score, two_score)
    } else {
        (two_score, one_score)
    };
    let kind = if loser_score == Some(-1) && winner_score != Some(-1) {
        ReportOutcomeKind::Disqualification
    } else if one_score.unwrap_or(0) == 0 && two_score.unwrap_or(0) == 0 {
        ReportOutcomeKind::WinLoss
    } else {
        return None;
    };
    Some(ReportOutcome {
        kind,
        winner_id: winner_id.to_owned(),
    })
}

fn raw_slot_score(slot: &Value) -> Option<i64> {
    finite_i64(slot.pointer("/standing/stats/score/value"))
}

pub(super) fn slot_score(slot: &Value) -> Option<i64> {
    raw_slot_score(slot).map(|score| score.max(0))
}
