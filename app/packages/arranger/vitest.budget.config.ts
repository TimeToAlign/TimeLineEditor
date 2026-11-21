import { defineConfig } from "vitest/config";

/** The budget of "Show matches" alone, so no other test shares the machine. */
export default defineConfig({
  test: {
    name: "arranger-budget",
    root: import.meta.dirname,
    environment: "node",
    include: ["tests/matches-budget.test.ts"],
    fileParallelism: false,
  },
});
