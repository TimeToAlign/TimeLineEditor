import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "core",
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // The budgets time the code and run on their own: `pnpm test:budget`.
    exclude: ["tests/budget.test.ts"],
  },
});
