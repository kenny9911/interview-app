// Deterministic LlmClient for tests and offline dev. You provide a handler that
// maps a request to a response string (often JSON). Records calls for assertions.
import type { z } from 'zod';
import { type LlmClient, type LlmRequest, jsonViaText } from './index.js';

export type MockHandler = (req: LlmRequest) => string;

export class MockLlmClient implements LlmClient {
  public calls: LlmRequest[] = [];
  constructor(private handler: MockHandler) {}

  async text(req: LlmRequest): Promise<string> {
    this.calls.push(req);
    return this.handler(req);
  }

  json<T>(req: LlmRequest, schema: z.ZodType<T>): Promise<T> {
    // route through the same json-suffix path so the parser is exercised too
    return jsonViaText({ text: (r) => this.text(r) }, req, schema);
  }

  /** convenience: number of calls made with a given role */
  countByRole(role: LlmRequest['role']): number {
    return this.calls.filter((c) => c.role === role).length;
  }
}
