// Minimal HS256 JWT (no external dep) + request identity resolution (D14).
// Full client login/issuance is a separate epic; this closes the IDOR surface:
// identity comes from a verified token, the agent worker presents a service
// token, and session routes enforce ownership.
import crypto from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import { env } from './env.js';

const b64u = (b: Buffer) => b.toString('base64url');

// App session length. 7 days (was 15 min) so users aren't locked out mid- or
// post-interview given there's no refresh-token infra yet. Short-lived LiveKit
// room tokens are minted separately and refreshed by the client.
export const SESSION_TTL_SEC = 7 * 24 * 3600;

export function signToken(sub: string, ttlSec = SESSION_TTL_SEC): string {
  const h = b64u(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const p = b64u(Buffer.from(JSON.stringify({ sub, exp: Math.floor(Date.now() / 1000) + ttlSec })));
  const data = `${h}.${p}`;
  const sig = b64u(crypto.createHmac('sha256', env.JWT_SECRET).update(data).digest());
  return `${data}.${sig}`;
}

export function verifyToken(token: string): string | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, p, s] = parts as [string, string, string];
  const expected = b64u(crypto.createHmac('sha256', env.JWT_SECRET).update(`${h}.${p}`).digest());
  if (s.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString()) as { sub?: string; exp?: number };
    if (payload.exp && payload.exp * 1000 < Date.now()) return null;
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

// Password hashing with scrypt (built-in node:crypto — no external dep). Format:
// `scrypt$<saltB64u>$<hashB64u>`. Verification is constant-time.
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 32);
  return `scrypt$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[1]!, 'base64url');
  const expected = Buffer.from(parts[2]!, 'base64url');
  const actual = crypto.scryptSync(password, salt, expected.length);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

export function bearer(req: FastifyRequest): string | null {
  const h = req.headers.authorization;
  return h?.startsWith('Bearer ') ? h.slice(7) : null;
}

/** True if the request carries the agent worker's service token. */
export function isAgent(req: FastifyRequest): boolean {
  const t = bearer(req);
  return !!t && t === env.AGENT_SERVICE_TOKEN;
}

/** Resolve the caller's userId from a verified JWT; in dev/test fall back to demo-user. */
export function resolveUserId(req: FastifyRequest): string | null {
  const t = bearer(req);
  if (t) {
    if (t === env.AGENT_SERVICE_TOKEN) return null; // service token has no user identity
    const sub = verifyToken(t);
    if (sub) return sub;
  }
  return env.NODE_ENV === 'production' ? null : 'demo-user';
}
