# MatrixEye: project memory (handover document)

> **For a new Claude Code session:** read this whole file before planning or changing code. It is the authoritative
> handover, written to be **self-contained**: a fresh session (including one started after a conversation reset, or on a
> different Claude account/machine with this same repo) should be able to pick up exactly where the last one left off using
> only this file, `CLAUDE.md`, and the source tree — nothing else is needed and nothing important lives only in chat history.
> Section 11 says exactly where work stopped; section 9 says what was and was not verified; section 3 is the full project
> topology (directory map + architecture) if you need to re-orient.
> Last audit: **2026-10-26** (session begun 2026-10-25, ran past midnight, still going). About to be pushed: a new
> **workspace app, `apps/dashboard`** — a "Template Studio" where a project's chat widget can be designed (3 visual
> templates, 6 launcher icons, brand colours) with a live preview that mounts the real, unmodified widget against
> the real API. This is a genuinely new npm workspace, new widget capabilities (`template`/`launcherIcon` options,
> `packages/widget/src/styles.ts`), new API surface (`GET /v1/projects`, `appearance` in project settings), and a
> real bug fix (admin CORS silently never allowed PATCH/PUT/DELETE cross-origin — see section 13). Section 11's top
> entry has the full story; section 15 has the session-by-session narrative of everything before it, going back to
> `fa04b80`. **If you're picking this up mid-session: section 9's newest block lists every verification check run,
> including two false alarms (CSS cascade bug, then a local-machine resource-exhaustion scare) that were each
> properly root-caused rather than papered over — read it before re-running anything from scratch.**
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
  confirmed working, 2026-10-13). **Phase 4 (hosted backend, M3's hosted multi-tenant dashboard, billing) underway:**
  plan written (ADR-008, `docs/planning/Phase4-Plan.md`); M1 (accounts/control-plane) implemented and committed
  (`c975761`, 2026-10-13), no real Supabase project yet; M2 (VPS deploy), M3 (hosted dashboard), M4, M5 **still not
  started** — **do not confuse this with `apps/dashboard`, added 2026-10-26** (section 5/7/11), which is a separate,
  unrelated thing: a small local admin tool (the Template Studio, for designing a widget's appearance) with no
  accounts, no hosting, and no connection to the Phase 4 M3 roadmap item of the same generic name. Home page and
  site-wide copy refreshed 2026-10-25 (section 7/15).
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
| Widget | Plain TS web component, esbuild bundle (~11.5 KB gzipped as of 2026-10-26, CI budget 30 KB), SSE streaming. React wrapper `@matrix-eye/widget-react`. 3 visual templates + 6 launcher icons added 2026-10-26 (section 5/7). |
| Website | Astro 7.3.8 (static), Sätteri Markdown processor, Shiki, Pagefind search, sharp (image assets), self-hosted variable fonts (Inter, JetBrains Mono; Fraunces removed 2026-10-25, see 7/11). |
| **Dashboard** (new 2026-10-26) | `apps/dashboard`: Vite 6 + React 19 + TypeScript, plain hand-written CSS (no Tailwind/UI kit). The **first client-framework app in this repo** — justified by a genuinely interactive multi-panel editor; the widget itself stays framework-free `createElement`-only by design, unaffected. |
| Hosting | **None live.** Vercel project import attempted (Hobby plan, from the personal GitHub repo). Intended: static site on Vercel; API needs a long-running host (Phase 4). `apps/dashboard` is not deployed anywhere and must not be (section 7). |
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
  packages/engine/             ConversationEngine: rules -> smalltalk -> facts(contact) -> overview -> retrieve -> gates -> LLM/extractive -> validate; ingest.ts; abstain.ts (decline wording)
  packages/sdk/                MatrixEyeClient (admin) + PublicClient (visitor), SSE parser, MatrixEyeError
  packages/widget/             <matrix-eye-chat> custom element + MatrixEye.init + script-tag auto-mount; styles.ts, render.ts (safe markdown), colors.ts
  packages/widget-react/       MatrixEyeChat React component (SSR-safe)
  packages/testing/            fixture website server + fixtures for offline tests
  apps/api/                    Fastify server (app.ts routes, config.ts env, repositories.ts SQLite tables, crawl-runner.ts, auth.ts, schemas.ts)
  apps/cli/                    `npm run matrix -- <crawl|ask|chat|search|pages|llm-check>` (own DB ./data/matrix-eye-cli.sqlite)
  apps/demo/                   `npm run demo -- <url>`: crawl a site + serve a page with the real widget on :8788
  apps/website/                the marketing/docs site (section 4/7)
  apps/dashboard/               Template Studio (new 2026-10-26): `npm run dev -w @matrix-eye/dashboard` on :5183;
                                local admin tool, NOT the Phase 4 M3 hosted dashboard (section 1/7)
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
| `/` | Home: hero (eyebrow label, gradient headline, feature tiles, CTA, stack row, animated scene), "why", "how", code tabs, FAQ, CTA | Font/sizing/copy restyle **done and pushed** (`fa04b80`, 2026-10-25) |
| `/product/` | The four stages, "where it runs" table, comparison table (generic, no competitor names), honest limits | done; stage headings retitled 2026-10-25 (crawl/index, retrieve, generate-or-abstain, verify), **committed `8875aff`** |
| `/pricing/` | Plans (Community Free; Developer Pro $19-$39 est.; Business Hosted $49-$149 est.; Private custom) + FAQ + FAQPage JSON-LD | prices are **unvalidated estimates**, labelled as such; copy polish 2026-10-25, **committed `8875aff`** |
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
| Conversation engine + abstention | `packages/engine` | complete; decline wording made adaptive/professional 2026-10-26 (`abstain.ts`) | tests + eval gate pass (this audit: `npm run eval -- --gate`: "All Phase 1 targets met") |
| LLM provider + Ollama auto-detect | `packages/llm` | complete | unit tests; real-model run REPORTED (97.4% correctness on 48 Qs with Qwen3 4B Instruct) |
| Admin REST API | `apps/api/src/app.ts` | complete for local use | tests pass; Bearer key; no multi-tenant accounts; `GET /v1/projects` (list) added 2026-10-26 |
| Public widget API + streaming | same | complete | origin allow-list (closed by default), CORS delegator, per-visitor rate limit; honest limit: `Origin` can be forged outside browsers; `GET .../config` now also returns `appearance` (2026-10-26) |
| Website forms API (waitlist, contact) + owner export | same, `repositories.ts` | complete | honeypot, consent literal, `MATRIX_EYE_SITE_ORIGINS`, form rate limit; E2E browser test passes |
| TypeScript SDK | `packages/sdk` | complete | integration test passes; `listProjects()`, `WidgetAppearance`/`WidgetTemplate`/`LauncherIcon` types added 2026-10-26 |
| Chat widget + React wrapper | `packages/widget*` | complete | jsdom + real-browser tests pass; a11y reviewed (screen-reader testing still owed); **3 visual templates + 6 launcher icons added 2026-10-26** — section 7 |
| **Template Studio** (design a project's widget: templates, launcher icons, colours, live preview against the real API) | `apps/dashboard` | first slice done, 2026-10-26 | manually verified end-to-end in Chrome (connect, list, customize, live preview, save, confirmed persisted via the real API); see 9/11. **Not the Phase 4 M3 hosted dashboard** — section 1 |
| CLI / demo | `apps/cli`, `apps/demo` | complete | CLI run by the owner (REPORTED); demo logo path uses `brand/matrix-eye-logo.png` |
| Marketing/docs website | `apps/website` | built; copy/restyle refreshed 2026-10-25 | see 9/11 |
| Docs search (Pagefind, inline box in the docs sidebar) | `src/scripts/search.ts`, `components/DocsSearch.astro` | complete | browser test passes |
| **Site-wide search** (Ctrl/Cmd+K command palette, header search button, every page, with optional voice input) | `components/CommandPalette.astro`, `src/scripts/command-palette.ts` | complete, added 2026-10-26 | 3 new browser tests pass; see 7/9/11 |
| Evals | `evals/` | complete | regression baseline on one *invented* university site; not proof for real sites |
| Hosted accounts (control-plane Postgres, per-account API keys, project ownership) | `apps/api/src/control-plane/` | M1 code done | tests pass (pg-mem + fake GoTrue); no real Supabase project; committed `c975761` |
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
  for the *AIIT* rebuild, not necessarily this product: do not assume). `settings_json` gained an `appearance` object
  2026-10-26 (`{ template, launcherIcon, color, accent }`, all nullable) — no new column or migration needed since it's
  one more field inside the existing JSON blob; old rows read back with `appearance` defaulted via a one-level-deep
  merge (`DEFAULT_APPEARANCE`), not just a shallow spread, so an old row missing only `launcherIcon` doesn't lose its
  other saved appearance fields.
- Access control: admin routes need Bearer key; public routes are project-scoped by UUID and origin allow-list.
  Validation: zod (`schemas.ts`). Personal data stored: waitlist emails/names, contact messages (with consent timestamp).

## 7. UI/UX and design system (website)

**Direction changed on 2026-10-13:** from navy + gold ("Eagle's Eye" brand) to **near-black + neon green/teal** to match the
new logo (committed, `c975761`). **Home hero/header refined further on 2026-10-25** against a new mobile reference image the
owner shared (committed, `fa04b80`; see 11/15).
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
- **Site-wide copy terminology (established 2026-10-25, per the owner's "MatrixEye Website — Complete Copy and Tone
  Refinement" brief — a full copy audit, not just Home):** primary noun is **"assistant"** / "AI assistant" ("chatbot" is
  used only to name the competitor *category*, e.g. "Hosted chatbot builder" on `/product/`'s comparison table, never to
  describe MatrixEye itself); content ingestion is **"crawls and indexes"** (two real, distinct pipeline steps — keep both
  words, don't collapse to one); the UI surface is an **"embeddable chat widget"** ("chat window" remains an acceptable
  plain-English synonym in a few spots, not banned); citations are **"source references"** / "cites its sources"
  interchangeably; the non-answer behaviour is **"abstains"** in technical prose, "says so" / "I couldn't find that" in
  plain copy (the literal UI string is unchanged); reserve the word **"audit"** for an actual independent/third-party
  review — automated CI checks (axe-core accessibility scans, the answer-quality gate) are **"checks"** or "tests", never
  "audited automatically", to avoid overclaiming (fixed in three places: Home's dev-section checklist, `security.astro`,
  `faq.ts` — see section 9 for the full review). **Deployment/package framing:** the owner's brief described the product
  as "npm-module-based"; the `@matrix-eye/*` packages are `"private": true` and not published to the npm registry (the
  real flow, confirmed in `docs/quickstart.md`, is clone-the-repo-and-build). Copy uses accurate framing — "TypeScript
  SDK", npm *package-naming convention* (`@matrix-eye/sdk`), "Open source" — and avoids implying public `npm install`
  works today. **Flag to the owner:** if "npm module" / public npm installability was meant literally (e.g. there's a
  plan to publish before this copy ships), say so and the wording can be revisited; as written it follows the site's
  existing honesty rule (section 10).
- **Register deepened further on 2026-10-26**, after the owner confirmed (by example) that the target voice is denser
  and more formal than the 2026-10-25 pass had gone: declarative infra-vendor sentences built from the terminology
  above, e.g. *"MatrixEye indexes your website content to power context-aware AI conversations. Responses are grounded
  in your published content and include source references for verifiability. When the available context is
  insufficient, the assistant abstains rather than generating unsupported answers."* (the owner's exact tone-reference
  text — now the Home hero lead paragraph verbatim, `f9fba02`). Applied the same register to: Home's "why" cards
  ("Abstains instead of guessing", "Deployable on your own infrastructure"), "how it works" steps ("Sanitize and
  structure content", "Generate a sourced response, or abstain"), "for developers" and "trust" sections ("Engineered to
  operate responsibly on infrastructure it doesn't own"), the CTA band ("Get early access"); `product.astro`'s lead;
  `pricing.astro`'s lead; `security.astro`'s lead; `waitlist.astro`'s lead; `Footer.astro`'s about line; `site.ts`'s
  meta description; and all of `faq.ts`. **Contact, docs and guides were deliberately left in their existing (already
  precise, already technical, just less formally "infra-vendor") voice** — see section 9 for why.
- **Site-wide search added 2026-10-26** (`CommandPalette.astro`, `scripts/command-palette.ts`, mounted once in
  `Base.astro` so it's on every page): a Ctrl/Cmd+K command-palette modal, plus a search button in the header
  (`[data-cmdk-open]`, hidden until a search index is confirmed to exist — same progressive-enhancement pattern as
  the pre-existing docs sidebar search, `DocsSearch.astro`/`search.ts`). It reuses the *same* Pagefind index
  `DocsSearch` uses — Pagefind indexes the whole built `dist/` directory (`astro build && pagefind --site dist`), not
  just `/docs/`, so no new indexing work was needed, only a new UI. Optional **voice search**: a mic button
  (`[data-cmdk-mic]`), shown only when `window.SpeechRecognition`/`webkitSpeechRecognition` exists (feature-detected,
  not polyfilled), transcribes speech into the search box and re-runs the search live. **Required loosening the
  site's `Permissions-Policy` header** (`scripts/headers.mjs`, feeds `serve.mjs` and both `vercel.json` files, which
  were regenerated via `npm run deploy-config`): `microphone=()` (fully blocked) → `microphone=(self)` (first-party
  only) — without this the browser would refuse the mic prompt outright, before even asking the visitor. Header icon
  count on mobile went from 2 to 3 (search, theme, menu — see the icon-order note below); `.icon-btn` sizing at
  `<=860px` automatically applies to the new button too, no separate CSS needed. The header, docs sidebar box and
  this palette are three independent, complementary search entry points by design, not meant to be unified.
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

### Widget templates, launcher icons, and the Template Studio dashboard (added 2026-10-26)

This is a **separate design system from the website above** — the widget must inherit the *customer's* brand, not
MatrixEye's, and the dashboard is MatrixEye's own internal tool, styled independently of both.

- **3 widget templates** (`WidgetOptions.template` / `WidgetTemplate` in `@matrix-eye/sdk`), implemented as real CSS
  in `packages/widget/src/styles.ts` under `[data-template="..."]` selectors, not just a colour swap:
  - `minimal` (default; the pre-existing styling, unmodified, needs no selector of its own) — compact, restrained.
  - `saas` — larger geometry, medium radius (20px panel, 18px launcher), bolder header.
  - `developer` — monospace header/citations/input, smaller radius (10px), denser spacing, smaller base font.
- **6 launcher icons** (`WidgetOptions.launcherIcon` / `LauncherIcon`): `chat` (default), `sparkle`, `headset`,
  `help`, `book`, `dot`. SVG path data lives once, in `packages/widget/src/widget.ts`'s `ICONS` (now exported) —
  the dashboard's icon gallery imports and renders these exact paths rather than hand-copying them, so the two can't drift.
- **Precedence, same pattern as `title`/`greeting` already used:** an explicit `WidgetOptions.template`/`launcherIcon`/
  `color`/`accent` always wins; otherwise the widget applies the project's saved `appearance` (from `GET .../config`)
  once it loads, reactively updating `data-template`, the launcher's icon, and the CSS colour custom properties.
- **A real CSS cascade bug was found and fixed during manual testing** (not caught by any test until one was added
  for it): `.ee-root[data-template="developer"] .ee-panel` and the phone-width media query's
  `.ee-root[data-position] .ee-panel` have identical specificity, so whichever rule is later in the stylesheet wins
  at matching widths — the template rules were appended after the phone media query, so a template's border-radius
  silently beat the phone full-screen behaviour. Fixed by moving the template block to appear *before* that media
  query in `styles.ts` (comment there explains why); regression-tested in a real browser
  (`packages/widget/test/browser.test.ts`, checks `getComputedStyle(...).borderRadius === "0px"` on a 375px
  viewport with the developer template active). **If you add a 4th template, re-check this ordering concern** —
  anything touching `.ee-panel`'s size/radius/position needs to stay before the phone media query, or repeat its
  override inside it.
- **Template Studio (`apps/dashboard`)** is MatrixEye's own dark, neon-green-accented UI (loosely matching the
  website's tokens, hand-written CSS, no shared stylesheet with the website or the widget) — this is deliberate:
  the dashboard's chrome should look like MatrixEye, but nothing it renders for the *widget itself* may leak that
  branding into a customer's preview. The live preview achieves this by running inside a sandboxed `<iframe>`
  (its own browsing context, so the widget's `position: fixed` elements are contained to the device-frame size
  rather than escaping to the real page) and mounting `new ChatWidget(...)` directly (bypassing the public
  `init()`/custom-element entry point, which would create DOM nodes in the *outer* document, not the iframe's) —
  see `docs/dashboard.md` for the full explanation, it is genuinely useful context for extending this app.
- **A real, pre-existing API bug was found and fixed** while wiring the dashboard's Save button: the admin CORS
  registration (`apps/api/src/app.ts`) never set `methods` on the non-public branch, so `@fastify/cors` silently
  defaulted to `GET,HEAD,POST` — every admin `PATCH`/`PUT`/`DELETE` route (settings, rules, project deletion) was
  CORS-blocked from a browser, with no server-side error to find (the browser never sends the real request after a
  failed preflight). Fixed by setting `methods: ["GET","POST","PUT","PATCH","DELETE","OPTIONS"]` explicitly on that
  branch; regression test in `apps/api/test/api.test.ts` asserts the preflight's `access-control-allow-methods`
  contains `PATCH`. This was invisible before because nothing in this repo had previously tried to call an admin
  PUT/PATCH/DELETE route from a browser — the CLI and curl examples in the docs aren't subject to CORS at all.

## 8. Integrations and configuration

Variable names only. Local `.env` exists and holds `MATRIX_EYE_API_KEY` and `MATRIX_EYE_SITE_ORIGINS` (values not recorded).

| Variable | Used by | Meaning |
|---|---|---|
| `MATRIX_EYE_API_KEY` (>=16 chars, required) | API | admin Bearer key |
| `PORT` (8787), host `127.0.0.1` | API | listen address |
| `MATRIX_EYE_DB_PATH` | API | SQLite file |
| `MATRIX_EYE_CORS_ORIGINS` | API | extra browser origins for admin CORS — **must include `http://localhost:5183` to use `apps/dashboard`** against a local API (2026-10-26) |
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

**Checks run on 2026-10-26 (Template Studio: `apps/dashboard`, widget templates/launcher icons, `GET /v1/projects`,
the CORS fix — see 5/7/11 for what changed):**
- `npm run typecheck` (whole monorepo, now including `npm run typecheck -w @matrix-eye/dashboard` added to the
  chain): passes, 0 errors.
- `npm run build` (now including `--workspace @matrix-eye/dashboard`): passes; widget bundle 11.5 KB gzipped
  (was 10.3 KB — still well under the 30 KB CI budget); dashboard's Vite build ~85 KB gzipped JS (not budget-checked
  anywhere, since it's a local dev tool, not shipped to end visitors).
- `npm test`: **488/488 passed** on the final clean run (several runs in a row, see below for why that mattered).
  Fixed two pre-existing strict-equality test assertions broken by the new `appearance` field appearing in
  `PublicConfig`/`ProjectSettings` responses (`apps/api/test/public.test.ts`, `packages/sdk/test/integration.test.ts`)
  — a straightforward, expected update, not a design problem.
- `npm run eval -- --gate`: 100% on every target, run twice across the session. Confirms the engine/abstention
  changes from earlier in this session are unaffected by the dashboard work (which doesn't touch the engine at all).
- `npm audit --omit=dev --audit-level=high`: now **4 vulnerabilities** (1 low, 1 moderate, 2 high) — `zod` and
  `undici` as before (section 12 P0), plus a **new** `fastify` advisory (header validation bypass,
  GHSA-389g-gv7q-r4x8) disclosed since the last check. Confirmed by diff that none of this session's new
  dependencies (`vite`, `@vitejs/plugin-react`, `react`, `react-dom`, all in `apps/dashboard`) introduced it — same
  "advisories get published over time, independent of this project's lockfile changes" pattern as before. Not
  fixed; folded into the existing P0.
- **Manually verified the entire feature end-to-end in Chrome**, not just via automated tests, because this is a
  new, real integration (browser -> admin API -> SQLite -> back to the browser and a live iframe-mounted widget)
  that's easy to get subtly wrong in ways unit tests miss: started a real local API (fresh SQLite DB) and the
  dashboard's dev server, created a real test project, connected, selected the Developer Console template and the
  sparkle icon, set a brand colour, confirmed the live preview (a real `ChatWidget` instance inside a sandboxed
  iframe, talking to the real public API) updated instantly for each change, clicked Save, and confirmed via a
  separate `curl` call that the change was genuinely persisted — then confirmed the public config endpoint serves
  it back out, closing the loop a real visitor would experience. This manual pass is what caught both real bugs
  below (neither was caught by `npm test`, because nothing in the existing suite exercised a browser calling an
  admin PATCH route, or a template active at a phone-width viewport at the same time).
  1. **The admin CORS bug** (section 7): Save silently failed with "Failed to fetch" until this was found and fixed.
  2. **The CSS cascade bug** (section 7): found by checking `getComputedStyle` inside the preview iframe at the
     mobile viewport width, not by looking at it — the visual difference (a few pixels of corner radius) would be
     easy to miss by eye but is a real, meaningful regression (the panel wasn't actually full-width on a phone).
- Added 3 browser tests for the widget (`packages/widget/test/browser.test.ts`: a template's distinctive look
  applies, a chosen launcher icon renders, and a regression test for the cascade bug specifically), 1 for the CORS
  fix (`apps/api/test/api.test.ts`), and extended `apps/api`'s project-listing coverage (self-host: lists
  everything; hosted/control-plane: scoped to the caller's own account, tested in `accounts.test.ts`).
- **Hit, diagnosed, and resolved a severe but environmental (not code) problem while re-verifying:** running
  `apps/website/test/browser.test.ts` repeatedly, in isolation, back-to-back, produced wildly inconsistent results
  (2/30 passed, then 28/30, then 1/30) — far beyond the mild flakiness pattern already known from earlier in this
  session (section 13). `Get-Process` found **15 lingering `chrome`/`chromium`/`node` processes** that repeated
  Playwright launches hadn't cleaned up, and free memory had dropped to ~1.8 GB. Killing them and re-running the
  **full** `npm test` (not the one heavy file in isolation, repeatedly) gave a clean 488/488 immediately. **Lesson
  for future sessions on this machine: if a heavy Playwright-based test file gets re-run many times in a row by
  itself, check `Get-Process chrome,chromium,node` and clean up stragglers before concluding the code is broken —
  this has now happened twice in one session (see section 13) and is a property of this machine/sandbox, not of
  the code being tested.**

**Checks run on 2026-10-26 (site-wide search + voice search, and the first-person decline-wording follow-up — see 5/7/11):**
- `npm run typecheck`: passes, 0 errors — hit one real issue along the way: `search.ts` and the new `command-palette.ts`
  both have no top-level `import`/`export`, so TypeScript treated each as a **global script** rather than a module,
  and their same-named top-level `const root`/`function setup` collided. Fixed by adding `export {};` to the end of
  both files — a no-op at runtime (Vite/Astro already bundles each `<script>` as its own module regardless), but
  required for `tsc` to treat them as separate scopes. **If you add a third such script-only file, give it the same
  treatment up front.**
- `npm run build`: passes; confirmed `dist/pagefind/` is produced and non-empty (the feature's progressive-enhancement
  probe depends on `/pagefind/pagefind-entry.json` existing).
- `npm test`: full suite green (475/475) on the final run. Two unrelated flakes hit mid-session and were confirmed
  pre-existing by re-running alone: `packages/widget-react` (a React `act()` timing test) and, earlier,
  `apps/website/test/browser.test.ts`'s existing real-API waitlist test (ephemeral-port network contention, the same
  pattern documented in section 13 already).
- Added 3 new browser tests (`apps/website/test/browser.test.ts`): Ctrl+K opens the palette from Home and returns a
  result outside `/docs/` (proving the shared index is genuinely site-wide, not scoped to docs); the header button
  opens it and Enter navigates to the top result; the mic button is shown (Chromium exposes `webkitSpeechRecognition`
  in these tests). **Two of these failed on the first write and were fixed, not relaxed to pass:** the first assumed
  the literal `/security/` page would rank top-8 for the query "security" — it didn't (Pagefind's relevance scoring
  favoured docs pages that mention security more densely); changed the query and the assertion to "some result is
  outside `/docs/`", which is what the test actually needs to prove and matches observed real ranking. The second
  tried to simulate "browser without speech recognition" by deleting `webkitSpeechRecognition` via Playwright's
  `addInitScript` — the deletion didn't take effect for reasons not fully root-caused (worth revisiting if someone
  wants that negative case covered), so that half was dropped rather than left flaky; the code path for "hidden by
  default, only shown `if (SpeechRecognitionImpl)`" is simple enough to trust by reading, and is exercised in
  production by any visitor on a non-supporting browser.
- Manually tested in Chrome (not just Playwright): opened the palette by click and by Ctrl+K, confirmed the backdrop,
  focus landing in the input, live results with highlighted matches, Enter-to-navigate, Escape-to-close, and the
  3-icon mobile header layout (390px) — screenshots were not saved (ephemeral verification), but see section 7 for
  what was confirmed working. Checked the browser console for errors/CSP violations while exercising it: none.
- Regenerated `vercel.json` (root and `apps/website/`) via `npm run deploy-config -w @matrix-eye/website` after
  editing `scripts/headers.mjs`'s `Permissions-Policy`, and diffed to confirm only the `microphone=()` →
  `microphone=(self)` line changed in each — this file feeds three places (section 1/8's "one definition" note) and
  a test enforces the committed `vercel.json` matches, so editing `headers.mjs` without regenerating would have
  broken that test.
- First-person decline wording (follow-up to the earlier adaptive-wording change): re-ran `packages/engine`
  (102/102) and the eval gate (100% all targets, unaffected — this eval run uses extractive mode, no model
  configured locally, so the new LLM system-prompt rule wasn't actually exercised by it; it's covered by the engine
  unit/integration tests instead, which don't need a real model).

**Checks run on 2026-10-26 (engine: adaptive/professional decline wording, `packages/engine/src/abstain.ts` — see 5/10/11 for what changed):**
- `npm run typecheck`: passes, 0 errors (whole monorepo). `npm run build`: passes, all workspaces including SDK/widget/widget-react.
- `npm run eval -- --gate`: **passed, 100% across every target** (correctness, citation hit rate, correct abstention,
  unsupported figures, injection resistance) — the decline-wording change does not touch the gates that decide
  *whether* to abstain, only the reply's text when it does, so the eval's abstention-correctness score is unaffected.
- `npm test`: full suite green (470/470 — 6 new tests: `packages/engine/test/abstain.test.ts` plus one new assertion
  in `engine.test.ts`). Focused re-runs of `packages/engine apps/api` (the actual change surface) were run four times
  for extra confidence given this touches core answer behaviour, not just copy: 170/170 every time.
- **Mid-verification, this machine's tests got widely flaky from host resource pressure (low free memory after a long
  session), not from this change** — see section 13's new entry for the full story and how to tell the difference
  from a real regression (a few isolated `npx vitest run packages/engine` invocations showed failures across files
  this change never touched, including crawler robots.txt fetches; a plain `npm test` run immediately after was clean,
  and stopping a leftover `npm run serve` process from earlier in the session helped). Don't over-index on a single
  flaky run when verifying engine changes on this machine — re-run clean before trusting either a pass or a fail.
- Manually previewed `composeAbstainText()` output for five different questions (via a throwaway `tsx` script, deleted
  after) to read quality before updating the two places that quote a literal example (`ChatDemo.astro`'s hero demo,
  the `why-say-i-dont-know.md` guide's blockquote) — see section 11 for the actual sample outputs.

**Checks run on 2026-10-25/26, third pass (deepening the copy register site-wide, see 7/11 for exactly what changed):**
- `npm run typecheck`: passes, 0 errors. `npm run build -w @matrix-eye/website`: passes, 24 pages.
- `npm test`: **464/464 individual tests passed** on the final full run. One intermediate run had a single failure in
  `apps/website/test/browser.test.ts` (`net::ERR_CONNECTION_TIMED_OUT` connecting to the test's own ephemeral-port API
  server) while running alongside `packages/crawler/test/render.test.ts` — re-ran `browser.test.ts` alone (27/27 passed),
  then the full suite again (464/464 passed): confirmed resource-contention flakiness, not a regression.
- Did **not** re-run `npm run eval -- --gate` or `npm audit` (no change to the engine, evals, or dependencies).
- Visually checked Home's "why" and "how it works" sections at 390px width in Chrome after the rewrite — the longer,
  denser sentences still wrap cleanly with no overflow.
- **Scope decision, stated explicitly rather than assumed:** the owner's "work on the entire website" instruction was
  read as "apply this exact register everywhere it improves the copy," not "mechanically rewrite every file regardless
  of fit." Two categories were deliberately left alone a second time: (1) `docs/*.md` and the guides — already precise
  and technical (verified in the second pass, section above), and rewriting detailed, accurate technical documentation
  into marketing-register prose would reduce clarity for the developer audience it's written for, not improve it;
  (2) `contact.astro` — a short transactional form page where infra-vendor phrasing ("indexes your request for
  resolution") would read as absurd, not credible. If the owner specifically wants docs/guides/contact touched too,
  say so and it can be done — this was a judgement call, not an oversight.

**Checks run on 2026-10-25, second pass (site-wide copywriting review, see 7/11 for what changed):**
- `npm run typecheck`: passes, 0 errors.
- `npm run build -w @matrix-eye/website`: passes, 24 pages — after fixing one regression this pass introduced: the new
  `SITE.description` (site.ts) was initially 207 characters, failing `apps/website/test/static.test.ts`'s "every page
  has a unique, sensible title and description" check (hard cap 175 chars, part of the search-engine-basics test).
  Shortened to 172 chars; re-ran that test file alone (16/16 passed) to confirm.
- `npm test`: **464/464 individual tests passed** on the final full run; one test *file*
  (`packages/crawler/test/render.test.ts`) reported a file-level failure from its `afterAll` hook (closing the
  Playwright renderer/server) even though every test in it passed — a teardown-only flake, consistent with the existing
  "render test flaked once under load" note in section 13, not a real regression. Also separately confirmed
  `apps/website/test/browser.test.ts` (which includes a network-dependent "real API" form test) passes cleanly alone
  (34/34) when not competing with other suites for resources.
- Did **not** re-run `npm run eval -- --gate` or `npm audit` this pass (no change to the engine, evals, or dependencies).
- Scope check against the owner's brief: read every page in `apps/website/src/pages`, every file in
  `apps/website/src/data`, `Header.astro`/`Footer.astro`/`ContactForm.astro`, and `apps/website/src/scripts/forms.ts` /
  `search.ts` for user-facing strings (validation errors, empty states, button labels) — all already professional, no
  changes needed beyond what's listed in section 7. Read `docs/quickstart.md`, `docs/how-it-works.md`, `docs/accuracy.md`,
  `docs/sdk.md` in full and grepped all of `docs/*.md` (the 9 public docs) plus `apps/website/src/content/guides/*.md`
  (3 guides) for casual filler words and overclaim phrases ("hallucination-free", "100% accurate", "zero config",
  "guarantee", "chatbot" used to describe MatrixEye itself) — **found none**; these files were already written in the
  precise, hedged, developer-credible voice the brief asks for, so they were **not rewritten** (a lighter-touch review
  than the marketing pages, documented honestly rather than claimed as a full line edit). `privacy.astro`/`terms.astro`
  were deliberately **not touched** — they are legal drafts pending lawyer review (section 1/9), and rewriting legal
  wording for tone risks changing its meaning without legal authority to do so.

**Checks run on 2026-10-25, first pass (Home hero/header restyle, see 7/11 for what changed):**
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
| Decline wording is varied/professional and names the closest page found, but the decline *decision itself* (coverage/key-term gates, model's own decline) is untouched (ADR-003 unaffected) | owner: "let the response not be bland... it should be professional", 2026-10-26 — a UX fix on top of abstention, not a loosening of it | confirmed, see 11/15; `packages/engine/src/abstain.ts` |
| Crawler safety: SSRF guard, robots, injection-text removal (ADR-004) | | confirmed |
| Local model via Ollama, non-thinking models only (ADR-005) | free, private; reasoning models leak thoughts | confirmed |
| Widget: key-less public endpoints + origin allow-list, streaming provisional/final (ADR-006) | page can't hold a secret | confirmed |
| Website: static Astro, strict CSP, nothing third-party, forms to own API (ADR-007) | cheap, safe, fast | confirmed |
| Honest content: prices marked estimates; drafts marked; security gaps listed; comparisons generic | brand is honesty | confirmed |
| Product names in code: `@matrix-eye/*`, `MATRIX_EYE_*`, `matrix-eye-widget.js`, `<matrix-eye-chat>`, `MatrixEyeBot`, CLI `npm run matrix` | rename | confirmed |
| Palette switch to neon green on near-black to match the logo | owner approved "apply all" 2026-10-13 | confirmed (committed `c975761`) |
| Headline/body typography unified to Inter only (Fraunces removed), smaller type scale | owner's 2026-10-25 mobile reference image used one bold sans typeface throughout, not a serif/sans mix, at a visibly smaller size | confirmed, committed (`fa04b80`) |
| Small inline tags (e.g. "Early access") use the plain `.eyebrow` label style, not a bordered/glowing pill badge | owner called the glow-pill treatment "too AI'ish" (2026-10-25) and asked for the site's most-frequently-used label pattern instead | confirmed, committed (`fa04b80`) |
| Reference image said "EARLY ACCESS · NPM MODULE"; shipped copy says "Early access · Open source" instead | the `@matrix-eye/*` packages are `"private": true` and not published to npm — "NPM MODULE" would be an unbuilt claim, which this project's honesty rule (see above) forbids | decision made without asking (low-risk, reversible); **flag to the owner if they specifically wanted the npm wording** (restated and applied site-wide in the 2026-10-25 copy audit, section 7) |
| Site-wide copy audit (nav, hero, Product, Pricing, Security, Bot, Waitlist, footer, FAQ data) rewritten for a technical/developer-credible tone; `docs/*.md` and guides reviewed and left as-is (already met the bar) | owner's detailed copywriting brief, 2026-10-25 (quoted in full in section 15) | confirmed, committed (`8875aff`) |
| Register deepened further into the dense "indexes… context-aware… grounded… source references… abstains" infra-vendor voice, applied to Home, Product, Pricing, Security, Waitlist, Footer, FAQ data, site meta description | owner approved this exact register by example (the paragraph now used verbatim as Home's lead, `f9fba02`) and asked to extend it site-wide, 2026-10-26 | confirmed, see 11/12 for commit status at the end of this audit |
| Do **not** add: fake demo video, invented photos, unbuilt claims ("knowledge base updated automatically"), brand logos of frameworks | honesty/trademark | confirmed advice, owner agreed to "apply all" *as adapted*; see 11 |
| Historical planning PDFs/strategy notes keep "Eagle's Eye" | they are history | confirmed |
| Phase 4: control-plane (accounts/billing/project ownership) on Supabase Postgres; knowledge data stays per-project SQLite on the API VPS disk; hosted inference stays self-hosted Ollama, not a third-party LLM API; budget <$25/mo (ADR-008) | owner decisions D5-D7, 2026-10-13; keeps the "self-hostable, private" story true for the hosted tier; avoids a costly Postgres rewrite of the working FTS5/BM25 ranking | confirmed (architecture only; nothing built yet) |
| Build a brand-new Template Studio feature as a **minimal local admin tool first** (new `apps/dashboard`, no accounts), not the full spec the owner pasted (12 templates, automatic logo/colour discovery, full preview-state matrix, draft/publish lifecycle) and not deferred until the real Phase 4 M3 hosted dashboard exists | asked the owner to scope a very large spec explicitly before writing code, rather than either refusing or building a half-faked version of all of it; owner chose "minimal dashboard first" + "2-3 templates + launcher icons" as the first slice | confirmed by the owner, 2026-10-26; see 11 for exactly what was and was not built |
| React/Vite introduced, but **only** for `apps/dashboard` — the widget itself stays framework-free (`createElement`, no JSX) by design | the dashboard is the first UI in this repo complex enough to need real component state (live multi-panel editor); the widget's zero-framework approach is a deliberate, unrelated constraint (bundle size, "works everywhere") that this doesn't touch | confirmed, see 2/7 |

## 11. Current development position (READ THIS FIRST)

- **2026-10-26, immediately after the Template Studio push: "Please rectify the failed deployments... is the
  dashboard on the website now?"** The owner saw the Template Studio commit (`f043209`) land with CI red and asked
  to fix it, plus asked whether `apps/dashboard` is live on the public website. Answered the second question first:
  **no** — `apps/dashboard` is a local-only admin tool (`npm run dev -w @matrix-eye/dashboard`, port 5183), by
  design (section 7/13's "not a hosted login" note); nothing about it is deployed to the public `apps/website`
  Vercel site, and nothing in this session's work changed that. The CI failure itself was the long-deferred
  `npm audit` P0 (section 12), not anything specific to the dashboard push — fixed properly rather than deferred
  again: `npm audit fix` resolved `undici`/`fastify`/`fast-uri` (non-breaking); `zod` needed the breaking v3→v4 bump
  (`apps/api/package.json`: `^3.24.0` → `^4.6.7`) because v4 removed the deprecated `errorMap` param, requiring two
  call-site fixes in `apps/api/src/schemas.ts` (`waitlistSchema`/`contactSchema`'s consent literal). Verified
  clean: typecheck, full build, full test suite (488/488 — no hidden assertion on old zod v3 error shapes broke),
  eval gate (100% all targets), and `npm audit --omit=dev --audit-level=high` now **0 vulnerabilities** (was 4).
  Commit status: check the hash at the top of this file and `git log` for whether this has landed yet.
- **2026-10-26 session, earlier work (commit hash at the top of this file): Template Studio, first slice.** The
  owner pasted a very large, detailed spec ("Build a Professional Chatbot Template Studio, Branding Engine &
  Launcher Icon Library") — 12 template families, automatic logo/colour discovery from a crawled site, a full
  preview-state matrix, a composable config schema, draft/publish lifecycle, and more, framed as "a dedicated
  section within the existing MatrixEye developer dashboard." **Before writing any code**, checked the premise
  against the actual repo and found it didn't hold: there is no dashboard at all (Phase 4 M3, not started — section
  1), the widget supports exactly one brand colour and nothing else (no templates, no icon library), and the admin
  API has no config-persistence schema for anything like this. Rather than either refusing outright or building a
  disconnected mockup (which the spec's own text explicitly warns against — "do not claim a capability is complete
  if it is only represented by a mockup"), asked the owner two scoping questions: how to handle the missing
  dashboard, and what the first real slice should be. Answers: **build a minimal new local dashboard app**, and
  **start with 2-3 templates + the launcher icon library**, proving the real, end-to-end system before expanding.
  What was actually built, all real and wired to genuine persistence (not simulated):
  - **`packages/widget`**: `template` (`minimal`/`saas`/`developer`) and `launcherIcon` (6 icons) options, real CSS
    (`styles.ts`) and icon SVGs (`widget.ts`'s now-exported `ICONS`), applied either explicitly at init or from the
    project's saved appearance (server config), same override precedence as `title`/`greeting`.
  - **`apps/api`**: `appearance` added to project settings (schema, storage, the public config endpoint); a new
    `GET /v1/projects` (there was no way to list projects at all before — a real, independently useful gap-fill);
    a real CORS bug fixed (section 7/13) that would have silently blocked *any* browser-based admin tool from ever
    saving settings, not just this one.
  - **`packages/sdk`**: `listProjects()`, `WidgetAppearance`/`WidgetTemplate`/`LauncherIcon`/`DEFAULT_APPEARANCE`.
  - **`apps/dashboard`** (new workspace): connect with an admin key (local-only, `localStorage`, never sent
    elsewhere — explicitly not a hosted login, see section 7) → pick a project → Template Studio: template gallery,
    launcher icon gallery, colour fields, and a **live preview that mounts the real widget inside a sandboxed
    iframe** against the real public API (not scripted demo data) → Save, which genuinely `PATCH`es the project.
  - Manually verified the entire loop in Chrome (section 9) — this is what found both real bugs above, neither of
    which any existing automated test would have caught.
  - **Deliberately not built, and said so rather than faking it:** the other 9 template families, most of the 6
    icon families (dot/sparkle/headset/help/book/chat only), automatic brand/logo discovery from a crawl, the
    welcome/typing/error/unanswered preview-state matrix (only the live, open, real-answer state exists), and any
    draft/publish/undo/redo lifecycle beyond Save + Reset. `docs/dashboard.md` states this explicitly so nobody
    mistakes the first slice for the whole spec.
  - **Verified:** section 9 (typecheck, build, 488/488 tests, eval gate, manual end-to-end browser verification,
    two real bugs found and fixed with regression tests). **Commit status:** check the hash at the top of this
    file and `git log` — written up before the final commit landed; section 15 has the play-by-play.
- **2026-10-26 session, earlier work: site-wide search, and the decline wording
  made first-person.** Two follow-ups from the owner, handled in order:
  1. **"It shouldn't make reference to not having the answer from the website... it should act like a human, where he
     answers as if the website is his."** The owner was reacting to the decline wording from the previous commit,
     which (despite fixing the "one bland repeated sentence" problem) still talked ABOUT the website in the third
     person ("this website doesn't cover...", "this website's published content") — a bot reporting on an external
     resource, not a staff member who simply doesn't know. Before changing anything, replied to confirm understanding
     and asked two scoping questions (keep or drop the "closest page" mention; scope to decline only, or also check
     successful answers for the same pattern); owner answered "Yes to both", read as: keep the near-miss mention but
     rephrase it humanly, and also check successful answers. Rewrote the four `abstain.ts` openers and the near-miss
     sentence to first person with zero references to "website"/"site"; added LLM system-prompt rule 7
     (`prompt.ts`, `buildSystemPrompt`) instructing the model to answer as staff in the first person and never name
     "the website"/"the page"/"the source" — extractive mode (verbatim quoting, used with no model configured) was
     deliberately left alone, since paraphrasing there would risk the inaccuracy that mode exists to prevent. Updated
     the two places quoting a literal example (`ChatDemo.astro`, the guide) and added tests asserting no
     "website"/"site" word appears in a decline, at both unit and integration level. Committed `3b3fae2`.
  2. **"Add a search icon/bar... fully functional. Ctrl+K... Add voice search too."** Built the feature described in
     section 7/9 in full: `CommandPalette.astro` + `command-palette.ts`, mounted once in `Base.astro`; a search button
     in `Header.astro` (progressive-enhancement hidden-until-index-confirmed, matching the existing docs search
     pattern); Ctrl/Cmd+K global shortcut with a full focus trap, Escape-to-close, arrow-key result navigation,
     Enter-to-open-top-result; voice input via the Web Speech API, feature-detected (no polyfill), transcribing into
     the search box and re-running the query live. Reused the existing Pagefind index rather than building anything
     new for indexing (it already covers the whole site — see section 7 for why). Had to loosen
     `Permissions-Policy: microphone=()` to `microphone=(self)` in `scripts/headers.mjs` and regenerate both
     `vercel.json` files, or the browser would have refused the microphone prompt outright. Added a `mic` icon to
     `Icon.astro`. Hit and fixed a real TypeScript issue (global-script collision between `search.ts` and
     `command-palette.ts`, see section 9) and two incorrect test assumptions (also section 9) before landing on
     30/30 passing browser tests plus manual verification in Chrome (click-to-open, Ctrl+K, search, navigate, mobile
     3-icon header). Verification: section 9. **Committed and pushed as `ab95e5b`.**
- **2026-10-26 session, earlier work: adaptive, professional decline wording.**
  The owner asked to "improve the performance of the model... let the response not be bland where it says I couldn't
  find the information... it should be professional". Read this as: the abstention *decision* (when to decline) is
  working correctly per the eval gate and is explicitly protected by ADR-003 ("do not weaken") — the actual complaint
  is about the *wording* of the single hard-coded decline sentence
  (`"I couldn't find that on this website. You may want to contact the team directly."`, `packages/engine/src/engine.ts`),
  which was the same for every visitor and every question, and claimed a vague "contact the team" even when no contact
  method was known. Built `packages/engine/src/abstain.ts`: `composeAbstainText(question, nearestPageTitle?)` picks from
  four professional phrasings **deterministically by the question** (not random — the same question always reads the
  same way, which matters for tests and support screenshots), and names the closest page retrieval found, if any,
  honestly flagged as possibly not covering the question. Example real outputs (from a throwaway preview script):
  - *"This website doesn't cover that in enough detail for me to answer confidently."*
  - *"I don't have enough information from this website to answer that accurately."*
  - *"That question isn't addressed in this website's published content."*
  - with a near-miss page: *"...The closest match I found was the \"Campus Facilities\" page, though it may not fully
    cover this."*
  Wired into all three places the engine declines (previously inconsistent: only the main gate-failure path offered
  contact details; the model-declined and extractive-composition-failed paths did not) — `generateWithModel` and
  `generateExtractive` now both receive `facts` so a known contact method is always offered, consistently, wherever
  the engine abstains. The vague always-on "You may want to contact the team directly" sentence is gone entirely;
  contact info is now only mentioned when it's actually known (via `answerFromFacts`), never as an empty gesture.
  **Deliberately did not touch:** the coverage gate, key-term gate, or model-decline detection (`NO_ANSWER_PHRASE` in
  `prompt.ts`) — making the engine *answer more often* was never the ask and would weaken the product's core honesty
  guarantee; this is a presentation fix on top of an unchanged decision. Also updated two places that quoted the old
  literal sentence as a concrete example of real output (not just a generic concept reference, which other docs/README
  mentions are and were left alone): `apps/website/src/components/ChatDemo.astro`'s hero demo bubble, and
  `why-say-i-dont-know.md`'s guide blockquote (plus a short new paragraph explaining the variation — this guide is
  literally about this behaviour, so it benefits from describing the real mechanism). Also fixed
  `docs/troubleshooting.md`'s table row that quoted the exact old string as a symptom to search for, generalising it
  so it stays accurate. **Verified: section 9.** No API/schema/widget changes — `ChatResponse.answer` is still a plain
  string, so nothing downstream (SDK, widget, API) needed touching.
- **2026-10-25 session, first pass (committed `fa04b80`): Home hero/header restyle.** The owner shared a mobile reference screenshot
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
  - **Committed and pushed as `fa04b80`** (both repos) after the owner chose "commit now, handle the npm-audit finding
    separately" when asked. CI run `40217644668` initially failed on a flaky `apps/website/test/browser.test.ts` docs
    table-of-contents test (timing, `Matcher did not succeed in time` — unrelated to this push, never reached the
    `npm audit` step since `npm test` failing skipped it); re-triggered with `gh run rerun --failed`.
- **2026-10-25 session, second pass (committed `8875aff`): site-wide copywriting review.** The
  owner gave a full copywriting brief ("MatrixEye Website — Complete Copy and Tone Refinement", quoted in section 15)
  asking for a professional, developer-credible tone across the **entire** site, not just Home. Work done, all against
  `apps/website/src/`:
  - `data/site.ts`: tightened `tagline` and `description` (the `description` rewrite initially broke the 175-character
    search-engine-basics test at 207 chars; shortened to 172 — section 9).
  - `components/Footer.astro`: one-line about text aligned to the new "assistant… cites its sources" phrasing.
  - `pages/product.astro`: h1 tightened; the four pipeline-stage headings retitled to standard retrieval/generation
    terms ("Crawl and index your site", "Retrieve the relevant evidence", "Generate a grounded answer, or abstain",
    "Verify before it's shown"); "chat window" → "embeddable chat widget" in the fits-your-website section.
  - `pages/pricing.astro`: h1 smoothed. `data/pricing.ts`: two feature bullets reworded for technical precision
    ("crawls and indexes JavaScript-rendered sites", "automatic re-crawling to keep your index current").
  - `pages/security.astro` and `data/faq.ts`: "accessibility audit(s)" → "accessibility checks/tests" (the site has
    **no actual outside audit** — consistent with the same fix already made on Home; see the terminology note in
    section 7).
  - `pages/bot.astro`: fixed a grammar bug ("an MatrixEye assistant" → "a MatrixEye assistant") and "chat window" →
    "chat widget" for consistency, found while reading the page for tone.
  - `pages/waitlist.astro`: h1 aligned with the Home CTA band's phrasing ("Be among the first…").
  - **Deliberately not touched:** `privacy.astro`, `terms.astro` (legal drafts pending lawyer review — rewriting them
    for tone without legal authority risks changing their meaning); `docs/*.md` (9 files) and the 3 guides (reviewed,
    already met the target voice — section 9 has the detail on what was actually checked, since "reviewed and found
    fine" is not the same claim as "rewritten line by line").
  - **Verified green:** typecheck, build, full test suite (464/464 individual tests; one file-level teardown flake in
    the crawler's render test, confirmed pre-existing — section 9). Visually checked `/product/` and `/pricing/` at
    390px width in Chrome to confirm the more technical phrasing didn't cause mobile wrapping/overflow problems, per
    the brief's own instruction 12 — none found.
  - Asked the owner before committing (same pattern as the first pass); confirmed, committed and pushed as `8875aff`.
- **2026-10-25/26 session, third pass (committed below — see the top of this file for the exact hash): deepen the
  register site-wide.** The owner replaced the Home hero lead with their own exact example sentence (verbatim; see
  section 7's "Register deepened further" bullet) and said "you see how the tone is right? work on the entire website
  now" — i.e. the second pass's tone had moved in the right direction but hadn't gone far enough; this specific example
  paragraph is the calibration target. Applied that denser register to: Home's "why"/"how"/"for developers"/"trust"/CTA
  sections (card headings and body copy, not just the lead — section 7 has the full list of what changed), `product.astro`'s
  lead, `pricing.astro`'s lead, `security.astro`'s lead, `waitlist.astro`'s lead, `Footer.astro`'s about line,
  `site.ts`'s meta description (re-shortened to stay under the 175-char test limit), and all of `faq.ts` (every answer,
  not just the first). **Left unchanged, deliberately:** `contact.astro` (a short transactional/functional page — the
  brief's register is for marketing/pitch copy, not a contact form, and over-formalizing it would hurt usability, not
  help it), `bot.astro` beyond the pass-two fixes, `privacy.astro`/`terms.astro` (still legal drafts), and all `docs/*.md`
  + guides (still already in a precise, technical, developer-credible voice — just a notch less formally "infra-vendor"
  than the owner's example; rewriting genuinely excellent, specific technical documentation to chase a marketing
  register risks making it worse, not better — flagged rather than done reflexively, see section 9). **Verified green:**
  typecheck, build (24 pages), full test suite (464/464 — one `browser.test.ts` network-timeout flake on a run that
  mixed with another suite, confirmed pre-existing by re-running the file alone twice), and a mobile (390px) visual
  check of Home's "why"/"how" sections in Chrome to confirm the denser copy still wraps cleanly.
- **Before the 2026-10-25/26 session (i.e. the 2026-10-19 session): nothing had changed since 2026-10-13** — that session only re-verified state and
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
- **Next concrete action (website track, see top of this section):** all three 2026-10-25/26 copy/restyle passes are
  committed and pushed. What's left: fix the `npm audit` P0 (section 12) before the *next* push; resolve the
  npm-vs-open-source wording flag with the owner if it matters to them; and decide whether to extend the third pass's
  denser register to `contact.astro`, `docs/*.md` and the guides, or leave them as deliberately scoped out (section 9).
- **Owner-side open items:** domain, legal entity and contact email, lawyer review of `/privacy/` and `/terms/`, pricing
  validation, decisions D5-D7, a real screen-reader test, the `zod`/`undici` `npm audit` findings (section 9/12).
- **Blockers:** none technical.

## 12. Outstanding work and prioritized backlog

**Phase roadmap:** Phases 1-3 are done. **Phase 4 is next: hosted backend, dashboard, billing.** Architecture decided
(ADR-008) and a milestone plan written (`docs/planning/Phase4-Plan.md`), 2026-10-13. Milestones in order: **M1 accounts/
control-plane Postgres (code committed `c975761`; no real Supabase project yet)** -> M2 VPS deploy of
API+Ollama (not started) -> M3 minimal dashboard (not started) -> M4 billing/Stripe (not started) -> M5 hardening
(not started) before real customers.

**P0 — RESOLVED 2026-10-26.** `npm audit --omit=dev --audit-level=high` had been failing with 4 findings (`zod` high,
`undici` high, `fastify` high, `fast-uri` moderate) since 2026-10-25, deferred across several pushes with the
owner's sign-off each time. Fixed after the owner asked to rectify the failing CI runs: `npm audit fix` resolved
`undici`/`fastify`/`fast-uri` (non-breaking). `zod` needed the breaking upgrade (`^3.24.0` → `^4.6.7` in
`apps/api/package.json`) because v4 removed the deprecated `errorMap` param — the only two call sites
(`waitlistSchema`/`contactSchema`'s `consent: z.literal(true, { errorMap: ... })` in `apps/api/src/schemas.ts`)
were updated to v4's `{ message: "..." }` form. Verified: typecheck, full build, full test suite (488/488 — no
hidden assertion on the old error-message shape broke), eval gate (100% all targets), and `npm audit
--omit=dev --audit-level=high` now reports **0 vulnerabilities**. No other zod call site in the codebase used any
removed v3 API (`z.object`/`z.string`/`z.array`/`z.enum`/`.min`/`.max`/`.optional`/`.nullable`/`.default`/`.trim`/
`.email`/`.url`/`.uuid`/`ZodError.issues`/`.parse`/`.safeParse` are all still valid in v4 and needed no changes).

**P1 (current)**
1. ~~Check CI for the latest commits.~~ Done 2026-10-13: green through `51728e8`.
2. ~~Confirm the Vercel deployment works.~~ Done 2026-10-13: owner confirmed working.
3. ~~Plan Phase 4 with the owner.~~ Done 2026-10-13: ADR-008 + `docs/planning/Phase4-Plan.md`.
4. ~~Implement M1 (accounts/control-plane) in code, including rotate-key.~~ Done 2026-10-13; all checks green (section 11).
5. ~~Commit the M1 changes.~~ Done 2026-10-13 (`c975761`, pushed both repos, CI green).
6. Start M2: provision a real Supabase project + VPS, deploy the API, run Ollama on it.
7. ~~Restyle the Home hero/header to match the owner's 2026-10-25 mobile reference (fonts, sizing, early-access label,
   header icons) and rewrite Home copy to a more professional tone.~~ Done and **committed** 2026-10-25 (`fa04b80`).
8. Fix the `npm audit` P0 above before the next push.
9. ~~Site-wide copywriting review (nav, Product, Pricing, Security, Bot, Waitlist, footer, FAQ data; docs/guides reviewed
   and left as-is).~~ Done and **committed** 2026-10-25 (`8875aff`).
10. ~~Deepen the register site-wide to match the owner's exact tone-reference example (now Home's lead paragraph
    verbatim).~~ Done 2026-10-25/26, all checks green; commit status is at the top of this file.
11. Resolve the "npm module" vs. "open source" wording flag with the owner if it matters to them (section 7/10).
12. Decide whether `contact.astro`, `docs/*.md` and the guides should get the same denser register, or stay as they
    are (deliberately left out of passes two and three — section 9).
13. ~~Make the engine's decline reply adaptive and professional instead of one bland fixed sentence.~~ Done 2026-10-26
    (`packages/engine/src/abstain.ts`); all checks green including the eval gate (section 9/11).
14. ~~Make the decline reply speak in the first person, never naming "the website"/"the site".~~ Done 2026-10-26
    (`3b3fae2`); also added LLM prompt rule 7 for successful answers (section 11).
15. ~~Add a site-wide search icon/bar, Ctrl+K, voice search, fully functional.~~ Done 2026-10-26
    (`CommandPalette.astro`, `command-palette.ts`); all checks green, 30/30 browser tests (section 9/11).
16. Consider revisiting the dropped "browser without speech recognition" test case (section 9) if it matters enough
    to debug properly — the feature itself is correct (read `command-palette.ts`), just that one negative-path test
    wasn't landed.
17. ~~Build a first slice of the owner's Chatbot Template Studio spec: a local dashboard, 2-3 widget templates, the
    launcher icon library, a live preview, real persistence.~~ Done 2026-10-26 (`apps/dashboard`); all checks green,
    manually verified end-to-end, two real bugs found and fixed along the way (section 7/9/11).
18. Decide what to do with the rest of the Template Studio spec the owner pasted (section 11 has the "deliberately
    not built" list in full): more templates, more launcher icons, automatic logo/brand-colour discovery from the
    crawl, a fuller preview-state matrix, draft/publish lifecycle. Each is a real, separable piece of work — don't
    assume the owner wants all of it; ask which (if any) matters next.

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
| `npm audit --omit=dev --audit-level=high` reported up to 4 vulnerabilities between 2026-10-25 and 2026-10-26 (`zod`, `undici`, `fastify`, `fast-uri`); was 0 on 2026-10-13 | new GitHub advisories published against already-installed versions, not a lockfile change made in this project | **Fixed 2026-10-26**, see section 12 P0 — `npm audit fix` for `undici`/`fastify`/`fast-uri`, `zod` v3→v4 bump + two `errorMap`→`message` call-site fixes in `apps/api/src/schemas.ts`. Back to 0 vulnerabilities. |
| **CI's `npm test` step failed 4 times in a row (2026-10-25, commits `fa04b80` through `d8ce0ad`)** on `apps/website/test/browser.test.ts`'s docs-TOC scroll-spy test (`expect.poll` never reaching 1 matching link), while the *identical* suite passed 464/464 every time locally | **Genuinely caused by this session's font change, confirmed, not flakiness** — removing Fraunces and setting the global `h1, h2 { font-weight: 800 }` rule (section 7) changed the rendered height of `.prose h2` headings (the rule applies globally, including inside docs pages, since `.prose h2` only overrides `font-size`). The test scrolled by a **fixed 200px** after `scrollIntoViewIfNeeded()`, which depended on the old heading height to land inside the scroll-spy's ~190px active band; the new heading height pushed it just outside that band. It passed locally on Windows but failed on CI's Linux runner — plausibly sub-pixel font-rendering differences between OSes sitting on opposite sides of an already-marginal boundary, though the root fragility (a fixed pixel offset) was the same on both. **Do not mistake a repeated CI failure for flakiness without checking whether a recent change could plausibly be the cause** — three earlier failures in this same session *were* genuine flakiness (network timeouts, afterAll teardown), which made it easy to misdiagnose this fourth one the same way at first. | Fixed in `apps/website/test/browser.test.ts`: the test now computes the heading's actual position and scrolls to place it at a fixed distance from the viewport top, instead of nudging by a fixed amount after an imprecise `scrollIntoViewIfNeeded()`. Verified: passes alone and in the full suite, locally, 464/464, **and confirmed green on CI** (commit `9458b20`, run `40225059946`: `npm test` step passed). |
| This machine's test runs got noticeably flakier after several hours of a continuous session (2026-10-26): one `npm test` run had 9 failed files/19 failed tests across unrelated packages, cleared up on immediate re-runs with no code change | `Get-CimInstance Win32_OperatingSystem` showed ~2.2 GB free of 16.5 GB total at the time — genuine low-memory pressure on the host, not a code issue. Likely compounded by a leftover `npm run serve` process from earlier in the session that was never stopped. | If a *wide* spread of unrelated test files fail at once (not the same one or two files repeatedly), suspect host resource pressure before suspecting code: check free memory, stop any leftover `npm run serve`/dev-server background processes from earlier in the session, and re-run. Reserve the "did my change cause this" investigation (section 13's CI-regression entry above) for failures that are narrow and repeat on clean re-runs. |
| **Update to the row above (same session, later):** re-running `apps/website/test/browser.test.ts` repeatedly, by itself, produced wildly inconsistent pass counts run to run (2/30, 28/30, 1/30) — far worse than running the *full* `npm test` suite, which was consistently near-clean | `Get-Process chrome,chromium,node` found **15 lingering processes**; each `npx vitest run <file>` invocation that launches real Chromium (via Playwright) apparently doesn't always clean up every child process, and repeating it many times back-to-back accumulates zombies that starve later runs — a property of running the *same heavy file* in a tight loop, not of the full suite (which runs each file once) | Don't repeatedly re-run one heavy Playwright-based test file in isolation to "confirm" a result — one clean run of the *full* `npm test` is a more reliable signal than five repeats of one file. If a result still looks wrong, run `Get-Process chrome,chromium,node \| Measure-Object` (or Task Manager) and kill stragglers before concluding the code is broken. |
| Admin `PATCH`/`PUT`/`DELETE` routes were unreachable from a browser (CORS), discovered 2026-10-26 while building `apps/dashboard` | `@fastify/cors`'s registration for non-public routes (`apps/api/src/app.ts`) never set `methods`, so it defaulted to `GET,HEAD,POST` only, silently CORS-blocking every admin write except `POST`. Invisible before because nothing had tried calling an admin PATCH/PUT/DELETE route from a browser — curl and the CLI aren't subject to CORS. | **Fixed**: `methods: ["GET","POST","PUT","PATCH","DELETE","OPTIONS"]` now set explicitly on that branch; regression test in `apps/api/test/api.test.ts` checks the preflight's `access-control-allow-methods`. |
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
  (**Nuance added 2026-10-26:** this rule is about the *production, public-facing widget* never embedding the
  secret key on a customer's website, where any visitor's browser could read it. `apps/dashboard` is a different
  context — a local admin tool where the person running it deliberately supplies their own key, the same trust
  model as using `curl` or the CLI with that key; it is not a case of the rule being broken, but it must never be
  deployed publicly, where that distinction would stop holding — see section 7.)
- New client-framework UI (first precedent: `apps/dashboard`, 2026-10-26): Vite + React + TypeScript, `.tsx` with
  real JSX (not `createElement`), hand-written CSS per app (no Tailwind/UI kit, no cross-app shared stylesheet).
  The embeddable widget itself stays framework-free by design (bundle size, "works on any site") — a new app
  needing a framework doesn't change that; justify the need each time rather than defaulting to React everywhere.
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
  new, unrelated `npm audit` finding (section 9/12 P0). Asked the owner whether to commit now or fix the audit finding
  first; chose "commit now, handle the audit separately" — **committed and pushed as `fa04b80`** (CI initially failed on
  an unrelated flaky docs test, re-triggered with `gh run rerun --failed`).
- **2026-10-25, same day, second session (continuing immediately after the first): site-wide copywriting review.** The
  owner sent a detailed brief, "MatrixEye Website — Complete Copy and Tone Refinement" (full text preserved here since
  it is the actual spec this work was judged against, not paraphrased elsewhere in this file): act as a senior technical
  copywriter/developer-tools marketer; replace basic/generic/conversational copy with technically credible, concise
  language for developers and technical founders; audit every page and section (nav, hero, features, technical
  explanations, integration instructions, pricing, docs, guides, security, FAQs, forms, buttons, tooltips, empty states,
  errors, footer); don't limit changes to Home; use precise terminology (content indexing, context-aware inference,
  source attribution, verifiable responses, API integration, npm packages, configurable widgets, deployment options,
  data handling) consistently; keep headlines concise; preserve the dark/neon-green/circuit brand identity and the
  existing information architecture/functionality; **do not invent features, integrations, performance figures, security
  guarantees, deployment capabilities, pricing commitments or roadmap promises — inspect the implementation to establish
  what's actually supported**; avoid absolute claims ("hallucination-free", "100% accurate", "zero configuration",
  "complete data ownership") unless substantiated; review CTA labels; check mobile layout doesn't break from longer
  copy; and at the end, report sections updated, terminology conventions established, and any claims requiring
  confirmation. The brief's own product-context paragraph called MatrixEye "an npm-module-based developer product" —
  flagged immediately as a tension with the codebase (`@matrix-eye/*` packages are `private: true`, not published; see
  section 7) and resolved using the brief's own instruction (#9/#10: flag unverifiable claims, don't invent them) rather
  than asking and stalling the larger task. Executed the audit: read every website page, every `src/data/*.ts` file,
  the header/footer/forms components, and the form validation/empty-state strings in `scripts/forms.ts`/`search.ts`;
  read two full docs (`quickstart.md`, `how-it-works.md`) plus spot-read `accuracy.md`/`sdk.md`, and grepped all 9 public
  docs and 3 guides for casual filler and overclaim phrases, finding none — those files already matched the target voice
  and were deliberately left unchanged (not rewritten line-by-line; see section 9 for the precise claim about what was
  checked). Rewrote `site.ts`, `Footer.astro`, `product.astro`, `pricing.astro` + `pricing.ts`, `security.astro`,
  `bot.astro` (also fixed a grammar bug), `faq.ts`, `waitlist.astro`; deliberately left `privacy.astro`/`terms.astro`
  untouched (legal drafts, lawyer review still pending, not mine to rewrite for tone). Established a terminology
  glossary (section 7) and caught one self-introduced regression during verification: the new `SITE.description` broke
  the 175-character site-wide title/description test (207 chars), fixed to 172 and re-verified. Final checks: typecheck
  0 errors, build 24 pages, 464/464 individual tests passing (one file-level teardown-only flake in the crawler's render
  test, confirmed pre-existing by re-running files alone), mobile layout spot-checked at 390px on `/product/` and
  `/pricing/` for wrapping/overflow (none found). Asked the owner before committing; confirmed, **committed and pushed
  as `8875aff`**.
- **2026-10-25/26, fourth pass (committed `f9fba02`): Home lead paragraph swapped for the owner's exact words.** The
  owner pasted their own tone-reference sentence (the one quoted in the third-pass brief above) and asked for it to
  replace Home's hero lead verbatim. Did so, verified typecheck + the website test suite (43/43) green, confirmed no
  mobile overflow, asked before committing, pushed.
- **2026-10-25/26, fifth pass (same session, commit hash recorded at the top of this file): "the tone is right, work on
  the entire website now."** The owner's reaction to the verbatim swap made clear the second pass's tone hadn't gone far
  enough — this exact sentence is the calibration target, and it should be applied broadly, not just to one paragraph.
  Deepened the register across Home (why/how/for-developers/trust/CTA sections — not just the lead), `product.astro`,
  `pricing.astro`, `security.astro`, `waitlist.astro`, `Footer.astro`, `site.ts`, and every FAQ answer (section 7/9 has
  the full list and the reasoning for what was deliberately left out: `contact.astro`, docs, guides, privacy/terms).
  Verified green (typecheck, build, 464/464 tests — one resource-contention flake confirmed pre-existing by re-running
  alone twice) and visually re-checked Home's mobile layout for the denser copy. Updated this file's stale "uncommitted"
  markers left over from passes one through four while writing this entry — several had gone stale because the
  corresponding commits landed in between audits; re-read `git log` before trusting any "uncommitted" claim in this
  file if continuing this session's work.
- **2026-10-25/26, sixth entry (same session): found and fixed a real CI-only regression from the font change, after
  initially misdiagnosing it as flakiness.** `gh run list` showed **every** CI run since the first restyle commit
  (`fa04b80` onward, 4 in a row) failing `npm test`, always on the same docs-TOC scroll-spy test — while the identical
  suite passed locally every time. Having already seen genuine flakiness earlier in this session (an LLM provider test
  timeout, a crawler-test teardown flake), the first instinct was to re-run and move on; `gh run rerun --failed` was
  tried once and failed again, which was the signal this was not flakiness. Root-caused it (section 13 has the full
  explanation): the global `h1, h2 { font-weight: 800 }` change from pass one altered `.prose h2` heading height on
  docs pages, and the test's fixed-200px scroll assumption no longer reliably landed inside the scroll-spy's active
  band — apparently right at a boundary that Windows (local) and CI's Linux runner render just differently enough to
  disagree on. Fixed the test to compute the heading's actual position instead of assuming a fixed offset
  (`apps/website/test/browser.test.ts`). Verified locally (passes alone and in the full 464/464 suite). **Lesson for
  future sessions: a CI failure that survives one re-run is not flakiness — check `git log`/recent diffs for a plausible
  cause before re-running a second time or shrugging it off, especially when CSS/layout changed.** **Confirmed on CI**
  (commit `9458b20`, run `40225059946`): `npm test` passed. The run still shows red overall, but only because of the
  pre-existing, already-flagged `npm audit` P0 (section 9/12/13) — typecheck/build/test/eval all green.
- **2026-10-26, new topic: engine decline wording (first non-copy task this session).** The owner shifted from
  website copy to product behaviour: "work on the performance of the model... let the response not be bland where it
  says I couldn't find the information... it should be professional." Interpreted carefully, since the project's
  abstention behaviour is explicitly protected (ADR-003, "do not weaken"): the fix is to the *wording* of a decline,
  not to whether the engine declines. Found the single hard-coded sentence in `engine.ts` (`ABSTAIN_TEXT`), used in
  three places inconsistently (only one of the three ever offered contact details). Built `packages/engine/src/abstain.ts`
  (`composeAbstainText`, four professional phrasings picked deterministically by the question, plus an honest mention
  of the closest page retrieval found), wired it into all three decline paths, and fixed the inconsistency by passing
  `facts` through to `generateWithModel`/`generateExtractive` so contact details are now always offered when known,
  wherever the engine abstains. Added `packages/engine/test/abstain.test.ts` (5 tests: variation, determinism, no old
  stock phrase, near-miss mention, no near-miss mention) and one new assertion in `engine.test.ts`. Updated two places
  that quoted the old sentence as a literal example of real output (`ChatDemo.astro`, the `why-say-i-dont-know.md`
  guide) and one troubleshooting-doc table row that searched for the exact old string. Verified: typecheck, full
  build, eval gate (100% all targets — confirms the decision logic is untouched), full test suite (470/470), and a
  focused 4x re-run of just `packages/engine apps/api` for extra confidence since this is core product behaviour, not
  copy. **Hit real test flakiness mid-session from host memory pressure** (one run had 9 failed files across packages
  this change never touched) — diagnosed it as environment, not code, by checking free memory and re-running clean;
  documented the distinguishing pattern in section 13 so a future session doesn't have to re-derive it. No API/SDK/
  widget changes needed (the response is still a plain string).
- **2026-10-26, continued: "it shouldn't make reference to not having the answer from the website... act like a
  human... First let me understand if you understand what I mean."** The owner was reacting to the decline wording
  just shipped — still third-person ("this website doesn't cover..."). Replied with a before/after comparison to
  confirm understanding, rather than assuming and changing code immediately, and asked two genuine scoping questions
  (keep the near-miss mention in human phrasing, or drop it; decline-only or also check successful answers). Owner
  replied "Yes to both" — read as keep-but-rephrase, and also check success-path answers. Rewrote `abstain.ts`'s four
  openers and the near-miss sentence to first person, zero "website"/"site" references; added prompt rule 7 for the
  LLM's successful-answer phrasing; left extractive mode (verbatim quoting) alone by design. Updated the example
  quotes in `ChatDemo.astro` and the guide to the new real output. Verified: engine tests (102/102), eval gate (100%,
  extractive mode so the new prompt rule isn't exercised by it), typecheck, build. Committed `3b3fae2`.
- **2026-10-26, same message, second half: "add a search icon/bar... fully functional... Ctrl+K... voice search
  too."** A genuinely new feature, not a copy/wording task — the first of those this session. Investigated first
  rather than assuming: found the site already has Pagefind wired up (`DocsSearch.astro`/`search.ts`), and that
  Pagefind indexes the *entire* built site (`astro build && pagefind --site dist`), not just `/docs/` — so no new
  indexing work was needed, only a new UI surface. Built `CommandPalette.astro` + `command-palette.ts` (mounted once
  in `Base.astro`), a header search button (progressive-enhancement hidden-until-index-exists, matching the existing
  pattern), full keyboard support (Ctrl/Cmd+K, Escape, arrow-key navigation, Enter-to-open-top-result, a real focus
  trap), and voice search via the feature-detected Web Speech API. Discovered and fixed a real blocker along the
  way: the site's `Permissions-Policy` header explicitly set `microphone=()`, which would have silently broken voice
  search in production (the browser refuses the permission prompt outright under that policy) — loosened it to
  `microphone=(self)` in `scripts/headers.mjs` and regenerated both `vercel.json` files via the existing
  `deploy-config` script, confirming by diff that only that one line changed. Hit and fixed a real TypeScript issue
  (two script files with no top-level import/export collided in global scope once there were two of them — added
  `export {};` to both) and two incorrect assumptions in the first draft of the browser tests (a ranking assumption
  that didn't match Pagefind's actual relevance scoring; a Playwright API-removal simulation that didn't take
  effect and wasn't worth the time to root-cause for a secondary negative-path test) — fixed the first properly,
  consciously dropped the second rather than leaving a flaky or fake-passing test. Manually verified in Chrome:
  click-to-open, Ctrl+K from multiple pages, live search with highlighted results, Enter navigation, Escape close,
  console free of errors/CSP violations, and the 3-icon mobile header layout. Final verification: typecheck, full
  build, full test suite (475/475, one unrelated flake in `widget-react` confirmed pre-existing by re-running alone),
  30/30 browser tests including 3 new ones for this feature. **Committed and pushed as `ab95e5b`.**
- **2026-10-26, largest single addition this session: "Thank you for your work and all that you've done. can you
  add..." followed by a ~17-section pasted spec, "MatrixEye — Build a Professional Chatbot Template Studio,
  Branding Engine & Launcher Icon Library."** The spec described 12 visual templates, a 6-family/30+-icon launcher
  library, automatic brand/logo/colour discovery from the crawler, a full preview-state matrix, a draft/publish/
  undo-redo lifecycle, a developer API, and said to build it "as a dedicated section within the existing MatrixEye
  developer dashboard" — explicitly not a mockup. Investigated before writing any code, per this project's standing
  rule, and found the premise false: there is **no dashboard app at all** (Phase 4 M3, not started, per this file's
  own backlog), the widget supports exactly one brand colour with no template/icon concept, and there is no settings
  field or API route for any of this. Given the scale of the mismatch, used AskUserQuestion twice rather than
  guessing: (1) how to handle the missing dashboard → owner chose **"Build a minimal new dashboard app first."**
  (2) what the first real slice should be, given 12 templates/30+ icons/branding-discovery/preview-matrix/lifecycle
  were all in the spec → owner chose **"2–3 templates + the launcher icon library."** Built, end to end, for real
  (no mockup, no stub data):
  - **Widget** (`packages/widget`): `template`/`launcherIcon` options; 3 templates (`minimal`/`saas`/`developer`,
    real CSS geometry differences incl. monospace fonts for `developer`); extended `ICONS` (now exported) to 6
    icons; `applySavedAppearance()` applies server-saved appearance reactively, same explicit-option-wins precedence
    as `title`/`greeting`.
  - **SDK** (`packages/sdk`): `WidgetTemplate`, `LauncherIcon`, `WidgetAppearance`, `DEFAULT_APPEARANCE`; `appearance`
    added to `PublicConfig`/`ProjectSettings`; `listProjects()`.
  - **API** (`apps/api`): `appearance` in settings schema/repositories with one-level deep-merge (so a partial
    appearance PATCH can't wipe sibling fields — caught proactively, not from a bug report); public `/config` now
    serves `appearance`; new `GET /v1/projects` (scoped per-account in hosted mode).
  - **New `apps/dashboard` workspace** (Vite + React, port 5183): a genuinely new app — `ConnectForm` →
    `ProjectPicker` → `Studio`, template gallery, icon gallery, colour fields, and a **live preview that mounts the
    real, unmodified `ChatWidget` class inside a sandboxed iframe** (not a styled mockup) so `position: fixed`
    resolves against the device-frame viewport — switching to the mobile preview genuinely exercises the widget's
    own phone-width CSS. Admin key stored only in `localStorage`, same trust model as the CLI — explicitly never to
    be deployed publicly with a key baked in (stated in both the code and `docs/dashboard.md`).
  - Docs: new `docs/dashboard.md`, updates to `docs/widget.md`, `docs/api.md`, `docs/changelog.md`,
    `apps/website/src/data/docs.ts`.
  - Found and fixed **two real bugs via manual Chrome testing that no existing automated test caught**: (1) the
    admin CORS branch in `apps/api/src/app.ts` never set `methods`, so `@fastify/cors` defaulted to GET/HEAD/POST
    only, silently blocking every admin PATCH/PUT/DELETE (settings, rules, deletion) from any browser-based client,
    not just this dashboard — diagnosed via a manual `curl -X OPTIONS` preflight check against the running server;
    (2) a CSS specificity tie between the new template block and the existing phone-width media query, decided by
    source order, meant the `developer` template's border-radius silently beat the phone full-screen override on
    narrow viewports — diagnosed via `getComputedStyle` in the live iframe preview, fixed by reordering `styles.ts`,
    and locked in with a permanent regression test. Also self-caught (before it shipped, not from review) a mutation
    bug in `Studio.tsx` where the save handler wrote directly onto a `saved` object that could alias the shared
    `DEFAULT_APPEARANCE` module constant; converted to proper `useState` fed from the server's own response.
  - Verified end-to-end in a real browser, not just automated tests: started a real API against a fresh SQLite DB,
    created a real project via curl, ran the dashboard dev server, connected, switched templates/icons, set a brand
    colour, saved, and confirmed via a separate `curl GET` that the change persisted to the database and is served
    back out by the public `/config` endpoint. Final automated verification: typecheck and build (both now
    including `apps/dashboard`), full test suite (488/488), eval gate (100% all targets), `npm audit
    --omit=dev --audit-level=high` re-checked and confirmed the new `fastify` advisory is pre-existing drift, not
    caused by this session's new dependencies (`vite`, `@vitejs/plugin-react`, `react`, `react-dom`) — lockfile diff
    checked directly.
  - Deliberately deferred, per the owner's own scoping choice, not forgotten: 9 more templates (12 in the spec, 3
    built), ~24 more icons, automatic brand/logo discovery from the crawl, the full welcome/typing/error/unanswered
    preview-state matrix, and a draft/publish/undo-redo lifecycle (see section 12, #18). Not to be started unprompted.

---
## Memory maintenance policy
Update this file whenever a feature, route, schema, integration, decision, bug, check result or the "next action" changes; do
it as you go, not at the end. Edit entries in place (no duplicate appends); never mark something verified unless you ran the
check; never record secrets. Re-validate sections 9 and 11 against `git status` and a fresh `npm run typecheck && npm test`
at the start of any session that continues the restyle.
