/// <reference types="node" />
/**
 * Views built from the manifest fixtures of the installed
 * `@timetoalign/timeskeleton` package through core's commands.
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { BandKind, Block, Command, Manifest, Store, View } from "@timetoalign/tilie-core";
import {
  apply,
  createStore,
  createView,
  emptyWorkspace,
  isCommandError,
  isLoadError,
  loadManifest,
} from "@timetoalign/tilie-core";
import type { Drawing, DrawnBox, DrawnElement } from "@timetoalign/tilie-layout";
import { INITIAL_STYLE } from "@timetoalign/tilie-layout";
import type { DescriptorSource } from "@timetoalign/tilie-writers";
import { dumps, fontMetrics, parseJson, SCHEMA_VERSION } from "@timetoalign/timeskeleton";
import type { BandBox } from "../src/boxes.ts";
import { isBand } from "../src/boxes.ts";

export const metrics = fontMetrics;

const packageDir = path.dirname(
  createRequire(import.meta.url).resolve("@timetoalign/timeskeleton/package.json"),
);

export const A = "0000000000";
export const B = "0000000001";
export const C = "0000000002";

function fixtureText(name: string): string {
  return readFileSync(path.join(packageDir, "fixtures", SCHEMA_VERSION, `${name}.json`), "utf8");
}

function loadText(text: string, name: string): Manifest {
  const manifest = loadManifest(text);
  if (isLoadError(manifest)) throw new Error(`${name} refused: ${manifest.problems[0]?.message}`);
  return manifest;
}

/** A manifest fixture of the installed schema version, failing loudly if it is refused. */
export function load(name: string): Manifest {
  return loadText(fixtureText(name), name);
}

/**
 * A manifest fixture with the timelines `ids` stating `locked: false` in the
 * file itself, before it is read: the way to unlock a segment line whose
 * lock no command lifts (one that is a child, a segment or a group member).
 */
export function loadUnlocked(name: string, ...ids: string[]): Manifest {
  const unlock = (timeline: Record<string, unknown>): Record<string, unknown> => ({
    ...timeline,
    ...(ids.includes(timeline.id as string) ? { locked: false } : {}),
    children: ((timeline.children ?? []) as Record<string, unknown>[]).map(unlock),
  });
  const value = parseJson(fixtureText(name)) as Record<string, unknown>;
  const timelines = (value.timelines as Record<string, unknown>[]).map(unlock);
  return loadText(dumps({ ...value, timelines }), name);
}

/** The view a command leaves, failing loudly if it is refused. */
export function changed(view: View, command: Command | object | null): View {
  const result = apply(view, command);
  if (isCommandError(result)) throw new Error(`${result.code} at ${JSON.stringify(result.path)}`);
  return result;
}

/**
 * A store whose journal builds `view`: from the empty workspace, one `set`
 * of every setting that differs, then one `add` per block in index order,
 * stating its placement and places. A store verifies its journal, so a view
 * is never handed to it without one.
 */
export function storeOf(view: View): Store {
  const store = createStore(emptyWorkspace());
  const defaults = createView().settings;
  const settings = Object.fromEntries(
    Object.entries(view.settings).filter(
      ([member, value]) =>
        JSON.stringify(value) !== JSON.stringify(defaults[member as keyof typeof defaults]),
    ),
  );
  const commands: object[] = [];
  if (Object.keys(settings).length > 0) {
    commands.push({ type: "set", changes: [{ target: "workspace", values: settings }] });
  }
  const blocks = Object.values(view.blocks).sort((left, right) =>
    left.index < right.index ? -1 : left.index > right.index ? 1 : 0,
  );
  for (const { id, manifest, x, y, scale, length, spacing, width, height, places } of blocks) {
    const block = { id, manifest, x, y, scale, length, spacing, width, height, places };
    commands.push({ type: "add", into: "workspace", block });
  }
  for (const command of commands) {
    const refused = store.dispatch(command);
    if (refused !== null) throw new Error(`${refused.code} at ${JSON.stringify(refused.path)}`);
  }
  return store;
}

export interface Placed {
  readonly id: string;
  readonly fixture: string;
  readonly x?: number;
  readonly y?: number;
  readonly scale?: number;
}

/** An empty view with the given blocks added in order, each at its position and scale. */
export function viewOf(...blocks: readonly Placed[]): View {
  return blocks.reduce((view, { id, fixture, x = 0, y = 0, scale }) => {
    const block = { id, manifest: load(fixture), x, y, ...(scale === undefined ? {} : { scale }) };
    return changed(view, { type: "add", into: "workspace", block });
  }, createView());
}

export function blockIn(view: View, id: string): Block {
  const found = view.blocks[id];
  if (found === undefined) throw new Error(`block ${id} is missing`);
  return found;
}

/** The fixture paths of the manifests with groups the tests use. */
export const NUMBERS = "groups/group_number_types";
export const CHILD_MEMBER = "groups/group_child_member";
export const MPM = "bundles/corpus_mpm";

/**
 * Block `id` holding `group_number_types` with `region_1` (2 to 4 quarters,
 * named "A") added to its root `score`, as the README's `numbers`.
 */
export function numbersView(id: string = A): View {
  const region = { id: "region_1", name: "A", start: [2, 1], end: [4, 1], meta: {} };
  return changed(viewOf({ id, fixture: NUMBERS }), {
    type: "add",
    into: `${id}/score`,
    region,
  });
}

/** The view with the grid set. */
export function withGrid(view: View, size: number, snap: boolean): View {
  return changed(view, {
    type: "set",
    changes: [{ target: "workspace", values: { grid: { size, snap } } }],
  });
}

/** The fixture path of the bundle of two groups and an ungrouped root the editors' tests use. */
export const MIXED = "bundles/bundle_mixed";

/** The view with the place of item `key` of block `block` merged with `place`. */
export function placed(view: View, block: string, key: string, place: object): View {
  return changed(view, {
    type: "set",
    changes: [{ target: `${block}/${key}`, values: { place } }],
  });
}

/** Block A holding `bundle_mixed` at (40, 80). */
export function mixedPlain(): View {
  return viewOf({ id: A, fixture: MIXED, x: 40, y: 80 });
}

/**
 * `view` with `recording` made a member of `group_1` in block A's
 * `bundle_mixed`, by one `set` of the block's `manifest`: `group_1`'s
 * members `[performance, recording, score]`, displayed `[score,
 * performance, recording]`. `recording`'s card then draws its child
 * `excerpt`, which stays a member of `group_2`, as a child line.
 */
export function recordingInGroup1(view: View): View {
  const { manifest } = blockIn(view, A);
  const members = ["performance", "recording", "score"];
  return changed(view, {
    type: "set",
    changes: [
      {
        target: A,
        values: {
          manifest: {
            ...manifest,
            groups: manifest.groups.map((group) =>
              group.id === "group_1" ? { ...group, members } : group,
            ),
            graphical: {
              ...manifest.graphical,
              order: {
                ...manifest.graphical?.order,
                group_1: ["score", "performance", "recording"],
              },
            },
          },
        },
      },
    ],
  });
}

/**
 * The README's `mixed`: block A holding `bundle_mixed` at (40, 80) with the
 * child `dlt_1` (samples, offset 0, length 44100) added to `excerpt`.
 */
export function mixedView(): View {
  return changed(mixedPlain(), {
    type: "add",
    into: `${A}/excerpt`,
    child: { id: "dlt_1", offset: 0, unit: "samples", length: 44100 },
  });
}

/**
 * The view of the README's "Marquee inside an editor": `mixed` with the
 * region `region_1` (0 to 10 samples) added to `excerpt` and the map
 * `cmap_3` added to `dlt_1`, both addressed under the root `recording`.
 */
export function marqueeView(): View {
  const region = changed(mixedView(), {
    type: "add",
    into: `${A}/excerpt`,
    region: { id: "region_1", name: "A", start: 0, end: 10 },
  });
  return changed(region, {
    type: "add",
    into: `${A}/dlt_1`,
    map: {
      id: "cmap_3",
      type: "LinearMap",
      source_unit: "samples",
      target_unit: "seconds",
      scalar: [1, 44100],
    },
  });
}

/** A rectangle `[x, y, width, height]` in a drawing's units. */
type Rectangle = readonly [number, number, number, number];

/**
 * The record of the band of `kind` of `timeline` at the line `line`, its
 * rectangle `rect`, held by the card `holder` (the timeline's own card
 * unless named) and drawing nothing.
 */
export function bandRecord(
  timeline: string,
  kind: BandKind,
  level: number,
  line: number,
  [x, y, width, height]: Rectangle,
  elements = 1,
  holder = `${timeline}/card`,
): BandBox {
  const address = `${timeline}/${kind}_1`;
  return {
    kind: "band",
    key: null,
    address,
    holder,
    x,
    y,
    width,
    height,
    range: { start: 0, end: 0 },
    displayed: false,
    band: { timeline, kind, level, elements, line },
  };
}

/**
 * The source of a descriptor drawing the first element of `drawing` that
 * carries `address` (`null`: the block's background), of `type` when given,
 * as a press on it reports it.
 */
export function sourceOf(
  drawing: Drawing,
  address: string | null,
  type?: DrawnElement["type"],
  role: DescriptorSource["role"] = "primary",
): DescriptorSource {
  const element = drawing.elements.findIndex(
    (drawn) => drawn.address === address && (type === undefined || drawn.type === type),
  );
  const drawn = drawing.elements[element];
  if (drawn === undefined) throw new Error(`nothing is drawn at ${address}`);
  return { element, type: drawn.type, address, role };
}

/** `drawing` with its band records replaced by `bands`. */
export function withBands(drawing: Drawing, bands: readonly BandBox[]): Drawing {
  return { ...drawing, boxes: [...drawing.boxes.filter((box) => !isBand(box)), ...bands] };
}

/** The band records of a drawing, in drawing order. */
export function bandsOf(drawing: Drawing): readonly BandBox[] {
  return drawing.boxes.filter(isBand);
}

/**
 * A drawing written by hand (the README's section "Bands"): `width` by
 * `height`, its background, the card `<root>/card` of the ungrouped root
 * `root` at `card`, then `elements`; its boxes the block's box, the card,
 * an item spanning the card and the elements, and the records `bands`.
 */
function handDrawn(
  [width, height]: readonly [number, number],
  root: string,
  [x, y, cardWidth, cardHeight]: Rectangle,
  elements: readonly DrawnElement[],
  bands: readonly BandBox[],
): Drawing {
  const style = INITIAL_STYLE;
  const address = `${root}/card`;
  const end = 2 + elements.length;
  const box: DrawnBox = {
    kind: "box",
    key: null,
    address: null,
    holder: null,
    x: 0,
    y: 0,
    width,
    height,
    range: { start: 0, end },
    displayed: true,
  };
  const card: DrawnBox = {
    kind: "card",
    key: root,
    address,
    holder: null,
    x,
    y,
    width: cardWidth,
    height: cardHeight,
    range: { start: 1, end },
    displayed: true,
    item: {
      place: { x, y, length: 400, scale: 1, spacing: 1, width: cardWidth, height: cardHeight },
      stated: {},
    },
    card: { size: { width: cardWidth, height: cardHeight }, spacing: 1, stated: {} },
  };
  return {
    width,
    height,
    origin: { x: 0, y: 0 },
    boxes: [box, card, ...bands],
    axes: [],
    elements: [
      { type: "block", address: null, style, width, height },
      { type: "card", address, style, x, y, width: cardWidth, height: cardHeight, shadowOffset: 2 },
      ...elements,
    ],
    unmapped: [],
  };
}

function line(type: "timeline" | "child", address: string, xs: number, xe: number, y: number) {
  return {
    type,
    address,
    style: INITIAL_STYLE,
    xs,
    xe,
    y,
    start: "circle",
    end: "arrowhead",
  } as const;
}

function map(address: string, xs: number, xe: number, yc: number) {
  return { type: "map", address, style: INITIAL_STYLE, xs, xe, yc, spacing: 2 } as const;
}

/** The fixture path of the manifest whose root states a band order of its own. */
export const ROOT_ORDER = "map_root_band_order";

/** The README's drawing S: `styled__score`'s timeline `score`, its five bands present. */
export const STYLED_DRAWN: Drawing = handDrawn(
  [600, 200],
  "score",
  [8, 8, 584, 184],
  [
    line("child", "b", 300, 500, 55),
    line("timeline", "score", 100, 500, 100),
    map("score/ticks", 100, 500, 105),
  ],
  [
    bandRecord("score", "children", 2, 100, [100, 40, 400, 30]),
    bandRecord("score", "markers", 1, 100, [100, 80, 400, 20], 2),
    bandRecord("score", "conversion_maps", -1, 100, [100, 100, 400, 10]),
    bandRecord("score", "regions", -2, 100, [100, 114, 400, 20]),
    bandRecord("score", "flow_control", -3, 100, [100, 138, 400, 22]),
  ],
);

/** The README's drawing M: `map`'s `melody` and its child `phrase`. */
export const MAP_DRAWN: Drawing = handDrawn(
  [600, 140],
  "melody",
  [8, 8, 584, 124],
  [
    map("melody/ticks", 200, 400, 25),
    line("child", "phrase", 200, 400, 30),
    map("melody/tempo", 100, 500, 63),
    line("timeline", "melody", 100, 500, 70),
  ],
  [
    bandRecord("melody", "children", 2, 70, [100, 16, 400, 20]),
    bandRecord("melody", "conversion_maps", 1, 70, [100, 56, 400, 14]),
    bandRecord("melody", "markers", -1, 70, [100, 70, 400, 16], 2),
    bandRecord("phrase", "conversion_maps", 1, 30, [200, 20, 200, 10], 1, "melody/card"),
  ],
);
