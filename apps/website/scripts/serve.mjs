/**
 * A tiny static server for the built site (dist/) that behaves like production: same security headers, same caching,
 * directory URLs, the real 404 page. Used by the browser tests and for checking a build by hand:
 *
 *   npm run serve --workspace @matrix-eye/website          (serves http://localhost:4400)
 *
 * It is NOT meant for hosting. It exists so the site is tested with its production headers rather than without.
 */
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { cacheControlFor, securityHeaders } from "./headers.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = join(here, "..", "dist");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
  ".pagefind": "application/octet-stream",
  ".pf_meta": "application/octet-stream",
  ".pf_index": "application/octet-stream",
  ".pf_fragment": "application/octet-stream",
};

/**
 * Start the server. `config` replaces /config.json (lets tests point the forms at a test API without rebuilding),
 * and `apiOrigin` is added to the Content-Security-Policy's connect-src, exactly as the deployment does.
 * @param {{ root?: string, port?: number, config?: { apiUrl: string } | null, apiOrigin?: string }} [options]
 * @returns {Promise<{ url: string, port: number, requests: string[], close: () => Promise<void> }>}
 */
export function startServer({ root = DEFAULT_ROOT, port = 0, config = null, apiOrigin = undefined } = {}) {
  const headers = securityHeaders({ apiOrigin });
  const requests = [];

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    requests.push(url.pathname);
    const send = (status, type, body, extra = {}) => {
      res.writeHead(status, { ...headers, "Content-Type": type, ...extra });
      res.end(body);
    };

    if (config && url.pathname === "/config.json") return send(200, TYPES[".json"], JSON.stringify(config), { "Cache-Control": "no-cache" });

    const requested = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, "");
    let file = join(root, requested);
    if (!file.startsWith(root + sep) && file !== root) return send(403, TYPES[".txt"], "Forbidden");
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");

    if (!existsSync(file) || !statSync(file).isFile()) {
      const notFound = join(root, "404.html");
      return existsSync(notFound) ? send(404, TYPES[".html"], readFileSync(notFound)) : send(404, TYPES[".txt"], "Not found");
    }
    res.writeHead(200, { ...headers, "Content-Type": TYPES[extname(file)] ?? "application/octet-stream", "Cache-Control": cacheControlFor(url.pathname) });
    createReadStream(file).pipe(res);
  });

  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => {
      const { port: actual } = server.address();
      resolve({ url: `http://127.0.0.1:${actual}`, port: actual, requests, close: () => new Promise((done) => (server.closeAllConnections(), server.close(done))) });
    });
  });
}

// Run directly: serve the build on a fixed port until stopped.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { url } = await startServer({ port: Number(process.env.PORT ?? 4400) });
  console.log(`Serving the built site at ${url} (Ctrl+C to stop)`);
}
