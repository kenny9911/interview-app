# 60 · viva — Launch Readiness (M0–M8)

> **Purpose.** A single, honest status board for taking viva to production. It maps each
> milestone from [`50-product-task-plan.md`](./50-product-task-plan.md) to its **current
> state in the codebase**, and — critically — separates work that engineering can finish
> from **human-gated blockers** that the product owner must unblock (payments, auth vendor,
> production database, App Store submission, legal-reviewed privacy policy).
>
> **How to read the status column.**
> - **Done** — implemented and exercised in code/tests.
> - **Partial** — a working slice exists, but something material is stubbed, simplified, or
>   not production-grade.
> - **Blocked-on-user** — cannot proceed without the owner providing an account, key,
>   contract, vendor decision, or legal sign-off. These are called out individually in §3.
>
> **Grounding.** Statements below are drawn from the actual source as of this writing:
> `server/src/*` (Fastify API, agents, SQLite store, env guard), `agent/src/*` (LiveKit
> voice worker), and `mobile/src/*` (Expo app). Where the plan described an aspiration that
> is **not** in the code (Postgres, R2, Stripe/RevenueCat, pg-boss, Redis, real in-app
> purchase), this doc says so plainly rather than claiming it.

---

## 1. One-paragraph state of the build

The end-to-end happy path works: a user creates a real password account (scrypt-hashed,
constant-time verify), configures an interview, passes a consent gate, joins a real LiveKit
room where a Node voice agent (**Silero VAD + Deepgram STT + Cartesia TTS**) runs a
full-duplex conversation driven by a server-side four-agent brain (Planner / Interviewer /
async Reviewer / Analyst on **Anthropic Claude**), and then sees an evidence-cited,
affect-free report. **Persistence is real and durable** via `server/src/sqliteStore.ts` (Node
built-in `node:sqlite`, WAL mode) — data survives restarts. The user-facing **compliance
actions (export & delete) are real endpoints** wired into the app. What is **not**
production-ready: a managed Postgres/object-storage tier, billing/entitlements (paid plans are
honestly marked "coming soon," not faked), an *optional* managed-auth provider, and the hosted
legal/retention pieces — all of these are gated on the owner.

---

## 2. Milestone status board

| Milestone | Goal (from plan) | State | What's actually in the code | Gap to "production done" |
|---|---|---|---|---|
| **M0 Foundations & contracts** | Repos, env, shared contracts, data model | **Done** | Fastify app (`server/src/app.ts`), Zod domain model (`server/src/domain.ts`), env schema + production guard (`server/src/env.ts`), Vitest suite, `.env.example`, `dev.sh` launcher. | Monorepo is folder-based (`server/`, `agent/`, `mobile/`) rather than pnpm workspaces; shared types are duplicated between server and mobile, not a published package. Cosmetic, not blocking. |
| **M1 Auth, setup, session create** | Sign in → setup → persisted session | **Done (real password accounts)** | `POST /v1/auth/signup` + `POST /v1/auth/signin` with **scrypt** password hashing and constant-time verify (`server/src/auth.ts` `hashPassword`/`verifyPassword`); users persisted via `store.saveUser`/`getUserByEmail`; the legacy passwordless `POST /v1/auth/login` is now **DEV/TEST-ONLY** (returns 403 in production). App session token TTL is **7 days** (was 15 min); the mobile client clears auth on a 401. `POST /v1/configs`, `POST /v1/sessions`; ownership/IDOR guard. SQLite-persisted users/configs/state/summaries. JD/resume captured as **text fields**. | No OAuth/social login (the mobile buttons honestly say "coming soon"); no file upload for JD/resume (text only; no R2); entitlement/quota not enforced; no refresh-token rotation or persistent **secure** token storage on-device. A **managed** identity provider is optional, not required. See blockers B-AUTH (optional), B-DB. |
| **M2 Interview brain (offline)** | Planner/Reviewer/Analyst on fixtures | **Done** | `server/src/agents.ts` (plan/begin/next-turn/review/analyze), prompt library (`server/src/prompts/*`), scoring-integrity guards (`server/src/scoring/integrity.ts`: verbatim-evidence check + affect-language linter), calibration eval (`npm run eval`). Anthropic client uses prompt caching on the system prefix. | Falls back to an **offline dev stub** (`llm/devStub.ts`) when `ANTHROPIC_API_KEY` is empty — fine for UI dev, never for prod (the env guard refuses to boot prod without the key). |
| **M3 Live voice loop (single turn)** | Real room, greet, one full-duplex turn, barge-in | **Done (code) / Blocked-on-user (verify)** | `agent/src/agent.ts` runs the LiveKit `AgentSession` (VAD + Deepgram STT + Cartesia TTS), per-style endpointing, barge-in via the framework, data-channel events (orb state, captions, progress, degraded). Mobile `livekit/room.ts` joins, publishes mic, renders orb/captions. Connectivity spike (`npm run spike`). | The live audio path **cannot be verified without real LiveKit/Deepgram/Cartesia keys and a physical device** — see blocker B-VOICE-VERIFY. Latency numbers (D5 budget) are not yet measured on real infra. |
| **M4 Adaptive multi-turn** | Full adaptive interview, progress, clean end | **Done** | `nextTurn` advances the cursor; async Reviewer runs **off the speech path** under a per-session lock and emits `PlanPatch`es applied to future slots (D2); progress/feedback published over data channel; `complete` triggers the Analyst. | Hot state lives in SQLite + an in-process lock, **not Redis** as the plan's D3 specified. Single-process correct; multi-instance reconnect-resume (re-dispatch to the same room from another node) is not implemented. |
| **M5 Analysis, Results, provable E2E** | Analyst runs, Results renders real report, full path demonstrable | **Done** | `POST /v1/sessions/:id/complete` runs the Opus Analyst (idempotent, lock-guarded), persists the report; `GET /v1/sessions/:id/report` + `/transcript`; mobile Results/Transcript/History wired to the API. Report is evidence-cited and carries a `noAffectStatement`. | No PDF artifact and **no R2** — the report is JSON in SQLite, served over the API (the plan's PDF-to-R2 step is not built). No audio playback link (no recording egress configured). |
| **M6 Monetization, modes, compliance** | All modes, payments/entitlements, export/delete/consent | **Partial / Blocked-on-user** | 3 P0 modes run (`mock`, `topic_practice`, `capability_assessment`); `real`/`expert_interview` correctly gated as "coming soon" (`MVP_MODES`). Consent scopes captured at `/v1/sessions` and stored as `recordingEnabled`. **Export & delete are real endpoints, wired to mobile:** `POST /v1/data/export` returns the signed-in user's account + configs + sessions + transcripts + reports (**never** the password hash) and `POST /v1/data/delete` purges the account and all data via `store.deleteUserData` (implemented in both `MemoryStore` and `SqliteStore`); `DataPrivacyScreen` calls them (Share for export; delete → `clearAuth` → Welcome). | **Payments: coming-soon, no fake UI** — `PaymentScreen` is an honest "paid plans coming soon" screen (no fake card / Apple-Pay / Google-Pay) and `PlansScreen` shows a labelled "PRICING PREVIEW · LAUNCHING SOON"; **real In-App Purchase remains owner-gated** (App Store Connect). No versioned `ConsentRecord`, no retention job, no pre-egress consent re-check. See blocker B-PAY (real IAP). |
| **M7 Voice quality, latency, resilience** | Natural voice, latency SLOs, survives bad conditions | **Partial** | Per-style endpointing knobs (D5) in both worker and `server/src/voice/endpointer.ts`; degraded-experience signalling + bridge line on backend hiccup; agent client retries; mobile reconnect/quality handling in `room.ts`. | No load/chaos testing, no measured latency SLOs, no vendor-failover (ElevenLabs key is read but no automatic TTS fallback chain is wired), no soak tests. Requires real infra + load tooling. |
| **M8 Final hardening, security, a11y, launch gate** | Security, accessibility, store readiness, >90% gate | **Partial / Blocked-on-user** | Production config guard refuses insecure defaults (`assertProductionConfig`); real password auth (scrypt) + ownership guards; error envelope hides internals in prod; scoring-integrity guards. | No rate limiting, no webhook signature verification (no webhooks wired), no secret rotation, no refresh-token rotation / persistent secure on-device token storage, accessibility audit not run, and **App Store submission is owner-gated**. A managed-auth provider is optional. See blockers B-AUTH (optional), B-DB, B-APPLE, B-LEGAL. |

---

## 3. Human-gated blockers (cannot be done without the owner)

These are the items engineering **cannot** complete alone. Each lists exactly what the owner
must provide. Until these are resolved, viva can be demonstrated but **not** publicly launched.

### B-PAY — Payments / subscriptions
- **Why it's gated:** Money requires the owner's legal entity, bank/tax details, and a
  payments account that engineering cannot create on the owner's behalf. The current
  Plans/Payment screens are **presentation-only** and grant nothing.
- **Critical platform constraint:** For a **digital subscription consumed inside an iOS app**
  (unlocking more interviews / styles), **Apple requires In-App Purchase via StoreKit** — you
  **cannot** use Stripe (or any external card processor) to sell the subscription inside the
  app. Stripe/web checkout is only permissible for genuinely off-app purchases. The plan's
  earlier "Stripe" references and the `.env.example`/architecture mention of Stripe are
  therefore **incorrect for the iOS subscription path** and must not be used for it.
  - The recommended path is **Apple In-App Purchase (StoreKit 2)**, typically fronted by a
    billing aggregator such as **RevenueCat** (per decision D14) to manage entitlements and
    add Google Play Billing later. Stripe may still be used for a future **web/Teams** tier
    only.
- **What the owner must provide:**
  1. An **Apple Developer Program** account (paid, $99/yr) and an **App Store Connect** app
     record, with the **subscription products** and pricing created there.
  2. Paid-apps agreement signed and **banking + tax forms** completed in App Store Connect
     (Apple will not process IAP until these are in).
  3. A decision and account for the **entitlement layer** (RevenueCat recommended) plus its
     API keys, OR an explicit decision to hand-roll StoreKit 2 receipt validation.
  4. (Optional, web only) A **Stripe** account if a web tier is in scope.
- **Then engineering can:** wire the StoreKit/RevenueCat SDK in the app, add an entitlements
  table + check on the server before a session goes live, and replace the stub Plans/Payment
  flow with real purchase + restore.

### B-AUTH — Optional managed-auth provider (real password auth already ships)
- **Status:** **No longer blocking.** Real password accounts are implemented:
  `POST /v1/auth/signup` and `POST /v1/auth/signin` hash passwords with **scrypt** and verify
  them in constant time (`server/src/auth.ts`); users are persisted in the store; the legacy
  passwordless `/v1/auth/login` is **DEV/TEST-ONLY** and returns 403 in production. The app can
  launch on this. What remains here is **optional** and a matter of owner preference, not a
  prerequisite for shipping auth.
- **Why an owner choice is still involved (optional):** if the owner prefers a **managed**
  identity provider (for hosted password reset, MFA, and OAuth/social sign-in) instead of the
  built-in scrypt accounts, that vendor decision and account belong to the owner. Today the
  mobile **Apple/Google buttons honestly say "coming soon"** rather than faking a login.
- **What the owner would provide (only if going managed / adding social):** a decision between
  **Clerk**, **Auth0**, **Supabase Auth**, or staying self-hosted, plus account + API keys. If
  Apple/Google social sign-in is desired, the owner must also enable **Sign in with Apple**
  (Apple **requires** it if any other social login is offered) and provide the OAuth client
  credentials.
- **Also still open (engineering, not owner-gated):** there is no refresh-token rotation yet
  (the app token TTL is a flat **7 days**) and tokens are not yet in **persistent secure
  device storage** — both are hardening items, not launch blockers.
- **Then engineering can:** swap to the provider if chosen, sync users into our store, and keep
  the existing ownership/quota contract.

### B-DB — Production Postgres provisioning
- **Why it's gated:** Today the server persists to **SQLite on local disk**
  (`server/src/sqliteStore.ts`, `./data/viva.db`). That is durable for a single host but is
  **not** a managed, backed-up, horizontally-scalable production database. Provisioning the
  managed tier requires the owner's cloud account and budget.
- **What the owner must provide:** a managed **Postgres** instance (the docs target **Neon**;
  any managed Postgres works) and its `DATABASE_URL`, plus a decision on object storage
  (**Cloudflare R2** in the docs) and the R2 credentials if recordings/exports are in scope.
- **Then engineering can:** implement a `PostgresStore` behind the existing `Store` interface
  (the SQLite store is explicitly written as a swappable drop-in), run migrations, and move
  hot turn-state to Redis if multi-instance scale is needed. **Note:** the app runs correctly
  on SQLite today; Postgres is a scale/ops upgrade, not a functional blocker for a demo or a
  small single-node launch.

### B-APPLE — Apple Developer & App Store submission
- **Why it's gated:** Only the owner can hold the developer account, accept Apple's legal
  agreements, and submit the build for review.
- **What the owner must provide:** enrolled **Apple Developer Program** membership, the
  **bundle identifier**, signing assets (or Expo/EAS-managed credentials authorization), the
  App Store Connect listing (see [`62-app-store-metadata.md`](./62-app-store-metadata.md)),
  and final sign-off to submit. The app's mic/camera usage strings and the **privacy nutrition
  label** must be filled in by someone authorized on the account.
- **Then engineering can:** produce the EAS build, attach metadata/screenshots, and push to
  TestFlight / App Review.

### B-LEGAL — Lawyer-reviewed privacy policy (and terms)
- **Why it's gated:** viva records **audio (and optionally video)**, stores **transcripts and
  scores**, and sends user speech to **third-party processors** (LiveKit, Deepgram, Cartesia,
  Anthropic). A published, legally-reviewed **privacy policy** is required by both the App
  Store and applicable privacy law (GDPR/CCPA-style rights). Engineering can draft, but cannot
  approve, legal text.
- **What the owner must provide:** **legal review and sign-off** of
  [`61-privacy-policy-DRAFT.md`](./61-privacy-policy-DRAFT.md), a **public hosting URL** for
  the final policy (required in App Store Connect), a real **contact/DPO email**, the legal
  entity name/address, and confirmation that **Data Processing Agreements** are in place with
  each processor. A **Terms of Service** is also expected.
- **Then engineering can:** wire the policy/terms links into the app (Consent and Data &
  Privacy screens) and the store listing. The export/delete endpoints the policy references are
  **already implemented** (see B-COMPLIANCE).

### B-COMPLIANCE — User-facing data rights (export & delete)
- **Status:** **Satisfied in-code.** Export and deletion are **real endpoints** wired to the
  app, not stubs: `POST /v1/data/export` returns the signed-in user's account + configs +
  sessions + transcripts + reports (and **never** the password hash), and `POST /v1/data/delete`
  permanently purges the account and all of its data via `store.deleteUserData` (a real cascade
  in both `MemoryStore` and `SqliteStore`). The mobile `DataPrivacyScreen` calls them — **Share**
  for the export bundle, and delete → `clearAuth` → back to **Welcome**.
- **What's still open (owner / legal, not the endpoints):** the **retention policy** (how long
  audio/transcripts/reports are kept) and an **automatic retention/auto-delete job** are not yet
  defined or built — these depend on a legal/owner decision. Once object storage exists (B-DB),
  the delete cascade must also **purge R2** recordings.
- **Then engineering can:** add the retention/auto-delete job to the agreed schedule and extend
  the delete cascade to R2 when recordings storage lands.

### B-VOICE-VERIFY — Live voice acceptance on real infra
- **Why it's gated:** The voice loop is fully coded but its acceptance bars (D5 latency budget,
  barge-in feel, caption accuracy) can only be proven with **real LiveKit/Deepgram/Cartesia
  keys on a physical device** — which requires the owner's vendor accounts/keys.
- **What the owner must provide:** funded **LiveKit Cloud**, **Deepgram**, and **Cartesia**
  accounts and keys, and access to a test iPhone (or willingness to run the device session).
- **Then engineering can:** run the spike + a real interview, capture latency marks, and tune
  endpointing.

---

## 4. Owner action checklist (the short version)

- [ ] **B-AUTH (optional)** — Real password auth already ships. *Only if going managed / adding social:* pick the vendor (Clerk / Auth0 / Supabase / self-host), provide keys, and enable Sign in with Apple if any social login.
- [ ] **B-PAY** — Apple Developer + App Store Connect subscription products; complete banking/tax; choose RevenueCat (or StoreKit-direct) for **real IAP**. **No Stripe for in-app iOS subscriptions.** (The app currently shows an honest "coming soon" — no fake checkout.)
- [ ] **B-DB** — Provision managed Postgres (`DATABASE_URL`); decide on R2 for recordings/exports and provide keys.
- [ ] **B-APPLE** — Enrolled developer account, bundle id, listing, mic/camera strings, privacy nutrition label, submit sign-off.
- [ ] **B-LEGAL** — Lawyer review + sign-off of the privacy policy; host it publicly; provide contact email and DPA confirmations; provide Terms of Service.
- [ ] **B-COMPLIANCE** — Export/delete endpoints are built and wired. *Remaining:* provide the retention policy so the auto-delete job (and the policy's retention text) can be finalized.
- [ ] **B-VOICE-VERIFY** — Fund LiveKit/Deepgram/Cartesia; provide keys; enable a real-device voice test.

---

## 5. What's safe to claim today vs. not

**Safe to claim:** a working, persistent, end-to-end AI voice-interview demo with **real
password accounts** (scrypt-hashed, constant-time verify), a real multi-agent brain,
evidence-cited affect-free scoring, a real LiveKit voice agent, a durable SQLite store, **real
data export & deletion endpoints** wired into the app, and a production config safety guard that
refuses insecure boots.

**Do not claim:** payments / real in-app purchase, a managed/scalable database, recording
storage, OAuth/social sign-in, vendor failover, measured latency SLOs, or App Store
availability — all of these are Partial or Blocked-on-user above. (Auth and export/delete are
**no longer** on this list — they are real.)
