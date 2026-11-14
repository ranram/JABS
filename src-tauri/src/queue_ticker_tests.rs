use super::*;

#[test]
fn settings_are_bounded_persisted_and_reject_stale_writes() {
    let db = Database::open(std::path::Path::new(":memory:")).unwrap();
    let store = TickerStore::load(&db).unwrap();
    let mut settings = store.settings().unwrap();
    assert!(!settings.enabled);
    assert_eq!(settings.style, TickerStyle::Compact);
    for count in [0, 4] {
        let mut invalid = settings.clone();
        invalid.upcoming_count = count;
        assert!(store.replace(&db, invalid).is_err());
    }
    settings.enabled = true;
    settings.style = TickerStyle::Standard;
    settings.styling_game_id = Some("tekken-8".into());
    settings.upcoming_count = 2;
    settings.show_results = true;
    settings.show_logo = true;
    settings.logo_asset_id = Some("event.png".into());
    let saved = store.replace(&db, settings.clone()).unwrap();
    assert!(store.replace(&db, settings).is_err());
    let restored = TickerStore::load(&db).unwrap().settings().unwrap();
    assert_eq!(restored.upcoming_count, 2);
    assert!(restored.show_logo);
    assert_eq!(restored.styling_game_id.as_deref(), Some("tekken-8"));
    let mut invalid_style = restored.clone();
    invalid_style.styling_game_id = Some("unknown".into());
    assert!(store.replace(&db, invalid_style).is_err());
    let mut old_colors = serde_json::to_value(&restored).unwrap();
    old_colors["primaryColor"] = serde_json::json!("#abcdef");
    let migrated: Settings = serde_json::from_value(old_colors).unwrap();
    assert!(
        serde_json::to_value(migrated)
            .unwrap()
            .get("primaryColor")
            .is_none()
    );
    assert_eq!(restored.style, TickerStyle::Standard);
    let mut legacy = serde_json::to_value(&restored).unwrap();
    legacy.as_object_mut().unwrap().remove("style");
    assert_eq!(
        serde_json::from_value::<Settings>(legacy).unwrap().style,
        TickerStyle::Compact
    );
    assert_eq!(restored.logo_asset_id.as_deref(), Some("event.png"));
    let mut unsafe_logo = restored.clone();
    unsafe_logo.logo_asset_id = Some("../event.png".into());
    assert!(store.replace(&db, unsafe_logo).is_err());
    assert_eq!(restored.updated_at, saved.updated_at);
}

fn fixture() -> (Database, Settings, Snapshot, SelectedSet) {
    let db = Database::open(std::path::Path::new(":memory:")).unwrap();
    let mut saved = crate::state::OverlayStore::load(&db)
        .unwrap()
        .selected_set()
        .unwrap();
    saved.phase = Some("Top 8".into());
    saved.round = Some("Winners Final".into());
    saved.set_id = Some("100".into());
    saved.event_id = Some("456".into());
    saved.player_one.entrant_id = "10".into();
    saved.player_two.entrant_id = "20".into();
    saved.player_one.name = "Alpha".into();
    saved.player_two.name = "Beta".into();
    saved.player_one.score = 2;
    saved.player_two.score = 1;
    saved.game_history = None;
    saved.state = Some("1".into());
    saved.best_of = 3;
    saved.upstream_reset = Some(false);
    let payload = serde_json::to_string(&saved).unwrap();
    db.save_stream_state(
        &serde_json::json!({"selectedSet":saved}).to_string(),
        &saved.updated_at,
        Some(("100", &payload)),
    )
    .unwrap();
    let mut entries = vec![Entry::from_set(&saved).unwrap()];
    for id in 1..6 {
        let mut entry = entries[0].clone();
        entry.set_id = format!("20{id}");
        entry.result_status = None;
        entries.push(entry);
    }
    let queue = Snapshot {
        context: Some(crate::match_queue::Context {
            event_id: "456".into(),
            event_name: "Singles".into(),
            tournament_slug: "local".into(),
            game_id: "street-fighter-6".into(),
            asset_catalog_slug: None,
            preserve_station: false,
            preserve_match_length: false,
        }),
        entries,
        cursor: Some(1),
        ..Snapshot::default()
    };
    let settings = Settings {
        style: TickerStyle::Standard,
        styling_game_id: None,
        _legacy_primary_color: None,
        _legacy_secondary_color: None,
        enabled: true,
        show_results: true,
        show_logo: false,
        logo_asset_id: None,
        upcoming_count: 3,
        updated_at: crate::database::now_rfc3339().unwrap(),
    };
    (db, settings, queue, saved)
}

#[test]
fn projection_limits_upcoming_matches_and_preserves_scores_when_player_sides_swap() {
    let (db, mut settings, mut queue, saved) = fixture();
    for count in 1..=3 {
        settings.upcoming_count = count;
        let state = project(&db, settings.clone(), &queue, &saved);
        assert_eq!(state.upcoming.len(), count as usize);
        assert_eq!(state.upcoming[0].phase.as_deref(), Some("Top 8"));
        assert_eq!(state.results[0].game.phase.as_deref(), Some("Top 8"));
        assert_eq!(state.upcoming[0].set_id, "202");
        assert_eq!(state.results[0].score_one, "2");
        assert_eq!(state.results[0].score_two, "1");
    }
    let entry = &mut queue.entries[0];
    std::mem::swap(&mut entry.entrant_one_id, &mut entry.entrant_two_id);
    std::mem::swap(&mut entry.player_one, &mut entry.player_two);
    let swapped = project(&db, settings.clone(), &queue, &saved);
    assert_eq!(swapped.results[0].score_one, "1");
    assert_eq!(swapped.results[0].score_two, "2");
    assert_eq!(swapped.results[0].winner, "two");
    settings.show_results = false;
    assert!(
        project(&db, settings.clone(), &queue, &saved)
            .results
            .is_empty()
    );
    settings.enabled = false;
    let hidden = project(&db, settings, &queue, &saved);
    assert!(hidden.upcoming.is_empty() && hidden.results.is_empty());
}

#[test]
fn reset_results_are_hidden_and_confirmed_scoreless_outcomes_do_not_invent_scores() {
    let (db, settings, mut queue, mut saved) = fixture();
    saved.upstream_reset = Some(true);
    let persist = |saved: &SelectedSet| {
        let payload = serde_json::to_string(saved).unwrap();
        db.save_stream_state(
            &serde_json::json!({"selectedSet":saved}).to_string(),
            &saved.updated_at,
            Some(("100", &payload)),
        )
        .unwrap();
    };
    persist(&saved);
    assert!(
        project(&db, settings.clone(), &queue, &saved)
            .results
            .is_empty()
    );
    saved.upstream_reset = Some(false);
    saved.state = Some("3".into());
    saved.reported_outcome = Some(crate::state::ReportOutcome {
        kind: ReportOutcomeKind::Disqualification,
        winner_id: "20".into(),
    });
    queue.entries[0].result_status = Some(crate::match_queue::ResultStatus::Reported);
    persist(&saved);
    let dq = project(&db, settings.clone(), &queue, &saved);
    assert_eq!(dq.results[0].score_one, "DQ");
    assert_eq!(dq.results[0].score_two, "W");
    assert_eq!(dq.results[0].winner, "two");
    saved.reported_outcome.as_mut().unwrap().kind = ReportOutcomeKind::WinLoss;
    persist(&saved);
    let wl = project(&db, settings.clone(), &queue, &saved);
    assert_eq!(wl.results[0].score_one, "L");
    assert_eq!(wl.results[0].score_two, "W");
    queue.entries[0].upstream_reset = true;
    assert!(project(&db, settings, &queue, &saved).results.is_empty());
}

#[test]
fn repeated_reads_share_projection_cache_until_queue_revision_changes() {
    let (db, settings, queue, saved) = fixture();
    db.save_broadcast_surface(
        "match-queue",
        &serde_json::to_string(&queue).unwrap(),
        &saved.updated_at,
    )
    .unwrap();
    db.save_broadcast_surface(
        SURFACE,
        &serde_json::to_string(&settings).unwrap(),
        &settings.updated_at,
    )
    .unwrap();
    let root = std::env::temp_dir().join("jabs-queue-ticker-test");
    let runtime = RuntimeState::new(
        db,
        root.join("logos"),
        root.join("sponsors"),
        root.join("players"),
        root.join("games"),
        root.join("custom"),
        root.join("allowlist.txt"),
    )
    .unwrap();
    assert_eq!(current(&runtime).unwrap().results[0].score_one, "2");
    // Changing the underlying saved payload alone does not cause another read:
    // native queue/overlay result notifications own invalidation.
    runtime
        .database
        .save_stream_state(
            &serde_json::json!({"selectedSet":saved}).to_string(),
            &saved.updated_at,
            Some(("100", "{}")),
        )
        .unwrap();
    assert_eq!(current(&runtime).unwrap().results[0].score_one, "2");
    let revision = runtime.match_queue.current().unwrap().revision;
    runtime
        .match_queue
        .edit(&runtime.database, revision, "pause", None, None, None, None)
        .unwrap();
    assert!(current(&runtime).unwrap().results.is_empty());
}

#[test]
fn external_results_need_no_local_save_and_remain_recent_after_reordering() {
    let (db, settings, mut queue, live) = fixture();
    let entry = &mut queue.entries[3];
    entry.result_status = Some(crate::match_queue::ResultStatus::Reported);
    entry.reported_result = Some(crate::match_queue::ReportedResult {
        winner_id: entry.entrant_two_id.clone(), score_one: 1, score_two: 2, disqualification: false,
    });
    entry.completed_at = Some("2026-11-13T12:00:00Z".into());
    let id = entry.set_id.clone();
    let result = project(&db, settings.clone(), &queue, &live);
    assert_eq!(result.results[0].game.set_id, id);
    assert_eq!(result.results[0].score_one, "1");
    assert_eq!(result.results[0].score_two, "2");
    assert_eq!(result.results[0].winner, "two");
    queue.entries.rotate_left(3);
    assert_eq!(project(&db, settings, &queue, &live).results[0].game.set_id, id);
}
