# Phase 4 plan: hosted backend, dashboard, billing

- **Status:** draft, agreed scope not yet started
- **Date:** 2026-10-13
- **Architecture decision:** see `docs/adr/ADR-008-phase4-hosted-architecture.md`

## Goal

Offer MatrixEye as a hosted service (in addition to self-host) to a small number of paying customers, without
overspending before there is revenue to justify it, and without weakening the honesty guarantees (grounded answers +
abstention, ADR-003) that are the product's differentiator.

## Out of scope for this phase

Anything already covered by the existing self-host product (crawler, engine, widget, SDK, CLI) is not being rebuilt —
Phase 4 adds *accounts, hosting, and billing* around it. Also explicitly deferred: more languages, PDF/login-gated page
crawling, a retrieval-quality upgrade (only revisit if evals show it is needed), and new framework integration guides.
These stay in the Phase 3 backlog (`memory.md` section 12, P3) until Phase 4's core is live.

## Milestones (sequential; each should be independently usable/testable before starting the next)

### M1 — Accounts and control-plane database
- **Code done (2026-10-13):** `apps/api/src/control-plane/` — Postgres migration runner, `AccountRepository`
  (per-account API key, hashed; `rotate-key` re-proves identity with a password and issues a fresh one), a minimal
  `SupabaseAuthClient` (signup/login against GoTrue's REST API, no SDK), and an account Bearer-auth hook with the same
  shape as the legacy single-key hook. Wired into `app.ts`/`config.ts`/`server.ts`, opt-in via three env vars, with
  self-host mode completely unaffected. Tests use `pg-mem` + a fake GoTrue server (offline, no CI changes).
- **Not done:** no real Supabase project exists yet (code only talks to whatever `MATRIX_EYE_SUPABASE_URL` points at);
  `projects`/`crawl_jobs`/`feedback` stay SQLite as originally planned (ownership moved to Postgres, not the rows
  themselves, per ADR-008's data/control-plane split — `waitlist`/`contact_messages` were left SQLite-only and
  operator-only, since in hosted mode they are not a per-customer resource).
- **Done when:** a developer can sign up, log in, and the API enforces that a project belongs to one account. ✅ met
  in code; needs a real Supabase project to exercise end to end before calling M1 fully done.

### M2 — VPS deployment of the API + Ollama
- Provision the VPS (budget ADR-008), install Node 24, deploy `apps/api`, confirm `qwen3:4b-instruct` runs under Ollama
  on the box with acceptable latency for one concurrent user.
- TLS (e.g. Caddy/Let's Encrypt in front of Fastify), firewall, SSH-key-only access, automated OS security updates.
- Point `PUBLIC_API_URL` at the live API; re-run `npm run deploy-config` so the website's CSP and forms target it; the
  waitlist/contact forms stop saying "not connected yet".
- **Done when:** the deployed marketing site's widget demo and forms work end-to-end against the live API.

### M3 — Minimal dashboard
- A small authenticated web UI (reuse Astro + a thin client, or a separate SPA — decide at M3 start, not before) for a
  logged-in account to: create a project, trigger a crawl, see crawl status/last result, view recent conversations and
  feedback, copy the embed `<script>` tag.
- No billing UI yet — single free "Developer" tier for every account until M4.
- **Done when:** the owner can onboard a real test customer through the dashboard alone, no manual DB edits.

### M4 — Billing
- Stripe integration (test mode first): plans mirroring `/pricing/` (Developer Pro, Business Hosted), checkout, webhook
  handling for subscription state, enforcement of plan limits (crawl frequency/size, request volume) using the
  per-tenant caps from ADR-008.
- Legal/content prerequisites (owner-side, tracked in `memory.md` section 1): domain, legal entity, contact email,
  lawyer-reviewed `/privacy/` and `/terms/` — billing should not go live before these are real, not drafts.
- **Done when:** a test customer can subscribe, get charged in Stripe test mode, and plan limits are enforced.

### M5 — Hardening before real customers
- Backup job for per-project SQLite files on the VPS disk (ADR-008 risk).
- Load test: simulate several concurrent hosted projects hitting Ollama on the shared VPS; confirm response times are
  acceptable or define the upgrade trigger (ADR-008).
- Monitoring/alerting for the VPS and API (at minimum: uptime check, disk space, error rate).
- Revisit the outside security review item (`memory.md` section 12, P2) before accepting real payment data.

## Decisions resolved this session (2026-10-13)

| Decision | Resolution |
|---|---|
| D5 hosted inference | Self-hosted Ollama, same models as self-host tier, running on the API VPS (not a third-party LLM API) |
| D6 budget cap | Under $25/month total hosted infra while pre-revenue |
| D7 owner hours | Near full-time, 20+ hrs/week available now |

Still open (owner-side, unblocked by this plan but needed before milestones that depend on them): domain, legal entity,
public contact email, lawyer review of `/privacy/`/`/terms/` (blocks M4), pricing validation (should happen before M4
locks in plan prices).

## Risks to watch

- **Shared-VPS inference capacity** is the main technical risk — see ADR-008 consequences. Do not onboard real paying
  customers past M3 without the M5 load test.
- **Scope creep in M3 (dashboard):** keep it to the "done when" bar above; a fuller dashboard (analytics charts, team
  seats, etc.) is Phase 4-plus, not a blocker for the first paying customer.
- **Billing before legal readiness:** M4 must not go live (even in Stripe test-to-live transition) before the owner-side
  legal items are done.
