/**
 * The records of `Drawing.boxes` against core's listing of the containers,
 * the records of the present bands, and `Drawing.axes`; every number is
 * derived in tests/README.md.
 */

import {
  type ContainerRef,
  cardAddress,
  containersOf,
  type Manifest,
  parseBand,
} from "@timetoalign/tilie-core";
import { Rational } from "@timetoalign/tilie-core/numbers";
import { canonicalOrder, type Graphical, validate } from "@timetoalign/timeskeleton";
import { describe, expect, it } from "vitest";
import {
  coordinateAt,
  DEFAULT_LAYER,
  DEFAULT_PLACEMENT,
  type Drawing,
  type DrawnAxis,
  type DrawnBox,
  draw,
  manifestLayer,
  type Placement,
} from "../src/index.ts";
import {
  BLOCK,
  boxesOf,
  build,
  child,
  drawFixture,
  edit,
  linearMap,
  loadFile,
  manifestNames,
  metrics,
  quarters,
} from "./support.ts";

const drawn = (
  manifest: Manifest,
  extra: readonly Graphical[] = [],
  placement: Placement = DEFAULT_PLACEMENT,
): Drawing =>
  draw(manifest, placement, [DEFAULT_LAYER, ...extra, manifestLayer(manifest)], metrics);

/** The bands a drawing records, without their ranges, which are empty (tested below). */
const bandsOf = (drawing: Drawing) => boxesOf(drawing, "band").map(({ range: _, ...band }) => band);

/** A band's record: `T/<kind>_1` of `T`, held by the card `holder`, `T`'s box-held one by default. */
const record = (
  address: string,
  level: number,
  elements: number,
  line: number,
  rectangle: Pick<DrawnBox, "x" | "y" | "width" | "height">,
  holder?: string,
): Omit<DrawnBox, "range"> => {
  const parsed = parseBand(address);
  if (parsed === null) throw new Error(`${address} is no band address`);
  const { timeline, kind } = parsed;
  return {
    kind: "band",
    key: null,
    address,
    holder: holder ?? cardAddress(timeline, null),
    ...rectangle,
    displayed: false,
    band: { timeline, kind, level, elements, line },
  };
};

describe("the records and core's listing of the containers", () => {
  const hidden: Graphical = {
    statements: [
      { select: { element: "group" }, set: { display: "none" } },
      { select: { element: "card" }, set: { display: "none" } },
    ],
  };
  const triple = ({ kind, address, holder }: Pick<DrawnBox, "kind" | "address" | "holder">) =>
    `${kind} ${address} ${holder}`;
  const listed = (ref: ContainerRef) =>
    triple({ kind: ref.kind, address: ref.address, holder: ref.holder?.address ?? null });

  it("lists the box, every frame and every card as core does, in order, displayed or not", () => {
    for (const name of manifestNames()) {
      const manifest = loadFile(name);
      const { box, byAddress } = containersOf(manifest);
      const expected = [box, ...[...byAddress.values()].flat()].filter(
        (ref) => ref.kind !== "band",
      );
      for (const extra of [[], [hidden]]) {
        const records = drawn(manifest, extra).boxes.filter((record) => record.kind !== "band");
        expect(records.map(triple), name).toEqual(expected.map(listed));
      }
    }
  });

  it("records each present band once per card drawing it, under core's address and holder", () => {
    for (const name of manifestNames()) {
      const manifest = loadFile(name);
      const { byAddress } = containersOf(manifest);
      const bands = drawn(manifest).boxes.filter((record) => record.kind === "band");
      const expected = bands.flatMap(({ address }) =>
        (address === null ? [] : (byAddress.get(address) ?? [])).map(listed),
      );
      expect(bands.map(triple).sort(), name).toEqual([...new Set(expected)].sort());
    }
  });
});

describe("a root with bands on both sides (styled__score)", () => {
  it("records each present band top to bottom, from its start to its outer edge", () => {
    const x = 89.951171875;
    const width = 416.2578125;
    const line = 62.640625;
    expect(bandsOf(drawFixture("styled__score"))).toEqual([
      record("score/children_1", 2, 1, line, { x, y: 16, width, height: 14 }),
      record("score/markers_1", 1, 2, line, { x, y: 34, width, height: 28.640625 }),
      record("score/conversion_maps_1", -1, 1, line, { x, y: 62.640625, width, height: 7 }),
      record("score/regions_1", -2, 1, line, { x, y: 73.640625, width, height: 19.640625 }),
      record("score/flow_control_1", -3, 1, line, { x, y: 97.28125, width, height: 21.640625 }),
    ]);
  });
});

describe("a child's shown regions band", () => {
  const manifest = build("r", 8, child("r", "c", 2, 4), {
    type: "add",
    into: `${BLOCK}/c`,
    region: { id: "region_1", name: null, start: quarters(0), end: quarters(4), meta: {} },
  });
  const shown: Graphical = {
    statements: [{ select: { ids: ["c/regions_1"] }, set: { display: "inline" } }],
  };
  const root = { x: 22.6318359375, width: 414.83203125 };

  it("is hidden by default and then not recorded, taking no room", () => {
    expect(bandsOf(drawn(manifest))).toEqual([
      record("r/children_1", 1, 1, 37, { ...root, y: 16, height: 14 }),
      record("r/markers_1", -1, 2, 37, { ...root, y: 37, height: 26.9765625 }),
    ]);
  });

  it("is recorded at its own line, spanning its timeline's extent", () => {
    expect(bandsOf(drawn(manifest, [shown]))).toEqual([
      record("r/children_1", 1, 1, 53.9765625, { ...root, y: 16, height: 30.9765625 }),
      record("r/markers_1", -1, 2, 53.9765625, { ...root, y: 53.9765625, height: 26.9765625 }),
      record(
        "c/regions_1",
        -1,
        1,
        23,
        { x: 130.0478515625, y: 28.5, width: 200, height: 18.4765625 },
        "r/card",
      ),
    ]);
  });

  it("goes with a hidden root line, which leaves the root's card alone", () => {
    const hidden: Graphical = {
      statements: [{ select: { ids: ["r"] }, set: { display: "none" } }],
    };
    const drawing = drawn(manifest, [shown, hidden]);
    expect(bandsOf(drawing)).toEqual([]);
    expect(drawing.elements.map((item) => [item.type, item.address])).toEqual([
      ["block", null],
      ["card", "r/card"],
    ]);
    expect(drawing.elements[1]).toMatchObject({ x: 8, y: 8, width: 16, height: 28.8046875 });
    expect([drawing.width, drawing.height]).toEqual([34, 46.8046875]);
  });

  it("is placed as its item is, at its scale and shifted by the place origin", () => {
    const placement = { ...DEFAULT_PLACEMENT, places: { r: { x: -12, y: -20, scale: 2 } } };
    const drawing = drawn(manifest, [shown], placement);
    expect(drawing.origin).toEqual({ x: 20, y: 28 });
    expect(bandsOf(drawing)[2]).toEqual(
      record(
        "c/regions_1",
        -1,
        1,
        38,
        { x: 252.095703125, y: 49, width: 400, height: 36.953125 },
        "r/card",
      ),
    );
    expect(drawing.elements.find((item) => item.address === "c")).toMatchObject({ y: 38 });
  });
});

describe("a segment line's band holding its segments' content", () => {
  it("counts what they join to it, labels not", () => {
    const drawing = drawFixture("unknown_length_segments", [
      {
        statements: [{ select: { element: "band", class: "regions" }, set: { display: "inline" } }],
      },
    ]);
    const span = { x: 42.42431640625, width: 435.916015625 };
    expect(bandsOf(drawing)).toEqual([
      record("form/markers_1", -1, 1, 24, { ...span, y: 24, height: 26.9765625 }),
      record("form/regions_1", -2, 2, 24, { ...span, y: 54.9765625, height: 18.4765625 }),
    ]);
  });
});

describe("a present band 0 high", () => {
  it("is recorded with height 0", () => {
    const manifest = build("r", 8, {
      type: "add",
      into: `${BLOCK}/r`,
      flow_control: {
        id: "fine",
        type: "flow_marker",
        manifestation: "fine",
        coordinate: quarters(4),
      },
    });
    expect(bandsOf(drawn(manifest))[1]).toEqual(
      record("r/flow_control_1", -2, 1, 22.40234375, {
        x: 21.1064453125,
        y: 53.37890625,
        width: 414.83203125,
        height: 0,
      }),
    );
  });
});

describe("a timeline drawn twice: a child in one card, a member in another", () => {
  const source = edit("with_region", linearMap("clt_2", "tempo"));
  const manifest: Manifest = canonicalOrder({
    ...source,
    groups: [
      { id: "g1", name: null, meta: {}, members: ["clt_1"] },
      { id: "g2", name: null, meta: {}, members: ["clt_2"] },
    ],
  });
  validate(manifest);
  const bands = bandsOf(drawn(manifest));

  it("records each drawing's bands at its own line, in drawing order", () => {
    expect(bands.map((band) => [band.address, band.band?.line, band.holder])).toEqual([
      ["clt_1/children_1", 75.8046875, "g1/clt_1/card"],
      ["clt_1/markers_1", 75.8046875, "g1/clt_1/card"],
      ["clt_1/regions_1", 75.8046875, "g1/clt_1/card"],
      ["clt_2/conversion_maps_1", 61.8046875, "g1/clt_1/card"],
      ["clt_2/conversion_maps_1", 226.5390625, "g2/clt_2/card"],
      ["clt_2/markers_1", 226.5390625, "g2/clt_2/card"],
    ]);
  });

  it("gives the same address two rectangles", () => {
    expect(bands.filter((band) => band.address === "clt_2/conversion_maps_1")).toEqual([
      record(
        "clt_2/conversion_maps_1",
        1,
        1,
        61.8046875,
        { x: 93.02663845486111, y: 55.3046875, width: 133.33333333333331, height: 6.5 },
        "g1/clt_1/card",
      ),
      record(
        "clt_2/conversion_maps_1",
        1,
        1,
        226.5390625,
        { x: 74.49951171875, y: 220.0390625, width: 414.83203125, height: 6.5 },
        "g2/clt_2/card",
      ),
    ]);
  });
});

describe("a timeline in several groups (bundle_shared_member)", () => {
  const drawing = drawFixture("bundles/bundle_shared_member");
  const cardOf = (of: Drawing, address: string) => {
    const card = of.boxes.find((box) => box.kind === "card" && box.address === address);
    if (card === undefined) throw new Error(`${address} is no card of the drawing`);
    return card;
  };
  /** The addresses of the elements a card's member drawing draws, the card's own left out. */
  const drawnIn = (address: string) => {
    const { range } = cardOf(drawing, address);
    return drawing.elements.slice(range.start + 1, range.end).map((item) => item.address);
  };

  it("records a frame and a card per group, keyed by group and member", () => {
    expect(
      drawing.boxes
        .filter((box) => box.kind === "frame" || box.kind === "card")
        .map((box) => [box.kind, box.key, box.address, box.holder]),
    ).toEqual([
      ["frame", "g1", "g1", null],
      ["card", "g1/t", "g1/t/card", "g1"],
      ["card", "g1/u", "g1/u/card", "g1"],
      ["frame", "g2", "g2", null],
      ["card", "g2/t", "g2/t/card", "g2"],
      ["card", "g2/v", "g2/v/card", "g2"],
    ]);
  });

  it("draws the timeline in each frame with the same addresses", () => {
    const first = drawnIn("g1/t/card");
    expect(first).toContain("t");
    expect(first).toContain("t/end/label");
    expect(drawnIn("g2/t/card")).toEqual(first);
  });

  it("records the timeline's bands once in each of its cards", () => {
    expect(
      boxesOf(drawing, "band")
        .filter((box) => box.band?.timeline === "t")
        .map((box) => [box.address, box.holder]),
    ).toEqual(
      ["g1/t/card", "g2/t/card"].flatMap((card) =>
        ["markers"].map((kind) => [`t/${kind}_1`, card]),
      ),
    );
  });

  it("lays out each card at its own entry of places", () => {
    const sized = drawFixture("bundles/bundle_shared_member", [], {
      ...DEFAULT_PLACEMENT,
      places: { "g2/t": { width: 650 } },
    });
    expect(cardOf(sized, "g2/t/card").width).toBe(650);
    expect(cardOf(sized, "g1/t/card").width).toBe(cardOf(drawing, "g1/t/card").width);
  });

  it("styles every drawing of an address with one statement", () => {
    const stroked = drawFixture("bundles/bundle_shared_member", [
      { statements: [{ select: { ids: ["t"] }, set: { stroke: "#123456" } }] },
    ]);
    const lines = stroked.elements.filter((item) => item.address === "t");
    expect(lines.map((item) => [item.type, item.style.stroke])).toEqual([
      ["timeline", "#123456"],
      ["timeline", "#123456"],
    ]);
  });
});

describe("bands draw nothing", () => {
  it("adds no element for a band, and gives it an empty range at its card's end", () => {
    const drawing = drawFixture("styled__score");
    const card = boxesOf(drawing, "card")[0];
    expect(boxesOf(drawing, "band").map((band) => band.range)).toEqual(
      Array(5).fill({ start: card?.range.end, end: card?.range.end }),
    );
    expect(
      drawing.elements.filter((item) => item.address !== null && parseBand(item.address) !== null),
    ).toEqual([]);
  });
});

describe("the axes of the drawn lines", () => {
  const lines = (drawing: Drawing) =>
    drawing.elements.flatMap((item) =>
      item.type === "timeline" || item.type === "child" || item.type === "ancestor" ? [item] : [],
    );
  const exact = (axis: DrawnAxis | undefined) =>
    axis === undefined
      ? undefined
      : [axis.address, axis.unit, axis.numberType, String(axis.start), String(axis.end)];

  it("records one axis per drawn line, in the order of the lines, at the line's ordinate", () => {
    for (const name of ["styled__score", "groups/group_child_member", "bundles/bundle_mixed"]) {
      const drawing = drawFixture(name);
      expect(
        drawing.axes.map((axis) => [axis.address, axis.line]),
        name,
      ).toEqual(lines(drawing).map((line) => [line.address, line.y]));
    }
  });

  it("runs a timeline's or a child's axis from Xs to Xe, from its zero to its length", () => {
    const drawing = drawFixture("styled__score");
    expect(drawing.axes.map(exact)).toEqual([
      ["score", "quarters", "fraction", "0", "8"],
      ["b", "quarters", "fraction", "0", "4"],
    ]);
    expect(drawing.axes.map((axis) => [axis.xStart, axis.xEnd])).toEqual(
      lines(drawing).map((line) => [line.xs, line.xe]),
    );
  });

  it("lists the maps the drawing displays of the axis's own timeline", () => {
    const drawing = drawFixture("bundles/bundle_mixed");
    expect(drawing.axes.map((axis) => [axis.address, axis.maps.map((map) => map.id)])).toEqual([
      ["score", ["cmap_1", "cmap_2"]],
      ["performance", ["cmap_1"]],
      ["page", ["cmap_1"]],
      ["recording", []],
      ["excerpt", ["cmap_2"]],
      ["annotations", []],
    ]);
  });

  it("clips an ancestor's axis to its member, at the coordinates of the member's ends", () => {
    const member = drawFixture("groups/group_child_member");
    const ancestor = member.axes[0];
    const [own] = lines(member).filter((line) => line.address === "second-half");
    expect(exact(ancestor)).toEqual(["piece", "quarters", "fraction", "8", "16"]);
    expect([ancestor?.xStart, ancestor?.xEnd]).toEqual([own?.xs, own?.xe]);
    const mixed = drawFixture("bundles/bundle_mixed");
    const runsOn = mixed.axes.find((axis) => axis.address === "recording");
    expect(exact(runsOn)).toEqual(["recording", "samples", "int", "44100", "132300"]);
    expect([runsOn?.xStart, runsOn?.xEnd]).toEqual([126.29150390625, 526.29150390625]);
  });

  it("ends an open line's axis at its reach, its end not known", () => {
    const drawing = drawFixture("unknown_length_segments");
    const [axis] = drawing.axes;
    expect(exact(axis)).toEqual(["form", "quarters", "fraction", "0", "null"]);
    expect([axis?.xStart, axis?.xEnd]).toEqual([49.84033203125, 449.84033203125]);
    expect(axis && coordinateAt(axis, axis.xStart)).toBeNull();
  });
});

describe("coordinateAt", () => {
  const at = (axis: DrawnAxis | undefined, x: (axis: DrawnAxis) => number) =>
    axis === undefined ? undefined : coordinateAt(axis, x(axis));
  const start = (axis: DrawnAxis) => axis.xStart;
  const end = (axis: DrawnAxis) => axis.xEnd;
  const middle = (axis: DrawnAxis) => (axis.xStart + axis.xEnd) / 2;

  it("gives a fraction axis's exact start, end and midpoint (styled__score)", () => {
    const [score] = drawFixture("styled__score").axes;
    const quarters = (value: number) => ({
      unit: "quarters",
      numberType: "fraction",
      value: Rational.of(value),
    });
    expect([at(score, start), at(score, end), at(score, middle)]).toEqual([
      quarters(0),
      quarters(8),
      quarters(4),
    ]);
  });

  it("gives an int axis's exact start, end and midpoint (discrete_logical)", () => {
    const [ticks] = drawFixture("discrete_logical").axes;
    const tick = (value: bigint) => ({ unit: "ticks", numberType: "int", value });
    expect([at(ticks, start), at(ticks, end), at(ticks, middle)]).toEqual([
      tick(0n),
      tick(480n),
      tick(240n),
    ]);
  });

  const axis = (numberType: DrawnAxis["numberType"], last: DrawnAxis["end"]): DrawnAxis => ({
    address: "t",
    line: 0,
    xStart: 0,
    xEnd: 3,
    unit: "quarters",
    numberType,
    start: numberType === "float" ? 0 : Rational.of(0),
    end: last,
    maps: [],
  });

  it("computes exactly and rounds once into the axis's number type", () => {
    const fraction = axis("fraction", Rational.of(1));
    const int = axis("int", Rational.of(1));
    const float = axis("float", 0.1);
    expect(coordinateAt(fraction, 1)?.value).toEqual(Rational.of([1, 3]));
    expect([1.5, 2.25, 0.75].map((x) => coordinateAt(int, x)?.value)).toEqual([0n, 1n, 0n]);
    expect(coordinateAt(axis("int", Rational.of(3)), 1.5)?.value).toBe(2n);
    expect(coordinateAt(float, 3)?.value).toBe(0.1);
  });

  it("is null outside the axis", () => {
    const fraction = axis("fraction", Rational.of(1));
    expect([-0.5, 3.5].map((x) => coordinateAt(fraction, x))).toEqual([null, null]);
  });
});
