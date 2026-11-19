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
            for name in ["Cammy.webp", "Cammy_2.webp", "Cammy_3.webp", "Cammy_4.webp", "Ryu.webp"] {
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
        settings.mirror_character_placement = false;
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
fn character_framing_is_shared_across_players_but_scoped_to_side_artwork_game_and_layout() {
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
        MediaTransform::default()
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
fn mirrored_framing_waits_until_the_same_artwork_is_used_on_the_other_side() {
    let mut fixture = Fixture::new();
    let mut settings = fixture.settings();
    settings.mirror_character_placement = true;
    settings.media_placements[0].character.x = 0.25;
    settings.media_placements[0].character.y = -0.15;
    settings.media_placements[0].character.scale = 1.4;
    let mut other_artwork = settings.media_placements[1].clone();
    other_artwork.character.flipped = true;
    fixture.store.replace(&fixture.database, settings).unwrap();
    assert_eq!(fixture.settings().media_placements[1], other_artwork);

    let mut selected = fixture.selected.clone();
    selected.player_two.character = Some("Cammy".into());
    selected.player_two.characters = vec!["Cammy".into()];
    selected.player_two.character_asset_id = Some("Cammy_2.webp".into());
    fixture.select(selected.clone());
    assert_eq!(fixture.settings().media_placements[1].character,
        MediaTransform { flipped: true, ..MediaTransform::default() });

    let mut cached = fixture.settings();
    cached.media_placements[1].character.flipped = false;
    fixture.database.save_broadcast_surface(
        SURFACE_ID, &serde_json::to_string(&cached).unwrap(), &cached.updated_at,
    ).unwrap();
    let mut fixture = fixture.reopen();
    fixture.select(selected.clone());
    assert!(fixture.settings().media_placements[1].character.flipped);

    let mut compact = fixture.settings();
    compact.information_layout = "compact".into();
    fixture.store.replace(&fixture.database, compact).unwrap();
    let mut standard = fixture.settings();
    standard.information_layout = "standard".into();
    fixture.store.replace(&fixture.database, standard).unwrap();

    let mut matching = selected.clone();
    matching.player_one.character_asset_id = selected.player_two.character_asset_id.clone();
    fixture.select(matching);
    assert!(fixture.settings().media_placements[1].character.flipped);
    let mut compact = fixture.settings();
    compact.information_layout = "compact".into();
    fixture.store.replace(&fixture.database, compact).unwrap();
    assert!(fixture.settings().media_placements[1].character.flipped);
    let mut standard = fixture.settings();
    standard.information_layout = "standard".into();
    fixture.store.replace(&fixture.database, standard).unwrap();
    fixture.select(selected.clone());
    assert!(fixture.settings().media_placements[1].character.flipped);

    selected.player_two.character_asset_id = None;
    fixture.select(selected);
    let right = fixture.settings().media_placements[1].character.clone();
    assert_eq!((right.x, right.y, right.scale, right.flipped), (-0.25, -0.15, 1.4, true));

    let mut new_match = fixture.selected.clone();
    new_match.set_id = Some("900".into());
    new_match.player_one.character = Some("Ryu".into());
    new_match.player_one.characters = vec!["Ryu".into()];
    fixture.select(new_match);
    assert_eq!(fixture.settings().media_placements[1].character, right);
    fixture.close();
}

#[test]
fn sharing_versus_framing_preserves_existing_variant_edits_until_selected() {
    use crate::character_framing_groups::{GroupEdit, save};

    let mut fixture = Fixture::new();
    let mut anchor = fixture.selected.clone();
    anchor.set_id = Some("400".into());
    let mut variant = anchor.clone();
    variant.set_id = Some("500".into());
    variant.player_one.character_asset_id = Some("Cammy_2.webp".into());
    for id in ["400", "500"] {
        fixture.database.save_stream_state("{}", &now_rfc3339().unwrap(), Some((id, "{}"))).unwrap();
    }
    fixture.select(variant.clone());
    let mut settings = fixture.settings();
    settings.media_placements[0].character.x = -0.2;
    fixture.store.replace(&fixture.database, settings).unwrap();

    fixture.select(anchor.clone());
    let mut settings = fixture.settings();
    settings.media_placements[0].character.x = 0.3;
    settings.media_placements[0].character.flipped = true;
    fixture.store.replace(&fixture.database, settings).unwrap();
    let game = "street-fighter-6";
    let assets = crate::catalogs::list_game_character_assets(&fixture.root, game).unwrap();
    let mut group = GroupEdit {
        number: None,
        anchor: "Cammy.webp".into(),
        members: vec!["Cammy_2.webp".into()],
        use_shared_for_adjusted: false,
    };
    let groups = save(&fixture.database, game, &assets, group.clone()).unwrap();
    group.number = Some(groups[0].number);
    fixture.select(variant);
    assert_eq!(fixture.settings().media_placements[0].character.x, -0.2);

    group.use_shared_for_adjusted = true;
    save(&fixture.database, game, &assets, group.clone()).unwrap();
    fixture.store.refresh_character_groups(&fixture.database, game).unwrap();
    assert_eq!(fixture.settings().media_placements[0].character.x, 0.3);
    assert!(!fixture.settings().media_placements[0].character.flipped);
    let mut settings = fixture.settings();
    settings.media_placements[0].character.x = 0.4;
    fixture.store.replace(&fixture.database, settings).unwrap();

    group.use_shared_for_adjusted = false;
    save(&fixture.database, game, &assets, group).unwrap();
    fixture.store.refresh_character_groups(&fixture.database, game).unwrap();
    assert_eq!(fixture.settings().media_placements[0].character.x, -0.2);
    fixture.select(anchor);
    assert_eq!(fixture.settings().media_placements[0].character.x, 0.4);
    assert!(fixture.settings().media_placements[0].character.flipped);
    fixture.close();
}

#[test]
fn grouped_versus_artwork_mirrors_position_but_keeps_private_flips() {
    use crate::character_framing_groups::{GroupEdit, load, save};

    let mut fixture = Fixture::new();
    let game = "street-fighter-6";
    let mut paired = fixture.selected.clone();
    paired.player_two.character = Some("Cammy".into());
    paired.player_two.characters = vec!["Cammy".into()];
    fixture.select(paired.clone());
    let mut settings = fixture.settings();
    settings.mirror_character_placement = true;
    fixture.store.replace(&fixture.database, settings).unwrap();
    let before_grouping = fixture.settings().media_placements;
    assert!(before_grouping[1].character.flipped);

    let assets = crate::catalogs::list_game_character_assets(&fixture.root, game).unwrap();
    let mut group = GroupEdit {
        number: None,
        anchor: "Cammy.webp".into(),
        members: vec!["Cammy_2.webp".into()],
        use_shared_for_adjusted: true,
    };
    let groups = save(&fixture.database, game, &assets, group.clone()).unwrap();
    group.number = Some(groups[0].number);
    fixture.store.refresh_character_groups(&fixture.database, game).unwrap();
    assert_eq!(fixture.settings().media_placements, before_grouping);

    paired.player_two.character_asset_id = Some("Cammy_2.webp".into());
    fixture.select(paired.clone());
    let mut settings = fixture.settings();
    assert!(settings.media_placements[1].character.flipped);
    settings.media_placements[1].character.flipped = false;
    fixture.store.replace(&fixture.database, settings).unwrap();
    let mut settings = fixture.settings();
    settings.media_placements[0].character.x = 0.3;
    settings.media_placements[0].character.scale = 1.4;
    fixture.store.replace(&fixture.database, settings).unwrap();

    let [left, right] = fixture.settings().media_placements;
    assert!(!left.character.flipped);
    assert!(!right.character.flipped);
    assert_eq!(right.character.x, -0.3);
    assert_eq!(right.character.scale, 1.4);
    let mut other_match = paired.clone();
    other_match.set_id = Some("701".into());
    other_match.player_two.character_asset_id = None;
    fixture.select(other_match);
    assert!(fixture.settings().media_placements[1].character.flipped);
    fixture = fixture.reopen();
    fixture.select(paired.clone());
    assert_eq!(fixture.settings().media_placements[1].character, right.character);

    group.members.clear();
    save(&fixture.database, game, &assets, group).unwrap();
    fixture.store.refresh_character_groups(&fixture.database, game).unwrap();
    assert!(load(&fixture.database, game).unwrap().is_empty());
    assert_eq!(fixture.settings().media_placements[1].character, MediaTransform::default());
    paired.player_two.character_asset_id = None;
    fixture.select(paired);
    assert_eq!(fixture.settings().media_placements[1].character, MediaTransform {
        flipped: true, ..right.character
    });
    fixture.close();
}

#[test]
fn moving_a_group_reference_keeps_the_old_number_and_framing() {
    use crate::character_framing_groups::{GroupEdit, load, save};

    let mut fixture = Fixture::new();
    let game = "street-fighter-6";
    let assets = crate::catalogs::list_game_character_assets(&fixture.root, game).unwrap();
    let anchor = "Cammy.webp";
    let remaining = "Cammy_2.webp";
    let destination = "Cammy_3.webp";
    let mut settings = fixture.settings();
    settings.media_placements[0].character.x = 0.35;
    settings.media_placements[0].character.flipped = true;
    fixture.store.replace(&fixture.database, settings).unwrap();

    let renderer_key = serde_json::json!(["stats", game, "character", "Cammy", anchor]).to_string();
    let renderer_placement = serde_json::json!({ "x": 0.4, "y": 0, "scale": 1.2, "flipped": true });
    let mut framing = crate::artwork_framing::ArtworkFraming::new();
    framing.insert(renderer_key, serde_json::from_value(renderer_placement).unwrap());
    fixture.database.save_broadcast_surface(
        "player-stats", &serde_json::json!({ "artworkFraming": framing }).to_string(), "fixture",
    ).unwrap();

    // A pre-upgrade group has no number, so its first load assigns one.
    fixture.database.save_broadcast_surface(
        "character-framing-groups:street-fighter-6",
        &serde_json::json!([{ "anchor": anchor, "members": [remaining] }]).to_string(),
        "fixture",
    ).unwrap();
    let old_number = load(&fixture.database, game).unwrap()[0].number;
    let groups = save(&fixture.database, game, &assets, GroupEdit {
        number: None, anchor: destination.into(), members: vec!["Cammy_4.webp".into()], use_shared_for_adjusted: true,
    }).unwrap();
    let destination_number = groups[1].number;
    let groups = save(&fixture.database, game, &assets, GroupEdit {
        number: Some(destination_number), anchor: destination.into(), members: vec!["Cammy_4.webp".into(), anchor.into()], use_shared_for_adjusted: true,
    }).unwrap();
    assert_eq!(groups[0].number, old_number);
    assert_eq!(groups[0].anchor, remaining);
    assert_eq!(groups[1].number, destination_number);
    assert!(groups[1].members.iter().any(|id| id == anchor));
    let moved_key = serde_json::json!(["stats", game, "character", "Cammy", groups[0].framing_source()]).to_string();
    assert_eq!(groups[0].framing_snapshot[&moved_key].x, 0.4);
    assert!(!groups[0].framing_snapshot[&moved_key].flipped);

    fixture.store.refresh_character_groups(&fixture.database, game).unwrap();
    assert_eq!(fixture.settings().media_placements[0].character.x, 0.0);
    assert!(fixture.settings().media_placements[0].character.flipped);
    let mut settings = fixture.settings();
    settings.media_placements[0].character.x = -0.25;
    fixture.store.replace(&fixture.database, settings).unwrap();
    let mut other = fixture.selected.clone();
    other.player_one.character_asset_id = Some(remaining.into());
    fixture.select(other);
    assert_eq!(fixture.settings().media_placements[0].character.x, 0.35);
    assert!(!fixture.settings().media_placements[0].character.flipped);

    let groups = save(&fixture.database, game, &assets, GroupEdit {
        number: Some(destination_number),
        anchor: destination.into(),
        members: vec!["Cammy_4.webp".into(), anchor.into(), remaining.into()],
        use_shared_for_adjusted: true,
    }).unwrap();
    assert_eq!(groups.len(), 1);
    assert_eq!(groups[0].number, destination_number);

    let groups = save(&fixture.database, game, &assets, GroupEdit {
        number: None,
        anchor: anchor.into(),
        members: vec![remaining.into()],
        use_shared_for_adjusted: true,
    }).unwrap();
    assert!(groups.iter().all(|group| group.number != old_number));
    assert!(groups.iter().any(|group| group.number > destination_number));
    fixture.close();
}

#[test]
fn character_mirroring_is_optional_and_preserves_photos_after_restart() {
    for mirror in [false, true] {
        let mut fixture = Fixture::new();
        let mut selected = fixture.selected.clone();
        selected.player_two.character = Some("Cammy".into());
        selected.player_two.characters = vec!["Cammy".into()];
        fixture.select(selected);
        let mut settings = fixture.settings();
        settings.mirror_character_placement = mirror;
        settings.media_placements[1].character.flipped = true;
        settings.media_placements[1].photo.x = 0.1;
        fixture.store.replace(&fixture.database, settings).unwrap();
        let mut right = fixture.settings().media_placements[1].clone();

        let mut settings = fixture.settings();
        settings.media_placements[0].character = MediaTransform {
            x: 0.25, y: -0.15, scale: 1.4, flipped: false,
        };
        fixture.store.replace(&fixture.database, settings).unwrap();
        if mirror {
            right.character.x = -0.25;
            right.character.y = -0.15;
            right.character.scale = 1.4;
        }
        assert_eq!(fixture.settings().media_placements[1], right);
        let mut left = fixture.settings().media_placements[0].clone();

        let mut settings = fixture.settings();
        settings.media_placements[1].character.x = -0.3;
        settings.media_placements[1].character.scale = 1.8;
        fixture.store.replace(&fixture.database, settings).unwrap();
        if mirror {
            left.character.x = 0.3;
            left.character.scale = 1.8;
        }
        assert_eq!(fixture.settings().media_placements[0], left);

        let mut settings = fixture.settings();
        settings.media_placements[1].character.flipped = false;
        fixture.store.replace(&fixture.database, settings).unwrap();
        assert_eq!(fixture.settings().media_placements[0].character.flipped, mirror);
        let expected = fixture.settings().media_placements.clone();

        fixture = fixture.reopen();
        assert_eq!(fixture.settings().mirror_character_placement, mirror);
        let mut guests = fixture.selected.clone();
        guests.player_one.player_id = None;
        guests.player_one.name = "Guest One".into();
        guests.player_two.player_id = None;
        guests.player_two.name = "Guest Two".into();
        fixture.select(guests);
        assert_eq!(fixture.settings().media_placements[0].character, expected[0].character);
        assert_eq!(fixture.settings().media_placements[1].character, expected[1].character);

        let expected = fixture.settings().media_placements.clone();
        let mut settings = fixture.settings();
        settings.mirror_character_placement = false;
        fixture.store.replace(&fixture.database, settings).unwrap();
        let manual = fixture.settings().media_placements.clone();
        if mirror {
            assert_eq!(manual[0].character, MediaTransform::default());
            assert_eq!(manual[1].character, MediaTransform::default());
        } else {
            assert_eq!(manual, expected);
        }
        assert_eq!(manual[1].photo, expected[1].photo);
        let mut settings = fixture.settings();
        settings.media_placements[0].character.x += 0.1;
        fixture.store.replace(&fixture.database, settings).unwrap();
        let edited_manual = fixture.settings().media_placements.clone();
        assert_eq!(edited_manual[1], manual[1]);
        if mirror {
            let mut settings = fixture.settings();
            settings.mirror_character_placement = true;
            fixture.store.replace(&fixture.database, settings).unwrap();
            assert_eq!(fixture.settings().media_placements, expected);
            let mut settings = fixture.settings();
            settings.mirror_character_placement = false;
            fixture.store.replace(&fixture.database, settings).unwrap();
            assert_eq!(fixture.settings().media_placements, edited_manual);
        }
        fixture.close();
    }
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
    assert_eq!(fixture.settings().media_placements[1].character, MediaTransform::default());
    assert_eq!(fixture.settings().media_placements[1].photo.scale, 0.8);
    // A flip on the opposite side remains independent.
    let mut edited = fixture.settings();
    edited.media_placements[1].character.flipped = true;
    fixture.store.replace(&fixture.database, edited).unwrap();
    assert!(!fixture.settings().media_placements[0].character.flipped);
    switch(&fixture, "standard");
    assert_eq!(fixture.settings().media_placements[1].photo.scale, 1.3);
    assert!(!fixture.settings().media_placements[1].character.flipped);
    fixture.close();
}
