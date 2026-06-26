// Anthropic-backed LlmClient. Used at runtime; tests use MockLlmClient.
// System prompt is sent with prompt caching (the stable rubric/persona prefix),
// per docs/40-prompt-system.md and docs/15-decisions.md D13.
import Anthropic from '@anthropic-ai/sdk';
import type { z } from 'zod';
import { env } from '../env.js';
import { type LlmClient, type LlmRequest, jsonViaText } from './index.js';
import { modelFor } from './models.js';

export function createAnthropicClient(apiKey = env.ANTHROPIC_API_KEY): LlmClient {
  const anthropic = new Anthropic({ apiKey });

  async function text(req: LlmRequest): Promise<string> {
    const res = await anthropic.messages.create(
      {
        model: modelFor('anthropic', req.role),
        max_tokens: req.maxTokens ?? 1024,
        // newer Claude models deprecate `temperature`; omit it.
        system: [{ type: 'text', text: req.system, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: req.user }],
      },
      { timeout: 60_000, maxRetries: 2 }, // bound hangs; SDK retries 429/5xx
    );
    return res.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
  }

  return {
    text,
    json<T>(req: LlmRequest, schema: z.ZodType<T>): Promise<T> {
      return jsonViaText({ text }, req, schema);
    },
  };
}
