/**
 * Applies pending control-plane migrations and exits. Run after deploying, before the API starts
 * taking traffic on a version with new migrations (the API also runs them at boot, so this is for
 * running them ahead of time, e.g. in a deploy pipeline step).
 *
 *   npm run migrate -w @matrix-eye/api
 */
import pg from "pg";
import { loadConfig } from "../config";
import { runMigrations } from "./migrate";

async function main() {
  const config = loadConfig();
  if (!config.controlPlane) {
    console.error("MATRIX_EYE_DATABASE_URL is not set; this deployment has no control-plane database to migrate.");
    process.exit(1);
  }
  const pool = new pg.Pool({ connectionString: config.controlPlane.databaseUrl });
  try {
    const applied = await runMigrations(pool);
    console.log(applied.length ? `Applied: ${applied.join(", ")}` : "Already up to date.");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
