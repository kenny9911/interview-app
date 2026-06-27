// viva LiveKit voice agent worker.
//
// Joins an interview room, runs the realtime voice pipeline (Silero VAD +
// semantic turn detector + Deepgram STT + Cartesia TTS, with framework-managed
// barge-in & background-noise cancellation), and drives each turn through the
// backend brain (/begin, /next-turn, /complete). The interviewer's spoken lines
// come from the backend, so the four-agent orchestration lives in one tested
// place and this worker owns only audio I/O.
//
// Turn-taking is delegated to the framework: the AgentSession detects end-of-turn
// (VAD silence gated by the semantic EOU model + per-style endpointing delay),
// handles interruptions, and calls InterviewAgent.onUserTurnCompleted ONCE per
// committed turn with the full transcript. We deliberately do NOT drive turns off
// per-segment STT finals (UserInputTranscribed) — that fires several times per
// answer and would double-post truncated turns.
//
// Run the connectivity spike first (npm run spike), then `npm run dev`.
// Refs: https://docs.livekit.io/agents/  https://docs.livekit.io/reference/agents-js/
import { fileURLToPath } from 'node:url';
import {
  cli, defineAgent, voice, inference, metrics, llm, WorkerOptions,
  type JobContext, type JobProcess,
} from '@livekit/agents';
import * as silero from '@livekit/agents-plugin-silero';
import * as deepgram from '@livekit/agents-plugin-deepgram';
import * as cartesia from '@livekit/agents-plugin-cartesia';
import * as elevenlabs from '@livekit/agents-plugin-elevenlabs';
import { env, assertLiveCreds } from './env.js';
import { BackendClient, type TurnReply } from './backendClient.js';
import { type Style, vadTuning, endpointingForStyle, interruptionForStyle } from './voiceConfig.js';
import { formatMetricLine, type MetricLike } from './metricsLogger.js';
import {
  type Lang, parseLanguage, spoken, sttLang, ttsLang, sttEndpointingMs,
  endpointingFloor, eouThreshold, cartesiaVoiceFor, elevenlabsVoiceForKo, normalizeTurnText,
} from './lang.js';

// Spoken when a turn fails after the client's retries — keeps the conversation
// alive instead of dead air, and invites the candidate to repeat their answer.
const BRIDGE_LINE = "Sorry — I lost that for a moment. Could you say that again?";

// Spoken if the very first backend call (begin) fails — we don't want the
// candidate staring at a silent orb on startup. The first is a holding line
// before a single retry; the second is the apology if that retry also fails.
const STARTUP_RETRY_LINE = "Sorry — I'm having trouble starting. Give me just a moment.";
const STARTUP_FAILED_LINE = "Sorry — I'm still having trouble getting started. Please hang on, or try rejoining in a moment.";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// LiveKit AgentState -> the orb state the app renders (docs/15-decisions.md D7).
const ORB: Record<string, string> = {
  initializing: 'idle', idle: 'idle', listening: 'listening', thinking: 'thinking', speaking: 'speaking',
};

type LoadedVad = Awaited<ReturnType<typeof silero.VAD.load>>;

// Per-room signals the InterviewAgent pushes to the app over the data channel.
interface InterviewHooks {
  caption: (text: string) => void;
  progress: (index: number, total: number) => void;
  orb: (state: string) => void;
  degraded: (reason: string | null) => void;
  onEnded: () => void;
}

// The live interview agent. Output (TTS) is driven manually via session.say()
// because the "LLM" lives in the backend; we hook the framework's per-turn
// callback to fetch the next interviewer line.
class InterviewAgent extends voice.Agent {
  private turnInFlight = false;
  private ended = false;

  constructor(
    private readonly sessionId: string,
    private readonly backend: BackendClient,
    private readonly hooks: InterviewHooks,
  ) {
    super({
      instructions:
        'You are a live interview voice agent for viva. Your spoken lines are supplied by the orchestrator; do not improvise.',
    });
  }

  // Called once per committed user turn (after EOU detection + interruption
  // handling), with the FULL aggregated transcript. With no LLM configured the
  // framework does not generate its own reply, so we own the response here.
  override async onUserTurnCompleted(_chatCtx: llm.ChatContext, newMessage: llm.ChatMessage): Promise<void> {
    if (this.ended) return;
    // The recognizer joins accumulated final segments with an ASCII space, which
    // injects spurious gaps between CJK characters across segment boundaries.
    // Normalize here — the ONE canonical place — so the string the backend
    // persists is exactly what verifyEvidence later matches (docs/30-i18n.md §5).
    const text = normalizeTurnText(newMessage.textContent ?? '');
    if (!text) return;

    // Single-flight guard: the user can finish another turn while the previous
    // backend round-trip is still pending. Posting both would double-advance the
    // interview cursor and overlap two interviewer lines, so drop the overlap.
    if (this.turnInFlight) {
      console.warn('[agent] dropping overlapping turn while previous is in flight');
      return;
    }
    this.turnInFlight = true;
    // The brain is in the backend, so the AgentSession never emits 'thinking' on
    // its own — publish it so the orb doesn't read as dead air during the round-trip.
    this.hooks.orb('thinking');
    try {
      const reply = await this.backend.nextTurn(this.sessionId, text);
      this.hooks.degraded(null); // recovered (no-op if we were never degraded)
      this.hooks.caption(reply.spokenText);
      this.hooks.progress(reply.index, reply.total);
      this.say(reply.spokenText);
      if (reply.ended) {
        this.ended = true;
        this.hooks.onEnded();
        await this.backend.complete(this.sessionId).catch(() => {});
      }
    } catch (err) {
      // BackendClient already retried transient failures; if we're still here the
      // turn is lost. Don't leave the candidate in silence — speak a short bridge
      // line, flag degraded so the app shows a chip, and keep listening.
      console.error('[agent] next-turn failed', err);
      this.hooks.orb('idle');
      this.hooks.degraded('Catching up…');
      this.say(BRIDGE_LINE);
    } finally {
      this.turnInFlight = false;
    }
  }

  // Speak a line, tolerating a closed/closing session during teardown.
  say(text: string): void {
    try { this.session.say(text); } catch (err) { console.error('[agent] say failed', err); }
  }

  markEnded(): void { this.ended = true; }
}

// Resolve the turn-detection strategy. 'v1-mini' runs the semantic end-of-turn
// model locally (via @livekit/local-inference); 'v1' uses the LiveKit Cloud
// inference gateway; 'vad'/'off' fall back to silence-only endpointing. Any
// construction failure degrades gracefully to VAD-only.
type TurnDetection = 'vad' | InstanceType<typeof inference.TurnDetector>;
function buildTurnDetection(unlikelyThreshold?: number): TurnDetection {
  const mode = env.TURN_DETECTOR.toLowerCase();
  if (mode === 'off' || mode === 'vad') return 'vad';
  try {
    // Pin the EOU threshold to the KNOWN session language. A scalar override
    // applies to every language, so we don't depend on the STT-reported language,
    // which Deepgram may report as null with detectLanguage:false — that would
    // otherwise silently apply the English threshold to a CJK session and clip
    // clause-pauses (docs/30-i18n.md §4.3).
    return new inference.TurnDetector({
      version: mode === 'v1' ? 'v1' : 'v1-mini',
      ...(unlikelyThreshold ? { unlikelyThreshold } : {}),
    });
  } catch (err) {
    console.warn('[agent] semantic turn detector unavailable; using VAD-only endpointing', err);
    return 'vad';
  }
}

// Resolve background-noise cancellation. Imported dynamically so the worker still
// boots if the (optional, native) package isn't installed for the platform.
async function buildNoiseCancellation(): Promise<unknown | undefined> {
  const mode = env.NOISE_CANCELLATION.toLowerCase();
  if (mode === 'off' || mode === 'none') return undefined;
  // `: string` (not a literal) keeps this an opt-in dynamic import — the build
  // stays green even where the optional native package isn't installed.
  const pkg: string = '@livekit/noise-cancellation-node';
  try {
    const nc = (await import(pkg)) as {
      NoiseCancellation: () => unknown;
      BackgroundVoiceCancellation: () => unknown;
      TelephonyBackgroundVoiceCancellation: () => unknown;
    };
    if (mode === 'standard' || mode === 'nc') return nc.NoiseCancellation();
    if (mode === 'telephony') return nc.TelephonyBackgroundVoiceCancellation();
    return nc.BackgroundVoiceCancellation(); // 'bvc' default — best for removing background voices (needs LiveKit Cloud)
  } catch (err) {
    console.warn('[agent] noise cancellation unavailable; continuing without it', err);
    return undefined;
  }
}

export default defineAgent({
  // Load the Silero VAD model once per worker process and reuse it across jobs —
  // loading it inside the live path (per interview) added the model cold-load to
  // every greeting. Tuning values come from voiceConfig (env-overridable, ms).
  prewarm: async (proc: JobProcess) => {
    const t = vadTuning();
    proc.userData.vad = await silero.VAD.load({
      minSpeechDuration: t.minSpeechDuration,
      minSilenceDuration: t.minSilenceDuration,
      prefixPaddingDuration: t.prefixPaddingDuration,
      activationThreshold: t.activationThreshold,
    });
    console.log('[agent] prewarm: Silero VAD loaded', JSON.stringify(t));
  },

  entry: async (ctx: JobContext) => {
    assertLiveCreds();
    await ctx.connect();

    const roomName = ctx.room.name ?? '';
    const sessionId = roomName.replace(/^viva-interview-/, '');
    const style = (parseStyle(ctx.room.metadata) ?? 'balanced') as Style;
    const persona = parsePersona(ctx.room.metadata);
    const language = parseLanguage(ctx.room.metadata); // canonical locale (default 'en')
    const backend = new BackendClient();

    const vad = (ctx.proc.userData.vad as LoadedVad | undefined) ?? (await silero.VAD.load());
    // Combine per-style endpointing (voiceConfig) with the per-language floor
    // (lang.ts): CJK answers need a longer silence grace than English, so take the
    // larger of each — style sets the base, language raises the floor.
    const epStyle = endpointingForStyle(style);
    const epLang = endpointingFloor(language);
    const endpointing = { minDelay: Math.max(epStyle.minDelay, epLang.minDelay), maxDelay: Math.max(epStyle.maxDelay, epLang.maxDelay) };
    const interruption = interruptionForStyle(style);
    const turnDetection = buildTurnDetection(eouThreshold(language));
    console.log(
      `[agent] session ${sessionId} style=${style} lang=${language} stt=${sttLang(language)} tts=${ttsLang(language)} ` +
      `turnDetection=${turnDetection === 'vad' ? 'vad' : 'semantic'} ` +
      `endpointing=${JSON.stringify(endpointing)} interruption=${JSON.stringify(interruption)}`,
    );

    const session = new voice.AgentSession({
      vad,
      // Language is pinned per session from room metadata (docs/30-i18n.md): the
      // canonical locale maps to the Deepgram code (zh-Hans→zh-CN) and the Cartesia
      // language; detectLanguage:false keeps STT on the chosen model so a thick
      // accent or code-switched English term isn't misrouted.
      stt: new deepgram.STT({
        model: env.STT_MODEL as NonNullable<ConstructorParameters<typeof deepgram.STT>[0]>['model'],
        language: sttLang(language) as NonNullable<ConstructorParameters<typeof deepgram.STT>[0]>['language'],
        detectLanguage: false,
        endpointing: sttEndpointingMs(language),
      }),
      tts: makeTts(language, persona),
      turnDetection,
      turnHandling: {
        endpointing: { minDelay: endpointing.minDelay, maxDelay: endpointing.maxDelay },
        interruption: {
          minDuration: interruption.minDuration,
          minWords: interruption.minWords,
          falseInterruptionTimeout: interruption.falseInterruptionTimeout,
          resumeFalseInterruption: interruption.resumeFalseInterruption,
        },
      },
    });

    const publish = (payload: unknown) => {
      try {
        const data = new TextEncoder().encode(JSON.stringify(payload));
        void (ctx.room.localParticipant as unknown as { publishData: (d: Uint8Array, o?: unknown) => unknown })
          ?.publishData(data, { reliable: true });
      } catch { /* best-effort UI signal */ }
    };
    const hooks: InterviewHooks = {
      caption: (text) => publish({ type: 'caption', text, speaker: 'agent', isFinal: true }),
      progress: (index, total) => publish({ type: 'current_question', index, total }),
      orb: (state) => publish({ type: 'agent_state', state }),
      // Tell the app the experience is degraded so it can show a chip; null clears it.
      degraded: (reason) => publish({ type: 'degraded', reason }),
      onEnded: () => { /* analysis is triggered by the agent via backend.complete */ },
    };

    const agent = new InterviewAgent(sessionId, backend, hooks);

    // Drive the orb from the framework's own state machine (VAD-backed).
    session.on(voice.AgentSessionEventTypes.AgentStateChanged, (ev) => {
      hooks.orb(ORB[ev.newState] ?? 'idle');
    });

    // Captions only — UserInputTranscribed fires per STT segment (interim + final);
    // it is NOT a turn signal (that's InterviewAgent.onUserTurnCompleted).
    session.on(voice.AgentSessionEventTypes.UserInputTranscribed, (ev) => {
      if (!ev.transcript.trim()) return;
      publish({ type: 'caption', text: ev.transcript, speaker: 'candidate', isFinal: ev.isFinal });
    });

    // ── Observability: structured per-turn metrics + lifecycle, so VAD /
    // endpointing / barge-in can be fine-tuned from real logs (grep voice-metrics | jq).
    const usage = new metrics.UsageCollector();
    session.on(voice.AgentSessionEventTypes.MetricsCollected, (ev) => {
      try { usage.collect(ev.metrics); } catch { /* ignore */ }
      if (!env.LOG_METRICS) return;
      const line = formatMetricLine(ev.metrics as unknown as MetricLike);
      if (line) console.log(line);
    });
    session.on(voice.AgentSessionEventTypes.UserStateChanged, (ev) => {
      const e = ev as unknown as { oldState?: string; newState?: string };
      console.log(`[voice] user ${e.oldState ?? '?'}→${e.newState ?? '?'}`);
    });
    session.on(voice.AgentSessionEventTypes.AgentFalseInterruption, () => {
      console.log('[voice] false interruption detected (resuming)');
    });
    session.on(voice.AgentSessionEventTypes.OverlappingSpeech, () => {
      console.log('[voice] overlapping speech (barge-in)');
    });

    // Surface TTS/STT failures instead of letting them fail silently — name the
    // failing leg where we can, and flag the experience as degraded.
    session.on(voice.AgentSessionEventTypes.Error, (ev) => {
      const e = ev as unknown as { error?: unknown; source?: unknown };
      console.error('[agent] session error:', e.source ? `[${String(e.source)}]` : '', e.error ?? ev);
      hooks.degraded('Voice issue — bear with me');
    });

    // Clean shutdown: when the worker is asked to stop (SIGTERM/SIGINT below, or
    // the framework's graceful drain), stop accepting turns, close the session and
    // disconnect so an in-flight interview isn't hard-killed mid-utterance.
    let shuttingDown = false;
    const shutdown = async (reason: string) => {
      if (shuttingDown) return;
      shuttingDown = true;
      agent.markEnded();
      console.log(`[agent] shutting down (${reason})`);
      try { console.log('[voice] usage summary', JSON.stringify(usage.getSummary())); } catch { /* ignore */ }
      try { await session.close(); } catch (err) { console.error('[agent] session close failed', err); }
      try { await ctx.room.disconnect(); } catch (err) { console.error('[agent] room disconnect failed', err); }
    };
    ctx.addShutdownCallback(() => shutdown('job shutdown'));
    const onSignal = (sig: NodeJS.Signals) => { void shutdown(sig).finally(() => process.exit(0)); };
    process.once('SIGTERM', onSignal);
    process.once('SIGINT', onSignal);

    const noiseCancellation = await buildNoiseCancellation();
    console.log(`[agent] noise cancellation: ${noiseCancellation ? env.NOISE_CANCELLATION : 'off'}`);
    await session.start({
      agent,
      room: ctx.room,
      ...(noiseCancellation ? { inputOptions: { noiseCancellation: noiseCancellation as never } } : {}),
    });

    // Greeting + first question from the backend. begin() is the candidate's first
    // impression, so guard it: a failure here must not leave them with a silent
    // orb. Speak a holding line, retry once, and if that also fails speak a final
    // apology — but stay connected so the worker can recover (or the candidate can
    // rejoin) rather than crashing the process.
    const speakFirst = (reply: TurnReply) => {
      hooks.caption(reply.spokenText);
      hooks.progress(reply.index, reply.total);
      agent.say(reply.spokenText);
    };
    try {
      speakFirst(await backend.begin(sessionId));
    } catch (firstErr) {
      console.error('[agent] begin failed; retrying once', firstErr);
      hooks.degraded('Starting up…');
      agent.say(STARTUP_RETRY_LINE);
      await sleep(1000);
      try {
        speakFirst(await backend.begin(sessionId));
        hooks.degraded(null); // recovered
      } catch (retryErr) {
        console.error('[agent] begin failed after retry', retryErr);
        hooks.degraded('Trouble starting');
        agent.say(STARTUP_FAILED_LINE);
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
// Resolve the Cartesia voice for (persona × language). cartesiaVoiceFor refuses to
// fall back to the English voice for a non-English session (no awkward-foreigner
// voice — docs/30-i18n.md §3.6). Phase 0/1 reality: the zh voices may not be
// provisioned yet, so we log loudly and let Cartesia use its language-default voice
// rather than crashing the worker. Provision native voices before launch (§8/§9).
function resolveVoiceId(persona: Persona | null, language: Lang): string | undefined {
  try {
    return cartesiaVoiceFor(persona ?? 'aria', language);
  } catch (err) {
    console.error('[agent]', (err as Error).message);
    return undefined;
  }
}

// Per-language TTS: Korean → ElevenLabs (Cartesia has no Korean), everything else
// → Cartesia. Both extend the shared tts.TTS base so AgentSession is provider-
// agnostic. A native-recorded voice is used per (persona × language); we never
// speak a language through a non-native voice (docs/30-i18n.md §3.6/§4).
function makeTts(language: Lang, persona: Persona | null) {
  if (spoken(language) === 'ko') {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) throw new Error('ELEVENLABS_API_KEY is required for Korean TTS (Cartesia has no Korean).');
    return new elevenlabs.TTS({
      apiKey,
      voiceId: elevenlabsVoiceForKo(persona ?? 'aria'),
      modelID: process.env.ELEVENLABS_MODEL ?? 'eleven_flash_v2_5',
      language: 'ko',
    });
  }
  const voiceId = resolveVoiceId(persona, language);
  return new cartesia.TTS({ model: env.TTS_MODEL, language: ttsLang(language), ...(voiceId ? { voice: voiceId } : {}) });
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
