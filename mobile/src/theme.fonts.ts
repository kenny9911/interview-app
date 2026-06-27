// Locale-aware font families. The bundled Bricolage/Hanken families are Latin-only
// and iOS does NOT per-glyph fall back for an explicitly-named family — so CJK text
// must use a system CJK face or it renders as tofu (□). Latin locales keep the
// branded fonts; CJK locales map every weight slot to the platform CJK system face
// (apply fontWeight at weight-sensitive callsites — the family name doesn't carry
// weight for system CJK fonts). See docs/30-i18n.md §7.6.
import { Platform } from 'react-native';
import { fonts as latinFonts } from './theme';
import { useLocale } from './i18n/LocaleProvider';
import type { AppLocale } from './i18n/resources';

export type FontSet = typeof latinFonts;

const CJK_FAMILY: Partial<Record<AppLocale, { ios: string; android: string }>> = {
  'zh-Hans': { ios: 'PingFang SC', android: 'sans-serif' },
  'zh-Hant': { ios: 'PingFang TC', android: 'sans-serif' },
  ja: { ios: 'Hiragino Sans', android: 'sans-serif' },
  ko: { ios: 'Apple SD Gothic Neo', android: 'sans-serif' },
};

export function fontsFor(locale: AppLocale): FontSet {
  const cjk = CJK_FAMILY[locale];
  if (!cjk) return latinFonts; // en → branded Latin fonts
  const fam = Platform.OS === 'ios' ? cjk.ios : cjk.android;
  return { display: fam, text: fam, medium: fam, semibold: fam, bold: fam, extrabold: fam };
}

/** Hook: the font set for the active locale. Screens that render translated copy
 *  should use this instead of the static `fonts` so CJK glyphs render. */
export function useThemeFonts(): FontSet {
  const { locale } = useLocale();
  return fontsFor(locale);
}
