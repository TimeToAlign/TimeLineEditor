/** The slots that the conversion maps bands of one row share; every number is derived in tests/README.md. */

import type { Manifest } from "@timetoalign/tilie-core";
import type { Graphical } from "@timetoalign/timetoshare";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_LAYER,
  DEFAULT_PLACEMENT,
  type Drawing,
  draw,
  manifestLayer,
} from "../src/index.ts";
import { bandOrder, build, child, linearMap, metrics, quarters, set, target } from "./support.ts";

const drawn = (manifest: Manifest, ...extra: Graphical[]): Drawing =>
  draw(manifest, DEFAULT_PLACEMENT, [DEFAULT_LAYER, ...extra, manifestLayer(manifest)], metrics);

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

/** The IDs of the drawn maps, in the order they are drawn. */
const mapOrder = (drawing: Drawing) =>
  drawing.elements.flatMap((item) => (item.type === "map" ? [item.address.id] : []));

/** `r` (length 8) holding `ante` at 0 and `cons` at `consAt`, each 4 long, and further commands. */
const siblings = (consAt: number, ...commands: object[]) =>
  build("r", 8, child("r", "ante", 0, 4), child("r", "cons", consAt, 4), ...commands);

/** An unnamed region of `timeline` from `start` to `end` quarters. */
const region = (timeline: string, id: string, start: number, end: number) => ({
  type: "add",
  into: target(timeline),
  region: { id, name: null, start: quarters(start), end: quarters(end), meta: {} },
});

/** The root `form` (length 32): a segment line of the segments `A`, `B` and `C`. */
const form = (...commands: object[]) =>
  build(
    "form",
    32,
    child("form", "A", 0, 8),
    child("form", "B", 8, 12),
    child("form", "C", 20, 12),
    set("form", { is_segment_line: true }),
    ...commands,
  );

describe("the slots of one row", () => {
  const manifest = siblings(
    4,
    linearMap("ante", "a_ticks", "Ticks"),
    linearMap("ante", "b_tempo", "Tempo"),
    linearMap("cons", "a_tempo", "Tempo"),
    linearMap("cons", "b_ticks", "Ticks"),
  );

  it("put the maps of one key on sibling lines at one height", () => {
    const drawing = drawn(manifest);
    expect(ordinates(drawing)).toEqual({
      r: 41.5,
      ante: 27.5,
      cons: 27.5,
      b_tempo: 22,
      a_tempo: 22,
      a_ticks: 17,
      b_ticks: 17,
    });
    expect(drawing.height).toBe(86.4765625);
  });

  it("draw the maps in the order they are taken, line by line, each in canonical order", () => {
    expect(mapOrder(drawn(manifest))).toEqual(["a_ticks", "b_tempo", "a_tempo", "b_ticks"]);
  });

  it("place every slot by the widest stroke of the row's lines", () => {
    const drawing = drawn(manifest, {
      rules: [{ select: { addresses: [{ id: "ante" }] }, set: { "stroke-width": 5 } }],
    });
    expect(ordinates(drawing)).toEqual({
      r: 42.5,
      ante: 28.5,
      cons: 28.5,
      b_tempo: 22,
      a_tempo: 22,
      a_ticks: 17,
      b_ticks: 17,
    });
  });
});

describe("a first fit that moves a line into another row", () => {
  const commands = [
    linearMap("ante", "ante_tempo", "Tempo"),
    linearMap("ante", "ante_ticks", "Ticks"),
    linearMap("cons", "cons_ticks", "Ticks"),
  ];

  it("shares the row's slots while the line lies in it", () => {
    const drawing = drawn(siblings(4, ...commands));
    expect(ordinates(drawing)).toEqual({
      r: 41.5,
      ante: 27.5,
      cons: 27.5,
      ante_tempo: 22,
      ante_ticks: 17,
      cons_ticks: 17,
    });
    expect(drawing.height).toBe(86.4765625);
  });

  it("takes the slots of its new row once it lies there", () => {
    const drawing = drawn(siblings(3, ...commands));
    expect(ordinates(drawing)).toEqual({
      r: 55.5,
      ante: 41.5,
      cons: 23,
      ante_tempo: 36,
      ante_ticks: 31,
      cons_ticks: 17.5,
    });
    expect(drawing.height).toBe(100.4765625);
  });
});

describe("sub-slots on a segment line", () => {
  it("give a segment's map of a key its own sub-slot where its timeline conflicts", () => {
    const drawing = drawn(
      form(linearMap("form", "form_ticks", "Ticks"), linearMap("B", "b_ticks", "Ticks")),
    );
    expect(ordinates(drawing)).toEqual({ form: 27.5, form_ticks: 22, b_ticks: 17 });
    expect(mapOrder(drawing)).toEqual(["form_ticks", "b_ticks"]);
  });

  it("order the keys by name, whatever the IDs, the segment's after the line's", () => {
    const drawing = drawn(
      form(
        linearMap("form", "a_ticks", "Ticks"),
        linearMap("form", "b_tempo", "Tempo"),
        linearMap("form", "c_samples", "Samples"),
        linearMap("form", "d_bars", "Bars"),
        linearMap("B", "e_ticks", "Ticks"),
      ),
    );
    expect(ordinates(drawing)).toEqual({
      form: 42.5,
      d_bars: 37,
      c_samples: 32,
      b_tempo: 27,
      a_ticks: 22,
      e_ticks: 17,
    });
    expect(mapOrder(drawing)).toEqual(["a_ticks", "b_tempo", "c_samples", "d_bars", "e_ticks"]);
  });
});

describe("the key order", () => {
  it("puts the keys with a name first, by name, and those without after them", () => {
    const drawing = drawn(
      build(
        "r",
        8,
        child("r", "c", 4, 4),
        linearMap("c", "z", "Zeta"),
        linearMap("c", "m"),
        linearMap("c", "a", "Alpha"),
      ),
    );
    expect(ordinates(drawing)).toEqual({ r: 46.5, c: 32.5, a: 27, z: 22, m: 17 });
  });
});

describe("the common start", () => {
  it("starts the bands of one level beyond level 1 at the largest of their own starts", () => {
    const manifest = siblings(
      4,
      set("r", {
        order: bandOrder(["children", "conversion_maps", "regions"], ["markers", "flow_control"]),
      }),
      region("ante", "ante_1", 0, 2),
      region("ante", "ante_2", 1, 3),
      region("cons", "cons_1", 0, 2),
      linearMap("ante", "ante_tempo", "Tempo"),
      linearMap("cons", "cons_tempo", "Tempo"),
    );
    const drawing = drawn(manifest, {
      rules: [{ select: { element: "band", facet: "regions" }, set: { display: "inline" } }],
    });
    expect(ordinates(drawing)).toEqual({
      r: 86.953125,
      ante: 72.953125,
      cons: 72.953125,
      ante_tempo: 17,
      cons_tempo: 17,
    });
  });
});

describe("maps bands kept apart by their lines' children bands", () => {
  const regions: Graphical = {
    rules: [{ select: { element: "band", facet: "regions" }, set: { display: "inline" } }],
  };
  /** `A`'s children band nearer its line than its maps band, `B`'s further out, both above. */
  const orders = [
    set("A", {
      order: bandOrder(["conversion_maps", "children"], ["markers", "regions", "flow_control"]),
    }),
    set("B", {
      order: bandOrder(["children", "conversion_maps", "regions"], ["markers", "flow_control"]),
    }),
  ];

  it("find every start step by step, no maps band waiting on itself", () => {
    const manifest = build(
      "r",
      8,
      child("r", "A", 0, 4),
      child("r", "B", 4, 4),
      child("A", "A1", 0, 4),
      child("B", "B1", 0, 4),
      ...orders,
      region("B", "b_1", 0, 2),
      linearMap("A", "a_tempo", "Tempo"),
      linearMap("B", "b_tempo", "Tempo"),
    );
    expect(ordinates(drawn(manifest, regions))).toEqual({
      r: 92.9765625,
      A: 78.9765625,
      B: 78.9765625,
      A1: 33.5,
      B1: 33.5,
      a_tempo: 17,
      b_tempo: 45.5,
    });
  });

  it("give each set its own sequence of slots", () => {
    const manifest = build(
      "r",
      8,
      child("r", "A", 0, 4),
      child("r", "B", 4, 4),
      child("A", "A1", 0, 4),
      ...orders,
      region("B", "b_1", 0, 2),
      linearMap("A", "a_tempo", "Tempo"),
      linearMap("B", "b_tempo", "Tempo"),
      linearMap("B", "b_ticks", "Ticks"),
    );
    expect(ordinates(drawn(manifest, regions))).toEqual({
      r: 69.4765625,
      A: 55.4765625,
      B: 55.4765625,
      A1: 41.4765625,
      a_tempo: 24.9765625,
      b_tempo: 22,
      b_ticks: 17,
    });
  });
});
