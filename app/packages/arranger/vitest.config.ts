import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vitest/config";

/**
 * The svelte plugin lets tests import `.svelte` components. The pure tests run
 * under Node; a component test opts into a DOM with a
 * `// @vitest-environment jsdom` comment at the top of its file.
 */
export default defineConfig({
  plugins: [svelte()],
  environments: {
    client: {
      resolve: {
        // Vitest resolves packages with Node's export conditions, which would
        // select Svelte's server build; the browser condition selects the build
        // that `mount()` needs.
        conditions: ["browser"],
      },
    },
  },
  test: {
    name: "arranger",
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
