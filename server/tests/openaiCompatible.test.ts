import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { createOpenAiCompatClient } from '../src/llm/openaiCompatible.js';
import { modelFor } from '../src/llm/models.js';

type Rec = { url?: string; init?: RequestInit; body?: any };
function fakeFetch(rec: Rec, response: unknown) {
  return (async (url: string, init?: RequestInit) => {
    rec.url = String(url);
    rec.init = init;
    rec.body = init?.body ? JSON.parse(init.body as string) : undefined;
    return new Response(JSON.stringify(response), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
}
const ok = (content: string) => ({ choices: [{ message: { content } }] });

describe('OpenAI-compatible client (backs OpenAI / Gemini / OpenRouter)', () => {
  it('posts a chat-completions request with the per-role model, system+user, auth, and max_completion_tokens (OpenAI)', async () => {
    const rec: Rec = {};
    const client = createOpenAiCompatClient({
      provider: 'openai', baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-test',
      maxTokensField: 'max_completion_tokens', fetchImpl: fakeFetch(rec, ok('Hello.')),
    });
    const out = await client.text({ role: 'planner', system: 'SYS', user: 'USER', maxTokens: 512 });
    expect(out).toBe('Hello.');
    expect(rec.url).toBe('https://api.openai.com/v1/chat/completions');
    expect((rec.init!.headers as Record<string, string>).authorization).toBe('Bearer sk-test');
    expect(rec.body.model).toBe(modelFor('openai', 'planner')); // role-resolved model
    expect(rec.body.messages).toEqual([{ role: 'system', content: 'SYS' }, { role: 'user', content: 'USER' }]);
    expect(rec.body.max_completion_tokens).toBe(512);
    expect(rec.body.max_tokens).toBeUndefined();
    expect(rec.body.temperature).toBeUndefined(); // omitted on purpose
  });

  it('uses max_tokens + extra headers for OpenRouter; omits an empty system message', async () => {
    const rec: Rec = {};
    const client = createOpenAiCompatClient({
      provider: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1', apiKey: 'or-test',
      extraHeaders: { 'X-Title': 'viva' }, fetchImpl: fakeFetch(rec, ok('ok')),
    });
    await client.text({ role: 'interviewer', system: '', user: 'hi' });
    expect(rec.url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(rec.body.max_tokens).toBe(1024); // default headroom
    expect((rec.init!.headers as Record<string, string>)['X-Title']).toBe('viva');
    expect(rec.body.model).toBe(modelFor('openrouter', 'interviewer'));
    expect(rec.body.messages).toEqual([{ role: 'user', content: 'hi' }]); // no empty system
  });

  it('throws a provider-labelled error on a non-2xx response', async () => {
    const client = createOpenAiCompatClient({
      provider: 'gemini', baseUrl: 'https://g/v1', apiKey: 'k',
      fetchImpl: (async () => new Response('quota exceeded', { status: 429 })) as unknown as typeof fetch,
    });
    await expect(client.text({ role: 'analyst', system: 's', user: 'u' })).rejects.toThrow(/gemini 429/);
  });

  it('throws when the completion content is empty', async () => {
    const client = createOpenAiCompatClient({
      provider: 'openai', baseUrl: 'https://x/v1', apiKey: 'k', fetchImpl: fakeFetch({}, ok('')),
    });
    await expect(client.text({ role: 'planner', system: 's', user: 'u' })).rejects.toThrow(/empty\/invalid/);
  });

  it('json() routes through the shared extract+validate path', async () => {
    const client = createOpenAiCompatClient({
      provider: 'openai', baseUrl: 'https://x/v1', apiKey: 'k', fetchImpl: fakeFetch({}, ok('here you go: {"n": 7}')),
    });
    expect(await client.json({ role: 'reviewer', system: 's', user: 'u' }, z.object({ n: z.number() }))).toEqual({ n: 7 });
  });
});

describe('modelFor — per-provider, per-role model resolution', () => {
  it('routes each provider/role to its configured model id', () => {
    expect(modelFor('anthropic', 'planner')).toContain('claude');
    expect(modelFor('openai', 'planner')).toContain('gpt');
    expect(modelFor('gemini', 'planner')).toContain('gemini');
    expect(modelFor('openrouter', 'analyst')).toContain('google/'); // namespaced ids
    // each role is independently resolvable
    for (const role of ['planner', 'interviewer', 'reviewer', 'analyst'] as const) {
      expect(modelFor('openai', role).length).toBeGreaterThan(0);
    }
  });
});
