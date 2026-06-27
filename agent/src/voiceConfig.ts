// Voice-pipeline tuning — the single source of truth for VAD, endpointing, and
// barge-in/interruption knobs the live agent applies (agent.ts).
//
// IMPORTANT: every duration here is MILLISECONDS, matching the @livekit/agents
// 1.4 API (silero VADOptions, turnHandling.endpointing.{minDelay,maxDelay},
// turnHandling.interruption.{minDuration,falseInterruptionTimeout}). The earlier
// inline table used seconds (0.5, 3.0), which the framework read as 0.5 ms / 3 ms
// — effectively zero endpointing grace, so the interviewer cut the candidate off.
// Mirrors the per-style intent of server/src/voice/endpointer.ts (D5).
//
// All values are env-overridable so the pipeline can be fine-tuned from the
// metrics logs (metricsLogger.ts) without a code change or app rebuild.

export type Style = 'friendly' | 'balanced' | 'tough';

const num = (key: string, fallback: number): number => {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
};

// ── VAD (Silero) ── style-independent, tuned for a single near-mic phone speaker.
// Library defaults are minSpeechDuration 50, minSilenceDuration 550,
// prefixPaddingDuration 500, activationThreshold 0.5 (all ms / 0..1). We shorten
// the raw silence gate so barge-in onset and end-of-speech are detected fast; the
// *patience* before committing a turn lives in the per-style endpointing delay
// below, not here. activationThreshold can be raised in noisy rooms to reject
// background speech, or lowered for quiet/soft talkers.
export interface VadTuning {
  minSpeechDuration: number;
  minSilenceDuration: number;
  prefixPaddingDuration: number;
  activationThreshold: number;
}

export function vadTuning(): VadTuning {
  return {
    minSpeechDuration: num('VAD_MIN_SPEECH_MS', 50),
    minSilenceDuration: num('VAD_MIN_SILENCE_MS', 300),
    prefixPaddingDuration: num('VAD_PREFIX_PADDING_MS', 300),
    activationThreshold: num('VAD_ACTIVATION_THRESHOLD', 0.5),
  };
}

// ── Endpointing (turn-taking patience) ── per style, in ms.
// minDelay = floor silence before a turn *can* end even when text looks complete
// (prevents clipping fast talkers). maxDelay = hard cap so a rambling/unfinished
// answer is still taken eventually and the orb never hangs. These mirror
// STYLE_ENDPOINT (server/src/voice/endpointer.ts): friendly is most patient,
// tough is snappiest.
export interface EndpointingTuning {
  minDelay: number;
  maxDelay: number;
}

const ENDPOINTING_DEFAULTS: Record<Style, EndpointingTuning> = {
  friendly: { minDelay: 700, maxDelay: 4000 },
  balanced: { minDelay: 500, maxDelay: 3000 },
  tough: { minDelay: 350, maxDelay: 2000 },
};

export function endpointingForStyle(style: Style): EndpointingTuning {
  const d = ENDPOINTING_DEFAULTS[style];
  const S = style.toUpperCase();
  return {
    minDelay: num(`ENDPOINT_MIN_DELAY_MS_${S}`, d.minDelay),
    maxDelay: num(`ENDPOINT_MAX_DELAY_MS_${S}`, d.maxDelay),
  };
}

// ── Interruption (barge-in discipline, D6) ── per style, in ms / words.
// minDuration = sustained user speech required to interrupt the interviewer (a
// cough or lip-smack is shorter). minWords = also require this many words before
// an interruption commits, so a single stray syllable / TTS echo doesn't cut the
// agent off. falseInterruptionTimeout + resumeFalseInterruption let the agent
// resume its line if the "interruption" turned out to be noise and no real turn
// followed. Tough interviewers yield faster (lower thresholds).
export interface InterruptionTuning {
  minDuration: number;
  minWords: number;
  falseInterruptionTimeout: number;
  resumeFalseInterruption: boolean;
}

const INTERRUPTION_DEFAULTS: Record<Style, InterruptionTuning> = {
  friendly: { minDuration: 300, minWords: 2, falseInterruptionTimeout: 2000, resumeFalseInterruption: true },
  balanced: { minDuration: 250, minWords: 1, falseInterruptionTimeout: 2000, resumeFalseInterruption: true },
  tough: { minDuration: 200, minWords: 1, falseInterruptionTimeout: 1500, resumeFalseInterruption: true },
};

export function interruptionForStyle(style: Style): InterruptionTuning {
  const d = INTERRUPTION_DEFAULTS[style];
  const S = style.toUpperCase();
  return {
    minDuration: num(`INTERRUPT_MIN_DURATION_MS_${S}`, d.minDuration),
    minWords: num(`INTERRUPT_MIN_WORDS_${S}`, d.minWords),
    falseInterruptionTimeout: num(`INTERRUPT_FALSE_TIMEOUT_MS_${S}`, d.falseInterruptionTimeout),
    resumeFalseInterruption: d.resumeFalseInterruption,
  };
}
