//! Both OBS stats sources share cached results. Fetch updates only while a source is open.
mod cache;
mod queries;
mod run;
mod settings;
pub use settings::SettingsStore;

use crate::{
    local_server::{secure_json, startgg_error},
    runtime::RuntimeState,
    startgg::{normalized_id, safe_history_text},
    startgg_placements::RecentPlacement,
    state::SelectedSet,
};
use axum::{
    Json, Router,
    extract::{Query, State},
    http::StatusCode,
    response::Response,
    routing::get,
};
pub use cache::StatsCache;
use jabs_startgg_client::{ApiError, api_error};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::sync::Arc;

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatsContext {
    #[serde(skip_serializing_if = "Option::is_none")]
    event_id: Option<String>,
    game_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    player_id: Option<String>,
    entrant_id: String,
}

impl StatsContext {
    fn from_set(set: &SelectedSet, slot: u8) -> Self {
        let player = if slot == 1 {
            &set.player_one
        } else {
            &set.player_two
        };
        Self {
            event_id: set.event_id.clone(),
            game_id: set
                .videogame_id
                .clone()
                .or_else(|| set.asset_catalog_slug.clone())
                .unwrap_or_else(|| set.game_id.clone()),
            player_id: player.player_id.clone(),
            entrant_id: player.entrant_id.clone(),
        }
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerStats {
    context: StatsContext,
    tournament_name: String,
    placements: Vec<RecentPlacement>,
    run: Vec<run::RunSet>,
    run_scope: &'static str,
    run_complete: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    placements_error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    run_error: Option<String>,
}

pub fn router() -> Router<Arc<RuntimeState>> {
    Router::new()
        .route("/api/broadcast/player-stats", get(current))
        .route(
            "/api/broadcast/player-stats/settings",
            get(settings::current).put(settings::update),
        )
        .route(
            "/assets/startgg-tournament-logos/{asset_id}",
            get(cache::logo),
        )
}

#[derive(Deserialize)]
struct StatsQuery {
    player: u8,
}

async fn current(
    State(runtime): State<Arc<RuntimeState>>,
    Query(query): Query<StatsQuery>,
) -> Response {
    if !matches!(query.player, 1 | 2) {
        return secure_json((
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "Choose Player 1 or Player 2."})),
        ));
    }
    let selected = match runtime.overlay.selected_set() {
        Ok(selected) => selected,
        Err(_) => {
            return startgg_error(api_error(
                "The live match is unavailable.",
                "stats-unavailable",
            ));
        }
    };
    let context = StatsContext::from_set(&selected, query.player);
    match runtime.player_stats.load(runtime.clone(), context).await {
        Ok(stats) => secure_json(Json(stats)),
        Err(error) => startgg_error(error),
    }
}

async fn load(runtime: &RuntimeState, context: StatsContext) -> Result<PlayerStats, ApiError> {
    let mut stats = PlayerStats {
        context: context.clone(),
        tournament_name: String::new(),
        placements: vec![],
        run: vec![],
        run_scope: "none",
        run_complete: true,
        placements_error: None,
        run_error: None,
    };
    let metadata = match &context.event_id {
        Some(event_id) => {
            crate::startgg::request::<Value>(
                runtime,
                queries::CONTEXT,
                json!({"eventId": event_id}),
            )
            .await
        }
        None => Ok(Value::Null),
    };
    let game_id = metadata
        .as_ref()
        .ok()
        .and_then(|data| data.pointer("/event/videogame/id"))
        .and_then(normalized_id)
        .unwrap_or_else(|| context.game_id.clone());
    let tournament = metadata
        .as_ref()
        .ok()
        .and_then(|data| data.pointer("/event/tournament"));
    let tournament_id = tournament
        .and_then(|value| value.get("id"))
        .and_then(normalized_id);
    let profile = async {
        match &context.player_id {
            Some(id) => crate::startgg::request::<Value>(
                runtime,
                queries::PLACEMENTS,
                json!({"playerId": id, "videogameId": game_id}),
            )
            .await
            .map(Some),
            None => Ok(None),
        }
    };
    let run = async {
        match &tournament_id {
            Some(id) => Some(run::load_run(runtime, &context, id).await),
            None => None,
        }
    };
    let (profile, run) = tokio::join!(profile, run);
    match profile {
        Ok(Some(data)) => match data.get("player").and_then(Value::as_object) {
            Some(player) => match crate::startgg_placements::recent_placements(player, &game_id, 5)
            {
                Ok(placements) => {
                    runtime.player_stats.register_logos(&placements);
                    stats.placements = placements;
                }
                Err(error) => stats.placements_error = Some(error.error),
            },
            None => {
                stats.placements_error = Some("The linked start.gg player was not found.".into())
            }
        },
        Err(error) => stats.placements_error = Some(error.error),
        Ok(None) => {}
    }
    if context.event_id.is_none() {
        return Ok(stats);
    }
    let Some(result) = run else {
        stats.run_complete = false;
        stats.run_error = Some(
            metadata
                .err()
                .map(|error| error.error)
                .unwrap_or_else(|| "The current tournament could not be loaded.".into()),
        );
        return Ok(stats);
    };
    stats.tournament_name =
        safe_history_text(tournament.and_then(|value| value.get("name")), "Tournament");
    stats.run_scope = "event";
    stats.run = result.sets;
    stats.run_complete = result.error.is_none();
    stats.run_error = result.error;
    Ok(stats)
}
