# Quickstart

MatrixEye is in early access, so today you run it from its repository. This page takes you from nothing to a chat
window answering from your own website, in about ten minutes. Nothing here changes your website: MatrixEye only
reads it, the way a visitor would.

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

It reads up to 40 pages of your site, then prints an address such as `http://127.0.0.1:8788`. Open it in your
browser: your website's assistant is on the page, ready for questions. Press `Ctrl+C` in the terminal to stop it.

Things worth knowing:

- **Start small.** `--max-pages 40` keeps the first run quick and gentle on your server. Raise it once you like what you see.
- **React or Vue site that reads as empty?** Add `--render`. Run `npx playwright install chromium` once first.
- **Your own site on your computer** (such as `http://localhost:3000`)? Add `--allow-private`. This is refused by default for safety.
- **Want conversational answers?** Install Ollama, run `ollama pull qwen3:4b-instruct` once, and run the demo again.
  It is found and used automatically, and the demo tells you when it does. Without it, answers are quoted from your pages. See [Self-hosting](self-hosting.md).
- Try `?theme=dark`, `?position=left` or `?color=%231b6b4a` after the address to see the styling options.

## 3. Add it to your real website

The demo is a preview. To put the assistant on your website for real you run the API and give your site one script tag.

**Start the API.** Create a file named `.env` in the repository folder with at least:

```bash
MATRIX_EYE_API_KEY=choose-a-long-random-secret-of-at-least-16-characters
MATRIX_EYE_DB_PATH=./data/matrix-eye.sqlite
```

then run `npm run dev:api`. The API listens on `http://127.0.0.1:8787`. Keep the key secret: it controls your projects.

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

`matrix-eye-widget.js` is built by `npm run build` at `packages/widget/dist/`; host it anywhere your site can load
scripts from. See the [widget guide](widget.md) for colours, position, React and Next.js.

## 4. Make it better

- Ask it the ten questions your visitors ask most. Wrong or missing answers usually mean a page does not say the thing clearly.
- Read the thumbs-down feedback: `GET /v1/projects/PROJECT_ID/feedback?rating=down`. It lists the exact questions and answers that disappointed people.
- For things that must always be answered one way (a refund policy, opening hours), add a fixed rule. See the [API reference](api.md).
- Measure it: [Accuracy and evaluation](accuracy.md) shows how to score the assistant against your own questions.

## If something goes wrong

See [Troubleshooting](troubleshooting.md): empty crawls, a widget that does not appear, slow first answers, and more.
