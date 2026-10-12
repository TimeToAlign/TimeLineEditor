import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vitest/config";
import { thirdPartyNotices } from "./notices.ts";
import { FONT_LICENCE } from "./src/attributions.ts";

/** The `version` of a package.json file. */
function versionOf(file: string): string {
  return (JSON.parse(readFileSync(file, "utf8")) as { version: string }).version;
}

/**
 * The built app is served by `tilie-server` from inside the wheel, under
 * whatever path the server mounts it at, so asset URLs are relative.
 *
 * The About pane shows the editor's version (the workspace's `package.json`,
 * which releases bump) and the bundled timeskeleton's, fixed at build time.
 *
 * During `pnpm dev`, API calls are proxied to a locally running server
 * (`tilie --port <port> --no-browser`); set `TILIE_PORT` to its port.
 */
export default defineConfig({
  base: "./",
  plugins: [
    svelte(),
    thirdPartyNotices((packages) => {
      const directory = (name: string) => {
        const found = packages.get(name);
        if (found === undefined) throw new Error(`${name} is not in the bundle`);
        return found;
      };
      const flow = directory("@xyflow/svelte");
      return [
        {
          title: `Icons of the canvas controls, copied from @xyflow/svelte ${versionOf(path.join(flow, "package.json"))}`,
          licence: "MIT",
          licenceFile: path.join(flow, "LICENSE"),
        },
        {
          title: "DejaVu Sans 2.37 (the bundled font, from @timetoalign/timeskeleton)",
          licence: FONT_LICENCE,
          licenceFile: path.join(directory("@timetoalign/timeskeleton"), "fonts", "LICENSE"),
        },
      ];
    }),
  ],
  define: {
    __TILIE_VERSION__: JSON.stringify(
      versionOf(fileURLToPath(new URL("../../package.json", import.meta.url))),
    ),
    __TIMESKELETON_VERSION__: JSON.stringify(
      versionOf(createRequire(import.meta.url).resolve("@timetoalign/timeskeleton/package.json")),
    ),
  },
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
