import { describe, it, expect } from 'vitest';
import {
  spoken, parseLanguage, sttLang, ttsLang, sttEndpointingMs,
  endpointingFloor, eouThreshold, cartesiaVoiceFor, elevenlabsVoiceForKo, normalizeTurnText,
} from '../src/lang.js';

const NO_ENV = {} as NodeJS.ProcessEnv;

describe('locale → vendor code mapping', () => {
  it('spoken() collapses both Chinese scripts to Mandarin', () => {
    expect(spoken('zh-Hans')).toBe('zh');
    expect(spoken('zh-Hant')).toBe('zh');
    expect(spoken('en')).toBe('en');
    expect(spoken('ja')).toBe('ja');
    expect(spoken('ko')).toBe('ko');
  });

  it('parseLanguage reads canonical metadata and defaults to en', () => {
    expect(parseLanguage(JSON.stringify({ language: 'zh-Hans' }))).toBe('zh-Hans');
    expect(parseLanguage(JSON.stringify({ persona: 'aria', style: 'tough', language: 'ja' }))).toBe('ja');
    expect(parseLanguage(JSON.stringify({ language: 'klingon' }))).toBe('en'); // unknown → en
    expect(parseLanguage(JSON.stringify({ style: 'tough' }))).toBe('en'); // absent → en
    expect(parseLanguage('not json')).toBe('en');
    expect(parseLanguage(undefined)).toBe('en');
  });

  it('sttLang maps to Deepgram region codes (zh-Hans→zh-CN, zh-Hant→zh-TW)', () => {
    expect(sttLang('en', NO_ENV)).toBe('en-US');
    expect(sttLang('zh-Hans', NO_ENV)).toBe('zh-CN');
    expect(sttLang('zh-Hant', NO_ENV)).toBe('zh-TW');
    expect(sttLang('ja', NO_ENV)).toBe('ja');
    expect(sttLang('ko', NO_ENV)).toBe('ko');
    expect(sttLang('zh-Hant', { STT_LANG_ZH_HANT: 'zh-Hant' })).toBe('zh-Hant'); // env override
  });

  it('ttsLang collapses Chinese scripts to one Cartesia language', () => {
    expect(ttsLang('en', NO_ENV)).toBe('en');
    expect(ttsLang('zh-Hans', NO_ENV)).toBe('zh');
    expect(ttsLang('zh-Hant', NO_ENV)).toBe('zh');
    expect(ttsLang('ja', NO_ENV)).toBe('ja');
    expect(ttsLang('ko', NO_ENV)).toBe('ko');
  });

  it('endpointing + EOU threshold give CJK a longer grace than English', () => {
    expect(endpointingFloor('en', NO_ENV)).toEqual({ minDelay: 300, maxDelay: 3000 });
    expect(endpointingFloor('zh-Hans', NO_ENV).minDelay).toBe(700);
    expect(endpointingFloor('ja', NO_ENV).minDelay).toBe(800);
    expect(sttEndpointingMs('en', NO_ENV)).toBe(300);
    expect(sttEndpointingMs('zh-Hans', NO_ENV)).toBe(500);
    expect(eouThreshold('en', NO_ENV)).toBeCloseTo(0.36);
    expect(eouThreshold('zh-Hans', NO_ENV)).toBeCloseTo(0.355);
    expect(eouThreshold('ja', NO_ENV)).toBeCloseTo(0.295);
    expect(eouThreshold('ko', NO_ENV)).toBeCloseTo(0.4);
  });
});

describe('cartesiaVoiceFor — no awkward-foreigner voice', () => {
  it('uses the language-specific voice when set', () => {
    expect(cartesiaVoiceFor('aria', 'zh-Hans', { CARTESIA_VOICE_ARIA_ZH: 'zh-voice-1' })).toBe('zh-voice-1');
    expect(cartesiaVoiceFor('sam', 'ja', { CARTESIA_VOICE_SAM_JA: 'ja-voice-2' })).toBe('ja-voice-2');
  });

  it('prefers the language-specific English voice, else the legacy generic, else plugin default', () => {
    expect(cartesiaVoiceFor('aria', 'en', { CARTESIA_VOICE_ARIA_EN: 'en-specific' })).toBe('en-specific');
    expect(cartesiaVoiceFor('aria', 'en', { CARTESIA_VOICE_ARIA: 'en-legacy' })).toBe('en-legacy');
    expect(cartesiaVoiceFor('aria', 'en', NO_ENV)).toBeUndefined(); // → plugin default English voice
  });

  it('REFUSES to fall back to the English voice for a non-English session', () => {
    // The English generic voice is set, but a zh session must NOT use it.
    expect(() => cartesiaVoiceFor('aria', 'zh-Hans', { CARTESIA_VOICE_ARIA: 'en-legacy' })).toThrow(/refusing to speak/);
    expect(() => cartesiaVoiceFor('lena', 'ja', NO_ENV)).toThrow(/CARTESIA_VOICE_LENA_JA/);
  });

  it('Korean uses native ElevenLabs voices (env override → baked native default)', () => {
    // Defaults are real native-Korean voice ids (validated against ElevenLabs) —
    // never empty, never an EN voice.
    expect(elevenlabsVoiceForKo('aria', NO_ENV)).toBe('z6Kj0hecH20CdetSElRT');
    expect(elevenlabsVoiceForKo('sam', NO_ENV)).toBe('s07IwTCOrCDCaETjUVjx');
    expect(elevenlabsVoiceForKo('lena', NO_ENV)).toBe('mYk0rAapHek2oTw18z8x');
    expect(elevenlabsVoiceForKo('aria', { ELEVENLABS_VOICE_ARIA_KO: 'custom-ko' })).toBe('custom-ko');
  });
});

describe('normalizeTurnText — CJK segment-join spacing', () => {
  it('drops spurious spaces between CJK characters', () => {
    expect(normalizeTurnText('我们用 重构了 服务')).toBe('我们用重构了服务');
    expect(normalizeTurnText('決済 システム を 設計')).toBe('決済システムを設計');
  });
  it('keeps the intended space around code-switched Latin tokens', () => {
    expect(normalizeTurnText('我们用 React 重构了支付系统')).toBe('我们用 React 重构了支付系统');
  });
  it('leaves English untouched (only collapses accidental doubles)', () => {
    expect(normalizeTurnText('I led the redesign')).toBe('I led the redesign');
    expect(normalizeTurnText('cut  drop-off   by 18')).toBe('cut drop-off by 18');
  });
});
