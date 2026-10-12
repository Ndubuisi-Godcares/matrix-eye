/**
 * The published artefacts: build the SDK and prove the compiled ES module, CommonJS file and type
 * declarations all work, since that is what npm users will actually receive.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

beforeAll(() => {
  execFileSync(process.execPath, [join(root, "scripts/build.mjs")], { stdio: "pipe" });
}, 120_000);

describe("built SDK", () => {
  it("emits ESM, CommonJS and declarations", () => {
    for (const file of ["dist/index.js", "dist/index.cjs", "dist/index.d.ts", "dist/types.d.ts"]) expect(existsSync(join(root, file)), file).toBe(true);
    expect(readFileSync(join(root, "dist/index.d.ts"), "utf8")).toContain("MatrixEyeClient");
  });

  it("works when imported as an ES module", async () => {
    const sdk = await import(pathToFileURL(join(root, "dist/index.js")).href);
    expect(typeof sdk.MatrixEyeClient).toBe("function");
    expect(typeof sdk.PublicClient).toBe("function");
    expect(new sdk.SseParser().push("event: a\ndata: b\n\n")).toEqual([{ event: "a", data: "b" }]);
  });

  it("works when required from CommonJS", () => {
    const sdk = createRequire(import.meta.url)(join(root, "dist/index.cjs"));
    expect(typeof sdk.MatrixEyeClient).toBe("function");
    expect(new sdk.MatrixEyeError("x", 500, "internal").code).toBe("internal");
  });

  it("has no runtime dependencies (nothing to install besides the SDK itself)", () => {
    expect(readFileSync(join(root, "dist/index.js"), "utf8")).not.toMatch(/from ["'](?!\.)[@\w]/);
  });
});
