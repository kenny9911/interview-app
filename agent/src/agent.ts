// viva LiveKit voice agent worker.
//
// Joins an interview room, runs the realtime voice pipeline (Silero VAD +
// Deepgram STT + Cartesia TTS with built-in turn detection & barge-in), and
// drives each turn through the backend brain (/begin, /next-turn, /complete).
// The interviewer's spoken lines come from the backend, so the four-agent
// orchestration lives in one tested place and this worker owns only audio I/O.
//
// Run the connectivity spike first (npm run spike), then `npm run dev`.
// Refs: https://docs.livekit.io/agents/  https://docs.livekit.io/reference/agents-js/
import { fileURLToPath } from 'node:url';
import { cli, defineAgent, voice, WorkerOptions, type JobContext } from '@livekit/agents';
import * as silero from '@livekit/agents-plugin-silero';
import * as deepgram from '@livekit/agents-plugin-deepgram';
import * as cartesia from '@livekit/agents-plugin-cartesia';
import { env, assertLiveCreds } from './env.js';
import { BackendClient, type TurnReply } from './backendClient.js';

type Style = 'friendly' | 'balanced' | 'tough';

// Spoken when a turn fails after the client's retries — keeps the conversation
// alive instead of dead air, and invites the candidate to repeat their answer.
const BRIDGE_LINE = "Sorry — I lost that for a moment. Could you say that again?";

// Spoken if the very first backend call (begin) fails — we don't want the
// candidate staring at a silent orb on startup. The first is a holding line
// before a single retry; the second is the apology if that retry also fails.
const STARTUP_RETRY_LINE = "Sorry — I'm having trouble starting. Give me just a moment.";
const STARTUP_FAILED_LINE = "Sorry — I'm still having trouble getting started. Please hang on, or try rejoining in a moment.";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Per-style endpointing (seconds) — mirrors server/src/voice/endpointer.ts (D5).
const ENDPOINTING: Record<Style, { minDelay: number; maxDelay: number }> = {
  friendly: { minDelay: 0.7, maxDelay: 4.0 },
  balanced: { minDelay: 0.5, maxDelay: 3.0 },
  tough: { minDelay: 0.35, maxDelay: 2.0 },
};

// LiveKit AgentState -> the orb state the app renders (docs/15-decisions.md D7).
const ORB: Record<string, string> = {
  initializing: 'idle', idle: 'idle', listening: 'listening', thinking: 'thinking', speaking: 'speaking',
};

export default defineAgent({
  entry: async (ctx: JobContext) => {
    assertLiveCreds();
    await ctx.connect();

    const roomName = ctx.room.name ?? '';
    const sessionId = roomName.replace(/^viva-interview-/, '');
    const style = (parseStyle(ctx.room.metadata) ?? 'balanced') as Style;
    const persona = parsePersona(ctx.room.metadata);
    const voiceId = personaVoice(persona); // distinct Cartesia voice per persona (env-overridable)
    const backend = new BackendClient();

    const vad = await silero.VAD.load();
    const session = new voice.AgentSession({
      vad,
      stt: new deepgram.STT({ model: env.STT_MODEL as NonNullable<ConstructorParameters<typeof deepgram.STT>[0]>['model'] }),
      tts: new cartesia.TTS({ model: env.TTS_MODEL, ...(voiceId ? { voice: voiceId } : {}) }),
      turnDetection: 'vad',
      turnHandling: { endpointing: ENDPOINTING[style] },
    });

    const publishOrb = (state: string) => {
      try {
        const data = new TextEncoder().encode(JSON.stringify({ type: 'agent_state', state }));
        void (ctx.room.localParticipant as unknown as { publishData: (d: Uint8Array, o?: unknown) => unknown })
          ?.publishData(data, { reliable: true });
      } catch { /* best-effort UI signal */ }
    };
    const publishCaption = (text: string) => {
      try {
        const data = new TextEncoder().encode(JSON.stringify({ type: 'caption', text, speaker: 'agent', isFinal: true }));
        void (ctx.room.localParticipant as unknown as { publishData: (d: Uint8Array, o?: unknown) => unknown })
          ?.publishData(data, { reliable: true });
      } catch { /* ignore */ }
    };
    const publishProgress = (index: number, total: number) => {
      try {
        const data = new TextEncoder().encode(JSON.stringify({ type: 'current_question', index, total }));
        void (ctx.room.localParticipant as unknown as { publishData: (d: Uint8Array, o?: unknown) => unknown })
          ?.publishData(data, { reliable: true });
      } catch { /* ignore */ }
    };
    // Tell the app the experience is degraded (e.g. a backend turn hiccup) so it
    // can show a chip; pass null to clear once we recover.
    const publishDegraded = (reason: string | null) => {
      try {
        const data = new TextEncoder().encode(JSON.stringify({ type: 'degraded', reason }));
        void (ctx.room.localParticipant as unknown as { publishData: (d: Uint8Array, o?: unknown) => unknown })
          ?.publishData(data, { reliable: true });
      } catch { /* ignore */ }
    };

    const agent = new voice.Agent({
      instructions: 'You are a live interview voice agent for viva. Your spoken lines are supplied by the orchestrator; do not improvise.',
    });

    session.on(voice.AgentSessionEventTypes.AgentStateChanged, (ev) => {
      publishOrb(ORB[ev.newState] ?? 'idle');
    });

    // Surface TTS/STT/LLM failures instead of letting them fail silently — a
    // rejected TTS synthesis (e.g. a stale model) otherwise yields captions with
    // no audio and no signal. Log it and flag the experience as degraded.
    session.on(voice.AgentSessionEventTypes.Error, (ev) => {
      console.error('[agent] session error:', ev.error);
      publishDegraded('Voice issue — bear with me');
    });

    let ending = false;
    session.on(voice.AgentSessionEventTypes.UserInputTranscribed, (ev) => {
      if (!ev.isFinal || ending || !ev.transcript.trim()) return;
      void (async () => {
        try {
          const reply = await backend.nextTurn(sessionId, ev.transcript);
          publishDegraded(null); // recovered (no-op if we were never degraded)
          publishCaption(reply.spokenText);
          publishProgress(reply.index, reply.total);
          session.say(reply.spokenText);
          if (reply.ended) {
            ending = true;
            await backend.complete(sessionId).catch(() => {});
          }
        } catch (err) {
          // BackendClient already retried transient failures; if we're still
          // here the turn is lost. Don't leave the candidate in silence — speak
          // a short bridge line, flag degraded so the app shows a chip, and keep
          // listening so they can re-answer.
          console.error('[agent] next-turn failed', err);
          publishOrb('idle');
          publishDegraded('Catching up…');
          session.say(BRIDGE_LINE);
        }
      })();
    });

    // Clean shutdown: when the worker is asked to stop (SIGTERM/SIGINT below, or
    // the framework's own graceful drain), close the session and disconnect the
    // room so an in-flight interview isn't hard-killed mid-utterance.
    let shuttingDown = false;
    const shutdown = async (reason: string) => {
      if (shuttingDown) return;
      shuttingDown = true;
      console.log(`[agent] shutting down (${reason})`);
      try { await session.close(); } catch (err) { console.error('[agent] session close failed', err); }
      try { await ctx.room.disconnect(); } catch (err) { console.error('[agent] room disconnect failed', err); }
    };
    ctx.addShutdownCallback(() => shutdown('job shutdown'));
    const onSignal = (sig: NodeJS.Signals) => { void shutdown(sig).finally(() => process.exit(0)); };
    process.once('SIGTERM', onSignal);
    process.once('SIGINT', onSignal);

    await session.start({ agent, room: ctx.room });

    // Greeting + first question from the backend. begin() is the candidate's
    // first impression, so guard it: a failure here must not leave them with a
    // silent orb. Speak a holding line, retry once, and if that also fails speak
    // a final apology — but stay connected so the worker can recover (or the
    // candidate can rejoin) rather than crashing the process.
    const speakFirst = (reply: TurnReply) => {
      publishCaption(reply.spokenText);
      publishProgress(reply.index, reply.total);
      session.say(reply.spokenText);
    };
    try {
      speakFirst(await backend.begin(sessionId));
    } catch (firstErr) {
      console.error('[agent] begin failed; retrying once', firstErr);
      publishDegraded('Starting up…');
      session.say(STARTUP_RETRY_LINE);
      await sleep(1000);
      try {
        speakFirst(await backend.begin(sessionId));
        publishDegraded(null); // recovered
      } catch (retryErr) {
        console.error('[agent] begin failed after retry', retryErr);
        publishDegraded('Trouble starting');
        session.say(STARTUP_FAILED_LINE);
        // Leave the session connected — don't crash the process.
      }
    }
  },
});

type Persona = 'aria' | 'sam' | 'lena';
function parsePersona(metadata: string | undefined): Persona | null {
  if (!metadata) return null;
  try {
    const m = JSON.parse(metadata) as { persona?: string };
    if (m.persona === 'aria' || m.persona === 'sam' || m.persona === 'lena') return m.persona;
  } catch { /* ignore */ }
  return null;
}
// Distinct Cartesia voice per persona — set CARTESIA_VOICE_ARIA/SAM/LENA to real
// voice ids; when unset we omit `voice` so the plugin default is used.
function personaVoice(persona: Persona | null): string | undefined {
  const map: Record<Persona, string | undefined> = {
    aria: process.env.CARTESIA_VOICE_ARIA,
    sam: process.env.CARTESIA_VOICE_SAM,
    lena: process.env.CARTESIA_VOICE_LENA,
  };
  return persona ? map[persona] : undefined;
}

function parseStyle(metadata: string | undefined): Style | null {
  if (!metadata) return null;
  try {
    const m = JSON.parse(metadata) as { style?: string };
    if (m.style === 'friendly' || m.style === 'balanced' || m.style === 'tough') return m.style;
  } catch { /* metadata may be plain text */ }
  return null;
}

cli.runApp(new WorkerOptions({ agent: fileURLToPath(import.meta.url) }));
