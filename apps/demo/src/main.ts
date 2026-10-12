/**
 * `npm run demo -- <website-url>`: read a website and open a page with the chat widget answering from it.
 *
 *   npm run demo -- https://www.reed.edu --max-pages 40
 *   npm run demo -- https://aiit.network --render --max-pages 20
 *
 * A language model is used automatically when Ollama is running on this computer (or when MATRIX_EYE_LLM_BASE_URL and
 * MATRIX_EYE_LLM_MODEL are set); otherwise answers are quoted from the site. --no-model forces the latter.
 */
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { createPlaywrightRenderer, type PageRenderer } from "@matrix-eye/crawler";
import { SqliteKnowledgeStore } from "@matrix-eye/knowledge";
import { resolveLocalModel } from "@matrix-eye/llm";
import { REPO_ROOT, WIDGET_FILE, startDemo } from "./demo";

const USAGE = `Matrix Eye demo

Usage: npm run demo -- <website-url> [--max-pages N] [--render] [--port N] [--db file] [--allow-private] [--no-model]

  --render         run JavaScript for pages that arrive empty (React/Vue sites); needs: npx playwright install chromium
  --port N         where to serve the demo (default 8788)
  --db file        keep the index here (default ./data/demo.sqlite); it is replaced on every run
  --allow-private  allow a site on localhost or a private network (your own dev server)
  --no-model       do not use a language model even if one is available (answers are quoted from the site)

A language model is found automatically: Ollama running on this computer is used if present, or the one set by
MATRIX_EYE_LLM_BASE_URL and MATRIX_EYE_LLM_MODEL.`;

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      "max-pages": { type: "string" },
      render: { type: "boolean", default: false },
      port: { type: "string", default: "8788" },
      db: { type: "string", default: "./data/demo.sqlite" },
      "allow-private": { type: "boolean", default: false },
      "no-model": { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  const siteUrl = positionals[0];
  if (!siteUrl || values.help) return console.log(USAGE);

  if (!existsSync(WIDGET_FILE)) {
    console.log("Building the widget (first run only)...");
    execFileSync(process.execPath, [join(REPO_ROOT, "packages/widget/scripts/build.mjs")], { stdio: "inherit" });
  }

  const { llm, source } = await resolveLocalModel({ disabled: values["no-model"] });
  let renderer: PageRenderer | undefined;
  if (values.render) renderer = await createPlaywrightRenderer({ allowPrivateNetworks: values["allow-private"] });

  const store = new SqliteKnowledgeStore(values.db as string);
  const demo = await startDemo({
    store,
    siteUrl,
    port: Number(values.port),
    maxPages: values["max-pages"] ? Number(values["max-pages"]) : 50,
    llm,
    renderer,
    allowPrivateNetworks: values["allow-private"],
    onStatus: (message) => console.log(message),
  });
  await renderer?.close(); // the browser is only needed while crawling

  console.log(
    llm
      ? `\nAnswers are written by ${llm.name.replace("openai-compatible:", "")}${source === "ollama" ? " (found Ollama on this computer)" : ""}. The first answer can take about 10 seconds while the model loads.`
      : "\nAnswers are quoted from the site. For conversational answers, install Ollama (https://ollama.com), run: ollama pull qwen3:4b-instruct, then start this demo again.",
  );
  console.log(`\nOpen ${demo.url} in your browser. Press Ctrl+C to stop.\n`);

  const stop = async () => {
    await demo.close();
    store.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void stop());
  process.on("SIGTERM", () => void stop());
}

main().catch((err) => {
  console.error(`Error: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
