# 00 · Original Brief (captured verbatim) + Original Design

> This file records the starting point exactly as given, before any refinement.
> The refined, engineering-grade requirements live in
> [`10-refined-spec.md`](./10-refined-spec.md).

## A. The original product design ("viva", art direction *Atelier*)

A consumer iOS-first AI **video interview** app. Warm, fashion-forward, friendly for
a younger, non-technical audience. Palette: bone paper `#F4EFE4`, plum ink `#2E2142`,
electric persimmon `#FF5836`, sand `#E7C8A0`. Type: Bricolage Grotesque (display) +
Hanken Grotesk (text). 11 screens already designed and implemented in two layers:

- **`app/`** — faithful static web implementation (gallery + click-through prototype).
- **`mobile/`** — Expo / React Native app (SDK 56) of all 11 screens.

Screens & flow: Welcome → Sign in / Create account → Home (greeting, "up next"
real interview, 2×2 practice grid, tab bar) → Choose a mode → Set up → **Live
interview** (animated orb, voice bars, transcript/feedback, call controls) →
Results (score ring, metric bars, strengths/work-on). Plus Plans & Payment, and a
"deep night" Live variant.

Interview **modes**: Mock interview, Real interview (employer-scheduled),
Topic practice, Capability assessment, Expert interview.
Interviewer **personas**: Aria (hiring manager), Sam (peer), Lena (director).
Interviewer **styles**: Friendly, Balanced, Tough.
Set-up **preferences**: role, style, interviewer, language, length.
Results **scorecard**: Communication, Structure, Depth of answers, Confidence,
plus "stood out" / "work on" qualitative notes.

## B. The user's prompt (verbatim)

> yes, go ahead and create the entire backend and full frontend features, insure
> full-stack and end-to-end works. Make sure to have the architect review your
> design, and the UI designer again to review the UI and user experiences. I also
> want the product designer to review the functionalities of end-to-end steps. You
> need to make sure to come up with a detailed product task plan so that the
> end-to-end flow will work. And also, you need to have a backend expert and
> LiveKit full-duplex VoE experts to build the backend for the live audio and video
> interviews, and ensure the stack works. The LiveKit API information is in the .env
> file.
>
> For each type of interview, each role of the interviewer, and each focus of the
> interview topics, you need to have the specialized expert in that particular area
> to help develop the comprehensive and deep professional system prompts.
>
> You also need to ensure that all the user preferences and user inputs are captured
> to create the user prompts. And then have the prompt engineering experts help
> develop and design the prompting techniques. Maybe you should have multiple agents
> to conduct the interviews. For example, you may have one to create interview
> questions (call it an interview question planner), one to conduct the questions,
> and one to review the response from the user and tweak the next questions.
>
> In the end, you should have an expert in analyzing and assessing users' interview
> transcript and create a comprehensive report for interview analysis and insights
> for the interview performance.
>
> Write down the original design and my prompt, and then give it deep thinking and
> come up with new and more robust prompts, and then create a spec and a design and
> the architecture for a smooth voice interaction between the interviewer and the
> user. And the experience of full duplex and VAD needs to be very smooth.
>
> Have the test team to create the test cases and run tests in the end, fix the
> bugs, run test, add more tests, until it is bug-free and complete. Each step
> should have the product design review and provide a satisfactory score. Do not
> stop until the score is over 90%. The UI design also need to review and the
> product owner should be satisfied with the audio interactive experiences.
>
> launch a team of product design and development, with 12 or more workflows and
> multiple agents that maximize the power of tokens to create a robust app.

## C. Explicit requirements extracted from the brief

1. **Full-stack, end-to-end working**: real backend + full frontend features, wired together.
2. **Reviews with gates**: architect (design), UI designer (UI/UX), product designer
   (end-to-end functionality), product owner (audio experience). Score every step;
   **do not stop until > 90%**.
3. **Detailed product task plan** for the E2E flow.
4. **Live audio + video** via **LiveKit**, full-duplex, **VAD** — smooth voice interaction.
5. **Specialized system prompts** per interview *type*, per interviewer *role*, per
   topic *focus* — authored by domain experts.
6. **Capture all user preferences/inputs** → compose the user prompts.
7. **Prompt-engineering** technique design; **multi-agent** interview brain:
   - *Interview Question Planner* — designs the question plan.
   - *Interviewer* — conducts/asks the questions (the live voice persona).
   - *Response Reviewer* — evaluates each answer and tweaks the next questions.
8. **Transcript analysis expert** → comprehensive interview analysis + insights report.
9. **Refined prompts/spec/design/architecture** for smooth full-duplex + VAD voice.
10. **Test team**: write tests, run, fix, add, repeat until bug-free & complete.
11. **Orchestration**: ≥ 12 workflows, many agents, maximize tokens, build a robust app.
