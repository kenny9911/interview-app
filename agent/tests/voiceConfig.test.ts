import { afterEach, describe, expect, it } from 'vitest';
import { vadTuning, endpointingForStyle, interruptionForStyle } from '../src/voiceConfig.js';

// Keep env hermetic: snapshot the keys these tests touch and restore after each.
const TOUCHED = [
  'VAD_MIN_SILENCE_MS', 'VAD_ACTIVATION_THRESHOLD',
  'ENDPOINT_MIN_DELAY_MS_BALANCED', 'ENDPOINT_MAX_DELAY_MS_TOUGH',
  'INTERRUPT_MIN_WORDS_FRIENDLY',
];
afterEach(() => { for (const k of TOUCHED) delete process.env[k]; });

describe('endpointing (ms units)', () => {
  it('uses MILLISECONDS, not the old seconds values that read as ~0ms', () => {
    // Regression guard for the units bug: the previous table used 0.5/3.0 which the
    // LiveKit API interprets as 0.5ms/3ms — effectively no endpointing grace.
    for (const style of ['friendly', 'balanced', 'tough'] as const) {
      const { minDelay, maxDelay } = endpointingForStyle(style);
      expect(minDelay).toBeGreaterThanOrEqual(300);
      expect(maxDelay).toBeGreaterThanOrEqual(2000);
      expect(maxDelay).toBeGreaterThan(minDelay);
    }
  });

  it('is snappiest for tough and most patient for friendly', () => {
    expect(endpointingForStyle('tough').minDelay).toBeLessThan(endpointingForStyle('balanced').minDelay);
    expect(endpointingForStyle('balanced').minDelay).toBeLessThan(endpointingForStyle('friendly').minDelay);
  });

  it('is env-overridable per style', () => {
    process.env.ENDPOINT_MIN_DELAY_MS_BALANCED = '420';
    process.env.ENDPOINT_MAX_DELAY_MS_TOUGH = '1800';
    expect(endpointingForStyle('balanced').minDelay).toBe(420);
    expect(endpointingForStyle('tough').maxDelay).toBe(1800);
  });
});

describe('vadTuning', () => {
  it('shortens the raw silence gate below the 550ms library default', () => {
    expect(vadTuning().minSilenceDuration).toBeLessThan(550);
  });
  it('honors env overrides and ignores non-numeric ones', () => {
    process.env.VAD_MIN_SILENCE_MS = '275';
    expect(vadTuning().minSilenceDuration).toBe(275);
    process.env.VAD_ACTIVATION_THRESHOLD = 'not-a-number';
    expect(vadTuning().activationThreshold).toBe(0.5); // falls back to default
  });
});

describe('interruptionForStyle', () => {
  it('requires sustained speech and at least one word by default (rejects coughs/echo)', () => {
    const b = interruptionForStyle('balanced');
    expect(b.minDuration).toBeGreaterThan(0);
    expect(b.minWords).toBeGreaterThanOrEqual(1);
    expect(b.resumeFalseInterruption).toBe(true);
  });
  it('lets tough interviewers yield faster than friendly', () => {
    expect(interruptionForStyle('tough').minDuration).toBeLessThan(interruptionForStyle('friendly').minDuration);
  });
  it('is env-overridable', () => {
    process.env.INTERRUPT_MIN_WORDS_FRIENDLY = '3';
    expect(interruptionForStyle('friendly').minWords).toBe(3);
  });
});
