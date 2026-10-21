use super::*;
use crate::state::OverlayStore;
use axum::{
    body::Body,
    extract::{Path, Query, State},
    http::{HeaderMap, Request, StatusCode, header},
};
use std::{path::PathBuf, sync::Arc};

fn setup() -> (Database, StingerStore, SelectedSet) {
    let database = Database::open(std::path::Path::new(":memory:")).unwrap();
    let selected = OverlayStore::load(&database)
        .unwrap()
        .selected_set()
        .unwrap();
    let store = StingerStore::load(&database).unwrap();
    store
        .install(
            &database,
            Kind::Perfect,
            Some(Video {
                id: "perfect.webm".into(),
                name: "Perfect.webm".into(),
            }),
        )
        .unwrap();
    store
        .install(
            &database,
            Kind::Winner,
            Some(Video {
                id: "winner.webm".into(),
                name: "Winner.webm".into(),
            }),
        )
        .unwrap();
    (database, store, selected)
}

#[test]
fn settings_persist_but_cues_and_source_ownership_do_not() {
    let (database, store, selected) = setup();
    assert_eq!(store.current().unwrap().settings.video_layer, "foreground");
    let mut settings = store.current().unwrap().settings;
    settings.automatic_winner = true;
    settings.winner.duration_seconds = Some(9.5);
    store.replace(&database, settings).unwrap();
    store.register("source-one", true, true).unwrap();
    store.play(Kind::Perfect, selected).unwrap();
    let restored = StingerStore::load(&database).unwrap().current().unwrap();
    assert!(restored.settings.automatic_winner);
    assert_eq!(restored.settings.winner.duration_seconds, Some(9.5));
    assert_eq!(
        restored.settings.perfect.video.unwrap().name,
        "Perfect.webm"
    );
    assert!(restored.cue.is_none());
    assert_eq!(restored.ready_sources, 0);
    let mut updates = store.subscribe();
    let replacement = store.current().unwrap().settings.perfect.video;
    store
        .install(&database, Kind::Perfect, replacement)
        .unwrap();
    let published: serde_json::Value = serde_json::from_str(&updates.try_recv().unwrap()).unwrap();
    assert!(published["payload"]["cue"].is_null());
    assert_eq!(
        published["payload"]["settings"]["perfect"]["video"]["id"],
        "perfect.webm"
    );
    assert!(matches!(
        updates.try_recv(),
        Err(broadcast::error::TryRecvError::Empty)
    ));
    let mut invalid = store.current().unwrap().settings;
    invalid.winner.video.as_mut().unwrap().id = "../secret.webm".into();
    assert!(store.replace(&database, invalid).is_err());
    let mut injected = store.current().unwrap().settings;
    injected.perfect.video.as_mut().unwrap().id = "not-imported.webm".into();
    assert!(store.replace(&database, injected).is_err());
    let mut legacy = serde_json::to_value(store.current().unwrap().settings).unwrap();
    legacy["perfect"]["video"]["id"] = "old.mp4".into();
    legacy["perfect"]["volume"] = 0.25.into();
    database
        .save_broadcast_surface("stingers", &legacy.to_string(), "legacy")
        .unwrap();
    let migrated = StingerStore::load(&database).unwrap().current().unwrap();
    assert!(migrated.settings.perfect.video.is_none());
    assert_eq!(
        migrated.settings.winner.video.as_ref().unwrap().id,
        "winner.webm"
    );
    assert!(migrated.settings.automatic_winner);
    assert_eq!(migrated.settings.winner.duration_seconds, Some(9.5));
    let persisted: serde_json::Value = serde_json::from_str(
        &database
            .load_broadcast_surface("stingers")
            .unwrap()
            .unwrap(),
    )
    .unwrap();
    assert!(persisted["perfect"].get("volume").is_none());
}

#[test]
fn a_cue_has_one_owner_and_stale_completions_cannot_stop_a_new_cue() {
    let (_, store, selected) = setup();
    store.register("source-one", true, true).unwrap();
    store.register("source-two", true, true).unwrap();
    store.register("source-unknown", true, false).unwrap();
    let cue = store
        .play(Kind::Perfect, selected.clone())
        .unwrap()
        .cue
        .unwrap();
    assert!(store.claim("source-unknown", &cue.id).unwrap().is_none());
    let first = store.claim("source-one", &cue.id).unwrap().unwrap();
    assert!(first.claimed);
    assert!(store.claim("source-two", &cue.id).unwrap().is_none());
    assert!(store.claim("source-one", &cue.id).unwrap().is_none());
    store
        .finish(Some("source-two"), Some(&cue.id), None)
        .unwrap();
    assert!(store.current().unwrap().cue.is_some());
    let next = store.play(Kind::Perfect, selected).unwrap().cue.unwrap();
    store.claim("source-one", &next.id).unwrap().unwrap();
    store
        .finish(Some("source-one"), Some(&cue.id), None)
        .unwrap();
    assert_eq!(store.current().unwrap().cue.unwrap().id, next.id);
    store
        .finish(Some("source-one"), Some(&next.id), None)
        .unwrap();
    assert!(store.current().unwrap().cue.is_none());
}

#[test]
fn new_pages_and_disconnected_sources_cannot_replay_existing_cues() {
    let (_, store, selected) = setup();
    assert!(store.play(Kind::Perfect, selected.clone()).is_err());
    store.register("source-one", true, false).unwrap();
    let cue = store
        .play(Kind::Perfect, selected.clone())
        .unwrap()
        .cue
        .unwrap();
    store.register("source-new", true, false).unwrap();
    assert!(store.claim("source-new", &cue.id).unwrap().is_none());
    store.claim("source-one", &cue.id).unwrap().unwrap();
    store.register("source-one", false, true).unwrap();
    store.expire();
    assert!(store.current().unwrap().cue.is_none());
    let cue = store.play(Kind::Perfect, selected).unwrap().cue.unwrap();
    store.inner.lock().unwrap().cue.as_mut().unwrap().created =
        Instant::now() - Duration::from_secs(6);
    assert!(store.claim("source-new", &cue.id).unwrap().is_none());
    assert!(store.current().unwrap().cue.is_none());
}

#[test]
fn automatic_winner_requires_fresh_completion_and_does_not_repeat_after_correction() {
    let (database, store, mut selected) = setup();
    selected.best_of = 3;
    selected.player_one.score = 1;
    let mut won = selected.clone();
    won.player_one.score = 2;
    store.register("source-one", true, true).unwrap();
    store.score_updated(&selected, &won);
    assert!(store.current().unwrap().cue.is_none());
    let mut settings = store.current().unwrap().settings;
    settings.automatic_winner = true;
    store.replace(&database, settings).unwrap();
    let mut other_match = won.clone();
    other_match.player_one.name = "Another player".into();
    store.score_updated(&selected, &other_match);
    assert!(store.current().unwrap().cue.is_none());
    store.score_updated(&selected, &won);
    let cue = store.current().unwrap().cue.unwrap();
    assert_eq!(cue.kind, Kind::Winner);
    assert_eq!(cue.selected_set.unwrap().player_one.score, 2);
    let before = store.current().unwrap();
    let mut updates = store.subscribe();
    let recovered = store.reconnect().unwrap();
    assert_ne!(recovered.connection_id, before.connection_id);
    assert!(recovered.cue.is_none());
    assert_eq!(recovered.ready_sources, 0);
    assert_eq!(
        serde_json::to_value(&recovered.settings).unwrap(),
        serde_json::to_value(&before.settings).unwrap()
    );
    let event: serde_json::Value = serde_json::from_str(&updates.try_recv().unwrap()).unwrap();
    assert_eq!(event["payload"]["connectionId"], recovered.connection_id);
    store.register("source-one", true, true).unwrap();
    store.score_updated(&won, &won);
    store.score_updated(&selected, &won);
    assert!(store.current().unwrap().cue.is_none());
    let mut corrected_winner = won.clone();
    corrected_winner.player_one.score = 0;
    corrected_winner.player_two.score = 2;
    store.score_updated(&selected, &corrected_winner);
    assert!(store.current().unwrap().cue.is_none());
    store.reset_completion();
    store.score_updated(&selected, &won);
    assert!(store.current().unwrap().cue.is_some());
    let mut topanga = selected;
    topanga.match_format = Some("topanga".into());
    topanga.player_one.score = 7;
    topanga.player_two.score = 6;
    assert_eq!(winner(&topanga), None);
    topanga.player_one.score = 8;
    assert_eq!(winner(&topanga), Some("one"));
    let mut imported = topanga;
    imported.match_format = Some("best-of".into());
    imported.player_one.score = 1;
    imported.player_two.score = 0;
    imported.state = Some("3".into());
    assert_eq!(winner(&imported), Some("one"));
    store.finish(None, None, None).unwrap();
    store.reset_completion();
    let mut before_import = imported.clone();
    before_import.state = Some("2".into());
    store.score_updated(&before_import, &imported);
    assert!(store.current().unwrap().cue.is_none());
}

#[test]
fn video_ranges_support_seeking_and_reject_invalid_ranges_and_paths() {
    for (header, expected) in [
        (None, (0, 99)),
        (Some("bytes=10-19"), (10, 19)),
        (Some("bytes=80-"), (80, 99)),
        (Some("bytes=-20"), (80, 99)),
        (Some("bytes=90-200"), (90, 99)),
    ] {
        assert_eq!(media::byte_range(header, 100).unwrap(), expected);
    }
    for header in [
        "bytes=100-",
        "bytes=20-10",
        "bytes=-0",
        "bytes=1-2,4-5",
        "items=0-1",
    ] {
        assert!(media::byte_range(Some(header), 100).is_err());
    }
    assert!(media::byte_range(None, 0).is_err());
    let header = b"\x1a\x45\xdf\xa3\x87\x42\x82\x84webm";
    assert!(media::is_webm(header));
    for length in 0..header.len() {
        assert!(!media::is_webm(&header[..length]));
    }
    assert!(!media::is_webm(b"\x1a\x45\xdf\xa3\x8b\x42\x82\x88matroska"));
    assert!(!media::is_webm(b"\x00\x00\x00\x18ftypisom"));
    for id in ["clip.mp4", "clip.mov"] {
        assert!(!media::valid_id(id));
    }

    for id in [
        "../clip.webm",
        "clip/secret.webm",
        "clip.svg",
        "clip.webm.part",
        "clip%2fsecret.webm",
    ] {
        assert!(!media::valid_id(id));
    }
}

struct Directory(PathBuf);
impl Drop for Directory {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

#[tokio::test]
async fn importing_is_guarded_and_video_playback_streams_exact_requested_bytes() {
    let directory =
        Directory(std::env::temp_dir().join(format!("jabs-stingers-test-{}", unique_id())));
    let runtime = Arc::new(
        crate::runtime::RuntimeState::new(
            Database::open(std::path::Path::new(":memory:")).unwrap(),
            directory.0.join("logos"),
            directory.0.join("sponsors"),
            directory.0.join("players"),
            directory.0.join("games"),
            directory.0.join("scoreboards"),
            directory.0.join("allowlist"),
        )
        .unwrap(),
    );
    let rejected = media::import(
        State(runtime.clone()),
        Path(Kind::Perfect),
        Query(media::ImportQuery {
            name: "clip.webm".into(),
        }),
        Request::new(Body::empty()),
    )
    .await;
    assert_eq!(rejected.status(), StatusCode::FORBIDDEN);
    let connection_id = runtime.stingers.current().unwrap().connection_id;
    let rejected = routes::reconnect(State(runtime.clone()), HeaderMap::new()).await;
    assert_eq!(rejected.status(), StatusCode::FORBIDDEN);
    assert_eq!(runtime.stingers.current().unwrap().connection_id, connection_id);
    let mut headers = HeaderMap::new();
    headers.insert("X-JABS-Action", "renderer-v1".parse().unwrap());
    let reconnected = routes::reconnect(State(runtime.clone()), headers).await;
    assert_eq!(reconnected.status(), StatusCode::OK);
    assert_ne!(runtime.stingers.current().unwrap().connection_id, connection_id);
    let bytes = b"\x1a\x45\xdf\xa3\x87\x42\x82\x84webm-segment-payload";
    let upload = Request::builder()
        .header("X-JABS-Action", "renderer-v1")
        .body(Body::from(bytes.as_slice()))
        .unwrap();
    let response = media::import(
        State(runtime.clone()),
        Path(Kind::Perfect),
        Query(media::ImportQuery {
            name: "clip.webm".into(),
        }),
        upload,
    )
    .await;
    assert_eq!(response.status(), StatusCode::OK);
    let rejected = media::import(
        State(runtime.clone()),
        Path(Kind::Winner),
        Query(media::ImportQuery {
            name: "clip.mp4".into(),
        }),
        Request::builder()
            .header("X-JABS-Action", "renderer-v1")
            .body(Body::from(bytes.as_slice()))
            .unwrap(),
    )
    .await;
    assert_eq!(rejected.status(), StatusCode::UNPROCESSABLE_ENTITY);

    let id = runtime
        .stingers
        .current()
        .unwrap()
        .settings
        .perfect
        .video
        .unwrap()
        .id;
    let mut headers = HeaderMap::new();
    headers.insert(header::RANGE, "bytes=8-15".parse().unwrap());
    let response = media::serve(State(runtime.clone()), Path(id.clone()), headers).await;
    assert_eq!(response.status(), StatusCode::PARTIAL_CONTENT);
    assert_eq!(
        response.headers()[header::CONTENT_RANGE],
        format!("bytes 8-15/{}", bytes.len())
    );
    let body = axum::body::to_bytes(response.into_body(), 100)
        .await
        .unwrap();
    assert_eq!(body.as_ref(), &bytes[8..16]);
    let upload = Request::builder()
        .header("X-JABS-Action", "renderer-v1")
        .body(Body::from("\x00\x00\x00\x18ftypisom0123456789abcdef"))
        .unwrap();
    let rejected = media::import(
        State(runtime.clone()),
        Path(Kind::Perfect),
        Query(media::ImportQuery {
            name: "bad.webm".into(),
        }),
        upload,
    )
    .await;
    assert_eq!(rejected.status(), StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(
        runtime
            .stingers
            .current()
            .unwrap()
            .settings
            .perfect
            .video
            .unwrap()
            .id,
        id
    );
    assert_eq!(
        std::fs::read_dir(&runtime.stinger_directory)
            .unwrap()
            .count(),
        1
    );
}
