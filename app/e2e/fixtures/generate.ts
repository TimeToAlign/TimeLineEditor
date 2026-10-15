/**
 * The workspaces the end-to-end suite opens, built through the store's
 * commands from timeskeleton's manifest fixtures and written by
 * `writeWorkspace`. The `.tle.json` files beside this script are its output
 * and are never edited by hand.
 *
 *   node e2e/fixtures/generate.ts           write the files
 *   node e2e/fixtures/generate.ts --check   exit 1 unless every file equals the output byte for byte
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { Manifest } from "../../packages/core/src/index.ts";
import { isLoadError, loadManifest } from "../../packages/core/src/index.ts";
import type { FixtureBlock } from "../../packages/editor/src/fixtureWorkspace.ts";
import { fixtureWorkspace } from "../../packages/editor/src/fixtureWorkspace.ts";

const here = import.meta.dirname;

/** The timeskeleton package that `core` depends on. */
const packageDir = path.dirname(
  createRequire(path.join(here, "../../packages/core/package.json")).resolve(
    "@timetoalign/timeskeleton/package.json",
  ),
);
const { SCHEMA_VERSION } = (await import(
  pathToFileURL(path.join(packageDir, "dist", "index.js")).href
)) as { readonly SCHEMA_VERSION: string };

/** The manifest fixtures of that package's schema version. */
const manifestDir = path.join(packageDir, "fixtures", SCHEMA_VERSION);

/** A manifest fixture by its path below `manifestDir`, without `.json` (`bare`, `groups/group_styled`). */
function manifest(name: string): Manifest {
  const loaded = loadManifest(readFileSync(path.join(manifestDir, `${name}.json`), "utf8"));
  if (isLoadError(loaded)) throw new Error(`${name}.json is refused: ${JSON.stringify(loaded)}`);
  return loaded;
}

/** The blocks of `small`: id, manifest fixture, x, y, in the order they are added. */
export const SMALL = [
  ["bare000000", "bare", 0, 0],
  ["nested0000", "nested", 0, 160],
  ["map0000000", "map", 0, 320],
  ["flow000000", "flow_control", 640, 0],
  ["styled0000", "styled__score", 640, 160],
] as const;

/** The blocks of `groups`: id, fixture of one group, x, y, in the order they are added. */
export const GROUPS = [
  ["gchild0000", "groups/group_child_member", 0, 0],
  ["ggrand0000", "groups/group_grandchild", 0, 240],
  ["gmixed0000", "groups/group_parents_mixed", 640, 0],
  ["gstyled000", "groups/group_styled", 640, 424],
] as const;

/** The blocks of `bundles`: id, fixture of `bundles/`, x, y, in the order they are added. */
export const BUNDLES = [
  ["bmixed0000", "bundles/bundle_mixed", 0, 0],
  ["bshared000", "bundles/bundle_shared_parent", 640, 0],
  ["bungroup00", "bundles/bundle_ungrouped", 0, 480],
] as const;

/** The grid of blocks of one timeline: the pitch between block origins. */
export const GRID_PITCH = { x: 512, y: 80 } as const;

/** The columns of each grid workspace; rows fill up to the block count. */
export const GRIDS = {
  "grid-300": { blocks: 300, columns: 20 },
  "grid-900": { blocks: 900, columns: 30 },
};

/** The id of grid block `n`: `g` and `n` in nine decimal digits. */
export function gridId(n: number): string {
  return `g${n.toString().padStart(9, "0")}`;
}

function listed(blocks: readonly (readonly [string, string, number, number])[]): string {
  return fixtureWorkspace(blocks.map(([id, fixture, x, y]) => [id, manifest(fixture), x, y]));
}

function* grid(blocks: number, columns: number): Generator<FixtureBlock> {
  const bare = manifest("bare");
  for (let n = 0; n < blocks; n += 1) {
    const x = (n % columns) * GRID_PITCH.x;
    const y = Math.floor(n / columns) * GRID_PITCH.y;
    yield [gridId(n), bare, x, y];
  }
}

/** Every fixture file name and its text. */
export function fixtures(): Map<string, string> {
  const result = new Map([
    ["small.tle.json", listed(SMALL)],
    ["groups.tle.json", listed(GROUPS)],
    ["bundles.tle.json", listed(BUNDLES)],
  ]);
  for (const [name, { blocks, columns }] of Object.entries(GRIDS)) {
    result.set(`${name}.tle.json`, fixtureWorkspace(grid(blocks, columns)));
  }
  return result;
}

function main(check: boolean): number {
  const expected = fixtures();
  if (!check) {
    for (const [name, text] of expected) writeFileSync(path.join(here, name), text);
    return 0;
  }
  let status = 0;
  const present = readdirSync(here).filter((name) => name.endsWith(".tle.json"));
  for (const name of present) {
    if (!expected.has(name)) {
      console.error(`${name} is not produced by the generator`);
      status = 1;
    }
  }
  for (const [name, text] of expected) {
    if (!present.includes(name)) {
      console.error(`${name} is missing`);
      status = 1;
    } else if (readFileSync(path.join(here, name), "utf8") !== text) {
      console.error(`${name} differs from the generator's output`);
      status = 1;
    }
  }
  return status;
}

if (
  import.meta.filename === process.argv[1] ||
  process.argv[1] === path.join(here, "generate.ts")
) {
  process.exitCode = main(process.argv.includes("--check"));
}
