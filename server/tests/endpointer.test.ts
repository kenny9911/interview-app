import { describe, it, expect } from 'vitest';
import { decideEndpoint, STYLE_ENDPOINT } from '../src/voice/endpointer.js';

describe('endpointer', () => {
  it('does not end below the per-style min silence', () => {
    const d = decideEndpoint({ style: 'balanced', vadSilenceMs: 300, turnEndProb: 0.99, wordCount: 20, graceUsed: true });
    expect(d.endpoint).toBe(false);
    expect(d.reason).toBe('below_min');
  });

  it('ends on high turn-end probability past min silence', () => {
    const d = decideEndpoint({ style: 'balanced', vadSilenceMs: 600, turnEndProb: 0.8, wordCount: 30, graceUsed: true });
    expect(d.endpoint).toBe(true);
    expect(d.reason).toBe('prob');
  });

  it('ends on max silence even when probability is low', () => {
    const d = decideEndpoint({ style: 'balanced', vadSilenceMs: 3200, turnEndProb: 0.1, wordCount: 30, graceUsed: true });
    expect(d.endpoint).toBe(true);
    expect(d.reason).toBe('max_silence');
  });

  it('grants a one-shot "still thinking" grace for short early answers', () => {
    const d = decideEndpoint({ style: 'friendly', vadSilenceMs: 750, turnEndProb: 0.2, wordCount: 2, graceUsed: false });
    expect(d.endpoint).toBe(false);
    expect(d.useGrace).toBe(true);
    expect(d.reason).toBe('grace');
  });

  it('does not re-grant grace once used', () => {
    const d = decideEndpoint({ style: 'friendly', vadSilenceMs: 750, turnEndProb: 0.2, wordCount: 2, graceUsed: true });
    expect(d.useGrace).toBe(false);
  });

  it('tough style is the most eager to end (lowest thresholds)', () => {
    expect(STYLE_ENDPOINT.tough.minSilenceMs).toBeLessThan(STYLE_ENDPOINT.friendly.minSilenceMs);
    expect(STYLE_ENDPOINT.tough.maxSilenceMs).toBeLessThan(STYLE_ENDPOINT.friendly.maxSilenceMs);
  });
});
