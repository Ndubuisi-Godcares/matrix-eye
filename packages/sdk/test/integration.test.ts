/**
 * The SDK against the real API over real HTTP, crawling the real fixture website:
 * proves the client and server agree on every route, including streaming.
 */
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SqliteKnowledgeStore } from "@matrix-eye/knowledge";
import { ScriptedProvider } from "@matrix-eye/llm";
import { startFixtureServer, type FixtureServer } from "@matrix-eye/testing";
import type { FastifyInstance } from "fastify";
import { buildApp, loadConfig } from "@matrix-eye/api";
import { MatrixEyeClient, MatrixEyeError, type StreamEvent } from "../src";

const API_KEY = "sdk-test-key-0123456789abcdef";
let site: FixtureServer;
let app: FastifyInstance;
let store: SqliteKnowledgeStore;
let admin: MatrixEyeClient;
let baseUrl: string;
let projectId: string;

beforeAll(async () => {
  site = await startFixtureServer();
  store = new SqliteKnowledgeStore(":memory:");
  const llm = new ScriptedProvider(["Computer Science costs $4,500 per year [1]."]);
  ({ app } = await buildApp({ config: loadConfig({ MATRIX_EYE_API_KEY: API_KEY, MATRIX_EYE_ALLOW_PRIVATE_NETWORKS: "true" }), store, llm, crawlDelayMs: 0 }));
  await app.listen({ port: 0, host: "127.0.0.1" });
  baseUrl = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  admin = new MatrixEyeClient({ baseUrl, apiKey: API_KEY });
}, 30_000);
afterAll(async () => {
  await app.close();
  store.close();
  await site.close();
});

describe("admin client", () => {
  it("creates a project, crawls it and waits for completion", async () => {
    const project = await admin.createProject({ name: "Riverside University", siteUrl: site.baseUrl, settings: { allowedOrigins: ["https://school.example"], suggestedQuestions: ["How much is tuition?"] } });
    projectId = project.id;
    expect(project.settings.allowedOrigins).toEqual(["https://school.example"]);

    const job = await admin.startCrawl(projectId, { maxPages: 50 });
    const done = await admin.waitForCrawl(job.id, { pollMs: 100 });
    expect(done.pagesIndexed).toBeGreaterThanOrEqual(14);

    const details = await admin.getProject(projectId);
    expect(details.knowledge.pages).toBe(done.pagesIndexed);
  }, 60_000);

  it("lists pages, searches and answers as the owner", async () => {
    expect((await admin.listPages(projectId)).some((p) => p.url.endsWith("/tuition"))).toBe(true);
    expect((await admin.search(projectId, "nursing tuition", 3))[0]?.url).toContain("/tuition");
    expect((await admin.chat(projectId, "When does the first semester start?")).answer).toContain("7 September 2026");
  });

  it("updates settings partially", async () => {
    const settings = await admin.updateSettings(projectId, { greeting: "Welcome to Riverside!" });
    expect(settings.greeting).toBe("Welcome to Riverside!");
    expect(settings.allowedOrigins).toEqual(["https://school.example"]); // untouched
  });

  it("raises typed errors", async () => {
    const wrongKey = new MatrixEyeClient({ baseUrl, apiKey: "not-the-key" });
    await expect(wrongKey.getProject(projectId)).rejects.toMatchObject({ status: 401, code: "unauthorized" });
    await expect(admin.getProject("00000000-0000-4000-8000-000000000000")).rejects.toMatchObject({ status: 404, code: "not_found" });
  });
});

describe("visitor client", () => {
  it("reads display config, chats, and handles follow-ups", async () => {
    const visitor = admin.project(projectId);
    expect(await visitor.config()).toEqual({ name: "Riverside University", greeting: "Welcome to Riverside!", suggestedQuestions: ["How much is tuition?"] });
    const answer = await visitor.chat("How much is tuition for computer science?");
    expect(answer.answer).toContain("$4,500");
    expect(answer.citations[0]?.url).toContain("/tuition");
  });

  it("streams tokens and a final answer end to end", async () => {
    const events: StreamEvent[] = [];
    for await (const e of admin.project(projectId).stream("How much is tuition for computer science?")) events.push(e);
    expect(events.filter((e) => e.type === "token").length).toBeGreaterThan(1);
    const final = events.at(-1);
    expect(final?.type).toBe("final");
    if (final?.type === "final") expect(final.response.answer).toContain("$4,500");
  });

  it("sends feedback that the owner can review", async () => {
    await admin.project(projectId).feedback({ rating: "down", question: "How much is tuition?", answer: "wrong", comment: "needs the programme" });
    const down = await admin.listFeedback(projectId, "down");
    expect(down[0]).toMatchObject({ rating: "down", comment: "needs the programme" });
  });

  it("enforces the origin allow-list through the browser's Origin header", async () => {
    const asBrowser = (origin: string) => ((input, init) => fetch(input, { ...init, headers: { ...(init?.headers as object), origin } })) as typeof fetch;
    const allowed = new MatrixEyeClient({ baseUrl, fetch: asBrowser("https://school.example") }).project(projectId);
    const denied = new MatrixEyeClient({ baseUrl, fetch: asBrowser("https://evil.example") }).project(projectId);
    expect((await allowed.chat("Hello")).route).toBe("smalltalk");
    const error = (await denied.chat("Hello").catch((e: unknown) => e)) as MatrixEyeError;
    expect(error).toMatchObject({ status: 403, code: "forbidden" });
  });

  it("cancels a stream when the caller aborts", async () => {
    const controller = new AbortController();
    const stream = admin.project(projectId).stream("How much is tuition for computer science?", { signal: controller.signal });
    controller.abort();
    await expect(stream.next()).rejects.toMatchObject({ name: "AbortError" });
  });
});
