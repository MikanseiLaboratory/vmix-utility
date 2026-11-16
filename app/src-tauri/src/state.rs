use crate::types::{
    AppConfig, AppSettings, AutoRefreshConfig, CachedUpdateStatus, ConnectionConfig, ConnectionType,
    DonationPromptConfig, VmixConnection, VmixInput, VmixVideoListInput,
};
use crate::http_client::VmixClientWrapper;
use crate::app_log;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tokio::fs;
use tokio::time::sleep;
use tauri::{Emitter, Manager};

pub fn lock_mutex<T>(mutex: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

#[derive(Debug, Clone)]
pub struct VideoListWindow {
    pub window_id: String,
    pub host: String,
    pub list_key: String,
    pub list_title: String,
    pub created_at: std::time::Instant,
}

pub struct AppState {
    pub http_connections: Arc<Mutex<Vec<VmixClientWrapper>>>,
    pub auto_refresh_configs: Arc<Mutex<HashMap<String, AutoRefreshConfig>>>,
    pub last_status_cache: Arc<Mutex<HashMap<String, VmixConnection>>>,
    pub inputs_cache: Arc<Mutex<HashMap<String, Vec<VmixInput>>>>,
    pub video_lists_cache: Arc<Mutex<HashMap<String, Vec<VmixVideoListInput>>>>,
    pub connection_labels: Arc<Mutex<HashMap<String, String>>>,
    pub app_settings: Arc<Mutex<AppSettings>>,
    pub video_list_windows: Arc<Mutex<HashMap<String, VideoListWindow>>>,
    pub donation_prompt: Arc<Mutex<DonationPromptConfig>>,
    pub update_status: Arc<Mutex<CachedUpdateStatus>>,
    /// Single shared source of vMix XML state for every feature.
    pub vmix_cache: Arc<crate::vmix_cache::VmixStateCache>,
    pub web_server: crate::web_server::WebServerSlot,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            http_connections: Arc::new(Mutex::new(Vec::new())),
            auto_refresh_configs: Arc::new(Mutex::new(HashMap::new())),
            last_status_cache: Arc::new(Mutex::new(HashMap::new())),
            inputs_cache: Arc::new(Mutex::new(HashMap::new())),
            video_lists_cache: Arc::new(Mutex::new(HashMap::new())),
            connection_labels: Arc::new(Mutex::new(HashMap::new())),
            app_settings: Arc::new(Mutex::new(AppSettings::default())),
            video_list_windows: Arc::new(Mutex::new(HashMap::new())),
            donation_prompt: Arc::new(Mutex::new(DonationPromptConfig::default())),
            update_status: Arc::new(Mutex::new(CachedUpdateStatus::default())),
            vmix_cache: Arc::new(crate::vmix_cache::VmixStateCache::new()),
            web_server: Arc::new(Mutex::new(crate::web_server::WebServerRuntime::default())),
        }
    }
    
    pub async fn initialize(&self, app_handle: &tauri::AppHandle) -> Result<(), String> {
        // Try to load config first
        if let Err(e) = self.load_config(app_handle).await {
            println!("Config load failed: {}, initializing with default localhost", e);
            // If loading fails, add default localhost connection
            self.add_localhost_connection();
            // Save the default configuration
            if let Err(e) = self.save_config(app_handle).await {
                println!("Failed to save default config: {}", e);
                return Err(e);
            }
        } else {
            println!("Config loaded successfully");
        }
        Ok(())
    }
    
    pub fn add_localhost_connection(&self) {
        let localhost_client = VmixClientWrapper::new("127.0.0.1", 8088);
        
        // Add to HTTP connections (default)
        self.http_connections.lock().unwrap().push(localhost_client);
        
        // Initialize auto-refresh config for localhost
        self.auto_refresh_configs.lock().unwrap()
            .insert("127.0.0.1".to_string(), AutoRefreshConfig::default());
            
        // Set default label for localhost
        self.connection_labels.lock().unwrap()
            .insert("127.0.0.1".to_string(), "Local vMix (HTTP)".to_string());
    }
    
    pub async fn get_config_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
        let app_data_dir = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
        fs::create_dir_all(&app_data_dir).await.map_err(|e| e.to_string())?;
        Ok(app_data_dir.join("config.json"))
    }
    
    pub async fn save_config(&self, app_handle: &tauri::AppHandle) -> Result<(), String> {
        let config_path = Self::get_config_path(app_handle).await?;
        println!("Saving config to: {:?}", config_path);
        
        let config = {
            let http_connections = lock_mutex(&self.http_connections);
            let labels = lock_mutex(&self.connection_labels);
            let auto_configs = lock_mutex(&self.auto_refresh_configs);
            
            println!("Current HTTP connections count: {}", http_connections.len());
            
            let mut all_connections = Vec::new();
            
            for conn in http_connections.iter() {
                let host = conn.host().to_string();
                let label = labels.get(&host).cloned().unwrap_or_else(|| format!("{} (HTTP)", host));
                let auto_refresh = auto_configs.get(&host).cloned().unwrap_or_default();
                println!("Saving HTTP connection: {} -> {}", host, label);
                
                all_connections.push(ConnectionConfig {
                    host: host.clone(),
                    port: conn.port(),
                    label,
                    auto_refresh,
                    connection_type: ConnectionType::Http,
                });
            }
            
            AppConfig {
                connections: all_connections,
                app_settings: Some(lock_mutex(&self.app_settings).clone()),
                logging_config: Some(crate::logging::LOGGING_CONFIG.lock().unwrap().clone()),
                donation_prompt: Some(lock_mutex(&self.donation_prompt).clone()),
            }
        };
        
        let json_data = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
        println!("Config JSON: {}", json_data);
        
        fs::write(&config_path, json_data).await.map_err(|e| e.to_string())?;
        println!("Config saved successfully");
        
        Ok(())
    }
    
    pub async fn load_config(&self, app_handle: &tauri::AppHandle) -> Result<(), String> {
        let config_path = Self::get_config_path(app_handle).await?;
        
        // Check if config file exists using tokio::fs
        if !fs::try_exists(&config_path).await.unwrap_or(false) {
            return Err("Config file does not exist".to_string());
        }
        
        let json_data = fs::read_to_string(&config_path).await.map_err(|e| e.to_string())?;
        println!("Config file content: {}", json_data);
        
        let config: AppConfig = serde_json::from_str(&json_data).map_err(|e| e.to_string())?;
        println!("Parsed config with {} connections", config.connections.len());
        
        // Clear existing connections
        {
            let mut http_connections = self.http_connections.lock().unwrap();
            http_connections.clear();
        }
        {
            let mut labels = self.connection_labels.lock().unwrap();
            labels.clear();
        }
        {
            let mut auto_configs = self.auto_refresh_configs.lock().unwrap();
            auto_configs.clear();
        }
        
        // Load connections from config (HTTP only; legacy TCP entries are migrated when deserializing)
        for (i, conn_config) in config.connections.iter().enumerate() {
            println!("Loading connection {}: {} ({}) - {:?}", i, conn_config.host, conn_config.label, conn_config.connection_type);
            
            let vmix_client = VmixClientWrapper::new(&conn_config.host, conn_config.port);
            {
                let mut http_connections = self.http_connections.lock().unwrap();
                http_connections.push(vmix_client);
            }
            
            {
                let mut labels = self.connection_labels.lock().unwrap();
                labels.insert(conn_config.host.clone(), conn_config.label.clone());
            }
            {
                let mut auto_configs = self.auto_refresh_configs.lock().unwrap();
                auto_configs.insert(conn_config.host.clone(), conn_config.auto_refresh.clone());
            }
        }
        
        // Load app settings
        if let Some(app_settings) = config.app_settings {
            let mut settings = self.app_settings.lock().unwrap();
            *settings = app_settings;
            println!("Loaded app settings");
        }
        
        // Load logging config
        if let Some(logging_config) = config.logging_config {
            let mut config = crate::logging::LOGGING_CONFIG.lock().unwrap();
            *config = logging_config;
            println!("Loaded logging config");
        }

        // Load donation prompt config
        if let Some(donation_prompt) = config.donation_prompt {
            let mut prompt = self.donation_prompt.lock().unwrap();
            *prompt = donation_prompt;
            println!("Loaded donation prompt config");
        }

        println!("Config loading completed");

        Ok(())
    }

    pub fn start_auto_refresh_task(&self, app_handle: tauri::AppHandle) {
        let http_connections = Arc::clone(&self.http_connections);
        let configs = Arc::clone(&self.auto_refresh_configs);
        let cache = Arc::clone(&self.last_status_cache);
        let inputs_cache = Arc::clone(&self.inputs_cache);
        let video_lists_cache = Arc::clone(&self.video_lists_cache);
        let labels = Arc::clone(&self.connection_labels);
        let vmix_cache = Arc::clone(&self.vmix_cache);

        tokio::spawn(async move {
            let mut next_refresh_times: HashMap<String, Instant> = HashMap::new();
            let mut consecutive_failures: HashMap<String, u32> = HashMap::new();

            loop {
                let current_connections = {
                    let guard = http_connections.lock().unwrap();
                    guard.clone()
                };

                let current_configs = {
                    let guard = configs.lock().unwrap();
                    guard.clone()
                };

                // Create a set of HTTP connection hosts for filtering
                let http_hosts: std::collections::HashSet<String> = current_connections                    .iter()
                    .map(|vmix| vmix.host().to_string())
                    .collect();

                // Calculate minimum refresh interval from enabled HTTP connections only
                let min_interval = current_configs.iter()
                    .filter(|(host, config)| http_hosts.contains(*host) && config.enabled)
                    .map(|(_, config)| config.duration)
                    .min()
                    .unwrap_or(3000); // Default to 3 seconds if no enabled configs

                let now = Instant::now();

                for vmix in current_connections.iter() {
                    let host = vmix.host().to_string();
                    
                    if let Some(config) = current_configs.get(&host) {
                        if !config.enabled {
                            continue;
                        }

                        let should_refresh = match next_refresh_times.get(&host) {
                            Some(next_time) => now >= *next_time,
                            None => true,
                        };

                        if should_refresh {
                            // Probe quickly so a dead host cannot stall the other connections.
                            let mut retry_attempts = 0;
                            let max_retries = 2;
                            let mut vmix_data_opt: Option<Arc<vmix_rs::models::Vmix>> = None;

                            while retry_attempts < max_retries && vmix_data_opt.is_none() {
                                if retry_attempts > 0 {
                                    sleep(Duration::from_millis(200)).await;
                                }

                                // One request covers connect, program/preview and inputs.
                                match tokio::time::timeout(
                                    Duration::from_millis(800),
                                    vmix_cache.refresh(&vmix),
                                )
                                .await
                                {
                                    Ok(Ok(state)) => {
                                        vmix_data_opt = Some(state);
                                        consecutive_failures.remove(&host);
                                    }
                                    Ok(Err(e)) => {
                                        app_log!(debug, "Status check failed for {}: {}", host, e);
                                        retry_attempts += 1;
                                    }
                                    Err(_) => {
                                        app_log!(debug, "Status check timed out for {}", host);
                                        retry_attempts += 1;
                                    }
                                }
                            }

                            let connection_successful = vmix_data_opt.is_some();
                            let active_input = vmix_data_opt
                                .as_ref()
                                .and_then(|state| state.active.trim().parse().ok())
                                .unwrap_or(0);
                            let preview_input = vmix_data_opt
                                .as_ref()
                                .and_then(|state| state.preview.trim().parse().ok())
                                .unwrap_or(0);

                            let connection_status = if connection_successful { 
                                "Connected".to_string() 
                            } else { 
                                let failures = consecutive_failures.entry(host.clone()).or_insert(0);
                                *failures += 1;
                                
                                if *failures >= 3 {
                                    "Disconnected".to_string()
                                } else {
                                    "Reconnecting".to_string()
                                }
                            };

                            let label = {
                                let labels_guard = labels.lock().unwrap();
                                labels_guard.get(&host).cloned().unwrap_or_else(|| host.clone())
                            };

                            // Preserve version/edition/preset from cache if they exist, otherwise get from vMix data
                            let (version, edition, preset) = if let Some(ref data) = vmix_data_opt {
                                (data.version.clone(), data.edition.clone(), data.preset.clone())
                            } else {
                                // If no data available (failed request or disconnected), preserve cached values
                                let cache_guard = cache.lock().unwrap();
                                if let Some(cached) = cache_guard.get(&host) {
                                    (cached.version.clone(), cached.edition.clone(), cached.preset.clone())
                                } else {
                                    ("Unknown".to_string(), "Unknown".to_string(), None)
                                }
                            };

                            let new_connection = VmixConnection {
                                host: host.clone(),
                                port: vmix.port(),
                                label,
                                status: connection_status,
                                active_input,
                                preview_input,
                                connection_type: ConnectionType::Http,
                                version,
                                edition,
                                preset,
                            };

                            // Get current inputs for comparison
                            let current_inputs = if let Some(ref data) = vmix_data_opt {
                                data.inputs.input.iter().map(|input| VmixInput {
                                    key: input.key.clone(),
                                    number: input.number.trim().parse().unwrap_or(0),
                                    title: input.title.clone(),
                                    short_title: Some(input.short_title.clone()),
                                    input_type: input.input_type.clone(),
                                    state: crate::commands::input_state_name(&input.state),
                                }).collect::<Vec<_>>()
                            } else {
                                Vec::new()
                            };

                            // Check if status changed (including inputs comparison)
                            let status_changed = {
                                let mut cache_guard = cache.lock().unwrap();
                                let mut inputs_cache_guard = inputs_cache.lock().unwrap();
                                
                                let connection_changed = cache_guard.get(&host)
                                    .map(|cached| {
                                        cached.status != new_connection.status ||
                                        cached.active_input != new_connection.active_input ||
                                        cached.preview_input != new_connection.preview_input
                                    })
                                    .unwrap_or(true);

                                let inputs_changed = inputs_cache_guard.get(&host)
                                    .map(|cached_inputs| {
                                        // Compare inputs directly using PartialEq
                                        cached_inputs != &current_inputs
                                    })
                                    .unwrap_or(true);
                                
                                cache_guard.insert(host.clone(), new_connection.clone());
                                inputs_cache_guard.insert(host.clone(), current_inputs);
                                
                                connection_changed || inputs_changed
                            };

                            let still_present = {
                                let guard = http_connections.lock().unwrap_or_else(|e| e.into_inner());
                                guard.iter().any(|connection| connection.host() == host)
                            };
                            if !still_present {
                                continue;
                            }

                            // Always emit event for connection updates
                            if status_changed {
                                let _ = app_handle.emit("vmix-status-updated", &new_connection);
                            }

                            // Also check and emit VideoLists updates
                            if new_connection.status == "Connected" {
                                if let Some(state_for_lists) = vmix_data_opt.clone() {
                                    let app_handle_clone = app_handle.clone();
                                    let host_clone = host.clone();
                                    let video_lists_cache_clone = Arc::clone(&video_lists_cache);

                                    tokio::spawn(async move {
                                        // Reuse the state fetched above instead of
                                        // issuing a second /api request.
                                        let video_lists = crate::commands::build_video_lists_from_vmix(&state_for_lists);

                                        app_log!(debug, "Auto-refresh retrieved {} VideoLists for host: {}", video_lists.len(), host_clone);

                                        // Check if VideoLists data has changed using cache comparison
                                        let video_lists_changed = {
                                            let mut cache_guard = video_lists_cache_clone.lock().unwrap();
                                            let has_changed = cache_guard.get(&host_clone)
                                                .map(|cached_video_lists| cached_video_lists != &video_lists)
                                                .unwrap_or(true);

                                            // Update cache with new data
                                            cache_guard.insert(host_clone.clone(), video_lists.clone());
                                            has_changed
                                        };

                                        // Only emit frontend event if data actually changed (for auto-refresh)
                                        if video_lists_changed {
                                            let payload = serde_json::json!({
                                                "host": host_clone,
                                                "videoLists": video_lists
                                            });

                                            if let Err(e) = app_handle_clone.emit("vmix-videolists-updated", payload) {
                                                app_log!(error, "Failed to emit VideoLists update: {}", e);
                                            }
                                        }
                                    });
                                }
                            }

                            // Schedule next refresh (shorter interval if reconnecting)
                            let refresh_interval = if new_connection.status == "Reconnecting" {
                                Duration::from_millis(config.duration.min(2000)) // 2 seconds in milliseconds
                            } else {
                                Duration::from_millis(config.duration)
                            };
                            next_refresh_times.insert(host, now + refresh_interval);
                        }
                    }
                }
                
                // Sleep for the minimum refresh interval before next check
                sleep(Duration::from_millis(min_interval)).await;
            }
        });
    }

    // VideoList window registry management methods
    pub fn register_video_list_window(&self, window_id: String, host: String, list_key: String, list_title: String) {
        let window_info = VideoListWindow {
            window_id: window_id.clone(),
            host,
            list_key,
            list_title,
            created_at: std::time::Instant::now(),
        };
        
        let mut windows = self.video_list_windows.lock().unwrap();
        windows.insert(window_id.clone(), window_info);
        app_log!(info, "Registered VideoList window: {}", window_id);
    }

    pub fn unregister_video_list_window(&self, window_id: &str) {
        let mut windows = self.video_list_windows.lock().unwrap();
        if windows.remove(window_id).is_some() {
            app_log!(info, "Unregistered VideoList window: {}", window_id);
        } else {
            app_log!(warn, "Attempted to unregister non-existent VideoList window: {}", window_id);
        }
    }

    pub fn get_video_list_window(&self, window_id: &str) -> Option<VideoListWindow> {
        let windows = self.video_list_windows.lock().unwrap();
        windows.get(window_id).cloned()
    }

    pub fn get_video_list_windows_for_host(&self, host: &str) -> Vec<VideoListWindow> {
        let windows = self.video_list_windows.lock().unwrap();
        windows.values()
            .filter(|window| window.host == host)
            .cloned()
            .collect()
    }

    pub fn cleanup_stale_video_list_windows(&self, app_handle: &tauri::AppHandle) {
        let mut windows_to_remove = Vec::new();
        
        {
            let windows = self.video_list_windows.lock().unwrap();
            for (window_id, _window_info) in windows.iter() {
                // Check if window still exists in Tauri
                if app_handle.get_webview_window(window_id).is_none() {
                    windows_to_remove.push(window_id.clone());
                }
            }
        }
        
        // Remove stale entries
        for window_id in windows_to_remove {
            self.unregister_video_list_window(&window_id);
        }
    }
}