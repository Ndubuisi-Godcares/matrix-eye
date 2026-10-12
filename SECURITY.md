# Security policy

## Reporting a vulnerability

Please report security issues privately to the maintainers (contact address to be published before the
public release). Do not open a public issue for an unpatched vulnerability. Include steps to reproduce and
the impact. We aim to acknowledge reports within 3 working days.

## Threat model (summary)

Matrix Eye fetches user-supplied URLs and feeds third-party text to a language model, so the main risks are:

| Risk | Mitigation | Where |
|---|---|---|
| Server-side request forgery via crawl URLs or redirects | Pre-flight URL checks, connection-time IP validation (DNS rebinding), per-hop redirect checks | `packages/crawler/src/ssrf.ts`, ADR-004 |
| Resource exhaustion from huge or endless responses | Streaming size cap, timeouts, page and depth limits, low concurrency | `fetcher.ts`, `crawler.ts` |
| Prompt injection from page content | Instruction-like text dropped at extraction, source fencing, output validation, evaluation gate | ADR-003 |
| Hostile pages planting fake contact details | Contacts read only from filtered text | `extract.ts` |
| Hallucinated prices, dates or contacts | Deterministic facts, figure validation, extractive fallback | `validate.ts`, `facts.ts` |
| Unauthorised API use | Bearer key with constant-time comparison, rate limiting, CORS allow-list, 100 KB body limit | `apps/api` |
| Leaking internals in errors | Uniform error format; unexpected errors return a generic message and are logged server-side | `apps/api/src/app.ts` |
| Over-broad crawling | robots.txt, noindex, Crawl-delay, identified user-agent, same-site only | ADR-004 |

## Known gaps (tracked for later phases)

- Prompt-injection filtering is heuristic and will not catch every phrasing.
- Single shared API key; per-project keys and key rotation arrive with the hosted service.
- User-supplied rule patterns are length-limited but not checked for pathological backtracking.
- No third-party security audit yet (planned before public beta).
- The `User-Agent` documentation URL (`matrixeye.ai/bot`) must be live before public use.
