/**
 * The site crawler: breadth-first discovery, polite pacing, safe fetching.
 *
 * Pipeline per URL:  robots check -> throttle -> fetch -> extract -> (render fallback)
 *                    -> de-duplicate -> hand the page to `onPage`.
 *
 * Pages are streamed to the caller through `onPage` rather than collected in memory, so a
 * large site does not need to fit in RAM and indexing can start immediately.
 */
import { CRAWL_DEFAULTS, EagleError, type CrawledPage } from "@eagles-eye/core";
import { HttpFetcher } from "./fetcher";
import { RobotsPolicy } from "./robots";
import { collectSitemapUrls } from "./sitemap";
import { extractPage, type ExtractedContacts } from "./extract";
import { hasNonPageExtension, isSameResource, isSameSite, normalizeUrl } from "./url";
import { assertPublicUrl } from "./ssrf";
import type { PageRenderer } from "./render";

export interface CrawlOptions {
  startUrl: string;
  maxPages?: number;
  maxDepth?: number;
  concurrency?: number;
  /** Minimum milliseconds between requests. A robots.txt Crawl-delay can only raise this. */
  delayMs?: number;
  userAgent?: string;
  /** Permit localhost/private addresses. Development and tests only. */
  allowPrivateNetworks?: boolean;
  /** url -> contentHash from a previous crawl. Matching pages are reported as unchanged and not re-emitted. */
  knownHashes?: ReadonlyMap<string, string>;
  /** Used when a page yields almost no text without JavaScript. */
  renderer?: PageRenderer;
  signal?: AbortSignal;
  /** Called for each new or changed page. Awaited, so slow indexing naturally applies backpressure. */
  onPage: (page: CrawledPage, contacts: ExtractedContacts) => void | Promise<void>;
  /** Progress hook for logs and job status. */
  onEvent?: (event: CrawlEvent) => void;
}

export type CrawlEvent =
  | { type: "page"; url: string }
  | { type: "unchanged"; url: string }
  | { type: "skipped"; url: string; reason: string }
  /** Paragraphs were dropped from a page because they looked like prompt-injection attempts. */
  | { type: "flagged"; url: string; count: number }
  | { type: "failed"; url: string; error: string };

export interface CrawlSummary {
  /** New or changed pages passed to `onPage`. */
  pagesIndexed: number;
  /** Pages fetched whose content matched `knownHashes`. */
  pagesUnchanged: number;
  skipped: Array<{ url: string; reason: string }>;
  failed: Array<{ url: string; error: string }>;
  /** Every page URL seen in this run (indexed + unchanged), used to prune pages that vanished. */
  seenUrls: string[];
  /** True if the crawl stopped because it reached `maxPages` (more pages may exist). */
  reachedPageLimit: boolean;
  /** True if the crawl stopped early because of the abort signal. */
  aborted: boolean;
}

interface QueueItem {
  url: string;
  depth: number;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function crawlSite(options: CrawlOptions): Promise<CrawlSummary> {
  const maxPages = options.maxPages ?? CRAWL_DEFAULTS.maxPages;
  const maxDepth = options.maxDepth ?? CRAWL_DEFAULTS.maxDepth;
  const concurrency = Math.max(1, options.concurrency ?? CRAWL_DEFAULTS.concurrency);
  const userAgent = options.userAgent ?? CRAWL_DEFAULTS.userAgent;
  const allowPrivate = options.allowPrivateNetworks ?? false;

  // Fail fast, before any network traffic, on unsafe or malformed start URLs.
  const normalizedStart = normalizeUrl(assertPublicUrl(options.startUrl, allowPrivate).toString());
  if (!normalizedStart) throw new EagleError("invalid_url", `Not a crawlable URL: ${options.startUrl}`);
  // Re-bound as a plain `string` so the narrowing also holds inside the nested functions below.
  const startUrl: string = normalizedStart;

  const fetcher = new HttpFetcher({ userAgent, allowPrivateNetworks: allowPrivate });

  const summary: CrawlSummary = {
    pagesIndexed: 0,
    pagesUnchanged: 0,
    skipped: [],
    failed: [],
    seenUrls: [],
    reachedPageLimit: false,
    aborted: false,
  };
  const emit = (event: CrawlEvent) => options.onEvent?.(event);
  /** Records a skipped URL. Returns false so callers can `return skip(...)` ("did not use page budget"). */
  const skip = (url: string, reason: string): false => {
    summary.skipped.push({ url, reason });
    emit({ type: "skipped", url, reason });
    return false;
  };

  // robots.txt is per origin (https://a.com vs https://www.a.com), loaded once and cached.
  const robotsByOrigin = new Map<string, Promise<RobotsPolicy>>();
  const robotsFor = (url: string) => {
    const origin = new URL(url).origin;
    let policy = robotsByOrigin.get(origin);
    if (!policy) {
      policy = RobotsPolicy.load(url, fetcher, userAgent);
      robotsByOrigin.set(origin, policy);
    }
    return policy;
  };

  const startRobots = await robotsFor(startUrl);
  if (startRobots.denyAll) {
    throw new EagleError("robots_disallowed", "robots.txt could not be read reliably, so the crawl was not started");
  }
  if (!startRobots.isAllowed(startUrl)) {
    throw new EagleError("robots_disallowed", `robots.txt disallows crawling ${startUrl}`);
  }
  // A site's own Crawl-delay is respected, but never lowered below our floor.
  const delayMs = Math.max(options.delayMs ?? CRAWL_DEFAULTS.delayMs, (startRobots.crawlDelaySeconds() ?? 0) * 1000);

  // --- frontier -------------------------------------------------------------
  const queue: QueueItem[] = [{ url: startUrl, depth: 0 }];
  /**
   * URLs with a query string (?area=...&search=...) are usually filtered or paginated views of a page
   * already in `queue`. They are visited only after every plain URL, so the unfiltered page always wins.
   */
  const lowPriority: QueueItem[] = [];
  /** Every URL ever queued, so nothing is fetched twice. */
  const queued = new Set<string>([startUrl]);
  /** Content hashes already indexed, so the same text served at several URLs is stored once. */
  const seenContent = new Set<string>();
  /** Final page URLs already handled, so two addresses redirecting to one page produce one record. */
  const seenPages = new Set<string>();

  const enqueue = (rawUrl: string, depth: number, base?: string) => {
    const url = normalizeUrl(rawUrl, base);
    if (!url || queued.has(url)) return;
    if (!isSameSite(url, startUrl)) return;
    if (hasNonPageExtension(url) || depth > maxDepth) return;
    queued.add(url);
    (url.includes("?") ? lowPriority : queue).push({ url, depth });
  };

  // Sitemaps often list pages no link leads to. Capped so a huge sitemap cannot flood the queue.
  const sitemapUrls = await collectSitemapUrls([...startRobots.sitemaps(), new URL("/sitemap.xml", startUrl).toString()], fetcher, { limit: maxPages * 2 });
  for (const loc of sitemapUrls) enqueue(loc, 1);

  // --- politeness: one shared request slot clock for the whole (single) site ---
  let nextSlot = 0;
  const waitForSlot = async () => {
    const now = Date.now();
    const slot = Math.max(now, nextSlot);
    nextSlot = slot + delayMs;
    if (slot > now) await sleep(slot - now);
  };

  let fetched = 0; // pages that consumed budget (indexed + unchanged)
  let active = 0;
  /**
   * Every URL tried, including skipped and failed ones. Skipped pages do not use page budget, so without
   * this cap a site where most pages are skipped (blocked, empty, duplicates) would be crawled in full
   * just to find a few usable pages, which is slow and unkind to the server, especially when rendering.
   */
  let attempts = 0;
  const maxAttempts = Math.max(maxPages * 4, 40);

  /**
   * Downloads run in parallel, but the decisions that depend on what came before (is this a duplicate?
   * which links are new? emit the page) are made strictly in queue order. Without this, two URLs
   * serving identical content would be resolved by whichever download happened to finish first, so
   * re-crawling the same site could keep a different URL each time and needlessly re-index it.
   */
  let commitChain: Promise<void> = Promise.resolve();

  /** Returns true when the URL produced a real page (and so consumed page budget). */
  async function processItem(item: QueueItem): Promise<boolean> {
    const previous = commitChain;
    let release!: () => void;
    commitChain = new Promise<void>((resolve) => (release = resolve));
    try {
      return await fetchAndCommit(item, previous);
    } finally {
      // Even a skipped or failed item must wait its turn before releasing the next one.
      await previous;
      release();
    }
  }

  async function fetchAndCommit({ url, depth }: QueueItem, previous: Promise<void>): Promise<boolean> {
    const robots = await robotsFor(url);
    if (!robots.isAllowed(url)) return skip(url, "disallowed by robots.txt");

    await waitForSlot();
    let doc;
    try {
      doc = await fetcher.get(url);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      summary.failed.push({ url, error: message });
      emit({ type: "failed", url, error: message });
      return false;
    }

    if (!isSameSite(doc.url, startUrl)) return skip(url, "redirected to another site");
    if (doc.status >= 400) return skip(url, `HTTP ${doc.status}`);
    if (!/html|xml/.test(doc.contentType) && doc.contentType !== "") return skip(url, `unsupported content type ${doc.contentType}`);

    // Use the post-redirect, normalised URL as the page's identity so it is stable across crawls.
    const finalUrl = normalizeUrl(doc.url) ?? doc.url;
    let extracted = extractPage(doc.body, finalUrl);
    // Plain extraction found almost nothing: the page likely builds its content with JavaScript.
    if (extracted.page.text.length < CRAWL_DEFAULTS.minTextChars && options.renderer) {
      try {
        extracted = extractPage(await options.renderer.render(doc.url), finalUrl);
      } catch {
        // Rendering is best-effort; fall back to whatever static extraction found.
      }
    }

    if (extracted.suspiciousRemoved > 0) emit({ type: "flagged", url, count: extracted.suspiciousRemoved });
    if (extracted.noindex) return skip(url, "page is marked noindex");
    if (extracted.page.text.length === 0) return skip(url, "no readable content");

    // ---- ordered section: wait until every earlier URL has been decided ----
    await previous;

    // Follow links even from pages we will not re-index: unchanged pages still reveal new ones.
    for (const link of extracted.links) enqueue(link, depth + 1);

    // A page that declares a different canonical URL is an alias of that page. Index the canonical
    // one instead, so the same content is not stored twice and the stored URL does not depend on
    // which alias happened to be fetched first. A canonical pointing at the site root is ignored:
    // sites commonly (mis)configure every page that way, and honouring it would discard the site.
    const canonical = extracted.page.canonicalUrl;
    if (!isSameResource(canonical, extracted.page.url) && new URL(canonical).pathname !== "/") {
      enqueue(canonical, depth);
      return skip(url, `canonical is ${canonical}`);
    }

    if (seenPages.has(extracted.page.url)) return skip(url, "duplicate page");
    if (seenContent.has(extracted.page.contentHash)) return skip(url, "same content as another page");
    seenPages.add(extracted.page.url);
    seenContent.add(extracted.page.contentHash);
    summary.seenUrls.push(extracted.page.url);

    if (options.knownHashes?.get(extracted.page.url) === extracted.page.contentHash) {
      summary.pagesUnchanged++;
      emit({ type: "unchanged", url });
      return true;
    }
    await options.onPage(extracted.page, extracted.contacts);
    summary.pagesIndexed++;
    emit({ type: "page", url });
    return true;
  }

  const worker = async () => {
    for (;;) {
      if (options.signal?.aborted) {
        summary.aborted = true;
        return;
      }
      if (fetched >= maxPages) {
        // Anything still queued means the site is larger than the budget we were given.
        if (queue.length + lowPriority.length > 0) summary.reachedPageLimit = true;
        return;
      }
      if (attempts >= maxAttempts) {
        if (queue.length + lowPriority.length > 0) summary.reachedPageLimit = true;
        return;
      }
      const item = queue.shift() ?? lowPriority.shift();
      if (!item) {
        // Nothing queued: finished only if no other worker could still add links.
        if (active === 0) return;
        await sleep(20);
        continue;
      }
      active++;
      attempts++;
      fetched++; // reserve budget up front so concurrent workers cannot overshoot maxPages
      try {
        // Errors, 404s and skipped pages do not count against the page budget.
        if (!(await processItem(item))) fetched--;
      } catch (err) {
        fetched--;
        const message = err instanceof Error ? err.message : String(err);
        summary.failed.push({ url: item.url, error: message });
        emit({ type: "failed", url: item.url, error: message });
      } finally {
        active--;
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, worker));
  return summary;
}
