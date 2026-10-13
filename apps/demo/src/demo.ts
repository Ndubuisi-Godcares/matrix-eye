/**
 * The demo server: the real API plus a tiny web page that embeds the real widget.
 *
 * Purpose: see MatrixEye on any website in one command, exactly as a customer's visitors would. It is also the
 * page the browser tests drive, so what you see here is what is tested. It is a development tool, not the
 * product's hosting: it serves one project, keeps data in a local file, and allows only its own origin.
 */
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PageRenderer } from "@matrix-eye/crawler";
import { Repositories, buildApp, loadConfig } from "@matrix-eye/api";
import type { SqliteKnowledgeStore } from "@matrix-eye/knowledge";
import type { LlmProvider } from "@matrix-eye/llm";
import type { FastifyInstance } from "fastify";

const here = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(here, "..", "..", "..");
export const WIDGET_FILE = join(REPO_ROOT, "packages", "widget", "dist", "matrix-eye-widget.js");
const LOGO_FILE = join(REPO_ROOT, "brand", "matrix-eye-logo.png");

export interface DemoOptions {
  store: SqliteKnowledgeStore;
  siteUrl: string;
  siteName?: string;
  port: number;
  host?: string;
  maxPages?: number;
  llm?: LlmProvider | null;
  renderer?: PageRenderer;
  allowPrivateNetworks?: boolean;
  /** Pause between crawler requests (tests use 0). */
  crawlDelayMs?: number;
  onStatus?: (message: string) => void;
}

export interface RunningDemo {
  url: string;
  projectId: string;
  app: FastifyInstance;
  close(): Promise<void>;
}

/** Escape text for use inside an HTML attribute or element. The page is built from query-string values. */
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

/** Only these widget settings may be tried through the demo page's query string. */
const THEME_PARAMS = ["color", "accent", "theme", "position", "title", "greeting"] as const;

function demoPage(projectId: string, siteName: string, siteUrl: string, query: Record<string, string | undefined>): string {
  const attributes = THEME_PARAMS.filter((key) => query[key]).map((key) => ` data-${key}="${escapeHtml(String(query[key]).slice(0, 200))}"`).join("");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>MatrixEye demo: ${escapeHtml(siteName)}</title>
<style>
  body { font: 16px/1.6 system-ui, sans-serif; margin: 0; color: #14202e; background: #f6f1e7; }
  main { max-width: 760px; margin: 0 auto; padding: 48px 20px 120px; }
  img { width: 240px; max-width: 70%; border-radius: 14px; }
  h1 { font-size: 28px; margin: 24px 0 8px; color: #0f2238; }
  code { background: #fff; border: 1px solid #d8cdb8; border-radius: 4px; padding: 1px 6px; }
  pre { background: #fff; border: 1px solid #d8cdb8; border-radius: 8px; padding: 14px; overflow-x: auto; }
  a { color: #0f2238; }
</style>
</head>
<body>
<main>
  <img src="/logo.png" alt="MatrixEye">
  <h1>Chat assistant demo for ${escapeHtml(siteName)}</h1>
  <p>This assistant answers from the content of <a href="${escapeHtml(siteUrl)}" rel="noopener noreferrer" target="_blank">${escapeHtml(siteUrl)}</a>
  and cites the pages it used. Open the chat button at the bottom corner and ask a question.</p>
  <p>To add it to any website, paste this before <code>&lt;/body&gt;</code>:</p>
  <pre>&lt;script src="https://YOUR-HOST/matrix-eye-widget.js" defer
        data-project="${escapeHtml(projectId)}"
        data-api="https://YOUR-API-HOST"&gt;&lt;/script&gt;</pre>
  <p>Try the look: <a href="/?theme=dark">dark</a> · <a href="/?position=left">left side</a> · <a href="/?color=%231b6b4a">green</a> · <a href="/">default</a></p>
</main>
<script src="/widget.js" defer data-project="${escapeHtml(projectId)}" data-api="/" data-open="true"${attributes}></script>
</body>
</html>`;
}

export async function startDemo(options: DemoOptions): Promise<RunningDemo> {
  const { store, siteUrl, port } = options;
  const host = options.host ?? "127.0.0.1";
  const say = options.onStatus ?? (() => undefined);
  const apiKey = randomBytes(24).toString("hex"); // required by the API's config; the demo never uses or prints it

  const config = loadConfig({ MATRIX_EYE_API_KEY: apiKey, MATRIX_EYE_ALLOW_PRIVATE_NETWORKS: String(options.allowPrivateNetworks ?? false), MATRIX_EYE_PUBLIC_RATE_LIMIT_PER_MINUTE: "60" });
  const { app, crawls } = await buildApp({ config, store, llm: options.llm ?? null, renderer: options.renderer, crawlDelayMs: options.crawlDelayMs });

  // The page is served from this same server, so the widget's own origin is the only one that needs access.
  const origins = [`http://localhost:${port}`, `http://127.0.0.1:${port}`];
  const siteName = options.siteName ?? new URL(siteUrl).hostname.replace(/^www\./, "");
  // The project is created through the repository, not over HTTP: Fastify refuses new routes once a request
  // has been injected, and the demo page's routes (below) must be registered first.
  const repos = new Repositories(store.connection);
  const project = repos.createProject({ name: siteName, siteUrl, settings: { allowedOrigins: origins } });

  if (!existsSync(WIDGET_FILE)) throw new Error("The widget is not built yet. Run: npm run build");
  app.get("/", async (request, reply) => reply.type("text/html; charset=utf-8").send(demoPage(project.id, siteName, siteUrl, request.query as Record<string, string | undefined>)));
  // Read per request so rebuilding the widget while the demo runs takes effect on refresh.
  app.get("/widget.js", async (_request, reply) => reply.type("application/javascript; charset=utf-8").header("cache-control", "no-store").send(readFileSync(WIDGET_FILE)));
  app.get("/matrix-eye-widget.js", async (_request, reply) => reply.type("application/javascript; charset=utf-8").send(readFileSync(WIDGET_FILE)));
  app.get("/logo.png", async (_request, reply) => reply.type("image/png").send(readFileSync(LOGO_FILE)));

  say(`Reading ${siteUrl} (up to ${options.maxPages ?? 50} pages)...`);
  const job = crawls.start(project, { maxPages: options.maxPages ?? 50 });
  await crawls.waitFor(job.id);
  const finished = repos.getJob(job.id);
  if (!finished || finished.status !== "completed") {
    await app.close();
    throw new Error(`The crawl failed: ${finished?.error ?? "unknown error"}`);
  }
  say(`Indexed ${finished.pagesIndexed} pages (${finished.chunksWritten} passages).${finished.pagesIndexed === 0 ? " Nothing was readable. If the site is built with React or Vue, add --render." : ""}${finished.reachedPageLimit ? " The site has more pages than the limit." : ""}`);

  await app.listen({ port, host });
  const address = app.server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  return { url: `http://${host === "0.0.0.0" ? "localhost" : host}:${actualPort}`, projectId: project.id, app, close: () => app.close() };
}
