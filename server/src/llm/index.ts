// LLM client abstraction. Agents depend on the `LlmClient` interface so they
// can be unit-tested with a deterministic mock; the Anthropic-backed impl is
// used at runtime. Model routing per docs/15-decisions.md D1.
import type { z } from 'zod';
import { env } from '../env.js';
import { extractJson } from './json.js';

// The four agent roles. Each maps to an env-configured model PER PROVIDER
// (see llm/models.ts), e.g. CLAUDE_MODEL_PLANNER / OPENAI_MODEL_PLANNER / ...
export type LlmRole = 'planner' | 'interviewer' | 'reviewer' | 'analyst';

export interface LlmRequest {
  role: LlmRole;
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
}

export interface LlmClient {
  text(req: LlmRequest): Promise<string>;
  json<T>(req: LlmRequest, schema: z.ZodType<T>): Promise<T>;
}

const JSON_SUFFIX =
  '\n\nRespond with ONLY a single valid JSON value that matches the requested schema. No prose, no code fences.';

/** Shared json() implementation: append a JSON instruction, extract, validate.
 *  Retries once with more headroom + a stricter instruction if the first parse
 *  fails (e.g. the model truncated a long JSON value at max_tokens). */
export async function jsonViaText<T>(client: Pick<LlmClient, 'text'>, req: LlmRequest, schema: z.ZodType<T>): Promise<T> {
  try {
    const raw = await client.text({ ...req, user: req.user + JSON_SUFFIX });
    return schema.parse(extractJson(raw));
  } catch {
    const raw = await client.text({
      ...req,
      maxTokens: Math.max(req.maxTokens ?? 1024, 4096),
      user: req.user + '\n\nReturn ONLY one compact, COMPLETE valid JSON value matching the schema — no prose, no code fences. Keep string fields concise so the JSON closes fully.',
    });
    return schema.parse(extractJson(raw));
  }
}

import { createAnthropicClient } from './anthropic.js';
import { createOpenAiCompatClient } from './openaiCompatible.js';

export { createAnthropicClient } from './anthropic.js';
export { createOpenAiCompatClient } from './openaiCompatible.js';
export { MockLlmClient } from './mock.js';
export { modelFor, type LlmProvider } from './models.js';

/** Build the runtime LlmClient for the configured LLM_PROVIDER. The four agent
 *  roles each resolve to that provider's per-role model (llm/models.ts). */
export function createLlmClient(): LlmClient {
  switch (env.LLM_PROVIDER) {
    case 'openai':
      // OpenAI's frontier models require `max_completion_tokens` (not `max_tokens`).
      return createOpenAiCompatClient({ provider: 'openai', baseUrl: env.OPENAI_BASE_URL, apiKey: env.OPENAI_API_KEY, maxTokensField: 'max_completion_tokens' });
    case 'gemini':
      return createOpenAiCompatClient({ provider: 'gemini', baseUrl: env.GEMINI_BASE_URL, apiKey: env.GEMINI_API_KEY, maxTokensField: 'max_tokens' });
    case 'openrouter':
      return createOpenAiCompatClient({ provider: 'openrouter', baseUrl: env.OPENROUTER_BASE_URL, apiKey: env.OPENROUTER_API_KEY, maxTokensField: 'max_tokens', extraHeaders: { 'X-Title': 'viva' } });
    case 'anthropic':
    default:
      return createAnthropicClient();
  }
}
