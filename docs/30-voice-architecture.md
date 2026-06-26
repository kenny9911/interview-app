# 30 · Smooth Voice Interaction Architecture

> The centerpiece. This document specifies how **viva** turns a LiveKit room
> into a conversation that *feels human* — sub-1.5s responses, natural barge-in,
> robust endpointing, and a multi-agent brain that thinks hard without ever
> making the user wait. Everything here is implementable on the proposed stack
> (LiveKit Cloud + LiveKit Agents Node/TS + Silero VAD + LiveKit turn detector +
> Deepgram STT + Claude + Cartesia/ElevenLabs TTS).
>
> Companion docs: `10-refined-spec.md` (overall spec), `20-system-architecture.md`
> (services/data), `40-interview-brain.md` (agent prompts/scoring).

---

## 0. Design goal in one sentence

A spoken conversation feels natural when the interviewer **starts replying within
the window a polite human would** (~400–800 ms of "thinking" after you finish),
**stops instantly when you cut in**, and **never talks over you or freezes**. We
engineer to those three perceptual targets, not to raw model latency.

The hard number from the brief: **end-of-user-speech → first interviewer audio
out the speaker ≤ 1.5 s at p50, ≤ 2.2 s at p95.** Below we budget every stage to
hit it, and design degradation paths so we *stay* smooth on bad networks.

---

## 1. Full-duplex pipeline, end to end

The agent is a LiveKit Agents (Node/TS) worker process that **joins the room as a
participant**. Media never round-trips through our API server — it flows
SFU↔agent over WebRTC. Our Fastify API only mints tokens and handles
setup/lifecycle/storage (see `20-system-architecture.md`).

```
                         LiveKit Cloud (SFU + TURN + Egress)
   ┌─────────┐   WebRTC (Opus 48kHz, RN-AEC)   ┌──────────────────────────┐
   │  iOS /  │ ───── user mic/cam uplink ─────▶ │  SFU  ─┬─ recording egress │──▶ R2
   │ Android │ ◀──── agent TTS downlink ─────── │        │                  │
   │  Expo   │      + data channel (state,      └────────┼──────────────────┘
   │  + LK   │        captions, events)                  │ subscribe / publish
   │  RN SDK │                                           ▼
   └─────────┘                          ┌────────────────────────────────────┐
                                        │  LiveKit Agents worker (Node/TS)    │
        ┌───────────────────────────────┤  one AgentSession per interview     │
        │                               │                                     │
        ▼  user audio frames            │  ┌────────────────────────────────┐ │
   ┌─────────┐   20ms PCM   ┌────────┐  │  │ INPUT  Silero VAD (frame gate) │ │
   │ Silero  │─────────────▶│Deepgram│  │  │        Deepgram STT (stream)   │ │
   │  VAD    │  speech prob │ STT WS │  │  │        Turn detector (semantic)│ │
   └─────────┘              └───┬────┘  │  └────────────────────────────────┘ │
        │ is_speaking            │partial/final transcript                    │
        ▼                        ▼                                            │
   ┌──────────────────────────────────────────────┐                          │
   │ TURN DETECTOR  (LiveKit semantic + timing)    │── end_of_turn ─┐         │
   └──────────────────────────────────────────────┘                ▼         │
                                                       ┌────────────────────┐ │
   barge-in signal ◀──── VAD speech during TTS ────────│  Interviewer (LLM) │ │
        │                                              │  Claude Sonnet     │ │
        ▼                                              │  STREAMING tokens  │ │
   cancel + flush TTS ◀─────────────────────────────── └─────────┬──────────┘ │
                                                                 │ token stream│
                                                       ┌─────────▼──────────┐ │
                                                       │ TTS Cartesia/11Labs│ │
                                                       │ STREAMING audio    │ │
                                                       └─────────┬──────────┘ │
                                                                 │ pub to room │
        ◀──────────────── agent audio track ─────────────────────┘            │
        (data channel) state machine + captions + per-turn feedback chips ◀────┘
                                                                              │
   async, OFF the hot path: ┌──────────────────────────────────────────────┐ │
                            │ Response Reviewer (Sonnet) → adapts next Q     │◀┘
                            │ Scorer / Analyst (Opus 4.8) → never blocks talk│
                            └──────────────────────────────────────────────┘
```

**Key property:** there is **one synchronous path** (VAD → STT → turn detect →
Sonnet → TTS) and **everything else is asynchronous**. The synchronous path is
the only thing the latency budget governs. Opus 4.8 scoring, plan adaptation,
report generation, and persistence are fire-and-forget against the live turn.

---

## 2. VAD — Silero choice & config

We use **Silero VAD** (the LiveKit default plugin) running on the agent, on
20 ms frames of the user's 16 kHz downsampled audio. VAD is *not* the turn
decision — it is the cheap, instant "is there voice energy right now" gate that
feeds both the turn detector and the barge-in detector. We deliberately keep VAD
**sensitive and fast**, and push the "should I respond" judgment up to the turn
detector, because the costs are asymmetric: a false VAD trigger is cheap
(turn detector vetoes it), but a missed onset delays barge-in (very perceptible).

```ts
// Silero VAD config — tuned for a single near-mic speaker on a phone
const vad = silero.VAD.load({
  // probability above which a frame is "speech". Lower = more sensitive,
  // catches soft starts / quiet talkers; we lean sensitive and let the
  // turn detector reject non-utterances.
  activationThreshold: 0.5,          // default 0.5; drop to 0.35 in "tough"/quiet rooms

  // how long continuous speech before we declare speech START. Short so
  // barge-in fires fast.
  minSpeechDuration: 0.05,           // 50 ms

  // how long of silence before VAD declares speech STOPPED. This is the
  // RAW silence gate — NOT the turn endpoint (that's §3). Keep small;
  // endpointing logic adds the real grace window on top.
  minSilenceDuration: 0.25,         // 250 ms

  // padding kept around detected speech so STT doesn't clip word edges
  prefixPaddingDuration: 0.10,      // 100 ms
  // sample rate the model runs at
  sampleRate: 16000,
});
```

Sensitivity is **persona/style-aware**: for the `tough` style and noisier
"live-night" sessions we lower `activationThreshold` to 0.35 and raise the turn
detector's silence floor so we don't reward the user for a half-second pause.
For `friendly` we keep it patient (longer grace windows in §3).

Why Silero and not Deepgram's built-in VAD: we need a **local, sub-frame** speech
flag for barge-in that does not depend on the STT websocket round-trip. Deepgram
still does its own endpointing, but Silero gives us a deterministic, provider-
independent interruption signal.

---

## 3. Endpointing / turn detection

Endpointing is *the* make-or-break for "smooth." Cut too early and you interrupt
a thinking user mid-sentence; wait too long and the interviewer feels laggy and
dead. We use a **two-layer** decision: a **semantic turn detector** gated by
**timing thresholds**.

### 3.1 Semantic turn detector (LiveKit turn detector plugin)

The LiveKit turn detector is a small transformer that reads the *running STT
text* and predicts P(user is done speaking). It distinguishes:

- *"My biggest weakness is…"* (clearly unfinished → keep waiting, even through a
  1.5 s pause) from
- *"…and that's how I shipped it."* (clearly complete → respond now, even if
  silence is only 200 ms).

This is what lets viva tolerate **thinking pauses** without feeling slow. The
detector outputs `eou_probability` (end-of-utterance) on every STT partial.

### 3.2 Timing thresholds layered on top

The semantic score is combined with silence timing into a single endpoint
decision. Concrete defaults (per style):

| Parameter | friendly | balanced | tough | Meaning |
|---|---|---|---|---|
| `minEndpointingDelay` | 600 ms | 480 ms | 360 ms | Floor silence before we *can* end a turn, even when text looks complete. Prevents clipping fast talkers. |
| `maxEndpointingDelay` | 4.0 s | 3.0 s | 2.0 s | Hard cap. If `eou_probability` stays low (rambling/unfinished) we still take the turn after this much trailing silence so we never hang forever. |
| `eou_threshold` | 0.55 | 0.65 | 0.75 | Semantic confidence required to end on the *short* delay. Tough = stricter (waits for a clearly finished thought). |
| backchannel grace | 800 ms | 600 ms | 400 ms | Extra patience after detecting a likely filler/backchannel (§6). |

**Decision rule (evaluated on every STT partial + every VAD silence tick):**

```
end_turn IF:
   silence ≥ minEndpointingDelay
   AND ( eou_probability ≥ eou_threshold
         OR silence ≥ maxEndpointingDelay )
   AND NOT looks_like_backchannel(last_partial)   // §6
   AND NOT user_mid_word (VAD speech in last 120 ms)
```

This gives the feel of: **fast response when you clearly finished, patient
silence when you're visibly mid-thought**, and a guaranteed ceiling so the orb
never stalls.

### 3.3 "Still thinking" grace

If `eou_probability` is low and the user goes silent for >1.2 s (a real
thinking pause, not a finished answer), the agent does **not** jump in. Instead,
after a longer hold (configurable, default 2.5 s in friendly), it may emit a
**gentle nudge** ("Take your time — happy to rephrase if useful?") rather than
barreling into the next question. This is an explicit interviewer behavior, not
an endpointing bug.

---

## 4. Barge-in handling (user interrupts the interviewer)

Barge-in is the single most important "feels human" behavior. When the user
starts talking while the interviewer is mid-sentence, the interviewer must
**stop almost instantly**, like a person who's been cut off.

### 4.1 Trigger

While `state == speaking`, the Silero VAD on the user's inbound audio is the
trigger. We require a short confirmation to avoid a single cough killing the
turn:

```
barge_in IF state == speaking
          AND vad.is_speaking sustained ≥ 120 ms
          AND vad.energy above echo-residual floor   // §8 double-talk guard
```

120 ms is the sweet spot: fast enough to feel responsive (<150 ms is perceived
as "instant"), long enough to reject lip smacks / clicks / TTS echo leakage.

### 4.2 Reaction (the flush sequence) — target ≤ 200 ms mouth-to-silence

On barge-in the agent executes, in order:

1. **Cancel TTS synthesis** — abort the in-flight Cartesia/ElevenLabs stream
   (`tts.cancel()` / abort the request). Stop pulling tokens.
2. **Cancel the LLM generation** — abort the Sonnet stream if still producing;
   we don't want tokens for a sentence no one will hear.
3. **Flush the audio buffer** — drop all queued/un-played TTS frames from the
   publish jitter buffer so audio stops *now*, not at end of the current
   buffered chunk. (Without this, ~300–500 ms of already-buffered speech keeps
   playing — the classic "robot keeps talking after you interrupt" feel.)
4. **Mark the partial utterance as interrupted** in the transcript: record what
   the interviewer *had said so far* (truncated at the cut point) so scoring and
   the report reflect reality.
5. **Transition** `speaking → interrupted → listening` and immediately re-arm
   STT/turn detection on the user's incoming speech. The fragment the user spoke
   during step 1–3 is preserved (VAD prefix padding + STT was already running).

### 4.3 Conversation-policy on interrupt

The interrupted interviewer line is fed back into the next LLM context as
*"[interviewer was cut off mid-question: '…']"* so Sonnet can gracefully yield
("Go ahead—") rather than blindly repeating its question. We do **not** force the
interviewer to finish its sentence; humans don't.

---

## 5. Latency budget — concrete targets per stage

Goal: **end-of-user-speech → first interviewer phoneme ≤ 1.5 s p50.** The clock
starts the instant the turn detector fires `end_of_turn` (which itself happens
`minEndpointingDelay` after the user's last sound — that delay is "polite
thinking time," not latency we're trying to remove).

| Stage | What happens | p50 target | p95 budget |
|---|---|---|---|
| STT finalization | Deepgram emits final transcript for the closed turn (we mostly already have it from partials) | 80 ms | 200 ms |
| Context assembly | Build messages: cached system+rubric (§7) + recent turns + reviewer hints | 15 ms | 40 ms |
| LLM **first token** | Claude **Sonnet**, streaming, prompt-cached prefix | 350 ms | 600 ms |
| TTS **first audio** | Cartesia/ElevenLabs streaming, first audio chunk from first ~text clause | 180 ms | 350 ms |
| Network downlink | first TTS frame SFU → device → speaker (WebRTC, jitter buffer min) | 120 ms | 300 ms |
| **Total (EOU → first audio)** | | **~750 ms** | **~1.5 s** |

We deliberately come in **under 1.5 s at p50** so the *perceived* gap — which
includes `minEndpointingDelay` (~480 ms) — lands around **1.0–1.3 s**, squarely
in the human-natural range.

### How we actually hit it — the four levers

1. **Stream everywhere, sentence-pipelined.** The LLM streams tokens; the TTS
   consumes tokens as they arrive and starts synthesizing on the **first
   complete clause** (split on `, . ? ! ;` or ~8 words). TTS first-audio overlaps
   LLM still-generating. We never wait for the full LLM response.
2. **Speak the first sentence fast, plan the rest.** The Interviewer prompt is
   shaped to open with a short, low-latency lead-in clause ("Got it—") so the
   *first* audio chunk is trivially synthesizable while the substantive
   follow-up is still being generated.
3. **Prompt caching** on the big static prefix (persona, rubric, JD/resume,
   question plan) — see §7. Cuts Sonnet TTFT by cutting prompt processing.
4. **Sonnet, not Opus, on the hot path.** In-turn decisions and question phrasing
   use **claude-sonnet** (fast TTFT). Opus 4.8 only runs **async** for scoring/
   analysis (§9) where its latency is invisible to the conversation.

### Pre-warming

The agent **pre-generates the next planned question's lead-in** during the
user's answer (speculative), and pre-warms the TTS connection. If the planned
question survives the Response Reviewer's adaptation, first audio is near-instant;
if the reviewer changes it, we discard the speculation (cheap).

---

## 6. Backchannels, fillers, pauses, and "user is thinking"

Treating *"mm-hmm,"* *"uh,"* *"like,"* *"so…"* as turn-ends is the #1 source of
the interviewer talking over people. Handling:

- **Backchannel lexicon + acoustic shape.** A short list (`mm`, `mhm`, `uh-huh`,
  `yeah`, `right`, `okay`, `um`, `uh`, `er`, `so`, `like`, `well`) combined with
  *short duration (<700 ms) + low `eou_probability`* is classified as a
  backchannel/filler, **not** an endpoint. It adds the backchannel grace window
  (§3.2) instead of ending the turn.
- **Trailing fillers don't end turns.** *"…and then I, um—"* keeps the floor; the
  semantic detector already scores this as unfinished.
- **The interviewer can backchannel too** (optionally). During a long user
  answer, the agent may emit a *very* short, low-volume *"mm-hmm"* via TTS to
  signal listening — gated so it never collides with the user's speech (only in a
  >800 ms intra-answer pause) and disabled in `tough` style. This is what makes
  it feel like someone's actually there.
- **Thinking pauses are protected** (§3.3): low EOU + silence = wait, optional
  gentle nudge after a long hold, never a hard cut.

---

## 7. Prompt caching & context shape on the hot path

The Interviewer (Sonnet) call is structured so the **expensive, stable prefix is
cached** and only the volatile tail changes each turn:

```
[ cache_control: ephemeral ]  ← cached prefix (reused every turn)
  system: persona (Aria/Sam/Lena) + style + language + interviewer rules
  rubric / competency definitions (Communication, Structure, Depth, Confidence)
  job description + resume (if provided)
  full question plan from the Planner
------------------------------------------------------------------ cache break
[ volatile tail — small, fast ]
  recent transcript turns (rolling window, ~last 6–8 turns)
  Response Reviewer hint for THIS turn ("probe deeper on metrics", "move on")
  current state + last interviewer line (+ interruption note if any)
```

Caching the prefix is what makes Sonnet TTFT land at ~350 ms despite a large
rubric/JD context. The reviewer hint is injected as a single short instruction so
adaptation costs almost nothing on the live path.

---

## 8. Echo cancellation & double-talk

The interviewer's own voice must not be heard as "the user talking" (which would
false-trigger barge-in constantly).

- **Device-side AEC.** The LiveKit React Native SDK enables the platform acoustic
  echo canceller (iOS `AVAudioSession` voice-processing / Android `AECM`). This
  is the primary defense and removes most of the loudspeaker leakage before it
  ever hits VAD. Headphones (common for practice) make this trivial.
- **TTS-aware barge-in gate (double-talk).** Even with AEC, residual echo leaks.
  The agent knows *exactly* when it is emitting TTS, so during `speaking` the
  barge-in VAD floor is **raised** (require higher energy / longer sustain,
  120 ms) and we compare inbound energy against the known outbound TTS envelope.
  Inbound that correlates with what we're playing is treated as echo, not
  interruption.
- **Half-duplex fallback.** If a device exhibits persistent echo (AEC
  unavailable / speakerphone in a hard room), we fall back to a stricter gate:
  raise the barge-in sustain to 250 ms. The conversation stays usable; barge-in
  just needs slightly more intent.

---

## 9. Keeping the multi-agent brain responsive

Four agents (Planner, Interviewer, Reviewer, Analyst — see `40-interview-brain.md`).
The rule that preserves smoothness:

> **Only the Interviewer is ever on the synchronous voice path, and it always
> runs Sonnet. Everything that needs Opus 4.8 runs asynchronously.**

| Agent | Model | When it runs | On hot path? |
|---|---|---|---|
| Question Planner | Opus 4.8 | Once, pre-interview (during "Set up" / room join) | No |
| **Interviewer** | **Sonnet** | Every turn, streaming | **Yes — the only one** |
| Response Reviewer | Sonnet | After each user answer, **async** | No (result feeds *next* turn as a hint) |
| Scorer / Analyst | **Opus 4.8** | Per-answer scoring async + full report post-call | No |

**The critical decoupling:** when the user finishes answer N, the Interviewer
*immediately* produces turn N+1 from the **current plan + last cached reviewer
hint**. In parallel, the Response Reviewer (and Opus scorer) chew on answer N.
Their output lands as a hint **before** answer N+1 finishes — so adaptation is
always one turn "ahead" and never blocks speech. If the reviewer is slow on a
given turn, the Interviewer simply proceeds on the existing plan; adaptation
catches up. **The conversation never waits on scoring.** Opus scoring latency
(potentially several seconds) is completely invisible because its consumer is the
post-call report and the *next-next* turn, not the live mouth.

Per-answer scores stream to the device over the data channel as the
**non-blocking feedback chips** the UI already shows ("Nice — you gave a concrete
example").

---

## 10. Interviewer state machine ↔ UI orb

Five states drive both agent behavior and the orb. The existing `Orb.tsx` already
exposes `rings`, `glow`, `voiceBars`, and `ringColor`; `LiveScreen` shows a status
label (currently "Speaking…"). We map states to those props and push the current
state over the LiveKit **data channel** so the orb reacts in real time.

```
            ┌──────┐  room joined / greeting done
            │ idle │──────────────────────────────┐
            └──────┘                               ▼
                                            ┌───────────┐  VAD speech start
        agent done speaking ───────────────│ listening │◀───────────────┐
                  ▲                         └─────┬─────┘                 │
                  │                               │ end_of_turn (§3)      │
                  │                               ▼                       │
            ┌──────────┐  TTS first audio   ┌──────────┐                  │
            │ speaking │◀───────────────────│ thinking │                  │
            └────┬─────┘                    └──────────┘                  │
                 │ barge-in (§4)                                          │
                 ▼                                                        │
          ┌─────────────┐  flush complete                                │
          │ interrupted │────────────────────────────────────────────────┘
          └─────────────┘
```

| State | Agent behavior | Orb props | Status label |
|---|---|---|---|
| `idle` | Connected, pre-greeting / between sections | slow breathe, `glow`, `rings=1`, soft persimmon | "Ready" |
| `listening` | STT + turn detector live; mic hot | `rings=2`, cool/teal `ringColor`, gentle pulse, **no** voiceBars; subtle ring reacts to user input level | "Listening" |
| `thinking` | LLM generating / TTS warming | `rings=1`, faster shimmer/glow pulse, no voiceBars | "Thinking…" |
| `speaking` | TTS playing | `voiceBars` **on** (driven by outbound audio amplitude), warm persimmon `ringColor`, `rings=2` | "Speaking…" |
| `interrupted` | Flushing TTS, re-listening | brief dim/contract then snap to `listening` | (transient, ~150 ms) |

Implementation notes:
- The orb's `voiceBars` are tied to **real outbound TTS amplitude** (sent as
  level samples on the data channel), so the bars actually track the
  interviewer's voice rather than animating on a fixed loop.
- In `listening`, the ring intensity is driven by the user's mic level (from VAD
  energy) — the orb visibly "leans in" while the user talks.
- Captions: STT partials stream to the caption view; the interviewer's text
  streams in sync with TTS (highlight the spoken clause).
- State is authoritative on the **agent**; the device renders it. This avoids
  client/agent disagreement (e.g., device showing "listening" while the agent is
  still flushing).

---

## 11. Network resilience — packet loss / jitter / reconnect

WebRTC + LiveKit Cloud handle the transport; we tune behavior around it.

- **Adaptive jitter buffer.** Keep the downlink jitter buffer at its minimum
  viable size for latency, but let it grow under measured jitter. We bias toward
  *low latency* and accept rare micro-concealment over a chronically padded
  buffer.
- **Opus FEC + DTX.** Inband forward error correction on the TTS track so a lost
  packet is reconstructed from the next; DTX so silence costs no bandwidth.
- **Loss-aware behavior.** The agent monitors LiveKit connection-quality events.
  On **degraded** quality: (a) the SFU/encoder drops video first, audio last; (b)
  we widen barge-in sustain slightly (loss can look like speech onset); (c) we
  show a subtle "weak connection" chip.
- **Reconnect.** The LiveKit RN SDK auto-reconnects (ICE restart). The
  AgentSession is **resilient to a participant temporarily dropping**: on user
  disconnect mid-answer, the agent pauses the clock, holds the turn, and on
  reconnect resumes with *"Looks like you dropped for a second — you were telling
  me about…"* (reconstructed from the last partial). No lost question, no double-
  asking.
- **Agent crash isolation.** One AgentSession per interview in its own worker
  context; a crash takes down one session, not the fleet. Session state
  (transcript, plan position, scores) is checkpointed so a respawn can rejoin and
  continue.
- **Server-side recording** via Egress is independent of device network, so the
  transcript/report are complete even if the user's link was rough.

---

## 12. Fallback to text

Voice must never be a dead end (no mic permission, noisy environment,
accessibility, total audio failure).

- **Always-available text input.** The Live screen exposes a keyboard affordance;
  typed answers enter the **same** pipeline at the STT-output stage (skip
  VAD/STT, go straight to turn-complete → Interviewer). Captions are already on.
- **TTS-off / read mode.** User can mute the interviewer's voice and read the
  streamed question text instead (TTS still drives captions timing if desired, or
  is fully skipped).
- **Graceful auto-degrade.** If STT confidence is chronically low (heavy
  accent + noise) or mic is unavailable, the agent proactively offers: *"I'm
  having trouble hearing you — want to type your answers instead?"* and flips to
  text without losing session state.
- **Scoring parity.** Text-mode answers are scored on the **same content rubric**
  (Communication/Structure/Depth/Confidence are competency/content-based, **not**
  affect/voice-based — per compliance), so switching modes does not change how
  fairly someone is assessed.

---

## 13. AgentSession wiring (LiveKit Agents, Node/TS) — pseudocode

Concrete shape of the worker. Real APIs: `@livekit/agents` + plugin packages
(`@livekit/agents-plugin-silero`, `-deepgram`, `-cartesia`/`-elevenlabs`,
`-turn-detector`, `-anthropic`).

```ts
import {
  defineAgent, cli, WorkerOptions,
  voice, // AgentSession lives here in current SDK
} from '@livekit/agents';
import * as silero from '@livekit/agents-plugin-silero';
import * as deepgram from '@livekit/agents-plugin-deepgram';
import * as cartesia from '@livekit/agents-plugin-cartesia';
import * as anthropic from '@livekit/agents-plugin-anthropic';
import { MultilingualModel as TurnDetector } from '@livekit/agents-plugin-turn-detector';

export default defineAgent({
  // pre-warm heavy singletons before a job is assigned
  prewarm: async (proc) => {
    proc.userData.vad = await silero.VAD.load({
      activationThreshold: 0.5,
      minSpeechDuration: 0.05,
      minSilenceDuration: 0.25,
      prefixPaddingDuration: 0.10,
      sampleRate: 16000,
    });
  },

  entry: async (ctx) => {
    await ctx.connect();

    // 1. Pull interview config from room metadata (set by our API at token mint):
    //    persona, style, language, mode, question plan, JD/resume, rubric.
    const cfg = JSON.parse(ctx.room.metadata ?? '{}');
    const style = cfg.style ?? 'balanced';
    const T = ENDPOINTING[style]; // table from §3.2

    // 2. Build the AgentSession: VAD + STT + LLM + TTS + turn detection.
    const session = new voice.AgentSession({
      vad: ctx.proc.userData.vad,

      stt: new deepgram.STT({
        model: 'nova-3',
        language: cfg.language ?? 'en',
        interimResults: true,        // partials drive turn detector + captions
        smartFormat: true,
        endpointing: 25,             // ms; Silero+turn detector own the real decision
      }),

      // HOT PATH model = Sonnet (fast TTFT). Opus is used elsewhere, async.
      llm: new anthropic.LLM({
        model: 'claude-sonnet-4-5',  // in-turn turn-taking + phrasing
        temperature: 0.6,
        // big stable prefix is cached (persona/rubric/JD/plan) — see §7
      }),

      tts: new cartesia.TTS({
        voice: cfg.voiceId,          // persona-mapped voice
        model: 'sonic',              // low-latency streaming model
        // streaming first-audio on first clause
      }),

      // Semantic end-of-utterance, gated by timing thresholds (§3)
      turnDetection: new TurnDetector(),
      minEndpointingDelay: T.minEndpointingDelay,   // §3.2
      maxEndpointingDelay: T.maxEndpointingDelay,
      // allow the user to cut off the agent
      allowInterruptions: true,
      interruptSpeechDuration: 0.12,  // 120 ms sustain → barge-in (§4)
      interruptMinWords: 0,           // energy-based, not word-gated, for snappiness
    });

    // 3. The live Interviewer agent (persona system prompt from §7 / brain doc)
    const interviewer = new voice.Agent({
      instructions: buildInterviewerSystemPrompt(cfg), // cached prefix
    });

    // 4. Wire events → state machine → data channel (orb/captions/feedback) ----

    session.on('user_started_speaking', () => publishState(ctx, 'listening'));

    session.on('user_input_transcribed', (ev) => {
      publishCaption(ctx, 'user', ev.transcript, ev.isFinal);
    });

    // turn detector + endpointing fired → we will respond
    session.on('user_turn_completed', async (ev) => {
      publishState(ctx, 'thinking');

      // ASYNC, off the hot path: Reviewer + Opus scorer for the answer just given.
      // Their results land as hints/chips; they NEVER block the next turn.
      void reviewAndScoreAsync(ctx, ev.transcript, cfg).then((res) => {
        if (res.chip) publishFeedbackChip(ctx, res.chip);     // UI feedback chip
        applyReviewerHint(interviewer, res.nextTurnHint);     // adapts next Q
      });
    });

    // first TTS audio chunk is about to play
    session.on('agent_started_speaking', () => publishState(ctx, 'speaking'));
    session.on('agent_speech_committed', () => publishState(ctx, 'listening'));

    // BARGE-IN: SDK cancels LLM+TTS + flushes buffer; we just reflect UI + log
    session.on('agent_speech_interrupted', (ev) => {
      publishState(ctx, 'interrupted');
      logInterruptedLine(ctx, ev.spokenSoFar);   // truncated text → transcript (§4.2)
      // SDK re-arms listening automatically; orb snaps back to 'listening'
    });

    session.on('metrics_collected', (m) => recordLatency(ctx, m)); // §14 acceptance

    // network quality → resilience behaviors (§11)
    ctx.room.on('connectionQualityChanged', (q) => onQuality(ctx, session, q));

    // 5. Go.
    publishState(ctx, 'idle');
    await session.start({ agent: interviewer, room: ctx.room });
    // The Interviewer opens with the greeting / first planned question.
  },
});

cli.runApp(new WorkerOptions({ agent: import.meta.url }));
```

> API names track the current `@livekit/agents` JS SDK; the **shape** —
> AgentSession composed of VAD + STT + LLM + TTS + turn detection, with
> endpointing thresholds, `allowInterruptions`, and event hooks driving a
> state→data-channel bridge — is the contract. Pin exact symbols at build time
> against the installed SDK version.

---

## 14. Measurable smoothness acceptance criteria

These are the **gates** the audio experience must pass (the brief's "product
owner satisfied with audio, score > 90%"). All measured from `metrics_collected`
+ client-side instrumentation, aggregated over ≥ 50 real test turns per persona/
style/network profile (good Wi-Fi, LTE, lossy-5%).

**Latency**
- L1. EOU → first interviewer audio: **p50 ≤ 1.5 s, p95 ≤ 2.2 s.**
- L2. LLM (Sonnet) first token: **p50 ≤ 400 ms** with prompt cache warm.
- L3. TTS first audio after first token: **p50 ≤ 200 ms.**

**Turn-taking / endpointing**
- T1. False endpoint rate (interviewer cuts off a still-speaking user):
  **< 3%** of turns.
- T2. Missed endpoint / awkward hang (>1 s late after a clearly finished answer):
  **< 5%** of turns.
- T3. Backchannel false-trigger ("mm-hmm" treated as a turn): **< 1%.**
- T4. Thinking-pause tolerance: a 1.5 s mid-answer pause does **not** trigger a
  response in **≥ 98%** of cases.

**Barge-in**
- B1. Mouth-to-silence on interruption: **p50 ≤ 200 ms, p95 ≤ 350 ms.**
- B2. Barge-in success rate (user interruption actually stops the agent):
  **≥ 99%.**
- B3. Echo/cough false barge-in (agent stops when it shouldn't): **< 1%** with
  headphones, **< 3%** on speakerphone.

**Robustness**
- R1. On 5% packet loss, L1 p95 degrades by **≤ 30%** and audio stays
  intelligible (no full dropouts > 400 ms).
- R2. Reconnect after a 5 s network drop resumes the same turn with **0** lost or
  duplicated questions.
- R3. Mic-permission-denied / STT-failure path falls back to text with **0**
  session-state loss.

**Conversation quality (human-rated, blind)**
- Q1. Naturalness MOS-style rating ≥ **4.2 / 5** across personas (rater panel).
- Q2. "Did it ever talk over you / freeze awkwardly?" — **≥ 90%** of test
  sessions answer "no."
- Q3. Per-turn feedback chip latency (score → chip on screen) **≤ 3 s** and never
  blocks the conversation (verified: chip arrival is decoupled from next turn).

A build ships only when **all L/T/B/R criteria pass** and **Q1–Q3 clear their
bars** on the good-Wi-Fi and LTE profiles (lossy profile must pass R1/R2 and
degrade gracefully, not break).

---

## 15. Summary of refinements to the proposed stack

- **Confirmed:** LiveKit Cloud + Agents (Node/TS), Silero VAD, LiveKit turn
  detector, Deepgram STT, Claude, streaming TTS, full-duplex + barge-in.
- **Sharpened — model split:** **Sonnet is the *only* model on the synchronous
  voice path**; **Opus 4.8 runs strictly async** (planning pre-call, scoring +
  analysis post-answer/post-call). This is the core trick that lets the brain be
  "deep" without ever making the conversation wait.
- **Sharpened — two-layer endpointing:** sensitive Silero VAD for instant
  barge-in + semantic turn detector gated by per-**style** timing thresholds, so
  `friendly` is patient and `tough` is crisp.
- **Sharpened — flush discipline on barge-in:** cancel LLM + cancel TTS + **flush
  the audio buffer** (target ≤ 200 ms), with a TTS-aware double-talk gate so echo
  doesn't false-trigger.
- **Added:** speculative next-question pre-warm, sentence-pipelined LLM→TTS,
  prompt-cached persona/rubric prefix, reconnect-resume of an in-flight turn,
  and first-class text fallback into the same pipeline.
- **TTS choice:** default **Cartesia (Sonic)** for lowest first-audio latency;
  **ElevenLabs** as the higher-warmth alternate per persona where the latency
  budget allows — both are streaming and swappable behind the AgentSession.
