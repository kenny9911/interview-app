> # ⚠️ DRAFT — requires legal review before publishing
>
> This document was drafted by the engineering team to describe, accurately and in plain
> language, how viva handles personal data **as currently built**. It is **not legal advice**
> and is **not fit to publish as-is**. A qualified privacy lawyer must review and finalize it
> (GDPR, UK GDPR, CCPA/CPRA, COPPA, App Store requirements, and the laws of every market you
> launch in). All **`[PLACEHOLDER]`** values must be filled in by the owner. The user rights
> described below (data export, account deletion) **are implemented as real endpoints** in code
> (`POST /v1/data/export`, `POST /v1/data/delete`) and wired into the app — see
> [`60-launch-readiness.md`](./60-launch-readiness.md) blocker **B-COMPLIANCE**. What remains is
> setting a concrete **retention period** and building the **auto-delete job** that enforces it
> (§5) before this is published.

# viva — Privacy Policy (DRAFT)

**Effective date:** `[PLACEHOLDER — date]`
**Provider:** `[PLACEHOLDER — legal entity name, address]` ("viva", "we", "us")
**Contact:** `[PLACEHOLDER — privacy@yourdomain.com]`

viva is an AI-powered practice-interview app. You speak with an AI interviewer, and we produce
a written report on the **content** of your answers. This policy explains what we collect, why,
who we share it with, how long we keep it, and the choices you have.

---

## 1. A note on how viva scores you (and what it does NOT do)

viva scores the **content** of what you say — your communication, structure, depth, and the
clarity/conviction of your reasoning. viva **does not** infer or score emotion, sentiment,
mood, personality, or any protected characteristic, and it **does not** judge your tone,
accent, appearance, or delivery. Every score is tied to a **verbatim quote** from your own
transcript. (This is enforced in our software, not just promised: scoring output is checked so
that cited evidence must actually appear in your transcript, and affect/identity language is
filtered out.)

---

## 2. Data we collect

We collect only what we need to run a practice interview and return your report.

**You give us / we capture during use:**
- **Account email and password** — to create and identify your account and sign you in. Your
  password is stored only as a salted **scrypt** hash, never in plain text. *(Sign in with
  Apple/Google is not yet offered; if it is added later, update this section.)*
- **Interview setup preferences** — role/title, interviewer persona and style, language,
  length, optional topic focus, and any **job description** or **résumé text** you choose to
  paste in to tailor the interview.
- **Audio** of your spoken answers (always, during a live interview — it is how the interview
  works).
- **Video** of you — **only if** you explicitly turn on the camera and recording toggles in
  the consent screen. Camera and recording are **off by default**; audio-only is the default,
  and a text-only fallback is available.

**We generate:**
- **Transcripts** — a text record of your answers and the interviewer's questions.
- **Scores and reports** — competency scores, "stood out" / "work on" notes, per-question
  feedback, and supporting evidence quotes.

**Automatically:**
- Basic technical/operational data needed to run the service (e.g. session identifiers, error
  logs). `[PLACEHOLDER — confirm with legal/eng whether any analytics, crash reporting, or
  device identifiers are collected; none are wired in the current build.]`

We **do not** intentionally collect special-category/sensitive data, and we ask you not to
disclose it in your answers, résumé, or job description.

---

## 3. Third-party processors (sub-processors)

To run a live interview, your audio and the text derived from it are processed by the
following service providers, strictly to provide the service:

| Processor | What it processes | Purpose |
|---|---|---|
| **LiveKit** | Real-time audio/video stream during the live interview | Carries the call between you and the AI interviewer (media transport) |
| **Deepgram** | Audio of your speech | Speech-to-text (transcription) |
| **Cartesia** | Interview text | Text-to-speech (the interviewer's voice). *(An alternate TTS provider, ElevenLabs, may be used as a fallback; update this list if enabled.)* |
| **Anthropic (Claude)** | Interview transcript and setup context (incl. any JD/résumé text you provide) | Generating the interviewer's questions and your evidence-based report |
| **`[PLACEHOLDER]` hosting / database** | Account email, transcripts, scores, reports | Storing your data and running the API |
| **`[PLACEHOLDER]` object storage (if recordings enabled)** | Audio/video recordings | Storing recordings you consented to |
| **`[PLACEHOLDER]` auth provider** | Account email / sign-in | Authentication |
| **`[PLACEHOLDER]` payments (Apple In-App Purchase / RevenueCat)** | Purchase/entitlement data (not your card details — Apple handles those) | Subscriptions |

`[PLACEHOLDER — legal to confirm each processor's location, data-transfer mechanism (SCCs,
etc.), and that a Data Processing Agreement is in place with each. Some processors may use data
for their own model training unless a no-training/zero-retention term is contracted — legal
must verify each one.]`

We do **not** sell your personal data, and we do **not** share it for advertising.

---

## 4. How we use your data

- To run your interview (transport, transcribe, generate questions, synthesize the voice).
- To produce and store your report and interview history so you can revisit it.
- To operate, secure, and debug the service.
- To process subscriptions, if you purchase one.

We do **not** use your interviews to advertise to you or to build profiles beyond the practice
report you asked for.

---

## 5. Retention

`[PLACEHOLDER — legal/owner must set concrete retention periods.]` Our current intent:
- **Audio/video recordings** (when you enable them): retained for `[PLACEHOLDER]` then
  auto-deleted.
- **Transcripts, scores, reports**: retained for `[PLACEHOLDER]` or until you delete your
  account.
- **Account email**: retained while your account is active.

> **Implementation note (remove before publishing):** an automatic retention/auto-delete job
> is **not yet built**. The policy's retention promises must match what the system actually
> enforces before this is published.

---

## 6. Your rights and choices

Depending on where you live, you may have rights to access, correct, export, delete, and
restrict processing of your data, and to withdraw consent.

- **Consent controls:** Before every interview you choose whether to enable the microphone
  (required to talk), camera, and recording. You can decline camera/recording and still
  practice (audio- or text-only).
- **Export your data:** From **Data & privacy** in the app you can export a copy of your
  account, interviews, transcripts, and reports (the export never includes your password hash).
- **Delete your data:** From **Data & privacy** in the app you can permanently delete your
  account and every interview, transcript, and report tied to it. This cannot be undone.
- **Withdraw consent / stop recording:** You can stop recording during a session and withdraw
  recording consent.

To exercise any right, contact `[PLACEHOLDER — privacy@yourdomain.com]`. We will respond within
`[PLACEHOLDER — e.g. 30 days]`.

> **Implementation note (remove before publishing):** in the current build, the in-app
> "Export my data" and "Delete all my data" buttons call **real backend endpoints**
> (`POST /v1/data/export`, `POST /v1/data/delete`); export bundles your account, configs,
> interviews, transcripts, and reports, and delete purges the account and all of its data.
> What still must be settled before publishing is the **retention period** and the
> **auto-delete job** that enforces it (§5), plus purging any audio/video **recordings** from
> object storage once that storage exists. See `60-launch-readiness.md` blocker B-COMPLIANCE.

---

## 7. Children's data

viva is **not directed to children** and is intended for users **`[PLACEHOLDER — e.g. 17+ /
18+]`**. We do not knowingly collect personal data from children under the age that applies in
your jurisdiction (e.g. 13 under COPPA, 16 under GDPR in some EU states). If you believe a
child has provided us data, contact us at `[PLACEHOLDER]` and we will delete it. `[PLACEHOLDER —
legal to set the minimum age and align it with the App Store age rating in
62-app-store-metadata.md.]`

---

## 8. Security

- The app never holds vendor secrets; it talks only to our API, which holds keys server-side.
- Live media travels over encrypted WebRTC (DTLS/SRTP) via LiveKit; API traffic is over HTTPS.
- Access tokens are short-lived and scoped to your own session; our API enforces that you can
  only read your own interviews and reports.
- The production server **refuses to start** on insecure default secrets.
- `[PLACEHOLDER — legal/eng to describe encryption at rest, access controls, and breach
  notification commitments for the production database and object storage.]`

No system is perfectly secure, and we cannot guarantee absolute security.

---

## 9. International transfers

Your data may be processed in countries other than yours (e.g. by the processors in §3).
`[PLACEHOLDER — legal to specify transfer mechanisms (e.g. Standard Contractual Clauses) and
processing locations.]`

---

## 10. Changes to this policy

We may update this policy; we will post the new version with a revised effective date and, for
material changes, notify you in-app or by email.

---

## 11. Contact

Questions or requests: `[PLACEHOLDER — privacy@yourdomain.com]`
Data controller: `[PLACEHOLDER — legal entity, address]`
`[PLACEHOLDER — EU/UK representative or DPO, if required.]`

---

### Appendix — drafting checklist for legal review (delete before publishing)
- [ ] Fill every `[PLACEHOLDER]`.
- [ ] Confirm each §3 processor, its location, transfer mechanism, signed DPA, and
      **no-training / retention** terms.
- [ ] Set concrete retention periods in §5 **and** ensure the system enforces them (auto-delete job).
- [x] Export/delete implemented as real endpoints and wired into the app (§6 / B-COMPLIANCE). *Remaining:* purge recordings from object storage once it exists.
- [ ] Set minimum age (§7) and align with the App Store age rating.
- [ ] Add a Terms of Service and link it.
- [ ] Host the final policy at a public URL and add that URL to App Store Connect and the app.
