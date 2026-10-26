/**
 * Process entry point: load config, open the database, start listening, shut down cleanly.
 *
 *   MATRIX_EYE_API_KEY=... npm run dev:api
 */
import { createPlaywrightRenderer, type PageRenderer } from "@matrix-eye/crawler";
import { SqliteKnowledgeStore } from "@matrix-eye/knowledge";
import { llmFromEnv } from "@matrix-eye/llm";
import pg from "pg";
import { buildApp } from "./app";
import { loadConfig } from "./config";
import { createControlPlane, type ControlPlane } from "./control-plane";

async function main() {
  const config = loadConfig();
  const store = new SqliteKnowledgeStore(config.dbPath);
  const llm = llmFromEnv();

  // Hosted multi-tenant mode only (ADR-008); self-host stays Postgres-free.
  let controlPlane: ControlPlane | null = null;
  if (config.controlPlane) {
    const pool = new pg.Pool({ connectionString: config.controlPlane.databaseUrl });
    controlPlane = await createControlPlane({ db: pool, supabaseUrl: config.controlPlane.supabaseUrl, supabaseAnonKey: config.controlPlane.supabaseAnonKey });
  }

  // Off by default (MATRIX_EYE_RENDER=true): the same JavaScript-rendering capability
  // `npm run demo`/the CLI already have via --render, for sites that build their content in the browser.
  let renderer: PageRenderer | undefined;
  if (config.render) {
    try {
      renderer = await createPlaywrightRenderer({ allowPrivateNetworks: config.allowPrivateNetworks });
    } catch (err) {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    }
  }

  const { app, crawls } = await buildApp({ config, store, llm, logger: true, controlPlane, renderer });

  // Stop accepting requests, let running crawls finish writing, then close the database.
  const shutdown = async (signal: string) => {
    app.log.info(`${signal} received, shutting down`);
    await app.close();
    await crawls.drain();
    store.close();
    await controlPlane?.close();
    await renderer?.close();
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
