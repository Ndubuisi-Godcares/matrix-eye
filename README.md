<p align="center">
  <img src="brand/eagles-eye-logo-primary.png" alt="Eagle's Eye" width="360">
</p>

<p align="center"><strong>Turn any website into a source-grounded, conversational assistant.</strong><br>
Crawl a site, index it, and answer visitors' questions with citations, or an honest "I couldn't find that".</p>

---

## Status

**Phase 1 (core engine): built and passing its quality gate.** Crawler, knowledge store, retrieval,
grounded answering, validation, HTTP API and CLI all work end to end, with 176 automated tests.
Not built yet: SDK, embeddable widget, dashboard, website, hosted service (Phases 2-4).

The evaluation harness (`npm run eval`) currently scores 100% on its 45-question fixture set. Read that
as a *regression baseline*, not a promise of real-world accuracy: it is one small synthetic site that the
engine was tuned against. Real-site results are the real test; see "Try it on a real website".

## Quick start

Requires **Node.js 24+**.

```bash
npm install
npm test            # 176 tests
npm run eval        # answer-quality report against the fixture site (add -- --gate for CI behaviour)
npm run typecheck
```

### Try it on a real website (no server, no model needed)

```bash
npm run eagle -- crawl https://your-university.edu --max-pages 100
npm run eagle -- ask "How much is tuition for computer science?"
npm run eagle -- chat                      # interactive, remembers follow-ups
npm run eagle -- search "application deadline"
npm run eagle -- pages
```

Answers are **extractive** by default: quoted from the site, with citations, and they cannot hallucinate.
For conversational answers, point at any OpenAI-compatible model (Ollama, vLLM, LM Studio, a hosted API):

```bash
EAGLE_LLM_BASE_URL=http://localhost:11434/v1 EAGLE_LLM_MODEL=qwen2.5:7b-instruct npm run eagle -- chat
```

Score it against your own labelled questions: copy `evals/datasets/education-demo.json`, write questions
and expected pages for your site, then `npm run eval -- --url https://your-university.edu --dataset my.json`.

### Run the API

```bash
cp .env.example .env     # set EAGLE_API_KEY (16+ chars)
npm run dev:api
curl -H "authorization: Bearer $EAGLE_API_KEY" -X POST localhost:8787/v1/projects \
     -H "content-type: application/json" -d '{"name":"My Uni","siteUrl":"https://your-university.edu"}'
```

Endpoints are documented in [docs/api.md](docs/api.md).

## How it works

```
 website --crawl--> pages --chunk--> passages --index--> SQLite FTS5 (BM25)
                                                              |
 visitor question --> rules? --> contact facts? --> retrieve --> gates --> answer --> validate --> cited reply
                                                                  |                       |
                                                           abstain if the site     model output checked
                                                           doesn't cover it        against the evidence
```

- **Safe crawler:** obeys robots.txt, blocks SSRF (including DNS rebinding), caps response size, drops
  prompt-injection text. See [ADR-004](docs/adr/ADR-004-crawler-safety.md).
- **Grounded answers:** every factual answer cites the page it came from; invented prices, dates and
  contacts are caught before they reach a visitor. See [ADR-003](docs/adr/ADR-003-grounded-answers-and-abstention.md).
- **Works with or without a language model**, hosted or self-hosted, through one small interface.

## Repository layout

```
packages/
  core/        shared types, errors, tunable defaults, text helpers
  crawler/     SSRF-safe fetcher, robots.txt, sitemaps, content extraction, crawl loop
  knowledge/   chunker + KnowledgeStore interface + SQLite FTS5 implementation
  llm/         LlmProvider interface, OpenAI-compatible client, scripted test double
  engine/      rules, follow-up rewriting, retrieval gates, prompts, validation, ingestion
  testing/     fixture websites and a local server for offline tests
apps/
  api/         Fastify HTTP API
  cli/         `eagle` command line tool
evals/         labelled questions, scoring, report + CI quality gate
docs/          api.md, architecture decision records (adr/), planning PDFs (planning/)
brand/         logos
```

## Known limitations (Phase 1)

- Retrieval is keyword-based (BM25 plus hand-written synonyms). Unusual wording can be wrongly declined;
  semantic retrieval is planned and will be adopted only if it wins on the evaluation set.
- JavaScript-rendered pages need the optional Playwright renderer, which is implemented but untested.
- No streaming responses yet, and a single API key (per-project keys come with the hosted service).
- `node:sqlite` is flagged experimental by Node and prints a warning.
- English-oriented text processing.

## Contributing and security

See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).

## License

[Apache License 2.0](LICENSE).
