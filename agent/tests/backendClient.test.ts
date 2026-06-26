import { describe, it, expect } from 'vitest';
import { BackendClient } from '../src/backendClient.js';

function fakeFetch(record: { path: string; body?: string }[]) {
  return (async (url: string, init?: RequestInit) => {
    record.push({ path: String(url), body: init?.body as string | undefined });
    return new Response(JSON.stringify({ spokenText: 'Hello there.', control: { action: 'advance' }, ended: false }), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
}

describe('agent BackendClient', () => {
  it('calls begin / next-turn / complete with the right paths', async () => {
    const calls: { path: string; body?: string }[] = [];
    const c = new BackendClient('http://localhost:4000', fakeFetch(calls));

    const begin = await c.begin('sess1');
    expect(begin.spokenText).toBe('Hello there.');
    await c.nextTurn('sess1', 'my answer');
    await c.complete('sess1');

    expect(calls[0]!.path).toBe('http://localhost:4000/v1/sessions/sess1/begin');
    expect(calls[1]!.path).toBe('http://localhost:4000/v1/sessions/sess1/next-turn');
    expect(JSON.parse(calls[1]!.body!)).toEqual({ candidateText: 'my answer' });
    expect(calls[2]!.path).toBe('http://localhost:4000/v1/sessions/sess1/complete');
  });

  it('throws on a non-2xx response', async () => {
    const c = new BackendClient('http://localhost:4000', (async () => new Response('nope', { status: 500 })) as unknown as typeof fetch, { retryDelayMs: 0 });
    await expect(c.begin('sessX')).rejects.toThrow(/500/);
  });

  it('retries a transient 5xx, then succeeds (no dead air)', async () => {
    let n = 0;
    const fetchImpl = (async () => {
      n++;
      if (n === 1) return new Response('boom', { status: 503 });
      return new Response(JSON.stringify({ spokenText: 'Recovered.', control: { action: 'advance' }, ended: false }), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    }) as unknown as typeof fetch;
    const c = new BackendClient('http://x', fetchImpl, { retries: 1, retryDelayMs: 0 });
    const reply = await c.nextTurn('s', 'answer');
    expect(reply.spokenText).toBe('Recovered.');
    expect(n).toBe(2); // one retry
  });

  it('retries a network-level throw, then succeeds', async () => {
    let n = 0;
    const fetchImpl = (async () => {
      n++;
      if (n === 1) throw new Error('ECONNRESET');
      return new Response(JSON.stringify({ spokenText: 'Back.', control: { action: 'advance' }, ended: false }), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    }) as unknown as typeof fetch;
    const c = new BackendClient('http://x', fetchImpl, { retries: 1, retryDelayMs: 0 });
    expect((await c.begin('s')).spokenText).toBe('Back.');
    expect(n).toBe(2);
  });

  it('does NOT retry a 4xx (deterministic) — fails fast on the first call', async () => {
    let n = 0;
    const fetchImpl = (async () => { n++; return new Response('already done', { status: 409 }); }) as unknown as typeof fetch;
    const c = new BackendClient('http://x', fetchImpl, { retries: 3, retryDelayMs: 0 });
    await expect(c.complete('s')).rejects.toThrow(/409/);
    expect(n).toBe(1);
  });

  it('gives up after exhausting retries on a persistent 5xx', async () => {
    let n = 0;
    const fetchImpl = (async () => { n++; return new Response('down', { status: 502 }); }) as unknown as typeof fetch;
    const c = new BackendClient('http://x', fetchImpl, { retries: 2, retryDelayMs: 0 });
    await expect(c.nextTurn('s', 'a')).rejects.toThrow(/502/);
    expect(n).toBe(3); // initial + 2 retries
  });

  // The agent's entry() guards the very first begin() with its own retry-once
  // fallback (holding line -> retry -> apology). That fallback hinges on two
  // BackendClient contracts: begin() throws a terminal error when the backend
  // stays down, and a fresh begin() succeeds once the backend recovers. These
  // two tests pin those contracts so the startup handler stays correct without
  // having to mock the whole LiveKit runtime.
  it('begin() throws a terminal error when the backend stays down (drives the startup apology)', async () => {
    const fetchImpl = (async () => new Response('down', { status: 503 })) as unknown as typeof fetch;
    const c = new BackendClient('http://x', fetchImpl, { retries: 1, retryDelayMs: 0 });
    await expect(c.begin('s')).rejects.toThrow(/503/);
  });

  it('a second begin() succeeds once the backend recovers (drives the startup retry)', async () => {
    let down = true;
    const fetchImpl = (async () => {
      if (down) return new Response('down', { status: 503 });
      return new Response(JSON.stringify({ spokenText: 'Welcome back.', control: { action: 'advance' }, ended: false }), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    }) as unknown as typeof fetch;
    const c = new BackendClient('http://x', fetchImpl, { retries: 0, retryDelayMs: 0 });
    await expect(c.begin('s')).rejects.toThrow(/503/); // first attempt fails
    down = false; // backend recovers before the agent's retry
    expect((await c.begin('s')).spokenText).toBe('Welcome back.');
  });
});
