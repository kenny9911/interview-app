# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**viva** — a consumer, iOS-first AI **voice + video** interview-practice app. A thin RN client talks only to our stateless API; live conversation runs inside a LiveKit room joined by an ephemeral voice-agent worker; the multi-agent "interview brain" and all scoring live server-side.

## Monorepo layout (each package is independent — its own `package.json`, no root workspace)

| Dir | What | Stack |
|---|---|---|
| `server/` | Backend API + the entire interview brain (planner / interviewer / reviewer / analyst) + scoring + voice-loop logic | Node/TS ESM, Fastify, Zod, vitest |
| `agent/` | LiveKit voice worker — **audio I/O only** (Silero VAD + Deepgram STT + Cartesia TTS). Owns no interview logic. | Node/TS ESM, `@livekit/agents`, vitest |
| `mobile/` | The 16 RN screens (thin client; no business rules, no secrets) | Expo SDK 56, React Native, React Navigation, LiveKit RN SDK, Supabase |
| `app/` | Static HTML/CSS/JS reproduction of the design handoff (visual reference only) | no build step |
| `docs/` | The product/architecture spec (see below) | markdown |

`mobile/` has its own nested git repo and `.gitignore`.

## The docs are the contract — read them before non-trivial work

- [`docs/15-decisions.md`](docs/15-decisions.md) is the **authoritative build contract** (ADR). Where it conflicts with any other doc, it wins. It resolves 36 review must-fixes and pins the hard rules (model tiers, adaptation contract, endpointing, consent, scoring).
- [`docs/20-architecture.md`](docs/20-architecture.md) is the full system design. **Note it describes a target** (Neon Postgres, Redis, R2, pg-boss, egress). The shipped code is a leaner subset — see "Code vs docs" below. Trust the code for what exists today; trust the docs for intent.

## Big-picture architecture (the parts that span files)

**The brain is in `server/`, not `agent/`.** The agent worker is deliberately dumb: it joins room `viva-interview-<sessionId>`, captures audio, and for every turn calls back into the API:
- `POST /v1/sessions/:id/begin` → greeting + first question
- `POST /v1/sessions/:id/next-turn` `{candidateText}` → next interviewer line (or `ended`)
- `POST /v1/sessions/:id/complete` → triggers analysis

These three routes are authenticated by `AGENT_SERVICE_TOKEN` (shared secret), not the user JWT. Keeping orchestration server-side means the four-agent logic is tested in one place and iterated without shipping an app binary. The agent↔server contract lives in [`agent/src/backendClient.ts`](agent/src/backendClient.ts); the turn logic in [`server/src/voice/turnloop.ts`](server/src/voice/turnloop.ts) and [`server/src/agents.ts`](server/src/agents.ts).

**Two pluggable abstractions you must respect when touching the brain or persistence:**
- **LLM provider** — [`server/src/llm/index.ts`](server/src/llm/index.ts). Code depends on the `LlmClient` interface; `LLM_PROVIDER` selects `anthropic` | `openai` | `gemini` | `openrouter` (the latter three share `openaiCompatible.ts`). The four agent roles (`planner`/`interviewer`/`reviewer`/`analyst`) each resolve to a per-provider, **env-driven** model via `llm/models.ts`. With no API key set, the server silently falls back to an offline dev stub (`llm/devStub.ts`) so the UI flow works — production refuses to boot in that state (see env guard below).
- **Store** — [`server/src/store.ts`](server/src/store.ts) defines the `Store` interface with three impls: `MemoryStore` (tests), `SqliteStore` (default, on-disk `server/data/viva.db`), `createPostgresStore` (when `DB_PROVIDER=postgres` + `DATABASE_URL`). Per-turn writes use **optimistic concurrency** (`saveStateIfVersion`) per the D2 adaptation contract — preserve `version` monotonicity when editing state.

**Security guard:** [`server/src/env.ts`](server/src/env.ts) validates all config with Zod and provides forgeable dev defaults so tests/dev boot without creds. `assertProductionConfig` **refuses to boot in production** if any insecure default (JWT secret, agent token, LiveKit creds) remains or the active LLM key is empty.

## Hard conventions (enforced, not stylistic)

- **Model IDs are env-driven, NEVER literal in code** (D1). Authoritative current Anthropic IDs: `claude-opus-4-8` (Opus 4.8, deep tier: planner/analyst/reviewer), `claude-sonnet-4-6` (Sonnet 4.6, live tier: interviewer), `claude-haiku-4-5-20251001` (guard). Add new model choices as env vars + defaults, not string literals.
- **Scoring is content-only.** Competency scores must cite verbatim transcript evidence; affect / tone / accent / appearance inferences are forbidden and actively linted. See [`server/src/scoring/integrity.ts`](server/src/scoring/integrity.ts) and its tests — keep them green.
- **ESM throughout.** All packages are `"type": "module"`; TS relative imports use explicit `.js` extensions (e.g. `import { env } from './env.js'`). Match this.
- **Expo SDK 56 has breaking changes** — per [`mobile/AGENTS.md`](mobile/AGENTS.md), read the versioned docs at `https://docs.expo.dev/versions/v56.0.0/` before writing mobile native code.
- **Prove changes with tests** (mocked vendors). The live audio path needs real keys + a device and is validated by the agent `spike` + manual smoke, documented as such.

## Commands

```bash
# Whole local stack (backend API on :4000 + agent worker). Reuses an API already on :4000.
./dev.sh
# then, separately, the mobile app:
cd mobile && npx expo run:ios            # iOS Simulator   (--device for a real iPhone)

# ── server/ ──
npm run dev          # tsx watch, API on :4000
npm run build        # tsc -> dist/   (npm start runs dist/server.js)
npm run typecheck    # tsc --noEmit
npm test             # vitest run
npm run test:watch
npm run eval         # scripts/calibration.ts — scoring calibration gate (golden transcripts / band + variance checks)

# ── agent/ ──
npm run spike        # connectivity check: creds + VAD + STT/TTS + token, no participant needed (run FIRST when wiring voice)
npm run dev          # worker waits for interview rooms and joins them
npm test

# ── app/ (static) ──
cd app && python3 -m http.server 8777    # http://localhost:8777/

# Run a single test file / pattern (vitest)
cd server && npx vitest run tests/turnloop.test.ts
cd server && npx vitest run -t "name of the test"
```

The agent requires the server reachable at `API_BASE_URL` plus LiveKit + Deepgram + Cartesia keys. Config is a single repo-root `.env` (both `server/` and `agent/` auto-load `.env` or `../.env`); copy from [`.env.example`](.env.example). The full annotated env list is in [`docs/20-architecture.md`](docs/20-architecture.md) §8.

## Code vs docs — what's actually wired today

- **DB:** SQLite file by default (`server/data/viva.db`), Postgres optional. No Redis / pg-boss / R2 / LiveKit egress in the shipped server yet — those are documented target infra, not current code.
- **API port is 4000** (docs §8 example says 8080 — the code/`.env`/`dev.sh` use 4000).
- **Auth** is real email/password + JWT in `server/src/auth.ts`; mobile also references Supabase. Billing screens (Plans/Payment) exist in the client but server billing is not implemented.
