// i18next bootstrap + device-locale resolution. Pure JS (i18next/react-i18next);
// device locale comes from expo-localization (docs/30-i18n.md §7.2).
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';
import {
  resources, FALLBACK_LOCALE, SUPPORTED_LOCALES, isEnabledLocale, type AppLocale,
} from './resources';

/** Map the device's reported locale onto one of our canonical, ENABLED codes
 *  (script-aware for Chinese). Falls back to English when the device language
 *  isn't shipped yet. */
export function resolveDeviceLocale(): AppLocale {
  try {
    for (const l of getLocales()) {
      const code = (l.languageCode ?? '').toLowerCase();
      const tag = (l.languageTag ?? '').toLowerCase();
      if (code === 'zh') {
        const script = (l.languageScriptCode ?? '').toLowerCase();
        const cand: AppLocale = script === 'hant' || /(^|-)(hant|tw|hk|mo)(-|$)/.test(tag) ? 'zh-Hant' : 'zh-Hans';
        if (isEnabledLocale(cand)) return cand;
        if (isEnabledLocale('zh-Hans')) return 'zh-Hans'; // Traditional not shipped yet → Simplified
        continue;
      }
      if (isEnabledLocale(code as AppLocale)) return code as AppLocale; // en / ja / ko when enabled
    }
  } catch { /* getLocales can throw on some hosts — fall through */ }
  return FALLBACK_LOCALE;
}

/** Initialize i18next once; subsequent calls just switch the active language. */
export async function initI18n(initialLocale: AppLocale): Promise<typeof i18n> {
  if (i18n.isInitialized) {
    if (i18n.language !== initialLocale) await i18n.changeLanguage(initialLocale);
    return i18n;
  }
  await i18n.use(initReactI18next).init({
    resources,
    lng: initialLocale,
    fallbackLng: FALLBACK_LOCALE,
    supportedLngs: SUPPORTED_LOCALES as unknown as string[],
    interpolation: { escapeValue: false }, // React already escapes
    returnNull: false,
    compatibilityJSON: 'v4',
  });
  return i18n;
}

export { i18n };
