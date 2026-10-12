/**
 * JavaScript rendering. The browser-dependent tests are skipped (not failed) when Chromium is not
 * installed locally; CI installs it, so they always run there.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startFixtureServer, type FixtureServer } from "@eagles-eye/testing";
import { crawlSite, createPlaywrightRenderer, createRequestGuard, extractPage, type PageRenderer } from "../src";

describe("request guard (no browser needed)", () => {
  const guard = createRequestGuard(false);

  it("refuses internal and non-web targets a hostile page might request", async () => {
    for (const url of ["http://169.254.169.254/latest/meta-data/", "http://localhost:8080/admin", "http://127.0.0.1/", "http://10.0.0.5/", "http://[::1]/", "file:///etc/passwd", "ftp://example.com/x", "not a url"]) {
      expect(await guard(url), url).toBe(false);
    }
  });

  it("refuses hostnames that resolve to private addresses", async () => {
    expect(await guard("http://localhost./")).toBe(false);
  });

  it("allows public IP literals and inline data", async () => {
    expect(await guard("https://93.184.216.34/")).toBe(true);
    expect(await guard("data:text/plain;base64,aGk=")).toBe(true);
  });

  it("allows local targets only when explicitly enabled", async () => {
    expect(await createRequestGuard(true)("http://127.0.0.1:3000/")).toBe(true);
  });
});

describe("rendering with a real browser", () => {
  let server: FixtureServer;
  let renderer: PageRenderer | null = null;
  beforeAll(async () => {
    server = await startFixtureServer();
    try {
      renderer = await createPlaywrightRenderer({ allowPrivateNetworks: true, timeoutMs: 15_000 });
    } catch {
      renderer = null; // Chromium not installed here
    }
  }, 60_000);
  afterAll(async () => {
    await renderer?.close();
    await server.close();
  });

  it("static extraction finds nothing on a JavaScript-only page", async () => {
    const html = await (await fetch(`${server.baseUrl}/_test/spa-rendered`)).text();
    expect(extractPage(html, `${server.baseUrl}/_test/spa-rendered`).page.text).toBe("");
  });

  it("renders the page and extracts its real content and links", async (ctx) => {
    if (!renderer) return ctx.skip();
    const url = `${server.baseUrl}/_test/spa-rendered`;
    const extracted = extractPage(await renderer.render(url), url);
    expect(extracted.page.text).toContain("exists only after JavaScript runs");
    expect(extracted.links).toContain(`${server.baseUrl}/about`);
  }, 30_000);

  it("lets the crawler index a JavaScript-only start page when a renderer is supplied", async (ctx) => {
    if (!renderer) return ctx.skip();
    const titles: string[] = [];
    const summary = await crawlSite({
      startUrl: `${server.baseUrl}/_test/spa-rendered`,
      allowPrivateNetworks: true,
      delayMs: 0,
      maxPages: 3,
      renderer,
      onPage: (p) => void titles.push(p.title),
    });
    expect(summary.pagesIndexed).toBeGreaterThanOrEqual(1);
    expect(titles[0]).toBe("Rendered");
    // The link found only after rendering was followed.
    expect(summary.seenUrls.some((u) => u.endsWith("/about"))).toBe(true);
  }, 60_000);
});
