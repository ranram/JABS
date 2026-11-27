use axum::{
    Json, Router,
    extract::State,
    http::{HeaderMap, StatusCode},
    response::Response,
    routing::post,
};
use serde::Deserialize;
use futures_util::FutureExt;
use std::{future::Future, panic::AssertUnwindSafe, sync::Arc};
use crate::{
    diagnostics::{Area, Context, Event, Method, Reason},
    local_server::{reject_untrusted_mutation, secure_json, startgg_error, startgg_error_status, state_result},
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
    let report_runtime = runtime.clone();
    run_report(runtime, body.set_id.clone(), async move {
        perform_active_report(&report_runtime, body).await
    }).await
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
        return report_conflict("report-baseline-missing", serde_json::json!({
            "error": "Reload this set from start.gg so JABS can check whether the result changed."
        }));
    };
    if let Err(response) = fresh_report_set(runtime, &body.set_id, &current.game_id, expected).await {
        return response;
    }
    let game_data = crate::startgg::reported_games(
        runtime,
        &body.set_id,
        current.asset_catalog_slug.as_deref().unwrap_or(&current.game_id),
        if body.outcome.is_some() { None } else { current.game_history.as_deref() },
    ).await;
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
        Err(error) => return reporting_error(error),
    };
    let saved = runtime.overlay.mark_reported(
        &runtime.database, &body.set_id, &body.updated_at, &reported.state, body.outcome,
    );
    runtime.refresh_reported_results();
    let state = match saved {
        Ok(state) => state,
        Err(error) => return report_conflict("report-save-conflict", serde_json::json!({
            "error": error,
            "reportedSetId": reported.id,
            "reportedSetState": reported.state
        })),
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
    if !crate::state::is_game_id(&body.game_id) {
        return state_result(Err("Choose a supported game.".to_owned()));
    }
    if body.game_history.as_ref().is_some_and(|history| history.len() > 99) {
        return state_result(Err("Recorded game history is too long.".to_owned()));
    }
    if let Err(response) = check_quick_report_target(&runtime, &body.set_id) {
        return response;
    }
    let report_runtime = runtime.clone();
    run_report(runtime, body.set_id.clone(), async move {
        perform_quick_report(&report_runtime, body).await
    }).await
}

async fn perform_quick_report(runtime: &RuntimeState, body: QuickReportBody) -> Response {
    let mut current = match fresh_report_set(runtime, &body.set_id, &body.game_id, &body.expected).await {
        Ok(current) => current,
        Err(response) => return response,
    };
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
    let game_data = crate::startgg::reported_games(
        runtime,
        &body.set_id,
        current.asset_catalog_slug.as_deref().unwrap_or(&current.game_id),
        if body.outcome.is_some() { None } else { current.game_history.as_deref() },
    ).await;
    let reported_character_selection_count = game_data.as_ref().map_or(0, |games| {
        games.iter().map(|game| game.selections.len()).sum::<usize>()
    });
    if let Err(response) = check_quick_report_target(runtime, &body.set_id) {
        return response;
    }
    let reported = match crate::startgg::report_set(
        runtime, &body.set_id, &readiness.winner_id, game_data.as_deref(),
        body.outcome.as_ref().is_some_and(|outcome| matches!(outcome.kind, crate::state::ReportOutcomeKind::Disqualification)),
    ).await {
        Ok(reported) => reported,
        Err(error) => return reporting_error(error),
    };
    runtime.refresh_reported_results();
    secure_json(Json(serde_json::json!({
        "reportedSetId": reported.id,
        "reportedSetState": reported.state,
        "reportedGameCount": game_data.as_ref().map_or(0, Vec::len),
        "reportedCharacterSelectionCount": reported_character_selection_count
    })))
}

fn check_quick_report_target(runtime: &RuntimeState, set_id: &str) -> Result<(), Response> {
    let live = runtime.overlay.selected_set().map_err(|error| state_result(Err(error)))?;
    if live.set_id.as_deref() == Some(set_id) {
        return Err(report_conflict("report-use-live-controls", serde_json::json!({
            "error": "This set is on air. Use the live score controls to report it."
        })));
    }
    Ok(())
}

fn active_set(runtime: &RuntimeState, body: &ReportSetBody) -> Result<SelectedSet, Response> {
    let current = runtime
        .overlay
        .selected_set()
        .map_err(|error| state_result(Err(error)))?;
    if current.set_id.as_deref() != Some(body.set_id.as_str())
        || current.updated_at != body.updated_at
    {
        return Err(report_conflict("report-live-set-changed", serde_json::json!({
            "error": "The live set changed before reporting. Review the current players and score, then confirm again."
        })));
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
    if fresh.startgg_best_of != expected.best_of {
        return Err(report_conflict("report-format-changed", serde_json::json!({
            "error": "The match format changed on start.gg. Reload the set and review the score before reporting."
        })));
    }
    if fresh.state.as_deref() == Some("3") || ReportBaseline::from_set(&fresh) != *expected {
        return Err(report_conflict("report-stale", serde_json::json!({
            "error": "Reload this set from start.gg and check whether a result has already been reported."
        })));
    }
    Ok(fresh)
}

async fn begin_report(runtime: &RuntimeState, set_id: &str, queue_token: Option<u64>) -> Option<Response> {
    if !matches!(crate::secrets::token(runtime), Ok(Some(_))) {
        runtime.match_queue.reported(&runtime.database, queue_token, set_id, false);
        return Some(startgg_error(jabs_startgg_client::api_error(
            "Add a start.gg token to report results. Local overlay controls do not need one.", "token-missing",
        )));
    }
    let mut reporting = runtime.reporting_set_id.lock().await;
    if reporting.is_some() {
        return Some(report_conflict("report-in-progress", serde_json::json!({
            "error": "A set report is already in progress."
        })));
    }
    *reporting = Some(set_id.to_owned());
    None
}

async fn run_report(
    runtime: Arc<RuntimeState>,
    set_id: String,
    report: impl Future<Output = Response> + Send + 'static,
) -> Response {
    let queue_token = runtime.match_queue.report_token(&set_id);
    if let Some(response) = begin_report(&runtime, &set_id, queue_token).await {
        return response;
    }
    // A confirmed report owns its queue update and reservation even if HTTP disconnects.
    tokio::spawn(async move {
        let response = AssertUnwindSafe(report).catch_unwind().await.unwrap_or_else(|_| {
            uncertain_report("server", StatusCode::INTERNAL_SERVER_ERROR)
        });
        runtime.match_queue.reported(
            &runtime.database, queue_token, &set_id, response.status().is_success(),
        );
        *runtime.reporting_set_id.lock().await = None;
        response
    }).await.unwrap_or_else(|_| uncertain_report("server", StatusCode::INTERNAL_SERVER_ERROR))
}

// Report conflicts stop before start.gg or leave its accepted result unsaved, so
// each branch returns and logs a stable code. Support can tell them apart
// without the player names, set IDs, or start.gg messages that never reach logs.
fn report_conflict(code: &'static str, mut body: serde_json::Value) -> Response {
    crate::diagnostics::record(
        Event::ReportConflict,
        Context {
            area: Area::Reporting,
            reason: Some(Reason::from_code(code)),
            status: Some(StatusCode::CONFLICT.as_u16()),
            method: Some(Method::Post),
            ..Context::default()
        },
    );
    if let Some(object) = body.as_object_mut() {
        object.insert("code".to_owned(), serde_json::Value::String(code.to_owned()));
    }
    let mut response = secure_json((StatusCode::CONFLICT, Json(body)));
    response.extensions_mut().insert(crate::diagnostics::DetailedHttpFailure);
    response
}

fn reporting_error(mut error: crate::startgg::ApiError) -> Response {
    if error.code == "permission" {
        error.error = "This token cannot report this set. Use an account authorized for this tournament; OAuth integrations require tournament.reporter.".to_owned();
    } else if matches!(error.code, "network" | "timeout" | "upstream" | "invalid-response") {
        return uncertain_report(error.code, startgg_error_status(error.code));
    }
    startgg_error(error)
}

fn uncertain_report(cause: &str, status: StatusCode) -> Response {
    crate::diagnostics::record(
        Event::ReportOutcomeUncertain,
        Context {
            area: Area::Reporting,
            reason: Some(Reason::from_code(cause)),
            status: Some(status.as_u16()),
            method: Some(Method::Post),
            ..Context::default()
        },
    );
    let error = jabs_startgg_client::api_error(
        "start.gg may have accepted the result. Reload the set and check the result before reporting again.",
        "report-outcome-uncertain",
    );
    let mut response = secure_json((status, Json(error)));
    response.extensions_mut().insert(crate::diagnostics::DetailedHttpFailure);
    response
}
