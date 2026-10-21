use super::{ApiError, append_history_page, head_to_head_sets, invalid_response, retried_history_request};
use crate::{runtime::RuntimeState, startgg_queries, state::SelectedSet, versus_screen::VersusHistory};
use futures_util::future::join_all;
use serde_json::{Value, json};
use std::{collections::HashSet, future::Future};

// Bound public reads while allowing older meetings beyond 100 recent sets.
const MAX_PLAYER_HISTORY_PAGES: u32 = 40;

pub(super) async fn exhibition_history(
    runtime: &RuntimeState,
    selected: &SelectedSet,
) -> Result<VersusHistory, ApiError> {
    let context = crate::versus_history::HistoryMatch::from_set(selected)
        .ok_or_else(|| invalid_response("Choose a game and link both players to their start.gg profiles."))?;
    let game = selected.videogame_id.as_deref()
        .ok_or_else(|| invalid_response("Choose an exhibition game first."))?;
    let page = |number| retried_history_request(
        runtime,
        startgg_queries::PLAYER_SET_HISTORY,
        json!({ "playerId": context.player_one_id, "page": number, "perPage": super::SAFE_SET_PAGE_SIZE }),
    );
    // No event or entrant IDs exist for exhibitions. Search these players' public
    // set history and retain only completed meetings in the selected game.
    let sets = player_sets(
        Ok(page(1).await?), &context.player_one_id, &context.player_two_id, game, page,
    ).await?;
    Ok(VersusHistory {
        tournament_name: None,
        player_one_placements: vec![],
        player_two_placements: vec![],
        head_to_head: head_to_head_sets(&sets, &context.player_one_id, &context.player_two_id, game)?,
    })
}

pub(super) async fn player_sets<F, Fut>(
    first: Result<Value, ApiError>,
    player_one: &str,
    player_two: &str,
    game: &str,
    fetch: F,
) -> Result<Vec<Value>, ApiError>
where
    F: Fn(u32) -> Fut,
    Fut: Future<Output = Result<Value, ApiError>>,
{
    let mut sets = Vec::new();
    let mut ids = HashSet::new();
    let total_pages = first
        .ok()
        .and_then(|data| {
            append_history_page(
                &data,
                "player",
                "global player set history",
                &mut sets,
                &mut ids,
            )
            .ok()
        })
        .unwrap_or(0)
        .min(MAX_PLAYER_HISTORY_PAGES);
    for first_page in (2..=total_pages).step_by(2) {
        if head_to_head_sets(&sets, player_one, player_two, game)?.len() >= 4 {
            break;
        }
        let responses =
            join_all((first_page..=(first_page + 1).min(total_pages)).map(&fetch)).await;
        for data in responses.into_iter().flatten() {
            let _ = append_history_page(
                &data,
                "player",
                "global player set history",
                &mut sets,
                &mut ids,
            );
        }
    }
    Ok(sets)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::sync::Mutex;

    fn meeting(id: u32, opponent: u32, game: u32, state: u32) -> Value {
        json!({
            "id": id, "state": state, "completedAt": 1000 - id,
            "event": {"name": "Singles", "videogame": {"id": game}, "tournament": {"name": "Local"}},
            "slots": [
                {"entrant": {"participants": [{"player": {"id": 1}}]}, "standing": {"stats": {"score": {"value": 3}}}},
                {"entrant": {"participants": [{"player": {"id": opponent}}]}, "standing": {"stats": {"score": {"value": 2}}}}
            ]
        })
    }

    fn page(nodes: Vec<Value>, total_pages: u32) -> Value {
        json!({"player": {"sets": {"pageInfo": {"totalPages": total_pages}, "nodes": nodes}}})
    }

    #[test]
    fn searches_beyond_five_pages_until_four_same_game_meetings_and_keeps_a_read_bound() {
        tokio::runtime::Runtime::new().unwrap().block_on(async {
            let calls = Mutex::new(Vec::new());
            let sets = player_sets(
                Ok(page(vec![meeting(1, 2, 10, 3)], 50)),
                "1",
                "2",
                "10",
                |number| {
                    calls.lock().unwrap().push(number);
                    let nodes = match number {
                        2 => vec![meeting(1, 2, 10, 3), meeting(2, 3, 10, 3)],
                        3 => vec![meeting(3, 2, 99, 3), meeting(4, 2, 10, 2)],
                        6 => vec![meeting(5, 2, 10, 3), meeting(6, 2, 10, 3)],
                        8 => vec![meeting(7, 2, 10, 3)],
                        _ => vec![],
                    };
                    async move { Ok(page(nodes, 50)) }
                },
            )
            .await
            .unwrap();
            assert_eq!(*calls.lock().unwrap(), (2..=9).collect::<Vec<_>>());
            let results = head_to_head_sets(&sets, "1", "2", "10").unwrap();
            assert_eq!(
                results
                    .iter()
                    .map(|set| set.set_id.as_deref().unwrap())
                    .collect::<Vec<_>>(),
                ["1", "5", "6", "7"]
            );
            calls.lock().unwrap().clear();
            player_sets(Ok(page(vec![], 100)), "1", "2", "10", |number| {
                calls.lock().unwrap().push(number);
                async { Ok(page(vec![], 100)) }
            })
            .await
            .unwrap();
            assert_eq!(
                *calls.lock().unwrap(),
                (2..=MAX_PLAYER_HISTORY_PAGES).collect::<Vec<_>>()
            );
        });
    }
}
