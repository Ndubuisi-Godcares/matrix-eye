# MatrixEye: project memory (handover document)

> **For a new Claude Code session:** read this whole file before planning or changing code. It is the authoritative
> handover. Section 11 says exactly where work stopped; section 9 says what was and was not verified.
> Last audit: **2026-10-13**, against git `main` at `f3c2664` **plus uncommitted changes** (see 11).
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
- **Stage:** Phases 1-3 done (engine; SDK/widget/streaming/API; marketing + docs website). **Phase 4 (hosted backend,
  dashboard, billing) not started.** Nothing is deployed to a live domain (a Vercel import was attempted; see 9).
- **Project-wide constraints (from the owner, REPORTED):** act as a senior developer (clean file organisation, code
  comments); user works in VS Code on Windows; PDFs use the **Yu Mincho** font; be honest about limits (eval numbers are a
  regression baseline, not real-world proof); confirm before pushing to a *new* destination; no secrets in git.
- **Open owner decisions:** D5 (hosted inference choice), D6 (budget cap), D7 (hours); domain; legal entity + public
  contact email; lawyer review of privacy/terms; pricing validation; hosting account.

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
| Website | Astro 7.3.8 (static), Sätteri Markdown processor, Shiki, Pagefind search, sharp (image assets), self-hosted variable fonts (Inter, Fraunces, JetBrains Mono). |
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
| `/` | Home: hero (pill, gradient headline, feature tiles, CTA, stack row, animated scene), "why", "how", code tabs, FAQ, CTA | **Restyle in progress, uncommitted** (see 11) |
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
| **Hosted service, dashboard, billing, accounts, analytics, email notifications** | none | **planned (Phase 4), nothing exists** | |

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
new logo. The change is **uncommitted and incomplete** (section 11).
- Tokens live at the top of `apps/website/src/styles/global.css` (`:root`, dark under `prefers-color-scheme` guarded by
  `:root:not([data-theme="light"])`, and `:root[data-theme="dark"]`). New tokens: `--grad` (teal->lime), `--grad-text`.
  Dark: bg `#04080c`, accent `#2cf2a6`; light: bg `#f5faf7`, accent `#14b87a`, buttons use the gradient.
- Fonts: Inter (body), **Fraunces** (headlines; owner said "I love the font"), JetBrains Mono (code). All self-hosted.
- Logo: `src/components/Logo.astro` shows `/brand/mark.webp` (emblem only, transparent; owner asked for no lettering and a
  small size: 30 px header, 36 px footer). Dark theme: no tile; light theme: dark rounded tile (`.logo-badge`).
  Assets are generated by `scripts/make-assets.mjs` from `brand/matrix-eye-logo.png` (colour-to-alpha black removal).
- Layout: container max 1280 px; header wider (1760 px); docs 3-column. Hero: pill, gradient headline words, 3 tiles,
  gradient CTA, "works with" chips, animated scene (`HeroScene.astro` + `ChatDemo.astro`: typing dots, crawl card, verified/
  decline badges, rings, chat input, Source button).
- Motion: scroll reveal (`.sr`), hero entrance, hover lifts, reading-progress bar, TOC scroll-spy, header shadow. All
  disabled under `prefers-reduced-motion` (final state shown); content visible without JS.
- Accessibility rules (tested): AA contrast both themes, visible focus, skip link, aria-linked form errors, keyboard menu
  (Escape), tab arrows, tables scroll in a focusable region on small screens, no sideways scroll at 375 px.
- Owner design preferences: header = logo extreme left, nav centred, theme toggle + CTA extreme right; "MatrixEye" one
  word; wanted copy of the reference hero (pill, gradient words, tiles, stack row, richer chat card) but **not** a fake
  "Watch demo" video button, invented building photo, or unbuilt claims (see 10).

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

**Checks actually run during this audit (2026-10-13) on the working tree (committed + uncommitted changes):**
- `npm run build` (sdk, widget, widget-react): **passes** (widget 10.3 KB gz).
- `npm test`: **447 passed, 1 failed** (448). Failure: `apps/website/test/browser.test.ts > switches and remembers the
  colour theme`: it asserts the dark body background `rgb(10, 19, 32)`, but the new palette is `#04080c`. Cause confirmed
  (test not updated after the palette change). Earlier today the full suite was 448/448 on `f3c2664`.
- `npm run typecheck`: **fails, 1 error**: `apps/website/src/components/Icon.astro` has a **duplicate `lock` key** (existing
  `lock` plus one added during the restyle); `bolt` duplicates the existing `zap` icon. The 3 root `tsc` runs pass; the
  failure is in `astro check`.
- Eval gate (`npm run eval -- --gate`): passed earlier today at `f3c2664`; **not re-run** on the working tree (engine untouched).
- CI on GitHub: **not checked** for commits after the rename. Vercel deployment: **never confirmed successful**
  (a build failure "No Output Directory named public" was fixed by `vercel.json` in `e302ac4`; the user then imported the
  project; the result was not reported back).
- Visual review: pages were screenshot-reviewed during design iterations; the **new green restyle has not been visually reviewed**.
- axe accessibility test passed on all pages in light/dark at `f3c2664`; **not re-run** on the restyle.

**Known gaps/debt:** no outside security audit; no screen-reader testing; no multi-tenant auth; no DB migrations; no
retention/erasure UI for waitlist (owner can delete via API); English only; keyword retrieval can wrongly decline unusual
phrasing; small local models sometimes decline two-part questions; widget/`Origin` limit; privacy/terms are drafts.
**Minor defect:** root `package.json` `description` contains mojibake (`â€”` where an em dash was intended; present in git since
before the rename).

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
| Palette switch to neon green on near-black to match the logo | owner approved "apply all" 2026-10-13 | **in progress** |
| Do **not** add: fake demo video, invented photos, unbuilt claims ("knowledge base updated automatically"), brand logos of frameworks | honesty/trademark | confirmed advice, owner agreed to "apply all" *as adapted*; see 11 |
| Historical planning PDFs/strategy notes keep "Eagle's Eye" | they are history | confirmed |

## 11. Current development position (READ THIS FIRST)

- **Objective:** finish the **website restyle to the neon green/teal palette and the reference-style hero**, plus use
  "MatrixEye" (one word) everywhere, then commit/push.
- **Done toward it (all UNCOMMITTED in the working tree, 55 files changed vs `f3c2664`):**
  1. "Matrix Eye" -> "MatrixEye" text replacement across ~53 tracked text files (not PDFs, not `docs/planning`, not lockfile).
  2. `global.css`: new light/dark tokens, gradient primary button, gradient headline class `.grad-text`, pill, feature
     tiles, stack chips, richer chat card styles (`.reply`, `.source-btn`, `.chip--page`, `.chat-input`), bolder rings; old
     gold underline removed.
  3. `index.astro` hero rewritten (pill, gradient words, tiles, CTA "Join the waitlist" + "See how it works" -> `/product/`,
     "Works with any website stack" as plain text chips: React, Next.js, Vue, WordPress, Plain HTML).
  4. `ChatDemo.astro`: Source button, cited-page chip, input bar. `Icon.astro`: added `file`, `bolt`, `lock`, `external`.
- **Stopped at:** the CSS/markup were written but **never built, viewed or tested**. Known breakages listed in 9
  (duplicate `lock` icon key -> `astro check` fails; theme test expects old dark background).
- **Next concrete actions (in order):**
  1. `apps/website/src/components/Icon.astro`: delete the duplicate `lock` entry (keep one; both are lock icons) and either
     use existing `zap` instead of `bolt` in `index.astro` or keep `bolt`.
  2. Update `apps/website/test/browser.test.ts` (~line 282) dark background expectation to `rgb(4, 8, 12)`.
  3. `npm run build -w @matrix-eye/website`, then screenshot `/`, `/pricing/`, `/docs/api/`, `/product/` in light and dark
     (Playwright is installed; a Chrome extension tool was also used). Fix contrast/legibility problems (neon on light bg is the
     risk: `--grad-text` light values and `.logo-badge`), and check the other hard-coded colours in `global.css`
     (`#4ade80`, `#16a34a`, `#15803d`, cta-band, `.hero::before` glow uses `--accent`) and `Base.astro` `theme-color` meta
     (`#fbf9f4` / `#0a1320` are still the OLD palette -> update to `#f5faf7` / `#04080c`), plus `make-og.mjs` and
     `make-assets.mjs` tile colour (currently `#0a1320`) -> regenerate `og.png` and icons.
  4. Reword claims copied from the reference: it said "Live: knowledge base updated automatically" (not built: do not add);
     the hero uses "Self-host, private" instead of "Secure and private". Keep it that way.
  5. Run `npm run typecheck`, `npm test` (incl. axe in both themes, mobile overflow), `npm run eval -- --gate`; then commit and
     `git push` (pushes to both repos) and check CI (`gh run list --limit 1`).
  6. Update this file, the README (hero wording), `docs/changelog.md`, and add ADR note if the palette becomes permanent.
- **Files to inspect before continuing:** `apps/website/src/styles/global.css`, `src/pages/index.astro`,
  `src/components/{ChatDemo,HeroScene,Icon,Logo}.astro`, `test/browser.test.ts`, `scripts/make-assets.mjs`, `scripts/make-og.mjs`.
- **Blockers:** none technical. Waiting on the owner for: Vercel result, domain, legal entity/contact email, pricing validation.

## 12. Outstanding work and prioritized backlog

**P0** (none blocking the engine). Typecheck and one browser test currently fail only because of the unfinished restyle (item P1-1).

**P1 (current objective)**
1. Finish/verify the neon restyle (see 11). *Accept:* typecheck, all tests, axe both themes, visual review, CI green.
2. Confirm the Vercel deployment works (import `apps/website`, Root Directory `apps/website` or repo root; env `PUBLIC_SITE_URL`;
   leave `PUBLIC_API_URL` unset until the API is hosted; forms then say "not connected yet" by design).
3. Commit and push; verify CI.

**P2**
- Host the API somewhere with a persistent disk or move to Postgres (Phase 4); set `PUBLIC_API_URL`, `MATRIX_EYE_SITE_ORIGINS`, re-run `npm run deploy-config` with the API origin.
- Fill `.env.example` gaps; fix package.json description mojibake; regenerate planning PDFs only if the owner asks.
- Choose domain; update `matrixeye.ai` placeholders; legal entity + contact email; lawyer review of `/privacy/`, `/terms/`.
- Validate pricing with real conversations; decide D5/D6/D7.
- Real screen-reader test (NVDA/VoiceOver). Consider outside security review before launch.

**P3**
- Phase 4: dashboard, accounts, billing, hosted crawling/re-crawl scheduling, analytics, email notifications, retrieval upgrade (only if it measurably improves evals), more languages, PDF/login-gated page support, Vue/WordPress/HTML integration guides that are actually tested.

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
- **2026-10-13:** owner shared a reference hero and approved "apply all" + "MatrixEye one word". Started the green restyle (uncommitted; unverified). Then created this `memory.md` and `CLAUDE.md` (audit: build ok, tests 447/448, typecheck 1 error from the unfinished restyle). **Next action: section 11, step 1.**

---
## Memory maintenance policy
Update this file whenever a feature, route, schema, integration, decision, bug, check result or the "next action" changes; do
it as you go, not at the end. Edit entries in place (no duplicate appends); never mark something verified unless you ran the
check; never record secrets. Re-validate sections 9 and 11 against `git status` and a fresh `npm run typecheck && npm test`
at the start of any session that continues the restyle.
