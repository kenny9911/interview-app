# viva

**AI voice interview practice — talk to a real-time AI interviewer, get a scored report.**

viva is an AI-powered video interview practice platform. A candidate picks a mode, target role, interviewer persona, and style, then joins a live full-duplex voice room and is interviewed by a real-time AI voice persona (animated orb + live captions). A four-agent "brain" plans the interview, conducts it, reviews each answer, and analyzes the whole session — afterward the app shows an evidence-cited, affect-free scorecard plus the full transcript. It is self-serve practice, not an automated hiring decision.

This is the monorepo: an Expo mobile app, a Fastify backend API, a LiveKit voice-agent worker, web prototypes, and the design/spec docs.

## How it works

```
                         ┌───────────────────────────────────────────────┐
                         │            Backend API (viva-server)           │
                         │            Fastify v5 · TypeScript · :4000     │
   ┌──────────────┐      │   auth · configs · sessions · 4-agent brain    │      ┌──────────────────┐
   │  Mobile app  │      │   scoring/integrity · LiveKit token mint       │      │   LLM provider   │
   │  (Expo / RN) │◀────▶│                                                │◀────▶│ anthropic/openai │
   │  LiveKit RN  │ HTTPS│                                                │      │ gemini/openrouter│
   │     SDK      │ /JSON│   DB: SQLite (default) │ Postgres (optional)    │      └──────────────────┘
   └──────┬───────┘      │   storage: Cloudflare R2 (optional, recordings)│
          │              └───────────────┬───────────────────────────────┘
          │ WebRTC                       │ mint token / dispatch
          │ (mic + optional camera)      │ /begin · /next-turn · /complete
          ▼                              ▼
   ┌─────────────────────────────────────────────────────────┐      ┌──────────────────────────────┐
   │                    LiveKit room                          │      │   Voice agent (viva-agent)   │
   │            viva-interview-<sessionId>                    │◀────▶│   @livekit/agents worker     │
   │              (SFU + TURN media plane)                    │      │   audio I/O only:            │
   └─────────────────────────────────────────────────────────┘      │   Silero VAD · Deepgram STT  │
                                                                     │   Cartesia TTS (ElevenLabs   │
                                                                     │   supported as fallback)     │
                                                                     └──────────────────────────────┘
```

The flow: the mobile app calls the backend to create a session; the backend runs the Planner, persists the plan, creates the LiveKit room `viva-interview-<sessionId>`, and **mints a short-TTL room token** for the phone. The phone joins the room and the **voice agent is dispatched in**. The agent calls the backend's `/begin` to get the greeting + first question, speaks it, then on each final user transcript calls `/next-turn` to fetch the next line (the backend's Interviewer drives the cursor; the Reviewer scores answers asynchronously off the speech path). When the interview wraps, the agent calls `/complete`, the backend runs the Analyst, and the app shows the **report + transcript**. The agent owns audio I/O only — every interviewer line comes from the backend brain.

## The four-agent brain

- **Planner** — once per session, builds a bounded, competency-tagged question plan + rubric sized to the interview length (precomputed before the room opens).
- **Interviewer** — the only model on the live voice path; speaks as the chosen persona/style and emits a control token (`advance`/`dig`/`move_on`/`wrap`) to drive the question cursor.
- **Reviewer** — runs asynchronously off the speech path; scores each finished answer against the rubric with verbatim evidence and proposes a plan patch to adapt a later question.
- **Analyst** — at completion, produces the final report: per-competency scores with evidence, per-question feedback, stood-out / work-on, and an overall band.

## Repository layout

| Path | Purpose |
|------|---------|
| [server/](server/) | `viva-server` — Fastify v5 backend API (TypeScript ESM, run via `tsx`). Mints LiveKit tokens, runs the four-agent orchestration, scoring/integrity, persistence. Port 4000. |
| [agent/](agent/) | `viva-agent` — LiveKit voice-agent worker (`@livekit/agents`). Owns audio I/O only (Silero VAD + Deepgram STT + Cartesia TTS); fetches lines from the backend. |
| [mobile/](mobile/) | Expo SDK 56 app (React 19, React Native 0.85, TypeScript). The candidate-facing client; joins the LiveKit room via the LiveKit RN SDK. |
| [app/](app/) | Static HTML/CSS/JS web prototype of the 11 screens ("Atelier" design). Served with `python3 -m http.server 8777`. |
| [docs/](docs/) | Design/spec/architecture docs (`00`–`63`): architecture, voice architecture, prompt system, launch readiness, privacy draft, app-store metadata, deployment runbook. |
| [ai-powered-video-interview-platform/](ai-powered-video-interview-platform/) | Original Claude Design handoff bundle (HTML mockups). Reference only. |

## Tech stack

- **Backend** ([server/](server/)) — Fastify v5, TypeScript ESM, run via `tsx`. Self-contained HS256 JWT auth (scrypt password hashing). Storage via a swappable `Store` interface: SQLite (`node:sqlite`, default) or Postgres. Tests with Vitest.
- **Voice agent** ([agent/](agent/)) — `@livekit/agents` v1.4 worker, TypeScript ESM via `tsx`. Silero VAD + Deepgram STT + Cartesia TTS + framework turn-detection/barge-in.
- **Mobile** ([mobile/](mobile/)) — Expo SDK 56, React 19, React Native 0.85, TypeScript. React Navigation native-stack; `react-native-svg` + `expo-linear-gradient`; Bricolage Grotesque + Hanken Grotesk fonts. LiveKit via `@livekit/react-native` + `@livekit/react-native-webrtc` (+ config plugins).
- **LLM** — env-driven provider: `anthropic` | `openai` | `gemini` | `openrouter`, with per-role models (planner/interviewer/reviewer/analyst).
- **Realtime media** — LiveKit (SFU + TURN). **STT** Deepgram, **TTS** Cartesia (ElevenLabs supported as fallback).
- **Data** — SQLite by default (durable on-disk file); Postgres (Supabase/Neon/RDS) optional. Cloudflare R2 object storage optional (recordings/exports).

## Prerequisites

- **Node 20+** (this repo was developed on Node v24.7.0; the backend uses `node:sqlite`, which needs Node 22.5+).
- **npm** (each package installs independently).
- For the mobile app on a device:
  - **iOS** — Xcode (full app) + CocoaPods. See [iOS.md](iOS.md).
  - **Android** — Android Studio + JDK 17 + Android SDK. See [ANDROID.md](ANDROID.md).
- **API keys** for live voice (put them in the root `.env`):
  - **LiveKit** (`LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`).
  - An **LLM provider** key for the provider you select (e.g. `ANTHROPIC_API_KEY`).
  - **Deepgram** (`DEEPGRAM_API_KEY`) for STT.
  - **Cartesia** (`CARTESIA_API_KEY`) for TTS — or **ElevenLabs** (`ELEVENLABS_API_KEY`) as the configured fallback.

> Without keys the backend boots in an offline dev-stub mode so the UI flow works, but live voice and real scoring need real keys.

## Quick start

```bash
# 1. Clone
git clone <repo-url> interview-app
cd interview-app

# 2. Configure the root .env (shared by the server AND the agent) and fill in keys
cp .env.example .env
#    edit .env: LiveKit creds, your LLM_PROVIDER + its API key, DEEPGRAM_API_KEY, CARTESIA_API_KEY

# 3. Install backend deps
cd server && npm install && cd ..

# 4. Install agent deps
cd agent && npm install && cd ..

# 5. Launch the API + agent together
./dev.sh
```

`./dev.sh` starts the Fastify API on `:4000` and the voice-agent worker. If a viva API is **already** running on `:4000` it reuses it instead of failing (it only errors if some other process holds the port). The API health check is `GET /v1/healthz`. Stop everything with Ctrl-C.

Then set up and run the mobile app:

```bash
# 6. Configure the mobile env
cp mobile/.env.example mobile/.env
#    Simulator/web can use the default http://localhost:4000

# 7. Install mobile deps
cd mobile && npm install

# 8. Run on a device (custom dev build — see the per-platform guides)
npx expo run:ios        # iOS Simulator   (add --device for a real iPhone)
npx expo run:android    # Android emulator (add --device for a real phone)
```

Full per-platform setup, signing, and networking details: [iOS.md](iOS.md) and [ANDROID.md](ANDROID.md).

## Configuration

There are two env files:

**Root `.env`** (from [.env.example](.env.example)) — read by **both** the backend API and the agent worker. Key groups:

- **LiveKit** — `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` (required for live media).
- **LLM** — `LLM_PROVIDER` (`anthropic` | `openai` | `gemini` | `openrouter`) selects which provider backs the brain. Only the selected provider's API key is required. Models are configured **per role** (planner / interviewer / reviewer / analyst), e.g. `CLAUDE_MODEL_PLANNER`, `CLAUDE_MODEL_INTERVIEWER`, `CLAUDE_MODEL_REVIEWER`, `CLAUDE_MODEL_ANALYST` (and the equivalent `OPENAI_*` / `GEMINI_*` / `OPENROUTER_*` variants, each with a `*_BASE_URL`).
- **STT / TTS** — `DEEPGRAM_API_KEY` (STT), `CARTESIA_API_KEY` (TTS default), `ELEVENLABS_API_KEY` (TTS fallback). Consumed by the agent worker.
- **Database** — `DB_PROVIDER` (`sqlite` default | `postgres`). For Postgres set `DATABASE_URL` (Supabase/Neon/RDS; SSL auto-enabled for non-local hosts). SQLite data lives at `server/data/viva.db`.
- **Object storage** — `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` (optional; for recordings/exports).
- **Auth** — `JWT_SECRET` (HS256 signing secret for app sessions).
- **Service** — `API_PORT` (default `4000`), `API_PUBLIC_URL`, `CORS_ORIGINS` (comma-separated allowlist, default `http://localhost:8081,http://localhost:19006`), `NODE_ENV`.

> In `NODE_ENV=production` the server refuses to boot on any insecure dev-default secret, so set real values before deploying.

**`mobile/.env`** (from [mobile/.env.example](mobile/.env.example)) — only two `EXPO_PUBLIC_*` vars (inlined at build time, so rebuild after changing them):

- `EXPO_PUBLIC_API_URL` — backend base URL (default `http://localhost:4000`). iOS Simulator/web reach the Mac via `localhost`; a **real iPhone** must use the Mac's LAN IP (`ipconfig getifaddr en0`); the **Android emulator** uses `http://10.0.2.2:4000` (or `adb reverse tcp:4000 tcp:4000` then `localhost`).
- `EXPO_PUBLIC_LIVE_ENABLED` — default `true` (**live mode**). Set to `false` for **demo mode**: the live-interview screens run UI-only, with no backend or LiveKit.

## Running on a device

See [iOS.md](iOS.md) and [ANDROID.md](ANDROID.md) for full, step-by-step setup (prerequisites, simulator/emulator, real device, signing, and networking).

> **Live voice needs a custom dev build** (`npx expo run:ios` / `npx expo run:android`, or an EAS dev build) because the app uses native WebRTC modules. Plain **Expo Go cannot load WebRTC** — it can only run the UI in **demo mode** (`EXPO_PUBLIC_LIVE_ENABLED=false`). A prebuilt `mobile/ios/` project already exists on disk; the `mobile/android/` folder is generated on first `npx expo run:android` (or `npx expo prebuild --platform android`).

## API

All routes are under `/v1` (served by [server/](server/), default port 4000):

| Method & path | Purpose |
|---------------|---------|
| `GET /v1/healthz` | Liveness + advertised modes/languages. |
| `POST /v1/auth/signup` | Create an account (email + password), issue a JWT. |
| `POST /v1/auth/signin` | Verify password, issue a JWT. |
| `POST /v1/auth/login` | Dev/test-only passwordless login (403 in production). |
| `POST /v1/configs` | Persist interview setup preferences (mode/role/persona/style/etc.). |
| `POST /v1/sessions` | Start a session: run the Planner, persist state, mint a LiveKit token. |
| `GET /v1/sessions/:id` | Session detail (mode/persona/role/length/progress/phase). |
| `POST /v1/sessions/:id/token` | Re-mint a fresh LiveKit room token mid-session. |
| `POST /v1/sessions/:id/begin` | Greeting + first question (idempotent). |
| `POST /v1/sessions/:id/next-turn` | Advance one turn given `candidateText`; dispatch the async Reviewer. |
| `POST /v1/sessions/:id/complete` | Run the Analyst, persist the report (idempotent). |
| `GET /v1/sessions/:id/transcript` | Q/A turns for the Transcript screen. |
| `GET /v1/sessions/:id/report` | Fetch the report (404 if not ready). |
| `GET /v1/users/:userId/sessions` | Session summaries for the History list. |
| `POST /v1/data/export` | Export all data for the signed-in user (compliance). |
| `POST /v1/data/delete` | Permanently delete the user's account + all data (compliance). |

## Tests

```bash
# Backend (Vitest) — agents, full HTTP API, auth/compliance, stores, integrity, etc.
cd server && npm test

# Agent worker (Vitest) — the BackendClient (paths/bodies, retry policy)
cd agent && npm test

# Mobile — typecheck (no test script is defined)
cd mobile && npx tsc --noEmit
```

Server and agent tests inject mock LLM clients and an in-memory store, so no real keys or database are needed. (The live-API scoring calibration gate is separate: `cd server && npm run eval`, which requires `ANTHROPIC_API_KEY`.)

## Documentation

Design, spec, and operational docs live in [docs/](docs/):

- [docs/00-original-brief.md](docs/00-original-brief.md) — the original product design ("Atelier" art direction) and the verbatim build prompt.
- [docs/05-north-star-and-reviews.md](docs/05-north-star-and-reviews.md) — Phase-1 expert reviews and the must-fix list.
- [docs/10-refined-spec.md](docs/10-refined-spec.md) — engineering-grade product spec (principles, personas, screens, data model, API, KPIs).
- [docs/15-decisions.md](docs/15-decisions.md) — the binding ADR/build contract (D0–D15); wins on conflict.
- [docs/20-architecture.md](docs/20-architecture.md) — full-stack system architecture, security, scaling, failure modes.
- [docs/30-voice-architecture.md](docs/30-voice-architecture.md) — the full-duplex voice pipeline (VAD/endpointing, barge-in, latency, orb state machine).
- [docs/40-prompt-system.md](docs/40-prompt-system.md) — the four-agent prompting system, model routing, anti-bias/evidence techniques.
- [docs/50-product-task-plan.md](docs/50-product-task-plan.md) — the milestone (M0–M8) product task plan.
- [docs/55-impl-review-1.md](docs/55-impl-review-1.md) / [docs/56-impl-review-2.md](docs/56-impl-review-2.md) — implementation review passes.
- [docs/60-launch-readiness.md](docs/60-launch-readiness.md) — honest status board: what's real in code vs human-gated launch blockers.
- [docs/61-privacy-policy-DRAFT.md](docs/61-privacy-policy-DRAFT.md) — draft privacy policy (awaiting legal review).
- [docs/62-app-store-metadata.md](docs/62-app-store-metadata.md) — App Store Connect listing metadata/copy.
- [docs/63-deployment-runbook.md](docs/63-deployment-runbook.md) — how to deploy/operate the API + agent worker.

## License

An MIT-style license is present at [mobile/LICENSE](mobile/LICENSE) (the standard MIT text). No separate top-level license file is defined for the monorepo as a whole.
