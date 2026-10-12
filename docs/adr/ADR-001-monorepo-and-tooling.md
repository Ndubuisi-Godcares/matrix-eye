# ADR-001: TypeScript monorepo with npm workspaces, consumed from source

- **Status:** accepted
- **Date:** 2026-10-12
- **Supersedes:** the "pnpm" choice in the Master Build Plan (section 3)

## Context

Matrix Eye is a set of cooperating packages (crawler, knowledge store, LLM adapter, engine) plus apps
(API, CLI) and, later, an SDK, widget, dashboard and website. They share types and change together, so
one repository with one install and one CI pipeline is the simplest correct structure.

## Decision

- **npm workspaces**, not pnpm. npm ships with Node, so a contributor needs nothing extra installed
  (pnpm was not present on the development machine). Revisit if install time becomes a problem.
- **TypeScript everywhere**, strict mode plus `noUncheckedIndexedAccess`.
- **Packages are consumed from source** (`"exports": "./src/index.ts"`) and run with `tsx` / `vitest`.
  There is no build step in Phase 1. A compiled `dist/` build is introduced per package when it is
  published (SDK and widget, Phase 2), not before.
- **Layout:** `packages/*` are libraries, `apps/*` are runnable programs, `evals/` is the quality
  harness, `docs/` holds decisions and references, `brand/` holds logos.
- **Dependencies point one way:** `core` <- `crawler`, `knowledge`, `llm` <- `engine` <- `apps`.
  Libraries never import from apps.

## Consequences

- Fast feedback loop (no build), simple CI (`typecheck`, `test`, `eval`).
- Packages cannot yet be installed from npm by outsiders; acceptable until Phase 2.
- Node 24+ is required (built-in `node:sqlite`, see ADR-002).
