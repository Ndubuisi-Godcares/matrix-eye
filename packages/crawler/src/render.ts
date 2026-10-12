/**
 * JavaScript rendering for pages that ship an empty HTML shell and build their content in the
 * browser (React, Vue and other single-page apps).
 *
 * The crawler only calls a renderer when plain extraction finds almost no text, so ordinary
 * sites never pay the cost. Playwright is an *optional* dependency because it needs a browser
 * download (about 120 MB): install it with `npm i playwright && npx playwright install chromium`.
 *
 * SAFETY. A real browser runs the page's own JavaScript, and that JavaScript can request any URL,
 * for instance `fetch("http://169.254.169.254/...")`. Those requests do not pass through the crawler's
 * guarded HTTP client, so every request the browser makes is intercepted here and refused when it
 * targets a private or internal address. Heavy resources (images, media, fonts) are blocked because
 * only text matters, which also makes rendering several times faster.
 *
 * Known limit: the browser resolves DNS itself, so a hostile DNS server could answer differently at
 * connection time than at our check (rebinding). This is narrower than having no guard, and
 * acceptable for crawling sites you chose to index, but renderer use on untrusted user-supplied URLs in
 * the hosted service should run inside a network-isolated sandbox.
 */
import dns from "node:dns/promises";
import { EagleError } from "@eagles-eye/core";
import { assertPublicUrl, isBlockedAddress } from "./ssrf";

export interface PageRenderer {
  /** Return the fully rendered HTML of `url`. */
  render(url: string): Promise<string>;
  close(): Promise<void>;
}

export interface RendererOptions {
  /** Per-page limit for navigation plus waiting for the network to settle. */
  timeoutMs?: number;
  /** Permit localhost/private addresses. Development only. */
  allowPrivateNetworks?: boolean;
}

/** Resource types that never contribute text. */
const SKIPPED_RESOURCES = new Set(["image", "media", "font"]);

/** Minimal shape of the Playwright API used here, so no type dependency is required. */
interface PlaywrightRoute {
  request(): { url(): string; resourceType(): string };
  continue(): Promise<void>;
  abort(reason?: string): Promise<void>;
}
interface PlaywrightPage {
  route(pattern: string, handler: (route: PlaywrightRoute) => Promise<void>): Promise<void>;
  goto(url: string, opts: { waitUntil: string; timeout: number }): Promise<unknown>;
  content(): Promise<string>;
  close(): Promise<void>;
}
interface PlaywrightContext {
  newPage(): Promise<PlaywrightPage>;
  close(): Promise<void>;
}
interface PlaywrightBrowser {
  newContext(opts: { serviceWorkers: "block"; userAgent?: string }): Promise<PlaywrightContext>;
  close(): Promise<void>;
}
interface PlaywrightLike {
  chromium: { launch(): Promise<PlaywrightBrowser> };
}

/**
 * Decides whether the browser may request a URL. Exported so the policy can be tested without a browser.
 * Refuses non-web schemes, localhost, private and link-local addresses, and hosts that cannot be resolved.
 */
export function createRequestGuard(allowPrivate: boolean): (rawUrl: string) => Promise<boolean> {
  /** hostname -> is it safe to contact? Cached so a page with 50 requests does not do 50 DNS lookups. */
  const hostVerdicts = new Map<string, Promise<boolean>>();
  const hostIsSafe = (hostname: string): Promise<boolean> => {
    let verdict = hostVerdicts.get(hostname);
    if (!verdict) {
      verdict = dns
        .lookup(hostname, { all: true })
        .then((addresses) => addresses.every((a) => !isBlockedAddress(a.address)))
        .catch(() => false); // unresolvable hosts are refused
      hostVerdicts.set(hostname, verdict);
    }
    return verdict;
  };

  return async (rawUrl) => {
    if (rawUrl.startsWith("data:") || rawUrl.startsWith("about:") || rawUrl.startsWith("blob:")) return true;
    try {
      const url = assertPublicUrl(rawUrl, allowPrivate); // scheme, localhost and IP-literal checks
      return allowPrivate || (await hostIsSafe(url.hostname.replace(/^\[|\]$/g, "")));
    } catch {
      return false;
    }
  };
}

export async function createPlaywrightRenderer(options: RendererOptions = {}): Promise<PageRenderer> {
  const timeoutMs = options.timeoutMs ?? 20_000;
  const allowPrivate = options.allowPrivateNetworks ?? false;

  let playwright: PlaywrightLike;
  try {
    // Indirect specifier keeps bundlers and the type-checker from requiring the package.
    const moduleName = "playwright";
    playwright = (await import(moduleName)) as PlaywrightLike;
  } catch (err) {
    throw new EagleError("internal", "Playwright is not installed. Run: npm i playwright && npx playwright install chromium", { cause: err });
  }

  let browser: PlaywrightBrowser;
  try {
    browser = await playwright.chromium.launch();
  } catch (err) {
    throw new EagleError("internal", "Could not start Chromium. Run: npx playwright install chromium", { cause: err });
  }
  // One isolated context: no shared cookies, and service workers (which could bypass routing) are off.
  const context = await browser.newContext({ serviceWorkers: "block" });

  const allowed = createRequestGuard(allowPrivate);

  return {
    async render(url) {
      const page = await context.newPage();
      try {
        await page.route("**/*", async (route) => {
          const request = route.request();
          if (SKIPPED_RESOURCES.has(request.resourceType()) || !(await allowed(request.url()))) {
            await route.abort("blockedbyclient");
          } else {
            await route.continue();
          }
        });
        await page.goto(url, { waitUntil: "networkidle", timeout: timeoutMs });
        return await page.content();
      } finally {
        await page.close();
      }
    },
    async close() {
      await context.close();
      await browser.close();
    },
  };
}
