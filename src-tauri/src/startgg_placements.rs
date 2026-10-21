//! Shared placement parsing for Versus (three results) and Player Stats (five).
use crate::startgg::{finite_u64, node_list, normalized_id, safe_history_text};
use jabs_startgg_client::ApiError;
use serde::Serialize;
use serde_json::{Map, Value};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentPlacement {
    #[serde(flatten)]
    pub placing: crate::versus_screen::Placement,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub logo_asset_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub num_entrants: Option<u64>,
    #[serde(skip)]
    pub logo_url: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn shares_game_filtering_and_ordering_but_stats_keeps_five_logos() {
        let mut standings = (1..=7).map(|number| json!({
            "placement": number,
            "entrant": {"event": {"name": "Singles", "numEntrants": 2048 + number, "videogame": {"id": 10}, "tournament": {
                "id": number, "name": format!("Tournament {number}"), "startAt": number,
                "images": [{"url": format!("https://images.start.gg/images/{number}.png")}]
            }}}
        })).collect::<Vec<_>>();
        let mut wrong_game = standings[0].clone();
        wrong_game["entrant"]["event"]["videogame"]["id"] = json!(20);
        standings.push(wrong_game);
        let player = json!({"recentStandings": standings});
        let five = recent_placements(player.as_object().unwrap(), "10", 5).unwrap();
        assert_eq!(five.len(), 5);
        assert_eq!(five[0].placing.placement, 7);
        assert_eq!(five[0].logo_asset_id.as_deref(), Some("7"));
        assert_eq!(five[0].num_entrants, Some(2055));
        let serialized = serde_json::to_value(&five[0]).unwrap();
        assert_eq!(serialized["numEntrants"], 2055);
        for invalid in [Value::Null, json!(0), json!(-1), json!(3.5), json!("2048")] {
            let mut missing_count = player.clone();
            missing_count["recentStandings"][6]["entrant"]["event"]["numEntrants"] = invalid;
            let placing = recent_placements(missing_count.as_object().unwrap(), "10", 5).unwrap();
            assert_eq!(placing[0].num_entrants, None);
            assert!(
                serde_json::to_value(&placing[0])
                    .unwrap()
                    .get("numEntrants")
                    .is_none()
            );
        }
        assert_eq!(
            recent_placements(player.as_object().unwrap(), "10", 3)
                .unwrap()
                .len(),
            3
        );
        let mut unsafe_image = player.clone();
        unsafe_image["recentStandings"][6]["entrant"]["event"]["tournament"]["images"] =
            json!([{"url": "http://127.0.0.1/private"}]);
        assert!(
            recent_placements(unsafe_image.as_object().unwrap(), "10", 5).unwrap()[0]
                .logo_asset_id
                .is_none()
        );
    }
}

pub fn recent_placements(
    player: &Map<String, Value>,
    game_id: &str,
    limit: usize,
) -> Result<Vec<RecentPlacement>, ApiError> {
    let nodes = node_list(player.get("recentStandings"), "recent player standings")?;
    let mut results = nodes
        .into_iter()
        .filter_map(|standing| {
            let placement = finite_u64(standing.get("placement")).filter(|value| *value > 0)?;
            let event = standing.pointer("/entrant/event")?;
            if event
                .pointer("/videogame/id")
                .and_then(normalized_id)
                .as_deref()
                != Some(game_id)
            {
                return None;
            }
            let tournament = event.get("tournament")?;
            let logo_url = tournament
                .get("images")
                .and_then(Value::as_array)
                .and_then(|images| {
                    images
                        .iter()
                        .filter_map(|image| image.get("url").and_then(Value::as_str))
                        .find(|url| jabs_startgg_client::is_tournament_image_url(url))
                        .map(str::to_owned)
                });
            let logo_asset_id = logo_url
                .as_ref()
                .and_then(|_| tournament.get("id").and_then(normalized_id));
            Some((
                finite_u64(tournament.get("startAt")).unwrap_or(0),
                RecentPlacement {
                    placing: crate::versus_screen::Placement {
                        placement,
                        tournament_name: safe_history_text(tournament.get("name"), "Tournament"),
                        event_name: safe_history_text(event.get("name"), "Event"),
                    },
                    logo_asset_id,
                    num_entrants: event
                        .get("numEntrants")
                        .and_then(Value::as_u64)
                        .filter(|count| *count > 0),
                    logo_url,
                },
            ))
        })
        .collect::<Vec<_>>();
    results.sort_by_key(|(at, _)| std::cmp::Reverse(*at));
    Ok(results
        .into_iter()
        .take(limit)
        .map(|(_, placing)| placing)
        .collect())
}
