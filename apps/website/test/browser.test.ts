/**
 * The built website in a real browser, served with its production security headers.
 *
 * Covers: automated accessibility audit of every page in light and dark; no console errors, no Content-Security-Policy
 * violations, no requests to other websites; no sideways scrolling on a phone; keyboard use (skip link, menu, tabs,
 * search, theme); and the waitlist and contact forms talking to the real API. Skipped, not failed, if Chromium is missing.
 */
import { mkdirSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildApp, loadConfig } from "@eagles-eye/api";
import { SqliteKnowledgeStore } from "@eagles-eye/knowledge";
import type { FastifyInstance } from "fastify";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startServer } from "../scripts/serve.mjs";
import { buildSite, listPages } from "./helpers";

const here = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(here, "__screenshots__");
const axeSource = readFileSync(join(here, "../../../node_modules/axe-core/axe.min.js"), "utf8");
const ADMIN_KEY = "website-test-key-0123456789abcdef";

let browser: Browser | null = null;
let site: { url: string; port: number; requests: string[]; close(): Promise<void> };
let api: FastifyInstance;
let store: SqliteKnowledgeStore;
let apiUrl = "";
let paths: string[] = [];

const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const server = createServer().listen(0, "127.0.0.1", () => {
      const { port } = server.address() as { port: number };
      server.close(() => resolve(port));
    });
    server.on("error", reject);
  });

beforeAll(async () => {
  mkdirSync(SHOTS, { recursive: true });
  buildSite();
  paths = listPages().map((p) => (p.path === "/404.html" ? "/this-page-does-not-exist/" : p.path));
  try {
    browser = await chromium.launch();
  } catch {
    browser = null;
    return;
  }
  // The API the forms talk to, allowed to accept requests from the website's origin. Both ports are chosen first
  // because each side's settings must name the other.
  const sitePort = await freePort();
  const apiPort = await freePort();
  apiUrl = `http://127.0.0.1:${apiPort}`;
  store = new SqliteKnowledgeStore(":memory:");
  ({ app: api } = await buildApp({ config: loadConfig({ EAGLE_API_KEY: ADMIN_KEY, EAGLE_SITE_ORIGINS: `http://127.0.0.1:${sitePort}`, EAGLE_FORM_RATE_LIMIT_PER_MINUTE: "500" }), store }));
  await api.listen({ port: apiPort, host: "127.0.0.1" });
  site = await startServer({ port: sitePort, config: { apiUrl }, apiOrigin: apiUrl });
}, 240_000);

afterAll(async () => {
  await browser?.close();
  await site?.close();
  await api?.close();
  store?.close();
});

/** A page that records problems as they happen: console errors, security-policy violations, off-site requests. */
async function open(path: string, options: { colorScheme?: "light" | "dark"; width?: number; height?: number; permissions?: string[]; bypassCSP?: boolean; motion?: boolean } = {}) {
  // bypassCSP only for the accessibility audit, which must inject the axe-core script; every other test runs under the real policy.
  const context = await browser!.newContext({ reducedMotion: options.motion ? "no-preference" : "reduce", bypassCSP: options.bypassCSP, colorScheme: options.colorScheme ?? "light", viewport: { width: options.width ?? 1280, height: options.height ?? 900 } });
  if (options.permissions) await context.grantPermissions(options.permissions);
  const page = await context.newPage();
  const problems: string[] = [];
  page.on("console", (m) => m.type() === "error" && problems.push(`console: ${m.text()}`));
  page.on("pageerror", (e) => problems.push(`script error: ${e.message}`));
  page.on("request", (r) => {
    const url = new URL(r.url());
    if (!r.url().startsWith("data:") && url.origin !== site.url && url.origin !== apiUrl) problems.push(`request to another site: ${r.url()}`);
  });
  await page.addInitScript(() => {
    (window as unknown as { __csp: string[] }).__csp = [];
    document.addEventListener("securitypolicyviolation", (e) => (window as unknown as { __csp: string[] }).__csp.push(`${e.violatedDirective}: ${e.blockedURI}`));
  });
  await page.goto(`${site.url}${path}`, { waitUntil: "networkidle" });
  return { page, context, problems };
}

async function cspViolations(page: Page) {
  return page.evaluate(() => (window as unknown as { __csp: string[] }).__csp);
}

async function axeViolations(page: Page) {
  await page.addScriptTag({ content: axeSource });
  return page.evaluate(async () => {
    // @ts-expect-error axe is injected by the script tag above
    const result = await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"] } });
    return result.violations.map((v: { id: string; impact: string; help: string; nodes: { html: string; target: string[] }[] }) => ({ id: v.id, impact: v.impact, help: v.help, where: v.nodes.slice(0, 2).map((n) => `${n.target.join(" ")} ${n.html.slice(0, 110)}`) }));
  });
}

const settled = async (page: Page) => page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));

describe("every page, in a real browser", () => {
  it("has no accessibility violations, in light or dark (axe-core, WCAG 2.1 A/AA + best practices)", async (ctx) => {
    if (!browser) return ctx.skip();
    const failures: string[] = [];
    for (const scheme of ["light", "dark"] as const) {
      for (const path of paths) {
        const { page, context } = await open(path, { colorScheme: scheme, bypassCSP: true });
        await page.waitForTimeout(250);
        await settled(page);
        for (const v of await axeViolations(page)) failures.push(`${scheme} ${path}: ${v.id} (${v.impact}) ${v.help} :: ${v.where.join(" | ")}`);
        await context.close();
      }
    }
    expect(failures).toEqual([]);
  }, 600_000);

  it("runs cleanly: no console errors, no security-policy violations, nothing fetched from other websites", async (ctx) => {
    if (!browser) return ctx.skip();
    const failures: string[] = [];
    for (const path of paths) {
      const { page, context, problems } = await open(path);
      const csp = await cspViolations(page);
      for (const message of [...problems, ...csp.map((c) => `CSP: ${c}`)]) failures.push(`${path}: ${message}`);
      await context.close();
    }
    // The 404 page legitimately makes the browser log "Failed to load resource" for the missing page itself.
    expect(failures.filter((f) => !/Failed to load resource.*404/.test(f))).toEqual([]);
  }, 300_000);

  it("never scrolls sideways on a phone", async (ctx) => {
    if (!browser) return ctx.skip();
    const wide: string[] = [];
    for (const path of paths) {
      const { page, context } = await open(path, { width: 375, height: 800 });
      if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) wide.push(path);
      await context.close();
    }
    expect(wide).toEqual([]);
  }, 300_000);

  it("sends the production security headers", async (ctx) => {
    if (!browser) return ctx.skip();
    const response = await fetch(`${site.url}/`);
    expect(response.headers.get("content-security-policy")).toContain("default-src 'self'");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(response.headers.get("strict-transport-security")).toMatch(/max-age=\d{7,}/);
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect((await fetch(`${site.url}/this-page-does-not-exist/`)).status).toBe(404);
  });

  it("paints quickly and does not jump around while loading", async (ctx) => {
    if (!browser) return ctx.skip();
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await page.addInitScript(() => {
      const state = { lcp: 0, cls: 0 };
      (window as unknown as { __perf: typeof state }).__perf = state;
      new PerformanceObserver((list) => list.getEntries().forEach((e) => (state.lcp = e.startTime))).observe({ type: "largest-contentful-paint", buffered: true });
      new PerformanceObserver((list) => list.getEntries().forEach((e) => !(e as PerformanceEntry & { hadRecentInput: boolean }).hadRecentInput && (state.cls += (e as PerformanceEntry & { value: number }).value))).observe({ type: "layout-shift", buffered: true });
    });
    await page.goto(site.url, { waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    const perf = await page.evaluate(() => (window as unknown as { __perf: { lcp: number; cls: number } }).__perf);
    expect(perf.lcp, `largest contentful paint ${Math.round(perf.lcp)} ms`).toBeLessThan(2500);
    expect(perf.cls, `layout shift ${perf.cls.toFixed(3)}`).toBeLessThan(0.1);
    await context.close();
  }, 60_000);
});

describe("layout and motion", () => {
  it("gives documentation a comfortable reading column on wide screens, without breaking words in tables", async (ctx) => {
    if (!browser) return ctx.skip();
    for (const width of [1280, 1697, 2560]) {
      const { page, context } = await open("/docs/accuracy/", { width, height: 900 });
      const column = await page.locator(".docs .prose").evaluate((el) => el.getBoundingClientRect().width);
      expect(column, `article width at ${width}px`).toBeGreaterThanOrEqual(width === 1280 ? 600 : 700);
      // No table cell may be so narrow that a word has to be split across lines.
      const split = await page.locator(".prose td, .prose th").evaluateAll((cells) => cells.filter((c) => c.scrollWidth > c.clientWidth + 1).map((c) => c.textContent?.slice(0, 30)));
      expect(split).toEqual([]);
      await context.close();
    }
  });

  it("reveals content as it scrolls into view, and never hides anything for reduced-motion visitors", async (ctx) => {
    if (!browser) return ctx.skip();
    const moving = await open("/pricing/", { motion: true });
    const hidden = await moving.page.locator(".sr:not(.is-in)").count();
    expect(hidden, "elements below the fold start hidden").toBeGreaterThan(0);
    expect(await moving.page.locator(".hero, .section").first().evaluate((el) => getComputedStyle(el).opacity)).toBe("1"); // the first screen never flashes
    await moving.page.evaluate(() => scrollTo(0, document.body.scrollHeight));
    await moving.page.waitForTimeout(1200);
    expect(await moving.page.locator(".sr:not(.is-in)").count(), "everything is shown after scrolling").toBeLessThan(hidden);
    await moving.context.close();

    const still = await open("/pricing/"); // reduced motion by default in these tests
    expect(await still.page.locator(".sr").count()).toBe(0);
    await still.context.close();
  });

  it("marks the section being read in the docs table of contents", async (ctx) => {
    if (!browser) return ctx.skip();
    const { page, context } = await open("/docs/accuracy/", { width: 1400, height: 900 });
    await page.locator(".prose h2").nth(2).scrollIntoViewIfNeeded();
    await page.evaluate(() => scrollBy(0, 200));
    await expect.poll(() => page.locator('.docs__toc a[aria-current="location"]').count()).toBe(1);
    await context.close();
  });
});

describe("keyboard and interaction", () => {
  it("lets a keyboard user skip straight to the content", async (ctx) => {
    if (!browser) return ctx.skip();
    const { page, context } = await open("/");
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => document.activeElement?.textContent)).toContain("Skip to the main content");
    await page.keyboard.press("Enter");
    expect(await page.evaluate(() => document.activeElement?.id)).toBe("main");
    await context.close();
  });

  it("opens and closes the phone menu, with Escape returning focus to its button", async (ctx) => {
    if (!browser) return ctx.skip();
    const { page, context } = await open("/", { width: 390, height: 800 });
    const toggle = page.locator("[data-nav-toggle]");
    expect(await page.locator("[data-nav]").isVisible()).toBe(false);
    await toggle.click();
    expect(await toggle.getAttribute("aria-expanded")).toBe("true");
    expect(await page.locator("[data-nav]").isVisible()).toBe(true);
    await page.screenshot({ path: join(SHOTS, "menu-open-mobile.png") });
    await page.keyboard.press("Escape");
    expect(await toggle.getAttribute("aria-expanded")).toBe("false");
    expect(await page.evaluate(() => document.activeElement?.hasAttribute("data-nav-toggle"))).toBe(true);
    await context.close();
  });

  it("switches and remembers the colour theme", async (ctx) => {
    if (!browser) return ctx.skip();
    const { page, context } = await open("/", { colorScheme: "light" });
    expect(await page.evaluate(() => document.documentElement.getAttribute("data-theme"))).toBeNull();
    await page.locator("[data-theme-toggle]").first().click();
    expect(await page.evaluate(() => document.documentElement.getAttribute("data-theme"))).toBe("dark");
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(10, 19, 32)");
    await page.reload({ waitUntil: "networkidle" });
    expect(await page.evaluate(() => document.documentElement.getAttribute("data-theme"))).toBe("dark"); // remembered, with no flash
    await context.close();
  });

  it("switches code examples with the arrow keys", async (ctx) => {
    if (!browser) return ctx.skip();
    const { page, context } = await open("/");
    const tabs = page.getByRole("tab");
    expect(await tabs.count()).toBe(3);
    expect(await tabs.nth(0).getAttribute("aria-selected")).toBe("true");
    await tabs.nth(0).focus();
    await page.keyboard.press("ArrowRight");
    expect(await tabs.nth(1).getAttribute("aria-selected")).toBe("true");
    expect(await page.locator("[role=tabpanel]").nth(1).isVisible()).toBe(true);
    expect(await page.locator("[role=tabpanel]").nth(0).isVisible()).toBe(false);
    await context.close();
  });

  it("copies a code example to the clipboard", async (ctx) => {
    if (!browser) return ctx.skip();
    const { page, context } = await open("/", { permissions: ["clipboard-read", "clipboard-write"] });
    await page.locator("[data-copy]").first().click();
    await expect.poll(() => page.locator("[data-copy] span").first().textContent()).toBe("Copied"); // the clipboard write is asynchronous
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("data-project");
    await context.close();
  });

  it("finds documentation pages with the search box, entirely in the browser", async (ctx) => {
    if (!browser) return ctx.skip();
    const { page, context } = await open("/docs/quickstart/");
    const input = page.locator("#docs-search");
    await input.waitFor({ state: "visible" });
    await input.fill("streaming answers");
    await page.locator(".search__results a").first().waitFor();
    const found = await page.locator(".search__results a").evaluateAll((links) => links.map((l) => (l as HTMLAnchorElement).pathname));
    expect(found.some((p) => p.startsWith("/docs/"))).toBe(true);
    await page.keyboard.press("ArrowDown");
    expect(await page.evaluate(() => document.activeElement?.tagName)).toBe("A");
    await page.screenshot({ path: join(SHOTS, "docs-search.png") });
    await page.keyboard.press("Escape");
    expect(await page.locator(".search__results").isHidden()).toBe(true);
    await context.close();
  }, 60_000);

  it("shows no search box when there is no search index (nothing broken is displayed)", async (ctx) => {
    if (!browser) return ctx.skip();
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.route("**/pagefind/pagefind-entry.json", (route) => route.fulfill({ status: 404, body: "" }));
    await page.goto(`${site.url}/docs/quickstart/`, { waitUntil: "networkidle" });
    expect(await page.locator("[data-search]").isHidden()).toBe(true);
    await context.close();
  });

  it("expands FAQ answers from the keyboard", async (ctx) => {
    if (!browser) return ctx.skip();
    const { page, context } = await open("/pricing/");
    const first = page.locator(".faq summary").first();
    await first.focus();
    await page.keyboard.press("Enter");
    expect(await page.locator(".faq details").first().getAttribute("open")).not.toBeNull();
    await context.close();
  });
});

describe("the forms, against the real API", () => {
  const waitlist = async () => ((await (await fetch(`${apiUrl}/v1/waitlist`, { headers: { authorization: `Bearer ${ADMIN_KEY}` } })).json()) as { entries: Array<{ email: string; name: string | null; useCase: string | null; source: string | null }> }).entries;

  it("explains what is missing, links each message to its field, and focuses the first problem", async (ctx) => {
    if (!browser) return ctx.skip();
    const { page, context } = await open("/waitlist/");
    await page.getByRole("button", { name: "Join the waitlist" }).last().click();
    expect(await page.locator("#wl-email-error").isVisible()).toBe(true);
    expect(await page.locator("#wl-email").getAttribute("aria-invalid")).toBe("true");
    expect(await page.locator("#wl-consent-error").isVisible()).toBe(true);
    expect(await page.evaluate(() => document.activeElement?.id)).toBe("wl-email");
    await page.locator("#wl-email").fill("not-an-email");
    await page.locator("#wl-consent").check();
    await page.getByRole("button", { name: "Join the waitlist" }).last().click();
    expect(await page.locator("#wl-email-error").isVisible()).toBe(true);
    await page.screenshot({ path: join(SHOTS, "waitlist-errors.png") });
    await context.close();
  });

  it("signs someone up, shows a confirmation, and the owner can see it", async (ctx) => {
    if (!browser) return ctx.skip();
    const { page, context } = await open("/waitlist/");
    await page.locator("#wl-email").fill("Grace.Hopper@Example.com");
    await page.locator("#wl-name").fill("Grace");
    await page.locator("#wl-use").selectOption({ index: 1 });
    await page.locator("#wl-consent").check();
    await page.getByRole("button", { name: "Join the waitlist" }).last().click();
    await page.locator("[data-status].form-status--ok").waitFor();
    expect(await page.locator("[data-status]").textContent()).toContain("You are on the list");
    await page.screenshot({ path: join(SHOTS, "waitlist-success.png") });

    const entry = (await waitlist()).find((e) => e.email === "grace.hopper@example.com");
    expect(entry).toMatchObject({ name: "Grace", source: "/waitlist/" });
    expect(entry?.useCase).toBeTruthy();
    expect(await page.locator("#wl-email").inputValue()).toBe(""); // the form is cleared
    await context.close();
  });

  it("accepts a repeat signup without revealing that the address was already there", async (ctx) => {
    if (!browser) return ctx.skip();
    const { page, context } = await open("/waitlist/");
    await page.locator("#wl-email").fill("grace.hopper@example.com");
    await page.locator("#wl-consent").check();
    await page.getByRole("button", { name: "Join the waitlist" }).last().click();
    await page.locator("[data-status].form-status--ok").waitFor();
    expect((await waitlist()).filter((e) => e.email === "grace.hopper@example.com")).toHaveLength(1);
    await context.close();
  });

  it("never sends the spam-trap field filled by a real visitor, and ignores it when a bot fills it", async (ctx) => {
    if (!browser) return ctx.skip();
    const { page, context } = await open("/waitlist/");
    // A person cannot see or reach the trap.
    expect(await page.locator(".honeypot input").evaluate((el) => (el as HTMLElement).getBoundingClientRect().right < 0)).toBe(true);
    await page.locator("#wl-email").fill("bot@example.com");
    await page.locator(".honeypot input").evaluate((el) => ((el as HTMLInputElement).value = "http://spam.example"));
    await page.locator("#wl-consent").check();
    await page.getByRole("button", { name: "Join the waitlist" }).last().click();
    await page.locator("[data-status].form-status--ok").waitFor(); // looks successful to the bot...
    expect((await waitlist()).some((e) => e.email === "bot@example.com")).toBe(false); // ...but nothing was stored
    await context.close();
  });

  it("sends a contact message", async (ctx) => {
    if (!browser) return ctx.skip();
    const { page, context } = await open("/contact/");
    await page.locator("#ct-name").fill("Alan");
    await page.locator("#ct-email").fill("alan@example.com");
    await page.locator("#ct-message").fill("Does it work with Moodle sites?");
    await page.locator("#ct-consent").check();
    await page.getByRole("button", { name: "Send message" }).click();
    await page.locator("[data-status].form-status--ok").waitFor();
    const messages = ((await (await fetch(`${apiUrl}/v1/contact-messages`, { headers: { authorization: `Bearer ${ADMIN_KEY}` } })).json()) as { messages: Array<{ name: string; message: string }> }).messages;
    expect(messages.some((m) => m.name === "Alan" && m.message.includes("Moodle"))).toBe(true);
    await context.close();
  });

  it("says so plainly when the sign-up service is not connected or unreachable", async (ctx) => {
    if (!browser) return ctx.skip();
    for (const [config, expected] of [[{ apiUrl: "" }, /not connected yet/], [{ apiUrl: "http://127.0.0.1:1" }, /could not reach|check your connection/i]] as const) {
      const server = await startServer({ config, apiOrigin: config.apiUrl || undefined });
      const context: BrowserContext = await browser.newContext();
      const page = await context.newPage();
      await page.goto(`${server.url}/waitlist/`, { waitUntil: "networkidle" });
      await page.locator("#wl-email").fill("someone@example.com");
      await page.locator("#wl-consent").check();
      await page.getByRole("button", { name: "Join the waitlist" }).last().click();
      await page.locator("[data-status].form-status--error").waitFor();
      expect(await page.locator("[data-status]").textContent()).toMatch(expected);
      await context.close();
      await server.close();
    }
  }, 60_000);

  it("works the same from the form on the home page", async (ctx) => {
    if (!browser) return ctx.skip();
    const { page, context } = await open("/");
    await page.locator("#home-email").fill("home@example.com");
    await page.locator("#home-consent").check();
    await page.locator("form[data-form=waitlist] button[type=submit]").click();
    await page.locator("form[data-form=waitlist] [data-status].form-status--ok").waitFor();
    expect((await waitlist()).find((e) => e.email === "home@example.com")?.source).toBe("/");
    await context.close();
  });
});

describe("look and feel (screenshots for human review)", () => {
  it("captures the key pages in light, dark and on a phone", async (ctx) => {
    if (!browser) return ctx.skip();
    for (const [name, path, scheme, width, height] of [
      ["home-light", "/", "light", 1280, 900],
      ["home-dark", "/", "dark", 1280, 900],
      ["pricing-light", "/pricing/", "light", 1280, 900],
      ["docs-light", "/docs/widget/", "light", 1280, 900],
      ["docs-dark", "/docs/api/", "dark", 1280, 900],
      ["guide-light", "/guides/why-say-i-dont-know/", "light", 1280, 900],
      ["product-mobile", "/product/", "light", 390, 844],
      ["docs-mobile", "/docs/quickstart/", "dark", 390, 844],
    ] as const) {
      const { page, context } = await open(path, { colorScheme: scheme, width, height });
      await page.waitForTimeout(600);
      await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: name === "pricing-light" || name === "product-mobile" });
      await context.close();
    }
  }, 120_000);
});
