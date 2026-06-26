import { describe, it, expect } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync } from 'node:fs';
import { SqliteStore } from '../src/sqliteStore.js';

const tmp = () => join(tmpdir(), `viva-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);

const baseState = (sessionId: string, version = 0) => ({
  sessionId, configId: 'c1', version, cursorIndex: 0,
  plan: { sessionId, version: 0, questions: [] },
  turns: [], notes: [], reviews: [], phase: 'greeting', wrapping: false, recordingEnabled: false,
}) as never;

describe('SqliteStore (real persistence)', () => {
  it('persists data across a reopen (survives a server restart)', async () => {
    const path = tmp();
    {
      const s = new SqliteStore(path);
      await s.saveConfig({ id: 'c1', userId: 'u1', mode: 'mock', role: 'PM', persona: 'aria', style: 'balanced', language: 'en', lengthMinutes: 10, createdAt: '2026-01-01T00:00:00Z' } as never);
      await s.saveSummary({ sessionId: 's1', userId: 'u1', mode: 'mock', role: 'PM', createdAt: '2026-01-01T00:00:00Z', status: 'created' } as never);
      await s.saveReport({ sessionId: 's1', overallScore: 82, band: 'strong' } as never);
    }
    // brand-new instance against the same file = simulated restart
    const s2 = new SqliteStore(path);
    expect((await s2.getConfig('c1'))?.role).toBe('PM');
    expect((await s2.getReport('s1'))?.overallScore).toBe(82);
    expect((await s2.listSummaries('u1')).map((x) => x.sessionId)).toEqual(['s1']);
    rmSync(path, { force: true });
  });

  it('CAS: saveStateIfVersion rejects a stale expected version', async () => {
    const path = tmp();
    const s = new SqliteStore(path);
    await s.saveState(baseState('s1', 0));
    expect(await s.saveStateIfVersion(baseState('s1', 1), 0)).toBe(true);   // 0 matches stored → ok, now v1
    expect(await s.saveStateIfVersion(baseState('s1', 2), 0)).toBe(false);  // stale expected 0 → reject
    expect((await s.getState('s1'))?.version).toBe(1);
    rmSync(path, { force: true });
  });

  it('isolates stored objects by value (no mutate-by-reference)', async () => {
    const path = tmp();
    const s = new SqliteStore(path);
    await s.saveState(baseState('s2', 0));
    const got = await s.getState('s2');
    (got as { notes: string[] }).notes.push('mutated');
    expect((await s.getState('s2')) as { notes: string[] }).toMatchObject({ notes: [] });
    rmSync(path, { force: true });
  });

  it('listSummaries returns newest-first and scoped to the user', async () => {
    const path = tmp();
    const s = new SqliteStore(path);
    await s.saveSummary({ sessionId: 'a', userId: 'u1', mode: 'mock', role: 'PM', createdAt: '2026-01-01T00:00:00Z', status: 'complete' } as never);
    await s.saveSummary({ sessionId: 'b', userId: 'u1', mode: 'mock', role: 'PM', createdAt: '2026-02-01T00:00:00Z', status: 'complete' } as never);
    await s.saveSummary({ sessionId: 'c', userId: 'other', mode: 'mock', role: 'PM', createdAt: '2026-03-01T00:00:00Z', status: 'complete' } as never);
    expect((await s.listSummaries('u1')).map((x) => x.sessionId)).toEqual(['b', 'a']);
    rmSync(path, { force: true });
  });

  it('persists user accounts (by id + email, case-insensitive) across reopen', async () => {
    const path = tmp();
    {
      const s = new SqliteStore(path);
      await s.saveUser({ id: 'u1', email: 'maya@example.com', passwordHash: 'scrypt$a$b', createdAt: '2026-01-01T00:00:00Z' } as never);
    }
    const s2 = new SqliteStore(path);
    expect((await s2.getUser('u1'))?.email).toBe('maya@example.com');
    expect((await s2.getUserByEmail('MAYA@example.com'))?.id).toBe('u1'); // normalized lookup
    expect(await s2.getUserByEmail('nobody@example.com')).toBeNull();
    rmSync(path, { force: true });
  });

  it('deleteUserData purges the account + all its configs/sessions/reports, leaving others', async () => {
    const path = tmp();
    const s = new SqliteStore(path);
    await s.saveUser({ id: 'u1', email: 'u1@example.com', passwordHash: 'scrypt$a$b', createdAt: '2026-01-01T00:00:00Z' } as never);
    await s.saveConfig({ id: 'c1', userId: 'u1', mode: 'mock', role: 'PM', persona: 'aria', style: 'balanced', language: 'en', lengthMinutes: 10, createdAt: '2026-01-01T00:00:00Z' } as never);
    await s.saveSummary({ sessionId: 's1', userId: 'u1', mode: 'mock', role: 'PM', createdAt: '2026-01-01T00:00:00Z', status: 'created' } as never);
    await s.saveState(baseState('s1', 0));
    await s.saveReport({ sessionId: 's1', overallScore: 70, band: 'solid' } as never);
    // a second user's data must survive the purge
    await s.saveConfig({ id: 'c2', userId: 'other', mode: 'mock', role: 'PM', persona: 'aria', style: 'balanced', language: 'en', lengthMinutes: 10, createdAt: '2026-01-01T00:00:00Z' } as never);
    await s.saveSummary({ sessionId: 's2', userId: 'other', mode: 'mock', role: 'PM', createdAt: '2026-01-01T00:00:00Z', status: 'created' } as never);

    await s.deleteUserData('u1');

    expect(await s.getUser('u1')).toBeNull();
    expect(await s.getConfig('c1')).toBeNull();
    expect(await s.getState('s1')).toBeNull();
    expect(await s.getReport('s1')).toBeNull();
    expect(await s.listSummaries('u1')).toEqual([]);
    expect(await s.listConfigs('u1')).toEqual([]);
    // untouched second user
    expect((await s.getConfig('c2'))?.id).toBe('c2');
    expect((await s.listSummaries('other')).map((x) => x.sessionId)).toEqual(['s2']);
    rmSync(path, { force: true });
  });
});
