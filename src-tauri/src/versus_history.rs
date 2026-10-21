use crate::{runtime::RuntimeState, state::SelectedSet, versus_screen::VersusHistory};
use futures_util::{
    future::{BoxFuture, Shared},
    FutureExt,
};
use jabs_startgg_client::{api_error, ApiError};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::VecDeque,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

const CACHE_SIZE: usize = 32;
const CACHE_TTL: Duration = Duration::from_secs(120);
type HistoryResult = Result<VersusHistory, ApiError>;
type PendingHistory = Shared<BoxFuture<'static, HistoryResult>>;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct HistoryMatch {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub set_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub event_id: Option<String>,
    pub game_id: String,
    pub player_one_id: String,
    pub player_two_id: String,
}

impl HistoryMatch {
    pub fn from_set(set: &SelectedSet) -> Option<Self> {
        let player_one_id = set.player_one.player_id.clone()?;
        let player_two_id = set.player_two.player_id.clone()?;
        if player_one_id == player_two_id
            || (set.set_id.is_none() && set.videogame_id.is_none())
            || (set.set_id.is_some() && set.event_id.is_none())
        {
            return None;
        }
        Some(Self {
            set_id: set.set_id.clone(),
            event_id: set.set_id.as_ref().and(set.event_id.clone()),
            game_id: set
                .videogame_id
                .clone()
                .or_else(|| set.asset_catalog_slug.clone())
                .unwrap_or_else(|| set.game_id.clone()),
            player_one_id,
            player_two_id,
        })
    }
    fn cache_key(&self) -> HistoryKey {
        HistoryKey {
            event_id: self.event_id.clone(),
            game_id: self.game_id.clone(),
            player_one_id: self.player_one_id.clone(),
            player_two_id: self.player_two_id.clone(),
        }
    }
}

// Reuse history for rematches only when the event, game and player order match.
#[derive(Clone, PartialEq, Eq)]
struct HistoryKey {
    event_id: Option<String>,
    game_id: String,
    player_one_id: String,
    player_two_id: String,
}

struct CacheEntry {
    key: HistoryKey,
    // Identify each request so a late reply cannot replace a newer cache entry.
    request_id: u64,
    pending: Option<PendingHistory>,
    completed: Option<(Instant, VersusHistory)>,
}
#[derive(Default)]
struct CacheState {
    entries: VecDeque<CacheEntry>,
    next_request: u64,
    // Ignore requests started before a score report, since their results may be outdated.
    epoch: u64,
}
#[derive(Default)]
pub struct HistoryCache {
    state: Mutex<CacheState>,
}

impl HistoryCache {
    pub fn invalidate(&self) {
        if let Ok(mut state) = self.state.lock() {
            state.entries.clear();
            state.epoch += 1;
        }
    }

    // Share a running lookup even for manual refresh. Completed results are
    // reused briefly; manual refresh always asks start.gg again after that.
    async fn load(
        &self,
        key: HistoryKey,
        force: bool,
        fetch: impl FnOnce() -> PendingHistory,
    ) -> (HistoryResult, u64) {
        let (pending, request_id, epoch) = {
            let mut state = self.state.lock().expect("History cache lock poisoned");
            if let Some(index) = state.entries.iter().position(|entry| entry.key == key) {
                let entry = state.entries.remove(index).unwrap();
                let cached = entry
                    .completed
                    .as_ref()
                    .filter(|(at, _)| !force && at.elapsed() < CACHE_TTL);
                if let Some((_, history)) = cached {
                    let result = history.clone();
                    state.entries.push_back(entry);
                    return (Ok(result), state.epoch);
                }
                if let Some(pending) = entry.pending.clone() {
                    let request_id = entry.request_id;
                    state.entries.push_back(entry);
                    (pending, request_id, state.epoch)
                } else {
                    Self::insert(&mut state, key.clone(), fetch())
                }
            } else {
                Self::insert(&mut state, key.clone(), fetch())
            }
        };
        let result = pending.await;
        let mut state = self.state.lock().expect("History cache lock poisoned");
        if let Some(index) = state
            .entries
            .iter()
            .position(|entry| entry.key == key && entry.request_id == request_id)
        {
            if let Ok(history) = &result {
                let entry = &mut state.entries[index];
                entry.pending = None;
                entry.completed = Some((Instant::now(), history.clone()));
            } else {
                state.entries.remove(index);
            }
        }
        (result, epoch)
    }

    fn insert(
        state: &mut CacheState,
        key: HistoryKey,
        pending: PendingHistory,
    ) -> (PendingHistory, u64, u64) {
        state.next_request += 1;
        let id = state.next_request;
        state.entries.push_back(CacheEntry {
            key,
            request_id: id,
            pending: Some(pending.clone()),
            completed: None,
        });
        while state.entries.len() > CACHE_SIZE {
            state.entries.pop_front();
        }
        (pending, id, state.epoch)
    }
}

pub async fn refresh(runtime: Arc<RuntimeState>, force: bool) -> Result<Value, ApiError> {
    let (selected, revision) = runtime.overlay.history_snapshot().map_err(local_error)?;
    let context = HistoryMatch::from_set(&selected).ok_or_else(|| {
        api_error(
            "Choose a game and link both players to their start.gg profiles.",
            "history-unavailable",
        )
    })?;
    runtime
        .overlay
        .with_history_revision(revision, || {
            runtime
                .versus_screen
                .begin_history(&runtime.database, Some(context.clone()), false)
        })
        .map_err(local_error)?
        .ok_or_else(changed)?;
    let fetch_runtime = runtime.clone();
    let (result, epoch) = runtime
        .versus_history
        .load(context.cache_key(), force, || {
            async move { crate::startgg::versus_history(&fetch_runtime, &selected).await }
                .boxed()
                .shared()
        })
        .await;
    // A score report makes cached history and pending requests outdated.
    // Keep the cache locked until the result is saved, so a report cannot slip between those steps.
    let cache = runtime
        .versus_history
        .state
        .lock()
        .map_err(|_| local_error("History cache is unavailable.".into()))?;
    let result = if cache.epoch == epoch {
        result
    } else {
        Err(changed())
    };
    let published = runtime
        .overlay
        .with_history_revision(revision, || {
            runtime
                .versus_screen
                .finish_history(&runtime.database, &context, &result)
        })
        .map_err(local_error)?
        .ok_or_else(changed)?;
    result.map(|_| published)
}

pub fn watch(runtime: Arc<RuntimeState>) {
    let mut updates = runtime.overlay.subscribe();
    tokio::spawn(async move {
        let mut previous_revision = None;
        loop {
            if let Ok((selected, revision)) = runtime.overlay.history_snapshot() {
                if previous_revision != Some(revision) {
                    previous_revision = Some(revision);
                    let context = HistoryMatch::from_set(&selected);
                    let _ = runtime.overlay.with_history_revision(revision, || {
                        runtime.versus_screen.begin_history(
                            &runtime.database,
                            context.clone(),
                            true,
                        )
                    });
                    if context.is_some() {
                        let runtime = runtime.clone();
                        tokio::spawn(async move {
                            let _ = refresh(runtime, false).await;
                        });
                    }
                }
            }
            match updates.recv().await {
                Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
                _ => continue,
            }
        }
    });
}
fn local_error(message: String) -> ApiError {
    api_error(&message, "history-storage")
}
fn changed() -> ApiError {
    api_error(
        "The matchup changed. Refresh history for the current match.",
        "history-changed",
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{database::Database, state::OverlayStore, versus_screen::VersusScreenStore};
    use std::{
        path::Path,
        sync::atomic::{AtomicUsize, Ordering},
    };

    fn empty_history() -> VersusHistory {
        VersusHistory {
            tournament_name: None,
            player_one_placements: vec![],
            player_two_placements: vec![],
            head_to_head: vec![],
        }
    }
    fn lookup(calls: &Arc<AtomicUsize>) -> PendingHistory {
        calls.fetch_add(1, Ordering::Relaxed);
        async { Ok(empty_history()) }.boxed().shared()
    }

    #[test]
    fn history_cache_shares_inflight_reads_and_expires_completed_results() {
        tokio::runtime::Runtime::new().unwrap().block_on(async {
            let cache = Arc::new(HistoryCache::default());
            let key = HistoryKey {
                event_id: Some("event".into()),
                game_id: "game".into(),
                player_one_id: "one".into(),
                player_two_id: "two".into(),
            };
            let calls = Arc::new(AtomicUsize::new(0));
            let (started, ready) = tokio::sync::oneshot::channel();
            let (release, response) = tokio::sync::oneshot::channel();
            let (first, second, _) = tokio::join!(
                cache.load(key.clone(), false, || {
                    calls.fetch_add(1, Ordering::Relaxed);
                    async move {
                        started.send(()).unwrap();
                        Ok(response.await.unwrap())
                    }
                    .boxed()
                    .shared()
                }),
                async {
                    ready.await.unwrap();
                    cache
                        .load(key.clone(), true, || {
                            panic!("Manual refresh must share the running lookup")
                        })
                        .await
                },
                async {
                    tokio::task::yield_now().await;
                    release.send(empty_history()).ok();
                }
            );
            assert!(first.0.is_ok() && second.0.is_ok());
            assert_eq!(calls.load(Ordering::Relaxed), 1);
            assert!(cache
                .load(key.clone(), false, || lookup(&calls))
                .await
                .0
                .is_ok());
            assert_eq!(calls.load(Ordering::Relaxed), 1);
            cache
                .load(key.clone(), true, || lookup(&calls))
                .await
                .0
                .unwrap();
            assert_eq!(calls.load(Ordering::Relaxed), 2);
            cache.state.lock().unwrap().entries[0]
                .completed
                .as_mut()
                .unwrap()
                .0 = Instant::now() - CACHE_TTL;
            cache
                .load(key.clone(), false, || lookup(&calls))
                .await
                .0
                .unwrap();
            assert_eq!(calls.load(Ordering::Relaxed), 3);
            cache.invalidate();
            assert!(cache
                .load(key.clone(), false, || async {
                    Err(api_error("Offline", "network"))
                }
                .boxed()
                .shared())
                .await
                .0
                .is_err());
            cache
                .load(key.clone(), false, || lookup(&calls))
                .await
                .0
                .unwrap();
            assert_eq!(calls.load(Ordering::Relaxed), 4);
            let mut swapped = key.clone();
            std::mem::swap(&mut swapped.player_one_id, &mut swapped.player_two_id);
            cache
                .load(swapped, false, || lookup(&calls))
                .await
                .0
                .unwrap();
            assert_eq!(calls.load(Ordering::Relaxed), 5);
            let previous_epoch = cache.state.lock().unwrap().epoch;
            let invalidated_cache = cache.clone();
            let (_, epoch) = cache
                .load(key.clone(), true, || {
                    async move {
                        invalidated_cache.invalidate();
                        Ok(empty_history())
                    }
                    .boxed()
                    .shared()
                })
                .await;
            assert_eq!(epoch, previous_epoch);
            assert_ne!(cache.state.lock().unwrap().epoch, epoch);
            for index in 0..CACHE_SIZE + 5 {
                let mut key = key.clone();
                key.event_id = Some(index.to_string());
                cache.load(key, false, || lookup(&calls)).await.0.unwrap();
            }
            assert_eq!(cache.state.lock().unwrap().entries.len(), CACHE_SIZE);
        });
    }

    #[test]
    fn history_replies_only_publish_for_the_current_matchup() {
        let database = Database::open(Path::new(":memory:")).unwrap();
        let overlay = OverlayStore::load(&database).unwrap();
        let versus = VersusScreenStore::load(&database).unwrap();
        let mut match_a = overlay.selected_set().unwrap();
        match_a.set_id = Some("A".into());
        match_a.event_id = Some("event".into());
        match_a.player_one.player_id = Some("one".into());
        match_a.player_two.player_id = Some("two".into());
        overlay
            .replace_selected_set(
                &database,
                Path::new("unused"),
                Path::new("unused"),
                match_a.clone(),
            )
            .unwrap();
        let (set, revision_a) = overlay.history_snapshot().unwrap();
        let context_a = HistoryMatch::from_set(&set).unwrap();
        versus
            .begin_history(&database, Some(context_a.clone()), true)
            .unwrap();
        overlay.set_score(&database, "one", 1).unwrap();
        assert_eq!(overlay.history_snapshot().unwrap().1, revision_a);
        overlay
            .with_history_revision(revision_a, || {
                versus.finish_history(&database, &context_a, &Err(api_error("Offline", "network")))
            })
            .unwrap()
            .unwrap();
        assert_eq!(versus.current().unwrap()["historyLoading"], false);
        assert_eq!(overlay.selected_set().unwrap().player_one.score, 1);
        let mut match_b = match_a.clone();
        match_b.set_id = Some("B".into());
        overlay
            .replace_selected_set(&database, Path::new("unused"), Path::new("unused"), match_b)
            .unwrap();
        assert!(overlay
            .with_history_revision::<()>(revision_a, || panic!("Late A cannot publish under B"))
            .unwrap()
            .is_none());
        overlay
            .replace_selected_set(&database, Path::new("unused"), Path::new("unused"), match_a)
            .unwrap();
        assert!(overlay
            .with_history_revision::<()>(revision_a, || panic!(
                "Returning to A cannot restore its old request"
            ))
            .unwrap()
            .is_none());
        let revision = overlay.history_snapshot().unwrap().1;
        overlay.swap_players(&database).unwrap();
        assert!(overlay
            .with_history_revision::<()>(revision, || panic!("Player order changed"))
            .unwrap()
            .is_none());
        let revision = overlay.history_snapshot().unwrap().1;
        overlay.clear_selected_set(&database).unwrap();
        assert!(overlay
            .with_history_revision::<()>(revision, || panic!("Tournament unloaded"))
            .unwrap()
            .is_none());
        assert!(HistoryMatch::from_set(&overlay.selected_set().unwrap()).is_none());

        // Exhibitions use the linked players' history without tournament or entrant IDs.
        let mut exhibition = overlay.selected_set().unwrap();
        exhibition.videogame_id = Some("43868".into());
        exhibition.player_one.player_id = Some("1566355".into());
        exhibition.player_two.player_id = Some("254690".into());
        let context = HistoryMatch::from_set(&exhibition).unwrap();
        assert_eq!(context.set_id, None);
        assert_eq!(context.event_id, None);
        assert_eq!(context.game_id, "43868");
        overlay
            .replace_selected_set(
                &database,
                Path::new("unused"),
                Path::new("unused"),
                exhibition.clone(),
            )
            .unwrap();
        let (_, revision) = overlay.history_snapshot().unwrap();
        versus
            .begin_history(&database, Some(context.clone()), true)
            .unwrap();
        overlay.set_score(&database, "one", 2).unwrap();
        assert_eq!(overlay.history_snapshot().unwrap().1, revision);
        overlay
            .with_history_revision(revision, || {
                versus.finish_history(&database, &context, &Ok(empty_history()))
            })
            .unwrap()
            .unwrap();
        assert!(versus.current().unwrap()["historyMatch"]
            .get("eventId")
            .is_none());
        exhibition.videogame_id = Some("49783".into());
        overlay
            .replace_selected_set(
                &database,
                Path::new("unused"),
                Path::new("unused"),
                exhibition.clone(),
            )
            .unwrap();
        assert!(overlay
            .with_history_revision::<()>(revision, || panic!("Old game cannot publish"))
            .unwrap()
            .is_none());
        let (_, revision) = overlay.history_snapshot().unwrap();
        overlay.swap_players(&database).unwrap();
        assert!(overlay
            .with_history_revision::<()>(revision, || panic!("Old player order cannot publish"))
            .unwrap()
            .is_none());
        exhibition.player_two.player_id = exhibition.player_one.player_id.clone();
        assert!(HistoryMatch::from_set(&exhibition).is_none());
        exhibition.player_two.player_id = None;
        assert!(HistoryMatch::from_set(&exhibition).is_none());
    }
}
