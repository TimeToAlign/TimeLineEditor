/** Shared manifest fixtures, the font metrics, and command builders. */

import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import {
  type AxisValue,
  apply,
  type ContainerKind,
  createIdMinter,
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
  canonicalOrder,
  type Graphical,
  fontMetrics as metrics,
  SCHEMA_VERSION,
  validate,
  withFileIds,
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
  type WedgeCorner,
} from "../src/index.ts";

const require = createRequire(import.meta.url);
const packageDir = path.dirname(require.resolve("@timetoalign/timetoshare/package.json"));

export const fixturesDir = path.join(packageDir, "fixtures", SCHEMA_VERSION);
export { fontMetrics as metrics } from "@timetoalign/timetoshare";
export const BLOCK = "0000000000";
/**
 * The seed of the minter the command builders apply their commands with:
 * what a command creates beyond the IDs it gives (`ids`) is minted the same
 * every run, and a test names only the IDs its commands give.
 */
export const MINTER_SEED = 20261126n;

/**
 * The fixtures at the top by name, then those sorted into `groups/…`,
 * `bundles/…` and `flow/…`, without their minimal twins (`*.minimal.yaml`).
 */
export function manifestNames(): string[] {
  return ["", "groups/", "bundles/", "flow/"].flatMap((prefix) =>
    readdirSync(path.join(fixturesDir, prefix))
      .filter((name) => name.endsWith(".yaml") && !name.endsWith(".minimal.yaml"))
      .map((name) => `${prefix}${name.slice(0, -5)}`)
      .sort(),
  );
}

/** The fixtures read so far, by name: a manifest is immutable, so each file is read once. */
const loaded = new Map<string, Manifest>();

/** A fixture by its path below the fixtures directory (`groups/…`), without `.yaml`. */
export function loadFile(name: string): Manifest {
  const known = loaded.get(name);
  if (known !== undefined) return known;
  const result = loadManifest(readFileSync(path.join(fixturesDir, `${name}.yaml`), "utf8"));
  if (isLoadError(result)) throw new Error(`${name}: ${result.problems[0]?.message}`);
  loaded.set(name, result);
  return result;
}

/**
 * The ID of the one conversion map of type `type` that a timeline of a
 * fixture holds directly (not one inside another map): how a test names a
 * map whose ID the library mints, as a MeasureMap's record map or a corpus
 * loader's maps.
 */
export function conversionMapOf(name: string, type: string): string {
  type Tree = {
    readonly conversion_maps: readonly { readonly id: string; readonly type: string }[];
    readonly children: readonly Tree[];
  };
  const maps: Tree["conversion_maps"][number][] = [];
  const walk = (timeline: Tree): void => {
    maps.push(...timeline.conversion_maps);
    for (const child of timeline.children) walk(child);
  };
  for (const root of loadFile(name).timelines) walk(root);
  const found = maps.filter((map) => map.type === type);
  if (found.length !== 1) throw new Error(`${found.length} ${type}s in ${name}, not one`);
  return (found[0] as Tree["conversion_maps"][number]).id;
}

/**
 * The ID of the one flow-control element of role `role` at the quarter
 * `quarter` that a root of a fixture holds: how a test names an element whose
 * ID a corpus loader mints, by what the fixture states of it.
 */
export function flowControlAt(name: string, role: string, quarter: number): string {
  const place = JSON.stringify(quarters(quarter));
  const found = loadFile(name)
    .timelines.flatMap((root) => root.flow_control)
    .filter((item) => item.role === role && JSON.stringify(item.coordinate) === place);
  if (found.length !== 1) throw new Error(`${found.length} ${role}s at ${quarter} in ${name}`);
  return (found[0] as (typeof found)[number]).id;
}

/** A fixture of one root and no group by name. */
export function load(name: string): Manifest {
  const manifest = loadFile(name);
  if (manifest.timelines.length !== 1 || manifest.groups.length > 0) {
    throw new Error(`${name} is no manifest of one root`);
  }
  return manifest;
}

/** The one root of a fixture of one root and no group (`load`). */
export function rootOf(name: string): TimelineManifest {
  return load(name).timelines[0] as TimelineManifest;
}

/**
 * An application layer hiding every ancestor card (section 8.8), which the
 * defaults show: the drawings of a test whose subject is not the ancestor
 * card keep the derivations made without it, the cards taking no room.
 */
export const HIDDEN_ANCESTOR_CARDS: Graphical = {
  rules: [{ select: { element: "ancestor_card" }, set: { display: "none" } }],
};

/**
 * An application layer hiding every elision (section 8.9, Elided and full),
 * which draws every ancestor card whole: the drawings of a test of an
 * ancestor card's geometry (section 8.8) keep the derivations made without
 * gaps.
 */
export const FULL_CARDS: Graphical = {
  rules: [{ select: { element: "elision" }, set: { display: "none" } }],
};

/**
 * An application layer showing the arcs of every jump, which the defaults
 * hide (section 4), and hiding every symbol and fork (section 6.4): the
 * drawings of a test whose subject is an arc, or not flow control at all,
 * keep the derivations made with the arcs and without symbols and forks.
 */
export const ARCS_ALONE: Graphical = {
  rules: [
    { select: { element: "jump" }, set: { display: "inline" } },
    { select: { element: "symbol" }, set: { display: "none" } },
    { select: { element: "fork" }, set: { display: "none" } },
  ],
};

/**
 * `ARCS_ALONE` drawn in the cards held by the block alone: the arcs of every
 * jump in a group's frame hidden, as a member that is a child timeline draws
 * its root's jumps on its stretch (section 6.4, Gathering): the drawings of
 * a test whose subject is not a member's flow control keep the derivations
 * made without them.
 */
export const ROOT_ARCS_ALONE: Graphical = {
  rules: [
    ...(ARCS_ALONE.rules ?? []),
    { select: { element: "jump", inside: "frame" }, set: { display: "none" } },
  ],
};

/**
 * An application layer hiding the regions band of every timeline held by a
 * band, which the defaults show (section 4): the drawings of a test whose
 * subject is not a child's regions keep the derivations made without them.
 */
export const CHILD_REGIONS_HIDDEN: Graphical = {
  rules: [
    { select: { element: "band", facet: "regions", inside: "band" }, set: { display: "none" } },
  ],
};

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
 * Draw a fixture as `drawFixture` does with `HIDDEN_ANCESTOR_CARDS` before the
 * application's layers `extra`: for a test of a child member's own card, its
 * frame or its block, whose numbers are derived without the ancestor cards.
 */
export function drawWithoutAncestorCards(
  name: string,
  extra: readonly Graphical[] = [],
  placement: Placement = DEFAULT_PLACEMENT,
): Drawing {
  return drawFixture(name, [HIDDEN_ANCESTOR_CARDS, ...extra], placement);
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

/**
 * The corners of an unturned wedge whose base lies at the ordinate `yb`,
 * `half` to either side of its tip's abscissa (section 6.6): 3, or 3 times
 * its item's scale.
 */
export function unturned(yb: number, half = 3): readonly [WedgeCorner, WedgeCorner] {
  return [
    { dx: -half, y: yb },
    { dx: half, y: yb },
  ];
}

/** The ordinate of an unturned wedge's base: its corners'. */
export function baseOf(wedge: DrawnElement): number {
  if (wedge.type !== "wedge") throw new Error(`a ${wedge.type} is no wedge`);
  return wedge.corners[0].y;
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

/**
 * A manifest built through commands: a quarters root `rootId` of length `length` with the
 * named timestamps an editor gives every new root, `origin` at 0 and `length` at its length,
 * each drawing its wedge and its coordinate label (`bare`'s, moved to the new root), then
 * commands on its block, applied with a minter of `MINTER_SEED`.
 */
export function build(rootId: string, length: number, ...commands: object[]): Manifest {
  const source = load("bare");
  const [root] = source.timelines;
  const timeline = { ...root, id: rootId, name: null, length: quarters(length) };
  const timestamps = (source.graphical?.timestamps ?? []).map((timestamp) => ({
    ...timestamp,
    timeline: rootId,
    ...(timestamp.name === "length" ? { coordinate: quarters(length) } : {}),
  }));
  const graphical = { ...source.graphical, timestamps };
  const minter = createIdMinter({ seed: MINTER_SEED });
  let view = apply(
    createView(),
    {
      type: "add",
      into: WORKSPACE,
      block: { id: BLOCK, manifest: { ...source, graphical, timelines: [timeline] }, x: 0, y: 0 },
    },
    minter,
  );
  for (const command of [...commands]) {
    if (isCommandError(view)) break;
    view = apply(view, command, minter);
  }
  if (isCommandError(view)) throw new Error(`${view.code}: ${view.message}`);
  return (view.blocks[BLOCK] as { readonly manifest: Manifest }).manifest;
}

/** A fixture by its path below the fixtures directory, changed by commands on its block. */
export function edit(name: string, ...commands: object[]): Manifest {
  return edited(loadFile(name), ...commands);
}

/** A manifest changed by commands on its block, applied with a minter of `MINTER_SEED`. */
export function edited(manifest: Manifest, ...commands: object[]): Manifest {
  const minter = createIdMinter({ seed: MINTER_SEED });
  let view = apply(
    createView(),
    { type: "add", into: WORKSPACE, block: { id: BLOCK, manifest, x: 0, y: 0 } },
    minter,
  );
  for (const command of commands) {
    if (isCommandError(view)) break;
    view = apply(view, command, minter);
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
  validate(withFileIds(relocked));
  return relocked;
}

/** The `add` command for a LinearMap from quarters to seconds, named `name`. */
export function linearMap(timeline: string, id: string, name: string | null = null): object {
  return {
    type: "add",
    into: target(timeline),
    map: {
      type: "LinearMap",
      id,
      name,
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

/**
 * The sine and cosine of 45° rounded to four places (section 6.6, Wedges), read as a double:
 * written as a quotient, which rounds to the same double as the literal.
 */
export const SINE_45 = 7071 / 10_000;

/**
 * `groups/group_child_member` (the frame of the child `second-half`, 8
 * quarters at 8 in `piece`, and `recording`, 10.0 seconds) with the region
 * `take` "Take" over `[0.0, 10.0]` of `recording`, the FlowMap `twice` of
 * `recording` (`take`, `take`) and the named timestamp `bar_7` "Bar 7" of
 * `piece` at 12 (wedge and coordinate): `written`; and `manifest`, the same
 * with the manifest's rule switching `recording`'s card to `twice`, so that
 * the frame is switched and `second-half` carried with its ancestor line.
 * Both pass the validators.
 */
export function childMemberTwice(): { readonly written: Manifest; readonly manifest: Manifest } {
  const source = loadFile("groups/group_child_member");
  const graphical = source.graphical ?? { styles: {}, rules: [], order: {} };
  const timelines = source.timelines.map((timeline) =>
    timeline.id === "recording"
      ? { ...timeline, regions: [{ id: "take", name: "Take", start: 0.0, end: 10.0 }] }
      : timeline,
  );
  const twice = {
    id: "twice",
    timeline: "recording",
    chunks: ["take", "take"],
    provenance: [{ method: "manual" as const }],
  };
  const bar = {
    id: "bar_7",
    timeline: "piece",
    coordinate: quarters(12),
    name: "Bar 7",
    display: ["wedge" as const, "coordinate" as const],
    matchstamp: false,
    groupstamp: false,
  };
  const written = canonicalOrder({
    ...source,
    timelines,
    flow_maps: [...(source.flow_maps ?? []), twice],
    graphical: { ...graphical, timestamps: [...(graphical.timestamps ?? []), bar] },
  } as Manifest);
  const rule = {
    select: { addresses: [{ id: "recording", part: ["card" as const] }] },
    set: { flow: "twice" },
  };
  const manifest = {
    ...written,
    graphical: { ...written.graphical, rules: [...(graphical.rules ?? []), rule] },
  } as Manifest;
  validate(withFileIds(manifest));
  return { written, manifest };
}
