# 15 · Decisions / ADR — reconciliation of Phase-1 review must-fixes

> **This document is the build contract.** Where it conflicts with 10/20/30/40/50,
> **this wins.** It resolves the 36 must-fixes from the Phase-1 review
> ([`05-north-star-and-reviews.md`](./05-north-star-and-reviews.md), avg 78/100,
> "conditional go"). Each decision is terse and final so the build phases start
> from consistent contracts.

## D0 · Scope for MVP (P0)
- **Modes shipped P0:** `mock`, `topic_practice`, `capability_assessment` (invite-token based, no full Org entity). **P1:** `real` (employer-scheduled) and `expert_interview` (inverted flow). In MVP, `real` & `expert` cards render but route to a "coming soon / request invite" sheet — **never a dead-end into the wrong Results UI.**
- **Languages P0:** English end-to-end. `es`, `zh` are P1; the language picker is **gated to supported languages** so a user can never configure an interview the stack can't serve.

## D1 · Model IDs (resolves B1 / prompt-eng blocker)
Authoritative current Anthropic IDs: **`claude-opus-4-8`** (Opus 4.8), **`claude-sonnet-4-6`** (Sonnet 4.6), **`claude-haiku-4-5-20251001`** (Haiku 4.5). All model strings are **env-driven, never literal in code**:
- `CLAUDE_MODEL_LIVE=claude-sonnet-4-6` — the live **Interviewer** turn (latency-critical) and the **fast Reviewer**.
- `CLAUDE_MODEL_DEEP=claude-opus-4-8` — **Planner**, **Analyst**, and the Reviewer's async "re-plan" escalation.
- `CLAUDE_MODEL_GUARD=claude-haiku-4-5-20251001` — cheap safety/turn-taking checks.
The four `CLAUDE_MODEL_*` names in `.env.example` map onto these two tiers; code reads `process.env`, with these as defaults.

## D2 · Multi-agent placement & adaptation contract (resolves architect H1 / prompt-eng H2 / R13)
- **Interviewer** (live, `CLAUDE_MODEL_LIVE`) is the **only model on the hot path**. It may emit a trailing **control token** (a sentinel-marked JSON: `<<<CTRL>>>{"action":"advance|dig|move_on|wrap"}`) to act *this turn*. The parser: on missing/malformed token → **default `advance` on the existing plan**; candidate-origin transcript is stripped of any sentinel before parsing so a user can't spoof control.
- **Response Reviewer** runs **async, strictly off the speech path** (`CLAUDE_MODEL_LIVE` fast; escalates to `CLAUDE_MODEL_DEEP` only when it decides a re-plan is needed). It scores the just-finished answer and may emit a **`PlanPatch`** that lands as a hint for a **later** question — never blocking the current turn.
- **Reconciliation:** `InterviewState.cursor` and `plan` carry a **monotonic `version`**. A `PlanPatch` references the `questionId` it scored; if the cursor has already advanced past it, the patch is **re-targeted to the next open slot or dropped** (staleness bound). Writes use **optimistic concurrency** on `version`. Precedence: the live Interviewer control-token wins for the *current* turn; the Reviewer patch only affects *future* slots.
- Net: adaptation is "applies one question later," deterministically.

## D3 · Live state store & agent-crash recovery (resolves architect H2 / livekit H)
- **Redis** holds hot turn state (plan, cursor+version, last committed interviewer line, per-turn latency marks). **Postgres** is the system of record (sessions, turns, transcript, scores, report). **Async jobs** via **pg-boss** on Postgres (no separate broker needed for MVP; BullMQ is a documented swap).
- Agent **checkpoints to Redis on every committed turn** (sub-turn for the in-flight line). On agent crash: the worker is **redispatched**, **rejoins the same LiveKit room** (room name + agent identity persisted), reads the Redis checkpoint, and **resumes** with a short utterance ("Sorry — I dropped for a second. Where were we…"). **Acceptance:** crash mid-turn resumes with **≤ 4 s dead air, 0 lost/duplicated questions.**
- Redis is added to the architecture component list/diagram (load-bearing for reconnect-resume).

## D4 · Agent runtime language (resolves livekit blocker — the M0 spike)
- **Decision: Node/TS** for the agent worker (`@livekit/agents` + `silero` VAD + `turn-detector` + `deepgram` STT + `cartesia` TTS), with a **custom Anthropic streaming LLM adapter** implementing the agents `LLM` interface (since a first-class Anthropic plugin is not assumed). Rationale: one language + shared types with the API, and the adapter is small and fully testable. **Risk accepted & mitigated:** the adapter is unit-tested against a mocked Anthropic stream; a thin **connectivity spike** (mint token → agent joins a room → echo a TTS line) is the first build task and gates the rest of the voice work. If the spike fails on endpointing fidelity, the fallback is a Python worker (documented, not default).

## D5 · Endpointing & latency budget (resolves voice H / latency contradiction)
- **Two-layer endpointing:** (1) **Silero VAD** for instant barge-in detection; (2) **semantic turn-detector** probability gated by **per-style min/max silence** (Node knobs, ms):

  | style | min_silence | max_silence | turn-end prob |
  |---|---|---|---|
  | friendly | 700 | 4000 | ≥ 0.55 |
  | balanced | 500 | 3000 | ≥ 0.62 |
  | tough | 350 | 2000 | ≥ 0.70 |

  An explicit endpointer combines `vad_silence ≥ min_silence AND (turn_prob ≥ thr OR vad_silence ≥ max_silence)`. A humane **"still thinking" grace**: if the user has spoken < 4 words and pauses, extend by +1500 ms once.
- **Latency budget (reconciled; the table's old "p95 1.5s" is retired):**
  - **Warm turn (cache hit):** EOU→first-audio **p50 ~750 ms, p95 ≤ 2.2 s**.
  - **Cold/first turn (greeting→Q1) & post-5-min cache-miss turn:** **p95 ≤ 3.0 s** (explicitly budgeted; happens every session at least once).
  - Stage marks instrumented: capture→STT-final, STT-final→LLM-first-token, LLM-first-token→TTS-first-audio. Sentence-pipelined LLM→TTS; speculative next-question pre-warm.
- **Partial-vs-final STT:** launch the Interviewer turn on the **STT final** by default; speculative launch on a **stable partial** is allowed but if the final diverges materially the turn is re-prompted; **the FINAL text is always what gets stored for scoring.**
- **Backchannel/filler handling** is **English-lexicon at launch**; non-English uses **timing-only** endpointing (more conservative). Acceptance bars (<1% backchannel false-trigger, <3% false-endpoint) apply to **English only** at launch.
- **Agent-emitted backchannels during user speech** ("mm-hmm") are **feature-flagged OFF** the M3/M4 critical path; require a passing double-talk/self-trigger test before enabling.

## D6 · Barge-in discipline (voice)
On VAD-detected user speech during TTS: **(1) cancel the in-flight LLM stream, (2) cancel TTS synthesis, (3) flush the jitter/playout buffer, (4) transition orb → LISTENING.** Echo/double-talk: gate the VAD against the agent's own TTS energy (AEC + TTS-aware suppression) so the agent never self-interrupts.

## D7 · Orb as honest state machine (resolves UI blocker)
The orb is refactored to render visually distinct states, driven by LiveKit agent-state events over a **data channel** → orb props:

| state | visual | bars |
|---|---|---|
| idle | slow breathe, dim | none |
| listening | mic-level-driven ring expands with user volume | **no bars** |
| thinking | tight pulse + subtle spin | none |
| speaking | full glow + **voiceBars driven by TTS amplitude** | **bars only here** |
| interrupted | quick contract flash → listening | none |

`voiceBars` belong to **SPEAKING only**. Data-channel message shape: `{type:"agent_state", state, level?}`. Accessibility: a **status label + captions carry state** for reduced-motion/VoiceOver; state changes fire accessibility announcements.

## D8 · Net-new client screens & nav params (resolves product blockers)
Add **5 net-new RN screens** (scoped as build work, not "wiring"): **History/Interviews list**, **Transcript view**, **Consent gate** (pre-room), **Analyzing/processing**, **Data & privacy controls**. Plus a **first-run/empty Home** (hide the "up next" hero when there's no scheduled interview; no fake "Hi, Maya").
`RootStackParamList` becomes **parameterized** and frozen in M0:
```
Welcome, SignIn, SignUp: undefined
ChooseMode: { inviteToken?: string }
Setup: { mode: Mode; configId?: string }
Consent: { configId: string }
Live: { sessionId: string }
Analyzing: { sessionId: string }
Results: { sessionId: string; reportId?: string }
Transcript: { sessionId: string }
History: undefined
DataPrivacy: undefined
Plans, Payment: { plan?: PlanId }
```

## D9 · Consent gate flow (resolves UI/privacy blockers + TOCTOU)
A real pre-room screen with **three scope toggles** (microphone [required], camera [optional, default off], recording [optional, default off]). Audio-only is the default. **Mic-denied** → blocking state with a **Settings deep-link** AND a **text-only fallback** entry into the same pipeline. Consent is written to a `ConsentRecord` (versioned, scoped). **Server re-checks `ConsentRecord(scope=recording)` immediately before egress start** on `participant_joined` (closes the TOCTOU window). In-call: a control to **stop recording / withdraw consent mid-session**, and a leave-app **pause-and-resume** warning.

## D10 · Captions surface (resolves UI blocker)
A caption rail below the question card: **partial = dim/italic, final = solid**, speaker-tagged (You / persona), scrollback, clause-highlight synced to TTS. The captions toggle controls this rail. Captions double as the **accessibility + text-fallback** channel.

## D11 · Results states (resolves UI/product H)
Full state design: **partial-results progression** (scores ring first, deep per-question feedback streams in after — labeled, so it never reads as broken), **"Analyzing…" loading**, **"not enough to score" empty state**, **no-recording case** (transcript-only report). Per-question feedback shows **evidence quotes** from the transcript. Transcript view is its own screen.

## D12 · Scoring quality (resolves prompt-eng H/M)
- **Evidence-cited, content-only.** Every competency score maps to a rubric anchor + verbatim transcript evidence; a **self-critique pass** verifies each cited quote actually appears in the transcript; an **affect-language linter** rejects affect/protected-attribute inferences.
- **"Confidence"** keeps its label but the Results screen carries a **tooltip**: "Based on clarity and conviction of *what you said* — never tone, accent, or appearance." (Closes the §11 open question.)
- **Calibration eval (required gate):** golden transcripts must land in expected **score bands**; **run-to-run self-consistency** variance under threshold; an explicit **verbosity-bias test** (a padded empty answer must not outscore a concise strong one).

## D13 · Context governance (resolves prompt-eng M)
Deterministic **rolling-window + summarization** for long interviews; explicit `max_tokens` on the Interviewer turn; a **cache-stability audit** asserting the per-session cached prefix is byte-identical across turns (`usage.cache_read_input_tokens > 0` on turn ≥ 2) so the TTFT assumption holds.

## D14 · Auth, tokens, billing, quota (resolves architect M)
- **Auth:** email/password + Apple/Google OAuth; short-lived access JWT (900 s) + rotating refresh; sessions table for revocation.
- **LiveKit token refresh:** client refreshes at **TTL/2**; access-JWT refresh loop runs independently; mid-session re-mint authorized by valid session ownership; a 20-min interview never loses reconnect ability.
- **Billing:** **RevenueCat** is the entitlement source of truth (Apple IAP / Google Play Billing under it); Stripe only for web/Teams. Contradictory references removed.
- **Quota:** **reserve-on-session-create (idempotent), release-on-failed/canceled, commit-on-first-agent-turn.** A backend hiccup never double-counts or silently consumes a credit.

## D15 · Verification gates (ties to the user's ">90%" requirement)
Every build phase ends with a **scoring review** (the relevant expert lens). A phase is **not done until its review ≥ 90**. The final program gates: **Product E2E review ≥ 90**, **UI/UX review ≥ 90**, **Audio-experience (product-owner) review ≥ 90**, and the **test suite green** (unit + integration + e2e; voice/agent logic unit-tested with mocked vendors; live-call smoke documented as requiring real keys + device).
