/**
 * Builds the widget.
 *
 *   dist/matrix-eye-widget.js      a single minified file for <script> tags (includes the SDK client)
 *   dist/index.js + index.d.ts     an ES module for bundlers and the React wrapper
 *
 * Also enforces a size budget: a chat widget is third-party code on someone else's page, so it must stay small.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { build } from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
/** Gzipped size ceiling for the script-tag bundle. */
const BUDGET_BYTES = 30 * 1024;

rmSync(join(root, "dist"), { recursive: true, force: true });

const common = { entryPoints: [join(root, "src/index.ts")], bundle: true, target: "es2020", logLevel: "warning", legalComments: "none" };
await build({ ...common, format: "iife", minify: true, outfile: join(root, "dist/matrix-eye-widget.js") });
await build({ ...common, format: "esm", sourcemap: true, outfile: join(root, "dist/index.js") });

execFileSync(process.execPath, [join(root, "../../node_modules/typescript/bin/tsc"), "-p", join(root, "tsconfig.json"), "--noEmit", "false", "--emitDeclarationOnly", "--declaration", "--outDir", join(root, "dist/types")], { stdio: "inherit" });

const gzipped = gzipSync(readFileSync(join(root, "dist/matrix-eye-widget.js"))).length;
console.log(`Widget built: matrix-eye-widget.js is ${(gzipped / 1024).toFixed(1)} KB gzipped (budget ${(BUDGET_BYTES / 1024).toFixed(0)} KB)`);
if (gzipped > BUDGET_BYTES) {
  console.error("Over the size budget.");
  process.exit(1);
}
