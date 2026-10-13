# ADR-008: Phase 4 hosted backend architecture

- **Status:** accepted
- **Date:** 2026-10-13

## Context

Phases 1-3 built a complete self-hostable product: engine, crawler, widget, SDK, and a single-tenant API secured by one
admin Bearer key, backed by built-in SQLite. Phase 4 adds the commercial side: customer accounts, a dashboard, and billing,
so MatrixEye can be offered as a hosted service alongside the self-host option.

Constraints from the owner (D5-D7, 2026-10-13):
- **D6 budget:** under $25/month for all hosted infra while pre-revenue.
- **D7 hours:** near full-time (20+ hrs/week) available right now.
- **D5 inference:** hosted tier stays on self-hosted Ollama (same models as local/self-host), not a third-party LLM API.
  This keeps the "self-hostable, private" story true for the hosted tier too, and avoids per-token cost that would blow
  the budget before there is revenue to cover it.

The existing single SQLite file (`MATRIX_EYE_DB_PATH`) has no multi-tenant isolation, no migrations, and no concept of a
customer account. Postgres is a better fit for the new control-plane data (accounts, subscriptions, billing), but the
knowledge store's SQLite FTS5/BM25 ranking (`packages/knowledge`) is already tuned and working well (section 9 of
`memory.md`); rewriting it onto Postgres full-text search is a large, unnecessary rewrite under a tight budget and a
near-term timeline.

## Decisions

**Split the data plane from the control plane.** Account/billing/project-metadata tables move to a managed Postgres
(Supabase). Per-project knowledge data (pages, chunks, FTS5 index, facts) stays as SQLite files on the API host's disk,
one file per project, exactly as today — only the *ownership* of a project (which account it belongs to) moves to
Postgres. This keeps the retrieval engine, chunker, and ranking code (`packages/knowledge`, `packages/engine`) untouched.

**Supabase for Postgres + auth.** Supabase's free tier covers early-stage usage and bundles authentication (email/password,
magic link) for free, which avoids building account signup/login/password-reset from scratch — significant scope
reduction for one person building this part-time-to-full-time. `apps/api/src/repositories.ts` gains a Postgres client
alongside the existing SQLite `node:sqlite` access; a migration tool (e.g. a small SQL migration runner, since there is
currently none — section 6 of `memory.md`) is introduced for the Postgres tables only. The SQLite knowledge store keeps
its current `CREATE TABLE IF NOT EXISTS` approach.

**A single small VPS for the API + Ollama.** The hosted API process and the Ollama model it calls run on the same VPS
(e.g. a 4 GB RAM box — Hetzner CPX21 or equivalent, roughly $10-13/month), leaving headroom under the $25/month cap for
Supabase (free tier) and a domain. This also keeps latency low (no network hop to a separate inference host). The
existing local-model recommendation (`qwen3:4b-instruct`, CPU-capable, non-thinking — ADR-005) is the default hosted
model too, since it was already chosen for being light enough to run without a GPU.

**Stripe for billing**, introduced only once the dashboard has something worth paying for (accounts + a working hosted
project). Plans mirror the existing `/pricing/` page tiers (Developer Pro, Business Hosted); Stripe test mode first,
live keys only after the owner has a legal entity and contact email (open items, section 1 of `memory.md`).

**Per-tenant limits from day one.** Because one shared VPS runs Ollama for every hosted customer, each account gets a
request-rate and concurrent-crawl cap (extending the existing per-project rate-limit pattern in `apps/api`) so one
customer cannot starve another. This is a hosted-tier addition, not a rework of the existing public-endpoint limits.

## Consequences

- Two datastores to operate: Supabase Postgres (control plane) and per-project SQLite files on the VPS disk (data
  plane). Backups differ: Supabase manages Postgres backups; the SQLite files need their own backup job (not yet
  designed — add to the Phase 4 backlog).
- The VPS becomes a stateful box with persistent disk, not a disposable/serverless container — redeploys must not wipe
  `/data`. Standard VPS discipline (unattended upgrades, firewall, SSH key only) is needed since it is now
  internet-facing with customer data, not a local dev machine.
- Inference quality and latency are capped by what one small CPU box can do concurrently. This is the main technical
  risk of the Ollama-on-shared-VPS choice: it must be load-tested with a handful of simulated concurrent hosted
  projects before onboarding real paying customers, and the plan should define a trigger for moving to a bigger box or
  a second inference host (e.g. a response-time or queue-depth threshold) rather than discovering it in production.
- Moving off Supabase's free tier or the $10-13/month VPS later (more accounts, more load) is a capacity question, not
  an architecture change — the control/data-plane split holds either way.
- D5-D7 are now resolved; update `memory.md` section 1 (open owner decisions) accordingly.
