import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "writers",
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
