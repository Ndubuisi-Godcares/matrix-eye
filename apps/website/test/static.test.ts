/**
 * Checks on the built site that need no browser: search-engine basics, links, structure, size budgets, deployment config.
 * The site is built fresh for this test, so it always judges what would really be deployed.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { vercelConfig } from "../scripts/headers.mjs";
import { DIST, SITE_ROOT, SITE_URL, UNLISTED, buildSite, fileFor, listPages, weigh, type Page } from "./helpers";

let pages: Page[] = [];
beforeAll(() => {
  buildSite();
  pages = listPages();
}, 180_000);

describe("the build", () => {
  it("contains every expected page", () => {
    const paths = pages.map((p) => p.path);
    for (const expected of ["/", "/product/", "/pricing/", "/security/", "/bot/", "/contact/", "/waitlist/", "/privacy/", "/terms/", "/docs/", "/guides/", "/404.html"]) {
      expect(paths, expected).toContain(expected);
    }
    // One page per published document and per guide.
    for (const doc of ["quickstart", "how-it-works", "widget", "sdk", "accuracy", "api", "self-hosting", "troubleshooting", "changelog"]) expect(paths).toContain(`/docs/${doc}/`);
    expect(paths.filter((p) => p.startsWith("/guides/")).length).toBeGreaterThanOrEqual(4);
  });

  it("ships the supporting files", () => {
    for (const file of ["sitemap-index.xml", "sitemap-0.xml", "robots.txt", "rss.xml", "config.json", "og.png", "favicon-32.png", "apple-touch-icon.png", "theme-init.js", "pagefind/pagefind.js"]) {
      expect(existsSync(join(DIST, file)), file).toBe(true);
    }
  });
});

describe("search-engine basics", () => {
  it("gives every page a unique, sensible title and description", () => {
    const titles = new Set<string>();
    for (const { path, $ } of pages) {
      const title = $("title").text();
      expect(title.length, `${path} title`).toBeGreaterThanOrEqual(10);
      expect(title.length, `${path} title too long: ${title}`).toBeLessThanOrEqual(75);
      expect(titles.has(title), `${path} duplicate title`).toBe(false);
      titles.add(title);
      const description = $('meta[name="description"]').attr("content") ?? "";
      expect(description.length, `${path} description`).toBeGreaterThanOrEqual(40);
      expect(description.length, `${path} description too long`).toBeLessThanOrEqual(175);
    }
  });

  it("declares a canonical address that matches each page", () => {
    for (const { path, $ } of pages) {
      if (path === "/404.html") continue;
      expect($('link[rel="canonical"]').attr("href"), path).toBe(`${SITE_URL}${path}`);
    }
  });

  it("has social previews and valid structured data on every page", () => {
    for (const { path, $ } of pages) {
      expect($('meta[property="og:title"]').attr("content"), `${path} og:title`).toBeTruthy();
      expect($('meta[property="og:description"]').attr("content"), `${path} og:description`).toBeTruthy();
      expect($('meta[property="og:image"]').attr("content"), `${path} og:image`).toBe(`${SITE_URL}/og.png`);
      expect($('meta[name="twitter:card"]').attr("content"), path).toBe("summary_large_image");
      const blocks = $('script[type="application/ld+json"]').toArray();
      expect(blocks.length, `${path} json-ld`).toBeGreaterThanOrEqual(2);
      for (const block of blocks) expect(() => JSON.parse($(block).text()), `${path} json-ld parses`).not.toThrow();
    }
  });

  it("hides only the draft pages from search engines, and lists the rest in the sitemap", () => {
    const sitemap = readFileSync(join(DIST, "sitemap-0.xml"), "utf8");
    for (const { path, $ } of pages) {
      const hidden = /noindex/.test($('meta[name="robots"]').attr("content") ?? "");
      expect(hidden, `${path} noindex`).toBe(UNLISTED.includes(path));
      if (path !== "/404.html") expect(sitemap.includes(`<loc>${SITE_URL}${path}</loc>`), `${path} in sitemap`).toBe(!UNLISTED.includes(path));
    }
    expect(readFileSync(join(DIST, "robots.txt"), "utf8")).toMatch(/Sitemap: https:\/\/.+\/sitemap-index\.xml/);
  });

  it("marks the page language and the colour scheme", () => {
    for (const { path, $ } of pages) {
      expect($("html").attr("lang"), path).toBe("en");
      expect($('meta[name="color-scheme"]').attr("content"), path).toBe("light dark");
    }
  });
});

describe("structure and links", () => {
  it("has one h1 per page and never skips a heading level", () => {
    for (const { path, $ } of pages) {
      expect($("h1").length, `${path} h1 count`).toBe(1);
      let previous = 1;
      $("main h1, main h2, main h3, main h4").each((_, el) => {
        const level = Number(el.tagName.slice(1));
        expect(level, `${path}: <${el.tagName}> "${$(el).text().slice(0, 40)}" jumps past h${previous}`).toBeLessThanOrEqual(previous + 1);
        previous = level;
      });
    }
  });

  it("has no broken internal links, images, scripts, styles or anchors", () => {
    const idsOf = new Map(pages.map((p) => [p.path, new Set(p.$("[id]").toArray().map((el) => p.$(el).attr("id")!))]));
    for (const { path, $ } of pages) {
      const references = [
        ...$("a[href]").toArray().map((el) => ["link", $(el).attr("href")!] as const),
        ...$("img[src]").toArray().map((el) => ["image", $(el).attr("src")!] as const),
        ...$("script[src]").toArray().map((el) => ["script", $(el).attr("src")!] as const),
        ...$('link[href]:not([rel="canonical"]):not([rel="alternate"])').toArray().map((el) => ["stylesheet or icon", $(el).attr("href")!] as const),
      ];
      for (const [kind, raw] of references) {
        if (/^(mailto:|tel:|https?:\/\/(?!eagleseye\.ai))/.test(raw) || raw.startsWith("data:")) continue;
        const local = raw.replace(SITE_URL, "");
        const target = local.startsWith("#") ? path : local.split("#")[0]!;
        expect(fileFor(target), `${path}: broken ${kind} -> ${raw}`).not.toBeNull();
        const hash = local.includes("#") ? local.split("#")[1] : "";
        if (hash) expect(idsOf.get(target.endsWith("/") ? target : path)?.has(hash), `${path}: missing anchor ${raw}`).toBe(true);
      }
    }
  });

  it("opens external links safely and gives every image a text alternative", () => {
    for (const { path, $ } of pages) {
      $('a[target="_blank"]').each((_, el) => expect($(el).attr("rel") ?? "", `${path} target=_blank without noopener`).toMatch(/noopener/));
      $("img").each((_, el) => expect($(el).attr("alt"), `${path} image without alt: ${$(el).attr("src")}`).toBeDefined());
    }
  });

  it("gives every form field a visible label", () => {
    for (const { path, $ } of pages) {
      $("input:not([type=hidden]):not([type=checkbox]):not([name=website]), select, textarea").each((_, el) => {
        const id = $(el).attr("id");
        expect(id && $(`label[for="${id}"]`).length > 0, `${path}: field ${$(el).attr("name")} has no label`).toBe(true);
      });
    }
  });
});

describe("weight budgets (gzipped)", () => {
  it("keeps every page light", () => {
    for (const page of pages) {
      const { html, js, css } = weigh(page);
      expect(html, `${page.path} HTML ${html} bytes`).toBeLessThan(40 * 1024);
      expect(js, `${page.path} JavaScript ${js} bytes`).toBeLessThan(12 * 1024);
      expect(css, `${page.path} CSS ${css} bytes`).toBeLessThan(14 * 1024);
    }
  });

  it("keeps images small enough for a fast first view", () => {
    expect(readFileSync(join(DIST, "brand/logo-light.webp")).length).toBeLessThan(90 * 1024);
    expect(readFileSync(join(DIST, "brand/logo-dark.webp")).length).toBeLessThan(90 * 1024);
    expect(readFileSync(join(DIST, "og.png")).length).toBeLessThan(400 * 1024);
  });

  it("loads nothing from other websites", () => {
    for (const { path, html } of pages) {
      const external = [...html.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)].map((m) => m[1]!).filter((url) => !url.startsWith(SITE_URL) && !/^https?:\/\/(?:127\.0\.0\.1|localhost)/.test(url));
      // Links people click are allowed (docs mention other projects); resources the browser fetches automatically are not.
      const automatic = [...html.matchAll(/<(?:script|img|link|iframe)\b[^>]*(?:src|href)="(https?:\/\/[^"]+)"/g)].map((m) => m[1]!).filter((url) => !url.startsWith(SITE_URL));
      expect(automatic, `${path} fetches from another site`).toEqual([]);
      void external;
    }
  });
});

describe("deployment configuration", () => {
  it("keeps the committed vercel.json in sync with the header definitions", () => {
    const committed = JSON.parse(readFileSync(join(SITE_ROOT, "vercel.json"), "utf8"));
    expect(committed).toEqual(vercelConfig({ apiOrigin: "https://api.eagleseye.ai" }));
  });

  it("sends a strict Content-Security-Policy", () => {
    const csp = (vercelConfig({ apiOrigin: "https://api.eagleseye.ai" }).headers[0]!.headers.find((h: { key: string }) => h.key === "Content-Security-Policy") as { value: string }).value;
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/); // no inline code
    expect(csp).not.toMatch(/script-src[^;]*\*/);
  });
});
