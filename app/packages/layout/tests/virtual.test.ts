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
  child,
  drawFixture,
  edit,
  element,
  linearMap,
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

/** The chunk address `{id, part}`. */
const chunk = (id: string, ...part: (number | "label" | "start")[]): ElementAddress => ({
  id,
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

/** The labels and boundaries `drawing` draws for the chunks of `id` (`{id, part: [k, …]}`), each its x. */
function chunksOf(drawing: Drawing, id: string) {
  const at = (item: DrawnElement) => {
    switch (item.type) {
      case "label":
        return [item.text, item.x];
      case "boundary":
        return [item.x, item.y1, item.y2];
      default:
        return [item.type];
    }
  };
  return drawing.elements
    .filter(
      (item) =>
        item.address.id === id &&
        item.address.facet === undefined &&
        typeof item.address.part?.[0] === "number",
    )
    .map((item) => [item.type, item.address.part, ...at(item)]);
}

/** Whether every chunk label `drawing` draws for `id` lies above its line, none in a band. */
function labelsAbove(drawing: Drawing, id: string): boolean {
  const { y } = lineOf(drawing, id);
  const labels = drawing.elements.flatMap((item) =>
    item.type === "label" && item.address.id === id && typeof item.address.part?.[0] === "number"
      ? [item]
      : [],
  );
  const inBands = drawing.elements.filter(
    (item) => item.address.id === id && item.address.facet !== undefined,
  );
  return labels.length > 0 && labels.every((label) => label.baseline < y) && inBands.length === 0;
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

  it("draw the chunks of default as a segment line: labels above, three boundaries", () => {
    const drawing = drawFixture("flow/virtual_cards", [], PLACED);
    const { xs: x0, y, gapLines } = lineOf(drawing, "allegro_default");
    const x = (t: number) => x0 + lx(t, 4241 / 2);
    const id = "allegro_default";
    expect(gapLines).toBeUndefined();
    const bounds = [0, 953 / 2, 500, 1953 / 2, 4241 / 2];
    const texts = ["A", "B", "A", "C"];
    expect(chunksOf(drawing, id)).toEqual([
      ...[1, 2, 3].map((k) => ["boundary", [k, "start"], x(bounds[k] ?? 0), y - 8, y + 8]),
      ...texts.map((text, k) => [
        "label",
        [k, "label"],
        text,
        x(((bounds[k] ?? 0) + (bounds[k + 1] ?? 0)) / 2),
      ]),
    ]);
    expect(labelsAbove(drawing, id)).toBe(true);
  });

  it("draw the chunks of single", () => {
    const drawing = drawFixture("flow/virtual_cards", [], PLACED);
    const { xs: x0, y } = lineOf(drawing, "allegro_single");
    const x = (t: number) => x0 + lx(t, 3241 / 2);
    expect(chunksOf(drawing, "allegro_single")).toEqual([
      ["boundary", [1, "start"], x(953 / 2), y - 8, y + 8],
      ["label", [0, "label"], "A", x(953 / 4)],
      ["label", [1, "label"], "C", x((953 / 2 + 3241 / 2) / 2)],
    ]);
  });

  it("draw a run once and a widened gap by its line and label, the worked numbers", () => {
    const drawing = drawFixture("flow/virtual_cards", [], PLACED);
    const id = "allegro_by_hand";
    const { xs: x0, xe, y, end, gapLines } = lineOf(drawing, id);
    // Section 8.10, worked example: the run gap `[953/2, 1906]` drawn 0 wide, the gap entry
    // `[1906, 1910]`, 0.5239030779305551 wide at full scale, widened to `Gm` = 32.
    expect([xe, end]).toEqual([x0 + 244.2462344466274, "circle"]);
    expect(gapLines).toEqual([[x0 + 62.40995415848069, x0 + 94.40995415848069]]);
    expect(chunksOf(drawing, id)).toEqual([
      ["boundary", [4, "start"], x0 + 62.40995415848069, y - 8, y + 8],
      ["boundary", [5, "start"], x0 + 94.40995415848069, y - 8, y + 8],
      ["label", [0, "label"], "A × 4", x0 + 31.204977079240344],
      ["label", [4, "label"], "4 ♩", x0 + 78.40995415848069],
      ["label", [5, "label"], "C", x0 + 169.328094302554],
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
      // The widened gap is a run of its own, 32 wide (section 8.10, Widened gaps).
      [brace, x0 + 94.40995415848069, "1906", "4", "4"],
      [x0 + 94.40995415848069, xe, "1910", "1144", "1144"],
    ]);
    const [first, second, third] = runs;
    if (first === undefined || second === undefined || third === undefined) {
      throw new Error("three runs");
    }
    // Inside the run gap no axis holds a position: each holds `[start, start + drawn length]`.
    const holding = (t: number) =>
      runs.filter((axis) => {
        const start = toFloat(toRational(axis.start));
        return start <= t && t <= start + toFloat(toRational(axis.drawnLength));
      });
    expect([476.5, 1000, 1905, 1906, 1908, 2000].map((t) => holding(t).length)).toEqual([
      1, 0, 0, 1, 1, 1,
    ]);
    expect(abscissaOf(first, 0)).toBe(x0);
    expect(abscissaOf(second, 1906)).toBe(brace);
    // Each run is linear, the widened gap's from `x(a)` over `Gm`: `x(a) + Gm × v` inside it.
    expect(abscissaOf(second, 1908)).toBe(second.xStart + 0.5 * (second.xEnd - second.xStart));
    expect(abscissaOf(third, 2482)).toBe(third.xStart + (572 / 1144) * (third.xEnd - third.xStart));
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
    expect(allAt(drawing, chunk(id, 3, "label"))).toEqual([
      expect.objectContaining({ type: "label", text: "C", x: x((1953 / 2 + 4241 / 2) / 2) }),
    ]);
    expect(labelsAbove(drawing, id)).toBe(true);
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
    // In a frame the gap keeps its natural width (section 8.10, Widened gaps).
    expect(chunksOf(drawing, id)).toEqual([
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

  it("draw the run entry by entry where an elision reaches into its run gap, the worked numbers", () => {
    const drawing = drawn(exposition({ start: quarters(10), end: quarters(14) }));
    const { xs: x0, xe, y, end, cuts } = lineOf(drawing, "virtual_1");
    const [gap, ...others] = elisionsOf(drawing);
    if (gap === undefined) throw new Error("elision_1's gap");
    expect(others).toEqual([]);
    expect([gap.x1, gap.x2]).toEqual([x0 + 166.66666666666669, x0 + 198.66666666666669]);
    expect([xe, end, cuts]).toEqual([
      x0 + 365.33333333333337,
      "circle",
      [[x0 + 166.66666666666669, x0 + 198.66666666666669]],
    ]);
    // The second `A`, whose midpoint 12 lies in the gap, is not drawn.
    expect(chunksOf(drawing, "virtual_1")).toEqual([
      ["boundary", [1, "start"], x0 + 133.33333333333331, y - 8, y + 8],
      ["boundary", [2, "start"], x0 + 231.99999999999997, y - 8, y + 8],
      ["label", [0, "label"], "A", x0 + 66.66666666666666],
      ["label", [2, "label"], "B", x0 + 298.66666666666674],
    ]);
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
    const label = element(drawing, chunk("virtual_1", 2, "label"));
    expect(label.type === "label" ? [label.text, label.x] : label.type).toEqual([
      "B",
      x0 + 174.6666666666668,
    ]);
    expect(drawing.elements.filter((item) => item.type === "ellipsis")).toEqual([]);
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

describe("the windows of a virtual card", () => {
  // flow/virtual_cards with `allegro_default` placed alone; `allegro` given the region motto
  // [100, 200] (inside A), the child theme [400, 600] (across A's end into B, and B's end into
  // C), the LinearMap tempo and the named timestamp entry at 150 (wedge and coordinate).
  const V = "allegro_default";
  const MANIFEST = edit(
    "flow/virtual_cards",
    {
      type: "add",
      into: target("allegro"),
      region: { id: "motto", name: "Motto", start: quarters(100), end: quarters(200) },
    },
    child("allegro", "theme", 400, 200),
    linearMap("allegro", "tempo"),
    {
      type: "add",
      into: target("allegro"),
      timestamp: { name: "Entry", coordinate: [150, 1], display: ["wedge", "coordinate"] },
      ids: ["entry"],
    },
  );
  const ALONE: Placement = { ...DEFAULT_PLACEMENT, places: { [V]: {} } };
  /** The rule showing the sources' bands of `facet` on V's card (section 8.10, Windows). */
  const fromSources = (facet: string): Rule =>
    ({
      select: { facet, inside: "chunk", within: V },
      set: { display: "inline" },
    }) as Rule;
  const drawnWith = (...rules: Rule[]) =>
    draw(MANIFEST, ALONE, [DEFAULT_LAYER, { rules }, manifestLayer(MANIFEST)], metrics);
  /** The elements V's card draws. */
  const inCard = (drawing: Drawing): DrawnElement[] => {
    const card = boxesOf(drawing, "card").find((box) => box.address.id === V);
    if (card === undefined) throw new Error(`${V} draws no card`);
    return drawing.elements.slice(card.range.start, card.range.end);
  };
  const SOURCE = ["motto", "theme", "tempo", "entry", "repeat_end", "volta_break", "volta_jump"];
  /** The elements of V's card belonging to the source, as type, ID and their x. */
  const shown = (drawing: Drawing) =>
    inCard(drawing).flatMap((item): unknown[][] => {
      const id = item.address.id ?? "";
      if (!SOURCE.includes(id)) return [];
      switch (item.type) {
        case "region":
          return [[item.type, id, item.x1, item.x2]];
        case "child":
          return [[item.type, id, item.xs, item.xe, item.start, item.end]];
        case "map":
          return [[item.type, id, item.xs, item.xe]];
        case "wedge":
        case "break":
          return [[item.type, id, item.x]];
        case "symbol":
          return [[item.type, id, item.x]];
        case "label":
        case "name":
          return [[item.type, id, item.text]];
        default:
          return [[item.type, id]];
      }
    });
  const xOf = (drawing: Drawing) => {
    const line = element(drawing, { id: V });
    if (line.type !== "timeline") throw new Error(`${V} draws no line`);
    return (t: number) => line.xs + lx(t, 4241 / 2);
  };

  it("are hidden by the defaults: the card is drawn stripped down", () => {
    const drawing = drawnWith();
    expect(shown(drawing)).toEqual([]);
    // What the card draws: its card, its line, the chunks' boundaries and labels, its name.
    expect(new Set(inCard(drawing).map((item) => item.type))).toEqual(
      new Set(["card", "timeline", "boundary", "label", "name"]),
    );
  });

  it("show the sources' regions in every window by one rule, each chunk's own left out", () => {
    const drawing = drawnWith(fromSources("regions"));
    const x = xOf(drawing);
    // motto lies in A's stretch: drawn in both windows of A, at 100 and at 500 + 100.
    expect(shown(drawing)).toEqual([
      ["region", "motto", x(100), x(200)],
      ["region", "motto", x(600), x(700)],
      ["label", "motto", "Motto"],
      ["label", "motto", "Motto"],
    ]);
  });

  it("show the sources' children unfolded, named once", () => {
    const drawing = drawnWith(fromSources("children"));
    const x = xOf(drawing);
    expect(shown(drawing)).toEqual([
      ["child", "theme", x(400), x(953 / 2), "circle", "none"],
      ["child", "theme", x(953 / 2), x(500), "none", "none"],
      ["child", "theme", x(900), x(1953 / 2), "circle", "none"],
      ["child", "theme", x(1953 / 2), x(2153 / 2), "none", "diamond"],
      ["name", "theme", "theme"],
    ]);
  });

  it("show the sources' conversion maps, flow control and named timestamps", () => {
    const drawing = drawnWith(
      fromSources("conversion_maps"),
      fromSources("flow_control"),
      fromSources("markers"),
    );
    const x = xOf(drawing);
    const of = (type: string) => shown(drawing).filter(([kind]) => kind === type);
    expect(of("map")).toEqual([
      ["map", "tempo", x(0), x(953 / 2)],
      ["map", "tempo", x(953 / 2), x(500)],
      ["map", "tempo", x(500), x(1953 / 2)],
      ["map", "tempo", x(1953 / 2), x(4241 / 2)],
    ]);
    // entry (150) lies in both stretches of A, labelled with its written coordinate.
    expect(of("wedge")).toEqual([
      ["wedge", "entry", x(150)],
      ["wedge", "entry", x(650)],
    ]);
    expect(of("label").filter(([, id]) => id === "entry")).toEqual([
      ["label", "entry", "150 ♩"],
      ["label", "entry", "150 ♩"],
    ]);
    // repeat_end and volta_break (500) end B, which the second A does not continue from, and
    // start C: drawn at 500 and at 1953/2.
    expect(of("symbol").filter(([, id]) => id === "repeat_end")).toEqual([
      ["symbol", "repeat_end", x(500)],
      ["symbol", "repeat_end", x(1953 / 2)],
    ]);
    expect(of("break")).toEqual([
      ["break", "volta_break", x(500)],
      ["break", "volta_break", x(1953 / 2)],
    ]);
  });

  it("are hidden with the virtual timeline's band of their facet", () => {
    const hidden: Rule = {
      select: { addresses: [{ id: V, facet: "regions" }] },
      set: { display: "none" },
    } as Rule;
    expect(shown(drawnWith(fromSources("regions"), hidden))).toEqual([]);
  });

  it("are hidden for a chunk not displayed, and the chunk's label stays", () => {
    const chunk2: Rule = {
      select: { addresses: [{ id: V, part: [2] }] },
      set: { display: "none" },
    } as Rule;
    const drawing = drawnWith(fromSources("regions"), chunk2);
    const x = xOf(drawing);
    expect(shown(drawing)).toEqual([
      ["region", "motto", x(100), x(200)],
      ["label", "motto", "Motto"],
    ]);
    expect(textOf(drawing, { id: V, part: [2, "label"] })).toBe("A");
  });
});
