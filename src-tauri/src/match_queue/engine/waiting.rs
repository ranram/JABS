use super::*;

const RETRY_INTERVAL: Duration = Duration::from_secs(15);

#[derive(Clone)]
pub(in crate::match_queue) struct Waiting {
    plan: Transition,
    retry_at: Instant,
}

pub(super) fn wait(
    runtime: &RuntimeState,
    plan: &Transition,
    entry: Entry,
) -> Result<Snapshot, String> {
    if entry.result_status == Some(ResultStatus::Reported) {
        return Err("This queued match is already complete. Use Next match to continue.".into());
    }
    let mut inner = runtime
        .match_queue
        .inner
        .lock()
        .map_err(|_| "The match queue is unavailable.")?;
    if inner.snapshot.revision != plan.revision || !inner.loading {
        return Err("The queue changed. Review its current order and try again.".into());
    }
    let mut next = inner.clone();
    next.snapshot.entries[plan.index] = entry;
    next.waiting = Some(Waiting {
        plan: plan.clone(),
        retry_at: Instant::now() + RETRY_INTERVAL,
    });
    next.loading = false;
    next.snapshot.running = true;
    next.snapshot.status = "waiting-players".into();
    next.snapshot.error = None;
    next.snapshot.revision += 1;
    next.last_tick = Instant::now();
    next.last_wall = SystemTime::now();
    save(&runtime.database, &next.snapshot)?;
    *inner = next;
    runtime.match_queue.publish(&inner);
    Ok(inner.snapshot.clone())
}

pub(super) async fn retry(runtime: &Arc<RuntimeState>) -> bool {
    let revision = match runtime.match_queue.inner.lock() {
        Ok(inner) if inner.waiting.is_some() => inner.snapshot.revision,
        _ => return false,
    };
    let blocked = runtime.reporting_set_id.lock().await.is_some()
        || runtime
            .stingers
            .current()
            .is_ok_and(|state| state.cue.is_some());
    match retry_plan(runtime, blocked) {
        Ok(Some(plan)) => {
            let _ = apply_transition(runtime, plan).await;
        }
        Err(error) => {
            runtime
                .match_queue
                .fail(&runtime.database, revision, &error);
        }
        Ok(None) => {}
    }
    true
}

fn retry_plan(runtime: &RuntimeState, blocked: bool) -> Result<Option<Transition>, String> {
    let live = runtime.overlay.selected_set()?;
    let mut inner = runtime
        .match_queue
        .inner
        .lock()
        .map_err(|_| "The match queue is unavailable.")?;
    let Some(waiting) = inner.waiting.as_ref() else {
        return Ok(None);
    };
    if inner.loading {
        return Ok(None);
    }
    if !connected(&inner) {
        return Err("Return to the queued event before continuing.".into());
    }
    if inner.last_tick.elapsed() > Duration::from_secs(5)
        || inner.last_wall.elapsed().unwrap_or(Duration::MAX) > Duration::from_secs(5)
    {
        return Err("The queue paused after inactivity. Review it before continuing.".into());
    }
    if live.updated_at != waiting.plan.updated_at {
        return Err("The live match changed while waiting for opponents. Review the queue before continuing.".into());
    }
    let due = Instant::now() >= waiting.retry_at;
    let mut plan = waiting.plan.clone();
    inner.last_tick = Instant::now();
    inner.last_wall = SystemTime::now();
    if !due || blocked || busy(&inner) {
        return Ok(None);
    }

    // Queue edits may have moved or replaced the next entry while it was waiting.
    let current = inner.snapshot.cursor.or_else(|| {
        inner
            .snapshot
            .entries
            .iter()
            .position(|entry| Some(entry.set_id.as_str()) == live.set_id.as_deref())
    });
    plan.index = if plan.automatic || plan.remove_current {
        current.map_or(0, |index| index + 1)
    } else if plan.run_after_load {
        start_index(&inner.snapshot, &live)?
    } else {
        inner
            .snapshot
            .entries
            .iter()
            .position(|entry| entry.set_id == plan.entry.set_id)
            .ok_or("There is no next queued match.")?
    };
    plan.entry = inner
        .snapshot
        .entries
        .get(plan.index)
        .cloned()
        .ok_or("There is no next queued match.")?;
    plan.revision = inner.snapshot.revision;
    inner.loading = true;
    // Keep the waiting status steady during checks. Edits can invalidate the
    // request while retaining the pending transition for the next safe retry.
    Ok(Some(plan))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::match_queue::tests::runtime;

    fn pending(automatic: bool) -> (Arc<RuntimeState>, Transition, SelectedSet) {
        let runtime = runtime();
        let live = runtime.overlay.selected_set().unwrap();
        let mut next = live.clone();
        next.set_id = Some("200".into());
        next.player_one.entrant_id = "set-200-player-1".into();
        next.player_two.entrant_id = "set-200-player-2".into();
        let snapshot = runtime.match_queue.current().unwrap();
        runtime
            .match_queue
            .add(
                &runtime.database,
                snapshot.revision,
                snapshot.context.unwrap(),
                Entry::from_set(&next).unwrap(),
            )
            .unwrap();
        let plan = {
            let mut inner = runtime.match_queue.inner.lock().unwrap();
            inner.snapshot.cursor = automatic.then_some(0);
            inner.snapshot.mode = Mode::Report;
            inner.snapshot.entries[0].result_status = Some(ResultStatus::Reported);
            inner.reported = automatic;
            inner.loading = true;
            Transition {
                revision: inner.snapshot.revision,
                index: 1,
                context: inner.snapshot.context.clone().unwrap(),
                entry: inner.snapshot.entries[1].clone(),
                updated_at: live.updated_at,
                automatic,
                run_after_load: true,
                remove_current: false,
            }
        };
        (runtime, plan, next)
    }

    #[test]
    fn reported_byes_do_not_wait_for_an_opponent_that_will_never_arrive() {
        let (runtime, plan, mut next) = pending(true);
        let before = runtime.overlay.current().unwrap();
        next.state = Some("3".into());
        assert!(wait(&runtime, &plan, Entry::from_set(&next).unwrap()).is_err());
        assert!(runtime.match_queue.inner.lock().unwrap().waiting.is_none());
        assert_eq!(runtime.overlay.current().unwrap(), before);
    }

    #[test]
    fn starting_or_advancing_waits_without_replacing_the_stream_and_loads_resolved_players() {
        for automatic in [false, true] {
            let (runtime, plan, mut next) = pending(automatic);
            let before = runtime.overlay.current().unwrap();
            let snapshot = wait(&runtime, &plan, Entry::from_set(&next).unwrap()).unwrap();
            assert_eq!(snapshot.status, "waiting-players");
            assert!(snapshot.running);
            assert_eq!(runtime.overlay.current().unwrap(), before);
            let mut later = next.clone();
            later.set_id = Some("300".into());
            later.player_one.entrant_id = "50".into();
            later.player_two.entrant_id = "60".into();
            let queue = runtime.match_queue.current().unwrap();
            runtime
                .match_queue
                .add(
                    &runtime.database,
                    queue.revision,
                    queue.context.unwrap(),
                    Entry::from_set(&later).unwrap(),
                )
                .unwrap();
            assert!(retry_plan(&runtime, false).unwrap().is_none());
            {
                let mut inner = runtime.match_queue.inner.lock().unwrap();
                inner.waiting.as_mut().unwrap().retry_at = Instant::now();
            }
            assert!(retry_plan(&runtime, true).unwrap().is_none());
            runtime
                .match_queue
                .inner
                .lock()
                .unwrap()
                .clients
                .get_mut("operator")
                .unwrap()
                .busy = true;
            assert!(retry_plan(&runtime, false).unwrap().is_none());
            runtime
                .match_queue
                .inner
                .lock()
                .unwrap()
                .clients
                .get_mut("operator")
                .unwrap()
                .busy = false;
            let retry = retry_plan(&runtime, false).unwrap().unwrap();
            assert_eq!(
                runtime.match_queue.current().unwrap().status,
                "waiting-players"
            );
            wait(&runtime, &retry, Entry::from_set(&next).unwrap()).unwrap();
            assert!(retry_plan(&runtime, false).unwrap().is_none());
            runtime
                .match_queue
                .inner
                .lock()
                .unwrap()
                .waiting
                .as_mut()
                .unwrap()
                .retry_at = Instant::now();
            let retry = retry_plan(&runtime, false).unwrap().unwrap();
            next.player_one.entrant_id = "30".into();
            next.player_one.name = "Gamma".into();
            next.player_two.entrant_id = "40".into();
            next.player_two.name = "Delta".into();
            let loaded = commit_transition(&runtime, &retry, next).unwrap();
            assert_eq!(loaded.cursor, Some(1));
            assert!(loaded.running);
            assert!(runtime.match_queue.inner.lock().unwrap().waiting.is_none());
            assert_eq!(loaded.entries[1].player_one, "Gamma");
            assert_eq!(
                runtime
                    .overlay
                    .selected_set()
                    .unwrap()
                    .player_two
                    .entrant_id,
                "40"
            );
        }
    }

    #[tokio::test]
    async fn pause_restart_disconnect_sleep_and_live_changes_cancel_waiting_without_network_requests()
     {
        for scenario in ["pause", "restart", "disconnect", "sleep", "live edit"] {
            let (runtime, plan, next) = pending(true);
            wait(&runtime, &plan, Entry::from_set(&next).unwrap()).unwrap();
            match scenario {
                "pause" => {
                    runtime
                        .match_queue
                        .edit(
                            &runtime.database,
                            runtime.match_queue.current().unwrap().revision,
                            "pause",
                            None,
                            None,
                            None,
                            None,
                        )
                        .unwrap();
                }
                "disconnect" => runtime.match_queue.inner.lock().unwrap().clients.clear(),
                "restart" => {
                    let restored = QueueStore::load(&runtime.database).unwrap();
                    *runtime.match_queue.inner.lock().unwrap() =
                        restored.inner.into_inner().unwrap();
                }
                "sleep" => {
                    runtime.match_queue.inner.lock().unwrap().last_tick =
                        Instant::now() - Duration::from_secs(6)
                }
                "live edit" => {
                    runtime
                        .overlay
                        .set_score(&runtime.database, "one", 1)
                        .unwrap();
                }
                _ => unreachable!(),
            }
            retry(&runtime).await;
            assert!(
                !runtime.match_queue.current().unwrap().running,
                "{scenario}"
            );
            assert!(runtime.match_queue.inner.lock().unwrap().waiting.is_none());
            assert_eq!(
                runtime.overlay.selected_set().unwrap().set_id.as_deref(),
                Some("100")
            );
        }
    }
}
