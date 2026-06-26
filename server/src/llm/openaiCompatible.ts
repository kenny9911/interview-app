// OpenAI-compatible chat-completions client. ONE implementation backs three
// providers — OpenAI, OpenRouter, and Gemini (via Google's OpenAI-compat
// endpoint) — since they share the /chat/completions request/response shape.
// Dependency-free (raw fetch, injectable for tests). System+user → text; the
// shared jsonViaText() handles JSON extraction/validation like the Anthropic path.
import type { z } from 'zod';
import { type LlmClient, type LlmRequest, jsonViaText } from './index.js';
import { modelFor, type LlmProvider } from './models.js';

type FetchLike = typeof fetch;

export interface OpenAiCompatOptions {
  provider: LlmProvider;
  baseUrl: string; // e.g. https://api.openai.com/v1 (no trailing /chat/completions)
  apiKey: string;
  // OpenAI's newer models require `max_completion_tokens`; OpenRouter/Gemini take `max_tokens`.
  maxTokensField?: 'max_tokens' | 'max_completion_tokens';
  extraHeaders?: Record<string, string>;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}

interface ChatCompletion {
  choices?: { message?: { content?: string | null } }[];
  error?: { message?: string };
}

export function createOpenAiCompatClient(opts: OpenAiCompatOptions): LlmClient {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const url = `${opts.baseUrl.replace(/\/$/, '')}/chat/completions`;
  const tokenField = opts.maxTokensField ?? 'max_tokens';

  async function text(req: LlmRequest): Promise<string> {
    const body: Record<string, unknown> = {
      model: modelFor(opts.provider, req.role),
      messages: [
        ...(req.system ? [{ role: 'system', content: req.system }] : []),
        { role: 'user', content: req.user },
      ],
      [tokenField]: req.maxTokens ?? 1024,
      // temperature intentionally omitted — several frontier models reject non-default values.
    };

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 60_000);
    let res: Response;
    try {
      res = await fetchImpl(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${opts.apiKey}`,
          ...opts.extraHeaders,
        },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).slice(0, 300);
      throw new Error(`${opts.provider} ${res.status}: ${detail}`);
    }
    const data = (await res.json()) as ChatCompletion;
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || content.length === 0) {
      throw new Error(`${opts.provider}: empty/invalid completion${data.error?.message ? ` (${data.error.message})` : ''}`);
    }
    return content;
  }

  return {
    text,
    json<T>(req: LlmRequest, schema: z.ZodType<T>): Promise<T> {
      return jsonViaText({ text }, req, schema);
    },
  };
}
