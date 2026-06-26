import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Linking, ScrollView, AccessibilityInfo } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { VideoTrack } from '@livekit/react-native';
import { Screen } from '../components/ui';
import { InterviewOrb } from '../components/InterviewOrb';
import { Globe, Person, Check, Captions, Mic, VideoCam, PhoneHangup } from '../icons';
import { colors, fonts } from '../theme';
import { useNav, useRouteParams } from '../navigation';
import { useInterviewRoom } from '../livekit/room';
import { api, type SessionDetail } from '../api';
import { config } from '../config';

const STATUS_LABEL: Record<string, string> = {
  connecting: 'Connecting…',
  reconnecting: 'Reconnecting…',
  waiting_for_agent: 'Waiting for interviewer…',
};
const PERSONA_NAME: Record<string, string> = { aria: 'Aria', sam: 'Sam', lena: 'Lena' };

function mmss(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export default function LiveScreen() {
  const nav = useNav();
  const { sessionId } = useRouteParams<'Live'>();
  const room = useInterviewRoom();

  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [captionsOn, setCaptionsOn] = useState(true);
  const [videoOn, setVideoOn] = useState(false); // audio-only default (D9)
  const [ending, setEnding] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [demoState, setDemoState] = useState<'speaking' | 'listening' | 'thinking'>('speaking');
  const [agentTimedOut, setAgentTimedOut] = useState(false);
  const [reconnectKey, setReconnectKey] = useState(0);

  const connectedRef = useRef(false);
  const hasBeenLiveRef = useRef(false); // once the agent has joined, the join watchdog must not re-fire on a blip
  const captionScroll = useRef<ScrollView>(null);

  // fetch session detail (persona, length, question count) + connect
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await api.getSession(sessionId);
        if (!cancelled) {
          setDetail(d);
          if (d.lengthMinutes) {
            // resume: if the interview already started, seed from time REMAINING
            // (not the full length) so a resumed session doesn't grant fresh time.
            const total = d.lengthMinutes * 60;
            const elapsed = d.startedAt ? Math.floor((Date.now() - new Date(d.startedAt).getTime()) / 1000) : 0;
            setSecondsLeft(Math.max(0, total - Math.max(0, elapsed)));
          }
        }
      } catch { /* detail is best-effort */ }
    })();
    if (config.liveEnabled) {
      (async () => {
        try {
          const { livekit } = await api.refreshToken(sessionId);
          if (cancelled) return;
          connectedRef.current = true;
          await room.connect(livekit.url, livekit.token);
        } catch { /* room.error surfaces hook-level errors */ }
      })();
    }
    return () => {
      cancelled = true;
      if (connectedRef.current) void room.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, reconnectKey]);

  // watchdog: if the interviewer never joins, surface a recoverable error (not an
  // indefinite spinner) after 15s. Only applies to the FIRST join — once we've
  // been live, a transient reconnect is handled by the status/degraded chips, not
  // by this "taking longer to join" error (which would wrongly kill a live call).
  useEffect(() => {
    if (!config.liveEnabled) return;
    if (room.status === 'live') { hasBeenLiveRef.current = true; setAgentTimedOut(false); return; }
    if (hasBeenLiveRef.current || room.status === 'reconnecting') return; // established session blip — not a join failure
    const id = setTimeout(() => setAgentTimedOut(true), 15000);
    return () => clearTimeout(id);
  }, [room.status, reconnectKey]);

  const retryConnect = () => {
    setAgentTimedOut(false);
    hasBeenLiveRef.current = false; // fresh connect attempt → re-arm the join watchdog
    void room.disconnect();
    setReconnectKey((k) => k + 1);
  };

  // The degraded chip's live region announces on appearance, but not on removal.
  // Announce recovery explicitly so VoiceOver users aren't left thinking the
  // connection is still unstable after it clears.
  const wasDegradedRef = useRef(false);
  useEffect(() => {
    const isDegraded = !!room.degraded;
    if (wasDegradedRef.current && !isDegraded) AccessibilityInfo.announceForAccessibility?.('Connection restored');
    wasDegradedRef.current = isDegraded;
  }, [room.degraded]);

  // countdown once we have a length — but PAUSE it whenever the live connection
  // isn't up (reconnecting / waiting), so a dropout doesn't burn interview time.
  // In demo mode (live disabled) it always runs.
  const timerRunning = secondsLeft != null && secondsLeft > 0 && (!config.liveEnabled || room.status === 'live');
  useEffect(() => {
    if (!timerRunning) return;
    const id = setInterval(() => setSecondsLeft((s) => (s == null ? s : Math.max(0, s - 1))), 1000);
    return () => clearInterval(id);
  }, [timerRunning]);

  // demo orb cycling when live is disabled (Expo Go)
  useEffect(() => {
    if (config.liveEnabled) return;
    const seq: Array<'speaking' | 'listening' | 'thinking'> = ['speaking', 'listening', 'thinking'];
    let i = 0;
    const id = setInterval(() => { i = (i + 1) % seq.length; setDemoState(seq[i]!); }, 2600);
    return () => clearInterval(id);
  }, []);

  const orbState = config.liveEnabled ? room.orbState : demoState;
  const personaName = detail?.persona ? PERSONA_NAME[detail.persona] ?? 'Your interviewer' : 'Your interviewer';
  const total = room.progress?.total ?? detail?.questionCount ?? 5;
  const index = room.progress?.index ?? (detail ? detail.cursorIndex + 1 : 1);
  const micPermissionDenied = !!room.error && /permission|denied|microphone|notallowed/i.test(room.error);

  const toggleMic = () => {
    const next = !micOn;
    setMicOn(next);
    if (config.liveEnabled) void room.setMicEnabled(next);
  };

  const toggleVideo = () => {
    // live mode: drive the camera off the room's REAL published state, so a denied
    // camera or a reconnect can't leave the toggle stuck "on". demo mode: cosmetic flip.
    if (config.liveEnabled) void room.setCameraEnabled(!room.cameraEnabled);
    else setVideoOn((v) => !v);
  };
  // single source of truth for the camera UI: published state when live, local flag in demo
  const cameraOn = config.liveEnabled ? room.cameraEnabled : videoOn;

  const onHangup = async () => {
    if (ending) return;
    setEnding(true);
    try { if (config.liveEnabled) await room.disconnect(); } catch { /* move on regardless */ }
    nav.replace('Analyzing', { sessionId });
  };

  const statusChip = config.liveEnabled && room.status !== 'live' && STATUS_LABEL[room.status];
  // show the degraded chip only while live — when reconnecting/connecting the
  // status chip already explains the situation (avoid stacking two warnings).
  const degradedChip = config.liveEnabled && room.status === 'live' ? room.degraded : null;
  const caption = captionsOn ? room.lastCaption : null;
  const dotCount = Math.min(Math.max(total, 1), 8);

  return (
    <Screen gradient={{ colors: ['#3A2952', '#231635', '#160E24'], start: { x: 0.5, y: 0 }, end: { x: 0.5, y: 1 } }} statusBar="light">
      <View style={{ flex: 1 }}>
        {/* top row */}
        <View style={{ paddingHorizontal: 18, paddingTop: 10, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: 'rgba(255,255,255,0.12)', paddingHorizontal: 13, paddingVertical: 7, borderRadius: 999, alignSelf: 'flex-start' }}>
              <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: colors.persimmon }} />
              <Text style={{ fontFamily: fonts.bold, fontSize: 13, color: colors.white }}>{secondsLeft == null ? '--:--' : mmss(secondsLeft)}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, alignSelf: 'flex-start' }}>
              <Globe size={13} color="rgba(255,255,255,0.85)" />
              <Text style={{ fontFamily: fonts.semibold, fontSize: 12, color: 'rgba(255,255,255,0.85)' }}>EN</Text>
            </View>
            {statusChip ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: 'rgba(255,138,92,0.18)', borderWidth: 1, borderColor: 'rgba(255,138,92,0.4)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, alignSelf: 'flex-start' }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#FF8A5C' }} />
                <Text style={{ fontFamily: fonts.semibold, fontSize: 11.5, color: '#FFC4A6' }}>{statusChip}</Text>
              </View>
            ) : null}
            {degradedChip ? (
              <View accessibilityLiveRegion="polite" accessibilityLabel={`Connection notice: ${degradedChip}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: 'rgba(255,193,102,0.16)', borderWidth: 1, borderColor: 'rgba(255,193,102,0.42)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, alignSelf: 'flex-start' }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#FFC166' }} />
                <Text style={{ fontFamily: fonts.semibold, fontSize: 11.5, color: '#FFD9A0' }}>{degradedChip}</Text>
              </View>
            ) : null}
          </View>

          <LinearGradient colors={['#48395f', '#241733']} start={{ x: 0.15, y: 0 }} end={{ x: 0.85, y: 1 }} style={{ width: 88, height: 116, borderRadius: 18, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.15)', overflow: 'hidden' }}>
            {/* placeholder silhouette, hidden once the real camera preview renders */}
            <View style={{ position: 'absolute', left: 0, right: 0, top: '46%', alignItems: 'center', transform: [{ translateY: -24 }], opacity: cameraOn ? 0.45 : 0.2 }}>
              <Person size={48} color="#fff" strokeWidth={1.5} />
            </View>
            {cameraOn && room.cameraTrackRef ? (
              <VideoTrack
                trackRef={room.cameraTrackRef as React.ComponentProps<typeof VideoTrack>['trackRef']}
                objectFit="cover"
                mirror
                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
              />
            ) : null}
            <Text style={{ position: 'absolute', left: 7, bottom: 7, fontFamily: fonts.semibold, fontSize: 10.5, color: 'rgba(255,255,255,0.8)' }}>You</Text>
          </LinearGradient>
        </View>

        {/* progress */}
        <Text style={{ textAlign: 'center', marginTop: 18, fontSize: 12, color: 'rgba(255,255,255,0.6)', fontFamily: fonts.semibold }}>
          Question {Math.min(index, total)} of {total}
        </Text>
        <View style={{ flexDirection: 'row', gap: 5, justifyContent: 'center', marginTop: 8 }}>
          {Array.from({ length: dotCount }).map((_, i) => (
            <View key={i} style={{ width: 26, height: 4, borderRadius: 2, backgroundColor: i < Math.round((index / total) * dotCount) ? colors.persimmon : 'rgba(255,255,255,0.2)' }} />
          ))}
        </View>

        {/* hero orb */}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, marginTop: -8 }}>
          <InterviewOrb orbState={orbState} name={personaName} size={188} />
          {micPermissionDenied ? (
            <View style={{ alignItems: 'center', paddingHorizontal: 32, gap: 10 }}>
              <Text style={{ fontSize: 13, color: '#FFC4A6', fontFamily: fonts.semibold, textAlign: 'center' }}>
                Microphone access is required for the interview.
              </Text>
              <Pressable onPress={() => Linking.openSettings()} style={{ backgroundColor: 'rgba(255,255,255,0.14)', paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999 }}>
                <Text style={{ color: '#fff', fontFamily: fonts.bold, fontSize: 13 }}>Open Settings</Text>
              </Pressable>
            </View>
          ) : room.error ? (
            <Text style={{ fontSize: 12.5, color: '#FFC4A6', fontFamily: fonts.semibold, textAlign: 'center', paddingHorizontal: 32 }}>{room.error}</Text>
          ) : agentTimedOut && room.status !== 'live' ? (
            <View style={{ alignItems: 'center', paddingHorizontal: 32, gap: 10 }}>
              <Text style={{ fontSize: 13, color: '#FFC4A6', fontFamily: fonts.semibold, textAlign: 'center' }}>
                The interviewer is taking longer than expected to join.
              </Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Retry connecting" onPress={retryConnect} style={{ backgroundColor: 'rgba(255,255,255,0.14)', paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999 }}>
                <Text style={{ color: '#fff', fontFamily: fonts.bold, fontSize: 13 }}>Retry</Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        {/* bottom */}
        <View style={{ paddingHorizontal: 18, paddingBottom: 8, gap: 13 }}>
          {/* caption rail (D10): speaker-tagged history + dim/italic partial,
              doubles as the accessibility / text channel */}
          {captionsOn && (room.captions.length > 0 || room.partial) ? (
            <View
              accessibilityLiveRegion="polite"
              accessibilityLabel="Live captions"
              style={{ backgroundColor: 'rgba(0,0,0,0.28)', borderRadius: 18, paddingVertical: 12, paddingHorizontal: 16, maxHeight: 132 }}
            >
              <ScrollView ref={captionScroll} onContentSizeChange={() => captionScroll.current?.scrollToEnd({ animated: true })} showsVerticalScrollIndicator={false}>
                {room.captions.slice(-6).map((c, i) => (
                  <Text key={i} style={{ fontFamily: fonts.text, fontSize: 14.5, lineHeight: 21, color: 'rgba(255,255,255,0.95)', marginBottom: 3 }}>
                    <Text style={{ fontFamily: fonts.bold, fontSize: 11, color: c.speaker === 'you' ? '#9FE1CB' : colors.persimmonL }}>{c.speaker === 'you' ? 'You  ' : `${personaName}  `}</Text>
                    {c.text}
                  </Text>
                ))}
                {room.partial ? (
                  <Text style={{ fontFamily: fonts.text, fontStyle: 'italic', fontSize: 14.5, lineHeight: 21, color: 'rgba(255,255,255,0.55)' }}>
                    <Text style={{ fontFamily: fonts.bold, fontSize: 11, color: room.partial.speaker === 'you' ? '#9FE1CB' : colors.persimmonL }}>{room.partial.speaker === 'you' ? 'You  ' : `${personaName}  `}</Text>
                    {room.partial.text}
                  </Text>
                ) : null}
              </ScrollView>
            </View>
          ) : null}

          {/* feedback chip — only when the agent actually sends one */}
          {room.lastFeedback ? (
            <View style={{ alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: 'rgba(255,138,92,0.18)', borderWidth: 1, borderColor: 'rgba(255,138,92,0.4)', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999 }}>
              <Check size={14} color="#FF8A5C" strokeWidth={2.6} />
              <Text style={{ fontFamily: fonts.bold, fontSize: 12.5, color: '#FFC4A6' }}>{room.lastFeedback}</Text>
            </View>
          ) : null}

          {/* controls */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, marginTop: 2 }}>
            <Pressable accessibilityRole="button" accessibilityLabel="Toggle captions" accessibilityState={{ selected: captionsOn }} onPress={() => setCaptionsOn((v) => !v)} style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: captionsOn ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)', alignItems: 'center', justifyContent: 'center', opacity: captionsOn ? 1 : 0.55 }}>
              <Captions size={22} color="#fff" />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={micOn ? 'Mute microphone' : 'Unmute microphone'} accessibilityState={{ selected: micOn }} onPress={toggleMic} style={{ width: 62, height: 62, borderRadius: 31, backgroundColor: micOn ? colors.persimmon : 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' }}>
              <Mic size={24} color="#fff" />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Toggle camera" accessibilityState={{ selected: cameraOn }} onPress={toggleVideo} style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: cameraOn ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)', alignItems: 'center', justifyContent: 'center', opacity: cameraOn ? 1 : 0.55 }}>
              <VideoCam size={22} color="#fff" />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="End interview" onPress={onHangup} disabled={ending} style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.persimmonDeep, alignItems: 'center', justifyContent: 'center', opacity: ending ? 0.6 : 1 }}>
              <PhoneHangup size={22} color="#fff" />
            </Pressable>
          </View>
        </View>
      </View>
    </Screen>
  );
}
