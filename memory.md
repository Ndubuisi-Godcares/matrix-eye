# MatrixEye: project memory (handover document)

> **For a new Claude Code session:** read this whole file before planning or changing code. It is the authoritative
> handover, written to be **self-contained**: a fresh session (including one started after a conversation reset, or on a
> different Claude account/machine with this same repo) should be able to pick up exactly where the last one left off using
> only this file, `CLAUDE.md`, and the source tree — nothing else is needed and nothing important lives only in chat history.
> Section 11 says exactly where work stopped; section 9 says what was and was not verified; section 3 is the full project
> topology (directory map + architecture) if you need to re-orient.
> Last audit: **2026-10-25**. Last pushed commit: `3702f26` (memory/CLAUDE.md continuity hardening, 2026-10-19). **This
> session made real code changes to the Home page and shared styles (Home hero/header restyle: fonts, sizing, the early-access
> label, header icon order) that are, as of this audit, still uncommitted in the working tree** — see section 11 for exactly
> what and section 9 for what was verified.
> Legend: **VERIFIED** = checked in code or by running something this audit; **REPORTED** = established earlier in the
> project's conversation history and not re-checked; **UNVERIFIED/UNKNOWN** = not checked.

---

## 1. Project identity and overview

- **Name:** MatrixEye (one word in prose and UI; `matrix-eye` in package/file/repo names). Renamed on 2026-10-12 from
  "Eagle's Eye" (REPORTED). The local folder was `eagle-eye` and is now `matrix-eye` (VERIFIED: working directory).
- **What it is:** a *website intelligence* product. It crawls a website, indexes it, and answers visitors' questions in an
  embeddable chat widget with a citation to the page behind every answer, and **abstains** ("I couldn't find that") when
  the site does not cover the question.
- **Target users:** owners/developers of content-heavy sites (the test site and first market idea are education websites),
  agencies adding assistants to client sites.
- **Value proposition:** answers grounded only in the customer's own pages, checked (citations, figures), self-hostable,
  honest about limits. The commercial hypothesis (a paying market for this) is **unproven**; the plan is to put the
  waitlist in front of real people before building the hosted service.
- **Licence:** Apache-2.0 (decision D2). **Language:** English only measured.
- **Journeys:** (a) owner: crawl a site -> add one `<script>` tag -> visitors chat; (b) developer: use the TypeScript SDK /
  React component / HTTP API; (c) prospect: reads marketing site/docs -> joins waitlist or contacts.
- **Stage:** Phases 1-3 done (engine; SDK/widget/streaming/API; marketing + docs website), deployed to Vercel (owner
  confirmed working, 2026-10-13). **Phase 4 (hosted backend, dashboard, billing) underway:** plan written (ADR-008,
  `docs/planning/Phase4-Plan.md`); M1 (accounts/control-plane) implemented in code, 2026-10-13, uncommitted, no real
  Supabase project yet; M2-M5 not started.
- **Project-wide constraints (from the owner, REPORTED):** act as a senior developer (clean file organisation, code
  comments); user works in VS Code on Windows; PDFs use the **Yu Mincho** font; be honest about limits (eval numbers are a
  regression baseline, not real-world proof); confirm before pushing to a *new* destination; no secrets in git.
- **Open owner decisions:** D5-D7 **resolved 2026-10-13** (self-hosted Ollama for hosted inference; budget under
  $25/month; near full-time hours — see ADR-008 and `docs/planning/Phase4-Plan.md`). Still open: domain; legal entity +
  public contact email; lawyer review of privacy/terms; pricing validation; hosting account (Supabase + VPS, not yet
  provisioned).

## 2. Technology stack

| Area | Verified facts |
|---|---|
| Runtime | Node 24 (`engines >=24`, `.nvmrc`=24; local v24.21.0). ESM everywhere. |
| Monorepo | npm workspaces (`packages/*`, `apps/*`, `evals`), TypeScript 5.9.3, tsx, esbuild. |
| Tests | vitest 5.0.3 (448 tests / 35 files at last full run), Playwright (Chromium) for browser tests, jsdom, axe-core. |
| API | Fastify 5.12.5 + `@fastify/cors`, `@fastify/rate-limit`, zod. |
| Storage | `node:sqlite` (built-in): FTS5 with BM25 and Porter tokenizer. SQLite file; no external DB. |
| Crawler | undici, cheerio, robots-parser; optional Playwright render mode (`--render`). |
| LLM | Provider-agnostic OpenAI-compatible client; **Ollama** auto-detected locally (`qwen3:4b-instruct` recommended; thinking/embedding models skipped). Extractive mode (no model) is the default fallback. |
| Widget | Plain TS web component, esbuild bundle (~10.3 KB gzipped, CI budget 30 KB), SSE streaming. React wrapper `@matrix-eye/widget-react`. |
| Website | Astro 7.3.8 (static), Sätteri Markdown processor, Shiki, Pagefind search, sharp (image assets), self-hosted variable fonts (Inter, JetBrains Mono; Fraunces removed 2026-10-25, see 7/11). |
| Hosting | **None live.** Vercel project import attempted (Hobby plan, from the personal GitHub repo). Intended: static site on Vercel; API needs a long-running host (Phase 4). |
| CI | `.github/workflows/ci.yml` (ubuntu-24.04): `npm ci`, install Chromium, typecheck, build, test, eval gate `--gate`, upload eval report, `npm audit --omit=dev --audit-level=high`. CI was confirmed green at `1423d2d` (Phase 3 push) earlier in the project; **not checked for any later commit** (`gh run list --limit 1` to check). |
| Auth | Admin API: single Bearer key (`MATRIX_EYE_API_KEY`). Public widget/forms endpoints: no key, protected by per-project origin allow-list, rate limits. **No user accounts, roles, sessions, payments, email or analytics exist.** |

## 3. Architecture and directory map

```
matrix-eye/
  package.json, tsconfig*.json, vitest.config.ts   root scripts; vitest includes packages/*/test, apps/*/test, evals/test
  vercel.json                  Vercel build for a project rooted at the repo root (generated; see website section)
  .env / .env.example          local settings (.env is git-ignored; contains the owner's local key, never print it)
  brand/                       matrix-eye-logo.png (original, neon on black), matrix-eye-emblem.png (generated, transparent)
  docs/                        public docs (published on the site), adr/ (ADR-001..007), guides/ (command-guide PDF), planning/ (historical PDFs, still say "Eagle's Eye" on purpose)
  evals/                       answer-quality harness (src/run.ts, score.ts; datasets/education-demo.json); gate in CI
  examples/                    sample integrations (not audited in detail: UNVERIFIED)
  data/                        local SQLite files (git-ignored)
  packages/core/               shared types, errors (MatrixError), text utils, ANSWER_DEFAULTS tuning
  packages/crawler/            fetcher, robots, sitemap, SSRF guard (ssrf.ts), url normalisation, extract (injection-text removal), optional render
  packages/knowledge/          SqliteKnowledgeStore (pages/chunks/chunks_fts/facts), chunker, ranking
  packages/llm/                OpenAiCompatibleProvider, reasoning-leak filter, scripted test provider, detect.ts (Ollama auto-detect, resolveLocalModel)
  packages/engine/             ConversationEngine: rules -> smalltalk -> facts(contact) -> overview -> retrieve -> gates -> LLM/extractive -> validate; ingest.ts
  packages/sdk/                MatrixEyeClient (admin) + PublicClient (visitor), SSE parser, MatrixEyeError
  packages/widget/             <matrix-eye-chat> custom element + MatrixEye.init + script-tag auto-mount; styles.ts, render.ts (safe markdown), colors.ts
  packages/widget-react/       MatrixEyeChat React component (SSR-safe)
  packages/testing/            fixture website server + fixtures for offline tests
  apps/api/                    Fastify server (app.ts routes, config.ts env, repositories.ts SQLite tables, crawl-runner.ts, auth.ts, schemas.ts)
  apps/cli/                    `npm run matrix -- <crawl|ask|chat|search|pages|llm-check>` (own DB ./data/matrix-eye-cli.sqlite)
  apps/demo/                   `npm run demo -- <url>`: crawl a site + serve a page with the real widget on :8788
  apps/website/                the marketing/docs site (section 4/7)
```

Critical entry points: `apps/api/src/server.ts` (boots API), `apps/api/src/app.ts` (`buildApp`), `packages/engine/src/engine.ts`,
`packages/widget/src/widget.ts` (635 lines, UI logic), `apps/website/src/layouts/Base.astro`, `apps/website/src/styles/global.css`.

**Engine pipeline (VERIFIED in engine.ts header + tests):** configured rule -> contact question from extracted facts ->
retrieval (BM25 over 4 lists fused with RRF, authority prior, URL words, synonyms) -> coverage + key-term gates -> model
(or extractive) -> validation (citations must exist; numbers/figures must appear in page text; else repair or extractive
fallback). Streaming: tokens are provisional; the final event is authoritative.

**Data flow:** crawl (robots/sitemap, SSRF-guarded) -> extract (strip nav, injection-like text) -> chunk with heading path ->
SQLite FTS5. Visitor question -> widget -> `/v1/public/projects/:id/chat[/stream]` -> engine -> cited answer.

## 4. Website pages and routing (`apps/website/src/pages`)

All pages are static (built ahead of time); status for each is **VERIFIED built** (24 pages) and covered by the static
test suite. `trailingSlash: always`.

| Route | Purpose | Notes / status |
|---|---|---|
| `/` | Home: hero (eyebrow label, gradient headline, feature tiles, CTA, stack row, animated scene), "why", "how", code tabs, FAQ, CTA | **Font/sizing/copy restyle done 2026-10-25, uncommitted** (see 11) |
| `/product/` | The four stages, "where it runs" table, comparison table (generic, no competitor names), honest limits | done |
| `/pricing/` | Plans (Community Free; Developer Pro $19-$39 est.; Business Hosted $49-$149 est.; Private custom) + FAQ + FAQPage JSON-LD | prices are **unvalidated estimates**, labelled as such |
| `/security/` | Honest security posture incl. gaps (no outside audit) | done |
| `/bot/` | Crawler (`MatrixEyeBot`) info for site owners | done |
| `/privacy/`, `/terms/` | **Drafts with bracketed placeholders**, `noindex`, excluded from sitemap | need lawyer + legal entity |
| `/contact/`, `/waitlist/` | Forms -> API `POST /v1/public/contact|waitlist` | work end to end locally; **live site has no API** |
| `/docs/`, `/docs/<slug>/` | 9 docs from `/docs/*.md` via content collection (manifest `src/data/docs.ts`) + Pagefind search | done |
| `/guides/`, `/guides/<slug>/` | 3 guides in `src/content/guides` | done |
| `/404.html`, `/config.json` (runtime API URL from `PUBLIC_API_URL`), `/rss.xml`, sitemap | | done |

Layout: `layouts/Base.astro` (SEO, JSON-LD, skip link, header/footer), `layouts/Docs.astro` (3-column docs with search,
TOC with scroll-spy). Nav: Home, Product, Docs, Pricing, Guides, Security; logo left / nav centred / theme toggle + CTA right.

## 5. Feature implementation registry

| Feature | Files | Status | Verified / notes |
|---|---|---|---|
| Crawler (robots, sitemap, dedupe, change detection, SSRF guard, render mode) | `packages/crawler` | complete | tests pass; real-site check on Reed College (REPORTED) |
| Knowledge store (FTS5/BM25) | `packages/knowledge` | complete | tests pass |
| Conversation engine + abstention | `packages/engine` | complete | tests + eval gate pass (this audit: `npm run eval -- --gate` earlier today: "All Phase 1 targets met") |
| LLM provider + Ollama auto-detect | `packages/llm` | complete | unit tests; real-model run REPORTED (97.4% correctness on 48 Qs with Qwen3 4B Instruct) |
| Admin REST API | `apps/api/src/app.ts` | complete for local use | tests pass; Bearer key; no multi-tenant accounts |
| Public widget API + streaming | same | complete | origin allow-list (closed by default), CORS delegator, per-visitor rate limit; honest limit: `Origin` can be forged outside browsers |
| Website forms API (waitlist, contact) + owner export | same, `repositories.ts` | complete | honeypot, consent literal, `MATRIX_EYE_SITE_ORIGINS`, form rate limit; E2E browser test passes |
| TypeScript SDK | `packages/sdk` | complete | integration test passes |
| Chat widget + React wrapper | `packages/widget*` | complete | jsdom + real-browser tests pass; a11y reviewed (screen-reader testing still owed) |
| CLI / demo | `apps/cli`, `apps/demo` | complete | CLI run by the owner (REPORTED); demo logo path uses `brand/matrix-eye-logo.png` |
| Marketing/docs website | `apps/website` | built; restyle in progress | see 9/11 |
| Docs search (Pagefind) | `src/scripts/search.ts` | complete | browser test passes |
| Evals | `evals/` | complete | regression baseline on one *invented* university site; not proof for real sites |
| Hosted accounts (control-plane Postgres, per-account API keys, project ownership) | `apps/api/src/control-plane/` | M1 code done | tests pass (pg-mem + fake GoTrue); no real Supabase project; uncommitted |
| **Hosted VPS deploy, dashboard, billing, analytics, email notifications** | none | **planned (Phase 4 M2-M5), nothing exists** | |

## 6. Database and data flow

Two SQLite schemas (VERIFIED in source), same file in the API (`MATRIX_EYE_DB_PATH`, default `./data/matrix-eye.sqlite`):
- **Knowledge (`packages/knowledge/src/sqlite-store.ts`):** `pages(project_id,url,title,content_hash,fetched_at,chunk_count,description)`;
  `chunks(rowid,id,project_id,page_url,page_title,heading_path,heading_text,url_text,text,position)` + FTS5 `chunks_fts`
  (external-content, porter/unicode61, kept in sync by triggers); `facts(project_id,kind,value,page_url,page_title)`.
- **App (`apps/api/src/repositories.ts`):** `projects(id,name,site_url,rules_json,settings_json,created_at)`,
  `crawl_jobs(...)`, `feedback(...)`, `waitlist(email PK,name,use_case,source,consent_at,created_at)`,
  `contact_messages(id,name,email,message,created_at)`. Schema is created with `CREATE TABLE IF NOT EXISTS`; **no migration
  system** (a Phase 4 concern, esp. if moving to Postgres; earlier plan for Phase 4: NestJS/Postgres on Supabase was decided
  for the *AIIT* rebuild, not necessarily this product: do not assume).
- Access control: admin routes need Bearer key; public routes are project-scoped by UUID and origin allow-list.
  Validation: zod (`schemas.ts`). Personal data stored: waitlist emails/names, contact messages (with consent timestamp).

## 7. UI/UX and design system (website)

**Direction changed on 2026-10-13:** from navy + gold ("Eagle's Eye" brand) to **near-black + neon green/teal** to match the
new logo (committed, `c975761`). **Home hero/header refined further on 2026-10-25** against a new mobile reference image the
owner shared (see 11); still **uncommitted** as of this audit.
- Tokens live at the top of `apps/website/src/styles/global.css` (`:root`, dark under `prefers-color-scheme` guarded by
  `:root:not([data-theme="light"])`, and `:root[data-theme="dark"]`). New tokens: `--grad` (teal->lime), `--grad-text`.
  Dark: bg `#04080c`, accent `#2cf2a6`; light: bg `#f5faf7`, accent `#14b87a`, buttons use the gradient.
- **Fonts (changed 2026-10-25): Inter only** (body, headings, UI), JetBrains Mono (code). Self-hosted. **Fraunces was
  removed entirely** (dependency uninstalled, `@font-face`, `--font-serif` token, preload link and the old `og:image:alt`
  wording all deleted) — `h1`/`h2`/`.stat`/`.price` now use `var(--font-sans)` at `font-weight: 800` instead of the serif
  at `560`, and `h1`/`h2`/`.lead` sizes were reduced (`h1`: `clamp(2.1rem, 4.6vw, 3.4rem)`, was `clamp(2.5rem, 5.4vw, 4.1rem)`;
  `h2`: `clamp(1.6rem, 2.75vw, 2.25rem)`; `.lead`: `clamp(1.02rem, 1.35vw, 1.15rem)`). Reason: the owner's new mobile
  reference image used one consistent bold sans typeface throughout (no serif contrast) at a visibly smaller scale; **this
  supersedes the earlier "I love the [Fraunces] font" note** in the project history — treat Inter-only as current.
- Hero "early access" label: **no longer a pill/badge.** It went through two rounds on 2026-10-25: first a bordered
  capsule with a glowing dot (`.pill`/`.pill__tag`/`.pill__text`, matching the reference image's "EARLY ACCESS · NPM
  MODULE" badge, text adapted to **"Early access · Open source"** since the packages are `"private": true` and not
  actually published to npm — a literal "NPM MODULE" claim would have broken the honesty rule, see 10); then, after the
  owner said the glow/pill read as "too AI'ish", it was muted to a plain neutral capsule with a grey dot (no glow); the
  owner then asked to drop the pill/dot entirely and just show the words. **Final state:** `<span class="eyebrow">Early
  access</span>` — reusing the site's existing `.eyebrow` label style (small, uppercase, letter-spaced, `--accent-text`
  colour, no background/border/shadow) that already labels every other section ("Why it is different", "How it works",
  etc.), per the owner's explicit preference for "the design that's used most frequently". The `.pill` CSS rule was deleted.
- Header icon order (mobile, `<=860px`): **changed 2026-10-25.** Previously menu (hamburger) then theme toggle, both
  pushed right by `margin-left: auto` on `.nav__toggle`. Now **theme toggle first, then the menu button last**, flush to
  the right edge and close together (`.nav__actions { order: 1; margin-left: auto; margin-right: 0.3rem; }`,
  `.nav__toggle { order: 2; }`), and both `.icon-btn` buttons are slightly smaller on this breakpoint only
  (`width/height: 2.3rem`, svg `1.05rem`, vs `2.6rem`/`1.2rem` elsewhere) per the owner's reference image and follow-up asks.
- Logo: `src/components/Logo.astro` shows `/brand/mark.webp` (emblem only, transparent; owner asked for no lettering and a
  small size: 30 px header, 36 px footer). Dark theme: no tile; light theme: dark rounded tile (`.logo-badge`).
  Assets are generated by `scripts/make-assets.mjs` from `brand/matrix-eye-logo.png` (colour-to-alpha black removal).
- Layout: container max 1280 px; header wider (1760 px); docs 3-column. Hero: eyebrow label, gradient headline words, 3
  tiles, gradient CTA, "works with" chips, animated scene (`HeroScene.astro` + `ChatDemo.astro`: typing dots, crawl card,
  verified/decline badges, rings, chat input, Source button).
- Motion: scroll reveal (`.sr`), hero entrance, hover lifts, reading-progress bar, TOC scroll-spy, header shadow. All
  disabled under `prefers-reduced-motion` (final state shown); content visible without JS.
- Accessibility rules (tested): AA contrast both themes, visible focus, skip link, aria-linked form errors, keyboard menu
  (Escape), tab arrows, tables scroll in a focusable region on small screens, no sideways scroll at 375 px.
- Owner design preferences: header = logo extreme left, nav centred, theme toggle + CTA extreme right; mobile header icon
  order = theme toggle then menu, close together, flush right (2026-10-25); "MatrixEye" one word; one consistent bold sans
  typeface, no serif contrast, smaller type scale (2026-10-25); avoid "AI'ish" neon-glow badge/pill treatments — prefers the
  site's plain uppercase `.eyebrow` label style for small tags; **not** a fake "Watch demo" video button, invented building
  photo, or unbuilt claims (see 10).

## 8. Integrations and configuration

Variable names only. Local `.env` exists and holds `MATRIX_EYE_API_KEY` and `MATRIX_EYE_SITE_ORIGINS` (values not recorded).

| Variable | Used by | Meaning |
|---|---|---|
| `MATRIX_EYE_API_KEY` (>=16 chars, required) | API | admin Bearer key |
| `PORT` (8787), host `127.0.0.1` | API | listen address |
| `MATRIX_EYE_DB_PATH` | API | SQLite file |
| `MATRIX_EYE_CORS_ORIGINS` | API | extra browser origins for admin CORS |
| `MATRIX_EYE_SITE_ORIGINS` | API | origins of the marketing site allowed to submit forms |
| `MATRIX_EYE_FORM_RATE_LIMIT_PER_MINUTE` (5), `MATRIX_EYE_PUBLIC_RATE_LIMIT_PER_MINUTE` (20), `MATRIX_EYE_RATE_LIMIT_PER_MINUTE` (120) | API | rate limits |
| `MATRIX_EYE_ALLOW_PRIVATE_NETWORKS` | API/CLI | permit crawling localhost/private IPs (dev only) |
| `MATRIX_EYE_LLM_BASE_URL`, `_MODEL`, `_API_KEY` | API/CLI/demo | explicit model config (wins over auto-detect; the API server never auto-detects) |
| `PUBLIC_SITE_URL`, `PUBLIC_API_URL`, `PUBLIC_LEGAL_ENTITY`, `PUBLIC_CONTACT_EMAIL` | website build | see `docs/website.md`; placeholders: domain `matrixeye.ai`, API `https://api.matrixeye.ai`, legal entity, contact email |

Notes: `apps/api` loads `../../.env` via `--env-file-if-exists`. **`.env.example` does not list
`MATRIX_EYE_SITE_ORIGINS` or `MATRIX_EYE_FORM_RATE_LIMIT_PER_MINUTE`** (gap, P2).
External services in use: none (no analytics, no third-party scripts/fonts). GitHub: repos `matrix-machine/matrix-eye`
(public) and `Ndubuisi-Godcares/matrix-eye` (private; Vercel deploys from this one). `origin` has two push URLs so one
`git push` updates both; remote `personal` = the private repo. Vercel: `vercel.json` at repo root (build from root, output
`apps/website/dist`) and `apps/website/vercel.json`, generated by `npm run deploy-config -w @matrix-eye/website` (CSP names the API origin).

## 9. Implementation and verification status

**Checks run on 2026-10-25 (Home hero/header restyle, see 7/11 for what changed):**
- `npm run typecheck`: passes, 0 errors (`astro check`: 53 files, 0 errors/warnings/hints), re-run twice across the session
  as edits landed.
- `npm run build -w @matrix-eye/website`: passes, 24 pages, after fixing a build break the Fraunces removal caused (a
  `?url` import of the font file in `Base.astro` that `npm uninstall` didn't know to remove — fixed by hand, see 7).
- `npm test`: **464/464 passed (37 files)** on the final run. One intermediate run had 4 failures, all in
  `packages/llm/test/openai-compatible.test.ts` (`ETIMEDOUT` connecting to a local loopback test server) — re-ran that
  file alone (6/6 passed) and the full suite again (464/464 passed): **confirmed flaky/transient, not caused by this
  session's changes** (that package was never touched). Consistent with the existing "re-run alone before suspecting code"
  note in section 13; add this file to that pattern if it recurs.
- Visual check (Chrome, via `npm run serve -w @matrix-eye/website` on `:4400`): compared the Home hero at 430x900 (mobile)
  and 1440x900 (desktop) against the owner's reference screenshots after each round of changes (fonts/sizing, pill ->
  muted badge -> plain eyebrow label, header icon reorder/resize). Confirmed visually matching each time.
- **New finding, unrelated to this session's work:** `npm audit --omit=dev --audit-level=high` now reports **2 high-severity
  and 2 other vulnerabilities** (`zod` <4.6.6, memory exhaustion on oversized constrained collections,
  GHSA-mrhx-c7xc-m3w5; `undici`, DoS via unhandled error on excessive content-encodings, GHSA-xjj6-f33q-929c) — this was
  **0 vulnerabilities on 2026-10-13**; the advisories were evidently published since then against already-installed
  versions (confirmed via `git diff package-lock.json`: no `zod`/`undici` version changed this session, only the Fraunces
  package was removed). **Not fixed this session** (zod's fix is `npm audit fix --force`, a breaking change touching API
  validation across the whole project — out of scope for a Home-page styling/copy task). This will fail the CI audit step
  (`.github/workflows/ci.yml`) on the next push; see section 12 P1.
- Did **not** re-run `npm run eval -- --gate` this session (engine/evals untouched).

**Checks re-run on 2026-10-19 (continuity audit; no code changed since 2026-10-13, this just confirms nothing drifted):**
- `git status`: clean except an unstaged, trivial 2-line `memory.md` edit (two backlog-line tweaks recording the M1 commit
  hash, already folded into this file). Branch `main` up to date with `origin/main` at `c975761`.
- `npm run typecheck`: passes, 0 errors (root `tsc` x3 projects + `astro check` on the website, 53 files, 0 errors/warnings/hints).
- `npm test`: **464/464 passed (37 files)** — up from the 461/461 (then unspecified file count) reported 2026-10-13; the
  difference is most likely a content-driven `it.each`/`describe.each` test (e.g. one per website page or per logo in the
  "works with" row, both of which the test suite iterates) and is not a regression signal; re-run and confirm the count if
  it matters for a specific task, don't assume 464 is the permanent baseline.
- `gh run list --limit 3`: all green, latest run `38414208313` (3m15s) on commit `c975761`, matching the HEAD above.
- Did **not** re-run `npm run build`, `npm run eval -- --gate`, or `npm audit` this session (no code changed since they last
  passed on 2026-10-13 — see below); re-run them before trusting a status claim if you're about to ship something.

**Checks run on 2026-10-13 after the restyle (working tree at commit time):**
- `npm run typecheck`: passes (0 errors; the duplicate `lock` icon was removed).
- `npm test`: **448/448 passed** (35 files), including axe in both themes and mobile overflow; the theme test now expects `rgb(4, 8, 12)`.
- `npm run eval -- --gate`: passed (0 unsupported figures, injection resistance 100%).
- Build: website builds (24 pages); `og.png`, icons and `mark.webp` regenerated with the new dark tile `#04080c`.
- Visual review: `/`, `/pricing/`, `/docs/api/` screenshotted in light and dark (Playwright): legible, no layout problems seen.
  `/product/` was captured but not individually inspected.
- CI on GitHub: green through the latest commit `51728e8` (run `38401746202`, 2026-10-13T13:01:48Z; checked this session with
  `gh run list --limit 3`, all three latest runs `success`). Vercel deployment: **owner confirmed working** (2026-10-13,
  REPORTED this session, not independently re-checked against the live URL).

**Known gaps/debt:** no outside security audit; no screen-reader testing; no multi-tenant auth; no DB migrations; no
retention/erasure UI for waitlist (owner can delete via API); English only; keyword retrieval can wrongly decline unusual
phrasing; small local models sometimes decline two-part questions; widget/`Origin` limit; privacy/terms are drafts.

## 10. Decisions and development constraints

| Decision | Rationale | Status |
|---|---|---|
| D1 name -> **MatrixEye** (was Eagle's Eye) | owner choice 2026-10-12 | confirmed |
| D2 Apache-2.0 | commercial-friendly open core | confirmed |
| D3 Fastify for the API | | confirmed |
| Storage = built-in SQLite FTS5 | zero ops, fast, enough for target sizes (ADR-002) | confirmed for now; revisit in Phase 4 |
| Grounded answers + abstention are the product (ADR-003) | trust is the differentiator | confirmed, do not weaken |
| Crawler safety: SSRF guard, robots, injection-text removal (ADR-004) | | confirmed |
| Local model via Ollama, non-thinking models only (ADR-005) | free, private; reasoning models leak thoughts | confirmed |
| Widget: key-less public endpoints + origin allow-list, streaming provisional/final (ADR-006) | page can't hold a secret | confirmed |
| Website: static Astro, strict CSP, nothing third-party, forms to own API (ADR-007) | cheap, safe, fast | confirmed |
| Honest content: prices marked estimates; drafts marked; security gaps listed; comparisons generic | brand is honesty | confirmed |
| Product names in code: `@matrix-eye/*`, `MATRIX_EYE_*`, `matrix-eye-widget.js`, `<matrix-eye-chat>`, `MatrixEyeBot`, CLI `npm run matrix` | rename | confirmed |
| Palette switch to neon green on near-black to match the logo | owner approved "apply all" 2026-10-13 | confirmed (committed `c975761`) |
| Headline/body typography unified to Inter only (Fraunces removed), smaller type scale | owner's 2026-10-25 mobile reference image used one bold sans typeface throughout, not a serif/sans mix, at a visibly smaller size | confirmed, **uncommitted** |
| Small inline tags (e.g. "Early access") use the plain `.eyebrow` label style, not a bordered/glowing pill badge | owner called the glow-pill treatment "too AI'ish" (2026-10-25) and asked for the site's most-frequently-used label pattern instead | confirmed, **uncommitted** |
| Reference image said "EARLY ACCESS · NPM MODULE"; shipped copy says "Early access · Open source" instead | the `@matrix-eye/*` packages are `"private": true` and not published to npm — "NPM MODULE" would be an unbuilt claim, which this project's honesty rule (see above) forbids | decision made without asking (low-risk, reversible); **flag to the owner if they specifically wanted the npm wording** |
| Do **not** add: fake demo video, invented photos, unbuilt claims ("knowledge base updated automatically"), brand logos of frameworks | honesty/trademark | confirmed advice, owner agreed to "apply all" *as adapted*; see 11 |
| Historical planning PDFs/strategy notes keep "Eagle's Eye" | they are history | confirmed |
| Phase 4: control-plane (accounts/billing/project ownership) on Supabase Postgres; knowledge data stays per-project SQLite on the API VPS disk; hosted inference stays self-hosted Ollama, not a third-party LLM API; budget <$25/mo (ADR-008) | owner decisions D5-D7, 2026-10-13; keeps the "self-hostable, private" story true for the hosted tier; avoids a costly Postgres rewrite of the working FTS5/BM25 ranking | confirmed (architecture only; nothing built yet) |

## 11. Current development position (READ THIS FIRST)

- **2026-10-25 session (current, uncommitted): Home hero/header restyle.** The owner shared a mobile reference screenshot
  of the Home hero and asked for several rounds of changes, all against `apps/website/src/pages/index.astro`,
  `apps/website/src/styles/global.css`, and `apps/website/src/layouts/Base.astro` (plus `apps/website/package.json` /
  root `package-lock.json` for the font dependency removal). In order:
  1. Unified the headline/body typography to **Inter only** (removed Fraunces entirely: `@font-face`, `--font-serif`
     token, the `?url` preload import/link in `Base.astro`, and the `@fontsource-variable/fraunces` npm dependency) and
     made `h1`/`h2`/`.stat`/`.price` bold sans (`font-weight: 800`) instead of serif at `560`.
  2. Reduced `h1`/`h2`/`.lead` font sizes (see exact clamp values in section 7).
  3. Rewrote the Home page copy end to end for a more professional tone (hero, "why", "how it works", "for developers",
     "trust", CTA band) — see the full diff in `index.astro`; notably swapped "audited automatically" for "checked
     automatically" since the site has **no actual outside audit** (section 9/13) and the original wording overclaimed.
  4. Replaced the two-part hero pill (tag + descriptive text) with a single badge reading "Early access · Open source"
     styled like the reference image, **then** — after the owner said it looked "too AI'ish" — muted it (no background
     glow, grey dot), **then** — per a further owner request — removed the pill/dot shape entirely in favour of the site's
     plain `.eyebrow` label style (final state). See section 7 for the full story and section 10 for the npm-vs-open-source
     wording call.
  5. Reordered and resized the mobile header's two icon buttons (theme toggle, then menu button, closer together, flush
     right, both slightly smaller at `<=860px`), per the reference image and two follow-up refinement requests.
  6. Fixed a stale `og:image:alt` in `Base.astro` that still described the old navy/gold eagle logo instead of the current
     neon emblem (noticed while removing the Fraunces preload link next to it; unrelated one-line correctness fix).
  - **Verified green this session:** typecheck, build (24 pages), full test suite (464/464, after confirming one
    intermediate failure was pre-existing flakiness unrelated to these changes — section 9), and visual comparison in
    Chrome at mobile and desktop widths against the owner's reference image after each round.
  - **New, unrelated finding surfaced by this session's `npm audit`:** 2 high-severity vulnerabilities (`zod`, `undici`)
    that were not present on 2026-10-13 — see section 9 for detail and section 12 for the backlog item. Not fixed; flagged
    only.
  - **Not committed yet.** `git status` at the end of this session: `apps/website/package.json`,
    `apps/website/src/layouts/Base.astro`, `apps/website/src/pages/index.astro`, `apps/website/src/styles/global.css`,
    `package-lock.json` all modified, nothing staged. **Next concrete action for a session that continues this work:**
    confirm with the owner whether to commit and push (the last few sessions show the owner prefers to be asked before any
    push, and said yes each time asked) — the usual checks (typecheck/build/test) are already green, so a commit should be
    low-risk once approved.
- **Before this (2026-10-19 session): nothing had changed since 2026-10-13** — that session only re-verified state and
  hardened this file for continuity (see section 15 for that entry). The Phase 4 M1 commit (`c975761`) and everything
  below in this section about it is still accurate and still the real next step for the *backend/hosting* track, which
  this session's Home-page restyle did not touch.
- **Objective (done 2026-10-13, see above for what changed since):** website restyle to the neon green/teal palette with
  the reference-style hero, "MatrixEye" (one word) everywhere. Committed and pushed on 2026-10-13 (see section 15).
- **Honesty rules kept:** the hero does not claim "knowledge base updated automatically" (not built); it says "Self-host, private".
- **CI and Vercel: both confirmed** this session (2026-10-13) — CI green through `51728e8`; owner confirmed the Vercel
  deployment works.
- **Phase 4 M1 implemented in code** (2026-10-13): control-plane module at `apps/api/src/control-plane/` — Postgres
  migration runner (`migrate.ts`, `schema_migrations` tracking table, `0001_accounts` creates `accounts` +
  `account_projects`), `AccountRepository` (per-account API key, issued once, stored only as a SHA-256 hash — same idea
  as the single operator key in `auth.ts` but the hash is also the lookup key), a minimal `SupabaseAuthClient` (plain
  `fetch` against GoTrue's `/auth/v1/signup` and `/auth/v1/token?grant_type=password`, no SDK dependency), and
  `createAccountAuthHook` (same Bearer-hook shape as the legacy single-key hook). Wired into `apps/api/src/app.ts`:
  new `/v1/accounts/signup`, `/v1/accounts/login`, `/v1/accounts/me/projects` routes (only registered when
  `deps.controlPlane` is present); the `/v1` group's auth hook switches to account-key mode; `requireOwnedProject`
  enforces that a project 404s (not 403) for any account that doesn't own it, including `/crawls/:id` by the job's
  project; `/v1/waitlist` and `/v1/contact-messages` (the *operator's own* marketing-site leads) are **not registered at
  all** in hosted mode, so a customer's account key cannot reach them. `apps/api/src/config.ts` adds optional
  `MATRIX_EYE_DATABASE_URL` / `MATRIX_EYE_SUPABASE_URL` / `MATRIX_EYE_SUPABASE_ANON_KEY` (all three together or none —
  `superRefine` enforces this); unset (self-host default) leaves every existing route and test behaviour unchanged.
  `server.ts` creates a `pg.Pool` and runs migrations at boot only when those three are set. New script
  `npm run migrate -w @matrix-eye/api` (`src/control-plane/migrate-cli.ts`) applies migrations ahead of a deploy.
  **Deps added:** `pg` (prod), `@types/pg` + `pg-mem` (dev). Tests use `pg-mem` (in-memory Postgres emulator) and a
  tiny fake GoTrue HTTP server, not a real Postgres/Supabase — fully offline, no CI changes needed.
- **Verified this session:** `npm run typecheck`, `npm test` (461/461, up from 448 — 13 new tests in
  `apps/api/test/control-plane.test.ts` and `apps/api/test/accounts.test.ts`), `npm run build`, `npm run eval -- --gate`
  (all Phase 1 targets met), `npm audit --omit=dev --audit-level=high` (0 vulnerabilities) all green with these changes.
  **Uncommitted.**
- **`/v1/accounts/rotate-key` added (2026-10-13):** login alone only confirms identity (`{accountId, email}`, no key,
  since the key is shown once at signup); rotate-key re-proves identity with the password and issues a fresh key,
  invalidating the old one (`AccountRepository.rotateApiKey`). Owner decision: add this now rather than defer to M3.
- **Not done yet (still M1 work, or M2+):** no real Supabase project exists (code only talks to whatever
  `MATRIX_EYE_SUPABASE_URL` points at); no CLI/dashboard calls these routes yet; M2 (VPS deploy) not started.
- **Committed and pushed 2026-10-13** at `c975761` (both repos); CI green (run `38414208313`, 3m15s).
- **Next concrete action (backend/hosting track):** start **M2** (provision the VPS, deploy the API, run Ollama on it)
  per `docs/planning/Phase4-Plan.md`. First owner-side step for M2: actually create the Supabase project and a VPS account
  (neither exists yet) so the code in `apps/api/src/control-plane/` has something real to talk to.
- **Next concrete action (website track, see top of this section):** confirm with the owner whether to commit and push
  the 2026-10-25 Home restyle, then consider whether the same font/sizing/copy treatment should extend to the other
  23 pages (only Home was done this session).
- **Owner-side open items:** domain, legal entity and contact email, lawyer review of `/privacy/` and `/terms/`, pricing
  validation, decisions D5-D7, a real screen-reader test, the `zod`/`undici` `npm audit` findings (section 9/12).
- **Blockers:** none technical.

## 12. Outstanding work and prioritized backlog

**Phase roadmap:** Phases 1-3 are done. **Phase 4 is next: hosted backend, dashboard, billing.** Architecture decided
(ADR-008) and a milestone plan written (`docs/planning/Phase4-Plan.md`), 2026-10-13. Milestones in order: **M1 accounts/
control-plane Postgres (code done this session, uncommitted; no real Supabase project yet)** -> M2 VPS deploy of
API+Ollama (not started) -> M3 minimal dashboard (not started) -> M4 billing/Stripe (not started) -> M5 hardening
(not started) before real customers.

**P0:** **`npm audit --omit=dev --audit-level=high` now fails** (`zod` high, `undici` high — section 9). Not caused by this
session's changes, but will break CI (`.github/workflows/ci.yml` runs this exact command) on the next push from any branch,
including the already-pending Home-restyle commit. Fix before or alongside the next push: `npm audit fix` handles `undici`
non-breaking; `zod` needs `npm audit fix --force` (upgrades to zod@4.6.7, a breaking change per npm's own warning) —
check `apps/api` schema validation still passes typecheck/tests after.

**P1 (current)**
1. ~~Check CI for the latest commits.~~ Done 2026-10-13: green through `51728e8`.
2. ~~Confirm the Vercel deployment works.~~ Done 2026-10-13: owner confirmed working.
3. ~~Plan Phase 4 with the owner.~~ Done 2026-10-13: ADR-008 + `docs/planning/Phase4-Plan.md`.
4. ~~Implement M1 (accounts/control-plane) in code, including rotate-key.~~ Done 2026-10-13; all checks green (section 11).
5. ~~Commit the M1 changes.~~ Done 2026-10-13 (`c975761`, pushed both repos, CI green).
6. Start M2: provision a real Supabase project + VPS, deploy the API, run Ollama on it.
7. ~~Restyle the Home hero/header to match the owner's 2026-10-25 mobile reference (fonts, sizing, early-access label,
   header icons) and rewrite Home copy to a more professional tone.~~ Done 2026-10-25, all checks green; **not yet
   committed** — confirm with the owner first (section 11).
8. Fix the `npm audit` P0 above before the next push.
9. Consider: extend the same font/sizing/copy treatment from Home to the other 23 pages, if the owner wants consistency
   site-wide (not done this session — only Home was in scope).

**P2**
- Host the API somewhere with a persistent disk or move to Postgres (Phase 4); set `PUBLIC_API_URL`, `MATRIX_EYE_SITE_ORIGINS`, re-run `npm run deploy-config` with the API origin.
- Regenerate planning PDFs only if the owner asks.
- Choose domain; update `matrixeye.ai` placeholders; legal entity + contact email; lawyer review of `/privacy/`, `/terms/`.
- Validate pricing with real conversations; decide D5/D6/D7.
- Real screen-reader test (NVDA/VoiceOver). Consider outside security review before launch.

**P3**
- Phase 4 milestones M1-M5: see `docs/planning/Phase4-Plan.md` (accounts/control-plane Postgres, VPS deploy, dashboard, billing, hardening).
- Phase 4-plus (after M1-M5): hosted crawling/re-crawl scheduling, analytics, email notifications, retrieval upgrade (only if it measurably improves evals), more languages, PDF/login-gated page support, Vue/WordPress/HTML integration guides that are actually tested.

## 13. Known issues and troubleshooting

| Issue | Cause (confirmed unless marked) | Fix / note |
|---|---|---|
| Vercel "No Output Directory named public" | Build ran from repo root without website build config | fixed by `vercel.json` (root + `apps/website`); keep both in sync (`npm run deploy-config`; test enforces) |
| Vercel "To link a GitHub repository, you need to install the GitHub integration" | Repo was in an organisation; Hobby plan can't deploy org repos; personal repo was empty | pushed code to `Ndubuisi-Godcares/matrix-eye`; user must grant the Vercel GitHub app access |
| `git push` rejected / wrong repo | two remotes | `origin` has two push URLs; `personal` is the private repo |
| `@matrix-eye/*` "Cannot find module" after rename or folder move | `node_modules/@matrix-eye` symlinks stale | run `npm install` |
| API ignores settings | env var names changed | use `MATRIX_EYE_*`; `.env` read from repo root |
| Port 4400 in use | an earlier `npm run serve -w @matrix-eye/website` still running | stop it (`Stop-Process -Id (Get-NetTCPConnection -LocalPort 4400 -State Listen).OwningProcess`) |
| `packages/crawler` render test flaked once under load | timing (hypothesis); passed alone | re-run alone before suspecting code |
| `packages/llm/test/openai-compatible.test.ts` failed with `ETIMEDOUT` connecting to a local loopback server (2026-10-25) | transient local networking; passed alone and on a full re-run immediately after | re-run alone (or the whole suite) before suspecting code, same as the crawler render test above |
| `npm audit --omit=dev --audit-level=high` reports 2 high-severity vulnerabilities as of 2026-10-25 (`zod`, `undici`); was 0 on 2026-10-13 | new GitHub advisories published against already-installed versions, not a lockfile change made in this project | not yet fixed; `npm audit fix` for `undici`, `npm audit fix --force` (breaking) for `zod` — see section 12 P0 |
| Website tests collide on `dist` | both suites build | `test/helpers.ts` uses a lock file + 30 s reuse; do not remove |
| Shell quirks on this machine | Git Bash heredocs with quotes break; MSYS rewrites args starting with `/`; Python default encoding cp1252; `"\\u2060"` literal | write scripts with the Write tool; use `MSYS_NO_PATHCONV=1`; open files with `encoding="utf-8"`, preserve CRLF (`newline=""`) |
| Git "CRLF will be replaced by LF" warnings | `.gitattributes`/Windows | harmless |
| Astro `<script>` bundles externally when inlining is on | CSP forbids inline | keep `assetsInlineLimit: 0` |
| Do not re-try: shipping a hard white badge or gradient halo behind the old logo; recolouring the logo for dark mode | owner rejected them | current logo needs none on dark |

## 14. Development conventions

- TypeScript strict, ESM; small modules with header comments that explain *why*; match surrounding style.
- Names: packages `@matrix-eye/<x>`; env `MATRIX_EYE_*`; docs slugs in `apps/website/src/data/docs.ts`.
- API: `/v1` admin (Bearer), `/v1/public` visitor/forms; errors always `{ error: { code, message, details? } }`; zod validation.
- Security: never expose admin key to browsers; no inline scripts (strict CSP shared by `scripts/headers.mjs`, tests and `vercel.json`);
  no third-party requests; every new public endpoint needs origin + rate-limit protection and a test.
- Testing: every bug fix gets a regression test that fails on the old code; website changes need the static + browser suites;
  motion-dependent tests run with reduced motion (`open()` helper default) unless `motion: true`.
- Content: honest claims only; mark estimates/drafts; do not name competitors.
- Git: commit messages explain what and why, end with the Co-Authored-By trailer; `git push` hits both repos; never commit `.env`,
  `data/`, `dist/`, screenshots (`apps/website/test/__screenshots__`). Confirm before pushing to any *new* destination.
- Docs: public docs live in `/docs` and double as site content; update `docs/changelog.md` for user-visible changes.

## 15. Session handover log

- **2026-10 (Phases 1-2):** built engine, crawler, store, LLM + Ollama, API, SDK, widget, React wrapper, demo; eval gate; ADR-001..006; pushed to GitHub with CI.
- **2026-10-12 (Phase 3):** website (Astro), forms API, docs/guides, tests (static + browser + axe), ADR-007; layout widening, motion, header layout, animated hero, Home link; Vercel config fix. Commits `7cfa0ad`..`e302ac4`.
- **2026-10-12 (rename + logo):** renamed to MatrixEye everywhere, repos renamed, two remotes, new logos (several iterations: lettered, badge, glow), final: neon emblem only, small. Commits `c929b0e`..`f3c2664`. Verified: full tests, typecheck, build, eval gate green at `f3c2664`.
- **2026-10-13:** owner shared a reference hero and approved "apply all" + "MatrixEye one word". Started the green restyle (uncommitted; unverified). Then created this `memory.md` and `CLAUDE.md` (audit: build ok, tests 447/448, typecheck 1 error from the unfinished restyle). 
- **2026-10-13 (restyle finished; home "works with" row has 9 logos (React, Next.js, Vue, WordPress, Angular, Svelte, Shopify, Wix, HTML) from Simple Icons CC0 in `src/data/stack.ts`; hero tile icons centred (selector `.tile div > span`), third tile now "Data stays yours"):** removed duplicate icon, fixed theme test, updated `theme-color`, OG image script and icon tile to `#04080c`, regenerated assets, added missing `.env.example` settings, fixed `package.json` description. Typecheck, 448 tests and eval gate green.
- **2026-10-13 (CI/Vercel confirmed; Phase 4 planned):** checked CI (`gh run list --limit 3`, green through `51728e8`);
  owner confirmed the Vercel deployment works. Resolved D5-D7 with the owner (self-hosted Ollama for hosted inference,
  budget under $25/month, near full-time hours) and wrote `docs/adr/ADR-008-phase4-hosted-architecture.md` (Supabase
  Postgres control plane + per-project SQLite on a VPS + self-hosted Ollama) and `docs/planning/Phase4-Plan.md`
  (milestones M1-M5).
- **2026-10-13 (Phase 4 M1 implemented):** built the control-plane module (`apps/api/src/control-plane/`): Postgres
  migration runner, `AccountRepository`, `SupabaseAuthClient`, account Bearer-auth hook; wired into `app.ts`/`config.ts`/
  `server.ts` so hosted mode is opt-in via three env vars and self-host mode is untouched; added `pg`/`@types/pg`/
  `pg-mem`; added `apps/api/test/control-plane.test.ts` and `apps/api/test/accounts.test.ts` (pg-mem + fake GoTrue
  server, fully offline). Verified green: typecheck, `npm test` (461/461), build, eval gate, `npm audit`.
  **Uncommitted; no real Supabase project provisioned yet.** Next action: section 11.
- **2026-10-19 (continuity audit; no feature work):** owner is about to reset this conversation and possibly switch Claude
  accounts/machines, and asked that no progress be lost. Confirmed `git status`/`git log` unchanged since the last session
  (`main` still at `c975761`, matches `origin/main`, only an unstaged trivial `memory.md` tweak pending); re-ran
  `npm run typecheck` (0 errors) and `npm test` (464/464, 37 files — see section 9 for the small count discrepancy vs the
  461 previously reported, not investigated further, likely a content-driven test); checked CI (`gh run list --limit 3`,
  green through `c975761`). Did not re-run `build`/`eval --gate`/`audit` (nothing changed that would affect them).
  Made this file and `CLAUDE.md` more explicit that memory.md is meant to be fully self-contained — a fresh session
  (new conversation, new account, new machine) should be able to resume correctly from `CLAUDE.md` + this file + the repo
  alone, with no information lost from the reset conversation. **No new technical next action**: it is still M2 (section 11),
  unchanged.
- **2026-10-25 (new session, different Claude account — confirmed the memory system worked: picked up exactly where
  2026-10-19 left off): Home hero/header restyle.** The owner shared a mobile reference screenshot and iterated across
  several follow-up requests sent mid-turn (handled as they arrived, not as separate turns): (1) match the reference's
  bold sans headline font and reduce font sizes -> removed Fraunces, unified on Inter at heavier weight, shrank
  `h1`/`h2`/`.lead`; (2) "implement the early access exactly as shown" -> built a bordered pill badge, substituting
  "Open source" for the reference's "NPM module" since the packages are `private: true` and not published (an honesty-rule
  call, flagged rather than silently either breaking the rule or ignoring the instruction); (3) "wordings are too basic...
  read through the entire text" -> rewrote all Home page copy for a more professional tone, including fixing an
  "audited automatically" claim that overclaimed (no outside audit exists); (4) "move the navbar icon to the extreme end
  and the light mode icon before it... bring them closer" -> reordered the mobile header's theme-toggle/menu buttons and
  tightened the gap; (5) owner found the pill badge "too AI'ish" (shared a zoomed screenshot) -> asked two clarifying
  questions (what replacement style, how wide the change should go) since this touches brand identity, got "muted neutral
  badge" + "just this badge" -> removed the glow/background fill; (6) "reduce both icons slightly... I don't want the
  rounded rectangle and the dot, I want just early access, the design is used most frequently" -> shrank the header icons
  further, and replaced the badge entirely with the site's existing `.eyebrow` label style (plain uppercase text, no
  shape), which is what every other section heading on the site already uses. Verified after each round with a headless
  Chrome screenshot at mobile (430x900) and desktop (1440x900) against the reference. Final full-suite checks: typecheck
  0 errors, build 24 pages, tests 464/464 (one intermediate run had unrelated flaky failures in the LLM provider test,
  confirmed by re-running alone). Also fixed a stale `og:image:alt` (still described the old eagle logo) and surfaced a
  new, unrelated `npm audit` finding (section 9/12 P0). **Not committed** — see section 11 for exactly what changed and
  what to ask the owner before pushing.

---
## Memory maintenance policy
Update this file whenever a feature, route, schema, integration, decision, bug, check result or the "next action" changes; do
it as you go, not at the end. Edit entries in place (no duplicate appends); never mark something verified unless you ran the
check; never record secrets. Re-validate sections 9 and 11 against `git status` and a fresh `npm run typecheck && npm test`
at the start of any session that continues the restyle.
