import { describe, it, expect } from 'vitest';
import { verifyEvidence, lintAffect, stripAffect } from '../src/scoring/integrity.js';

describe('evidence verification (D12)', () => {
  const transcript = 'I led the checkout redesign and cut cart drop-off by 18 percent over a quarter.';

  it('accepts a verbatim quote (case/space/quote tolerant)', () => {
    expect(verifyEvidence('I led the checkout redesign', transcript)).toBe(true);
    expect(verifyEvidence('  led THE   checkout redesign  ', transcript)).toBe(true);
    expect(verifyEvidence('“cut cart drop-off by 18 percent”', transcript)).toBe(true);
  });

  it('rejects a fabricated / paraphrased quote', () => {
    expect(verifyEvidence('I single-handedly tripled revenue', transcript)).toBe(false);
    expect(verifyEvidence('I reduced churn dramatically', transcript)).toBe(false);
    expect(verifyEvidence('', transcript)).toBe(false);
  });

  it('rejects too-short (cherry-picked) substrings', () => {
    expect(verifyEvidence('the redesign', transcript)).toBe(false); // < 3 words
    expect(verifyEvidence('cut cart drop-off', transcript)).toBe(true); // 3+ words, present
  });
});

describe('affect / anti-bias linter (D12)', () => {
  it('passes clean, content-only rationale', () => {
    expect(lintAffect('Gave a concrete metric and named the trade-off explicitly.').clean).toBe(true);
  });

  it('flags affect and protected-attribute language', () => {
    expect(lintAffect('The candidate sounded nervous and had a strong accent.').clean).toBe(false);
    expect(lintAffect('Came across as young but articulate.').clean).toBe(false);
    expect(lintAffect('Lots of filler words and a monotone delivery.').clean).toBe(false);
  });

  it('does NOT flag legitimate content that merely contains a trigger word', () => {
    expect(lintAffect('We reduced the age of stale cache entries.').clean).toBe(true);
    expect(lintAffect('The example lacked energy and specifics.').clean).toBe(true);
    expect(lintAffect('I shipped a 6-month-old project under deadline.').clean).toBe(true);
    expect(lintAffect('We expanded into foreign markets last year.').clean).toBe(true);
    expect(lintAffect('The team had low energy on the project.').clean).toBe(true);
    expect(lintAffect('She spoke with confidence about the architecture.').clean).toBe(true);
  });

  it('DOES flag paraphrased bias the old denylist missed', () => {
    expect(lintAffect('He came across as aggressive.').clean).toBe(false);
    expect(lintAffect('She seemed unsure of herself.').clean).toBe(false);
  });

  it('strips the offending sentence but keeps the clean one', () => {
    const out = stripAffect('The structure was clear and well-sequenced. They sounded nervous though.');
    expect(out.changed).toBe(true);
    expect(out.text).toMatch(/structure was clear/);
    expect(out.text).not.toMatch(/nervous/);
  });
});
