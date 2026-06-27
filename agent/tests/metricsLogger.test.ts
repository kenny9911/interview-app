import { describe, expect, it } from 'vitest';
import { summarizeMetric, formatMetricLine } from '../src/metricsLogger.js';

describe('summarizeMetric', () => {
  it('extracts EOU endpointing timings (the key fields for tuning delays)', () => {
    expect(summarizeMetric({ type: 'eou_metrics', endOfUtteranceDelayMs: 612.4, transcriptionDelayMs: 140.2 }))
      .toEqual({ kind: 'eou', endOfUtteranceDelayMs: 612, transcriptionDelayMs: 140 });
  });

  it('extracts TTS first-audio (ttfb) and durations', () => {
    expect(summarizeMetric({ type: 'tts_metrics', ttfbMs: 210.9, durationMs: 1840 }))
      .toEqual({ kind: 'tts', ttfbMs: 211, durationMs: 1840 });
  });

  it('extracts LLM time-to-first-token', () => {
    expect(summarizeMetric({ type: 'llm_metrics', ttftMs: 333 })).toEqual({ kind: 'llm', ttftMs: 333 });
  });

  it('drops undefined fields so lines stay compact', () => {
    expect(summarizeMetric({ type: 'stt_metrics', durationMs: 90 })).toEqual({ kind: 'stt', durationMs: 90 });
  });

  it('returns null for metric kinds we do not record', () => {
    expect(summarizeMetric({ type: 'realtime_model_metrics' })).toBeNull();
    expect(summarizeMetric({})).toBeNull();
  });
});

describe('formatMetricLine', () => {
  it('produces a greppable [voice-metrics] JSON line', () => {
    const line = formatMetricLine({ type: 'eou_metrics', endOfUtteranceDelayMs: 500 });
    expect(line).toBe('[voice-metrics] {"kind":"eou","endOfUtteranceDelayMs":500}');
  });
  it('returns null for uninteresting metrics', () => {
    expect(formatMetricLine({ type: 'avatar_metrics' })).toBeNull();
  });
});
