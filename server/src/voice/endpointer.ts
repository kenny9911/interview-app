// Two-layer endpointer decision (pure, unit-tested). Combines VAD silence with
// the semantic turn-detector probability, gated per interview style, with a
// one-shot "still thinking" grace for short/early answers.
// (docs/30-voice-architecture.md; docs/15-decisions.md D5.)
import type { Style } from '../domain.js';

export interface StyleEndpointConfig {
  minSilenceMs: number;
  maxSilenceMs: number;
  turnEndProb: number;
}

export const STYLE_ENDPOINT: Record<Style, StyleEndpointConfig> = {
  friendly: { minSilenceMs: 700, maxSilenceMs: 4000, turnEndProb: 0.55 },
  balanced: { minSilenceMs: 500, maxSilenceMs: 3000, turnEndProb: 0.62 },
  tough: { minSilenceMs: 350, maxSilenceMs: 2000, turnEndProb: 0.7 },
};

export const STILL_THINKING_GRACE_MS = 1500;
const STILL_THINKING_MAX_WORDS = 4;

export interface EndpointInput {
  style: Style;
  vadSilenceMs: number; // continuous trailing silence from VAD
  turnEndProb: number; // 0..1 from the semantic turn detector
  wordCount: number; // words in the current (partial/final) utterance
  graceUsed: boolean; // whether the one-shot grace was already applied this turn
}

export interface EndpointDecision {
  endpoint: boolean;
  useGrace: boolean; // caller should mark graceUsed=true and wait once more
  reason: 'below_min' | 'prob' | 'max_silence' | 'grace';
}

export function decideEndpoint(input: EndpointInput): EndpointDecision {
  const cfg = STYLE_ENDPOINT[input.style];

  // One-shot grace: very short answer + a pause → give the user more time once.
  if (
    !input.graceUsed &&
    input.wordCount < STILL_THINKING_MAX_WORDS &&
    input.vadSilenceMs >= cfg.minSilenceMs &&
    input.vadSilenceMs < cfg.minSilenceMs + STILL_THINKING_GRACE_MS &&
    input.turnEndProb < cfg.turnEndProb
  ) {
    return { endpoint: false, useGrace: true, reason: 'grace' };
  }

  if (input.vadSilenceMs < cfg.minSilenceMs) {
    return { endpoint: false, useGrace: false, reason: 'below_min' };
  }
  if (input.turnEndProb >= cfg.turnEndProb) {
    return { endpoint: true, useGrace: false, reason: 'prob' };
  }
  if (input.vadSilenceMs >= cfg.maxSilenceMs) {
    return { endpoint: true, useGrace: false, reason: 'max_silence' };
  }
  return { endpoint: false, useGrace: false, reason: 'below_min' };
}
