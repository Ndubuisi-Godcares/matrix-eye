/**
 * Sitemap discovery.
 *
 * Sitemaps list pages that may not be reachable by following links, so they make crawls
 * more complete. Supports both <urlset> files and <sitemapindex> files that point at
 * further sitemaps. Compressed (.gz) sitemaps are not supported yet and are skipped.
 */
import * as cheerio from "cheerio";
import type { HttpFetcher } from "./fetcher";

export interface SitemapOptions {
  /** Stop collecting after this many page URLs. */
  limit: number;
  /** How many levels of sitemap-index nesting to follow. */
  maxDepth?: number;
}

/** Collect page URLs from the given sitemap URLs. Failures are ignored: sitemaps are best-effort. */
export async function collectSitemapUrls(sitemapUrls: string[], fetcher: HttpFetcher, options: SitemapOptions): Promise<string[]> {
  const pages: string[] = [];
  const visited = new Set<string>();
  const maxDepth = options.maxDepth ?? 2;

  async function visit(url: string, depth: number): Promise<void> {
    if (pages.length >= options.limit || visited.has(url) || url.endsWith(".gz")) return;
    visited.add(url);

    let body: string;
    try {
      const doc = await fetcher.get(url);
      if (doc.status !== 200) return;
      body = doc.body;
    } catch {
      return;
    }

    const $ = cheerio.load(body, { xml: true });
    // A sitemap index lists other sitemaps.
    const children = $("sitemap > loc")
      .map((_, el) => $(el).text().trim())
      .get();
    if (children.length > 0 && depth < maxDepth) {
      for (const child of children) await visit(child, depth + 1);
      return;
    }
    for (const el of $("url > loc").toArray()) {
      if (pages.length >= options.limit) break;
      const loc = $(el).text().trim();
      if (loc) pages.push(loc);
    }
  }

  for (const url of sitemapUrls) await visit(url, 0);
  return pages;
}
