/**
 * The marketing website's waitlist and contact forms: validation, spam defences, privacy requests.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SqliteKnowledgeStore } from "@eagles-eye/knowledge";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app";
import { loadConfig } from "../src/config";

const API_KEY = "test-key-0123456789abcdef";
const admin = { authorization: `Bearer ${API_KEY}` };
const SITE = "https://eagleseye.example";

let app: FastifyInstance;
let store: SqliteKnowledgeStore;

beforeAll(async () => {
  store = new SqliteKnowledgeStore(":memory:");
  ({ app } = await buildApp({ config: loadConfig({ EAGLE_API_KEY: API_KEY, EAGLE_SITE_ORIGINS: `${SITE},http://localhost:4321`, EAGLE_FORM_RATE_LIMIT_PER_MINUTE: "500" }), store }));
});
afterAll(async () => {
  await app.close();
  store.close();
});

const join = (payload: object, headers: Record<string, string> = { origin: SITE }) => app.inject({ method: "POST", url: "/v1/public/waitlist", headers, payload });
const valid = { email: "Ada@Example.com ", name: "Ada", useCase: "Agency", source: "/pricing", consent: true };
const listed = async () => (await app.inject({ url: "/v1/waitlist", headers: admin })).json() as { count: number; entries: Array<{ email: string; name: string | null; useCase: string | null; source: string | null; consentAt: string }> };

describe("waitlist", () => {
  it("stores a signup with a normalised address and the consent time", async () => {
    expect((await join(valid)).statusCode).toBe(204);
    const { entries } = await listed();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ email: "ada@example.com", name: "Ada", useCase: "Agency", source: "/pricing" });
    expect(Date.parse(entries[0]!.consentAt)).not.toBeNaN();
  });

  it("answers a duplicate exactly like a new signup, so it never reveals who is registered", async () => {
    const again = await join({ ...valid, email: "ADA@example.com" });
    expect(again.statusCode).toBe(204);
    expect(again.body).toBe("");
    expect((await listed()).count).toBe(1);
  });

  it("refuses to store anything without consent", async () => {
    for (const consent of [false, undefined, "yes"]) {
      expect((await join({ email: "no-consent@example.com", consent })).statusCode, String(consent)).toBe(400);
    }
    expect((await listed()).entries.some((e) => e.email === "no-consent@example.com")).toBe(false);
  });

  it("validates the address and bounds every field", async () => {
    expect((await join({ email: "not-an-email", consent: true })).statusCode).toBe(400);
    expect((await join({ email: "a@b.co", name: "x".repeat(101), consent: true })).statusCode).toBe(400);
    expect((await join({ email: `${"a".repeat(250)}@example.com`, consent: true })).statusCode).toBe(400);
    expect((await join({ consent: true })).statusCode).toBe(400);
  });

  it("silently discards honeypot submissions while looking successful", async () => {
    expect((await join({ email: "bot@example.com", consent: true, website: "http://spam.example" })).statusCode).toBe(204);
    expect((await listed()).entries.some((e) => e.email === "bot@example.com")).toBe(false);
  });
});

describe("origin and CORS", () => {
  it("accepts the configured website and answers its preflight", async () => {
    const ok = await join({ email: "origin@example.com", consent: true }, { origin: "http://localhost:4321" });
    expect(ok.statusCode).toBe(204);
    expect(ok.headers["access-control-allow-origin"]).toBe("http://localhost:4321");
    const pre = await app.inject({ method: "OPTIONS", url: "/v1/public/waitlist", headers: { origin: SITE, "access-control-request-method": "POST", "access-control-request-headers": "content-type" } });
    expect(pre.statusCode).toBe(204);
    expect(pre.headers["access-control-allow-origin"]).toBe(SITE);
  });

  it("refuses other websites, and gives them no CORS permission", async () => {
    const res = await join({ email: "evil@example.com", consent: true }, { origin: "https://evil.example" });
    expect(res.statusCode).toBe(403);
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
    const pre = await app.inject({ method: "OPTIONS", url: "/v1/public/waitlist", headers: { origin: "https://evil.example", "access-control-request-method": "POST" } });
    expect(pre.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("allows clients with no Origin header (the same as the widget endpoints)", async () => {
    expect((await join({ email: "server@example.com", consent: true }, {})).statusCode).toBe(204);
  });
});

describe("contact form", () => {
  const send = (payload: object) => app.inject({ method: "POST", url: "/v1/public/contact", headers: { origin: SITE }, payload });
  const count = async () => ((await app.inject({ url: "/v1/contact-messages", headers: admin })).json() as { messages: unknown[] }).messages.length;

  it("stores a message and lists it for the owner", async () => {
    expect((await send({ name: "Grace", email: "Grace@Example.com", message: "Do you support Moodle sites?", consent: true })).statusCode).toBe(204);
    const { messages } = (await app.inject({ url: "/v1/contact-messages", headers: admin })).json();
    expect(messages[0]).toMatchObject({ name: "Grace", email: "grace@example.com", message: "Do you support Moodle sites?" });
  });

  it("validates, requires consent, and ignores honeypot spam", async () => {
    expect((await send({ name: "", email: "a@b.co", message: "hello there", consent: true })).statusCode).toBe(400);
    expect((await send({ name: "X", email: "a@b.co", message: "hi", consent: true })).statusCode).toBe(400);
    expect((await send({ name: "X", email: "a@b.co", message: "hello there", consent: false })).statusCode).toBe(400);
    const before = await count();
    expect((await send({ name: "Bot", email: "bot@b.co", message: "buy pills now", consent: true, website: "x" })).statusCode).toBe(204);
    expect(await count()).toBe(before);
  });
});

describe("owner tools and privacy requests", () => {
  it("requires the admin key to read or erase anything", async () => {
    expect((await app.inject({ url: "/v1/waitlist" })).statusCode).toBe(401);
    expect((await app.inject({ method: "DELETE", url: "/v1/waitlist?email=ada@example.com" })).statusCode).toBe(401);
    expect((await app.inject({ url: "/v1/contact-messages" })).statusCode).toBe(401);
  });

  it("exports CSV that cannot run as a spreadsheet formula", async () => {
    await join({ email: "csv@example.com", name: '=HYPERLINK("http://evil.example","click")', consent: true });
    const res = await app.inject({ url: "/v1/waitlist?format=csv", headers: admin });
    expect(res.headers["content-type"]).toContain("text/csv");
    const lines = res.body.trim().split("\n");
    expect(lines[0]).toBe("email,name,use_case,source,consent_at,created_at");
    const row = lines.find((l) => l.startsWith('"csv@example.com"'))!;
    expect(row).toContain(`"'=HYPERLINK`); // neutralised with a leading apostrophe
    expect(row).not.toContain('"=HYPERLINK');
  });

  it("erases one person on request, and reports when the address is unknown", async () => {
    expect((await app.inject({ method: "DELETE", url: "/v1/waitlist?email=ADA@example.com", headers: admin })).statusCode).toBe(204);
    expect((await listed()).entries.some((e) => e.email === "ada@example.com")).toBe(false);
    expect((await app.inject({ method: "DELETE", url: "/v1/waitlist?email=ada@example.com", headers: admin })).statusCode).toBe(404);
    expect((await app.inject({ method: "DELETE", url: "/v1/waitlist", headers: admin })).statusCode).toBe(400);
  });

  it("rate-limits form submissions per visitor", async () => {
    const limited = await buildApp({ config: loadConfig({ EAGLE_API_KEY: API_KEY, EAGLE_SITE_ORIGINS: SITE }), store });
    const codes: number[] = [];
    for (let i = 0; i < 7; i++) {
      codes.push((await limited.app.inject({ method: "POST", url: "/v1/public/waitlist", headers: { origin: SITE }, payload: { email: `rl${i}@example.com`, consent: true } })).statusCode);
    }
    expect(codes).toEqual([204, 204, 204, 204, 204, 429, 429]);
    await limited.app.close();
  });
});
