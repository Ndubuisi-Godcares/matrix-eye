/**
 * End-to-end in a real browser: Chromium loads the demo page, the built widget runs, and it talks to the real API
 * (which has crawled the fixture website). Skipped, not failed, when Chromium is not installed locally; CI installs it.
 *
 * Includes an automated accessibility audit with axe-core. Automated tools find roughly a third of accessibility
 * problems, so passing is necessary, not proof of full WCAG conformance; manual screen-reader testing is still owed.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import { startDemo, type RunningDemo } from "../../../apps/demo/src/demo";
import { SqliteKnowledgeStore } from "@eagles-eye/knowledge";
import { ScriptedProvider } from "@eagles-eye/llm";
import { startFixtureServer, type FixtureServer } from "@eagles-eye/testing";

const here = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(here, "__screenshots__");
const axeSource = readFileSync(join(here, "../../../node_modules/axe-core/axe.min.js"), "utf8");

let site: FixtureServer;
let demo: RunningDemo;
let store: SqliteKnowledgeStore;
let browser: Browser | null = null;

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
  execFileSync(process.execPath, [join(here, "../scripts/build.mjs")], { stdio: "pipe" }); // test the real built bundle
  try {
    browser = await chromium.launch();
  } catch {
    browser = null; // Chromium is not installed here
    return;
  }
  site = await startFixtureServer();
  store = new SqliteKnowledgeStore(":memory:");
  const llm = new ScriptedProvider(["Computer Science costs **$4,500** per year [1]."]);
  demo = await startDemo({ store, siteUrl: site.baseUrl, siteName: "Riverside University", port: await freePort(), llm, allowPrivateNetworks: true, crawlDelayMs: 0, maxPages: 50 });
}, 120_000);

afterAll(async () => {
  await browser?.close();
  await demo?.close();
  store?.close();
  await site?.close();
});

/** Open a fresh page on the demo and wait for the widget to be ready. */
async function openDemo(path = "/", viewport = { width: 1100, height: 800 }): Promise<Page> {
  const context = await browser!.newContext({ viewport });
  const page = await context.newPage();
  await page.goto(`${demo.url}${path}`);
  await page.locator(".ee-panel").waitFor({ state: "visible" });
  await page.getByText("Riverside University", { exact: false }).first().waitFor();
  // Let the opening animation finish: measuring colours mid-fade (semi-transparent) would be meaningless.
  await page.evaluate(() => Promise.all(document.querySelector("eagles-eye-chat")!.shadowRoot!.getAnimations().map((a) => a.finished)));
  return page;
}

async function ask(page: Page, question: string) {
  await page.locator(".ee-input").fill(question);
  await page.locator(".ee-input").press("Enter");
}

async function axeViolations(page: Page) {
  await page.addScriptTag({ content: axeSource });
  return page.evaluate(async () => {
    // @ts-expect-error axe is injected by the script tag above
    const result = await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"] } });
    return result.violations.map((v: { id: string; impact: string; help: string; nodes: { html: string }[] }) => ({ id: v.id, impact: v.impact, help: v.help, sample: v.nodes[0]?.html.slice(0, 160) }));
  });
}

describe("widget in a real browser", () => {
  it("loads from a single script tag, opens, and greets the visitor", async (ctx) => {
    if (!browser) return ctx.skip();
    const page = await openDemo();
    expect(await page.locator(".ee-head h2").textContent()).toBe("Riverside University");
    expect(await page.locator(".ee-assistant .ee-bubble").first().textContent()).toContain("Riverside University");
    await page.screenshot({ path: join(SHOTS, "01-open-desktop.png") });
    await page.context().close();
  }, 60_000);

  it("answers a question with a streamed, cited, formatted answer", async (ctx) => {
    if (!browser) return ctx.skip();
    const page = await openDemo();
    await ask(page, "How much is tuition for computer science?");
    const answer = page.locator(".ee-assistant").last();
    await answer.locator(".ee-sources").waitFor({ timeout: 15_000 });

    expect(await answer.locator(".ee-bubble").textContent()).toContain("$4,500");
    expect(await answer.locator("strong").textContent()).toBe("$4,500");
    const cite = answer.locator(".ee-cite a");
    expect(await cite.getAttribute("href")).toContain("/tuition");
    expect(await cite.getAttribute("target")).toBe("_blank");
    expect(await cite.getAttribute("rel")).toBe("noopener noreferrer");
    await page.screenshot({ path: join(SHOTS, "02-answer-desktop.png") });
    await page.context().close();
  }, 60_000);

  it("records feedback that reaches the server", async (ctx) => {
    if (!browser) return ctx.skip();
    const page = await openDemo();
    await ask(page, "How much is tuition for computer science?");
    await page.locator(".ee-actions .ee-icon-btn").first().waitFor({ timeout: 15_000 });
    await page.locator('[aria-label="Not a helpful answer"]').click();
    await page.locator(".ee-actions span").getByText("Thanks for your feedback").waitFor();
    await expect.poll(() => (store.connection.prepare("SELECT COUNT(*) AS n FROM feedback WHERE rating = 'down'").get() as { n: number }).n, { timeout: 5000 }).toBeGreaterThan(0);
    await page.context().close();
  }, 60_000);

  it("is fully usable by keyboard: Escape closes, focus returns to the launcher, Enter reopens", async (ctx) => {
    if (!browser) return ctx.skip();
    const page = await openDemo();
    await page.locator(".ee-input").focus();
    await page.keyboard.press("Escape");
    expect(await page.locator(".ee-panel").isHidden()).toBe(true);
    expect(await page.evaluate(() => document.querySelector("eagles-eye-chat")!.shadowRoot!.activeElement?.className)).toContain("ee-launcher");
    await page.keyboard.press("Enter");
    await page.locator(".ee-panel").waitFor({ state: "visible" });
    expect(await page.evaluate(() => document.querySelector("eagles-eye-chat")!.shadowRoot!.activeElement?.className)).toContain("ee-input");
    await page.context().close();
  }, 60_000);

  it("fills a phone screen and stays usable", async (ctx) => {
    if (!browser) return ctx.skip();
    const page = await openDemo("/", { width: 375, height: 667 });
    const box = (await page.locator(".ee-panel").boundingBox())!;
    expect(Math.round(box.width)).toBe(375);
    expect(Math.round(box.height)).toBe(667);
    await ask(page, "How much is tuition for computer science?");
    await page.locator(".ee-sources").waitFor({ timeout: 15_000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true); // no sideways scrolling
    await page.screenshot({ path: join(SHOTS, "03-answer-mobile.png") });
    await page.context().close();
  }, 60_000);

  it("is not affected by aggressive styles on the host page", async (ctx) => {
    if (!browser) return ctx.skip();
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.addInitScript(() => {
      document.addEventListener("DOMContentLoaded", () => {
        const style = document.createElement("style");
        style.textContent = "* { font-size: 40px !important; color: red !important; letter-spacing: 9px !important; text-transform: uppercase !important; } button { background: lime !important; }";
        document.head.appendChild(style);
      });
    });
    await page.goto(demo.url);
    await page.locator(".ee-panel").waitFor({ state: "visible" });
    const bubble = page.locator(".ee-assistant .ee-bubble").first();
    expect(await bubble.evaluate((el) => getComputedStyle(el).fontSize)).toBe("15px");
    expect(await bubble.evaluate((el) => getComputedStyle(el).textTransform)).toBe("none");
    expect(await page.locator(".ee-send").evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe("rgb(0, 255, 0)");
    await context.close();
  }, 60_000);

  it("supports theming through settings", async (ctx) => {
    if (!browser) return ctx.skip();
    const page = await openDemo("/?theme=dark&position=left&color=%231b6b4a");
    expect(await page.locator(".ee-root").getAttribute("data-theme")).toBe("dark");
    expect(await page.locator(".ee-root").getAttribute("data-position")).toBe("left");
    await page.screenshot({ path: join(SHOTS, "04-dark-left-green.png") });
    await page.context().close();
  }, 60_000);
});

describe("accessibility audit (axe-core, WCAG 2.1 A/AA + best practices)", () => {
  for (const [name, path] of [["light theme", "/?theme=light"], ["dark theme", "/?theme=dark"]] as const) {
    it(`has no violations: ${name}, with an answer on screen`, async (ctx) => {
      if (!browser) return ctx.skip();
      const page = await openDemo(path);
      await ask(page, "How much is tuition for computer science?");
      await page.locator(".ee-sources").waitFor({ timeout: 15_000 });
      expect(await axeViolations(page)).toEqual([]);
      await page.context().close();
    }, 60_000);
  }

  it("has no violations on a custom brand colour", async (ctx) => {
    if (!browser) return ctx.skip();
    const page = await openDemo("/?theme=light&color=%23e63946&accent=%23ffb703");
    expect(await axeViolations(page)).toEqual([]);
    await page.context().close();
  }, 60_000);
});
