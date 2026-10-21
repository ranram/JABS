use super::Scope;
use crate::{database::now_rfc3339, runtime::RuntimeState};
use serde_json::{json, Value};
use std::collections::HashSet;

const PAGE_SIZE: usize = 20;
const MAX_MATCHES: usize = 256;

const QUERY: &str = r#"
query BracketScreenPool($groupId: ID!, $page: Int!) {
  phaseGroup(id: $groupId) {
    id displayIdentifier state
    phase {
      id name
      phaseGroups(query: { page: 1, perPage: 1 }) { pageInfo { total } }
      event {
        id name tournament { name }
        phases { id phaseGroups(query: { page: 1, perPage: 1 }) { pageInfo { total } } }
      }
    }
    sets(page: $page, perPage: 20, sortType: STANDARD) {
      pageInfo { total totalPages }
      nodes {
        id round fullRoundText state winnerId
        slots {
          slotIndex prereqId prereqPlacement prereqType
          entrant { id name participants { gamerTag prefix user { location { country } } } }
          standing { stats { score { value } } }
        }
      }
    }
  }
}
"#;

const PROGRESSION_QUERY: &str = r#"
query BracketScreenProgression($groupId: ID!, $page: Int!) {
  phaseGroup(id: $groupId) {
    id phase { id event { id } }
    seeds(query: { page: $page, perPage: 20 }) {
      pageInfo { totalPages }
      nodes { entrant { id } progression }
    }
  }
}
"#;

pub(super) async fn read(runtime: &RuntimeState, scope: &Scope) -> Result<Value, String> {
    read_with(scope, |query, variables, anonymous| async move {
        if anonymous {
            runtime
                .startgg
                .request_anonymous(query, variables)
                .await
                .map_err(|error| error.error)
        } else {
            crate::startgg::request(runtime, query, variables)
                .await
                .map_err(|error| error.error)
        }
    })
    .await
}

async fn read_with<F, Fut>(scope: &Scope, mut fetch: F) -> Result<Value, String>
where
    F: FnMut(&'static str, Value, bool) -> Fut,
    Fut: std::future::Future<Output = Result<Value, String>>,
{
    let mut matches = Vec::new();
    let mut ids = HashSet::new();
    let mut first_group = Value::Null;
    let mut advances = Vec::new();
    let mut total = 0;
    for page in 1..=MAX_MATCHES.div_ceil(PAGE_SIZE) {
        // Match loading uses the same authenticated/public transport as the set browser.
        let data: Value = fetch(
            QUERY,
            json!({ "groupId": scope.phase_group_id, "page": page }),
            false,
        )
        .await?;
        let group = &data["phaseGroup"];
        verify_scope(group, scope)?;
        let count = group["sets"]["pageInfo"]["total"]
            .as_u64()
            .ok_or("Could not read the pool's set count.")? as usize;
        let nodes = group["sets"]["nodes"]
            .as_array()
            .ok_or("Could not read the pool's sets.")?;
        if count > MAX_MATCHES {
            return Err(
                "This pool has more than 256 sets. Select a smaller pool or phase group.".into(),
            );
        }
        if page == 1 {
            total = count;
            first_group = group.clone();
        }
        if count != total || nodes.len() > PAGE_SIZE {
            return Err("The bracket changed while loading. Refresh it again.".into());
        }
        for node in nodes {
            let entry = parse_match(node)?;
            let match_id = entry["id"]
                .as_str()
                .ok_or("Could not read a bracket set ID.")?;
            if !ids.insert(match_id.to_owned()) {
                return Err("The bracket changed while loading. Refresh it again.".into());
            }
            matches.push(entry);
        }
        if matches.len() >= total {
            break;
        }
        if nodes.is_empty() && matches.len() < total {
            return Err("Could not load the complete pool. Refresh it again.".into());
        }
    }
    if matches.len() != total {
        return Err("Could not load the complete pool. Refresh it again.".into());
    }
    // Progression is website-only metadata. Its availability must not erase valid matches.
    for page in 1..=MAX_MATCHES.div_ceil(PAGE_SIZE) {
        let Ok(data) = fetch(
            PROGRESSION_QUERY,
            json!({ "groupId": scope.phase_group_id, "page": page }),
            true,
        )
        .await
        else {
            break;
        };
        let group = &data["phaseGroup"];
        if verify_scope(group, scope).is_err() {
            break;
        }
        let pages = group["seeds"]["pageInfo"]["totalPages"]
            .as_u64()
            .unwrap_or(0) as usize;
        if pages > MAX_MATCHES.div_ceil(PAGE_SIZE) {
            break;
        }
        if let Some(seeds) = group["seeds"]["nodes"].as_array() {
            advances.extend(seeds.iter().filter_map(parse_advance));
        }
        if page >= pages {
            break;
        }
    }
    if let Some(phases) = first_group["phase"]["event"]["phases"].as_array() {
        for advance in &mut advances {
            if let Some(phase) = phases
                .iter()
                .find(|phase| id(&phase["id"]) == id(&advance["phaseId"]))
            {
                advance["groupCount"] = phase["phaseGroups"]["pageInfo"]["total"].clone();
            }
        }
    }
    Ok(json!({
        "scope": scope,
        "tournamentName": text(&first_group["phase"]["event"]["tournament"]["name"]).unwrap_or_default(),
        "eventName": text(&first_group["phase"]["event"]["name"]).unwrap_or_default(),
        "phaseName": text(&first_group["phase"]["name"]).unwrap_or_default(),
        "groupName": text(&first_group["displayIdentifier"]).unwrap_or_default(),
        "groupCount": first_group["phase"]["phaseGroups"]["pageInfo"]["total"].as_u64().unwrap_or(0),
        "completed": number(&first_group["state"]) == Some(3) || first_group["state"].as_str() == Some("COMPLETED"),
        "matches": matches, "advances": advances, "fetchedAt": now_rfc3339()?
    }))
}
fn parse_advance(seed: &Value) -> Option<Value> {
    let progression = &seed["progression"];
    Some(json!({
        "entrantId": id(&seed["entrant"]["id"])?,
        "phaseId": id(&progression["destPhaseId"])?,
        "groupId": id(&progression["destPhaseGroupId"])?,
        "phaseName": text(&progression["phaseName"])?,
        "groupName": text(&progression["phaseGroupDisplay"])?
    }))
}
fn verify_scope(group: &Value, scope: &Scope) -> Result<(), String> {
    if id(&group["id"]).as_ref() != Some(&scope.phase_group_id)
        || id(&group["phase"]["id"]).as_ref() != Some(&scope.phase_id)
        || id(&group["phase"]["event"]["id"]).as_ref() != Some(&scope.event_id)
    {
        return Err("That pool does not belong to the selected event and phase.".into());
    }
    Ok(())
}
fn id(value: &Value) -> Option<String> {
    let value = value
        .as_str()
        .map(str::to_owned)
        .or_else(|| value.as_u64().map(|id| id.to_string()))?;
    (!value.is_empty() && value.len() <= 20 && value.bytes().all(|byte| byte.is_ascii_digit()))
        .then_some(value)
}
fn number(value: &Value) -> Option<i64> {
    value.as_i64().or_else(|| value.as_str()?.parse().ok())
}
fn set_id(value: &Value) -> Option<String> {
    id(value).or_else(|| {
        value
            .as_str()
            .filter(|value| {
                value.starts_with("preview_")
                    && value.len() <= 88
                    && value
                        .bytes()
                        .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-')
            })
            .map(str::to_owned)
    })
}
fn text(value: &Value) -> Option<String> {
    crate::moderation::censor(
        value
            .as_str()
            .map(|text| text.chars().take(100).collect::<String>()),
    )
}
fn parse_match(node: &Value) -> Result<Value, String> {
    let match_id = set_id(&node["id"]).ok_or("Could not read a bracket set ID.")?;
    let round = number(&node["round"])
        .filter(|round| *round != 0 && (-100..=100).contains(round))
        .ok_or("This bracket screen supports elimination brackets. Select an elimination pool.")?;
    let state = number(&node["state"])
        .filter(|state| (1..=7).contains(state))
        .ok_or("Could not read a bracket set status.")?;
    let mut slots = node["slots"]
        .as_array()
        .filter(|slots| slots.len() == 2)
        .cloned()
        .ok_or("Could not read both bracket slots.")?;
    slots.sort_by_key(|slot| number(&slot["slotIndex"]).unwrap_or(0));
    let parsed = slots
        .iter()
        .map(|slot| {
            let entrant = &slot["entrant"];
            let participant = &entrant["participants"][0];
            let (country, _) = crate::catalogs::normalize_imported_location(
                participant["user"]["location"]["country"].as_str(),
                None,
            );
            let mut player = json!({});
            if let Some(id) = id(&entrant["id"]) {
                player["entrantId"] = json!(id);
                player["name"] = json!(text(&participant["gamerTag"])
                    .or_else(|| text(&entrant["name"]))
                    .unwrap_or_else(|| "TBD".into()));
                if let Some(sponsor) = text(&participant["prefix"]) {
                    player["sponsor"] = json!(sponsor);
                }
                if let Some(country) = country {
                    player["country"] = json!(country);
                }
            }
            if let Some(score) = number(&slot["standing"]["stats"]["score"]["value"])
                .filter(|score| (-1..=10000).contains(score))
            {
                player["score"] = json!(score);
            }
            if slot["prereqType"]
                .as_str()
                .is_some_and(|kind| kind.eq_ignore_ascii_case("set"))
            {
                if let (Some(set_id), Some(placement @ 1..=2)) =
                    (set_id(&slot["prereqId"]), number(&slot["prereqPlacement"]))
                {
                    player["prerequisite"] = json!({ "setId": set_id, "placement": placement });
                }
            }
            player
        })
        .collect::<Vec<_>>();
    let winner = id(&node["winnerId"]).filter(|winner| {
        state == 3
            && parsed
                .iter()
                .any(|slot| slot["entrantId"].as_str() == Some(winner))
    });
    let mut result = json!({ "id": match_id, "roundNumber": round, "round": text(&node["fullRoundText"]).unwrap_or_else(|| format!("Round {}", round.abs())),
        "state": state, "slots": parsed });
    if let Some(winner) = winner {
        result["winnerId"] = json!(winner);
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn published_sets_survive_unavailable_website_progression_and_use_bounded_pages() {
        let scope = Scope {
            event_id: "1".into(),
            phase_id: "2".into(),
            phase_group_id: "3".into(),
        };
        let mut requests = Vec::new();
        let snapshot = super::read_with(&scope, |query, variables, anonymous| {
            requests.push((query, anonymous));
            let page = variables["page"].as_u64().unwrap();
            let nodes = (if page == 1 { 1..=20 } else { 21..=21 }).map(|id| json!({
                "id": id, "round": 1, "fullRoundText": "Winners Round 1", "state": 3, "winnerId": 11,
                "slots": [{ "slotIndex": 0, "entrant": { "id": 11, "name": "Alpha" } }, { "slotIndex": 1, "entrant": { "id": 12, "name": "Beta" } }]
            })).collect::<Vec<_>>();
            async move {
                if anonymous { return Err("Public progression unavailable".to_owned()); }
                Ok(json!({ "phaseGroup": { "id": 3, "displayIdentifier": "1", "state": 3,
                    "phase": { "id": 2, "name": "Finals", "event": { "id": 1, "name": "Singles", "tournament": { "name": "Test" } } },
                    "sets": { "pageInfo": { "total": 21 }, "nodes": nodes } } }))
            }
        }).await.unwrap();
        assert_eq!(snapshot["matches"].as_array().unwrap().len(), 21);
        assert_eq!(snapshot["matches"][20]["id"], "21");
        assert!(snapshot["advances"].as_array().unwrap().is_empty());
        assert_eq!(requests.len(), 3);
        assert!(!requests[0].1 && !requests[1].1 && requests[2].1);
        assert!(!requests[0].0.contains("progression"));
        assert!(requests[2].0.contains("progression"));
    }

    #[test]
    fn pending_slots_flags_dq_and_reported_winners_remain_distinct() {
        assert_eq!(parse_advance(&json!({ "entrant": { "id": 1 }, "progression": {
            "destPhaseId": 2, "destPhaseGroupId": 3, "phaseName": "Round 2", "phaseGroupDisplay": "B1"
        } })).unwrap()["groupName"], "B1");
        assert!(parse_advance(&json!({ "entrant": { "id": 1 }, "progression": null })).is_none());
        let mut set = json!({ "id": 10, "round": -2, "fullRoundText": "Losers Round 2", "state": 2, "winnerId": 1,
            "slots": [{ "slotIndex": 1, "prereqType": "set", "prereqId": 9, "prereqPlacement": 1 },
                { "slotIndex": 0, "entrant": { "id": 1, "name": "Alpha", "participants": [{ "gamerTag": "ひなお/Hinao", "user": { "location": { "country": "Japan" } } }] },
                    "standing": { "stats": { "score": { "value": -1 } } } }] });
        let pending = parse_match(&set).unwrap();
        assert_eq!(pending["slots"][0]["country"], "JP");
        assert_eq!(pending["slots"][0]["score"], -1);
        assert_eq!(pending["slots"][1]["prerequisite"]["setId"], "9");
        assert!(pending.get("winnerId").is_none());
        set["id"] = json!("preview_30_1_0");
        assert_eq!(parse_match(&set).unwrap()["id"], "preview_30_1_0");
        set["state"] = json!(3);
        assert_eq!(parse_match(&set).unwrap()["winnerId"], "1");
        set["winnerId"] = json!(99);
        assert!(parse_match(&set).unwrap().get("winnerId").is_none());
        let scope = Scope {
            event_id: "1".into(),
            phase_id: "2".into(),
            phase_group_id: "3".into(),
        };
        assert!(verify_scope(
            &json!({ "id": 3, "phase": { "id": 2, "event": { "id": 1 } } }),
            &scope
        )
        .is_ok());
        assert!(verify_scope(
            &json!({ "id": 3, "phase": { "id": 4, "event": { "id": 1 } } }),
            &scope
        )
        .is_err());
    }
}
