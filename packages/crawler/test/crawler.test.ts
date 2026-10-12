import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startFixtureServer, type FixtureServer } from "@matrix-eye/testing";
import type { CrawledPage } from "@matrix-eye/core";
import { crawlSite, type CrawlEvent } from "../src";

let server: FixtureServer;
beforeAll(async () => {
  server = await startFixtureServer();
});
afterAll(() => server.close());

/** Crawl the fixture site quickly (no politeness delay needed against a local test server). */
async function crawl(extra: Partial<Parameters<typeof crawlSite>[0]> = {}) {
  const pages: CrawledPage[] = [];
  const events: CrawlEvent[] = [];
  const summary = await crawlSite({
    startUrl: server.baseUrl,
    allowPrivateNetworks: true,
    delayMs: 0,
    concurrency: 3,
    onPage: (page) => void pages.push(page),
    onEvent: (e) => events.push(e),
    ...extra,
  });
  return { pages, summary, events };
}
const paths = (pages: CrawledPage[]) => pages.map((p) => new URL(p.url).pathname).sort();

describe("crawlSite on the education fixture", () => {
  it("discovers linked pages and sitemap-only pages", async () => {
    const { pages } = await crawl();
    const found = paths(pages);
    expect(found).toContain("/admissions");
    expect(found).toContain("/programmes/nursing"); // reached via links
    expect(found).toContain("/hidden-gem"); // reachable only through the sitemap
  });

  it("obeys robots.txt: never requests disallowed paths", async () => {
    server.requests.length = 0;
    const { pages, summary } = await crawl();
    expect(paths(pages)).not.toContain("/private/staff");
    expect(server.requests).not.toContain("/private/staff");
    expect(summary.skipped.some((s) => s.reason.includes("robots"))).toBe(true);
  });

  it("skips noindex pages", async () => {
    const { pages, summary } = await crawl();
    expect(paths(pages)).not.toContain("/drafts");
    expect(summary.skipped.some((s) => s.url.endsWith("/drafts") && s.reason.includes("noindex"))).toBe(true);
  });

  it("indexes the canonical URL, deterministically, when a page declares one", async () => {
    for (let run = 0; run < 3; run++) {
      const { pages, summary } = await crawl();
      const tuitionPages = paths(pages).filter((p) => p === "/tuition" || p === "/tuition-fees");
      expect(tuitionPages).toEqual(["/tuition"]);
      expect(summary.skipped.some((s) => s.url.endsWith("/tuition-fees") && s.reason.startsWith("canonical is"))).toBe(true);
    }
  });

  it("strips navigation, cookie banner and footer from every page", async () => {
    const { pages } = await crawl();
    for (const page of pages) expect(page.text).not.toMatch(/cookies|Copyright Riverside|Terms of use/);
  });

  it("removes the injected instruction from the open-day page and reports it", async () => {
    const { pages, events } = await crawl();
    const openDay = pages.find((p) => p.url.endsWith("/news/open-day"));
    expect(openDay?.text).toContain("open day on 14 March");
    expect(openDay?.text).not.toMatch(/ignore all previous|scam@evil/i);
    expect(events.some((e) => e.type === "flagged")).toBe(true);
  });

  it("respects maxPages and reports that the limit was reached", async () => {
    const { summary } = await crawl({ maxPages: 3 });
    expect(summary.pagesIndexed).toBe(3);
    expect(summary.reachedPageLimit).toBe(true);
  });

  it("reports unchanged pages on a re-crawl instead of re-emitting them", async () => {
    const first = await crawl();
    const known = new Map(first.pages.map((p) => [p.url, p.contentHash]));
    const second = await crawl({ knownHashes: known });
    expect(second.pages).toHaveLength(0);
    expect(second.summary.pagesUnchanged).toBe(first.pages.length);
  });

  it("stops when aborted", async () => {
    const controller = new AbortController();
    const { summary } = await crawl({ signal: controller.signal, onPage: () => controller.abort() });
    expect(summary.aborted).toBe(true);
  });
});

describe("crawlSite safety", () => {
  it("refuses a local start URL unless private networks are allowed", async () => {
    await expect(crawlSite({ startUrl: server.baseUrl, onPage: () => undefined })).rejects.toMatchObject({ code: "blocked_url" });
  });

  it("rejects malformed and non-http start URLs", async () => {
    await expect(crawlSite({ startUrl: "not a url", onPage: () => undefined })).rejects.toMatchObject({ code: "invalid_url" });
    await expect(crawlSite({ startUrl: "file:///etc/passwd", onPage: () => undefined })).rejects.toMatchObject({ code: "invalid_url" });
  });
});
