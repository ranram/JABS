use super::*;
use crate::database::Database;
use std::path::Path;

fn profile(name: &str) -> Profile {
    Profile {
        name: name.into(),
        prefix: Some("Team".into()),
        pronouns: Some("they/them".into()),
        country: Some("JP".into()),
        profile_slug: Some("user/example".into()),
        ..Profile::default()
    }
}
fn game(key: &str, character: &str) -> GamePreferences {
    GamePreferences {
        game_key: key.into(),
        characters: vec![character.into()],
        ..GamePreferences::default()
    }
}
#[test]
fn repeated_events_preserve_identity_preferences_and_intentional_blanks() {
    let db = Database::open(Path::new(":memory:")).unwrap();
    assert_eq!(
        db.observe_players(
            (1..=2)
                .map(|id| (id.to_string(), profile("SameTag")))
                .collect()
        )
        .unwrap(),
        2
    );
    let original = db.library_resolve(None, Some("1")).unwrap().unwrap();
    let second = db.library_resolve(None, Some("2")).unwrap().unwrap();
    assert_ne!(original.local_id, second.local_id);
    assert!(db
        .library_resolve(Some(&original.local_id), Some("2"))
        .is_err());
    let mut edited = original.clone();
    edited.overrides.insert("pronouns".into(), "".into());
    edited.overrides.insert("age".into(), "27".into());
    edited
        .overrides
        .insert("nickname".into(), "The Champion".into());
    edited
        .overrides
        .insert("prefix".into(), "Local sponsor".into());
    edited.games = vec![game("street-fighter-6", "Cammy"), game("tekken-8", "Nina")];
    let saved = db.library_save(edited).unwrap();
    assert!(saved.warnings.is_empty());
    let saved = saved.player;
    assert!(db.library_save(original).is_err());
    let returning = [1, 3]
        .into_iter()
        .map(|id| (id.to_string(), profile("NewTag")))
        .collect();
    assert_eq!(db.observe_players(returning).unwrap(), 1);
    let refreshed = db.library_resolve(None, Some("1")).unwrap().unwrap();
    assert_eq!(refreshed.local_id, saved.local_id);
    assert_eq!(refreshed.games, saved.games);
    assert_eq!(
        refreshed.text("pronouns", refreshed.imported.pronouns.as_deref()),
        None
    );
    assert_eq!(refreshed.overrides["prefix"], "Local sponsor");
    assert_eq!(refreshed.overrides["age"], "27");
    assert_eq!(refreshed.overrides["nickname"], "The Champion");
    assert_eq!(
        db.observe_players(vec![("1".into(), profile(""))]).unwrap(),
        0
    );
    let refreshed = db.library_resolve(None, Some("1")).unwrap().unwrap();
    assert_eq!(refreshed.imported.name, "NewTag");
    assert_eq!(refreshed.games, saved.games);
    assert!(!refreshed
        .aliases
        .iter()
        .any(|alias| alias == "The Champion"));
    for age in ["-1", "0", "121", "25.5", "unknown"] {
        let mut invalid = refreshed.clone();
        invalid.overrides.insert("age".into(), age.into());
        assert!(db.library_save(invalid).is_err());
    }
    assert_eq!(db.library_search("", 0).unwrap().1, 3);
    assert_eq!(db.library_search("sametag", 0).unwrap().1, 2);
    assert_eq!(db.library_search("newtag", 0).unwrap().1, 2);
    let overlay = crate::state::OverlayStore::load(&db).unwrap();
    let mut exhibition = overlay.selected_set().unwrap();
    exhibition.player_one.local_player_id = Some(refreshed.local_id.clone());
    exhibition.player_one.player_id = refreshed.player_id.clone();
    exhibition.player_one.name = refreshed.imported.name.clone();
    startgg::fill_defaults(&db, &mut exhibition).unwrap();
    let assets = Path::new("/jabs-no-test-assets");
    overlay
        .update_selected_set(&db, assets, assets, exhibition)
        .unwrap();
    assert_eq!(
        overlay
            .selected_set()
            .unwrap()
            .player_one
            .player_id
            .as_deref(),
        Some("1")
    );
    assert_eq!(
        overlay
            .selected_set()
            .unwrap()
            .player_one
            .character
            .as_deref(),
        Some("Cammy")
    );
    let sf6 = startgg::presentation(&refreshed, "street-fighter-6");
    let tekken = startgg::presentation(&refreshed, "tekken-8");
    assert_eq!(sf6["character"], "Cammy");
    assert_eq!(sf6["age"], 27);
    assert_eq!(sf6["nickname"], "The Champion");
    assert_eq!(tekken["character"], "Nina");
    assert!(startgg::presentation(&refreshed, "2xko")
        .get("character")
        .is_none());
    assert!(sf6["pronouns"].is_null());
    assert_eq!(
        db.library_import(vec![refreshed.clone(), second]).unwrap(),
        (0, 2)
    );
    let mut conflict = refreshed.clone();
    conflict.local_id = "f".repeat(32);
    assert!(db.library_save(conflict).is_err());
    let mut invalid = refreshed.clone();
    invalid.games.push(game("street-fighter-6", "Ryu"));
    assert!(db.library_save(invalid).is_err());
}

fn observed_participant(db: &Database) -> LibraryPlayer {
    let payload = serde_json::json!({"participants":[{"gamerTag":"Percent_%", "player":{"id":400},
      "user":{"slug":"user/400", "genderPronoun":"they/them", "location":{"country":"JP"},
      "authorizations":[{"externalUsername":"@Handle"}]}}]});
    assert_eq!(startgg::observe(db, &payload).unwrap(), 1);
    assert_eq!(db.library_search("Percent_%", 0).unwrap().1, 1);
    db.library_resolve(None, Some("400")).unwrap().unwrap()
}

#[test]
fn incomplete_startgg_participants_do_not_replace_saved_profiles() {
    let db = Database::open(Path::new(":memory:")).unwrap();
    let parsed = observed_participant(&db);
    let id_only =
        serde_json::json!({"participants": [{"player": {"id": 400}}, {"player": {"id": 401}}]});
    assert_eq!(startgg::observe(&db, &id_only).unwrap(), 0);
    assert!(db.library_resolve(None, Some("401")).unwrap().is_none());
    assert_eq!(
        db.library_resolve(None, Some("400"))
            .unwrap()
            .unwrap()
            .imported,
        parsed.imported
    );
    assert_eq!(parsed.imported.x_handle.as_deref(), Some("Handle"));
    assert_eq!(parsed.imported.pronouns.as_deref(), Some("they/them"));
}

#[test]
fn blocked_edits_preserve_saved_fields_and_allow_intentional_clearing() {
    let db = Database::open(Path::new(":memory:")).unwrap();
    let parsed = observed_participant(&db);
    let mut saved_details = parsed.clone();
    saved_details
        .overrides
        .insert("name".into(), "Player Four".into());
    saved_details
        .overrides
        .insert("nickname".into(), "The Champion".into());
    saved_details.overrides.insert("prefix".into(), "".into());
    saved_details.aliases.push("Another tag".into());
    saved_details.games = vec![game("street-fighter-6", "Cammy"), game("tekken-8", "Nina")];
    saved_details.games[0].character_asset_id = Some("Cammy2.png".into());
    saved_details.games[0].portrait_asset_id = Some("Cammy3.png".into());
    let saved_details = db.library_save(saved_details).unwrap().player;
    let mut bad = saved_details.clone();
    // Reuse a catalog term without putting offensive examples into test fixtures.
    let blocked = crate::generated_moderation_terms::EN
        .iter()
        .find(|term| {
            crate::moderation::censor(Some((*term).to_string())).as_deref() == Some("[blocked]")
        })
        .unwrap();
    bad.overrides.insert("pronouns".into(), (*blocked).into());
    bad.overrides.insert("name".into(), (*blocked).into());
    bad.overrides.insert("nickname".into(), (*blocked).into());
    bad.overrides.insert("prefix".into(), (*blocked).into());
    bad.overrides.insert("xHandle".into(), (*blocked).into());
    bad.overrides.insert("age".into(), "29".into());
    bad.aliases = vec![(*blocked).into(), "   ".into()];
    bad.games[0] = game("street-fighter-6", blocked);
    bad.games[1] = game("tekken-8", "Jin");
    let moderated = db.library_save(bad).unwrap();
    assert_eq!(
        serde_json::to_value(&moderated.warnings).unwrap(),
        serde_json::json!([
            {"field": "aliases", "reason": "blocked-text"},
            {"field": "characters", "reason": "blocked-text"},
            {"field": "name", "reason": "blocked-text"},
            {"field": "nickname", "reason": "blocked-text"},
            {"field": "prefix", "reason": "blocked-text"},
            {"field": "pronouns", "reason": "blocked-text"},
            {"field": "xHandle", "reason": "blocked-text"}
        ])
    );
    let moderated = moderated.player;
    assert!(!moderated.overrides.contains_key("pronouns"));
    assert!(!moderated.overrides.contains_key("xHandle"));
    assert_eq!(
        moderated
            .text("pronouns", moderated.imported.pronouns.as_deref())
            .as_deref(),
        Some("they/them")
    );
    assert_eq!(moderated.overrides["name"], "Player Four");
    assert_eq!(moderated.overrides["nickname"], "The Champion");
    assert_eq!(moderated.overrides["prefix"], "");
    assert_eq!(moderated.overrides["age"], "29");
    assert_eq!(moderated.aliases, saved_details.aliases);
    assert_eq!(moderated.games[0], saved_details.games[0]);
    assert_eq!(moderated.games[1].characters, ["Jin"]);
    let persisted = db.library_player(&moderated.local_id).unwrap().unwrap();
    assert_eq!(persisted.overrides, moderated.overrides);
    assert_eq!(persisted.games, moderated.games);
    assert_eq!(persisted.aliases, moderated.aliases);
    let mut cleared = moderated.clone();
    cleared.overrides.remove("name");
    cleared.overrides.insert("nickname".into(), "".into());
    cleared.overrides.insert("pronouns".into(), "".into());
    let cleared = db.library_save(cleared).unwrap();
    assert!(cleared.warnings.is_empty());
    assert_eq!(cleared.player.overrides["nickname"], "");
    assert_eq!(cleared.player.overrides["pronouns"], "");
    let moderated = cleared.player;
    let mut missing_tag = moderated.clone();
    missing_tag
        .overrides
        .insert("name".into(), (*blocked).into());
    missing_tag.overrides.insert("age".into(), "30".into());
    let kept_tag = db.library_save(missing_tag).unwrap();
    assert!(!kept_tag.player.overrides.contains_key("name"));
    assert_eq!(
        kept_tag
            .player
            .text("name", Some(&kept_tag.player.imported.name)),
        Some(moderated.imported.name.clone())
    );
    assert_eq!(kept_tag.player.overrides["age"], "30");
    assert_eq!(kept_tag.warnings[0].field, "name");
    let moderated = kept_tag.player;
    let mut new_invalid = moderated.clone();
    new_invalid.local_id = "e".repeat(32);
    new_invalid.player_id = None;
    new_invalid.imported.name.clear();
    new_invalid
        .overrides
        .insert("name".into(), (*blocked).into());
    assert_eq!(
        db.library_save(new_invalid).unwrap_err(),
        "players.blockedTag"
    );
    db.library_delete(&moderated.local_id, &moderated.updated_at)
        .unwrap();
    assert!(db.library_resolve(None, Some("400")).unwrap().is_none());
    assert_eq!(db.library_search("Percent_%", 0).unwrap().1, 0);
}

#[test]
fn disk_library_pages_results_and_preserves_refreshed_players_on_reopen() {
    let path = std::env::temp_dir().join(format!(
        "jabs-player-library-{}-{}.sqlite",
        std::process::id(),
        time::OffsetDateTime::now_utc().unix_timestamp_nanos()
    ));
    let db = Database::open(&path).unwrap();
    for first in (1..=300).step_by(50) {
        db.observe_players(
            (first..first + 50)
                .map(|id| (id.to_string(), profile(&format!("Player{id:05}"))))
                .collect(),
        )
        .unwrap();
    }
    let (results, total) = db.library_search("Player002", 0).unwrap();
    assert_eq!(total, 100);
    assert_eq!(results.len(), 50);
    let (next_page, next_total) = db.library_search("Player002", 50).unwrap();
    assert_eq!(next_total, total);
    assert_eq!(next_page.len(), 50);
    assert!(results.iter().all(|first| {
        next_page
            .iter()
            .all(|second| first.local_id != second.local_id)
    }));
    for id in [1, 150, 300] {
        assert!(db
            .library_resolve(None, Some(&id.to_string()))
            .unwrap()
            .is_some());
    }
    assert_eq!(
        db.observe_players(
            (1..=256)
                .map(|id| (id.to_string(), profile("Returning")))
                .collect()
        )
        .unwrap(),
        0
    );
    drop(db);
    let reopened = Database::open(&path).unwrap();
    assert_eq!(reopened.library_search("", 0).unwrap().1, 300);
    assert_eq!(reopened.library_search("Returning", 0).unwrap().1, 256);
    assert!(matches!(
        reopened
            .connection
            .lock()
            .unwrap()
            .query_row("PRAGMA foreign_key_check", [], |_| Ok(())),
        Err(rusqlite::Error::QueryReturnedNoRows)
    ));
    drop(reopened);
    std::fs::remove_file(path).unwrap();
}

#[test]
fn profile_lookup_reuses_saved_identities_and_rejects_invalid_or_mismatched_profiles() {
    use super::lookup::{find_with, Reference};
    use serde_json::json;
    for (input, expected) in [
        (" 00100 ", Reference::PlayerId("100".into())),
        ("a1b2c3d4", Reference::ProfileSlug("user/a1b2c3d4".into())),
        (
            "user/a1b2c3d4",
            Reference::ProfileSlug("user/a1b2c3d4".into()),
        ),
        (
            "https://www.start.gg/user/A1B2C3D4/about?utm=x%20y#results",
            Reference::ProfileSlug("user/a1b2c3d4".into()),
        ),
        (
            "start.gg/user/12345678/",
            Reference::ProfileSlug("user/12345678".into()),
        ),
    ] {
        assert_eq!(Reference::parse(input).unwrap(), expected);
    }
    for invalid in [
        "",
        "0",
        "https://start.gg.evil.test/user/a1b2",
        "https://evil.test/user/a1b2",
        "file:///user/a1b2",
        "https://name:secret@start.gg/user/a1b2",
        "https://start.gg:9000/user/a1b2",
        "https://start.gg/a1b2",
        "https://start.gg/user/a1%2Fb2",
        "https://start.gg/tournament/weekly/event/sf6",
    ] {
        assert_eq!(
            Reference::parse(invalid).unwrap_err().code,
            "player-reference"
        );
    }
    let db = Database::open(Path::new(":memory:")).unwrap();
    tokio::runtime::Runtime::new().unwrap().block_on(async {
        let response = json!({"user": {"slug":"user/a1b2c3d4", "genderPronoun":"they/them", "location":{"country":"JP"},
            "authorizations":[{"externalUsername":"@Handle"}], "player":{"id":100,"gamerTag":"SameTag","prefix":"Team"}}});
        let found = find_with(&db, "https://start.gg/user/a1b2c3d4", |_| async { Ok(response.clone()) }).await.unwrap();
        assert_eq!(found.source, "startgg");
        assert_eq!(found.player.imported.x_handle.as_deref(), Some("Handle"));
        assert_eq!(found.player.imported.pronouns.as_deref(), Some("they/them"));
        let mut edited = found.player;
        edited.overrides.insert("prefix".into(), "Local sponsor".into());
        edited.games = vec![game("street-fighter-6", "JP")];
        let saved = db.library_save(edited).unwrap().player;
        for reference in ["100", "user/a1b2c3d4", "a1b2c3d4"] {
            let cached = find_with(&db, reference, |_| async { Err(jabs_startgg_client::api_error("Offline", "network")) }).await.unwrap();
            assert_eq!(cached.source, "local");
            assert_eq!(cached.player.local_id, saved.local_id);
            assert_eq!(cached.player.games, saved.games);
            assert_eq!(cached.player.overrides, saved.overrides);
        }
        let wrong_player = json!({"player":{"id":999,"gamerTag":"SameTag"}});
        assert_eq!(find_with(&db, "101", |_| async { Ok(wrong_player) }).await.err().unwrap().code, "invalid-response");
        assert_eq!(find_with(&db, "https://start.gg/user/ffffffff", |_| async { Ok(response.clone()) }).await.err().unwrap().code, "invalid-response");
        assert_eq!(find_with(&db, "101", |_| async { Ok(json!({"player":null})) }).await.err().unwrap().code, "player-not-found");
        assert_eq!(find_with(&db, "102", |_| async { Err(jabs_startgg_client::api_error("Public access failed", "anonymous-unavailable")) }).await.err().unwrap().code, "anonymous-unavailable");
        assert_eq!(db.library_search("", 0).unwrap().1, 1);
        let no_account = find_with(&db, "101", |_| async { Ok(json!({"player":{"id":101,"gamerTag":"SameTag","user":null}})) }).await.unwrap();
        assert_ne!(no_account.player.local_id, saved.local_id);
        assert!(no_account.player.imported.profile_slug.is_none());
        // A concurrent event import can discover the player while the profile request is in flight.
        let raced = find_with(&db, "103", |_| async {
            db.observe_players(vec![("103".into(), profile("Encountered first"))]).unwrap();
            let mut existing = db.library_resolve(None, Some("103")).unwrap().unwrap();
            existing.games = vec![game("tekken-8", "Nina")]; db.library_save(existing).unwrap();
            Ok(json!({"player":{"id":103,"gamerTag":"Fetched later","user":null}}))
        }).await.unwrap();
        assert_eq!(raced.player.games, vec![game("tekken-8", "Nina")]);
        assert_eq!(db.library_search("", 0).unwrap().1, 3);
        let mut duplicate_url = profile("Old account association");
        duplicate_url.profile_slug = Some("user/a1b2c3d4".into());
        db.observe_players(vec![("103".into(), duplicate_url)]).unwrap();
        assert!(db.library_profile_slug("user/a1b2c3d4").unwrap().is_none());
        let authoritative = find_with(&db, "user/a1b2c3d4", |_| async { Ok(response.clone()) }).await.unwrap();
        assert_eq!(authoritative.source, "startgg");
        assert_eq!(authoritative.player.local_id, saved.local_id);
        assert_eq!(authoritative.player.overrides, saved.overrides);
        assert_eq!(authoritative.player.games, saved.games);
        assert_eq!(db.library_search("", 0).unwrap().1, 3);
        db.observe_players(vec![("104".into(), profile(""))]).unwrap();
        let mut incomplete = db.library_resolve(None, Some("104")).unwrap().unwrap();
        assert_eq!(incomplete.imported.name, "Player #104");
        incomplete.games = vec![game("street-fighter-6", "Cammy")];
        incomplete.overrides.insert("nickname".into(), "The Champion".into());
        let incomplete = db.library_save(incomplete).unwrap().player;
        let offline = find_with(&db, "104", |_| async {
            Err(jabs_startgg_client::api_error("Offline", "network"))
        }).await.unwrap();
        assert_eq!(offline.source, "local");
        assert_eq!(offline.player.games, incomplete.games);
        let recovered = find_with(&db, "104", |_| async {
            Ok(json!({"player":{"id":104,"gamerTag":"Fetched later","prefix":"Team","user":null}}))
        }).await.unwrap();
        assert_eq!(recovered.source, "startgg");
        assert_eq!(recovered.player.local_id, incomplete.local_id);
        assert_eq!(recovered.player.imported.name, "Fetched later");
        assert_eq!(recovered.player.overrides, incomplete.overrides);
        assert_eq!(recovered.player.games, incomplete.games);
        assert_eq!(db.library_resolve(None, Some("104")).unwrap().unwrap().imported.name, "Fetched later");
    });
}
