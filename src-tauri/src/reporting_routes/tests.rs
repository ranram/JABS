use super::*;
use std::path::{Path, PathBuf};

fn runtime() -> Arc<RuntimeState> {
    let unused = PathBuf::from("/jabs-no-security-test-assets");
    Arc::new(
        RuntimeState::new(
            crate::database::Database::open(Path::new(":memory:")).unwrap(),
            unused.clone(),
            unused.clone(),
            unused.clone(),
            unused.clone(),
            unused.clone(),
            unused,
        )
        .unwrap(),
    )
}

fn active_report(runtime: &RuntimeState, confirmed: bool) -> ReportSetBody {
    let current = runtime.overlay.selected_set().unwrap();
    ReportSetBody {
        outcome: None,
        set_id: "100".into(),
        winner_id: current.player_one.entrant_id,
        updated_at: current.updated_at,
        confirmed,
    }
}

fn quick_report(confirmed: bool) -> QuickReportBody {
    QuickReportBody {
        outcome: None,
        set_id: "100".into(),
        game_id: "street-fighter-6".into(),
        expected: ReportBaseline {
            state: Some("1".into()),
            best_of: Some(3),
            player_one_entrant_id: "10".into(),
            player_two_entrant_id: "20".into(),
            player_one_score: 0,
            player_two_score: 0,
        },
        player_one_score: 2,
        player_two_score: 0,
        game_history: None,
        confirmed,
    }
}

fn renderer_headers() -> HeaderMap {
    let mut headers = HeaderMap::new();
    headers.insert("x-jabs-action", "renderer-v1".parse().unwrap());
    headers
}

async fn detailed_failure(response: Response) -> (StatusCode, String) {
    let status = response.status();
    assert!(response.extensions().get::<crate::diagnostics::DetailedHttpFailure>().is_some());
    let bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    let body: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
    assert!(body["error"].as_str().is_some_and(|error| !error.is_empty()));
    (status, body["code"].as_str().unwrap_or_default().to_owned())
}

// All rejected requests stop before credential lookup or network access. These
// tests must never read the developer's credential store or report a real set.
#[tokio::test]
async fn both_reporting_routes_require_the_action_header_and_explicit_confirmation() {
    let runtime = runtime();
    let before = runtime.overlay.current().unwrap();
    for (headers, confirmed, expected) in [
        (HeaderMap::new(), true, StatusCode::FORBIDDEN),
        (renderer_headers(), false, StatusCode::UNPROCESSABLE_ENTITY),
    ] {
        let active = report_startgg_set(
            State(runtime.clone()),
            headers.clone(),
            Json(active_report(&runtime, confirmed)),
        )
        .await;
        assert_eq!(active.status(), expected);
        let quick = quick_report_startgg_set(
            State(runtime.clone()),
            headers,
            Json(quick_report(confirmed)),
        )
        .await;
        assert_eq!(quick.status(), expected);
        assert!(runtime.reporting_set_id.lock().await.is_none());
        assert_eq!(runtime.overlay.current().unwrap(), before);
    }
}

#[tokio::test]
async fn active_reports_reject_stale_matches_and_a_winner_that_disagrees_with_the_score() {
    let runtime = runtime();
    let mut current = runtime.overlay.selected_set().unwrap();
    current.set_id = Some("100".into());
    current.event_id = Some("456".into());
    current.player_one.entrant_id = "10".into();
    current.player_two.entrant_id = "20".into();
    current.player_one.score = 2;
    current.player_two.score = 0;
    current.best_of = 3;
    current.startgg_best_of = Some(3);
    current.game_history = None;
    runtime
        .overlay
        .replace_selected_set(
            &runtime.database,
            Path::new("/jabs-no-security-test-assets"),
            Path::new("/jabs-no-security-test-assets"),
            current,
        )
        .unwrap();
    let before = runtime.overlay.current().unwrap();
    let mut stale = active_report(&runtime, true);
    stale.updated_at = "old-match-version".into();
    assert_eq!(
        detailed_failure(perform_active_report(&runtime, stale).await).await,
        (StatusCode::CONFLICT, "report-live-set-changed".to_owned())
    );
    let mut other_set = active_report(&runtime, true);
    other_set.set_id = "200".into();
    assert_eq!(
        detailed_failure(perform_active_report(&runtime, other_set).await).await,
        (StatusCode::CONFLICT, "report-live-set-changed".to_owned())
    );
    let mut wrong_winner = active_report(&runtime, true);
    wrong_winner.winner_id = "20".into();
    assert_eq!(
        perform_active_report(&runtime, wrong_winner).await.status(),
        StatusCode::UNPROCESSABLE_ENTITY
    );
    assert_eq!(runtime.overlay.current().unwrap(), before);
    let mut invalid_outcome = active_report(&runtime, true);
    invalid_outcome.outcome = Some(crate::state::ReportOutcome {
        kind: crate::state::ReportOutcomeKind::Disqualification, winner_id: "foreign-player".into()
    });
    assert_eq!(perform_active_report(&runtime, invalid_outcome).await.status(), StatusCode::UNPROCESSABLE_ENTITY);
    for kind in [None, Some(crate::state::ReportOutcomeKind::WinLoss), Some(crate::state::ReportOutcomeKind::Disqualification)] {
        let mut request = active_report(&runtime, true);
        request.outcome = kind.map(|kind| crate::state::ReportOutcome { kind, winner_id: "10".into() });
        assert_eq!(
            detailed_failure(perform_active_report(&runtime, request).await).await,
            (StatusCode::CONFLICT, "report-baseline-missing".to_owned())
        );
    }

    let confirmed = active_report(&runtime, true);
    runtime.overlay.set_score(&runtime.database, "one", 1).unwrap();
    let edited = runtime.overlay.current().unwrap();
    assert!(runtime.overlay.mark_reported(
        &runtime.database, &confirmed.set_id, &confirmed.updated_at, "3", None,
    ).is_err());
    assert_eq!(runtime.overlay.current().unwrap(), edited);
}

#[tokio::test]
async fn a_duplicate_report_leaves_the_running_queue_alone() {
    use crate::match_queue::{Context, Entry, Mode, engine};

    let runtime = runtime();
    let mut live = runtime.overlay.selected_set().unwrap();
    live.set_id = Some("100".into());
    live.event_id = Some("456".into());
    live.player_one.entrant_id = "10".into();
    live.player_two.entrant_id = "20".into();
    runtime.overlay.replace_selected_set(
        &runtime.database, &runtime.logo_directory, &runtime.game_asset_directory, live.clone(),
    ).unwrap();
    let context: Context = serde_json::from_value(serde_json::json!({
        "eventId": "456", "eventName": "Singles", "tournamentSlug": "tournament/test", "gameId": live.game_id,
    })).unwrap();
    let queue = &runtime.match_queue;
    let initial = queue.add(
        &runtime.database, queue.current().unwrap().revision, context, Entry::from_set(&live).unwrap(),
    ).unwrap();
    let configured = queue.edit(
        &runtime.database, initial.revision, "settings", None, None, Some(Mode::Report), Some(1),
    ).unwrap();
    queue.heartbeat("operator".into(), Some("456".into()), false, None).unwrap();
    let running = engine::navigate(&runtime, configured.revision, "start", None).await.unwrap();
    assert!(running.running && queue.report_token("100").is_some());
    *runtime.session_token.lock().unwrap() = Some(zeroize::Zeroizing::new("test-only".to_owned()));
    *runtime.reporting_set_id.lock().await = Some("100".into());
    let live_duplicate = report_startgg_set(
        State(runtime.clone()), renderer_headers(), Json(active_report(&runtime, true)),
    ).await;
    let mut off_air = quick_report(true);
    off_air.set_id = "200".into();
    let quick_duplicate = quick_report_startgg_set(
        State(runtime.clone()), renderer_headers(), Json(off_air),
    ).await;
    for response in [live_duplicate, quick_duplicate] {
        assert_eq!(
            detailed_failure(response).await,
            (StatusCode::CONFLICT, "report-in-progress".to_owned())
        );
    }
    let before = runtime.overlay.current().unwrap();
    let quick_on_air = quick_report_startgg_set(
        State(runtime.clone()), renderer_headers(), Json(quick_report(true)),
    ).await;
    assert_eq!(
        detailed_failure(quick_on_air).await,
        (StatusCode::CONFLICT, "report-use-live-controls".to_owned())
    );
    assert_eq!(runtime.overlay.current().unwrap(), before);
    let after = queue.current().unwrap();
    assert!(after.running);
    assert_eq!(after.revision, running.revision);
}

#[tokio::test]
async fn a_disconnected_caller_does_not_cancel_a_confirmed_report() {
    let runtime = runtime();
    *runtime.session_token.lock().unwrap() = Some(zeroize::Zeroizing::new("test-only".into()));
    let (started, wait_until_started) = tokio::sync::oneshot::channel();
    let (finish, wait_until_finished) = tokio::sync::oneshot::channel();
    let caller = tokio::spawn(run_report(runtime.clone(), "100".into(), async move {
        started.send(()).unwrap();
        wait_until_finished.await.unwrap();
        secure_json(StatusCode::OK)
    }));
    wait_until_started.await.unwrap();
    caller.abort();
    assert!(caller.await.unwrap_err().is_cancelled());
    assert_eq!(runtime.reporting_set_id.lock().await.as_deref(), Some("100"));
    finish.send(()).unwrap();
    tokio::time::timeout(std::time::Duration::from_secs(2), async {
        while runtime.reporting_set_id.lock().await.is_some() {
            tokio::task::yield_now().await;
        }
    }).await.unwrap();
    let next = run_report(runtime.clone(), "200".into(), async { secure_json(StatusCode::OK) }).await;
    assert_eq!(next.status(), StatusCode::OK);
}

#[tokio::test]
async fn an_uncertain_report_response_keeps_the_recovery_code_and_original_status() {
    for (cause, status) in [
        ("timeout", StatusCode::BAD_GATEWAY),
        ("invalid-response", StatusCode::UNPROCESSABLE_ENTITY),
    ] {
        let response = reporting_error(jabs_startgg_client::api_error("upstream detail", cause));
        assert_eq!(
            detailed_failure(response).await,
            (status, "report-outcome-uncertain".to_owned())
        );
    }
}

#[tokio::test]
async fn both_report_paths_reject_changed_upstream_results_and_missing_sets() {
    let runtime = runtime();
    let mut fresh = runtime.overlay.selected_set().unwrap();
    fresh.set_id = Some("100".into());
    fresh.state = Some("1".into());
    fresh.startgg_best_of = Some(3);
    fresh.player_one.entrant_id = "10".into();
    fresh.player_two.entrant_id = "20".into();
    let expected = ReportBaseline::from_set(&fresh);
    assert!(check_report_set("100", &expected, Some(fresh.clone())).is_ok());
    let changes: [(&str, &str, fn(&mut SelectedSet)); 7] = [
        ("set started", "report-stale", |set| set.state = Some("2".into())),
        ("set reported", "report-stale", |set| set.state = Some("3".into())),
        ("first entrant replaced", "report-stale", |set| {
            set.player_one.entrant_id = "30".into()
        }),
        ("second entrant replaced", "report-stale", |set| {
            set.player_two.entrant_id = "40".into()
        }),
        ("first score changed", "report-stale", |set| set.player_one.score = 1),
        ("second score changed", "report-stale", |set| set.player_two.score = 1),
        ("round format changed", "report-format-changed", |set| set.startgg_best_of = Some(5)),
    ];
    for (scenario, code, change) in changes {
        let mut changed = fresh.clone();
        change(&mut changed);
        let response = check_report_set("100", &expected, Some(changed))
            .err()
            .unwrap();
        assert_eq!(
            detailed_failure(response).await,
            (StatusCode::CONFLICT, code.to_owned()),
            "{scenario}"
        );
    }
    fresh.state = Some("3".into());
    let completed = ReportBaseline::from_set(&fresh);
    assert_eq!(
        detailed_failure(
            check_report_set("100", &completed, Some(fresh))
                .err()
                .unwrap()
        )
        .await,
        (StatusCode::CONFLICT, "report-stale".to_owned())
    );
    assert_eq!(
        check_report_set("100", &expected, None)
            .err()
            .unwrap()
            .status(),
        StatusCode::NOT_FOUND
    );
}

#[test]
fn local_scoring_swaps_and_autosave_preserve_the_fetched_report_baseline() {
    let runtime = runtime();
    let mut fresh = runtime.overlay.selected_set().unwrap();
    fresh.set_id = Some("100".into());
    fresh.state = Some("1".into());
    fresh.player_one.entrant_id = "10".into();
    fresh.player_two.entrant_id = "20".into();
    fresh.game_history = Some(Vec::new());
    let expected = ReportBaseline::from_set(&fresh);
    fresh.report_baseline = Some(expected.clone());
    let assets = Path::new("/jabs-no-security-test-assets");
    runtime
        .overlay
        .replace_selected_set(&runtime.database, assets, assets, fresh.clone())
        .unwrap();
    runtime
        .overlay
        .set_score(&runtime.database, "one", 2)
        .unwrap();
    runtime.overlay.swap_players(&runtime.database).unwrap();
    let pending_report = active_report(&runtime, true);
    let mut draft = runtime.overlay.selected_set().unwrap();
    // Renderer schemas omit native report metadata; an autosave must preserve it.
    draft.report_baseline = None;
    assert!(
        runtime
            .overlay
            .update_selected_set(&runtime.database, assets, assets, draft)
            .is_ok()
    );
    let restored = crate::state::OverlayStore::load(&runtime.database)
        .unwrap()
        .selected_set()
        .unwrap();
    let baseline = restored.report_baseline.as_ref().unwrap();
    assert!(*baseline == expected);
    assert!(baseline.same_entrants(&restored));
    assert_eq!(restored.player_two.score, 2);
    assert!(check_report_set("100", baseline, Some(fresh)).is_ok());
    assert_eq!(
        active_set(&runtime, &pending_report)
            .err()
            .unwrap()
            .status(),
        StatusCode::CONFLICT
    );
}

