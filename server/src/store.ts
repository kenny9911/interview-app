// Storage abstraction. The in-memory implementation lets the API and tests run
// without Postgres; a Postgres-backed impl is a drop-in replacement (same
// interface) for production. (docs/20-architecture.md; docs/15-decisions.md D3.)
import type { InterviewConfig, InterviewState, InterviewReport, QuestionPlan, SessionSummary, User } from './domain.js';

export interface Store {
  // accounts (real password auth; D14)
  saveUser(u: User): Promise<void>;
  getUser(id: string): Promise<User | null>;
  getUserByEmail(email: string): Promise<User | null>;

  saveConfig(c: InterviewConfig): Promise<void>;
  getConfig(id: string): Promise<InterviewConfig | null>;
  listConfigs(userId: string): Promise<InterviewConfig[]>;

  // compliance (App Store data-deletion requirement) — purge everything for a user
  deleteUserData(userId: string): Promise<void>;

  saveState(s: InterviewState): Promise<void>;
  /** Optimistic-concurrency save (D2): only persists if the stored version still
   *  matches `expectedVersion`. Returns false on conflict so callers can retry. */
  saveStateIfVersion(s: InterviewState, expectedVersion: number): Promise<boolean>;
  getState(sessionId: string): Promise<InterviewState | null>;

  savePlan(p: QuestionPlan): Promise<void>;

  saveReport(r: InterviewReport): Promise<void>;
  getReport(sessionId: string): Promise<InterviewReport | null>;

  saveSummary(s: SessionSummary): Promise<void>;
  getSummary(sessionId: string): Promise<SessionSummary | null>;
  listSummaries(userId: string): Promise<SessionSummary[]>;
}

export class MemoryStore implements Store {
  private users = new Map<string, User>();
  private configs = new Map<string, InterviewConfig>();
  private states = new Map<string, InterviewState>();
  private plans = new Map<string, QuestionPlan>();
  private reports = new Map<string, InterviewReport>();
  private summaries = new Map<string, SessionSummary>();

  async saveUser(u: User) { this.users.set(u.id, structuredClone(u)); }
  async getUser(id: string) { const u = this.users.get(id); return u ? structuredClone(u) : null; }
  async getUserByEmail(email: string) {
    const e = email.toLowerCase().trim();
    for (const u of this.users.values()) if (u.email === e) return structuredClone(u);
    return null;
  }

  async saveConfig(c: InterviewConfig) { this.configs.set(c.id, c); }
  async getConfig(id: string) { return this.configs.get(id) ?? null; }
  async listConfigs(userId: string) { return [...this.configs.values()].filter((c) => c.userId === userId); }

  async deleteUserData(userId: string) {
    const sessionIds = [...this.summaries.values()].filter((s) => s.userId === userId).map((s) => s.sessionId);
    for (const sid of sessionIds) { this.states.delete(sid); this.plans.delete(sid); this.reports.delete(sid); this.summaries.delete(sid); }
    for (const [id, c] of this.configs) if (c.userId === userId) this.configs.delete(id);
    this.users.delete(userId);
  }

  // structuredClone on read+write so callers can't mutate stored state by reference
  // across awaits (prevents the cross-path lost-update class of bug).
  async saveState(s: InterviewState) { this.states.set(s.sessionId, structuredClone(s)); }
  async saveStateIfVersion(s: InterviewState, expectedVersion: number) {
    const cur = this.states.get(s.sessionId);
    if (cur && cur.version !== expectedVersion) return false;
    this.states.set(s.sessionId, structuredClone(s));
    return true;
  }
  async getState(sessionId: string) {
    const s = this.states.get(sessionId);
    return s ? structuredClone(s) : null;
  }

  async savePlan(p: QuestionPlan) { this.plans.set(p.sessionId, p); }

  async saveReport(r: InterviewReport) { this.reports.set(r.sessionId, r); }
  async getReport(sessionId: string) { return this.reports.get(sessionId) ?? null; }

  async saveSummary(s: SessionSummary) { this.summaries.set(s.sessionId, s); }
  async getSummary(sessionId: string) { return this.summaries.get(sessionId) ?? null; }
  async listSummaries(userId: string) {
    return [...this.summaries.values()]
      .filter((s) => s.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}
