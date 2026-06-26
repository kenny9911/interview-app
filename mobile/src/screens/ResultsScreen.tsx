import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { ScreenScroll, Display, Label, T, PrimaryButton } from '../components/ui';
import { colors, fonts, radius } from '../theme';
import { useNav, useRouteParams } from '../navigation';
import { api, ApiError, type Report, type Mode } from '../api';

const RING_R = 74;
const RING_CIRC = 2 * Math.PI * RING_R; // ~465

function isNotReady(err: unknown): boolean {
  if (!(err instanceof ApiError)) return false;
  if (err.status !== 404) return false;
  return err.body.includes('report_not_ready');
}

function cap(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function ResultsScreen() {
  const nav = useNav();
  const { sessionId } = useRouteParams<'Results'>();

  const [report, setReport] = useState<Report | null>(null);
  const [mode, setMode] = useState<Mode>('mock');
  const [configId, setConfigId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAffect, setShowAffect] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;
    let attempt = 0;
    const MAX_ATTEMPTS = 10;
    const DELAY = 1500;

    async function load() {
      while (!cancelled.current) {
        try {
          const { report: r } = await api.getReport(sessionId);
          if (!cancelled.current) setReport(r);
          return;
        } catch (e) {
          if (cancelled.current) return;
          if (isNotReady(e) && attempt < MAX_ATTEMPTS - 1) {
            attempt += 1;
            await new Promise((res) => setTimeout(res, DELAY));
            continue;
          }
          if (!cancelled.current) {
            setError(
              isNotReady(e)
                ? 'Your report is still being prepared. Please try again in a moment.'
                : 'We couldn’t load your results.'
            );
          }
          return;
        }
      }
    }

    load();
    return () => {
      cancelled.current = true;
    };
  }, [sessionId, reloadKey]);

  // session mode (for "Practice again" → re-enter Setup with the same mode)
  useEffect(() => {
    let active = true;
    api.getSession(sessionId).then((d) => { if (active) { if (d.mode) setMode(d.mode); if (d.configId) setConfigId(d.configId); } }).catch(() => {});
    return () => { active = false; };
  }, [sessionId]);

  function retry() {
    setReport(null);
    setError(null);
    setReloadKey((k) => k + 1);
  }

  // ---- Loading state ----
  if (!report && !error) {
    return (
      <ScreenScroll>
        <View style={{ alignItems: 'center', justifyContent: 'center', paddingTop: 120, paddingHorizontal: 22, gap: 16 }}>
          <ActivityIndicator color={colors.persimmon} size="large" />
          <Display style={{ fontSize: 22, marginTop: 8 }}>Analyzing…</Display>
          <T style={{ fontSize: 13.5, color: colors.muted2, textAlign: 'center', lineHeight: 19 }}>
            Scoring your interview and writing your feedback.
          </T>
        </View>
      </ScreenScroll>
    );
  }

  // ---- Error state ----
  if (error) {
    return (
      <ScreenScroll
        footer={
          <View style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 22, paddingTop: 18, paddingBottom: 8 }}>
            <Pressable
              onPress={() => nav.navigate('Home')}
              style={({ pressed }) => ({
                flex: 1,
                backgroundColor: colors.white,
                borderWidth: 1,
                borderColor: colors.hairline,
                borderRadius: 16,
                paddingVertical: 15,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed ? 0.95 : 1,
              })}
            >
              <Text style={{ fontFamily: fonts.bold, fontSize: 14.5, color: colors.ink }}>Home</Text>
            </Pressable>
            <PrimaryButton
              label="Retry"
              fontSize={14.5}
              padding={15}
              style={{ flex: 1.3, borderRadius: 16 }}
              onPress={retry}
            />
          </View>
        }
      >
        <View style={{ alignItems: 'center', justifyContent: 'center', paddingTop: 120, paddingHorizontal: 22, gap: 12 }}>
          <Label style={{ fontSize: 11, letterSpacing: 1.5, color: colors.persimmonD }}>SOMETHING WENT WRONG</Label>
          <Display style={{ fontSize: 22, marginTop: 4, textAlign: 'center' }}>Results unavailable</Display>
          <T style={{ fontSize: 13.5, color: colors.muted2, textAlign: 'center', lineHeight: 19 }}>{error}</T>
        </View>
      </ScreenScroll>
    );
  }

  // ---- Ready ----
  const r = report as Report;
  const score = Math.max(0, Math.min(100, r.overallScore));
  const dashOffset = RING_CIRC * (1 - score / 100);

  return (
    <ScreenScroll
      footer={
        <View style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 22, paddingTop: 18, paddingBottom: 8 }}>
          <Pressable
            onPress={() => nav.navigate('Transcript', { sessionId })}
            style={({ pressed }) => ({
              flex: 1,
              backgroundColor: colors.white,
              borderWidth: 1,
              borderColor: colors.hairline,
              borderRadius: 16,
              paddingVertical: 15,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.95 : 1,
            })}
          >
            <Text style={{ fontFamily: fonts.bold, fontSize: 14.5, color: colors.ink }}>Transcript</Text>
          </Pressable>
          <PrimaryButton
            label="Practice again"
            fontSize={14.5}
            padding={15}
            style={{ flex: 1.3, borderRadius: 16 }}
            onPress={() => (configId ? nav.navigate('Consent', { configId }) : nav.navigate('Setup', { mode }))}
          />
        </View>
      }
    >
      {/* header */}
      <View style={{ paddingHorizontal: 22, paddingTop: 10, alignItems: 'center' }}>
        <Pressable
          onPress={() => nav.reset({ index: 0, routes: [{ name: 'Home' }] })}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Done — back to home"
          style={{ position: 'absolute', right: 22, top: 10 }}
        >
          <Text style={{ fontFamily: fonts.bold, fontSize: 15, color: colors.persimmonD }}>Done</Text>
        </Pressable>
        <Label style={{ fontSize: 11, letterSpacing: 1.5, color: colors.persimmonD }}>INTERVIEW COMPLETE</Label>
        <Display style={{ fontSize: 24, marginTop: 6 }}>Your results</Display>
      </View>

      {/* score ring */}
      <View style={{ alignItems: 'center', marginTop: 22 }}>
        <View
          style={{ width: 172, height: 172 }}
          accessible
          accessibilityLabel={`Overall score ${score} out of 100, ${r.band}`}
        >
          <Svg width={172} height={172} viewBox="0 0 172 172">
            <Circle cx={86} cy={86} r={RING_R} fill="none" stroke={colors.track} strokeWidth={14} />
            <Circle
              cx={86}
              cy={86}
              r={RING_R}
              fill="none"
              stroke={colors.persimmon}
              strokeWidth={14}
              strokeLinecap="round"
              strokeDasharray={`${RING_CIRC}`}
              strokeDashoffset={dashOffset}
              transform="rotate(-90 86 86)"
            />
          </Svg>
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
            <Display style={{ fontSize: 48, lineHeight: 48 }}>{String(score)}</Display>
            <Text style={{ fontFamily: fonts.bold, fontSize: 13, color: colors.persimmonD, letterSpacing: 0.5 }}>
              {r.band.toUpperCase()}
            </Text>
          </View>
        </View>

        {/* no-affect footnote / tooltip */}
        <Pressable
          onPress={() => setShowAffect((v) => !v)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="How scoring works"
          accessibilityState={{ expanded: showAffect }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 12, paddingHorizontal: 16 }}
        >
          <View
            style={{
              width: 16,
              height: 16,
              borderRadius: 8,
              borderWidth: 1.2,
              borderColor: colors.muted,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontFamily: fonts.bold, fontSize: 10, color: colors.muted2, lineHeight: 12 }}>i</Text>
          </View>
          <Text style={{ fontFamily: fonts.semibold, fontSize: 11.5, color: colors.muted2 }}>How scoring works</Text>
        </Pressable>
        {showAffect ? (
          <View
            style={{
              marginTop: 10,
              marginHorizontal: 22,
              backgroundColor: colors.tintViolet,
              borderRadius: radius.md,
              paddingHorizontal: 14,
              paddingVertical: 12,
            }}
          >
            <T style={{ fontSize: 12, lineHeight: 17, color: colors.tintVioletText, textAlign: 'center' }}>
              {r.noAffectStatement}
            </T>
          </View>
        ) : null}
      </View>

      {/* metric bars */}
      <View style={{ paddingHorizontal: 22, paddingTop: 24, gap: 14 }}>
        {r.competencyScores.map((m) => {
          const v = Math.max(0, Math.min(100, m.score));
          return (
            <View key={m.competency} accessible accessibilityLabel={`${cap(m.competency)}: ${v} out of 100`}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text style={{ fontFamily: fonts.semibold, fontSize: 13.5, color: colors.ink }}>{cap(m.competency)}</Text>
                <Text style={{ fontFamily: fonts.semibold, fontSize: 13.5, color: colors.ink }}>{String(v)}</Text>
              </View>
              <View style={{ height: 7, backgroundColor: colors.track, borderRadius: 4, overflow: 'hidden' }}>
                <View style={{ width: `${v}%`, height: '100%', backgroundColor: colors.plum2, borderRadius: 4 }} />
              </View>
            </View>
          );
        })}
      </View>

      {/* feedback cards */}
      <View style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 22, paddingTop: 20 }}>
        <View style={{ flex: 1, backgroundColor: colors.tintSand, borderRadius: radius.lg, padding: 15 }}>
          <Text style={{ fontFamily: fonts.bold, fontSize: 11, letterSpacing: 0.9, color: colors.tintSandText, marginBottom: 8 }}>STOOD OUT</Text>
          <T style={{ fontSize: 12.5, lineHeight: 17.5, color: '#5a4422' }}>{r.stoodOut}</T>
        </View>
        <View style={{ flex: 1, backgroundColor: colors.tintCoral, borderRadius: radius.lg, padding: 15 }}>
          <Text style={{ fontFamily: fonts.bold, fontSize: 11, letterSpacing: 0.9, color: '#C0492A', marginBottom: 8 }}>WORK ON</Text>
          <T style={{ fontSize: 12.5, lineHeight: 17.5, color: '#5e2c1c' }}>{r.workOn}</T>
        </View>
      </View>

      {/* per-question feedback (RESULTS-4) */}
      {r.perQuestion.length > 0 ? (
        <View style={{ paddingHorizontal: 22, paddingTop: 24 }}>
          <Label style={{ marginBottom: 12 }}>Question by question</Label>
          <View style={{ gap: 12 }}>
            {r.perQuestion.map((q, i) => (
              <View key={q.questionId || i} style={{ backgroundColor: colors.white, borderWidth: 1, borderColor: colors.hairline, borderRadius: radius.lg, padding: 15 }}>
                <Text style={{ fontFamily: fonts.bold, fontSize: 13.5, color: colors.ink, marginBottom: 6 }}>{q.question}</Text>
                <T style={{ fontSize: 12.5, lineHeight: 18, color: colors.muted2 }}>{q.feedback}</T>
                {q.evidenceQuote ? (
                  <View style={{ marginTop: 10, borderLeftWidth: 2, borderLeftColor: colors.persimmonL, paddingLeft: 10 }}>
                    <Text style={{ fontFamily: fonts.text, fontStyle: 'italic', fontSize: 12, color: colors.muted, lineHeight: 17 }}>“{q.evidenceQuote}”</Text>
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </ScreenScroll>
  );
}
