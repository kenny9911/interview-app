// Per-provider, per-role model resolution. Each of the four agent roles
// (planner / interviewer / reviewer / analyst) is independently configurable for
// every provider via env (e.g. OPENAI_MODEL_PLANNER). Keeps routing in one place.
import { env } from '../env.js';
import type { LlmRole } from './index.js';

export type LlmProvider = 'anthropic' | 'openai' | 'gemini' | 'openrouter';

const MODELS: Record<LlmProvider, Record<LlmRole, string>> = {
  anthropic: {
    planner: env.CLAUDE_MODEL_PLANNER,
    interviewer: env.CLAUDE_MODEL_INTERVIEWER,
    reviewer: env.CLAUDE_MODEL_REVIEWER,
    analyst: env.CLAUDE_MODEL_ANALYST,
  },
  openai: {
    planner: env.OPENAI_MODEL_PLANNER,
    interviewer: env.OPENAI_MODEL_INTERVIEWER,
    reviewer: env.OPENAI_MODEL_REVIEWER,
    analyst: env.OPENAI_MODEL_ANALYST,
  },
  gemini: {
    planner: env.GEMINI_MODEL_PLANNER,
    interviewer: env.GEMINI_MODEL_INTERVIEWER,
    reviewer: env.GEMINI_MODEL_REVIEWER,
    analyst: env.GEMINI_MODEL_ANALYST,
  },
  openrouter: {
    planner: env.OPENROUTER_MODEL_PLANNER,
    interviewer: env.OPENROUTER_MODEL_INTERVIEWER,
    reviewer: env.OPENROUTER_MODEL_REVIEWER,
    analyst: env.OPENROUTER_MODEL_ANALYST,
  },
};

export function modelFor(provider: LlmProvider, role: LlmRole): string {
  return MODELS[provider][role];
}
