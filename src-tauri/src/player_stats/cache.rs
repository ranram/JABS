use super::{PlayerStats, StatsContext};
use crate::{
    local_server::secure_json, runtime::RuntimeState, startgg_placements::RecentPlacement,
};
use axum::{
    body::Body,
    extract::{Path, State},
    http::{StatusCode, header},
    response::{IntoResponse, Response},
};
use futures_util::{
    FutureExt,
    future::{BoxFuture, Shared},
};
use jabs_startgg_client::{ApiError, api_error};
use std::{
    collections::VecDeque,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

type Pending = Shared<BoxFuture<'static, Result<PlayerStats, ApiError>>>;
struct Entry {
    context: StatsContext,
    pending: Pending,
    at: Instant,
    epoch: u64,
}
struct Logo {
    id: String,
    url: String,
    image: Option<(String, Vec<u8>)>,
}
#[derive(Default)]
struct CacheState {
    entries: VecDeque<Entry>,
    epoch: u64,
}
#[derive(Default)]
pub struct StatsCache {
    state: Mutex<CacheState>,
    logos: Mutex<VecDeque<Logo>>,
    image_load: tokio::sync::Mutex<()>,
}

impl StatsCache {
    pub fn invalidate_images(&self) {
        if let Ok(mut logos) = self.logos.lock() {
            for logo in logos.iter_mut() {
                logo.image = None;
            }
        }
        self.invalidate();
    }
    pub fn invalidate(&self) {
        let mut state = self.state.lock().expect("Stats cache poisoned");
        state.epoch += 1;
        state.entries.clear();
    }

    pub async fn load(
        &self,
        runtime: Arc<RuntimeState>,
        context: StatsContext,
    ) -> Result<PlayerStats, ApiError> {
        let request_context = context.clone();
        self.load_with(context, || {
            async move { super::load(&runtime, request_context).await }
                .boxed()
                .shared()
        })
        .await
    }

    async fn load_with(
        &self,
        context: StatsContext,
        fetch: impl FnOnce() -> Pending,
    ) -> Result<PlayerStats, ApiError> {
        let (pending, epoch) = {
            let mut state = self.state.lock().expect("Stats cache poisoned");
            if let Some(index) = state.entries.iter().position(|entry| {
                entry.context == context
                    && (entry.pending.peek().is_none()
                        || entry.at.elapsed() < Duration::from_secs(60))
            }) {
                let entry = state.entries.remove(index).unwrap();
                let result = (entry.pending.clone(), entry.epoch);
                state.entries.push_back(entry);
                result
            } else {
                state.entries.retain(|entry| entry.context != context);
                let pending = fetch();
                let epoch = state.epoch;
                state.entries.push_back(Entry {
                    context,
                    pending: pending.clone(),
                    at: Instant::now(),
                    epoch,
                });
                while state.entries.len() > 16 {
                    state.entries.pop_front();
                }
                (pending, epoch)
            }
        };
        let result = pending.await;
        if self.state.lock().expect("Stats cache poisoned").epoch != epoch {
            return Err(api_error(
                "The tournament results changed. Refresh Player Stats.",
                "stats-changed",
            ));
        }
        result
    }

    pub fn register_logos(&self, placements: &[RecentPlacement]) {
        let mut logos = self.logos.lock().expect("Stats logos poisoned");
        for placement in placements {
            if let (Some(id), Some(url)) = (&placement.logo_asset_id, &placement.logo_url) {
                let image = logos
                    .iter()
                    .position(|logo| logo.id == *id)
                    .and_then(|index| logos.remove(index))
                    .filter(|logo| logo.url == *url)
                    .and_then(|logo| logo.image);
                logos.push_back(Logo {
                    id: id.clone(),
                    url: url.clone(),
                    image,
                });
            }
        }
        while logos.len() > 64 {
            logos.pop_front();
        }
    }

    async fn image(&self, runtime: &RuntimeState, id: &str) -> Option<(String, Vec<u8>)> {
        // Share pending downloads and cache up to 64 image URLs within a 24 MiB limit.
        let _guard = self.image_load.lock().await;
        let epoch = self.state.lock().ok()?.epoch;
        let (url, cached) = self
            .logos
            .lock()
            .ok()?
            .iter()
            .find(|logo| logo.id == id)
            .map(|logo| (logo.url.clone(), logo.image.clone()))?;
        if let Some(image) = cached {
            return Some(image);
        }
        let image = runtime.startgg.tournament_image(&url).await.ok()?;
        if !crate::catalogs::valid_raster_bytes(&image.1, &image.0) {
            return None;
        }
        if self.state.lock().ok()?.epoch != epoch {
            return None;
        }
        {
            let mut logos = self.logos.lock().ok()?;
            if let Some(logo) = logos
                .iter_mut()
                .find(|logo| logo.id == id && logo.url == url)
            {
                logo.image = Some(image.clone());
            }
            let mut total: usize = logos
                .iter()
                .filter_map(|logo| logo.image.as_ref())
                .map(|(_, bytes)| bytes.len())
                .sum();
            for logo in logos.iter_mut() {
                if total <= 24 * 1024 * 1024 {
                    break;
                }
                if let Some((_, bytes)) = logo.image.take() {
                    total -= bytes.len();
                }
            }
        }
        Some(image)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    fn stats(context: StatsContext) -> PlayerStats {
        PlayerStats {
            context,
            tournament_name: "Tournament".into(),
            placements: vec![],
            run: vec![],
            run_scope: "tournament",
            run_complete: true,
            placements_error: None,
            run_error: None,
        }
    }

    #[tokio::test]
    async fn shares_lookups_and_rejects_pre_report_results() {
        let cache = StatsCache::default();
        let context = StatsContext {
            event_id: Some("1".into()),
            game_id: "2".into(),
            player_id: Some("3".into()),
            entrant_id: "4".into(),
        };
        let calls = AtomicUsize::new(0);
        let fetch = || {
            calls.fetch_add(1, Ordering::Relaxed);
            let context = context.clone();
            async move {
                tokio::task::yield_now().await;
                Ok(stats(context))
            }
            .boxed()
            .shared()
        };
        let (one, two) = tokio::join!(
            cache.load_with(context.clone(), fetch),
            cache.load_with(context.clone(), fetch)
        );
        assert!(one.is_ok() && two.is_ok());
        assert_eq!(calls.load(Ordering::Relaxed), 1);
        cache.load_with(context.clone(), fetch).await.unwrap();
        assert_eq!(calls.load(Ordering::Relaxed), 1);
        cache.invalidate();
        let (release, wait) = tokio::sync::oneshot::channel();
        let request_context = context.clone();
        let pending = cache.load_with(context, || {
            async move {
                wait.await.unwrap();
                Ok(stats(request_context))
            }
            .boxed()
            .shared()
        });
        let invalidation = async {
            tokio::task::yield_now().await;
            cache.invalidate();
            release.send(()).unwrap();
        };
        let (result, _) = tokio::join!(pending, invalidation);
        assert_eq!(result.err().unwrap().code, "stats-changed");
    }
}

pub async fn logo(State(runtime): State<Arc<RuntimeState>>, Path(id): Path<String>) -> Response {
    match runtime.player_stats.image(&runtime, &id).await {
        Some((mime, bytes)) => secure_json(
            (
                [
                    (header::CONTENT_TYPE, mime),
                    (header::CACHE_CONTROL, "private, max-age=60".into()),
                ],
                Body::from(bytes),
            )
                .into_response(),
        ),
        None => secure_json(StatusCode::NOT_FOUND),
    }
}
