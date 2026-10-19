import { defineConfig } from "vitest/config";

/**
 * The tests that build the editor (`tests/attributions.test.ts`): run alone
 * by `pnpm test:build`, outside `pnpm test`, since a production build takes
 * a minute.
 */
export default defineConfig({
  test: {
    name: "build",
    root: import.meta.dirname,
    environment: "node",
    include: ["tests/attributions.test.ts"],
  },
});
