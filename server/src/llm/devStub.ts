// Offline dev stub: returns schema-valid responses per agent so the whole flow
// (plan → live turns → analysis) works with NO ANTHROPIC_API_KEY — useful for
// UI development and demos. Real runs use the Anthropic client.
import { MockLlmClient } from './mock.js';
import { CTRL_MARKER } from './json.js';

export function createDevStubClient(): MockLlmClient {
  return new MockLlmClient((req) => {
    const s = req.system;
    if (s.includes('Interview Question Planner')) {
      return JSON.stringify({
        sessionId: 'stub', version: 0,
        openingLine: "Thanks for making the time — I'm looking forward to this. Ready when you are.",
        rubricSummary: 'communication / structure / depth / confidence',
        questions: [
          { id: 'q1', competency: 'communication', intent: 'warmup', prompt: 'To start, tell me a little about yourself and what draws you to this role.', difficulty: 1, followupHints: ['ask for a concrete example'], askIfTimeAllows: false },
          { id: 'q2', competency: 'depth', intent: 'ownership', prompt: 'Tell me about a project you owned end to end — what was your role and the outcome?', difficulty: 3, followupHints: ['probe for a metric'], askIfTimeAllows: false },
          { id: 'q3', competency: 'structure', intent: 'conflict', prompt: 'Describe a time you disagreed with a teammate. How did you handle it?', difficulty: 3, followupHints: ['what did they trade off'], askIfTimeAllows: false },
        ],
      });
    }
    if (s.includes('live spoken interview')) {
      return `Thanks for sharing that — it's helpful. Can you walk me through a specific example?\n${CTRL_MARKER}{"action":"advance","reason":"adequate"}`;
    }
    if (s.includes('Response Reviewer')) {
      return JSON.stringify({
        questionId: 'q1', basedOnVersion: 0,
        scores: [{ competency: 'communication', score: 80, evidenceQuote: 'I led the project', rationale: 'clear ownership' }],
        note: 'solid; could quantify', patch: { op: 'none', targetQuestionId: 'q1' },
      });
    }
    if (s.includes('Interview Analyst')) {
      return JSON.stringify({
        sessionId: 'stub', overallScore: 79, band: 'strong',
        competencyScores: [
          { competency: 'communication', score: 84, summary: 'Clear and easy to follow.', evidence: ['I led the redesign'] },
          { competency: 'structure', score: 74, summary: 'Mostly organized; lead with the result.', evidence: ['first we, then we'] },
          { competency: 'depth', score: 80, summary: 'Good specifics in places.', evidence: ['cut load time'] },
          { competency: 'confidence', score: 78, summary: 'Assertive, well-supported claims.', evidence: ['I decided to'] },
        ],
        stoodOut: 'You gave a concrete, ownership-focused example with a real outcome.',
        workOn: 'Open answers with the result first, then the context — it lands harder.',
        perQuestion: [
          { questionId: 'q1', question: 'Tell me about yourself.', feedback: 'Warm and clear — add one signature achievement.', evidenceQuote: 'I led the redesign' },
        ],
        noAffectStatement: 'Scores reflect only what you said — never tone, accent, or appearance.',
        generatedAt: new Date(0).toISOString(),
      });
    }
    return '{}';
  });
}
