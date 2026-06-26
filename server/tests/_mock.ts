// A smart mock LLM: branches on the agent's system prompt to return schema-valid
// responses, so the orchestration + parsing paths are exercised deterministically.
import { MockLlmClient } from '../src/llm/index.js';
import type { LlmRequest } from '../src/llm/index.js';
import { CTRL_MARKER } from '../src/llm/json.js';

export function makeMockLlm(): MockLlmClient {
  return new MockLlmClient((req: LlmRequest) => {
    const s = req.system;
    if (s.includes('Interview Question Planner')) {
      return JSON.stringify({
        sessionId: 'will-be-overwritten',
        version: 0,
        openingLine: 'Thanks for making the time — ready when you are.',
        rubricSummary: 'communication/structure/depth/confidence',
        questions: [
          { id: 'q1', competency: 'communication', intent: 'warmup', prompt: 'Tell me about yourself.', difficulty: 1, followupHints: ['ask for a specific example'], askIfTimeAllows: false },
          { id: 'q2', competency: 'depth', intent: 'impact', prompt: 'Describe a project you owned end to end.', difficulty: 3, followupHints: ['probe metrics'], askIfTimeAllows: false },
        ],
      });
    }
    if (s.includes('live spoken interview')) {
      // interviewer turn: spoken text + trailing control token
      return `Great — thanks for sharing that. Can you tell me about a time it didn't go to plan?\n${CTRL_MARKER}{"action":"advance","reason":"answer was complete"}`;
    }
    if (s.includes('Response Reviewer')) {
      return JSON.stringify({
        questionId: 'q1',
        basedOnVersion: 0,
        scores: [{ competency: 'communication', score: 78, evidenceQuote: 'I led the redesign', rationale: 'clear ownership stated' }],
        note: 'solid, could quantify impact',
        patch: { op: 'insert_followup', targetQuestionId: 'q2', payload: 'ask for the metric' },
      });
    }
    if (s.includes('Interview Analyst')) {
      return JSON.stringify({
        sessionId: 'will-be-overwritten',
        overallScore: 82,
        band: 'strong',
        competencyScores: [
          { competency: 'communication', score: 88, summary: 'clear and concise', evidence: ['I led the redesign'] },
          { competency: 'structure', score: 76, summary: 'mostly STAR', evidence: ['first we, then we'] },
          { competency: 'depth', score: 84, summary: 'good specifics', evidence: ['cut latency 40%'] },
          { competency: 'confidence', score: 80, summary: 'assertive claims', evidence: ['I was responsible for'] },
        ],
        stoodOut: 'Concrete metric on the redesign answer.',
        workOn: 'Tighten the opening; lead with the result.',
        perQuestion: [
          { questionId: 'q1', question: 'Tell me about yourself.', feedback: 'Good, add a hook.', evidenceQuote: 'I led the redesign' },
        ],
        noAffectStatement: 'Scores reflect only what you said — never tone, accent, or appearance.',
        generatedAt: new Date(0).toISOString(),
      });
    }
    return '{}';
  });
}
