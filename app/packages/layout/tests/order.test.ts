/** Band orders: each kind moved across its line, children following their parents; every number is derived in tests/README.md. */

import { type BandKind, defaultBandOrder, type Manifest } from "@timetoalign/tilie-core";
import { manifestElements } from "@timetoalign/tilie-core/drawing";
import type { ElementType, Graphical } from "@timetoalign/timeskeleton";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_LAYER,
  DEFAULT_PLACEMENT,
  type Drawing,
  type DrawnElement,
  draw,
  manifestLayer,
} from "../src/index.ts";
import { bandOrder, edit, element, load, metrics, set } from "./support.ts";

/** Draw a manifest with the default layer, `extra` and its own layer. */
const drawn = (manifest: Manifest, ...extra: Graphical[]): Drawing =>
  draw(manifest, DEFAULT_PLACEMENT, [DEFAULT_LAYER, ...extra, manifestLayer(manifest)], metrics);

/** The default band order of `id` with the band of `kind` moved across the line, next to it. */
function moved(id: string, kind: BandKind): string[] {
  const order = defaultBandOrder(id);
  const band = `${id}/${kind}_1`;
  const rest = order.filter((entry) => entry !== band);
  const line = rest.indexOf(id);
  const above = order.indexOf(band) < order.indexOf(id);
  return above
    ? [...rest.slice(0, line + 1), band, ...rest.slice(line + 1)]
    : [...rest.slice(0, line), band, ...rest.slice(line)];
}

const lineY = (drawing: Drawing, address: string): number => {
  const line = drawing.elements.find((item) => item.address === address);
  if (line?.type !== "timeline" && line?.type !== "child") throw new Error(`no line ${address}`);
  return line.y;
};

/**
 * An ordinate of an element on its band's side and the ordinate of the line
 * of the timeline whose band holds it: a child's parent, else its own.
 */
function ordinate(
  drawing: Drawing,
  item: DrawnElement,
  owner: ReadonlyMap<string | null, string | null>,
  parent: ReadonlyMap<string, string>,
): [number, number] {
  const own = (address: string) => lineY(drawing, owner.get(address) as string);
  switch (item.type) {
    case "child":
      return [item.y, lineY(drawing, parent.get(item.address) as string)];
    case "map":
      return [item.yc, own(item.address)];
    case "region":
      return [item.ya, own(item.address)];
    case "jump_from":
      return [item.c1[1], own(item.address)];
    case "wedge":
      return [item.yb, own(item.address)];
    case "flow_marker":
      return [item.y1, own(item.address)];
    default:
      throw new Error(item.type);
  }
}

/** The sign of each element of `type`, −1 above its reference line and 1 below it. */
function signs(manifest: Manifest, drawing: Drawing, type: ElementType): number[] {
  const owner = new Map(manifestElements(manifest).map((key) => [key.address, key.timeline]));
  const parent = new Map<string, string>();
  const walk = (timeline: Manifest["timelines"][number]) => {
    for (const child of timeline.children) {
      parent.set(child.id, timeline.id);
      walk(child);
    }
  };
  manifest.timelines.forEach(walk);
  return drawing.elements
    .filter((item) => item.type === type)
    .map((item) => {
      const [y, reference] = ordinate(drawing, item, owner, parent);
      return Math.sign(y - reference);
    });
}

/** The band kind, the element type it holds, the fixture, its root, how many it draws, and its default side's sign. */
const CASES: readonly [BandKind, ElementType, string, string, number, number][] = [
  ["children", "child", "map", "melody", 1, -1],
  ["conversion_maps", "map", "map", "melody", 2, -1],
  ["markers", "wedge", "map", "melody", 2, 1],
  ["regions", "region", "with_region", "clt_1", 1, 1],
  ["flow_control", "jump_from", "flow_control", "flow:quarters", 2, 1],
  ["flow_control", "flow_marker", "flow_control", "flow:quarters", 1, 1],
];

describe("a band moved across its line", () => {
  for (const [kind, type, name, root, count, sign] of CASES) {
    it(`puts every ${type} of the ${kind} band on the other side`, () => {
      const before = signs(load(name), drawn(load(name)), type);
      const reordered = edit(name, set(root, { order: moved(root, kind) }));
      const after = signs(reordered, drawn(reordered), type);
      expect(before).toEqual(Array.from({ length: count }, () => sign));
      expect(after).toEqual(before.map(() => -sign));
    });
  }

  it("ends the root's flow marker at the bottom padding when its flow control band lies above", () => {
    const drawing = drawn(
      edit("flow_control", set("flow:quarters", { order: moved("flow:quarters", "flow_control") })),
    );
    expect(drawing.height).toBe(117.90625);
    expect(element(drawing, "flow:quarters")).toMatchObject({ y: 72.9296875 });
    expect(element(drawing, "flow:quarters/break_1")).toMatchObject({
      y1: 56.953125,
      y2: 99.90625,
    });
    expect(element(drawing, "flow:quarters/break_1/label")).toMatchObject({
      x: 393.9775390625,
      baseline: 65.30712890625,
    });
    expect(element(drawing, "flow:quarters/jump_1")).toMatchObject({
      start: [290.9775390625, 56.953125],
    });
  });
});

/** The ordinate of every line and map of a drawing, by address. */
function ordinates(drawing: Drawing): Record<string, number> {
  return Object.fromEntries(
    drawing.elements.flatMap((item) => {
      if (item.type === "timeline" || item.type === "child") return [[item.address, item.y]];
      if (item.type === "map") return [[item.address, item.yc]];
      return [];
    }),
  );
}

describe("a child's band order", () => {
  it("follows its parent's band by band id without an entry of its own", () => {
    const drawing = drawn(load("map_root_band_order"));
    expect(ordinates(drawing)).toEqual({
      "melody/tempo": 42.5,
      "melody/ticks": 28.5,
      melody: 37,
      phrase: 23,
    });
    expect(element(drawing, "melody/start")).toMatchObject({ yt: 49, yb: 62 });
    expect(drawing.height).toBe(92.4765625);
  });

  it("is its own entry when it has one", () => {
    const drawing = drawn(load("map_child_band_order"));
    expect(ordinates(drawing)).toEqual({
      "melody/tempo": 35,
      "melody/ticks": 28.5,
      melody: 40.5,
      phrase: 23,
    });
    expect(drawing.height).toBe(85.4765625);
    const restored = drawn(
      edit(
        "map_root_band_order",
        set("phrase", {
          order: bandOrder(
            "phrase",
            ["children", "conversion_maps"],
            ["markers", "regions", "flow_control"],
          ),
        }),
      ),
    );
    expect(ordinates(restored)).toEqual({
      "melody/tempo": 42.5,
      "melody/ticks": 17.5,
      melody: 37,
      phrase: 23,
    });
    expect(restored.height).toBe(92.4765625);
  });

  it("returns to its parent's when its entry is set to null", () => {
    const manifest = edit("map_child_band_order", set("phrase", { order: null }));
    expect(manifest.graphical?.order).toEqual({});
    expect(drawn(manifest).elements).toEqual(drawn(load("map")).elements);
  });
});

describe("a child's flow marker", () => {
  const shown: Graphical = {
    statements: [{ select: { ids: ["verse/flow_control_1"] }, set: { display: "inline" } }],
  };

  it("runs from its flow row across its line to max(E, h(s) / 2) beyond it", () => {
    const drawing = drawn(load("child_flow_control"), shown);
    expect(drawing.height).toBe(111.4296875);
    expect(ordinates(drawing)).toEqual({ piece: 66.453125, verse: 23 });
    expect(element(drawing, "piece/fine")).toMatchObject({ y1: 38.9765625, y2: 16.59765625 });
    expect(element(drawing, "piece/fine/label")).toMatchObject({
      x: 258.3134765625,
      baseline: 36.85400390625,
    });
  });

  it("runs the other way when its flow control band lies above its line", () => {
    const drawing = drawn(
      edit("child_flow_control", set("verse", { order: moved("verse", "flow_control") })),
      shown,
    );
    expect(drawing.height).toBe(111.4296875);
    expect(ordinates(drawing)).toEqual({ piece: 66.453125, verse: 52.453125 });
    expect(element(drawing, "piece/fine")).toMatchObject({ y1: 36.4765625, y2: 58.85546875 });
    expect(element(drawing, "piece/fine/label")).toMatchObject({
      x: 258.3134765625,
      baseline: 44.83056640625,
    });
    expect(element(drawing, "piece/da_capo_al_fine")).toMatchObject({
      start: [355.3134765625, 36.4765625],
    });
  });
});
