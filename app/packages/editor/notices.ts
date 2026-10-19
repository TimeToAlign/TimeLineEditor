/**
 * `THIRD_PARTY_NOTICES.txt`: the full licence text of every npm package
 * whose code the editor bundle contains, written next to `index.html` by
 * `vite build`, plus the notices for what was copied or bundled outside a
 * package's code (the canvas control icons and the font). The About pane
 * links to it.
 */

import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";
import { NOTICES_FILE } from "./src/attributions.ts";

export const RULE = "=".repeat(72);
export const SUBRULE = "-".repeat(72);

/** A notice for something that is not an npm package's bundled code. */
export interface ExtraNotice {
  readonly title: string;
  /** The licence's name. */
  readonly licence: string;
  /** The file holding the licence text. */
  readonly licenceFile: string;
}

/** The workspace's own packages, which are this project's code, not third-party software. */
const WORKSPACE_PACKAGE = /^@timetoalign\/tilie-/;

/**
 * The third-party package a bundled file belongs to, as `[name, directory]`:
 * the nearest `package.json` with a `name` above the file's real path, so a
 * package installed under `node_modules` and one linked from elsewhere are
 * found alike. `undefined` for a virtual module, a file outside any package
 * and this workspace's own packages.
 */
export function packageOf(file: string): [string, string] | undefined {
  const bare = file.replace(/^\0/, "").replace(/\?.*$/, "");
  if (!path.isAbsolute(bare) || !existsSync(bare)) return undefined;
  let directory = path.dirname(realpathSync(bare));
  for (;;) {
    const manifest = path.join(directory, "package.json");
    if (existsSync(manifest)) {
      const { name } = JSON.parse(readFileSync(manifest, "utf8")) as { name?: unknown };
      if (typeof name === "string") {
        return WORKSPACE_PACKAGE.test(name) ? undefined : [name, directory];
      }
    }
    const parent = path.dirname(directory);
    if (parent === directory) return undefined;
    directory = parent;
  }
}

/** The licence file of a package directory, if it ships one. */
export function licenceFile(directory: string): string | undefined {
  const name = readdirSync(directory).find((file) => /^licen[cs]e(\.|$)/i.test(file));
  return name === undefined ? undefined : path.join(directory, name);
}

function section(heading: string, licence: string, text: string): string {
  return `${RULE}\n${heading}\nLicense: ${licence}\n${SUBRULE}\n${text}${text.endsWith("\n") ? "" : "\n"}`;
}

/** The notices for the given package directories (name → directory) and extras. */
export function notices(packages: ReadonlyMap<string, string>, extras: readonly ExtraNotice[]) {
  const parts = [
    "TimeLineEditor: third-party notices\n\nThe TimeLineEditor bundle contains the following third-party software.\nEach is listed with its version and its full licence text.\n",
  ];
  for (const name of [...packages.keys()].sort()) {
    const directory = packages.get(name) as string;
    const manifest = JSON.parse(readFileSync(path.join(directory, "package.json"), "utf8")) as {
      version: string;
      license: string;
    };
    const file = licenceFile(directory);
    if (file === undefined) {
      throw new Error(`${name} ships no licence file, so its notice cannot be written`);
    }
    const text = readFileSync(file, "utf8");
    parts.push(section(`${name} ${manifest.version}`, manifest.license, text));
  }
  for (const extra of extras) {
    parts.push(section(extra.title, extra.licence, readFileSync(extra.licenceFile, "utf8")));
  }
  return parts.join("\n");
}

/**
 * The Vite plugin: at the end of a build, the packages of every module that
 * contributes code to a chunk, and the extras derived from them, become
 * `THIRD_PARTY_NOTICES.txt`.
 */
export function thirdPartyNotices(
  extras: (packages: ReadonlyMap<string, string>) => readonly ExtraNotice[],
): Plugin {
  return {
    name: "tilie-third-party-notices",
    apply: "build",
    generateBundle(_options, bundle) {
      const packages = new Map<string, string>();
      for (const output of Object.values(bundle)) {
        if (output.type !== "chunk") continue;
        for (const [id, module] of Object.entries(output.modules)) {
          if (module.renderedLength === 0) continue;
          const found = packageOf(id);
          if (found !== undefined) packages.set(...found);
        }
      }
      this.emitFile({
        type: "asset",
        fileName: NOTICES_FILE,
        source: notices(packages, extras(packages)),
      });
    },
  };
}
