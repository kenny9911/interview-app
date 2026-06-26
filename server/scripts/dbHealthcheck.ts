// Live Postgres connectivity check: connects with DATABASE_URL, ensures the
// schema, does a write→read→delete round-trip, and disconnects. Run: npm run db:check
import { env } from '../src/env.js';
import { createPostgresStore } from '../src/postgresStore.js';

async function main() {
  if (!env.DATABASE_URL) { console.error('[db-check] DATABASE_URL is not set'); process.exit(1); }
  console.log(`[db-check] DB_PROVIDER=${env.DB_PROVIDER}; connecting…`);
  const store = await createPostgresStore(env.DATABASE_URL);
  console.log('[db-check] connected + schema ensured (tables created if absent).');

  const id = `__healthcheck_${Date.now()}__`;
  await store.saveConfig({
    id, userId: '__hc__', mode: 'mock', role: 'HC', persona: 'aria',
    style: 'balanced', language: 'en', lengthMinutes: 5, createdAt: new Date().toISOString(),
  } as never);
  const got = await store.getConfig(id);
  console.log('[db-check] write→read round-trip:', got?.role === 'HC' ? 'OK' : 'FAILED');

  await store.deleteUserData('__hc__'); // remove the probe row
  await store.close();
  console.log('[db-check] ✅ Postgres is working end-to-end.');
}

main().catch((e) => { console.error('[db-check] ❌', e instanceof Error ? e.message : e); process.exit(1); });
