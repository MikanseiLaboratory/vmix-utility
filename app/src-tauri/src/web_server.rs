//! Built-in HTTP + WebSocket server for browser-based features (#239).
//!
//! The server serves two static pages and one WebSocket endpoint. It never
//! proxies control commands from the browser: it only publishes vMix state as
//! JSON snapshots so pages like the Multiviewer can render live production
//! information inside a vMix WebBrowser input.

use crate::http_client::VmixClientWrapper;
use crate::network_scanner::get_network_interfaces;
use crate::server_log;
use crate::types::{AutoRefreshConfig, HttpServerStatus, StatusFlags};
use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Query, State,
    },
    http::StatusCode,
    response::{Html, IntoResponse, Response},
    routing::get,
    Router,
};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::sync::{broadcast, watch};

const DEFAULT_POLL_INTERVAL_MS: u64 = 200;
const MIN_POLL_INTERVAL_MS: u64 = 50;
const BROADCAST_CAPACITY: usize = 64;
const MIN_PORT: u16 = 1024;

/// Runtime state of the embedded server, stored in `AppState`.
#[derive(Debug, Default)]
pub struct WebServerRuntime {
    running: bool,
    port: u16,
    urls: Vec<String>,
    last_error: Option<String>,
    shutdown: Option<watch::Sender<bool>>,
}

impl WebServerRuntime {
    pub fn status(&self) -> HttpServerStatus {
        HttpServerStatus {
            running: self.running,
            port: self.port,
            urls: self.urls.clone(),
            last_error: self.last_error.clone(),
        }
    }

    fn signal_shutdown(&mut self) {
        if let Some(shutdown) = self.shutdown.take() {
            let _ = shutdown.send(true);
        }
        self.running = false;
        self.urls.clear();
    }
}

pub type WebServerSlot = Arc<Mutex<WebServerRuntime>>;

/// Shared context handed to axum handlers and poller tasks.
#[derive(Clone)]
struct ServerContext {
    connections: Arc<Mutex<Vec<VmixClientWrapper>>>,
    auto_refresh: Arc<Mutex<HashMap<String, AutoRefreshConfig>>>,
    latest: Arc<Mutex<HashMap<String, Arc<String>>>>,
    tx: broadcast::Sender<Snapshot>,
    shutdown: watch::Receiver<bool>,
}

impl ServerContext {
    fn is_shutting_down(&self) -> bool {
        *self.shutdown.borrow()
    }
}

#[derive(Clone)]
struct Snapshot {
    host: String,
    json: Arc<String>,
}

// ---------------------------------------------------------------------------
// Snapshot payloads (camelCase: consumed by the browser pages)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SnapshotMessage<'a> {
    #[serde(rename = "type")]
    kind: &'a str,
    host: &'a str,
    state: SnapshotState,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SnapshotState {
    version: String,
    edition: String,
    preset: Option<String>,
    active: i32,
    preview: i32,
    status: SnapshotFlags,
    inputs: Vec<SnapshotInput>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SnapshotFlags {
    recording: bool,
    external: bool,
    streaming: bool,
    play_list: bool,
    multi_corder: bool,
    fullscreen: bool,
    fade_to_black: bool,
}

impl From<&StatusFlags> for SnapshotFlags {
    fn from(flags: &StatusFlags) -> Self {
        Self {
            recording: flags.recording,
            external: flags.external,
            streaming: flags.streaming,
            play_list: flags.play_list,
            multi_corder: flags.multi_corder,
            fullscreen: flags.fullscreen,
            fade_to_black: flags.fade_to_black,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SnapshotInput {
    key: String,
    number: i32,
    title: String,
    short_title: String,
    input_type: String,
    state: String,
    position: i64,
    duration: i64,
    looping: bool,
    muted: bool,
    meter_f1: f64,
    meter_f2: f64,
    overlays: Vec<SnapshotOverlay>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SnapshotOverlay {
    index: i32,
    key: String,
    position: Option<SnapshotPosition>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SnapshotPosition {
    pan_x: f64,
    pan_y: f64,
    zoom_x: f64,
    zoom_y: f64,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

// ---------------------------------------------------------------------------
// Public lifecycle API
// ---------------------------------------------------------------------------

/// Start (or restart) the server on `port`.
pub async fn start(
    slot: &WebServerSlot,
    connections: Arc<Mutex<Vec<VmixClientWrapper>>>,
    auto_refresh: Arc<Mutex<HashMap<String, AutoRefreshConfig>>>,
    port: u16,
) -> Result<(), String> {
    if !(MIN_PORT..=u16::MAX).contains(&port) {
        let message = format!(
            "Port {} is not usable: pick a port between {} and 65535",
            port, MIN_PORT
        );
        if let Ok(mut runtime) = slot.lock() {
            runtime.last_error = Some(message.clone());
        }
        return Err(message);
    }

    {
        let mut runtime = slot.lock().map_err(|e| e.to_string())?;
        runtime.signal_shutdown();
        runtime.port = port;
        runtime.last_error = None;
    }

    // The previous listener is closed asynchronously; retry briefly so an
    // enable/disable cycle or a port change does not fail spuriously.
    let mut listener = None;
    let mut last_error = None;
    for attempt in 0..20 {
        match tokio::net::TcpListener::bind(("0.0.0.0", port)).await {
            Ok(bound) => {
                listener = Some(bound);
                break;
            }
            Err(error) => {
                last_error = Some(error);
                if attempt == 0 {
                    tokio::time::sleep(Duration::from_millis(50)).await;
                } else {
                    tokio::time::sleep(Duration::from_millis(100)).await;
                }
            }
        }
    }

    let listener = match listener {
        Some(listener) => listener,
        None => {
            let message = format!(
                "Failed to bind port {}: {}",
                port,
                last_error
                    .map(|error| error.to_string())
                    .unwrap_or_else(|| "unknown error".to_string())
            );
            if let Ok(mut runtime) = slot.lock() {
                runtime.last_error = Some(message.clone());
                runtime.running = false;
                runtime.urls.clear();
            }
            server_log!(error, "{}", message);
            return Err(message);
        }
    };

    let (shutdown_tx, shutdown_rx) = watch::channel(false);
    let (tx, _rx) = broadcast::channel(BROADCAST_CAPACITY);

    let context = ServerContext {
        connections: Arc::clone(&connections),
        auto_refresh: Arc::clone(&auto_refresh),
        latest: Arc::new(Mutex::new(HashMap::new())),
        tx,
        shutdown: shutdown_rx.clone(),
    };

    let app = Router::new()
        .route("/", get(index_page))
        .route("/multiview", get(multiview_page))
        .route("/ws", get(ws_handler))
        .fallback(not_found)
        .with_state(context.clone());

    let mut serve_shutdown = shutdown_rx.clone();
    tokio::spawn(async move {
        let server = axum::serve(listener, app).with_graceful_shutdown(async move {
            let _ = serve_shutdown.changed().await;
        });

        match server.await {
            Ok(()) => server_log!(info, "HTTP server on port {} stopped", port),
            Err(error) => server_log!(error, "HTTP server on port {} failed: {}", port, error),
        }
    });

    spawn_poller_supervisor(context);

    let urls = build_urls(port);
    {
        let mut runtime = slot.lock().map_err(|e| e.to_string())?;
        runtime.running = true;
        runtime.port = port;
        runtime.urls = urls.clone();
        runtime.last_error = None;
        runtime.shutdown = Some(shutdown_tx);
    }

    server_log!(
        info,
        "HTTP server listening on port {} ({})",
        port,
        urls.first().cloned().unwrap_or_default()
    );

    Ok(())
}

/// Stop the server if it is running. Safe to call when already stopped.
pub fn stop(slot: &WebServerSlot) {
    if let Ok(mut runtime) = slot.lock() {
        if runtime.running || runtime.shutdown.is_some() {
            server_log!(info, "Stopping HTTP server on port {}", runtime.port);
        }
        runtime.signal_shutdown();
    }
}

/// Align the running server with the requested settings.
pub async fn apply_settings(
    slot: &WebServerSlot,
    connections: Arc<Mutex<Vec<VmixClientWrapper>>>,
    auto_refresh: Arc<Mutex<HashMap<String, AutoRefreshConfig>>>,
    enabled: bool,
    port: u16,
) -> Result<(), String> {
    let (running, current_port) = {
        let runtime = slot.lock().map_err(|e| e.to_string())?;
        (runtime.running, runtime.port)
    };

    if !enabled {
        stop(slot);
        return Ok(());
    }

    if running && current_port == port {
        return Ok(());
    }

    start(slot, connections, auto_refresh, port).await
}

// ---------------------------------------------------------------------------
// HTTP handlers
// ---------------------------------------------------------------------------

async fn index_page() -> impl IntoResponse {
    Html(include_str!("web/index.html"))
}

async fn multiview_page() -> impl IntoResponse {
    Html(include_str!("web/multiview.html"))
}

async fn not_found() -> impl IntoResponse {
    (StatusCode::NOT_FOUND, "Not found")
}

#[derive(Debug, Deserialize)]
struct WsQuery {
    #[serde(rename = "vMixHost", alias = "host")]
    host: Option<String>,
}

async fn ws_handler(
    ws: WebSocketUpgrade,
    State(context): State<ServerContext>,
    Query(query): Query<WsQuery>,
) -> Response {
    let requested = query.host.unwrap_or_default();
    let host = if requested.trim().is_empty() {
        let connections = context.connections.lock().unwrap();
        connections
            .first()
            .map(|connection| connection.host().to_string())
            .unwrap_or_default()
    } else {
        requested.trim().to_string()
    };

    if host.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            "No vMix connection is configured. Add a connection first.",
        )
            .into_response();
    }

    ws.on_upgrade(move |socket| handle_socket(socket, context, host))
}

async fn handle_socket(mut socket: WebSocket, context: ServerContext, host: String) {
    server_log!(info, "WebSocket client connected for {}", host);

    let mut shutdown = context.shutdown.clone();
    let mut rx = context.tx.subscribe();

    // Send the latest known snapshot right away so the page does not stay blank
    // until the next poll cycle.
    let initial = {
        let latest = context.latest.lock().unwrap();
        latest.get(&host).cloned()
    };
    if let Some(json) = initial {
        if socket
            .send(Message::Text(json.as_str().into()))
            .await
            .is_err()
        {
            return;
        }
    }

    loop {
        tokio::select! {
            _ = shutdown.changed() => break,
            received = rx.recv() => {
                match received {
                    Ok(snapshot) => {
                        if snapshot.host != host {
                            continue;
                        }
                        if socket
                            .send(Message::Text(snapshot.json.as_str().into()))
                            .await
                            .is_err()
                        {
                            break;
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(skipped)) => {
                        server_log!(debug, "WebSocket client for {} lagged {} snapshots", host, skipped);
                    }
                    Err(broadcast::error::RecvError::Closed) => break,
                }
            }
            incoming = socket.recv() => {
                match incoming {
                    None => break,
                    Some(Err(_)) => break,
                    Some(Ok(Message::Close(_))) => break,
                    // The server only publishes state; ignore client payloads.
                    Some(Ok(_)) => {}
                }
            }
        }
    }

    server_log!(info, "WebSocket client disconnected for {}", host);
}

// ---------------------------------------------------------------------------
// Pollers
// ---------------------------------------------------------------------------

fn spawn_poller_supervisor(context: ServerContext) {
    tokio::spawn(async move {
        let mut polled: HashSet<String> = HashSet::new();

        while !context.is_shutting_down() {
            let hosts: Vec<String> = {
                let connections = context.connections.lock().unwrap();
                connections
                    .iter()
                    .map(|connection| connection.host().to_string())
                    .collect()
            };

            for host in hosts {
                if polled.insert(host.clone()) {
                    let poller_context = context.clone();
                    tokio::spawn(async move {
                        poll_host(poller_context, host).await;
                    });
                }
            }

            tokio::time::sleep(Duration::from_millis(1000)).await;
        }
    });
}

async fn poll_host(context: ServerContext, host: String) {
    server_log!(debug, "Polling {} for snapshots", host);

    loop {
        if context.is_shutting_down() {
            return;
        }

        let client = {
            let connections = context.connections.lock().unwrap();
            connections
                .iter()
                .find(|connection| connection.host() == host)
                .cloned()
        };

        let Some(client) = client else {
            // The vMix connection was removed; stop polling and forget state.
            if let Ok(mut latest) = context.latest.lock() {
                latest.remove(&host);
            }
            server_log!(debug, "Stopped polling {} (connection removed)", host);
            return;
        };

        let interval = {
            let configs = context.auto_refresh.lock().unwrap();
            configs
                .get(&host)
                .map(|config| config.duration.max(MIN_POLL_INTERVAL_MS))
                .unwrap_or(DEFAULT_POLL_INTERVAL_MS)
        };

        match client.get_raw_vmix_state().await {
            Ok(state) => {
                let snapshot = build_snapshot(&host, &state);
                match serde_json::to_string(&snapshot) {
                    Ok(json) => {
                        let json = Arc::new(json);
                        let changed = {
                            let mut latest = context.latest.lock().unwrap();
                            let changed = latest.get(&host) != Some(&json);
                            if changed {
                                latest.insert(host.clone(), Arc::clone(&json));
                            }
                            changed
                        };

                        if changed {
                            let _ = context.tx.send(Snapshot {
                                host: host.clone(),
                                json,
                            });
                        }
                    }
                    Err(error) => {
                        server_log!(warn, "Failed to serialize snapshot for {}: {}", host, error);
                    }
                }
            }
            Err(error) => {
                server_log!(debug, "Snapshot poll failed for {}: {}", host, error);
            }
        }

        tokio::time::sleep(Duration::from_millis(interval)).await;
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn build_urls(port: u16) -> Vec<String> {
    let mut urls = vec![format!("http://127.0.0.1:{}", port)];

    if let Ok(interfaces) = get_network_interfaces() {
        for interface in interfaces {
            if interface.ip_address.starts_with("127.") {
                continue;
            }
            let url = format!("http://{}:{}", interface.ip_address, port);
            if !urls.contains(&url) {
                urls.push(url);
            }
        }
    }

    urls
}

fn parse_ms(raw: &str) -> i64 {
    raw.trim()
        .parse::<f64>()
        .map(|value| value.round() as i64)
        .unwrap_or(0)
}

fn build_snapshot<'a>(host: &'a str, vmix: &vmix_rs::models::Vmix) -> SnapshotMessage<'a> {
    SnapshotMessage {
        kind: "vmix-state",
        host,
        state: build_snapshot_state(vmix),
    }
}

fn build_snapshot_state(vmix: &vmix_rs::models::Vmix) -> SnapshotState {
    SnapshotState {
        version: vmix.version.clone(),
        edition: vmix.edition.clone(),
        preset: vmix.preset.clone(),
        active: vmix.active.trim().parse().unwrap_or(0),
        preview: vmix.preview.trim().parse().unwrap_or(0),
        status: SnapshotFlags {
            recording: vmix.recording,
            external: vmix.external,
            streaming: vmix.streaming,
            play_list: vmix.play_list,
            multi_corder: vmix.multi_corder,
            fullscreen: vmix.fullscreen,
            fade_to_black: vmix.fade_to_black,
        },
        inputs: vmix
            .inputs
            .input
            .iter()
            .map(build_snapshot_input)
            .collect(),
    }
}

fn build_snapshot_input(input: &vmix_rs::models::Input) -> SnapshotInput {
    SnapshotInput {
        key: input.key.clone(),
        number: input.number.trim().parse().unwrap_or(0),
        title: input.title.clone(),
        short_title: input.short_title.clone(),
        input_type: input.input_type.clone(),
        state: match input.state {
            vmix_rs::models::State::Running => "Running".to_string(),
            vmix_rs::models::State::Paused => "Paused".to_string(),
            vmix_rs::models::State::Completed => "Completed".to_string(),
        },
        position: parse_ms(&input.position),
        duration: parse_ms(&input.duration),
        looping: input.input_loop,
        muted: input.muted.unwrap_or(false),
        meter_f1: input.meter_f1.unwrap_or(0.0),
        meter_f2: input.meter_f2.unwrap_or(0.0),
        overlays: input
            .overlay
            .iter()
            .map(|overlay| SnapshotOverlay {
                index: overlay.index.trim().parse().unwrap_or(0),
                key: overlay.key.clone(),
                position: overlay.position.as_ref().map(|position| SnapshotPosition {
                    pan_x: parse_float(position.pan_x.as_deref()),
                    pan_y: parse_float(position.pan_y.as_deref()),
                    zoom_x: parse_float(position.zoom_x.as_deref()),
                    zoom_y: parse_float(position.zoom_y.as_deref()),
                    x: parse_float(position.x.as_deref()),
                    y: parse_float(position.y.as_deref()),
                    width: parse_float(position.width.as_deref()),
                    height: parse_float(position.height.as_deref()),
                }),
            })
            .collect(),
    }
}

fn parse_float(raw: Option<&str>) -> f64 {
    raw.and_then(|value| value.trim().parse::<f64>().ok())
        .unwrap_or(0.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_millisecond_attributes() {
        assert_eq!(parse_ms("1234"), 1234);
        assert_eq!(parse_ms("1234.6"), 1235);
        assert_eq!(parse_ms(""), 0);
        assert_eq!(parse_ms("n/a"), 0);
    }

    #[test]
    fn urls_start_with_loopback() {
        let urls = build_urls(8089);
        assert_eq!(urls.first().map(String::as_str), Some("http://127.0.0.1:8089"));
        assert!(urls.iter().all(|url| url.contains(":8089")));
        assert!(urls.iter().all(|url| !url.contains("127.0.0.1:8089") || url == "http://127.0.0.1:8089"));
    }

    #[test]
    fn snapshot_serializes_camel_case_contract() {
        let state = SnapshotState {
            version: "29.0.0.1".to_string(),
            edition: "4K".to_string(),
            preset: None,
            active: 1,
            preview: 2,
            status: SnapshotFlags {
                recording: true,
                external: false,
                streaming: false,
                play_list: false,
                multi_corder: false,
                fullscreen: false,
                fade_to_black: false,
            },
            inputs: vec![SnapshotInput {
                key: "key-1".to_string(),
                number: 1,
                title: "Cam 1".to_string(),
                short_title: "Cam 1".to_string(),
                input_type: "Capture".to_string(),
                state: "Running".to_string(),
                position: 0,
                duration: 0,
                looping: false,
                muted: false,
                meter_f1: 0.5,
                meter_f2: 0.25,
                overlays: vec![SnapshotOverlay {
                    index: 1,
                    key: "key-2".to_string(),
                    position: Some(SnapshotPosition {
                        pan_x: 0.0,
                        pan_y: 0.0,
                        zoom_x: 1.0,
                        zoom_y: 1.0,
                        x: 0.0,
                        y: 0.0,
                        width: 1.0,
                        height: 1.0,
                    }),
                }],
            }],
        };

        let message = SnapshotMessage {
            kind: "vmix-state",
            host: "127.0.0.1",
            state,
        };
        let json = serde_json::to_value(&message).expect("snapshot should serialize");

        assert_eq!(json["type"], "vmix-state");
        assert_eq!(json["host"], "127.0.0.1");
        assert_eq!(json["state"]["status"]["playList"], false);
        assert_eq!(json["state"]["inputs"][0]["shortTitle"], "Cam 1");
        assert_eq!(json["state"]["inputs"][0]["meterF1"], 0.5);
        assert_eq!(json["state"]["inputs"][0]["overlays"][0]["position"]["zoomX"], 1.0);
    }
}
