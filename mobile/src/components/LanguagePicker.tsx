// Bottom-sheet language picker. Lists every canonical locale in its OWN native
// script; switching updates the UI (i18next) and the interview language together,
// and persists (LocaleProvider). Not-yet-shipped locales render disabled.
import React from 'react';
import { View, Text, Pressable, Modal } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors, radius } from '../theme';
import { useThemeFonts, fontsFor } from '../theme.fonts';
import { useLocale } from '../i18n/LocaleProvider';
import { SUPPORTED_LOCALES, ENABLED_LOCALES, NATIVE_NAME, type AppLocale } from '../i18n/resources';
import { Check, Close } from '../icons';

export function LanguagePicker({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const fonts = useThemeFonts();
  const { locale, setLocale } = useLocale();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(34,24,46,0.45)', justifyContent: 'flex-end' }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel={t('common.back')} />
        <View
          style={{
            backgroundColor: colors.bone,
            borderTopLeftRadius: 26,
            borderTopRightRadius: 26,
            paddingHorizontal: 24,
            paddingTop: 18,
            paddingBottom: 34,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={{ fontFamily: fonts.display, fontSize: 22, color: colors.ink }}>{t('languagePicker.title')}</Text>
              <Text style={{ fontFamily: fonts.text, fontSize: 13.5, lineHeight: 19, color: colors.muted, marginTop: 6 }}>
                {t('languagePicker.subtitle')}
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={10}
              accessibilityRole="button"
              style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white, borderWidth: 1, borderColor: colors.hairline }}
            >
              <Close size={15} color={colors.ink} />
            </Pressable>
          </View>

          <View style={{ marginTop: 16, gap: 8 }}>
            {SUPPORTED_LOCALES.map((l: AppLocale) => {
              const enabled = ENABLED_LOCALES.includes(l);
              const active = l === locale;
              const rowFonts = fontsFor(l); // each row in its own script
              return (
                <Pressable
                  key={l}
                  disabled={!enabled}
                  onPress={() => { setLocale(l); onClose(); }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active, disabled: !enabled }}
                  accessibilityLabel={NATIVE_NAME[l]}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: colors.white,
                    borderWidth: active ? 2 : 1,
                    borderColor: active ? colors.persimmon : colors.hairline,
                    borderRadius: radius.md,
                    paddingVertical: 15,
                    paddingHorizontal: 16,
                    opacity: enabled ? 1 : 0.45,
                  }}
                >
                  <Text style={{ fontFamily: rowFonts.semibold, fontSize: 16, color: colors.ink }}>{NATIVE_NAME[l]}</Text>
                  {active ? (
                    <Check size={18} color={colors.persimmon} />
                  ) : !enabled ? (
                    <Text style={{ fontFamily: fonts.text, fontSize: 11.5, color: colors.faint }}>{t('common.comingSoon')}</Text>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}
