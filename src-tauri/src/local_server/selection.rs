use super::{reject_untrusted_mutation, secure_json};
use crate::{
    database::Database,
    runtime::RuntimeState,
    state::{SelectedSet, UpdateSelectedSetError},
};
use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    response::Response,
    Json,
};
use std::{path::Path, sync::Arc};

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct ClearPlayersBody {
    updated_at: String,
}

pub(super) async fn clear_players(
    State(runtime): State<Arc<RuntimeState>>,
    headers: HeaderMap,
    Json(body): Json<ClearPlayersBody>,
) -> Response {
    if let Some(response) = reject_untrusted_mutation(&headers) {
        return response;
    }
    // Hold the report lock until clearing finishes so a report cannot start mid-reset.
    let reporting = runtime.reporting_set_id.lock().await;
    if reporting.is_some() {
        return secure_json((
            StatusCode::CONFLICT,
            Json(serde_json::json!({
                "error": "A set report is already in progress."
            })),
        ));
    }
    match runtime
        .overlay
        .clear_players(&runtime.database, &body.updated_at)
    {
        Ok(state) => {
            runtime.match_queue.interrupt(&runtime.database);
            let _ = runtime
                .versus_screen
                .reset_media_placements(&runtime.database);
            secure_json(Json(state))
        }
        Err(error) => {
            let (status, message) = match error {
                UpdateSelectedSetError::Invalid(message) => {
                    (StatusCode::UNPROCESSABLE_ENTITY, message)
                }
                UpdateSelectedSetError::Conflict(message) => (StatusCode::CONFLICT, message),
            };
            secure_json((status, Json(serde_json::json!({ "error": message }))))
        }
    }
}

/// Restore match progress first, then apply the latest reusable player preferences.
pub(super) fn apply_player_preferences(
    database: &Database,
    game_asset_directory: &Path,
    fresh: &mut SelectedSet,
    restore_overrides: bool,
    queue_result_reset: bool,
) -> Result<(), String> {
    super::reconcile_imported_characters(fresh, game_asset_directory);
    fresh.upstream_reset = (matches!(fresh.state.as_deref(), Some("1" | "2"))
        && (queue_result_reset || fresh.winner().is_some()))
    .then_some(true);
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
                .filter(|saved| crate::state::validate_selected_set(saved).is_ok())
                .filter(|saved| {
                    [&fresh.player_one.entrant_id, &fresh.player_two.entrant_id]
                        .iter()
                        .all(|id| {
                            **id == saved.player_one.entrant_id
                                || **id == saved.player_two.entrant_id
                        })
                });
            if let Some(mut saved) = saved {
                // Scoring clears the match's reset flag, but the queue's flag stays
                // set until a new report is confirmed, to reject older report events.
                let unacknowledged_reset =
                    queue_result_reset && saved.upstream_reset != Some(false);
                saved.upstream_reset = saved.result_reset_after_refresh(
                    fresh.state.as_deref().unwrap_or_default(),
                    unacknowledged_reset,
                );
                saved.state = fresh.state.clone();
                saved.report_baseline = fresh.report_baseline.clone();
                if saved.upstream_reset == Some(true) {
                    saved.reported_outcome = None;
                }
                saved.game_id = fresh.game_id.clone();
                saved.game_name = fresh.game_name.clone().or(saved.game_name);
                let fresh_players = [&fresh.player_one, &fresh.player_two];
                for player in [&mut saved.player_one, &mut saved.player_two] {
                    let fresh_player = fresh_players
                        .iter()
                        .find(|fresh_player| fresh_player.entrant_id == player.entrant_id);
                    player.player_id =
                        fresh_player.and_then(|fresh_player| fresh_player.player_id.clone());
                    player.seed = fresh_player.and_then(|fresh_player| fresh_player.seed);
                    player.local_player_id =
                        fresh_player.and_then(|fresh_player| fresh_player.local_player_id.clone());
                }
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

    #[tokio::test]
    async fn clearing_players_requires_a_trusted_action_and_waits_for_active_reports() {
        let unused = std::path::PathBuf::from("/jabs-no-test-assets");
        let runtime = std::sync::Arc::new(
            crate::runtime::RuntimeState::new(
                Database::open(Path::new(":memory:")).unwrap(),
                unused.clone(),
                unused.clone(),
                unused.clone(),
                unused.clone(),
                unused.clone(),
                unused,
            )
            .unwrap(),
        );
        let before = runtime.overlay.current().unwrap();
        let version = runtime.overlay.selected_set().unwrap().updated_at;
        let untrusted = clear_players(
            State(runtime.clone()),
            HeaderMap::new(),
            Json(ClearPlayersBody {
                updated_at: version.clone(),
            }),
        )
        .await;
        assert_eq!(untrusted.status(), StatusCode::FORBIDDEN);
        let mut headers = HeaderMap::new();
        headers.insert("x-jabs-action", "renderer-v1".parse().unwrap());
        *runtime.reporting_set_id.lock().await = Some("100".into());
        let reporting = clear_players(
            State(runtime.clone()),
            headers.clone(),
            Json(ClearPlayersBody {
                updated_at: version.clone(),
            }),
        )
        .await;
        assert_eq!(reporting.status(), StatusCode::CONFLICT);
        assert_eq!(runtime.overlay.current().unwrap(), before);
        *runtime.reporting_set_id.lock().await = None;
        let cleared = clear_players(
            State(runtime),
            headers,
            Json(ClearPlayersBody {
                updated_at: version,
            }),
        )
        .await;
        assert_eq!(cleared.status(), StatusCode::OK);
    }

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
        fresh.player_one.seed = Some(7);
        fresh.player_two.seed = Some(12);
        let mut saved = fresh.clone();
        fresh.state = Some("1".into());
        fresh.report_baseline = Some(crate::state::ReportBaseline::from_set(&fresh));
        saved.state = Some("3".into());
        saved.player_one.seed = Some(99);
        saved.player_two.seed = None;
        saved.broadcast.as_mut().unwrap().seeds_enabled = Some(false);
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
        apply_player_preferences(&database, assets, &mut restored, true, false).unwrap();
        assert_eq!(restored.player_one.player_id.as_deref(), Some("2"));
        assert_eq!(restored.player_one.character.as_deref(), Some("Ken"));
        assert_eq!(restored.player_two.player_id.as_deref(), Some("1"));
        assert_eq!(
            restored.player_two.local_player_id.as_deref(),
            Some(record.local_id.as_str())
        );
        assert_eq!(restored.player_one.seed, Some(12));
        assert_eq!(restored.player_two.seed, Some(7));
        assert_eq!(
            restored.broadcast.as_ref().unwrap().seeds_enabled,
            Some(false)
        );
        assert_eq!(restored.player_two.score, 1);
        assert_eq!(restored.state.as_deref(), Some("1"));
        assert!(restored.report_baseline == fresh.report_baseline);
        assert_eq!(restored.upstream_reset, Some(true));
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
        apply_player_preferences(&database, assets, &mut first_visit, false, false).unwrap();
        assert_eq!(first_visit.player_one.score, 0);
        assert_eq!(first_visit.player_one.character.as_deref(), Some("Cammy"));
        fresh.asset_catalog_slug = Some("tekken-8".into());
        fresh.game_id = "tekken-8".into();
        fresh.player_one.character = Some("Nina Williams".into());
        fresh.player_one.characters = vec!["Nina Williams".into()];
        apply_player_preferences(&database, assets, &mut fresh, false, false).unwrap();
        assert_eq!(fresh.player_one.character.as_deref(), Some("Nina Williams"));
    }
}
