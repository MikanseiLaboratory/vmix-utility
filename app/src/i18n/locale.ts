export type AppLocale = 'ja' | 'en';

export function normalizeLocale(value: string | undefined | null): AppLocale {
  const v = (value ?? 'ja').toLowerCase();
  return v === 'en' ? 'en' : 'ja';
}
