# Self-hosting and models

Everything runs on your own machine or server: the reader, the search index, the API, the chat widget and, if you
choose, the language model. Nothing is sent to us. This page covers settings, choosing a model, and running it safely.

## Settings

The API reads its settings from environment variables, or from a `.env` file in the repository folder (loaded
automatically when present).

| Setting | Meaning | Default |
|---|---|---|
| `EAGLE_API_KEY` | **Required.** Secret that protects the admin API. At least 16 characters. | none |
| `PORT`, `HOST` | Where the API listens. | `8787`, `127.0.0.1` |
| `EAGLE_DB_PATH` | The one file holding the index, projects and feedback. | `./data/eagle.sqlite` |
| `EAGLE_CORS_ORIGINS` | Browser origins allowed to call the admin routes (rarely needed). | none |
| `EAGLE_PUBLIC_RATE_LIMIT_PER_MINUTE` | Chat messages per visitor, per project, per minute. | `20` |
| `EAGLE_RATE_LIMIT_PER_MINUTE` | Requests per minute per client on all other routes. | `120` |
| `EAGLE_SITE_ORIGINS`, `EAGLE_FORM_RATE_LIMIT_PER_MINUTE` | For running the marketing website's forms. | none, `5` |
| `EAGLE_ALLOW_PRIVATE_NETWORKS` | Let the crawler read `localhost` and private addresses. **Development only.** | `false` |
| `EAGLE_LLM_BASE_URL`, `EAGLE_LLM_MODEL`, `EAGLE_LLM_API_KEY` | The language model (below). | none |

## Language models

Without a model, answers are quoted from your pages: accurate and cited, but they cannot summarise. A model writes a
natural answer from the same passages, still with sources, and still checked afterwards.

Any server that speaks the OpenAI chat protocol works: Ollama, vLLM, LM Studio, or a hosted provider. Set
`EAGLE_LLM_BASE_URL` (for example `http://localhost:11434/v1`) and `EAGLE_LLM_MODEL`.

**With Ollama on the same computer, no settings are needed for the demo and command-line tool:** they find it and
choose a model for you, and tell you which. (The API server never guesses: a deployment must name its model.)

```bash
ollama pull qwen3:4b-instruct       # about 2.5 GB, Apache-2.0 licensed
```

### Choosing a model

- **Use a non-thinking ("instruct") model.** Models that write out their reasoning first (a plain `qwen3:4b`, DeepSeek-R1)
  are slow, and their reasoning can leak into answers. They are skipped automatically when detecting.
- **Check the licence.** Some popular small models are research-only. `qwen3:4b-instruct` is Apache-2.0, which allows commercial use.
- **Hardware sets the ceiling.** A 4B model runs on a laptop with a 4 GB graphics card; expect about 3 to 13 seconds
  per answer and around 10 seconds to load after a pause. A 7B or larger model needs more memory and answers better,
  especially two-part questions.
- Verify any model with `npm run eagle -- llm-check`, and measure it on your questions (see [Accuracy](accuracy.md)).

## Websites built with JavaScript

Single-page apps send an empty page and draw everything in the browser. Install a headless browser once and add
`--render` (command line and demo):

```bash
npx playwright install chromium
```

It is slower (a few seconds a page), so start with a small page limit. The browser is restricted from reaching private or internal
addresses. If you run rendering for websites other than your own, run it in a network-isolated environment.

## Running it safely

A short checklist before real visitors use it:

- Use a long, random `EAGLE_API_KEY`, and never put it in a web page. Browsers use the project id and your allowed origins instead.
- Set **allowed origins** on each project to exactly the websites that show the chat window.
- Put the API behind HTTPS (a reverse proxy such as Caddy or nginx). Do not expose the admin routes to the whole internet if you can avoid it.
- Leave `EAGLE_ALLOW_PRIVATE_NETWORKS` off on any server.
- Back up the single database file (`EAGLE_DB_PATH`) while the server is stopped, or use SQLite's backup tools.
- Keep the software updated, and run `npm audit` after updating.
- Only index websites you own or have permission to index.

## Moving the index

The index is derived from your website, so it can always be rebuilt by crawling again. Upgrades that change the
index layout rebuild it automatically on the next crawl; projects, rules, settings and feedback are kept.
