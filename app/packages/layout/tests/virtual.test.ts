/**
 * Virtual cards (`docs/drawing.md` in TimeToShare, section 8.10): placed
 * virtual timelines and virtual members, their chunks, runs, gaps and
 * names. The strategy and every expected value are in `README.md`,
 * "Virtual cards".
 */

import {
  type AxisValue,
  type ElementAddress,
  type Manifest,
  sameAddress,
} from "@timetoalign/tilie-core";
import { toFloat, toRational } from "@timetoalign/tilie-core/numbers";
import type { Graphical, Rule } from "@timetoalign/timetoshare";
import { describe, expect, it } from "vitest";
import {
  abscissaOf,
  DEFAULT_LAYER,
  DEFAULT_PLACEMENT,
  type Drawing,
  type DrawnElement,
  draw,
  type LineAxis,
  lineAxes,
  manifestLayer,
  type Placement,
} from "../src/index.ts";
import {
  boxesOf,
  build,
  drawFixture,
  element,
  loadFile,
  metrics,
  quarters,
  target,
} from "./support.ts";

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

/** The text of the name or label at `address`. */
function textOf(drawing: Drawing, address: ElementAddress): string {
  const item = element(drawing, address);
  return item.type === "name" || item.type === "label" ? item.text : item.type;
}

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

  it("give a line drawn with a run one axis per run, read as the drawing shows it", () => {
    const drawing = drawFixture("flow/virtual_cards", [], PLACED);
    const { xs: x0, xe } = lineOf(drawing, "allegro_by_hand");
    const axesOf = (id: string): LineAxis[] =>
      [...lineAxes(drawing).values()].filter((axis) => axis.timeline === id);
    const runs = axesOf("allegro_by_hand");
    const brace = x0 + lx(953 / 2, 3054);
    expect(
      runs.map((axis) => [
        axis.xStart,
        axis.xEnd,
        String(axis.start),
        String(axis.length),
        String(axis.drawnLength),
      ]),
    ).toEqual([
      [x0, brace, "0", "953/2", "953/2"],
      [brace, xe, "1906", "1148", "1148"],
    ]);
    const [first, second] = runs;
    if (first === undefined || second === undefined) throw new Error("two runs");
    // Inside the run gap no axis holds a position: each holds `[start, start + drawn length]`.
    const holding = (t: number) =>
      runs.filter((axis) => {
        const start = toFloat(toRational(axis.start));
        return start <= t && t <= start + toFloat(toRational(axis.drawnLength));
      });
    expect([476.5, 1000, 1905, 1906].map((t) => holding(t).length)).toEqual([1, 0, 0, 1]);
    expect(abscissaOf(first, 0)).toBe(x0);
    expect(abscissaOf(second, 1906)).toBe(brace);
    expect(abscissaOf(second, 1908)).toBe(
      second.xStart + (2 / 1148) * (second.xEnd - second.xStart),
    );
    for (const id of ["allegro_default", "allegro_single"]) {
      const { xs } = lineOf(drawing, id);
      expect(axesOf(id).map((axis) => [axis.xStart, axis.xEnd])).toEqual([[xs, xs + L]]);
    }
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

describe("an elision on a virtual member", () => {
  const source = loadFile("groups/virtual_member");
  const manifest = {
    ...source,
    graphical: {
      ...source.graphical,
      elisions: [
        {
          id: "gap",
          timeline: "allegro_default",
          start: quarters(500),
          end: quarters(1000),
          display: ["ellipsis", "name"],
        },
      ],
    },
  } as Manifest;
  const drawing = draw(
    manifest,
    DEFAULT_PLACEMENT,
    [DEFAULT_LAYER, manifestLayer(manifest)],
    metrics,
  );
  const p = 1000 / 4241;
  const q = 2000 / 4241;
  const s = L * q - L * p - 32;
  const x0 = lineOf(drawing, "allegro_default").xs;

  it("is a gap across the frame, carried to every member", () => {
    expect([p, q, L * q - L * p, s]).toEqual([
      0.23579344494223062, 0.47158688988446124, 94.31737797689225, 62.317377976892246,
    ]);
    const gaps = drawing.elements.flatMap((item) => (item.type === "elision" ? [item] : []));
    const top = element(drawing, { id: "allegro_default", part: ["card"] });
    const bottom = element(drawing, { id: "recording", part: ["card"] });
    if (top.type !== "card" || bottom.type !== "card") throw new Error("two member cards");
    expect(gaps.map((gap) => [gap.address, gap.x1, gap.x2, gap.yt, gap.yb, gap.elided])).toEqual([
      [
        { id: "gap" },
        x0 + L * p,
        x0 + (L * q - s),
        top.y,
        bottom.y + bottom.height,
        { timeline: "allegro_default", start: toRational(500), end: toRational(1000) },
      ],
    ]);
    expect([L * p, L * q - s, L - s]).toEqual([
      94.31737797689225, 126.31737797689225, 337.68262202310774,
    ]);
    for (const id of ["allegro_default", "recording"]) {
      const { xs, xe, cuts } = lineOf(drawing, id);
      expect([xs, xe, cuts]).toEqual([x0, x0 + (L - s), [[x0 + L * p, x0 + (L * q - s)]]]);
    }
  });

  it("draws its ellipsis and its name label, the name of its timeline", () => {
    const middle = (x0 + L * p + (x0 + (L * q - s))) / 2;
    const ellipsis = element(drawing, { id: "gap", part: ["ellipsis"] });
    const name = element(drawing, { id: "gap", part: ["name"] });
    expect([
      ellipsis.type === "ellipsis" ? ellipsis.x : ellipsis.type,
      name.type === "label" ? [name.text, name.x] : name.type,
    ]).toEqual([middle, ["Allegro, default", middle]]);
  });

  it("is exposed with its elided coordinates on every member", () => {
    const frame = drawing.elisions.find((exposure) => exposure.kind === "frame");
    expect(
      frame?.gaps.map((gap) => [
        gap.address,
        gap.natural,
        gap.drawn,
        gap.members.map((member) => [member.timeline, member.start, member.end]),
      ]),
    ).toEqual([
      [
        { id: "gap" },
        L * q - L * p,
        32,
        [
          ["allegro_default", toRational(500), toRational(1000)],
          ["recording", 702500 / 4241, 1405000 / 4241],
        ],
      ],
    ]);
    expect([702500 / 4241, 1405000 / 4241]).toEqual([165.644895071917, 331.289790143834]);
  });
});

describe("elisions of a placed virtual card", () => {
  /** The README's `score`, `flow_map_1` and `virtual_1`, an elision of `virtual_1` over `[start, end]`. */
  function exposition(
    elision: { readonly start: AxisValue; readonly end: AxisValue; readonly width?: object },
    rules: readonly Rule[] = [],
  ): Manifest {
    const region = (id: string, name: string, start: number, end: number) => ({
      type: "add",
      into: target("score"),
      region: { id, name, start: quarters(start), end: quarters(end) },
    });
    const built = build("score", 16, region("region_1", "A", 0, 8), region("region_2", "B", 8, 16));
    return {
      ...built,
      flow_maps: [
        {
          id: "flow_map_1",
          timeline: "score",
          chunks: ["region_1", "region_1", "region_2"],
          canonical: false,
          name: null,
          provenance: [{ method: "manual" }],
        },
      ],
      virtual_timelines: [
        {
          id: "virtual_1",
          timeline: "score",
          map: "flow_map_1",
          name: null,
          unit: "quarters",
          number_type: "fraction",
          length: quarters(24),
        },
      ],
      graphical: {
        ...built.graphical,
        elisions: [
          { id: "elision_1", timeline: "virtual_1", display: ["ellipsis", "name"], ...elision },
        ],
        rules: [...rules],
      },
    } as Manifest;
  }
  const placed: Placement = { ...DEFAULT_PLACEMENT, places: { virtual_1: {} } };
  const drawn = (manifest: Manifest, placement = placed) =>
    draw(manifest, placement, [DEFAULT_LAYER, manifestLayer(manifest)], metrics);
  const elisionsOf = (drawing: Drawing) =>
    drawing.elements.flatMap((item) => (item.type === "elision" ? [item] : []));

  it("draw no gap for an elision lying wholly in a run gap", () => {
    const drawing = drawn(exposition({ start: quarters(10), end: quarters(14) }));
    const { xs: x0, xe, end, cuts } = lineOf(drawing, "virtual_1");
    expect(elisionsOf(drawing)).toEqual([]);
    expect([xe, end, cuts]).toEqual([x0 + 266.6666666666667, "circle", []]);
  });

  it("draw a gap after a run gap by the run formula less its shrink", () => {
    const drawing = drawn(
      exposition({ start: quarters(17), end: quarters(19), width: { canvas: 8 } }),
    );
    const { xs: x0, xe, end, cuts } = lineOf(drawing, "virtual_1");
    const [gap, ...others] = elisionsOf(drawing);
    if (gap === undefined) throw new Error("elision_1's gap");
    expect(others).toEqual([]);
    expect([gap.address, gap.x1, gap.x2]).toEqual([
      { id: "elision_1" },
      x0 + 150.00000000000006,
      x0 + 158.00000000000006,
    ]);
    expect([xe, end, cuts]).toEqual([
      x0 + 241.33333333333343,
      "circle",
      [[x0 + 150.00000000000006, x0 + 158.00000000000006]],
    ]);
    const brace = element(drawing, chunk("virtual_1", 2));
    expect(brace.type === "region" ? [brace.x1, brace.x2] : brace.type).toEqual([
      x0 + 133.33333333333331,
      x0 + 241.33333333333343,
    ]);
    // A stored elision's gap draws its ellipsis whatever its width: 8 wide, at its middle.
    expect(
      drawing.elements.flatMap((item) =>
        item.type === "ellipsis" ? [[item.address, item.x, item.y]] : [],
      ),
    ).toEqual([
      [{ id: "elision_1", part: ["ellipsis"] }, (gap.x1 + gap.x2) / 2, (gap.yt + gap.yb) / 2],
    ]);
  });

  it("are drawn neither by the card of its timeline nor by a card switched to it", () => {
    const elision = { start: quarters(17), end: quarters(19), width: { canvas: 8 } };
    expect(elisionsOf(drawn(exposition(elision), DEFAULT_PLACEMENT))).toEqual([]);
    const switching: Rule = {
      select: { addresses: [{ id: "score", part: ["card"] }] },
      set: { flow: "virtual_1" },
    };
    const switched = drawn(exposition(elision, [switching]), DEFAULT_PLACEMENT);
    expect(textOf(switched, { id: "score", part: ["name"] })).toBe("score · virtual_1");
    expect(elisionsOf(switched)).toEqual([]);
  });
});
