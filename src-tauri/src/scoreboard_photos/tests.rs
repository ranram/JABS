use super::*;
use crate::player_library::Profile;
use std::{fs, path::PathBuf};

struct Fixture {
    root: PathBuf,
    runtime: Arc<RuntimeState>,
}
impl Fixture {
    fn new() -> Self {
        let root = std::env::temp_dir().join(format!(
            "jabs-headshots-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(root.join("players")).unwrap();
        fs::create_dir_all(root.join("player_headshots")).unwrap();
        let runtime = Arc::new(
            RuntimeState::new(
                Database::open(&root.join("library.sqlite")).unwrap(),
                root.join("logos"),
                root.join("sponsors"),
                root.join("players"),
                root.join("games"),
                root.join("scoreboards"),
                root.join("allowlist"),
            )
            .unwrap(),
        );
        runtime
            .database
            .observe_players(vec![(
                "1".into(),
                Profile {
                    name: "Tag".into(),
                    ..Default::default()
                },
            )])
            .unwrap();
        Self { root, runtime }
    }
    fn image(&self, source: &str, name: &str, contents: &[u8]) -> Photo {
        let directory = if source == "headshot" {
            &self.runtime.player_headshot_directory
        } else {
            &self.runtime.player_photo_directory
        };
        fs::write(directory.join(name), contents).unwrap();
        Photo {
            source: source.into(),
            asset_id: name.into(),
            fingerprint: media::source_fingerprint(&self.runtime, source, name).unwrap(),
            crop: Crop::default(),
            placements: Default::default(),
        }
    }
    fn player(&self) -> crate::player_library::LibraryPlayer {
        self.runtime
            .database
            .library_resolve(None, Some("1"))
            .unwrap()
            .unwrap()
    }
    fn identity(&self) -> media::Identity {
        media::Identity {
            local_player_id: Some(self.player().local_id),
            player_id: Some("1".into()),
            name: "Tag".into(),
            player_photo_asset_id: None,
        }
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.root);
    }
}
const FIRST: &[u8] = b"\x89PNG\r\n\x1a\nfirst-image";
const SECOND: &[u8] = b"\x89PNG\r\n\x1a\nother-image";

#[test]
fn existing_photos_show_without_preparation_and_matching_respects_identity_and_headshot_priority() {
    let f = Fixture::new();
    let identity = f.identity();
    assert!(
        media::resolve_photo(&f.runtime, &identity)
            .unwrap()
            .is_none()
    );
    let fallback = f.image("photo", "Tag.png", FIRST);
    assert_eq!(
        media::resolve_photo(&f.runtime, &identity).unwrap(),
        Some(fallback.clone())
    );
    let live_override = f.image("photo", "stream-only.png", FIRST);
    assert_eq!(
        media::resolve_photo(
            &f.runtime,
            &media::Identity {
                player_photo_asset_id: Some("stream-only.png".into()),
                ..f.identity()
            }
        )
        .unwrap(),
        Some(live_override)
    );
    let renamed = f.image("photo", "NewTag.png", FIRST);
    assert_eq!(
        media::resolve_photo(
            &f.runtime,
            &media::Identity {
                name: "NewTag".into(),
                ..f.identity()
            }
        )
        .unwrap(),
        Some(renamed)
    );
    let mut record = f.player();
    record.scoreboard_photo = Some(fallback.clone());
    f.runtime.database.library_save(record).unwrap();
    assert_eq!(
        media::resolve_photo(&f.runtime, &identity).unwrap(),
        Some(fallback)
    );
    let custom = f.image("photo", "custom.png", FIRST);
    let mut record = f.player();
    record
        .overrides
        .insert("playerPhotoAssetId".into(), "custom.png".into());
    record.scoreboard_photo = Some(custom.clone());
    f.runtime.database.library_save(record).unwrap();
    assert_eq!(
        media::resolve_photo(&f.runtime, &identity).unwrap(),
        Some(custom)
    );
    let mut record = f.player();
    record
        .overrides
        .insert("playerPhotoAssetId".into(), "missing.png".into());
    f.runtime.database.library_save(record).unwrap();
    assert!(
        media::resolve_photo(&f.runtime, &identity)
            .unwrap()
            .is_none()
    );
    let automatic = f.image("headshot", "Tag.png", FIRST);
    assert_eq!(
        media::resolve_photo(&f.runtime, &identity).unwrap(),
        Some(automatic.clone())
    );
    f.image("headshot", "Tag.jpg", b"\xff\xd8\xffsecond-file");
    assert!(media::resolve_photo(&f.runtime, &identity).is_err());
    fs::remove_file(f.runtime.player_headshot_directory.join("Tag.jpg")).unwrap();
    let explicit = automatic;
    let mut record = f.player();
    record.scoreboard_photo = Some(explicit.clone());
    f.runtime.database.library_save(record).unwrap();
    assert_eq!(
        media::resolve_photo(&f.runtime, &identity).unwrap(),
        Some(explicit)
    );
    fs::write(f.runtime.player_headshot_directory.join("Tag.png"), SECOND).unwrap();
    let replaced = media::resolve_photo(&f.runtime, &identity)
        .unwrap()
        .unwrap();
    assert_eq!(replaced.asset_id, "Tag.png");
    assert_ne!(
        replaced.fingerprint,
        f.player().scoreboard_photo.unwrap().fingerprint
    );
    assert_eq!(replaced.crop, Crop::default());
    assert!(replaced.placements.is_empty());
    fs::remove_file(f.runtime.player_headshot_directory.join("Tag.png")).unwrap();
    assert!(
        media::resolve_photo(&f.runtime, &identity)
            .unwrap()
            .is_none()
    );
    let wrong_identity = media::Identity {
        player_id: Some("2".into()),
        ..identity
    };
    assert!(media::resolve_photo(&f.runtime, &wrong_identity).is_err());
    for id in ["../Tag.png", "Tag.svg", "/Tag.png", "Tag.png/extra"] {
        assert!(media::source_fingerprint(&f.runtime, "headshot", id).is_err());
    }
    fs::write(
        f.runtime.player_headshot_directory.join("invalid.png"),
        b"not-a-png",
    )
    .unwrap();
    assert!(media::source_fingerprint(&f.runtime, "headshot", "invalid.png").is_err());
    #[cfg(unix)]
    {
        std::os::unix::fs::symlink(
            f.runtime.player_headshot_directory.join("Tag.png"),
            f.runtime.player_headshot_directory.join("link.png"),
        )
        .unwrap();
        assert!(media::source_fingerprint(&f.runtime, "headshot", "link.png").is_err());
    }
}

#[test]
fn saved_framing_survives_refresh_export_import_and_reopen_and_rejects_invalid_values() {
    let f = Fixture::new();
    let original = f.player();
    assert!(original.scoreboard_photo.is_none());
    let mut record = original.clone();
    let mut photo = f.image("photo", "Tag.png", FIRST);
    photo.crop = Crop {
        x: 0.3,
        y: 0.25,
        zoom: 1.8,
    };
    photo.placements.insert(
        "2xko".into(),
        SidePlacements {
            left: Some(MediaTransform {
                x: 0.2,
                y: -0.1,
                scale: 1.3,
                flipped: true,
            }),
            right: Some(MediaTransform::default()),
        },
    );
    photo.placements.insert(
        "street-fighter-6".into(),
        SidePlacements {
            left: None,
            right: Some(MediaTransform {
                x: -0.3,
                ..Default::default()
            }),
        },
    );
    record.scoreboard_photo = Some(photo.clone());
    let saved = f.runtime.database.library_save(record).unwrap().player;
    assert!(f.runtime.database.library_save(original).is_err());
    f.runtime
        .database
        .observe_players(vec![(
            "1".into(),
            Profile {
                name: "Renamed".into(),
                ..Default::default()
            },
        )])
        .unwrap();
    assert_eq!(f.player().scoreboard_photo, Some(photo.clone()));
    let reopened = Database::open(&f.root.join("library.sqlite")).unwrap();
    assert_eq!(
        reopened
            .library_player(&saved.local_id)
            .unwrap()
            .unwrap()
            .scoreboard_photo,
        Some(photo.clone())
    );
    let archive = serde_json::to_string(&f.player()).unwrap();
    let imported: crate::player_library::LibraryPlayer = serde_json::from_str(&archive).unwrap();
    let destination = Database::open(std::path::Path::new(":memory:")).unwrap();
    destination.library_import(vec![imported]).unwrap();
    assert_eq!(
        destination
            .library_player(&saved.local_id)
            .unwrap()
            .unwrap()
            .scoreboard_photo,
        Some(photo.clone())
    );
    for invalid in ["../photo.png", "bad.svg"] {
        let mut record = f.player();
        record.scoreboard_photo.as_mut().unwrap().asset_id = invalid.into();
        assert!(f.runtime.database.library_save(record).is_err());
    }
    for invalid in [f64::NAN, -0.1, 1.1] {
        let mut photo = photo.clone();
        photo.crop.x = invalid;
        assert!(photo.validate().is_err());
    }
    let mut invalid = photo.clone();
    invalid
        .placements
        .insert("unknown-game".into(), SidePlacements::default());
    assert!(invalid.validate().is_err());
    let mut invalid = photo.clone();
    invalid
        .placements
        .get_mut("2xko")
        .unwrap()
        .left
        .as_mut()
        .unwrap()
        .scale = 9.0;
    assert!(invalid.validate().is_err());
    let record = destination
        .library_player(&saved.local_id)
        .unwrap()
        .unwrap();
    destination
        .library_delete(&record.local_id, &record.updated_at)
        .unwrap();
    let count: i64 = destination
        .connection
        .lock()
        .unwrap()
        .query_row("SELECT count(*) FROM player_scoreboard_photos", [], |r| {
            r.get(0)
        })
        .unwrap();
    assert_eq!(count, 0);
}

#[tokio::test]
async fn photo_settings_are_persisted_versioned_and_require_trusted_mutations() {
    let f = Fixture::new();
    let original = f.runtime.scoreboard_photos.current().unwrap();
    assert!(!original.enabled);
    assert!(!original.logo_backdrop);
    assert!(!original.sponsor_backdrop);
    let legacy: Settings = serde_json::from_value(serde_json::json!({
        "enabled": true, "updatedAt": original.updated_at
    }))
    .unwrap();
    assert!(!legacy.logo_backdrop);
    assert!(!legacy.sponsor_backdrop);
    let mut next = original.clone();
    next.enabled = true;
    next.logo_backdrop = true;
    let mut updates = f.runtime.scoreboard_photos.subscribe();
    let rejected = update(
        State(f.runtime.clone()),
        HeaderMap::new(),
        Json(next.clone()),
    )
    .await;
    assert_eq!(rejected.status(), StatusCode::FORBIDDEN);
    let mut headers = HeaderMap::new();
    headers.insert("X-JABS-Action", "renderer-v1".parse().unwrap());
    let response = update(
        State(f.runtime.clone()),
        headers.clone(),
        Json(next.clone()),
    )
    .await;
    assert_eq!(response.status(), StatusCode::OK);
    let persisted = PhotoStore::load(&f.runtime.database)
        .unwrap()
        .current()
        .unwrap();
    assert!(persisted.enabled);
    assert!(persisted.logo_backdrop);
    assert!(!persisted.sponsor_backdrop);
    let message: serde_json::Value = serde_json::from_str(&updates.recv().await.unwrap()).unwrap();
    assert_eq!(message["payload"]["logoBackdrop"], true);
    let mut conflicting = persisted.clone();
    conflicting.sponsor_backdrop = true;
    assert_eq!(update(State(f.runtime.clone()), headers.clone(), Json(conflicting)).await.status(), StatusCode::UNPROCESSABLE_ENTITY);
    assert!(f.runtime.scoreboard_photos.current().unwrap().logo_backdrop);
    assert!(updates.try_recv().is_err());
    let mut sponsors = persisted.clone();
    sponsors.logo_backdrop = false;
    sponsors.sponsor_backdrop = true;
    assert_eq!(update(State(f.runtime.clone()), headers.clone(), Json(sponsors)).await.status(), StatusCode::OK);
    let sponsors = PhotoStore::load(&f.runtime.database).unwrap().current().unwrap();
    assert!(sponsors.sponsor_backdrop);
    assert!(!sponsors.logo_backdrop);
    let message: serde_json::Value = serde_json::from_str(&updates.recv().await.unwrap()).unwrap();
    assert_eq!(message["payload"]["sponsorBackdrop"], true);
    assert_eq!(message["payload"]["logoBackdrop"], false);
    assert_eq!(
        update(State(f.runtime.clone()), headers.clone(), Json(next))
            .await
            .status(),
        StatusCode::UNPROCESSABLE_ENTITY
    );
    let rejected = media::resolve(
        State(f.runtime.clone()),
        HeaderMap::new(),
        Json(media::Resolve {
            players: vec![f.identity()],
        }),
    )
    .await;
    assert_eq!(rejected.status(), StatusCode::FORBIDDEN);
    f.image("headshot", "Tag.png", FIRST);
    let resolved = media::resolve(
        State(f.runtime.clone()),
        headers.clone(),
        Json(media::Resolve {
            players: vec![f.identity()],
        }),
    )
    .await;
    assert_eq!(resolved.status(), StatusCode::OK);
    let bytes = axum::body::to_bytes(resolved.into_body(), 4096)
        .await
        .unwrap();
    let value: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(value["photos"][0]["assetId"], "Tag.png");
    let rejected = media::resolve(
        State(f.runtime.clone()),
        headers,
        Json(media::Resolve {
            players: vec![media::Identity {
                local_player_id: Some("../private".into()),
                player_id: None,
                name: "Tag".into(),
                player_photo_asset_id: None,
            }],
        }),
    )
    .await;
    assert_eq!(rejected.status(), StatusCode::UNPROCESSABLE_ENTITY);
}
