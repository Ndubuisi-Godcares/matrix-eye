# ADR-002: SQLite FTS5 (BM25) as the default knowledge store, behind an interface

- **Status:** accepted
- **Date:** 2026-10-12
- **Amends:** the Master Plan's "PostgreSQL full-text search" for Phase 1

## Context

Phase 1 needs ranked keyword retrieval over crawled pages. The plan named PostgreSQL. During build we
found Node 24 ships `node:sqlite` with FTS5, Porter stemming and a BM25 ranking function built in.

## Decision

- Implement `KnowledgeStore` (see `packages/knowledge/src/store.ts`) with SQLite FTS5 first.
- Keep the **interface** as the contract. The hosted multi-tenant service gets a PostgreSQL
  implementation in Phase 4; nothing above the store changes.
- Rank with **two queries fused by reciprocal-rank fusion (RRF)**: a strict query on the visitor's own
  words (weight 2) and a synonym-expanded query (weight 1). Expansion rescues "how much does it cost?"
  against a page that says "tuition", without letting loose matches outrank exact ones.
- FTS5 columns are weighted: page title 4, heading path 3, body 1.

## Why not PostgreSQL first

Zero setup for self-hosters and tests (a file, or `:memory:`), no server to run in CI, and a single
file to back up. Both options give BM25-class ranking; the interface keeps the choice reversible.

## Consequences

- Self-hosting is `npm install && npm run dev:api`, no database server.
- `node:sqlite` is still flagged experimental by Node and prints a warning. Pin Node >= 24 and re-check
  on upgrades.
- Hand-written synonym groups (`packages/core/src/text.ts`) are generic institution vocabulary. They are
  a stopgap. Semantic (embedding) retrieval is the planned replacement and will be adopted only if it
  beats this on the evaluation set (`evals/`).
- A project filter is applied after the full-text match. That is fine for tens of thousands of chunks;
  per-project indexes arrive with PostgreSQL.
