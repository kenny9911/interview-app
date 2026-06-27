import React, { useState } from 'react';
import { View, Text, Pressable, TextInput } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { ScreenScroll, Display, Label, PrimaryButton, BackButton } from '../components/ui';
import { LanguagePicker } from '../components/LanguagePicker';
import { colors } from '../theme';
import { useThemeFonts } from '../theme.fonts';
import { useLocale } from '../i18n/LocaleProvider';
import { NATIVE_NAME } from '../i18n/resources';
import { useNav, useRouteParams } from '../navigation';
import { api, ApiError, type Persona, type Style } from '../api';
import { ChevronLeft, Person, Globe, ChevronDown, ArrowRight } from '../icons';

const STYLE_VALUES: Style[] = ['friendly', 'balanced', 'tough'];
const EQ_HEIGHTS = [40, 75, 55, 95, 45, 70];
const LENGTHS = [10, 20, 30] as const;

const INTERVIEWERS: { name: string; value: Persona; grad: readonly [string, string] }[] = [
  { name: 'Aria', value: 'aria', grad: ['#FFB48C', '#D8401C'] },
  { name: 'Sam', value: 'sam', grad: ['#C7B6E8', '#6E5AA8'] },
  { name: 'Lena', value: 'lena', grad: ['#E7C8A0', '#A8742B'] },
];

export default function SetupScreen() {
  const nav = useNav();
  const { mode } = useRouteParams<'Setup'>();
  const { t } = useTranslation();
  const fonts = useThemeFonts();
  const { locale } = useLocale();

  const [role, setRole] = useState('Product Manager');
  const [style, setStyle] = useState<Style>('balanced');
  const [persona, setPersona] = useState<Persona>('aria');
  const [lengthMinutes, setLengthMinutes] = useState<number>(30);
  const [topicFocus, setTopicFocus] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [langOpen, setLangOpen] = useState(false);

  async function onStart() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.createConfig({
        mode,
        role: role.trim() || 'Product Manager',
        persona,
        style,
        language: locale, // the selected app locale IS the interview language (canonical BCP-47)
        lengthMinutes,
        topicFocus: topicFocus.trim() || undefined,
      });
      nav.navigate('Consent', { configId: res.config.id });
    } catch (e) {
      const msg = e instanceof ApiError ? e.body || e.message : e instanceof Error ? e.message : t('setup.error');
      setError(msg);
      setSubmitting(false);
    }
  }

  return (
    <ScreenScroll
      footer={
        <View style={{ paddingHorizontal: 22, paddingBottom: 8, paddingTop: 10 }}>
          {error ? (
            <Text style={{ fontFamily: fonts.semibold, fontSize: 13, color: colors.persimmonD, marginBottom: 10, textAlign: 'center' }}>
              {error}
            </Text>
          ) : null}
          <PrimaryButton
            label={submitting ? t('setup.starting') : t('setup.start')}
            fontSize={16.5}
            padding={17}
            rightIcon={submitting ? undefined : <ArrowRight size={18} />}
            onPress={onStart}
            style={submitting ? { opacity: 0.6 } : undefined}
          />
        </View>
      }
    >
      {/* header */}
      <View style={{ paddingHorizontal: 22, paddingTop: 10, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <BackButton onPress={() => nav.navigate('ChooseMode')}>
          <ChevronLeft size={18} color={colors.ink} />
        </BackButton>
        <Display style={{ fontSize: 21 }}>{t(`setup.title.${mode}`, { defaultValue: t('setup.title.default') })}</Display>
      </View>

      {/* camera preview */}
      <LinearGradient
        colors={['#3A2952', '#1c1228']}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={{
          marginHorizontal: 22,
          marginTop: 18,
          borderRadius: 22,
          height: 178,
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View style={{ opacity: 0.5 }}>
          <Person size={74} color={colors.persimmonL} strokeWidth={1.6} />
        </View>

        {/* camera ready chip */}
        <View
          style={{
            position: 'absolute',
            left: 14,
            top: 14,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            backgroundColor: 'rgba(0,0,0,0.4)',
            paddingVertical: 5,
            paddingHorizontal: 11,
            borderRadius: 999,
          }}
        >
          <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: colors.persimmon }} />
          <Text style={{ color: '#fff', fontFamily: fonts.semibold, fontSize: 12 }}>{t('setup.cameraReady')}</Text>
        </View>

        {/* equalizer */}
        <View style={{ position: 'absolute', left: 14, bottom: 14, flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 22 }}>
          {EQ_HEIGHTS.map((h, i) => (
            <View key={i} style={{ width: 3, height: `${h}%`, backgroundColor: colors.persimmonL, borderRadius: 2 }} />
          ))}
        </View>
      </LinearGradient>

      {/* fields */}
      <View style={{ paddingHorizontal: 22, paddingTop: 22, gap: 18 }}>
        {/* ROLE */}
        <View>
          <Label style={{ marginBottom: 9 }}>{t('setup.role')}</Label>
          <View style={fieldBox}>
            <TextInput
              value={role}
              onChangeText={setRole}
              placeholder={t('setup.rolePlaceholder')}
              placeholderTextColor={colors.faint}
              editable={!submitting}
              returnKeyType="done"
              style={{ flex: 1, fontFamily: fonts.semibold, fontSize: 15.5, color: colors.ink, padding: 0 }}
            />
          </View>
        </View>

        {/* INTERVIEWER STYLE */}
        <View>
          <Label style={{ marginBottom: 9 }}>{t('setup.style')}</Label>
          <View style={{ flexDirection: 'row', backgroundColor: '#EAE3D4', borderRadius: 14, padding: 4, gap: 4 }}>
            {STYLE_VALUES.map((value) => {
              const active = value === style;
              const label = t(`setup.styles.${value}`);
              return (
                <Pressable
                  key={value}
                  onPress={() => setStyle(value)}
                  disabled={submitting}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`${t('setup.style')}: ${label}`}
                  style={{
                    flex: 1,
                    alignItems: 'center',
                    paddingVertical: 10,
                    borderRadius: 11,
                    backgroundColor: active ? colors.persimmon : 'transparent',
                  }}
                >
                  <Text style={{ fontFamily: active ? fonts.bold : fonts.semibold, fontSize: 14, color: active ? '#fff' : colors.muted }}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* INTERVIEWER */}
        <View>
          <Label style={{ marginBottom: 9 }}>{t('setup.interviewer')}</Label>
          <View style={{ flexDirection: 'row', gap: 11 }}>
            {INTERVIEWERS.map((it) => {
              const active = it.value === persona;
              const personaRole = t(`setup.personas.${it.value}`);
              return (
                <Pressable
                  key={it.value}
                  onPress={() => setPersona(it.value)}
                  disabled={submitting}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`${t('setup.interviewer')} ${it.name}, ${personaRole}`}
                  style={{
                    flex: 1,
                    backgroundColor: '#fff',
                    borderRadius: 16,
                    paddingVertical: 13,
                    paddingHorizontal: 8,
                    alignItems: 'center',
                    borderWidth: active ? 2 : 1,
                    borderColor: active ? colors.persimmon : colors.hairline,
                  }}
                >
                  <LinearGradient
                    colors={it.grad}
                    start={{ x: 0.35, y: 0.3 }}
                    end={{ x: 0.8, y: 1 }}
                    style={{ width: 42, height: 42, borderRadius: 21, marginBottom: 7 }}
                  />
                  <Text style={{ fontFamily: fonts.bold, fontSize: 13.5, color: colors.ink }}>{it.name}</Text>
                  <Text style={{ fontFamily: fonts.text, fontSize: 11, color: colors.muted }}>{personaRole}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* LANGUAGE + LENGTH */}
        <View style={{ flexDirection: 'row', gap: 14 }}>
          <View style={{ flex: 1 }}>
            <Label style={{ marginBottom: 9 }}>{t('setup.language')}</Label>
            <Pressable
              onPress={() => setLangOpen(true)}
              disabled={submitting}
              accessibilityRole="button"
              accessibilityLabel={`${t('setup.language')}: ${NATIVE_NAME[locale]}`}
              style={[fieldBox, { justifyContent: 'space-between' }]}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Globe size={16} color={colors.persimmonD} />
                <Text style={{ fontFamily: fonts.semibold, fontSize: 14.5, color: colors.ink }}>{NATIVE_NAME[locale]}</Text>
              </View>
              <ChevronDown size={12} color={colors.muted} />
            </Pressable>
          </View>
          <View style={{ flex: 1 }}>
            <Label style={{ marginBottom: 9 }}>{t('setup.length')}</Label>
            <View style={{ flexDirection: 'row', backgroundColor: '#EAE3D4', borderRadius: 14, padding: 4, gap: 4 }}>
              {LENGTHS.map((m) => {
                const active = m === lengthMinutes;
                return (
                  <Pressable
                    key={m}
                    onPress={() => setLengthMinutes(m)}
                    disabled={submitting}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={`${t('setup.length')}: ${m} ${t('setup.minutes')}`}
                    style={{
                      flex: 1,
                      alignItems: 'center',
                      paddingVertical: 11,
                      borderRadius: 11,
                      backgroundColor: active ? colors.persimmon : 'transparent',
                    }}
                  >
                    <Text style={{ fontFamily: active ? fonts.bold : fonts.semibold, fontSize: 13.5, color: active ? '#fff' : colors.muted }}>{m}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={{ fontFamily: fonts.text, fontSize: 11, color: colors.faint, marginTop: 6 }}>{t('setup.minutes')}</Text>
          </View>
        </View>

        {/* TOPIC FOCUS (optional) */}
        <View>
          <Label style={{ marginBottom: 9 }}>{t('setup.topic')}</Label>
          <View style={fieldBox}>
            <TextInput
              value={topicFocus}
              onChangeText={setTopicFocus}
              placeholder={t('setup.topicPlaceholder')}
              placeholderTextColor={colors.faint}
              editable={!submitting}
              returnKeyType="done"
              style={{ flex: 1, fontFamily: fonts.semibold, fontSize: 15, color: colors.ink, padding: 0 }}
            />
          </View>
        </View>
      </View>

      <LanguagePicker visible={langOpen} onClose={() => setLangOpen(false)} />
    </ScreenScroll>
  );
}

const fieldBox = {
  backgroundColor: '#fff' as const,
  borderWidth: 1,
  borderColor: colors.hairline,
  borderRadius: 16,
  paddingVertical: 15,
  paddingHorizontal: 16,
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  justifyContent: 'space-between' as const,
};
