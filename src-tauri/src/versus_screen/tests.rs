use super::*;

#[test]
fn match_artwork_survives_restart_and_score_edits_without_carrying_into_other_games() {
    use crate::{runtime::RuntimeState, state::SelectedSet};
    let directory = std::env::temp_dir().join(format!(
        "jabs-versus-media-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    std::fs::create_dir(&directory).unwrap();
    let path = directory.join("state.sqlite");
    let legacy = rusqlite::Connection::open(&path).unwrap();
    legacy.execute_batch("CREATE TABLE set_overrides (set_id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL);").unwrap();
    drop(legacy);

    let open = || {
        RuntimeState::new(
            Database::open(&path).unwrap(),
            directory.clone(),
            directory.clone(),
            directory.clone(),
            directory.clone(),
            directory.clone(),
            directory.clone(),
        )
        .unwrap()
    };
    fn select(runtime: &RuntimeState, selected: SelectedSet) {
        let previous = runtime.overlay.selected_set().unwrap();
        runtime
            .overlay
            .replace_selected_set(
                &runtime.database,
                &runtime.logo_directory,
                &runtime.game_asset_directory,
                selected,
            )
            .unwrap();
        runtime
            .versus_screen
            .restore_media_for_match_change(
                &runtime.database,
                &previous,
                &runtime.overlay.selected_set().unwrap(),
                &runtime.game_asset_directory,
                &runtime.player_photo_directory,
            )
            .unwrap();
    }
    fn settings(runtime: &RuntimeState) -> VersusScreenState {
        serde_json::from_value(runtime.versus_screen.current().unwrap()).unwrap()
    }

    let runtime = open();
    let mut first = runtime.overlay.selected_set().unwrap();
    first.set_id = Some("101".into());
    first.event_id = Some("201".into());
    first.videogame_id = Some("43868".into());
    first.asset_catalog_slug = Some("street-fighter-6".into());
    select(&runtime, first.clone());
    let mut adjusted = settings(&runtime);
    adjusted.media_mode = "combined".into();
    adjusted.media_placements[0].character = MediaTransform {
        x: 0.2,
        y: -0.1,
        scale: 1.4,
        flipped: false,
    };
    adjusted.media_placements[0].photo.scale = 0.8;
    adjusted.media_placements[1].character = MediaTransform {
        x: -0.3,
        y: 0.1,
        scale: 1.7,
        flipped: true,
    };
    adjusted.media_placements[1].photo.y = 0.2;
    let expected = adjusted.media_placements.clone();
    runtime
        .versus_screen
        .replace(&runtime.database, adjusted)
        .unwrap();
    runtime
        .overlay
        .set_score(&runtime.database, "one", 1)
        .unwrap();
    let stored = runtime
        .database
        .load_set_versus_media("101")
        .unwrap()
        .unwrap();
    assert_eq!(
        media::load_set_layouts(&runtime.database, Some("101")).unwrap()[0].placements,
        expected
    );
    let before_failure = runtime.versus_screen.current().unwrap();
    runtime
        .database
        .connection
        .lock()
        .unwrap()
        .execute_batch(
            "CREATE TRIGGER reject_artwork BEFORE UPDATE OF versus_media ON set_overrides
         BEGIN SELECT RAISE(ABORT, 'test save failure'); END;",
        )
        .unwrap();
    let mut rejected = settings(&runtime);
    rejected.media_placements[0].character.scale = 2.0;
    assert!(
        runtime
            .versus_screen
            .replace(&runtime.database, rejected)
            .is_err()
    );
    assert_eq!(runtime.versus_screen.current().unwrap(), before_failure);
    assert_eq!(
        runtime
            .database
            .load_set_versus_media("101")
            .unwrap()
            .unwrap(),
        stored
    );
    let surface: Value = serde_json::from_str(
        &runtime
            .database
            .load_broadcast_surface(SURFACE_ID)
            .unwrap()
            .unwrap(),
    )
    .unwrap();
    assert_eq!(surface, before_failure);
    runtime
        .database
        .connection
        .lock()
        .unwrap()
        .execute_batch("DROP TRIGGER reject_artwork;")
        .unwrap();

    let mut second = first.clone();
    second.set_id = Some("102".into());
    select(&runtime, second.clone());
    assert_eq!(
        settings(&runtime).media_placements,
        default_media_placements()
    );
    let mut other = settings(&runtime);
    other.media_placements[0].character.scale = 0.6;
    runtime
        .versus_screen
        .replace(&runtime.database, other)
        .unwrap();
    select(&runtime, first.clone());
    assert_eq!(settings(&runtime).media_placements, expected);
    drop(runtime);

    let restarted = open();
    assert!(restarted.overlay.selected_set().unwrap().set_id.is_none());
    select(&restarted, first.clone());
    assert_eq!(settings(&restarted).media_placements, expected);
    select(&restarted, second);
    assert_eq!(
        settings(&restarted).media_placements[0].character.scale,
        0.6
    );
    first.videogame_id = Some("582".into());
    first.asset_catalog_slug = Some("vampire-savior-the-lord-of-vampire".into());
    select(&restarted, first);
    assert_eq!(
        settings(&restarted).media_placements,
        default_media_placements()
    );
    drop(restarted);
    std::fs::remove_dir_all(directory).unwrap();
}

#[test]
fn history_and_settings_writes_preserve_each_other_and_reject_stale_revisions() {
    let database = Database::open(std::path::Path::new(":memory:")).unwrap();
    let store = VersusScreenStore::load(&database).unwrap();
    let stale = store.current().unwrap();
    assert_eq!(stale["showMatchBackdrop"], true);
    let mut legacy = stale.clone();
    legacy.as_object_mut().unwrap().remove("showMatchBackdrop");
    assert!(
        serde_json::from_value::<VersusScreenState>(legacy)
            .unwrap()
            .show_match_backdrop
    );
    let mut updates = store.subscribe();
    let history = VersusHistory {
        tournament_name: None,
        player_one_placements: vec![Placement {
            placement: 1,
            tournament_name: "Finals".into(),
            event_name: "Singles".into(),
        }],
        player_two_placements: vec![],
        head_to_head: (0..4)
            .map(|index| HeadToHead {
                set_id: Some(index.to_string()),
                phase: Some("Top 8".into()),
                round: Some("Grand Final".into()),
                tournament_name: "Major".into(),
                event_name: "Singles".into(),
                completed_at: Some(100 + index),
                player_one_score: 3,
                player_two_score: 1,
            })
            .collect(),
    };
    let context = crate::versus_history::HistoryMatch {
        set_id: Some("1".into()),
        event_id: Some("2".into()),
        game_id: "3".into(),
        player_one_id: "4".into(),
        player_two_id: "5".into(),
    };
    store
        .begin_history(&database, Some(context.clone()), true)
        .unwrap();
    updates.try_recv().unwrap();
    let with_history = store
        .finish_history(&database, &context, &Ok(history))
        .unwrap();
    assert_eq!(
        with_history["history"]["headToHead"]
            .as_array()
            .unwrap()
            .len(),
        4
    );
    let mut excessive: VersusHistory =
        serde_json::from_value(with_history["history"].clone()).unwrap();
    excessive
        .head_to_head
        .push(excessive.head_to_head[0].clone());
    assert!(
        store
            .finish_history(&database, &context, &Ok(excessive))
            .is_err()
    );
    assert_eq!(stale["updatedAt"], with_history["updatedAt"]);
    let mut submitted: VersusScreenState = serde_json::from_value(stale.clone()).unwrap();
    submitted.show_background = false;
    submitted.show_match_backdrop = false;
    submitted.logo_asset_id = Some("local.png".to_owned());
    submitted.stat_rows = vec!["seed".into(), "age".into()];
    submitted.show_head_to_head = false;
    submitted.media_mode = "combined".into();
    submitted.media_placements[0].character.scale = 1.25;
    submitted.history = None;
    let saved = store.replace(&database, submitted).unwrap();
    assert_eq!(saved["history"], with_history["history"]);
    assert_eq!(
        store
            .replace(&database, serde_json::from_value(stale).unwrap())
            .unwrap_err(),
        crate::persisted_state::STALE_SETTINGS
    );
    let reset = store.reset_media_placements(&database).unwrap();
    assert_eq!(reset["showBackground"], false);
    assert_eq!(reset["showMatchBackdrop"], false);
    assert_eq!(reset["logoAssetId"], "local.png");
    assert_eq!(reset["history"], saved["history"]);
    assert_ne!(reset["updatedAt"], saved["updatedAt"]);
    let persisted: Value = serde_json::from_str(
        &database
            .load_broadcast_surface(SURFACE_ID)
            .unwrap()
            .unwrap(),
    )
    .unwrap();
    assert_eq!(persisted, reset);
    for expected in [&with_history, &saved, &reset] {
        assert_eq!(
            &serde_json::from_str::<Value>(&updates.try_recv().unwrap()).unwrap(),
            expected
        );
    }
    assert!(updates.try_recv().is_err());
    store.begin_history(&database, None, true).unwrap();
    assert!(
        store
            .finish_history(
                &database,
                &context,
                &Ok(VersusHistory {
                    tournament_name: None,
                    player_one_placements: vec![],
                    player_two_placements: vec![],
                    head_to_head: vec![]
                })
            )
            .is_err()
    );
    assert!(store.current().unwrap().get("history").is_none());
    let restored = VersusScreenStore::load(&database)
        .unwrap()
        .current()
        .unwrap();
    assert!(restored.get("history").is_none());
    assert_eq!(restored["logoAssetId"], "local.png");
    assert_eq!(restored["showMatchBackdrop"], false);
    assert_eq!(restored["statRows"], serde_json::json!(["seed", "age"]));
    assert_eq!(restored["showHeadToHead"], false);
    assert_eq!(restored["mediaMode"], "combined");
    for rows in [
        vec!["age", "age"],
        vec!["unknown"],
        vec!["age", "seed", "sponsor", "nickname", "age"],
    ] {
        let mut invalid: VersusScreenState =
            serde_json::from_value(store.current().unwrap()).unwrap();
        invalid.stat_rows = rows.into_iter().map(str::to_owned).collect();
        assert!(store.replace(&database, invalid).is_err());
    }
    let mut invalid: VersusScreenState = serde_json::from_value(store.current().unwrap()).unwrap();
    invalid.logo_asset_id = Some("../outside.png".into());
    assert!(store.replace(&database, invalid).is_err());
}

#[test]
fn player_defaults_apply_to_exhibitions_and_new_sets_without_replacing_saved_set_positions() {
    use crate::{player_library::Profile, state::OverlayStore};
    let directory = std::env::temp_dir().join(format!(
        "jabs-versus-defaults-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    let artwork = directory.join("street-fighter-6/characters");
    std::fs::create_dir_all(&artwork).unwrap();
    let image = include_bytes!("../../../src/renderer/src/assets/Flag_of_None.webp");
    for name in ["Cammy.webp", "Cammy_2.webp", "Ryu.webp"] {
        std::fs::write(artwork.join(name), image).unwrap();
    }
    for name in ["Alpha.webp", "Beta.webp", "alternate.webp"] {
        std::fs::write(directory.join(name), image).unwrap();
    }
    let database = Database::open(&directory.join("state.sqlite")).unwrap();
    database
        .observe_players(vec![
            (
                "101".into(),
                Profile {
                    name: "Alpha".into(),
                    ..Profile::default()
                },
            ),
            (
                "102".into(),
                Profile {
                    name: "Beta".into(),
                    ..Profile::default()
                },
            ),
        ])
        .unwrap();
    let store = VersusScreenStore::load(&database).unwrap();
    let initial = OverlayStore::load(&database)
        .unwrap()
        .selected_set()
        .unwrap();
    let mut exhibition = initial.clone();
    exhibition.asset_catalog_slug = Some("street-fighter-6".into());
    exhibition.videogame_id = Some("43868".into());
    for (player, id, name, character) in [
        (&mut exhibition.player_one, "101", "Alpha", "Cammy"),
        (&mut exhibition.player_two, "102", "Beta", "Ryu"),
    ] {
        player.player_id = Some(id.into());
        player.name = name.into();
        player.characters = vec![character.into()];
        player.character = Some(character.into());
    }
    let select = |store: &VersusScreenStore,
                  previous: &crate::state::SelectedSet,
                  next: &crate::state::SelectedSet| {
        store
            .restore_media_for_match_change(&database, previous, next, &directory, &directory)
            .unwrap();
    };
    let settings = |store: &VersusScreenStore| -> VersusScreenState {
        serde_json::from_value(store.current().unwrap()).unwrap()
    };
    let set_mode = |store: &VersusScreenStore, mode: &str| {
        let mut next = settings(store);
        next.media_mode = mode.into();
        store.replace(&database, next).unwrap();
    };

    select(&store, &initial, &exhibition);
    set_mode(&store, "combined");
    let mut edited = settings(&store);
    edited.media_placements[0].character.scale = 1.4;
    edited.media_placements[0].photo.x = 0.2;
    edited.media_placements[1].character.flipped = true;
    edited.media_placements[1].photo.scale = 0.8;
    let defaults = edited.media_placements.clone();
    store.replace(&database, edited).unwrap();

    let mut tournament = exhibition.clone();
    tournament.set_id = Some("301".into());
    tournament.event_id = Some("401".into());
    database
        .save_stream_state("{}", &now_rfc3339().unwrap(), Some(("301", "{}")))
        .unwrap();
    select(&store, &exhibition, &tournament);
    assert_eq!(settings(&store).media_placements, defaults);
    let mut edited = settings(&store);
    edited.media_placements[0].character.scale = 1.7;
    let set_positions = edited.media_placements.clone();
    store.replace(&database, edited).unwrap();

    select(&store, &tournament, &exhibition);
    assert_eq!(settings(&store).media_placements, set_positions);
    let mut edited = settings(&store);
    edited.media_placements[0].character.scale = 2.0;
    let latest_defaults = edited.media_placements.clone();
    store.replace(&database, edited).unwrap();
    select(&store, &exhibition, &tournament);
    assert_eq!(settings(&store).media_placements, set_positions);

    set_mode(&store, "character");
    assert_eq!(
        settings(&store).media_placements,
        default_media_placements()
    );
    let mut edited = settings(&store);
    edited.media_placements[0].character.x = -0.1;
    let character_only = edited.media_placements.clone();
    store.replace(&database, edited).unwrap();
    set_mode(&store, "combined");
    assert_eq!(settings(&store).media_placements, set_positions);
    set_mode(&store, "character");
    assert_eq!(settings(&store).media_placements, character_only);
    set_mode(&store, "combined");

    let mut new_set = tournament.clone();
    new_set.set_id = Some("302".into());
    select(&store, &tournament, &new_set);
    assert_eq!(settings(&store).media_placements, latest_defaults);
    set_mode(&store, "character");
    assert_eq!(settings(&store).media_placements, character_only);
    set_mode(&store, "combined");

    let mut alternate = new_set.clone();
    alternate.player_one.character_asset_id = Some("Cammy_2.webp".into());
    select(&store, &new_set, &alternate);
    assert_eq!(
        settings(&store).media_placements[0],
        PlayerMediaPlacement::default()
    );
    assert_eq!(settings(&store).media_placements[1], latest_defaults[1]);
    select(&store, &alternate, &new_set);
    assert_eq!(settings(&store).media_placements, latest_defaults);
    alternate = new_set.clone();
    alternate.player_one.player_photo_asset_id = Some("alternate.webp".into());
    select(&store, &new_set, &alternate);
    assert_eq!(
        settings(&store).media_placements[0],
        PlayerMediaPlacement::default()
    );
    select(&store, &alternate, &exhibition);
    assert_eq!(settings(&store).media_placements, latest_defaults);

    let mut other_game = exhibition.clone();
    other_game.asset_catalog_slug = Some("vampire-savior-the-lord-of-vampire".into());
    other_game.videogame_id = Some("582".into());
    select(&store, &exhibition, &other_game);
    assert_eq!(
        settings(&store).media_placements,
        default_media_placements()
    );
    select(&store, &other_game, &exhibition);
    assert_eq!(settings(&store).media_placements, latest_defaults);

    let mut swapped = exhibition.clone();
    std::mem::swap(&mut swapped.player_one, &mut swapped.player_two);
    select(&store, &exhibition, &swapped);
    assert_eq!(
        settings(&store).media_placements,
        default_media_placements()
    );
    select(&store, &swapped, &exhibition);
    assert_eq!(settings(&store).media_placements, latest_defaults);
    let mut replacement = exhibition.clone();
    replacement.player_one = swapped.player_one.clone();
    select(&store, &exhibition, &replacement);
    assert_eq!(
        settings(&store).media_placements[0],
        PlayerMediaPlacement::default()
    );
    assert_eq!(settings(&store).media_placements[1], latest_defaults[1]);

    drop(store);
    drop(database);
    let database = Database::open(&directory.join("state.sqlite")).unwrap();
    let store = VersusScreenStore::load(&database).unwrap();
    store
        .restore_media_for_match_change(&database, &initial, &exhibition, &directory, &directory)
        .unwrap();
    assert_eq!(settings(&store).media_placements, latest_defaults);

    let before_failure = store.current().unwrap();
    database
        .connection
        .lock()
        .unwrap()
        .execute_batch(
            "CREATE TRIGGER reject_default BEFORE UPDATE ON player_versus_media
         BEGIN SELECT RAISE(ABORT, 'test save failure'); END;",
        )
        .unwrap();
    let mut rejected = settings(&store);
    rejected.media_placements[0].character.scale = 2.2;
    assert!(store.replace(&database, rejected).is_err());
    assert_eq!(store.current().unwrap(), before_failure);
    let restarted = VersusScreenStore::load(&database).unwrap();
    restarted
        .restore_media_for_match_change(&database, &initial, &exhibition, &directory, &directory)
        .unwrap();
    assert_eq!(settings(&restarted).media_placements, latest_defaults);
    database
        .connection
        .lock()
        .unwrap()
        .execute_batch("DROP TRIGGER reject_default;")
        .unwrap();
    let player = database
        .library_resolve(None, Some("101"))
        .unwrap()
        .unwrap();
    database
        .library_delete(&player.local_id, &player.updated_at)
        .unwrap();
    let mut edited = settings(&store);
    edited.media_placements[0].character.x = 0.3;
    store.replace(&database, edited).unwrap();
    restarted
        .restore_media_for_match_change(&database, &initial, &exhibition, &directory, &directory)
        .unwrap();
    assert_eq!(
        settings(&restarted).media_placements[0],
        PlayerMediaPlacement::default()
    );
    assert_eq!(settings(&restarted).media_placements[1], latest_defaults[1]);
    drop(restarted);
    drop(store);
    drop(database);
    std::fs::remove_dir_all(directory).unwrap();
}
