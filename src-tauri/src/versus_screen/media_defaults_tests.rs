use super::*;
use crate::{
    player_library::Profile,
    state::{OverlayStore, SelectedSet},
};
use std::path::PathBuf;

struct Fixture {
    root: PathBuf,
    database: Database,
    store: VersusScreenStore,
    selected: SelectedSet,
}

impl Fixture {
    fn new() -> Self {
        let root = std::env::temp_dir().join(format!(
            "jabs-character-defaults-{}-{}",
            std::process::id(),
            time::OffsetDateTime::now_utc().unix_timestamp_nanos()
        ));
        let image = include_bytes!("../../../src/renderer/src/assets/Flag_of_None.webp");
        for catalog in ["street-fighter-6", "custom-fighter"] {
            let artwork = root.join(catalog).join("characters");
            std::fs::create_dir_all(&artwork).unwrap();
            for name in ["Cammy.webp", "Cammy_2.webp", "Ryu.webp"] {
                std::fs::write(artwork.join(name), image).unwrap();
            }
        }
        for name in ["Alpha.webp", "Beta.webp", "alternate.webp"] {
            std::fs::write(root.join(name), image).unwrap();
        }
        let database = Database::open(&root.join("state.sqlite")).unwrap();
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
        let selected = OverlayStore::load(&database)
            .unwrap()
            .selected_set()
            .unwrap();
        let store = VersusScreenStore::load(&database).unwrap();
        let mut settings: VersusScreenState =
            serde_json::from_value(store.current().unwrap()).unwrap();
        settings.media_mode = "combined".into();
        store.replace(&database, settings).unwrap();
        let mut fixture = Self {
            root,
            database,
            store,
            selected,
        };
        let mut exhibition = fixture.selected.clone();
        exhibition.asset_catalog_slug = Some("street-fighter-6".into());
        for (player, id, name, character) in [
            (&mut exhibition.player_one, "101", "Alpha", "Cammy"),
            (&mut exhibition.player_two, "102", "Beta", "Ryu"),
        ] {
            player.player_id = Some(id.into());
            player.name = name.into();
            player.character = Some(character.into());
            player.characters = vec![character.into()];
        }
        fixture.select(exhibition);
        fixture
    }

    fn settings(&self) -> VersusScreenState {
        serde_json::from_value(self.store.current().unwrap()).unwrap()
    }

    fn select(&mut self, selected: SelectedSet) {
        self.store
            .restore_media_for_match_change(
                &self.database,
                &self.selected,
                &selected,
                &self.root,
                &self.root,
            )
            .unwrap();
        self.selected = selected;
    }

    fn reopen(self) -> Self {
        let Self {
            root,
            database,
            store,
            selected,
        } = self;
        drop(store);
        drop(database);
        let database = Database::open(&root.join("state.sqlite")).unwrap();
        let store = VersusScreenStore::load(&database).unwrap();
        Self {
            root,
            database,
            store,
            selected,
        }
    }

    fn close(self) {
        let root = self.root.clone();
        drop(self);
        std::fs::remove_dir_all(root).unwrap();
    }
}

#[test]
fn character_framing_is_shared_across_players_and_sides_but_scoped_to_artwork_game_and_layout() {
    let mut fixture = Fixture::new();
    let alpha = fixture.selected.clone();
    let mut settings = fixture.settings();
    settings.media_placements[0].character = MediaTransform {
        x: 0.2,
        y: -0.1,
        scale: 1.4,
        flipped: true,
    };
    settings.media_placements[0].photo.x = 0.3;
    let framing = settings.media_placements[0].character.clone();
    fixture.store.replace(&fixture.database, settings).unwrap();

    let mut guest = alpha.clone();
    guest.player_one.player_id = None;
    guest.player_one.name = "Guest".into();
    fixture.select(guest.clone());
    assert_eq!(fixture.settings().media_placements[0].character, framing);
    assert_eq!(
        fixture.settings().media_placements[0].photo,
        MediaTransform::default()
    );

    let mut opposite_side = guest.clone();
    opposite_side.player_two.character = Some("Cammy".into());
    opposite_side.player_two.characters = vec!["Cammy".into()];
    fixture.select(opposite_side.clone());
    assert_eq!(
        fixture.settings().media_placements[1].character,
        MediaTransform { x: -framing.x, flipped: false, ..framing.clone() }
    );

    let mut outfit = guest.clone();
    outfit.player_one.character_asset_id = Some("Cammy_2.webp".into());
    fixture.select(outfit);
    assert_eq!(
        fixture.settings().media_placements[0].character,
        MediaTransform::default()
    );

    let mut game = guest.clone();
    game.asset_catalog_slug = Some("custom-fighter".into());
    fixture.select(game);
    assert_eq!(
        fixture.settings().media_placements[0].character,
        MediaTransform::default()
    );
    fixture.select(guest.clone());
    let mut settings = fixture.settings();
    settings.media_mode = "character".into();
    fixture.store.replace(&fixture.database, settings).unwrap();
    assert_eq!(
        fixture.settings().media_placements[0].character,
        MediaTransform::default()
    );
    let mut settings = fixture.settings();
    settings.media_mode = "combined".into();
    fixture.store.replace(&fixture.database, settings).unwrap();
    assert_eq!(fixture.settings().media_placements[0].character, framing);

    // A new player keeps a personal photo adjustment while reusing the character framing.
    let mut beta = guest.clone();
    beta.player_one.player_id = Some("102".into());
    beta.player_one.name = "Beta".into();
    fixture.select(beta.clone());
    let mut settings = fixture.settings();
    settings.media_placements[0].photo.x = -0.2;
    fixture.store.replace(&fixture.database, settings).unwrap();
    fixture.select(alpha.clone());
    assert_eq!(fixture.settings().media_placements[0].photo.x, 0.3);
    fixture.select(beta.clone());
    assert_eq!(fixture.settings().media_placements[0].photo.x, -0.2);
    let mut other_character = beta.clone();
    other_character.player_one.character = Some("Ryu".into());
    other_character.player_one.characters = vec!["Ryu".into()];
    fixture.select(other_character);
    assert_eq!(fixture.settings().media_placements[0].photo.x, -0.2);
    fixture.select(beta);

    fixture = fixture.reopen();
    fixture.select(guest.clone());
    assert_eq!(fixture.settings().media_placements[0].character, framing);
    assert_eq!(
        fixture.settings().media_placements[0].photo,
        MediaTransform::default()
    );
    fixture
        .database
        .connection
        .lock()
        .unwrap()
        .execute(
            "UPDATE versus_character_defaults SET placement = ?1",
            [r#"{"x":0,"y":0,"scale":99,"flipped":false}"#],
        )
        .unwrap();
    guest.player_one.name = "Another guest".into();
    fixture.select(guest);
    assert_eq!(
        fixture.settings().media_placements[0].character,
        MediaTransform::default()
    );
    fixture.close();
}

#[test]
fn upgrade_preserves_legacy_player_overrides_and_photo_edits_do_not_replace_shared_character_defaults()
 {
    let mut fixture = Fixture::new();
    let alpha = fixture.selected.clone();
    let mut personal = PlayerMediaPlacement::default();
    personal.character.scale = 1.8;
    personal.photo.x = 0.25;
    let player = fixture
        .database
        .library_resolve(None, Some("101"))
        .unwrap()
        .unwrap();
    let context = concat!(
        r#"{"catalog":"street-fighter-6","side":0,"mode":"combined","character":"Cammy","characterAssetId":"Cammy.webp","photoAssetId":"Alpha.webp"}"#
    );
    fixture
        .database
        .connection
        .lock()
        .unwrap()
        .execute(
            "INSERT INTO player_versus_media (player_id, context, placement) VALUES (?1, ?2, ?3)",
            rusqlite::params![
                player.local_id,
                context,
                serde_json::to_string(&personal).unwrap()
            ],
        )
        .unwrap();
    fixture
        .database
        .connection
        .lock()
        .unwrap()
        .execute_batch("DROP TABLE versus_character_defaults")
        .unwrap();
    fixture = fixture.reopen(); // The upgrade creates only the missing table.

    let mut guest = alpha.clone();
    guest.player_one.player_id = None;
    guest.player_one.name = "Guest".into();
    fixture.select(guest.clone());
    let mut settings = fixture.settings();
    settings.media_placements[0].character.scale = 1.3;
    fixture.store.replace(&fixture.database, settings).unwrap();
    fixture.select(alpha.clone());
    assert_eq!(fixture.settings().media_placements[0], personal);

    let mut settings = fixture.settings();
    settings.media_placements[0].photo.y = -0.2;
    personal.photo.y = -0.2;
    fixture.store.replace(&fixture.database, settings).unwrap();
    fixture.select(guest.clone());
    assert_eq!(fixture.settings().media_placements[0].character.scale, 1.3);
    assert_eq!(
        fixture.settings().media_placements[0].photo,
        MediaTransform::default()
    );
    fixture.select(alpha.clone());
    assert_eq!(fixture.settings().media_placements[0], personal);

    let mut settings = fixture.settings();
    settings.media_placements[0].character.scale = 1.6;
    personal.character.scale = 1.6;
    fixture.store.replace(&fixture.database, settings).unwrap();
    fixture.select(guest);
    assert_eq!(fixture.settings().media_placements[0].character.scale, 1.6);
    fixture = fixture.reopen();
    fixture.select(alpha);
    assert_eq!(fixture.settings().media_placements[0], personal);
    fixture.close();
}

#[test]
fn choosing_a_missing_character_restores_its_layout_without_changing_the_other_player() {
    let mut fixture = Fixture::new();
    let mut selected = fixture.selected.clone();
    selected.player_one.character = None;
    selected.player_one.characters.clear();
    for player in [&mut selected.player_one, &mut selected.player_two] {
        player.player_id = None;
        player.local_player_id = None;
    }
    fixture.select(selected.clone());
    fixture.store.reset_media_placements(&fixture.database).unwrap();
    let mut settings = fixture.settings();
    settings.media_placements[0].photo.x = 0.31;
    settings.media_placements[0].photo.scale = 1.2;
    settings.media_placements[1].photo.y = -0.23;
    settings.media_placements[1].photo.scale = 1.4;
    settings.media_placements[1].character.x = -0.32;
    settings.media_placements[1].character.scale = 1.6;
    let expected = settings.media_placements.clone();
    fixture.store.replace(&fixture.database, settings).unwrap();

    selected.player_one.character = Some("Cammy".into());
    selected.player_one.characters = vec!["Cammy".into()];
    fixture.select(selected.clone());
    assert_eq!(fixture.settings().media_placements[0].photo, MediaTransform::default());
    assert_eq!(fixture.settings().media_placements[1], expected[1]);

    selected.player_one.player_photo_asset_id = Some("alternate.webp".into());
    fixture.select(selected);
    assert_eq!(fixture.settings().media_placements[1], expected[1]);
    assert_eq!(fixture.settings().media_placements[0].photo, MediaTransform::default());
    fixture.close();
}

#[test]
fn character_framing_mirrors_both_ways_while_flip_and_photos_stay_independent() {
    let mut fixture = Fixture::new();
    let mut selected = fixture.selected.clone();
    selected.player_two.character = Some("Cammy".into());
    selected.player_two.characters = vec!["Cammy".into()];
    fixture.select(selected);
    let mut settings = fixture.settings();
    settings.media_placements[1].character.flipped = true;
    settings.media_placements[1].photo.x = 0.1;
    fixture.store.replace(&fixture.database, settings).unwrap();
    let mut settings = fixture.settings();
    settings.media_placements[0].character.x = 0.25;
    settings.media_placements[0].character.y = -0.15;
    settings.media_placements[0].character.scale = 1.4;
    fixture.store.replace(&fixture.database, settings).unwrap();
    let settings = fixture.settings();
    assert_eq!(settings.media_placements[1].character, MediaTransform {
        x: -0.25, y: -0.15, scale: 1.4, flipped: true,
    });
    assert!(!settings.media_placements[0].character.flipped);
    assert_eq!(settings.media_placements[1].photo.x, 0.1);
    let mut settings = settings;
    settings.media_placements[1].character.x = -0.3;
    settings.media_placements[1].character.scale = 1.8;
    fixture.store.replace(&fixture.database, settings).unwrap();
    let settings = fixture.settings();
    assert_eq!(settings.media_placements[0].character.x, 0.3);
    assert_eq!(settings.media_placements[0].character.scale, 1.8);
    assert!(!settings.media_placements[0].character.flipped);
    let mut settings = settings;
    settings.media_placements[0].character.flipped = true;
    fixture.store.replace(&fixture.database, settings).unwrap();
    assert!(fixture.settings().media_placements[1].character.flipped);
    fixture = fixture.reopen();
    let mut guests = fixture.selected.clone();
    guests.player_one.player_id = None;
    guests.player_one.name = "Guest One".into();
    guests.player_two.player_id = None;
    guests.player_two.name = "Guest Two".into();
    fixture.select(guests);
    assert_eq!(fixture.settings().media_placements[0].character.scale, 1.8);
    assert_eq!(fixture.settings().media_placements[1].character.scale, 1.8);
    assert_eq!(fixture.settings().media_placements[0].character.x, 0.3);
    assert_eq!(fixture.settings().media_placements[1].character.x, -0.3);
    assert!(fixture.settings().media_placements[0].character.flipped);
    assert!(fixture.settings().media_placements[1].character.flipped);
    fixture.close();
}

#[test]
fn missing_character_uses_photo_framing_until_combined_artwork_is_available() {
    let mut fixture = Fixture::new();
    let combined = fixture.selected.clone();
    let mut settings = fixture.settings();
    settings.media_placements[0].photo.x = 0.2;
    settings.media_placements[0].photo.scale = 1.4;
    fixture.store.replace(&fixture.database, settings).unwrap();
    let mut photo_only = combined.clone();
    photo_only.player_one.character = None;
    photo_only.player_one.characters.clear();
    fixture.select(photo_only.clone());
    assert_eq!(fixture.settings().media_placements[0].photo, MediaTransform::default());
    let mut settings = fixture.settings();
    settings.media_placements[0].photo.x = -0.3;
    settings.media_placements[0].photo.scale = 1.8;
    fixture.store.replace(&fixture.database, settings).unwrap();
    fixture.select(combined.clone());
    assert_eq!(fixture.settings().media_placements[0].photo.x, 0.2);
    assert_eq!(fixture.settings().media_placements[0].photo.scale, 1.4);
    fixture.select(photo_only);
    assert_eq!(fixture.settings().media_placements[0].photo.x, -0.3);
    assert_eq!(fixture.settings().media_placements[0].photo.scale, 1.8);
    fixture = fixture.reopen();
    fixture.select(combined);
    assert_eq!(fixture.settings().media_placements[0].photo.scale, 1.4);
    fixture.close();
}

#[test]
fn information_layouts_keep_settings_and_framing_separate_across_matches_and_restart() {
    let mut fixture = Fixture::new();
    // Include match-specific framing, in addition to reusable character and photo defaults.
    fixture.database.connection.lock().unwrap().execute(
        "INSERT INTO set_overrides (set_id, payload, updated_at) VALUES ('layout-test', '{}', ?1)",
        [now_rfc3339().unwrap()],
    ).unwrap();
    let mut selected = fixture.selected.clone();
    selected.set_id = Some("layout-test".into());
    fixture.select(selected.clone());
    let mut standard = fixture.settings();
    standard.media_placements[0].character = MediaTransform {
        x: 0.2, y: -0.1, scale: 1.4, flipped: true,
    };
    standard.media_placements[1].photo.scale = 1.3;
    standard.show_background = false;
    standard.show_scrolling_rails = false;
    standard.stat_rows = vec!["main".into()];
    let standard_framing = standard.media_placements.clone();
    fixture.store.replace(&fixture.database, standard).unwrap();

    // Older match records omitted the composition key and belong only to Standard.
    let payload = fixture.database.load_set_versus_media("layout-test").unwrap().unwrap();
    let mut legacy: Value = serde_json::from_str(&payload).unwrap();
    legacy["layouts"][0].as_object_mut().unwrap().remove("mediaMode");
    fixture.database.connection.lock().unwrap().execute(
        "UPDATE set_overrides SET versus_media = ?1 WHERE set_id = 'layout-test'",
        [legacy.to_string()],
    ).unwrap();

    let switch = |fixture: &Fixture, layout: &str| {
        let mut settings = fixture.settings();
        settings.information_layout = layout.into();
        fixture.store.replace(&fixture.database, settings).unwrap();
    };
    switch(&fixture, "compact");
    assert_eq!(fixture.settings().media_placements, default_media_placements());
    let mut compact = fixture.settings();
    compact.media_placements[0].character = MediaTransform {
        x: -0.3, y: 0.1, scale: 1.8, flipped: false,
    };
    compact.media_placements[1].photo.scale = 0.8;
    compact.show_background = true;
    compact.show_scrolling_rails = true;
    compact.stat_rows = vec!["pronouns".into()];
    let compact_framing = compact.media_placements.clone();
    fixture.store.replace(&fixture.database, compact).unwrap();
    let saved: Value = serde_json::from_str(
        &fixture.database.load_set_versus_media("layout-test").unwrap().unwrap(),
    ).unwrap();
    assert!(saved["layouts"].as_array().unwrap().iter().any(|layout| layout["mediaMode"].is_null()));
    switch(&fixture, "standard");
    assert_eq!(fixture.settings().media_placements, standard_framing);
    assert!(!fixture.settings().show_background);
    assert!(!fixture.settings().show_scrolling_rails);
    assert_eq!(fixture.settings().stat_rows, ["main"]);
    switch(&fixture, "compact");
    assert_eq!(fixture.settings().media_placements, compact_framing);
    assert!(fixture.settings().show_background);
    assert!(fixture.settings().show_scrolling_rails);
    assert_eq!(fixture.settings().stat_rows, ["pronouns"]);

    fixture = fixture.reopen();
    fixture.select(selected.clone());
    assert!(fixture.settings().show_scrolling_rails);
    assert_eq!(fixture.settings().media_placements, compact_framing);
    switch(&fixture, "standard");
    assert!(!fixture.settings().show_scrolling_rails);
    assert_eq!(fixture.settings().media_placements, standard_framing);

    // A new match reuses only defaults belonging to the selected information layout.
    selected.set_id = None;
    selected.player_one.player_id = None;
    selected.player_one.name = "Guest".into();
    selected.player_two.character = Some("Cammy".into());
    selected.player_two.characters = vec!["Cammy".into()];
    fixture.select(selected.clone());
    assert_eq!(fixture.settings().media_placements[0].character, standard_framing[0].character);
    assert_eq!(fixture.settings().media_placements[0].photo, MediaTransform::default());
    switch(&fixture, "compact");
    let mirrored = fixture.settings().media_placements[1].character.clone();
    assert_eq!(mirrored.x, -compact_framing[0].character.x);
    assert_eq!(mirrored.scale, compact_framing[0].character.scale);
    assert!(!mirrored.flipped);
    assert_eq!(fixture.settings().media_placements[1].photo.scale, 0.8);
    // A flip on the opposite side remains independent of the shared geometry.
    let mut edited = fixture.settings();
    edited.media_placements[1].character.flipped = true;
    fixture.store.replace(&fixture.database, edited).unwrap();
    assert!(!fixture.settings().media_placements[0].character.flipped);
    switch(&fixture, "standard");
    assert_eq!(fixture.settings().media_placements[1].photo.scale, 1.3);
    assert!(!fixture.settings().media_placements[1].character.flipped);
    fixture.close();
}
