import React, { useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { ScreenScroll, Display, Label, T, PrimaryButton, BackButton, IconCircle } from '../components/ui';
import { colors, fonts, radius } from '../theme';
import { useNav, useRouteParams } from '../navigation';
import { ChevronLeft, ArrowRight, Mic, VideoCam, Captions, Lock } from '../icons';
import { api, ApiError } from '../api';
import { config } from '../config';

// A small Atelier-styled toggle pill (custom Switch). Locked toggles render the
// "on" track but ignore presses.
function Toggle({ value, onToggle, locked }: { value: boolean; onToggle?: () => void; locked?: boolean }) {
  const on = value;
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: on, disabled: !!locked }}
      onPress={locked ? undefined : onToggle}
      hitSlop={8}
      style={{
        width: 50,
        height: 30,
        borderRadius: 999,
        padding: 3,
        justifyContent: 'center',
        backgroundColor: on ? colors.persimmon : colors.track,
        opacity: locked ? 0.85 : 1,
      }}
    >
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: 12,
          backgroundColor: colors.white,
          alignSelf: on ? 'flex-end' : 'flex-start',
          shadowColor: colors.black,
          shadowOpacity: 0.18,
          shadowRadius: 3,
          shadowOffset: { width: 0, height: 1 },
          elevation: 2,
        }}
      />
    </Pressable>
  );
}

function ScopeRow({
  icon,
  tint,
  title,
  subtitle,
  value,
  onToggle,
  locked,
}: {
  icon: React.ReactNode;
  tint: string;
  title: string;
  subtitle: string;
  value: boolean;
  onToggle?: () => void;
  locked?: boolean;
}) {
  return (
    <View
      style={{
        backgroundColor: colors.white,
        borderWidth: 1,
        borderColor: colors.hairline,
        borderRadius: 18,
        paddingVertical: 15,
        paddingHorizontal: 16,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
      }}
    >
      <IconCircle bg={tint} size={42} br={13}>
        {icon}
      </IconCircle>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ fontFamily: fonts.bold, fontSize: 15.5, color: colors.ink }}>{title}</Text>
          {locked && (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                backgroundColor: colors.tintSand,
                paddingVertical: 2,
                paddingHorizontal: 8,
                borderRadius: 999,
              }}
            >
              <Lock size={10} color={colors.tintSandText} />
              <Text style={{ fontFamily: fonts.bold, fontSize: 10.5, color: colors.tintSandText }}>Required</Text>
            </View>
          )}
        </View>
        <Text style={{ fontFamily: fonts.text, fontSize: 13, color: colors.muted, marginTop: 2 }}>{subtitle}</Text>
      </View>
      <Toggle value={value} onToggle={onToggle} locked={locked} />
    </View>
  );
}

export default function ConsentScreen() {
  const nav = useNav();
  const { configId } = useRouteParams<'Consent'>();

  const [camera, setCamera] = useState(false);
  const [recording, setRecording] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onContinue() {
    if (loading) return;
    setError(null);

    // UI-only demo mode (Expo Go without a backend): skip the network call.
    if (!config.liveEnabled) {
      nav.replace('Live', { sessionId: `demo-${configId}` });
      return;
    }

    setLoading(true);
    try {
      const res = await api.startSession(configId, { mic: true, camera, recording });
      nav.replace('Live', { sessionId: res.sessionId });
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? `Couldn't start your interview (${e.status}). Please try again.`
          : "Couldn't start your interview. Check your connection and try again.";
      setError(msg);
      setLoading(false);
    }
  }

  return (
    <ScreenScroll
      footer={
        <View style={{ paddingHorizontal: 22, paddingBottom: 8, paddingTop: 10 }}>
          {error && (
            <Text
              style={{
                fontFamily: fonts.semibold,
                fontSize: 13,
                color: colors.persimmonD,
                textAlign: 'center',
                marginBottom: 12,
              }}
            >
              {error}
            </Text>
          )}
          <PrimaryButton
            label={loading ? 'Building your interview…' : 'Allow & continue'}
            fontSize={16.5}
            padding={17}
            rightIcon={loading ? <ActivityIndicator color={colors.white} /> : <ArrowRight size={18} />}
            onPress={onContinue}
          />
          <Text
            style={{
              fontFamily: fonts.text,
              fontSize: 12,
              color: colors.muted,
              textAlign: 'center',
              marginTop: 12,
            }}
          >
            Mic access is required — you can also continue in text-only mode.
          </Text>
        </View>
      }
    >
      {/* header */}
      <View style={{ paddingHorizontal: 22, paddingTop: 10, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <BackButton onPress={() => nav.goBack()}>
          <ChevronLeft size={18} color={colors.ink} />
        </BackButton>
        <Display style={{ fontSize: 21 }}>Before we start</Display>
      </View>

      {/* intro */}
      <View style={{ paddingHorizontal: 22, paddingTop: 16 }}>
        <T style={{ fontSize: 15, lineHeight: 22, color: colors.muted2 }}>
          Choose what viva can access during your interview. You stay in control — you can stop anytime.
        </T>
      </View>

      {/* scope toggles */}
      <View style={{ paddingHorizontal: 22, paddingTop: 20 }}>
        <Label style={{ marginBottom: 11 }}>Access</Label>
        <View style={{ gap: 12 }}>
          <ScopeRow
            icon={<Mic size={20} color={colors.persimmonD} />}
            tint={colors.tintCoral}
            title="Microphone"
            subtitle="So you can answer out loud."
            value
            locked
          />
          <ScopeRow
            icon={<VideoCam size={20} color={colors.tintVioletText} />}
            tint={colors.tintViolet}
            title="Camera"
            subtitle="Optional — for a more lifelike session."
            value={camera}
            onToggle={() => setCamera((v) => !v)}
          />
          <ScopeRow
            icon={<Captions size={20} color={colors.tintSandText} />}
            tint={colors.tintSand}
            title="Recording"
            subtitle="Optional — save audio to revisit later."
            value={recording}
            onToggle={() => setRecording((v) => !v)}
          />
        </View>
      </View>

      {/* reassurance */}
      <View style={{ paddingHorizontal: 22, paddingTop: 22 }}>
        <View
          style={{
            backgroundColor: colors.tintViolet,
            borderRadius: radius.lg,
            padding: 16,
            flexDirection: 'row',
            gap: 12,
          }}
        >
          <Lock size={16} color={colors.tintVioletText} />
          <T style={{ flex: 1, fontSize: 13.5, lineHeight: 20, color: colors.tintVioletText }}>
            Your scoring is based only on what you say — never your tone, accent, or appearance. You can stop the
            interview at any time.
          </T>
        </View>
      </View>
    </ScreenScroll>
  );
}
