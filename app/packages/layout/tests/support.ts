/** Shared manifest fixtures, the font metrics, and command builders. */

import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import {
  apply,
  type CoordinateDict,
  createView,
  isCommandError,
  isLoadError,
  loadManifest,
  type Manifest,
  manifestKind,
  type TimelineFile,
  type TimelineManifest,
} from "@timetoalign/tilie-core";
import {
  type Graphical,
  fontMetrics as metrics,
  SCHEMA_VERSION,
  validate,
} from "@timetoalign/timeskeleton";
import {
  DEFAULT_LAYER,
  DEFAULT_PLACEMENT,
  type Drawing,
  type DrawnElement,
  draw,
  manifestLayer,
  type Placement,
} from "../src/index.ts";

const require = createRequire(import.meta.url);
const packageDir = path.dirname(require.resolve("@timetoalign/timeskeleton/package.json"));

export const fixturesDir = path.join(packageDir, "fixtures", SCHEMA_VERSION);
export { fontMetrics as metrics } from "@timetoalign/timeskeleton";
export const BLOCK = "0000000000";

/** The timeline fixtures by name, then the group and bundle fixtures as `groups/…`, `bundles/…`. */
export function manifestNames(): string[] {
  return ["", "groups/", "bundles/"].flatMap((prefix) =>
    readdirSync(path.join(fixturesDir, prefix))
      .filter((name) => name.endsWith(".json"))
      .map((name) => `${prefix}${name.slice(0, -5)}`)
      .sort(),
  );
}

/** A fixture of any kind by its path below the fixtures directory (`groups/…`), without `.json`. */
export function loadFile(name: string): Manifest {
  const result = loadManifest(readFileSync(path.join(fixturesDir, `${name}.json`), "utf8"));
  if (isLoadError(result)) throw new Error(`${name}: ${result.problems[0]?.message}`);
  return result;
}

/** A timeline-file fixture by name. */
export function load(name: string): TimelineFile {
  const manifest = loadFile(name);
  if (manifestKind(manifest) !== "timeline") throw new Error(`${name} is no timeline file`);
  return manifest as TimelineFile;
}

/**
 * Draw a fixture of any kind with the default layer, the application's
 * layers `extra` and the manifest's own layer, at a placement.
 */
export function drawFixture(
  name: string,
  extra: readonly Graphical[] = [],
  placement: Placement = DEFAULT_PLACEMENT,
): Drawing {
  const manifest = loadFile(name);
  return draw(manifest, placement, [DEFAULT_LAYER, ...extra, manifestLayer(manifest)], metrics);
}

export function element(drawing: Drawing, address: string | null, index = 0): DrawnElement {
  const found = drawing.elements.filter((item) => item.address === address)[index];
  if (found === undefined) throw new Error(`no element ${address}`);
  return found;
}

export function quarters(numerator: number, denominator = 1): CoordinateDict {
  return { unit: "quarters", number_type: "fraction", value: [numerator, denominator] };
}

/** A manifest built through commands: a quarters root, then commands on its block. */
export function build(rootId: string, length: number, ...commands: object[]): TimelineFile {
  const source = load("bare");
  const timeline = { ...source.timeline, id: rootId, name: null, length: quarters(length) };
  let view = apply(createView(), {
    type: "add",
    into: "workspace",
    block: { id: BLOCK, manifest: { meta: source.meta, timeline }, x: 0, y: 0 },
  });
  for (const command of [...commands]) {
    if (isCommandError(view)) break;
    view = apply(view, command);
  }
  if (isCommandError(view)) throw new Error(`${view.code}: ${view.message}`);
  return (view.blocks[BLOCK] as { readonly manifest: TimelineFile }).manifest;
}

/**
 * The manifest with the `locked` flags of the named timelines replaced,
 * validated again against the schema. Core's invariants refuse an unlocked
 * child, which the schema admits and the drawing specification draws.
 */
export function withLocked(
  manifest: TimelineFile,
  locked: Readonly<Record<string, boolean>>,
): TimelineFile {
  const relock = (timeline: TimelineManifest): TimelineManifest => ({
    ...timeline,
    locked: Object.hasOwn(locked, timeline.id) ? (locked[timeline.id] as boolean) : timeline.locked,
    children: Object.fromEntries(
      Object.entries(timeline.children).map(([key, item]) => [
        key,
        { ...item, timeline: relock(item.timeline) },
      ]),
    ),
  });
  const relocked = { ...manifest, timeline: relock(manifest.timeline) };
  validate(relocked);
  return relocked;
}

/** The `add` command for a ScalarMap from quarters to seconds. */
export function scalarMap(timeline: string, id: string): object {
  return {
    type: "add",
    into: `${BLOCK}/${timeline}`,
    map: {
      type: "ScalarMap",
      id,
      name: null,
      source_unit: "quarters",
      target_unit: "seconds",
      scalar: [1, 2],
    },
  };
}

/** The `add` command for a locked quarters child. */
export function child(parent: string, id: string, offset: number, length: number): object {
  const { timeline } = load("bare");
  return {
    type: "add",
    into: `${BLOCK}/${parent}`,
    child: {
      offset: quarters(offset),
      timeline: { ...timeline, id, name: null, length: quarters(length), locked: true },
    },
  };
}
