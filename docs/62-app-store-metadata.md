# 62 · viva — App Store Connect Submission Metadata

> **Purpose.** Everything needed to fill in the App Store Connect listing for viva, plus the
> **privacy nutrition label** mapping, **age rating** guidance, **screenshot** requirements,
> and **App Review notes** that explain the microphone/camera usage so the build passes review.
>
> **Status.** This is a ready-to-edit draft. Items in **`[OWNER]`** require the product owner /
> account holder to decide or supply (see [`60-launch-readiness.md`](./60-launch-readiness.md),
> blocker **B-APPLE**). The privacy-label mapping must match the final, lawyer-reviewed privacy
> policy ([`61-privacy-policy-DRAFT.md`](./61-privacy-policy-DRAFT.md)).
>
> **Truthfulness rule.** Do not list a capability the app doesn't have. Notably: the build
> records **audio always** during an interview, **video only with explicit consent** (off by
> default), and currently sells **no subscription** (Plans/Payment are not yet functional). Do
> not market subscriptions or features that aren't shipping in the submitted build.

---

## 1. App information

| Field | Value |
|---|---|
| **App name** (30 char max) | `viva — AI Interview Practice` *(verify ≤30 chars incl. spaces; trim to `viva: Interview Practice` if needed)* |
| **Subtitle** (30 char max) | `Practice interviews out loud` |
| **Bundle ID** | `[OWNER]` |
| **SKU** | `[OWNER]` |
| **Primary category** | Education |
| **Secondary category** | Business |
| **Primary language** | English (U.S.) |
| **Support URL** | `[OWNER — public support page]` |
| **Marketing URL** (optional) | `[OWNER]` |
| **Privacy Policy URL** | `[OWNER — public URL of the finalized policy; required]` |

---

## 2. Promotional text (170 char max — updatable without a new build)

> Talk through real interview questions with an AI interviewer that listens, adapts, and gives
> you a clear, evidence-based report on what you said.

---

## 3. Description

> **Practice interviews by actually speaking — not typing.**
>
> viva is a voice-first interview coach. Pick a role and an interviewer style, then have a real
> spoken conversation with an AI interviewer that listens to your answers, asks natural
> follow-ups, and adapts as you go. When you're done, you get a clear, written report.
>
> **What makes viva different**
> - **You talk, it listens.** A natural, full-duplex voice conversation — interrupt, think out
>   loud, answer at your own pace.
> - **Choose your interviewer.** Different personas and styles, from friendly to tough.
> - **Evidence-based feedback.** Every point in your report is tied to something you actually
>   said — quoted back to you. No vague vibes.
> - **Content, never "vibes."** viva scores what you say — communication, structure, depth,
>   clarity — and never judges your tone, accent, or appearance.
> - **Practice modes** for mock interviews, focused topic drills, and structured capability
>   practice.
> - **Your data, your control.** Camera and recording are off by default; you choose what's
>   captured before every session.
>
> Get specific, actionable feedback you can use before the interview that matters.

*(`[OWNER]` — adjust claims to exactly match the submitted build. Remove any line describing a
mode or feature not enabled in that build.)*

---

## 4. Keywords (100 char max, comma-separated, no spaces after commas)

```
interview,practice,mock interview,job,career,coaching,speaking,AI,prep,communication,behavioral
```
*(Verify total length ≤100 chars; drop the lowest-value terms first. Don't repeat words already
in the app name/subtitle — Apple already indexes those.)*

---

## 5. Privacy "nutrition label" (App Privacy section)

Apple requires you to declare, per data type, whether it is **collected**, whether it's
**linked to the user's identity**, and whether it's used for **tracking**. viva does **no
tracking** and **no third-party advertising**. The mapping below reflects the current build;
**legal must confirm** it against the final policy before submission.

> **Definition reminder:** "linked to identity" = associated with the user's account. viva
> stores interviews under the user's account, so most items are **linked**. "Tracking" =
> linking across other companies' apps/sites for ads — viva does **none**.

| Data type (Apple category) | Collected? | Linked to identity? | Used for tracking? | Purpose / notes |
|---|---|---|---|---|
| **Contact Info → Email address** | Yes | Yes | No | Account creation / sign-in (App Functionality) |
| **User Content → Audio data** | Yes | Yes | No | The spoken interview (App Functionality). Sent to STT/LLM/TTS processors to run the session. |
| **User Content → Photos or Videos** | Yes (only if user enables camera + recording) | Yes | No | Optional video recording, off by default (App Functionality) |
| **User Content → Other user content** (transcripts, résumé/JD text the user pastes) | Yes | Yes | No | Generating the interview and report (App Functionality) |
| **Usage Data / Diagnostics** | `[OWNER — only if analytics/crash reporting is added; none in current build]` | — | No | — |
| **Purchases** | `[OWNER — Yes once IAP ships]` | Yes | No | Subscription management (App Functionality) |
| **Identifiers** | No `[confirm — no device/advertising IDs in current build]` | — | No | — |

**Third-party data sharing to declare:** audio/transcript content is shared with **LiveKit,
Deepgram, Cartesia, and Anthropic** as **service providers** to deliver the app's core
function (not for their own advertising). `[OWNER/legal — confirm each processor's data-use
terms; if any processor uses data for its own purposes, the label must reflect that.]`

---

## 6. Age rating

Answer Apple's content questionnaire truthfully. viva contains no violence, sexual content,
gambling, or mature themes. The relevant considerations:

- **User-generated / unrestricted content:** the AI interviewer's questions and your spoken
  answers are dynamically generated, so treat the experience as containing some user-generated
  content — answer the "unrestricted web access / user-generated content" prompts accordingly.
- **Suggested rating:** **`[OWNER — likely 17+]`**. The minimum age you choose **must match**
  the minimum age stated in the privacy policy (§7 of `61-privacy-policy-DRAFT.md`). Because
  the app captures voice (and optional video) and uses AI-generated dialog, a conservative
  17+ is the safe default unless legal advises otherwise.

---

## 7. Required screenshots

App Store Connect requires screenshots for the iPhone display sizes Apple currently mandates.
Provide a set for **6.7"/6.9" (e.g. iPhone 15/16 Pro Max)** and **6.5"** — Apple can scale
these to smaller devices, but supply 5.5" if you still target it. Prepare **3–10 per size**;
the first 1–3 are what most users see.

Recommended shot list (use the existing *Atelier* screens):
1. **Home / mode picker** — "Choose how you want to practice."
2. **Setup** — role, persona, style selection ("Make it yours.").
3. **Consent gate** — emphasize "Camera & recording are off by default."
4. **Live interview (orb + captions)** — the speaking orb with live captions ("Talk it
   through, out loud.").
5. **Results — score ring + competency bars** ("Clear, structured feedback.").
6. **Results — per-question feedback with an evidence quote** ("Every point, tied to what you
   said.").
7. *(Optional)* **History** — past interviews.

> Notes: do not show fake/placeholder data that misrepresents the product, and don't show a
> functional paywall/subscription if subscriptions aren't enabled in the submitted build. An
> **App Preview video** is optional but strong for a voice product. Add localized text overlays
> if you localize later.

---

## 8. App Review notes (the most important part for first approval)

Paste into "Notes for Review." This pre-empts the two most likely rejection paths for a
voice/recording app: (a) unclear mic/camera purpose, and (b) reviewer unable to reach core
functionality.

> **What viva does:** viva is a voice-first interview practice app. The user has a spoken
> conversation with an AI interviewer and receives a written feedback report.
>
> **Microphone — why it's required:** The core feature is a live spoken interview. The
> microphone is used to capture the user's spoken answers, which are transcribed (Deepgram) and
> used to generate the AI interviewer's follow-up questions and the feedback report. Without the
> microphone there is no interview. The permission is requested at the consent screen
> immediately before a session, with a plain-language explanation. A text-only fallback is
> available if the user declines the mic.
>
> **Camera — optional and off by default:** The camera is **not required**. It is only used if
> the user explicitly turns on the "Camera" and "Recording" toggles on the consent screen
> (both default OFF). Audio-only is the default experience.
>
> **Recording — explicit, revocable consent:** Recording is off by default; the user opts in
> per session on the consent screen and can stop recording mid-session.
>
> **How to test (`[OWNER]` to confirm before submission):** `[OWNER — provide a demo account
> (email) and any steps. If the production auth provider isn't live yet, supply working test
> credentials. The reviewer must be able to: sign in → choose a mode → complete setup → grant
> mic on the consent screen → run a short interview → reach the results report.]` A live
> interview requires network access to our backend and to LiveKit/Deepgram/Cartesia/Anthropic;
> please ensure the test device has connectivity.
>
> **Privacy:** Camera/recording are opt-in and off by default; audio and transcripts are
> processed by named service providers solely to run the session; our privacy policy is at
> `[OWNER — URL]`.
>
> **Subscriptions:** `[OWNER — if IAP is enabled in this build, list the products and note that
> they're standard auto-renewable subscriptions sold via Apple In-App Purchase. If not enabled,
> state that no purchases are available in this build.]`

---

## 9. Required `Info.plist` usage strings (must be present in the build)

App Review rejects builds whose permission prompts lack a clear, specific reason. Ensure the
Expo config (`app.json`/`app.config`) sets:

- **`NSMicrophoneUsageDescription`** — e.g. *"viva uses your microphone so you can speak your
  answers during a practice interview."*
- **`NSCameraUsageDescription`** — e.g. *"viva uses your camera only if you turn on video for a
  practice interview. It's off by default."*

`[OWNER/eng — confirm these strings are set in the Expo app config and match the consent UI
copy.]`

---

## 10. Pre-submission checklist

- [ ] App name/subtitle within character limits; keywords ≤100 chars.
- [ ] Privacy Policy URL is live and matches the finalized, legal-reviewed policy.
- [ ] Privacy nutrition label matches the policy and the actual build (audio always; video opt-in).
- [ ] Age rating set and consistent with the policy's minimum age.
- [ ] Screenshots for all required sizes; no misleading/placeholder content; no fake paywall.
- [ ] `NSMicrophoneUsageDescription` / `NSCameraUsageDescription` present and clear.
- [ ] App Review notes include working test credentials and the exact path to a completed interview.
- [ ] If subscriptions ship: products configured, banking/tax complete, IAP via StoreKit (not Stripe).
