import { describe, it, expect } from 'vitest';
import { buildApp } from '../src/app.js';
import { MemoryStore } from '../src/store.js';
import { signToken } from '../src/auth.js';
import { makeMockLlm } from './_mock.js';

function app() {
  return buildApp({ llm: makeMockLlm(), store: new MemoryStore() });
}

const validConfig = {
  // 'demo-user' is the dev/test identity the auth guard resolves when no token is sent
  userId: 'demo-user', mode: 'mock', role: 'Product Manager', persona: 'aria',
  style: 'balanced', language: 'en', lengthMinutes: 15, topicFocus: 'product management',
};

describe('API', () => {
  it('healthz reports MVP modes + supported languages', async () => {
    const res = await app().inject({ method: 'GET', url: '/v1/healthz' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.modes).toContain('mock');
    expect(body.languages).toContain('en');
  });

  it('rejects a non-MVP mode (expert_interview) cleanly', async () => {
    const a = app();
    const res = await a.inject({ method: 'POST', url: '/v1/configs', payload: { ...validConfig, mode: 'expert_interview' } });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('mode_not_available_in_mvp');
  });

  it('rejects an unsupported language', async () => {
    const res = await app().inject({ method: 'POST', url: '/v1/configs', payload: { ...validConfig, language: 'zh' } });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('language_not_supported');
  });

  it('runs the full happy path: config → session(+token+plan) → turns → complete → report', async () => {
    const a = app();

    const cfgRes = await a.inject({ method: 'POST', url: '/v1/configs', payload: validConfig });
    expect(cfgRes.statusCode).toBe(201);
    const configId = cfgRes.json().config.id;

    const sessRes = await a.inject({ method: 'POST', url: '/v1/sessions', payload: { configId } });
    expect(sessRes.statusCode).toBe(201);
    const sess = sessRes.json();
    expect(sess.sessionId).toMatch(/^sess_/);
    expect(sess.livekit.token).toBeTruthy();
    expect(sess.livekit.url).toMatch(/^wss:\/\//);
    expect(sess.questionCount).toBeGreaterThanOrEqual(2);

    // drive turns through the real agent-worker path (begin → next-turn)
    await a.inject({ method: 'POST', url: `/v1/sessions/${sess.sessionId}/begin` });
    await a.inject({ method: 'POST', url: `/v1/sessions/${sess.sessionId}/next-turn`, payload: { candidateText: 'I led the redesign and cut latency 40%.' } });
    await a.inject({ method: 'POST', url: `/v1/sessions/${sess.sessionId}/next-turn`, payload: { candidateText: 'I owned the checkout rewrite.' } });

    const compRes = await a.inject({ method: 'POST', url: `/v1/sessions/${sess.sessionId}/complete` });
    expect(compRes.statusCode).toBe(201);
    expect(compRes.json().report.overallScore).toBe(82);

    const repRes = await a.inject({ method: 'GET', url: `/v1/sessions/${sess.sessionId}/report` });
    expect(repRes.statusCode).toBe(200);
    expect(repRes.json().report.band).toBe('strong');
  });

  it('refuses to complete a session with no turns (not_enough_to_score)', async () => {
    const a = app();
    const configId = (await a.inject({ method: 'POST', url: '/v1/configs', payload: validConfig })).json().config.id;
    const sessionId = (await a.inject({ method: 'POST', url: '/v1/sessions', payload: { configId } })).json().sessionId;
    const res = await a.inject({ method: 'POST', url: `/v1/sessions/${sessionId}/complete` });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('not_enough_to_score');
  });

  it('drives the conversation via begin → next-turn → ended (agent-worker path)', async () => {
    const a = app();
    const configId = (await a.inject({ method: 'POST', url: '/v1/configs', payload: validConfig })).json().config.id;
    const sessionId = (await a.inject({ method: 'POST', url: '/v1/sessions', payload: { configId } })).json().sessionId;

    const begin = await a.inject({ method: 'POST', url: `/v1/sessions/${sessionId}/begin` });
    expect(begin.statusCode).toBe(200);
    expect(begin.json().spokenText.length).toBeGreaterThan(0);
    expect(begin.json().ended).toBe(false);

    // drive turns until the interview ends (the async reviewer may adapt/insert
    // follow-ups, so the exact turn count isn't fixed — just bounded).
    let ended = false;
    for (let i = 0; i < 12 && !ended; i++) {
      const t = await a.inject({ method: 'POST', url: `/v1/sessions/${sessionId}/next-turn`, payload: { candidateText: `Answer ${i}: I owned it and measured the result.` } });
      ended = t.json().ended;
    }
    expect(ended).toBe(true);

    const comp = await a.inject({ method: 'POST', url: `/v1/sessions/${sessionId}/complete` });
    expect(comp.statusCode).toBe(201);
    expect(comp.json().report.overallScore).toBe(82);

    // idempotent: a second complete returns the same report (no re-analysis)
    const comp2 = await a.inject({ method: 'POST', url: `/v1/sessions/${sessionId}/complete` });
    expect(comp2.statusCode).toBe(200);
    expect(comp2.json().report.overallScore).toBe(82);
  });

  it('login issues a token that grants access to that user’s own session', async () => {
    const a = app();
    const login = await a.inject({ method: 'POST', url: '/v1/auth/login', payload: { email: 'maya@example.com' } });
    expect(login.statusCode).toBe(200);
    const { userId, token } = login.json();
    expect(token.split('.')).toHaveLength(3);

    const auth = { authorization: `Bearer ${token}` };
    const configId = (await a.inject({ method: 'POST', url: '/v1/configs', headers: auth, payload: { ...validConfig, userId } })).json().config.id;
    const sessionId = (await a.inject({ method: 'POST', url: '/v1/sessions', headers: auth, payload: { configId } })).json().sessionId;
    const ok = await a.inject({ method: 'GET', url: `/v1/sessions/${sessionId}`, headers: auth });
    expect(ok.statusCode).toBe(200);
    // a different login can't read it
    const other = (await a.inject({ method: 'POST', url: '/v1/auth/login', payload: { email: 'someone@else.com' } })).json().token;
    const denied = await a.inject({ method: 'GET', url: `/v1/sessions/${sessionId}`, headers: { authorization: `Bearer ${other}` } });
    expect(denied.statusCode).toBe(403);
  });

  it('begin is idempotent — a reconnecting agent gets the same opening line', async () => {
    const a = app();
    const configId = (await a.inject({ method: 'POST', url: '/v1/configs', payload: validConfig })).json().config.id;
    const sessionId = (await a.inject({ method: 'POST', url: '/v1/sessions', payload: { configId } })).json().sessionId;
    const first = await a.inject({ method: 'POST', url: `/v1/sessions/${sessionId}/begin` });
    const again = await a.inject({ method: 'POST', url: `/v1/sessions/${sessionId}/begin` });
    expect(first.statusCode).toBe(200);
    expect(again.statusCode).toBe(200);
    expect(again.json().spokenText).toBe(first.json().spokenText); // no second greeting / duplicate question
  });

  it('enforces session ownership (IDOR guard); identity comes from the token, not the body', async () => {
    const a = app();
    const aliceAuth = { authorization: `Bearer ${signToken('alice')}` };
    // create owned by alice — note the body even tries to claim 'mallory', which must be ignored
    const configId = (await a.inject({ method: 'POST', url: '/v1/configs', headers: aliceAuth, payload: { ...validConfig, userId: 'mallory' } })).json().config.id;
    const sessionId = (await a.inject({ method: 'POST', url: '/v1/sessions', headers: aliceAuth, payload: { configId } })).json().sessionId;

    // a different signed user is forbidden
    const asMallory = await a.inject({ method: 'GET', url: `/v1/sessions/${sessionId}`, headers: { authorization: `Bearer ${signToken('mallory')}` } });
    expect(asMallory.statusCode).toBe(403);

    // the owner (signed token) is allowed
    const asAlice = await a.inject({ method: 'GET', url: `/v1/sessions/${sessionId}`, headers: aliceAuth });
    expect(asAlice.statusCode).toBe(200);
    expect(asAlice.json().sessionId).toBe(sessionId);
  });

  it('records an interview startedAt on begin and keeps it stable across idempotent begins (resume clock)', async () => {
    const a = app();
    const configId = (await a.inject({ method: 'POST', url: '/v1/configs', payload: validConfig })).json().config.id;
    const sessionId = (await a.inject({ method: 'POST', url: '/v1/sessions', payload: { configId } })).json().sessionId;

    // before begin: no clock yet
    const before = await a.inject({ method: 'GET', url: `/v1/sessions/${sessionId}` });
    expect(before.json().startedAt).toBeNull();

    await a.inject({ method: 'POST', url: `/v1/sessions/${sessionId}/begin` });
    const startedAt = (await a.inject({ method: 'GET', url: `/v1/sessions/${sessionId}` })).json().startedAt;
    expect(typeof startedAt).toBe('string');
    expect(Number.isNaN(Date.parse(startedAt))).toBe(false);

    // a reconnecting agent re-begins; the wall-clock must NOT reset (resume keeps elapsed time)
    await a.inject({ method: 'POST', url: `/v1/sessions/${sessionId}/begin` });
    const again = (await a.inject({ method: 'GET', url: `/v1/sessions/${sessionId}` })).json().startedAt;
    expect(again).toBe(startedAt);
  });

  it('mints a fresh mid-session token', async () => {
    const a = app();
    const configId = (await a.inject({ method: 'POST', url: '/v1/configs', payload: validConfig })).json().config.id;
    const sessionId = (await a.inject({ method: 'POST', url: '/v1/sessions', payload: { configId } })).json().sessionId;
    const res = await a.inject({ method: 'POST', url: `/v1/sessions/${sessionId}/token`, payload: {} });
    expect(res.statusCode).toBe(200);
    expect(res.json().livekit.token).toBeTruthy();
  });
});
