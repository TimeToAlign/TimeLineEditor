import { defineConfig } from "vitest/config";

/** The budgets alone, one file at a time, so no other test shares the machine. */
export default defineConfig({
  test: {
    name: "budget",
    root: import.meta.dirname,
    environment: "node",
    include: ["tests/budget.test.ts"],
    fileParallelism: false,
  },
});
