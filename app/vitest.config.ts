import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      "packages/*",
      {
        test: {
          name: "workspace",
          environment: "node",
          include: ["tests/**/*.test.ts"],
        },
      },
    ],
  },
});
