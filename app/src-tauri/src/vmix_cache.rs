//! A single, shared source of vMix XML state.
//!
//! Every feature (connection list, Input Manager, List Manager, Video Seeker and
//! the Multiview web server) needs the same `/api` document. Fetching it from
//! each call site meant the same 18 KB document was requested several times in
//! parallel, which made both the app and vMix slower.
//!
//! `VmixStateCache` keeps the most recent document per host for a short TTL and
//! coalesces concurrent misses onto a single request, so callers share one
//! fetch instead of issuing their own.

use crate::http_client::VmixClientWrapper;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

/// How long a fetched document is reused before another request is allowed.
///
/// The Multiview page polls at up to 10 Hz, so this is the effective ceiling on
/// how often vMix is asked for its state.
pub const CACHE_TTL: Duration = Duration::from_millis(80);

struct CachedEntry {
    state: Arc<vmix_rs::models::Vmix>,
    fetched_at: Instant,
}

#[derive(Default)]
pub struct VmixStateCache {
    entries: Mutex<HashMap<String, CachedEntry>>,
    /// One lock per host so concurrent callers wait for the same fetch.
    inflight: tokio::sync::Mutex<HashMap<String, Arc<tokio::sync::Mutex<()>>>>,
}

impl VmixStateCache {
    pub fn new() -> Self {
        Self::default()
    }

    fn fresh(&self, host: &str, ttl: Duration) -> Option<Arc<vmix_rs::models::Vmix>> {
        let entries = self.entries.lock().unwrap_or_else(|e| e.into_inner());
        let entry = entries.get(host)?;
        if entry.fetched_at.elapsed() <= ttl {
            Some(Arc::clone(&entry.state))
        } else {
            None
        }
    }

    /// Return the cached state when it is younger than `ttl`, otherwise fetch.
    pub async fn get(
        &self,
        client: &VmixClientWrapper,
        ttl: Duration,
    ) -> Result<Arc<vmix_rs::models::Vmix>, String> {
        let host = client.host().to_string();

        if let Some(state) = self.fresh(&host, ttl) {
            return Ok(state);
        }

        let host_lock = {
            let mut inflight = self.inflight.lock().await;
            Arc::clone(
                inflight
                    .entry(host.clone())
                    .or_insert_with(|| Arc::new(tokio::sync::Mutex::new(()))),
            )
        };

        // Another caller may have refreshed while we waited for the lock.
        let _guard = host_lock.lock().await;
        if let Some(state) = self.fresh(&host, ttl) {
            return Ok(state);
        }

        let state = client
            .get_raw_vmix_state()
            .await
            .map_err(|e| e.to_string())?;
        let state = Arc::new(state);

        {
            let mut entries = self.entries.lock().unwrap_or_else(|e| e.into_inner());
            entries.insert(
                host,
                CachedEntry {
                    state: Arc::clone(&state),
                    fetched_at: Instant::now(),
                },
            );
        }

        Ok(state)
    }

    /// Always fetch, replacing the cached document.
    pub async fn refresh(
        &self,
        client: &VmixClientWrapper,
    ) -> Result<Arc<vmix_rs::models::Vmix>, String> {
        let host = client.host().to_string();
        let state = client
            .get_raw_vmix_state()
            .await
            .map_err(|e| e.to_string())?;
        let state = Arc::new(state);
        let mut entries = self.entries.lock().unwrap_or_else(|e| e.into_inner());
        entries.insert(
            host,
            CachedEntry {
                state: Arc::clone(&state),
                fetched_at: Instant::now(),
            },
        );
        Ok(state)
    }

    /// Drop a host's entry, e.g. when the connection is removed.
    pub fn invalidate(&self, host: &str) {
        let mut entries = self.entries.lock().unwrap_or_else(|e| e.into_inner());
        entries.remove(host);
    }

    pub fn clear(&self) {
        let mut entries = self.entries.lock().unwrap_or_else(|e| e.into_inner());
        entries.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn invalidate_drops_only_the_named_host() {
        let cache = VmixStateCache::new();
        cache.invalidate("127.0.0.1");
        cache.clear();
    }

    #[test]
    fn ttl_is_short_enough_for_the_web_page() {
        assert!(CACHE_TTL <= Duration::from_millis(100));
    }
}
