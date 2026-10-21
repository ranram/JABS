use super::{StatsContext, queries};
use crate::{
    runtime::RuntimeState,
    startgg::{finite_i64, finite_u64, normalized_id, safe_history_text},
};
use jabs_startgg_client::ApiError;
use serde::Serialize;
use serde_json::{Value, json};
use std::collections::HashSet;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunSet {
    id: String,
    opponent: String,
    event_name: String,
    phase: String,
    round: String,
    outcome: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    player_score: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    opponent_score: Option<u64>,
    player_dq: bool,
    opponent_dq: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    completed_at: Option<u64>,
}

pub struct RunResult {
    pub sets: Vec<RunSet>,
    pub error: Option<String>,
}

pub async fn load_run(
    runtime: &RuntimeState,
    context: &StatsContext,
    tournament_id: &str,
) -> RunResult {
    let query = queries::run_query();
    load_pages(context, tournament_id, |page| {
        let vars =
            json!({"eventId": context.event_id, "entrantId": context.entrant_id, "page": page});
        crate::startgg::request::<Value>(runtime, &query, vars)
    })
    .await
}

async fn load_pages<F, Fut>(context: &StatsContext, tournament_id: &str, mut fetch: F) -> RunResult
where
    F: FnMut(u64) -> Fut,
    Fut: std::future::Future<Output = Result<Value, ApiError>>,
{
    let mut result = RunResult {
        sets: vec![],
        error: None,
    };
    let mut ids = HashSet::new();
    let mut page = 1;
    // Follow every page. A safety ceiling is reported as incomplete, never silently truncated.
    loop {
        let response = fetch(page).await;
        let data = match response {
            Ok(data) => data,
            Err(error) => {
                result.error = Some(error.error);
                break;
            }
        };
        let connection = data.pointer("/event/sets");
        let nodes = connection
            .and_then(|sets| sets.get("nodes"))
            .and_then(Value::as_array);
        let pages = connection
            .and_then(|sets| sets.pointer("/pageInfo/totalPages"))
            .and_then(Value::as_u64);
        let (Some(nodes), Some(pages)) = (nodes, pages) else {
            result.error = Some("start.gg returned an unreadable tournament run.".into());
            break;
        };
        for node in nodes {
            if let Some(set) = parse_set(node, context, tournament_id) {
                if ids.insert(set.id.clone()) {
                    result.sets.push(set);
                }
            }
        }
        if page >= pages {
            break;
        }
        if page >= 100 || nodes.is_empty() {
            result.error = Some("The tournament run is incomplete. Refresh to try again.".into());
            break;
        }
        page += 1;
    }
    result.sets.sort_by_key(|set| {
        (
            set.completed_at.unwrap_or(0),
            set.id.parse::<u64>().unwrap_or(0),
        )
    });
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    fn context() -> StatsContext {
        StatsContext {
            event_id: Some("event".into()),
            game_id: "game".into(),
            player_id: Some("player".into()),
            entrant_id: "entrant".into(),
        }
    }
    fn set(id: u64) -> Value {
        json!({"id": id, "state": 3, "winnerId": "other", "completedAt": id,
        "event": {"id": "event", "name": "Singles", "tournament": {"id": "tournament"}},
        "fullRoundText": "Losers Final", "phaseGroup": {"phase": {"name": "Top 8"}},
        "slots": [
            {"entrant": {"id": "other", "name": "Opponent"}, "standing": {"stats": {"score": {"value": 3}}}},
            {"entrant": {"id": "entrant", "participants": [{"player": {"id": "player"}}]}, "standing": {"stats": {"score": {"value": -1}}}}
        ]})
    }

    #[tokio::test]
    async fn loads_all_pages_and_keeps_partial_runs_honest() {
        let context = context();
        let result = load_pages(&context, "tournament", |page| async move {
            Ok(json!({"event": {"sets": {"pageInfo": {"totalPages": 7}, "nodes": [set(8 - page), set(8 - page)]}}}))
        }).await;
        assert!(result.error.is_none());
        assert_eq!(result.sets.len(), 7);
        assert_eq!(result.sets.first().unwrap().id, "1");
        let first = &result.sets[0];
        assert!(first.player_dq);
        assert_eq!(first.player_score, None);
        assert_eq!(first.opponent_score, Some(3));
        assert_eq!(first.outcome, "loss");
        assert_eq!(first.round, "Losers Final");
        let mut numeric = set(8);
        numeric["slots"][0]["standing"]["stats"]["score"]["value"] = json!(3.0);
        numeric["slots"][1]["standing"]["stats"]["score"]["value"] = json!(2.0);
        numeric["completedAt"] = json!(1.0);
        let numeric = parse_set(&numeric, &context, "tournament").unwrap();
        assert_eq!(numeric.player_score, Some(2));
        assert_eq!(numeric.opponent_score, Some(3));
        assert_eq!(numeric.completed_at, Some(1));
        let partial = load_pages(&context, "tournament", |page| async move {
            if page == 2 {
                Err(jabs_startgg_client::api_error("Offline", "network"))
            } else {
                Ok(json!({"event": {"sets": {"pageInfo": {"totalPages": 2}, "nodes": [set(1)]}}}))
            }
        })
        .await;
        assert_eq!(partial.sets.len(), 1);
        assert_eq!(partial.error.as_deref(), Some("Offline"));

        let mut other_event = set(2);
        other_event["slots"][1]["entrant"]["id"] = json!("another-event-entrant");
        other_event["event"]["id"] = json!("other-event");
        assert!(parse_set(&other_event, &context, "tournament").is_none());
        let mixed = load_pages(&context, "tournament", |page| {
            let other_event = other_event.clone();
            async move {
                let mut nodes = vec![other_event];
                for id in [page * 2 + 1, page * 2 + 2] {
                    let mut win = set(id);
                    win["winnerId"] = json!("entrant");
                    win["slots"][1]["standing"]["stats"]["score"]["value"] = json!(3);
                    win["slots"][0]["standing"]["stats"]["score"]["value"] = json!(2);
                    nodes.push(win);
                }
                Ok(json!({"event": {"sets": {"pageInfo": {"totalPages": 2}, "nodes": nodes}}}))
            }
        })
        .await;
        assert!(mixed.error.is_none());
        assert_eq!(mixed.sets.len(), 4);
        assert!(mixed.sets.iter().all(|set| set.outcome == "win"));
        other_event["event"]["id"] = json!("event");
        other_event["event"]["tournament"]["id"] = json!("different-tournament");
        assert!(parse_set(&other_event, &context, "tournament").is_none());
        let mut pending = set(3);
        pending["state"] = json!(1);
        assert!(parse_set(&pending, &context, "tournament").is_none());
        let mut unknown = set(4);
        unknown["winnerId"] = Value::Null;
        assert_eq!(
            parse_set(&unknown, &context, "tournament").unwrap().outcome,
            "unknown"
        );
    }
}

fn parse_set(node: &Value, context: &StatsContext, tournament_id: &str) -> Option<RunSet> {
    let event_id = context.event_id.as_deref()?;
    // A linked player may enter multiple games at one tournament. Never mix
    // another event into the selected bracket's matches or its win/loss record.
    if node.pointer("/event/id").and_then(normalized_id).as_deref() != Some(event_id)
        || node.get("state").and_then(normalized_id).as_deref() != Some("3")
        || node
            .pointer("/event/tournament/id")
            .and_then(normalized_id)
            .as_deref()
            != Some(tournament_id)
    {
        return None;
    }
    let slots = node.get("slots")?.as_array()?;
    if slots.len() != 2 {
        return None;
    }
    let own = slots.iter().position(|slot| {
        let entrant = slot.get("entrant").unwrap_or(&Value::Null);
        entrant.get("id").and_then(normalized_id).as_deref() == Some(&context.entrant_id)
            || context.player_id.as_ref().is_some_and(|id| {
                entrant
                    .get("participants")
                    .and_then(Value::as_array)
                    .is_some_and(|participants| {
                        participants.iter().any(|participant| {
                            participant
                                .pointer("/player/id")
                                .and_then(normalized_id)
                                .as_ref()
                                == Some(id)
                        })
                    })
            })
    })?;
    let player = &slots[own];
    let opponent = &slots[1 - own];
    let player_id = player.pointer("/entrant/id").and_then(normalized_id);
    let opponent_id = opponent.pointer("/entrant/id").and_then(normalized_id);
    // Byes have no opponent and are not played matches.
    if opponent_id.is_none() {
        return None;
    }
    let winner = node.get("winnerId").and_then(normalized_id);
    let outcome = match winner {
        Some(ref id) if Some(id) == player_id.as_ref() => "win",
        Some(ref id) if Some(id) == opponent_id.as_ref() => "loss",
        _ => "unknown",
    };
    let score = |slot: &Value| finite_i64(slot.pointer("/standing/stats/score/value"));
    let own_score = score(player);
    let other_score = score(opponent);
    Some(RunSet {
        id: node.get("id").and_then(normalized_id)?,
        opponent: safe_history_text(opponent.pointer("/entrant/name"), "Unknown opponent"),
        event_name: safe_history_text(node.pointer("/event/name"), "Event"),
        phase: safe_history_text(node.pointer("/phaseGroup/phase/name"), ""),
        round: safe_history_text(node.get("fullRoundText"), ""),
        outcome,
        player_score: own_score
            .filter(|score| *score >= 0)
            .map(|score| score as u64),
        opponent_score: other_score
            .filter(|score| *score >= 0)
            .map(|score| score as u64),
        player_dq: own_score.is_some_and(|score| score < 0),
        opponent_dq: other_score.is_some_and(|score| score < 0),
        completed_at: finite_u64(node.get("completedAt")),
    })
}
