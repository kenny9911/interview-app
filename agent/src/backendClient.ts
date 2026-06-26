// Thin client the agent uses to drive turns via the backend brain. Keeping the
// four-agent orchestration in the backend (one tested place) means the worker
// only owns audio I/O. Pure + testable (inject fetch).
import { env } from './env.js';

export interface TurnReply { spokenText: string; control: { action: string }; ended: boolean; index: number; total: number }

export interface BackendClientOptions {
  // retry transient failures (network errors + 5xx). 4xx fails fast — those are
  // deterministic (validation, already-completed) and a retry won't help.
  retries?: number;
  retryDelayMs?: number;
}

type FetchLike = typeof fetch;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class BackendClient {
  private readonly retries: number;
  private readonly retryDelayMs: number;

  constructor(private baseUrl = env.API_BASE_URL, private fetchImpl: FetchLike = fetch, opts: BackendClientOptions = {}) {
    this.retries = opts.retries ?? 1;
    this.retryDelayMs = opts.retryDelayMs ?? 300;
  }

  private async post<T>(path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const init: RequestInit = {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${env.AGENT_SERVICE_TOKEN}` },
      body: body ? JSON.stringify(body) : undefined,
    };
    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await this.fetchImpl(url, init);
      } catch (err) {
        // network-level failure (DNS, connection reset): transient, retry if budget remains.
        if (attempt >= this.retries) throw err;
        await sleep(this.retryDelayMs);
        continue;
      }
      if (res.ok) return (await res.json()) as T;
      // only the server-side 5xx band is worth retrying; 4xx is the caller's fault.
      if (res.status >= 500 && attempt < this.retries) {
        await sleep(this.retryDelayMs);
        continue;
      }
      throw new Error(`backend ${path} -> ${res.status}: ${await res.text()}`);
    }
  }

  begin(sessionId: string): Promise<TurnReply> {
    return this.post<TurnReply>(`/v1/sessions/${sessionId}/begin`);
  }

  nextTurn(sessionId: string, candidateText: string): Promise<TurnReply> {
    return this.post<TurnReply>(`/v1/sessions/${sessionId}/next-turn`, { candidateText });
  }

  complete(sessionId: string): Promise<unknown> {
    return this.post(`/v1/sessions/${sessionId}/complete`);
  }
}
