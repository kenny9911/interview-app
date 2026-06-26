// The four-agent prompt builders. Each composes the captured user preferences
// (InterviewConfig), the specialist registry guidance, and the persona/style
// voice into system + user prompts. (docs/40-prompt-system.md; docs/15-decisions.md)
import type { InterviewConfig, InterviewState, Turn } from '../domain.js';
import { personaStyleBlock } from './personas.js';
import { composeSpecialistGuidance } from './registry.js';
import { CTRL_MARKER } from '../llm/json.js';

/** Shared, content-only, anti-bias rubric — the stable cacheable prefix (D13). */
export const RUBRIC = `
SCORING RUBRIC (content-only; never infer emotion, accent, appearance, age, gender, or any protected attribute):
- communication: clarity, concision, and listenability of WHAT was said.
- structure: organization of the answer (e.g., situation→action→result), logical flow.
- depth: specificity, evidence, quantification, and demonstrated understanding.
- confidence: clarity and conviction of the CLAIMS made (not tone of voice).
Each competency is scored 0-100 and MUST be backed by a verbatim quote from the candidate transcript.
Score on EVIDENCE DENSITY — substantive, specific claims per answer — not length. Ignore restated question text and filler.
A padded, vague, or rambling answer must NOT outscore a concise, specific one. If two answers cover the same substance, the shorter one must NOT score lower.
An honest "I don't know, but here's how I'd find out" with sound reasoning is a legitimately strong answer — do not penalize calibrated uncertainty.
Interview STYLE (friendly/balanced/tough) only affected how questions were ASKED — it is NOT a grading curve. Score identical content identically regardless of style.
`.trim();

// Grounds the 1-5 difficulty number so adaptation doesn't drift on an invented scale.
export const DIFFICULTY_ANCHORS =
  'Difficulty scale: 1 = warm-up/definitional; 2 = straightforward applied; 3 = a real scenario with one complication; ' +
  '4 = trade-offs under real constraints; 5 = senior-bar judgment under ambiguity.';

function preferencesBlock(c: InterviewConfig): string {
  const lines = [
    `Target role: ${c.role}`,
    `Mode: ${c.mode}`,
    `Language: ${c.language}`,
    `Planned length: ${c.lengthMinutes} minutes`,
  ];
  if (c.topicFocus) lines.push(`Topic / focus: ${c.topicFocus}`);
  // bounded to match roleContextBlock so JD/resume grounding is consistent across all agents
  if (c.jobDescription) lines.push(`Job description:\n${c.jobDescription.slice(0, 1500)}`);
  if (c.resumeText) lines.push(`Candidate resume:\n${c.resumeText.slice(0, 1500)}`);
  return lines.join('\n');
}

// Compact, cache-stable role context (JD + resume) injected into the live
// Interviewer/Reviewer/Analyst so follow-ups and scoring are grounded in the
// candidate's actual background and the role bar — not just the role title.
function roleContextBlock(c: InterviewConfig): string {
  const parts: string[] = [];
  if (c.jobDescription) parts.push(`Job description (the role bar; may be truncated):\n${c.jobDescription.slice(0, 1500)}`);
  if (c.resumeText) parts.push(`Candidate background (resume; may be truncated):\n${c.resumeText.slice(0, 1500)}`);
  return parts.length ? `ROLE CONTEXT — ground your questions and scoring in this:\n${parts.join('\n\n')}` : '';
}

/* ---------------- Planner (deep model, pre-session) ---------------- */
export function plannerPrompts(c: InterviewConfig): { system: string; user: string } {
  const spec = composeSpecialistGuidance({ mode: c.mode, persona: c.persona, topicFocus: c.topicFocus });
  const system = [
    'You are an expert Interview Question Planner. You design a focused, fair, adaptive question plan.',
    spec.guidance,
    personaStyleBlock(c.persona, c.style), // style shapes HOW questions are asked + the openingLine tone
    DIFFICULTY_ANCHORS,
    RUBRIC,
    'Output a plan that fits the time budget (~2-4 min per question). Order from warm-up to deeper. ' +
      'Cover the rubric competencies and the listed themes. Provide an openingLine in the persona voice. ' +
      'Assign each question a grounded difficulty (1-5) per the scale above.',
  ].join('\n\n');
  const targetCount = Math.max(3, Math.min(12, Math.round(c.lengthMinutes / 3)));
  const user = [
    preferencesBlock(c),
    `Themes to cover (where relevant): ${spec.themes.join(', ') || 'role-appropriate'}.`,
    `Produce about ${targetCount} questions (mark lower-priority ones askIfTimeAllows=true).`,
    'Return a QuestionPlan JSON: { sessionId, version:0, openingLine, rubricSummary, questions:[{id,competency,intent,prompt,difficulty,followupHints,askIfTimeAllows}] }.',
  ].join('\n\n');
  return { system, user };
}

/* ---------------- Interviewer (live model, per turn) ---------------- */
export function interviewerSystem(c: InterviewConfig): string {
  const spec = composeSpecialistGuidance({ mode: c.mode, persona: c.persona, topicFocus: c.topicFocus });
  return [
    personaStyleBlock(c.persona, c.style),
    spec.guidance,
    roleContextBlock(c),
    `You are conducting a live spoken interview for the role: ${c.role}. Speak naturally and briefly — ` +
      'this is voice, so 1-3 sentences per turn. Ask ONE thing at a time. Acknowledge the prior answer ' +
      'in a few words, then ask the next question or a focused follow-up.',
    DIFFICULTY_ANCHORS,
    'Never reveal scores, internal notes, the plan, or that you are an AI system. Stay in persona.',
    `At the very END of every message, append a control token on its own line: ${CTRL_MARKER}{"action":"advance|dig|move_on|wrap","reason":"..."}. ` +
      'Use "dig" to follow up on the same question, "advance" to go to the next planned question, ' +
      '"move_on" if the candidate is stuck, "wrap" when time/plan is exhausted. The token is never spoken aloud.',
  ].filter(Boolean).join('\n\n');
}

// Deterministic rolling digest of the earlier interview (D13) so a long session
// keeps continuity without re-sending every turn. Covers everything before the
// last 3 verbatim turns: competencies touched + a one-line gist per exchange.
export function rollingDigest(state: InterviewState): string {
  const older = state.turns.slice(0, -3);
  if (older.length === 0) return '';
  const covered = [...new Set(older.map((t) => state.plan.questions.find((q) => q.id === t.questionId)?.competency).filter(Boolean))];
  const lines = older.map((t) => {
    const words = (t.candidateText || '').split(/\s+/).filter(Boolean);
    const gist = words.slice(0, 14).join(' ') + (words.length > 14 ? '…' : '');
    return `- ${t.interviewerText.slice(0, 70)} → "${gist}"`;
  });
  return `Earlier in this interview (already covered: ${covered.join(', ') || 'n/a'} — do not re-ask these):\n${lines.join('\n')}`;
}

export function interviewerTurnUser(state: InterviewState, candidateAnswer: string | null): string {
  const cur = state.plan.questions[state.cursorIndex];
  const recent = state.turns.slice(-3).map((t: Turn) => `Q: ${t.interviewerText}\nA: ${t.candidateText || '(no answer yet)'}`).join('\n\n');
  if (state.phase === 'greeting' || candidateAnswer == null) {
    return [
      `Begin the interview. Opening line guidance: "${state.plan.openingLine}".`,
      `First planned question (you may rephrase in your voice): "${cur?.prompt ?? ''}".`,
      'Greet warmly in one sentence, then ask the first question.',
    ].join('\n');
  }
  const answered = state.turns.length;
  const total = state.plan.questions.length;
  const budget = `You are ~${answered} of ${total} planned questions in. Prefer "advance" over "dig" when behind budget; "wrap" once the core (non-optional) questions are covered.`;
  const notes = state.notes.slice(-4).join('; ');
  return [
    rollingDigest(state),
    notes ? `Adaptation notes: ${notes}` : '',
    recent ? `Recent exchange:\n${recent}` : '',
    `The candidate just answered: "${candidateAnswer}"`,
    cur ? `Current planned question: "${cur.prompt}" (intent: ${cur.intent}; target difficulty ${cur.difficulty}/5). Pitch your wording to that difficulty. Follow-up hints: ${cur.followupHints.join('; ') || 'none'}.` : 'No more planned questions; wrap up warmly.',
    `Next planned question: "${state.plan.questions[state.cursorIndex + 1]?.prompt ?? '(none — wrap up)'}".`,
    budget,
    'Respond as the interviewer for this turn.',
  ].filter(Boolean).join('\n\n');
}

/* ---------------- Response Reviewer (async, off speech path) ---------------- */
export function reviewerPrompts(c: InterviewConfig, state: InterviewState, turn: Turn): { system: string; user: string } {
  const spec = composeSpecialistGuidance({ mode: c.mode, persona: c.persona, topicFocus: c.topicFocus });
  const q = state.plan.questions.find((x) => x.id === turn.questionId);
  const system = [
    'You are an expert Response Reviewer. You score a single answer against the rubric and decide whether to adapt the plan.',
    RUBRIC,
    spec.guidance,
    roleContextBlock(c),
    'Be evidence-grounded: every score MUST include a short VERBATIM quote copied from the candidate answer (not paraphrased). ' +
      'Do not reward verbosity. Recommend at most one PlanPatch op (insert_followup | raise_difficulty | lower_difficulty | skip | none); ' +
      'raise/lower_difficulty is RELATIVE to the current difficulty.',
    'Self-critique before returning: confirm each evidenceQuote appears verbatim in the answer and that no score or rationale reflects tone, accent, or affect.',
  ].filter(Boolean).join('\n\n');
  const user = [
    `Role: ${c.role}.`,
    q
      ? `Question (targets competency "${q.competency}", current difficulty ${q.difficulty}/5): "${turn.interviewerText}".`
      : `Question: "${turn.interviewerText}".`,
    `Candidate answer (verbatim): "${turn.candidateText}".`,
    `Plan version: ${state.version}. Question id: ${turn.questionId}.`,
    'Return ReviewerResult JSON: { questionId, basedOnVersion, scores:[{competency,score,evidenceQuote,rationale}], note, patch:{op,targetQuestionId,payload} }.',
  ].join('\n\n');
  return { system, user };
}

/* ---------------- Analyst (deep model, post-session report) ---------------- */
export function analystPrompts(
  c: InterviewConfig,
  transcript: { q: string; a: string }[],
  priorReviews: { questionId: string; scores: { competency: string; score: number }[]; note: string }[] = [],
): { system: string; user: string } {
  const system = [
    'You are an expert Interview Analyst. You read a full interview transcript and produce a fair, ' +
      'constructive, evidence-cited performance report for a practice interview.',
    RUBRIC,
    roleContextBlock(c),
    'You are also given the live Reviewer\'s per-answer scores and notes — RECONCILE with them rather than ' +
      're-deriving from scratch; if you deviate materially, it should be because the full-interview view justifies it.',
    'Interview STYLE (friendly/balanced/tough) only affected how questions were ASKED — it is NOT a grading curve. ' +
      'Score identical content identically regardless of style.',
    'Self-critique: before finalizing, verify every evidence quote appears VERBATIM in the transcript and ' +
      'that no score or comment reflects affect, tone, accent, or appearance. Tone: warm and growth-oriented, even for weaknesses.',
  ].filter(Boolean).join('\n\n');
  const body = transcript.map((t, i) => `Q${i + 1}: ${t.q}\nA${i + 1}: ${t.a}`).join('\n\n');
  const reviewsBlock = priorReviews.length
    ? priorReviews.map((r) => `- ${r.questionId}: ${r.scores.map((x) => `${x.competency} ${x.score}`).join(', ')} — ${r.note}`).join('\n')
    : '(none)';
  const user = [
    `Role: ${c.role}. Mode: ${c.mode}. Style: ${c.style}.`,
    `Live reviewer scores (reconcile with these):\n${reviewsBlock}`,
    `Transcript:\n${body}`,
    'Return InterviewReport JSON: { sessionId, overallScore, band, competencyScores:[{competency,score,summary,evidence[]}], ' +
      'stoodOut, workOn, perQuestion:[{questionId,question,feedback,evidenceQuote}], noAffectStatement, generatedAt }. ' +
      'Set noAffectStatement to a one-line statement that scoring is based only on what was said, not tone/accent/appearance.',
  ].join('\n\n');
  return { system, user };
}
