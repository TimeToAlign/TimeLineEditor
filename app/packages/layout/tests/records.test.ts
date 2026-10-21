/**
 * The records of `Drawing.boxes` against core's listing of the containers,
 * the records of the present bands, and `Drawing.axes`; every number is
 * derived in tests/README.md.
 */

import {
  addressKey,
  BUNDLE_ADDRESS,
  bandAddress,
  type ContainerRef,
  containersOf,
  type Facet,
  type Manifest,
  type PlaceKey,
  placeKeyText,
  sameAddress,
  samePlaceKey,
} from "@timetoalign/tilie-core";
import { Rational } from "@timetoalign/tilie-core/numbers";
import { canonicalOrder, type Graphical, validate } from "@timetoalign/timetoshare";
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
  at,
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
  target,
} from "./support.ts";

const drawn = (
  manifest: Manifest,
  extra: readonly Graphical[] = [],
  placement: Placement = DEFAULT_PLACEMENT,
): Drawing =>
  draw(manifest, placement, [DEFAULT_LAYER, ...extra, manifestLayer(manifest)], metrics);

/** The bands a drawing records, without their ranges, which are empty (tested below). */
const bandsOf = (drawing: Drawing) => boxesOf(drawing, "band").map(({ range: _, ...band }) => band);

/**
 * A band's record: the band drawing the facet `facet` of `timeline`, held by
 * the card whose place key is `holder`, `timeline`'s block-held one by default.
 */
const record = (
  { id: timeline, facet }: { readonly id: string; readonly facet: Facet },
  level: number,
  elements: number,
  line: number,
  rectangle: Pick<DrawnBox, "x" | "y" | "width" | "height">,
  holder: PlaceKey = { item: timeline },
): Omit<DrawnBox, "range"> => ({
  kind: "band",
  key: null,
  address: bandAddress(timeline, facet),
  holder,
  ...rectangle,
  displayed: false,
  band: { timeline, facet, level, elements, line },
});

describe("the records and core's listing of the containers", () => {
  const hidden: Graphical = {
    statements: [
      { select: { element: "frame" }, set: { display: "none" } },
      { select: { element: "card" }, set: { display: "none" } },
    ],
  };
  type Identity = Pick<DrawnBox, "kind" | "address" | "holder">;
  const identity = ({ kind, address, holder }: Identity): Identity => ({ kind, address, holder });
  const listed = (ref: ContainerRef): Identity => ({
    kind: ref.kind,
    address: ref.address,
    holder: ref.holder?.key ?? null,
  });
  /** One string per identity, from the one string form of its address and of its holder's key. */
  const text = ({ kind, address, holder }: Identity) =>
    JSON.stringify([kind, addressKey(address), holder === null ? null : placeKeyText(holder)]);

  it("lists the block, every frame and every card as core does, in order, displayed or not", () => {
    for (const name of manifestNames()) {
      const manifest = loadFile(name);
      const { block, all } = containersOf(manifest);
      const expected = [block, ...all].filter((ref) => ref.kind !== "band");
      for (const extra of [[], [hidden]]) {
        const records = drawn(manifest, extra).boxes.filter((record) => record.kind !== "band");
        expect(records.map(identity), name).toEqual(expected.map(listed));
      }
    }
  });

  it("records each present band once per card drawing it, under core's address and holder", () => {
    for (const name of manifestNames()) {
      const manifest = loadFile(name);
      const { bands: listing } = containersOf(manifest);
      const bands = drawn(manifest).boxes.filter((record) => record.kind === "band");
      const expected = bands.flatMap(({ band }) =>
        band === undefined ? [] : (listing.get(band.timeline)?.get(band.facet) ?? []).map(listed),
      );
      expect(bands.map(identity).map(text).sort(), name).toEqual(
        [...new Set(expected.map(text))].sort(),
      );
    }
  });
});

describe("a root with bands on both sides (styled__score)", () => {
  it("records each present band top to bottom, from its start to its outer edge", () => {
    const x = 89.951171875;
    const width = 416.2578125;
    const line = 62.640625;
    expect(bandsOf(drawFixture("styled__score"))).toEqual([
      record({ id: "score", facet: "children" }, 2, 1, line, { x, y: 16, width, height: 14 }),
      record({ id: "score", facet: "markers" }, 1, 2, line, { x, y: 34, width, height: 28.640625 }),
      record({ id: "score", facet: "conversion_maps" }, -1, 1, line, {
        x,
        y: 62.640625,
        width,
        height: 7,
      }),
      record({ id: "score", facet: "regions" }, -2, 1, line, {
        x,
        y: 73.640625,
        width,
        height: 19.640625,
      }),
      record({ id: "score", facet: "flow_control" }, -3, 1, line, {
        x,
        y: 97.28125,
        width,
        height: 21.640625,
      }),
    ]);
  });
});

describe("a child's shown regions band", () => {
  const manifest = build("r", 8, child("r", "c", 2, 4), {
    type: "add",
    into: target("c"),
    region: { id: "region_1", name: null, start: quarters(0), end: quarters(4), meta: {} },
  });
  const shown: Graphical = {
    statements: [
      { select: { addresses: [{ id: "c", facet: "regions" }] }, set: { display: "inline" } },
    ],
  };
  const root = { x: 22.6318359375, width: 414.83203125 };

  it("is hidden by default and then not recorded, taking no room", () => {
    expect(bandsOf(drawn(manifest))).toEqual([
      record({ id: "r", facet: "children" }, 1, 1, 37, { ...root, y: 16, height: 14 }),
      record({ id: "r", facet: "markers" }, -1, 2, 37, { ...root, y: 37, height: 26.9765625 }),
    ]);
  });

  it("is recorded at its own line, spanning its timeline's extent", () => {
    expect(bandsOf(drawn(manifest, [shown]))).toEqual([
      record({ id: "r", facet: "children" }, 1, 1, 53.9765625, {
        ...root,
        y: 16,
        height: 30.9765625,
      }),
      record({ id: "r", facet: "markers" }, -1, 2, 53.9765625, {
        ...root,
        y: 53.9765625,
        height: 26.9765625,
      }),
      record(
        { id: "c", facet: "regions" },
        -1,
        1,
        23,
        { x: 130.0478515625, y: 28.5, width: 200, height: 18.4765625 },
        { item: "r" },
      ),
    ]);
  });

  it("goes with a hidden root line, which leaves the root's card alone", () => {
    const hidden: Graphical = {
      statements: [{ select: { addresses: [at("r")] }, set: { display: "none" } }],
    };
    const drawing = drawn(manifest, [shown, hidden]);
    expect(bandsOf(drawing)).toEqual([]);
    expect(drawing.elements.map((item) => [item.type, item.address])).toEqual([
      ["block", BUNDLE_ADDRESS],
      ["card", at("r", "card")],
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
        { id: "c", facet: "regions" },
        -1,
        1,
        38,
        { x: 252.095703125, y: 49, width: 400, height: 36.953125 },
        { item: "r" },
      ),
    );
    expect(drawing.elements.find((item) => sameAddress(item.address, at("c")))).toMatchObject({
      y: 38,
    });
  });
});

describe("a segment line's band holding its segments' content", () => {
  it("counts what they join to it, labels not", () => {
    const drawing = drawFixture("unknown_length_segments", [
      {
        statements: [{ select: { element: "band", facet: "regions" }, set: { display: "inline" } }],
      },
    ]);
    const span = { x: 42.42431640625, width: 435.916015625 };
    expect(bandsOf(drawing)).toEqual([
      record({ id: "form", facet: "markers" }, -1, 1, 24, { ...span, y: 24, height: 26.9765625 }),
      record({ id: "form", facet: "regions" }, -2, 2, 24, {
        ...span,
        y: 54.9765625,
        height: 18.4765625,
      }),
    ]);
  });
});

describe("a present band 0 high", () => {
  it("is recorded with height 0", () => {
    const manifest = build("r", 8, {
      type: "add",
      into: target("r"),
      flow_control: {
        id: "fine",
        type: "flow_marker",
        manifestation: "fine",
        coordinate: quarters(4),
      },
    });
    expect(bandsOf(drawn(manifest))[1]).toEqual(
      record({ id: "r", facet: "flow_control" }, -2, 1, 22.40234375, {
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
  // The cards of `clt_1` in the frame of `g1` and of `clt_2` in the frame of `g2`.
  const G1: PlaceKey = { item: "g1", member: "clt_1" };
  const G2: PlaceKey = { item: "g2", member: "clt_2" };

  it("records each drawing's bands at its own line, in drawing order", () => {
    expect(bands.map((band) => [band.address, band.band?.line, band.holder])).toEqual([
      [{ id: "clt_1", facet: "children" }, 75.8046875, G1],
      [{ id: "clt_1", facet: "markers" }, 75.8046875, G1],
      [{ id: "clt_1", facet: "regions" }, 75.8046875, G1],
      [{ id: "clt_2", facet: "conversion_maps" }, 61.8046875, G1],
      [{ id: "clt_2", facet: "conversion_maps" }, 226.5390625, G2],
      [{ id: "clt_2", facet: "markers" }, 226.5390625, G2],
    ]);
  });

  it("gives the same address two rectangles", () => {
    expect(
      bands.filter((band) => sameAddress(band.address, { id: "clt_2", facet: "conversion_maps" })),
    ).toEqual([
      record(
        { id: "clt_2", facet: "conversion_maps" },
        1,
        1,
        61.8046875,
        { x: 93.02663845486111, y: 55.3046875, width: 133.33333333333331, height: 6.5 },
        G1,
      ),
      record(
        { id: "clt_2", facet: "conversion_maps" },
        1,
        1,
        226.5390625,
        { x: 74.49951171875, y: 220.0390625, width: 414.83203125, height: 6.5 },
        G2,
      ),
    ]);
  });
});

describe("a timeline in several groups (bundle_shared_member)", () => {
  const drawing = drawFixture("bundles/bundle_shared_member");
  const G1T: PlaceKey = { item: "g1", member: "t" };
  const G2T: PlaceKey = { item: "g2", member: "t" };
  /** The card whose place key is `key`: the two cards of `t` share one address. */
  const cardOf = (of: Drawing, key: PlaceKey) => {
    const card = of.boxes.find(
      (box) => box.kind === "card" && box.key !== null && samePlaceKey(box.key, key),
    );
    if (card === undefined) throw new Error(`${placeKeyText(key)} is no card of the drawing`);
    return card;
  };
  /** The addresses of the elements a card's member drawing draws, the card's own left out. */
  const drawnIn = (key: PlaceKey) => {
    const { range } = cardOf(drawing, key);
    return drawing.elements.slice(range.start + 1, range.end).map((item) => item.address);
  };

  it("records a frame and a card per group, keyed by group and member", () => {
    expect(
      drawing.boxes
        .filter((box) => box.kind === "frame" || box.kind === "card")
        .map((box) => [box.kind, box.key, box.address, box.holder]),
    ).toEqual([
      ["frame", { item: "g1" }, at("g1"), null],
      ["card", G1T, at("t", "card"), { item: "g1" }],
      ["card", { item: "g1", member: "u" }, at("u", "card"), { item: "g1" }],
      ["frame", { item: "g2" }, at("g2"), null],
      ["card", G2T, at("t", "card"), { item: "g2" }],
      ["card", { item: "g2", member: "v" }, at("v", "card"), { item: "g2" }],
    ]);
  });

  it("draws the timeline in each frame with the same addresses", () => {
    const first = drawnIn(G1T);
    expect(first).toContainEqual(at("t"));
    expect(first).toContainEqual(at("t", "end", "label"));
    expect(drawnIn(G2T)).toEqual(first);
  });

  it("records the timeline's bands once in each of its cards", () => {
    expect(
      boxesOf(drawing, "band")
        .filter((box) => box.band?.timeline === "t")
        .map((box) => [box.address, box.holder]),
    ).toEqual([
      [bandAddress("t", "markers"), G1T],
      [bandAddress("t", "markers"), G2T],
    ]);
  });

  it("lays out each card at its own entry of places", () => {
    const sized = drawFixture("bundles/bundle_shared_member", [], {
      ...DEFAULT_PLACEMENT,
      places: { g2: { cards: { t: { width: 650 } } } },
    });
    expect(cardOf(sized, G2T).width).toBe(650);
    expect(cardOf(sized, G1T).width).toBe(cardOf(drawing, G1T).width);
  });

  it("styles every drawing of an address with one statement", () => {
    const stroked = drawFixture("bundles/bundle_shared_member", [
      { statements: [{ select: { addresses: [at("t")] }, set: { stroke: "#123456" } }] },
    ]);
    const lines = stroked.elements.filter((item) => sameAddress(item.address, at("t")));
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
    // A band's address alone carries a facet.
    expect(drawing.elements.filter((item) => item.address.facet !== undefined)).toEqual([]);
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
      [at("score"), "quarters", "fraction", "0", "8"],
      [at("b"), "quarters", "fraction", "0", "4"],
    ]);
    expect(drawing.axes.map((axis) => [axis.xStart, axis.xEnd])).toEqual(
      lines(drawing).map((line) => [line.xs, line.xe]),
    );
  });

  it("lists the maps the drawing displays of the axis's own timeline", () => {
    const drawing = drawFixture("bundles/bundle_mixed");
    expect(drawing.axes.map((axis) => [axis.address, axis.maps.map((map) => map.id)])).toEqual([
      [at("score"), ["cmap_1", "cmap_2"]],
      [at("performance"), ["cmap_3"]],
      [at("page"), ["cmap_4"]],
      [at("recording"), []],
      [at("excerpt"), ["cmap_6"]],
      [at("annotations"), []],
    ]);
  });

  it("clips an ancestor's axis to its member, at the coordinates of the member's ends", () => {
    const member = drawFixture("groups/group_child_member");
    const ancestor = member.axes[0];
    const [own] = lines(member).filter((line) => sameAddress(line.address, at("second-half")));
    expect(exact(ancestor)).toEqual([at("piece"), "quarters", "fraction", "8", "16"]);
    expect([ancestor?.xStart, ancestor?.xEnd]).toEqual([own?.xs, own?.xe]);
    const mixed = drawFixture("bundles/bundle_mixed");
    const runsOn = mixed.axes.find((axis) => sameAddress(axis.address, at("recording")));
    expect(exact(runsOn)).toEqual([at("recording"), "samples", "int", "44100", "132300"]);
    expect([runsOn?.xStart, runsOn?.xEnd]).toEqual([126.29150390625, 526.29150390625]);
  });

  it("ends an open line's axis at its reach, its end not known", () => {
    const drawing = drawFixture("unknown_length_segments");
    const [axis] = drawing.axes;
    expect(exact(axis)).toEqual([at("form"), "quarters", "fraction", "0", "null"]);
    expect([axis?.xStart, axis?.xEnd]).toEqual([49.84033203125, 449.84033203125]);
    expect(axis && coordinateAt(axis, axis.xStart)).toBeNull();
  });
});

describe("coordinateAt", () => {
  const read = (axis: DrawnAxis | undefined, x: (axis: DrawnAxis) => number) =>
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
    expect([read(score, start), read(score, end), read(score, middle)]).toEqual([
      quarters(0),
      quarters(8),
      quarters(4),
    ]);
  });

  it("gives an int axis's exact start, end and midpoint (discrete_logical)", () => {
    const [ticks] = drawFixture("discrete_logical").axes;
    const tick = (value: bigint) => ({ unit: "ticks", numberType: "int", value });
    expect([read(ticks, start), read(ticks, end), read(ticks, middle)]).toEqual([
      tick(0n),
      tick(480n),
      tick(240n),
    ]);
  });

  const axis = (numberType: DrawnAxis["numberType"], last: DrawnAxis["end"]): DrawnAxis => ({
    address: at("t"),
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
