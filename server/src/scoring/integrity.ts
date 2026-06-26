// Deterministic scoring-integrity guards (docs/15-decisions.md D12).
// These run AFTER the model returns, so a hallucinated quote or a leaked
// affect/protected-attribute inference can't reach the candidate-facing report.

/** Normalize for tolerant substring matching (case, whitespace, smart quotes, punctuation edges). */
export function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’“”'"]/g, '') // drop all quotes/apostrophes (consistently on both sides)
    .replace(/[^a-z0-9\s]/g, ' ') // drop remaining punctuation
    .replace(/\s+/g, ' ')
    .trim();
}

/** Is the cited quote actually present (verbatim, modulo normalization) in the transcript?
 *  Requires a multi-word span so a common short substring can't pass as "evidence". */
export function verifyEvidence(quote: string, transcript: string): boolean {
  const q = normalizeForMatch(quote);
  if (q.split(' ').filter(Boolean).length < 3) return false; // trivial/cherry-picked citations don't count
  return normalizeForMatch(transcript).includes(q);
}

// Affect / protected-attribute language that must never drive or appear in scoring
// (D12). Phrase/pattern based — tuned to catch real bias phrasing while NOT nuking
// legitimate content words ("lacked energy in the example", "6-month-old project").
// Tuned to require a person/affect framing so legitimate content words
// ("expanded into foreign markets", "the team had low energy", "spoke with
// confidence about the design") are NOT redacted. 'confident' is intentionally
// excluded — it collides with the scored 'confidence' competency.
const AFFECT_PATTERNS: RegExp[] = [
  /\btone of voice\b/, /\bbody language\b/, /\beye contact\b/, /\bfiller words?\b/, /\bmonotone\b/, /\bstutter/,
  /\bsounded? (nervous|anxious|unsure|hesitant|flat|shaky)\b/,
  /\bseemed (nervous|anxious|unsure|uncomfortable|aggressive|timid|shy)\b/,
  /\bcame across as\b/, /\b(his|her|their|your) (delivery|demeanor|cadence)\b/,
  /\bspoke (quickly|slowly|softly|too fast)\b/, /\bnervous energy\b/,
  /\benthusiasm in (his|her|their|your) voice\b/, /\bvocal (tone|delivery)\b/,
];
const PROTECTED_PATTERNS: RegExp[] = [
  /\b(your|his|her|their) age\b/, /\bfor someone (your|his|her|their) age\b/, /\b(too )?(young|old) (for|to)\b/,
  /\b(strong |thick |heavy )?accent\b/, /\bgender\b/, /\b(he|she) (is|seems|looks|appears)( a)? (man|woman|male|female)\b/,
  /\b(your|his|her|their) appearance\b/, /\bethnicity\b/, /\barticulate for\b/,
];

export interface AffectScan { clean: boolean; flagged: string[] }

/** Scan a candidate-facing string for affect / protected-attribute language. */
export function lintAffect(text: string): AffectScan {
  const t = text.toLowerCase();
  const flagged = [...AFFECT_PATTERNS, ...PROTECTED_PATTERNS].filter((re) => re.test(t)).map((re) => re.source);
  return { clean: flagged.length === 0, flagged };
}

/** Redact whole sentences that contain affect/protected language; returns the
 *  SCRUBBED text (never the original) + whether anything changed. A fully-flagged
 *  string returns '' so the caller substitutes a neutral fallback rather than
 *  leaking the original. */
export function stripAffect(text: string): { text: string; changed: boolean } {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const kept = sentences.filter((s) => lintAffect(s).clean);
  return { text: kept.join(' ').trim(), changed: kept.length !== sentences.length };
}
