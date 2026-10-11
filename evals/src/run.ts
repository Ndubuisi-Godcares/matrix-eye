/**
 * Evaluation runner.
 *
 *   npm run eval                 run the dataset against the engine, print a report
 *   npm run eval -- --gate       exit with status 1 if any Phase 1 target is missed (used by CI)
 *   npm run eval -- --url <url> --dataset <file>
 *                                evaluate against a live site instead of the built-in fixture
 *
 * Uses the language model from EAGLE_LLM_* environment variables when set; otherwise the
 * deterministic extractive mode, so the gate can run in CI with no model and no network.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { ConversationEngine, ingestSite, validateAnswer } from "@eagles-eye/engine";
import { SqliteKnowledgeStore } from "@eagles-eye/knowledge";
import { llmFromEnv } from "@eagles-eye/llm";
import { startFixtureServer } from "@eagles-eye/testing";
import { TARGETS, checkTargets, computeMetrics, pct, scoreItem, type EvalItem, type ItemResult } from "./score";

const here = dirname(fileURLToPath(import.meta.url));
const PROJECT = "eval";

interface Dataset {
  site: string;
  siteName: string;
  items: EvalItem[];
}

/** Numbers appearing in the answer that appear nowhere in the whole site: invented figures. */
function findUnsupportedNumbers(answer: string, siteText: string): string[] {
  const verdict = validateAnswer(answer, 99, siteText);
  return verdict.issues.filter((i) => i.startsWith("unsupported_number:")).map((i) => i.slice("unsupported_number:".length));
}

async function main() {
  const { values } = parseArgs({
    options: {
      gate: { type: "boolean", default: false },
      url: { type: "string" },
      dataset: { type: "string", default: join(here, "..", "datasets", "education-demo.json") },
      verbose: { type: "boolean", default: false },
    },
  });

  const dataset = JSON.parse(readFileSync(resolve(values.dataset as string), "utf8")) as Dataset;
  const fixture = values.url ? null : await startFixtureServer(dataset.site);
  const startUrl = values.url ?? (fixture as NonNullable<typeof fixture>).baseUrl;

  const store = new SqliteKnowledgeStore(":memory:");
  const llm = llmFromEnv();
  try {
    console.log(`Crawling ${startUrl} ...`);
    const ingest = await ingestSite({ store, projectId: PROJECT, startUrl, allowPrivateNetworks: Boolean(fixture), delayMs: fixture ? 0 : 250, concurrency: 3, maxPages: 300 });
    console.log(`Indexed ${ingest.pagesIndexed} pages, ${ingest.chunksWritten} chunks (${ingest.skipped.length} skipped, ${ingest.failed.length} failed).`);
    console.log(`Mode: ${llm ? llm.name : "extractive (no model configured)"}\n`);

    // Ground truth for "is this number on the site?": all indexed text.
    const allText = store.corpusText(PROJECT);

    const engine = new ConversationEngine({ store, llm });
    const results: ItemResult[] = [];
    for (const item of dataset.items) {
      const t0 = performance.now();
      const response = await engine.ask({ projectId: PROJECT, question: item.question, history: item.history, siteName: dataset.siteName });
      const latency = Math.round(performance.now() - t0);
      const result = scoreItem(item, response, latency, findUnsupportedNumbers(response.answer, allText));
      results.push(result);
      if (!result.passed || values.verbose) {
        console.log(`${result.passed ? "PASS" : "FAIL"}  [${item.id}] ${item.question}`);
        console.log(`      route=${result.route}  ${result.failure ?? ""}`);
        console.log(`      answer: ${result.answer.slice(0, 220)}`);
      }
    }

    const metrics = computeMetrics(dataset.items, results);
    const failures = checkTargets(metrics);

    console.log("\n=== Results ===");
    console.log(`Questions                ${metrics.items}`);
    console.log(`Answer correctness       ${pct(metrics.correctness)}   (target >= ${pct(TARGETS.correctness)})`);
    console.log(`Citation hit rate        ${pct(metrics.citationHitRate)}   (target >= ${pct(TARGETS.citationHitRate)})`);
    console.log(`Correct abstention       ${pct(metrics.abstentionCorrectness)}   (target >= ${pct(TARGETS.abstentionCorrectness)})`);
    console.log(`Unsupported figures      ${metrics.hallucinatedFigures}        (target ${TARGETS.hallucinatedFigures})`);
    console.log(`Injection resistance     ${pct(metrics.injectionResistance)}   (target ${pct(TARGETS.injectionResistance)})`);
    console.log(`Median latency           ${metrics.medianLatencyMs} ms`);
    console.log(failures.length ? `\nTARGETS MISSED:\n - ${failures.join("\n - ")}` : "\nAll Phase 1 targets met.");

    const reportDir = resolve(here, "..", "reports");
    mkdirSync(reportDir, { recursive: true });
    const reportPath = join(reportDir, `${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    writeFileSync(reportPath, JSON.stringify({ at: new Date().toISOString(), mode: llm?.name ?? "extractive", site: startUrl, metrics, failures, results }, null, 2));
    console.log(`Report: ${reportPath}`);

    if (values.gate && failures.length > 0) process.exitCode = 1;
  } finally {
    store.close();
    await fixture?.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
