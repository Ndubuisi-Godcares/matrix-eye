/**
 * Control-plane accounts (Phase 4, ADR-008): which hosted customer owns which project.
 *
 * Projects and their knowledge stay exactly as they are today (SQLite, `Repositories` /
 * `SqliteKnowledgeStore`); this table only adds ownership on top. An account's API key follows the
 * same digest-then-compare idea as the single operator key in `auth.ts`, but the hash is also the
 * lookup key: it is unique per account, so looking a request's token up by its hash is both how the
 * key is found and how it is verified, with no separate timing-sensitive comparison needed.
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { QueryableDb } from "./migrate";

export interface Account {
  id: string;
  email: string;
  supabaseUserId: string;
  createdAt: string;
}

const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");

export class AccountRepository {
  constructor(private readonly db: QueryableDb) {}

  /** Creates the account record for a Supabase-authenticated user and issues its one API key. */
  async createAccount(input: { email: string; supabaseUserId: string }): Promise<{ account: Account; apiKey: string }> {
    const apiKey = `me_live_${randomBytes(24).toString("hex")}`;
    const account: Account = { id: randomUUID(), email: input.email, supabaseUserId: input.supabaseUserId, createdAt: new Date().toISOString() };
    await this.db.query(`INSERT INTO accounts (id, email, supabase_user_id, api_key_hash, created_at) VALUES ($1, $2, $3, $4, $5)`, [
      account.id,
      account.email,
      account.supabaseUserId,
      hashKey(apiKey),
      account.createdAt,
    ]);
    return { account, apiKey };
  }

  async findBySupabaseUserId(supabaseUserId: string): Promise<Account | null> {
    const { rows } = await this.db.query<{ id: string; email: string; supabase_user_id: string; created_at: string }>(
      `SELECT id, email, supabase_user_id, created_at FROM accounts WHERE supabase_user_id = $1`,
      [supabaseUserId],
    );
    const r = rows[0];
    return r ? { id: r.id, email: r.email, supabaseUserId: r.supabase_user_id, createdAt: r.created_at } : null;
  }

  /** Returns the owning account id for a Bearer token, or null if it matches no account. */
  async verifyApiKey(key: string): Promise<string | null> {
    const { rows } = await this.db.query<{ id: string }>(`SELECT id FROM accounts WHERE api_key_hash = $1`, [hashKey(key)]);
    return rows[0]?.id ?? null;
  }

  /** Issues a fresh key for an account, invalidating the previous one (there is only ever one valid key at a time). */
  async rotateApiKey(accountId: string): Promise<string> {
    const apiKey = `me_live_${randomBytes(24).toString("hex")}`;
    await this.db.query(`UPDATE accounts SET api_key_hash = $1 WHERE id = $2`, [hashKey(apiKey), accountId]);
    return apiKey;
  }

  async linkProject(accountId: string, projectId: string): Promise<void> {
    await this.db.query(`INSERT INTO account_projects (account_id, project_id, created_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [
      accountId,
      projectId,
      new Date().toISOString(),
    ]);
  }

  async projectBelongsTo(accountId: string, projectId: string): Promise<boolean> {
    const { rows } = await this.db.query(`SELECT 1 FROM account_projects WHERE account_id = $1 AND project_id = $2`, [accountId, projectId]);
    return rows.length > 0;
  }

  async listProjectIds(accountId: string): Promise<string[]> {
    const { rows } = await this.db.query<{ project_id: string }>(`SELECT project_id FROM account_projects WHERE account_id = $1 ORDER BY created_at`, [accountId]);
    return rows.map((r) => r.project_id);
  }
}
