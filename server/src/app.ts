// Fastify app factory. Dependencies (LLM client, store) are injected so the API
// is fully testable with a mock LLM and in-memory store.
import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { z } from 'zod';
import { corsOrigins, env } from './env.js';
import type { LlmClient } from './llm/index.js';
import { MemoryStore, type Store } from './store.js';
import {
  InterviewConfig, MVP_MODES, SUPPORTED_LANGUAGES_P0, Mode, Persona, Style, LanguageInput,
  type InterviewState, type Turn,
} from './domain.js';
import { planInterview, analyzeInterview, beginTurn, nextTurn, reviewAnswer, reconcilePatch, applyPatch } from './agents.js';
import { mintAccessToken, roomNameForSession, agentIdentityForSession, ensureInterviewRoom } from './livekit/token.js';
import { isAgent, resolveUserId, signToken, hashPassword, verifyPassword, SESSION_TTL_SEC } from './auth.js';

export interface AppDeps {
  llm: LlmClient;
  store?: Store;
}

const CreateConfigBody = z.object({
  userId: z.string().default('demo-user'),
  mode: Mode,
  role: z.string().min(1).max(120),
  persona: Persona,
  style: Style,
  language: LanguageInput.default('en'),
  lengthMinutes: z.number().int().min(5).max(60),
  topicFocus: z.string().max(200).optional(),
  jobDescription: z.string().max(8000).optional(),
  resumeText: z.string().max(12000).optional(),
  inviteToken: z.string().optional(),
});

export function buildApp(deps: AppDeps): FastifyInstance {
  const store = deps.store ?? new MemoryStore();
  const app = Fastify({ logger: false });

  // Per-session write serialization (D2): the live turn and the async reviewer's
  // apply never interleave their read-modify-write. LLM calls run OUTSIDE the lock.
  const locks = new Map<string, Promise<unknown>>();
  const withLock = <T,>(id: string, fn: () => Promise<T>): Promise<T> => {
    const prev = locks.get(id) ?? Promise.resolve();
    const next = prev.then(() => fn(), () => fn());
    locks.set(id, next.then(() => {}, () => {}));
    return next as Promise<T>;
  };

  app.register(cors, { origin: corsOrigins() });

  // Tolerate empty JSON bodies (clients POST to /begin, /token with no body).
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    const s = typeof body === 'string' ? body.trim() : '';
    if (!s) return done(null, {});
    try { done(null, JSON.parse(s)); } catch (e) { done(e as Error); }
  });

  app.setErrorHandler((err: Error, req, reply) => {
    console.error('[viva] error', req.method, req.url, '\n', err);
    // Don't leak internal/model error detail to clients in production (D14).
    const body = env.NODE_ENV === 'production' ? { error: 'internal' } : { error: 'internal', message: err.message };
    reply.code(500).send(body);
  });

  // Ownership/identity guard (D14): the agent worker (service token) or the
  // session's owner may touch a session; users may only read their own history.
  const ownerOf = async (id: string): Promise<string | null> => {
    const st = await store.getState(id);
    if (!st?.configId) return null;
    return (await store.getConfig(st.configId))?.userId ?? null;
  };
  app.addHook('preHandler', async (req, reply) => {
    const url = req.routeOptions?.url ?? '';
    if (url.startsWith('/v1/sessions/:id')) {
      const id = (req.params as { id?: string }).id;
      if (id && !isAgent(req)) {
        const uid = resolveUserId(req);
        const owner = await ownerOf(id);
        if (!uid || (owner !== null && owner !== uid)) return reply.code(403).send({ error: 'forbidden' });
      }
    } else if (url === '/v1/users/:userId/sessions') {
      const userId = (req.params as { userId?: string }).userId;
      if (!isAgent(req) && resolveUserId(req) !== userId) return reply.code(403).send({ error: 'forbidden' });
    }
  });

  app.get('/v1/healthz', async () => ({ ok: true, modes: MVP_MODES, languages: SUPPORTED_LANGUAGES_P0 }));

  // Auth (D14) — real password accounts. userId is a stable hash of the email.
  const userIdForEmail = (email: string) =>
    `user_${Buffer.from(email.toLowerCase().trim()).toString('base64url').slice(0, 24)}`;
  const SignupBody = z.object({ email: z.string().email().max(200), password: z.string().min(8).max(200) });

  // Create an account: hash the password (scrypt), persist the user, issue a token.
  app.post('/v1/auth/signup', async (req, reply) => {
    const body = SignupBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_body', details: body.error.flatten() });
    const email = body.data.email.toLowerCase().trim();
    if (await store.getUserByEmail(email)) return reply.code(409).send({ error: 'email_in_use' });
    const userId = userIdForEmail(email);
    await store.saveUser({ id: userId, email, passwordHash: hashPassword(body.data.password), createdAt: new Date().toISOString() });
    return reply.code(201).send({ userId, token: signToken(userId), expiresAt: Date.now() + SESSION_TTL_SEC * 1000 });
  });

  // Sign in: verify the password against the stored scrypt hash (constant-time).
  app.post('/v1/auth/signin', async (req, reply) => {
    const body = SignupBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_body' });
    const user = await store.getUserByEmail(body.data.email);
    // Always run a hash even on unknown email to avoid leaking which emails exist (timing).
    const ok = user ? verifyPassword(body.data.password, user.passwordHash) : verifyPassword(body.data.password, 'scrypt$x$x');
    if (!user || !ok) return reply.code(401).send({ error: 'invalid_credentials' });
    return reply.code(200).send({ userId: user.id, token: signToken(user.id), expiresAt: Date.now() + SESSION_TTL_SEC * 1000 });
  });

  // Legacy passwordless login — DEV/TEST ONLY. Disabled in production (it would
  // let anyone mint a token for any email). Real clients use signup/signin.
  app.post('/v1/auth/login', async (req, reply) => {
    if (env.NODE_ENV === 'production') return reply.code(403).send({ error: 'use_signup_or_signin' });
    const body = z.object({ email: z.string().min(3).max(200), password: z.string().optional() }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_body' });
    const userId = userIdForEmail(body.data.email);
    return { userId, token: signToken(userId), expiresAt: Date.now() + SESSION_TTL_SEC * 1000 };
  });

  // 1) Create an interview config from captured user preferences.
  app.post('/v1/configs', async (req, reply) => {
    const parsed = CreateConfigBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_config', details: parsed.error.flatten() });
    const b = parsed.data;
    if (!MVP_MODES.includes(b.mode)) return reply.code(409).send({ error: 'mode_not_available_in_mvp', mode: b.mode });
    if (!SUPPORTED_LANGUAGES_P0.includes(b.language)) return reply.code(409).send({ error: 'language_not_supported', language: b.language });
    // Identity comes from the verified token, never the request body (anti-IDOR, D14).
    const owner = resolveUserId(req);
    if (!owner) return reply.code(401).send({ error: 'unauthenticated' });
    const config: InterviewConfig = InterviewConfig.parse({ ...b, userId: owner, id: `cfg_${randomUUID().slice(0, 8)}`, createdAt: new Date().toISOString() });
    await store.saveConfig(config);
    return reply.code(201).send({ config });
  });

  // 2) Start a session: plan the interview, persist hot state, mint a LiveKit token.
  app.post('/v1/sessions', async (req, reply) => {
    const body = z.object({
      configId: z.string(),
      consent: z.object({ mic: z.boolean(), camera: z.boolean(), recording: z.boolean() }).optional(),
    }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_body' });
    const config = await store.getConfig(body.data.configId);
    if (!config) return reply.code(404).send({ error: 'config_not_found' });
    // Only the config's owner (or the agent worker) may start a session on it.
    if (!isAgent(req) && config.userId !== resolveUserId(req)) return reply.code(403).send({ error: 'forbidden' });
    const recordingEnabled = body.data.consent?.recording ?? false;

    const sessionId = `sess_${randomUUID().slice(0, 12)}`;
    const plan = await planInterview(deps.llm, config, sessionId);
    await store.savePlan(plan);

    const state: InterviewState = {
      sessionId, configId: config.id, version: 0, cursorIndex: 0, plan, turns: [], notes: [], reviews: [],
      phase: 'greeting', wrapping: false, recordingEnabled,
    };
    await store.saveState(state);
    await store.saveSummary({
      sessionId, userId: config.userId, mode: config.mode, role: config.role,
      createdAt: new Date().toISOString(), status: 'created',
    });

    const roomName = roomNameForSession(sessionId);
    // set persona/style/language on the room so the agent worker picks the right
    // voice, timing, and per-language STT/TTS at construction time (docs/30-i18n.md §3.4)
    await ensureInterviewRoom(roomName, { persona: config.persona, style: config.style, language: config.language });
    const { token, url, expiresAt } = await mintAccessToken({
      roomName, identity: `user-${config.userId}`, name: 'Candidate',
    });
    return reply.code(201).send({
      sessionId, roomName, livekit: { url, token, expiresAt },
      agentIdentity: agentIdentityForSession(sessionId),
      questionCount: plan.questions.length,
      openingLine: plan.openingLine,
    });
  });

  // 2b) Session detail — lets Live/Results/Transcript fetch persona, progress,
  // mode, and config without threading params through every screen.
  app.get('/v1/sessions/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const state = await store.getState(id);
    if (!state) return reply.code(404).send({ error: 'session_not_found' });
    const config = state.configId ? await store.getConfig(state.configId) : null;
    return {
      sessionId: id,
      configId: state.configId ?? null,
      mode: config?.mode ?? null,
      persona: config?.persona ?? null,
      role: config?.role ?? null,
      language: config?.language ?? null, // drives the live caption chip + report font on the client
      lengthMinutes: config?.lengthMinutes ?? null,
      questionCount: state.plan.questions.length,
      cursorIndex: state.cursorIndex,
      phase: state.phase,
      startedAt: state.startedAt ?? null, // lets the client resume the countdown from elapsed time
    };
  });

  // 3) Mint a fresh LiveKit token mid-session (client refreshes at TTL/2 — D14).
  app.post('/v1/sessions/:id/token', async (req, reply) => {
    const { id } = req.params as { id: string };
    const state = await store.getState(id);
    if (!state) return reply.code(404).send({ error: 'session_not_found' });
    const cfg = z.object({ userId: z.string().default('demo-user') }).parse(req.body ?? {});
    const { token, url, expiresAt } = await mintAccessToken({ roomName: roomNameForSession(id), identity: `user-${cfg.userId}` });
    return { livekit: { url, token, expiresAt } };
  });

  // 3b) Begin the conversation: greeting + first question (agent worker / demo).
  app.post('/v1/sessions/:id/begin', async (req, reply) => {
    const { id } = req.params as { id: string };
    const result = await withLock(id, async (): Promise<{ ok: true; out: unknown } | { ok: false; code: number; error: string }> => {
      const state = await store.getState(id);
      if (!state) return { ok: false, code: 404, error: 'session_not_found' };
      const config = state.configId ? await store.getConfig(state.configId) : null;
      if (!config) return { ok: false, code: 409, error: 'config_missing' };
      // Idempotent (D3): if already begun, return the line already spoken so a
      // reconnecting agent resumes without a second greeting / duplicate question.
      if (state.phase !== 'greeting' && state.lastSpokenLine) {
        const total = state.plan.questions.length;
        return { ok: true, out: { spokenText: state.lastSpokenLine, control: { action: 'advance' }, ended: state.phase === 'complete', index: Math.min(state.cursorIndex + 1, total), total } };
      }
      const out = await beginTurn(deps.llm, config, state);
      await store.saveState(state);
      return { ok: true, out };
    });
    if (!result.ok) return reply.code(result.code).send({ error: result.error });
    return result.out;
  });

  // 3c) Advance the conversation given the candidate's final answer. The agent
  // worker calls this each turn; the async Reviewer is dispatched off the path.
  app.post('/v1/sessions/:id/next-turn', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z.object({ candidateText: z.string() }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_body' });
    // Live turn under the per-session lock: read → LLM → apply → save atomically.
    const result = await withLock(id, async (): Promise<{ ok: true; out: unknown; justAnswered: unknown } | { ok: false; code: number; error: string }> => {
      const state = await store.getState(id);
      if (!state) return { ok: false, code: 404, error: 'session_not_found' };
      const config = state.configId ? await store.getConfig(state.configId) : null;
      if (!config) return { ok: false, code: 409, error: 'config_missing' };
      const out = await nextTurn(deps.llm, config, state, body.data.candidateText);
      await store.saveState(state);
      return { ok: true, out, justAnswered: state.turns[state.turns.length - 1] };
    });
    if (!result.ok) return reply.code(result.code).send({ error: result.error });

    // Async Response Reviewer — LLM runs OFF the speech path and OUTSIDE the lock;
    // only the apply (read-modify-write) is serialized, so it can't clobber a turn.
    const justAnswered = result.justAnswered as Turn | undefined;
    if (justAnswered) {
      void (async () => {
        const cfgState = await store.getState(id);
        const cfg = cfgState?.configId ? await store.getConfig(cfgState.configId) : null;
        if (!cfgState || !cfg) return;
        const reviewResult = await reviewAnswer(deps.llm, cfg, cfgState, justAnswered);
        await withLock(id, async () => {
          const fresh = await store.getState(id);
          if (!fresh) return;
          fresh.reviews = [...(fresh.reviews ?? []), reviewResult];
          const patch = reconcilePatch(fresh, reviewResult);
          const applied = patch ? applyPatch(fresh, patch) : false;
          fresh.notes.push(`review:${reviewResult.questionId}:${patch?.op ?? 'none'}${applied ? ':applied' : ''}`);
          await store.saveState(fresh);
        });
      })().catch(() => { /* reviewer failures never affect the live turn */ });
    }
    return result.out;
  });

  // 4) Complete the session → run the Analyst → persist the report (idempotent).
  app.post('/v1/sessions/:id/complete', async (req, reply) => {
    const { id } = req.params as { id: string };
    // Idempotent fast-path: a report already exists (agent + client both call this, D2).
    const existing = await store.getReport(id);
    if (existing) return reply.code(200).send({ report: existing });

    // Serialize under the per-session lock so the Opus Analyst can never run twice
    // on a concurrent double-call; the second caller sees the report inside the lock.
    const result = await withLock(id, async (): Promise<{ code: number; body: unknown }> => {
      const already = await store.getReport(id);
      if (already) return { code: 200, body: { report: already } };
      const state = await store.getState(id);
      if (!state) return { code: 404, body: { error: 'session_not_found' } };
      const config = state.configId ? await store.getConfig(state.configId) : null;
      const transcript = state.turns.map((t) => ({ q: t.interviewerText, a: t.candidateText }));
      if (transcript.length === 0) return { code: 409, body: { error: 'not_enough_to_score' } };
      const cfg = config ?? minimalConfigFromState(state);
      const priorReviews = (state.reviews ?? []).map((r: { questionId?: string; scores?: { competency: string; score: number }[]; note?: string }) => ({
        questionId: r.questionId ?? '', scores: (r.scores ?? []).map((s) => ({ competency: s.competency, score: s.score })), note: r.note ?? '',
      }));
      const report = await analyzeInterview(deps.llm, cfg, id, transcript, priorReviews);
      await store.saveReport(report);
      state.phase = 'complete';
      await store.saveState(state);
      const prevSummary = await store.getSummary(id);
      await store.saveSummary({
        sessionId: id, userId: cfg.userId, mode: cfg.mode, role: cfg.role,
        createdAt: prevSummary?.createdAt ?? new Date().toISOString(), // preserve original order (History sorts by createdAt)
        status: 'complete', overallScore: report.overallScore,
      });
      return { code: 201, body: { report } };
    });
    return reply.code(result.code).send(result.body);
  });

  // Full transcript (Q/A turns) for the Transcript screen.
  app.get('/v1/sessions/:id/transcript', async (req, reply) => {
    const { id } = req.params as { id: string };
    const state = await store.getState(id);
    if (!state) return reply.code(404).send({ error: 'session_not_found' });
    return { turns: state.turns.map((t) => ({ questionId: t.questionId, interviewerText: t.interviewerText, candidateText: t.candidateText })) };
  });

  // Past interviews for the History screen.
  app.get('/v1/users/:userId/sessions', async (req, reply) => {
    const { userId } = req.params as { userId: string };
    void reply;
    return { sessions: await store.listSummaries(userId) };
  });

  app.get('/v1/sessions/:id/report', async (req, reply) => {
    const { id } = req.params as { id: string };
    const report = await store.getReport(id);
    if (!report) return reply.code(404).send({ error: 'report_not_ready' });
    return { report };
  });

  // Compliance (App Store / GDPR): export everything we hold for the signed-in user.
  app.post('/v1/data/export', async (req, reply) => {
    const userId = resolveUserId(req);
    if (!userId) return reply.code(401).send({ error: 'unauthenticated' });
    const user = await store.getUser(userId);
    const configs = await store.listConfigs(userId);
    const summaries = await store.listSummaries(userId);
    const sessions = [];
    for (const s of summaries) {
      const state = await store.getState(s.sessionId);
      const report = await store.getReport(s.sessionId);
      sessions.push({
        summary: s,
        transcript: (state?.turns ?? []).map((t) => ({ questionId: t.questionId, interviewerText: t.interviewerText, candidateText: t.candidateText })),
        report: report ?? null,
      });
    }
    return reply.code(200).send({
      exportedAt: new Date().toISOString(),
      user: user ? { id: user.id, email: user.email, createdAt: user.createdAt } : { id: userId }, // never the passwordHash
      configs, sessions,
    });
  });

  // Compliance: permanently delete the signed-in user's account + all their data.
  app.post('/v1/data/delete', async (req, reply) => {
    const userId = resolveUserId(req);
    if (!userId) return reply.code(401).send({ error: 'unauthenticated' });
    await store.deleteUserData(userId);
    return reply.code(200).send({ deleted: true, userId });
  });

  return app;
}

// Fallback config view if a session was created out-of-band without a stored config.
function minimalConfigFromState(_state: InterviewState): InterviewConfig {
  return InterviewConfig.parse({
    id: 'cfg_inline', userId: 'demo-user', mode: 'mock', role: 'Candidate',
    persona: 'aria', style: 'balanced', language: 'en', lengthMinutes: 15,
    createdAt: new Date().toISOString(),
  });
}
