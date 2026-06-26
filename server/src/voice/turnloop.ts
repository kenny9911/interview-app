// Live interview turn-loop state machine — the heart of the smooth voice UX.
// Pure orchestration: the agent worker calls these methods in response to
// LiveKit/VAD/STT events; this returns Actions (speak / listen / cancel TTS /
// run reviewer / end) and the current orb state. No LiveKit or audio deps here
// so the whole conversational flow is unit-testable.
// (docs/30-voice-architecture.md; docs/15-decisions.md D2/D6/D7.)
import type { InterviewConfig, InterviewState, Turn, ReviewerResult } from '../domain.js';
import type { LlmClient } from '../llm/index.js';
import { interviewerTurn, applyControl, reconcilePatch, applyPatch } from '../agents.js';

export type OrbState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'interrupted';

export type Action =
  | { type: 'speak'; text: string } // synthesize + play (orb → speaking)
  | { type: 'listen' } // open the mic / arm the endpointer (orb → listening)
  | { type: 'cancel_tts' } // barge-in: stop synthesis + flush playout (D6)
  | { type: 'review'; turn: Turn } // kick the async Response Reviewer (off speech path)
  | { type: 'end' }; // interview complete → trigger analysis

export interface TurnLoopDeps {
  llm: LlmClient;
  config: InterviewConfig;
}

export class TurnLoop {
  private orb: OrbState = 'idle';
  private lastQuestionId: string;
  private lastSpokenText = ''; // the line the Interviewer actually spoke last (transcript fidelity)
  private wrapping = false;
  readonly state: InterviewState;

  constructor(private deps: TurnLoopDeps, state: InterviewState) {
    this.state = state;
    this.lastQuestionId = state.plan.questions[0]?.id ?? 'q0';
  }

  orbState(): OrbState { return this.orb; }

  /** Start the interview: greet + ask the first question. */
  async begin(): Promise<Action[]> {
    this.orb = 'thinking';
    const { spokenText } = await interviewerTurn(this.deps.llm, this.deps.config, this.state, null);
    this.state.phase = 'in_progress';
    this.lastQuestionId = this.state.plan.questions[this.state.cursorIndex]?.id ?? this.lastQuestionId;
    this.lastSpokenText = spokenText;
    this.orb = 'speaking';
    return [{ type: 'speak', text: spokenText }];
  }

  /** TTS finished playing → either listen for the answer or end if wrapping. */
  onTtsFinished(): Action[] {
    if (this.wrapping) {
      this.orb = 'idle';
      this.state.phase = 'complete';
      return [{ type: 'end' }];
    }
    this.orb = 'listening';
    return [{ type: 'listen' }];
  }

  /** User started speaking while the agent was talking → barge-in (D6). */
  onUserBargeIn(): Action[] {
    if (this.orb !== 'speaking') return [];
    this.orb = 'interrupted';
    // cancel LLM is handled by the caller aborting the stream; here we stop TTS
    const actions: Action[] = [{ type: 'cancel_tts' }];
    this.orb = 'listening';
    actions.push({ type: 'listen' });
    return actions;
  }

  /**
   * The endpointer committed the user's FINAL answer (D5). Record the turn,
   * kick the async reviewer, advance the brain, and speak the next line.
   */
  async onUserEndpoint(finalText: string): Promise<Action[]> {
    // 1) record the answered turn against the question that was actually asked
    const turn: Turn = {
      questionId: this.lastQuestionId,
      index: this.state.turns.length,
      interviewerText: this.lastSpokenText || this.currentQuestionText(),
      candidateText: finalText,
      answeredAt: new Date().toISOString(),
    };
    this.state.turns.push(turn);
    this.state.version += 1;

    const actions: Action[] = [{ type: 'review', turn }]; // async, off speech path

    // 2) think → generate the next interviewer line
    this.orb = 'thinking';
    const { spokenText, control } = await interviewerTurn(this.deps.llm, this.deps.config, this.state, finalText);

    // 3) apply the control token to advance the cursor (D2)
    const nextCursor = applyControl(this.state, control.action);
    this.state.cursorIndex = nextCursor;
    if (control.action !== 'dig') {
      this.lastQuestionId = this.state.plan.questions[nextCursor]?.id ?? this.lastQuestionId;
    }

    // 4) decide whether this is the wrap-up line
    const exhausted = nextCursor >= this.state.plan.questions.length;
    if (control.action === 'wrap' || exhausted) {
      this.wrapping = true;
      this.state.phase = 'wrapping';
    }

    this.lastSpokenText = spokenText;
    this.orb = 'speaking';
    actions.push({ type: 'speak', text: spokenText });
    return actions;
  }

  /**
   * Feed an async ReviewerResult back into the plan (D2). The worker calls this
   * after handling the 'review' Action, so adaptive difficulty / inserted
   * follow-ups actually reach the NEXT interviewer turn on the live path.
   */
  applyReview(result: ReviewerResult): void {
    this.state.reviews = [...(this.state.reviews ?? []), result];
    const patch = reconcilePatch(this.state, result);
    if (patch) applyPatch(this.state, patch);
  }

  private currentQuestionText(): string {
    return this.state.plan.questions[this.state.cursorIndex]?.prompt ?? '';
  }
}
