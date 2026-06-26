import { describe, it, expect } from 'vitest';
import { MemoryStore } from '../src/store.js';
import type { InterviewState } from '../src/domain.js';

function state(version: number): InterviewState {
  return {
    sessionId: 's1', configId: 'c1', version, cursorIndex: 0,
    plan: { sessionId: 's1', version: 0, openingLine: 'hi', rubricSummary: 'r', questions: [{ id: 'q1', competency: 'communication', intent: 'x', prompt: 'p', difficulty: 2, followupHints: [], askIfTimeAllows: false }] },
    turns: [], notes: [], reviews: [], phase: 'in_progress', wrapping: false, recordingEnabled: false,
  };
}

describe('MemoryStore concurrency + isolation', () => {
  it('getState returns a clone — mutating it does not affect stored state', async () => {
    const store = new MemoryStore();
    await store.saveState(state(0));
    const a = await store.getState('s1');
    a!.version = 99;
    a!.notes.push('mutated');
    const b = await store.getState('s1');
    expect(b!.version).toBe(0);
    expect(b!.notes).toHaveLength(0);
  });

  it('saveStateIfVersion succeeds when version matches, fails on conflict', async () => {
    const store = new MemoryStore();
    await store.saveState(state(0));
    expect(await store.saveStateIfVersion(state(1), 0)).toBe(true); // stored was 0
    // now stored.version is 1; a writer that read version 0 must fail (lost-update guard)
    expect(await store.saveStateIfVersion(state(5), 0)).toBe(false);
    expect((await store.getState('s1'))!.version).toBe(1);
  });
});
