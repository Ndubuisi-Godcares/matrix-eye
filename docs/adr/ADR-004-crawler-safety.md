# ADR-004: Crawler safety and politeness

- **Status:** accepted
- **Date:** 2026-10-12

## Context

Eagle's Eye fetches URLs supplied by users. That is a server-side request forgery (SSRF) risk, and
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
- `EAGLE_ALLOW_PRIVATE_NETWORKS=true` lifts the guard for trusted development machines only.

**Politeness**

- Obey `robots.txt` (4xx = allowed, 5xx/unreachable = treated as disallowed for the run) and `Crawl-delay`.
- Identify as `EaglesEyeBot` with a documentation URL; low concurrency (2) and a minimum request gap.
- Respect `noindex` and `rel=nofollow`. Strip tracking parameters; de-duplicate by canonical URL.
- Only crawl the site the user supplies (www and bare domain count as one site).
- Product terms must require users to crawl only sites they own or are authorised to index.

**Canonical handling:** a page declaring a different canonical URL is skipped and the canonical URL is
queued, making the stored URL independent of fetch order. A canonical pointing at the site root from a
deeper page is ignored, since sites commonly misconfigure this and honouring it would discard the site.

## Consequences

- Some legitimate private/intranet use cases need the explicit opt-in.
- JavaScript-only pages need the optional Playwright renderer (`render.ts`), which is implemented behind
  an interface but **not yet exercised by automated tests**.
- The `User-Agent` documentation URL must exist before public launch.
