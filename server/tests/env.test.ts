import { describe, it, expect } from 'vitest';
import { assertProductionConfig, type Env } from '../src/env.js';

// A fully-real production config — nothing should trip the guard.
const secure: Env = {
  NODE_ENV: 'production',
  API_PORT: 4000,
  API_PUBLIC_URL: 'https://api.viva.example',
  CORS_ORIGINS: 'https://viva.example',
  LIVEKIT_URL: 'wss://real.livekit.cloud',
  LIVEKIT_API_KEY: 'APIreal123',
  LIVEKIT_API_SECRET: 'a-real-32-char-minimum-secret-value-xx',
  LLM_PROVIDER: 'anthropic',
  ANTHROPIC_API_KEY: 'sk-ant-real',
  CLAUDE_MODEL_PLANNER: 'claude-opus-4-8',
  CLAUDE_MODEL_INTERVIEWER: 'claude-sonnet-4-6',
  CLAUDE_MODEL_REVIEWER: 'claude-opus-4-8',
  CLAUDE_MODEL_ANALYST: 'claude-opus-4-8',
  OPENAI_API_KEY: '',
  OPENAI_BASE_URL: 'https://api.openai.com/v1',
  OPENAI_MODEL_PLANNER: 'gpt-5.4',
  OPENAI_MODEL_INTERVIEWER: 'gpt-5.4-mini',
  OPENAI_MODEL_REVIEWER: 'gpt-5.4',
  OPENAI_MODEL_ANALYST: 'gpt-5.4',
  GEMINI_API_KEY: '',
  GEMINI_BASE_URL: 'https://generativelanguage.googleapis.com/v1beta/openai',
  GEMINI_MODEL_PLANNER: 'gemini-3.1-pro-preview',
  GEMINI_MODEL_INTERVIEWER: 'gemini-3-flash-preview',
  GEMINI_MODEL_REVIEWER: 'gemini-3.1-pro-preview',
  GEMINI_MODEL_ANALYST: 'gemini-3.1-pro-preview',
  OPENROUTER_API_KEY: '',
  OPENROUTER_BASE_URL: 'https://openrouter.ai/api/v1',
  OPENROUTER_MODEL_PLANNER: 'google/gemini-3.1-pro-preview',
  OPENROUTER_MODEL_INTERVIEWER: 'google/gemini-3-flash-preview',
  OPENROUTER_MODEL_REVIEWER: 'google/gemini-3.1-pro-preview',
  OPENROUTER_MODEL_ANALYST: 'google/gemini-3.1-pro-preview',
  AGENT_SERVICE_TOKEN: 'a-real-agent-service-token',
  DEEPGRAM_API_KEY: 'dg',
  CARTESIA_API_KEY: 'ct',
  ELEVENLABS_API_KEY: '',
  DB_PROVIDER: 'sqlite',
  DATABASE_URL: 'postgres://...',
  JWT_SECRET: 'a-real-32-char-minimum-jwt-secret-value',
};

describe('production config safety', () => {
  it('passes a fully-real production config', () => {
    expect(() => assertProductionConfig(secure)).not.toThrow();
  });

  it('refuses to boot prod on the default JWT secret', () => {
    expect(() => assertProductionConfig({ ...secure, JWT_SECRET: 'dev-jwt-secret-change-me' }))
      .toThrow(/JWT_SECRET is still the insecure dev default/);
  });

  it('refuses the default agent service token and LiveKit secret', () => {
    expect(() => assertProductionConfig({ ...secure, AGENT_SERVICE_TOKEN: 'dev-agent-token' }))
      .toThrow(/AGENT_SERVICE_TOKEN/);
    expect(() => assertProductionConfig({ ...secure, LIVEKIT_API_SECRET: 'devsecret-please-change-32chars-min' }))
      .toThrow(/LIVEKIT_API_SECRET/);
  });

  it('refuses an empty key for the SELECTED provider in prod (would silently use the stub)', () => {
    // anthropic selected + empty → throws
    expect(() => assertProductionConfig({ ...secure, ANTHROPIC_API_KEY: '' }))
      .toThrow(/LLM_PROVIDER='anthropic' is empty/);
    // openai selected + empty openai key → throws (even though anthropic key is set)
    expect(() => assertProductionConfig({ ...secure, LLM_PROVIDER: 'openai', OPENAI_API_KEY: '' }))
      .toThrow(/LLM_PROVIDER='openai' is empty/);
    // openai selected WITH an openai key → fine (anthropic key not required)
    expect(() => assertProductionConfig({ ...secure, LLM_PROVIDER: 'openai', ANTHROPIC_API_KEY: '', OPENAI_API_KEY: 'sk-openai-real' }))
      .not.toThrow();
  });

  it('refuses a too-short JWT secret', () => {
    expect(() => assertProductionConfig({ ...secure, JWT_SECRET: 'short' }))
      .toThrow(/JWT_SECRET is too short/);
  });

  it('does NOT guard non-production environments (dev defaults are fine there)', () => {
    expect(() => assertProductionConfig({ ...secure, NODE_ENV: 'development', JWT_SECRET: 'dev-jwt-secret-change-me' }))
      .not.toThrow();
    expect(() => assertProductionConfig({ ...secure, NODE_ENV: 'test', AGENT_SERVICE_TOKEN: 'dev-agent-token' }))
      .not.toThrow();
  });
});
