import { describe, it, expect } from 'vitest';
import {
  CompetencyLenient, PlanPatchOp, QuestionPlan,
  Language, LanguageInput, SUPPORTED_LANGUAGES_P0, spokenLang, scriptInstruction,
} from '../src/domain.js';

// Regression: LLM-output enums must NEVER 500 the whole plan/review/report on a
// stray label. The Planner (esp. gpt-class models) likes to tag questions with a
// topic/theme name (e.g. "product_sense", "Technical Depth") instead of one of
// the four rubric axes. CompetencyLenient + PlanPatchOp.op.catch() absorb that.
describe('CompetencyLenient (LLM-output coercion)', () => {
  it('passes the four canonical axes through unchanged', () => {
    for (const c of ['communication', 'structure', 'depth', 'confidence']) {
      expect(CompetencyLenient.parse(c)).toBe(c);
    }
  });

  it('tolerates casing and whitespace', () => {
    expect(CompetencyLenient.parse('  Communication ')).toBe('communication');
    expect(CompetencyLenient.parse('DEPTH')).toBe('depth');
  });

  it('folds common synonyms onto a canonical axis', () => {
    expect(CompetencyLenient.parse('Technical Depth')).toBe('depth');
    expect(CompetencyLenient.parse('problem_structuring')).toBe('structure');
    expect(CompetencyLenient.parse('Clarity')).toBe('communication');
    expect(CompetencyLenient.parse('conviction')).toBe('confidence');
  });

  it('falls back to a default axis for an out-of-vocab label instead of throwing', () => {
    expect(CompetencyLenient.parse('product_sense')).toBe('depth');
    expect(CompetencyLenient.parse('leadership')).toBe('depth');
    expect(CompetencyLenient.parse('')).toBe('depth');
    expect(() => CompetencyLenient.parse(undefined)).not.toThrow();
  });
});

describe('PlanPatchOp.op (LLM-output coercion)', () => {
  it('falls back to the safe no-op on an unknown op rather than throwing', () => {
    const parsed = PlanPatchOp.parse({ op: 'totally_made_up', targetQuestionId: 'q1' });
    expect(parsed.op).toBe('none');
  });
});

// docs/30-i18n.md §6.1 — locale model: canonical codes, legacy migration, gate,
// and the two derived helpers must be total over the enum.
describe('Language locale model (i18n)', () => {
  it('canonical codes are the 5 script-explicit targets', () => {
    expect(Language.options).toEqual(['en', 'zh-Hans', 'zh-Hant', 'ja', 'ko']);
  });

  it('migrates legacy / region / cased codes onto canonical values', () => {
    expect(LanguageInput.parse('zh')).toBe('zh-Hans');
    expect(LanguageInput.parse('zh-CN')).toBe('zh-Hans');
    expect(LanguageInput.parse('ZH-SG')).toBe('zh-Hans');
    expect(LanguageInput.parse('zh-TW')).toBe('zh-Hant');
    expect(LanguageInput.parse('zh-HK')).toBe('zh-Hant');
    expect(LanguageInput.parse('es')).toBe('en'); // dropped target → safe fallback
    expect(LanguageInput.parse(undefined)).toBe('en');
    expect(LanguageInput.parse('JA')).toBe('ja');
  });

  it('throws on a genuinely unknown code (so the API returns 400, not 500)', () => {
    expect(() => LanguageInput.parse('xx')).toThrow();
    expect(() => LanguageInput.parse('fr')).toThrow();
  });

  it('rollout gate is the gated subset, not the whole enum', () => {
    expect(SUPPORTED_LANGUAGES_P0).toContain('en');
    expect(SUPPORTED_LANGUAGES_P0).toContain('zh-Hans');
    expect(SUPPORTED_LANGUAGES_P0).toContain('ko'); // Korean enabled (ElevenLabs voices)
    expect(SUPPORTED_LANGUAGES_P0).not.toContain('ja'); // not rolled out yet
  });

  it('spokenLang collapses both Chinese scripts to Mandarin', () => {
    expect(spokenLang('zh-Hans')).toBe('zh');
    expect(spokenLang('zh-Hant')).toBe('zh');
    expect(spokenLang('en')).toBe('en');
    expect(spokenLang('ja')).toBe('ja');
    expect(spokenLang('ko')).toBe('ko');
  });

  it('scriptInstruction is total and script-correct per language', () => {
    for (const l of Language.options) expect(scriptInstruction(l).length).toBeGreaterThan(0);
    expect(scriptInstruction('zh-Hans')).toContain('简体');
    expect(scriptInstruction('zh-Hant')).toContain('繁體');
    expect(scriptInstruction('ja')).toContain('日本語');
    expect(scriptInstruction('ko')).toContain('한국어');
  });
});

describe('QuestionPlan.parse with an out-of-vocab competency (the 500 repro)', () => {
  it('accepts a plan whose questions use topic-style competencies', () => {
    const raw = {
      sessionId: 'sess_x',
      version: 0,
      openingLine: 'Welcome — let us begin.',
      rubricSummary: 'four axes',
      questions: [
        { id: 'q1', competency: 'product_sense', intent: 'warmup', prompt: 'Tell me about a product you shipped.', difficulty: 2 },
        { id: 'q2', competency: 'Technical Depth', intent: 'probe', prompt: 'Walk me through the hardest trade-off.', difficulty: 4 },
      ],
    };
    const plan = QuestionPlan.parse(raw); // must not throw (previously 500'd)
    expect(plan.questions.map((q) => q.competency)).toEqual(['depth', 'depth']);
  });
});
