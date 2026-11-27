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
  holdingOf,
  type Manifest,
  type PlaceKey,
  placeKeyText,
  sameAddress,
  samePlaceKey,
} from "@timetoalign/tilie-core";
import { Rational } from "@timetoalign/tilie-core/numbers";
import { canonicalOrder, type Graphical, validate, withFileIds } from "@timetoalign/timetoshare";
import { describe, expect, it } from "vitest";
import {
  abscissaOf,
  DEFAULT_LAYER,
  DEFAULT_PLACEMENT,
  type Drawing,
  type DrawnAxis,
  type DrawnBox,
  draw,
  lineAxes,
  manifestLayer,
  type Placement,
} from "../src/index.ts";
import {
  ARCS_ALONE,
  at,
  boxesOf,
  build,
  CHILD_REGIONS_HIDDEN,
  child,
  drawFixture,
  drawWithoutAncestorCards,
  edit,
  HIDDEN_ANCESTOR_CARDS,
  linearMap,
  loadFile,
  manifestNames,
  metrics,
  quarters,
  set,
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
    rules: [
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
      // Core lists the block-held card of every virtual timeline in no group; the block draws
      // the ones `places` holds (section 8.10), none with no places.
      const virtual = new Set((manifest.virtual_timelines ?? []).map(({ id }) => id));
      const unplaced = (ref: ContainerRef) =>
        ref.kind === "card" && holdingOf(ref) === "block" && virtual.has(ref.timeline ?? "");
      // The default layer shows every ancestor card; hiding the frames and cards leaves them.
      const expected = [block, ...all].filter((ref) => ref.kind !== "band" && !unplaced(ref));
      for (const extra of [[], [hidden]]) {
        const records = drawn(manifest, extra).boxes.filter((record) => record.kind !== "band");
        expect(records.map(identity), name).toEqual(expected.map(listed));
      }
      // A hidden ancestor card is not recorded.
      const records = drawn(manifest, [HIDDEN_ANCESTOR_CARDS]).boxes.filter(
        (record) => record.kind !== "band",
      );
      expect(records.map(identity), name).toEqual(
        expected.filter((ref) => holdingOf(ref) !== "ancestor").map(listed),
      );
    }
  });

  it("records a placed virtual timeline's card where core lists it", () => {
    // In groups/virtual_member, allegro_default is a member of performance; allegro_by_hand and
    // allegro_single are in no group. Placing them both draws all of core's listing.
    const manifest = loadFile("groups/virtual_member");
    const { block, all } = containersOf(manifest);
    const places = { allegro_by_hand: { x: 0 }, allegro_single: { x: 0 } };
    const records = drawn(manifest, [], { ...DEFAULT_PLACEMENT, places }).boxes;
    const cards = (list: readonly Identity[]) => list.filter((item) => item.kind !== "band");
    expect(cards(records.map(identity))).toEqual(cards([block, ...all].map(listed)));
    expect(
      records
        .filter((record) => record.kind === "card" && record.holder === null)
        .map((record) => record.address),
    ).toEqual([
      { id: "allegro", part: ["card"] },
      { id: "allegro_by_hand", part: ["card"] },
      { id: "allegro_single", part: ["card"] },
    ]);
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
    expect(bandsOf(drawFixture("styled__score", [ARCS_ALONE]))).toEqual([
      record({ id: "score", facet: "children" }, 2, 1, line, { x, y: 16, width, height: 14 }),
      record({ id: "score", facet: "markers" }, 1, 4, line, { x, y: 34, width, height: 28.640625 }),
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
    rules: [{ select: { addresses: [{ id: "c", facet: "regions" }] }, set: { display: "inline" } }],
  };
  const root = { x: 22.6318359375, width: 414.83203125 };

  it("is not recorded where a rule hides it, taking no room", () => {
    expect(bandsOf(drawn(manifest, [CHILD_REGIONS_HIDDEN]))).toEqual([
      record({ id: "r", facet: "children" }, 1, 1, 37, { ...root, y: 16, height: 14 }),
      record({ id: "r", facet: "markers" }, -1, 4, 37, { ...root, y: 37, height: 26.9765625 }),
    ]);
  });

  it("is recorded at its own line, spanning its timeline's extent", () => {
    expect(bandsOf(drawn(manifest, [shown]))).toEqual([
      record({ id: "r", facet: "children" }, 1, 1, 53.9765625, {
        ...root,
        y: 16,
        height: 30.9765625,
      }),
      record({ id: "r", facet: "markers" }, -1, 4, 53.9765625, {
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
      rules: [{ select: { addresses: [at("r")] }, set: { display: "none" } }],
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
        rules: [{ select: { element: "band", facet: "regions" }, set: { display: "inline" } }],
      },
    ]);
    const span = { x: 42.42431640625, width: 435.916015625 };
    expect(bandsOf(drawing)).toEqual([
      record({ id: "form", facet: "markers" }, -1, 2, 24, { ...span, y: 24, height: 26.9765625 }),
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
        role: "break",
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
  validate(withFileIds(manifest));
  // Without the ancestor card of `clt_1` behind `g2`'s frame, which would move the origin.
  const bands = bandsOf(drawn(manifest, [HIDDEN_ANCESTOR_CARDS]));
  // The cards of `clt_1` in the frame of `g1` and of `clt_2` in the frame of `g2`.
  const G1: PlaceKey = { item: "g1", member: "clt_1" };
  const G2: PlaceKey = { item: "g2", member: "clt_2" };

  it("records each drawing's bands at its own line, in drawing order", () => {
    expect(bands.map((band) => [band.address, band.band?.line, band.holder])).toEqual([
      [{ id: "clt_1", facet: "children" }, 75.8046875, G1],
      [{ id: "clt_1", facet: "markers" }, 75.8046875, G1],
      [{ id: "clt_1", facet: "regions" }, 75.8046875, G1],
      [{ id: "clt_2", facet: "conversion_maps" }, 61.8046875, G1],
      [{ id: "clt_2", facet: "conversion_maps" }, 188.5625, G2],
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
        188.5625,
        { x: 81.91552734375, y: 182.0625, width: 400, height: 6.5 },
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
      // In name order: "Page" `g2`, then "Performance" `g1`.
      ["frame", { item: "g2" }, at("g2"), null],
      ["card", G2T, at("t", "card"), { item: "g2" }],
      ["card", { item: "g2", member: "v" }, at("v", "card"), { item: "g2" }],
      ["frame", { item: "g1" }, at("g1"), null],
      ["card", G1T, at("t", "card"), { item: "g1" }],
      ["card", { item: "g1", member: "u" }, at("u", "card"), { item: "g1" }],
    ]);
  });

  it("draws the timeline in each frame with the same addresses", () => {
    const first = drawnIn(G1T);
    expect(first).toContainEqual(at("t"));
    expect(first).toContainEqual(at("timestamp_2", "coordinate"));
    expect(drawnIn(G2T)).toEqual(first);
  });

  it("records the timeline's bands once in each of its cards", () => {
    expect(
      boxesOf(drawing, "band")
        .filter((box) => box.band?.timeline === "t")
        .map((box) => [box.address, box.holder]),
    ).toEqual([
      [bandAddress("t", "markers"), G2T],
      [bandAddress("t", "markers"), G1T],
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

  it("styles every drawing of an address with one rule", () => {
    const stroked = drawFixture("bundles/bundle_shared_member", [
      { rules: [{ select: { addresses: [at("t")] }, set: { stroke: "#123456" } }] },
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
    const drawing = drawFixture("styled__score", [ARCS_ALONE]);
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
      const drawing = drawWithoutAncestorCards(name);
      expect(
        drawing.axes.map((axis) => [axis.address, axis.line]),
        name,
      ).toEqual(lines(drawing).map((line) => [line.address, line.y]));
    }
  });

  it("runs a timeline's or a child's axis from Xs to Xe, from its zero to its length", () => {
    const drawing = drawFixture("styled__score", [ARCS_ALONE]);
    expect(drawing.axes.map(exact)).toEqual([
      [at("score"), "quarters", "fraction", "0", "8"],
      [at("b"), "quarters", "fraction", "0", "4"],
    ]);
    expect(drawing.axes.map((axis) => [axis.xStart, axis.xEnd])).toEqual(
      lines(drawing).map((line) => [line.xs, line.xe]),
    );
  });

  it("lists the maps drawn at the axis's line, each with its owner", () => {
    const drawing = drawWithoutAncestorCards("bundles/bundle_mixed", [ARCS_ALONE]);
    expect(
      drawing.axes.map((axis) => [axis.address, axis.maps.map((map) => [map.id, map.owner])]),
    ).toEqual([
      // The frames in name order: "Facsimile", then "Performance".
      [at("page"), [["cmap_4", "page"]]],
      [at("recording"), []],
      [at("excerpt"), [["cmap_6", "excerpt"]]],
      [
        at("score"),
        [
          ["cmap_1", "score"],
          ["cmap_2", "score"],
        ],
      ],
      [at("performance"), [["cmap_3", "performance"]]],
      [at("annotations"), []],
    ]);
    // Each map's place is that of its drawn element.
    for (const axis of drawing.axes) {
      for (const map of axis.maps) {
        const drawnMap = drawing.elements.find(
          (item) => item.type === "map" && item.address.id === map.id,
        );
        expect(drawnMap).toMatchObject({ xs: map.xs, xe: map.xe, yc: map.yc });
      }
    }
  });

  it("names the card that draws each axis", () => {
    const drawing = drawFixture("bundles/bundle_shared_member");
    const keys = drawing.axes
      .filter((axis) => sameAddress(axis.address, at("t")))
      .map((axis) => axis.card);
    // In name order: "Page" `g2`, then "Performance" `g1`.
    expect(keys).toEqual([
      { item: "g2", member: "t" },
      { item: "g1", member: "t" },
    ]);
  });

  it("clips an ancestor's axis to its member, at the coordinates of the member's ends", () => {
    const member = drawWithoutAncestorCards("groups/group_child_member");
    const ancestor = member.axes[0];
    const [own] = lines(member).filter((line) => sameAddress(line.address, at("second-half")));
    expect(exact(ancestor)).toEqual([at("piece"), "quarters", "fraction", "8", "16"]);
    expect([ancestor?.xStart, ancestor?.xEnd]).toEqual([own?.xs, own?.xe]);
    const mixed = drawWithoutAncestorCards("bundles/bundle_mixed", [ARCS_ALONE]);
    const runsOn = mixed.axes.find((axis) => sameAddress(axis.address, at("recording")));
    expect(exact(runsOn)).toEqual([at("recording"), "samples", "int", "44100", "132300"]);
    expect([runsOn?.xStart, runsOn?.xEnd]).toEqual([126.29150390625, 526.29150390625]);
  });

  it("ends an open line's axis at its reach, its end not known", () => {
    const drawing = drawFixture("unknown_length_segments");
    const [axis] = drawing.axes;
    expect(exact(axis)).toEqual([at("form"), "quarters", "fraction", "0", "null"]);
    expect([axis?.xStart, axis?.xEnd]).toEqual([49.84033203125, 449.84033203125]);
    expect(String(axis?.drawnEnd)).toBe("17");
  });

  it("gives every axis the coordinate drawn at its end", () => {
    const drawEnds = (name: string) =>
      drawWithoutAncestorCards(name).axes.map((axis) => [axis.address, String(axis.drawnEnd)]);
    expect(drawEnds("styled__score")).toEqual([
      [at("score"), "8"],
      [at("b"), "4"],
    ]);
    expect(drawEnds("groups/group_child_member")[0]).toEqual([at("piece"), "16"]);
  });
});

describe("lineAxes", () => {
  const form = build(
    "form",
    32,
    child("form", "A", 0, 8),
    child("form", "B", 8, 12),
    child("form", "C", 20, 12),
    set("form", { is_segment_line: true }),
    linearMap("form", "form_ticks", "Ticks"),
    linearMap("B", "b_ticks", "Ticks"),
  );

  it("gives a segment line its segments and the maps drawn at it, with their owners", () => {
    const drawing = draw(form, DEFAULT_PLACEMENT, [DEFAULT_LAYER], metrics);
    const axes = lineAxes(drawing);
    expect([...axes.keys()]).toEqual([placeKeyText({ item: "form" }) + addressKey(at("form"))]);
    const [axis] = axes.values();
    expect(
      axis && {
        ...axis,
        start: String(axis.start),
        length: String(axis.length),
        drawnLength: String(axis.drawnLength),
      },
    ).toEqual({
      timeline: "form",
      card: { item: "form" },
      y: 27.5,
      xStart: 49.84033203125,
      xEnd: 449.84033203125,
      start: "0",
      length: "32",
      drawnLength: "32",
      numberType: "fraction",
      unit: "quarters",
      segments: [
        { id: "A", offset: Rational.of(0n), length: Rational.of(8n) },
        { id: "B", offset: Rational.of(8n), length: Rational.of(12n) },
        { id: "C", offset: Rational.of(20n), length: Rational.of(12n) },
      ],
      maps: [
        { id: "form_ticks", owner: "form", yc: 22, xs: 49.84033203125, xe: 449.84033203125 },
        { id: "b_ticks", owner: "B", yc: 17, xs: 149.84033203125, xe: 299.84033203125 },
      ],
    });
  });

  it("places a coordinate at its abscissa on the drawn scale", () => {
    const [axis] = lineAxes(draw(form, DEFAULT_PLACEMENT, [DEFAULT_LAYER], metrics)).values();
    if (axis === undefined) throw new Error("form is drawn");
    expect([0, 8, 32].map((t) => abscissaOf(axis, Rational.of(t)))).toEqual([
      49.84033203125, 149.84033203125, 449.84033203125,
    ]);
    expect(abscissaOf({ ...axis, drawnLength: Rational.of(0) }, Rational.of(0))).toBe(
      49.84033203125,
    );
  });

  it("keeps one entry for each drawing of a timeline", () => {
    const axes = lineAxes(drawFixture("bundles/bundle_shared_member"));
    const drawings = [
      placeKeyText({ item: "g1", member: "t" }) + addressKey(at("t")),
      placeKeyText({ item: "g2", member: "t" }) + addressKey(at("t")),
    ].map((key) => {
      const axis = axes.get(key);
      return axis && { timeline: axis.timeline, card: axis.card };
    });
    expect(drawings).toEqual([
      { timeline: "t", card: { item: "g1", member: "t" } },
      { timeline: "t", card: { item: "g2", member: "t" } },
    ]);
  });
});
