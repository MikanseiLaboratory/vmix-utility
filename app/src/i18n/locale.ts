export type AppLocale = 'ja' | 'en';

/** Settings dropdown: fixed language or follow OS */
export type SettingsLocaleChoice = AppLocale | 'system';

/** Map stored / BCP 47 tag to a supported UI language. */
export function normalizeLocale(value: string | undefined | null): AppLocale {
  const raw = (value ?? '').trim().toLowerCase();
  if (!raw) return 'ja';
  const primary = raw.split('-')[0] ?? raw;
  if (primary === 'en') return 'en';
  if (primary === 'ja') return 'ja';
  return 'ja';
}

/** OS / browser UI language (Tauri WebView exposes OS locale via navigator). */
export function getOsUiLocale(): AppLocale {
  if (typeof navigator === 'undefined') return 'ja';
  const raw = (navigator.languages?.[0] ?? navigator.language ?? '').trim().toLowerCase();
  if (!raw) return 'ja';
  const primary = raw.split('-')[0] ?? raw;
  if (primary === 'en') return 'en';
  if (primary === 'ja') return 'ja';
  return 'ja';
}

/** Backend `locale`: empty = follow OS; otherwise fixed ja/en. */
export function resolveActiveLocale(stored: string | undefined | null): AppLocale {
  if (stored == null || stored.trim() === '') {
    return getOsUiLocale();
  }
  return normalizeLocale(stored);
}

/** Deserialize stored locale for the settings form. */
export function parseStoredLocaleForSettings(value: string | undefined | null): SettingsLocaleChoice {
  if (value == null || value.trim() === '') return 'system';
  return normalizeLocale(value);
}
