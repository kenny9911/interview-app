import { describe, it, expect } from 'vitest';
import { resolveTopicKey, composeSpecialistGuidance, TOPIC_MODULES, MODE_MODULES } from '../src/prompts/registry.js';

describe('prompt library / registry', () => {
  it('loaded the expert library (many topics)', () => {
    expect(Object.keys(TOPIC_MODULES).length).toBeGreaterThanOrEqual(10);
    expect(TOPIC_MODULES.product_management?.guidance.length).toBeGreaterThan(200);
  });

  it('resolves free-text role/topic to the right specialist via keywords', () => {
    expect(resolveTopicKey('Senior Product Manager')).toBe('product_management');
    expect(resolveTopicKey('backend software engineer')).toBe('software_engineering');
    expect(resolveTopicKey('something totally unrelated zzz')).toBe('general');
  });

  it('mode module text comes from the expert library', () => {
    expect(MODE_MODULES.mock.guidance.length).toBeGreaterThan(80);
  });

  it('composes guidance that includes exemplar questions for a known topic', () => {
    const { guidance, themes } = composeSpecialistGuidance({ mode: 'mock', persona: 'aria', topicFocus: 'product management' });
    expect(guidance).toMatch(/Exemplar questions/);
    expect(guidance).toMatch(/Topic focus — Product Management/);
    expect(themes.length).toBeGreaterThan(3);
  });
});
