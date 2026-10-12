# TypeScript SDK

A typed client for Node 18+ and browsers. No dependencies. `npm run build` produces ES module, CommonJS and type files
in `packages/sdk/dist` (checked by a test that imports the built output).

Two clients, because they have different trust levels:

| Class | Needs | Use it |
|---|---|---|
| `PublicClient` | project id only | in a browser: chat, streaming, feedback, display settings |
| `EagleEyeClient` | API key | on your server: projects, crawling, rules, settings, feedback review |

**Never put the API key in a web page.** Use `PublicClient` in browsers; `EagleEyeClient` is for servers.

## Server: set up a project

```ts
import { EagleEyeClient } from "@eagles-eye/sdk";

const eagle = new EagleEyeClient({ baseUrl: "https://api.example.com", apiKey: process.env.EAGLE_API_KEY });

const project = await eagle.createProject({
  name: "Riverside University",
  siteUrl: "https://riverside.edu",
  settings: { allowedOrigins: ["https://riverside.edu"], suggestedQuestions: ["How do I apply?"] },
});
const job = await eagle.startCrawl(project.id, { maxPages: 200 });
await eagle.waitForCrawl(job.id);                    // rejects if the crawl fails or times out

console.log((await eagle.chat(project.id, "When is the application deadline?")).answer);
console.log(await eagle.listFeedback(project.id, "down")); // what visitors found unhelpful
```

## Anywhere: chat

```ts
import { PublicClient } from "@eagles-eye/sdk";
const chat = new PublicClient({ baseUrl: "https://api.example.com" }, "PROJECT_ID");

const reply = await chat.chat("How much is tuition?");
reply.answer; reply.citations; reply.abstained; reply.route;
```

### Streaming

```ts
let shown = "";
for await (const event of chat.stream("How do I apply?", { history })) {
  if (event.type === "token") shown += event.text;       // provisional text, show it immediately
  else shown = event.response.answer;                     // the validated answer: REPLACE what you showed
}
```

Tokens are provisional because the answer is checked (citations, figures) only once complete. Always show the `final`
event's text and citations as the result. A stream that ends without `final` throws `stream_interrupted`.
Pass `signal` (an `AbortSignal`) to cancel.

### History

Pass earlier turns as `history: [{ role: "user" | "assistant", content }]` (at most 12) so follow-ups such as
"how much is it?" work.

## Errors

Every failure is an `EagleEyeError` with `status` (0 if the server was unreachable), a stable `code` and optional `details`:

| `code` | Meaning |
|---|---|
| `forbidden` | this website's origin is not in the project's allowed origins |
| `rate_limited` | too many requests; wait and retry |
| `invalid_request` | bad input; `details` lists the fields |
| `not_found`, `unauthorized` | unknown project; missing or wrong API key |
| `network_error`, `stream_interrupted` | connection problem |
| `crawl_failed`, `timeout` | from `waitForCrawl` |

## Notes

- The SDK carries its own copy of the API's types. The test suite runs it against the real server (including a real
  crawl and streaming) so the two cannot drift apart unnoticed.
- Not yet published to npm. Inside this repository it is consumed from source (ADR-001).
