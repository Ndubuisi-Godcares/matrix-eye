# Troubleshooting

Find your symptom, then follow the fix. If you are still stuck, use the [contact page](/contact/).

## Reading your website

| What you see | Why | What to do |
|---|---|---|
| The crawl finishes with **0 pages** | The site draws its content with JavaScript, so the plain page is empty. | Run `npx playwright install chromium` once, then add `--render`. |
| `robots.txt disallows crawling` | Your site asks crawlers to stay away (sometimes WordPress's "discourage search engines" setting does this). | Allow `MatrixEyeBot` in your `robots.txt`. See the [crawler page](/bot/). |
| `Refusing to crawl internal host` | Local and private addresses are blocked for safety. | For your own dev server, add `--allow-private`. Never for sites you don't control. |
| Some pages are missing | Pages marked `noindex`, disallowed in `robots.txt`, copies of other pages, or beyond the page limit. | Raise `--max-pages`. The crawl summary reports how many were skipped. |
| The crawl is slow | Rendering JavaScript takes seconds per page; polite crawling limits speed. | Start with a small page limit and raise it. |
| "Stopped at the page limit" | Your site has more pages than the limit. | Raise the limit; later crawls only re-read changed pages. |
| You updated the software and the index looks empty | Index layout changes rebuild the index. | Run the crawl again. Projects and settings are kept. |

## The chat window

| What you see | Why | What to do |
|---|---|---|
| The window does not appear | The script address is wrong, or both `data-project` and `data-api` are not set. | Open the browser console: the widget explains what is missing. |
| "This assistant isn't available on this website" | The website's address is not in the project's allowed origins. | Add the exact origin (`https://www.example.com`, including `www` if used) in the project's settings. |
| A CORS error in the console | Same cause, or the API address is wrong. | Check allowed origins; the origin must match exactly (scheme, host, port). |
| "You're sending messages quickly" | The per-visitor rate limit was reached. | Wait a minute, or raise `MATRIX_EYE_PUBLIC_RATE_LIMIT_PER_MINUTE`. |
| Nothing happens when sending | The API is unreachable. | Check it is running and that the address in `data-api` is reachable from the visitor's browser. |

## Answers

| What you see | Why | What to do |
|---|---|---|
| Answers are quoted sentences, not conversational | No language model is configured. | Install Ollama and pull a model, or set `MATRIX_EYE_LLM_BASE_URL` and `MATRIX_EYE_LLM_MODEL`. See [Self-hosting](self-hosting.md). |
| The assistant declines a question your site does answer | The page may not be indexed, may phrase it very differently, or the content loads with JavaScript. | Use the search endpoint to see what was indexed; check that page was read; add the wording to the page, or add a fixed rule. |
| The first answer takes about 10 seconds | The model is loading into memory. | Normal. Later answers are faster. |
| Empty or strange replies from the model | A "thinking" model, which writes its reasoning into the answer. | Use a non-thinking model such as `qwen3:4b-instruct`. `llm-check` warns about this. |
| A two-part question is declined | Small models are cautious. | Try a larger model, or ask the parts separately. |
| `ollama` is not recognised in the terminal | The terminal was opened before Ollama was installed. | Close and reopen the terminal (or VS Code). |

## The API

| What you see | Why | What to do |
|---|---|---|
| `MATRIX_EYE_API_KEY: Required` on start | No key is set. | Put it in a `.env` file in the repository folder, or set the environment variable. |
| `401 unauthorized` | Missing or wrong key. | Send `Authorization: Bearer YOUR_KEY`. |
| `A crawl is already running` | Only one crawl per project at a time. | Wait for it to finish, check with `GET /v1/crawls/:id`. |
