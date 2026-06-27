import { describe, it, expect } from 'vitest';
import { normalizeForMatch, verifyEvidence, lintAffect, stripAffect } from '../src/scoring/integrity.js';

// docs/30-i18n.md §6.3 — the integrity guards must work for CJK (no spaces, 。！？
// terminators, code-switched English tech terms) WITHOUT weakening D12.

describe('normalizeForMatch (CJK + NFKC)', () => {
  it('keeps Han / Kana / Hangul instead of stripping them', () => {
    expect(normalizeForMatch('支付系统的重构')).toBe('支付系统的重构');
    expect(normalizeForMatch('決済システム')).toBe('決済システム');
    expect(normalizeForMatch('결제 시스템')).toBe('결제 시스템');
  });
  it('NFKC-folds full-width forms so a quote matches its ASCII twin', () => {
    expect(normalizeForMatch('４０％')).toBe('40'); // full-width digits, % dropped as punctuation
    expect(normalizeForMatch('Ｒｅａｃｔ')).toBe('react');
  });
  it('strips CJK punctuation/quotes consistently', () => {
    expect(normalizeForMatch('「支付系统」，重构。')).toBe('支付系统 重构');
  });
});

describe('verifyEvidence (CJK + code-switching)', () => {
  const zh = '我负责了支付系统的重构，把延迟降低了百分之四十。';
  it('accepts a verbatim CJK span of ≥3 characters', () => {
    expect(verifyEvidence('支付系统的重构', zh)).toBe(true);
    expect(verifyEvidence('把延迟降低了', zh)).toBe(true);
  });
  it('rejects a 1–2 character fragment as cherry-picked', () => {
    expect(verifyEvidence('重构', zh)).toBe(false);
    expect(verifyEvidence('延迟', zh)).toBe(false);
  });
  it('rejects a fabricated / paraphrased CJK quote', () => {
    expect(verifyEvidence('我一个人把收入翻了三倍', zh)).toBe(false);
    expect(verifyEvidence('', zh)).toBe(false);
  });
  it('handles a code-switched (Chinese + English) quote', () => {
    const mixed = '我们用 React 重构了支付系统，用 Kubernetes 做 autoscaling。';
    expect(verifyEvidence('React 重构了支付系统', mixed)).toBe(true);
    expect(verifyEvidence('Kubernetes 做 autoscaling', mixed)).toBe(true);
    expect(verifyEvidence('用 Vue 重写', mixed)).toBe(false); // not said
  });
  it('still enforces the English contract unchanged', () => {
    const en = 'I led the checkout redesign and cut cart drop-off by 18 percent.';
    expect(verifyEvidence('the redesign', en)).toBe(false); // <3 units
    expect(verifyEvidence('cut cart drop-off', en)).toBe(true);
  });
});

describe('lintAffect / stripAffect (CJK)', () => {
  it('flags CJK affect and protected-attribute language', () => {
    expect(lintAffect('他在回答时显得很紧张。', 'zh-Hans').clean).toBe(false); // affect
    expect(lintAffect('她的口音很重。', 'zh-Hans').clean).toBe(false); // protected (accent)
    expect(lintAffect('面接官は彼の年齢を気にした。', 'ja').clean).toBe(false); // protected (age)
    expect(lintAffect('말투가 불안해 보였습니다.', 'ko').clean).toBe(false); // affect
  });
  it('does NOT flag clean, content-only CJK feedback', () => {
    expect(lintAffect('回答结构清晰，给出了具体的指标。', 'zh-Hans').clean).toBe(true);
    expect(lintAffect('具体的な数字を挙げて説明していました。', 'ja').clean).toBe(true);
  });
  it('catches code-switched English bias inside a CJK sentence (even with a wrong lang tag)', () => {
    expect(lintAffect('他 sounded nervous，但内容很扎实。', 'en').clean).toBe(false);
  });
  it('strips only the offending CJK sentence and keeps the clean one', () => {
    const out = stripAffect('回答结构清晰，逻辑分明。他显得很紧张。', 'zh-Hans');
    expect(out.changed).toBe(true);
    expect(out.text).toMatch(/结构清晰/);
    expect(out.text).not.toMatch(/紧张/);
    expect(out.text).not.toMatch(/\s$/); // no trailing space artifact
  });
  it('leaves clean English behavior intact', () => {
    expect(lintAffect('Gave a concrete metric and named the trade-off.').clean).toBe(true);
    expect(stripAffect('The structure was clear. They sounded nervous though.').text).not.toMatch(/nervous/);
  });
});
