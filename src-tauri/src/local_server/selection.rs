use crate::{database::Database, state::SelectedSet};
use std::path::Path;

/// Restore match progress first, then apply the latest reusable player preferences.
pub(super) fn apply_player_preferences(
    database: &Database,
    game_asset_directory: &Path,
    fresh: &mut SelectedSet,
    restore_overrides: bool,
) -> Result<(), String> {
    super::reconcile_imported_characters(fresh, game_asset_directory);
    if restore_overrides {
        if let Some(set_id) = fresh.set_id.as_deref() {
            let saved = database
                .load_set_override(set_id)?
                .and_then(|payload| {
                    serde_json::from_str::<crate::state::SelectedSet>(&payload).ok()
                })
                .map(|mut saved| {
                    crate::state::migrate_match_format(&mut saved);
                    saved
                })
                .filter(|saved| crate::state::validate_selected_set(saved).is_ok());
            if let Some(mut saved) = saved {
                saved.game_id = fresh.game_id.clone();
                saved.game_name = fresh.game_name.clone().or(saved.game_name);
                let fresh_players = [&fresh.player_one, &fresh.player_two];
                saved.player_one.player_id = fresh_players
                    .iter()
                    .find(|player| player.entrant_id == saved.player_one.entrant_id)
                    .and_then(|player| player.player_id.clone());
                saved.player_two.player_id = fresh_players
                    .iter()
                    .find(|player| player.entrant_id == saved.player_two.entrant_id)
                    .and_then(|player| player.player_id.clone());
                saved.player_one.local_player_id = fresh_players
                    .iter()
                    .find(|player| player.entrant_id == saved.player_one.entrant_id)
                    .and_then(|player| player.local_player_id.clone());
                saved.player_two.local_player_id = fresh_players
                    .iter()
                    .find(|player| player.entrant_id == saved.player_two.entrant_id)
                    .and_then(|player| player.local_player_id.clone());
                saved.set_id = fresh.set_id.clone();
                saved.phase = fresh.phase.clone();
                saved.phase_group = fresh.phase_group.clone();
                saved.winners_side_entrant_id = fresh.winners_side_entrant_id.clone();
                saved.event_id = fresh.event_id.clone().or(saved.event_id);
                saved.tournament_slug = fresh.tournament_slug.clone().or(saved.tournament_slug);
                saved.tournament_name = fresh.tournament_name.clone().or(saved.tournament_name);
                saved.asset_catalog_slug = fresh
                    .asset_catalog_slug
                    .clone()
                    .or(saved.asset_catalog_slug);
                *fresh = saved;
            }
        }
    }
    crate::player_library::startgg::fill_defaults(database, fresh)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::player_library::{GamePreferences, Profile};
    use crate::state::OverlayStore;

    #[test]
    fn saved_match_progress_uses_latest_library_preferences_by_identity_and_game() {
        let database = Database::open(Path::new(":memory:")).unwrap();
        database
            .observe_players(vec![(
                "1".into(),
                Profile {
                    name: "Alpha".into(),
                    ..Profile::default()
                },
            )])
            .unwrap();
        let mut record = database.library_resolve(None, Some("1")).unwrap().unwrap();
        record.overrides.insert("country".into(), "HN".into());
        record
            .overrides
            .insert("displayFlag".into(), "pride:transgender".into());
        record
            .overrides
            .insert("playerPhotoAssetId".into(), "current-photo.png".into());
        record.overrides.insert("pronouns".into(), "".into());
        record.games = vec![GamePreferences {
            game_key: "street-fighter-6".into(),
            characters: vec!["Cammy".into()],
            character_asset_id: Some("Cammy-2.png".into()),
            portrait_asset_id: Some("Cammy-2.png".into()),
        }];
        let record = database.library_save(record).unwrap().player;
        let mut fresh = OverlayStore::load(&database)
            .unwrap()
            .selected_set()
            .unwrap();
        fresh.set_id = Some("123".into());
        fresh.event_id = Some("456".into());
        fresh.asset_catalog_slug = Some("street-fighter-6".into());
        fresh.phase = Some("Finals".into());
        fresh.player_one.player_id = Some("1".into());
        fresh.player_one.name = "Alpha".into();
        fresh.player_one.prefix = Some("Event sponsor".into());
        fresh.player_one.character = Some("Ryu".into());
        fresh.player_one.characters = vec!["Ryu".into()];
        fresh.player_two.player_id = Some("2".into());
        fresh.player_two.character = Some("Ken".into());
        fresh.player_two.characters = vec!["Ken".into()];
        let mut saved = fresh.clone();
        saved.phase = Some("Old phase".into());
        saved.player_one.score = 1;
        saved.game_history = None;
        saved.player_one.country = Some("JP".into());
        saved.player_one.pronouns = Some("old pronouns".into());
        saved.player_one.player_photo_asset_id = Some("old-photo.png".into());
        std::mem::swap(&mut saved.player_one, &mut saved.player_two);
        let payload = serde_json::to_string(&saved).unwrap();
        database
            .save_stream_state("{}", &saved.updated_at, Some(("123", &payload)))
            .unwrap();
        crate::state::validate_selected_set(&saved).unwrap();
        let assets = Path::new("/jabs-no-test-assets");
        let mut restored = fresh.clone();
        apply_player_preferences(&database, assets, &mut restored, true).unwrap();
        assert_eq!(restored.player_one.player_id.as_deref(), Some("2"));
        assert_eq!(restored.player_one.character.as_deref(), Some("Ken"));
        assert_eq!(restored.player_two.player_id.as_deref(), Some("1"));
        assert_eq!(
            restored.player_two.local_player_id.as_deref(),
            Some(record.local_id.as_str())
        );
        assert_eq!(restored.player_two.score, 1);
        assert_eq!(restored.player_two.characters, ["Cammy"]);
        assert_eq!(
            restored.player_two.character_asset_id.as_deref(),
            Some("Cammy-2.png")
        );
        assert_eq!(
            restored.player_two.portrait_asset_id.as_deref(),
            Some("Cammy-2.png")
        );
        assert_eq!(restored.player_two.country.as_deref(), Some("HN"));
        assert_eq!(
            restored.player_two.display_flag.as_deref(),
            Some("pride:transgender")
        );
        assert_eq!(
            restored.player_two.player_photo_asset_id.as_deref(),
            Some("current-photo.png")
        );
        assert_eq!(restored.player_two.pronouns, None);
        assert_eq!(restored.player_two.prefix.as_deref(), Some("Event sponsor"));
        assert_eq!(restored.phase, fresh.phase);
        assert_eq!(
            database.load_set_override("123").unwrap().as_deref(),
            Some(payload.as_str())
        );
        let mut first_visit = fresh.clone();
        apply_player_preferences(&database, assets, &mut first_visit, false).unwrap();
        assert_eq!(first_visit.player_one.score, 0);
        assert_eq!(first_visit.player_one.character.as_deref(), Some("Cammy"));
        fresh.asset_catalog_slug = Some("tekken-8".into());
        fresh.game_id = "tekken-8".into();
        fresh.player_one.character = Some("Nina Williams".into());
        fresh.player_one.characters = vec!["Nina Williams".into()];
        apply_player_preferences(&database, assets, &mut fresh, false).unwrap();
        assert_eq!(fresh.player_one.character.as_deref(), Some("Nina Williams"));
    }
}
