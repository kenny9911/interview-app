// D12 scoring-calibration gate — runs the REAL Analyst (skipped when no
// ANTHROPIC_API_KEY) to prove the fairness claims, not just assert them in prose:
//  (1) verbosity-bias: a padded empty answer must NOT outscore a concise one,
//  (2) golden bands: strong/weak transcripts land in the expected band.
import { describe, it, expect } from 'vitest';
import { analyzeInterview } from '../src/agents.js';
import { createAnthropicClient } from '../src/llm/index.js';
import type { InterviewConfig } from '../src/domain.js';

const HAS_KEY = !!process.env.ANTHROPIC_API_KEY;
const realIt = HAS_KEY ? it : it.skip;

// A present-but-unfunded key (or a transient outage) is an ENVIRONMENT issue, not
// a scoring regression — skip rather than fail so the suite stays green. Catches
// the Anthropic 400 "credit balance is too low", auth, and overload/rate errors.
const ENV_ERR = /credit balance is too low|billing|insufficient|invalid x-api-key|authentication|overloaded|rate limit|429|529/i;
const tolerant = (fn: (ctx: { skip: () => void }) => Promise<void>) => async (ctx: { skip: () => void }) => {
  try { await fn(ctx); }
  catch (e) {
    if (e instanceof Error && ENV_ERR.test(e.message)) { console.warn('[calibration] skipped — API unavailable:', e.message.slice(0, 80)); ctx.skip(); return; }
    throw e;
  }
};

const config: InterviewConfig = {
  id: 'cal', userId: 'eval', mode: 'mock', role: 'Product Manager', persona: 'aria',
  style: 'balanced', language: 'en', lengthMinutes: 15, createdAt: new Date(0).toISOString(),
};
const Q = 'Tell me about a product decision you owned and its impact.';
const CONCISE = [{ q: Q, a: 'I owned our checkout redesign. I cut the form from 9 fields to 4, A/B tested on 50% of traffic for two weeks, and cart drop-off fell from 31% to 25% — about 4,000 extra completed orders a month. I shipped the smaller version first because the data showed field count, not payment options, was the blocker.' }];
const PADDED = [{ q: Q, a: 'So product is really about the user at the end of the day, and I think a lot about that. We did a lot of great work as a team and I was definitely involved in decisions. It was a journey and we learned so much. I really care about impact and moving metrics and all of that, and I think that came through in everything we did together.' }];
const STRONG = [
  { q: Q, a: 'I owned the onboarding revamp; activation rose from 38% to 52% in a quarter after I sequenced steps by drop-off data and removed two optional fields.' },
  { q: 'Tell me about a disagreement.', a: 'Engineering wanted a full rebuild; I proposed a thin adapter, we shipped in three weeks instead of three months, and revisited the rebuild once we had usage data.' },
];

describe('D12 scoring calibration (real API)', () => {
  realIt('does not let a padded, empty answer outscore a concise, specific one', tolerant(async () => {
    const llm = createAnthropicClient();
    const [concise, padded] = await Promise.all([
      analyzeInterview(llm, config, 'concise', CONCISE),
      analyzeInterview(llm, config, 'padded', PADDED),
    ]);
    expect(concise.overallScore).toBeGreaterThanOrEqual(padded.overallScore);
    expect(concise.overallScore - padded.overallScore).toBeGreaterThanOrEqual(15); // clear, not marginal
    expect(padded.overallScore).toBeLessThan(60);
  }), 120_000);

  realIt('lands a strong transcript in a strong/exceptional band', tolerant(async () => {
    const llm = createAnthropicClient();
    const strong = await analyzeInterview(llm, config, 'strong', STRONG);
    expect(strong.overallScore).toBeGreaterThanOrEqual(70);
    expect(['strong', 'exceptional']).toContain(strong.band);
    expect(strong.competencyScores.some((c) => c.evidence.length > 0)).toBe(true);
  }), 120_000);

  realIt('is self-consistent across runs (D12 variance gate)', tolerant(async () => {
    const llm = createAnthropicClient();
    const runs = await Promise.all([0, 1, 2].map(() => analyzeInterview(llm, config, 'consist', STRONG)));
    const scores = runs.map((r) => r.overallScore);
    const spread = Math.max(...scores) - Math.min(...scores);
    expect(spread).toBeLessThanOrEqual(15); // run-to-run overall score stays in a tight band
    const bands = new Set(runs.map((r) => r.band));
    expect(bands.size).toBeLessThanOrEqual(2); // at most one band boundary of wobble
  }), 180_000);
});
