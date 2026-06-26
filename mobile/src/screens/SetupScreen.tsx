import React, { useState } from 'react';
import { View, Text, Pressable, TextInput } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ScreenScroll, Display, Label, PrimaryButton, BackButton } from '../components/ui';
import { colors, fonts } from '../theme';
import { useNav, useRouteParams } from '../navigation';
import { api, ApiError, type Persona, type Style } from '../api';
import { ChevronLeft, Person, Globe, ArrowRight } from '../icons';

const STYLES: { label: string; value: Style }[] = [
  { label: 'Friendly', value: 'friendly' },
  { label: 'Balanced', value: 'balanced' },
  { label: 'Tough', value: 'tough' },
];
const EQ_HEIGHTS = [40, 75, 55, 95, 45, 70];
const LENGTHS = [10, 20, 30] as const;

const INTERVIEWERS: { name: string; value: Persona; role: string; grad: readonly [string, string] }[] = [
  { name: 'Aria', value: 'aria', role: 'Hiring mgr', grad: ['#FFB48C', '#D8401C'] },
  { name: 'Sam', value: 'sam', role: 'Peer', grad: ['#C7B6E8', '#6E5AA8'] },
  { name: 'Lena', value: 'lena', role: 'Director', grad: ['#E7C8A0', '#A8742B'] },
];

export default function SetupScreen() {
  const nav = useNav();
  const { mode } = useRouteParams<'Setup'>();

  const [role, setRole] = useState('Product Manager');
  const [style, setStyle] = useState<Style>('balanced');
  const [persona, setPersona] = useState<Persona>('aria');
  const [lengthMinutes, setLengthMinutes] = useState<number>(30);
  const [topicFocus, setTopicFocus] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        language: 'en',
        lengthMinutes,
        topicFocus: topicFocus.trim() || undefined,
      });
      nav.navigate('Consent', { configId: res.config.id });
    } catch (e) {
      const msg = e instanceof ApiError ? e.body || e.message : e instanceof Error ? e.message : 'Something went wrong. Please try again.';
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
            label={submitting ? 'Building your interview…' : 'Start interview'}
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
        <Display style={{ fontSize: 21 }}>{({ mock: 'Set up your mock', topic_practice: 'Set up your topic practice', capability_assessment: 'Set up your assessment' } as Record<string, string>)[mode] ?? 'Set up your interview'}</Display>
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
          <Text style={{ color: '#fff', fontFamily: fonts.semibold, fontSize: 12 }}>Camera ready</Text>
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
          <Label style={{ marginBottom: 9 }}>Role</Label>
          <View style={fieldBox}>
            <TextInput
              value={role}
              onChangeText={setRole}
              placeholder="Product Manager"
              placeholderTextColor={colors.faint}
              editable={!submitting}
              returnKeyType="done"
              style={{ flex: 1, fontFamily: fonts.semibold, fontSize: 15.5, color: colors.ink, padding: 0 }}
            />
          </View>
        </View>

        {/* INTERVIEWER STYLE */}
        <View>
          <Label style={{ marginBottom: 9 }}>Interviewer style</Label>
          <View style={{ flexDirection: 'row', backgroundColor: '#EAE3D4', borderRadius: 14, padding: 4, gap: 4 }}>
            {STYLES.map((s) => {
              const active = s.value === style;
              return (
                <Pressable
                  key={s.value}
                  onPress={() => setStyle(s.value)}
                  disabled={submitting}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`Interviewer style: ${s.label}`}
                  style={{
                    flex: 1,
                    alignItems: 'center',
                    paddingVertical: 10,
                    borderRadius: 11,
                    backgroundColor: active ? colors.persimmon : 'transparent',
                  }}
                >
                  <Text style={{ fontFamily: active ? fonts.bold : fonts.semibold, fontSize: 14, color: active ? '#fff' : colors.muted }}>{s.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* INTERVIEWER */}
        <View>
          <Label style={{ marginBottom: 9 }}>Interviewer</Label>
          <View style={{ flexDirection: 'row', gap: 11 }}>
            {INTERVIEWERS.map((it) => {
              const active = it.value === persona;
              return (
                <Pressable
                  key={it.value}
                  onPress={() => setPersona(it.value)}
                  disabled={submitting}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`Interviewer ${it.name}, ${it.role}`}
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
                  <Text style={{ fontFamily: fonts.text, fontSize: 11, color: colors.muted }}>{it.role}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* LANGUAGE + LENGTH */}
        <View style={{ flexDirection: 'row', gap: 14 }}>
          <View style={{ flex: 1 }}>
            <Label style={{ marginBottom: 9 }}>Language</Label>
            <View style={[fieldBox, { justifyContent: 'flex-start', gap: 8 }]}>
              <Globe size={16} color={colors.persimmonD} />
              <Text style={{ fontFamily: fonts.semibold, fontSize: 14.5, color: colors.ink }}>English</Text>
            </View>
            <Text style={{ fontFamily: fonts.text, fontSize: 11, color: colors.faint, marginTop: 6 }}>More languages coming soon</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Label style={{ marginBottom: 9 }}>Length</Label>
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
                    accessibilityLabel={`Length: ${m} minutes`}
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
            <Text style={{ fontFamily: fonts.text, fontSize: 11, color: colors.faint, marginTop: 6 }}>minutes</Text>
          </View>
        </View>

        {/* TOPIC FOCUS (optional) */}
        <View>
          <Label style={{ marginBottom: 9 }}>Topic focus (optional)</Label>
          <View style={fieldBox}>
            <TextInput
              value={topicFocus}
              onChangeText={setTopicFocus}
              placeholder="e.g. metrics, leadership, system design"
              placeholderTextColor={colors.faint}
              editable={!submitting}
              returnKeyType="done"
              style={{ flex: 1, fontFamily: fonts.semibold, fontSize: 15, color: colors.ink, padding: 0 }}
            />
          </View>
        </View>
      </View>
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
