/**
 * Control-plane schema migrations (Phase 4, ADR-008).
 *
 * Unlike the knowledge/app SQLite schema (one `CREATE TABLE IF NOT EXISTS` block run on every boot),
 * the control-plane Postgres schema is versioned: each migration runs exactly once, tracked in
 * `schema_migrations`. New migrations are appended here, never edited after being committed.
 */

/** A connection that can run parameterised queries. Satisfied by `pg.Pool` and by `pg-mem` in tests. */
export interface QueryableDb {
  query<T extends Record<string, unknown> = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

interface Migration {
  id: string;
  sql: string;
}

const MIGRATIONS: Migration[] = [
  {
    // Timestamps are TEXT (ISO 8601) set by application code, not DB defaults — same convention
    // as the SQLite tables in repositories.ts, and portable across Postgres versions/emulators.
    id: "0001_accounts",
    sql: `
      CREATE TABLE accounts (
        id               TEXT PRIMARY KEY,
        email            TEXT NOT NULL UNIQUE,
        supabase_user_id TEXT NOT NULL UNIQUE,
        api_key_hash     TEXT NOT NULL UNIQUE,
        created_at       TEXT NOT NULL
      );
      CREATE TABLE account_projects (
        account_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
        project_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (account_id, project_id)
      );
      CREATE INDEX idx_account_projects_project ON account_projects (project_id);
    `,
  },
];

/** Applies every migration not yet recorded in `schema_migrations`, in order. Returns the ids applied. */
export async function runMigrations(db: QueryableDb): Promise<string[]> {
  // A plain existence check, not `CREATE TABLE IF NOT EXISTS`, run every boot: harmless on real
  // Postgres, but re-running the IF-NOT-EXISTS form against an already-created table is a known
  // rough edge in pg-mem (used in tests), so this is the one form that works identically on both.
  const { rows: existing } = await db.query(`SELECT 1 FROM information_schema.tables WHERE table_name = 'schema_migrations'`);
  if (existing.length === 0) await db.query(`CREATE TABLE schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)`);
  const { rows } = await db.query<{ id: string }>(`SELECT id FROM schema_migrations`);
  const applied = new Set(rows.map((r) => r.id));

  const newlyApplied: string[] = [];
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) continue;
    await db.query(migration.sql);
    await db.query(`INSERT INTO schema_migrations (id, applied_at) VALUES ($1, $2)`, [migration.id, new Date().toISOString()]);
    newlyApplied.push(migration.id);
  }
  return newlyApplied;
}
