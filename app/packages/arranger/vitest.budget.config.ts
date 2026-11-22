import { defineConfig } from "vitest/config";

/** The budgets of "Show matches" and "Show coordinates" alone, so no other test shares the machine. */
export default defineConfig({
  test: {
    name: "arranger-budget",
    root: import.meta.dirname,
    environment: "node",
    include: ["tests/matches-budget.test.ts", "tests/coordinates-budget.test.ts"],
    fileParallelism: false,
  },
});
