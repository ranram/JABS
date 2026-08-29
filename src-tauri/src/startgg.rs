use crate::{
    database::now_rfc3339,
    runtime::RuntimeState,
    secrets,
    startgg_queries,
    state::{BroadcastPresentation, GameResult, Player, SelectedSet},
};
use futures_util::future::join_all;
use reqwest::{Client, StatusCode};
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use serde_json::{Map, Value, json};
use std::collections::HashSet;
use std::time::Duration;
use tokio::{sync::Mutex, time::Instant};

const ENDPOINT: &str = "https://api.start.gg/gql/alpha";
const REQUEST_REFILL_INTERVAL: Duration = Duration::from_millis(800);
const REQUEST_BURST_CAPACITY: f64 = 4.0;
const MAX_EVENT_HEAD_TO_HEAD_PAGES: u32 = 5;
const MAX_GLOBAL_HEAD_TO_HEAD_PAGES: u32 = 5;

struct RequestBudget {
    available: f64,
    last_refill: Instant,
}

pub struct StartggService {
    client: Client,
    request_budget: Mutex<RequestBudget>,
}

impl Default for StartggService {
    fn default() -> Self {
        Self {
            client: Client::builder()
                .timeout(Duration::from_secs(15))
                // JABS only ever calls https://api.start.gg directly, so skip
                // system-proxy detection. On Windows that probing reads the
                // registry (winreg) and can stall on WPAD auto-discovery,
                // adding seconds of latency before requests even start.
                .no_proxy()
                .build()
                .expect("static start.gg HTTP client configuration must be valid"),
            request_budget: Mutex::new(RequestBudget {
                available: REQUEST_BURST_CAPACITY,
                last_refill: Instant::now(),
            }),
        }
    }
}

impl StartggService {
    async fn throttle(&self) {
        loop {
            let wait = {
                let mut budget = self.request_budget.lock().await;
                let now = Instant::now();
                let replenished = budget.available
                    + now.duration_since(budget.last_refill).as_secs_f64()
                        / REQUEST_REFILL_INTERVAL.as_secs_f64();
                budget.available = replenished.min(REQUEST_BURST_CAPACITY);
                budget.last_refill = now;
                if budget.available >= 1.0 {
                    budget.available -= 1.0;
                    None
                } else {
                    Some(REQUEST_REFILL_INTERVAL.mul_f64(1.0 - budget.available))
                }
            };
            match wait {
                Some(wait) => tokio::time::sleep(wait).await,
                None => return,
            }
        }
    }
}

#[derive(Debug, Serialize)]
pub struct ApiError {
    pub error: String,
    pub code: &'static str,
}

#[derive(Deserialize)]
struct GraphqlEnvelope<T> {
    data: Option<T>,
    errors: Option<Vec<GraphqlError>>,
    success: Option<bool>,
    message: Option<String>,
}

#[derive(Deserialize)]
struct GraphqlError {
    message: Option<String>,
}

pub async fn events(runtime: &RuntimeState, slug: &str) -> Result<Value, ApiError> {
    required_text(slug, "Enter a tournament slug or start.gg URL first.")?;
    let data: Value = request(runtime, startgg_queries::EVENTS, json!({ "slug": slug })).await?;
    let tournament = optional_object(data.get("tournament"));
    let nodes = node_list(tournament.and_then(|value| value.get("events")), "tournament events")?;
    let events = nodes.into_iter().filter_map(|node| {
        let object = node.as_object()?;
        let id = normalized_id(object.get("id")?)?;
        let name = optional_text(object.get("name")).unwrap_or_else(|| format!("Event {id}"));
        let videogame = optional_object(object.get("videogame")).and_then(|game| {
            let id = normalized_id(game.get("id")?)?;
            Some(json!({
                "id": id,
                "name": optional_text(game.get("name")).unwrap_or_else(|| "Unknown game".to_owned())
            }))
        });
        Some(json!({ "id": id, "name": name, "videogame": videogame }))
    }).collect::<Vec<_>>();
    runtime.database.record_recent_tournament(slug)
        .map_err(|_| upstream("Tournament data loaded, but recent history could not be saved.", "upstream"))?;
    Ok(live_result(json!({ "events": events })))
}

pub async fn stream_queue(runtime: &RuntimeState, slug: &str) -> Result<Value, ApiError> {
    required_text(slug, "Enter a tournament slug first.")?;
    let graphql_slug = if slug.starts_with("tournament/") {
        slug.to_owned()
    } else {
        format!("tournament/{slug}")
    };
    let data: Value = request(
        runtime,
        startgg_queries::STREAM_QUEUE,
        json!({ "slug": graphql_slug }),
    ).await?;
    let tournament = optional_object(data.get("tournament"));
    let entries = node_list(
        tournament.and_then(|value| value.get("streamQueue")),
        "tournament stream queue",
    )?;
    let mut assignments = Vec::new();
    for entry in entries {
        let Some(entry) = entry.as_object() else { continue };
        let stream_name = optional_object(entry.get("stream"))
            .and_then(|stream| optional_text(stream.get("streamName")))
            .unwrap_or_else(|| "Stream".to_owned());
        let sets = node_list(entry.get("sets"), "stream queue sets")?;
        for (index, set) in sets.into_iter().enumerate() {
            let Some(set_id) = set.as_object()
                .and_then(|set| set.get("id"))
                .and_then(normalized_id)
            else { continue };
            assignments.push(json!({
                "setId": set_id,
                "streamName": stream_name,
                "queuePosition": index + 1
            }));
        }
    }
    Ok(live_result(json!({ "assignments": assignments })))
}

pub async fn phases(runtime: &RuntimeState, event_id: &str) -> Result<Value, ApiError> {
    required_text(event_id, "Select an event first.")?;
    let data: Value = request(
        runtime,
        startgg_queries::PHASES,
        json!({ "eventId": event_id }),
    ).await?;
    let event = optional_object(data.get("event"));
    let nodes = node_list(event.and_then(|value| value.get("phases")), "event phases")?;
    let phases = nodes.into_iter().filter_map(|node| {
        let object = node.as_object()?;
        let id = normalized_id(object.get("id")?)?;
        Some(json!({
            "id": id,
            "name": optional_text(object.get("name")).unwrap_or_else(|| format!("Phase {id}"))
        }))
    }).collect::<Vec<_>>();
    Ok(live_result(json!({ "phases": phases })))
}

pub async fn event_standings(
    runtime: &RuntimeState,
    event_id: &str,
) -> Result<Value, ApiError> {
    required_text(event_id, "Choose an event before loading final standings.")?;
    let data: Value = request(
        runtime,
        startgg_queries::EVENT_STANDINGS,
        json!({ "eventId": event_id }),
    ).await?;
    map_event_standings(data)
}

pub async fn event_standings_by_slug(
    runtime: &RuntimeState,
    event_slug: &str,
) -> Result<Value, ApiError> {
    validate_event_slug(event_slug)?;
    let data: Value = request(
        runtime,
        startgg_queries::EVENT_STANDINGS_BY_SLUG,
        json!({ "eventSlug": event_slug }),
    ).await?;
    map_event_standings(data)
}

fn map_event_standings(data: Value) -> Result<Value, ApiError> {
    let Some(event) = optional_object(data.get("event")) else {
        return Err(invalid_response("start.gg did not return the selected event."));
    };
    let standings_connection = optional_object(event.get("standings"))
        .ok_or_else(|| invalid_response("start.gg returned invalid event standings."))?;
    let nodes = node_list(standings_connection.get("nodes"), "event standings")?;
    let mut standings = nodes.into_iter().filter_map(|standing| {
        let standing = standing.as_object()?;
        let placement = finite_u64(standing.get("placement"))?;
        if placement == 0 || placement > 8 {
            return None;
        }
        let is_final = standing.get("isFinal").and_then(Value::as_bool).unwrap_or(false);
        let entrant = optional_object(standing.get("entrant"))?;
        let participant = entrant.get("participants")
            .and_then(Value::as_array)
            .and_then(|participants| participants.first())
            .and_then(Value::as_object);
        let name = participant
            .and_then(|participant| optional_text(participant.get("gamerTag")))
            .or_else(|| optional_text(entrant.get("name")))?;
        let prefix = participant.and_then(|participant| optional_text(participant.get("prefix")));
        let country = participant
            .and_then(|participant| participant.get("user"))
            .and_then(|user| user.get("location"))
            .and_then(|location| optional_text(location.get("country")));
        let (country_code, _) = crate::catalogs::normalize_imported_location(country.as_deref(), None);
        Some(json!({
            "placement": placement,
            "name": crate::moderation::censor(Some(name)).unwrap_or_else(|| "[blocked]".to_owned()),
            "prefix": crate::moderation::censor(prefix),
            "country": country_code,
            "isFinal": is_final
        }))
    }).collect::<Vec<_>>();
    standings.sort_by_key(|standing| standing.get("placement").and_then(Value::as_u64));
    let event_game_name = optional_object(event.get("videogame"))
        .and_then(|videogame| optional_text(videogame.get("name")));
    let event_url = optional_text(event.get("slug"))
        .filter(|slug| !slug.is_empty())
        .map(|slug| format!("https://start.gg/{slug}"));
    let num_entrants = event.get("numEntrants").and_then(Value::as_u64).filter(|n| *n > 0);
    Ok(json!({
        "eventName": optional_text(event.get("name")).unwrap_or_else(|| "Tournament Finals".to_owned()),
        "eventGameName": event_game_name,
        "eventState": event.get("state").and_then(normalized_id),
        "eventUrl": event_url,
        "numEntrants": num_entrants,
        "standings": standings,
        "finalized": standings.len() == 8 && standings.iter().all(|standing| {
            standing.get("isFinal").and_then(Value::as_bool) == Some(true)
        })
    }))
}

fn validate_event_slug(value: &str) -> Result<(), ApiError> {
    let parts = value.split('/').collect::<Vec<_>>();
    if parts.len() != 4
        || parts[0] != "tournament"
        || parts[1].is_empty()
        || parts[2] != "event"
        || parts[3].is_empty()
        || parts.iter().any(|part| !part.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '-' | '_')
        }))
    {
        return Err(invalid_response("Enter an official start.gg URL for a specific event."));
    }
    Ok(())
}

pub async fn phase_groups(
    runtime: &RuntimeState,
    phase_id: &str,
    page: u32,
    per_page: u32,
) -> Result<Value, ApiError> {
    required_text(phase_id, "Select a phase first.")?;
    validate_page(page, per_page)?;
    let data: Value = request(
        runtime,
        startgg_queries::PHASE_GROUPS,
        json!({ "phaseId": phase_id, "page": page, "perPage": per_page }),
    ).await?;
    let phase = optional_object(data.get("phase"));
    let connection = optional_object(phase.and_then(|value| value.get("phaseGroups")));
    let nodes = node_list(
        connection.and_then(|value| value.get("nodes")),
        "phase groups",
    )?;
    let groups = nodes.into_iter().filter_map(|node| {
        let object = node.as_object()?;
        let id = normalized_id(object.get("id")?)?;
        Some(json!({
            "id": id,
            "displayIdentifier": optional_text(object.get("displayIdentifier"))
                .unwrap_or_else(|| format!("Pool {id}"))
        }))
    }).collect::<Vec<_>>();
    let page_info = page_info(connection, page, per_page);
    Ok(live_result(json!({ "phaseGroups": groups, "pageInfo": page_info })))
}

pub struct SetsRequest<'a> {
    pub scope: &'a str,
    pub event_id: &'a str,
    pub phase_id: Option<&'a str>,
    pub phase_group_id: Option<&'a str>,
    pub station_number: Option<u32>,
    pub page: u32,
    pub per_page: u32,
}

// start.gg charges query complexity for every nested object, not just each set node.
// Set summaries deliberately include entrants, participants, scores, phase context, and
// station data, so keep this lower than the API's generic 100-object pagination limit.
const SAFE_SET_PAGE_SIZE: u32 = 20;

pub async fn sets(runtime: &RuntimeState, input: SetsRequest<'_>) -> Result<Value, ApiError> {
    required_text(input.event_id, "Select an event first.")?;
    validate_page(input.page, input.per_page)?;
    let per_page = input.per_page.min(SAFE_SET_PAGE_SIZE);
    let query = startgg_queries::sets(input.scope)
        .ok_or_else(|| invalid_response("Choose a recognized set browsing scope."))?;
    let (root, variables) = match input.scope {
        "event" => ("event", json!({
            "eventId": input.event_id,
            "page": input.page,
            "perPage": per_page
        })),
        "phase" => ("phase", json!({
            "phaseId": required_option(input.phase_id, "Select a phase first.")?,
            "page": input.page,
            "perPage": per_page
        })),
        "phaseGroup" => ("phaseGroup", json!({
            "phaseGroupId": required_option(input.phase_group_id, "Select a pool first.")?,
            "page": input.page,
            "perPage": per_page
        })),
        "station" => ("event", json!({
            "eventId": input.event_id,
            "stationNumbers": [input.station_number.ok_or_else(|| invalid_response("Enter a positive station number."))?],
            "page": input.page,
            "perPage": per_page
        })),
        _ => return Err(invalid_response("Choose a recognized set browsing scope.")),
    };
    let data: Value = request(runtime, &query, variables).await?;
    let parent = optional_object(data.get(root));
    let connection = optional_object(parent.and_then(|value| value.get("sets")));
    let nodes = node_list(connection.and_then(|value| value.get("nodes")), "set nodes")?;
    let mut summaries = Vec::new();
    for node in nodes {
        if let Some(summary) = set_summary(&node)? {
            summaries.push(summary);
        }
    }
    let page_info = page_info(connection, input.page, per_page);
    Ok(live_result(json!({ "sets": summaries, "pageInfo": page_info })))
}

pub struct SelectedSetRequest<'a> {
    pub set_id: &'a str,
    pub game_id: &'a str,
    pub asset_catalog_slug: Option<&'a str>,
    pub event_id: Option<&'a str>,
    pub tournament_slug: Option<&'a str>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportedGame {
    pub game_num: usize,
    pub winner_id: String,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub selections: Vec<ReportedGameSelection>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportedGameSelection {
    pub entrant_id: String,
    pub character_id: String,
}

pub struct ReportReceipt {
    pub id: String,
    pub state: String,
}

pub async fn reported_games(
    runtime: &RuntimeState,
    set_id: &str,
    history: Option<&[GameResult]>,
) -> Result<Option<Vec<ReportedGame>>, ApiError> {
    let Some(history) = history else { return Ok(None) };
    let requested_selection_count = history
        .iter()
        .map(|game| game.selections.len())
        .sum::<usize>();
    let character_catalog = if requested_selection_count == 0 {
        Vec::new()
    } else {
        set_character_catalog(runtime, set_id).await?
    };

    let games = history
        .iter()
        .enumerate()
        .map(|(index, game)| {
            let selections = game
                .selections
                .iter()
                .map(|selection| {
                    let character_id = character_catalog
                        .iter()
                        .find(|(_, name)| {
                            crate::catalogs::character_names_match(name, &selection.character)
                        })
                        .map(|(id, _)| id.clone())
                        .ok_or_else(|| {
                            invalid_response(&format!(
                                "start.gg does not recognize the selected character ‘{}’ for this event. Clear it or choose a character from the event catalog before reporting.",
                                selection.character
                            ))
                        })?;
                    Ok(ReportedGameSelection {
                        entrant_id: selection.entrant_id.clone(),
                        character_id,
                    })
                })
                .collect::<Result<Vec<_>, ApiError>>()?;
            Ok(ReportedGame {
                game_num: index + 1,
                winner_id: game.winner_id.clone(),
                selections,
            })
        })
        .collect::<Result<Vec<_>, ApiError>>()?;
    Ok(Some(games))
}

async fn set_character_catalog(
    runtime: &RuntimeState,
    set_id: &str,
) -> Result<Vec<(String, String)>, ApiError> {
    let data: Value = request(
        runtime,
        startgg_queries::SET_CHARACTER_CATALOG,
        json!({ "setId": set_id }),
    ).await?;
    let characters = data
        .pointer("/set/event/videogame/characters")
        .and_then(Value::as_array)
        .ok_or_else(|| invalid_response(
            "start.gg does not provide a character catalog for this event. Clear character selections before reporting."
        ))?;
    Ok(characters.iter().filter_map(|character| {
        let object = character.as_object()?;
        Some((
            object.get("id").and_then(normalized_id)?,
            optional_text(object.get("name"))?,
        ))
    }).collect())
}

pub async fn report_set(
    runtime: &RuntimeState,
    set_id: &str,
    winner_id: &str,
    game_data: Option<&[ReportedGame]>,
) -> Result<ReportReceipt, ApiError> {
    required_text(set_id, "Choose a set to report.")?;
    required_text(winner_id, "Choose the winning entrant.")?;
    let (query, variables) = match game_data {
        Some(game_data) => (
            startgg_queries::REPORT_SET_WITH_GAMES,
            json!({ "setId": set_id, "winnerId": winner_id, "gameData": game_data }),
        ),
        None => (
            startgg_queries::REPORT_SET_WINNER_ONLY,
            json!({ "setId": set_id, "winnerId": winner_id }),
        ),
    };
    let data: Value = request(runtime, query, variables).await?;
    let nodes = node_list(data.get("reportBracketSet"), "set-reporting response")?;
    let reported = nodes.into_iter().find_map(|node| {
        let object = node.as_object()?;
        let id = object.get("id").and_then(normalized_id)?;
        if id != set_id { return None; }
        let state = object.get("state").and_then(normalized_id)?;
        Some(ReportReceipt { id, state })
    }).ok_or_else(|| invalid_response("start.gg did not confirm the reported set."))?;
    Ok(reported)
}

pub async fn selected_set(
    runtime: &RuntimeState,
    input: SelectedSetRequest<'_>,
) -> Result<Option<SelectedSet>, ApiError> {
    required_text(input.set_id, "Choose a set first.")?;
    if !crate::state::is_game_id(input.game_id) {
        return Err(invalid_response("Choose a recognized game profile."));
    }
    let data: Value = request(
        runtime,
        startgg_queries::SET_BY_ID,
        json!({ "setId": input.set_id }),
    ).await?;
    let Some(set) = optional_object(data.get("set")) else {
        return Ok(None);
    };
    let Some(set_id) = set.get("id").and_then(normalized_id) else {
        return Err(invalid_response("start.gg returned a selected set without a valid ID."));
    };
    let slots = node_list(set.get("slots"), "selected set slots")?;
    let games = set.get("games");
    let mut player_one = player_from_slot(slots.first().copied(), games, &set_id, 1);
    let mut player_two = player_from_slot(slots.get(1).copied(), games, &set_id, 2);
    let phase_group = optional_object(set.get("phaseGroup"));
    let phase = phase_group
        .and_then(|group| optional_object(group.get("phase")))
        .and_then(|phase| optional_text(phase.get("name")));
    let phase_group_name = phase_group
        .and_then(|group| optional_text(group.get("displayIdentifier")));
    let round = optional_text(set.get("fullRoundText"));
    let winners_side_entrant_id = winners_side_entrant_id(runtime, round.as_deref(), &slots).await;
    let highest_score = player_one.score.max(player_two.score).min(3);
    let tied = player_one.score == player_two.score && highest_score > 0;
    let configured_best_of = crate::match_formats::default_best_of(
        input.game_id,
        phase.as_deref(),
        phase_group_name.as_deref(),
        round.as_deref(),
    );
    let score_required_best_of = if highest_score >= 3 || (tied && highest_score >= 2) {
        5
    } else {
        3
    };
    let completed_best_of = (set.get("state").and_then(normalized_id).as_deref() == Some("3"))
        .then_some(if highest_score >= 3 { 5 } else { 3 });
    let best_of = completed_best_of.unwrap_or(configured_best_of.max(score_required_best_of));
    let score_limit = best_of / 2 + 1;
    player_one.score = player_one.score.min(score_limit);
    player_two.score = player_two.score.min(score_limit);
    let station = optional_object(set.get("station"))
        .and_then(|station| finite_u64(station.get("number")))
        .filter(|number| *number > 0)
        .map(|number| format!("Station {number}"));
    let game_history = (player_one.score == 0 && player_two.score == 0).then(Vec::new);
    let game_name = optional_object(set.get("event"))
        .and_then(|event| optional_object(event.get("videogame")))
        .and_then(|videogame| optional_text(videogame.get("name")));
    let mut selected_set = SelectedSet {
        set_id: Some(set_id),
        event_id: optional_context(input.event_id),
        tournament_slug: optional_context(input.tournament_slug),
        display_name: format!("{} vs {}", player_one.name, player_two.name),
        phase,
        phase_group: phase_group_name,
        round,
        winners_side_entrant_id,
        station,
        state: set.get("state").and_then(normalized_id),
        game_id: input.game_id.to_owned(),
        game_name,
        styling_game_id: Some(input.game_id.to_owned()),
        custom_scoreboard_id: None,
        custom_scoreboard_revision: None,
        asset_catalog_slug: input.asset_catalog_slug.map(str::to_owned),
        best_of,
        broadcast: Some(BroadcastPresentation {
            info_bar_enabled: false,
            info_left: None,
            info_right: None,
            logo_enabled: false,
            logo_asset_id: None,
        }),
        game_history,
        player_one,
        player_two,
        updated_at: now_rfc3339().map_err(|message| upstream(&message, "upstream"))?,
    };
    crate::state::censor_untrusted_selected_set(&mut selected_set);
    crate::state::validate_selected_set(&selected_set)
        .map_err(|message| invalid_response(&message))?;
    Ok(Some(selected_set))
}

pub async fn versus_history(
    runtime: &RuntimeState,
    selected_set: &SelectedSet,
) -> Result<crate::versus_screen::VersusHistory, ApiError> {
    let event_id = selected_set
        .event_id
        .as_deref()
        .ok_or_else(|| invalid_response("The active set does not include an event ID."))?;
    let player_one_id = selected_set
        .player_one
        .player_id
        .as_deref()
        .ok_or_else(|| {
            invalid_response("Player 1 does not have a linked start.gg player profile.")
        })?;
    let player_two_id = selected_set
        .player_two
        .player_id
        .as_deref()
        .ok_or_else(|| {
            invalid_response("Player 2 does not have a linked start.gg player profile.")
        })?;
    let entrant_ids = [
        selected_set.player_one.entrant_id.clone(),
        selected_set.player_two.entrant_id.clone(),
    ];
    // These reads are independent. Starting them together removes several
    // network round trips from the Versus refresh without increasing query
    // complexity inside any individual GraphQL operation.
    let (profile_result, event_result, global_result) = tokio::join!(
        retried_history_request(
            runtime,
            startgg_queries::VERSUS_HISTORY,
            json!({
                "eventId": event_id,
                "playerOneId": player_one_id,
                "playerTwoId": player_two_id
            }),
        ),
        retried_history_request(
            runtime,
            startgg_queries::EVENT_HEAD_TO_HEAD,
            json!({
                "eventId": event_id,
                "entrantIds": entrant_ids.clone(),
                "page": 1,
                "perPage": SAFE_SET_PAGE_SIZE
            }),
        ),
        retried_history_request(
            runtime,
            startgg_queries::PLAYER_SET_HISTORY,
            json!({
                "playerId": player_one_id,
                "page": 1,
                "perPage": SAFE_SET_PAGE_SIZE
            }),
        ),
    );
    let data = profile_result?;
    let videogame_id = optional_object(data.get("currentEvent"))
        .and_then(|event| optional_object(event.get("videogame")))
        .and_then(|videogame| videogame.get("id"))
        .and_then(normalized_id)
        .ok_or_else(|| invalid_response("start.gg did not return the active event's game."))?;
    let player_one = optional_object(data.get("playerOne"))
        .ok_or_else(|| invalid_response("start.gg did not return Player 1's profile."))?;
    let player_two = optional_object(data.get("playerTwo"))
        .ok_or_else(|| invalid_response("start.gg did not return Player 2's profile."))?;
    let mut history_sets = Vec::new();
    let mut history_set_ids = HashSet::new();
    let mut global_sets = Vec::new();
    let mut global_set_ids = HashSet::new();
    // Placements require the profile response, but a failed optional set page
    // must not discard placements or head-to-head rows already retrieved from
    // the other source.
    let event_total_pages = event_result
        .ok()
        .and_then(|event_data| {
            append_history_page(
                &event_data,
                "event",
                "event head-to-head sets",
                &mut history_sets,
                &mut history_set_ids,
            )
            .ok()
        })
        .unwrap_or(0)
        .min(MAX_EVENT_HEAD_TO_HEAD_PAGES);
    for first_page in (2..=event_total_pages).step_by(2) {
        let responses = join_all((first_page..=(first_page + 1).min(event_total_pages)).map(
            |page| {
                retried_history_request(
                    runtime,
                    startgg_queries::EVENT_HEAD_TO_HEAD,
                    json!({
                        "eventId": event_id,
                        "entrantIds": entrant_ids.clone(),
                        "page": page,
                        "perPage": SAFE_SET_PAGE_SIZE
                    }),
                )
            },
        ))
        .await;
        for event_data in responses.into_iter().flatten() {
            let _ = append_history_page(
                &event_data,
                "event",
                "event head-to-head sets",
                &mut history_sets,
                &mut history_set_ids,
            );
        }
    }

    let global_total_pages = global_result
        .ok()
        .and_then(|player_data| {
            append_global_history_page(
                &player_data,
                &mut global_sets,
                &mut global_set_ids,
                &mut history_sets,
                &mut history_set_ids,
            )
            .ok()
        })
        .unwrap_or(0)
        .min(MAX_GLOBAL_HEAD_TO_HEAD_PAGES);
    for first_page in (2..=global_total_pages).step_by(2) {
        let enough_head_to_head_sets = head_to_head_sets(
            &global_sets,
            player_one_id,
            player_two_id,
            &videogame_id,
        )?
        .len()
            >= 3;
        if enough_head_to_head_sets {
            break;
        }
        let responses = join_all((first_page..=(first_page + 1).min(global_total_pages)).map(
            |page| {
                retried_history_request(
                    runtime,
                    startgg_queries::PLAYER_SET_HISTORY,
                    json!({
                        "playerId": player_one_id,
                        "page": page,
                        "perPage": SAFE_SET_PAGE_SIZE
                    }),
                )
            },
        ))
        .await;
        for player_data in responses.into_iter().flatten() {
            let _ = append_global_history_page(
                &player_data,
                &mut global_sets,
                &mut global_set_ids,
                &mut history_sets,
                &mut history_set_ids,
            );
        }
    }
    Ok(crate::versus_screen::VersusHistory {
        player_one_placements: recent_placements(player_one, &videogame_id)?,
        player_two_placements: recent_placements(player_two, &videogame_id)?,
        head_to_head: head_to_head_sets(
            &history_sets,
            player_one_id,
            player_two_id,
            &videogame_id,
        )?,
    })
}

async fn retried_history_request(
    runtime: &RuntimeState,
    query: &str,
    variables: Value,
) -> Result<Value, ApiError> {
    match request(runtime, query, variables.clone()).await {
        Err(error) if matches!(error.code, "network" | "timeout") => {
            request(runtime, query, variables).await
        }
        result => result,
    }
}

fn append_history_page(
    data: &Value,
    parent_name: &str,
    label: &str,
    target: &mut Vec<Value>,
    ids: &mut HashSet<String>,
) -> Result<u32, ApiError> {
    let connection = optional_object(data.get(parent_name))
        .and_then(|parent| optional_object(parent.get("sets")));
    append_unique_sets(
        target,
        ids,
        node_list(connection.and_then(|sets| sets.get("nodes")), label)?,
    );
    Ok(connection
        .and_then(|sets| optional_object(sets.get("pageInfo")))
        .and_then(|page_info| finite_u64(page_info.get("totalPages")))
        .unwrap_or(1)
        .min(u64::from(u32::MAX)) as u32)
}

fn append_global_history_page(
    data: &Value,
    global_sets: &mut Vec<Value>,
    global_ids: &mut HashSet<String>,
    all_sets: &mut Vec<Value>,
    all_ids: &mut HashSet<String>,
) -> Result<u32, ApiError> {
    let connection = optional_object(data.get("player"))
        .and_then(|player| optional_object(player.get("sets")));
    let nodes = node_list(
        connection.and_then(|sets| sets.get("nodes")),
        "global player set history",
    )?;
    append_unique_sets(global_sets, global_ids, nodes.clone());
    append_unique_sets(all_sets, all_ids, nodes);
    Ok(connection
        .and_then(|sets| optional_object(sets.get("pageInfo")))
        .and_then(|page_info| finite_u64(page_info.get("totalPages")))
        .unwrap_or(1)
        .min(u64::from(u32::MAX)) as u32)
}

fn append_unique_sets(target: &mut Vec<Value>, ids: &mut HashSet<String>, nodes: Vec<&Value>) {
    for node in nodes {
        let id = node.get("id").and_then(normalized_id);
        if id.as_ref().is_some_and(|id| ids.insert(id.clone())) {
            target.push(node.clone());
        }
    }
}

fn recent_placements(
    player: &serde_json::Map<String, Value>,
    videogame_id: &str,
) -> Result<Vec<crate::versus_screen::Placement>, ApiError> {
    let nodes = node_list(player.get("recentStandings"), "recent player standings")?;
    let mut placements = nodes.into_iter().filter_map(|standing| {
        let standing = standing.as_object()?;
        let placement = finite_u64(standing.get("placement"))?.max(1);
        let event = optional_object(standing.get("entrant"))
            .and_then(|entrant| optional_object(entrant.get("event")))?;
        let event_game_id = optional_object(event.get("videogame"))
            .and_then(|game| game.get("id"))
            .and_then(normalized_id)?;
        if event_game_id != videogame_id { return None; }
        let tournament = optional_object(event.get("tournament"))?;
        Some((
            finite_u64(tournament.get("startAt")).unwrap_or(0),
            crate::versus_screen::Placement {
                placement,
                tournament_name: safe_history_text(tournament.get("name"), "Tournament"),
                event_name: safe_history_text(event.get("name"), "Event"),
            },
        ))
    }).collect::<Vec<_>>();
    placements.sort_by_key(|(start_at, _)| std::cmp::Reverse(*start_at));
    Ok(placements.into_iter().take(3).map(|(_, placement)| placement).collect())
}

fn head_to_head_sets(
    nodes: &[Value],
    player_one_id: &str,
    player_two_id: &str,
    videogame_id: &str,
) -> Result<Vec<crate::versus_screen::HeadToHead>, ApiError> {
    let mut sets = nodes.iter().filter_map(|set| {
        let set = set.as_object()?;
        if set.get("state").and_then(normalized_id).as_deref() != Some("3") { return None; }
        let event = optional_object(set.get("event"))?;
        let event_game_id = optional_object(event.get("videogame"))
            .and_then(|game| game.get("id"))
            .and_then(normalized_id)?;
        if event_game_id != videogame_id { return None; }
        let slots = set.get("slots")?.as_array()?;
        let score_for = |player_id: &str| -> Option<u64> {
            slots.iter().find_map(|slot| {
                let slot = slot.as_object()?;
                let entrant = optional_object(slot.get("entrant"))?;
                let has_player = entrant.get("participants")?.as_array()?.iter().any(|participant| {
                    optional_object(Some(participant))
                        .and_then(|participant| optional_object(participant.get("player")))
                        .and_then(|player| player.get("id"))
                        .and_then(normalized_id)
                        .as_deref() == Some(player_id)
                });
                has_player.then(|| slot_score(&Value::Object(slot.clone())).map(|score| score.max(0) as u64)).flatten()
            })
        };
        let player_one_score = score_for(player_one_id)?;
        let player_two_score = score_for(player_two_id)?;
        let tournament = optional_object(event.get("tournament"))?;
        Some(crate::versus_screen::HeadToHead {
            tournament_name: safe_history_text(tournament.get("name"), "Tournament"),
            event_name: safe_history_text(event.get("name"), "Event"),
            completed_at: finite_u64(set.get("completedAt")),
            player_one_score,
            player_two_score,
        })
    }).collect::<Vec<_>>();
    sets.sort_by_key(|set| std::cmp::Reverse(set.completed_at.unwrap_or(0)));
    sets.truncate(3);
    Ok(sets)
}

fn safe_history_text(value: Option<&Value>, fallback: &str) -> String {
    let value = crate::moderation::censor(optional_text(value))
        .unwrap_or_else(|| fallback.to_owned());
    value.chars().take(96).collect()
}

async fn winners_side_entrant_id(
    runtime: &RuntimeState,
    round: Option<&str>,
    slots: &[&Value],
) -> Option<String> {
    if !is_initial_grand_final(round?) {
        return None;
    }
    let (first_entrant_id, first_set_id) = grand_final_prerequisite(slots, 0)?;
    let (second_entrant_id, second_set_id) = grand_final_prerequisite(slots, 1)?;
    let data = request::<Value>(
        runtime,
        startgg_queries::SET_PREREQUISITE_ROUNDS,
        json!({ "firstSetId": first_set_id, "secondSetId": second_set_id }),
    )
    .await
    .ok()?;
    let first_is_winners_final = prerequisite_is_winners_final(data.get("first"));
    let second_is_winners_final = prerequisite_is_winners_final(data.get("second"));
    match (first_is_winners_final, second_is_winners_final) {
        (true, false) => Some(first_entrant_id),
        (false, true) => Some(second_entrant_id),
        _ => None,
    }
}

fn grand_final_prerequisite(slots: &[&Value], slot_index: u64) -> Option<(String, String)> {
    let slot = slots.iter().copied().find(|slot| {
        slot.as_object()
            .and_then(|slot| finite_u64(slot.get("slotIndex")))
            == Some(slot_index)
    })?;
    let slot = slot.as_object()?;
    let prerequisite_type = optional_text(slot.get("prereqType"))?;
    if !prerequisite_type.eq_ignore_ascii_case("set")
        || finite_u64(slot.get("prereqPlacement")) != Some(1)
    {
        return None;
    }
    let prerequisite_id = optional_text(slot.get("prereqId"))?;
    let entrant_id = optional_object(slot.get("entrant"))?
        .get("id")
        .and_then(normalized_id)?;
    Some((entrant_id, prerequisite_id))
}

fn prerequisite_is_winners_final(value: Option<&Value>) -> bool {
    let round = optional_object(value)
        .and_then(|set| optional_text(set.get("fullRoundText")));
    round.as_deref().is_some_and(is_winners_final)
}

fn normalized_round(value: &str) -> String {
    value
        .chars()
        .map(|character| if character.is_alphanumeric() { character.to_ascii_lowercase() } else { ' ' })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn is_initial_grand_final(value: &str) -> bool {
    matches!(normalized_round(value).as_str(), "grand final" | "grand finals")
}

fn is_winners_final(value: &str) -> bool {
    matches!(normalized_round(value).as_str(), "winners final" | "winners finals")
}

fn character_for_entrant_from_games(games: Option<&Value>, entrant_id: &str) -> Option<String> {
    let games = games.and_then(Value::as_array)?;
    for game in games {
        let Some(selections) = game.get("selections").and_then(Value::as_array) else {
            continue;
        };
        for selection in selections {
            let selection_obj = selection.as_object()?;
            let Some(selection_entrant_id) = selection_obj
                .get("entrant")
                .and_then(|entrant| entrant.get("id"))
                .and_then(normalized_id)
            else {
                continue;
            };
            if selection_entrant_id != entrant_id {
                continue;
            }
            if let Some(name) = selection_obj
                .get("character")
                .and_then(|character| optional_text(character.get("name")))
            {
                return Some(name);
            }
        }
    }
    None
}

fn player_from_slot(slot: Option<&Value>, games: Option<&Value>, set_id: &str, side: u8) -> Player {
    let entrant = slot
        .and_then(Value::as_object)
        .and_then(|slot| optional_object(slot.get("entrant")));
    let entrant_id_for_character = entrant
        .and_then(|entrant| entrant.get("id"))
        .and_then(normalized_id);
    let participant = entrant
        .and_then(|entrant| entrant.get("participants"))
        .and_then(Value::as_array)
        .and_then(|participants| participants.first())
        .and_then(Value::as_object);
    let entrant_id = entrant
        .and_then(|entrant| entrant.get("id"))
        .and_then(normalized_id)
        .unwrap_or_else(|| format!("set-{set_id}-player-{side}"));
    let player_id = participant
        .and_then(|participant| optional_object(participant.get("player")))
        .and_then(|player| player.get("id"))
        .and_then(normalized_id);
    let fallback_name = format!("Player {side}");
    let name = participant
        .and_then(|participant| optional_text(participant.get("gamerTag")))
        .or_else(|| entrant.and_then(|entrant| optional_text(entrant.get("name"))))
        .unwrap_or(fallback_name);
    let prefix = participant.and_then(|participant| optional_text(participant.get("prefix")));
    let seed = entrant
        .and_then(|entrant| finite_u64(entrant.get("initialSeedNum")))
        .and_then(|seed| u32::try_from(seed).ok())
        .filter(|seed| *seed > 0);
    let user = participant.and_then(|participant| optional_object(participant.get("user")));
    let pronouns = user.and_then(|user| optional_text(user.get("genderPronoun")));
    let location = user.and_then(|user| optional_object(user.get("location")));
    let (country, state) = crate::catalogs::normalize_imported_location(
        location.and_then(|location| location.get("country")).and_then(Value::as_str),
        location.and_then(|location| location.get("state")).and_then(Value::as_str),
    );
    let score = slot.and_then(slot_score).unwrap_or(0).clamp(0, 3) as u32;
    let character = entrant_id_for_character
        .and_then(|entrant_id| character_for_entrant_from_games(games, &entrant_id))
        .and_then(|name| crate::moderation::censor(Some(name)));
    Player {
        entrant_id,
        player_id,
        name,
        prefix,
        sponsor: None,
        characters: character.clone().into_iter().collect(),
        character,
        character_asset_id: None,
        country,
        display_flag: None,
        state,
        pronouns,
        seed,
        score,
    }
}

fn optional_context(value: Option<&str>) -> Option<String> {
    value.map(str::trim).filter(|value| !value.is_empty()).map(str::to_owned)
}

async fn request<T: DeserializeOwned>(
    runtime: &RuntimeState,
    query: &str,
    variables: Value,
) -> Result<T, ApiError> {
    let token = secrets::token(runtime).map_err(|_| token_missing())?
        .ok_or_else(token_missing)?;
    runtime.startgg.throttle().await;
    let response = runtime.startgg.client
        .post(ENDPOINT)
        .bearer_auth(token.as_str())
        .json(&json!({ "query": query, "variables": variables }))
        .send()
        .await
        .map_err(|error| {
            if error.is_timeout() {
                upstream("start.gg did not respond in time. Check the connection and try again.", "timeout")
            } else {
                upstream("Unable to reach start.gg. Check the internet connection and try again.", "network")
            }
        })?;
    let status = response.status();
    if !status.is_success() {
        return Err(http_error(status));
    }
    let envelope = response.json::<GraphqlEnvelope<T>>().await
        .map_err(|_| invalid_response("start.gg returned an invalid response."))?;
    if envelope.success == Some(false) {
        return Err(classify_message(envelope.message.as_deref().unwrap_or("start.gg rejected the request.")));
    }
    if let Some(errors) = envelope.errors.filter(|errors| !errors.is_empty()) {
        let message = errors.into_iter()
            .filter_map(|error| error.message)
            .collect::<Vec<_>>()
            .join("; ");
        return Err(classify_message(if message.is_empty() {
            "start.gg returned an error without a readable message."
        } else {
            &message
        }));
    }
    envelope.data.ok_or_else(|| invalid_response("start.gg response did not include data."))
}

fn set_summary(value: &Value) -> Result<Option<Value>, ApiError> {
    let Some(object) = value.as_object() else { return Ok(None) };
    let Some(id) = object.get("id").and_then(normalized_id) else { return Ok(None) };
    let slots = node_list(object.get("slots"), "set slots")?;
    let entrant_one = slots.first().and_then(|slot| entrant_summary(slot));
    let entrant_two = slots.get(1).and_then(|slot| entrant_summary(slot));
    let entrant_one_score = slots.first().and_then(|slot| slot_score(slot));
    let entrant_two_score = slots.get(1).and_then(|slot| slot_score(slot));
    let phase_group = optional_object(object.get("phaseGroup"));
    let phase = phase_group
        .and_then(|group| optional_object(group.get("phase")))
        .and_then(|phase| optional_text(phase.get("name")));
    let phase_group_name = phase_group
        .and_then(|group| optional_text(group.get("displayIdentifier")));
    let station = optional_object(object.get("station"))
        .and_then(|station| finite_i64(station.get("number")))
        .map(|number| format!("Station {number}"));
    Ok(Some(json!({
        "id": id,
        "displayScore": optional_text(object.get("displayScore")),
        "entrantOneScore": entrant_one_score,
        "entrantTwoScore": entrant_two_score,
        "phase": phase,
        "phaseGroup": phase_group_name,
        "round": optional_text(object.get("fullRoundText")),
        "state": object.get("state").and_then(normalized_id),
        "station": station,
        "entrantOne": entrant_one,
        "entrantTwo": entrant_two
    })))
}

fn entrant_summary(slot: &Value) -> Option<Value> {
    let entrant = slot.as_object()
        .and_then(|slot| optional_object(slot.get("entrant")))?;
    let id = entrant.get("id").and_then(normalized_id)?;
    let participant_name = entrant.get("participants")
        .and_then(Value::as_array)
        .and_then(|participants| participants.first())
        .and_then(Value::as_object)
        .and_then(|participant| optional_text(participant.get("gamerTag")));
    let name = participant_name
        .or_else(|| optional_text(entrant.get("name")))
        .unwrap_or_else(|| "TBD".to_owned());
    Some(json!({ "id": id, "name": name }))
}

fn slot_score(slot: &Value) -> Option<i64> {
    let value = slot.pointer("/standing/stats/score/value")?;
    finite_i64(Some(value)).map(|score| score.max(0))
}

fn page_info(connection: Option<&Map<String, Value>>, page: u32, per_page: u32) -> Value {
    let info = connection.and_then(|connection| optional_object(connection.get("pageInfo")));
    let total = info.and_then(|info| finite_u64(info.get("total"))).unwrap_or(0);
    let fallback_pages = if total == 0 { 0 } else { total.div_ceil(u64::from(per_page)) };
    let total_pages = info
        .and_then(|info| finite_u64(info.get("totalPages")))
        .unwrap_or(fallback_pages);
    json!({
        "page": page,
        "perPage": per_page,
        "total": total,
        "totalPages": total_pages
    })
}

fn node_list<'a>(value: Option<&'a Value>, label: &str) -> Result<Vec<&'a Value>, ApiError> {
    match value {
        None | Some(Value::Null) => Ok(Vec::new()),
        Some(Value::Array(nodes)) => Ok(nodes.iter().filter(|node| !node.is_null()).collect()),
        Some(_) => Err(invalid_response(&format!("start.gg returned invalid {label}."))),
    }
}

fn optional_object(value: Option<&Value>) -> Option<&Map<String, Value>> {
    value.and_then(Value::as_object)
}

fn normalized_id(value: &Value) -> Option<String> {
    match value {
        Value::String(value) => {
            let value = value.trim();
            if value.is_empty() { None } else { Some(value.to_owned()) }
        }
        Value::Number(value) => Some(value.to_string()),
        _ => None,
    }
}

fn optional_text(value: Option<&Value>) -> Option<String> {
    value.and_then(Value::as_str).map(str::trim).filter(|value| !value.is_empty()).map(str::to_owned)
}

fn finite_i64(value: Option<&Value>) -> Option<i64> {
    value.and_then(Value::as_i64)
        .or_else(|| value.and_then(Value::as_f64).filter(|value| value.is_finite()).map(|value| value.trunc() as i64))
}

fn finite_u64(value: Option<&Value>) -> Option<u64> {
    finite_i64(value).map(|value| value.max(0) as u64)
}

fn validate_page(page: u32, per_page: u32) -> Result<(), ApiError> {
    if page == 0 || per_page == 0 || per_page > 100 {
        return Err(invalid_response("Pagination must use a positive page and 1 through 100 results per page."));
    }
    Ok(())
}

fn required_text<'a>(value: &'a str, message: &str) -> Result<&'a str, ApiError> {
    let value = value.trim();
    if value.is_empty() { Err(invalid_response(message)) } else { Ok(value) }
}

fn required_option<'a>(value: Option<&'a str>, message: &str) -> Result<&'a str, ApiError> {
    required_text(value.unwrap_or_default(), message)
}

fn live_result(mut result: Value) -> Value {
    if let Some(object) = result.as_object_mut() {
        object.insert("source".to_owned(), Value::String("live".to_owned()));
    }
    result
}

fn token_missing() -> ApiError {
    upstream("Enter a start.gg token in Connect start.gg first.", "token-missing")
}

fn http_error(status: StatusCode) -> ApiError {
    match status.as_u16() {
        401 => upstream("start.gg rejected the token. Check that it is current, then save it again.", "authentication"),
        403 => upstream("This start.gg token does not have permission to read the requested tournament data.", "permission"),
        429 => upstream("start.gg rate limit reached. Wait about a minute before trying again.", "rate-limit"),
        value if value >= 500 => upstream("start.gg is temporarily unavailable. Try again shortly.", "upstream"),
        _ => upstream("start.gg request failed.", "upstream"),
    }
}

fn classify_message(message: &str) -> ApiError {
    let normalized = message.to_lowercase();
    if normalized.contains("rate limit") || normalized.contains("too many requests") {
        return upstream("start.gg rate limit reached. Wait about a minute before trying again.", "rate-limit");
    }
    if normalized.contains("query complexity") {
        return upstream("start.gg rejected the request because it returned too many objects.", "query-complexity");
    }
    if normalized.contains("unauth") || normalized.contains("invalid token") || normalized.contains("expired token") {
        return upstream("start.gg rejected the token. It may be invalid or expired.", "authentication");
    }
    if normalized.contains("forbidden") || normalized.contains("permission") {
        return upstream("This start.gg token does not have permission to read the requested tournament data.", "permission");
    }
    upstream(message, "graphql")
}

fn invalid_response(message: &str) -> ApiError {
    upstream(message, "invalid-response")
}

fn upstream(message: &str, code: &'static str) -> ApiError {
    ApiError { error: message.to_owned(), code }
}

#[cfg(test)]
mod tests {
    use super::{
        character_for_entrant_from_games, classify_message, grand_final_prerequisite,
        is_initial_grand_final, is_winners_final, node_list, player_from_slot, set_summary,
        validate_event_slug, MAX_EVENT_HEAD_TO_HEAD_PAGES, MAX_GLOBAL_HEAD_TO_HEAD_PAGES,
        REQUEST_BURST_CAPACITY, REQUEST_REFILL_INTERVAL, SAFE_SET_PAGE_SIZE,
    };
    use crate::startgg_queries;
    use serde_json::json;
    use std::time::Duration;

    #[test]
    fn classifies_failures_and_rejects_malformed_collections() {
        assert_eq!(classify_message("rate limit exceeded").code, "rate-limit");
        assert_eq!(classify_message("invalid token").code, "authentication");
        assert_eq!(classify_message("permission denied").code, "permission");
        assert!(node_list(Some(&json!({})), "set nodes").is_err());
        assert_eq!(node_list(Some(&json!([null, { "id": "1" }])), "set nodes").unwrap().len(), 1);
    }

    #[test]
    fn maps_set_summary_with_participant_tag_and_phase_context() {
        let summary = set_summary(&json!({
            "id": 42,
            "fullRoundText": "Winners Semi-Final",
            "phaseGroup": { "displayIdentifier": "A1", "phase": { "name": "Pools" } },
            "station": { "number": 3 },
            "slots": [
                { "entrant": { "id": 1, "name": "TEAM | Player", "participants": [{ "gamerTag": "Player" }] }, "standing": { "stats": { "score": { "value": 2 } } } },
                { "entrant": { "id": 2, "name": "Opponent", "participants": [] }, "standing": { "stats": { "score": { "value": 1 } } } }
            ]
        })).unwrap().unwrap();
        assert_eq!(summary["id"], "42");
        assert_eq!(summary["entrantOne"]["name"], "Player");
        assert_eq!(summary["phase"], "Pools");
        assert_eq!(summary["phaseGroup"], "A1");
        assert_eq!(summary["station"], "Station 3");
    }

    #[test]
    fn selected_set_mapper_imports_player_identity_and_character_selections() {
        assert!(startgg_queries::SET_BY_ID.contains("initialSeedNum"));
        assert!(startgg_queries::SET_BY_ID.contains("genderPronoun"));
        assert!(startgg_queries::SET_BY_ID.contains("prereqPlacement"));
        assert!(startgg_queries::SET_BY_ID.contains("player { id"));
        assert!(startgg_queries::SET_BY_ID.contains("games {"));
        assert!(startgg_queries::SET_BY_ID.contains("selections"));
        assert!(startgg_queries::SET_BY_ID.contains("event { videogame { id name } }"));
        let player = player_from_slot(Some(&json!({
            "entrant": {
                "id": "entrant-1",
                "name": "TEAM | Player",
                "initialSeedNum": 7,
                "participants": [{
                    "gamerTag": "Player",
                    "prefix": "TEAM",
                    "player": { "id": 1000 },
                    "user": { "genderPronoun": "they/them" }
                }]
            },
            "standing": { "stats": { "score": { "value": 1 } } }
        })), None, "set-1", 1);
        assert_eq!(player.name, "Player");
        assert_eq!(player.prefix.as_deref(), Some("TEAM"));
        assert_eq!(player.player_id.as_deref(), Some("1000"));
        assert_eq!(player.pronouns.as_deref(), Some("they/them"));
        assert_eq!(player.seed, Some(7));

        let unseeded = player_from_slot(Some(&json!({
            "entrant": { "id": "entrant-2", "name": "Player", "initialSeedNum": 0 }
        })), None, "set-1", 2);
        assert_eq!(unseeded.seed, None);
        let games = json!([{
            "selections": [
                { "entrant": { "id": "entrant-1" }, "character": { "id": 1, "name": "Ryu" } },
                { "entrant": { "id": "entrant-2" }, "character": { "id": 2, "name": "Ken" } }
            ]
        }]);
        assert_eq!(
            character_for_entrant_from_games(Some(&games), "entrant-1").as_deref(),
            Some("Ryu")
        );
        assert_eq!(
            character_for_entrant_from_games(Some(&games), "entrant-2").as_deref(),
            Some("Ken")
        );
        assert!(character_for_entrant_from_games(Some(&games), "entrant-3").is_none());
        assert!(character_for_entrant_from_games(None, "entrant-1").is_none());
    }

    #[test]
    fn versus_history_query_is_bounded_and_uses_stable_player_ids() {
        assert!(startgg_queries::VERSUS_HISTORY.contains("player(id: $playerOneId)"));
        assert!(startgg_queries::VERSUS_HISTORY.contains("player(id: $playerTwoId)"));
        assert!(startgg_queries::VERSUS_HISTORY.contains("recentStandings"));
        assert!(!startgg_queries::VERSUS_HISTORY.contains("sets("));
        assert!(startgg_queries::EVENT_HEAD_TO_HEAD.contains("filters: { entrantIds: $entrantIds }"));
        assert!(startgg_queries::EVENT_HEAD_TO_HEAD.contains("completedAt"));
        assert!(startgg_queries::PLAYER_SET_HISTORY.contains("player(id: $playerId)"));
        assert!(startgg_queries::PLAYER_SET_HISTORY.contains("pageInfo { total totalPages }"));
        assert_eq!(MAX_EVENT_HEAD_TO_HEAD_PAGES, 5);
        assert_eq!(MAX_GLOBAL_HEAD_TO_HEAD_PAGES, 5);
        let maximum_first_minute_requests = REQUEST_BURST_CAPACITY
            + Duration::from_secs(60).as_secs_f64()
                / REQUEST_REFILL_INTERVAL.as_secs_f64();
        assert!(maximum_first_minute_requests < 80.0);
        assert_eq!(100_u32.min(SAFE_SET_PAGE_SIZE), 20);
        assert_eq!(12_u32.min(SAFE_SET_PAGE_SIZE), 12);
        assert!(startgg_queries::EVENT_STANDINGS.contains("standings"));
        assert!(startgg_queries::EVENT_STANDINGS.contains("placement"));
        assert!(startgg_queries::EVENT_STANDINGS.contains("isFinal"));
        assert!(startgg_queries::EVENT_STANDINGS.contains("gamerTag"));
        assert!(startgg_queries::EVENT_STANDINGS.contains("prefix"));
        assert!(startgg_queries::EVENT_STANDINGS.contains("videogame"));
        assert!(startgg_queries::EVENT_STANDINGS.contains("country"));
        assert!(startgg_queries::EVENT_STANDINGS.contains("player { id"));
        assert!(startgg_queries::EVENT_STANDINGS.contains("slug"));
        assert!(startgg_queries::EVENT_STANDINGS.contains("numEntrants"));
        assert!(!startgg_queries::EVENT_STANDINGS.contains("$videogameId"));
        assert!(startgg_queries::EVENT_STANDINGS_BY_SLUG.contains("event(slug: $eventSlug)"));
        assert!(!startgg_queries::SET_BY_ID.contains("$videogameId"));
        assert!(validate_event_slug("tournament/ceo-2026/event/street-fighter-6").is_ok());
        assert!(validate_event_slug("https://start.gg/tournament/ceo/event/sf6").is_err());
        assert!(validate_event_slug("tournament/ceo/event/../../token").is_err());
    }

    #[test]
    fn grand_final_provenance_requires_a_winning_set_prerequisite() {
        assert!(is_initial_grand_final("Grand Finals"));
        assert!(!is_initial_grand_final("Grand Final Reset"));
        assert!(is_winners_final("Winners Final"));
        let slots = json!([
            {
                "slotIndex": 0,
                "prereqId": "winners-final-set",
                "prereqType": "set",
                "prereqPlacement": 1,
                "entrant": { "id": "entrant-one" }
            },
            {
                "slotIndex": 1,
                "prereqId": "losers-final-set",
                "prereqType": "set",
                "prereqPlacement": 1,
                "entrant": { "id": "entrant-two" }
            }
        ]);
        let slots = slots.as_array().unwrap().iter().collect::<Vec<_>>();
        assert_eq!(
            grand_final_prerequisite(&slots, 0),
            Some(("entrant-one".to_owned(), "winners-final-set".to_owned()))
        );
    }
}
