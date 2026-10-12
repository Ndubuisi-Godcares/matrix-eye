/**
 * The public (browser-facing) API used by the chat widget: origin allow-list, streaming, feedback, limits.
 * Knowledge is written straight into the store, so these tests need no crawl and run in milliseconds.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SqliteKnowledgeStore } from "@eagles-eye/knowledge";
import { ScriptedProvider, type LlmProvider, type LlmRequest } from "@eagles-eye/llm";
import type { AddressInfo } from "node:net";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app";
import { loadConfig } from "../src/config";

const API_KEY = "test-key-0123456789abcdef";
const admin = { authorization: `Bearer ${API_KEY}` };
const SCHOOL = "https://school.example";

let app: FastifyInstance;
let store: SqliteKnowledgeStore;
let projectId: string;
let llm: ScriptedProvider;

/** Parse a server-sent-events body into [{event, data}]. */
function parseSse(body: string): Array<{ event: string; data: any }> {
  return body
    .split("\n\n")
    .map((block) => block.trim())
    .filter((block) => block && !block.startsWith(":"))
    .map((block) => {
      const event = /^event: (.*)$/m.exec(block)?.[1] ?? "message";
      const data = JSON.parse(/^data: (.*)$/m.exec(block)?.[1] ?? "null");
      return { event, data };
    });
}

beforeAll(async () => {
  store = new SqliteKnowledgeStore(":memory:");
  llm = new ScriptedProvider(["Computer Science tuition is $4,500 per year [1]."]);
  ({ app } = await buildApp({ config: loadConfig({ EAGLE_API_KEY: API_KEY, EAGLE_PUBLIC_RATE_LIMIT_PER_MINUTE: "50" }), store, llm }));

  const created = await app.inject({ method: "POST", url: "/v1/projects", headers: admin, payload: { name: "Riverside University", siteUrl: "https://riverside.example" } });
  projectId = created.json().id;
  const url = "https://riverside.example/tuition";
  store.upsertPage(projectId, { url, canonicalUrl: url, title: "Tuition", description: "", sections: [], text: "", contentHash: "h", fetchedAt: "now" }, [
    { id: "c1", pageUrl: url, pageTitle: "Tuition", headingPath: ["Fees"], text: "Computer Science tuition is $4,500 per year.", position: 0 },
  ]);
});
afterAll(async () => {
  await app.close();
  store.close();
});

const pub = (path: string) => `/v1/public/projects/${projectId}${path}`;
const chat = (headers: Record<string, string> = {}, message = "How much is computer science tuition?") => app.inject({ method: "POST", url: pub("/chat"), headers: { "content-type": "application/json", ...headers }, payload: { message } });

describe("origin allow-list", () => {
  it("is closed by default: a browser origin is refused until the owner allows it", async () => {
    const res = await chat({ origin: SCHOOL });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("forbidden");
  });

  it("still serves clients that send no Origin header (servers, curl)", async () => {
    expect((await chat()).statusCode).toBe(200);
  });

  it("lets the owner allow a site, after which that exact origin works", async () => {
    const patch = await app.inject({ method: "PATCH", url: `/v1/projects/${projectId}/settings`, headers: admin, payload: { allowedOrigins: [SCHOOL.toUpperCase() + "/".slice(1)] } });
    expect(patch.json().settings.allowedOrigins).toEqual([SCHOOL]); // normalised to lower case

    const res = await chat({ origin: SCHOOL });
    expect(res.statusCode).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe(SCHOOL);
    expect((await chat({ origin: "https://evil.example" })).statusCode).toBe(403);
    expect((await chat({ origin: "https://school.example.evil.io" })).statusCode).toBe(403);
  });

  it("answers CORS preflight only for allowed origins", async () => {
    const ok = await app.inject({ method: "OPTIONS", url: pub("/chat"), headers: { origin: SCHOOL, "access-control-request-method": "POST", "access-control-request-headers": "content-type" } });
    expect(ok.statusCode).toBe(204);
    expect(ok.headers["access-control-allow-origin"]).toBe(SCHOOL);
    const denied = await app.inject({ method: "OPTIONS", url: pub("/chat"), headers: { origin: "https://evil.example", "access-control-request-method": "POST" } });
    expect(denied.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("supports '*' as an explicit opt-in for any site, and rejects malformed origins", async () => {
    const bad = await app.inject({ method: "PATCH", url: `/v1/projects/${projectId}/settings`, headers: admin, payload: { allowedOrigins: ["school.edu/path"] } });
    expect(bad.statusCode).toBe(400);
    await app.inject({ method: "PATCH", url: `/v1/projects/${projectId}/settings`, headers: admin, payload: { allowedOrigins: ["*"] } });
    expect((await chat({ origin: "https://anything.example" })).statusCode).toBe(200);
    await app.inject({ method: "PATCH", url: `/v1/projects/${projectId}/settings`, headers: admin, payload: { allowedOrigins: [SCHOOL] } });
  });
});

describe("what the public API exposes", () => {
  it("returns display settings only", async () => {
    await app.inject({ method: "PATCH", url: `/v1/projects/${projectId}/settings`, headers: admin, payload: { greeting: "Welcome!", suggestedQuestions: ["How much is tuition?"] } });
    const res = await app.inject({ url: pub("/config"), headers: { origin: SCHOOL } });
    expect(res.json()).toEqual({ name: "Riverside University", greeting: "Welcome!", suggestedQuestions: ["How much is tuition?"] });
  });

  it("does not expose admin operations or other projects", async () => {
    for (const [method, path] of [["POST", "/crawl"], ["GET", "/pages"], ["PUT", "/rules"], ["DELETE", ""]] as const) {
      const res = await app.inject({ method, url: pub(path), payload: {} });
      expect(res.statusCode, `${method} ${path}`).toBe(404);
    }
    expect((await app.inject({ url: "/v1/public/projects/00000000-0000-4000-8000-000000000000/config" })).statusCode).toBe(404);
  });

  it("never returns diagnostics, even when asked", async () => {
    const res = await app.inject({ method: "POST", url: pub("/chat") + "?debug=true", payload: { message: "How much is computer science tuition?" } });
    expect(res.json().debug).toBeUndefined();
  });

  it("validates input", async () => {
    expect((await chat({}, "   ")).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: pub("/chat"), payload: { message: "hi", history: [{ role: "system", content: "x" }] } })).statusCode).toBe(400);
  });
});

describe("streaming", () => {
  it("sends provisional tokens, then one authoritative final event", async () => {
    const res = await app.inject({ method: "POST", url: pub("/chat/stream"), headers: { origin: SCHOOL }, payload: { message: "How much is computer science tuition?" } });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/event-stream");
    expect(res.headers["access-control-allow-origin"]).toBe(SCHOOL); // headers survive the hand-off to the raw stream

    const events = parseSse(res.body);
    const tokens = events.filter((e) => e.event === "token");
    const final = events.at(-1)!;
    expect(tokens.length).toBeGreaterThan(1);
    expect(final.event).toBe("final");
    expect(final.data.answer).toContain("$4,500");
    expect(final.data.citations[0].url).toContain("/tuition");
    expect(final.data.debug).toBeUndefined();
    expect(events.filter((e) => e.event === "final")).toHaveLength(1);
  });

  it("answers instant routes with a final event only", async () => {
    const res = await app.inject({ method: "POST", url: pub("/chat/stream"), payload: { message: "Hello" } });
    const events = parseSse(res.body);
    expect(events.map((e) => e.event)).toEqual(["final"]);
    expect(events[0]!.data.route).toBe("smalltalk");
  });

  it("replaces an unsafe streamed answer with the validated one", async () => {
    const lying = new ScriptedProvider(["Computer Science tuition is $9,999 per year [1]."]);
    const other = await buildApp({ config: loadConfig({ EAGLE_API_KEY: API_KEY }), store, llm: lying });
    const res = await other.app.inject({ method: "POST", url: pub("/chat/stream"), payload: { message: "How much is computer science tuition?" } });
    const events = parseSse(res.body);
    expect(events.filter((e) => e.event === "token").map((e) => e.data.text).join("")).toContain("9,999");
    expect(events.at(-1)!.data.answer).not.toContain("9,999");
    expect(events.at(-1)!.data.answer).toContain("$4,500");
    await other.app.close();
  });

  it("refuses a forbidden origin before streaming anything", async () => {
    const res = await app.inject({ method: "POST", url: pub("/chat/stream"), headers: { origin: "https://evil.example" }, payload: { message: "hi there" } });
    expect(res.statusCode).toBe(403);
    expect(res.headers["content-type"]).toContain("application/json");
  });
});

describe("feedback", () => {
  it("stores thumbs up/down and lets the owner review them", async () => {
    const send = (rating: string, comment?: string) =>
      app.inject({ method: "POST", url: pub("/feedback"), headers: { origin: SCHOOL }, payload: { rating, question: "How much is tuition?", answer: "It is $4,500 [1].", comment } });
    expect((await send("up")).statusCode).toBe(204);
    expect((await send("down", "wrong programme")).statusCode).toBe(204);

    const all = (await app.inject({ url: `/v1/projects/${projectId}/feedback`, headers: admin })).json().feedback;
    expect(all).toHaveLength(2);
    const down = (await app.inject({ url: `/v1/projects/${projectId}/feedback?rating=down`, headers: admin })).json().feedback;
    expect(down).toHaveLength(1);
    expect(down[0]).toMatchObject({ rating: "down", comment: "wrong programme", question: "How much is tuition?" });
  });

  it("validates ratings and requires an admin key to read feedback", async () => {
    expect((await app.inject({ method: "POST", url: pub("/feedback"), payload: { rating: "meh", question: "q", answer: "a" } })).statusCode).toBe(400);
    expect((await app.inject({ url: `/v1/projects/${projectId}/feedback` })).statusCode).toBe(401);
  });
});

describe("abuse limits", () => {
  it("rate-limits each visitor per project", async () => {
    const limited = await buildApp({ config: loadConfig({ EAGLE_API_KEY: API_KEY, EAGLE_PUBLIC_RATE_LIMIT_PER_MINUTE: "3" }), store });
    const codes: number[] = [];
    for (let i = 0; i < 5; i++) codes.push((await limited.app.inject({ method: "POST", url: pub("/chat"), payload: { message: "Hello" } })).statusCode);
    expect(codes).toEqual([200, 200, 200, 429, 429]);
    // Other routes and other visitors keep working.
    expect((await limited.app.inject({ url: "/health" })).statusCode).toBe(200);
    await limited.app.close();
  });
});

/** A model that, unlike the scripted one, notices cancellation, as a real model client does. */
class SignalAwareProvider implements LlmProvider {
  readonly name = "signal-aware";
  sawAbort = false;
  completed = false;
  async complete() {
    return { text: "" };
  }
  async *stream(request: LlmRequest) {
    for (const word of ["Computer ", "Science ", "costs ", "$4,500 ", "[1]."]) {
      if (request.signal?.aborted) {
        this.sawAbort = true;
        throw new DOMException("aborted", "AbortError");
      }
      yield word;
      await new Promise((resolve) => setTimeout(resolve, 60));
    }
    this.completed = true;
  }
}

describe("stream cancellation (real HTTP connection)", () => {
  async function serve(model: SignalAwareProvider) {
    const built = await buildApp({ config: loadConfig({ EAGLE_API_KEY: API_KEY, EAGLE_PUBLIC_RATE_LIMIT_PER_MINUTE: "50" }), store, llm: model });
    await built.app.listen({ port: 0, host: "127.0.0.1" });
    return { app: built.app, url: `http://127.0.0.1:${(built.app.server.address() as AddressInfo).port}` };
  }
  const streamUrl = (base: string) => `${base}${pub("/chat/stream")}`;
  const body = JSON.stringify({ message: "How much is computer science tuition?" });
  const headers = { "content-type": "application/json" };

  it("does NOT cancel a normal request: the model runs to the end and the answer arrives", async () => {
    // Regression: the request's own "close" event fires once the body is read, which used to abort every answer.
    const model = new SignalAwareProvider();
    const { app: server, url } = await serve(model);
    const res = await fetch(streamUrl(url), { method: "POST", headers, body });
    const events = parseSse(await res.text());
    expect(model.sawAbort).toBe(false);
    expect(model.completed).toBe(true);
    expect(events.at(-1)).toMatchObject({ event: "final", data: { route: "llm" } }); // the model's answer, not the quoted fallback
    await server.close();
  });

  it("stops the model when the visitor disconnects mid-answer", async () => {
    const model = new SignalAwareProvider();
    const { app: server, url } = await serve(model);
    const controller = new AbortController();
    const res = await fetch(streamUrl(url), { method: "POST", headers, body, signal: controller.signal });
    const reader = res.body!.getReader();
    await reader.read(); // the first chunk has arrived: generation is under way
    controller.abort(); // the visitor closes the page
    await expect.poll(() => model.sawAbort, { timeout: 3000 }).toBe(true);
    expect(model.completed).toBe(false);
    await server.close();
  });
});
