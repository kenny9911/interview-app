// HTTP entry point. Wires the real Anthropic client (or a clear error if no key)
// and starts Fastify.
import { mkdirSync } from 'node:fs';
import { env, hasLiveCreds, activeLlmKey } from './env.js';
import { buildApp } from './app.js';
import { createLlmClient } from './llm/index.js';
import { createDevStubClient } from './llm/devStub.js';
import { MemoryStore, type Store } from './store.js';
import { SqliteStore } from './sqliteStore.js';
import { createPostgresStore } from './postgresStore.js';

function makeLlm() {
  // Use the provider selected by LLM_PROVIDER (anthropic | openai | gemini | openrouter).
  if (activeLlmKey(env)) {
    console.log(`[viva] LLM provider: ${env.LLM_PROVIDER}`);
    return createLlmClient();
  }
  // No key for the selected provider: boot with a smart per-agent stub so the UI flow works.
  console.warn(`[viva] no API key for LLM_PROVIDER='${env.LLM_PROVIDER}' — using the offline dev stub. Set the key in .env for real planning/analysis.`);
  return createDevStubClient();
}

async function makeStore(): Promise<Store> {
  // Tests inject MemoryStore. Production persists to Postgres (Supabase) when
  // DB_PROVIDER=postgres, else a durable on-disk SQLite file (DATA_DIR overrides).
  if (env.NODE_ENV === 'test') return new MemoryStore();
  if (env.DB_PROVIDER === 'postgres') {
    if (!env.DATABASE_URL) throw new Error('DB_PROVIDER=postgres requires DATABASE_URL (your Supabase connection string)');
    const store = await createPostgresStore(env.DATABASE_URL);
    console.log('[viva] persistence: Postgres (DATABASE_URL)');
    return store;
  }
  const dir = process.env.DATA_DIR ?? './data';
  mkdirSync(dir, { recursive: true });
  const store = new SqliteStore(`${dir}/viva.db`);
  console.log(`[viva] persistence: SQLite at ${dir}/viva.db`);
  return store;
}

async function main(): Promise<void> {
  const app = buildApp({ llm: makeLlm(), store: await makeStore() });
  await app.listen({ port: env.API_PORT, host: '0.0.0.0' });
  console.log(`[viva] API on :${env.API_PORT}  (live creds: ${hasLiveCreds() ? 'yes' : 'no — dev/stub mode'})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
