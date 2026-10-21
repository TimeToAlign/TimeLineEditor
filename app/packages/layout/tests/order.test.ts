/** Band orders: each kind moved across its line, children following their parents; every number is derived in tests/README.md. */

import {
  addressKey,
  DEFAULT_BAND_ORDER,
  type ElementAddress,
  type Facet,
  idAddress,
  LINE,
  type Manifest,
  sameAddress,
} from "@timetoalign/tilie-core";
import { manifestElements } from "@timetoalign/tilie-core/drawing";
import type { ElementType, Graphical } from "@timetoalign/timetoshare";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_LAYER,
  DEFAULT_PLACEMENT,
  type Drawing,
  type DrawnElement,
  draw,
  manifestLayer,
} from "../src/index.ts";
import { at, bandOrder, edit, element, load, metrics, set } from "./support.ts";

/** Draw a manifest with the default layer, `extra` and its own layer. */
const drawn = (manifest: Manifest, ...extra: Graphical[]): Drawing =>
  draw(manifest, DEFAULT_PLACEMENT, [DEFAULT_LAYER, ...extra, manifestLayer(manifest)], metrics);

/** The default band order with the band of `facet` moved across the line, next to it. */
function moved(facet: Facet): string[] {
  const order: readonly string[] = DEFAULT_BAND_ORDER;
  const rest = order.filter((entry) => entry !== facet);
  const line = rest.indexOf(LINE);
  const above = order.indexOf(facet) < order.indexOf(LINE);
  return above
    ? [...rest.slice(0, line + 1), facet, ...rest.slice(line + 1)]
    : [...rest.slice(0, line), facet, ...rest.slice(line)];
}

/** The ordinate of the line of the timeline `id`. */
const lineY = (drawing: Drawing, id: string): number => {
  const line = drawing.elements.find((item) => sameAddress(item.address, idAddress(id)));
  if (line?.type !== "timeline" && line?.type !== "child") throw new Error(`no line ${id}`);
  return line.y;
};

/**
 * An ordinate of an element on its band's side and the ordinate of the line
 * of the timeline whose band holds it: a child's parent, else its own.
 */
function ordinate(
  drawing: Drawing,
  item: DrawnElement,
  owner: ReadonlyMap<string, string | null>,
  parent: ReadonlyMap<string | undefined, string>,
): [number, number] {
  const own = (address: ElementAddress) => lineY(drawing, owner.get(addressKey(address)) as string);
  switch (item.type) {
    case "child":
      return [item.y, lineY(drawing, parent.get(item.address.id) as string)];
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
  const owner = new Map(
    manifestElements(manifest).map((key) => [addressKey(key.address), key.timeline]),
  );
  const parent = new Map<string | undefined, string>();
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

/** The facet, the element type its band holds, the fixture, its root, how many it draws, and its default side's sign. */
const CASES: readonly [Facet, ElementType, string, string, number, number][] = [
  ["children", "child", "map", "melody", 1, -1],
  ["conversion_maps", "map", "map", "melody", 2, -1],
  ["markers", "wedge", "map", "melody", 2, 1],
  ["regions", "region", "with_region", "clt_1", 1, 1],
  ["flow_control", "jump_from", "flow_control", "flow:quarters", 2, 1],
  ["flow_control", "flow_marker", "flow_control", "flow:quarters", 1, 1],
];

describe("a band moved across its line", () => {
  for (const [facet, type, name, root, count, sign] of CASES) {
    it(`puts every ${type} of the ${facet} band on the other side`, () => {
      const before = signs(load(name), drawn(load(name)), type);
      const reordered = edit(name, set(root, { order: moved(facet) }));
      const after = signs(reordered, drawn(reordered), type);
      expect(before).toEqual(Array.from({ length: count }, () => sign));
      expect(after).toEqual(before.map(() => -sign));
    });
  }

  it("ends the root's flow marker at the bottom padding when its flow control band lies above", () => {
    const drawing = drawn(
      edit("flow_control", set("flow:quarters", { order: moved("flow_control") })),
    );
    expect(drawing.height).toBe(117.90625);
    expect(element(drawing, at("flow:quarters"))).toMatchObject({ y: 72.9296875 });
    expect(element(drawing, at("flow_marker_1"))).toMatchObject({
      y1: 56.953125,
      y2: 99.90625,
    });
    expect(element(drawing, at("flow_marker_1", "label"))).toMatchObject({
      x: 393.9775390625,
      baseline: 65.30712890625,
    });
    expect(element(drawing, at("jump_from_1"))).toMatchObject({
      start: [290.9775390625, 56.953125],
    });
  });
});

/** The ordinate of every line and map of a drawing, by the ID its address `{id}` carries. */
function ordinates(drawing: Drawing): Record<string, number> {
  return Object.fromEntries(
    drawing.elements.flatMap((item) => {
      if (item.type === "timeline" || item.type === "child") return [[item.address.id, item.y]];
      if (item.type === "map") return [[item.address.id, item.yc]];
      return [];
    }),
  );
}

describe("a child's band order", () => {
  it("follows its parent's band order verbatim without an entry of its own", () => {
    const drawing = drawn(load("map_root_band_order"));
    expect(ordinates(drawing)).toEqual({
      tempo: 42.5,
      ticks: 28.5,
      melody: 37,
      phrase: 23,
    });
    expect(element(drawing, at("melody", "start"))).toMatchObject({ yt: 49, yb: 62 });
    expect(drawing.height).toBe(92.4765625);
  });

  it("is its own entry when it has one", () => {
    const drawing = drawn(load("map_child_band_order"));
    expect(ordinates(drawing)).toEqual({
      tempo: 35,
      ticks: 28.5,
      melody: 40.5,
      phrase: 23,
    });
    expect(drawing.height).toBe(85.4765625);
    const restored = drawn(
      edit(
        "map_root_band_order",
        set("phrase", {
          order: bandOrder(["children", "conversion_maps"], ["markers", "regions", "flow_control"]),
        }),
      ),
    );
    expect(ordinates(restored)).toEqual({
      tempo: 42.5,
      ticks: 17.5,
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
    statements: [
      {
        select: { addresses: [{ id: "verse", facet: "flow_control" }] },
        set: { display: "inline" },
      },
    ],
  };

  it("runs from its flow row across its line to max(E, h(s) / 2) beyond it", () => {
    const drawing = drawn(load("child_flow_control"), shown);
    expect(drawing.height).toBe(111.4296875);
    expect(ordinates(drawing)).toEqual({ piece: 66.453125, verse: 23 });
    expect(element(drawing, at("fine"))).toMatchObject({ y1: 38.9765625, y2: 16.59765625 });
    expect(element(drawing, at("fine", "label"))).toMatchObject({
      x: 258.3134765625,
      baseline: 36.85400390625,
    });
  });

  it("runs the other way when its flow control band lies above its line", () => {
    const drawing = drawn(
      edit("child_flow_control", set("verse", { order: moved("flow_control") })),
      shown,
    );
    expect(drawing.height).toBe(111.4296875);
    expect(ordinates(drawing)).toEqual({ piece: 66.453125, verse: 52.453125 });
    expect(element(drawing, at("fine"))).toMatchObject({ y1: 36.4765625, y2: 58.85546875 });
    expect(element(drawing, at("fine", "label"))).toMatchObject({
      x: 258.3134765625,
      baseline: 44.83056640625,
    });
    expect(element(drawing, at("da_capo_al_fine"))).toMatchObject({
      start: [355.3134765625, 36.4765625],
    });
  });
});
