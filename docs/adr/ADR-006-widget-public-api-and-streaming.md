# ADR-006: Widget, public API and streaming

- **Status:** accepted
- **Date:** 2026-10-12

## Context

Phase 2 puts Eagle's Eye in front of website visitors. A web page cannot keep a secret, so the admin API key can never
be used there. The widget runs inside someone else's page, so it must be small, isolated, accessible and safe against
hostile content. Answers take seconds with a local model, so waiting for the whole answer feels broken.

## Decisions

**Public endpoints without a key.** `/v1/public/projects/:id/...` offers only chat, streaming, feedback and display
settings. Protection is layered:

1. The project id is an unguessable UUID.
2. **Origin allow-list per project**, closed by default. Enforced in the handler and in CORS (including preflight).
3. **Per-visitor, per-project rate limit** on chat routes.
4. No admin capability is reachable (crawl, rules, other projects return 404).

Honest limit: the `Origin` header is set by browsers, so this stops *other websites* embedding your assistant but cannot
stop a script outside a browser from calling the endpoints. The rate limit is the control for that; per-key quotas and
billing limits come with the hosted service. This is stated in the docs rather than glossed over.

**Streaming is provisional, the final event is authoritative.** The engine streams the model's tokens as they arrive but
validates the *complete* answer (citations, figures) before trusting it. Showing tokens immediately gives a responsive
feel; the closing `final` event replaces them, so an unsafe answer (e.g. an invented price) is corrected on screen. The
alternative, buffering everything until validation, would remove the benefit of streaming. A test pins the behaviour:
a streamed invented figure is replaced by the grounded answer.

**Server-sent events, not WebSockets.** One-way, works through ordinary HTTP infrastructure, trivial to parse, and
the browser's `fetch` streams it. The SDK uses `fetch` rather than `EventSource` because the request is a POST.
Keep-alive comments cover cold model loads; closing the connection aborts generation.

**A web component in a Shadow DOM.** Style isolation is bidirectional, it works on any stack, and it needs no framework.
Host-page rules that inherit into the shadow tree (e.g. `* { text-transform: uppercase !important }`) are neutralised
with `all: initial` on the widget root; a browser test proves a hostile host stylesheet changes nothing.

**Safe rendering by construction.** Answer text is never parsed as HTML: only `textContent` and `createElement`.
Formatting is a tiny whitelist (paragraphs, lists, bold, citation markers). Links exist only for http(s) URLs.
Tests feed script tags, event-handler attributes, `javascript:` URLs and escaped entities and assert they stay inert text.

**Accessibility as a gate.** The browser suite runs axe-core (WCAG 2.1 A/AA and best practices) on light, dark and
custom-colour themes with an answer on screen. Choices that came from it: the transcript is `aria-live="off"` and one
hidden polite region announces the finished answer (a live transcript would read every streamed fragment); text colour
on a customer's brand colour is computed to meet 4.5:1 (white, then navy, then black). Automated tools find only part of
the problems; manual screen-reader testing remains a pre-launch task.

**Size budget.** The script-tag bundle must stay under 30 KB gzipped (currently about 10 KB); the build fails otherwise.
Third-party code on a customer's page has to be light.

**Self-contained SDK.** It carries its own types (no private imports) so it can be published alone, has no runtime
dependencies, and is tested against the real server over HTTP, including crawl and streaming, and via its built ES/CJS
output.

**SSR-safe React wrapper.** The widget code is imported inside an effect, so Next.js can import and server-render the
component; the widget module itself also loads on a server (it only defines the element in a browser). A Node-environment
test renders it with `renderToString`.

## Consequences

- Customers must list their website's origin before the widget works. That is deliberate (secure by default), and a
  clear console warning and an in-widget message explain it when forgotten.
- Visitors can briefly see model text that is later replaced. Acceptable; the final answer is always the checked one.
- Phase 4 adds per-project keys, quotas and billing on the same routes.
- Not yet done: real screen-reader testing, translations beyond overriding `labels`, and a published npm/CDN release
  (the `eagleseye.ai` addresses in the branding link and crawler user-agent are placeholders until the domain is chosen).
