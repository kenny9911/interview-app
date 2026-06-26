// Core domain model for viva — shared by the API, the agent worker, and tests.
// Mirrors docs/10-refined-spec.md §"data model" and docs/15-decisions.md.
import { z } from 'zod';

/* ---------- enums ---------- */
export const Mode = z.enum(['mock', 'topic_practice', 'capability_assessment', 'real', 'expert_interview']);
export type Mode = z.infer<typeof Mode>;

// P0 modes per D0; the rest render a "coming soon" sheet client-side.
export const MVP_MODES: Mode[] = ['mock', 'topic_practice', 'capability_assessment'];

export const Persona = z.enum(['aria', 'sam', 'lena']);
export type Persona = z.infer<typeof Persona>;

export const Style = z.enum(['friendly', 'balanced', 'tough']);
export type Style = z.infer<typeof Style>;

// Languages gated to what the stack serves end-to-end (D0).
export const Language = z.enum(['en', 'es', 'zh']);
export type Language = z.infer<typeof Language>;
export const SUPPORTED_LANGUAGES_P0: Language[] = ['en'];

/* ---------- accounts (real password auth; D14) ---------- */
export const User = z.object({
  id: z.string(),
  email: z.string().min(3).max(200), // stored normalized (lowercased/trimmed)
  passwordHash: z.string(), // scrypt — never leaves the server
  createdAt: z.string(),
});
export type User = z.infer<typeof User>;

export const Competency = z.enum(['communication', 'structure', 'depth', 'confidence']);
export type Competency = z.infer<typeof Competency>;
// Lenient variant for LLM output (tolerates casing/whitespace).
export const CompetencyLenient = z.preprocess((v) => String(v ?? '').toLowerCase().trim(), Competency);

// Free-text field that tolerates the model returning an array of bullets.
export const looseStr = z.preprocess(
  (v) => (Array.isArray(v) ? v.map((x) => String(x)).join(' ') : v),
  z.string(),
);

/* ---------- interview configuration (user preferences captured at setup) ---------- */
export const InterviewConfig = z.object({
  id: z.string(),
  userId: z.string(),
  mode: Mode,
  role: z.string().min(1).max(120),
  persona: Persona,
  style: Style,
  language: Language.default('en'),
  lengthMinutes: z.number().int().min(5).max(60),
  topicFocus: z.string().max(200).optional(),
  jobDescription: z.string().max(8000).optional(),
  resumeText: z.string().max(12000).optional(),
  inviteToken: z.string().optional(),
  createdAt: z.string(),
});
export type InterviewConfig = z.infer<typeof InterviewConfig>;

/* ---------- question plan (Planner output) ---------- */
export const PlannedQuestion = z.object({
  id: z.string(),
  competency: CompetencyLenient,
  intent: z.string(), // what this question probes
  prompt: z.string(), // the seed question wording (the Interviewer may rephrase)
  // LLMs emit difficulty as "3", 3, or even "Medium" — coerce, clamp, default 3.
  difficulty: z.preprocess((v) => {
    if (typeof v === 'number') return Math.min(5, Math.max(1, Math.round(v)));
    const s = String(v ?? '').toLowerCase().trim();
    const n = Number(s);
    if (Number.isFinite(n)) return Math.min(5, Math.max(1, Math.round(n)));
    const map: Record<string, number> = { trivial: 1, 'very easy': 1, easy: 2, medium: 3, moderate: 3, hard: 4, challenging: 4, 'very hard': 5, expert: 5 };
    return map[s] ?? 3;
  }, z.number().int().min(1).max(5)),
  followupHints: z.array(z.string()).default([]),
  askIfTimeAllows: z.boolean().default(false),
});
export type PlannedQuestion = z.infer<typeof PlannedQuestion>;

export const QuestionPlan = z.object({
  sessionId: z.string(),
  version: z.number().int().nonnegative(),
  openingLine: z.string(),
  questions: z.array(PlannedQuestion).min(1),
  rubricSummary: z.string(),
});
export type QuestionPlan = z.infer<typeof QuestionPlan>;

/* ---------- live interview state (Redis hot state, D2/D3) ---------- */
export const Turn = z.object({
  questionId: z.string(),
  index: z.number().int().nonnegative(),
  interviewerText: z.string(),
  candidateText: z.string().default(''), // FINAL STT text (D5)
  startedAt: z.string().optional(),
  answeredAt: z.string().optional(),
});
export type Turn = z.infer<typeof Turn>;

export const InterviewState = z.object({
  sessionId: z.string(),
  configId: z.string().optional(),
  version: z.number().int().nonnegative(), // optimistic-concurrency cursor (D2)
  cursorIndex: z.number().int().nonnegative(),
  plan: QuestionPlan,
  turns: z.array(Turn).default([]),
  notes: z.array(z.string()).default([]), // running Reviewer notes
  phase: z.enum(['greeting', 'in_progress', 'wrapping', 'complete']).default('greeting'),
  lastQuestionId: z.string().optional(), // the question the last spoken line maps to
  lastSpokenLine: z.string().optional(), // the line the Interviewer ACTUALLY spoke (for transcript fidelity)
  startedAt: z.string().optional(), // ISO time the interview actually began (set on first beginTurn) — drives resume countdown
  reviews: z.array(z.any()).default([]), // persisted ReviewerResult[] (fed to the Analyst)
  recordingEnabled: z.boolean().default(false), // from the consent gate (D9)
  wrapping: z.boolean().default(false),
});
export type InterviewState = z.infer<typeof InterviewState>;

/* ---------- Interviewer control token (D2) ---------- */
export const ControlAction = z.enum(['advance', 'dig', 'move_on', 'wrap']);
export type ControlAction = z.infer<typeof ControlAction>;
export const ControlToken = z.object({ action: ControlAction, reason: z.string().optional() });
export type ControlToken = z.infer<typeof ControlToken>;

/* ---------- Reviewer output (async, off speech path; D2) ---------- */
export const AnswerScore = z.object({
  competency: CompetencyLenient,
  score: z.coerce.number().int().min(0).max(100),
  evidenceQuote: z.string(), // verbatim transcript span
  rationale: looseStr,
});
export type AnswerScore = z.infer<typeof AnswerScore>;

export const PlanPatchOp = z.object({
  op: z.enum(['insert_followup', 'raise_difficulty', 'lower_difficulty', 'skip', 'none']),
  targetQuestionId: z.string(),
  payload: z.string().optional(),
});
export type PlanPatchOp = z.infer<typeof PlanPatchOp>;

export const ReviewerResult = z.object({
  questionId: z.string(),
  scores: z.array(AnswerScore),
  note: looseStr,
  patch: PlanPatchOp,
  basedOnVersion: z.number().int().nonnegative(), // staleness bound (D2)
});
export type ReviewerResult = z.infer<typeof ReviewerResult>;

/* ---------- Analyst output (final report; D11/D12) ---------- */
export const CompetencyScore = z.object({
  competency: CompetencyLenient,
  score: z.coerce.number().int().min(0).max(100),
  summary: looseStr,
  evidence: z.array(z.string()),
});
export type CompetencyScore = z.infer<typeof CompetencyScore>;

export const PerQuestionFeedback = z.object({
  questionId: z.string(),
  question: z.string(),
  feedback: looseStr,
  evidenceQuote: z.string(),
});
export type PerQuestionFeedback = z.infer<typeof PerQuestionFeedback>;

export const InterviewReport = z.object({
  sessionId: z.string(),
  overallScore: z.coerce.number().int().min(0).max(100),
  // recomputed from overallScore after parse; lenient so model casing never 500s.
  band: z.preprocess((v) => String(v ?? 'solid').toLowerCase().trim(), z.enum(['emerging', 'solid', 'strong', 'exceptional']).catch('solid')),
  competencyScores: z.array(CompetencyScore),
  stoodOut: looseStr,
  workOn: looseStr,
  perQuestion: z.array(PerQuestionFeedback),
  noAffectStatement: z.string(), // D12 transparency
  generatedAt: z.string(),
});
export type InterviewReport = z.infer<typeof InterviewReport>;

/* ---------- session summary (History list) ---------- */
export const SessionSummary = z.object({
  sessionId: z.string(),
  userId: z.string(),
  mode: Mode,
  role: z.string(),
  createdAt: z.string(),
  status: z.enum(['created', 'complete']),
  overallScore: z.number().int().optional(),
});
export type SessionSummary = z.infer<typeof SessionSummary>;

export function bandFor(score: number): InterviewReport['band'] {
  if (score >= 90) return 'exceptional';
  if (score >= 75) return 'strong';
  if (score >= 55) return 'solid';
  return 'emerging';
}
