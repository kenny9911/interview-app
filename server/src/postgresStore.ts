// Postgres-backed Store (works with Supabase, Neon, RDS, or local Postgres).
// Same Store interface as SqliteStore — entities are JSON blobs in TEXT columns
// so the domain shapes round-trip unchanged. Optimistic-concurrency (D2) is a
// version-checked UPDATE; per-session app-level locks serialize writes, so the
// update→insert fallback is race-safe in practice. Inject a `pg.Pool` so tests
// can run against pg-mem (in-memory Postgres) instead of a live database.
import type { Pool } from 'pg';
import type { Store } from './store.js';
import type { InterviewConfig, InterviewState, InterviewReport, QuestionPlan, SessionSummary, User } from './domain.js';

type Row = Record<string, unknown>;

export class PostgresStore implements Store {
  constructor(private pool: Pool) {}

  /** Create tables/indexes if absent. Call once before serving. */
  async init(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS users      (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS configs    (id TEXT PRIMARY KEY, user_id TEXT, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS states      (session_id TEXT PRIMARY KEY, version INTEGER NOT NULL, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS plans       (session_id TEXT PRIMARY KEY, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS reports     (session_id TEXT PRIMARY KEY, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS summaries   (session_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at TEXT NOT NULL, json TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS idx_summaries_user ON summaries(user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_configs_user ON configs(user_id);
    `);
  }

  async close(): Promise<void> { await this.pool.end(); }

  private async one(text: string, params: unknown[]): Promise<Row | null> {
    const r = await this.pool.query(text, params);
    return (r.rows[0] as Row | undefined) ?? null;
  }

  // -- users --
  async saveUser(u: User): Promise<void> {
    await this.pool.query(
      'INSERT INTO users(id,email,json) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET email=$2, json=$3',
      [u.id, u.email.toLowerCase().trim(), JSON.stringify(u)],
    );
  }
  async getUser(id: string): Promise<User | null> {
    const r = await this.one('SELECT json FROM users WHERE id=$1', [id]);
    return r ? (JSON.parse(r.json as string) as User) : null;
  }
  async getUserByEmail(email: string): Promise<User | null> {
    const r = await this.one('SELECT json FROM users WHERE email=$1', [email.toLowerCase().trim()]);
    return r ? (JSON.parse(r.json as string) as User) : null;
  }

  // -- configs --
  async saveConfig(c: InterviewConfig): Promise<void> {
    await this.pool.query(
      'INSERT INTO configs(id,user_id,json) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET user_id=$2, json=$3',
      [c.id, c.userId, JSON.stringify(c)],
    );
  }
  async getConfig(id: string): Promise<InterviewConfig | null> {
    const r = await this.one('SELECT json FROM configs WHERE id=$1', [id]);
    return r ? (JSON.parse(r.json as string) as InterviewConfig) : null;
  }
  async listConfigs(userId: string): Promise<InterviewConfig[]> {
    const r = await this.pool.query('SELECT json FROM configs WHERE user_id=$1', [userId]);
    return r.rows.map((x) => JSON.parse((x as Row).json as string) as InterviewConfig);
  }

  // -- session state (version-checked CAS, D2) --
  async saveState(s: InterviewState): Promise<void> {
    await this.pool.query(
      'INSERT INTO states(session_id,version,json) VALUES($1,$2,$3) ON CONFLICT(session_id) DO UPDATE SET version=$2, json=$3',
      [s.sessionId, s.version, JSON.stringify(s)],
    );
  }
  async saveStateIfVersion(s: InterviewState, expectedVersion: number): Promise<boolean> {
    const json = JSON.stringify(s);
    const upd = await this.pool.query(
      'UPDATE states SET version=$2, json=$3 WHERE session_id=$1 AND version=$4',
      [s.sessionId, s.version, json, expectedVersion],
    );
    if ((upd.rowCount ?? 0) > 0) return true;
    // No row updated: either the row doesn't exist yet, or its version differs (stale).
    const exists = await this.pool.query('SELECT 1 FROM states WHERE session_id=$1', [s.sessionId]);
    if ((exists.rowCount ?? 0) > 0) return false; // present but version mismatch → conflict
    await this.pool.query('INSERT INTO states(session_id,version,json) VALUES($1,$2,$3)', [s.sessionId, s.version, json]);
    return true;
  }
  async getState(sessionId: string): Promise<InterviewState | null> {
    const r = await this.one('SELECT json FROM states WHERE session_id=$1', [sessionId]);
    return r ? (JSON.parse(r.json as string) as InterviewState) : null;
  }

  // -- plans --
  async savePlan(p: QuestionPlan): Promise<void> {
    await this.pool.query(
      'INSERT INTO plans(session_id,json) VALUES($1,$2) ON CONFLICT(session_id) DO UPDATE SET json=$2',
      [p.sessionId, JSON.stringify(p)],
    );
  }

  // -- reports --
  async saveReport(rep: InterviewReport): Promise<void> {
    await this.pool.query(
      'INSERT INTO reports(session_id,json) VALUES($1,$2) ON CONFLICT(session_id) DO UPDATE SET json=$2',
      [rep.sessionId, JSON.stringify(rep)],
    );
  }
  async getReport(sessionId: string): Promise<InterviewReport | null> {
    const r = await this.one('SELECT json FROM reports WHERE session_id=$1', [sessionId]);
    return r ? (JSON.parse(r.json as string) as InterviewReport) : null;
  }

  // -- summaries (history) --
  async saveSummary(s: SessionSummary): Promise<void> {
    await this.pool.query(
      'INSERT INTO summaries(session_id,user_id,created_at,json) VALUES($1,$2,$3,$4) ON CONFLICT(session_id) DO UPDATE SET user_id=$2, created_at=$3, json=$4',
      [s.sessionId, s.userId, s.createdAt, JSON.stringify(s)],
    );
  }
  async getSummary(sessionId: string): Promise<SessionSummary | null> {
    const r = await this.one('SELECT json FROM summaries WHERE session_id=$1', [sessionId]);
    return r ? (JSON.parse(r.json as string) as SessionSummary) : null;
  }
  async listSummaries(userId: string): Promise<SessionSummary[]> {
    const r = await this.pool.query('SELECT json FROM summaries WHERE user_id=$1 ORDER BY created_at DESC', [userId]);
    return r.rows.map((x) => JSON.parse((x as Row).json as string) as SessionSummary);
  }

  // -- compliance: purge all of a user's data --
  async deleteUserData(userId: string): Promise<void> {
    const r = await this.pool.query('SELECT session_id FROM summaries WHERE user_id=$1', [userId]);
    for (const row of r.rows) {
      const sid = (row as Row).session_id as string;
      await this.pool.query('DELETE FROM states WHERE session_id=$1', [sid]);
      await this.pool.query('DELETE FROM plans WHERE session_id=$1', [sid]);
      await this.pool.query('DELETE FROM reports WHERE session_id=$1', [sid]);
    }
    await this.pool.query('DELETE FROM summaries WHERE user_id=$1', [userId]);
    await this.pool.query('DELETE FROM configs WHERE user_id=$1', [userId]);
    await this.pool.query('DELETE FROM users WHERE id=$1', [userId]);
  }
}

/** Connect to a Postgres/Supabase database and initialize the schema. Enables
 *  SSL for non-local hosts (Supabase requires it). */
export async function createPostgresStore(connectionString: string): Promise<PostgresStore> {
  const { Pool } = await import('pg');
  // SSL policy: honor an explicit `sslmode=` in the URL (e.g. sslmode=disable);
  // otherwise default to SSL for remote hosts (Supabase/Neon require it) and none
  // for localhost. Passing no `ssl` option lets pg read sslmode from the URL.
  const hasSslMode = /[?&]sslmode=/i.test(connectionString);
  const isLocal = /@(localhost|127\.0\.0\.1)(:|\/)/.test(connectionString);
  const opts: Record<string, unknown> = { connectionString, max: 10 };
  if (!hasSslMode && !isLocal) opts.ssl = { rejectUnauthorized: false };
  const pool = new Pool(opts);
  const store = new PostgresStore(pool);
  await store.init();
  return store;
}
