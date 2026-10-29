use super::*;
use crate::{runtime::RuntimeState, state::OverlayStore};
use std::{path::Path, sync::Arc};
fn context() -> Context {
    Context {
        event_id: "456".into(),
        event_name: "Singles".into(),
        tournament_slug: "tournament/local".into(),
        game_id: "street-fighter-6".into(),
        asset_catalog_slug: Some("street-fighter-6".into()),
        preserve_station: false,
        preserve_match_length: false,
    }
}
fn live(database: &Database) -> SelectedSet {
    let mut live = OverlayStore::load(database)
        .unwrap()
        .selected_set()
        .unwrap();
    live.set_id = Some("100".into());
    live.event_id = Some("456".into());
    live.player_one.entrant_id = "10".into();
    live.player_two.entrant_id = "20".into();
    live.player_one.name = "Alpha".into();
    live.player_two.name = "Beta".into();
    live.best_of = 3;
    live.state = Some("1".into());
    live.upstream_reset = Some(false);
    live
}
fn setup() -> (Database, QueueStore, SelectedSet) {
    let database = Database::open(Path::new(":memory:")).unwrap();
    let queue = QueueStore::load(&database).unwrap();
    let live = live(&database);
    queue
        .add(
            &database,
            queue.current().unwrap().revision,
            context(),
            Entry::from_set(&live).unwrap(),
        )
        .unwrap();
    (database, queue, live)
}
fn edit(
    queue: &QueueStore,
    database: &Database,
    action: &str,
    set: Option<&str>,
    order: Option<&[String]>,
    mode: Option<Mode>,
    minutes: Option<u32>,
) -> Result<Snapshot, String> {
    queue.edit(
        database,
        queue.current().unwrap().revision,
        action,
        set,
        order,
        mode,
        minutes,
    )
}
#[test]
fn ordering_is_event_bound_unique_and_preserves_the_active_match() {
    let (database, queue, mut live) = setup();
    let mut unresolved = live.clone();
    unresolved.player_two.entrant_id = "set-100-player-2".into();
    let placeholder = Entry::from_set(&unresolved).unwrap();
    assert!(!placeholder.has_players());
    assert_eq!(placeholder.player_two, "TBD");
    queue
        .add(
            &database,
            queue.current().unwrap().revision,
            context(),
            Entry::from_set(&live).unwrap(),
        )
        .unwrap();
    assert_eq!(queue.current().unwrap().entries.len(), 1);
    for id in ["200", "300"] {
        live.set_id = Some(id.into());
        queue
            .add(
                &database,
                queue.current().unwrap().revision,
                context(),
                Entry::from_set(&live).unwrap(),
            )
            .unwrap();
    }
    {
        let mut inner = queue.inner.lock().unwrap();
        inner.snapshot.cursor = Some(0);
        inner.snapshot.remaining_ms = Some(33_000);
    }
    let reordered = edit(
        &queue,
        &database,
        "reorder",
        None,
        Some(&["100".into(), "300".into(), "200".into()]),
        None,
        None,
    )
    .unwrap();
    assert_eq!(reordered.cursor, Some(0));
    assert_eq!(reordered.remaining_ms, Some(33_000));
    assert_eq!(reordered.entries[1].set_id, "300");
    {
        queue.inner.lock().unwrap().snapshot.running = true;
    }
    assert!(edit(
        &queue,
        &database,
        "reorder",
        None,
        Some(&["300".into(), "100".into(), "200".into()]),
        None,
        None
    )
    .is_err());
    let paused = edit(&queue, &database, "pause", None, None, None, None).unwrap();
    let moved = edit(
        &queue, &database, "reorder", None,
        Some(&["300".into(), "100".into(), "200".into()]), None, None,
    ).unwrap();
    assert_eq!(moved.cursor, Some(1));
    assert_eq!(current_id(&moved), Some("100"));
    assert_eq!(moved.remaining_ms, paused.remaining_ms);
    assert!(!moved.running);
    let restored = QueueStore::load(&database).unwrap().current().unwrap();
    assert_eq!(restored.entries.iter().map(|entry| entry.set_id.as_str()).collect::<Vec<_>>(), vec!["300", "100", "200"]);
    assert_eq!(restored.cursor, Some(1));
    assert_eq!(current_id(&restored), Some("100"));
    let moved_again = edit(
        &queue, &database, "reorder", None,
        Some(&["100".into(), "200".into(), "300".into()]), None, None,
    ).unwrap();
    assert_eq!(moved_again.cursor, Some(0));
    assert_eq!(current_id(&moved_again), Some("100"));
    assert!(edit(
        &queue,
        &database,
        "reorder",
        None,
        Some(&["100".into(), "200".into(), "200".into()]),
        None,
        None
    )
    .is_err());
    let mut other = context();
    other.event_id = "different".into();
    assert!(queue
        .add(
            &database,
            queue.current().unwrap().revision,
            other,
            Entry::from_set(&live).unwrap()
        )
        .is_err());
    let revision = queue.current().unwrap().revision;
    edit(&queue, &database, "remove", Some("200"), None, None, None).unwrap();
    assert!(queue
        .edit(&database, revision, "clear", None, None, None, None)
        .is_err());
}

#[test]
fn batches_preserve_existing_order_and_roll_back_if_any_entry_or_capacity_check_fails() {
    let (database, queue, live) = setup();
    let entry = |id: &str| {
        let mut set = live.clone();
        set.set_id = Some(id.into());
        Entry::from_set(&set).unwrap()
    };
    let added = queue.add_many(&database, queue.current().unwrap().revision, context(),
        vec![entry("200"), entry("100"), entry("300")]).unwrap();
    assert_eq!(added.entries.iter().map(|e| e.set_id.as_str()).collect::<Vec<_>>(), ["100", "200", "300"]);
    let before = serde_json::to_value(queue.current().unwrap()).unwrap();
    let mut invalid = entry("bad"); invalid.entrant_one_id.clear();
    assert!(queue.add_many(&database, added.revision, context(), vec![entry("400"), invalid]).is_err());
    assert_eq!(serde_json::to_value(queue.current().unwrap()).unwrap(), before);
    let fill = (4..100).map(|id| entry(&id.to_string())).collect();
    let filled = queue.add_many(&database, added.revision, context(), fill).unwrap();
    assert_eq!(filled.entries.len(), 99);
    assert!(queue.add_many(&database, filled.revision, context(), vec![entry("400"), entry("401")]).is_err());
    assert_eq!(queue.current().unwrap().entries.len(), 99);
}

#[test]
fn unresolved_queue_entries_fill_from_existing_bracket_reads_and_keep_their_order_on_restart() {
    let (database, queue, mut next) = setup();
    next.set_id = Some("200".into());
    next.player_one.entrant_id = "set-200-player-1".into();
    next.player_two.entrant_id = "set-200-player-2".into();
    queue.add(&database, queue.current().unwrap().revision, context(), Entry::from_set(&next).unwrap()).unwrap();
    queue.observe_bracket(&database, "456", &[serde_json::json!({
        "id":"200", "state":"1", "entrantOne":{"id":"30","name":"Gamma"}
    })]).unwrap();
    let partial = queue.current().unwrap();
    assert_eq!(partial.entries[1].player_one, "Gamma");
    assert_eq!(partial.entries[1].player_two, "TBD");
    queue.observe_bracket(&database, "456", &[serde_json::json!({
        "id":"200", "state":"1", "entrantOne":{"id":"30","name":"Gamma"},
        "entrantTwo":{"id":"40","name":"Delta"}
    })]).unwrap();
    let restored = QueueStore::load(&database).unwrap().current().unwrap();
    assert_eq!(restored.entries.iter().map(|entry| entry.set_id.as_str()).collect::<Vec<_>>(), ["100", "200"]);
    assert!(restored.entries[1].has_players());
    assert_eq!(restored.entries[1].player_two, "Delta");
    assert!(!restored.running);
}
#[test]
fn winner_delay_ignores_play_time_tracks_winner_and_preserves_unrelated_edits() {
    let (database, queue, mut live) = setup();
    for minutes in [0, 31] {
        assert!(edit(
            &queue,
            &database,
            "settings",
            None,
            None,
            Some(Mode::WinnerDelay),
            Some(minutes)
        )
        .is_err());
    }
    for minutes in [1, 30] {
        edit(
            &queue,
            &database,
            "settings",
            None,
            None,
            Some(Mode::WinnerDelay),
            Some(minutes),
        )
        .unwrap();
    }
    let mut inner = queue.inner.lock().unwrap();
    inner.snapshot.running = true;
    engine::update_winner(&mut inner, &live);
    assert_eq!(inner.snapshot.remaining_ms, None);
    live.player_one.score = 1;
    engine::update_winner(&mut inner, &live);
    assert_eq!(inner.snapshot.remaining_ms, None);
    live.player_one.score = 2;
    engine::update_winner(&mut inner, &live);
    assert_eq!(inner.snapshot.remaining_ms, Some(1_800_000));
    inner.snapshot.remaining_ms = Some(5_000);
    live.player_one.name = "Renamed".into();
    live.player_two.score = 1;
    engine::update_winner(&mut inner, &live);
    assert_eq!(inner.snapshot.remaining_ms, Some(5_000));
    live.player_one.score = 0;
    engine::update_winner(&mut inner, &live);
    assert_eq!(inner.snapshot.remaining_ms, None);
    live.player_two.score = 2;
    engine::update_winner(&mut inner, &live);
    assert_eq!(inner.snapshot.remaining_ms, Some(1_800_000));
    inner.snapshot.remaining_ms = Some(0);
    live.player_one.score = 2;
    live.player_two.score = 0;
    engine::update_winner(&mut inner, &live);
    assert_eq!(inner.snapshot.remaining_ms, Some(1_800_000));
    inner.loading = true;
    live.player_one.score = 0;
    engine::update_winner(&mut inner, &live);
    assert!(!inner.loading);
    assert!(!inner.snapshot.running);
}
#[test]
fn reports_are_bound_to_the_activation_and_require_confirmed_success() {
    let (database, queue, live) = setup();
    edit(
        &queue,
        &database,
        "settings",
        None,
        None,
        Some(Mode::Report),
        Some(1),
    )
    .unwrap();
    {
        queue.inner.lock().unwrap().snapshot.cursor = Some(0);
    }
    assert!(queue.report_token("other-set").is_none());
    let token = queue.report_token("100");
    assert!(token.is_some());
    // A winning score or a harmless queue edit cannot substitute for a report.
    queue
        .heartbeat("operator".into(), Some("456".into()), false, None, None)
        .unwrap();
    queue.reported(&database, token, "other-set", true);
    assert!(!queue.inner.lock().unwrap().reported);
    queue.reported(&database, token, "100", true);
    assert!(queue.inner.lock().unwrap().reported);
    let accepted_revision = queue.current().unwrap().revision;
    queue.reported(&database, token, "100", true);
    assert_eq!(queue.current().unwrap().revision, accepted_revision);
    queue.interrupt(&database);
    queue.reported(&database, token, "100", true);
    assert!(!queue.inner.lock().unwrap().reported);
    let token = queue.report_token("100");
    queue.reported(&database, token, "100", false);
    let state = queue.current().unwrap();
    assert!(!state.running);
    assert!(state.error.is_some());
    assert_eq!(live.player_one.score, 0);
}

#[test]
fn entry_results_persist_without_starting_or_advancing_the_queue() {
    let (database, queue, mut live) = setup();
    let initial = queue.current().unwrap();
    assert!(initial.cursor.is_none());
    assert!(initial.entries[0].result_status.is_none());
    live.player_one.score = 2;
    queue.observe_result(&database, &live);
    let completed = queue.current().unwrap();
    assert_eq!(completed.entries[0].result_status, Some(ResultStatus::Completed));
    assert_eq!(completed.revision, initial.revision);
    assert!(!completed.running);
    assert!(completed.cursor.is_none());
    live.player_one.score = 0;
    queue.observe_result(&database, &live);
    assert!(queue.current().unwrap().entries[0].result_status.is_none());
    queue.reported(&database, None, "100", false);
    assert!(queue.current().unwrap().entries[0].result_status.is_none());
    queue.reported(&database, None, "100", true);
    let reported = queue.current().unwrap();
    assert_eq!(reported.entries[0].result_status, Some(ResultStatus::Reported));
    assert!(!reported.running);
    assert!(reported.cursor.is_none());
    assert!(!queue.inner.lock().unwrap().reported);
    let restored = QueueStore::load(&database).unwrap();
    assert_eq!(restored.current().unwrap().entries[0].result_status, Some(ResultStatus::Reported));
    assert!(!restored.inner.lock().unwrap().reported);
}

#[test]
fn older_queue_entries_restore_known_results_only_for_the_same_players() {
    let (database, queue, mut live) = setup();
    live.player_one.score = 2;
    live.game_history = None;
    OverlayStore::load(&database).unwrap().replace_selected_set(
        &database, Path::new("/jabs-no-test-assets"), Path::new("/jabs-no-test-assets"), live.clone()
    ).unwrap();
    let restored = QueueStore::load(&database).unwrap();
    assert_eq!(restored.current().unwrap().entries[0].result_status, Some(ResultStatus::Completed));
    let mut entry = queue.current().unwrap().entries[0].clone();
    entry.entrant_one_id = "different-player".into();
    entry.restore_result(&database);
    assert!(entry.result_status.is_none());
    live.state = Some("3".into());
    assert_eq!(Entry::from_set(&live).unwrap().result_status, Some(ResultStatus::Reported));
}

#[test]
fn requeuing_a_reset_set_does_not_restore_its_previous_report() {
    let (database, queue, mut saved) = setup();
    saved.state = Some("3".into());
    saved.player_one.score = 2;
    saved.game_history = None;
    OverlayStore::load(&database)
        .unwrap()
        .replace_selected_set(
            &database,
            Path::new("/jabs-no-test-assets"),
            Path::new("/jabs-no-test-assets"),
            saved,
        )
        .unwrap();

    let mut fresh = live(&database);
    fresh.player_one.score = 0;
    fresh.player_two.score = 0;
    edit(&queue, &database, "clear", None, None, None, None).unwrap();
    let added = queue
        .add_many(
            &database,
            queue.current().unwrap().revision,
            context(),
            vec![Entry::from_set(&fresh).unwrap()],
        )
        .unwrap();
    assert!(added.entries[0].result_status.is_none());
    assert!(added.entries[0].upstream_reset);
    let restored = QueueStore::load(&database).unwrap();
    assert!(
        restored.current().unwrap().entries[0]
            .result_status
            .is_none()
    );

    fresh.state = Some("3".into());
    let mut reported = Entry::from_set(&fresh).unwrap();
    reported.restore_fresh_result(&database);
    assert_eq!(reported.result_status, Some(ResultStatus::Reported));
    assert!(!reported.upstream_reset);
}

#[test]
fn local_score_events_do_not_downgrade_a_confirmed_report() {
    let (database, queue, mut local) = setup();
    queue.reported(&database, None, "100", true);
    for score in [2, 0] {
        local.player_one.score = score;
        queue.observe_result(&database, &local);
        assert_eq!(
            queue.current().unwrap().entries[0].result_status,
            Some(ResultStatus::Reported)
        );
    }
    queue
        .observe_bracket(
            &database,
            "456",
            &[serde_json::json!({"id":"100", "state":"1"})],
        )
        .unwrap();
    assert!(queue.current().unwrap().entries[0].result_status.is_none());
}

#[test]
fn upstream_resets_clear_reported_results_and_old_advance_receipts() {
    let (database, queue, mut live) = setup();
    live.player_one.score = 2;
    live.state = Some("3".into());
    live.game_history = None;
    OverlayStore::load(&database).unwrap().replace_selected_set(
        &database, Path::new("/jabs-no-test-assets"), Path::new("/jabs-no-test-assets"), live.clone()
    ).unwrap();
    queue.reported(&database, None, "100", true);
    {
        let mut inner = queue.inner.lock().unwrap();
        inner.snapshot.cursor = Some(0);
        inner.snapshot.mode = Mode::Report;
        inner.snapshot.running = true;
        inner.snapshot.remaining_ms = Some(20_000);
        inner.winner = Some("10".into());
        inner.reported = true;
        inner.activation = 7;
    }
    let revision = queue.current().unwrap().revision;
    let reset = serde_json::json!({
        "id": "100", "state": "1", "entrantOne": {"id": "10"}, "entrantTwo": {"id": "20"}
    });
    queue.observe_bracket(&database, "another-event", std::slice::from_ref(&reset)).unwrap();
    assert_eq!(queue.current().unwrap().entries[0].result_status, Some(ResultStatus::Reported));
    let mut updates = queue.subscribe();
    queue.observe_bracket(&database, "456", std::slice::from_ref(&reset)).unwrap();
    let cleared = queue.current().unwrap();
    assert!(cleared.entries[0].result_status.is_none());
    assert!(cleared.entries[0].upstream_reset);
    assert_eq!(cleared.entries[0].set_id, "100");
    assert_eq!(cleared.cursor, Some(0));
    assert_eq!(cleared.revision, revision + 1);
    assert!(!cleared.running);
    assert!(cleared.remaining_ms.is_none());
    assert!(queue.inner.lock().unwrap().winner.is_none());
    assert!(!queue.inner.lock().unwrap().reported);
    assert!(updates.try_recv().is_ok());
    queue.observe_bracket(&database, "456", &[reset]).unwrap();
    queue.observe_result(&database, &live);
    queue.reported(&database, Some(7), "100", true);
    assert!(queue.current().unwrap().entries[0].result_status.is_none());
    assert!(updates.try_recv().is_err());

    let restored = QueueStore::load(&database).unwrap();
    restored.observe_result(&database, &live);
    assert!(restored.current().unwrap().entries[0].result_status.is_none());
    restored.observe_bracket(&database, "456", &[serde_json::json!({
        "id": "100", "state": "3", "entrantOne": {"id": "20"}, "entrantTwo": {"id": "10"}
    })]).unwrap();
    assert_eq!(restored.current().unwrap().entries[0].result_status, Some(ResultStatus::Reported));
    assert!(!restored.current().unwrap().entries[0].upstream_reset);
}

#[test]
fn bracket_results_preserve_unreported_scores_and_ignore_unrelated_sets() {
    let (database, queue, mut live) = setup();
    live.player_one.score = 2;
    live.game_history = None;
    OverlayStore::load(&database).unwrap().replace_selected_set(
        &database, Path::new("/jabs-no-test-assets"), Path::new("/jabs-no-test-assets"), live.clone()
    ).unwrap();
    queue.observe_result(&database, &live);
    let revision = queue.current().unwrap().revision;
    for summary in [
        serde_json::json!({"id": "100", "state": "1"}),
        serde_json::json!({"id": "100", "state": "3", "entrantOne": {"id": "other"}, "entrantTwo": {"id": "20"}}),
        serde_json::json!({"id": "200", "state": "3", "entrantOne": {"id": "10"}, "entrantTwo": {"id": "20"}}),
    ] {
        queue.observe_bracket(&database, "456", &[summary]).unwrap();
        assert_eq!(queue.current().unwrap().entries[0].result_status, Some(ResultStatus::Completed));
    }
    assert_eq!(queue.current().unwrap().revision, revision);
    queue.reported(&database, None, "100", true);
    queue.observe_bracket(&database, "456", &[serde_json::json!({"id": "100", "state": "1"})]).unwrap();
    let cleared = queue.current().unwrap();
    assert!(cleared.entries[0].result_status.is_none());
    assert!(cleared.cursor.is_none());
    assert_eq!(cleared.revision, revision);
    queue.reported(&database, None, "100", true);
    let reported_again = queue.current().unwrap();
    assert_eq!(reported_again.entries[0].result_status, Some(ResultStatus::Reported));
    assert!(!reported_again.entries[0].upstream_reset);
}

#[tokio::test]
async fn refreshed_resets_stay_pending_through_overlay_events_until_a_new_local_result() {
    let runtime = runtime();
    let assets = Path::new("/jabs-no-test-assets");
    let mut completed = runtime.overlay.selected_set().unwrap();
    completed.state = Some("3".into());
    completed.player_one.score = 2;
    completed.game_history = None;
    runtime.overlay.replace_selected_set(&runtime.database, assets, assets, completed.clone()).unwrap();
    runtime.match_queue.reported(&runtime.database, None, "100", true);
    runtime.match_queue.inner.lock().unwrap().snapshot.cursor = Some(0);
    let engine = tokio::spawn(engine::run(runtime.clone()));
    tokio::task::yield_now().await;
    {
        let mut inner = runtime.match_queue.inner.lock().unwrap();
        inner.snapshot.mode = Mode::WinnerDelay;
        inner.snapshot.running = true;
        inner.snapshot.remaining_ms = Some(0);
        inner.winner = Some("10".into());
    }
    let pending = serde_json::json!({"id":"100", "state":"1", "entrantOne":{"id":"10"}, "entrantTwo":{"id":"20"}});
    runtime.observe_startgg_sets("456", std::slice::from_ref(&pending)).unwrap();
    for _ in 0..20 { tokio::task::yield_now().await; }
    assert!(runtime.match_queue.current().unwrap().entries[0].result_status.is_none());
    assert!(!runtime.match_queue.current().unwrap().running);
    assert!(runtime.match_queue.current().unwrap().remaining_ms.is_none());
    assert_eq!(runtime.overlay.selected_set().unwrap().upstream_reset, Some(true));
    assert_eq!(runtime.overlay.selected_set().unwrap().player_one.score, 2);
    assert!(runtime.overlay.selected_set().unwrap().winner().is_none());
    runtime.match_queue.observe_result(&runtime.database, &completed);
    assert!(runtime.match_queue.current().unwrap().entries[0].result_status.is_none());

    runtime.overlay.set_score(&runtime.database, "one", 1).unwrap();
    runtime.overlay.set_score(&runtime.database, "one", 2).unwrap();
    tokio::time::timeout(Duration::from_secs(2), async {
        while runtime.match_queue.current().unwrap().entries[0].result_status
            != Some(ResultStatus::Completed)
        {
            tokio::task::yield_now().await;
        }
    })
    .await
    .expect("The queue engine did not observe the new local result.");
    assert_eq!(runtime.match_queue.current().unwrap().entries[0].result_status, Some(ResultStatus::Completed));
    runtime.observe_startgg_sets("456", std::slice::from_ref(&pending)).unwrap();
    assert_eq!(runtime.match_queue.current().unwrap().entries[0].result_status, Some(ResultStatus::Completed));
    let mut missed_update = runtime.match_queue.current().unwrap().entries[0].clone();
    missed_update.result_status = None;
    missed_update.restore_result(&runtime.database);
    assert_eq!(missed_update.result_status, Some(ResultStatus::Completed));
    let resumed = runtime.match_queue.resume(&runtime.database,
        runtime.match_queue.current().unwrap().revision, &runtime.overlay.selected_set().unwrap()).unwrap();
    assert!(resumed.running);
    assert_eq!(resumed.remaining_ms, Some(60_000));

    // Repair a queue saved by versions that retained Completed after an upstream reset.
    let mut legacy = runtime.overlay.selected_set().unwrap();
    legacy.upstream_reset = None;
    runtime.match_queue.inner.lock().unwrap().snapshot.entries[0].upstream_reset = false;
    runtime.overlay.replace_selected_set(&runtime.database, assets, assets, legacy).unwrap();
    runtime.observe_startgg_sets("456", &[pending]).unwrap();
    for _ in 0..20 { tokio::task::yield_now().await; }
    assert!(runtime.match_queue.current().unwrap().entries[0].result_status.is_none());
    assert_eq!(runtime.overlay.selected_set().unwrap().upstream_reset, Some(true));
    let restored = QueueStore::load(&runtime.database).unwrap();
    assert!(restored.current().unwrap().entries[0].result_status.is_none());
    runtime.overlay.clear_selected_set(&runtime.database).unwrap();
    runtime.observe_startgg_sets("456", &[serde_json::json!({
        "id":"100", "state":"3", "entrantOne":{"id":"10"}, "entrantTwo":{"id":"20"}
    })]).unwrap();
    let reported = QueueStore::load(&runtime.database).unwrap();
    assert_eq!(reported.current().unwrap().entries[0].result_status, Some(ResultStatus::Reported));
    engine.abort();
}
#[test]
fn restored_queue_keeps_order_but_never_replays_a_countdown_or_report() {
    let (database, queue, _) = setup();
    {
        let mut inner = queue.inner.lock().unwrap();
        inner.snapshot.cursor = Some(0);
        inner.snapshot.running = true;
        inner.snapshot.mode = Mode::WinnerDelay;
        inner.snapshot.remaining_ms = Some(0);
        inner.reported = true;
        save(&database, &inner.snapshot).unwrap();
    }
    let restored = QueueStore::load(&database).unwrap();
    let state = restored.current().unwrap();
    assert_eq!(state.entries[0].set_id, "100");
    assert_eq!(state.cursor, Some(0));
    assert!(!state.running);
    assert_eq!(state.remaining_ms, None);
    assert!(!restored.inner.lock().unwrap().reported);
    let empty = edit(&restored, &database, "clear", None, None, None, None).unwrap();
    let wire = serde_json::to_value(empty).unwrap();
    assert!(wire.get("context").is_none());
    assert!(wire["cursor"].is_null());
    assert!(wire["remainingMs"].is_null());
}
pub(super) fn runtime() -> Arc<RuntimeState> {
    let database = Database::open(Path::new(":memory:")).unwrap();
    let unused = std::path::PathBuf::from("/jabs-no-test-assets");
    let runtime = Arc::new(
        RuntimeState::new(
            database,
            unused.clone(),
            unused.clone(),
            unused.clone(),
            unused.clone(),
            unused.clone(),
            unused,
        )
        .unwrap(),
    );
    let live = live(&runtime.database);
    runtime
        .overlay
        .replace_selected_set(
            &runtime.database,
            Path::new("/jabs-no-test-assets"),
            Path::new("/jabs-no-test-assets"),
            live.clone(),
        )
        .unwrap();
    runtime
        .match_queue
        .add(
            &runtime.database,
            runtime.match_queue.current().unwrap().revision,
            context(),
            Entry::from_set(&live).unwrap(),
        )
        .unwrap();
    runtime
        .match_queue
        .heartbeat("operator".into(), Some("456".into()), false, None, None)
        .unwrap();
    runtime
}
fn run<T>(future: impl std::future::Future<Output = T>) -> T {
    tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap()
        .block_on(future)
}
#[test]
fn delay_edits_preserve_running_or_paused_state_and_resume_keeps_the_remaining_time() {
    let r = runtime();
    r.overlay.set_score(&r.database, "one", 2).unwrap();
    edit(
        &r.match_queue,
        &r.database,
        "settings",
        None,
        None,
        Some(Mode::WinnerDelay),
        Some(1),
    )
    .unwrap();
    let state = run(engine::navigate(
        &r,
        r.match_queue.current().unwrap().revision,
        "start",
        None,
    ))
    .unwrap();
    assert_eq!(state.remaining_ms, Some(60_000));
    {
        r.match_queue.inner.lock().unwrap().snapshot.remaining_ms = Some(17_000);
    }
    let changed = edit(
        &r.match_queue,
        &r.database,
        "settings",
        None,
        None,
        Some(Mode::WinnerDelay),
        Some(2),
    )
    .unwrap();
    assert!(changed.running);
    assert_eq!(changed.cursor, state.cursor);
    assert_eq!(changed.remaining_ms, Some(120_000));
    assert_eq!(
        r.overlay.selected_set().unwrap().set_id.as_deref(),
        Some("100")
    );
    edit(&r.match_queue, &r.database, "pause", None, None, None, None).unwrap();
    let changed = edit(
        &r.match_queue,
        &r.database,
        "settings",
        None,
        None,
        Some(Mode::WinnerDelay),
        Some(3),
    )
    .unwrap();
    assert!(!changed.running);
    assert_eq!(changed.remaining_ms, Some(180_000));
    r.match_queue.inner.lock().unwrap().snapshot.remaining_ms = Some(17_000);
    r.match_queue
        .resume(
            &r.database,
            r.match_queue.current().unwrap().revision,
            &r.overlay.selected_set().unwrap(),
        )
        .unwrap();
    assert_eq!(r.match_queue.current().unwrap().remaining_ms, Some(17_000));
    r.overlay.reset_scores(&r.database).unwrap();
    run(engine::tick(&r));
    assert_eq!(r.match_queue.current().unwrap().remaining_ms, None);
}

#[test]
fn confirmed_scoreless_results_keep_progress_and_advance_in_both_automatic_modes() {
    use crate::state::{ReportOutcome, ReportOutcomeKind, report_readiness};
    for kind in [
        ReportOutcomeKind::WinLoss,
        ReportOutcomeKind::Disqualification,
    ] {
        for mode in [Mode::Report, Mode::WinnerDelay] {
            let r = runtime();
            let before = r.overlay.selected_set().unwrap();
            let outcome = ReportOutcome {
                kind,
                winner_id: before.player_two.entrant_id.clone(),
            };
            assert!(report_readiness(&before, None).is_err());
            assert_eq!(
                report_readiness(&before, Some(&outcome))
                    .unwrap()
                    .winner_id,
                "20"
            );
            assert!(
                report_readiness(
                    &before,
                    Some(&ReportOutcome {
                        kind,
                        winner_id: "other".into()
                    })
                )
                .is_err()
            );
            edit(
                &r.match_queue,
                &r.database,
                "settings",
                None,
                None,
                Some(mode.clone()),
                Some(1),
            )
            .unwrap();
            run(engine::navigate(
                &r,
                r.match_queue.current().unwrap().revision,
                "start",
                None,
            ))
            .unwrap();
            let token = r.match_queue.report_token("100");
            r.overlay
                .mark_reported(&r.database, "100", "3", Some(outcome.clone()))
                .unwrap();
            let reported = r.overlay.selected_set().unwrap();
            assert_eq!(reported.player_one.score, before.player_one.score);
            assert_eq!(reported.player_two.score, before.player_two.score);
            assert!(reported.game_history == before.game_history);
            assert_eq!(reported.winner(), Some("two"));
            let restored = OverlayStore::load(&r.database)
                .unwrap()
                .selected_set()
                .unwrap();
            assert!(restored.reported_outcome == Some(outcome));
            r.match_queue.reported(&r.database, token, "100", true);
            run(engine::tick(&r));
            if mode == Mode::WinnerDelay {
                assert!(
                    r.match_queue
                        .current()
                        .unwrap()
                        .remaining_ms
                        .is_some_and(|ms| ms > 0 && ms <= 60_000)
                );
                r.match_queue.inner.lock().unwrap().snapshot.remaining_ms = Some(0);
                run(engine::tick(&r));
            }
            assert_eq!(r.match_queue.current().unwrap().status, "finished");
            r.observe_startgg_sets("456", &[serde_json::json!({"id":"100", "state":"1"})])
                .unwrap();
            assert!(r.overlay.selected_set().unwrap().reported_outcome.is_none());
        }
    }
}

#[test]
fn due_advances_wait_for_edits_and_finish_without_clearing_the_live_match() {
    let r = runtime();
    r.overlay.set_score(&r.database, "one", 2).unwrap();
    edit(
        &r.match_queue,
        &r.database,
        "settings",
        None,
        None,
        Some(Mode::WinnerDelay),
        Some(1),
    )
    .unwrap();
    run(engine::navigate(
        &r,
        r.match_queue.current().unwrap().revision,
        "start",
        None,
    ))
    .unwrap();
    {
        r.match_queue.inner.lock().unwrap().snapshot.remaining_ms = Some(0);
    }
    r.match_queue
        .heartbeat("operator".into(), Some("456".into()), true, None, None)
        .unwrap();
    run(engine::tick(&r));
    assert_eq!(r.match_queue.current().unwrap().status, "waiting-edits");
    assert_eq!(
        r.overlay.selected_set().unwrap().set_id.as_deref(),
        Some("100")
    );
    r.match_queue
        .heartbeat("operator".into(), Some("456".into()), false, None, None)
        .unwrap();
    run(engine::tick(&r));
    let finished = r.match_queue.current().unwrap();
    assert_eq!(finished.status, "finished");
    assert!(!finished.running);
    assert_eq!(
        r.overlay.selected_set().unwrap().set_id.as_deref(),
        Some("100")
    );
}
#[test]
fn sleep_disconnect_and_event_changes_pause_automatic_advance() {
    for reason in ["sleep", "disconnect", "event", "reconnect"] {
        let r = runtime();
        edit(
            &r.match_queue,
            &r.database,
            "settings",
            None,
            None,
            Some(Mode::Report),
            Some(1),
        )
        .unwrap();
        run(engine::navigate(
            &r,
            r.match_queue.current().unwrap().revision,
            "start",
            None,
        ))
        .unwrap();
        match reason {
            "sleep" => {
                r.match_queue.inner.lock().unwrap().last_tick =
                    Instant::now() - Duration::from_secs(9)
            }
            "disconnect" => r.match_queue.inner.lock().unwrap().clients.clear(),
            "reconnect" => {
                r.match_queue
                    .inner
                    .lock()
                    .unwrap()
                    .clients
                    .get_mut("operator")
                    .unwrap()
                    .seen_wall = SystemTime::now() - Duration::from_secs(9);
                r.match_queue
                    .heartbeat("operator".into(), Some("456".into()), false, None, None)
                    .unwrap();
            }
            _ => r
                .match_queue
                .heartbeat(
                    "operator".into(),
                    Some("other-event".into()),
                    false,
                    None,
                    None,
                )
                .unwrap(),
        }
        run(engine::tick(&r));
        assert!(!r.match_queue.current().unwrap().running);
    }
}
#[test]
fn a_prepared_queue_match_cannot_replace_newer_stream_edits() {
    let r = runtime();
    let original = r.overlay.selected_set().unwrap();
    r.overlay.set_score(&r.database, "one", 1).unwrap();
    let mut next = original.clone();
    next.set_id = Some("200".into());
    assert!(r
        .overlay
        .replace_selected_set_if_current(
            &r.database,
            Path::new("/jabs-no-test-assets"),
            Path::new("/jabs-no-test-assets"),
            next,
            Some(&original.updated_at)
        )
        .is_err());
    let live = r.overlay.selected_set().unwrap();
    assert_eq!(live.set_id.as_deref(), Some("100"));
    assert_eq!(live.player_one.score, 1);
}

#[test]
fn unchanged_waits_are_quiet_but_countdowns_and_disconnects_still_publish() {
    let r = runtime();
    edit(
        &r.match_queue,
        &r.database,
        "settings",
        None,
        None,
        Some(Mode::WinnerDelay),
        Some(1),
    )
    .unwrap();
    run(engine::navigate(
        &r,
        r.match_queue.current().unwrap().revision,
        "start",
        None,
    ))
    .unwrap();
    let mut updates = r.match_queue.subscribe();
    run(engine::tick(&r));
    run(engine::tick(&r));
    assert!(updates.try_recv().is_err());
    r.overlay.set_score(&r.database, "one", 2).unwrap();
    run(engine::tick(&r));
    assert!(updates.try_recv().is_ok());
    {
        let mut inner = r.match_queue.inner.lock().unwrap();
        inner.last_tick = Instant::now() - Duration::from_secs(1);
    }
    run(engine::tick(&r));
    assert!(r.match_queue.current().unwrap().remaining_ms.unwrap() <= 59_000);
    assert!(updates.try_recv().is_ok());
    {
        let mut inner = r.match_queue.inner.lock().unwrap();
        inner.snapshot.remaining_ms = Some(0);
        inner.clients.get_mut("operator").unwrap().busy = true;
    }
    run(engine::tick(&r));
    assert_eq!(r.match_queue.current().unwrap().status, "waiting-edits");
    assert!(updates.try_recv().is_ok());
    run(engine::tick(&r));
    assert!(updates.try_recv().is_err());
    r.match_queue.inner.lock().unwrap().clients.clear();
    run(engine::tick(&r));
    assert!(!r.match_queue.current().unwrap().running);
    assert!(updates.try_recv().is_ok());
}
