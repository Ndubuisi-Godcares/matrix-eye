/**
 * API tests: the whole HTTP surface, in memory, against the education fixture website.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SqliteKnowledgeStore } from "@eagles-eye/knowledge";
import { ScriptedProvider } from "@eagles-eye/llm";
import { startFixtureServer, type FixtureServer } from "@eagles-eye/testing";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app";
import { keysMatch } from "../src/auth";
import { loadConfig } from "../src/config";
import type { CrawlRunner } from "../src/crawl-runner";

const API_KEY = "test-key-0123456789abcdef";
const auth = { authorization: `Bearer ${API_KEY}` };

let fixture: FixtureServer;
let app: FastifyInstance;
let crawls: CrawlRunner;
let store: SqliteKnowledgeStore;
let projectId: string;

beforeAll(async () => {
  fixture = await startFixtureServer();
  store = new SqliteKnowledgeStore(":memory:");
  const config = loadConfig({ EAGLE_API_KEY: API_KEY, EAGLE_ALLOW_PRIVATE_NETWORKS: "true", EAGLE_CORS_ORIGINS: "https://client.example" });
  ({ app, crawls } = await buildApp({ config, store, crawlDelayMs: 0 }));
});
afterAll(async () => {
  await app.close();
  store.close();
  await fixture.close();
});

const post = (url: string, payload: unknown, headers: Record<string, string> = auth) => app.inject({ method: "POST", url, payload: payload as object, headers });

describe("health and authentication", () => {
  it("serves /health without credentials", async () => {
    const res = await app.inject({ url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: "ok", llm: "extractive" });
  });

  it("rejects missing and wrong API keys identically", async () => {
    const missing = await app.inject({ method: "POST", url: "/v1/projects", payload: {} });
    const wrong = await app.inject({ method: "POST", url: "/v1/projects", payload: {}, headers: { authorization: "Bearer nope" } });
    expect(missing.statusCode).toBe(401);
    expect(wrong.statusCode).toBe(401);
    expect(missing.json()).toEqual(wrong.json());
  });

  it("compares keys in constant time without length leaks", () => {
    expect(keysMatch("abc", "abc")).toBe(true);
    expect(keysMatch("abc", "abcd")).toBe(false);
  });

  it("returns a consistent JSON error for unknown routes", async () => {
    const res = await app.inject({ url: "/nope" });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("not_found");
  });
});

describe("projects", () => {
  it("validates input with a structured error", async () => {
    const res = await post("/v1/projects", { name: "", siteUrl: "not a url" });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatchObject({ code: "invalid_request" });
    expect(res.json().error.details.length).toBeGreaterThan(0);
  });

  it("refuses private site URLs when private networks are not allowed", async () => {
    const strict = await buildApp({ config: loadConfig({ EAGLE_API_KEY: API_KEY }), store: new SqliteKnowledgeStore(":memory:") });
    const res = await strict.app.inject({ method: "POST", url: "/v1/projects", headers: auth, payload: { name: "Evil", siteUrl: "http://169.254.169.254/" } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("blocked_url");
    await strict.app.close();
  });

  it("creates a project", async () => {
    const res = await post("/v1/projects", { name: "Riverside University", siteUrl: fixture.baseUrl });
    expect(res.statusCode).toBe(201);
    projectId = res.json().id;
    expect(res.json()).toMatchObject({ name: "Riverside University", rules: [] });
  });

  it("returns 404 for unknown or malformed ids", async () => {
    expect((await app.inject({ url: "/v1/projects/00000000-0000-4000-8000-000000000000", headers: auth })).statusCode).toBe(404);
    expect((await app.inject({ url: "/v1/projects/not-a-uuid", headers: auth })).statusCode).toBe(400);
  });
});

describe("crawl, search and chat", () => {
  it("crawls in the background and reports job progress", async () => {
    const res = await post(`/v1/projects/${projectId}/crawl`, { maxPages: 50 });
    expect(res.statusCode).toBe(202);
    const job = res.json();
    expect(job.status).toBe("running");

    // A second crawl cannot start while one is running.
    const dup = await post(`/v1/projects/${projectId}/crawl`, {});
    expect(dup.statusCode).toBe(400);

    await crawls.waitFor(job.id);
    const done = (await app.inject({ url: `/v1/crawls/${job.id}`, headers: auth })).json();
    expect(done).toMatchObject({ status: "completed", failed: 0 });
    expect(done.pagesIndexed).toBeGreaterThanOrEqual(14);
  });

  it("lists crawled pages and reports knowledge stats", async () => {
    const pages = (await app.inject({ url: `/v1/projects/${projectId}/pages`, headers: auth })).json().pages as Array<{ url: string }>;
    expect(pages.some((p) => p.url.endsWith("/tuition"))).toBe(true);
    const project = (await app.inject({ url: `/v1/projects/${projectId}`, headers: auth })).json();
    expect(project.knowledge.pages).toBe(pages.length);
    expect(project.latestCrawl.status).toBe("completed");
  });

  it("searches without generating an answer", async () => {
    const res = await post(`/v1/projects/${projectId}/search`, { query: "nursing tuition", limit: 3 });
    expect(res.statusCode).toBe(200);
    expect(res.json().results[0].url).toContain("/tuition");
  });

  it("answers a question with citations and no debug data by default", async () => {
    const res = await post(`/v1/projects/${projectId}/chat`, { message: "How much is tuition for computer science?" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.answer).toContain("$4,500");
    expect(body.citations[0].url).toContain("/tuition");
    expect(body.debug).toBeUndefined();
  });

  it("includes diagnostics only on request", async () => {
    const res = await post(`/v1/projects/${projectId}/chat?debug=true`, { message: "When does the first semester start?" });
    expect(res.json().debug.rewrittenQuery).toBeTruthy();
  });

  it("handles follow-up questions using history", async () => {
    const res = await post(`/v1/projects/${projectId}/chat`, {
      message: "How much does it cost?",
      history: [{ role: "user", content: "Tell me about the nursing programme" }, { role: "assistant", content: "It is a four year BSc." }],
    });
    expect(res.json().answer).toContain("$5,200");
  });

  it("abstains rather than guessing", async () => {
    const res = await post(`/v1/projects/${projectId}/chat`, { message: "Do you have a swimming pool?" });
    expect(res.json()).toMatchObject({ abstained: true, route: "abstain" });
  });

  it("applies project rules ahead of retrieval", async () => {
    const put = await app.inject({
      method: "PUT",
      url: `/v1/projects/${projectId}/rules`,
      headers: auth,
      payload: [{ id: "refund", priority: 1, pattern: "refund", response: "Application fees are non-refundable." }],
    });
    expect(put.statusCode).toBe(200);
    const res = await post(`/v1/projects/${projectId}/chat`, { message: "Can I get a refund?" });
    expect(res.json()).toMatchObject({ route: "rule", answer: "Application fees are non-refundable." });
  });

  it("rejects invalid rules, oversize history and empty messages", async () => {
    expect((await app.inject({ method: "PUT", url: `/v1/projects/${projectId}/rules`, headers: auth, payload: [{ id: "x", priority: 1, pattern: "([", response: "r" }] })).statusCode).toBe(400);
    expect((await app.inject({ method: "PUT", url: `/v1/projects/${projectId}/rules`, headers: auth, payload: [{ id: "x", priority: 1, response: "no trigger" }] })).statusCode).toBe(400);
    expect((await post(`/v1/projects/${projectId}/chat`, { message: "   " })).statusCode).toBe(400);
    const long = Array.from({ length: 13 }, () => ({ role: "user", content: "hi" }));
    expect((await post(`/v1/projects/${projectId}/chat`, { message: "hi", history: long })).statusCode).toBe(400);
  });

  it("re-crawls incrementally without re-indexing unchanged pages", async () => {
    const job = (await post(`/v1/projects/${projectId}/crawl`, {})).json();
    await crawls.waitFor(job.id);
    const done = (await app.inject({ url: `/v1/crawls/${job.id}`, headers: auth })).json();
    expect(done.pagesIndexed).toBe(0);
    expect(done.pagesUnchanged).toBeGreaterThan(10);
  });
});

describe("chat with a language model", () => {
  it("uses the model and shows the model name on /health", async () => {
    const llm = new ScriptedProvider(["Computer Science costs $4,500 per year [1]."]);
    const config = loadConfig({ EAGLE_API_KEY: API_KEY, EAGLE_ALLOW_PRIVATE_NETWORKS: "true" });
    const withModel = await buildApp({ config, store, llm });
    const res = await withModel.app.inject({ method: "POST", url: `/v1/projects/${projectId}/chat`, headers: auth, payload: { message: "How much is tuition for computer science?" } });
    expect(res.json().route).toBe("llm");
    expect((await withModel.app.inject({ url: "/health" })).json().llm).toBe("scripted");
    await withModel.app.close();
  });
});

describe("cors, config and deletion", () => {
  it("allows only configured browser origins", async () => {
    const allowed = await app.inject({ url: "/health", headers: { origin: "https://client.example" } });
    expect(allowed.headers["access-control-allow-origin"]).toBe("https://client.example");
    const denied = await app.inject({ url: "/health", headers: { origin: "https://evil.example" } });
    expect(denied.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("refuses to start with a weak or missing API key", () => {
    expect(() => loadConfig({})).toThrowError(/EAGLE_API_KEY/);
    expect(() => loadConfig({ EAGLE_API_KEY: "short" })).toThrowError(/at least 16/);
  });

  it("deletes a project and all its knowledge", async () => {
    const res = await app.inject({ method: "DELETE", url: `/v1/projects/${projectId}`, headers: auth });
    expect(res.statusCode).toBe(204);
    expect(store.stats(projectId)).toEqual({ pages: 0, chunks: 0 });
    expect((await app.inject({ url: `/v1/projects/${projectId}`, headers: auth })).statusCode).toBe(404);
  });
});
