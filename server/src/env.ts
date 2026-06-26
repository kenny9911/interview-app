// Environment config — validated, with dev/test-safe defaults so the app and
// tests boot without real credentials. Real values come from `.env` (see
// repo-root .env.example). Model IDs are env-driven per docs/15-decisions.md D1.
import { existsSync } from 'node:fs';
import { z } from 'zod';

// Auto-load a .env from the server dir or the repo root (Node 20.12+).
for (const p of ['.env', '../.env']) {
  if (existsSync(p)) { try { (process as { loadEnvFile?: (f: string) => void }).loadEnvFile?.(p); } catch { /* ignore */ } }
}

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().default(4000),
  API_PUBLIC_URL: z.string().default('http://localhost:4000'),
  CORS_ORIGINS: z.string().default('http://localhost:8081,http://localhost:19006'),

  LIVEKIT_URL: z.string().default('wss://example.livekit.cloud'),
  LIVEKIT_API_KEY: z.string().default('devkey'),
  LIVEKIT_API_SECRET: z.string().default('devsecret-please-change-32chars-min'),

  // Which provider backs the four-agent brain. Models are configured PER ROLE
  // (planner / interviewer / reviewer / analyst) for each provider below.
  LLM_PROVIDER: z.enum(['anthropic', 'openai', 'gemini', 'openrouter']).default('anthropic'),

  // Anthropic / Claude
  ANTHROPIC_API_KEY: z.string().default(''),
  CLAUDE_MODEL_PLANNER: z.string().default('claude-opus-4-8'),
  CLAUDE_MODEL_INTERVIEWER: z.string().default('claude-sonnet-4-6'),
  CLAUDE_MODEL_REVIEWER: z.string().default('claude-opus-4-8'), // async Reviewer = deep model (D12)
  CLAUDE_MODEL_ANALYST: z.string().default('claude-opus-4-8'),

  // OpenAI / GPT (native OpenAI-compatible chat-completions API)
  OPENAI_API_KEY: z.string().default(''),
  OPENAI_BASE_URL: z.string().default('https://api.openai.com/v1'),
  OPENAI_MODEL_PLANNER: z.string().default('gpt-5.4'),
  OPENAI_MODEL_INTERVIEWER: z.string().default('gpt-5.4-mini'), // lighter model for the latency-sensitive live turn
  OPENAI_MODEL_REVIEWER: z.string().default('gpt-5.4'),
  OPENAI_MODEL_ANALYST: z.string().default('gpt-5.4'),

  // Gemini (Google's OpenAI-compatibility endpoint)
  GEMINI_API_KEY: z.string().default(''),
  GEMINI_BASE_URL: z.string().default('https://generativelanguage.googleapis.com/v1beta/openai'),
  GEMINI_MODEL_PLANNER: z.string().default('gemini-3.1-pro-preview'),
  GEMINI_MODEL_INTERVIEWER: z.string().default('gemini-3-flash-preview'),
  GEMINI_MODEL_REVIEWER: z.string().default('gemini-3.1-pro-preview'),
  GEMINI_MODEL_ANALYST: z.string().default('gemini-3.1-pro-preview'),

  // OpenRouter (OpenAI-compatible aggregator; model ids are namespaced e.g. google/...)
  OPENROUTER_API_KEY: z.string().default(''),
  OPENROUTER_BASE_URL: z.string().default('https://openrouter.ai/api/v1'),
  OPENROUTER_MODEL_PLANNER: z.string().default('google/gemini-3.1-pro-preview'),
  OPENROUTER_MODEL_INTERVIEWER: z.string().default('google/gemini-3-flash-preview'),
  OPENROUTER_MODEL_REVIEWER: z.string().default('google/gemini-3.1-pro-preview'),
  OPENROUTER_MODEL_ANALYST: z.string().default('google/gemini-3.1-pro-preview'),

  // Shared secret the agent worker presents to the /begin,/next-turn,/complete routes.
  AGENT_SERVICE_TOKEN: z.string().default('dev-agent-token'),

  DEEPGRAM_API_KEY: z.string().default(''),
  CARTESIA_API_KEY: z.string().default(''),
  ELEVENLABS_API_KEY: z.string().default(''),

  // Persistence: 'sqlite' (default, durable single-host file) or 'postgres'
  // (Supabase / Neon / RDS — set DATABASE_URL to the connection string).
  DB_PROVIDER: z.enum(['sqlite', 'postgres']).default('sqlite'),
  DATABASE_URL: z.string().default(''),
  JWT_SECRET: z.string().default('dev-jwt-secret-change-me'),
});

export type Env = z.infer<typeof EnvSchema>;

// The dev defaults above let the app + tests boot without real credentials, but
// they are forgeable (anyone who knows the default JWT_SECRET can mint user
// tokens; the default LIVEKIT_API_SECRET forges room access). In production we
// refuse to boot on any of them rather than silently run insecure.
const INSECURE_DEFAULTS: Partial<Record<keyof Env, string>> = {
  JWT_SECRET: 'dev-jwt-secret-change-me',
  AGENT_SERVICE_TOKEN: 'dev-agent-token',
  LIVEKIT_API_KEY: 'devkey',
  LIVEKIT_API_SECRET: 'devsecret-please-change-32chars-min',
  LIVEKIT_URL: 'wss://example.livekit.cloud',
};

/** The API key for the currently-selected LLM provider. */
export function activeLlmKey(e: Env): string {
  switch (e.LLM_PROVIDER) {
    case 'openai': return e.OPENAI_API_KEY;
    case 'gemini': return e.GEMINI_API_KEY;
    case 'openrouter': return e.OPENROUTER_API_KEY;
    case 'anthropic':
    default: return e.ANTHROPIC_API_KEY;
  }
}

export function assertProductionConfig(e: Env): void {
  if (e.NODE_ENV !== 'production') return;
  const problems: string[] = [];
  for (const [key, dev] of Object.entries(INSECURE_DEFAULTS)) {
    if (e[key as keyof Env] === dev) problems.push(`${key} is still the insecure dev default`);
  }
  // The selected provider's key must be present — an empty key would silently
  // fall back to the offline stub, never acceptable in prod.
  if (!activeLlmKey(e)) problems.push(`the API key for LLM_PROVIDER='${e.LLM_PROVIDER}' is empty (the interview brain would fall back to the offline stub)`);
  if (e.JWT_SECRET.length < 16) problems.push('JWT_SECRET is too short (use ≥16 random chars)');
  if (problems.length) {
    throw new Error(
      `Refusing to boot in production with insecure config:\n  - ${problems.join('\n  - ')}\n` +
        'Set real values (see repo-root .env.example).',
    );
  }
}

export const env: Env = EnvSchema.parse(process.env);
assertProductionConfig(env);

export const corsOrigins = (): string[] =>
  env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);

export const hasLiveCreds = (): boolean =>
  !!process.env.LIVEKIT_API_KEY && !!process.env.LIVEKIT_API_SECRET && !!process.env.ANTHROPIC_API_KEY;
