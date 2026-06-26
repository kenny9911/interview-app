// PostgresStore verified against pg-mem (an in-memory Postgres) so the real SQL
// dialect + logic run, no live database needed. The production path uses the same
// class with a real pg.Pool (Supabase/Neon/etc.).
import { describe, it, expect } from 'vitest';
import { newDb } from 'pg-mem';
import type { Pool } from 'pg';
import { PostgresStore } from '../src/postgresStore.js';

async function freshStore(): Promise<PostgresStore> {
  const db = newDb();
  const pg = db.adapters.createPg();
  const pool = new pg.Pool() as unknown as Pool;
  const store = new PostgresStore(pool);
  await store.init();
  return store;
}

const baseState = (sessionId: string, version = 0) => ({
  sessionId, configId: 'c1', version, cursorIndex: 0,
  plan: { sessionId, version: 0, questions: [] },
  turns: [], notes: [], reviews: [], phase: 'greeting', wrapping: false, recordingEnabled: false,
}) as never;

describe('PostgresStore (pg-mem)', () => {
  it('round-trips configs, reports, summaries', async () => {
    const s = await freshStore();
    await s.saveConfig({ id: 'c1', userId: 'u1', mode: 'mock', role: 'PM', persona: 'aria', style: 'balanced', language: 'en', lengthMinutes: 10, createdAt: '2026-01-01T00:00:00Z' } as never);
    await s.saveSummary({ sessionId: 's1', userId: 'u1', mode: 'mock', role: 'PM', createdAt: '2026-01-01T00:00:00Z', status: 'created' } as never);
    await s.saveReport({ sessionId: 's1', overallScore: 82, band: 'strong' } as never);
    expect((await s.getConfig('c1'))?.role).toBe('PM');
    expect((await s.getReport('s1'))?.overallScore).toBe(82);
    expect((await s.listConfigs('u1')).map((c) => c.id)).toEqual(['c1']);
  });

  it('CAS: saveStateIfVersion rejects a stale expected version', async () => {
    const s = await freshStore();
    await s.saveState(baseState('s1', 0));
    expect(await s.saveStateIfVersion(baseState('s1', 1), 0)).toBe(true);  // 0 matches → ok, now v1
    expect(await s.saveStateIfVersion(baseState('s1', 2), 0)).toBe(false); // stale expected 0 → reject
    expect((await s.getState('s1'))?.version).toBe(1);
  });

  it('CAS: inserts a brand-new session (no prior row) regardless of expected version', async () => {
    const s = await freshStore();
    expect(await s.saveStateIfVersion(baseState('new', 0), 0)).toBe(true);
    expect((await s.getState('new'))?.version).toBe(0);
  });

  it('users persist by id + normalized email', async () => {
    const s = await freshStore();
    await s.saveUser({ id: 'u1', email: 'Maya@Example.com', passwordHash: 'scrypt$a$b', createdAt: '2026-01-01T00:00:00Z' } as never);
    expect((await s.getUser('u1'))?.id).toBe('u1');
    expect((await s.getUserByEmail('maya@example.com'))?.id).toBe('u1');
    expect(await s.getUserByEmail('nobody@example.com')).toBeNull();
  });

  it('listSummaries is newest-first and scoped to the user', async () => {
    const s = await freshStore();
    await s.saveSummary({ sessionId: 'a', userId: 'u1', mode: 'mock', role: 'PM', createdAt: '2026-01-01T00:00:00Z', status: 'complete' } as never);
    await s.saveSummary({ sessionId: 'b', userId: 'u1', mode: 'mock', role: 'PM', createdAt: '2026-02-01T00:00:00Z', status: 'complete' } as never);
    await s.saveSummary({ sessionId: 'c', userId: 'other', mode: 'mock', role: 'PM', createdAt: '2026-03-01T00:00:00Z', status: 'complete' } as never);
    expect((await s.listSummaries('u1')).map((x) => x.sessionId)).toEqual(['b', 'a']);
  });

  it('deleteUserData purges the user + all their data, leaving others intact', async () => {
    const s = await freshStore();
    await s.saveUser({ id: 'u1', email: 'u1@example.com', passwordHash: 'scrypt$a$b', createdAt: '2026-01-01T00:00:00Z' } as never);
    await s.saveConfig({ id: 'c1', userId: 'u1', mode: 'mock', role: 'PM', persona: 'aria', style: 'balanced', language: 'en', lengthMinutes: 10, createdAt: '2026-01-01T00:00:00Z' } as never);
    await s.saveSummary({ sessionId: 's1', userId: 'u1', mode: 'mock', role: 'PM', createdAt: '2026-01-01T00:00:00Z', status: 'created' } as never);
    await s.saveState(baseState('s1', 0));
    await s.saveReport({ sessionId: 's1', overallScore: 70, band: 'solid' } as never);
    await s.saveConfig({ id: 'c2', userId: 'other', mode: 'mock', role: 'PM', persona: 'aria', style: 'balanced', language: 'en', lengthMinutes: 10, createdAt: '2026-01-01T00:00:00Z' } as never);
    await s.saveSummary({ sessionId: 's2', userId: 'other', mode: 'mock', role: 'PM', createdAt: '2026-01-01T00:00:00Z', status: 'created' } as never);

    await s.deleteUserData('u1');

    expect(await s.getUser('u1')).toBeNull();
    expect(await s.getConfig('c1')).toBeNull();
    expect(await s.getState('s1')).toBeNull();
    expect(await s.getReport('s1')).toBeNull();
    expect(await s.listSummaries('u1')).toEqual([]);
    // untouched second user
    expect((await s.getConfig('c2'))?.id).toBe('c2');
    expect((await s.listSummaries('other')).map((x) => x.sessionId)).toEqual(['s2']);
  });
});
