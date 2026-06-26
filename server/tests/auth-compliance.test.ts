import { describe, it, expect } from 'vitest';
import { buildApp } from '../src/app.js';
import { MemoryStore } from '../src/store.js';
import { hashPassword, verifyPassword } from '../src/auth.js';
import { makeMockLlm } from './_mock.js';

function app() { return buildApp({ llm: makeMockLlm(), store: new MemoryStore() }); }
const cfg = { mode: 'mock', role: 'Product Manager', persona: 'aria', style: 'balanced', language: 'en', lengthMinutes: 15 };

describe('password hashing (scrypt)', () => {
  it('round-trips and rejects the wrong password; never stores plaintext', () => {
    const h = hashPassword('correct horse battery staple');
    expect(verifyPassword('correct horse battery staple', h)).toBe(true);
    expect(verifyPassword('wrong password', h)).toBe(false);
    expect(h.startsWith('scrypt$')).toBe(true);
    expect(h).not.toContain('correct'); // hash, not plaintext
  });
  it('rejects malformed stored hashes without throwing', () => {
    expect(verifyPassword('x', 'not-a-hash')).toBe(false);
    expect(verifyPassword('x', '')).toBe(false);
  });
});

describe('account auth (signup / signin)', () => {
  it('signup creates an account + token; a duplicate email is 409 (case-insensitive)', async () => {
    const a = app();
    const res = await a.inject({ method: 'POST', url: '/v1/auth/signup', payload: { email: 'Maya@Example.com', password: 'hunter2hunter' } });
    expect(res.statusCode).toBe(201);
    expect(res.json().token.split('.')).toHaveLength(3);
    const dup = await a.inject({ method: 'POST', url: '/v1/auth/signup', payload: { email: 'maya@example.com', password: 'different123' } });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error).toBe('email_in_use');
  });

  it('signin verifies the password (wrong password and unknown email → 401)', async () => {
    const a = app();
    await a.inject({ method: 'POST', url: '/v1/auth/signup', payload: { email: 'jo@example.com', password: 'rightpass123' } });
    expect((await a.inject({ method: 'POST', url: '/v1/auth/signin', payload: { email: 'jo@example.com', password: 'rightpass123' } })).statusCode).toBe(200);
    expect((await a.inject({ method: 'POST', url: '/v1/auth/signin', payload: { email: 'jo@example.com', password: 'WRONGpass123' } })).statusCode).toBe(401);
    expect((await a.inject({ method: 'POST', url: '/v1/auth/signin', payload: { email: 'nobody@example.com', password: 'whatever12' } })).statusCode).toBe(401);
  });

  it('rejects weak passwords and invalid emails at signup', async () => {
    const a = app();
    expect((await a.inject({ method: 'POST', url: '/v1/auth/signup', payload: { email: 'x@y.com', password: 'short' } })).statusCode).toBe(400);
    expect((await a.inject({ method: 'POST', url: '/v1/auth/signup', payload: { email: 'notanemail', password: 'longenough1' } })).statusCode).toBe(400);
  });
});

describe('compliance (export / delete)', () => {
  it('exports the user\'s data and never leaks the password hash', async () => {
    const a = app();
    const { token, userId } = (await a.inject({ method: 'POST', url: '/v1/auth/signup', payload: { email: 'ex@example.com', password: 'password1234' } })).json();
    const auth = { authorization: `Bearer ${token}` };
    await a.inject({ method: 'POST', url: '/v1/configs', headers: auth, payload: cfg });
    const exp = await a.inject({ method: 'POST', url: '/v1/data/export', headers: auth });
    expect(exp.statusCode).toBe(200);
    const body = exp.json();
    expect(body.user.id).toBe(userId);
    expect(body.user.email).toBe('ex@example.com');
    expect(body.configs.length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(body)).not.toContain('scrypt'); // password hash never exported
  });

  it('delete purges the user so a subsequent export is empty', async () => {
    const a = app();
    const { token } = (await a.inject({ method: 'POST', url: '/v1/auth/signup', payload: { email: 'del@example.com', password: 'password1234' } })).json();
    const auth = { authorization: `Bearer ${token}` };
    await a.inject({ method: 'POST', url: '/v1/configs', headers: auth, payload: cfg });
    const del = await a.inject({ method: 'POST', url: '/v1/data/delete', headers: auth });
    expect(del.statusCode).toBe(200);
    expect(del.json().deleted).toBe(true);
    const exp = await a.inject({ method: 'POST', url: '/v1/data/export', headers: auth });
    expect(exp.json().configs.length).toBe(0); // account + data gone
  });
});
