/**
 * Optional JavaScript rendering for pages that ship an empty HTML shell and build their
 * content in the browser (many single-page apps).
 *
 * The crawler only uses a renderer when plain extraction finds almost no text. Playwright
 * is deliberately NOT a hard dependency: it adds ~300 MB of browser binaries. To enable
 * rendering, install it (`npm i playwright && npx playwright install chromium`) and pass
 * `createPlaywrightRenderer()` to `crawlSite`.
 *
 * NOTE: not yet exercised by automated tests; covered by a manual check in Phase 1.
 */
import { EagleError } from "@eagles-eye/core";

export interface PageRenderer {
  /** Return the fully rendered HTML of `url`. */
  render(url: string): Promise<string>;
  close(): Promise<void>;
}

/** Minimal shape of the Playwright API we use, so no type dependency is needed. */
interface PlaywrightLike {
  chromium: {
    launch(): Promise<{
      newPage(): Promise<{
        goto(url: string, opts: { waitUntil: string; timeout: number }): Promise<unknown>;
        content(): Promise<string>;
        close(): Promise<void>;
      }>;
      close(): Promise<void>;
    }>;
  };
}

export async function createPlaywrightRenderer(timeoutMs = 20_000): Promise<PageRenderer> {
  let playwright: PlaywrightLike;
  try {
    // Indirect specifier keeps bundlers and the type-checker from requiring the package.
    const moduleName = "playwright";
    playwright = (await import(moduleName)) as PlaywrightLike;
  } catch (err) {
    throw new EagleError("internal", "Playwright is not installed. Run: npm i playwright && npx playwright install chromium", { cause: err });
  }
  const browser = await playwright.chromium.launch();
  return {
    async render(url) {
      const page = await browser.newPage();
      try {
        await page.goto(url, { waitUntil: "networkidle", timeout: timeoutMs });
        return await page.content();
      } finally {
        await page.close();
      }
    },
    close: () => browser.close(),
  };
}
