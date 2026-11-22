/**
 * The workspaces the end-to-end suite opens, built through the store's
 * commands from TimeToShare's manifest fixtures, and the Examples menu's
 * workspaces, built through the store's commands alone; all written by
 * `writeWorkspace`. The `.tle.json` files beside this script and in the
 * editor's `examples/` are its output and are never edited by hand.
 *
 *   node e2e/fixtures/generate.ts           write the files
 *   node e2e/fixtures/generate.ts --check   exit 1 unless every file equals the output byte for byte
 */

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { AddKind, Address, Command, Manifest } from "../../packages/core/src/index.ts";
import {
  createStore,
  emptyWorkspace,
  isLoadError,
  loadManifest,
  writeWorkspace,
} from "../../packages/core/src/index.ts";
import type { FixtureBlock } from "../../packages/editor/src/fixtureWorkspace.ts";
import { FIXTURE_TIME, fixtureWorkspace } from "../../packages/editor/src/fixtureWorkspace.ts";

const here = import.meta.dirname;

/** The TimeToShare package that `core` depends on. */
const packageDir = path.dirname(
  createRequire(path.join(here, "../../packages/core/package.json")).resolve(
    "@timetoalign/timetoshare/package.json",
  ),
);
const { SCHEMA_VERSION } = (await import(
  pathToFileURL(path.join(packageDir, "dist", "index.js")).href
)) as { readonly SCHEMA_VERSION: string };

/** The manifest fixtures of that package's schema version. */
const manifestDir = path.join(packageDir, "fixtures", SCHEMA_VERSION);

/** A manifest fixture by its path below `manifestDir`, without `.yaml` (`bare`, `groups/group_styled`). */
function manifest(name: string): Manifest {
  const loaded = loadManifest(readFileSync(path.join(manifestDir, `${name}.yaml`), "utf8"));
  if (isLoadError(loaded)) throw new Error(`${name}.yaml is refused: ${JSON.stringify(loaded)}`);
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
  ["ggrand0000", "groups/group_grandchild", 0, 288],
  ["gmixed0000", "groups/group_parents_mixed", 640, 544],
  ["gstyled000", "groups/group_styled", 640, 0],
] as const;

/** The blocks of `bundles`: id, fixture of `bundles/`, x, y, in the order they are added. */
export const BUNDLES = [
  ["bmixed0000", "bundles/bundle_mixed", 0, 0],
  ["bshared000", "bundles/bundle_shared_parent", 640, 952],
  ["bungroup00", "bundles/bundle_ungrouped", 0, 480],
  ["btwogroups", "bundles/bundle_shared_member", 640, 560],
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

/** Where the Examples menu's workspaces are written: the editor's `examples/`. */
export const EXAMPLES_DIR = path.join(here, "../../packages/editor/examples");

/** The author of every journal entry of an example workspace. */
export const EXAMPLE_AUTHOR = "TimeLineEditor";

/** The block of the example "Timestamps". */
export const TIMESTAMPS_BLOCK = "timestamps";

/** A number on an axis as a command gives it: a JS number, or a `[numerator, denominator]` pair. */
type Value = number | readonly [number, number];

/** A LinearMap from `source` to `target` scaling by `scalar`. */
function linear(id: string, name: string, source: string, target: string, scalar: Value) {
  return { id, name, type: "LinearMap", source_unit: source, target_unit: target, scalar };
}

/**
 * The commands of the example "Timestamps", in order: the workspace named,
 * then one block holding a fraction root `score` (16 quarters) with maps to
 * an int (`ticks`), a fraction (`bars`, whole notes) and a float target
 * (`tempo`, seconds) and the children `phrase` (with its own map to ticks)
 * and `coda`; a float root `performance` (8 seconds) made a segment line of
 * `take_1` and `take_2`, with a map to samples; and named timestamps showing
 * several `display` sets, the empty one included. Each root is given its
 * default `origin` and `length` timestamps by its `add`.
 */
export function timestampsCommands(): Command[] {
  const block = { block: TIMESTAMPS_BLOCK };
  const at = (id: string) => ({ ...block, id });
  const manifest = { timetoshare: SCHEMA_VERSION, name: "Timestamps", timelines: [] };
  const add = (into: Address, kind: AddKind, value: object): Command => ({
    type: "add",
    into,
    [kind]: value,
  });
  const stamp = (timeline: string, name: string, coordinate: Value, display?: string[]) =>
    add(at(timeline), "timestamp", {
      name,
      coordinate,
      ...(display === undefined ? {} : { display }),
    });
  return [
    { type: "set", changes: [{ target: {}, values: { name: "Timestamps" } }] },
    add({}, "block", { id: TIMESTAMPS_BLOCK, manifest, x: 0, y: 0 }),
    add(block, "timeline", { id: "score", name: "Score", unit: "quarters", length: [16, 1] }),
    add(at("score"), "map", linear("ticks", "Ticks", "quarters", "ticks", 480)),
    add(at("score"), "map", linear("bars", "Bars", "quarters", "whole_notes", [1, 4])),
    add(at("score"), "map", linear("tempo", "Tempo", "quarters", "seconds", [1, 2])),
    add(at("score"), "child", {
      id: "phrase",
      name: "Phrase",
      unit: "quarters",
      length: [6, 1],
      offset: [4, 1],
    }),
    add(at("phrase"), "map", linear("phrase_ticks", "Phrase ticks", "quarters", "ticks", 480)),
    add(at("score"), "child", {
      id: "coda",
      name: "Coda",
      unit: "quarters",
      length: [4, 1],
      offset: [12, 1],
    }),
    add(block, "timeline", { id: "performance", name: "Performance", unit: "seconds", length: 8 }),
    add(at("performance"), "map", linear("samples", "Samples", "seconds", "samples", 44100)),
    add(at("performance"), "child", {
      id: "take_1",
      name: "Take 1",
      unit: "seconds",
      length: 3.5,
      offset: 0,
    }),
    add(at("performance"), "child", {
      id: "take_2",
      name: "Take 2",
      unit: "seconds",
      length: 4.5,
      offset: 3.5,
    }),
    { type: "set", changes: [{ target: at("performance"), values: { is_segment_line: true } }] },
    stamp("score", "Theme", [4, 1]),
    stamp("score", "Climax", [21, 2], ["wedge", "name", "id", "coordinate", "cross_section"]),
    stamp("score", "Silent", [14, 1], []),
    stamp("phrase", "Cadence", [5, 1], ["wedge", "id"]),
    stamp("performance", "Entry", 2.25, ["wedge", "coordinate", "cross_section"]),
  ];
}

/**
 * The workspace text of `commands`, journalled by `EXAMPLE_AUTHOR`, the
 * first at `FIXTURE_TIME` and each next one second later.
 */
export function exampleWorkspace(commands: readonly Command[]): string {
  let calls = 0;
  const store = createStore(emptyWorkspace(), {
    author: EXAMPLE_AUTHOR,
    clock: () => new Date(Date.parse(FIXTURE_TIME) + 1000 * calls++),
  });
  for (const [index, command] of commands.entries()) {
    const refusal = store.dispatch(command);
    if (refusal !== null) {
      throw new Error(`command ${index} is refused: ${refusal.code} ${refusal.message}`);
    }
  }
  return writeWorkspace(store.snapshot());
}

/** Every example file name and its text. */
export function exampleFiles(): Map<string, string> {
  return new Map([["timestamps.tle.json", exampleWorkspace(timestampsCommands())]]);
}

/** Every file the generator writes, by directory: the fixtures beside it, then the examples. */
function outputs(): Map<string, Map<string, string>> {
  return new Map([
    [here, fixtures()],
    [EXAMPLES_DIR, exampleFiles()],
  ]);
}

function main(check: boolean): number {
  let status = 0;
  for (const [directory, expected] of outputs()) {
    if (!check) {
      mkdirSync(directory, { recursive: true });
      for (const [name, text] of expected) writeFileSync(path.join(directory, name), text);
      continue;
    }
    const present = readdirSync(directory).filter((name) => name.endsWith(".tle.json"));
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
      } else if (readFileSync(path.join(directory, name), "utf8") !== text) {
        console.error(`${name} differs from the generator's output`);
        status = 1;
      }
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
