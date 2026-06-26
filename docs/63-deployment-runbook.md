# 63 · viva — Deployment Runbook

> **Purpose.** How to deploy and operate viva in production: the two server-side processes
> (the **Fastify API** and the **LiveKit voice agent worker**), their required environment,
> the **persistence** choice (SQLite today, Postgres later), LiveKit project setup, and the
> **production-config safety checklist** the API enforces at boot.
>
> **Audience.** Whoever ships and runs the backend. Grounded in the actual code:
> `server/src/server.ts`, `server/src/env.ts`, `server/src/sqliteStore.ts`,
> `agent/src/agent.ts`, and the repo-root `.env.example`.

---

## 1. What you deploy

viva's mobile app (Expo/React Native) talks to **one backend you operate**, which is two
processes plus managed vendors:

| Process | Dir | Command (prod) | Role |
|---|---|---|---|
| **API service** | `server/` | `npm run build && npm start` (`node dist/server.js`) | Stateless HTTP API: auth, configs, sessions, the interview brain (Planner/Reviewer/Analyst), persistence, token mint. Listens on `API_PORT` (default 4000). |
| **Voice agent worker** | `agent/` | `npm run start` (`tsx src/agent.ts start`) | Long-lived LiveKit worker. Joins interview rooms, runs VAD/STT/TTS, drives each turn through the API's `/begin`, `/next-turn`, `/complete`. |

Managed vendors the backend calls: **LiveKit Cloud** (media), **Deepgram** (STT), **Cartesia**
(TTS), **Anthropic** (Claude). For local dev, `./dev.sh` starts the API + agent together;
the Expo app is launched separately (`cd mobile && npx expo run:ios [--device]`).

> The API and the agent are deployed **independently** — they have different scaling/latency
> profiles. The agent worker must be reachable to the API (it calls the API's session routes)
> and vice-versa (the API mints tokens for rooms the worker joins).

---

## 2. Required environment variables

Both processes read the repo-root **`.env`** (see **`.env.example`** for the authoritative
template — copy it to `.env` and fill in real values; it is gitignored). Key variables:

**Required for any real run**
- `ANTHROPIC_API_KEY` — without it the API silently falls back to an **offline dev stub**;
  in production the boot guard **refuses to start** if it's empty (see §5).
- `JWT_SECRET` — signs the app's access tokens. **Must not** be the dev default in prod.
- `AGENT_SERVICE_TOKEN` — shared secret the agent worker presents to the API's
  `/begin`, `/next-turn`, `/complete` routes. **Must not** be the dev default in prod.

**Required for live voice**
- `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` — LiveKit Cloud project creds.
- `DEEPGRAM_API_KEY` — streaming STT.
- `CARTESIA_API_KEY` — streaming TTS. (`ELEVENLABS_API_KEY` is read as an optional alternate;
  automatic failover is not yet wired.)

**Model routing (have sensible defaults; override only if needed)**
- `CLAUDE_MODEL_LIVE` (default `claude-sonnet-4-6`), `CLAUDE_MODEL_DEEP`
  (default `claude-opus-4-8`), `CLAUDE_MODEL_REVIEWER`, `CLAUDE_MODEL_GUARD`. See decision D1.
  *(Note: `.env.example` also lists the older `CLAUDE_MODEL_PLANNER/INTERVIEWER/REVIEWER/ANALYST`
  names; the code reads the `CLAUDE_MODEL_LIVE/DEEP/REVIEWER/GUARD` tier names in `env.ts`.
  Set the tier names to be safe.)*

**Service config**
- `API_PORT` (default 4000), `API_PUBLIC_URL`, `NODE_ENV` (set to `production`),
  `CORS_ORIGINS` (comma-separated allowed origins).

**Agent worker also needs**
- `API_BASE_URL` — where the worker reaches the API (see `agent/README.md`), plus the LiveKit,
  Deepgram, and Cartesia keys above. Optional per-persona voices:
  `CARTESIA_VOICE_ARIA` / `CARTESIA_VOICE_SAM` / `CARTESIA_VOICE_LENA`.

**Database / storage (see §3)**
- `DATABASE_URL` — present in `.env.example` for a future Postgres store; **the current code
  does not use it** (it persists to SQLite). `DATA_DIR` overrides the SQLite directory.
- `R2_*` — object storage for recordings/exports. **Not wired in the current build**; provide
  only when storage is implemented.

**Mobile app**
- `EXPO_PUBLIC_API_URL` — the API's public URL (on a real device, your machine's LAN IP for
  local testing, e.g. `http://192.168.1.23:4000`). `EXPO_PUBLIC_LIVE_ENABLED` toggles the
  live voice screens.

---

## 3. Persistence: SQLite (today) vs Postgres (future)

**Current default — SQLite, and it is durable.** The running server persists to
`server/src/sqliteStore.ts` (Node's built-in `node:sqlite`, WAL mode) at `${DATA_DIR}/viva.db`
(`DATA_DIR` defaults to `./data`). Data **survives restarts** — there is no mock/in-memory data
in production. Tests use an in-memory store; everything else uses SQLite.

| | **SQLite (current)** | **Postgres (future / scale)** |
|---|---|---|
| Status | **Implemented, default** | **Not implemented** — interface is ready for a drop-in `PostgresStore` |
| Durability | Yes — file on disk, WAL | Yes — managed, replicated |
| Scale | **Single host only** (the file lives on one machine's disk) | Horizontal — many API instances share one DB |
| Backups | **Your responsibility** — snapshot/copy `viva.db` (incl. WAL) on a schedule | Managed by the provider (e.g. Neon PITR) |
| Concurrency | Correct for **one process** (CAS via single-threaded read-modify-write); not for multiple API nodes | Safe across many nodes |
| When it's enough | Demo, pilot, single-node launch with a **persistent disk** and your own backups | Multi-instance production, autoscaling, managed backups |

**Operational rules for SQLite in production:**
- Run **exactly one** API instance (the optimistic-concurrency CAS assumes a single process).
- Put `DATA_DIR` on a **persistent, backed-up volume** — never an ephemeral container FS, or
  you lose all data on redeploy.
- Back up `viva.db` **and** its `-wal`/`-shm` sidecar files together.

**Migrating to Postgres (when scale or multi-instance is needed):** implement `PostgresStore`
behind the existing `Store` interface, set `DATABASE_URL`, and (for multi-node
reconnect-resume) move hot turn-state to Redis. The SQLite store is written explicitly as a
swappable drop-in for this. This is blocker **B-DB** in
[`60-launch-readiness.md`](./60-launch-readiness.md) and requires the owner to provision the
managed database.

---

## 4. Running the agent worker & LiveKit project config

**LiveKit project setup (one-time):**
1. Create a LiveKit Cloud project; copy its `LIVEKIT_URL` (`wss://…livekit.cloud`),
   `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` into `.env`.
2. The API creates each interview room as `viva-interview-<sessionId>` with **persona/style in
   the room metadata** (`server/src/livekit/token.ts`); the worker reads that metadata on join
   to pick the voice and endpointing timing. No manual room setup is needed.
3. Recording **egress to object storage is not configured in code** — if you enable recordings,
   you must set up LiveKit Egress → R2 and the corresponding storage credentials (currently
   out of scope; see B-DB / B-COMPLIANCE).

**Run the worker:**
```bash
cd agent
npm install
# 1) connectivity spike FIRST — verifies LiveKit + Deepgram + Cartesia creds and the VAD/STT/TTS load
npm run spike
# 2) start the worker (it registers with LiveKit and waits to be dispatched into interview rooms)
npm run start
```
The worker is **long-lived** and dispatched one job per interview room. Scale it by running
more worker instances (the API and LiveKit handle dispatch); the API can remain a single
instance while SQLite is the store (§3).

**Smoke test of the whole loop:** start the API, start the worker, then from the app create an
interview — the API mints a token for `viva-interview-<sessionId>`, the worker joins, greets
the candidate, and the conversation runs. The live audio path **requires real keys and ideally
a physical device** (blocker B-VOICE-VERIFY).

---

## 5. Production-config safety checklist

The API **refuses to boot in production with insecure defaults.** This is enforced by
`assertProductionConfig()` in `server/src/env.ts`, which runs at import time. When
`NODE_ENV=production`, it throws (and the process exits) if **any** of these is still a dev
default or unsafe:

- `JWT_SECRET` is still `dev-jwt-secret-change-me` **or** shorter than 16 chars.
- `AGENT_SERVICE_TOKEN` is still `dev-agent-token`.
- `LIVEKIT_API_KEY` is still `devkey`.
- `LIVEKIT_API_SECRET` is still `devsecret-please-change-32chars-min`.
- `LIVEKIT_URL` is still `wss://example.livekit.cloud`.
- `ANTHROPIC_API_KEY` is **empty** (it would otherwise fall back to the offline stub — never
  acceptable in prod).

If it refuses, the error lists exactly which values are wrong. **Fix the `.env`, don't bypass
the check.** This means a correct production deploy must, at minimum, set: a strong unique
`JWT_SECRET`, a unique `AGENT_SERVICE_TOKEN`, real LiveKit creds, and a real
`ANTHROPIC_API_KEY`.

**Other production hardening to verify (some are gaps — see launch-readiness M8):**
- `NODE_ENV=production` (also makes the API hide internal error detail from clients).
- `CORS_ORIGINS` set to your real app origins only.
- Run the API behind HTTPS/TLS (terminate at your proxy/load balancer).
- The session routes enforce **ownership** (anti-IDOR) via the verified JWT; confirm the real
  auth provider is wired before launch (the current login is a stub — blocker B-AUTH).
- **Not yet present** (track before public launch): rate limiting, webhook signature
  verification (no webhooks wired), secret rotation, automatic vendor failover, and the
  export/delete/retention endpoints.

---

## 6. Deploy sequence (quick reference)

1. **Provision** vendor accounts/keys: Anthropic, LiveKit, Deepgram, Cartesia. (Auth provider
   + Postgres + R2 when those blockers are cleared.)
2. **Configure** `.env` from `.env.example` with real values; ensure none are dev defaults.
3. **API:** `cd server && npm ci && npm run build && NODE_ENV=production npm start`
   on a host with a **persistent, backed-up** `DATA_DIR` volume (single instance while on
   SQLite).
4. **Agent:** `cd agent && npm ci && npm run spike` (verify), then `npm run start`. Scale
   instances as needed.
5. **Mobile:** build with EAS; set `EXPO_PUBLIC_API_URL` to the API's public URL; submit per
   [`62-app-store-metadata.md`](./62-app-store-metadata.md).
6. **Verify:** health check (`GET /v1/healthz`), then a full create → consent → live → results
   run on a device.

---

## 7. Health & observability

- **Health endpoint:** `GET /v1/healthz` returns `{ ok: true, modes, languages }`.
- **Logs:** the API logs persistence location and errors to stdout; the agent logs session
  errors and degraded states. Ship stdout to your log aggregator.
- **Gaps:** no metrics/tracing/latency dashboards are wired yet (the D5 latency budget is not
  yet instrumented in production). Add these as part of M7 hardening.
