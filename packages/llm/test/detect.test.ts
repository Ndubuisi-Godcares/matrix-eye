import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chooseModel, detectOllama, resolveLocalModel } from "../src";

describe("chooseModel", () => {
  it("prefers the non-thinking Qwen3 instruct model", () => {
    expect(chooseModel(["qwen3:4b", "llama3.2:3b", "qwen3:4b-instruct"])).toBe("qwen3:4b-instruct");
  });

  it("never picks thinking or embedding models, even when they are all that is installed", () => {
    expect(chooseModel(["qwen3:4b", "deepseek-r1:7b", "nomic-embed-text:latest", "bge-m3"])).toBeNull();
  });

  it("falls back through the preference list, then to any usable chat model", () => {
    expect(chooseModel(["llama3.2:3b", "phi4-mini"])).toBe("llama3.2:3b");
    expect(chooseModel(["phi4-mini:latest"])).toBe("phi4-mini:latest");
    expect(chooseModel(["some-custom-model:7b"])).toBe("some-custom-model:7b");
    expect(chooseModel([])).toBeNull();
  });
});

describe("detectOllama", () => {
  let server: Server;
  let origin = "";
  let models: string[] = [];
  let status = 200;

  beforeAll(async () => {
    server = createServer((req, res) => {
      if (req.url === "/api/tags") {
        res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify({ models: models.map((name) => ({ name })) }));
      } else res.writeHead(404).end();
    });
    await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((ok) => (server.closeAllConnections(), server.close(() => ok()))));

  it("finds a running Ollama and returns an OpenAI-compatible address plus the best model", async () => {
    models = ["qwen3:4b", "qwen3:4b-instruct"];
    status = 200;
    expect(await detectOllama({ origin })).toEqual({ baseUrl: `${origin}/v1`, model: "qwen3:4b-instruct" });
  });

  it("returns null when only unsuitable models are installed, or the server errors", async () => {
    models = ["nomic-embed-text"];
    expect(await detectOllama({ origin })).toBeNull();
    models = ["qwen3:4b-instruct"];
    status = 500;
    expect(await detectOllama({ origin })).toBeNull();
    status = 200;
  });

  it("returns null quickly when nothing is listening", async () => {
    const started = Date.now();
    expect(await detectOllama({ origin: "http://127.0.0.1:1", timeoutMs: 800 })).toBeNull();
    expect(Date.now() - started).toBeLessThan(1500);
  });
});

describe("resolveLocalModel", () => {
  const detected = async () => ({ baseUrl: "http://localhost:11434/v1", model: "qwen3:4b-instruct" });

  it("explicit settings win over detection", async () => {
    const result = await resolveLocalModel({ env: { EAGLE_LLM_BASE_URL: "http://x/v1", EAGLE_LLM_MODEL: "mine" }, detect: detected });
    expect(result.source).toBe("env");
    expect(result.llm?.name).toBe("openai-compatible:mine");
  });

  it("uses a detected Ollama when nothing is configured", async () => {
    const result = await resolveLocalModel({ env: {}, detect: detected });
    expect(result.source).toBe("ollama");
    expect(result.llm?.name).toBe("openai-compatible:qwen3:4b-instruct");
  });

  it("reports no model when none is configured or found, and when disabled", async () => {
    expect((await resolveLocalModel({ env: {}, detect: async () => null })).source).toBe("none");
    const off = await resolveLocalModel({ env: { EAGLE_LLM_BASE_URL: "http://x/v1", EAGLE_LLM_MODEL: "m" }, disabled: true, detect: detected });
    expect(off).toEqual({ llm: null, source: "none" });
  });
});
