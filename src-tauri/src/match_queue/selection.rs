use super::*;
use crate::runtime::RuntimeState;

impl QueueStore {
    pub(crate) fn select_for_stream(
        &self,
        runtime: &RuntimeState,
        fresh: SelectedSet,
    ) -> Result<serde_json::Value, String> {
        let mut inner = self
            .inner
            .lock()
            .map_err(|_| "The match queue is unavailable.")?;
        let live = runtime.overlay.selected_set()?;
        let aligns = !inner.snapshot.entries.is_empty()
            && inner.snapshot.context.as_ref().is_some_and(|context| {
                Some(context.event_id.as_str()) == fresh.event_id.as_deref()
            });
        if !aligns {
            if !inner.snapshot.entries.is_empty() {
                pause(&mut inner);
                reset_result(&mut inner);
                inner.snapshot.revision += 1;
                save(&runtime.database, &inner.snapshot)?;
                self.publish(&inner);
            }
            return runtime.overlay.replace_selected_set(
                &runtime.database,
                &runtime.logo_directory,
                &runtime.game_asset_directory,
                fresh,
            );
        }
        let mut next = inner.clone();
        let summary = Entry::from_set(&fresh)?;
        let mut selected = next
            .snapshot
            .entries
            .iter()
            .find(|entry| entry.set_id == summary.set_id)
            .cloned()
            .filter(|entry| {
                entry.entrant_one_id == summary.entrant_one_id
                    && entry.entrant_two_id == summary.entrant_two_id
            })
            .unwrap_or(summary);
        let same_live = live.set_id == fresh.set_id && live.event_id == fresh.event_id;
        next.snapshot
            .entries
            .retain(|entry| entry.set_id != selected.set_id);
        let old = if live.event_id == fresh.event_id && live.set_id.is_some() && !same_live {
            let mut entry = Entry::from_set(&live)?;
            if let Some(existing) = next
                .snapshot
                .entries
                .iter()
                .find(|candidate| candidate.set_id == entry.set_id)
            {
                entry.reported_result = existing.reported_result.clone();
                entry.completed_at = existing.completed_at.clone();
            }
            next.snapshot
                .entries
                .retain(|candidate| candidate.set_id != entry.set_id);
            Some(entry)
        } else {
            None
        };
        let defer = old.is_some() && live.winner().is_none() && live.state.as_deref() != Some("3");
        if defer {
            next.snapshot.entries.insert(0, selected);
            next.snapshot.entries.insert(0, old.unwrap());
        } else {
            if let Some(mut old) = old {
                if old.completed_at.is_none() {
                    old.completed_at = Some(crate::database::now_rfc3339()?);
                }
                next.snapshot.entries.insert(0, old);
            }
            selected.completed_at = selected.completed_at.or_else(|| {
                selected
                    .result_status
                    .as_ref()
                    .and_then(|_| crate::database::now_rfc3339().ok())
            });
            next.snapshot.entries.insert(0, selected);
        }
        if !defer && !next.snapshot.entries[0].has_players() {
            return Err("This match is waiting for opponents.".into());
        }
        if next.snapshot.entries.len() > 100 {
            return Err("The queue can hold up to 100 matches.".into());
        }
        let state = if defer {
            runtime.overlay.current()?
        } else {
            runtime.overlay.replace_selected_set(
                &runtime.database,
                &runtime.logo_directory,
                &runtime.game_asset_directory,
                fresh,
            )?
        };
        if !defer {
            let running = next.snapshot.running;
            pause(&mut next);
            reset_result(&mut next);
            next.snapshot.running =
                running && next.snapshot.entries[0].result_status != Some(ResultStatus::Reported);
            engine::update_winner(&mut next, &runtime.overlay.selected_set()?);
        }
        next.loading = false;
        next.snapshot.cursor = Some(0);
        next.snapshot.status = engine::status(&next);
        next.snapshot.error = None;
        next.snapshot.revision += 1;
        if let Err(error) = save(&runtime.database, &next.snapshot) {
            pause(&mut next);
            next.snapshot.error = Some(error);
        }
        *inner = next;
        self.publish(&inner);
        Ok(state)
    }
}

pub(super) async fn send(
    runtime: &std::sync::Arc<RuntimeState>,
    revision: u64,
    id: Option<&str>,
) -> Result<Snapshot, String> {
    {
        let inner = runtime
            .match_queue
            .inner
            .lock()
            .map_err(|_| "The match queue is unavailable.")?;
        if !engine::connected(&inner) {
            return Err("Return to the queued event before continuing.".into());
        }
        if inner.loading {
            return Err("A queued match is already loading.".into());
        }
    }
    let snapshot = runtime.match_queue.current()?;
    if snapshot.revision != revision {
        return Err("The queue changed. Review its current order and try again.".into());
    }
    let id = id.ok_or("The queued match is unavailable.")?;
    if !snapshot.entries.iter().any(|entry| entry.set_id == id) {
        return Err("The queued match is unavailable.".into());
    }
    let context = snapshot
        .context
        .ok_or("Choose an event before adding matches.")?;
    let previous = runtime.overlay.selected_set()?;
    let baseline = previous.updated_at.clone();
    let body = crate::local_server::SelectedSetBody {
        set_id: id.into(),
        game_id: context.game_id,
        asset_catalog_slug: context.asset_catalog_slug,
        event_id: Some(context.event_id),
        tournament_slug: Some(context.tournament_slug),
        restore_overrides: true,
        preserve_broadcast: true,
        preserve_station: context.preserve_station,
        preserve_match_length: context.preserve_match_length,
    };
    let fresh = crate::local_server::fetch_selected_set(runtime, &body)
        .await
        .map_err(|error| error.error)?
        .ok_or("Set not found.")?;
    let mut fresh = crate::local_server::prepare_imported_set(runtime, &body, fresh)?;
    crate::state::censor_untrusted_selected_set(&mut fresh);
    if runtime.match_queue.current()?.revision != revision
        || runtime.overlay.selected_set()?.updated_at != baseline
    {
        return Err("The queue changed. Review its current order and try again.".into());
    }
    runtime.match_queue.select_for_stream(runtime, fresh)?;
    let next = runtime.overlay.selected_set()?;
    if previous.set_id != next.set_id {
        let _ = runtime.versus_screen.restore_media_for_match_change(
            &runtime.database,
            &previous,
            &next,
            &runtime.game_asset_directory,
            &runtime.player_photo_directory,
        );
    }
    runtime.match_queue.current()
}
