/**
 * URL normalisation and scoping rules.
 *
 * Two URLs that point at the same page must normalise to the same string, otherwise the
 * crawler fetches and indexes duplicates. Normalisation is intentionally conservative:
 * it never changes which resource is addressed, only removes noise.
 */

/** Query parameters that only carry tracking information. */
const TRACKING_PARAM = /^(utm_[a-z]+|fbclid|gclid|msclkid|mc_cid|mc_eid|_ga|ref|ref_src)$/i;

/** File types that are never HTML pages. Skipping by extension saves a request. */
const NON_PAGE_EXTENSION =
  /\.(?:png|jpe?g|gif|webp|svg|ico|bmp|avif|pdf|docx?|xlsx?|pptx?|zip|gz|tar|rar|7z|mp3|mp4|webm|mov|avi|wav|woff2?|ttf|eot|css|js|mjs|json|xml|rss|atom|exe|dmg|apk)$/i;

/**
 * Resolve `input` (optionally relative to `base`) into a canonical absolute http(s) URL.
 * Returns `null` for anything that is not a crawlable web address.
 */
export function normalizeUrl(input: string, base?: string): string | null {
  let url: URL;
  try {
    url = new URL(input, base);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  url.hash = "";
  url.username = "";
  url.password = "";

  // Drop tracking parameters and sort the rest so parameter order cannot create duplicates.
  const kept = [...url.searchParams.entries()].filter(([key]) => !TRACKING_PARAM.test(key));
  kept.sort(([a], [b]) => a.localeCompare(b));
  url.search = "";
  for (const [key, value] of kept) url.searchParams.append(key, value);

  // "/about/" and "/about" are treated as one page. The root path keeps its slash.
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.replace(/\/+$/, "");
  }
  return url.toString();
}

/** True when the path looks like a binary/asset file rather than a page. */
export function hasNonPageExtension(url: string): boolean {
  try {
    return NON_PAGE_EXTENSION.test(new URL(url).pathname);
  } catch {
    return true;
  }
}

/** Host without a leading "www." so example.com and www.example.com count as one site. */
function siteHost(url: string): string {
  return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
}

/** Whether two URLs belong to the same website (ignoring a leading "www."). */
export function isSameSite(a: string, b: string): boolean {
  try {
    return siteHost(a) === siteHost(b);
  } catch {
    return false;
  }
}

/**
 * True when two URLs are the same page apart from `www.` and http/https. Sites routinely redirect
 * example.com to www.example.com while their canonical tags name the other form; treating those as
 * different pages sends a crawler in circles.
 */
export function isSameResource(a: string, b: string): boolean {
  const key = (value: string) => {
    const normalised = normalizeUrl(value);
    if (!normalised) return null;
    const u = new URL(normalised);
    return `${u.hostname.replace(/^www\./, "")}${u.port}${u.pathname}${u.search}`;
  };
  const ka = key(a);
  return ka !== null && ka === key(b);
}
