import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "layout",
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
