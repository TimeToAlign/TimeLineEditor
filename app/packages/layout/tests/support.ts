/** Shared manifest fixtures, the font metrics, and command builders. */

import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import {
  apply,
  type Command,
  type CoordinateDict,
  createView,
  isCommandError,
  isLoadError,
  loadManifest,
  type Manifest,
} from "@timetoalign/tilie-core";
import { type Graphical, fontMetrics as metrics, SCHEMA_VERSION } from "@timetoalign/timeskeleton";
import {
  DEFAULT_LAYER,
  DEFAULT_PLACEMENT,
  type Drawing,
  type DrawnElement,
  draw,
  type Placement,
} from "../src/index.ts";

const require = createRequire(import.meta.url);
const packageDir = path.dirname(require.resolve("@timetoalign/timeskeleton/package.json"));

export const fixturesDir = path.join(packageDir, "fixtures", SCHEMA_VERSION);
export { fontMetrics as metrics } from "@timetoalign/timeskeleton";
export const BLOCK = "0000000000";

export function manifestNames(): string[] {
  return readdirSync(fixturesDir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => name.slice(0, -5))
    .sort();
}

export function load(name: string): Manifest {
  const result = loadManifest(readFileSync(path.join(fixturesDir, `${name}.json`), "utf8"));
  if (isLoadError(result)) throw new Error(`${name}: ${result.problems[0]?.message}`);
  return result;
}

/** The default layers of a manifest: the defaults, then its own `graphical` block. */
export function defaultLayers(manifest: Manifest): Graphical[] {
  return manifest.graphical === undefined ? [DEFAULT_LAYER] : [DEFAULT_LAYER, manifest.graphical];
}

/** Draw a fixture with the default layers plus `extra`, at a placement. */
export function drawFixture(
  name: string,
  extra: readonly Graphical[] = [],
  placement: Placement = DEFAULT_PLACEMENT,
): Drawing {
  const manifest = load(name);
  return draw(manifest, placement, [...defaultLayers(manifest), ...extra], metrics);
}

export function element(drawing: Drawing, address: string | null, index = 0): DrawnElement {
  const found = drawing.elements.filter((item) => item.address === address)[index];
  if (found === undefined) throw new Error(`no element ${address}`);
  return found;
}

export function quarters(numerator: number, denominator = 1): CoordinateDict {
  return { unit: "quarters", number_type: "fraction", value: [numerator, denominator] };
}

/** A manifest built through commands: a quarters root, then manifest commands on it. */
export function build(rootId: string, length: number, ...commands: object[]): Manifest {
  const source = load("bare");
  const timeline = { ...source.timeline, id: rootId, name: null, length: quarters(length) };
  let view = createView({ created: "2026-10-11T00:00:00Z", generator: "layout-tests" });
  const created = apply(view, {
    type: "createBlock",
    id: BLOCK,
    manifest: { meta: source.meta, timeline },
    x: 0,
    y: 0,
  });
  if (isCommandError(created)) throw new Error(`${created.code}: ${created.message}`);
  view = created;
  for (const command of commands) {
    const changed = apply(view, { block: BLOCK, ...command } as Command);
    if (isCommandError(changed)) throw new Error(`${changed.code}: ${changed.message}`);
    view = changed;
  }
  const record = view.records[BLOCK];
  if (record?.kind !== "block") throw new Error("the test block is missing");
  return record.manifest;
}

/** The `addChild` command for a quarters child. */
export function child(parent: string, id: string, offset: number, length: number): object {
  return {
    type: "addChild",
    parent,
    offset: quarters(offset),
    child: {
      id,
      class: "ContinuousLogicalTimeline",
      unit: "quarters",
      number_type: "fraction",
      length: quarters(length),
    },
  };
}
