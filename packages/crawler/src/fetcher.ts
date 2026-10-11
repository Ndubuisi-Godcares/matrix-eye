/**
 * HTTP fetching with hard safety limits.
 *
 * Everything the crawler downloads passes through `HttpFetcher.get`, which enforces:
 *  - SSRF protection (see ssrf.ts)
 *  - a request timeout
 *  - a maximum body size (read as a stream and aborted, so a hostile server cannot
 *    exhaust memory by sending an endless response)
 *  - manual redirect handling, so every hop is re-validated and counted
 */
import { fetch, type Dispatcher } from "undici";
import { CRAWL_DEFAULTS, EagleError } from "@eagles-eye/core";
import { assertPublicUrl, createGuardedDispatcher } from "./ssrf";

export interface FetchedDocument {
  /** URL after following redirects. */
  url: string;
  status: number;
  contentType: string;
  /** Response body decoded as text. Empty for non-text responses. */
  body: string;
}

export interface FetcherOptions {
  userAgent?: string;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  /** Permit localhost/private addresses. Development and tests only. */
  allowPrivateNetworks?: boolean;
}

export class HttpFetcher {
  private readonly userAgent: string;
  private readonly timeoutMs: number;
  private readonly maxBytes: number;
  private readonly maxRedirects: number;
  private readonly allowPrivate: boolean;
  private readonly dispatcher: Dispatcher;

  constructor(options: FetcherOptions = {}) {
    this.userAgent = options.userAgent ?? CRAWL_DEFAULTS.userAgent;
    this.timeoutMs = options.timeoutMs ?? CRAWL_DEFAULTS.timeoutMs;
    this.maxBytes = options.maxBytes ?? CRAWL_DEFAULTS.maxBytes;
    this.maxRedirects = options.maxRedirects ?? CRAWL_DEFAULTS.maxRedirects;
    this.allowPrivate = options.allowPrivateNetworks ?? false;
    this.dispatcher = createGuardedDispatcher(this.allowPrivate);
  }

  /**
   * GET a URL. Non-2xx responses are returned (not thrown) so callers can decide what a
   * 404 or 403 means; transport problems and safety violations throw `EagleError`.
   */
  async get(rawUrl: string): Promise<FetchedDocument> {
    let current = assertPublicUrl(rawUrl, this.allowPrivate).toString();

    for (let hop = 0; hop <= this.maxRedirects; hop++) {
      const response = await this.request(current);

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        await response.body?.cancel().catch(() => undefined);
        if (!location) throw new EagleError("fetch_failed", `Redirect without Location from ${current}`);
        // Re-validate every hop: a public URL may redirect to an internal one.
        current = assertPublicUrl(new URL(location, current).toString(), this.allowPrivate).toString();
        continue;
      }

      const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
      const isText = /^(text\/|application\/(xhtml\+xml|xml|json)|application\/[a-z.+-]*\+xml)/.test(contentType) || contentType === "";
      if (!isText) {
        await response.body?.cancel().catch(() => undefined);
        return { url: current, status: response.status, contentType, body: "" };
      }
      const body = await this.readCapped(response, contentType);
      return { url: current, status: response.status, contentType, body };
    }
    throw new EagleError("fetch_failed", `Too many redirects starting at ${rawUrl}`);
  }

  private async request(url: string) {
    try {
      return await fetch(url, {
        method: "GET",
        redirect: "manual",
        dispatcher: this.dispatcher,
        signal: AbortSignal.timeout(this.timeoutMs),
        headers: {
          "user-agent": this.userAgent,
          accept: "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8",
          "accept-language": "en",
        },
      });
    } catch (err) {
      // The guarded DNS lookup surfaces EagleError as the cause of undici's generic "fetch failed".
      const cause = (err as { cause?: unknown }).cause;
      if (cause instanceof EagleError) throw cause;
      if (err instanceof EagleError) throw err;
      throw new EagleError("fetch_failed", `Could not fetch ${url}: ${(cause as Error | undefined)?.message ?? (err as Error).message}`, { cause: err });
    }
  }

  /** Read the body as a stream, aborting once it exceeds the configured cap. */
  private async readCapped(response: Awaited<ReturnType<typeof fetch>>, contentType: string): Promise<string> {
    const reader = response.body?.getReader();
    if (!reader) return "";
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > this.maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new EagleError("fetch_failed", `Response larger than ${this.maxBytes} bytes`);
      }
      chunks.push(value);
    }
    const charset = /charset=([\w-]+)/.exec(contentType)?.[1] ?? "utf-8";
    let decoder: InstanceType<typeof TextDecoder>;
    try {
      decoder = new TextDecoder(charset);
    } catch {
      decoder = new TextDecoder("utf-8");
    }
    return decoder.decode(Buffer.concat(chunks));
  }
}
