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
- Rank by **fusing several keyword queries with reciprocal-rank fusion (RRF)** (four lists, see the ranking
  update below). Synonym expansion rescues "how much does it cost?" against a page that says "tuition",
  without letting loose matches outrank exact ones.
- FTS5 columns are weighted: page title 4, heading path 3, URL words 3, body 1.

### Ranking update (found by trying a real site, Reed College)

Real sites exposed weaknesses the synthetic fixture did not. Retrieval is now a fusion of **four** lists
(weights in `sqlite-store.ts`): *labels* (every idea of the question appears in a page's title, headings or
URL words, e.g. "Application Requirements"), *concepts* (every idea appears anywhere), *strict* (the
visitor's own words) and *wide* (plus synonyms). Further signals:

- **URL words are indexed** (`/how-to-apply` is about applying whatever its text says).
- **Authority prior** (`ranking.ts`): shallow pages beat deep ones, and news/blog/archive/filtered URLs are
  gently demoted. A multiplier, never a filter.
- **Ubiquitous words are ignored** by the every-idea lists (a site name repeated in every title narrows nothing).
- **Overview questions** ("what is this site about?") are answered from the front page's own description
  rather than searched.
- The database layout is versioned (`PRAGMA user_version`); an older layout is discarded and rebuilt by the
  next crawl. Only crawl-derived tables are dropped.

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
