/**
 * Virtual cards (`docs/drawing.md` in TimeToShare, section 8.10): placed
 * virtual timelines and virtual members, their chunks, runs, gaps and
 * names. The strategy and every expected value are in `README.md`,
 * "Virtual cards".
 */

import { type ElementAddress, sameAddress } from "@timetoalign/tilie-core";
import type { Graphical } from "@timetoalign/timetoshare";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_LAYER,
  DEFAULT_PLACEMENT,
  type Drawing,
  type DrawnElement,
  draw,
  manifestLayer,
  type Placement,
} from "../src/index.ts";
import { boxesOf, drawFixture, element, loadFile, metrics } from "./support.ts";

const L = 400;
const PLACED: Placement = {
  ...DEFAULT_PLACEMENT,
  places: { allegro_by_hand: {}, allegro_default: {}, allegro_single: {} },
};
/** Names drawn whole, so the suffix shows. */
const WHOLE_NAMES: Graphical = {
  rules: [{ select: { element: "name" }, set: { "max-width": "none" } }],
};

/** `L × u` of `t` on an axis of length `lambda`, both exact as numerator and denominator. */
const lx = (t: number, lambda: number) => L * (t / lambda);

/** The chunk address `{id, facet: "regions", part}`. */
const chunk = (id: string, ...part: (number | "label" | "start")[]): ElementAddress => ({
  id,
  facet: "regions",
  part,
});

/** The elements of `drawing` at `address`. */
const allAt = (drawing: Drawing, address: ElementAddress): DrawnElement[] =>
  drawing.elements.filter((item) => sameAddress(item.address, address));

/** The line of the timeline `id` in `drawing`. */
function lineOf(drawing: Drawing, id: string) {
  const line = element(drawing, { id });
  if (line.type !== "timeline") throw new Error(`${id} draws no timeline element`);
  return line;
}

/** The braces, labels and boundaries `drawing` draws for the chunks of `id`, each its x. */
function chunksOf(drawing: Drawing, id: string) {
  const at = (item: DrawnElement) => {
    switch (item.type) {
      case "region":
        return [item.x1, item.x2];
      case "label":
        return [item.text, item.x];
      case "boundary":
        return [item.x, item.y1, item.y2];
      default:
        return [item.type];
    }
  };
  return drawing.elements
    .filter((item) => item.address.id === id && item.address.facet === "regions")
    .map((item) => [item.type, item.address.part, ...at(item)]);
}

describe("placed virtual timelines", () => {
  it("are drawn only where places holds their IDs, after the ungrouped roots, by ID", () => {
    const plain = drawFixture("flow/virtual_cards");
    expect(boxesOf(plain, "card").map((card) => card.address)).toEqual([
      { id: "allegro", part: ["card"] },
    ]);
    expect(plain.elements.filter((item) => item.address.id?.startsWith("allegro_"))).toEqual([]);
    const placed = drawFixture("flow/virtual_cards", [], PLACED);
    expect(boxesOf(placed, "card").map((card) => card.address)).toEqual(
      ["allegro", "allegro_by_hand", "allegro_default", "allegro_single"].map((id) => ({
        id,
        part: ["card"],
      })),
    );
  });

  it("draw a locked root's line, green as their unit's", () => {
    const drawing = drawFixture("flow/virtual_cards", [], PLACED);
    const allegro = lineOf(drawing, "allegro");
    for (const id of ["allegro_default", "allegro_single"]) {
      const line = lineOf(drawing, id);
      expect([line.start, line.end, line.xe - line.xs, line.style.stroke]).toEqual([
        "circle",
        "circle",
        L,
        allegro.style.stroke,
      ]);
    }
  });

  it("draw the chunks of default: four braces, their labels, three boundaries", () => {
    const drawing = drawFixture("flow/virtual_cards", [], PLACED);
    const { xs: x0, y, gapLines } = lineOf(drawing, "allegro_default");
    const x = (t: number) => x0 + lx(t, 4241 / 2);
    const id = "allegro_default";
    expect(gapLines).toBeUndefined();
    const bounds = [0, 953 / 2, 500, 1953 / 2, 4241 / 2];
    const texts = ["A", "B", "A", "C"];
    const expected = [
      ...texts.flatMap((text, k) => [
        ["region", [k], x(bounds[k] ?? 0), x(bounds[k + 1] ?? 0)],
        ["label", [k, "label"], text, x(((bounds[k] ?? 0) + (bounds[k + 1] ?? 0)) / 2)],
      ]),
      ...[1, 2, 3].map((k) => ["boundary", [k, "start"], x(bounds[k] ?? 0), y - 8, y + 8]),
    ];
    const sorted = (rows: unknown[][]) =>
      [...rows].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    expect(sorted(chunksOf(drawing, id))).toEqual(sorted(expected));
  });

  it("draw the chunks of single", () => {
    const drawing = drawFixture("flow/virtual_cards", [], PLACED);
    const { xs: x0, y } = lineOf(drawing, "allegro_single");
    const x = (t: number) => x0 + lx(t, 3241 / 2);
    expect(chunksOf(drawing, "allegro_single")).toEqual([
      ["region", [0], x(0), x(953 / 2)],
      ["region", [1], x(953 / 2), x(3241 / 2)],
      ["boundary", [1, "start"], x(953 / 2), y - 8, y + 8],
      ["label", [0, "label"], "A", x(953 / 4)],
      ["label", [1, "label"], "C", x((953 / 2 + 3241 / 2) / 2)],
    ]);
  });

  it("draw a run once and a gap by its line and label", () => {
    const drawing = drawFixture("flow/virtual_cards", [], PLACED);
    const id = "allegro_by_hand";
    const { xs: x0, xe, y, end, gapLines } = lineOf(drawing, id);
    // After the run gap `[953/2, 1906]` a position lies at `x(953/2) + (L × u − L × u(1906))`.
    const after = (value: number) => lx(953 / 2, 3054) + (value - lx(1906, 3054));
    const x = (t: number) => x0 + (t >= 1906 ? after(lx(t, 3054)) : lx(t, 3054));
    expect([xe, end]).toEqual([x0 + after(L), "circle"]);
    expect(gapLines).toEqual([[x(1906), x(1910)]]);
    expect(chunksOf(drawing, id)).toEqual([
      ["region", [0], x(0), x(953 / 2)],
      ["region", [5], x(1910), x(3054)],
      ["boundary", [4, "start"], x(1906), y - 8, y + 8],
      ["boundary", [5, "start"], x(1910), y - 8, y + 8],
      ["label", [0, "label"], "A × 4", x(953 / 4)],
      ["label", [4, "label"], "4 ♩", x(1908)],
      ["label", [5, "label"], "C", x(2482)],
    ]);
    // The gap entry starts where the run's first entry ends, so its label shares the first row.
    const baseline = (k: number) => {
      const label = element(drawing, chunk(id, k, "label"));
      return label.type === "label" ? label.baseline : label.type;
    };
    expect(baseline(4)).toBe(baseline(0));
  });

  it("name their cards with the source they unfold", () => {
    const drawing = drawFixture("flow/virtual_cards", [WHOLE_NAMES], PLACED);
    expect(
      ["allegro_by_hand", "allegro_default", "allegro_single"].map((id) => {
        const name = element(drawing, { id, part: ["name"] });
        return name.type === "name" ? name.text : name.type;
      }),
    ).toEqual(
      ["practice", "default", "single"].map((word) => `Allegro, ${word} · unfolded from Allegro`),
    );
  });
});

describe("virtual members", () => {
  it("are drawn in their frames in display order, with their chunks and timestamps", () => {
    const drawing = drawFixture("groups/virtual_member");
    expect(boxesOf(drawing, "card").map((card) => [card.address, card.holder])).toEqual([
      [{ id: "allegro_default", part: ["card"] }, { item: "performance" }],
      [{ id: "recording", part: ["card"] }, { item: "performance" }],
      [{ id: "allegro", part: ["card"] }, null],
    ]);
    const id = "allegro_default";
    const { xs: x0, y } = lineOf(drawing, id);
    const x = (t: number) => x0 + lx(t, 4241 / 2);
    expect(allAt(drawing, chunk(id, 1, "start"))).toEqual([
      expect.objectContaining({ type: "boundary", x: x(953 / 2), y1: y - 8, y2: y + 8 }),
    ]);
    expect(allAt(drawing, chunk(id, 3))).toEqual([
      expect.objectContaining({ type: "region", x1: x(1953 / 2), x2: x(4241 / 2) }),
    ]);
    const wedges = ["timestamp_3", "timestamp_4"].map((stamp) => element(drawing, { id: stamp }));
    expect(wedges.map((wedge) => (wedge.type === "wedge" ? wedge.x : wedge.type))).toEqual([
      x(0),
      x(4241 / 2),
    ]);
    expect(
      ["timestamp_3", "timestamp_4"].map((stamp) => {
        const label = element(drawing, { id: stamp, part: ["coordinate"] });
        return label.type === "label" ? label.text : label.type;
      }),
    ).toEqual(["0 ♩", "2120 1/2 ♩"]);
    expect(drawing.elements.filter((item) => item.type === "ancestor")).toEqual([]);
    expect(drawing.boxes.filter((box) => box.ancestor !== undefined)).toEqual([]);
  });

  it("draw every entry of a run in a frame", () => {
    const source = loadFile("groups/virtual_member");
    const [group] = source.groups;
    if (group === undefined || source.graphical === undefined) throw new Error("a group");
    const swap = (id: string) => (id === "allegro_default" ? "allegro_by_hand" : id);
    const manifest = {
      ...source,
      groups: [{ ...group, members: group.members.map(swap) }],
      graphical: {
        ...source.graphical,
        order: { performance: (source.graphical.order?.performance ?? []).map(swap) },
      },
    };
    const drawing = draw(
      manifest,
      DEFAULT_PLACEMENT,
      [DEFAULT_LAYER, manifestLayer(manifest)],
      metrics,
    );
    const id = "allegro_by_hand";
    const { xs: x0, y, gapLines } = lineOf(drawing, id);
    const x = (t: number) => x0 + lx(t, 3054);
    const starts = [0, 953 / 2, 953, 2859 / 2, 1906, 1910, 3054];
    expect(gapLines).toEqual([[x(1906), x(1910)]]);
    expect(chunksOf(drawing, id)).toEqual([
      ...[0, 1, 2, 3, 5].map((k) => ["region", [k], x(starts[k] ?? 0), x(starts[k + 1] ?? 0)]),
      ...[1, 2, 3, 4, 5].map((k) => ["boundary", [k, "start"], x(starts[k] ?? 0), y - 8, y + 8]),
      ...[0, 1, 2, 3, 4, 5].map((k) => [
        "label",
        [k, "label"],
        k === 4 ? "4 ♩" : k === 5 ? "C" : "A",
        x(((starts[k] ?? 0) + (starts[k + 1] ?? 0)) / 2),
      ]),
    ]);
  });
});
