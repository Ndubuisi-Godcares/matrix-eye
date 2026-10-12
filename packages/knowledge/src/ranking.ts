/**
 * Page-level ranking signals that come from a page's address rather than its text.
 *
 * Keyword relevance (BM25) judges words in a passage. It cannot tell an official "How to apply"
 * page from a 2015 magazine article that happens to mention applying. Two cheap, widely valid
 * signals help:
 *
 *  - URL words: a page living at /admission-aid/how-to-apply is about applying, whatever its text says.
 *  - Authority prior: pages near the site root are usually the canonical reference, while deep news,
 *    blog and archive pages are usually incidental. The prior is a gentle multiplier, never a filter.
 */

/** Path segments that mark time-bound or incidental content (news, blog posts, archives). */
const LOW_AUTHORITY_SEGMENTS = new Set(["news", "blog", "blogs", "article", "articles", "magazine", "story", "stories", "press", "archive", "archives", "events", "event", "posts", "post", "podcast", "videos", "gallery"]);

function pathSegments(url: string): string[] {
  try {
    return new URL(url).pathname.split("/").filter(Boolean);
  } catch {
    return [];
  }
}

/** The words in a URL's path ("/admission-aid/how-to-apply.html" -> "admission aid how to apply"), for indexing. */
export function urlWords(url: string): string {
  return pathSegments(url)
    .join(" ")
    .replace(/\.(html?|php|aspx?)$/i, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Multiplier in (0, 1]: shallow, evergreen pages score highest. */
export function pagePrior(url: string): number {
  const segments = pathSegments(url);
  // Each level below the first costs 7%; the first level is free (a top-level section is authoritative).
  let prior = 1 / (1 + 0.07 * Math.max(0, segments.length - 1));
  if (segments.some((s) => LOW_AUTHORITY_SEGMENTS.has(s.toLowerCase()))) prior *= 0.75;
  if (url.includes("?")) prior *= 0.85; // filtered and paginated variants of a listing page
  return prior;
}
