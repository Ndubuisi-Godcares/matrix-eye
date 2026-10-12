# API reference (v1)

Base URL: `http://localhost:8787`. All `/v1` routes need `Authorization: Bearer <MATRIX_EYE_API_KEY>`.
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
| PATCH | `/v1/projects/:id/settings` | Change `allowedOrigins`, `greeting`, `suggestedQuestions` (only fields you send) |
| GET | `/v1/projects/:id/feedback` | Visitors' thumbs up/down; `?rating=down` for the unhelpful ones |
| POST | `/v1/projects/:id/chat` | Ask a question `{ message, history? }`; add `?debug=true` for diagnostics |

## Website forms (waitlist and contact)

Used by the marketing website. They need no key but only accept requests from the origins in `MATRIX_EYE_SITE_ORIGINS`,
are rate-limited per visitor (`MATRIX_EYE_FORM_RATE_LIMIT_PER_MINUTE`, default 5 a minute), and answer `204` whether or
not the address was already registered, so they never reveal who is on the list.

| Method | Path | Purpose |
|---|---|---|
| POST | `/v1/public/waitlist` | `{ email, name?, useCase?, source?, consent: true }`. Nothing is stored without `consent: true`. |
| POST | `/v1/public/contact` | `{ name, email, message, consent: true }` |

Both accept a hidden `website` field as a spam trap: a request that fills it is accepted and silently discarded.

Owner tools (need the admin key):

| Method | Path | Purpose |
|---|---|---|
| GET | `/v1/waitlist` | The waitlist as JSON, or `?format=csv` (cells that could run as spreadsheet formulas are neutralised) |
| DELETE | `/v1/waitlist?email=ADDRESS` | Erase one person (a privacy request). `404` if the address is not on the list. |
| GET | `/v1/contact-messages` | Messages sent through the contact form |

## Public endpoints (for the chat widget)

Called from visitors' browsers, so they take **no API key**. See [How it works](how-it-works.md#safety) for the security model.

| Method | Path | Purpose |
|---|---|---|
| GET | `/v1/public/projects/:id/config` | `{ name, greeting, suggestedQuestions }` for drawing the window |
| POST | `/v1/public/projects/:id/chat` | Same as the admin chat; never returns diagnostics |
| POST | `/v1/public/projects/:id/chat/stream` | Server-sent events (below) |
| POST | `/v1/public/projects/:id/feedback` | `{ rating: "up"\|"down", question, answer, comment? }` -> 204 |

A browser request is accepted only if its `Origin` is in the project's `allowedOrigins` (or the list contains `"*"`).
Requests without an Origin header (servers, curl) are accepted. Each visitor is limited per project
(`MATRIX_EYE_PUBLIC_RATE_LIMIT_PER_MINUTE`, default 20). Preflight (`OPTIONS`) answers only for allowed origins.

### Streaming events

`POST .../chat/stream` replies with `content-type: text/event-stream`:

```
event: token
data: {"text":"Computer Science costs "}      <- provisional text, as the model writes it (zero or more)

event: final
data: {"answer":"...","abstained":false,"route":"llm","citations":[...]}   <- exactly one, authoritative

event: error
data: {"code":"llm_failed","message":"..."}   <- instead of final, if something failed
```

`token` text has not been checked yet. Always replace it with the `final` answer. Rule, contact, overview, small-talk
and abstain answers are instant, so they send only `final`. A `: keep-alive` comment is sent every 15 s while a cold
model loads. Closing the connection stops generation.

## Chat response

```json
{
  "answer": "Nursing | $5,200 | 4 years ... [1]",
  "abstained": false,
  "route": "extractive",
  "citations": [{ "id": 1, "url": "https://site/tuition", "title": "Tuition and Fees", "snippet": "..." }]
}
```

`route` is one of `rule`, `smalltalk`, `facts`, `overview`, `llm`, `extractive`, `abstain`. Citation numbers in `answer` refer to `citations[].id`.

## Rules

```json
{ "id": "refund", "priority": 10, "pattern": "refund|money back", "response": "Fees are non-refundable." }
{ "id": "hours",  "priority": 5,  "allOf": ["library"], "anyOf": ["hours", "open"], "response": "8am to 10pm." }
```

Rules are checked before retrieval and the model, so they can never be contradicted. A rule needs `pattern`,
`allOf` or `anyOf`. Patterns are limited to 200 characters and must compile.

## Limits

Body 100 KB; message 1000 chars; history 12 turns; crawl `maxPages` <= 1000; 120 requests/minute/IP by default.

Per-project API keys and usage quotas arrive with the hosted service.
