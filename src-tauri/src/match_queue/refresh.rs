use super::*;
use crate::runtime::RuntimeState;
use std::sync::Arc;

// Upstream reads run independently of the one-second safety and advancement loop.
pub(super) async fn run(runtime: Arc<RuntimeState>) {
    let mut interval = tokio::time::interval(Duration::from_secs(15));
    interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    loop {
        interval.tick().await;
        let active = runtime
            .match_queue
            .inner
            .lock()
            .is_ok_and(|inner| engine::connected(&inner) && !inner.snapshot.entries.is_empty());
        if active {
            let _ = refresh(&runtime).await;
        }
    }
}

pub(super) async fn refresh(runtime: &RuntimeState) -> Result<(), String> {
    let mut last = runtime.match_queue.refresh.lock().await;
    // Opening the queue during a background refresh shares its result.
    if last.is_some_and(|at| at.elapsed() < Duration::from_secs(3)) {
        return Ok(());
    }
    let result = refresh_batches(runtime).await;
    if let Ok(mut inner) = runtime.match_queue.inner.lock() {
        let failed = result.is_err();
        if inner.snapshot.refresh_failed != failed {
            inner.snapshot.refresh_failed = failed;
            runtime.match_queue.publish(&inner);
        }
    }
    if result.is_ok() {
        *last = Some(Instant::now());
    }
    result
}

async fn refresh_batches(runtime: &RuntimeState) -> Result<(), String> {
    let snapshot = runtime.match_queue.current()?;
    let Some(context) = snapshot.context else {
        return Ok(());
    };
    let ids: Vec<_> = snapshot
        .entries
        .iter()
        .map(|entry| entry.set_id.clone())
        .collect();
    for batch in ids.chunks(20) {
        let current = runtime.match_queue.current()?;
        if current
            .context
            .as_ref()
            .map(|context| context.event_id.as_str())
            != Some(context.event_id.as_str())
        {
            return Ok(());
        }
        let live_version = runtime.overlay.selected_set()?.updated_at;
        if runtime.reporting_set_id.lock().await.is_some() {
            return Ok(());
        }
        let summaries = crate::startgg::queued_sets(runtime, &context.event_id, batch)
            .await
            .map_err(|error| {
                crate::diagnostics::record(
                    crate::diagnostics::Event::StartggFailed,
                    crate::diagnostics::Context {
                        area: crate::diagnostics::Area::Startgg,
                        operation: Some(crate::diagnostics::Operation::StartggSets),
                        reason: Some(crate::diagnostics::Reason::from_code(error.code)),
                        ..Default::default()
                    },
                );
                "Unable to refresh all queued matches from start.gg. JABS will retry automatically."
                    .to_owned()
            })?;
        if runtime.match_queue.current()?.revision != current.revision
            || runtime.overlay.selected_set()?.updated_at != live_version
            || runtime.reporting_set_id.lock().await.is_some()
        {
            return Ok(());
        }
        runtime.observe_startgg_sets(&context.event_id, &summaries)?;
    }
    Ok(())
}
