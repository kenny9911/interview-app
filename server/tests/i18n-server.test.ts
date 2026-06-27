import { describe, it, expect } from 'vitest';
import {
  plannerPrompts, interviewerSystem, interviewerTurnUser, reviewerPrompts, analystPrompts,
} from '../src/prompts/agents.js';
import { extractControlToken, stripControlToken, CTRL_MARKER } from '../src/llm/json.js';
import { analyzeInterview } from '../src/agents.js';
import { MockLlmClient } from '../src/llm/mock.js';
import type { InterviewConfig, InterviewState, Turn } from '../src/domain.js';

const zhConfig: InterviewConfig = {
  id: 'c', userId: 'u', mode: 'mock', role: '产品经理', persona: 'aria',
  style: 'balanced', language: 'zh-Hans', lengthMinutes: 10, createdAt: new Date(0).toISOString(),
};

const plan = {
  sessionId: 's', version: 0, openingLine: '欢迎，我们开始吧。', rubricSummary: 'x',
  questions: [{ id: 'q1', competency: 'communication' as const, intent: 'warmup', prompt: '介绍一下你自己。', difficulty: 1, followupHints: [], askIfTimeAllows: false }],
};
const state: InterviewState = {
  sessionId: 's', configId: 'c', version: 0, cursorIndex: 0, plan, turns: [], notes: [],
  reviews: [], phase: 'greeting', wrapping: false, recordingEnabled: false,
};

describe('language threading into prompts', () => {
  it('injects the OUTPUT LANGUAGE directive into all four builders (zh-Hans → Simplified)', () => {
    const turn: Turn = { questionId: 'q1', index: 0, interviewerText: '介绍一下你自己。', candidateText: '我负责了支付系统的重构。' };
    const systems = [
      plannerPrompts(zhConfig).system,
      interviewerSystem(zhConfig),
      reviewerPrompts(zhConfig, state, turn).system,
      analystPrompts(zhConfig, [{ q: '介绍一下你自己。', a: '我负责了支付系统的重构。' }]).system,
    ];
    for (const s of systems) {
      expect(s).toContain('OUTPUT LANGUAGE');
      expect(s).toContain('Simplified Chinese');
    }
  });

  it('keeps the control token English/ASCII in the interviewer system prompt', () => {
    expect(interviewerSystem(zhConfig)).toContain('MUST stay in English/ASCII');
  });

  it('reinforces the spoken language in the greeting turn (non-en only)', () => {
    expect(interviewerTurnUser(state, null, 'zh-Hans')).toContain('Speak in Chinese (Mandarin)');
    expect(interviewerTurnUser(state, null, 'en')).not.toContain('Speak in');
  });
});

describe('control token survives a CJK / full-width-punctuation model', () => {
  it('parses a full-width-brace control token and never leaks it into the spoken line', () => {
    // A non-English model emits the control JSON with full-width punctuation.
    const raw = '那很好，请继续。\n' + CTRL_MARKER + '｛"action":"dig","reason":"想深入了解"｝';
    expect(extractControlToken(raw)).toMatchObject({ action: 'dig' });
    const spoken = stripControlToken(raw);
    expect(spoken).not.toContain(CTRL_MARKER);
    expect(spoken).not.toContain('action');
    expect(spoken).not.toMatch(/[｛｝]/);
    expect(spoken).toContain('请继续');
  });
});

describe('Analyst integrity guards work for a CJK transcript', () => {
  it('keeps verbatim CJK evidence, drops fabricated, scrubs CJK affect', async () => {
    const transcript = [{ q: '介绍一个你主导的项目。', a: '我负责了支付系统的重构，把延迟降低了百分之四十。' }];
    const poisoned = new MockLlmClient((req) => {
      if (req.system.includes('Interview Analyst')) {
        return JSON.stringify({
          sessionId: 's', overallScore: 80, band: 'strong',
          competencyScores: [
            { competency: 'communication', score: 82, summary: '表达清晰。他回答时显得很紧张。', evidence: ['支付系统的重构', '我从来没说过这句假话'] },
            { competency: 'structure', score: 75, summary: '结构合理。', evidence: [] },
            { competency: 'depth', score: 78, summary: '有具体数字。', evidence: ['把延迟降低了'] },
            { competency: 'confidence', score: 79, summary: '论点明确。', evidence: [] },
          ],
          stoodOut: '给出了具体的指标。',
          workOn: '可以更早点出结论。',
          perQuestion: [{ questionId: 'q1', question: '介绍一个你主导的项目。', feedback: '不错。', evidenceQuote: '我从来没说过这句假话' }],
          noAffectStatement: '评分只基于内容。',
          generatedAt: new Date(0).toISOString(),
        });
      }
      return '{}';
    });
    const report = await analyzeInterview(poisoned, zhConfig, 's', transcript);

    const comm = report.competencyScores.find((c) => c.competency === 'communication')!;
    expect(comm.evidence).toContain('支付系统的重构'); // verbatim CJK survives
    expect(comm.evidence).not.toContain('我从来没说过这句假话'); // fabricated dropped
    expect(comm.summary).not.toContain('紧张'); // CJK affect scrubbed
    expect(comm.summary).toContain('表达清晰');
    expect(report.perQuestion[0]!.evidenceQuote).toBe(''); // fabricated quote blanked
    expect(report.overallScore).toBe(Math.round((82 + 75 + 78 + 79) / 4));
  });
});
