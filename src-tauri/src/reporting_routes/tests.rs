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
        best_of: 3,
        expected: ReportBaseline {
            state: Some("1".into()),
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
        perform_active_report(&runtime, stale).await.status(),
        StatusCode::CONFLICT
    );
    let mut other_set = active_report(&runtime, true);
    other_set.set_id = "200".into();
    assert_eq!(
        perform_active_report(&runtime, other_set).await.status(),
        StatusCode::CONFLICT
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
        assert_eq!(perform_active_report(&runtime, request).await.status(), StatusCode::CONFLICT);
    }
}

#[test]
fn both_report_paths_reject_changed_upstream_results_and_missing_sets() {
    let runtime = runtime();
    let mut fresh = runtime.overlay.selected_set().unwrap();
    fresh.set_id = Some("100".into());
    fresh.state = Some("1".into());
    fresh.player_one.entrant_id = "10".into();
    fresh.player_two.entrant_id = "20".into();
    let expected = ReportBaseline::from_set(&fresh);
    assert!(check_report_set("100", &expected, Some(fresh.clone())).is_ok());
    let changes: [(&str, fn(&mut SelectedSet)); 6] = [
        ("set started", |set| set.state = Some("2".into())),
        ("set reported", |set| set.state = Some("3".into())),
        ("first entrant replaced", |set| {
            set.player_one.entrant_id = "30".into()
        }),
        ("second entrant replaced", |set| {
            set.player_two.entrant_id = "40".into()
        }),
        ("first score changed", |set| set.player_one.score = 1),
        ("second score changed", |set| set.player_two.score = 1),
    ];
    for (scenario, change) in changes {
        let mut changed = fresh.clone();
        change(&mut changed);
        let response = check_report_set("100", &expected, Some(changed))
            .err()
            .unwrap();
        assert_eq!(response.status(), StatusCode::CONFLICT, "{scenario}");
    }
    fresh.state = Some("3".into());
    let completed = ReportBaseline::from_set(&fresh);
    assert_eq!(
        check_report_set("100", &completed, Some(fresh))
            .err()
            .unwrap()
            .status(),
        StatusCode::CONFLICT
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

