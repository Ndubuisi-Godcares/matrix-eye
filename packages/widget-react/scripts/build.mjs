/**
 * Builds the React wrapper: an ES module (React and the widget stay external, as peer/regular dependencies)
 * plus type declarations. Consumed from source inside this monorepo (ADR-001).
 */
import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
rmSync(join(root, "dist"), { recursive: true, force: true });
await build({ entryPoints: [join(root, "src/index.ts")], bundle: true, format: "esm", target: "es2020", external: ["react", "@matrix-eye/widget"], outfile: join(root, "dist/index.js"), logLevel: "warning" });
execFileSync(process.execPath, [join(root, "../../node_modules/typescript/bin/tsc"), "-p", join(root, "tsconfig.json"), "--noEmit", "false", "--emitDeclarationOnly", "--declaration", "--outDir", join(root, "dist/types")], { stdio: "inherit" });
console.log("widget-react built: dist/index.js");
