# North Star & Phase-1 Review Synthesis

_Lead Architect / PM synthesis of all five Phase-1 reviews. This is the controlling document for the build phases: the consolidated scorecard, the prioritized de-duplicated MUST-FIX list that every milestone must satisfy, the agreed north-star design, and the explicit go/no-go decision._

---

## 1. Consolidated Scorecard

| # | Reviewer | Lens | Score | Verdict (one line) |
|---|----------|------|-------|--------------------|
| 1 | Principal Software Architect | Service boundaries, latency arch, security, failure modes | **85** | Architecturally sound; gating issues are unresolved seams between docs, not structure. |
| 2 | Senior UI/UX Designer | Flow, live-interview UX, Atelier coherence | **72** | Strong conceptual model; spec stops at data contracts, P0 surfaces (orb/consent/captions/Results) undesigned. |
| 3 | Product Designer | End-to-end functionality | **78** | Happy path build-ready; ~5 epic-critical screens + param-less nav dead-end the UI. |
| 4 | Principal Prompt Engineer | Multi-agent design, scoring robustness, latency routing | **82** | Strong prompt architecture; one blocker (model IDs) plus adaptation/calibration gaps. |
| 5 | LiveKit / Full-Duplex Voice | Real-time voice feasibility | **72** | Excellent design intent; load-bearing SDK assumptions unproven for chosen runtime. |
| | **Average** | | **77.8 → 78** | **Conditional go: reconcile, then build.** |

**Spread:** 72–85 (13-point band). No reviewer scored below 72; none above 85. The pattern is consistent: the _design thinking_ is strong across all lenses, but the bundle ships with (a) cross-document inconsistencies that must be reconciled and (b) surfaces/contracts that are specified as prose but not yet designed or proven. Nothing requires re-architecting.

---

## 2. Prioritized, De-Duplicated MUST-FIX List

Items are merged across reviewers; the originating reviewers are noted in brackets. Severity is the **highest** assigned by any reviewer. These are the gates the build phases must close — most before M0 contracts freeze.

### BLOCKERS (must resolve before / at M0; gate the build)

**B1. Unify and verify all model IDs; make every model choice env-driven.** [Architect, Prompt Eng, Voice]
The four docs disagree: `claude-sonnet-4-5` (10-spec, 30 pseudocode), `claude-sonnet-4-6` (20 env), "claude-sonnet (latest)" (40). Pin one live ID via `CLAUDE_MODEL_LIVE`, referenced everywhere; remove all hardcoded model strings from agent pseudocode and prompt files. **Verify `claude-opus-4-8` actually exists in the deployed Anthropic catalog** (authoritative current IDs cited as opus-4-6 / sonnet-4-6 / haiku-4-5); if unconfirmed, move it to Open Questions rather than hardcoding it into Planner/Analyst env. This is a day-one 404 risk and blocks M0 contract freeze.

**B2. De-risk Claude-on-the-hot-path for the agent runtime (the M0 connectivity spike).** [Voice]
The entire synchronous loop assumes a `@livekit/agents-plugin-anthropic` for **agents-js (Node)**, which is confirmed for Python but unproven for Node (OpenAI is the documented first-class Node LLM plugin). Before committing the agent worker's language, run the spike and decide explicitly: (a) write/own a custom Node AgentSession LLM adapter for Anthropic streaming (budget its maintenance + latency tuning), or (b) run the worker in Python (gaining first-class Anthropic plugin, dynamic endpointing, turn-detector; losing shared-types). This decision gates the entire M3 latency milestone — **do the spike before any other voice work.**

**B3. Add the missing client surfaces and redesign the navigation contract to carry params.** [Product Designer, UI/UX]
At least five epic-critical screens have no surface and no route in the built 11: **History/Interviews list** (Epic E), **Transcript view** (RESULTS-5/6), **Consent gate** (LIVE-1/PRIV-1), **Analyzing/processing state** (RESULTS-8), and **Data-controls/privacy** (PRIV-3/4/5). Separately, `RootStackParamList` types every screen as `undefined` — no `sessionId`/`configId`/`reportId`/`inviteToken` flows through the client, so Results cannot fetch its session and "Practice again" cannot replay a config. Re-baseline the bundle from "11 screens exist, design the backend" to "N existing + these net-new surfaces + a typed param contract," and freeze the per-route param shape as part of M0's frozen contracts.

**B4. Refactor the Orb into a true state machine and resolve the voiceBars contradiction.** [UI/UX]
The existing `Orb.tsx` is a single fixed visual; it cannot express the spec's five states (idle/listening/thinking/speaking/interrupted), and the as-built screens contradict themselves (voiceBars under "Speaking…" in LiveScreen vs. under "Listening…" in LiveNightScreen). Specify the data-channel→orb-prop mapping: voiceBars belong to **SPEAKING only**, driven by real TTS amplitude; LISTENING uses a mic-level-driven ring with no bars; define the transient interrupted animation. Without this the product's emotional centerpiece looks identical in every state.

**B5. Design the consent gate and live captions surfaces (P0 gates with no UI).** [UI/UX, Product Designer]
- **Consent gate** (LIVE-1/PRIV-1): three-scope toggle layout, audio-only and no-recording downgrade visuals, and the **mic-denied blocking state** with Settings deep-link AND a recovery path back into the session (or text-only entry). Today SetupScreen navigates straight to Live — this is the most probable hard stop for a real user.
- **Captions** (LIVE-6): placement relative to the question card, partial-vs-final treatment, speaker tagging, scrollback, clause-highlight sync to TTS. The captions toggle currently controls nothing because no rail exists; captions are the comprehension aid for anxious users and the accessibility/text-fallback channel.

### HIGH (resolve before the dependent milestone; several before M1)

**H1. Resolve the Response Reviewer placement contradiction and specify the adaptation-reconciliation contract.** [Architect, Prompt Eng]
10-spec §8 / 40 routing place the Reviewer on Opus in-session near-real-time; 20/30/40 elsewhere mandate Sonnet, async, off the speech path. Pick one and make the docs agree. Then specify: (a) a **staleness bound** on Reviewer patches (patch references the `questionId` it scored; dropped/re-targeted if the cursor advanced past it); (b) **precedence rules** when the Interviewer's control-token action conflicts with the Reviewer's PlanPatch for the same answer; (c) a monotonic version/sequence on `cursor`+`plan` with optimistic concurrency across the async-Reviewer / live-Interviewer / orchestrator writers. **Re-rate R13 from Medium to High.**

**H2. Specify the live conversation state store and agent-crash recovery protocol concretely.** [Architect, Voice]
The docs disagree on the hot-state store (pg-boss/Postgres in 20 vs Redis in 50); Redis is not in the 20 component list/diagram. Define: which store holds hot turn state, the checkpoint cadence and write path, how a respawned worker rejoins the **same** LiveKit room, turn-replay ordering, and the in-flight-turn case (partial utterance never persisted; room grace window vs. redispatch latency = multiple seconds of dead air). Add an acceptance criterion for **AGENT crash** (not just the client 5s drop): resume with ≤ X s dead air and 0 lost/duplicated questions.

**H3. Re-spec endpointing to what the chosen SDK actually exposes, and reconcile the latency budget.** [Voice]
The per-style table (eou_threshold + custom decision rule + backchannel veto + mid-word guard) exceeds Node's native config (coarse min/max delay + single `unlikelyThreshold`; dynamic endpointing is Python-only). Either implement a custom endpointer over raw VAD + turn-detector probabilities, or downgrade the per-style promises to what the SDK delivers. **Reconcile the latency contradiction**: budget table says p95 ~1.5s, acceptance criteria say p95 ≤ 2.2s — the 1.5s is not defensible. Add an explicit budget line for the **first turn and any post-5-min-gap turn** (cache miss / full prefix processing — happens every session at greeting→Q1) and re-measure TTFT against the pinned model.

**H4. Define the entitlement/quota decrement as an idempotent, lifecycle-tied operation.** [Architect]
Reserve on session create with release on failed/canceled, or commit on first agent turn — so start/fail/retry cannot double-count or bypass the cap, reconciled with the failure-mode promise that quota is never lost on a backend hiccup.

**H5. Add a scoring-calibration eval (not just schema/evidence/affect checks).** [Prompt Eng]
Golden transcripts must land in expected score **bands**; check run-to-run stability (self-consistency variance threshold); explicitly test for **length/verbosity bias** (a padded empty answer must not outscore a concise strong one); define an inter-rater/calibration target. This is the gap most likely to make the scorecard feel arbitrary.

**H6. Define the Interviewer control-token failure path.** [Prompt Eng]
On missing/malformed trailing control JSON: specify the safe default (recommend: advance on existing plan) and a sentinel-marker guard so a fenced block spoken by the candidate cannot be mis-parsed as a control signal.

**H7. Specify the full invite-driven flow for Real & Capability modes, and resolve the ship-vs-stub ADR.** [Architect, Product Designer]
Decide whether the Planner runs, who supplies questions, and whether an Org entity ships or is replaced by a lightweight invite token. Design the locked-mode UI in ChooseMode, the "how to get invited" surface, and the "Up next" open-without-configuring entry (SETUP-10). **Resolve before M1** — Home's most prominent CTA (the REAL INTERVIEW hero) leads into the least-defined mode.

**H8. Make the Setup screen functionally complete to spec.** [Product Designer]
Editable Role/Language/Length pickers (not static rows), JD/resume upload with parsing status (SETUP-6), and a "Building your interview…" blocked/double-submit state that waits for plan generation + room provisioning before navigating to Live (SETUP-8).

**H9. Define the Expert Interview mode's distinct setup and output, or descope it.** [Product Designer]
As an inverted flow (user interviews the AI), it cannot reuse the candidate-scoring Results scorecard or Analyst templates. Either specify its own setup variant + output artifact, or explicitly cut it from MVP — do not leave it as a card that dead-ends into the wrong Results UI.

**H10. Specify the full Results screen state design.** [UI/UX, Product Designer]
Per-question feedback with evidence quotes, transcript view, the partial-results progression (scores-first, deep-feedback-after, RESULTS-8) so it doesn't read as broken, the "analyzing" loading state, "not enough to score" empty state, and the no-recording case. This is the payoff surface and the least-designed.

**H11. Design the connection/resilience UI states.** [UI/UX]
Connecting, reconnecting (whether/how the timer visibly pauses), waiting-for-agent, degraded "weak connection — audio only" chip, and reconnect-resume surfacing. The orb state table covers only the 5 conversational states; transport states are named but undrawn — exactly when users panic.

**H12. Fully specify the feedback-chip interaction model.** [UI/UX]
Persistence/auto-dismiss duration, enter/exit animation and whether it displaces layout, stacking rules, what (if anything) shows on weaker answers under the positive-only rule, and timing so a chip never lands mid-answer. Resolve the tone-coherence question between tough-style voice and an always-affirming green UI.

**H13. Make backchannel/filler detection language-aware.** [Voice]
The English-only lexicon will fail the <1% backchannel-false-trigger and <3% false-endpoint bars in es/zh and other supported languages. Either gate the acceptance bars to English-at-launch (conservative timing-only endpointer elsewhere) or source per-language backchannel handling. Tie explicitly to the `language` setup field.

### MEDIUM (resolve during the relevant build phase)

**M1. Close the recording-consent TOCTOU window.** [Architect] Add an explicit server-side consent re-check (server-checked `ConsentRecord` with scope=recording) immediately before egress start on `participant_joined`, matching PRIV-1.

**M2. Lock the billing source-of-truth ADR.** [Architect] Choose RevenueCat vs direct store webhooks + Stripe reconciliation (10-spec and 20 env contradict); remove the dead references; define the receipt → entitlement → quota-gate path since that gate blocks session creation.

**M3. Specify the LiveKit token + access-JWT refresh loop for long interviews.** [Architect] Client refresh cadence, what authorizes a mid-session re-mint, and behavior if the access JWT (900s) expires concurrently, so a 20-minute interview can't silently lose reconnect ability.

**M4. Resolve the "Confidence" competency naming + transparency.** [Prompt Eng] Either rename the user-facing label to something unambiguously behavioral, or pin exact Results copy + tooltip stating the content-only / no-affect definition. Close the §11 open question as a decision.

**M5. Make multilingual a decision, not an open question.** [Prompt Eng, Voice] State which languages are P0 end-to-end (persona localization + Deepgram STT + Cartesia/ElevenLabs voice reconciled with the picker), **gate the picker to supported languages**, decide whether evidence quotes stay in source language, add a non-English scoring-quality eval.

**M6. Specify live-path context governance.** [Prompt Eng] Deterministic rolling-window/summarization policy for long interviews, explicit `max_tokens` for the Interviewer turn, and a cache-stability audit (verify `cache_read_input_tokens > 0` on turn 2+) so the TTFT assumption holds.

**M7. Define the partial-vs-final STT launch policy.** [Voice] Specify when it is "safe" to launch the Sonnet turn on a partial vs final, how a post-launch final revision is handled (re-prompt vs commit), and ensure the **final** text is what gets stored for scoring.

**M8. Gate "human-touch" TTS-during-user-speech (agent backchannels) behind a flag, off the M3/M4 critical path.** [Voice] It is a genuine double-talk/self-trigger hazard layered on the most fragile part of the loop; add a self-trigger test before enabling.

**M9. Add in-call consent/privacy affordances to Live.** [Product Designer] A control to stop recording / withdraw consent mid-session (PRIV-7) and the leave-app pause-and-resume warning (LIVE-14) — specified in copy/backend but with no UI hook.

**M10. Specify the empty/first-run Home state.** [Product Designer] Hide the REAL INTERVIEW hero when there is no "up next"; define the new-user Home (no up-next, empty history) so a fake scheduled interview isn't shown to every new account.

**M11. Define the accessibility fallback for agent state.** [UI/UX] For reduced-motion / VoiceOver users the orb conveys nothing — status label + captions must carry state, with accessibility announcements on state change. Promote from a single M8 line to designed behavior.

---

## 3. North Star — The Agreed Design

**RoboHire is a mobile voice-first mock-interview product whose defining bet is a single-synchronous-model conversational loop that feels human.** The architecture all five reviewers endorsed rests on one invariant: the request path never calls a model vendor synchronously, never holds WebRTC, and never blocks on egress. A stateless API acts as system-of-record; an ephemeral per-room Agent worker joins LiveKit as a participant and runs the live loop with media flowing SFU↔agent over WebRTC (never round-tripping the API); a durable queue handles all slow/expensive work. On the hot path there is **exactly one model — Sonnet as the Interviewer** — with sentence-pipelined LLM→TTS, a prompt-cached stable prefix, and speculative next-question pre-warm, against a per-stage latency budget (EOU→first-audio ~750ms p50). Every "deep" capability — the Planner, the Response Reviewer, evidence-grounded Analyst scoring — runs on Opus strictly **async and off the speech path**, with adaptation landing as a hint for the _next_ turn rather than blocking the current one. Naturalness is engineered, not hoped for: two-layer endpointing (sensitive VAD for instant barge-in + a semantic turn detector gated by per-style timing), a strict barge-in flush sequence (cancel LLM, cancel TTS, flush the jitter buffer), TTS-aware double-talk gating, and a humane "still thinking" grace for anxious users — all gated by measurable acceptance criteria, not vibes.

The product is built to be **safe, compliant, and never a dead end**. Scoring is content-only and evidence-cited (every score maps to a rubric anchor and carries verbatim transcript evidence, with a self-critique pass and an affect-language linter); the multi-agent brain is bounded by a persisted, versioned plan with per-agent state-slice routing that keeps the bias and prompt surface small. Security is defense-in-depth: short-TTL scoped LiveKit tokens, a separate agent identity, RLS on user-scoped tables, private R2 with expiring signed URLs, and server-side-only secrets. A designed degradation ladder (full A/V → audio-only → fallback TTS → text fallback re-entering the same pipeline with scoring parity) and transcript-driven analysis mean the report survives a failed recording or a rough network. **The single most important thing the build must protect is the feeling of the live conversation** — the latency budget, the barge-in discipline, and the orb-as-honest-state-machine. Everything else (the brain's depth, the analysis, the planning) is deliberately pushed off the synchronous path so that depth never costs presence. The Phase-1 work proved this design is right; the build phases must now make the four documents agree, design the surfaces the spec only described in prose, and prove the SDK can deliver the wiring the design assumes.

---

## 4. Go / No-Go Decision

**Decision: CONDITIONAL GO.** The design clears the architecture and product-vision bar. It is **not ready to build as-is**, and it does **not** require re-architecting. Proceed under the following gates:

- **GO immediately on the M0 connectivity spike (B2)** — the Anthropic-on-Node-vs-Python decision and the endpointing-SDK-surface question. This is the highest feasibility risk and it determines the agent worker's language. Nothing downstream is credible until it is settled.
- **Before M0 contract freeze:** close **B1** (unify/verify model IDs, env-drive them) and **B3** (net-new screens scoped + typed navigation param contract). Contracts cannot freeze on inconsistent model strings or a param-less nav graph.
- **Before M1:** close **B4, B5** (orb state machine + voiceBars, consent gate, captions) and the high-severity reconciliations **H1, H2, H3, H4, H7** (Reviewer placement + adaptation contract; state store + agent-crash recovery; endpointing/latency reconciliation; quota decrement; Real-mode ship/stub ADR). These are the seams that, left open, will produce a technically correct voice loop wrapped in a UI that looks the same in every state and dead-ends on a denied mic.
- **NO-GO on M3 (the headline latency milestone) as currently specified** until the latency budget is internally reconciled (table 1.5s vs acceptance 2.2s) and endpointing is mapped to the SDK that wins the spike.
- **Remaining HIGH items** are milestone-gated to their dependent phase; **MEDIUM items** are tracked and resolved within the relevant build phase.

This is a one-pass reconciliation plus a focused round of surface design and one decisive spike — not a redesign. Close the blockers and high-severity consistency items and the bundle clears the build gate; the underlying plan can absorb all of it.

OVERALL_SCORE: 78