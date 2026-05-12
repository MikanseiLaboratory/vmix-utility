import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '../locales/en.json';
import ja from '../locales/ja.json';
import { normalizeLocale } from './locale';

void i18n.use(initReactI18next).init({
  resources: {
    ja: { translation: ja },
    en: { translation: en },
  },
  lng: 'ja',
  fallbackLng: 'ja',
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
});

export function applySavedLocale(locale: string | undefined | null): void {
  const lng = normalizeLocale(locale);
  if (i18n.language !== lng) {
    void i18n.changeLanguage(lng);
  }
}

export default i18n;
