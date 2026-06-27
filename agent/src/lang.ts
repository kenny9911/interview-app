// Canonical locale → vendor-code maps + transcript helpers for the voice worker.
// Mirrors the server's domain.ts locale model (packages are independent). Every
// value is env-overridable per ADR D1 — no vendor IDs are hard-wired in the
// pipeline. Kept side-effect-free (agent.ts runs cli.runApp() at import) so these
// helpers are unit-testable. See docs/30-i18n.md.

export type Lang = 'en' | 'zh-Hans' | 'zh-Hant' | 'ja' | 'ko';
export type Spoken = 'en' | 'zh' | 'ja' | 'ko';
export type Persona = 'aria' | 'sam' | 'lena';

const LANGS: readonly Lang[] = ['en', 'zh-Hans', 'zh-Hant', 'ja', 'ko'];

/** Spoken language — both Chinese scripts are the same spoken Mandarin → 'zh'. */
export function spoken(l: Lang): Spoken {
  return l === 'zh-Hans' || l === 'zh-Hant' ? 'zh' : l;
}

/** Parse the canonical locale the server put on the room metadata (alongside
 *  persona/style). Defaults to 'en' on any miss so a malformed/legacy room can
 *  never crash the worker. */
export function parseLanguage(metadata: string | undefined): Lang {
  if (!metadata) return 'en';
  try {
    const m = JSON.parse(metadata) as { language?: unknown };
    if (typeof m.language === 'string' && (LANGS as readonly string[]).includes(m.language)) {
      return m.language as Lang;
    }
  } catch { /* metadata may be plain text */ }
  return 'en';
}

const num = (v: string | undefined, d: number): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
};

/** Deepgram STT language code per locale (zh-Hans→zh-CN, zh-Hant→zh-TW). */
export function sttLang(l: Lang, e: NodeJS.ProcessEnv = process.env): string {
  switch (l) {
    case 'en': return e.STT_LANG_EN ?? 'en-US';
    case 'zh-Hans': return e.STT_LANG_ZH_HANS ?? 'zh-CN';
    case 'zh-Hant': return e.STT_LANG_ZH_HANT ?? 'zh-TW';
    case 'ja': return e.STT_LANG_JA ?? 'ja';
    case 'ko': return e.STT_LANG_KO ?? 'ko';
  }
}

/** TTS ISO language per spoken language (both Chinese scripts → 'zh'). */
export function ttsLang(l: Lang, e: NodeJS.ProcessEnv = process.env): string {
  switch (spoken(l)) {
    case 'en': return e.TTS_LANG_EN ?? 'en';
    case 'zh': return e.TTS_LANG_ZH ?? 'zh';
    case 'ja': return e.TTS_LANG_JA ?? 'ja';
    case 'ko': return e.TTS_LANG_KO ?? 'ko';
  }
}

/** Deepgram STT endpointing (ms) — longer for CJK so a clause-pause doesn't end
 *  the turn early. */
export function sttEndpointingMs(l: Lang, e: NodeJS.ProcessEnv = process.env): number {
  return spoken(l) === 'en' ? num(e.DEEPGRAM_ENDPOINTING_EN, 300) : num(e.DEEPGRAM_ENDPOINTING_CJK, 500);
}

/** AgentSession turn-handling endpointing floors/caps (MILLISECONDS — fixing the
 *  seconds/ms unit bug that gave ~0ms floors and clipped every tail). Interview
 *  answers are monologues, so CJK gets a higher floor + cap for thinking pauses. */
export function endpointingFloor(l: Lang, e: NodeJS.ProcessEnv = process.env): { minDelay: number; maxDelay: number } {
  switch (spoken(l)) {
    case 'en': return { minDelay: num(e.ENDPOINT_MIN_DELAY_EN, 300), maxDelay: num(e.ENDPOINT_MAX_DELAY_EN, 3000) };
    case 'zh': return { minDelay: num(e.ENDPOINT_MIN_DELAY_ZH, 700), maxDelay: num(e.ENDPOINT_MAX_DELAY_ZH, 4000) };
    case 'ja': return { minDelay: num(e.ENDPOINT_MIN_DELAY_JA, 800), maxDelay: num(e.ENDPOINT_MAX_DELAY_JA, 4000) };
    case 'ko': return { minDelay: num(e.ENDPOINT_MIN_DELAY_KO, 800), maxDelay: num(e.ENDPOINT_MAX_DELAY_KO, 4000) };
  }
}

/** Explicit end-of-utterance threshold (a SCALAR) for the audio TurnDetector,
 *  derived from the KNOWN session language — never the STT-reported language
 *  (Deepgram may report it as null with detectLanguage:false, which would
 *  silently apply the English threshold to a CJK session). Defaults mirror
 *  @livekit/agents LOCAL_LANGUAGES. */
export function eouThreshold(l: Lang, e: NodeJS.ProcessEnv = process.env): number {
  switch (spoken(l)) {
    case 'en': return num(e.EOU_THRESHOLD_EN, 0.36);
    case 'zh': return num(e.EOU_THRESHOLD_ZH, 0.355);
    case 'ja': return num(e.EOU_THRESHOLD_JA, 0.295);
    case 'ko': return num(e.EOU_THRESHOLD_KO, 0.4);
  }
}

/** Cartesia voice id per (persona × spoken-language). There is NO fallback to the
 *  English voice for a non-English session — we refuse rather than ship an
 *  "awkward-foreigner voice" (docs/30-i18n.md §3.6). English may fall back to the
 *  legacy generic CARTESIA_VOICE_<PERSONA>. Korean is not Cartesia (Phase 4). */
export function cartesiaVoiceFor(persona: Persona, l: Lang, e: NodeJS.ProcessEnv = process.env): string | undefined {
  const p = persona.toUpperCase();
  const sp = spoken(l).toUpperCase();
  const specific = e[`CARTESIA_VOICE_${p}_${sp}`];
  if (specific) return specific;
  if (l === 'en') return e[`CARTESIA_VOICE_${p}`]; // legacy generic voice, or undefined → plugin default
  throw new Error(
    `Missing CARTESIA_VOICE_${p}_${sp} for ${l}: refusing to speak ${l} with a non-native voice. ` +
    'Provision the language-specific voice id (docs/30-i18n.md §8).',
  );
}

// Korean is NOT Cartesia (it has no Korean) — it uses ElevenLabs. These are
// native-Korean ElevenLabs Voice-Library voices chosen as provisional defaults;
// env-overridable per persona, and meant to be vetted/swapped by a Korean speaker
// (docs/30-i18n.md §4.2). aria=Miso Choi (calm Seoul, F), sam=Hojin Lim (M),
// lena=Jeong-Ah (warm, F).
const ELEVENLABS_KO_VOICE: Record<Persona, string> = {
  aria: 'tIXHSlSWOafJawXSV1g4',
  sam: 'fHzGR8qcnsDR2uaj9r16',
  lena: 'UvkXHIJzOBYWOI51BDKp',
};

/** ElevenLabs voice id for a persona speaking Korean (env override → native default). */
export function elevenlabsVoiceForKo(persona: Persona, e: NodeJS.ProcessEnv = process.env): string {
  return e[`ELEVENLABS_VOICE_${persona.toUpperCase()}_KO`] || ELEVENLABS_KO_VOICE[persona];
}

// CJK ranges (Hiragana/Katakana, Han incl. Ext-A, CJK Compat, Hangul syllables).
const CJK_SRC = '[\\u3040-\\u30ff\\u3400-\\u9fff\\uf900-\\ufaff\\uac00-\\ud7af]';
const CJK_GAP = new RegExp(`(${CJK_SRC})\\s+(?=${CJK_SRC})`, 'gu');

/** Normalize a committed user turn before it reaches the brain: the recognizer
 *  joins accumulated final segments with an ASCII space, which injects spurious
 *  spaces between CJK characters across segment boundaries (e.g. "我们用 React 重构"
 *  can gain stray gaps). Drop whitespace that sits between two CJK characters
 *  while preserving the intended space around Latin tokens (code-switching). This
 *  is the ONE canonical place this normalization happens, so the string the
 *  server persists is exactly what verifyEvidence later matches (docs/30-i18n.md §5). */
export function normalizeTurnText(s: string): string {
  return s
    .replace(CJK_GAP, '$1') // remove a space sitting between two CJK chars
    .replace(/[ \t]{2,}/g, ' ') // collapse accidental double spaces (keep single Latin spaces)
    .trim();
}
