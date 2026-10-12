/**
 * A tiny HTTP server that serves a fixture website from disk, for offline, deterministic tests.
 *
 * Fixture layout (under packages/testing/fixtures/<site>/):
 *   layout.html       shared page chrome (cookie banner, nav, footer) with {{TITLE}} {{HEAD}} {{BODY}}
 *   pages/<path>.html page body; leading HTML comments set metadata:
 *                       <!-- title: Some title -->     page title
 *                       <!-- canonical: /other -->     emits <link rel="canonical">
 *                       <!-- noindex -->               emits <meta name="robots" content="noindex">
 *   robots.txt, sitemap.xml   served as-is, with {{BASE}} replaced by the server's URL
 *
 * Besides the site, the server exposes /_test/* endpoints that simulate hostile or awkward
 * servers (redirects to private addresses, huge bodies, binary files, JavaScript-only pages).
 */
import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { dirname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const FIXTURES_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");

export interface FixtureServer {
  /** e.g. http://127.0.0.1:54321 */
  baseUrl: string;
  /** Request paths received, in order (lets tests assert what the crawler did and did not fetch). */
  requests: string[];
  close(): Promise<void>;
}

function directive(source: string, name: string): string | null {
  const match = new RegExp(`<!--\\s*${name}\\s*:\\s*(.*?)\\s*-->`).exec(source);
  return match?.[1] ?? null;
}

export async function startFixtureServer(site = "education-demo"): Promise<FixtureServer> {
  const siteDir = join(FIXTURES_ROOT, site);
  const layout = await readFile(join(siteDir, "layout.html"), "utf8");
  const requests: string[] = [];
  let baseUrl = "";

  const server: Server = createServer(async (req, res) => {
    const path = decodeURIComponent((req.url ?? "/").split("?")[0] ?? "/");
    requests.push(path);

    try {
      // --- hostile / awkward behaviours used by crawler tests ---------------------------
      if (path === "/_test/redirect-private") {
        res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/" }).end();
        return;
      }
      if (path === "/_test/huge") {
        res.writeHead(200, { "content-type": "text/html" });
        const block = "a".repeat(64 * 1024);
        for (let i = 0; i < 100 && !res.destroyed; i++) res.write(block);
        res.end();
        return;
      }
      if (path === "/_test/binary") {
        res.writeHead(200, { "content-type": "image/png" }).end(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
        return;
      }
      // Empty HTML shell whose content only exists after JavaScript runs, like a React single-page app.
      if (path === "/_test/spa-rendered") {
        const script = `document.getElementById('root').innerHTML = '<main><h1>Rendered Page</h1><p>' + 'This sentence exists only after JavaScript runs in a real browser. '.repeat(6) + '</p><a href="/about">About</a></main>';`;
        res.writeHead(200, { "content-type": "text/html" }).end(`<html><head><title>Rendered</title></head><body><div id="root"></div><script>${script}</script></body></html>`);
        return;
      }
      if (path === "/_test/spa") {
        res.writeHead(200, { "content-type": "text/html" }).end('<html><head><title>App</title></head><body><div id="root"></div><script>/* renders later */</script></body></html>');
        return;
      }

      // --- static fixture files ---------------------------------------------------------
      if (path === "/robots.txt" || path === "/sitemap.xml") {
        const raw = await readFile(join(siteDir, path.slice(1)), "utf8");
        res.writeHead(200, { "content-type": path.endsWith(".xml") ? "application/xml" : "text/plain" }).end(raw.replaceAll("{{BASE}}", baseUrl));
        return;
      }

      const relative = normalize(path === "/" ? "index" : path.replace(/^\/+|\/+$/g, ""));
      // Guard against path traversal even though this is a test server.
      if (relative.startsWith("..")) {
        res.writeHead(400).end();
        return;
      }
      const body = await readFile(join(siteDir, "pages", `${relative}.html`), "utf8");
      const title = directive(body, "title") ?? "Untitled";
      const canonical = directive(body, "canonical");
      const head = [canonical ? `<link rel="canonical" href="${baseUrl}${canonical}">` : "", /<!--\s*noindex\s*-->/.test(body) ? '<meta name="robots" content="noindex">' : ""].join("\n");
      const html = layout.replace("{{TITLE}}", title).replace("{{HEAD}}", head).replace("{{BODY}}", body);
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(html);
    } catch {
      res.writeHead(404, { "content-type": "text/html" }).end("<html><body><h1>Not found</h1></body></html>");
    }
  });

  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  return {
    baseUrl,
    requests,
    close: () =>
      new Promise<void>((ok, fail) => {
        server.closeAllConnections();
        server.close((err) => (err ? fail(err) : ok()));
      }),
  };
}
