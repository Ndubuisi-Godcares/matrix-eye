/**
 * robots.txt handling.
 *
 * We obey robots.txt: it is the web's standing agreement about what automated visitors may
 * read. Rules follow the same conventions as major crawlers:
 *  - missing file (404 and other 4xx)  -> everything is allowed
 *  - server error or unreachable        -> treated as "disallow all" for this run, because
 *                                          guessing "allowed" could violate the owner's wishes
 */
import robotsParser from "robots-parser";
import { EagleError } from "@eagles-eye/core";
import type { HttpFetcher } from "./fetcher";

export class RobotsPolicy {
  private constructor(
    private readonly parser: ReturnType<typeof robotsParser> | null,
    private readonly userAgent: string,
    /** True when robots.txt could not be fetched reliably, so nothing may be crawled. */
    readonly denyAll: boolean,
  ) {}

  /** Fetch and parse robots.txt for the origin of `siteUrl`. */
  static async load(siteUrl: string, fetcher: HttpFetcher, userAgent: string): Promise<RobotsPolicy> {
    const robotsUrl = new URL("/robots.txt", siteUrl).toString();
    try {
      const doc = await fetcher.get(robotsUrl);
      if (doc.status >= 500) return new RobotsPolicy(null, userAgent, true);
      if (doc.status >= 400) return new RobotsPolicy(null, userAgent, false); // no robots.txt: allowed
      return new RobotsPolicy(robotsParser(robotsUrl, doc.body), userAgent, false);
    } catch (err) {
      // Safety violations (SSRF) must propagate; plain network failures mean "be cautious".
      if (err instanceof EagleError && err.code === "blocked_url") throw err;
      return new RobotsPolicy(null, userAgent, true);
    }
  }

  isAllowed(url: string): boolean {
    if (this.denyAll) return false;
    if (!this.parser) return true;
    return this.parser.isAllowed(url, this.userAgent) !== false;
  }

  /** Seconds the site asks crawlers to wait between requests, if specified. */
  crawlDelaySeconds(): number | undefined {
    return this.parser?.getCrawlDelay(this.userAgent);
  }

  /** Sitemap URLs declared in robots.txt. */
  sitemaps(): string[] {
    return this.parser?.getSitemaps() ?? [];
  }
}
