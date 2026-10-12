import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { OpenAiCompatibleProvider, ScriptedProvider, llmFromEnv } from "../src";

let server: Server;
let baseUrl: string;
let lastBody: Record<string, unknown> = {};
let lastAuth: string | undefined;

const readBody = (req: IncomingMessage) =>
  new Promise<string>((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
  });

beforeAll(async () => {
  server = createServer(async (req, res) => {
    lastAuth = req.headers.authorization;
    lastBody = JSON.parse((await readBody(req)) || "{}");
    if (req.url?.includes("/fail/")) return void res.writeHead(500).end("model exploded");
    if (lastBody.stream) {
      res.writeHead(200, { "content-type": "text/event-stream" });
      for (const word of ["Hello", " there", "!"]) res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: word } }] })}\n\n`);
      res.write(": keep-alive comment\n\n");
      res.end("data: [DONE]\n\n");
      return;
    }
    res.writeHead(200, { "content-type": "application/json" }).end(
      JSON.stringify({ choices: [{ message: { content: "  The fee is $4,500 [1].  " } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }),
    );
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
});
afterAll(() => new Promise<void>((ok) => (server.closeAllConnections(), server.close(() => ok()))));

describe("OpenAiCompatibleProvider", () => {
  it("sends an OpenAI-shaped request and parses the reply and usage", async () => {
    const llm = new OpenAiCompatibleProvider({ baseUrl, model: "test-model", apiKey: "secret" });
    const result = await llm.complete({ messages: [{ role: "user", content: "hi" }], maxTokens: 50 });

    expect(result.text).toBe("The fee is $4,500 [1].");
    expect(result.usage).toEqual({ promptTokens: 10, completionTokens: 5 });
    expect(lastBody).toMatchObject({ model: "test-model", max_tokens: 50, stream: false, temperature: 0.1 });
    expect(lastAuth).toBe("Bearer secret");
  });

  it("omits the Authorization header when no key is configured (local models)", async () => {
    await new OpenAiCompatibleProvider({ baseUrl, model: "m" }).complete({ messages: [{ role: "user", content: "hi" }] });
    expect(lastAuth).toBeUndefined();
  });

  it("streams incremental text and ignores keep-alive noise", async () => {
    const llm = new OpenAiCompatibleProvider({ baseUrl, model: "m" });
    let text = "";
    for await (const piece of llm.stream({ messages: [{ role: "user", content: "hi" }] })) text += piece;
    expect(text).toBe("Hello there!");
  });

  it("raises a typed error on HTTP failures and unreachable servers", async () => {
    await expect(new OpenAiCompatibleProvider({ baseUrl: `${baseUrl}/fail`, model: "m" }).complete({ messages: [] })).rejects.toMatchObject({ code: "llm_failed" });
    await expect(new OpenAiCompatibleProvider({ baseUrl: "http://127.0.0.1:1/v1", model: "m", timeoutMs: 2000 }).complete({ messages: [] })).rejects.toMatchObject({ code: "llm_failed" });
  });
});

describe("llmFromEnv and ScriptedProvider", () => {
  it("returns null unless both base URL and model are configured", () => {
    expect(llmFromEnv({})).toBeNull();
    expect(llmFromEnv({ MATRIX_EYE_LLM_BASE_URL: "http://x/v1" })).toBeNull();
    expect(llmFromEnv({ MATRIX_EYE_LLM_BASE_URL: "http://x/v1", MATRIX_EYE_LLM_MODEL: "m" })?.name).toBe("openai-compatible:m");
  });

  it("replays scripted replies in order and records requests", async () => {
    const llm = new ScriptedProvider(["first", (req) => `echo:${req.messages.length}`]);
    expect((await llm.complete({ messages: [] })).text).toBe("first");
    expect((await llm.complete({ messages: [{ role: "user", content: "x" }] })).text).toBe("echo:1");
    expect((await llm.complete({ messages: [] })).text).toBe("echo:0"); // last reply repeats
    expect(llm.requests).toHaveLength(3);
  });
});
