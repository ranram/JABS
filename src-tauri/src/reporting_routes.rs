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
    state::{ReportBaseline, SelectedSet},
};

#[cfg(test)]
mod tests;

pub fn router() -> Router<Arc<RuntimeState>> {
    Router::new()
        .route("/api/startgg/report-set", post(report_startgg_set))
        .route("/api/startgg/quick-report-set", post(quick_report_startgg_set))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReportSetBody {
    outcome: Option<crate::state::ReportOutcome>,
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
    let queue_set_id = body.set_id.clone();
    let queue_token = runtime.match_queue.report_token(&queue_set_id);
    if let Some(response) = begin_report(&runtime, &body.set_id).await {
        runtime.match_queue.reported(&runtime.database, queue_token, &queue_set_id, false);
        return response;
    }
    let response = perform_active_report(&runtime, body).await;
    finish_report(&runtime).await;
    runtime.match_queue.reported(&runtime.database, queue_token, &queue_set_id, response.status().is_success());
    response
}

async fn perform_active_report(runtime: &RuntimeState, body: ReportSetBody) -> Response {
    let current = match active_set(runtime, &body) {
        Ok(current) => current,
        Err(response) => return response,
    };
    let readiness = match crate::state::report_readiness(&current, body.outcome.as_ref()) {
        Ok(readiness) => readiness,
        Err(error) => return state_result(Err(error)),
    };
    if readiness.winner_id != body.winner_id {
        return state_result(Err("The confirmed winner does not match the completed local score.".to_owned()));
    }
    let Some(expected) = current.report_baseline.as_ref().filter(|baseline| baseline.same_entrants(&current)) else {
        return secure_json((StatusCode::CONFLICT, Json(serde_json::json!({
            "error": "Reload this set from start.gg before reporting so JABS can check for changes by another organizer."
        }))));
    };
    if let Err(response) = fresh_report_set(runtime, &body.set_id, &current.game_id, expected).await {
        return response;
    }
    let game_data = match crate::startgg::reported_games(
        runtime,
        &body.set_id,
        if body.outcome.is_some() { None } else { current.game_history.as_deref() },
    ).await {
        Ok(game_data) => game_data,
        Err(error) => return startgg_error(error),
    };
    let reported_character_selection_count = game_data.as_ref().map_or(0, |games| {
        games.iter().map(|game| game.selections.len()).sum::<usize>()
    });
    if let Err(response) = active_set(runtime, &body) {
        return response;
    }
    let reported = match crate::startgg::report_set(
        runtime, &body.set_id, &body.winner_id, game_data.as_deref(),
        body.outcome.as_ref().is_some_and(|outcome| matches!(outcome.kind, crate::state::ReportOutcomeKind::Disqualification)),
    ).await {
        Ok(reported) => reported,
        Err(error) => return reporting_error(error, "reload bracket data from start.gg"),
    };
    runtime.versus_history.invalidate();
    runtime.player_stats.invalidate();
    let state = match runtime.overlay.mark_reported(&runtime.database, &body.set_id, &reported.state, body.outcome) {
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
        "reportedCharacterSelectionCount": reported_character_selection_count,
        "winnerScore": readiness.winner_score,
        "loserScore": readiness.loser_score
    })))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct QuickReportBody {
    outcome: Option<crate::state::ReportOutcome>,
    set_id: String,
    game_id: String,
    best_of: u32,
    expected: ReportBaseline,
    player_one_score: u32,
    player_two_score: u32,
    game_history: Option<Vec<crate::state::GameResult>>,
    confirmed: bool,
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
    let queue_set_id = body.set_id.clone();
    let queue_token = runtime.match_queue.report_token(&queue_set_id);
    if let Some(response) = begin_report(&runtime, &body.set_id).await {
        runtime.match_queue.reported(&runtime.database, queue_token, &queue_set_id, false);
        return response;
    }
    let response = perform_quick_report(&runtime, body).await;
    finish_report(&runtime).await;
    runtime.match_queue.reported(&runtime.database, queue_token, &queue_set_id, response.status().is_success());
    response
}

async fn perform_quick_report(runtime: &RuntimeState, body: QuickReportBody) -> Response {
    let mut current = match fresh_report_set(runtime, &body.set_id, &body.game_id, &body.expected).await {
        Ok(current) => current,
        Err(response) => return response,
    };
    current.best_of = body.best_of;
    current.player_one.score = body.player_one_score;
    current.player_two.score = body.player_two_score;
    current.game_history = body.game_history;
    if let Err(error) = crate::state::validate_selected_set(&current) {
        return state_result(Err(error));
    }
    let readiness = match crate::state::report_readiness(&current, body.outcome.as_ref()) {
        Ok(readiness) => readiness,
        Err(error) => return state_result(Err(error)),
    };
    let game_data = match crate::startgg::reported_games(
        runtime,
        &body.set_id,
        if body.outcome.is_some() { None } else { current.game_history.as_deref() },
    ).await {
        Ok(game_data) => game_data,
        Err(error) => return startgg_error(error),
    };
    let reported_character_selection_count = game_data.as_ref().map_or(0, |games| {
        games.iter().map(|game| game.selections.len()).sum::<usize>()
    });
    let reported = match crate::startgg::report_set(
        runtime, &body.set_id, &readiness.winner_id, game_data.as_deref(),
        body.outcome.as_ref().is_some_and(|outcome| matches!(outcome.kind, crate::state::ReportOutcomeKind::Disqualification)),
    ).await {
        Ok(reported) => reported,
        Err(error) => return reporting_error(error, "refresh the bracket"),
    };
    runtime.versus_history.invalidate();
    runtime.player_stats.invalidate();
    if runtime.overlay.selected_set().is_ok_and(|set| set.set_id.as_deref() == Some(&body.set_id)) {
        if let Err(error) = runtime.overlay.mark_reported(&runtime.database, &body.set_id, &reported.state, body.outcome) {
            return secure_json((StatusCode::CONFLICT, Json(serde_json::json!({
                "error": error, "reportedSetId": reported.id, "reportedSetState": reported.state
            }))));
        }
    }
    secure_json(Json(serde_json::json!({
        "reportedSetId": reported.id,
        "reportedSetState": reported.state,
        "reportedGameCount": game_data.as_ref().map_or(0, Vec::len),
        "reportedCharacterSelectionCount": reported_character_selection_count
    })))
}

fn active_set(runtime: &RuntimeState, body: &ReportSetBody) -> Result<SelectedSet, Response> {
    let current = runtime
        .overlay
        .selected_set()
        .map_err(|error| state_result(Err(error)))?;
    if current.set_id.as_deref() != Some(body.set_id.as_str())
        || current.updated_at != body.updated_at
    {
        return Err(secure_json((
            StatusCode::CONFLICT,
            Json(serde_json::json!({
                "error": "The live set changed before reporting. Review the current players and score, then confirm again."
            })),
        )));
    }
    Ok(current)
}

async fn fresh_report_set(
    runtime: &RuntimeState,
    set_id: &str,
    game_id: &str,
    expected: &ReportBaseline,
) -> Result<SelectedSet, Response> {
    let fresh = crate::startgg::selected_set(
        runtime,
        crate::startgg::SelectedSetRequest {
            set_id,
            game_id,
            asset_catalog_slug: None,
            event_id: None,
            tournament_slug: None,
        },
    )
    .await
    .map_err(startgg_error)?;
    check_report_set(set_id, expected, fresh)
}

fn check_report_set(
    set_id: &str,
    expected: &ReportBaseline,
    fresh: Option<SelectedSet>,
) -> Result<SelectedSet, Response> {
    let Some(fresh) = fresh.filter(|set| set.set_id.as_deref() == Some(set_id)) else {
        return Err(secure_json((
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "error": "Set not found." })),
        )));
    };
    if fresh.state.as_deref() == Some("3") || ReportBaseline::from_set(&fresh) != *expected {
        return Err(secure_json((
            StatusCode::CONFLICT,
            Json(serde_json::json!({
                "error": "This set changed on start.gg. Reload it, review the latest result, and confirm again."
            })),
        )));
    }
    Ok(fresh)
}

async fn begin_report(runtime: &RuntimeState, set_id: &str) -> Option<Response> {
    if !matches!(crate::secrets::token(runtime), Ok(Some(_))) {
        return Some(startgg_error(jabs_startgg_client::api_error(
            "Add a start.gg token to report results. Local overlay controls do not need one.", "token-missing",
        )));
    }
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
        crate::diagnostics::record(crate::diagnostics::Event::ReportOutcomeUncertain,
            crate::diagnostics::Context { area: crate::diagnostics::Area::Reporting,
                reason: Some(crate::diagnostics::Reason::from_code(error.code)), ..Default::default() });
        error.error = format!("{} The report outcome may be uncertain; {recovery} before trying again.", error.error);
    }
    startgg_error(error)
}
