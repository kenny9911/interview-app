import { describe, it, expect } from 'vitest';
import { makeMockLlm } from './_mock.js';
import { planInterview } from '../src/agents.js';
import { TurnLoop } from '../src/voice/turnloop.js';
import type { InterviewConfig, InterviewState } from '../src/domain.js';

const config: InterviewConfig = {
  id: 'cfg1', userId: 'u1', mode: 'mock', role: 'Product Manager', persona: 'aria',
  style: 'balanced', language: 'en', lengthMinutes: 10, createdAt: new Date(0).toISOString(),
};

async function loop() {
  const llm = makeMockLlm();
  const plan = await planInterview(llm, config, 'sess1');
  const state: InterviewState = { sessionId: 'sess1', configId: 'cfg1', version: 0, cursorIndex: 0, plan, turns: [], notes: [], reviews: [], phase: 'greeting', wrapping: false, recordingEnabled: false };
  return new TurnLoop({ llm, config }, state);
}

describe('TurnLoop', () => {
  it('begins by speaking, then listens after TTS', async () => {
    const tl = await loop();
    const begin = await tl.begin();
    expect(begin[0]!.type).toBe('speak');
    expect(tl.orbState()).toBe('speaking');

    const after = tl.onTtsFinished();
    expect(after[0]!.type).toBe('listen');
    expect(tl.orbState()).toBe('listening');
  });

  it('barge-in during speaking cancels TTS and returns to listening', async () => {
    const tl = await loop();
    await tl.begin(); // orb = speaking
    const actions = tl.onUserBargeIn();
    expect(actions.map((a) => a.type)).toEqual(['cancel_tts', 'listen']);
    expect(tl.orbState()).toBe('listening');
  });

  it('ignores barge-in when not speaking', async () => {
    const tl = await loop();
    await tl.begin();
    tl.onTtsFinished(); // listening
    expect(tl.onUserBargeIn()).toEqual([]);
  });

  it('records the answered turn and fires an async review, off the speech path', async () => {
    const tl = await loop();
    await tl.begin();
    tl.onTtsFinished();
    const actions = await tl.onUserEndpoint('I led the redesign and cut latency 40%.');
    expect(actions.some((a) => a.type === 'review')).toBe(true);
    expect(actions.some((a) => a.type === 'speak')).toBe(true);
    expect(tl.state.turns.length).toBe(1);
    expect(tl.state.turns[0]!.candidateText).toMatch(/redesign/);
    expect(tl.orbState()).toBe('speaking');
  });

  it('applyReview adapts the plan so the change reaches the next turn (D2)', async () => {
    const tl = await loop();
    await tl.begin(); // cursor at q1; q2 is a future question
    const q2 = tl.state.plan.questions[1]!;
    const before = q2.difficulty;
    tl.applyReview({
      questionId: 'q1', basedOnVersion: tl.state.version,
      scores: [{ competency: 'depth', score: 90, evidenceQuote: 'I led the redesign', rationale: 'strong' }],
      note: 'push harder', patch: { op: 'raise_difficulty', targetQuestionId: q2.id },
    });
    expect(tl.state.plan.questions[1]!.difficulty).toBe(Math.min(5, before + 1));
  });

  it('wraps and ends once the plan is exhausted', async () => {
    const tl = await loop(); // mock plan has 2 questions, control always "advance"
    await tl.begin();
    tl.onTtsFinished();
    await tl.onUserEndpoint('answer one'); // -> cursor 1
    tl.onTtsFinished();
    await tl.onUserEndpoint('answer two'); // -> cursor 2 == length -> wrapping
    const end = tl.onTtsFinished();
    expect(end[0]!.type).toBe('end');
    expect(tl.orbState()).toBe('idle');
    expect(tl.state.turns.length).toBe(2);
  });
});
