/**
 * The control plane (Phase 4, ADR-008): Postgres-backed accounts and project ownership, alongside
 * the existing SQLite-backed project/knowledge data. Absent entirely in self-host mode — see
 * `config.ts` (`controlPlane` is null unless all three `MATRIX_EYE_DATABASE_URL` /
 * `MATRIX_EYE_SUPABASE_URL` / `MATRIX_EYE_SUPABASE_ANON_KEY` are set).
 */
import { AccountRepository } from "./accounts-repository";
import type { QueryableDb } from "./migrate";
import { runMigrations } from "./migrate";
import { SupabaseAuthClient } from "./supabase-auth";

export type { QueryableDb } from "./migrate";
export { AccountRepository, type Account } from "./accounts-repository";
export { createAccountAuthHook } from "./auth";
export { SupabaseAuthClient, type SupabaseUser } from "./supabase-auth";

export interface ControlPlane {
  accounts: AccountRepository;
  supabaseAuth: SupabaseAuthClient;
  close: () => Promise<void>;
}

/** Runs pending migrations, then returns the repositories routes use. `db.end` is optional so tests can pass a pg-mem pool. */
export async function createControlPlane(options: { db: QueryableDb & { end?: () => Promise<void> }; supabaseUrl: string; supabaseAnonKey: string }): Promise<ControlPlane> {
  await runMigrations(options.db);
  return {
    accounts: new AccountRepository(options.db),
    supabaseAuth: new SupabaseAuthClient(options.supabaseUrl, options.supabaseAnonKey),
    close: async () => {
      await options.db.end?.();
    },
  };
}
