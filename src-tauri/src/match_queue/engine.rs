use super::*;
use crate::runtime::RuntimeState;
use std::sync::Arc;
mod waiting;
pub(super) use waiting::Waiting;

#[derive(Clone)]
struct Transition {
    revision: u64,
    index: usize,
    context: Context,
    entry: Entry,
    updated_at: String,
    automatic: bool,
    run_after_load: bool,
    remove_current: bool,
}

impl QueueStore {
    pub fn interrupt(&self, database: &Database) {
        let _ = self.mutate(database, None, |inner| {
            pause(inner);
            reset_result(inner);
            Ok(())
        });
    }
    pub fn edit(
        &self,
        database: &Database,
        revision: u64,
        action: &str,
        set_id: Option<&str>,
        order: Option<&[String]>,
        mode: Option<Mode>,
        minutes: Option<u32>,
    ) -> Result<Snapshot, String> {
        self.mutate(database, Some(revision), |inner| {
            match action {
                "pause" => pause(inner),
                "clear" => {
                    inner.snapshot.entries.clear();
                    inner.snapshot.cursor = None;
                    inner.snapshot.context = None;
                    pause(inner);
                    reset_result(inner);
                }
                "settings" => {
                    let mode = mode.ok_or("Choose an advance mode.")?;
                    let minutes = minutes.ok_or("Choose a delay from 1 to 30 minutes.")?;
                    if inner.snapshot.mode != mode {
                        pause(inner);
                        reset_result(inner);
                    } else if inner.snapshot.delay_minutes != minutes
                        && inner.snapshot.remaining_ms.is_some()
                    {
                        inner.waiting = None;
                        inner.snapshot.remaining_ms = Some(u64::from(minutes) * 60_000);
                        inner.last_tick = Instant::now();
                        inner.last_wall = SystemTime::now();
                    }
                    inner.snapshot.mode = mode;
                    inner.snapshot.delay_minutes = minutes;
                }
                "remove" => {
                    let index = inner
                        .snapshot
                        .entries
                        .iter()
                        .position(|e| Some(e.set_id.as_str()) == set_id)
                        .ok_or("The queued match is unavailable.")?;
                    let cursor = inner.snapshot.cursor;
                    inner.snapshot.entries.remove(index);
                    if cursor == Some(index) {
                        inner.snapshot.cursor = None;
                        pause(inner);
                        reset_result(inner);
                    } else if cursor.is_some_and(|i| index < i) {
                        inner.snapshot.cursor = cursor.map(|i| i - 1);
                    }
                    if inner.snapshot.entries.is_empty() {
                        inner.snapshot.context = None;
                        pause(inner);
                    }
                    inner.snapshot.status = status(inner);
                }
                "reorder" => {
                    let order = order.ok_or("Invalid queue order.")?;
                    let s = &mut inner.snapshot;
                    let active_id = current_id(s).map(str::to_owned);
                    let fixed = if s.running {
                        s.cursor.map_or(0, |i| i + 1)
                    } else {
                        0
                    };
                    let unique: std::collections::HashSet<_> = order.iter().collect();
                    if order.len() != s.entries.len() || unique.len() != order.len() {
                        return Err("Invalid queue order.".into());
                    }
                    if s.entries.iter().take(fixed).zip(order).any(|(e, id)| &e.set_id != id) {
                        return Err(
                            "Pause the queue before reordering current or earlier matches.".into()
                        );
                    }
                    let entries = order
                        .iter()
                        .map(|id| {
                            s.entries
                                .iter()
                                .find(|e| &e.set_id == id)
                                .cloned()
                                .ok_or("Invalid queue order.")
                        })
                        .collect::<Result<Vec<_>, _>>()?;
                    s.cursor = active_id
                        .and_then(|id| entries.iter().position(|entry| entry.set_id == id));
                    s.entries = entries;
                    if s.remaining_ms == Some(0) || inner.reported || inner.loading {
                        pause(inner);
                    }
                }
                _ => return Err("Unknown queue action.".into()),
            }
            inner.snapshot.error = None;
            Ok(())
        })
    }
    pub fn resume(
        &self,
        database: &Database,
        revision: u64,
        live: &SelectedSet,
    ) -> Result<Snapshot, String> {
        self.mutate(database, Some(revision), |inner| {
            if current_id(&inner.snapshot) != live.set_id.as_deref()
                || inner.snapshot.cursor.is_none()
                || inner.snapshot.context.as_ref().map(|c| c.event_id.as_str())
                    != live.event_id.as_deref()
            {
                return Err("Start the queue before resuming automatic advance.".into());
            }
            if !connected(inner) {
                return Err("Return to the queued event before continuing.".into());
            }
            if inner.snapshot.mode == Mode::Report
                && live.state.as_deref() == Some("3")
                && !inner.reported
            {
                return Err(
                    "This queued match is already complete. Use Next match to continue.".into(),
                );
            }
            inner.snapshot.running = inner.snapshot.mode != Mode::Manual;
            inner.snapshot.error = None;
            inner.last_tick = Instant::now();
            inner.last_wall = SystemTime::now();
            update_winner(inner, live);
            inner.snapshot.status = status(inner);
            Ok(())
        })
    }
}
fn connected(inner: &Inner) -> bool {
    let event = inner.snapshot.context.as_ref().map(|c| c.event_id.as_str());
    inner
        .clients
        .values()
        .any(|c| c.event_id.as_deref() == event && client_active(c))
}
fn busy(inner: &Inner) -> bool {
    inner.clients.values().any(|c| c.busy && client_active(c))
}
fn winner(live: &SelectedSet) -> Option<String> {
    live.winner().map(|side| {
        if side == "one" {
            live.player_one.entrant_id.clone()
        } else {
            live.player_two.entrant_id.clone()
        }
    })
}
pub(super) fn update_winner(inner: &mut Inner, live: &SelectedSet) {
    let winner = winner(live);
    if inner.winner != winner {
        if inner.loading {
            pause(inner);
        }
        inner.winner = winner;
        inner.snapshot.remaining_ms = None;
        inner.snapshot.revision += 1;
    }
    if inner.snapshot.mode == Mode::WinnerDelay
        && inner.snapshot.running
        && inner.winner.is_some()
        && inner.snapshot.remaining_ms.is_none()
    {
        inner.snapshot.remaining_ms = Some(u64::from(inner.snapshot.delay_minutes) * 60_000);
        inner.last_tick = Instant::now();
    }
}
fn status(inner: &Inner) -> String {
    if inner.snapshot.entries.is_empty() {
        "empty"
    } else if !inner.snapshot.running {
        stopped_status(&inner.snapshot)
    } else if inner.waiting.is_some() {
        "waiting-players"
    } else if inner.snapshot.mode == Mode::Report {
        "waiting-report"
    } else if inner.snapshot.remaining_ms.is_some() {
        "countdown"
    } else {
        "waiting-winner"
    }
    .into()
}

fn start_index(queue: &Snapshot, live: &SelectedSet) -> Result<usize, String> {
    let first = if queue.status == "finished" {
        queue.cursor.map_or(0, |index| index + 1)
    } else {
        0
    };
    let mut first_unreported = None;
    for (index, entry) in queue.entries.iter().enumerate().skip(first) {
        let on_stream = Some(entry.set_id.as_str()) == live.set_id.as_deref();
        if entry.result_status == Some(ResultStatus::Reported)
            || (on_stream && live.state.as_deref() == Some("3"))
        {
            continue;
        }
        first_unreported.get_or_insert(index);
        if on_stream {
            return Ok(index);
        }
    }
    first_unreported.ok_or_else(|| "There is no next queued match.".into())
}

pub async fn navigate(
    runtime: &Arc<RuntimeState>,
    revision: u64,
    action: &str,
    set_id: Option<&str>,
) -> Result<Snapshot, String> {
    match prepare_navigation(runtime, revision, action, set_id)? {
        Some(plan) => apply_transition(runtime, plan).await,
        None => runtime.match_queue.current(),
    }
}

fn prepare_navigation(
    runtime: &RuntimeState,
    revision: u64,
    action: &str,
    set_id: Option<&str>,
) -> Result<Option<Transition>, String> {
    let live = runtime.overlay.selected_set()?;
    let plan = {
        let mut inner = runtime
            .match_queue
            .inner
            .lock()
            .map_err(|_| "The match queue is unavailable.")?;
        if inner.snapshot.revision != revision {
            return Err("The queue changed. Review its current order and try again.".into());
        }
        let s = &inner.snapshot;
        let current = s.cursor.or_else(|| {
            s.entries
                .iter()
                .position(|entry| Some(entry.set_id.as_str()) == live.set_id.as_deref())
        });
        if action == "remove" {
            let removed = s
                .entries
                .iter()
                .position(|entry| Some(entry.set_id.as_str()) == set_id)
                .ok_or("The queued match is unavailable.")?;
            if Some(removed) != current || removed + 1 == s.entries.len() {
                drop(inner);
                runtime.match_queue.edit(
                    &runtime.database,
                    revision,
                    "remove",
                    set_id,
                    None,
                    None,
                    None,
                )?;
                return Ok(None);
            }
        }
        if !connected(&inner) {
            return Err("Return to the queued event before continuing.".into());
        }
        if inner.loading {
            return Err("A queued match is already loading.".into());
        }
        let run_after_load = action == "start" || (action == "remove" && s.running);
        let index = match action {
            "start" => start_index(s, &live)?,
            "previous" => current
                .and_then(|i| i.checked_sub(1))
                .ok_or("There is no previous queued match.")?,
            "next" | "remove" => current.map_or(0, |i| i + 1),
            "jump" => s
                .entries
                .iter()
                .position(|e| Some(e.set_id.as_str()) == set_id)
                .ok_or("The queued match is unavailable.")?,
            _ => return Err("Unknown queue action.".into()),
        };
        let entry = s
            .entries
            .get(index)
            .cloned()
            .ok_or("There is no next queued match.")?;
        let context = s
            .context
            .clone()
            .ok_or("Choose an event before adding matches.")?;
        pause(&mut inner);
        reset_result(&mut inner);
        inner.snapshot.error = None;
        inner.snapshot.revision += 1;
        if action == "start"
            && entry.has_players()
            && Entry::from_set(&live).is_ok_and(|entry| entry.has_players())
            && live.set_id.as_deref() == Some(&entry.set_id)
            && live.event_id.as_deref() == Some(&context.event_id)
        {
            inner.snapshot.cursor = Some(index);
            inner.snapshot.running = inner.snapshot.mode != Mode::Manual;
            inner.last_tick = Instant::now();
            inner.last_wall = SystemTime::now();
            update_winner(&mut inner, &live);
            inner.snapshot.status = status(&inner);
            if inner.snapshot.mode == Mode::Report && live.state.as_deref() == Some("3") {
                pause(&mut inner);
                inner.snapshot.error = Some(
                    "This queued match is already complete. Use Next match to continue.".into(),
                );
            }
            save(&runtime.database, &inner.snapshot)?;
            runtime.match_queue.publish(&inner);
            return Ok(None);
        }
        if action == "remove" {
            inner.snapshot.running = run_after_load;
        }
        inner.loading = true;
        inner.snapshot.status = "loading".into();
        save(&runtime.database, &inner.snapshot)?;
        runtime.match_queue.publish(&inner);
        Transition {
            revision: inner.snapshot.revision,
            index,
            context,
            entry,
            updated_at: live.updated_at,
            automatic: false,
            run_after_load,
            remove_current: action == "remove",
        }
    };
    Ok(Some(plan))
}
async fn apply_transition(
    runtime: &Arc<RuntimeState>,
    plan: Transition,
) -> Result<Snapshot, String> {
    let result = load_queued_match(runtime, &plan).await;
    if let Err(error) = &result {
        runtime
            .match_queue
            .fail(&runtime.database, plan.revision, error);
    }
    result
}
async fn load_queued_match(
    runtime: &Arc<RuntimeState>,
    plan: &Transition,
) -> Result<Snapshot, String> {
    let c = &plan.context;
    let body = crate::local_server::SelectedSetBody {
        set_id: plan.entry.set_id.clone(),
        game_id: c.game_id.clone(),
        asset_catalog_slug: c.asset_catalog_slug.clone(),
        event_id: Some(c.event_id.clone()),
        tournament_slug: Some(c.tournament_slug.clone()),
        restore_overrides: true,
        preserve_broadcast: true,
        preserve_station: c.preserve_station,
        preserve_match_length: c.preserve_match_length,
    };
    let raw = crate::local_server::fetch_selected_set(runtime, &body)
        .await
        .map_err(|e| e.error)?
        .ok_or("Set not found.")?;
    let entry = Entry::from_set(&raw)?;
    if !entry.has_players() {
        return waiting::wait(runtime, plan, entry);
    }
    if plan.automatic && raw.state.as_deref() == Some("3") {
        return Err(
            "The next queued set is already complete. Review it before sending it to stream."
                .into(),
        );
    }
    let fresh = crate::local_server::prepare_imported_set(runtime, &body, raw)?;
    Entry::from_set(&fresh)?;
    if fresh.event_id.as_deref() != Some(&c.event_id) {
        return Err("The queued set belongs to another event.".into());
    }
    if plan.automatic && fresh.state.as_deref() == Some("3") {
        return Err(
            "The next queued set is already complete. Review it before sending it to stream."
                .into(),
        );
    }
    let reporting = runtime.reporting_set_id.lock().await;
    if reporting.is_some() {
        return Err("Wait for the current result report before changing matches.".into());
    }
    commit_transition(runtime, plan, fresh)
}

fn commit_transition(
    runtime: &RuntimeState,
    plan: &Transition,
    mut fresh: SelectedSet,
) -> Result<Snapshot, String> {
    let previous = runtime.overlay.selected_set()?;
    let mut inner = runtime
        .match_queue
        .inner
        .lock()
        .map_err(|_| "The match queue is unavailable.")?;
    if inner.snapshot.revision != plan.revision || !inner.loading || !connected(&inner) {
        return Err("The queue changed. Review its current order and try again.".into());
    }
    if plan.automatic && (busy(&inner) || runtime.stingers.current()?.cue.is_some()) {
        inner.loading = false;
        inner.snapshot.status = "waiting-edits".into();
        runtime.match_queue.publish(&inner);
        return Ok(inner.snapshot.clone());
    }
    let summary = Entry::from_set(&fresh)?;
    crate::state::censor_untrusted_selected_set(&mut fresh);
    runtime.overlay.replace_selected_set_if_current(
        &runtime.database,
        &runtime.logo_directory,
        &runtime.game_asset_directory,
        fresh,
        Some(&plan.updated_at),
    )?;
    // The successor shifts left when the previous Current entry is removed.
    let index = if plan.remove_current {
        inner.snapshot.entries.remove(plan.index - 1);
        plan.index - 1
    } else {
        plan.index
    };
    inner.snapshot.entries[index] = summary;
    inner.snapshot.cursor = Some(index);
    reset_result(&mut inner);
    inner.loading = false;
    inner.snapshot.running = plan.run_after_load && inner.snapshot.mode != Mode::Manual;
    inner.snapshot.revision += 1;
    inner.snapshot.error = None;
    inner.last_tick = Instant::now();
    inner.last_wall = SystemTime::now();
    let next = runtime.overlay.selected_set()?;
    update_winner(&mut inner, &next);
    inner.snapshot.status = status(&inner);
    if inner.snapshot.mode == Mode::Report && next.state.as_deref() == Some("3") {
        pause(&mut inner);
        inner.snapshot.error =
            Some("This queued match is already complete. Use Next match to continue.".into());
    }
    // A persistence failure must stop automation even though the live update succeeded.
    if let Err(error) = save(&runtime.database, &inner.snapshot) {
        pause(&mut inner);
        inner.snapshot.error = Some(error);
        runtime.match_queue.publish(&inner);
        return Ok(inner.snapshot.clone());
    }
    runtime.match_queue.publish(&inner);
    drop(inner);
    let _ = runtime.versus_screen.restore_media_for_match_change(
        &runtime.database,
        &previous,
        &next,
        &runtime.game_asset_directory,
        &runtime.player_photo_directory,
    );
    runtime.match_queue.current()
}

pub async fn run(runtime: Arc<RuntimeState>) {
    let mut interval = tokio::time::interval(Duration::from_secs(1));
    interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    let mut updates = runtime.overlay.subscribe();
    loop {
        tokio::select! {
            _ = interval.tick() => tick(&runtime).await,
            update = updates.recv() => {
                match update {
                    Ok(payload) => {
                        if let Ok(state) = serde_json::from_str::<crate::state::OverlayState>(&payload) {
                            let queue = &runtime.match_queue;
                            queue.observe_result(&runtime.database, &state.selected_set);
                            if let Ok(mut inner) = queue.inner.lock() {
                                if current_id(&inner.snapshot) == state.selected_set.set_id.as_deref() {
                                    let previous = (inner.snapshot.revision, inner.snapshot.status.clone());
                                    update_winner(&mut inner, &state.selected_set);
                                    inner.snapshot.status = status(&inner);
                                    if previous != (inner.snapshot.revision, inner.snapshot.status.clone()) {
                                        queue.publish(&inner);
                                    }
                                }
                            }
                        }
                    },
                    Err(_) => runtime.match_queue.interrupt(&runtime.database),
                }
                tick(&runtime).await;
            }
        }
    }
}
pub(super) async fn tick(runtime: &Arc<RuntimeState>) {
    if waiting::retry(runtime).await {
        return;
    }
    if !runtime
        .match_queue
        .inner
        .lock()
        .is_ok_and(|inner| inner.snapshot.running && !inner.loading)
    {
        return;
    }
    let Ok(live) = runtime.overlay.selected_set() else {
        return;
    };
    let blocked = runtime.reporting_set_id.lock().await.is_some()
        || runtime.stingers.current().is_ok_and(|s| s.cue.is_some());
    let plan = {
        let Ok(mut inner) = runtime.match_queue.inner.lock() else {
            return;
        };
        if !inner.snapshot.running || inner.loading {
            return;
        }
        let elapsed = inner.last_tick.elapsed();
        inner.last_tick = Instant::now();
        let wall_gap = inner.last_wall.elapsed().unwrap_or(Duration::MAX);
        inner.last_wall = SystemTime::now();
        if !connected(&inner)
            || elapsed > Duration::from_secs(5)
            || wall_gap > Duration::from_secs(5)
            || current_id(&inner.snapshot) != live.set_id.as_deref()
            || inner.snapshot.context.as_ref().map(|c| c.event_id.as_str())
                != live.event_id.as_deref()
        {
            pause(&mut inner);
            inner.snapshot.revision += 1;
            let _ = save(&runtime.database, &inner.snapshot);
            runtime.match_queue.publish(&inner);
            return;
        }
        let previous_progress = (
            inner.snapshot.revision,
            inner.snapshot.remaining_ms,
            inner.snapshot.status.clone(),
        );
        let previous_winner = inner.winner.clone();
        update_winner(&mut inner, &live);
        if previous_winner == inner.winner {
            if let Some(ms) = inner.snapshot.remaining_ms {
                inner.snapshot.remaining_ms = Some(ms.saturating_sub(elapsed.as_millis() as u64));
            }
        }
        let due = match inner.snapshot.mode {
            Mode::WinnerDelay => inner.snapshot.remaining_ms == Some(0) && inner.winner.is_some(),
            Mode::Report => inner.reported,
            Mode::Manual => false,
        };
        inner.snapshot.status = status(&inner);
        if !due || blocked || busy(&inner) {
            if due {
                inner.snapshot.status = "waiting-edits".into();
            }
            // Keep checking connection and edit safety every second, but send
            // snapshots only when the countdown, result, or visible status changes.
            if previous_progress
                != (
                    inner.snapshot.revision,
                    inner.snapshot.remaining_ms,
                    inner.snapshot.status.clone(),
                )
            {
                runtime.match_queue.publish(&inner);
            }
            return;
        }
        let index = inner.snapshot.cursor.map_or(0, |i| i + 1);
        let Some(entry) = inner.snapshot.entries.get(index).cloned() else {
            pause(&mut inner);
            inner.snapshot.status = "finished".into();
            inner.snapshot.revision += 1;
            let _ = save(&runtime.database, &inner.snapshot);
            runtime.match_queue.publish(&inner);
            return;
        };
        let Some(context) = inner.snapshot.context.clone() else {
            return;
        };
        inner.loading = true;
        inner.snapshot.status = "loading".into();
        runtime.match_queue.publish(&inner);
        Transition {
            revision: inner.snapshot.revision,
            index,
            context,
            entry,
            updated_at: live.updated_at,
            automatic: true,
            run_after_load: true,
            remove_current: false,
        }
    };
    let _ = apply_transition(runtime, plan).await;
}

#[cfg(test)]
mod transition_tests {
    use super::super::tests::runtime;
    use super::*;

    fn add_match(runtime: &RuntimeState, id: &str) -> SelectedSet {
        let mut set = runtime.overlay.selected_set().unwrap();
        set.set_id = Some(id.into());
        set.state = Some("1".into());
        set.player_one.score = 0;
        set.player_two.score = 0;
        set.game_history = Some(Vec::new());
        set.reported_outcome = None;
        set.upstream_reset = Some(false);
        let queue = runtime.match_queue.current().unwrap();
        runtime
            .match_queue
            .add(
                &runtime.database,
                queue.revision,
                queue.context.unwrap(),
                Entry::from_set(&set).unwrap(),
            )
            .unwrap();
        set
    }

    fn restore_queue_session(runtime: &RuntimeState) {
        runtime
            .overlay
            .clear_selected_set(&runtime.database)
            .unwrap();
        let restored = QueueStore::load(&runtime.database).unwrap();
        *runtime.match_queue.inner.lock().unwrap() = restored.inner.into_inner().unwrap();
        runtime
            .match_queue
            .heartbeat("operator".into(), Some("456".into()), false, None, None)
            .unwrap();
    }

    #[test]
    fn removing_current_loads_up_next_and_preserves_running_or_paused_state() {
        for (mode, running) in [
            (Mode::Manual, false),
            (Mode::Report, false),
            (Mode::Report, true),
            (Mode::WinnerDelay, true),
        ] {
            let r = runtime();
            add_match(&r, "50");
            let next = add_match(&r, "200");
            {
                let mut inner = r.match_queue.inner.lock().unwrap();
                inner.snapshot.entries.swap(0, 1);
                inner.snapshot.cursor = Some(1);
                inner.snapshot.mode = mode;
                inner.snapshot.running = running;
                inner.reported = true;
            }
            let revision = r.match_queue.current().unwrap().revision;
            let plan = prepare_navigation(&r, revision, "remove", Some("100"))
                .unwrap()
                .expect("Removing Current should prepare Up next.");
            assert_eq!(plan.entry.set_id, "200");
            assert_eq!(r.match_queue.current().unwrap().entries.len(), 3);
            let result = commit_transition(&r, &plan, next).unwrap();
            assert_eq!(
                result
                    .entries
                    .iter()
                    .map(|entry| entry.set_id.as_str())
                    .collect::<Vec<_>>(),
                ["50", "200"]
            );
            assert_eq!(result.cursor, Some(1));
            assert_eq!(result.running, running);
            assert_eq!(
                r.overlay.selected_set().unwrap().set_id.as_deref(),
                Some("200")
            );
            assert!(!r.match_queue.inner.lock().unwrap().reported);
        }
    }

    #[test]
    fn removing_other_entries_preserves_the_current_match_and_report_receipt() {
        let r = runtime();
        add_match(&r, "50");
        add_match(&r, "200");
        {
            let mut inner = r.match_queue.inner.lock().unwrap();
            inner.snapshot.entries.swap(0, 1);
            inner.snapshot.cursor = Some(1);
            inner.snapshot.mode = Mode::Report;
            inner.snapshot.running = true;
            inner.reported = true;
        }
        let revision = r.match_queue.current().unwrap().revision;
        assert!(
            prepare_navigation(&r, revision, "remove", Some("50"))
                .unwrap()
                .is_none()
        );
        assert_eq!(r.match_queue.current().unwrap().cursor, Some(0));
        let revision = r.match_queue.current().unwrap().revision;
        assert!(
            prepare_navigation(&r, revision, "remove", Some("200"))
                .unwrap()
                .is_none()
        );
        assert!(r.match_queue.current().unwrap().running);
        assert!(r.match_queue.inner.lock().unwrap().reported);
        assert_eq!(
            r.overlay.selected_set().unwrap().set_id.as_deref(),
            Some("100")
        );
        assert!(prepare_navigation(&r, revision, "remove", Some("100")).is_err());
    }

    #[test]
    fn removing_the_last_entry_stops_without_clearing_the_broadcast() {
        let r = runtime();
        {
            let mut inner = r.match_queue.inner.lock().unwrap();
            inner.snapshot.cursor = Some(0);
            inner.snapshot.running = true;
            inner.snapshot.mode = Mode::Report;
        }
        let revision = r.match_queue.current().unwrap().revision;
        assert!(
            prepare_navigation(&r, revision, "remove", Some("100"))
                .unwrap()
                .is_none()
        );
        let result = r.match_queue.current().unwrap();
        assert!(result.entries.is_empty());
        assert!(!result.running);
        assert!(result.cursor.is_none());
        assert_eq!(
            r.overlay.selected_set().unwrap().set_id.as_deref(),
            Some("100")
        );
    }

    #[test]
    fn a_failed_or_cancelled_removal_keeps_the_original_match_and_queue_entries() {
        let r = runtime();
        let next = add_match(&r, "200");
        let revision = r.match_queue.current().unwrap().revision;
        let plan = prepare_navigation(&r, revision, "remove", Some("100"))
            .unwrap()
            .expect("Removing Current should prepare its successor.");
        r.match_queue
            .fail(&r.database, plan.revision, "The next match is unavailable.");
        assert!(commit_transition(&r, &plan, next).is_err());
        let result = r.match_queue.current().unwrap();
        assert_eq!(result.entries.len(), 2);
        assert_eq!(result.entries[0].set_id, "100");
        assert!(!result.running);
        assert!(result.error.is_some());
        assert_eq!(
            r.overlay.selected_set().unwrap().set_id.as_deref(),
            Some("100")
        );
    }

    #[test]
    fn starting_a_finished_queue_continues_with_new_matches_even_after_a_restart() {
        for restart in [false, true] {
            let r = runtime();
            r.match_queue
                .mutate(&r.database, None, |inner| {
                    inner.snapshot.mode = Mode::Report;
                    inner.snapshot.cursor = Some(0);
                    inner.snapshot.status = "finished".into();
                    Ok(())
                })
                .unwrap();
            let revision = r.match_queue.current().unwrap().revision;
            assert!(prepare_navigation(&r, revision, "start", None).is_err());
            let next = add_match(&r, "200");
            add_match(&r, "300");
            if restart {
                restore_queue_session(&r);
            }
            let revision = r.match_queue.current().unwrap().revision;
            let plan = prepare_navigation(&r, revision, "start", None)
                .unwrap()
                .expect("Start should prepare the first appended match.");
            assert_eq!(plan.entry.set_id, "200");
            let result = commit_transition(&r, &plan, next).unwrap();
            assert_eq!(result.cursor, Some(1));
            assert!(result.running);
            assert_eq!(
                r.overlay.selected_set().unwrap().set_id.as_deref(),
                Some("200")
            );
            assert_eq!(result.entries[2].set_id, "300");
        }
    }

    #[test]
    fn start_keeps_an_unreported_match_already_on_stream() {
        let r = runtime();
        add_match(&r, "50");
        {
            let mut inner = r.match_queue.inner.lock().unwrap();
            inner.snapshot.entries.swap(0, 1);
            inner.snapshot.mode = Mode::Report;
        }
        let revision = r.match_queue.current().unwrap().revision;
        assert!(
            prepare_navigation(&r, revision, "start", None)
                .unwrap()
                .is_none()
        );
        let result = r.match_queue.current().unwrap();
        assert_eq!(result.cursor, Some(1));
        assert!(result.running);
        assert_eq!(
            r.overlay.selected_set().unwrap().set_id.as_deref(),
            Some("100")
        );
    }

    #[test]
    fn start_skips_reported_matches_in_paused_and_restored_queues() {
        for restart in [false, true] {
            let r = runtime();
            r.overlay.set_score(&r.database, "one", 2).unwrap();
            r.overlay
                .mark_reported(&r.database, "100", "3", None)
                .unwrap();
            r.match_queue.reported(&r.database, None, "100", true);
            add_match(&r, "150");
            r.match_queue.reported(&r.database, None, "150", true);
            {
                let mut inner = r.match_queue.inner.lock().unwrap();
                inner.snapshot.mode = Mode::Report;
                inner.snapshot.cursor = Some(0);
            }
            let revision = r.match_queue.current().unwrap().revision;
            assert!(prepare_navigation(&r, revision, "start", None).is_err());
            let next = add_match(&r, "200");
            add_match(&r, "300");
            if restart {
                restore_queue_session(&r);
            }
            let revision = r.match_queue.current().unwrap().revision;
            let plan = prepare_navigation(&r, revision, "start", None)
                .unwrap()
                .expect("Start should skip the reported entries.");
            assert_eq!(plan.entry.set_id, "200");
            let result = commit_transition(&r, &plan, next).unwrap();
            assert_eq!(result.cursor, Some(2));
            assert!(result.running);
            assert_eq!(
                r.overlay.selected_set().unwrap().set_id.as_deref(),
                Some("200")
            );
        }
    }

    #[test]
    fn committing_a_prepared_match_updates_live_state_and_cursor_once() {
        let r = runtime();
        let mut fresh = r.overlay.selected_set().unwrap();
        fresh.set_id = Some("200".into());
        fresh.player_one.name = "Next player".into();
        fresh.player_one.score = 2;
        fresh.game_history = None;
        fresh.upstream_reset = Some(true);
        let snapshot = r
            .match_queue
            .add(
                &r.database,
                r.match_queue.current().unwrap().revision,
                r.match_queue.current().unwrap().context.unwrap(),
                Entry::from_set(&fresh).unwrap(),
            )
            .unwrap();
        let plan = Transition {
            revision: snapshot.revision,
            index: 1,
            context: snapshot.context.unwrap(),
            entry: snapshot.entries[1].clone(),
            updated_at: r.overlay.selected_set().unwrap().updated_at,
            automatic: true,
            run_after_load: true,
            remove_current: false,
        };
        {
            let mut inner = r.match_queue.inner.lock().unwrap();
            inner.loading = true;
            inner.snapshot.mode = Mode::Report;
        }
        let result = commit_transition(&r, &plan, fresh.clone()).unwrap();
        assert_eq!(result.cursor, Some(1));
        assert!(result.running);
        assert_eq!(
            r.overlay.selected_set().unwrap().player_one.name,
            "Next player"
        );
        // Loading a match that was already reset must not look like a new reset.
        r.match_queue
            .observe_result(&r.database, &r.overlay.selected_set().unwrap());
        let observed = r.match_queue.current().unwrap();
        assert!(observed.running);
        assert_eq!(observed.cursor, Some(1));
        assert!(observed.entries[1].upstream_reset);
        assert!(observed.entries[1].result_status.is_none());
        assert!(r.overlay.selected_set().unwrap().winner().is_none());
        assert!(commit_transition(&r, &plan, fresh).is_err());
        assert_eq!(r.match_queue.current().unwrap().cursor, Some(1));
    }
    #[test]
    fn manual_queue_edits_or_new_holds_cancel_a_prepared_automatic_transition() {
        for hold in [false, true] {
            let r = runtime();
            let mut fresh = r.overlay.selected_set().unwrap();
            fresh.set_id = Some("200".into());
            let snapshot = r
                .match_queue
                .add(
                    &r.database,
                    r.match_queue.current().unwrap().revision,
                    r.match_queue.current().unwrap().context.unwrap(),
                    Entry::from_set(&fresh).unwrap(),
                )
                .unwrap();
            let plan = Transition {
                revision: snapshot.revision,
                index: 1,
                context: snapshot.context.unwrap(),
                entry: snapshot.entries[1].clone(),
                updated_at: r.overlay.selected_set().unwrap().updated_at,
                automatic: true,
                run_after_load: true,
                remove_current: false,
            };
            {
                r.match_queue.inner.lock().unwrap().loading = true;
            }
            if hold {
                r.match_queue
                    .heartbeat("operator".into(), Some("456".into()), true, Some(3), None)
                    .unwrap();
                // A delayed heartbeat must not clear the newer edit hold.
                r.match_queue
                    .heartbeat("operator".into(), Some("456".into()), false, Some(2), None)
                    .unwrap();
                assert_eq!(
                    commit_transition(&r, &plan, fresh).unwrap().status,
                    "waiting-edits"
                );
            } else {
                r.match_queue.interrupt(&r.database);
                assert!(commit_transition(&r, &plan, fresh).is_err());
            }
            assert_eq!(
                r.overlay.selected_set().unwrap().set_id.as_deref(),
                Some("100")
            );
            assert_eq!(r.match_queue.current().unwrap().cursor, None);
        }
    }
}
