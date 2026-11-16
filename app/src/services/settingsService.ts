import { invoke } from '@tauri-apps/api/core';

export interface AppSettings {
  default_vmix_ip: string;
  default_vmix_port: number;
  theme: string;
  ui_density: string;
  locale?: string;
  http_server_enabled: boolean;
  http_server_port: number;
  http_server_bind: string;
  multiviewer_enabled: boolean;
}

export interface HttpServerStatus {
  running: boolean;
  port: number;
  bind: string;
  urls: string[];
  last_error: string | null;
}

export interface LogLine {
  timestamp: string;
  level: string;
  source: 'app' | 'server' | string;
  message: string;
}

export interface LoggingConfig {
  level: string;
  save_to_file: boolean;
}

export interface AppInfo {
  version: string;
  git_commit_hash?: string;
  git_branch?: string;
  build_timestamp?: string;
  [key: string]: any;
}

export interface UpdateInfo {
  available: boolean;
  current_version: string;
  latest_version?: string;
  body?: string;
}

export interface CachedUpdateStatus {
  checked: boolean;
  info: UpdateInfo | null;
  error: string | null;
}

/**
 * Service for application settings and configuration operations
 */
export const settingsService = {
  /**
   * Get application settings from backend
   */
  async getAppSettings(): Promise<AppSettings | null> {
    try {
      return await invoke<AppSettings>('get_app_settings');
    } catch (error) {
      console.error('Failed to get app settings:', error);
      throw error;
    }
  },

  /**
   * Save application settings to backend
   */
  async saveAppSettings(settings: {
    defaultVMixIP: string;
    defaultVMixPort: number;
    theme: string;
    uiDensity: string;
    locale: string;
    httpServerEnabled: boolean;
    httpServerPort: number;
    httpServerBind: string;
    multiviewerEnabled: boolean;
  }): Promise<void> {
    try {
      await invoke('save_app_settings', {
        settings: {
          default_vmix_ip: settings.defaultVMixIP,
          default_vmix_port: settings.defaultVMixPort,
          theme: settings.theme,
          ui_density: settings.uiDensity,
          locale: settings.locale,
          http_server_enabled: settings.httpServerEnabled,
          http_server_port: settings.httpServerPort,
          http_server_bind: settings.httpServerBind,
          multiviewer_enabled: settings.multiviewerEnabled,
        }
      });
    } catch (error) {
      console.error('Failed to save app settings:', error);
      throw error;
    }
  },

  /**
   * Get logging configuration from backend
   */
  async getLoggingConfig(): Promise<LoggingConfig | null> {
    try {
      return await invoke<LoggingConfig>('get_logging_config');
    } catch (error) {
      console.error('Failed to get logging config:', error);
      throw error;
    }
  },

  /**
   * Set logging configuration
   */
  async setLoggingConfig(level: string, saveToFile: boolean): Promise<void> {
    try {
      await invoke('set_logging_config', {
        level,
        saveToFile
      });
    } catch (error) {
      console.error('Failed to set logging config:', error);
      throw error;
    }
  },

  /**
   * Get application information
   */
  async getAppInfo(): Promise<AppInfo | null> {
    try {
      return await invoke<AppInfo>('get_app_info');
    } catch (error) {
      console.error('Failed to get app info:', error);
      throw error;
    }
  },

  /**
   * Get cached startup/manual update check result
   */
  async getUpdateInfo(): Promise<CachedUpdateStatus> {
    return await invoke<CachedUpdateStatus>('get_update_info');
  },

  /**
   * Runtime status of the built-in HTTP/WebSocket server
   */
  async getHttpServerState(): Promise<HttpServerStatus> {
    return await invoke<HttpServerStatus>('get_http_server_state');
  },

  /**
   * In-memory application / server log lines
   */
  async getLogs(source?: 'app' | 'server', limit?: number): Promise<LogLine[]> {
    return await invoke<LogLine[]>('get_logs', { source: source ?? null, limit: limit ?? null });
  },

  /**
   * Open logs directory
   */
  async openLogsDirectory(): Promise<void> {
    try {
      await invoke('open_logs_directory');
    } catch (error) {
      console.error('Failed to open logs directory:', error);
      throw error;
    }
  },

  /**
   * Update connection label
   */
  async updateConnectionLabel(host: string, label: string): Promise<void> {
    try {
      await invoke('update_connection_label', {
        host,
        label: label.trim()
      });
    } catch (error) {
      console.error('Failed to update connection label:', error);
      throw error;
    }
  },
};