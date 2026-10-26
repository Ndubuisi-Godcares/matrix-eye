# Quickstart

MatrixEye is in early access: it runs from its own repository rather than a hosted service. This page goes from
nothing to a working chat widget on your website in about ten minutes. MatrixEye only reads your website, the way a
visitor's browser would; nothing here modifies it.

## What you need

- **Node.js 24 or newer** (check with `node -v`).
- **Git**, to get the code. Early-access members receive the repository address by email.
- Optional, for nicer answers: **[Ollama](https://ollama.com)**, a free program that runs a language model on your computer.
- Optional, for websites built with React or Vue: a one-time download of a headless browser (below).

## 1. Install

Run these in the folder where you want the project:

```bash
git clone REPOSITORY-ADDRESS matrix-eye
cd matrix-eye
npm install
npm run build
```

Always run commands from inside the `matrix-eye` folder, never from your website's own project.

## 2. See it on your website

```bash
npm run demo -- https://your-website.example --max-pages 40
```

It indexes up to 40 pages of your site, then prints an address such as `http://127.0.0.1:8788`. Open it: the
assistant is on the page, grounded in your own content, ready for questions. `Ctrl+C` stops it.

Worth knowing:

- **Start small.** `--max-pages 40` keeps the first run fast and conservative toward your server. Raise it once the results look right.
- **React or Vue site indexing as empty?** Add `--render` (requires a one-time `npx playwright install chromium`) to execute JavaScript before reading the page.
- **Indexing a site on your own machine** (such as `http://localhost:3000`)? Add `--allow-private`; private addresses are refused by default.
- **Want generated, conversational answers instead of quoted text?** Install Ollama and run `ollama pull qwen3:4b-instruct` once; the demo detects and uses it automatically. See [Self-hosting](self-hosting.md).
- Append `?theme=dark`, `?position=left` or `?color=%231b6b4a` to the address to preview the styling options.

## 3. Add it to your real website

The demo is a preview, not a deployment. Running it on a real website means running the API and adding one script tag.

**Start the API.** Create a file named `.env` in the repository folder with at least:

```bash
MATRIX_EYE_API_KEY=choose-a-long-random-secret-of-at-least-16-characters
MATRIX_EYE_DB_PATH=./data/matrix-eye.sqlite
```

then run `npm run dev:api`. The API listens on `http://127.0.0.1:8787`. The key is the sole credential controlling every project; treat it as a secret.

**Create a project and read your site.** With the [TypeScript SDK](sdk.md) (or the [API](api.md) directly):

```ts
import { MatrixEyeClient } from "@matrix-eye/sdk";

const matrix = new MatrixEyeClient({ baseUrl: "http://127.0.0.1:8787", apiKey: process.env.MATRIX_EYE_API_KEY });

const project = await matrix.createProject({
  name: "My website",
  siteUrl: "https://your-website.example",
  // Only websites listed here may show the chat window. A new project is closed until you add yours.
  settings: { allowedOrigins: ["https://your-website.example"] },
});
await matrix.waitForCrawl((await matrix.startCrawl(project.id)).id);
console.log("Project id:", project.id);
```

**Add the chat window** to your pages, just before `</body>`:

```html
<script src="https://YOUR-HOST/matrix-eye-widget.js" defer
        data-project="PROJECT_ID"
        data-api="https://YOUR-API-HOST"></script>
```

`matrix-eye-widget.js` is produced by `npm run build` at `packages/widget/dist/`; host it from anywhere your site
can load scripts. See the [widget guide](widget.md) for colours, position, and the React/Next.js integration.

## 4. Make it better

- Ask it the ten questions visitors ask most. A wrong or missing answer usually means the relevant page doesn't state the fact clearly.
- Review declined-answer feedback: `GET /v1/projects/PROJECT_ID/feedback?rating=down` returns the exact questions and answers visitors rejected.
- For facts that must always be answered identically (a refund policy, opening hours), define a fixed rule. See the [API reference](api.md).
- Measure accuracy: [Accuracy and evaluation](accuracy.md) scores the assistant against your own question set.

## If something goes wrong

See [Troubleshooting](troubleshooting.md): empty crawls, a widget that does not appear, slow first answers, and more.
