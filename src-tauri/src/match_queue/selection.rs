use super::*;
use crate::runtime::RuntimeState;

impl QueueStore {
    pub(crate) fn select_for_stream(
        &self,
        runtime: &RuntimeState,
        fresh: SelectedSet,
        context: Option<Context>,
    ) -> Result<serde_json::Value, String> {
        let mut inner = self
            .inner
            .lock()
            .map_err(|_| "The match queue is unavailable.")?;
        let live = runtime.overlay.selected_set()?;
        let initialize = inner.snapshot.entries.is_empty() && context.is_some();
        let aligns = initialize || (!inner.snapshot.entries.is_empty()
            && inner.snapshot.context.as_ref().is_some_and(|context| {
                Some(context.event_id.as_str()) == fresh.event_id.as_deref()
            }));
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
        if initialize {
            let context = context.unwrap();
            if fresh.event_id.as_deref() != Some(context.event_id.as_str())
                || fresh.game_id != context.game_id
            {
                return Err("The selected match does not belong to this queue event.".into());
            }
            next.snapshot.context = Some(context);
        }
        let summary = Entry::from_set(&fresh)?;
        let fresh_result = summary.result_status.clone();
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
        if fresh_result == Some(ResultStatus::Reported) || selected.result_status.is_none() {
            selected.result_status = fresh_result;
        }
        if let Some(double_dq) = fresh.upstream_double_dq {
            selected.update_double_dq(double_dq);
        }
        let selected_position = next.snapshot.entries.iter()
            .position(|entry| entry.set_id == selected.set_id);
        let same_live = live.set_id == fresh.set_id && live.event_id == fresh.event_id;
        next.snapshot.entries.retain(|entry| entry.set_id != selected.set_id);
        let mut inserted_live = false;
        let mut old_position = None;
        let old = if !initialize && live.event_id == fresh.event_id && live.set_id.is_some() && !same_live {
            let mut entry = Entry::from_set(&live)?;
            old_position = next.snapshot.entries.iter()
                .position(|candidate| candidate.set_id == entry.set_id);
            if let Some(existing) = old_position.map(|index| &next.snapshot.entries[index]) {
                if !entry.upstream_double_dq {
                    entry.reported_result = existing.reported_result.clone();
                }
                entry.completed_at = existing.completed_at.clone();
                if entry.result_status.is_none() && !entry.upstream_reset {
                    entry.result_status = existing.result_status.clone();
                }
            }
            Some(entry)
        } else {
            None
        };
        let defer = old.as_ref().is_some_and(|entry| entry.result_status.is_none())
            && live.winner().is_none() && live.state.as_deref() != Some("3");
        let first_upcoming = next.snapshot.entries.iter()
            .position(|entry| entry.result_status.is_none())
            .unwrap_or(next.snapshot.entries.len());
        let old_id = old.as_ref().map(|entry| entry.set_id.clone());
        if let Some(mut old) = old {
            if !defer && old.completed_at.is_none() {
                old.completed_at = Some(crate::database::now_rfc3339()?);
            }
            if let Some(index) = old_position {
                next.snapshot.entries[index] = old;
            } else {
                next.snapshot.entries.insert(first_upcoming, old);
                old_position = Some(first_upcoming);
                inserted_live = true;
            }
        }
        if !defer && selected.completed_at.is_none() && selected.result_status.is_some() {
            selected.completed_at = Some(crate::database::now_rfc3339()?);
        }
        let preserve_position = same_live
            || (!defer && selected.result_status.is_some() && !inserted_live);
        let position = selected_position.filter(|_| preserve_position)
            .unwrap_or_else(|| old_position.map_or(first_upcoming, |index| index + 1))
            .min(next.snapshot.entries.len());
        next.snapshot.entries.insert(position, selected);
        let current = if defer {
            next.snapshot.entries.iter().position(|entry| Some(&entry.set_id) == old_id.as_ref())
                .ok_or("The queued match is unavailable.")?
        } else {
            position
        };
        next.snapshot.cursor = Some(current);
        if !defer && !next.snapshot.entries[current].has_players() {
            return Err("This match is waiting for opponents.".into());
        }
        if next.snapshot.entries.len() > 100 {
            return Err("The queue can hold up to 100 matches.".into());
        }
        validate(&mut next.snapshot)?;
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
            let running = if initialize {
                next.snapshot.mode != Mode::Manual && engine::connected(&next)
            } else {
                next.snapshot.running
            };
            pause(&mut next);
            reset_result(&mut next);
            next.last_tick = Instant::now();
            next.last_wall = SystemTime::now();
            next.snapshot.running =
                running && next.snapshot.entries[current].result_status != Some(ResultStatus::Reported);
            engine::update_winner(&mut next, &runtime.overlay.selected_set()?);
        }
        next.loading = false;
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
        queue_context: None,
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
    runtime.match_queue.select_for_stream(runtime, fresh, None)?;
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
