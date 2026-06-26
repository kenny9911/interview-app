// LiveKit room controller for the live interview. Connects to the session room,
// enables the mic, plays the agent's audio (RN auto-renders subscribed audio via
// the AudioSession), and surfaces the interviewer "orb state" the agent publishes
// over the data channel. Native module → dev build only (not Expo Go).
// Docs: https://docs.livekit.io/transport/sdk-platforms/expo/
import { useCallback, useEffect, useRef, useState } from 'react';
// registerGlobals() also wires up the iOS audio manager (v2.11+) which configures
// the AVAudioSession (playAndRecord/speaker) and starts/stops it automatically as
// the mic engine enables — so we must NOT call start/stopAudioSession ourselves,
// or it conflicts and the mic captures silence / remote audio is inaudible on device.
import { registerGlobals } from '@livekit/react-native';
import { Room, RoomEvent, ConnectionState, ConnectionQuality, Track, type RemoteParticipant, type LocalParticipant, type LocalTrackPublication } from 'livekit-client';

export type OrbState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'interrupted';
export type LiveStatus = 'idle' | 'connecting' | 'waiting_for_agent' | 'live' | 'reconnecting' | 'ended' | 'error';

let globalsRegistered = false;
function ensureGlobals() {
  if (globalsRegistered) return;
  try {
    registerGlobals();
    globalsRegistered = true;
  } catch {
    // running in Expo Go (no native WebRTC) — caller will surface an error
  }
}

function decodeUtf8(bytes: Uint8Array): string {
  if (typeof TextDecoder !== 'undefined') return new TextDecoder().decode(bytes);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return s;
}

export interface QuestionProgress { index: number; total: number }
export interface CaptionLine { speaker: 'you' | 'agent'; text: string }
// Minimal TrackReference shape <VideoTrack> needs to render the local camera.
export interface CameraTrackRef { participant: LocalParticipant; publication: LocalTrackPublication; source: Track.Source }

export interface UseInterviewRoom {
  status: LiveStatus;
  orbState: OrbState;
  level: number; // 0..1, drives the listening ring / speaking bars
  lastCaption: string | null;
  captions: CaptionLine[]; // finalized caption history (D10)
  partial: CaptionLine | null; // in-progress (dim/italic) caption
  progress: QuestionProgress | null;
  lastFeedback: string | null;
  degraded: string | null; // non-null = a short reason the experience is degraded (poor link / provider fallback)
  cameraEnabled: boolean;
  cameraTrackRef: CameraTrackRef | null; // pass to <VideoTrack> to render the local camera
  error: string | null;
  connect: (url: string, token: string) => Promise<void>;
  disconnect: () => Promise<void>;
  setMicEnabled: (enabled: boolean) => Promise<void>;
  setCameraEnabled: (enabled: boolean) => Promise<void>;
}

export function useInterviewRoom(): UseInterviewRoom {
  const roomRef = useRef<Room | null>(null);
  const [status, setStatus] = useState<LiveStatus>('idle');
  const [orbState, setOrbState] = useState<OrbState>('idle');
  const [level, setLevel] = useState(0);
  const [lastCaption, setLastCaption] = useState<string | null>(null);
  const [captions, setCaptions] = useState<CaptionLine[]>([]);
  const [partial, setPartial] = useState<CaptionLine | null>(null);
  const [progress, setProgress] = useState<QuestionProgress | null>(null);
  const [lastFeedback, setLastFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Degraded experience surfaces from two independent sources, combined below:
  //  - netDegraded: native ConnectionQuality went Poor/Lost for any participant
  //  - agentDegraded: the agent worker published a {type:'degraded'} reason
  const [netDegraded, setNetDegraded] = useState(false);
  const [agentDegraded, setAgentDegraded] = useState<string | null>(null);
  const poorPeers = useRef<Set<string>>(new Set());
  const degraded = agentDegraded ?? (netDegraded ? 'Connection is unstable' : null);
  const [cameraEnabled, setCameraEnabledState] = useState(false);
  const [cameraTrackRef, setCameraTrackRef] = useState<CameraTrackRef | null>(null);

  const disconnect = useCallback(async () => {
    const room = roomRef.current;
    roomRef.current = null;
    if (room) {
      try { await room.disconnect(); } catch { /* ignore */ }
    }
    // (audio session is stopped automatically by the SDK's iOS audio manager)
    poorPeers.current.clear();
    setNetDegraded(false);
    setAgentDegraded(null);
    setCameraEnabledState(false);
    setCameraTrackRef(null);
    setStatus('ended');
    setOrbState('idle');
  }, []);

  const connect = useCallback(async (url: string, token: string) => {
    setError(null);
    poorPeers.current.clear();
    setNetDegraded(false);
    setAgentDegraded(null);
    setStatus('connecting');
    ensureGlobals();
    if (!globalsRegistered) {
      setStatus('error');
      setError('Live audio needs a development build (not Expo Go).');
      return;
    }
    try {
      // NB: do NOT call AudioSession.startAudioSession() here — registerGlobals()'s
      // iOS audio manager starts/configures it automatically when the mic enables.
      const room = new Room({ adaptiveStream: true, dynacast: true });
      roomRef.current = room;

      // On (re)connect, derive liveness from who's actually in the room. A resume
      // reconnect transitions back to Connected WITHOUT re-emitting
      // ParticipantConnected for the agent that stayed, so we must re-check here —
      // otherwise status sticks at 'waiting_for_agent' and the timer/degraded chip
      // (which gate on 'live') never recover, and the join watchdog false-fires.
      const deriveLive = () => {
        const hasAgent = Array.from(room.remoteParticipants.values()).some((p) => p.identity.startsWith('agent-'));
        setStatus(hasAgent ? 'live' : 'waiting_for_agent');
      };
      room.on(RoomEvent.ConnectionStateChanged, (s) => {
        if (s === ConnectionState.Connected) deriveLive();
        else if (s === ConnectionState.Reconnecting) setStatus('reconnecting');
        else if (s === ConnectionState.Disconnected) setStatus('ended');
      });
      room.on(RoomEvent.Reconnected, deriveLive); // belt-and-suspenders if Connected doesn't re-fire
      room.on(RoomEvent.ParticipantConnected, (p: RemoteParticipant) => {
        if (p.identity.startsWith('agent-')) setStatus('live');
      });
      // Camera state is event-driven so it's always authoritative: a publish (incl.
      // a republish after reconnect) sets the preview ref; an unpublish clears it.
      // setCameraEnabled() below just triggers the action — these reconcile the UI,
      // so a denied/failed camera never leaves the toggle stuck "on".
      room.on(RoomEvent.LocalTrackPublished, (pub) => {
        if (pub.source === Track.Source.Camera) {
          setCameraTrackRef({ participant: room.localParticipant, publication: pub, source: Track.Source.Camera });
          setCameraEnabledState(true);
        }
      });
      room.on(RoomEvent.LocalTrackUnpublished, (pub) => {
        if (pub.source === Track.Source.Camera) {
          setCameraTrackRef(null);
          setCameraEnabledState(false);
        }
      });
      // Track which peers report a poor/lost link; degraded = at least one does.
      room.on(RoomEvent.ConnectionQualityChanged, (quality, participant) => {
        const id = participant?.identity ?? 'local';
        if (quality === ConnectionQuality.Poor || quality === ConnectionQuality.Lost) poorPeers.current.add(id);
        else poorPeers.current.delete(id);
        setNetDegraded(poorPeers.current.size > 0);
      });
      room.on(RoomEvent.DataReceived, (payload) => {
        try {
          const msg = JSON.parse(decodeUtf8(payload)) as { type: string; state?: OrbState; level?: number; text?: string; index?: number; total?: number; speaker?: 'you' | 'agent'; isFinal?: boolean; reason?: string | null };
          if (msg.type === 'agent_state' && msg.state) {
            setOrbState(msg.state);
            if (typeof msg.level === 'number') setLevel(msg.level);
          } else if (msg.type === 'caption' && typeof msg.text === 'string') {
            const speaker: 'you' | 'agent' = msg.speaker === 'you' ? 'you' : 'agent';
            const line: CaptionLine = { speaker, text: msg.text };
            if (msg.isFinal === false) {
              setPartial(line);
            } else {
              setLastCaption(msg.text);
              setPartial(null);
              setCaptions((prev) => [...prev, line].slice(-30)); // bounded history
            }
          } else if (msg.type === 'current_question' && typeof msg.index === 'number' && typeof msg.total === 'number') {
            setProgress({ index: msg.index, total: msg.total });
          } else if (msg.type === 'feedback' && typeof msg.text === 'string') {
            setLastFeedback(msg.text);
          } else if (msg.type === 'degraded') {
            // reason:null explicitly clears; a string sets it; absent → generic.
            setAgentDegraded(msg.reason === null ? null : (typeof msg.reason === 'string' ? msg.reason : 'Audio quality is degraded'));
          }
        } catch { /* non-JSON data ignored */ }
      });

      await room.connect(url, token);
      await room.localParticipant.setMicrophoneEnabled(true);
      // if an agent is already present, go live immediately
      const hasAgent = Array.from(room.remoteParticipants.values()).some((p) => p.identity.startsWith('agent-'));
      if (hasAgent) setStatus('live');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'connection failed';
      // tear down FIRST (disconnect() forces status 'ended'), then set the
      // terminal 'error' state so it isn't immediately overwritten.
      await disconnect();
      setStatus('error');
      setError(msg);
    }
  }, [disconnect]);

  const setMicEnabled = useCallback(async (enabled: boolean) => {
    try { await roomRef.current?.localParticipant.setMicrophoneEnabled(enabled); } catch { /* ignore */ }
  }, []);

  const setCameraEnabled = useCallback(async (enabled: boolean) => {
    const room = roomRef.current;
    if (!room) return;
    // Just trigger the action; the LocalTrackPublished/Unpublished handlers above
    // reconcile cameraEnabled + cameraTrackRef. On failure (denied / no camera,
    // e.g. the iOS Simulator) no publish event fires, so the state stays off.
    try { await room.localParticipant.setCameraEnabled(enabled); }
    catch { setCameraTrackRef(null); setCameraEnabledState(false); }
  }, []);

  useEffect(() => () => { void disconnect(); }, [disconnect]);

  return { status, orbState, level, lastCaption, captions, partial, progress, lastFeedback, degraded, cameraEnabled, cameraTrackRef, error, connect, disconnect, setMicEnabled, setCameraEnabled };
}
