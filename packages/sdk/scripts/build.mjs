/**
 * Builds the publishable SDK into dist/: an ES module, a CommonJS file and type declarations.
 *
 * Inside this monorepo the package is consumed from source (see ADR-001). This build produces what would
 * be published to npm; the smoke test in test/build.test.ts proves the built files actually work.
 */
import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
rmSync(join(root, "dist"), { recursive: true, force: true });

const common = { entryPoints: [join(root, "src/index.ts")], bundle: true, target: "es2022", sourcemap: true, logLevel: "info" };
await build({ ...common, format: "esm", outfile: join(root, "dist/index.js") });
await build({ ...common, format: "cjs", outfile: join(root, "dist/index.cjs") });

// Type declarations come from the TypeScript compiler (esbuild does not emit them).
execFileSync(process.execPath, [join(root, "../../node_modules/typescript/bin/tsc"), "-p", join(root, "tsconfig.build.json")], { stdio: "inherit" });
console.log("SDK built: dist/index.js, dist/index.cjs, dist/index.d.ts");
