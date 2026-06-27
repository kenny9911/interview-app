// i18n catalog registry + the canonical locale vocabulary for the app. Mirrors
// the server's domain.ts Language enum (docs/30-i18n.md §2). The UI locale IS the
// interview language for MVP — one selector drives both.
import en from './locales/en.json';
import zhHans from './locales/zh-Hans.json';
import ko from './locales/ko.json';

// The full canonical set (matches the server enum). Codes use script subtags so
// Simplified vs Traditional is unambiguous; the server maps to vendor codes.
export const SUPPORTED_LOCALES = ['en', 'zh-Hans', 'zh-Hant', 'ja', 'ko'] as const;
export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

export const FALLBACK_LOCALE: AppLocale = 'en';

// Locales we actually ship today (catalog present + server rollout gate open).
// Mirrors server SUPPORTED_LANGUAGES_P0; widen as each language's slice lands.
// The picker shows the rest as "coming soon".
export const ENABLED_LOCALES: AppLocale[] = ['en', 'zh-Hans', 'ko'];

// Each name written in its OWN script, so the picker reads natively regardless of
// the active UI language.
export const NATIVE_NAME: Record<AppLocale, string> = {
  en: 'English',
  'zh-Hans': '简体中文',
  'zh-Hant': '繁體中文',
  ja: '日本語',
  ko: '한국어',
};

// Catalogs available today. zh-Hant/ja intentionally absent → i18next falls back
// to English until their catalogs land (they aren't ENABLED yet anyway).
export const resources = {
  en: { translation: en },
  'zh-Hans': { translation: zhHans },
  ko: { translation: ko },
} as const;

export function isSupportedLocale(v: unknown): v is AppLocale {
  return typeof v === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(v);
}

export function isEnabledLocale(v: unknown): v is AppLocale {
  return isSupportedLocale(v) && ENABLED_LOCALES.includes(v);
}
