// Orchestration functions for the four-agent brain. Each takes an LlmClient
// (real or mock) so the logic is fully unit-testable. (docs/40, docs/15 D2.)
import { randomUUID } from 'node:crypto';
import {
  type InterviewConfig, type InterviewState, type QuestionPlan, type ReviewerResult,
  type InterviewReport, type Turn, type ControlToken,
  QuestionPlan as QuestionPlanSchema, ReviewerResult as ReviewerResultSchema,
  InterviewReport as InterviewReportSchema, ControlToken as ControlTokenSchema, bandFor,
} from './domain.js';
import type { LlmClient } from './llm/index.js';
import { extractControlToken, stripControlToken, sanitizeCandidateText } from './llm/json.js';
import { plannerPrompts, interviewerSystem, interviewerTurnUser, reviewerPrompts, analystPrompts } from './prompts/agents.js';
import { verifyEvidence, stripAffect } from './scoring/integrity.js';

/** Scrub affect/protected language from candidate-facing feedback; log when it
 *  fires (production canary for prompt regressions) and never surface empty text. */
function cleanFeedback(text: string, fallback: string): string {
  const r = stripAffect(text);
  if (r.changed) console.warn('[viva] affect redaction fired on analyst feedback');
  return r.text || fallback;
}

/* ---------------- Planner ---------------- */
export async function planInterview(llm: LlmClient, config: InterviewConfig, sessionId: string): Promise<QuestionPlan> {
  const { system, user } = plannerPrompts(config);
  const plan = await llm.json({ role: 'planner', system, user, maxTokens: 2048 }, QuestionPlanSchema);
  // normalize: ensure ids + sessionId + version
  return {
    ...plan,
    sessionId,
    version: 0,
    questions: plan.questions.map((q) => ({ ...q, id: q.id || `q_${randomUUID().slice(0, 8)}` })),
  };
}

/* ---------------- Interviewer (one live turn) ---------------- */
export interface InterviewerTurn {
  spokenText: string; // clean text to synthesize (control token stripped)
  control: ControlToken; // parsed, with safe default
}

export async function interviewerTurn(
  llm: LlmClient,
  config: InterviewConfig,
  state: InterviewState,
  candidateAnswerRaw: string | null,
): Promise<InterviewerTurn> {
  const candidateAnswer = candidateAnswerRaw == null ? null : sanitizeCandidateText(candidateAnswerRaw);
  const system = interviewerSystem(config);
  const user = interviewerTurnUser(state, candidateAnswer);
  const raw = await llm.text({ role: 'interviewer', system, user, maxTokens: 220, temperature: 0.7 });

  const spokenText = stripControlToken(raw);
  let control: ControlToken = { action: 'advance' }; // safe default (D2)
  const tok = extractControlToken(raw);
  if (tok) {
    const parsed = ControlTokenSchema.safeParse(tok);
    if (parsed.success) control = parsed.data;
  }
  return { spokenText, control };
}

/**
 * Stateless turn helpers used by the HTTP endpoints (the agent worker calls
 * these per turn). They mutate `state` in place and return the line to speak.
 * The richer event-driven TurnLoop (src/voice/turnloop.ts) wraps the same brain
 * for the in-process agent. Both share interviewerTurn + applyControl.
 */
export interface TurnReply { spokenText: string; control: ControlToken; ended: boolean; index: number; total: number }

export async function beginTurn(llm: LlmClient, config: InterviewConfig, state: InterviewState): Promise<TurnReply> {
  const { spokenText } = await interviewerTurn(llm, config, state, null);
  state.phase = 'in_progress';
  state.startedAt ??= new Date().toISOString(); // first real begin anchors the wall-clock for resume
  state.lastQuestionId = state.plan.questions[state.cursorIndex]?.id ?? state.lastQuestionId;
  state.lastSpokenLine = spokenText; // transcript fidelity: store what was actually said
  return { spokenText, control: { action: 'advance' }, ended: false, index: 1, total: state.plan.questions.length };
}

export async function nextTurn(llm: LlmClient, config: InterviewConfig, state: InterviewState, candidateTextRaw: string): Promise<TurnReply> {
  const candidateText = sanitizeCandidateText(candidateTextRaw);
  // Record the answered turn against the line the Interviewer ACTUALLY spoke
  // (not the plan seed), so the Analyst scores answers against what was heard.
  state.turns.push({
    questionId: state.lastQuestionId ?? state.plan.questions[state.cursorIndex]?.id ?? 'q0',
    index: state.turns.length,
    interviewerText: state.lastSpokenLine ?? state.plan.questions[state.cursorIndex]?.prompt ?? '',
    candidateText,
    answeredAt: new Date().toISOString(),
  });
  state.version += 1;

  const { spokenText, control } = await interviewerTurn(llm, config, state, candidateText);
  const nextCursor = applyControl(state, control.action);
  state.cursorIndex = nextCursor;
  if (control.action !== 'dig') {
    state.lastQuestionId = state.plan.questions[nextCursor]?.id ?? state.lastQuestionId;
  }
  state.lastSpokenLine = spokenText; // the line they'll answer next turn
  // Hard time-budget cap (~2 min/turn) so adaptive follow-ups can't run forever.
  const maxTurns = Math.min(20, Math.max(3, Math.ceil(config.lengthMinutes / 2)));
  const ended = control.action === 'wrap' || nextCursor >= state.plan.questions.length || state.turns.length >= maxTurns;
  if (ended) { state.wrapping = true; state.phase = 'wrapping'; }
  const total = state.plan.questions.length;
  return { spokenText, control, ended, index: Math.min(nextCursor + 1, total), total };
}

/**
 * Apply a reconciled PlanPatch to the live plan (D2 — previously inert). Mutates
 * state.plan.questions and bumps version so the change actually reaches the
 * Interviewer's next turn. Returns true if the plan changed.
 */
export function applyPatch(state: InterviewState, patch: ReviewerResult['patch']): boolean {
  const idx = state.plan.questions.findIndex((q) => q.id === patch.targetQuestionId);
  if (idx === -1 || patch.op === 'none') return false;
  const q = state.plan.questions[idx]!;
  switch (patch.op) {
    case 'raise_difficulty':
      q.difficulty = Math.min(5, q.difficulty + 1);
      break;
    case 'lower_difficulty':
      q.difficulty = Math.max(1, q.difficulty - 1);
      break;
    case 'skip':
      q.askIfTimeAllows = true; // de-prioritize rather than hard-remove
      break;
    case 'insert_followup': {
      const followup = {
        id: `q_fu_${randomUUID().slice(0, 8)}`, // unique — two patches can't collide
        competency: q.competency,
        intent: `follow-up on ${q.intent}`,
        prompt: patch.payload || `Tell me more about that — can you give a specific example?`,
        difficulty: q.difficulty,
        followupHints: [],
        askIfTimeAllows: false,
      };
      // insert right after the target so it's asked next if the cursor is there
      state.plan.questions.splice(Math.max(idx + 1, state.cursorIndex), 0, followup);
      break;
    }
  }
  state.version += 1;
  return true;
}

/** Apply a control action to produce the next cursor index (pure). */
export function applyControl(state: InterviewState, action: ControlToken['action']): number {
  switch (action) {
    case 'dig':
      return state.cursorIndex; // stay on the same question
    case 'advance':
    case 'move_on':
      return Math.min(state.cursorIndex + 1, state.plan.questions.length);
    case 'wrap':
      return state.plan.questions.length; // past the end → wrap
  }
}

/* ---------------- Response Reviewer (async) ---------------- */
export async function reviewAnswer(
  llm: LlmClient,
  config: InterviewConfig,
  state: InterviewState,
  turn: Turn,
): Promise<ReviewerResult> {
  const { system, user } = reviewerPrompts(config, state, turn);
  // Reviewer is async/off-speech-path (D2), so it uses the deep model (D12).
  const result = await llm.json({ role: 'reviewer', system, user, maxTokens: 700 }, ReviewerResultSchema);
  // Integrity guards (D12): verify each cited quote is real; scrub affect language.
  const scores = result.scores.map((sc) => {
    const ok = verifyEvidence(sc.evidenceQuote, turn.candidateText);
    return {
      ...sc,
      evidenceQuote: ok ? sc.evidenceQuote : '',
      rationale: stripAffect((ok ? '' : '[unverified] ') + sc.rationale).text,
    };
  });
  return { ...result, scores, note: stripAffect(result.note).text, questionId: turn.questionId, basedOnVersion: state.version };
}

/**
 * Reconcile a reviewer patch against the live cursor (D2 staleness bound).
 * Returns the patch to apply, or null if stale/no-op.
 */
export function reconcilePatch(state: InterviewState, result: ReviewerResult): ReviewerResult['patch'] | null {
  if (result.patch.op === 'none') return null;
  const idx = state.plan.questions.findIndex((q) => q.id === result.patch.targetQuestionId);
  if (idx === -1) return null; // target no longer exists
  if (idx >= state.cursorIndex) return result.patch; // still ahead of the cursor → apply as-is
  // Stale target (already asked): re-target to the next not-yet-asked question,
  // preferring the same competency, instead of dropping the adaptation (D2).
  const open = state.plan.questions.slice(state.cursorIndex);
  if (open.length === 0) return null; // interview is wrapping — nothing left to adapt
  const targetComp = state.plan.questions[idx]!.competency;
  const next = open.find((q) => q.competency === targetComp) ?? open[0]!;
  return { ...result.patch, targetQuestionId: next.id };
}

/* ---------------- Analyst (final report) ---------------- */
export async function analyzeInterview(
  llm: LlmClient,
  config: InterviewConfig,
  sessionId: string,
  transcript: { q: string; a: string }[],
  priorReviews: { questionId: string; scores: { competency: string; score: number }[]; note: string }[] = [],
): Promise<InterviewReport> {
  const { system, user } = analystPrompts(config, transcript, priorReviews);
  const report = await llm.json({ role: 'analyst', system, user, maxTokens: 4096 }, InterviewReportSchema);
  // Integrity guards (D12): keep only evidence quotes that appear in the answers; scrub affect.
  const candidateAll = transcript.map((t) => t.a).join('\n');
  const competencyScores = report.competencyScores.map((cs) => ({
    ...cs,
    summary: stripAffect(cs.summary).text,
    evidence: cs.evidence.filter((e) => verifyEvidence(e, candidateAll)),
  }));
  const perQuestion = report.perQuestion.map((pq) => ({
    ...pq,
    feedback: stripAffect(pq.feedback).text,
    evidenceQuote: verifyEvidence(pq.evidenceQuote, candidateAll) ? pq.evidenceQuote : '',
  }));
  // Overall is a transparent aggregate of the competencies (source of truth) so it
  // can never contradict the bars the user sees; band derives from it (D12).
  const overallScore = competencyScores.length
    ? Math.round(competencyScores.reduce((s, c) => s + c.score, 0) / competencyScores.length)
    : report.overallScore;
  return {
    ...report,
    sessionId,
    overallScore,
    band: bandFor(overallScore),
    competencyScores,
    perQuestion,
    stoodOut: cleanFeedback(report.stoodOut, 'You showed clear strengths in this interview.'),
    workOn: cleanFeedback(report.workOn, 'Keep practicing to sharpen your answers.'),
  };
}
