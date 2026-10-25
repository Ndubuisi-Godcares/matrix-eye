/**
 * The MatrixEye client.
 *
 * Two audiences, two classes:
 *  - `PublicClient`: what a website visitor's browser may do (chat, stream, feedback, display settings).
 *    No secret needed, which is why the chat widget uses it.
 *  - `MatrixEyeClient`: the server-side admin client (projects, crawling, rules, feedback review). It needs an
 *    API key, so it must never be shipped to a browser. Its `project(id)` gives the public client.
 *
 * Works in Node 18+ and modern browsers; uses only `fetch`, `AbortController` and `TextDecoder`.
 */
import { SseParser } from "./sse";
import type {
  ChatOptions,
  ChatResponse,
  CrawlJob,
  CreateProjectInput,
  Feedback,
  Project,
  ProjectDetails,
  ProjectSettings,
  PublicConfig,
  Rule,
  SearchResult,
  StoredPage,
  StreamEvent,
} from "./types";

export interface ClientOptions {
  /** Where the API lives, e.g. "https://api.example.com" or "http://localhost:8787". */
  baseUrl: string;
  /** Admin API key. Server-side only; omit it in browsers. */
  apiKey?: string;
  /** Supply your own fetch (testing, proxies). Defaults to the global one. */
  fetch?: typeof fetch;
  /** Abort non-streaming requests after this many milliseconds (default 30 s). */
  timeoutMs?: number;
}

/** An error response from the API, with its machine-readable code. */
export class MatrixEyeError extends Error {
  constructor(
    message: string,
    /** HTTP status (0 when the request never reached the server). */
    readonly status: number,
    /** Stable code such as "forbidden", "rate_limited", "not_found", "invalid_request", "network_error". */
    readonly code: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "MatrixEyeError";
  }
}

/** Shared request plumbing. */
class Transport {
  private readonly fetchImpl: typeof fetch;
  private readonly base: string;

  constructor(private readonly options: ClientOptions) {
    this.base = options.baseUrl.replace(/\/+$/, "");
    // Keep `fetch` bound: calling it as a method of another object throws "Illegal invocation" in browsers.
    this.fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
  }

  headers(json: boolean): Record<string, string> {
    return {
      ...(json ? { "content-type": "application/json" } : {}),
      ...(this.options.apiKey ? { authorization: `Bearer ${this.options.apiKey}` } : {}),
    };
  }

  async send(method: string, path: string, body?: unknown, extra: { signal?: AbortSignal; stream?: boolean } = {}): Promise<Response> {
    const timeout = extra.stream ? undefined : AbortSignal.timeout(this.options.timeoutMs ?? 30_000);
    const signal = extra.signal && timeout ? AbortSignal.any([extra.signal, timeout]) : (extra.signal ?? timeout);
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.base}${path}`, {
        method,
        headers: this.headers(body !== undefined),
        body: body === undefined ? undefined : JSON.stringify(body),
        signal,
      });
    } catch (err) {
      if (extra.signal?.aborted) throw err; // the caller cancelled; let the abort propagate unchanged
      throw new MatrixEyeError(`Could not reach the MatrixEye server: ${(err as Error).message}`, 0, "network_error");
    }
    if (!response.ok) throw await toError(response);
    return response;
  }

  async json<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    const response = await this.send(method, path, body, { signal });
    return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
  }
}

async function toError(response: Response): Promise<MatrixEyeError> {
  let code = "http_error";
  let message = `Request failed with status ${response.status}`;
  let details: unknown;
  try {
    const parsed = (await response.json()) as { error?: { code?: string; message?: string; details?: unknown } };
    code = parsed.error?.code ?? code;
    message = parsed.error?.message ?? message;
    details = parsed.error?.details;
  } catch {
    // Not JSON (a proxy error page, for instance): keep the generic message.
  }
  return new MatrixEyeError(message, response.status, code, details);
}

/** Visitor-facing operations for one project. Safe to use in a browser. */
export class PublicClient {
  private readonly http: Transport;
  private readonly root: string;

  constructor(options: ClientOptions, readonly projectId: string) {
    this.http = new Transport(options);
    this.root = `/v1/public/projects/${encodeURIComponent(projectId)}`;
  }

  /** The project's name, greeting and starter questions, for rendering a chat window. */
  config(signal?: AbortSignal): Promise<PublicConfig> {
    return this.http.json<PublicConfig>("GET", `${this.root}/config`, undefined, signal);
  }

  /** Ask a question and wait for the complete answer. */
  chat(message: string, options: ChatOptions = {}): Promise<ChatResponse> {
    return this.http.json<ChatResponse>("POST", `${this.root}/chat`, { message, history: options.history ?? [] }, options.signal);
  }

  /**
   * Ask a question and receive the answer as it is written.
   *
   * ```ts
   * for await (const event of client.stream("How do I apply?")) {
   *   if (event.type === "token") show(event.text);        // provisional
   *   else show(event.response.answer, event.response.citations); // authoritative: replace what you showed
   * }
   * ```
   */
  async *stream(message: string, options: ChatOptions = {}): AsyncGenerator<StreamEvent, void, void> {
    const response = await this.http.send("POST", `${this.root}/chat/stream`, { message, history: options.history ?? [] }, { signal: options.signal, stream: true });
    const reader = response.body?.getReader();
    if (!reader) throw new MatrixEyeError("The server returned no stream", response.status, "no_stream");

    const decoder = new TextDecoder();
    const parser = new SseParser();
    let sawFinal = false;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const message of parser.push(decoder.decode(value, { stream: true }))) {
          const data = JSON.parse(message.data) as Record<string, unknown>;
          if (message.event === "token") yield { type: "token", text: String(data.text ?? "") };
          else if (message.event === "final") {
            sawFinal = true;
            yield { type: "final", response: data as unknown as ChatResponse };
          } else if (message.event === "error") {
            throw new MatrixEyeError(String(data.message ?? "The assistant failed"), response.status, String(data.code ?? "internal"));
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
    // A stream that ends without a final event was cut off (network drop, server restart).
    if (!sawFinal && !options.signal?.aborted) throw new MatrixEyeError("The answer was interrupted before it finished", 0, "stream_interrupted");
  }

  /** Record a thumbs up or down on an answer. */
  feedback(input: { rating: "up" | "down"; question: string; answer: string; comment?: string }, signal?: AbortSignal): Promise<void> {
    return this.http.json<void>("POST", `${this.root}/feedback`, input, signal);
  }
}

/** Server-side admin client. Needs an API key; never use it in a browser. */
export class MatrixEyeClient {
  private readonly http: Transport;

  constructor(private readonly options: ClientOptions) {
    this.http = new Transport(options);
  }

  /** The visitor-facing client for one project (needs no key). */
  project(projectId: string): PublicClient {
    return new PublicClient({ ...this.options, apiKey: undefined }, projectId);
  }

  createProject(input: CreateProjectInput): Promise<Project> {
    return this.http.json<Project>("POST", "/v1/projects", input);
  }
  /** Every project the key can use: all of them self-hosted, or just this account's own, hosted. */
  async listProjects(): Promise<Project[]> {
    return (await this.http.json<{ projects: Project[] }>("GET", "/v1/projects")).projects;
  }
  getProject(id: string): Promise<ProjectDetails> {
    return this.http.json<ProjectDetails>("GET", `/v1/projects/${id}`);
  }
  deleteProject(id: string): Promise<void> {
    return this.http.json<void>("DELETE", `/v1/projects/${id}`);
  }
  setRules(id: string, rules: Rule[]): Promise<{ rules: Rule[] }> {
    return this.http.json("PUT", `/v1/projects/${id}/rules`, rules);
  }
  /** Change only the settings you pass. */
  async updateSettings(id: string, settings: Partial<ProjectSettings>): Promise<ProjectSettings> {
    return (await this.http.json<{ settings: ProjectSettings }>("PATCH", `/v1/projects/${id}/settings`, settings)).settings;
  }

  startCrawl(id: string, options: { maxPages?: number; full?: boolean } = {}): Promise<CrawlJob> {
    return this.http.json<CrawlJob>("POST", `/v1/projects/${id}/crawl`, options);
  }
  getCrawl(jobId: string): Promise<CrawlJob> {
    return this.http.json<CrawlJob>("GET", `/v1/crawls/${jobId}`);
  }
  /** Poll a crawl until it finishes. Rejects if it fails or `timeoutMs` (default 10 minutes) passes. */
  async waitForCrawl(jobId: string, options: { pollMs?: number; timeoutMs?: number } = {}): Promise<CrawlJob> {
    const deadline = Date.now() + (options.timeoutMs ?? 600_000);
    for (;;) {
      const job = await this.getCrawl(jobId);
      if (job.status === "completed") return job;
      if (job.status === "failed") throw new MatrixEyeError(job.error ?? "The crawl failed", 0, "crawl_failed", job);
      if (Date.now() > deadline) throw new MatrixEyeError("Timed out waiting for the crawl", 0, "timeout", job);
      await new Promise((resolve) => setTimeout(resolve, options.pollMs ?? 1000));
    }
  }

  async listPages(id: string): Promise<StoredPage[]> {
    return (await this.http.json<{ pages: StoredPage[] }>("GET", `/v1/projects/${id}/pages`)).pages;
  }
  async search(id: string, query: string, limit = 5): Promise<SearchResult[]> {
    return (await this.http.json<{ results: SearchResult[] }>("POST", `/v1/projects/${id}/search`, { query, limit })).results;
  }
  async listFeedback(id: string, rating?: "up" | "down"): Promise<Feedback[]> {
    return (await this.http.json<{ feedback: Feedback[] }>("GET", `/v1/projects/${id}/feedback${rating ? `?rating=${rating}` : ""}`)).feedback;
  }
  /** Ask a question as the owner (no origin checks). */
  chat(id: string, message: string, options: ChatOptions = {}): Promise<ChatResponse> {
    return this.http.json<ChatResponse>("POST", `/v1/projects/${id}/chat`, { message, history: options.history ?? [] }, options.signal);
  }
}
