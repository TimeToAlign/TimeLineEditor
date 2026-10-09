import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "arranger",
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
