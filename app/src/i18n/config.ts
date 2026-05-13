import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '../locales/en.json';
import ja from '../locales/ja.json';
import { resolveActiveLocale } from './locale';

void i18n.use(initReactI18next).init({
  resources: {
    ja: { translation: ja },
    en: { translation: en },
  },
  lng: resolveActiveLocale(''),
  fallbackLng: 'ja',
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
});

export function applySavedLocale(locale: string | undefined | null): void {
  const lng = resolveActiveLocale(locale);
  if (i18n.language !== lng) {
    void i18n.changeLanguage(lng);
  }
}

export default i18n;
