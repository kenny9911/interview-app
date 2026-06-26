# 10 · Refined Product Spec — viva

> Engineering-grade requirements derived from [`00-original-brief.md`](./00-original-brief.md).
> This document is the source of truth for the backend, live voice system, multi-agent
> interview brain, analysis pipeline, and data/API contracts. The 11-screen Expo/RN UI
> already exists (`mobile/`); this phase designs everything behind it and refines the UI's
> data needs, states, and flows.

---

## 1. Product summary & principles

**viva** is a consumer, iOS-first (Android second) AI **voice + video** interview-practice
app for a younger, non-technical audience. A user picks a mode, role, interviewer persona,
and style; joins a live full-duplex voice/video room; is interviewed by an AI persona
(orb-based UI, live captions); and receives an evidence-cited scorecard with per-question
feedback and a full transcript.

The product is **self-serve practice**, not an automated hiring decision. Compliance is
therefore lighter than an enterprise hiring tool, but consent, retention, export/delete,
and a strict no-affect-scoring stance are mandatory.

### Design principles
1. **Conversation first.** The live interview must feel like a natural spoken
   conversation. Sub ~1.5 s from end-of-user-speech to first interviewer audio; smooth
   full-duplex with barge-in; robust VAD/endpointing; graceful degradation on poor
   networks. Latency is a P0 feature, not an optimization.
2. **Warm, not clinical.** Tone, copy, and feedback are encouraging and growth-oriented.
   Even "work on" notes are constructive. The audience is non-technical; never expose
   jargon, model names, or infra in the UI.
3. **Competency- and content-based scoring only.** Scores reflect *what was said* and *how
   it was structured*, never inferred emotion, affect, accent, appearance, or
   demographics. Every score is evidence-cited to transcript spans with human-readable
   rationale.
4. **Consent is explicit and revocable.** Mic/cam/recording consent is granular and
   logged. Users can export and delete their data; retention is configurable.
5. **Adaptive but bounded.** The multi-agent brain adapts follow-ups to the candidate's
   answers, but stays inside a pre-approved plan and competency rubric — no off-topic
   drift, no leading the witness.
6. **Resilient by design.** Any single component failure (STT, TTS, LLM, network) degrades
   gracefully (fallback voice, text mode, resume) rather than ending the session.
7. **Privacy-respecting defaults.** Video recording is opt-in; audio-only is the default.
   Resume/JD content is used for the session and is deletable.

### Naming/terminology
- **Session** = one interview run (also called "interview" in UI).
- **Turn** = one interviewer utterance + the candidate's answer (a Q/A exchange).
- **Persona** = Aria / Sam / Lena. **Style** = friendly / balanced / tough.
- **Brain** = the four-agent system (Planner, Interviewer, Reviewer, Analyst).

---

## 2. Stack review & refinements

The proposed stack is sound. Refinements / decisions:

| Area | Decision |
|---|---|
| **Frontend** | Keep Expo RN + LiveKit RN SDK. Use **expo-dev-client** (not Expo Go) because LiveKit needs native modules. Orb state machine driven by LiveKit agent state events over a data channel. |
| **Backend API** | **Fastify** (TypeScript) over Express — first-class schema validation (JSON Schema / TypeBox) and faster. Zod at the edges for request/response typing. |
| **Realtime** | LiveKit Cloud (SFU + TURN + egress). Agents worker in **Node/TS** so it shares types with the API. |
| **Voice pipeline** | Silero VAD + LiveKit turn detector + Deepgram streaming STT + Claude + **Cartesia** primary TTS, **ElevenLabs** fallback (per-persona voice IDs). |
| **LLM roles** | **Opus 4.8 (`claude-opus-4-8`)** for Planner / Reviewer (deep-think) / Analyst. **Sonnet (`claude-sonnet-4-5`)** for the live Interviewer turn generation (latency-critical). Optional Haiku for cheap turn-taking/safety checks. Prompt caching on system+rubric+plan blocks. |
| **Data** | Postgres (Neon) + pgvector for resume/JD/competency embeddings and semantic dedupe of questions. |
| **Object storage** | Cloudflare R2 for recordings (audio/video) + generated report PDFs. Pre-signed URLs only; never public. |
| **Auth** | Email+password and OAuth (Apple, Google). JWT access (short-lived) + rotating refresh; sessions table for revocation. Apple Sign-In required for iOS App Store if any social login is offered. |
| **Payments** | Apple IAP / Google Play Billing for mobile subscriptions (store policy requires it for digital goods). Stripe used only for web/teams (Max) and as the billing source-of-truth via store-to-Stripe reconciliation. |
| **Async/jobs** | A queue (e.g. BullMQ on Redis, or Neon + pg-boss) for post-interview analysis, egress processing, report generation, retention deletion jobs. |
| **Observability** | Per-turn latency tracing (end-of-speech → first TTS audio), STT/LLM/TTS spans, structured logs, error budgets on the latency SLO. |

---

## 3. User personas (audience)

| Persona | Who | Goals | Pains | Key needs from viva |
|---|---|---|---|---|
| **Maya — New-grad job seeker** (primary) | 22, first real job hunt, non-technical | Practice common questions, build confidence, not freeze up | Anxious, no one to practice with, doesn't know what "good" looks like | Low-pressure mock mode, warm persona, concrete "what to fix," cheap plan |
| **Devin — Career switcher** | 29, moving into a new field | Practice role-specific questions, tailor to a JD | Unsure how to talk about transferable skills | Setup with role + JD + resume, topic practice, harder styles |
| **Priya — Active candidate with a real interview** | 26, has a scheduled employer round | Warm up the same day, rehearse the exact role | Limited time, wants realism | "Up next / real interview" flow, employer-scheduled sessions, final-round realism |
| **Coach/PowerUser** | 24, interviews a lot | Volume practice across roles, track progress | Hits plan caps, wants history & trends | Higher plan, history tab, trend metrics |
| **Employer/Recruiter** (secondary, Max/Teams) | Hiring team | Send a capability assessment or scheduled real interview | Wants structured, comparable output | Invite/schedule flow, capability_assessment mode, shareable report |

---

## 4. User stories by epic

Story IDs: `EPIC-n`. Priority: P0 (MVP), P1 (fast-follow), P2 (later).

### Epic A — Auth & account
- **AUTH-1 (P0):** As a visitor, I can create an account with email + password so I can save my interviews.
- **AUTH-2 (P0):** As a visitor, I can sign in with Apple or Google so I don't manage a password.
- **AUTH-3 (P0):** As a returning user, I can sign in and stay signed in across app launches (refresh tokens).
- **AUTH-4 (P0):** As a user, I can sign out from all devices.
- **AUTH-5 (P1):** As a user, I can reset a forgotten password via email.
- **AUTH-6 (P1):** As a user, I can verify my email.
- **AUTH-7 (P0):** As a user, I must accept Terms & Privacy at signup (consent recorded).
- **AUTH-8 (P1):** As a user, I can delete my account and all associated data.

### Epic B — Setup & mode selection
- **SETUP-1 (P0):** As a user, I can choose an interview mode (mock, real, topic_practice, capability_assessment, expert_interview).
- **SETUP-2 (P0):** As a user, I can set my target role.
- **SETUP-3 (P0):** As a user, I can pick an interviewer persona (Aria/Sam/Lena) and style (friendly/balanced/tough).
- **SETUP-4 (P0):** As a user, I can set language and length (minutes).
- **SETUP-5 (P0):** As a user, I can optionally add a topic/focus area.
- **SETUP-6 (P1):** As a user, I can optionally paste/upload a job description and/or resume to tailor questions.
- **SETUP-7 (P0):** As a user, I can preview my camera/mic and see device permission status before starting.
- **SETUP-8 (P0):** As a user, when I press "Start," the question plan is generated and the live room is provisioned.
- **SETUP-9 (P1):** As a returning user, my last setup is pre-filled as defaults.
- **SETUP-10 (P1):** As an invited candidate, I can open a real/capability session from "Up next" without configuring it (employer pre-set it).

### Epic C — Live interview
- **LIVE-1 (P0):** As a user, I can grant mic/cam/recording consent before the room connects.
- **LIVE-2 (P0):** As a user, I join a live room and hear the interviewer greet me by persona.
- **LIVE-3 (P0):** As a user, I can speak naturally and be heard with low latency (full-duplex).
- **LIVE-4 (P0):** As a user, I can interrupt (barge-in) the interviewer and it stops talking.
- **LIVE-5 (P0):** As a user, I see the orb reflect state: idle / listening / thinking / speaking.
- **LIVE-6 (P0):** As a user, I see live captions of what I and the interviewer say.
- **LIVE-7 (P0):** As a user, I see the current question text, question N of M, and progress.
- **LIVE-8 (P1):** As a user, I receive lightweight in-the-moment positive feedback chips.
- **LIVE-9 (P0):** As a user, I can mute/unmute mic, toggle camera, toggle captions, and end the interview.
- **LIVE-10 (P0):** As a user, if my network drops I can reconnect and resume the same session.
- **LIVE-11 (P1):** As a user, on a bad network the system degrades gracefully (audio-only, lower TTS quality, text fallback) rather than failing.
- **LIVE-12 (P0):** As a user, when time runs out or I end early, the interviewer wraps up and I'm taken to results.
- **LIVE-13 (P2):** As a user, I can switch to a quiet/"deep night" low-light visual variant (LiveNight screen).
- **LIVE-14 (P1):** As a user, I'm warned and the session pauses if I leave the app, then can resume.

### Epic D — Results & report
- **RESULTS-1 (P0):** As a user, I see an overall score + tier label (e.g. STRONG) after the interview.
- **RESULTS-2 (P0):** As a user, I see per-competency scores (Communication, Structure, Depth, Confidence, extensible).
- **RESULTS-3 (P0):** As a user, I see "stood out" and "work on" summaries.
- **RESULTS-4 (P0):** As a user, I can read per-question feedback with evidence quotes.
- **RESULTS-5 (P0):** As a user, I can read the full transcript.
- **RESULTS-6 (P1):** As a user, I can play back my recording aligned to the transcript.
- **RESULTS-7 (P1):** As a user, I can export/share my report (PDF).
- **RESULTS-8 (P0):** As a user, if analysis is still processing I see a clear "generating your report" state.
- **RESULTS-9 (P0):** As a user, I can start "Practice again" with the same setup.

### Epic E — History
- **HIST-1 (P0):** As a user, I can see a list of my past interviews (date, mode, role, score).
- **HIST-2 (P0):** As a user, I can open any past interview's full report.
- **HIST-3 (P1):** As a user, I can see score trends over time per competency.
- **HIST-4 (P1):** As a user, I can filter/sort history by mode/role/date.
- **HIST-5 (P1):** As a user, I can delete an individual past interview.
- **HIST-6 (P1):** As a user, I see "Up next" scheduled real/capability interviews.

### Epic F — Plans & payment
- **PLAN-1 (P0):** As a user, I can view plans (Standard / Plus / Max) with monthly/yearly toggle.
- **PLAN-2 (P0):** As a user, I can start a 7-day free trial of a paid plan.
- **PLAN-3 (P0):** As a user, I can pay via Apple Pay / Google Pay / card (store billing on mobile).
- **PLAN-4 (P0):** As a user, I see my remaining interview quota for the period.
- **PLAN-5 (P0):** As a user, I'm blocked from starting an interview when quota is exhausted, with an upgrade prompt.
- **PLAN-6 (P1):** As a user, I can cancel/manage my subscription (deep-link to store management).
- **PLAN-7 (P1):** As a user, I can switch between monthly and yearly.
- **PLAN-8 (P2):** As a Teams (Max) admin, I can invite seats.

### Epic G — Consent & privacy
- **PRIV-1 (P0):** As a user, I explicitly consent to mic, camera, and recording separately before recording starts.
- **PRIV-2 (P0):** As a user, I can decline video and still do an audio-only interview.
- **PRIV-3 (P0):** As a user, I can export all my data.
- **PRIV-4 (P0):** As a user, I can delete a session's recording/transcript or my whole account.
- **PRIV-5 (P1):** As a user, I can set how long recordings are retained (or disable recording storage).
- **PRIV-6 (P0):** As a user, I'm assured (in copy + policy) that I am not scored on emotion/affect/appearance.
- **PRIV-7 (P1):** As a user, I can withdraw consent mid-session (recording stops, session continues or ends).

---

## 5. Functional requirements per screen

Each screen lists: purpose, data in, primary actions, and **empty / loading / error / permission** states. The 11 screens map to: Welcome, SignIn, SignUp, Home, ChooseMode, Setup, Live, Results, Plans, Payment, LiveNight.

### 5.1 Welcome
- **Purpose:** Brand intro + entry into auth.
- **Actions:** "Get started" → SignUp; "I already have an account" → SignIn.
- **States:** Static. If a valid session token exists on launch, skip Welcome → Home (silent auto-login). On token refresh failure → show Welcome.

### 5.2 Sign in
- **Data in:** email, password; OAuth (Apple/Google).
- **Actions:** Submit credentials; OAuth; "Forgot password" (P1).
- **Empty:** disabled submit until both fields non-empty.
- **Loading:** spinner on button; disable inputs.
- **Error:** inline "Email or password is incorrect"; rate-limit message after N attempts; OAuth-cancelled returns silently; network error toast with retry.

### 5.3 Create account
- **Data in:** name, email, password (+ strength rule), accept Terms/Privacy checkbox.
- **Actions:** Submit; OAuth.
- **Empty/validation:** email format, password min length, T&C required → inline errors.
- **Error:** "Email already in use" → offer sign-in; weak password; network error.
- **Consent:** signup writes a consent record (T&C + privacy version).

### 5.4 Home
- **Purpose:** greeting, "Up next" real interview, 2×2 practice grid, tab bar.
- **Data in:** user name/avatar, today's date, scheduled "up next" session (if any), quota summary, recent activity.
- **Empty:** no "up next" → hide the hero or show a "Schedule or start a mock" prompt; new user with no history → practice grid still shown.
- **Loading:** skeleton for hero + grid.
- **Error:** if home payload fails, show cached data + a non-blocking retry banner.
- **Permission:** none here.
- **Tab bar:** Home / Practice (→ ChooseMode) / Interviews (→ History) / Profile (→ Plans/account).

### 5.5 Choose a mode
- **Data in:** the 5 modes with descriptions and badges (POPULAR / INVITE), language selector.
- **Actions:** select mode → "Continue with {mode}" → Setup.
- **State logic:** "Real interview" and "Capability assessment" are **invite-driven** — if the user has no invite, show them as locked/secondary with an explanatory tooltip; tapping explains how to get invited rather than proceeding.
- **Empty:** always populated (static modes).
- **Error:** language list fetch failure → fall back to device language + English.

### 5.6 Set up
- **Data in (InterviewConfig fields):** role (picker), interviewer style (segmented), interviewer persona (cards), language, length (minutes), optional topic/focus, optional JD, optional resume. Camera/mic preview + "Camera ready" status.
- **Actions:** edit fields; "Start interview."
- **Empty/defaults:** pre-fill from last config (P1); role required to start.
- **Permission:** request camera + mic for preview; if denied → show "audio-only" or "enable in Settings" inline; do not block start for audio-only.
- **Loading (on Start):** "Building your interview…" while Planner runs and room is provisioned (typically a few seconds). Block double-submit.
- **Error:** plan generation failure → retry; quota exhausted → route to Plans; JD/resume upload failure → allow continue without it.
- **JD/resume:** size/type limits; show parsing status; allow remove.

### 5.7 Live interview
- **Data in:** room token, persona, plan (questions, count), live agent state, live captions, current question, timer, progress, feedback chips, self PIP video.
- **Actions:** mute/unmute, camera toggle, captions toggle, end call. Barge-in is implicit (speaking interrupts).
- **Pre-join consent gate (LIVE-1):** before connecting, a consent sheet covers mic/cam/recording; user must accept (or choose audio-only / no-recording) to proceed.
- **Permission states:** mic denied → cannot proceed (mic is required); show Settings deep-link. Camera denied → audio-only, PIP shows avatar placeholder. Recording declined → session runs, nothing persisted to R2, transcript-only.
- **Orb states:** idle (pre-start), listening (user speaking / VAD active), thinking (LLM generating), speaking (TTS playing). Driven by agent events.
- **Empty/early:** before greeting, orb idle + "Connecting…".
- **Loading/connection:** connecting, reconnecting (LIVE-10), waiting-for-agent. Show a clear reconnect banner; preserve timer.
- **Degraded (LIVE-11):** poor network → drop video, lower TTS bitrate, show "Weak connection — audio only" chip; if STT/TTS fail → text fallback (type answers / read questions).
- **Error:** agent crash → auto-restart agent and resume; unrecoverable → end gracefully and still run analysis on captured transcript.
- **End:** time-up or hang-up → interviewer closing line → navigate to Results with a "processing" state.

### 5.8 Results
- **Data in:** Report (overall score + tier, per-competency scores, stood-out / work-on, per-question feedback, transcript, optional recording playback).
- **Actions:** view transcript; play recording (P1); export/share PDF (P1); "Practice again" (re-enters Setup with same config); back to Home.
- **Loading (RESULTS-8):** analysis async → show "Generating your report…" with progress; poll or subscribe; partial results (scores first, deep feedback after) acceptable.
- **Empty:** if a session ended with too little content (e.g., user said almost nothing) → show "Not enough to score — try again" with encouragement, no fabricated scores.
- **Error:** analysis failed → retry button; never invent a score.
- **No-recording case:** hide playback; show transcript only.

### 5.9 Plans
- **Data in:** plan catalog (Standard/Plus/Max), monthly/yearly pricing, current plan, trial eligibility, feature lists.
- **Actions:** toggle billing period; select plan → Payment.
- **State logic:** highlight current plan; "Best value" on Plus; Max badged TEAMS.
- **Loading:** skeleton cards while catalog loads.
- **Error:** catalog/store fetch failure → cached catalog + retry.

### 5.10 Payment
- **Data in:** selected plan, order summary (price, trial discount, due-today, renewal date), payment methods (Apple/Google Pay, saved card).
- **Actions:** change plan; choose method; add card (web/Stripe path); "Start free trial."
- **Loading:** processing purchase; disable button.
- **Error:** purchase failed/cancelled → inline message, no charge; "already subscribed" → route to manage; store-verification pending → optimistic + reconcile via webhook.
- **Security copy:** encryption note; never store raw PAN (tokenized via store/Stripe).

### 5.11 Live-night
- **Purpose:** low-light visual variant of Live (same functionality, calmer palette). Same data, actions, permission, and error states as 5.7. Toggle is a presentation preference, not a separate session type.

---

## 6. Data model

Postgres. Conventions: `id` = UUID v7 PK; `created_at`/`updated_at` timestamptz; soft-delete via `deleted_at` where retention matters; money in minor units + currency. pgvector columns for embeddings.

### User
| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| email | citext | unique |
| name | text | display name |
| password_hash | text | null if OAuth-only |
| auth_providers | jsonb | [{provider, subject}] for Apple/Google |
| email_verified_at | timestamptz | |
| locale / default_language | text | |
| avatar_url | text | |
| plan_id | uuid | FK → Plan (current) |
| consent_version_accepted | text | T&C/privacy version |
| created_at / updated_at / deleted_at | timestamptz | |

### AuthSession (refresh/session tracking)
| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | FK |
| refresh_token_hash | text | rotating |
| device / user_agent | text | |
| expires_at, revoked_at | timestamptz | for "sign out all" |

### InterviewConfig
The captured setup; reusable as a template/default.
| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | FK |
| mode | enum | mock \| real \| topic_practice \| capability_assessment \| expert_interview |
| target_role | text | |
| persona | enum | aria \| sam \| lena |
| style | enum | friendly \| balanced \| tough |
| language | text | BCP-47 |
| length_minutes | int | |
| focus_topic | text | nullable |
| job_description_id | uuid | FK → Document, nullable |
| resume_id | uuid | FK → Document, nullable |
| invited_by_org_id | uuid | nullable (real/capability) |
| created_at | timestamptz | |

### Document (JD / resume / uploaded source)
| Field | Type | Notes |
|---|---|---|
| id, user_id | uuid | |
| kind | enum | job_description \| resume |
| storage_key | text | R2 key (or null if text-only) |
| text_extracted | text | parsed content |
| embedding | vector | pgvector |
| status | enum | uploaded \| parsing \| ready \| failed |
| created_at, deleted_at | timestamptz | |

### Session
One interview run.
| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | FK |
| config_id | uuid | FK → InterviewConfig (snapshot at start) |
| mode, persona, style, language, length_minutes | denormalized | snapshot |
| status | enum | scheduled \| provisioning \| live \| ended \| analyzing \| complete \| failed \| canceled |
| livekit_room | text | room name |
| scheduled_for | timestamptz | real/capability |
| started_at, ended_at | timestamptz | |
| end_reason | enum | completed \| user_ended \| timeout \| disconnect \| error |
| recording_enabled | bool | consent-driven |
| recording_storage_key | text | R2, nullable |
| org_id | uuid | nullable (employer-sent) |
| created_at | timestamptz | |

### QuestionPlan
Output of the Planner; the bounded plan the Interviewer works from.
| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| session_id | uuid | FK |
| competencies | jsonb | rubric/competency list targeted |
| questions | jsonb | ordered [{id, text, competency, intent, expected_signals, follow_up_hints, difficulty}] |
| total_questions | int | the "M" in "N of M" |
| version | int | bumped when Reviewer adapts |
| model, prompt_cache_key | text | provenance |
| created_at, updated_at | timestamptz | |

### Turn
One Q/A exchange. Adaptive follow-ups append turns.
| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| session_id | uuid | FK |
| index | int | order in session |
| question_id | text | links to QuestionPlan question (or "followup") |
| question_text | text | as actually asked |
| competency | text | |
| asked_at, answer_started_at, answer_ended_at | timestamptz | for latency/pacing metrics |
| barge_in | bool | did user interrupt |
| reviewer_assessment | jsonb | per-turn score signals + next-question adaptation (from Reviewer) |

### Transcript / TranscriptSegment
| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| session_id | uuid | FK |
| turn_id | uuid | FK, nullable |
| speaker | enum | interviewer \| candidate \| system |
| text | text | |
| start_ms, end_ms | int | media-relative timestamps (alignment to recording) |
| is_final | bool | streaming partial vs final |
| confidence | float | STT confidence |

### Score
Per-competency, evidence-cited. Content/competency-based only.
| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| report_id | uuid | FK |
| competency | text | Communication / Structure / Depth / Confidence / extensible |
| value | int | 0–100 |
| rationale | text | human-readable |
| evidence | jsonb | [{turn_id, transcript_segment_id, quote}] |

### Report
Output of the Analyst.
| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| session_id | uuid | FK, unique |
| overall_score | int | 0–100 |
| tier_label | text | e.g. NEEDS WORK / SOLID / STRONG / EXCEPTIONAL |
| stood_out | text | qualitative |
| work_on | text | qualitative |
| per_question_feedback | jsonb | [{turn_id, feedback, evidence, suggestion}] |
| pdf_storage_key | text | R2, nullable |
| model, generated_at | | provenance |
| status | enum | pending \| partial \| complete \| failed |

### Plan
Catalog.
| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| key | enum | standard \| plus \| max |
| name | text | |
| interviews_per_period | int | 10 / 30 / 300 |
| price_monthly, price_yearly | int | minor units |
| currency | text | |
| features | jsonb | feature list strings |
| store_product_ids | jsonb | Apple/Google product IDs |
| active | bool | |

### Subscription
| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | FK |
| plan_id | uuid | FK |
| billing_period | enum | monthly \| yearly |
| status | enum | trialing \| active \| past_due \| canceled \| expired |
| provider | enum | apple \| google \| stripe |
| provider_subscription_id | text | |
| trial_ends_at, current_period_end | timestamptz | |
| interviews_used_this_period | int | quota counter |
| created_at, updated_at | timestamptz | |

### ConsentRecord
| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | FK |
| session_id | uuid | FK, nullable (account-level vs session-level) |
| scope | enum | terms \| privacy \| mic \| camera \| recording |
| granted | bool | |
| policy_version | text | |
| granted_at, revoked_at | timestamptz | |

### Org / OrgMember (P2, for Max/Teams + employer invites)
Org (id, name, plan), OrgMember (org_id, user_id, role), Invite (org_id, candidate_email, config snapshot, scheduled_for, status).

---

## 7. API surface (REST/RPC)

Base: `/v1`. JSON. Auth via `Authorization: Bearer <access_jwt>` unless noted. **Auth column:** `public` (no token), `user` (authenticated user), `webhook` (signed/secret), `agent` (service token for the Agents worker), `admin/org`.

### Auth
| Method | Path | Purpose | Auth |
|---|---|---|---|
| POST | /auth/signup | Create account (email/pw), record T&C consent | public |
| POST | /auth/login | Email/password login → access + refresh | public |
| POST | /auth/oauth/apple | Apple Sign-In exchange | public |
| POST | /auth/oauth/google | Google Sign-In exchange | public |
| POST | /auth/refresh | Rotate refresh → new access | public (refresh token) |
| POST | /auth/logout | Revoke current session | user |
| POST | /auth/logout-all | Revoke all sessions | user |
| POST | /auth/password/forgot | Send reset email | public |
| POST | /auth/password/reset | Reset with token | public |
| POST | /auth/email/verify | Verify email token | public |

### Account / privacy
| Method | Path | Purpose | Auth |
|---|---|---|---|
| GET | /me | Current user + plan + quota | user |
| PATCH | /me | Update profile/preferences | user |
| POST | /me/export | Request full data export (async) | user |
| DELETE | /me | Delete account + cascade data | user |
| GET | /me/consents | List consent records | user |
| POST | /me/consents | Grant/revoke a consent scope | user |

### Documents (JD / resume)
| Method | Path | Purpose | Auth |
|---|---|---|---|
| POST | /documents | Create doc (text or request upload URL) | user |
| GET | /documents/:id | Status + extracted text | user |
| DELETE | /documents/:id | Delete doc | user |

### Config & sessions
| Method | Path | Purpose | Auth |
|---|---|---|---|
| GET | /config/options | Modes, personas, styles, languages, length options, plan catalog | public |
| POST | /interview-configs | Save a setup config | user |
| GET | /interview-configs/last | Last used config (defaults) | user |
| POST | /sessions | Create session from config; triggers Planner; provisions room | user |
| GET | /sessions | List my sessions (history); filters mode/role/date | user |
| GET | /sessions/:id | Session detail + status | user |
| GET | /sessions/:id/plan | The QuestionPlan (count, current question for UI) | user |
| POST | /sessions/:id/token | Mint a LiveKit room token (scoped, short-lived) | user |
| POST | /sessions/:id/start | Mark live / signal agent to join | user |
| POST | /sessions/:id/end | End session (user-ended); enqueue analysis | user |
| DELETE | /sessions/:id | Delete a session + recording/transcript | user |
| GET | /sessions/:id/transcript | Full transcript (final segments) | user |
| GET | /sessions/:id/recording | Pre-signed R2 playback URL (if recorded) | user |

### Reports & history
| Method | Path | Purpose | Auth |
|---|---|---|---|
| GET | /sessions/:id/report | Report (scores, feedback); status pending/partial/complete | user |
| POST | /sessions/:id/report/regenerate | Re-run analysis | user |
| GET | /sessions/:id/report/pdf | Pre-signed PDF export URL | user |
| GET | /reports/trends | Aggregate per-competency trends over history | user |

### Plans & billing
| Method | Path | Purpose | Auth |
|---|---|---|---|
| GET | /plans | Plan catalog (prices, features, store IDs) | public |
| GET | /me/subscription | Current subscription + quota | user |
| POST | /billing/iap/verify | Verify Apple/Google purchase receipt → activate | user |
| POST | /billing/checkout | Stripe checkout session (web/Max) | user |
| POST | /billing/portal | Stripe billing portal link | user |
| POST | /billing/cancel | Cancel/schedule cancel | user |

### Agent / internal (service-to-service)
| Method | Path | Purpose | Auth |
|---|---|---|---|
| POST | /agent/sessions/:id/turns | Append a Turn (interviewer asked) | agent |
| POST | /agent/sessions/:id/transcript | Stream/append transcript segments | agent |
| POST | /agent/sessions/:id/reviewer | Persist per-turn Reviewer assessment + plan adaptation | agent |
| POST | /agent/sessions/:id/plan/version | Bump plan version after adaptation | agent |
| GET | /agent/sessions/:id/context | Plan + config + rubric + cached prompt keys for the worker | agent |

### Webhooks (inbound)
| Method | Path | Purpose | Auth |
|---|---|---|---|
| POST | /webhooks/livekit | Room/participant/egress events (recording done, room finished) | webhook (signed) |
| POST | /webhooks/apple | App Store Server Notifications (renewals, refunds) | webhook |
| POST | /webhooks/google | Google Play RTDN | webhook |
| POST | /webhooks/stripe | Stripe events | webhook |

### Realtime (not REST)
- LiveKit data channel: agent → client publishes `agent_state` (idle/listening/thinking/speaking), `caption` (partial/final), `current_question` (id, index, total), `feedback_chip`, `degraded_mode`, `wrap_up`. Client → agent: control intents are largely implicit (mute/track toggles via LiveKit), plus a `text_answer` channel for the text-fallback path.

---

## 8. Multi-agent interview brain

Four agents; the live ones share the QuestionPlan and rubric (prompt-cached).

1. **Interview Question Planner** (Opus 4.8, pre-session). Inputs: InterviewConfig (mode, role, persona, style, language, length), focus topic, JD + resume (embedded), competency rubric. Output: `QuestionPlan` — ordered questions tagged by competency, intent, expected signals, follow-up hints, difficulty, sized to `length_minutes`. Specialized system prompts per **mode**, per **persona role**, and per **topic focus**.
2. **Interviewer** (Sonnet, in-session, latency-critical). The live voice persona. Asks the current question, handles transitions/acknowledgements, generates natural follow-ups within plan bounds, manages wrap-up. Drives orb state + captions. Barge-in aware. Stays in persona/style.
3. **Response Reviewer** (Opus 4.8, in-session, near-real-time). After each answer, scores signals for the targeted competency, decides whether to probe deeper or advance, and updates the plan (bumps `version`). Feeds the Interviewer's next move. Provides material for the lightweight feedback chips. Content-based only.
4. **Analyst** (Opus 4.8, post-session, async). Consumes full transcript + Turns + Reviewer assessments. Produces the `Report`: per-competency `Score`s with rationale and **evidence citations** to transcript segments, overall score + tier, stood-out / work-on, per-question feedback with suggestions, and a PDF. Strictly competency/content-based; no affect inference.

Cross-cutting: a lightweight **safety/turn-taking** check (Haiku) for endpointing edge cases and to keep content on-topic and respectful.

---

## 9. Results scorecard (refined)

- **Competencies (extensible set):** Communication, Structure, Depth of answers, Confidence. The competency list is data-driven (`QuestionPlan.competencies`) so modes can add domain competencies (e.g. technical depth for engineering roles) without schema change.
- **"Confidence" is content/delivery-based, not affect-based:** measured from verbal markers (clarity, directness, ownership language, specificity), explicitly **not** from facial expression, tone-of-emotion, or voice affect.
- Each score: 0–100, `rationale`, and `evidence[]` quoting transcript spans (turn + segment).
- Overall score + tier label; "stood out" / "work on"; per-question feedback with a concrete suggestion.
- Full transcript; optional recording playback aligned via `start_ms/end_ms`.
- **Guardrail:** if there is insufficient content to evidence a score, the Analyst returns "not enough to score" rather than fabricating numbers.

---

## 10. Live voice / latency requirements

- **Target:** ≤ ~1.5 s from end-of-user-speech to first interviewer audio (P50); P95 ≤ 2.5 s. Tracked per turn.
- **Full-duplex + barge-in:** user speech during TTS immediately ducks/stops interviewer audio; `barge_in` flagged on the Turn.
- **VAD/endpointing:** Silero VAD + LiveKit turn detector; tuned to avoid cutting off thinking pauses (don't endpoint on short silences mid-answer).
- **Pipelining:** stream STT → start LLM on partials where safe → stream TTS first audio chunk ASAP. Prompt caching on system+rubric+plan to cut LLM TTFT.
- **Degradation ladder:** (1) full A/V → (2) audio-only (drop video) → (3) lower TTS bitrate / fallback TTS provider → (4) text fallback (read questions + type answers). Each transition is surfaced via `degraded_mode`.
- **Reconnect/resume:** disconnects within a grace window rejoin the same room/session; timer and plan state preserved; transcript continues.
- **Recording:** LiveKit egress → R2; webhook marks `recording_storage_key`. Only if recording consent granted.

---

## 11. Non-goals

- Not an automated **hiring decision** system; viva does not pass/fail candidates for employers or rank applicants for a hiring outcome.
- **No affect/emotion/appearance/demographic inference** for scoring — ever.
- No social/feed, messaging, or community features.
- No live human interviewers or human coaching marketplace (MVP).
- No résumé builder / job board / application tracking.
- No desktop/web *app* for candidates in MVP (web is marketing + Stripe/Teams admin only).
- No offline interview mode (requires realtime network).
- No proctoring/anti-cheating surveillance.
- No fine-tuned/self-hosted models in MVP (managed Claude + managed STT/TTS).

---

## 12. Success metrics / KPIs

**Activation & engagement**
- Signup → first completed interview rate (target ≥ 50%).
- Median interviews per active user per month.
- D7 / D30 retention.

**Voice quality (the core bet)**
- P50/P95 end-of-speech → first-audio latency (P50 ≤ 1.5 s).
- Barge-in responsiveness (time to interviewer-stop ≤ 300 ms).
- Session completion rate (started → ended without error ≥ 90%).
- Disconnect/reconnect success rate (≥ 95% resume).
- "Felt natural" post-session rating (thumbs/CSAT ≥ 4/5).

**Value / outcome**
- Report generation success rate (≥ 99%).
- Report view rate and "practice again" rate.
- Self-reported confidence lift (pre/post survey).
- Score-trend improvement across repeated sessions.

**Business**
- Trial start rate; trial → paid conversion; churn; ARPU.
- Quota-cap hit rate → upgrade conversion.

**Reliability/cost**
- Latency SLO error budget burn.
- LLM/STT/TTS cost per interview minute (with prompt-cache hit rate ≥ target).

---

## 13. Privacy & consent requirements

1. **Granular, explicit consent** for mic, camera, and recording — collected before the room connects and stored as `ConsentRecord` with `policy_version` and timestamp.
2. **Audio-only and no-recording paths** are first-class: declining camera → audio-only; declining recording → nothing stored to R2, transcript-only (and transcript storage itself is disclosed).
3. **Withdraw consent mid-session** (P1): stops recording immediately; user chooses to continue (no recording) or end.
4. **No affect-based scoring** — enforced in Analyst/Reviewer prompts and stated in UI copy + privacy policy. Scores cite content evidence only.
5. **Data export** (`POST /me/export`) — machine-readable bundle of profile, sessions, transcripts, reports.
6. **Deletion** — per-session delete (recording + transcript + report) and full-account delete with cascade; deletions propagate to R2 objects and are honored via background jobs.
7. **Retention controls** (P1) — user-configurable recording retention (e.g., 7/30/90 days or off); default conservative; auto-deletion job enforces it.
8. **Storage security** — recordings/PDFs only via pre-signed, expiring URLs; no public buckets; encryption at rest (R2) and in transit.
9. **Minimization** — JD/resume used to tailor the session and embeddings; deletable; not shared across users.
10. **Minors / age** — practice app for a younger audience; require an age gate consistent with App Store / COPPA-equivalent rules and platform policy (e.g., 13+ / 16+ per region), recorded at signup.
11. **Transparency copy** — plain-language explanation (non-technical audience) of what's recorded, why, how scored (content not emotion), and how to delete — surfaced at the consent gate, not buried in legal text.

---

## 14. Open questions / decisions to confirm
- Apple IAP vs Stripe split for mobile vs Teams — confirm store-policy boundaries and reconciliation approach.
- Exact competency set per mode (engineering/PM/design rubrics) — owned by domain experts authoring Planner prompts.
- Retention defaults and regional age gate thresholds — legal review.
- TTS provider primary/fallback final selection and per-persona voice IDs — voice QA.
- Whether real/capability invites require an Org entity in MVP or a lightweight invite token.
