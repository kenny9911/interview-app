// App-wide locale state: device default → persisted override → live switching.
// The selected locale is the single source of truth for BOTH the UI strings
// (i18next) and the interview `language` sent to the backend (docs/30-i18n.md §2.4).
import React, { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { i18n, initI18n, resolveDeviceLocale } from './index';
import { FALLBACK_LOCALE, isEnabledLocale, type AppLocale } from './resources';

const STORAGE_KEY = 'viva.locale';

interface LocaleContextValue {
  locale: AppLocale;
  setLocale: (l: AppLocale) => void;
  ready: boolean;
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: FALLBACK_LOCALE,
  setLocale: () => {},
  ready: false,
});

export function useLocale(): LocaleContextValue {
  return useContext(LocaleContext);
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<AppLocale>(FALLBACK_LOCALE);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let initial: AppLocale = FALLBACK_LOCALE;
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        initial = isEnabledLocale(saved) ? saved : resolveDeviceLocale();
      } catch {
        initial = resolveDeviceLocale();
      }
      await initI18n(initial);
      if (cancelled) return;
      setLocaleState(initial);
      setReady(true);
    })();
    return () => { cancelled = true; };
  }, []);

  const value = useMemo<LocaleContextValue>(() => ({
    locale,
    ready,
    setLocale: (l: AppLocale) => {
      if (!isEnabledLocale(l)) return; // never switch to a not-yet-shipped locale
      setLocaleState(l);
      void i18n.changeLanguage(l);
      void AsyncStorage.setItem(STORAGE_KEY, l).catch(() => {});
    },
  }), [locale, ready]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}
