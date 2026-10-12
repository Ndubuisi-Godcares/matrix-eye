/**
 * Frontier behaviour found on a real site: filtered duplicate URLs and phone numbers glued to ZIP codes.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startFixtureServer, type FixtureServer } from "@eagles-eye/testing";
import type { CrawledPage } from "@eagles-eye/core";
import { crawlSite, extractPage } from "../src";

let server: FixtureServer;
beforeAll(async () => {
  server = await startFixtureServer();
});
afterAll(() => server.close());

async function crawl() {
  const pages: CrawledPage[] = [];
  server.requests.length = 0;
  const summary = await crawlSite({ startUrl: server.baseUrl, allowPrivateNetworks: true, delayMs: 0, concurrency: 3, onPage: (p) => void pages.push(p) });
  return { pages, summary };
}

describe("duplicate content and filtered URLs", () => {
  it("stores text served at several URLs only once", async () => {
    const { pages, summary } = await crawl();
    const tuition = pages.filter((p) => ["/tuition", "/tuition-print"].includes(new URL(p.url).pathname));
    expect(tuition).toHaveLength(1);
    expect(summary.skipped.some((s) => s.reason === "same content as another page")).toBe(true);
  });

  it("visits plain URLs before query-string variants, and drops the variant when it is identical", async () => {
    const { pages } = await crawl();
    expect(pages.some((p) => p.url.includes("?"))).toBe(false);
    const plain = server.requests.indexOf("/programmes/computer-science");
    expect(plain).toBeGreaterThanOrEqual(0);
    // The fixture server logs paths without query strings, so the variant appears as a second request.
    expect(server.requests.lastIndexOf("/programmes/computer-science")).toBeGreaterThan(plain);
  });
});

describe("phone numbers", () => {
  const html = (body: string) => `<main><h1>Contact</h1><p>${body}</p></main>`;

  it("does not glue a ZIP+4 code onto the phone number", () => {
    const { contacts } = extractPage(html("Reed College, Portland OR 97202-8199 503-771-1112"), "https://x.test/contact");
    expect(contacts.phones).toEqual(["503-771-1112"]);
  });

  it("still finds ordinary formats", () => {
    expect(extractPage(html("Call +1 555 014 7788 today"), "https://x.test/c").contacts.phones).toEqual(["+1 555 014 7788"]);
    expect(extractPage(html("Tel: (503) 771-1112"), "https://x.test/c").contacts.phones.length).toBe(1);
  });

  it("keeps the page's own formatting when a tel: link carries the same digits", () => {
    const withLink = `<main><h1>x</h1><p>Phone <a href="tel:+15037711112">503-771-1112</a></p></main>`;
    expect(extractPage(withLink, "https://x.test/c").contacts.phones).toEqual(["503-771-1112"]);
  });
});
