/** Shared manifest fixtures, the font metrics, and command builders. */

import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import {
  type AxisValue,
  apply,
  type ContainerKind,
  createView,
  type ElementAddress,
  type Facet,
  idAddress,
  inBlock,
  isCommandError,
  isLoadError,
  LINE,
  loadManifest,
  type Manifest,
  type Part,
  sameAddress,
  type TimelineManifest,
  WORKSPACE,
} from "@timetoalign/tilie-core";
import {
  type Address,
  type Graphical,
  fontMetrics as metrics,
  SCHEMA_VERSION,
  validate,
} from "@timetoalign/timetoshare";
import {
  DEFAULT_LAYER,
  DEFAULT_PLACEMENT,
  type Drawing,
  type DrawnBox,
  type DrawnElement,
  draw,
  manifestLayer,
  type Placement,
} from "../src/index.ts";

const require = createRequire(import.meta.url);
const packageDir = path.dirname(require.resolve("@timetoalign/timetoshare/package.json"));

export const fixturesDir = path.join(packageDir, "fixtures", SCHEMA_VERSION);
export { fontMetrics as metrics } from "@timetoalign/timetoshare";
export const BLOCK = "0000000000";

/**
 * The fixtures at the top by name, then those sorted into `groups/…` and
 * `bundles/…`, without their minimal twins (`*.minimal.json`).
 */
export function manifestNames(): string[] {
  return ["", "groups/", "bundles/"].flatMap((prefix) =>
    readdirSync(path.join(fixturesDir, prefix))
      .filter((name) => name.endsWith(".json") && !name.endsWith(".minimal.json"))
      .map((name) => `${prefix}${name.slice(0, -5)}`)
      .sort(),
  );
}

/** A fixture by its path below the fixtures directory (`groups/…`), without `.json`. */
export function loadFile(name: string): Manifest {
  const result = loadManifest(readFileSync(path.join(fixturesDir, `${name}.json`), "utf8"));
  if (isLoadError(result)) throw new Error(`${name}: ${result.problems[0]?.message}`);
  return result;
}

/** A fixture of one root and no group by name. */
export function load(name: string): Manifest {
  const manifest = loadFile(name);
  if (manifest.timelines.length !== 1 || manifest.groups.length > 0) {
    throw new Error(`${name} is no manifest of one root`);
  }
  return manifest;
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

/**
 * The schema's `Address` `{id}` with the part words `part` (section 2.2), for
 * selectors and comparisons alike: core's builders give the read-only
 * `ElementAddress`, which a selector does not take.
 */
export function at(id: string, ...part: Part[]): Address {
  const [first, ...rest] = part;
  return first === undefined ? { id } : { id, part: [first, ...rest] };
}

/** The element at `address`, the `index`-th of those a drawing draws there. */
export function element(drawing: Drawing, address: ElementAddress, index = 0): DrawnElement {
  const found = drawing.elements.filter((item) => sameAddress(item.address, address))[index];
  if (found === undefined) throw new Error(`no element ${JSON.stringify(address)}`);
  return found;
}

/** The containers of one kind a drawing records, in drawing order. */
export function boxesOf(drawing: Drawing, kind: ContainerKind): DrawnBox[] {
  return drawing.boxes.filter((box) => box.kind === kind);
}

/** The frames and block-held cards of a drawing, its items, in drawing order. */
export function itemsOf(drawing: Drawing): DrawnBox[] {
  return drawing.boxes.filter((box) => box.item !== undefined);
}

/** The first container a drawing records at `address`. */
export function boxAt(drawing: Drawing, address: ElementAddress): DrawnBox {
  const found = drawing.boxes.find((box) => sameAddress(box.address, address));
  if (found === undefined) throw new Error(`no container ${JSON.stringify(address)}`);
  return found;
}

/** A bare value on a `fraction` axis. */
export function quarters(numerator: number, denominator = 1): AxisValue {
  return [numerator, denominator];
}

/** A manifest built through commands: a quarters root, then commands on its block. */
export function build(rootId: string, length: number, ...commands: object[]): Manifest {
  const source = load("bare");
  const [root] = source.timelines;
  const timeline = { ...root, id: rootId, name: null, length: quarters(length) };
  let view = apply(createView(), {
    type: "add",
    into: WORKSPACE,
    block: { id: BLOCK, manifest: { ...source, timelines: [timeline] }, x: 0, y: 0 },
  });
  for (const command of [...commands]) {
    if (isCommandError(view)) break;
    view = apply(view, command);
  }
  if (isCommandError(view)) throw new Error(`${view.code}: ${view.message}`);
  return (view.blocks[BLOCK] as { readonly manifest: Manifest }).manifest;
}

/** A fixture by its path below the fixtures directory, changed by commands on its block. */
export function edit(name: string, ...commands: object[]): Manifest {
  let view = apply(createView(), {
    type: "add",
    into: WORKSPACE,
    block: { id: BLOCK, manifest: loadFile(name), x: 0, y: 0 },
  });
  for (const command of commands) {
    if (isCommandError(view)) break;
    view = apply(view, command);
  }
  if (isCommandError(view)) throw new Error(`${view.code}: ${view.message}`);
  return (view.blocks[BLOCK] as { readonly manifest: Manifest }).manifest;
}

/**
 * A band order (section 6.4): the facets `above` from the top down, then
 * `line`, then the facets `below` from the line down.
 */
export function bandOrder(above: readonly Facet[], below: readonly Facet[]): string[] {
  return [...above, LINE, ...below];
}

/** The address of the element with ID `id` in the block. */
export function target(id: string): object {
  return inBlock(BLOCK, idAddress(id));
}

/** The `set` command of some properties of the element with ID `id` in the block. */
export function set(id: string, values: object): object {
  return { type: "set", changes: [{ target: target(id), values }] };
}

/**
 * The manifest with the `locked` flags of the named timelines replaced,
 * validated again against the schema.
 */
export function withLocked(
  manifest: Manifest,
  locked: Readonly<Record<string, boolean>>,
): Manifest {
  const relock = <T extends TimelineManifest>(timeline: T): T => ({
    ...timeline,
    locked: Object.hasOwn(locked, timeline.id) ? (locked[timeline.id] as boolean) : timeline.locked,
    children: timeline.children.map(relock),
  });
  const relocked = { ...manifest, timelines: manifest.timelines.map(relock) };
  validate(relocked);
  return relocked;
}

/** The `add` command for a LinearMap from quarters to seconds. */
export function linearMap(timeline: string, id: string): object {
  return {
    type: "add",
    into: target(timeline),
    map: {
      type: "LinearMap",
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
  const [timeline] = load("bare").timelines;
  return {
    type: "add",
    into: target(parent),
    child: {
      ...timeline,
      id,
      name: null,
      offset: quarters(offset),
      length: quarters(length),
      locked: true,
    },
  };
}
