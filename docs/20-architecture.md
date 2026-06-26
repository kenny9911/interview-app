# 20 · Full-Stack System Architecture

> **Product:** *viva* — a consumer, iOS-first (Android too) AI **voice + video** interview-practice app.
> **Scope of this document:** the backend, the live voice system, the multi-agent interview brain, and the analysis/reporting pipeline that sit behind the 11 already-built Expo/React Native screens.
> **Audience:** engineers building and operating the system. Companion docs: `00-original-brief.md`, `10-refined-spec.md` (prompts/spec), `30-data-model.md` (schema detail).

---

## 0. Architecture at a glance

*viva* is a **thin-client + stateless-API + ephemeral-realtime-worker** system. The phone never holds a secret and never talks to a model vendor directly. A stateless HTTP API owns identity, money, consent, and persistence. Live conversation runs entirely inside a LiveKit room joined by an ephemeral Agent worker. All durable, expensive, or long-running work (recording egress, transcript persistence, analysis) is pushed onto a queue and done by workers, never on the request path.

Three principles drive every boundary below:

1. **Secrets live server-side only.** The RN app authenticates to *our* API; everything else (LiveKit, Deepgram, Cartesia, Anthropic, R2) is reached through short-lived scoped tokens or server-held keys.
2. **The request path is stateless and fast.** Token mint, session create, and report fetch return in tens of milliseconds. Anything slow (LLM analysis, egress, embeddings) is asynchronous.
3. **Conversation state is ephemeral; results are durable.** The live turn-by-turn loop lives in the Agent worker's memory for the duration of a room. The moment the room ends, state is flushed to Postgres + R2 and the worker is disposable.

```
                                  ┌──────────────────────────────────────────────┐
                                  │                 viva backend                   │
   ┌─────────────┐  HTTPS/JSON    │  ┌────────────┐        ┌──────────────────┐  │
   │  RN app     │◄──────────────►│  │ API service│───────►│ Postgres (Neon)  │  │
   │ (Expo)      │   JWT auth     │  │ (Fastify)  │        │  + pgvector  RLS │  │
   │             │                │  │ stateless  │───────►│ Queue (PG/Redis) │  │
   │ LiveKit RN  │                │  └─────┬──────┘        └──────────────────┘  │
   │ SDK (room)  │                │        │ mint scoped token   ▲   ▲           │
   └──┬───────┬──┘                │        │ webhooks◄───────────┘   │           │
      │       │                   │        ▼                          │           │
      │ media │  WebRTC           │  ┌──────────────┐   enqueue jobs  │           │
      │ (DTLS/ │◄─────────────────┼─►│ LiveKit Cloud│                 │           │
      │  SRTP) │                  │  │ SFU+TURN+    │   webhooks       │           │
      │       │                   │  │ Egress       │──────────────────┘           │
      └───────┘                   │  └──────┬───────┘                              │
                                  │         │ agent dispatch / room                │
                                  │  ┌──────▼─────────┐   ┌──────────────────────┐ │
                                  │  │ Agent worker   │   │ Analysis worker      │ │
                                  │  │ (LiveKit       │   │ (queue consumer)     │ │
                                  │  │  Agents, TS)   │   │  Analyst agent       │ │
                                  │  │ VAD/STT/LLM/TTS│   └─────────┬────────────┘ │
                                  │  └──┬───┬───┬───┬─┘             │              │
                                  └─────┼───┼───┼───┼───────────────┼──────────────┘
                                        │   │   │   │               │
                                  Deepgram │ Anthropic         Anthropic
                                   (STT) Cartesia (Claude  Opus  (Claude Opus
                                        (TTS) Sonnet+Opus)  4.8)  4.8 analysis)
                                                                      │
                                                                ┌─────▼──────┐
                                                                │ R2 object  │
                                                                │ storage    │
                                                                │ av + report│
                                                                └────────────┘
```

---

## 1. Components & responsibilities

### 1.1 RN app (Expo / React Native) — *thin client, presentation only*
- Renders the 11 screens; owns no business rules and no secrets.
- Auth: holds a short-lived access JWT + refresh token (secure store / Keychain).
- Setup: collects preferences (role, persona, style, language, length, topic, optional JD + resume) and POSTs them; receives an `interview_session` id.
- Live room: uses the **LiveKit React Native SDK** with a server-minted access token to join the room, publish mic (+ optional camera), and subscribe to the agent's audio track.
- Drives the **interviewer orb** state machine (`idle → listening → thinking → speaking`) and **live captions** from LiveKit data-channel / transcription events the agent publishes; renders controls (mute, camera, end, "skip question").
- Consent UX: explicit mic/cam/recording toggles; cannot enter a room without recording consent recorded server-side.
- Results: fetches the report by `session_id`; renders scorecard, stood-out / work-on, per-question feedback, and full transcript. No scoring logic on device.

**Why thin:** app-store review cycles are slow. Keeping prompts, rubrics, model choices, and persona logic server-side means we iterate the "interview brain" without shipping a binary.

### 1.2 API service (Node/TypeScript, **Fastify**) — *stateless system of record front door*
Chosen Fastify over Express: native async, schema-based validation (great for typed request/response + JSON Schema), faster, first-class hooks for auth/RLS context injection. Responsibilities:
- **Auth & accounts**: sign-up / sign-in, JWT issue + refresh rotation, session revocation. (Use a managed auth provider — Clerk/Auth0/Supabase Auth — or self-hosted with Argon2id + rotating refresh tokens.)
- **Interview setup**: validate prefs, create `interview_session` row (status `created`), kick off the **Planner** (async — see §3) and persist the question plan.
- **LiveKit token mint**: issue a **room-scoped, identity-scoped, short-TTL** access token (§5.1) and trigger agent dispatch.
- **Session lifecycle**: state transitions (`created → planning → ready → live → ended → analyzing → complete → failed`); idempotent.
- **Webhook sink**: receives LiveKit webhooks (`room_started`, `participant_joined`, `egress_ended`, `room_finished`) — verified by signature — and advances state / enqueues analysis.
- **Transcript & report storage**: read APIs for the app; signed-URL minting for R2 audio/video/report (§5.4).
- **Billing**: plans, payment (Stripe / RevenueCat for IAP), entitlement checks (minutes/quota) before a session can go live.
- **Compliance**: consent records, data export, delete (cascade + R2 purge), retention policy enforcement.

**Stateless:** holds no per-request session state in memory; everything in Postgres. Horizontally scalable behind a load balancer; any instance serves any request. Long work is enqueued, never awaited inline.

### 1.3 LiveKit Cloud — *managed realtime media plane*
- **SFU**: routes WebRTC audio/video between the participant and the Agent worker (no media transits our API).
- **TURN**: relays media on restrictive/symmetric-NAT networks so the call still connects on poor/corporate networks.
- **Egress (recording)**: server-side composite/track recording of the room, written **directly to our R2 bucket** via S3-compatible config — audio always (for analysis), video only with consent.
- **Webhooks**: lifecycle events to the API.
- **Agent dispatch**: routes a created room to an available Agent worker.

**Why managed:** running our own SFU + TURN + global edge is a team's worth of ops. LiveKit Cloud gives us geo-distributed media, recording, and turn detection out of the box; we own only the agent logic.

### 1.4 LiveKit Agent worker (LiveKit Agents, Node/TS) — *the voice agent + live brain*
A long-lived **worker pool process** (not per-request) that registers with LiveKit and is dispatched into rooms. **One agent job ≈ one interview room.** Per job it runs the full-duplex voice pipeline and the live half of the interview brain:
- **VAD** (Silero) + **turn detector** (LiveKit turn-detector model) → robust endpointing / barge-in.
- **Streaming STT** (Deepgram) → interim + final transcripts.
- **Interviewer agent** (Claude **Sonnet** for in-turn turn-taking / backchannel / follow-up phrasing decisions — latency-critical) speaking as the chosen persona/style, driven by the persisted question plan.
- **Response Reviewer** (Claude — Sonnet for fast in-loop adaptation, escalating to **Opus 4.8** when a deeper re-plan is warranted) scores each answer against the rubric and adapts the next question.
- **Streaming TTS** (Cartesia primary, ElevenLabs fallback) → agent audio track published into the room.
- Publishes **live captions** + orb state hints over the LiveKit data channel.
- Buffers the structured turn-by-turn transcript; on `room_finished` flushes it to the API and triggers analysis.

State here is **ephemeral** — it lives only for the call. Crash = lose the in-flight turn, not the account.

### 1.5 Postgres (Neon) + pgvector — *durable system of record*
Stores: users, auth/consent, plans/entitlements, `interview_session`, `question_plan`, `turn` (per Q&A with timing + STT confidence), `score` (per-competency, evidence-cited), `report`, `media_asset` (R2 keys), `audit_log`. **pgvector** holds embeddings of resume/JD and past answers for retrieval (e.g., "did they contradict an earlier answer," role-relevant follow-ups). Neon: serverless Postgres with branching (cheap preview/test DBs) and scale-to-zero for dev. **RLS** enforces per-user data isolation (§5.2).

### 1.6 Object storage (Cloudflare R2) — *blobs*
Audio (always), video (consent-gated), and generated report artifacts (PDF/JSON snapshot). R2 chosen for **zero egress fees** — relevant because users re-watch recordings and re-open reports. LiveKit Egress writes here directly via S3 API. App access is via short-lived **signed URLs** minted by the API (§5.4); the bucket is private.

### 1.7 Queue — *async work buffer*
Decouples slow/expensive work from the request path and from the realtime worker. **Default: pg-boss (Postgres-backed)** to avoid a second datastore at launch — transactional enqueue, retries, scheduling, dead-letter, all in the DB we already run. **Upgrade path: Redis + BullMQ** if job volume outgrows Postgres. Jobs: `run_planner`, `run_analysis`, `generate_report`, `compute_embeddings`, `purge_expired_media`, `transcode_recording`.

### 1.8 Analysis worker — *post-interview brain*
Queue consumer. Runs the **Analyst agent** (Claude **Opus 4.8**) over the full transcript + question plan + per-turn reviewer scores to produce the competency scorecard (Communication, Structure, Depth, Confidence — *content/competency-based, never affect*), stood-out / work-on, per-question feedback, and rationale with **verbatim evidence citations** back to transcript turns. Writes `score` + `report` rows, renders a report artifact to R2, advances session to `complete`, and (optionally) emits a push notification.

### 1.9 External vendors
- **Anthropic (Claude)** — Opus 4.8 (`claude-opus-4-8`) for planning, deeper re-scoring, and final analysis; Sonnet for low-latency in-turn decisions. **Prompt caching** on the rubric + persona system context + JD/resume (large, stable prefix) cuts cost and latency materially.
- **Deepgram** — streaming STT (multilingual; matches the language preference).
- **Cartesia / ElevenLabs** — streaming TTS (persona voice; Cartesia for latency, ElevenLabs as a quality/availability fallback).

---

## 2. End-to-end sequence: "Start interview → report shown"

```
User      RN app        API service        LiveKit Cloud      Agent worker        Vendors            DB/R2/Queue
 │           │               │                   │                 │                  │                   │
 │ tap Start │               │                   │                 │                  │                   │
 │──────────►│ POST          │                   │                 │                  │                   │
 │           │ /sessions     │                   │                 │                  │                   │
 │           │ {prefs,consent}──────────────────►│                 │                  │                   │
 │           │               │ check entitlement+consent ──────────┼──────────────────┼──────────────────►│ insert session(created)
 │           │               │ enqueue run_planner ────────────────┼──────────────────┼──────────────────►│ queue
 │           │  201 {session_id, status:planning} │                 │                  │                   │
 │           │◄──────────────│                   │                 │                  │                   │
 │           │               │   [async] Planner (Opus 4.8) ◄──────┼──────────────────┤ Claude            │
 │           │               │   write question_plan ──────────────┼──────────────────┼──────────────────►│ plan rows; status:ready
 │           │ POST /sessions/:id/token          │                 │                  │                   │
 │           │──────────────►│ verify ready+entitlement            │                 │                  │
 │           │               │ create room + mint scoped JWT ─────►│ create room      │                  │
 │           │               │ dispatch agent ────────────────────►│ ─────────────────► join job          │
 │           │  200 {lk_url, token, room}         │                 │                  │                   │
 │           │◄──────────────│                   │                 │                  │                   │
 │ join room │               │                   │                 │                  │                   │
 │──────────────────────────────────────────────►│ participant_joined webhook ───────►│ (advances:live)   │
 │           │               │◄──────────────────│                 │                  │                   │
 │           │               │ start egress → R2 ►│ ────────────────┼──────────────────┼──────────────────►│ recording→R2
 │           │               │                   │ agent joins room ►│ greet (TTS) ────►│ Cartesia         │
 │ ◄═══════════════ agent audio: "Hi, I'm Aria…" (orb: speaking) ═══│                 │                  │
 │ speak ════════════════════════════════════════►│ ═══ user audio ═►│ VAD+turn detect  │                  │
 │           │               │                   │                 │ STT stream ─────►│ Deepgram         │
 │ (orb: listening)          │                   │                 │ endpoint reached │                  │
 │           │               │                   │                 │ Reviewer score + │                  │
 │           │               │                   │                 │ next-Q (Sonnet)─►│ Claude           │
 │ ◄═══════════════ captions + next question audio (orb: thinking→speaking) ═════════│                 │
 │   … live Q&A turns repeat until length reached or user ends …    │                 │                  │
 │ tap End   │               │                   │                 │                  │                   │
 │──────────────────────────────────────────────►│ room_finished webhook ────────────►│ flush transcript  │
 │           │               │◄──────────────────│ egress_ended ───►│ ─────────────────►│ turns→DB; status:ended
 │           │               │ enqueue run_analysis ───────────────┼──────────────────┼──────────────────►│ queue
 │           │ navigate→Results (polling/push)    │                 │                  │                   │
 │           │               │   [async] Analyst (Opus 4.8) ◄──────┼──────────────────┤ Claude            │
 │           │               │   write scores+report+R2 artifact ──┼──────────────────┼──────────────────►│ status:complete
 │           │ GET /sessions/:id/report           │                 │                  │                   │
 │           │──────────────►│ RLS check; signed URLs              │                 │                  │
 │           │  200 {scorecard, feedback, transcript, signed media} │                 │                  │
 │           │◄──────────────│                   │                 │                  │                   │
 │ see report│               │                   │                 │                  │                   │
```

**Latency budget for a turn** (target sub-~1.5 s end-of-speech → first agent audio):
`turn-detector endpoint commit (~150–300 ms after silence)` → `final STT (streaming, ~50–150 ms)` → `Reviewer+next-Q LLM first token (Sonnet streaming, ~300–600 ms)` → `TTS first chunk (Cartesia streaming, ~150–300 ms)`. The agent streams LLM tokens straight into streaming TTS, so first audio fires on the first sentence, not the full answer. Prompt caching keeps the LLM TTFT low by avoiding re-processing the rubric/persona/JD prefix every turn.

---

## 3. Multi-agent interview brain — where each agent runs

| Agent | When | Where it runs | Model | Latency class |
|---|---|---|---|---|
| **Question Planner** | After setup, before room | API-triggered queue job (`run_planner`) | Opus 4.8 | Offline (seconds) — runs while user reviews "ready" screen |
| **Interviewer** | Live, every turn | Agent worker, in-room | Sonnet (phrasing/turn-taking) | In-turn, latency-critical |
| **Response Reviewer** | Live, after each answer | Agent worker, in-room | Sonnet in-loop; escalate to Opus 4.8 for re-plan | In-turn |
| **Analyst** | After room ends | Analysis worker queue job | Opus 4.8 | Offline (seconds–minutes) |

The **plan is precomputed and persisted** so the live loop never blocks on a heavy planning call. The Reviewer adapts *within* the existing plan (reorder, drill down, skip) using the fast model; only a material strategy change triggers an Opus re-plan. The Analyst is fully decoupled — the user is already on the Results screen (polling or push-notified) when it finishes.

---

## 4. Service boundaries, statelessness, where work lives

| Concern | Owner | State model | Why |
|---|---|---|---|
| Identity, money, consent, persistence | API service | **Stateless** (all in Postgres) | Horizontally scalable; any instance serves any request |
| Realtime media transport | LiveKit Cloud | Managed, ephemeral rooms | Not our core competency; geo edge + TURN + egress |
| Live conversation + voice pipeline | Agent worker | **Ephemeral** (per-room memory) | Lives only for the call; crash-isolated to one session |
| Planning / analysis / embeddings / egress post-processing | Queue + workers | **Durable jobs** | Slow/expensive; must survive restarts, retry, not block requests |
| Durable artifacts | Postgres + R2 | **Persistent** | System of record + blobs |

**Hard rule:** the API request path never calls a model vendor synchronously for anything user-visible-slow, never holds a WebRTC connection, and never blocks on egress. Synchronous LLM use on the API is limited to sub-second guardrail checks if any.

---

## 5. Security

### 5.1 LiveKit token scoping
The API mints a LiveKit access token (signed with the LiveKit API secret, **server-side only**) that is:
- **Identity-scoped**: `identity = user_id`, so the agent and audit logs always know who's in the room.
- **Room-scoped**: `roomJoin: true` for exactly `room = session_id`; cannot join other rooms.
- **Permission-scoped**: `canPublish` (mic; camera only if video consent), `canSubscribe: true`, `canPublishData` for captions; **no** `roomAdmin`, **no** `roomCreate` for the user.
- **Short-TTL**: ~2–5 min — long enough to join, short enough that a leaked token is near-useless. Reconnects re-mint.
- Issued only after entitlement + consent + `status=ready` checks pass.

The Agent worker uses a **separate** token/identity with agent permissions. The user token can never act as the agent.

### 5.2 Row-Level Security (RLS)
Postgres RLS is on for every user-scoped table. The API sets a per-request DB session var (`SET LOCAL app.user_id = <jwt.sub>`); policies restrict `SELECT/INSERT/UPDATE/DELETE` to `user_id = current_setting('app.user_id')`. Workers connect with a dedicated service role that bypasses RLS only for the specific session they're processing (scoped by job payload). Defense in depth: even an app-layer bug can't leak another user's transcript.

### 5.3 Secrets
All vendor keys (LiveKit API key/secret, Deepgram, Cartesia, ElevenLabs, Anthropic, R2, Stripe) live in a secrets manager (Doppler / AWS Secrets Manager / platform env), injected at runtime, **never** in the app bundle or git. The RN app holds only its own API base URL and a public auth client id. Rotate on a schedule; the short-TTL LiveKit tokens limit blast radius.

### 5.4 Signed URLs
R2 bucket is private. Audio/video/report blobs are served via **time-boxed signed URLs** (~5–15 min) minted by the API *after* an RLS-checked ownership verification. URLs are per-object, expiring, and never long-lived. Egress writes go through scoped R2 credentials held only by the egress config / worker.

### 5.5 Webhook verification
LiveKit and Stripe webhooks are verified by signature before any state change; replay-protected by event id idempotency.

### 5.6 Compliance (practice-tool posture)
Self-serve practice, not an automated hiring decision → lighter than enterprise, but: explicit **mic/cam/recording consent** captured and stored before room join; **data export** and **delete** (cascade DB + purge R2); configurable **retention** (e.g., auto-purge recordings after N days, default short) via `purge_expired_media` job; **no affect/emotion-based scoring** — scoring is competency/content-based, evidence-cited, with human-readable rationale, enforced in the Analyst prompt + reviewed in tests.

---

## 6. Scaling & cost drivers

**Concurrency unit = a live room.** Each live interview pins ~1 Agent worker job + 1 LiveKit room + continuous STT + streaming TTS + per-turn LLM calls. This is the dominant cost and scaling axis.

| Driver | Scales with | Lever |
|---|---|---|
| Agent worker compute | concurrent rooms | Autoscale worker pool on active-job count; one process handles N jobs up to CPU/mem (audio pipelines are I/O-bound, several per core) |
| LiveKit Cloud (minutes + egress + TURN) | room-minutes, recorded-minutes, relayed-minutes | Audio-only default; gate video; cap interview length per plan |
| Deepgram STT | spoken minutes | Streaming only while user speaks; close stream on agent turns |
| TTS (Cartesia/ElevenLabs) | agent-spoken characters | Concise persona phrasing; cache fixed prompts (greeting, transitions) as pre-rendered audio |
| **Anthropic (Claude)** | turns × tokens (live) + 1 big call (analysis) | **Prompt caching** on rubric/persona/JD/resume prefix (cache reads ~0.1× input price; 5-min-TTL write ~1.25×, breaks even by the 2nd turn) — large win since every turn reuses the same prefix. Sonnet for in-turn, Opus 4.8 only for plan + final analysis. |
| Postgres/R2 | users, transcripts, blobs | R2 zero-egress for re-watch/re-open; Neon scale-to-zero for dev; retention purge keeps blob spend bounded |

**Cost intuition per interview:** LiveKit room-minutes + STT minutes + TTS characters are fixed-ish per length; LLM cost is dominated by the analysis Opus call + N live Sonnet turns, with prompt caching collapsing the repeated prefix. Capping length-by-plan and audio-only-by-default are the two biggest controllable levers.

---

## 7. Failure modes & graceful degradation

| Failure | Detection | Degradation / recovery |
|---|---|---|
| Poor / symmetric-NAT network | ICE/connection state | LiveKit TURN relay; RN shows reconnecting; audio prioritized over video; adaptive bitrate |
| STT (Deepgram) outage/slow | stream error / timeout | Fallback STT provider or buffer-and-retry; agent uses a graceful "could you repeat that?" turn rather than crashing |
| TTS primary (Cartesia) down | synth error | Auto-fallback to ElevenLabs; pre-rendered cached audio for fixed lines |
| LLM (Claude) latency spike / 429 | TTFT timeout / rate-limit | Sonnet backoff + retry; if persistent, agent emits a short scripted bridging line; Reviewer falls back to next planned question without re-scoring |
| Agent worker crash mid-room | LiveKit participant-left / heartbeat | Room survives briefly; supervisor can redispatch a fresh agent that rejoins with persisted plan + flushed turns; if unrecoverable, session marked `interrupted`, partial transcript saved, user offered resume/retry without losing quota |
| Egress fails | `egress_ended` error webhook | Transcript-based analysis still proceeds (recording is supplementary); media marked unavailable; report notes "recording unavailable" |
| Analysis job fails | job error / retries exhausted | Queue retries with backoff → dead-letter; session stays `analyzing`; user sees "still preparing your report"; alert fires; partial/heuristic report as last resort |
| API instance dies | LB health check | Stateless → LB routes elsewhere; in-flight idempotent requests retried by client |
| Postgres unavailable | conn errors | API returns 503 fast (no queue of half-writes); live rooms already in progress keep running on ephemeral state and flush on recovery |
| Webhook lost/duplicated | missing/duplicate event id | Idempotent handlers; reconciliation sweep job compares LiveKit room state vs session state |

Principle: **the live conversation degrades softly** (relay, fallback vendor, bridging line) and **never loses the user's quota or partial transcript** on a backend hiccup.

---

## 8. Environment variables

```bash
# ── Core API ──────────────────────────────────────────────
NODE_ENV=production
API_BASE_URL=https://api.viva.app
PORT=8080
LOG_LEVEL=info

# ── Auth / JWT ────────────────────────────────────────────
JWT_SECRET=                      # access-token signing (or JWKS for managed auth)
JWT_ACCESS_TTL=900               # seconds
JWT_REFRESH_TTL=2592000          # 30d, rotating
AUTH_PROVIDER_ISSUER=            # if using Clerk/Auth0/Supabase
AUTH_PROVIDER_JWKS_URL=

# ── Postgres (Neon) ───────────────────────────────────────
DATABASE_URL=postgresql://...    # app role (RLS-enforced)
DATABASE_WORKER_URL=postgresql://...  # service role for workers (scoped bypass)
PGVECTOR_ENABLED=true

# ── Queue ─────────────────────────────────────────────────
QUEUE_DRIVER=pgboss              # pgboss | bullmq
REDIS_URL=                       # required only if bullmq

# ── LiveKit Cloud ─────────────────────────────────────────
LIVEKIT_URL=wss://viva.livekit.cloud
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
LIVEKIT_TOKEN_TTL=300            # seconds, short-lived join token
LIVEKIT_WEBHOOK_KEY=             # webhook signature verification
LIVEKIT_AGENT_NAME=viva-interviewer

# ── Egress → R2 (S3-compatible) ───────────────────────────
EGRESS_S3_ENDPOINT=https://<acct>.r2.cloudflarestorage.com
EGRESS_S3_BUCKET=viva-recordings
EGRESS_S3_ACCESS_KEY=
EGRESS_S3_SECRET_KEY=
EGRESS_S3_REGION=auto

# ── Object storage (R2) for app reads/signed URLs ─────────
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=viva-media
R2_SIGNED_URL_TTL=600            # seconds

# ── Speech vendors ────────────────────────────────────────
DEEPGRAM_API_KEY=
DEEPGRAM_MODEL=nova-3
CARTESIA_API_KEY=                # primary TTS
ELEVENLABS_API_KEY=              # fallback TTS

# ── Anthropic (Claude) ────────────────────────────────────
ANTHROPIC_API_KEY=
CLAUDE_MODEL_PLANNER=claude-opus-4-8     # planning / re-plan
CLAUDE_MODEL_ANALYST=claude-opus-4-8     # post-interview analysis
CLAUDE_MODEL_LIVE=claude-sonnet-4-6      # in-turn turn-taking / reviewer (latency)
ANTHROPIC_PROMPT_CACHE_TTL=5m            # 5m (1.25x write) | 1h (2x write)

# ── Voice pipeline tuning ─────────────────────────────────
VAD_PROVIDER=silero
TURN_DETECTOR_ENABLED=true
ENDPOINT_SILENCE_MS=300          # tune for snappy vs. patient endpointing

# ── Billing ───────────────────────────────────────────────
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
REVENUECAT_API_KEY=              # iOS/Android IAP entitlements

# ── Compliance / retention ────────────────────────────────
MEDIA_RETENTION_DAYS=30
ANALYSIS_PUSH_ENABLED=true
```

> **Model-id note:** the live model id (`claude-sonnet-4-6`) is the current fast-tier id; keep `CLAUDE_MODEL_*` as env-driven so the model choice is operational config, not code. Planner/Analyst pinned to `claude-opus-4-8` per product requirement.

---

## 9. Refinements to the proposed stack (review notes)

The proposed stack is sound. Adjustments I'd lock in:

1. **API framework → Fastify** (over Express) for schema validation, hooks for RLS/auth context, and throughput.
2. **Queue → pg-boss first** (Postgres-backed) to avoid operating Redis at launch; promote to **BullMQ/Redis** only when job volume demands it. Env-switchable (`QUEUE_DRIVER`).
3. **Planner runs offline, not on the live path** — precompute and persist the question plan during the "ready" screen so the first turn is instant.
4. **Two-tier LLM is right; make it explicit** — Sonnet in-turn (latency), Opus 4.8 for plan + final analysis + rare re-plan. Prompt-cache the stable prefix (rubric + persona + JD/resume); it pays off by the second turn.
5. **Agent worker is a pool, autoscaled on active-job count**, not per-request lambdas — voice pipelines need warm, persistent processes.
6. **Egress writes straight to R2**; analysis depends on the *transcript*, not the recording, so a failed egress never blocks the report.
7. **RLS on from day one** — cheaper than retrofitting, and the strongest guarantee for private interview transcripts.
8. **Cartesia primary / ElevenLabs fallback** wired as a runtime switch for availability, not a redeploy.

---

## 10. Open questions for the next docs
- Exact `question_plan` / `turn` / `score` schema and RLS policies → `30-data-model.md`.
- Full persona/style/mode system-prompt library + prompt-caching layout → prompts spec (`10-refined-spec.md`).
- Resume/JD ingestion + pgvector retrieval strategy (contradiction detection, role-relevant follow-ups).
- Agent-rejoin/resume protocol details on worker crash (plan replay + turn replay ordering).
