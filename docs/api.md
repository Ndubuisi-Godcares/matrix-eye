# API reference (v1, Phase 1)

Base URL: `http://localhost:8787`. All `/v1` routes need `Authorization: Bearer <EAGLE_API_KEY>`.
Errors always have the shape `{ "error": { "code": "...", "message": "...", "details"?: [...] } }`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Liveness and answer mode. Public, not rate-limited. |
| POST | `/v1/projects` | Create a project `{ name, siteUrl, rules? }` -> 201 |
| GET | `/v1/projects/:id` | Project, knowledge stats, latest crawl |
| DELETE | `/v1/projects/:id` | Delete project and all its knowledge -> 204 |
| PUT | `/v1/projects/:id/rules` | Replace deterministic rules (array) |
| POST | `/v1/projects/:id/crawl` | Start a background crawl `{ maxPages?, full? }` -> 202 + job |
| GET | `/v1/crawls/:id` | Crawl job status and counts |
| GET | `/v1/projects/:id/pages` | Indexed pages |
| POST | `/v1/projects/:id/search` | Retrieval only `{ query, limit? }` (debugging) |
| POST | `/v1/projects/:id/chat` | Ask a question `{ message, history? }`; add `?debug=true` for diagnostics |

## Chat response

```json
{
  "answer": "Nursing | $5,200 | 4 years ... [1]",
  "abstained": false,
  "route": "extractive",
  "citations": [{ "id": 1, "url": "https://site/tuition", "title": "Tuition and Fees", "snippet": "..." }]
}
```

`route` is one of `rule`, `facts`, `llm`, `extractive`, `abstain`. Citation numbers in `answer` refer to `citations[].id`.

## Rules

```json
{ "id": "refund", "priority": 10, "pattern": "refund|money back", "response": "Fees are non-refundable." }
{ "id": "hours",  "priority": 5,  "allOf": ["library"], "anyOf": ["hours", "open"], "response": "8am to 10pm." }
```

Rules are checked before retrieval and the model, so they can never be contradicted. A rule needs `pattern`,
`allOf` or `anyOf`. Patterns are limited to 200 characters and must compile.

## Limits

Body 100 KB; message 1000 chars; history 12 turns; crawl `maxPages` <= 1000; 120 requests/minute/IP by default.

Streaming (SSE) responses and per-project API keys arrive in Phase 2 and Phase 4 respectively.
