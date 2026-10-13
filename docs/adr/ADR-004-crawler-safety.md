# ADR-004: Crawler safety and politeness

- **Status:** accepted
- **Date:** 2026-10-12

## Context

MatrixEye fetches URLs supplied by users. That is a server-side request forgery (SSRF) risk, and
crawling other people's sites carries ethical and legal expectations.

## Decision

**Safety**

- Reject non-http(s) schemes, `localhost`/`.internal`/`.local` hosts and private IP literals up front.
- Re-check the **resolved IP at connection time** with a guarded `undici` dispatcher, which closes the
  DNS-rebinding gap. It applies to every redirect hop, because each hop reconnects. Blocked ranges
  include loopback, RFC 1918, link-local (cloud metadata `169.254.169.254`), CGNAT, multicast, IPv6
  unique-local/link-local and IPv4-mapped IPv6.
- Redirects are followed manually (max 5), each re-validated and required to stay on the same site.
- Responses are streamed with a **hard size cap** (2 MB) and a request timeout; binary types are not
  downloaded.
- `MATRIX_EYE_ALLOW_PRIVATE_NETWORKS=true` lifts the guard for trusted development machines only.

**Politeness**

- Obey `robots.txt` (4xx = allowed, 5xx/unreachable = treated as disallowed for the run) and `Crawl-delay`.
- Identify as `MatrixEyeBot` with a documentation URL; low concurrency (2) and a minimum request gap.
- Respect `noindex` and `rel=nofollow`. Strip tracking parameters; de-duplicate by canonical URL.
- Only crawl the site the user supplies (www and bare domain count as one site).
- Product terms must require users to crawl only sites they own or are authorised to index.

**Canonical handling:** a page declaring a different canonical URL is skipped and the canonical URL is
queued, making the stored URL independent of fetch order. A canonical pointing at the site root from a
deeper page is ignored, since sites commonly misconfigure this and honouring it would discard the site.

## Consequences

- Some legitimate private/intranet use cases need the explicit opt-in.
- JavaScript-only pages need the optional Playwright renderer (`--render`, `render.ts`); see below.
- The `User-Agent` documentation URL must exist before public launch.

## Rendering JavaScript sites (`--render`)

Single-page apps send an empty HTML shell, so there is nothing to read until a browser runs the page.
`--render` starts headless Chromium (Playwright, an *optional* dependency plus a one-time ~120 MB browser
download) and uses it only for pages whose plain HTML has almost no text.

A browser runs the page's own JavaScript, which can request any URL, so **every request the browser makes is
intercepted** (`createRequestGuard`): non-web schemes, localhost, private and link-local addresses and
unresolvable hosts are refused; images, media and fonts are blocked for speed; service workers are disabled;
each page gets an isolated context. Known limit: the browser resolves DNS itself, so a hostile DNS server could
rebind between our check and the connection. For the hosted service, run rendering inside a network-isolated
sandbox. Verified on a real React site (aiit.network): 15 pages and 159 passages in 38 s, none before.

## Crawl determinism and loop-safety (found on real sites)

- Downloads run in parallel but duplicate/new-link decisions are made **in queue order**, so identical content
  at several URLs always resolves the same way and re-crawls stay incremental.
- A canonical tag that differs only by `www.` or `http`/`https` is the same page (sites redirect one way and
  declare the other, which would otherwise loop).
- URLs with query strings are visited last and dropped when their content duplicates a plain URL.
- Total fetch attempts are capped (4x the page limit, minimum 40) so a site where most URLs are skipped
  cannot trigger hundreds of slow renders.
