import { readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { searchForWorkspaceRoot } from "vite";
import { defineConfig } from "vitest/config";
import { packageOf, thirdPartyNotices } from "./notices.ts";
import { FONT_LICENCE } from "./src/attributions.ts";

/** The `version` of a package.json file. */
function versionOf(file: string): string {
  return (JSON.parse(readFileSync(file, "utf8")) as { version: string }).version;
}

/** The schema package's `package.json`, as installed (or linked) for this workspace. */
const timeskeletonManifest = createRequire(import.meta.url).resolve(
  "@timetoalign/timeskeleton/package.json",
);

/**
 * The packages that get a chunk of their own, so that no chunk of the bundle
 * passes Vite's 500 kB warning limit. A group also takes the modules its
 * packages import, so a package comes before the packages that import it
 * (the earlier group has the higher priority). Packages only the lazily
 * loaded YAML and TOML codecs import are in no group: grouped with a package
 * the main chunk needs, they would be loaded at start.
 */
const VENDOR_CHUNKS: readonly (readonly [string, (name: string) => boolean])[] = [
  ["svelte", (name) => name === "svelte"],
  ["timeskeleton", (name) => name === "@timetoalign/timeskeleton"],
  ["flow", (name) => name.startsWith("@xyflow/")],
];

/** The chunk groups of both builds (`VENDOR_CHUNKS`), as Rolldown takes them. */
const CODE_SPLITTING = {
  groups: VENDOR_CHUNKS.map(([name, includes], index) => ({
    name,
    test: (id: string) => {
      const found = packageOf(id);
      return found !== undefined && includes(found[0]);
    },
    priority: VENDOR_CHUNKS.length - index,
  })),
};

/**
 * Two builds share this configuration.
 *
 * The page (`vite build`): `index.html` into `dist/`. The built page is
 * served by `tilie-server` from inside the wheel, under whatever path the
 * server mounts it at, so asset URLs are relative, and so is the API the
 * page asks (`api/`).
 *
 * The embed (`vite build --mode embed`): `src/embed.ts` into `dist-embed/`
 * as `tilie.js` with its exports kept, all styles in `tilie.css`, the lazy
 * chunks and the font under `assets/`, and the notices file; a host page
 * loads `tilie.css` and imports `mount` from `tilie.js`. Library mode is
 * not used, since it would inline the font into the stylesheet.
 *
 * The About pane shows the editor's version (the workspace's `package.json`,
 * which releases bump) and the bundled timeskeleton's, fixed at build time.
 *
 * During `pnpm dev`, API calls are proxied to a locally running server
 * (`tilie --port <port> --no-browser`); set `TILIE_PORT` to its port. The
 * development server may also read the schema package's real directory, so
 * that the bundled font is served: installed from npm it lies inside the
 * workspace anyway, but a local timeskeleton checkout linked in to try a
 * schema change lies outside it.
 */
export default defineConfig(({ mode }) => {
  const embed = mode === "embed";
  return {
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
      __TIMESKELETON_VERSION__: JSON.stringify(versionOf(timeskeletonManifest)),
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
    build: embed
      ? {
          outDir: "dist-embed",
          emptyOutDir: true,
          cssCodeSplit: false,
          rolldownOptions: {
            input: { tilie: "src/embed.ts" },
            // An app build drops the entry's exports; the embed is nothing but them.
            preserveEntrySignatures: "strict",
            output: {
              entryFileNames: "tilie.js",
              chunkFileNames: "assets/[name]-[hash].js",
              assetFileNames: ({ names }) =>
                names.some((name) => name.endsWith(".css"))
                  ? "tilie.css"
                  : "assets/[name]-[hash][extname]",
              codeSplitting: CODE_SPLITTING,
            },
          },
        }
      : {
          outDir: "dist",
          emptyOutDir: true,
          rolldownOptions: { output: { codeSplitting: CODE_SPLITTING } },
        },
    server: {
      fs: {
        allow: [
          searchForWorkspaceRoot(fileURLToPath(new URL(".", import.meta.url))),
          path.dirname(realpathSync(timeskeletonManifest)),
        ],
      },
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
      // Builds the editor: run on its own by `pnpm test:build` (`vitest.build.config.ts`).
      exclude: ["tests/attributions.test.ts"],
    },
  };
});
