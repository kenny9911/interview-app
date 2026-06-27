// Deterministic scoring-integrity guards (docs/15-decisions.md D12).
// These run AFTER the model returns, so a hallucinated quote or a leaked
// affect/protected-attribute inference can't reach the candidate-facing report.
//
// Multi-language (docs/30-i18n.md §6.3): the guards must work for CJK, where
// there are no spaces between words and sentences end in 。！？ — without
// weakening the content-only guarantee. One shared CJK character class is reused
// everywhere so the detection can't drift between call sites.

/** Han (incl. Ext-A) + Hiragana/Katakana + Hangul-syllables. */
export const CJK_CHAR = /[぀-ヿ㐀-鿿豈-﫿가-힯]/u;
const CJK_CHAR_G = new RegExp(CJK_CHAR, 'gu');

/** Normalize for tolerant substring matching (case, whitespace, smart quotes,
 *  punctuation edges). NFKC-folds full-width forms so a full-width digit/letter
 *  in a quote matches its ASCII twin in the transcript. Keeps ALL Unicode
 *  letters/numbers (\p{L}\p{N} ⊇ a-z0-9), so CJK survives where the old
 *  ASCII-only filter deleted it. Applied identically to quote and transcript. */
export function normalizeForMatch(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’“”'"「」『』]/gu, '') // drop quotes/apostrophes (both scripts) consistently on both sides
    .replace(/[^\p{L}\p{N}\s]/gu, ' ') // drop remaining punctuation
    .replace(/\s+/gu, ' ')
    .trim();
}

/** Count "information units" in a normalized string: each CJK codepoint is a
 *  unit, plus each space-delimited non-CJK token. Lets one threshold work for
 *  spaced scripts (≈ word count), CJK (≈ char count), and code-switched mixes
 *  ("我们用 React 重构" = CJK chars + the token "react"). */
function infoUnitCount(normalized: string): number {
  if (!normalized) return 0;
  const cjk = (normalized.match(CJK_CHAR_G) || []).length;
  const spaced = normalized.replace(CJK_CHAR_G, ' ').split(' ').filter(Boolean).length;
  return cjk + spaced;
}

/** Is the cited quote actually present (verbatim, modulo normalization) in the
 *  transcript? Requires ≥3 information units so a trivial/cherry-picked fragment
 *  can't pass as "evidence" — in EN that is ≥3 words, in CJK ≥3 characters, and
 *  mixed strings combine the two. */
export function verifyEvidence(quote: string, transcript: string): boolean {
  const q = normalizeForMatch(quote);
  if (q === '') return false;
  if (infoUnitCount(q) < 3) return false;
  return normalizeForMatch(transcript).includes(q);
}

// Affect / protected-attribute language that must never drive or appear in
// scoring (D12). English phrase/pattern based — tuned to catch real bias
// phrasing while NOT nuking legitimate content words ("lacked energy in the
// example", "6-month-old project"). 'confident' is intentionally excluded — it
// collides with the scored 'confidence' competency.
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

// CJK affect / protected lexicon (zh-Hans/zh-Hant/ja/ko). \b word boundaries are
// meaningless between Han characters, so these are bare substrings — high
// precision (multi-character bias phrasings, not single content chars). This is
// a translation deliverable flagged for native review per docs/30-i18n.md §6.3.
const AFFECT_CJK: RegExp[] = [
  /緊張|紧张|焦慮|焦虑|不安そう|긴장|불안/u,
  /語氣|语气|口吻|声のトーン|목소리\s*톤|말투/u,
  /口吃|结巴|どもり|말더듬/u,
  /眼神接觸|眼神接触|アイコンタクト|아이\s*컨택|시선\s*처리/u,
  /肢體語言|肢体语言|ボディランゲージ|보디\s*랭귀지|몸짓/u,
  /語速(太)?(快|慢)|语速(太)?(快|慢)|話すのが(速|遅)|말이\s*(빠르|느리)/u,
  /顯得(緊張|不安|沒自信)|显得(紧张|不安|没自信)|自信(が)?なさ(そう|げ)|자신\s*없어/u,
];
const PROTECTED_CJK: RegExp[] = [
  /口音|腔調|腔调|なまり|訛り|억양|사투리/u,
  /年齡|年龄|年齢|나이|연령/u,
  /外貌|外表|外見|見た目|외모/u,
  /性別|性别|性別|성별/u,
  /種族|种族|人種|민족|인종/u,
];

export interface AffectScan { clean: boolean; flagged: string[] }

/** Scan a candidate-facing string for affect / protected-attribute language.
 *  The English patterns are always applied (they also catch code-switched
 *  English bias inside a CJK sentence); the CJK lexicon is unioned in whenever
 *  ANY CJK is present, so a wrong/missing `lang` tag still triggers it. */
export function lintAffect(text: string, lang = 'en'): AffectScan {
  void lang; // reserved for future per-language sets; CJK union is detection-driven
  const t = text.normalize('NFKC').toLowerCase();
  const hasCjk = CJK_CHAR.test(t);
  const patterns = [
    ...AFFECT_PATTERNS, ...PROTECTED_PATTERNS,
    ...(hasCjk ? [...AFFECT_CJK, ...PROTECTED_CJK] : []),
  ];
  const flagged = patterns.filter((re) => re.test(t)).map((re) => re.source);
  return { clean: flagged.length === 0, flagged };
}

/** Redact whole sentences that contain affect/protected language; returns the
 *  SCRUBBED text (never the original) + whether anything changed. Splits on
 *  Latin .!? (+ space) AND CJK terminators 。！？…． (no trailing space). A
 *  fully-flagged string returns '' so the caller substitutes a neutral fallback
 *  rather than leaking the original. */
export function stripAffect(text: string, lang = 'en'): { text: string; changed: boolean } {
  const sentences = text.split(/(?<=[.!?])\s+|(?<=[。！？…．])/u).filter((s) => s.length > 0);
  const kept = sentences.filter((s) => lintAffect(s, lang).clean);
  const joined = kept
    .join(' ')
    .replace(/\s+([。！？…．、，])/gu, '$1') // no space before CJK punctuation
    .replace(/([。！？…．])\s+/gu, '$1') // no space after a CJK sentence terminator
    .trim();
  return { text: joined, changed: kept.length !== sentences.length };
}
