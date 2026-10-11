import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.test.ts", "apps/*/test/**/*.test.ts", "evals/test/**/*.test.ts"],
    // Crawler and API tests start real local HTTP servers; keep them generous but bounded.
    testTimeout: 20_000,
    environment: "node",
  },
});
