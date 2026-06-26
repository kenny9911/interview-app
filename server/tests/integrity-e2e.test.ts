import { describe, it, expect } from 'vitest';
import { analyzeInterview } from '../src/agents.js';
import { MockLlmClient } from '../src/llm/mock.js';
import type { InterviewConfig } from '../src/domain.js';

const config: InterviewConfig = {
  id: 'c', userId: 'u', mode: 'mock', role: 'Product Manager', persona: 'aria',
  style: 'balanced', language: 'en', lengthMinutes: 10, createdAt: new Date(0).toISOString(),
};

// A poisoned Analyst that fabricates a quote and leaks affect language — the
// deterministic integrity guards must neutralize both without a real model.
function poisonedAnalyst() {
  return new MockLlmClient((req) => {
    if (req.system.includes('Interview Analyst')) {
      return JSON.stringify({
        sessionId: 's', overallScore: 80, band: 'strong',
        competencyScores: [
          { competency: 'communication', score: 80, summary: 'Clear.', evidence: ['I cut latency by 40 percent', 'I never actually said this fabricated claim'] },
          { competency: 'structure', score: 70, summary: 'Organized.', evidence: [] },
          { competency: 'depth', score: 75, summary: 'Specific.', evidence: [] },
          { competency: 'confidence', score: 78, summary: 'Assertive.', evidence: [] },
        ],
        stoodOut: 'She came across as nervous but the content was strong.',
        workOn: 'Lead with the result.',
        perQuestion: [{ questionId: 'q1', question: 'Tell me about an impact.', feedback: 'Good.', evidenceQuote: 'I never actually said this fabricated claim' }],
        noAffectStatement: 'Scores reflect only content.',
        generatedAt: new Date(0).toISOString(),
      });
    }
    return '{}';
  });
}

describe('integrity guards end-to-end (deterministic)', () => {
  it('drops fabricated evidence and scrubs affect language from the report', async () => {
    const transcript = [{ q: 'Tell me about an impact.', a: 'I cut latency by 40 percent and owned the rollout.' }];
    const report = await analyzeInterview(poisonedAnalyst(), config, 's', transcript);

    // fabricated evidence is removed; the verbatim one survives
    const comm = report.competencyScores.find((c) => c.competency === 'communication')!;
    expect(comm.evidence).toContain('I cut latency by 40 percent');
    expect(comm.evidence).not.toContain('I never actually said this fabricated claim');

    // affect language is scrubbed (and never surfaced as empty)
    expect(report.stoodOut.toLowerCase()).not.toContain('nervous');
    expect(report.stoodOut.toLowerCase()).not.toContain('came across as');
    expect(report.stoodOut.length).toBeGreaterThan(0);

    // a per-question evidence quote that isn't in the transcript is blanked
    expect(report.perQuestion[0]!.evidenceQuote).toBe('');

    // overall is the transparent mean of the competencies (deterministic)
    expect(report.overallScore).toBe(Math.round((80 + 70 + 75 + 78) / 4));
  });
});
