// Real persistent Store backed by Node's built-in SQLite (node:sqlite, Node 22.5+).
// Drop-in for MemoryStore — same interface, but data survives restarts (the
// "no mock data" requirement). Each entity is stored as a validated JSON blob;
// `states` carries an explicit version column for the D2 optimistic-concurrency
// CAS. Swappable for a Postgres-backed impl at scale (docs/20-architecture.md).
import { DatabaseSync } from 'node:sqlite';
import type { Store } from './store.js';
import type { InterviewConfig, InterviewState, InterviewReport, QuestionPlan, SessionSummary, User } from './domain.js';

type Row = Record<string, unknown>;

export class SqliteStore implements Store {
  private db: DatabaseSync;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users      (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS configs   (id TEXT PRIMARY KEY, user_id TEXT, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS states     (session_id TEXT PRIMARY KEY, version INTEGER NOT NULL, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS plans      (session_id TEXT PRIMARY KEY, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS reports    (session_id TEXT PRIMARY KEY, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS summaries  (session_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at TEXT NOT NULL, json TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS idx_summaries_user ON summaries(user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_configs_user ON configs(user_id);
    `);
    // migrate older dev DBs whose configs table predates the user_id column.
    try { this.db.exec('ALTER TABLE configs ADD COLUMN user_id TEXT'); } catch { /* column already exists */ }
  }

  // -- users (real password auth; D14) --
  async saveUser(u: User): Promise<void> {
    this.db.prepare('INSERT INTO users(id,email,json) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email, json=excluded.json')
      .run(u.id, u.email, JSON.stringify(u));
  }
  async getUser(id: string): Promise<User | null> {
    const r = this.db.prepare('SELECT json FROM users WHERE id=?').get(id) as Row | undefined;
    return r ? (JSON.parse(r.json as string) as User) : null;
  }
  async getUserByEmail(email: string): Promise<User | null> {
    const r = this.db.prepare('SELECT json FROM users WHERE email=?').get(email.toLowerCase().trim()) as Row | undefined;
    return r ? (JSON.parse(r.json as string) as User) : null;
  }

  // -- configs --
  async saveConfig(c: InterviewConfig): Promise<void> {
    this.db.prepare('INSERT INTO configs(id,user_id,json) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET user_id=excluded.user_id, json=excluded.json')
      .run(c.id, c.userId, JSON.stringify(c));
  }
  async getConfig(id: string): Promise<InterviewConfig | null> {
    const r = this.db.prepare('SELECT json FROM configs WHERE id=?').get(id) as Row | undefined;
    return r ? (JSON.parse(r.json as string) as InterviewConfig) : null;
  }
  async listConfigs(userId: string): Promise<InterviewConfig[]> {
    const rows = this.db.prepare('SELECT json FROM configs WHERE user_id=?').all(userId) as Row[];
    return rows.map((r) => JSON.parse(r.json as string) as InterviewConfig);
  }

  // -- compliance: purge all of a user's data (App Store deletion requirement) --
  async deleteUserData(userId: string): Promise<void> {
    const rows = this.db.prepare('SELECT session_id FROM summaries WHERE user_id=?').all(userId) as Row[];
    const del = this.db.prepare('DELETE FROM states WHERE session_id=?');
    const delP = this.db.prepare('DELETE FROM plans WHERE session_id=?');
    const delR = this.db.prepare('DELETE FROM reports WHERE session_id=?');
    for (const r of rows) { const sid = r.session_id as string; del.run(sid); delP.run(sid); delR.run(sid); }
    this.db.prepare('DELETE FROM summaries WHERE user_id=?').run(userId);
    this.db.prepare('DELETE FROM configs WHERE user_id=?').run(userId);
    this.db.prepare('DELETE FROM users WHERE id=?').run(userId);
  }

  // -- session state (with CAS) --
  private writeState(s: InterviewState): void {
    this.db.prepare('INSERT INTO states(session_id,version,json) VALUES(?,?,?) ON CONFLICT(session_id) DO UPDATE SET version=excluded.version, json=excluded.json')
      .run(s.sessionId, s.version, JSON.stringify(s));
  }
  async saveState(s: InterviewState): Promise<void> { this.writeState(s); }
  async saveStateIfVersion(s: InterviewState, expectedVersion: number): Promise<boolean> {
    // DatabaseSync is synchronous + JS is single-threaded, so this read→write
    // pair runs atomically (no await between them) — a correct CAS for one process.
    const cur = this.db.prepare('SELECT version FROM states WHERE session_id=?').get(s.sessionId) as Row | undefined;
    if (cur && (cur.version as number) !== expectedVersion) return false;
    this.writeState(s);
    return true;
  }
  async getState(sessionId: string): Promise<InterviewState | null> {
    const r = this.db.prepare('SELECT json FROM states WHERE session_id=?').get(sessionId) as Row | undefined;
    return r ? (JSON.parse(r.json as string) as InterviewState) : null;
  }

  // -- plans --
  async savePlan(p: QuestionPlan): Promise<void> {
    this.db.prepare('INSERT INTO plans(session_id,json) VALUES(?,?) ON CONFLICT(session_id) DO UPDATE SET json=excluded.json')
      .run(p.sessionId, JSON.stringify(p));
  }

  // -- reports --
  async saveReport(r: InterviewReport): Promise<void> {
    this.db.prepare('INSERT INTO reports(session_id,json) VALUES(?,?) ON CONFLICT(session_id) DO UPDATE SET json=excluded.json')
      .run(r.sessionId, JSON.stringify(r));
  }
  async getReport(sessionId: string): Promise<InterviewReport | null> {
    const r = this.db.prepare('SELECT json FROM reports WHERE session_id=?').get(sessionId) as Row | undefined;
    return r ? (JSON.parse(r.json as string) as InterviewReport) : null;
  }

  // -- summaries (history) --
  async saveSummary(s: SessionSummary): Promise<void> {
    this.db.prepare('INSERT INTO summaries(session_id,user_id,created_at,json) VALUES(?,?,?,?) ON CONFLICT(session_id) DO UPDATE SET user_id=excluded.user_id, created_at=excluded.created_at, json=excluded.json')
      .run(s.sessionId, s.userId, s.createdAt, JSON.stringify(s));
  }
  async getSummary(sessionId: string): Promise<SessionSummary | null> {
    const r = this.db.prepare('SELECT json FROM summaries WHERE session_id=?').get(sessionId) as Row | undefined;
    return r ? (JSON.parse(r.json as string) as SessionSummary) : null;
  }
  async listSummaries(userId: string): Promise<SessionSummary[]> {
    const rows = this.db.prepare('SELECT json FROM summaries WHERE user_id=? ORDER BY created_at DESC').all(userId) as Row[];
    return rows.map((r) => JSON.parse(r.json as string) as SessionSummary);
  }
}
