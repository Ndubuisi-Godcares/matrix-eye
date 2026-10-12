/**
 * Process entry point: load config, open the database, start listening, shut down cleanly.
 *
 *   MATRIX_EYE_API_KEY=... npm run dev:api
 */
import { SqliteKnowledgeStore } from "@matrix-eye/knowledge";
import { llmFromEnv } from "@matrix-eye/llm";
import { buildApp } from "./app";
import { loadConfig } from "./config";

async function main() {
  const config = loadConfig();
  const store = new SqliteKnowledgeStore(config.dbPath);
  const llm = llmFromEnv();
  const { app, crawls } = await buildApp({ config, store, llm, logger: true });

  // Stop accepting requests, let running crawls finish writing, then close the database.
  const shutdown = async (signal: string) => {
    app.log.info(`${signal} received, shutting down`);
    await app.close();
    await crawls.drain();
    store.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  await app.listen({ port: config.port, host: config.host });
  app.log.info(`Answer mode: ${llm ? llm.name : "extractive (no model configured)"}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
