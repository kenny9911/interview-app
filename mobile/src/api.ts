// Typed client for the viva backend. Mirrors server/src/app.ts routes.
import { config } from './config';
import { getToken, getUserId, clearAuth } from './auth';

export type Mode = 'mock' | 'topic_practice' | 'capability_assessment' | 'real' | 'expert_interview';
export type Persona = 'aria' | 'sam' | 'lena';
export type Style = 'friendly' | 'balanced' | 'tough';

export interface CreateConfigInput {
  userId?: string;
  mode: Mode;
  role: string;
  persona: Persona;
  style: Style;
  language?: string;
  lengthMinutes: number;
  topicFocus?: string;
  jobDescription?: string;
  resumeText?: string;
}

export interface SessionStart {
  sessionId: string;
  roomName: string;
  livekit: { url: string; token: string; expiresAt: number };
  agentIdentity: string;
  questionCount: number;
  openingLine: string;
}

// index/total mirror the backend's /begin + /next-turn responses so the client
// can show "Question 3 of 8" from the REST reply, not only the data-channel signal.
export interface TurnReply { spokenText: string; control: { action: string }; ended: boolean; index: number; total: number }

export interface Report {
  sessionId: string;
  overallScore: number;
  band: string;
  competencyScores: { competency: string; score: number; summary: string; evidence: string[] }[];
  stoodOut: string;
  workOn: string;
  perQuestion: { questionId: string; question: string; feedback: string; evidenceQuote: string }[];
  noAffectStatement: string;
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(`${config.apiUrl}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    // An expired/invalid session token shouldn't keep getting reused — drop it so
    // the app falls back to the signed-out state and the user can re-authenticate.
    if (res.status === 401) clearAuth();
    const body = await res.text();
    throw new ApiError(res.status, body);
  }
  return (await res.json()) as T;
}

export class ApiError extends Error {
  constructor(public status: number, public body: string) {
    super(`API ${status}: ${body}`);
  }
}

export interface ConsentScopes { mic: boolean; camera: boolean; recording: boolean }
export interface SessionDetail {
  sessionId: string; configId: string | null; mode: Mode | null; persona: Persona | null;
  role: string | null; lengthMinutes: number | null; questionCount: number; cursorIndex: number; phase: string;
  startedAt: string | null; // ISO time the interview began; null until first begin (drives resume countdown)
}
export interface TranscriptTurn { questionId: string; interviewerText: string; candidateText: string }
export interface SessionSummary { sessionId: string; mode: Mode; role: string; createdAt: string; status: 'created' | 'complete'; overallScore?: number }
export interface DataExport {
  exportedAt: string;
  user: { id: string; email?: string; createdAt?: string };
  configs: unknown[];
  sessions: { summary: SessionSummary; transcript: TranscriptTurn[]; report: Report | null }[];
}

export const api = {
  health: () => req<{ ok: boolean; modes: Mode[]; languages: string[] }>('/v1/healthz'),

  // legacy passwordless login (dev/test only; the server rejects it in production)
  login: (email: string, password?: string) =>
    req<{ userId: string; token: string; expiresAt: number }>('/v1/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),

  // real account auth (scrypt-hashed passwords server-side)
  signup: (email: string, password: string) =>
    req<{ userId: string; token: string; expiresAt: number }>('/v1/auth/signup', { method: 'POST', body: JSON.stringify({ email, password }) }),
  signin: (email: string, password: string) =>
    req<{ userId: string; token: string; expiresAt: number }>('/v1/auth/signin', { method: 'POST', body: JSON.stringify({ email, password }) }),

  // compliance: export everything we hold, or permanently delete the account
  exportData: () => req<DataExport>('/v1/data/export', { method: 'POST' }),
  deleteData: () => req<{ deleted: boolean; userId: string }>('/v1/data/delete', { method: 'POST' }),

  createConfig: (input: CreateConfigInput) =>
    req<{ config: { id: string } }>('/v1/configs', { method: 'POST', body: JSON.stringify({ userId: getUserId(), ...input }) }),

  startSession: (configId: string, consent?: ConsentScopes) =>
    req<SessionStart>('/v1/sessions', { method: 'POST', body: JSON.stringify({ configId, consent }) }),

  getSession: (sessionId: string) =>
    req<SessionDetail>(`/v1/sessions/${sessionId}`),

  refreshToken: (sessionId: string, userId = getUserId()) =>
    req<{ livekit: { url: string; token: string; expiresAt: number } }>(`/v1/sessions/${sessionId}/token`, {
      method: 'POST', body: JSON.stringify({ userId }),
    }),

  beginInterview: (sessionId: string) =>
    req<TurnReply>(`/v1/sessions/${sessionId}/begin`, { method: 'POST' }),

  nextTurn: (sessionId: string, candidateText: string) =>
    req<TurnReply>(`/v1/sessions/${sessionId}/next-turn`, { method: 'POST', body: JSON.stringify({ candidateText }) }),

  complete: (sessionId: string) =>
    req<{ report: Report }>(`/v1/sessions/${sessionId}/complete`, { method: 'POST' }),

  getReport: (sessionId: string) =>
    req<{ report: Report }>(`/v1/sessions/${sessionId}/report`),

  getTranscript: (sessionId: string) =>
    req<{ turns: TranscriptTurn[] }>(`/v1/sessions/${sessionId}/transcript`),

  listSessions: (userId = getUserId()) =>
    req<{ sessions: SessionSummary[] }>(`/v1/users/${userId}/sessions`),
};
