# Contributing

## Setup

Node.js 24+, then `npm install`. Run everything with:

```bash
npm run typecheck && npm test && npm run eval -- --gate
```

CI runs exactly these three commands and must be green to merge.

## Conventions

- **Structure:** libraries in `packages/`, programs in `apps/`. Dependencies point one way
  (`core` <- `crawler`/`knowledge`/`llm` <- `engine` <- `apps`). Libraries never import apps.
- **Comments explain *why*,** not what. Each module starts with a header saying its purpose and the
  reasoning behind non-obvious choices. Public functions have a doc comment.
- **Tests live beside the package** in `test/`. Network tests use the fixture server in
  `packages/testing`, never the real internet.
- **Quality changes are measured.** If you change retrieval, gating or prompts, run `npm run eval` and
  include the before/after numbers. Do not edit the dataset to make a change pass; add questions that
  expose the weakness first, then fix it.
- **Decisions** that affect structure or behaviour get a short record in `docs/adr/`.
- **Security-sensitive code** (crawler fetching, SSRF guard, auth, injection filtering) needs a test for
  the attack it prevents.

## Pull requests

Small, focused, with tests. Explain the problem and how you verified the fix.
