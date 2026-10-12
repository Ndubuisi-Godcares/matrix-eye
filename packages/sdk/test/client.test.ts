/**
 * Client behaviour against a fake fetch: request shape, error mapping, streaming edge cases.
 */
import { describe, expect, it } from "vitest";
import { EagleEyeClient, EagleEyeError, PublicClient, type StreamEvent } from "../src";

interface Call {
  url: string;
  init: RequestInit;
}

/** A fetch that records requests and replies with whatever the test supplies. */
function fakeFetch(reply: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const impl = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const call = { url: String(input), init: init ?? {} };
    calls.push(call);
    return reply(call);
  }) as typeof fetch;
  return { impl, calls };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** A streaming response built from string chunks, delivered one at a time. */
function sse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const c of chunks) controller.enqueue(encoder.encode(c));
        controller.close();
      },
    }),
    { status: 200, headers: { "content-type": "text/event-stream" } },
  );
}

async function collect(stream: AsyncIterable<StreamEvent>) {
  const events: StreamEvent[] = [];
  for await (const e of stream) events.push(e);
  return events;
}

describe("requests", () => {
  it("sends the API key as a bearer token for admin calls only", async () => {
    const { impl, calls } = fakeFetch(() => json({ id: "p1" }));
    const client = new EagleEyeClient({ baseUrl: "http://api.test/", apiKey: "secret-key", fetch: impl });
    await client.createProject({ name: "Uni", siteUrl: "https://uni.test" });
    expect(calls[0]!.url).toBe("http://api.test/v1/projects"); // trailing slash on baseUrl tolerated
    expect((calls[0]!.init.headers as Record<string, string>).authorization).toBe("Bearer secret-key");
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ name: "Uni", siteUrl: "https://uni.test" });
  });

  it("never sends the API key from the visitor-facing client, even when created from the admin client", async () => {
    const { impl, calls } = fakeFetch(() => json({ answer: "hi", abstained: false, route: "smalltalk", citations: [] }));
    await new EagleEyeClient({ baseUrl: "http://api.test", apiKey: "secret-key", fetch: impl }).project("p1").chat("Hello");
    expect((calls[0]!.init.headers as Record<string, string>).authorization).toBeUndefined();
    expect(calls[0]!.url).toBe("http://api.test/v1/public/projects/p1/chat");
  });

  it("sends history with chat and encodes the project id", async () => {
    const { impl, calls } = fakeFetch(() => json({ answer: "x", abstained: false, route: "llm", citations: [] }));
    const history = [{ role: "user" as const, content: "Tell me about nursing" }];
    await new PublicClient({ baseUrl: "http://api.test", fetch: impl }, "a/b c").chat("How much?", { history });
    expect(calls[0]!.url).toContain("/projects/a%2Fb%20c/chat");
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ message: "How much?", history });
  });

  it("returns undefined for 204 responses (feedback)", async () => {
    const { impl } = fakeFetch(() => new Response(null, { status: 204 }));
    await expect(new PublicClient({ baseUrl: "http://api.test", fetch: impl }, "p").feedback({ rating: "up", question: "q", answer: "a" })).resolves.toBeUndefined();
  });
});

describe("errors", () => {
  it("maps the API error format to EagleEyeError with status and code", async () => {
    const { impl } = fakeFetch(() => json({ error: { code: "forbidden", message: "Not allowed here" } }, 403));
    const err = await new PublicClient({ baseUrl: "http://api.test", fetch: impl }, "p").chat("hi").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(EagleEyeError);
    expect(err).toMatchObject({ status: 403, code: "forbidden", message: "Not allowed here" });
  });

  it("keeps validation details", async () => {
    const { impl } = fakeFetch(() => json({ error: { code: "invalid_request", message: "bad", details: [{ path: "message", message: "required" }] } }, 400));
    const err = (await new PublicClient({ baseUrl: "http://api.test", fetch: impl }, "p").chat("").catch((e: unknown) => e)) as EagleEyeError;
    expect(err.details).toEqual([{ path: "message", message: "required" }]);
  });

  it("copes with non-JSON error bodies such as proxy error pages", async () => {
    const { impl } = fakeFetch(() => new Response("<html>Bad gateway</html>", { status: 502 }));
    const err = (await new PublicClient({ baseUrl: "http://api.test", fetch: impl }, "p").chat("hi").catch((e: unknown) => e)) as EagleEyeError;
    expect(err).toMatchObject({ status: 502, code: "http_error" });
  });

  it("reports an unreachable server as network_error", async () => {
    const impl = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    const err = (await new PublicClient({ baseUrl: "http://api.test", fetch: impl }, "p").chat("hi").catch((e: unknown) => e)) as EagleEyeError;
    expect(err).toMatchObject({ status: 0, code: "network_error" });
  });
});

describe("streaming", () => {
  const final = { answer: "Fees are $4,500 [1].", abstained: false, route: "llm", citations: [{ id: 1, url: "https://u.test/t", title: "Tuition", snippet: "s" }] };

  it("yields tokens then the final response", async () => {
    const { impl } = fakeFetch(() => sse(['event: token\ndata: {"text":"Fees "}\n\n', 'event: token\ndata: {"text":"are"}\n\n', `event: final\ndata: ${JSON.stringify(final)}\n\n`]));
    const events = await collect(new PublicClient({ baseUrl: "http://api.test", fetch: impl }, "p").stream("fees?"));
    expect(events.map((e) => e.type)).toEqual(["token", "token", "final"]);
    expect(events.at(-1)).toEqual({ type: "final", response: final });
  });

  it("reassembles events split across network chunks, including inside a multi-byte character", async () => {
    const body = `event: token\ndata: ${JSON.stringify({ text: "naïve café ✓" })}\n\nevent: final\ndata: ${JSON.stringify(final)}\n\n`;
    const bytes = new TextEncoder().encode(body);
    const encoder = new TextEncoder();
    void encoder;
    const pieces = Array.from({ length: bytes.length }, (_, i) => bytes.slice(i, i + 1)); // one byte at a time
    const { impl } = fakeFetch(
      () =>
        new Response(
          new ReadableStream({
            start(c) {
              pieces.forEach((p) => c.enqueue(p));
              c.close();
            },
          }),
          { status: 200 },
        ),
    );
    const events = await collect(new PublicClient({ baseUrl: "http://api.test", fetch: impl }, "p").stream("x"));
    expect(events[0]).toEqual({ type: "token", text: "naïve café ✓" });
    expect(events.at(-1)?.type).toBe("final");
  });

  it("throws the server's error event as an EagleEyeError", async () => {
    const { impl } = fakeFetch(() => sse(['event: error\ndata: {"code":"llm_failed","message":"model down"}\n\n']));
    await expect(collect(new PublicClient({ baseUrl: "http://api.test", fetch: impl }, "p").stream("x"))).rejects.toMatchObject({ code: "llm_failed", message: "model down" });
  });

  it("detects a stream cut off before the final event", async () => {
    const { impl } = fakeFetch(() => sse(['event: token\ndata: {"text":"Fees"}\n\n']));
    await expect(collect(new PublicClient({ baseUrl: "http://api.test", fetch: impl }, "p").stream("x"))).rejects.toMatchObject({ code: "stream_interrupted" });
  });

  it("rejects with the HTTP error before streaming starts (e.g. forbidden origin)", async () => {
    const { impl } = fakeFetch(() => json({ error: { code: "forbidden", message: "nope" } }, 403));
    await expect(collect(new PublicClient({ baseUrl: "http://api.test", fetch: impl }, "p").stream("x"))).rejects.toMatchObject({ status: 403, code: "forbidden" });
  });

  it("stops quietly when the caller aborts", async () => {
    const controller = new AbortController();
    const { impl } = fakeFetch(
      ({ init }) =>
        new Response(
          new ReadableStream({
            start(c) {
              c.enqueue(new TextEncoder().encode('event: token\ndata: {"text":"a"}\n\n'));
              init.signal?.addEventListener("abort", () => c.error(new DOMException("aborted", "AbortError")));
            },
          }),
          { status: 200 },
        ),
    );
    const stream = new PublicClient({ baseUrl: "http://api.test", fetch: impl }, "p").stream("x", { signal: controller.signal });
    const first = await stream.next();
    expect(first.value).toEqual({ type: "token", text: "a" });
    controller.abort();
    await expect(stream.next()).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("crawl helper", () => {
  it("polls until the crawl completes", async () => {
    let polls = 0;
    const { impl } = fakeFetch(() => json({ id: "j1", status: ++polls < 3 ? "running" : "completed", error: null }));
    const job = await new EagleEyeClient({ baseUrl: "http://api.test", apiKey: "k", fetch: impl }).waitForCrawl("j1", { pollMs: 1 });
    expect(job.status).toBe("completed");
    expect(polls).toBe(3);
  });

  it("rejects when the crawl fails, and when it times out", async () => {
    const failing = fakeFetch(() => json({ id: "j", status: "failed", error: "robots.txt disallows crawling" }));
    await expect(new EagleEyeClient({ baseUrl: "http://api.test", apiKey: "k", fetch: failing.impl }).waitForCrawl("j", { pollMs: 1 })).rejects.toMatchObject({ code: "crawl_failed", message: "robots.txt disallows crawling" });

    const stuck = fakeFetch(() => json({ id: "j", status: "running", error: null }));
    await expect(new EagleEyeClient({ baseUrl: "http://api.test", apiKey: "k", fetch: stuck.impl }).waitForCrawl("j", { pollMs: 1, timeoutMs: 20 })).rejects.toMatchObject({ code: "timeout" });
  });
});
