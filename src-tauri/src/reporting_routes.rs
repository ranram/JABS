use axum::{
    Json, Router,
    extract::State,
    http::{HeaderMap, StatusCode},
    response::Response,
    routing::post,
};
use serde::Deserialize;
use std::sync::Arc;
use crate::{
    local_server::{reject_untrusted_mutation, secure_json, startgg_error, state_result},
    runtime::RuntimeState,
};

pub fn router() -> Router<Arc<RuntimeState>> {
    Router::new()
        .route("/api/startgg/report-set", post(report_startgg_set))
        .route("/api/startgg/quick-report-set", post(quick_report_startgg_set))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReportSetBody {
    set_id: String,
    winner_id: String,
    updated_at: String,
    confirmed: bool,
}

async fn report_startgg_set(
    State(runtime): State<Arc<RuntimeState>>,
    headers: HeaderMap,
    Json(body): Json<ReportSetBody>,
) -> Response {
    if let Some(response) = reject_untrusted_mutation(&headers) { return response; }
    if !body.confirmed {
        return state_result(Err("Confirm the start.gg report before submitting it.".to_owned()));
    }
    if let Some(response) = begin_report(&runtime, &body.set_id).await { return response; }
    let response = perform_active_report(&runtime, body).await;
    finish_report(&runtime).await;
    response
}

async fn perform_active_report(runtime: &RuntimeState, body: ReportSetBody) -> Response {
    let current = match runtime.overlay.selected_set() {
        Ok(current) => current,
        Err(error) => return state_result(Err(error)),
    };
    if current.set_id.as_deref() != Some(body.set_id.as_str()) || current.updated_at != body.updated_at {
        return secure_json((StatusCode::CONFLICT, Json(serde_json::json!({
            "error": "The live set changed before reporting. Review the current players and score, then confirm again."
        }))));
    }
    let readiness = match crate::state::report_readiness(&current) {
        Ok(readiness) => readiness,
        Err(error) => return state_result(Err(error)),
    };
    if readiness.winner_id != body.winner_id {
        return state_result(Err("The confirmed winner does not match the completed local score.".to_owned()));
    }
    let game_data = reported_games(readiness.game_winners.as_deref());
    let reported = match crate::startgg::report_set(
        runtime, &body.set_id, &body.winner_id, game_data.as_deref(),
    ).await {
        Ok(reported) => reported,
        Err(error) => return reporting_error(error, "reload bracket data from start.gg"),
    };
    let state = match runtime.overlay.mark_reported(&runtime.database, &body.set_id, &reported.state) {
        Ok(state) => state,
        Err(error) => return secure_json((StatusCode::CONFLICT, Json(serde_json::json!({
            "error": error,
            "reportedSetId": reported.id,
            "reportedSetState": reported.state
        })))),
    };
    secure_json(Json(serde_json::json!({
        "state": state,
        "reportedSetId": reported.id,
        "reportedSetState": reported.state,
        "reportedGameCount": game_data.as_ref().map_or(0, Vec::len),
        "winnerScore": readiness.winner_score,
        "loserScore": readiness.loser_score
    })))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct QuickReportBody {
    set_id: String,
    game_id: String,
    best_of: u32,
    expected: QuickExpected,
    player_one_score: u32,
    player_two_score: u32,
    game_history: Option<Vec<crate::state::GameResult>>,
    confirmed: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct QuickExpected {
    state: Option<String>,
    player_one_entrant_id: String,
    player_two_entrant_id: String,
    player_one_score: u32,
    player_two_score: u32,
}

async fn quick_report_startgg_set(
    State(runtime): State<Arc<RuntimeState>>,
    headers: HeaderMap,
    Json(body): Json<QuickReportBody>,
) -> Response {
    if let Some(response) = reject_untrusted_mutation(&headers) { return response; }
    if !body.confirmed {
        return state_result(Err("Confirm the start.gg report before submitting it.".to_owned()));
    }
    if !matches!(body.best_of, 3 | 5) || !crate::state::is_game_id(&body.game_id) {
        return state_result(Err("Choose a supported game and match length.".to_owned()));
    }
    if body.game_history.as_ref().is_some_and(|history| history.len() > 99) {
        return state_result(Err("Recorded game history is too long.".to_owned()));
    }
    if let Some(response) = begin_report(&runtime, &body.set_id).await { return response; }
    let response = perform_quick_report(&runtime, body).await;
    finish_report(&runtime).await;
    response
}

async fn perform_quick_report(runtime: &RuntimeState, body: QuickReportBody) -> Response {
    let mut current = match crate::startgg::selected_set(runtime, crate::startgg::SelectedSetRequest {
        set_id: &body.set_id,
        game_id: &body.game_id,
        asset_catalog_slug: None,
        event_id: None,
        tournament_slug: None,
    }).await {
        Ok(Some(current)) => current,
        Ok(None) => return secure_json((StatusCode::NOT_FOUND, Json(serde_json::json!({ "error": "Set not found." })))),
        Err(error) => return startgg_error(error),
    };
    let changed = current.state != body.expected.state
        || current.player_one.entrant_id != body.expected.player_one_entrant_id
        || current.player_two.entrant_id != body.expected.player_two_entrant_id
        || current.player_one.score != body.expected.player_one_score
        || current.player_two.score != body.expected.player_two_score;
    if changed {
        return secure_json((StatusCode::CONFLICT, Json(serde_json::json!({
            "error": "This set changed on start.gg after you opened Quick Score Update. Reopen it and review the latest result."
        }))));
    }
    current.best_of = body.best_of;
    current.player_one.score = body.player_one_score;
    current.player_two.score = body.player_two_score;
    current.game_history = body.game_history;
    if let Err(error) = crate::state::validate_selected_set(&current) {
        return state_result(Err(error));
    }
    let readiness = match crate::state::report_readiness(&current) {
        Ok(readiness) => readiness,
        Err(error) => return state_result(Err(error)),
    };
    let game_data = reported_games(readiness.game_winners.as_deref());
    let reported = match crate::startgg::report_set(
        runtime, &body.set_id, &readiness.winner_id, game_data.as_deref(),
    ).await {
        Ok(reported) => reported,
        Err(error) => return reporting_error(error, "refresh the bracket"),
    };
    secure_json(Json(serde_json::json!({
        "reportedSetId": reported.id,
        "reportedSetState": reported.state,
        "reportedGameCount": game_data.as_ref().map_or(0, Vec::len)
    })))
}

fn reported_games(winners: Option<&[String]>) -> Option<Vec<crate::startgg::ReportedGame>> {
    winners.map(|winners| winners.iter().enumerate().map(|(index, winner_id)| {
        crate::startgg::ReportedGame { game_num: index + 1, winner_id: winner_id.clone() }
    }).collect())
}

async fn begin_report(runtime: &RuntimeState, set_id: &str) -> Option<Response> {
    let mut reporting = runtime.reporting_set_id.lock().await;
    if reporting.is_some() {
        return Some(secure_json((
            StatusCode::CONFLICT,
            Json(serde_json::json!({ "error": "A set report is already in progress." })),
        )));
    }
    *reporting = Some(set_id.to_owned());
    None
}

async fn finish_report(runtime: &RuntimeState) {
    *runtime.reporting_set_id.lock().await = None;
}

fn reporting_error(mut error: crate::startgg::ApiError, recovery: &str) -> Response {
    if error.code == "permission" {
        error.error = "This token cannot report this set. Use an account authorized for this tournament; OAuth integrations require tournament.reporter.".to_owned();
    } else if matches!(error.code, "network" | "timeout" | "upstream" | "invalid-response") {
        error.error = format!("{} The report outcome may be uncertain; {recovery} before trying again.", error.error);
    }
    startgg_error(error)
}
