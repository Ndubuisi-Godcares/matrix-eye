/**
 * `eagle` — try Eagle's Eye on any website from the terminal, no server needed.
 *
 *   npm run eagle -- crawl https://university.edu --max-pages 100
 *   npm run eagle -- ask "How much is tuition for computer science?"
 *   npm run eagle -- chat
 *   npm run eagle -- search "application deadline"
 *   npm run eagle -- pages
 *
 * Knowledge is stored in ./data/eagle-cli.sqlite (override with --db). Set EAGLE_LLM_BASE_URL and
 * EAGLE_LLM_MODEL to use a language model (e.g. Ollama); otherwise answers are extractive.
 */
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { isEagleError, type ChatResponse, type ChatTurn } from "@eagles-eye/core";
import { ConversationEngine, ingestSite } from "@eagles-eye/engine";
import { SqliteKnowledgeStore } from "@eagles-eye/knowledge";
import { llmFromEnv } from "@eagles-eye/llm";

const PROJECT = "cli";

const USAGE = `Eagle's Eye CLI

Usage:
  eagle crawl <url> [--max-pages N] [--full] [--allow-private]
  eagle ask "<question>" [--debug] [--json]
  eagle chat
  eagle search "<query>" [--limit N]
  eagle pages

Options:
  --db <file>    SQLite file (default ./data/eagle-cli.sqlite)
  --name <text>  Site name used in answers (default: the site's hostname)`;

function printResponse(response: ChatResponse, options: { debug: boolean; json: boolean }) {
  if (options.json) return console.log(JSON.stringify(response, null, 2));
  console.log(`\n${response.answer}\n`);
  if (response.citations.length) {
    console.log("Sources:");
    for (const c of response.citations) console.log(`  [${c.id}] ${c.title} — ${c.url}`);
  }
  if (options.debug && response.debug) {
    console.log(`\n(route: ${response.route}, query: "${response.debug.rewrittenQuery}", coverage: ${response.debug.coverage.toFixed(2)}, issues: ${response.debug.issues.join(", ") || "none"})`);
  }
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      db: { type: "string", default: "./data/eagle-cli.sqlite" },
      name: { type: "string" },
      "max-pages": { type: "string" },
      limit: { type: "string", default: "5" },
      full: { type: "boolean", default: false },
      "allow-private": { type: "boolean", default: false },
      debug: { type: "boolean", default: false },
      json: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  const [command, ...rest] = positionals;
  if (!command || values.help) return console.log(USAGE);

  const store = new SqliteKnowledgeStore(values.db as string);
  try {
    switch (command) {
      case "crawl": {
        const url = rest[0];
        if (!url) throw new Error("crawl needs a URL");
        console.log(`Crawling ${url} (polite: robots.txt respected, ~4 requests/second at most)...`);
        const result = await ingestSite({
          store,
          projectId: PROJECT,
          startUrl: url,
          maxPages: values["max-pages"] ? Number(values["max-pages"]) : undefined,
          full: values.full,
          allowPrivateNetworks: values["allow-private"],
          onEvent: (e) => {
            if (e.type === "page") console.log(`  + ${e.url}`);
            else if (e.type === "flagged") console.log(`  ! ${e.url} — removed ${e.count} suspicious instruction-like paragraph(s)`);
            else if (e.type === "failed") console.log(`  x ${e.url} — ${e.error}`);
          },
        });
        console.log(`\nDone. ${result.pagesIndexed} pages indexed, ${result.pagesUnchanged} unchanged, ${result.pagesRemoved} removed, ${result.chunksWritten} chunks.`);
        if (result.reachedPageLimit) console.log("Stopped at the page limit; the site has more pages. Raise --max-pages to index them.");
        console.log(`Skipped ${result.skipped.length} (robots.txt, noindex, duplicates, errors); failed ${result.failed.length}.`);
        break;
      }

      case "ask": {
        const question = rest.join(" ").trim();
        if (!question) throw new Error('ask needs a question, e.g. eagle ask "What are the fees?"');
        const engine = new ConversationEngine({ store, llm: llmFromEnv() });
        printResponse(await engine.ask({ projectId: PROJECT, question, siteName: values.name }), { debug: values.debug, json: values.json });
        break;
      }

      case "chat": {
        const engine = new ConversationEngine({ store, llm: llmFromEnv() });
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        const history: ChatTurn[] = [];
        console.log("Chat with the crawled site. Type a question, or 'exit' to quit.\n");
        for (;;) {
          const question = (await rl.question("You: ")).trim();
          if (!question) continue;
          if (["exit", "quit"].includes(question.toLowerCase())) break;
          const response = await engine.ask({ projectId: PROJECT, question, history, siteName: values.name });
          printResponse(response, { debug: values.debug, json: false });
          history.push({ role: "user", content: question }, { role: "assistant", content: response.answer });
        }
        rl.close();
        break;
      }

      case "search": {
        const query = rest.join(" ").trim();
        if (!query) throw new Error("search needs a query");
        for (const hit of store.search(PROJECT, query, Number(values.limit))) {
          console.log(`\n${hit.score.toFixed(4)}  ${hit.chunk.pageTitle}${hit.chunk.headingPath.length ? " > " + hit.chunk.headingPath.join(" > ") : ""}`);
          console.log(`        ${hit.chunk.pageUrl}`);
          console.log(`        ${hit.chunk.text.slice(0, 200).replace(/\s+/g, " ")}`);
        }
        break;
      }

      case "pages": {
        const pages = store.listPages(PROJECT);
        for (const p of pages) console.log(`${String(p.chunkCount).padStart(3)} chunks  ${p.url}`);
        console.log(`\n${pages.length} pages`);
        break;
      }

      default:
        console.log(USAGE);
        process.exitCode = 1;
    }
  } finally {
    store.close();
  }
}

main().catch((err) => {
  console.error(`Error: ${isEagleError(err) ? `${err.message} (${err.code})` : err instanceof Error ? err.message : err}`);
  process.exit(1);
});
