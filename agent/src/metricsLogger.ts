// Structured voice-pipeline metrics → logs you can actually tune from.
//
// The framework emits a MetricsCollected event per turn carrying STT / TTS / VAD /
// EOU (end-of-utterance) / LLM metrics. The live agent previously subscribed to
// none of them, so there was no data to fine-tune VAD thresholds, endpointing
// delays, or barge-in sensitivity. This module turns each metric into a compact,
// greppable JSON line under the `[voice-metrics]` tag, e.g.
//
//   [voice-metrics] {"kind":"eou","endOfUtteranceDelayMs":612,"transcriptionDelayMs":140}
//   [voice-metrics] {"kind":"tts","ttfbMs":210,"durationMs":1840}
//
// so an operator can `grep voice-metrics | jq` to compute p50/p95 of
// endOfUtteranceDelayMs (tune ENDPOINT_*_DELAY_MS_*), ttfbMs (TTS first audio),
// and VAD inference timing, then adjust the env knobs in voiceConfig.ts.
//
// Kept dependency-free (structural input type) so it is unit-testable without
// booting the LiveKit runtime.

export interface MetricLike {
  type?: string;
  label?: string;
  // EOU
  endOfUtteranceDelayMs?: number;
  transcriptionDelayMs?: number;
  // LLM
  ttftMs?: number;
  // TTS
  ttfbMs?: number;
  // common
  durationMs?: number;
  audioDurationMs?: number;
  // VAD
  inferenceDurationTotal?: number;
  inferenceCount?: number;
  [k: string]: unknown;
}

const round = (n: number | undefined): number | undefined =>
  typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : undefined;

// Drop undefined keys so the JSON line stays compact and only carries real fields.
const compact = (o: Record<string, unknown>): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v;
  return out;
};

/**
 * Reduce a raw AgentMetrics object to the few fields worth logging for tuning.
 * Returns null for metric kinds we don't care to record.
 */
export function summarizeMetric(m: MetricLike): Record<string, unknown> | null {
  switch (m.type) {
    case 'eou_metrics':
      return compact({
        kind: 'eou',
        endOfUtteranceDelayMs: round(m.endOfUtteranceDelayMs),
        transcriptionDelayMs: round(m.transcriptionDelayMs),
      });
    case 'tts_metrics':
      return compact({ kind: 'tts', ttfbMs: round(m.ttfbMs), durationMs: round(m.durationMs), audioDurationMs: round(m.audioDurationMs) });
    case 'stt_metrics':
      return compact({ kind: 'stt', durationMs: round(m.durationMs), audioDurationMs: round(m.audioDurationMs) });
    case 'llm_metrics':
      return compact({ kind: 'llm', ttftMs: round(m.ttftMs), durationMs: round(m.durationMs) });
    case 'vad_metrics':
      return compact({
        kind: 'vad',
        inferenceCount: round(m.inferenceCount),
        inferenceDurationTotalMs: round(typeof m.inferenceDurationTotal === 'number' ? m.inferenceDurationTotal : undefined),
      });
    default:
      return null;
  }
}

/** The greppable log line for a metric, or null if the metric is uninteresting. */
export function formatMetricLine(m: MetricLike): string | null {
  const s = summarizeMetric(m);
  return s ? `[voice-metrics] ${JSON.stringify(s)}` : null;
}
