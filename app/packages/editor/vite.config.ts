import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vitest/config";

/**
 * The built app is served by `tilie-server` from inside the wheel, under
 * whatever path the server mounts it at, so asset URLs are relative.
 *
 * During `pnpm dev`, API calls are proxied to a locally running server
 * (`tilie --port <port> --no-browser`); set `TILIE_PORT` to its port.
 */
export default defineConfig({
  base: "./",
  plugins: [svelte()],
  environments: {
    client: {
      resolve: {
        // Vitest runs the jsdom tests through this environment but resolves
        // packages with Node's export conditions, which would select Svelte's
        // server build; the browser condition selects the build that
        // `mount()` needs. `vite build` uses the browser condition anyway.
        conditions: ["browser"],
      },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${process.env.TILIE_PORT ?? "8000"}`,
        changeOrigin: true,
      },
    },
  },
  test: {
    name: "editor",
    environment: "jsdom",
    include: ["tests/**/*.test.ts"],
  },
});
