/**
 * Hosted accounts end to end (Phase 4, ADR-008): sign up, log in, and project ownership
 * enforced across the whole app, not just the repository. The control-plane database is
 * pg-mem (in-memory Postgres); Supabase Auth is a tiny fake HTTP server implementing just the
 * two GoTrue endpoints the API calls, so this runs fully offline like the rest of the suite.
 */
import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import { newDb } from "pg-mem";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SqliteKnowledgeStore } from "@matrix-eye/knowledge";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app";
import { loadConfig } from "../src/config";
import { createControlPlane, type ControlPlane } from "../src/control-plane";

/** A user store behind the fake GoTrue server: enough to make signup/login behave like the real thing. */
function startFakeSupabaseAuth(): Promise<{ url: string; close: () => Promise<void> }> {
  const users = new Map<string, { id: string; password: string }>();
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const body = chunks.length ? (JSON.parse(Buffer.concat(chunks).toString("utf8")) as { email?: string; password?: string }) : {};
      const send = (status: number, payload: unknown) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(payload));
      };
      const email = (body.email ?? "").toLowerCase();

      if (req.url?.startsWith("/auth/v1/signup")) {
        if (users.has(email)) return send(422, { msg: "User already registered" });
        const id = randomUUID();
        users.set(email, { id, password: body.password ?? "" });
        return send(200, { id, email });
      }
      if (req.url?.startsWith("/auth/v1/token")) {
        const user = users.get(email);
        if (!user || user.password !== body.password) return send(400, { error_description: "Invalid login credentials" });
        return send(200, { access_token: "fake", user: { id: user.id, email } });
      }
      send(404, { msg: "not found" });
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve({ url: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(() => r())) });
    });
  });
}

const API_KEY = "test-key-0123456789abcdef";

let app: FastifyInstance;
let store: SqliteKnowledgeStore;
let controlPlane: ControlPlane;
let supabase: { url: string; close: () => Promise<void> };

beforeAll(async () => {
  supabase = await startFakeSupabaseAuth();
  const { Pool } = newDb().adapters.createPg();
  controlPlane = await createControlPlane({ db: new Pool(), supabaseUrl: supabase.url, supabaseAnonKey: "anon-key" });
  store = new SqliteKnowledgeStore(":memory:");
  const config = loadConfig({ MATRIX_EYE_API_KEY: API_KEY, MATRIX_EYE_ALLOW_PRIVATE_NETWORKS: "true" });
  ({ app } = await buildApp({ config, store, crawlDelayMs: 0, controlPlane }));
});

afterAll(async () => {
  await app.close();
  store.close();
  await controlPlane.close();
  await supabase.close();
});

async function signUp(email: string, password = "correct-horse-battery") {
  const res = await app.inject({ method: "POST", url: "/v1/accounts/signup", payload: { email, password } });
  expect(res.statusCode).toBe(201);
  return res.json() as { accountId: string; email: string; apiKey: string };
}

describe("hosted accounts (ADR-008)", () => {
  it("signs up, returning an account and a usable API key", async () => {
    const { accountId, email, apiKey } = await signUp("owner@example.com");
    expect(accountId).toBeTruthy();
    expect(email).toBe("owner@example.com");
    expect(apiKey).toMatch(/^me_live_/);
  });

  it("rejects signing up the same email twice", async () => {
    await signUp("dupe@example.com");
    const res = await app.inject({ method: "POST", url: "/v1/accounts/signup", payload: { email: "dupe@example.com", password: "correct-horse-battery" } });
    expect(res.statusCode).toBe(400);
  });

  it("logs in with the right credentials and rejects the wrong password", async () => {
    await signUp("login@example.com", "the-right-password");
    const ok = await app.inject({ method: "POST", url: "/v1/accounts/login", payload: { email: "login@example.com", password: "the-right-password" } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ email: "login@example.com" });

    const wrong = await app.inject({ method: "POST", url: "/v1/accounts/login", payload: { email: "login@example.com", password: "nope-not-it" } });
    expect(wrong.statusCode).toBe(400);
  });

  it("rejects a project request with no key, and with the legacy single operator key", async () => {
    const noKey = await app.inject({ method: "POST", url: "/v1/projects", payload: { name: "Site", siteUrl: "http://127.0.0.1:1/" } });
    expect(noKey.statusCode).toBe(401);
    const legacyKey = await app.inject({ method: "POST", url: "/v1/projects", payload: { name: "Site", siteUrl: "http://127.0.0.1:1/" }, headers: { authorization: `Bearer ${API_KEY}` } });
    expect(legacyKey.statusCode).toBe(401);
  });

  it("an account's key creates projects owned by that account, listed under /v1/accounts/me/projects", async () => {
    const { apiKey } = await signUp("creator@example.com");
    const auth = { authorization: `Bearer ${apiKey}` };
    const created = await app.inject({ method: "POST", url: "/v1/projects", payload: { name: "Site", siteUrl: "http://127.0.0.1:1/" }, headers: auth });
    expect(created.statusCode).toBe(201);
    const projectId = created.json().id as string;

    const mine = await app.inject({ url: "/v1/accounts/me/projects", headers: auth });
    expect(mine.json()).toEqual({ projectIds: [projectId] });

    const fetched = await app.inject({ url: `/v1/projects/${projectId}`, headers: auth });
    expect(fetched.statusCode).toBe(200);
  });

  it("one account cannot see or act on another account's project (404, not 403, so existence is not revealed)", async () => {
    const a = await signUp("a@example.com");
    const b = await signUp("b@example.com");
    const created = await app.inject({ method: "POST", url: "/v1/projects", payload: { name: "Site", siteUrl: "http://127.0.0.1:1/" }, headers: { authorization: `Bearer ${a.apiKey}` } });
    const projectId = created.json().id as string;

    const asB = await app.inject({ url: `/v1/projects/${projectId}`, headers: { authorization: `Bearer ${b.apiKey}` } });
    expect(asB.statusCode).toBe(404);

    const deleteAsB = await app.inject({ method: "DELETE", url: `/v1/projects/${projectId}`, headers: { authorization: `Bearer ${b.apiKey}` } });
    expect(deleteAsB.statusCode).toBe(404);
  });

  it("rotates the API key: the old key stops working, the new one does, identity is unchanged", async () => {
    const signedUp = await signUp("rotate@example.com", "the-right-password");
    const original = { authorization: `Bearer ${signedUp.apiKey}` };

    const rotated = await app.inject({ method: "POST", url: "/v1/accounts/rotate-key", payload: { email: "rotate@example.com", password: "the-right-password" } });
    expect(rotated.statusCode).toBe(200);
    const body = rotated.json() as { accountId: string; email: string; apiKey: string };
    expect(body.accountId).toBe(signedUp.accountId);
    expect(body.apiKey).toMatch(/^me_live_/);
    expect(body.apiKey).not.toBe(signedUp.apiKey);

    expect((await app.inject({ url: "/v1/accounts/me/projects", headers: original })).statusCode).toBe(401);
    expect((await app.inject({ url: "/v1/accounts/me/projects", headers: { authorization: `Bearer ${body.apiKey}` } })).statusCode).toBe(200);
  });

  it("refuses to rotate the key with the wrong password", async () => {
    await signUp("rotate-wrong@example.com", "the-right-password");
    const res = await app.inject({ method: "POST", url: "/v1/accounts/rotate-key", payload: { email: "rotate-wrong@example.com", password: "nope" } });
    expect(res.statusCode).toBe(400);
  });

  it("the marketing site's own waitlist/contact-messages routes do not exist in hosted mode", async () => {
    const { apiKey } = await signUp("curious@example.com");
    const res = await app.inject({ url: "/v1/waitlist", headers: { authorization: `Bearer ${apiKey}` } });
    expect(res.statusCode).toBe(404);
  });
});
