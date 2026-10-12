# ADR-007: Marketing and documentation website

- **Status:** accepted
- **Date:** 2026-10-12

## Context

The commercial goal needs a professional public site: explain the product, publish the documentation, collect early-access
interest. It must be trustworthy for a product whose pitch is honesty, so it cannot overclaim, and it should be cheap and
safe to run before there is a hosted service.

## Decisions

**Static site with Astro.** Pages are built ahead of time. No server to run or patch; fast by default; hosts anywhere.
Documentation is the repository's own `/docs` Markdown, read at build time, so the docs on GitHub and on the site cannot
drift apart. Titles and ordering live in one manifest (`src/data/docs.ts`).

**Strict Content-Security-Policy, nothing third-party.** Fonts are self-hosted, there are no analytics or tracking scripts,
and no inline scripts. One header definition (`scripts/headers.mjs`) feeds both the test server and `vercel.json`, and a test
fails if they differ, so what is tested is what is deployed.

**Search in the browser.** Pagefind builds an index at build time; no search service, no queries sent anywhere. If the
index is missing the search box is hidden rather than shown broken.

**Forms go to our own API.** Waitlist and contact use consent checkboxes, a hidden spam-trap field, an allow-list of site
origins and a per-visitor rate limit. A repeat sign-up looks identical to a first one so the list cannot be probed. Entries
can be exported (CSV) and erased by the owner.

**Honest content.** Prices are marked as estimates; legal pages are marked drafts and kept out of search; the security page
lists what has not been done (no outside audit); comparisons describe patterns, not named competitors.

**Accessibility is tested, not assumed.** axe-core runs on every page in light and dark; keyboard behaviour (skip link, menu,
tabs, search, theme) is tested in a real browser. Automated checks do not replace testing with a screen reader (still owed).

## Consequences

- Hosting cost is near zero until the hosted service exists.
- Changing a domain or the API address means rebuilding and regenerating `vercel.json`.
- The forms need the API running; without it the site says so plainly instead of pretending to succeed.
