use super::{OverlayStore, next_timestamp, persist_stream_state, validate_state};
use crate::database::Database;
use serde_json::Value;

impl OverlayStore {
    /// Refresh upstream status without replacing the operator's local match progress.
    pub fn observe_bracket_state(
        &self,
        database: &Database,
        event_id: &str,
        sets: &[Value],
        reset_ids: &[String],
    ) -> Result<Option<String>, String> {
        let mut current = self
            .state
            .write()
            .map_err(|_| "Local stream state is unavailable.".to_owned())?;
        let selected = &current.selected_set;
        if selected.event_id.as_deref() != Some(event_id) {
            return Ok(None);
        }
        let Some(set_id) = selected.set_id.as_deref() else {
            return Ok(None);
        };
        let Some(summary) = sets.iter().find(|set| set["id"].as_str() == Some(set_id)) else {
            return Ok(None);
        };
        let Some(state @ ("1" | "2" | "3")) = summary["state"].as_str() else {
            return Ok(None);
        };
        let upstream_reset =
            selected.result_reset_after_refresh(state, reset_ids.iter().any(|id| id == set_id));
        if selected.state.as_deref() == Some(state) && selected.upstream_reset == upstream_reset {
            return Ok(None);
        }
        let mut next = current.clone();
        let reset_id = (upstream_reset == Some(true) && selected.upstream_reset != Some(true))
            .then(|| set_id.to_owned());
        next.selected_set.state = Some(state.to_owned());
        next.selected_set.upstream_reset = upstream_reset;
        if upstream_reset == Some(true) { next.selected_set.reported_outcome = None; }
        next.selected_set.updated_at = next_timestamp(&selected.updated_at)?;
        validate_state(&next)?;
        let payload = serde_json::to_string(&next)
            .map_err(|_| "Unable to serialize local stream state.".to_owned())?;
        persist_stream_state(database, &next, &payload)?;
        *current = next;
        drop(current);
        let _ = self.updates.send(payload);
        Ok(reset_id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::SelectedSet;
    use std::path::Path;

    #[test]
    fn bracket_refresh_updates_live_and_saved_status_without_replacing_local_progress() {
        let database = Database::open(Path::new(":memory:")).unwrap();
        let overlay = OverlayStore::load(&database).unwrap();
        let mut original = overlay.selected_set().unwrap();
        original.set_id = Some("100".into());
        original.event_id = Some("456".into());
        original.state = Some("3".into());
        original.player_one.score = 1;
        original.player_two.score = 2;
        original.game_history = None;
        let assets = Path::new("/jabs-no-test-assets");
        overlay
            .replace_selected_set(&database, assets, assets, original)
            .unwrap();
        let original = overlay.selected_set().unwrap();
        let reset = serde_json::json!({"id":"100", "state":"1"});
        let mut updates = overlay.subscribe();
        overlay
            .observe_bracket_state(&database, "other-event", std::slice::from_ref(&reset), &[])
            .unwrap();
        overlay
            .observe_bracket_state(
                &database,
                "456",
                &[serde_json::json!({"id":"other-set", "state":"1"})],
                &[],
            )
            .unwrap();
        overlay
            .observe_bracket_state(
                &database,
                "456",
                &[serde_json::json!({"id":"100", "state":null})],
                &[],
            )
            .unwrap();
        assert_eq!(overlay.selected_set().unwrap().state.as_deref(), Some("3"));
        assert!(updates.try_recv().is_err());

        overlay
            .observe_bracket_state(&database, "456", std::slice::from_ref(&reset), &[])
            .unwrap();
        let refreshed = overlay.selected_set().unwrap();
        let mut expected = original.clone();
        expected.state = Some("1".into());
        expected.upstream_reset = Some(true);
        expected.updated_at = refreshed.updated_at.clone();
        assert!(refreshed == expected);
        assert_ne!(refreshed.updated_at, original.updated_at);
        assert!(
            crate::state::report_readiness(&refreshed, None)
                .err()
                .unwrap()
                .contains("Reset or update")
        );
        assert!(refreshed.winner().is_none());
        assert!(updates.try_recv().is_ok());
        overlay
            .observe_bracket_state(&database, "456", &[reset], &[])
            .unwrap();
        assert!(updates.try_recv().is_err());
        let saved: SelectedSet =
            serde_json::from_str(&database.load_set_override("100").unwrap().unwrap()).unwrap();
        assert!(saved == refreshed);
        assert!(
            OverlayStore::load(&database)
                .unwrap()
                .selected_set()
                .unwrap()
                == refreshed
        );

        let stale = overlay.update_selected_set(&database, assets, assets, original);
        // A stale form cannot revive the old Reported status, including an idempotent replay.
        assert!(stale.is_ok());
        let mut draft = overlay.selected_set().unwrap();
        draft.state = Some("3".into());
        draft.upstream_reset = Some(false);
        draft.display_name = "Edited match title".into();
        overlay
            .update_selected_set(&database, assets, assets, draft)
            .unwrap();
        let saved = overlay.selected_set().unwrap();
        assert_eq!(saved.state.as_deref(), Some("1"));
        assert_eq!(saved.upstream_reset, Some(true));
        assert_eq!(saved.display_name, "Edited match title");
        overlay
            .observe_bracket_state(
                &database,
                "456",
                &[serde_json::json!({"id":"100", "state":"3"})],
                &[],
            )
            .unwrap();
        assert_eq!(overlay.selected_set().unwrap().state.as_deref(), Some("3"));
    }
}
