// Dev harness to validate the full live stack on a real device:
// API (create config + start session) → LiveKit room → agent worker → backend
// brain → audio. Reachable from Welcome when EXPO_PUBLIC_LIVE_ENABLED=true.
// This is a developer tool; the production flow is Setup → Consent → Live.
import React, { useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, ScrollView } from 'react-native';
import { Screen, Display, PrimaryButton } from '../components/ui';
import { Orb } from '../components/Orb';
import { colors, fonts } from '../theme';
import { useNav } from '../navigation';
import { api, ApiError } from '../api';
import { useInterviewRoom } from '../livekit/room';
import { config } from '../config';

export default function LiveTestScreen() {
  const nav = useNav();
  const room = useInterviewRoom();
  const [phase, setPhase] = useState<'idle' | 'starting' | 'connected' | 'ended' | 'error'>('idle');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [score, setScore] = useState<number | null>(null);

  async function start() {
    setError(null);
    setPhase('starting');
    try {
      const { config: cfg } = await api.createConfig({
        mode: 'mock', role: 'Product Manager', persona: 'aria', style: 'balanced',
        language: 'en', lengthMinutes: 10, topicFocus: 'product management',
      });
      const sess = await api.startSession(cfg.id);
      setSessionId(sess.sessionId);
      await room.connect(sess.livekit.url, sess.livekit.token);
      setPhase('connected');
    } catch (e) {
      setPhase('error');
      setError(e instanceof ApiError ? `API ${e.status}: ${e.body}` : e instanceof Error ? e.message : 'failed');
    }
  }

  async function end() {
    await room.disconnect();
    setPhase('ended');
    if (sessionId) {
      try {
        const { report } = await api.complete(sessionId);
        setScore(report.overallScore);
      } catch { /* report may need turns */ }
    }
  }

  return (
    <Screen gradient={{ colors: ['#3A2952', '#241634', '#170E26'], start: { x: 0.5, y: 0 }, end: { x: 0.5, y: 0.9 } }} statusBar="light">
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 24 }}>
        <Pressable onPress={() => nav.goBack()}><Text style={{ color: 'rgba(255,255,255,0.7)', fontFamily: fonts.semibold }}>‹ Back</Text></Pressable>
        <Display style={{ color: '#fff', fontSize: 24, marginTop: 12 }}>Live stack test</Display>
        <Text style={{ color: 'rgba(255,255,255,0.6)', fontFamily: fonts.text, marginTop: 6 }}>API: {config.apiUrl}</Text>

        <View style={{ alignItems: 'center', marginVertical: 28 }}>
          <Orb size={150} rings={room.orbState === 'listening' ? 2 : 1} glow voiceBars={room.orbState === 'speaking'} />
          <Text style={{ color: colors.persimmonL, fontFamily: fonts.bold, marginTop: 14 }}>{room.orbState.toUpperCase()}</Text>
        </View>

        <Text style={{ color: '#fff', fontFamily: fonts.semibold }}>App phase: {phase}</Text>
        <Text style={{ color: '#fff', fontFamily: fonts.text, marginTop: 4 }}>Room status: {room.status}</Text>
        {room.lastCaption ? <Text style={{ color: 'rgba(255,255,255,0.85)', fontFamily: fonts.text, marginTop: 10, fontStyle: 'italic' }}>“{room.lastCaption}”</Text> : null}
        {error ? <Text style={{ color: '#FFC4A6', fontFamily: fonts.text, marginTop: 10 }}>{error}</Text> : null}
        {room.error ? <Text style={{ color: '#FFC4A6', fontFamily: fonts.text, marginTop: 6 }}>{room.error}</Text> : null}
        {score != null ? <Text style={{ color: colors.persimmonL, fontFamily: fonts.display, fontSize: 28, marginTop: 14 }}>Score: {score}</Text> : null}

        <View style={{ marginTop: 28, gap: 12 }}>
          {phase === 'starting' ? <ActivityIndicator color={colors.persimmon} /> : null}
          {phase === 'idle' || phase === 'error' || phase === 'ended' ? (
            <PrimaryButton label="Start live interview" onPress={start} />
          ) : null}
          {phase === 'connected' ? (
            <Pressable onPress={end} style={{ backgroundColor: colors.persimmonDeep, borderRadius: 16, padding: 16, alignItems: 'center' }}>
              <Text style={{ color: '#fff', fontFamily: fonts.bold }}>End interview</Text>
            </Pressable>
          ) : null}
        </View>
      </ScrollView>
    </Screen>
  );
}
