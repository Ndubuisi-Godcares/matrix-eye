/**
 * Control-plane unit tests (Phase 4, ADR-008): migrations and account ownership, against an
 * in-memory Postgres emulator (pg-mem) so these run offline like the rest of the suite.
 */
import { newDb } from "pg-mem";
import { beforeEach, describe, expect, it } from "vitest";
import { AccountRepository } from "../src/control-plane/accounts-repository";
import type { QueryableDb } from "../src/control-plane/migrate";
import { runMigrations } from "../src/control-plane/migrate";

let db: QueryableDb;

beforeEach(() => {
  const { Pool } = newDb().adapters.createPg();
  db = new Pool();
});

describe("runMigrations", () => {
  it("applies the control-plane schema and is idempotent", async () => {
    expect(await runMigrations(db)).toEqual(["0001_accounts"]);
    expect(await runMigrations(db)).toEqual([]);
  });
});

describe("AccountRepository", () => {
  let accounts: AccountRepository;

  beforeEach(async () => {
    await runMigrations(db);
    accounts = new AccountRepository(db);
  });

  it("issues a key that verifies to the account that was created", async () => {
    const { account, apiKey } = await accounts.createAccount({ email: "a@example.com", supabaseUserId: "sup-1" });
    expect(await accounts.verifyApiKey(apiKey)).toBe(account.id);
  });

  it("rejects a wrong or made-up key", async () => {
    await accounts.createAccount({ email: "a@example.com", supabaseUserId: "sup-1" });
    expect(await accounts.verifyApiKey("not-a-real-key")).toBeNull();
  });

  it("rotating the key invalidates the old one and verifies the new one", async () => {
    const { account, apiKey } = await accounts.createAccount({ email: "a@example.com", supabaseUserId: "sup-1" });
    const rotated = await accounts.rotateApiKey(account.id);
    expect(rotated).not.toBe(apiKey);
    expect(await accounts.verifyApiKey(apiKey)).toBeNull();
    expect(await accounts.verifyApiKey(rotated)).toBe(account.id);
  });

  it("finds an account by the Supabase user id it was created with", async () => {
    const { account } = await accounts.createAccount({ email: "a@example.com", supabaseUserId: "sup-1" });
    expect(await accounts.findBySupabaseUserId("sup-1")).toMatchObject({ id: account.id, email: "a@example.com" });
    expect(await accounts.findBySupabaseUserId("sup-does-not-exist")).toBeNull();
  });

  it("tracks project ownership and keeps it scoped to one account", async () => {
    const { account: owner } = await accounts.createAccount({ email: "owner@example.com", supabaseUserId: "sup-owner" });
    const { account: other } = await accounts.createAccount({ email: "other@example.com", supabaseUserId: "sup-other" });
    await accounts.linkProject(owner.id, "proj-1");

    expect(await accounts.projectBelongsTo(owner.id, "proj-1")).toBe(true);
    expect(await accounts.projectBelongsTo(other.id, "proj-1")).toBe(false);
    expect(await accounts.listProjectIds(owner.id)).toEqual(["proj-1"]);
    expect(await accounts.listProjectIds(other.id)).toEqual([]);
  });

  it("linking the same project twice does not fail or duplicate", async () => {
    const { account } = await accounts.createAccount({ email: "a@example.com", supabaseUserId: "sup-1" });
    await accounts.linkProject(account.id, "proj-1");
    await accounts.linkProject(account.id, "proj-1");
    expect(await accounts.listProjectIds(account.id)).toEqual(["proj-1"]);
  });
});
