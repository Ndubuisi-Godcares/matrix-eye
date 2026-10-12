/**
 * Shared test plumbing for the website suite: build the site once, list its pages, and measure what each page loads.
 */
import { execFileSync } from "node:child_process";
import { closeSync, existsSync, openSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import * as cheerio from "cheerio";

const here = dirname(fileURLToPath(import.meta.url));
export const SITE_ROOT = join(here, "..");
export const DIST = join(SITE_ROOT, "dist");
const REPO = join(SITE_ROOT, "..", "..");

/** The placeholder production address baked into canonical links until the real domain is chosen. */
export const SITE_URL = "https://eagleseye.ai";
/** Pages that must stay out of search results and the sitemap (drafts awaiting legal review, and the 404 page). */
export const UNLISTED = ["/privacy/", "/terms/", "/404.html"];

/** Build the site and its search index exactly as the deployment does. */
export function buildSite(): void {
  // The static and browser suites run in parallel and both need the build: the first one builds, the other waits and
  // reuses it. A lock file marks a build in progress; a marker file records the finished one (reused for 30 seconds, so edits are never tested against a stale build).
  const lock = join(SITE_ROOT, ".build.lock");
  const done = join(SITE_ROOT, ".build.done");
  for (;;) {
    if (existsSync(done) && Date.now() - statSync(done).mtimeMs < 30_000 && existsSync(DIST)) return;
    try {
      closeSync(openSync(lock, "wx"));
      break;
    } catch {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500); // another suite is building: wait
      if (existsSync(lock) && Date.now() - statSync(lock).mtimeMs > 5 * 60_000) rmSync(lock, { force: true }); // stale
    }
  }
  try {
    rmSync(done, { force: true });
    runBuild();
    writeFileSync(done, String(Date.now()));
  } finally {
    rmSync(lock, { force: true });
  }
}

function runBuild(): void {
  const astro = join(REPO, "node_modules/astro/bin/astro.mjs");
  execFileSync(process.execPath, [astro, "build"], { cwd: SITE_ROOT, stdio: "pipe" });
  const pagefindPackage = JSON.parse(readFileSync(join(REPO, "node_modules/pagefind/package.json"), "utf8")) as { bin: string | Record<string, string> };
  const bin = typeof pagefindPackage.bin === "string" ? pagefindPackage.bin : Object.values(pagefindPackage.bin)[0]!;
  execFileSync(process.execPath, [join(REPO, "node_modules/pagefind", bin), "--site", DIST, "--quiet"], { cwd: SITE_ROOT, stdio: "pipe" });
}

export interface Page {
  /** URL path, e.g. "/docs/api/" (or "/404.html"). */
  path: string;
  file: string;
  html: string;
  $: cheerio.CheerioAPI;
}

/** Every HTML page in the build. */
export function listPages(): Page[] {
  const pages: Page[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const file = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "pagefind" && entry.name !== "_astro") walk(file);
      } else if (entry.name.endsWith(".html")) {
        const rel = relative(DIST, file).split(sep).join("/");
        const path = entry.name === "index.html" ? `/${rel.replace(/index\.html$/, "")}` : `/${rel}`;
        const html = readFileSync(file, "utf8");
        pages.push({ path, file, html, $: cheerio.load(html) });
      }
    }
  };
  walk(DIST);
  return pages.sort((a, b) => a.path.localeCompare(b.path));
}

/** Resolve a site-relative URL path to a file in dist, or null if nothing is there. */
export function fileFor(urlPath: string): string | null {
  const clean = decodeURIComponent(urlPath.split("#")[0]!.split("?")[0]!);
  const candidates = [join(DIST, clean), join(DIST, clean, "index.html")];
  return candidates.find((c) => existsSync(c) && !readdirSafe(c)) ?? null;
}
function readdirSafe(path: string): boolean {
  try {
    readdirSync(path);
    return true; // it is a directory
  } catch {
    return false;
  }
}

const gz = (file: string) => gzipSync(readFileSync(file)).length;

/** Gzipped bytes of the page's HTML, and of the JavaScript and CSS it loads (including imported chunks). */
export function weigh(page: Page): { html: number; js: number; css: number } {
  const js = new Set<string>();
  const css = new Set<string>();
  const addScript = (assetPath: string) => {
    if (js.has(assetPath)) return;
    js.add(assetPath);
    const file = join(DIST, assetPath);
    if (!existsSync(file)) return;
    // Follow "import ... from './chunk.js'" so shared chunks are counted too.
    for (const match of readFileSync(file, "utf8").matchAll(/(?:from|import)\s*["'](\.\/[^"']+\.js)["']/g)) addScript(`/_astro/${match[1]!.slice(2)}`);
  };
  page.$("script[src]").each((_, el) => {
    const src = page.$(el).attr("src") ?? "";
    if (src.startsWith("/")) addScript(src);
  });
  page.$('link[rel="stylesheet"]').each((_, el) => void css.add(page.$(el).attr("href") ?? ""));
  const sum = (set: Set<string>) => [...set].reduce((total, p) => total + (existsSync(join(DIST, p)) ? gz(join(DIST, p)) : 0), 0);
  return { html: gzipSync(page.html).length, js: sum(js), css: sum(css) };
}
