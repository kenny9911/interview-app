# 50 · viva — Detailed End-to-End Product Task Plan

> **Purpose.** Take viva from "11 static Expo/React Native screens" to a demonstrably working end-to-end product: real backend, full-duplex LiveKit voice+video, a 4-agent interview brain, evidence-based analysis/reporting, and the compliance scaffolding a consumer practice app requires.
>
> **How to read this.** Work is organized into **milestones M0 → M8**. Each milestone has a single **goal**, a **task breakdown split across 7 workstreams**, explicit **dependencies**, and a hard **Definition of Done (DoD)**. A **risk register** and a **verification strategy** (what gates each milestone) follow. The plan is sequenced so the E2E flow is provable at the end of M5 and hardened by M8.
>
> **Grounding note.** The frontend already exists in `/Users/kenny/code/interview-app/mobile` (Expo SDK 56, RN 0.85, React Navigation, `src/screens/*`, `src/components/Orb.tsx`). Today every screen is static — e.g. `LiveScreen.tsx` hardcodes the timer (`14:52`), `Question 3 of 8`, the transcript line, and the feedback chip; controls navigate but do nothing. This plan replaces that static layer with live data while preserving the *Atelier* art direction.

---

## 0. The end-to-end flow we must make work

The product owner's bar is a *demonstrable* happy path plus the consent/results/teardown surrounding it:

```
Welcome → Sign in / Create account
   → Home (greeting, "up next", 2×2 practice grid)
   → Choose mode (mock | real | topic_practice | capability_assessment | expert_interview)
   → Set up (role, persona[Aria|Sam|Lena], style[friendly|balanced|tough], language, length, topic, optional JD+resume)
   → [consent: mic / cam / recording]
   → Live interview
        • client joins LiveKit room with minted token
        • Agent worker joins the room, greets, asks Q1
        • full-duplex turn-taking: VAD + turn detector + streaming STT → LLM → streaming TTS
        • Response Reviewer scores each answer, adapts the plan, drives orb state + live captions + feedback chip + progress dots
   → user ends call (or timer/length reached)
   → Analyst runs on the full transcript
   → Results (score ring, metric bars, stood-out / work-on, per-question feedback, transcript)
   → Plans / Payment (entitlement gating) + export / delete (compliance)
```

Everything below exists to make exactly this provable, then robust.

---

## 1. Stack review & refinements (decisions that shape the milestones)

The proposed stack is sound. Refinements adopted by this plan:

| Area | Decision / refinement | Rationale |
|---|---|---|
| Backend framework | **Fastify** (TS) over Express | First-class schema validation (`@fastify/type-provider-typebox`), faster, native hooks for auth/rate-limit, clean webhook routes for LiveKit + Stripe. |
| Auth | **Managed auth (Clerk or Supabase Auth)** behind our own `users` table, not hand-rolled JWT | Removes a whole class of security work from a consumer app; we still own session/entitlement state in Postgres. |
| Agent runtime | **LiveKit Agents (Node/TS)** worker, deployed separately from the API | Voice loop has different scaling/latency profile than CRUD API; keep them independent. |
| LLM routing | **Claude Opus 4.8 (`claude-opus-4-8`)** for Planner / Reviewer-deep / Analyst; **Sonnet** for in-turn turn-taking + per-answer fast review. **Prompt caching** on system prompt + rubric + JD/resume. | Opus quality where it's read once per phase; Sonnet latency where it's read every turn. Caching cuts cost + TTFT on the static context block. |
| TTS | Default **Cartesia**, **ElevenLabs** as a config-swap fallback behind a `TtsProvider` interface | Cartesia for latency; keep provider swap to de-risk vendor/voice availability. |
| STT | **Deepgram** streaming, interim + final results | Interim results drive live captions; finals feed the LLM. |
| Turn-taking | **Silero VAD + LiveKit turn detector**, with semantic endpointing tuning | Sub-1.5s end-of-speech → first-audio target requires real endpointing, not fixed silence timeouts. |
| Data | **Postgres (Neon) + pgvector**; **Cloudflare R2** for audio/video/reports | pgvector reserved for resume/JD chunk retrieval and "similar past answers"; R2 for egress recordings + generated PDFs. |
| Multi-agent shape | Planner + Reviewer + Analyst are **server-side LLM services**; the **Interviewer is the LiveKit Agent**. Shared state via a `session_state` row + Redis for hot turn state. | Only the Interviewer needs to live in the realtime worker; the rest are request/stream services the worker and API call. |
| Scoring policy | **Competency/content-based only.** No affect/emotion/sentiment-from-voice inference. Every score **evidence-cited** (transcript span) with a human-readable rationale. | Compliance requirement and product-quality requirement both point the same way. |

> **Open decisions to lock in M0** (tracked as ADRs): managed-auth vendor (Clerk vs Supabase), TTS default voice mapping per persona, video recording on by default vs opt-in, and whether real-mode (employer-scheduled) ships in v1 or is stubbed.

---

## 2. Workstreams (the agent teams that execute)

Every task is tagged with one or more of these. The orchestration runs these as parallel agent workstreams with the milestone DoDs as sync points.

| Tag | Workstream | Owns |
|---|---|---|
| **BE** | Backend API | Fastify app, auth, setup, token mint, session lifecycle, persistence, webhooks, billing/entitlements, export/delete. |
| **VA** | LiveKit Agent / Voice | Agents worker, VAD/turn-detector/STT/LLM/TTS pipeline, barge-in, the live Interviewer persona, data-channel events. |
| **FE** | Frontend wiring | Replace static screens with live data, LiveKit RN room, consent UI, orb/captions/controls/results wiring, error & network states. |
| **PR** | Prompt library | Planner/Interviewer/Reviewer/Analyst prompts; per-mode × per-persona × per-style × per-topic system prompts; caching structure; eval harness. |
| **AN** | Analysis / Report | Reviewer scoring schema, Analyst pipeline, scorecard computation, evidence citation, report generation (JSON + PDF). |
| **IO** | Infra / DevOps | Envs, secrets, Neon/R2/Redis provisioning, CI/CD, worker deploy, observability (latency metrics, traces), egress config. |
| **QA** | QA / Tests | Unit/integration/e2e/load/latency tests, voice-quality eval rig, compliance tests, the >90% review gate harness. |

---

## 3. Milestones

### M0 — Foundations & contracts
**Goal.** Stand up repos, environments, the shared API/event contract, and the data model so all workstreams can build in parallel against frozen interfaces. Nothing user-facing yet.

**Task breakdown**
- **BE** — Monorepo (pnpm workspaces): `apps/api`, `apps/agent`, `packages/shared` (types/contracts), `packages/prompts`. Fastify skeleton, health check, config loader, error envelope. Define the **OpenAPI/TypeBox contract** for: `POST /sessions` (create from prefs), `POST /sessions/:id/token` (LiveKit mint), `GET /sessions/:id`, `GET /sessions/:id/report`, `POST /webhooks/livekit`, `POST /webhooks/stripe`. Define the **data-channel event schema** (orb state, caption deltas, question index, feedback chip, error) in `packages/shared`.
- **VA** — Agents worker skeleton that connects to LiveKit Cloud using `.env` creds, joins a room, logs participant events, publishes a no-op TTS "hello". Prove worker ↔ room connectivity only.
- **FE** — Wire a typed API client + LiveKit RN SDK into the existing app; introduce a config flag `USE_MOCK_BACKEND`. No screen behavior change yet, but every screen reads from a (mock) store rather than literals. Extract hardcoded values in `LiveScreen.tsx` (`14:52`, `Question 3 of 8`, transcript, chip) into props/state.
- **PR** — Author the **prompt contract**: the JSON shapes Planner emits (question plan), Reviewer emits (per-answer score + next-question directive), Analyst emits (report). Stub system-prompt files per mode/persona/style with TODO bodies so downstream can integrate against shape, not content.
- **AN** — Lock the **scoring schema**: competencies (Communication, Structure, Depth, Confidence — extensible), 0–100 + band, required `evidence[]` (transcript span refs) and `rationale` per score; report schema (overall, per-competency, stood-out[], work-on[], per-question[]).
- **IO** — Provision Neon (with pgvector), R2 buckets (`recordings/`, `reports/`), Redis, LiveKit Cloud project (confirm `.env` keys load). CI: lint + typecheck + test on PR. Secrets management (no creds in repo). Migrations tool (Drizzle or Prisma) with the initial schema: `users, sessions, setups, transcripts, turns, scores, reports, consents, entitlements, payments`.
- **QA** — Test harness scaffolding (Vitest + Supertest for API, Detox/Maestro plan for app). Define the **>90% review-gate rubric** as a checklist scorer (architect / UI / product / audio dimensions) so gates are mechanical, not vibes.

**Dependencies.** None (this is the root). All later milestones depend on M0's frozen contracts.

**Definition of Done.**
- `pnpm i && pnpm -r build && pnpm -r test` green in CI.
- Agent worker connects to the LiveKit room and a second test client hears a "hello" TTS clip.
- Contracts (`packages/shared`) published and imported by api/agent/app; mock backend serves every screen.
- Migrations apply cleanly to a fresh Neon branch; ADRs for the open decisions are written and accepted.

---

### M1 — Auth, setup capture & session creation
**Goal.** A user can sign up / sign in, navigate Home → Choose mode → Set up, and the **full preference set is captured and persisted as a session** (no voice yet).

**Task breakdown**
- **BE** — Auth integration + `users` sync. `POST /sessions` validates and stores all setup prefs (mode, persona, style, language, length, role, topic, optional JD + resume upload to R2 + text extraction). `GET /sessions/:id` returns hydrated state. Entitlement check stub (free tier allows N sessions).
- **VA** — n/a (consumes session config in M3); review the session config shape for completeness against the voice pipeline's needs.
- **FE** — Wire SignIn/SignUp to real auth; Home greeting + "up next" + practice grid from API; ChooseMode → SetupScreen writes prefs; file pickers for JD/resume; submit creates a session and routes toward Live. Replace `SetupScreen.tsx` literals with controlled inputs + validation.
- **PR** — n/a directly, but verify captured prefs are sufficient inputs for the Planner prompt (role, JD, resume, topic, style, persona, length, language). Flag any missing field now.
- **AN** — Define how language affects scoring/report locale.
- **IO** — R2 upload presigning; PII handling policy for resume/JD (encryption at rest, retention tag).
- **QA** — API contract tests for `/sessions` (valid/invalid prefs, oversized uploads, unauthorized). App e2e: sign-up → setup → session created.

**Dependencies.** M0 (contracts, schema, auth vendor).

**Definition of Done.**
- New user can register, log in, complete Choose-mode + Set-up, and a `sessions` row exists with every preference + uploaded artifacts.
- Invalid/oversized inputs are rejected with the standard error envelope and surfaced in the UI.
- Entitlement stub blocks a 2nd session on free tier (or allows per ADR).

---

### M2 — Interview brain (offline): Planner + Reviewer + Analyst contracts proven without voice
**Goal.** Prove the multi-agent brain produces correct, evidence-cited outputs **on text fixtures**, before wiring it to realtime. This de-risks the hardest LLM work independent of audio.

**Task breakdown**
- **BE** — Services: `PlannerService.buildPlan(session)`, `ReviewerService.scoreTurn(turn, plan, state)`, `AnalystService.analyze(transcript)`. Persist plan to `session_state`, scores to `scores`, report to `reports`. Redis hot-state for the live loop later.
- **VA** — Define the interface the worker will call mid-turn (Reviewer fast path) vs end (Analyst). Confirm latency budget for the in-turn Reviewer call (Sonnet, streaming-not-required).
- **FE** — n/a (Results will consume in M5); can render a Results preview from a fixture report to validate the schema visually.
- **PR** — **Author the real prompts.** (1) **Planner** — turns prefs+JD+resume into an ordered, adaptive question plan with intent tags and rubric hooks. (2) **Interviewer** persona prompts — Aria/Sam/Lena × friendly/balanced/tough × per-mode framing × per-topic depth; warm, non-technical-friendly tone matching *Atelier* voice. (3) **Reviewer** — scores an answer against the competency rubric, cites evidence, emits next-question directive (probe / move on / go deeper / ease up). (4) **Analyst** — full-transcript synthesis. Structure all four with a **cached static block** (rubric, persona, JD/resume) + dynamic suffix. Build a small **prompt eval set** (golden transcripts → expected score ranges + required evidence behavior).
- **AN** — Implement scorecard computation from Reviewer per-turn scores + Analyst overall; enforce **no-affect** rule (lint the prompt outputs for emotion-inference language); enforce every score carries `evidence[]` + `rationale`.
- **IO** — Anthropic key management, prompt-cache hit metrics, token/cost dashboards.
- **QA** — Run the prompt eval set: scores land in expected bands, evidence spans actually exist in the transcript, no affect language, JSON always parses. Adversarial fixtures (rambling answer, empty answer, off-topic, non-English).

**Dependencies.** M1 (session prefs available). Can run **in parallel with M3** since it uses fixtures.

**Definition of Done.**
- Given a fixture session, Planner emits a valid plan; Reviewer scores each fixture answer with valid evidence spans + rationale and a sane next-question directive; Analyst emits a schema-valid report.
- Eval set passes thresholds (e.g. ≥90% schema-valid, 100% evidence-citation, 0 affect-language hits).
- Prompt caching demonstrably hits on the static block (cache-read tokens > 0 on 2nd+ turn).

---

### M3 — Live voice loop (single happy turn)
**Goal.** A real person joins a real room, the Interviewer greets and asks a question, the person answers, and the agent responds — **one clean full-duplex turn** with barge-in working. This is the riskiest milestone; isolate it.

**Task breakdown**
- **BE** — `POST /sessions/:id/token` mints a LiveKit token scoped to the room; dispatches/triggers the agent for that room; `POST /webhooks/livekit` records room/participant/egress lifecycle to `sessions`.
- **VA** — Build the full pipeline in the worker: **Silero VAD → LiveKit turn detector → Deepgram streaming STT → Claude (Sonnet, in-turn) → Cartesia streaming TTS**, full-duplex with **barge-in** (user speech interrupts TTS playback; agent yields). Publish data-channel events: orb state (idle/listening/thinking/speaking), interim+final captions, current question index. Pull the question plan + persona prompt from M2 services.
- **FE** — Real **consent gate** (mic/cam/recording) before token request. LiveKit RN room join; mic publish; render Orb state from data-channel events; render live captions; wire Mic/Captions/Video/Hangup controls. Replace the static orb label/"Speaking…" with live state in `LiveScreen.tsx`.
- **PR** — Tune Interviewer turn-taking prompt for *spoken* brevity (no walls of text; one question at a time; natural acknowledgments). Author the greeting + closing lines per persona.
- **AN** — n/a this milestone (scoring is M4 in-loop), but log every final transcript turn to `turns` for later analysis.
- **IO** — Deploy the worker (autoscaling per room), configure recording egress to R2, set up **latency instrumentation**: measure end-of-speech → first-TTS-audio per turn and emit to a dashboard. TURN/relay verified.
- **QA** — Manual + scripted: join from a real device, complete one turn, confirm barge-in interrupts TTS within target, captions match speech, orb states transition correctly. Capture the latency number.

**Dependencies.** M0 (worker connectivity), M1 (session/token), M2 (plan + persona prompt available as a service).

**Definition of Done.**
- On a real iOS device: consent → join → agent greets → asks Q1 → user answers → agent acknowledges/responds, all hands-free.
- **Barge-in works**: speaking over the agent stops its audio promptly.
- Median end-of-speech → first-audio **< 1.5s** on a good network (recorded in the dashboard).
- Transcript turns persisted; orb + captions reflect live state.

---

### M4 — Adaptive multi-turn interview (brain in the loop)
**Goal.** A complete, coherent, **adaptive** interview: the Reviewer scores each answer live and steers the next question; progress + per-answer feedback show in the UI; the interview ends correctly (length reached or user ends).

**Task breakdown**
- **BE** — Session lifecycle state machine: `created → live → completed → analyzed`. Enforce length/time budget; handle graceful end + agent-initiated wrap-up. Persist per-turn scores from the in-loop Reviewer.
- **VA** — Orchestrate the loop: after each user final transcript, call Reviewer (Sonnet fast path), apply its directive to select/rephrase the next planned question (probe deeper, move on, ease up), update question index, drive the feedback-chip event. Maintain conversation memory + Redis hot-state. Handle silence/no-answer, very long answers (interject), and off-topic recovery.
- **FE** — Live **progress dots + "Question N of M"**, the **feedback chip** ("Nice — you gave a concrete example") driven by Reviewer events, captions history/scrollback, timer bound to real session length. Wire end-of-interview transition to a "analyzing…" state. Replace remaining `LiveScreen.tsx` literals.
- **PR** — Iterate Interviewer + Reviewer prompts for adaptation quality (does it actually probe weak answers, ease up on tough mode when user struggles, respect persona/style throughout). Expand eval set with multi-turn dialogue trees.
- **AN** — Stream per-turn scores into the running scorecard; ensure evidence spans reference the correct turn ids.
- **IO** — Cost/latency dashboards now per-session (Sonnet calls per turn); alerting on Reviewer latency spikes that would stall turns.
- **QA** — Multi-turn e2e: run full mock interviews across all 3 personas × 3 styles; verify adaptation (planted weak/strong answers change next question), correct end conditions, feedback chips fire sensibly. Network-degradation tests (packet loss, reconnect mid-interview).

**Dependencies.** M2 (Reviewer/Planner services), M3 (live loop).

**Definition of Done.**
- A full interview of N questions completes hands-free across at least one persona×style, with **visible adaptation** to answer quality.
- Progress, timer, and feedback chip are all live and correct; interview ends cleanly on length or user action and transitions to "analyzing".
- Reconnect after a transient network drop resumes the session without losing transcript/state.

---

### M5 — Analysis, Results & the provable E2E flow
**Goal.** Close the loop: post-interview Analyst runs, the **Results screen renders the real report**, and the entire happy path (Welcome → Results) is demonstrable end to end. **This is the "it works" milestone.**

**Task breakdown**
- **BE** — On `completed`, enqueue Analyst job; on completion set `analyzed` and store `reports` row + R2 PDF. `GET /sessions/:id/report` serves it. Home "history" reads completed sessions.
- **VA** — Agent posts the final transcript + per-turn scores handoff to the Analyst trigger; clean room teardown + egress finalize.
- **FE** — **Results screen wired to the real report**: score ring (overall), metric bars (per competency), stood-out / work-on, per-question feedback, full transcript view, audio playback link (from R2). Loading + error states for "analysis in progress". Update `ResultsScreen.tsx` to consume API.
- **PR** — Final Analyst prompt polish so the report reads warm + actionable for a non-technical audience (the *Atelier* voice), evidence-cited, no affect language.
- **AN** — Full Analyst pipeline: synthesize per-turn scores + transcript into overall scorecard, top "stood out" + "work on" with cited evidence, per-question feedback, and a human-readable narrative. PDF render. Consistency check (overall ≈ aggregate of per-competency).
- **IO** — Background job runner for analysis (queue + worker), retry on LLM failure, report-generation latency dashboard.
- **QA** — **Full E2E gate**: scripted run from Welcome through Results on a device, asserting the report is evidence-cited, affect-free, and internally consistent. Snapshot tests of Results rendering against fixture reports.

**Dependencies.** M1–M4.

**Definition of Done.**
- A single uninterrupted run — sign in → setup → consent → live adaptive interview → analyzing → Results — works on a real device and produces an evidence-cited, affect-free, consistent report rendered in the existing Results UI.
- Report retrievable via API + PDF in R2; audio playback works.
- The orchestration's product/architecture/UI/audio review gate scores **> 90%** on this flow.

---

### M6 — Monetization, modes breadth & compliance surface
**Goal.** Turn the single happy path into the actual product: all 5 modes, Plans/Payment with entitlements, and the user-facing compliance controls.

**Task breakdown**
- **BE** — Stripe integration (`/webhooks/stripe`), entitlement enforcement (free vs paid: session count, length caps, mode access). **Consent records** persisted per session; **data export** (transcript+report+audio bundle) and **delete** (cascade across Postgres + R2) endpoints. Retention job (auto-delete after window).
- **VA** — Mode-specific interviewer behavior: `topic_practice` (focused drills), `capability_assessment` (structured rubric-heavy), `expert_interview` (deep domain), `real` (employer-scheduled — ship or stub per M0 ADR). `mock` already covered.
- **FE** — Plans + Payment screens wired to Stripe; paywall/entitlement states; **consent management + data controls** screen (export/delete, retention toggle); per-mode setup variations; Live-night variant wired.
- **PR** — Per-mode × per-topic specialized system prompts authored by domain framing (e.g. PM, eng, sales, design topic packs) layered on the persona prompts. Topic library structure in `packages/prompts`.
- **AN** — Mode-aware report emphasis (e.g. capability_assessment surfaces rubric coverage; topic_practice surfaces drill mastery).
- **IO** — Stripe keys/webhooks, R2 lifecycle rules for retention, audit log for export/delete actions.
- **QA** — Entitlement matrix tests, payment webhook tests (idempotency), **compliance tests**: consent required before any media; export bundle complete; delete actually purges Postgres + R2; no affect data anywhere.

**Dependencies.** M5.

**Definition of Done.**
- All 5 modes run end-to-end (or `real` stubbed per ADR with a clear "scheduled" state).
- Paid entitlement unlocks gated capability; free tier is correctly capped.
- Consent is enforced pre-media; export produces a complete bundle; delete verifiably purges all stores; retention job runs.

---

### M7 — Voice quality, latency & resilience hardening
**Goal.** Make the voice experience feel genuinely natural and survive bad conditions — the product owner's explicit "satisfactory audio experience" bar.

**Task breakdown**
- **BE** — Graceful session recovery APIs (resume token, state rehydrate); circuit breakers around STT/TTS/LLM vendors.
- **VA** — Endpointing/turn-detector tuning (reduce false barge-ins and premature cutoffs); TTS prosody/voice mapping per persona; filler/backchannel handling; fallback chains (TTS provider swap, STT reconnect, LLM retry) without dropping the call; handle echo/double-talk. Tighten the sub-1.5s budget under load.
- **FE** — Robust network/error UX (reconnecting banner, degraded-mode captions-only, mic-permission-lost recovery); orb micro-animation polish for state transitions.
- **PR** — Spoken-style refinements so the Interviewer never produces text that sounds robotic when voiced; barge-in-aware phrasing (resumable thoughts).
- **AN** — Ensure partial/interrupted interviews still produce a meaningful (clearly-labeled partial) report.
- **IO** — **Load test** concurrent rooms; autoscale validation; latency SLO dashboards + alerts; chaos tests (kill a vendor, drop a region).
- **QA** — **Voice-quality eval rig**: scripted conversations measuring latency distribution (p50/p95), barge-in success rate, caption WER, turn-taking false-positive rate, across network profiles (good/3G/lossy). Soak test (long interviews).

**Dependencies.** M3–M6.

**Definition of Done.**
- p50 end-of-speech→first-audio < 1.5s and p95 within an agreed ceiling under N concurrent rooms.
- Barge-in success rate and turn-taking false-positive rate meet agreed thresholds; no dropped calls on single-vendor failure (fallback engages).
- Degraded-network runs stay usable; interrupted interviews still yield labeled partial reports.

---

### M8 — Final hardening, security, accessibility & launch gate
**Goal.** Production-ready: security, accessibility, observability, store readiness, and the final >90% gate across all review dimensions.

**Task breakdown**
- **BE** — Security pass (authz on every route, rate limits, input validation, signed URLs, secret rotation); webhook signature verification; PII minimization audit.
- **VA** — Final stability soak; cost guardrails (per-session token/$ caps with graceful wrap-up).
- **FE** — Accessibility (captions always available, dynamic type, VoiceOver labels, reduced-motion orb), iOS + Android device matrix, store assets, error/empty states everywhere, analytics events.
- **PR** — Prompt-injection hardening (resume/JD are untrusted input; ensure they can't override system/persona/scoring); red-team the personas for unsafe outputs.
- **AN** — Final consistency + fairness review of reports; ensure rationale language is constructive and non-judgmental; sample audit.
- **IO** — Production env, blue/green deploy, backups, runbooks, on-call/alerting, DPA/privacy-policy hosting, app-store privacy nutrition labels.
- **QA** — Full regression suite green; security review; accessibility audit; the **final review gate (architect + UI + product + audio) > 90%**; sign-off checklist.

**Dependencies.** M0–M7.

**Definition of Done.**
- All test suites (unit/integration/e2e/load/voice/compliance) green in CI.
- Security + accessibility audits pass; prompt-injection attempts via resume/JD fail to alter behavior.
- Product owner audio sign-off obtained; final cross-dimension review **> 90%**; builds submittable to App Store + Play.

---

## 4. Milestone dependency map

```
M0 Foundations
 ├─► M1 Auth + Setup + Session
 │     ├─► M2 Interview brain (offline, fixtures)  ─┐
 │     └─► M3 Live voice loop (single turn) ◄───────┘ (uses M2 services)
 │                 └─► M4 Adaptive multi-turn
 │                        └─► M5 Analysis + Results = PROVABLE E2E
 │                               └─► M6 Monetization + modes + compliance
 │                                      └─► M7 Voice/latency/resilience hardening
 │                                             └─► M8 Final hardening + launch gate
 └─ (IO/QA scaffolding from M0 underpins all)
```
M2 and M3 can proceed **in parallel** after M1; M2 is fixture-driven, M3 needs only M2's service interfaces (mockable).

---

## 5. Risk register

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Voice latency exceeds 1.5s target (STT+LLM+TTS chain) | High | High | Sonnet for in-turn; prompt caching on static block; streaming TTS first-chunk; measure per-turn from M3; budget alerts; M7 dedicated tuning. |
| R2 | Barge-in / turn-taking feels unnatural (false cutoffs or talk-over) | High | High | Silero VAD + LiveKit turn detector with semantic endpointing tuning; voice-quality eval rig with false-positive metric; isolate as M3 risk milestone. |
| R3 | Reviewer/Analyst hallucinate scores or cite non-existent evidence | Medium | High | Enforce evidence spans must exist in transcript (validator); golden eval set; schema-strict JSON; reject + retry on invalid. |
| R4 | Affect/emotion inference leaks into scoring (compliance breach) | Medium | High | Hard prompt constraints + an output linter that fails any affect language; QA compliance test gate; no voice-affect features in pipeline at all. |
| R5 | Prompt injection via uploaded resume/JD overrides persona/scoring | Medium | High | Treat JD/resume as untrusted; isolate in a clearly-delimited user block; system/rubric in cached system block; red-team in M8. |
| R6 | LiveKit Agents Node SDK maturity / API churn | Medium | Medium | Pin versions; thin adapter layer around the worker pipeline; M0 connectivity spike before committing. |
| R7 | Vendor outage (Deepgram/Cartesia/Anthropic) mid-interview | Medium | High | Provider interface + fallback chains (ElevenLabs swap, STT reconnect, LLM retry); circuit breakers; degraded captions-only mode. |
| R8 | LLM cost per interview too high to sustain free tier | Medium | Medium | Prompt caching; Sonnet for high-frequency calls; per-session token/$ caps with graceful wrap-up; entitlement-gate length. |
| R9 | Frontend rework underestimated (static → live across 11 screens) | Medium | Medium | M0 extracts literals to props early; mock backend lets FE progress independently; screen-by-screen DoDs. |
| R10 | Poor-network UX degrades to unusable | Medium | Medium | Reconnect/resume APIs; degraded modes; M4 + M7 network-profile tests. |
| R11 | Data privacy: recordings/transcripts mishandled | Low | High | Consent gate pre-media; encryption at rest; export/delete + retention job; signed URLs; M8 PII audit. |
| R12 | Expo SDK 56 / RN 0.85 LiveKit RN SDK incompatibility | Medium | Medium | Verify LiveKit RN SDK against SDK 56 in M0 (AGENTS.md mandates reading v56 docs before coding); spike before M3. |
| R13 | Multi-agent state desync (Planner plan vs Reviewer directives vs UI index) | Medium | Medium | Single source of truth in `session_state` + Redis hot-state; data-channel events are derived, not authoritative; integration tests in M4. |
| R14 | >90% review gate is subjective / unrepeatable | Low | Medium | Mechanical rubric checklist scorer defined in M0; same rubric applied at each gate. |

---

## 6. Verification strategy (what gates each milestone)

**Test layers (built up across milestones):**
- **Unit** — services, scoring math, validators (BE/AN/PR). From M0.
- **Contract/integration** — API endpoints, webhooks, agent↔service calls (BE/VA). From M1.
- **Prompt evals** — golden transcripts → expected score bands, evidence-existence check, affect-language linter, JSON-schema validity (PR/AN). From M2.
- **E2E (device)** — Maestro/Detox scripted runs across the real flow (FE/QA). From M3, full path from M5.
- **Voice-quality eval rig** — latency p50/p95, barge-in success rate, caption WER, turn false-positive rate, across network profiles (VA/QA). From M3, hardened in M7.
- **Load/chaos** — concurrent rooms, vendor-kill, region-drop (IO/QA). M7.
- **Compliance** — consent-before-media, export completeness, delete purge, no-affect-data (QA). M6, re-gated M8.
- **Security/accessibility audits** (QA/BE/FE). M8.

**Gate per milestone (must pass to advance):**

| Milestone | Gating checks |
|---|---|
| M0 | CI green (build+typecheck+test); worker↔room "hello"; contracts imported by all apps; migrations apply. |
| M1 | `/sessions` contract tests pass; sign-up→setup→session e2e passes; entitlement stub enforced. |
| M2 | Prompt eval set ≥ thresholds (schema-valid, 100% evidence-cited, 0 affect hits); cache-hit confirmed. |
| M3 | Device run completes one full-duplex turn; barge-in works; p50 first-audio < 1.5s recorded; transcript persisted. |
| M4 | Full multi-turn interview completes with visible adaptation; clean end; reconnect survives a drop. |
| M5 | **Full Welcome→Results E2E on device**; report evidence-cited + affect-free + consistent; review gate **> 90%**. |
| M6 | All modes run; entitlement matrix passes; consent/export/delete/retention compliance tests pass. |
| M7 | Latency SLO (p50<1.5s, p95 ceiling) under load; barge-in/turn metrics meet thresholds; single-vendor failure survived; partial reports valid. |
| M8 | Full regression green; security + a11y audits pass; prompt-injection red-team fails to break behavior; product-owner audio sign-off; final review **> 90%**; store-submittable. |

**The >90% gate.** At M5 and M8 (and spot-checked between), the mechanical rubric from M0 scores four dimensions — **architecture** (contracts honored, no critical debt), **UI/UX** (Atelier fidelity, live data, all states handled), **product/E2E** (every step in §0 works), **audio** (latency, naturalness, barge-in). Each scored against its checklist; the milestone does not pass until the blended score exceeds 90% and the product owner signs off on the audio experience specifically.

---

## 7. Mapping summary — tasks → executing workstreams

| Workstream | Primary milestones | Headline deliverables |
|---|---|---|
| **BE** Backend API | M0–M1, M5–M6, M8 | Fastify app, auth, `/sessions` + token mint, lifecycle state machine, webhooks, Stripe/entitlements, export/delete/retention, security. |
| **VA** LiveKit Agent / Voice | M0, M3–M4, M7 | Worker pipeline (VAD→turn→STT→LLM→TTS), barge-in, data-channel events, adaptive loop, mode behaviors, resilience/fallbacks. |
| **FE** Frontend wiring | M0–M1, M3–M6, M7–M8 | Live-data screens, LiveKit RN room, consent gate, orb/captions/controls, Results, Plans/Payment, data controls, a11y. |
| **PR** Prompt library | M0, M2, M4, M6–M8 | Planner/Interviewer/Reviewer/Analyst prompts, per-mode×persona×style×topic system prompts, caching structure, eval set, injection hardening. |
| **AN** Analysis / Report | M0, M2, M4–M7 | Scoring schema, Reviewer/Analyst pipelines, evidence-cited scorecard, PDF report, no-affect enforcement, partial reports. |
| **IO** Infra / DevOps | M0 (heavy), all | Neon/R2/Redis/LiveKit provisioning, CI/CD, worker deploy + autoscale, egress, latency/cost dashboards, load/chaos, prod + runbooks. |
| **QA** QA / Tests | All | Unit/contract/e2e/voice/load/compliance suites, the >90% rubric scorer, security + a11y audits, milestone gating. |

---

## 8. What "demonstrably works" means at the end

By **M5** there is a device-recordable run from Welcome to a real, evidence-cited Results report driven by a live full-duplex adaptive interview. By **M8** that same flow runs across all modes, under load and bad networks, with consent/export/delete, security, and accessibility — passing a mechanical >90% gate and an explicit product-owner audio sign-off. The plan front-loads the two hardest risks (voice latency/turn-taking in M3, brain correctness in M2) and keeps them isolated so the E2E flow is provable as early as possible and hardened thereafter.
