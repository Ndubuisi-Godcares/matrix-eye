# TypeScript SDK

A typed TypeScript client for Node 18+ and browsers, with no dependencies. `npm run build` produces ES module,
CommonJS and type-declaration files in `packages/sdk/dist`, verified by a test that imports the built output.

Two clients, split along trust boundaries:

| Class | Needs | Use it |
|---|---|---|
| `PublicClient` | project id only | in a browser: chat, streaming, feedback, display settings |
| `MatrixEyeClient` | API key | on your server: projects, crawling, rules, settings, feedback review |

**Never put the API key in a web page.** Use `PublicClient` in browsers; `MatrixEyeClient` is for servers.

## Server: set up a project

```ts
import { MatrixEyeClient } from "@matrix-eye/sdk";

const matrix = new MatrixEyeClient({ baseUrl: "https://api.example.com", apiKey: process.env.MATRIX_EYE_API_KEY });

const project = await matrix.createProject({
  name: "Riverside University",
  siteUrl: "https://riverside.edu",
  settings: { allowedOrigins: ["https://riverside.edu"], suggestedQuestions: ["How do I apply?"] },
});
const job = await matrix.startCrawl(project.id, { maxPages: 200 });
await matrix.waitForCrawl(job.id);                    // rejects if the crawl fails or times out

console.log((await matrix.chat(project.id, "When is the application deadline?")).answer);
console.log(await matrix.listFeedback(project.id, "down")); // what visitors found unhelpful
```

## Anywhere: chat

```ts
import { PublicClient } from "@matrix-eye/sdk";
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

Tokens are provisional: citations and figures are verified only once the response is complete. Always render the
`final` event's text and citations as the result, not the streamed tokens. A stream that ends without a `final`
event throws `stream_interrupted`. Pass `signal` (an `AbortSignal`) to cancel.

### History

Pass earlier turns as `history: [{ role: "user" | "assistant", content }]` (at most 12) so follow-ups such as
"how much is it?" work.

## Errors

Every failure is an `MatrixEyeError` with `status` (0 if the server was unreachable), a stable `code` and optional `details`:

| `code` | Meaning |
|---|---|
| `forbidden` | this website's origin is not in the project's allowed origins |
| `rate_limited` | too many requests; wait and retry |
| `invalid_request` | bad input; `details` lists the fields |
| `not_found`, `unauthorized` | unknown project; missing or wrong API key |
| `network_error`, `stream_interrupted` | connection problem |
| `crawl_failed`, `timeout` | from `waitForCrawl` |

## Notes

- The SDK maintains its own copy of the API's types. The test suite runs it against a real server, including a real
  crawl and a real streamed response, so the two cannot drift apart unnoticed.
- Early access: the package is not yet published to npm. It is consumed from the repository directly; see the [quickstart](quickstart.md).
