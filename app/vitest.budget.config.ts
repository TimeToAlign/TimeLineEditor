import { defineConfig } from "vitest/config";

/**
 * Every timing budget in one run, one file at a time, so no other test shares
 * the machine: core's and the arranger's. A budget that fails does not stop
 * the others; the run reports every figure and fails if any budget did.
 */
export default defineConfig({
  test: {
    projects: [
      "packages/core/vitest.budget.config.ts",
      "packages/arranger/vitest.budget.config.ts",
    ],
    fileParallelism: false,
    maxWorkers: 1,
  },
});
