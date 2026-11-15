/**
 * Named timestamps: their wedges, labels and cross-section lines, the room
 * they take, the reach they extend, and the marks at any position that share
 * their geometry; every number is derived in tests/README.md.
 */

import {
  addressKey,
  type ElementAddress,
  type Manifest,
  type PlaceKey,
  placeKeyText,
  sameAddress,
} from "@timetoalign/tilie-core";
import { type Address, canonicalOrder, type Statement, validate } from "@timetoalign/timetoshare";
import { describe, expect, it } from "vitest";
import {
  crossSection,
  DEFAULT_LAYER,
  DEFAULT_PLACEMENT,
  type Drawing,
  type DrawnElement,
  draw,
  manifestLayer,
  type Placement,
  wedgeAt,
  wedgePoints,
} from "../src/index.ts";
import { at, element, loadFile, metrics } from "./support.ts";

/** A named timestamp as `graphical.timestamps` holds it, on a fraction axis. */
interface Stamp {
  readonly id: string;
  readonly timeline: string;
  readonly coordinate: readonly [number, number];
  readonly name: string;
}

/**
 * The fixture `name` with its named timestamps replaced by `timestamps` and
 * `statements` appended to its own, in canonical order and validated.
 */
function stamped(
  name: string,
  timestamps: readonly Stamp[],
  statements: readonly Statement[] = [],
): Manifest {
  const manifest = loadFile(name);
  const graphical = manifest.graphical ?? { styles: {}, statements: [], order: {} };
  const result: Manifest = canonicalOrder({
    ...manifest,
    graphical: {
      ...graphical,
      statements: [...(graphical.statements ?? []), ...statements],
      timestamps,
    },
  });
  validate(result);
  return result;
}

const hide = (address: Address): Statement => ({
  select: { addresses: [address] },
  set: { display: "none" },
});

const drawn = (manifest: Manifest, placement: Placement = DEFAULT_PLACEMENT): Drawing =>
  draw(manifest, placement, [DEFAULT_LAYER, manifestLayer(manifest)], metrics);

/** The ordinate of the line of the timeline `id`. */
function lineY(drawing: Drawing, id: string): number {
  const found = element(drawing, at(id));
  if (found.type !== "timeline" && found.type !== "child") throw new Error(`${id} is no line`);
  return found.y;
}

/** The start of the line of the timeline `id`. */
function lineXs(drawing: Drawing, id: string): number {
  const found = element(drawing, at(id));
  if (found.type !== "timeline" && found.type !== "child") throw new Error(`${id} is no line`);
  return found.xs;
}

/** The drawn element of `type` at `address`, if any. */
const find = (drawing: Drawing, type: DrawnElement["type"], address: ElementAddress) =>
  drawing.elements.find((item) => item.type === type && sameAddress(item.address, address));

/** The wedge at `address`. */
function wedge(drawing: Drawing, address: ElementAddress) {
  const found = find(drawing, "wedge", address);
  if (found?.type !== "wedge") throw new Error(`no wedge ${addressKey(address)}`);
  return found;
}

/** The cross-section line of the timestamp `id`. */
function line(drawing: Drawing, id: string) {
  const found = find(drawing, "cross_section", at(id, "line"));
  if (found?.type !== "cross_section") throw new Error(`no cross-section line of ${id}`);
  return found;
}

/** The key of the line of `id` drawn in the card keyed `card`, as `lineAxes` keys it. */
const keyOf = (card: PlaceKey, id: string) => placeKeyText(card) + addressKey({ id });

const CLT_1 = { item: "clt_1" };
const DASHED = { stroke: "#1BA1E2", "stroke-width": 1, "stroke-dasharray": "3 3" };

describe("the timestamps fixture", () => {
  const drawing = drawn(loadFile("timestamps"));

  it("draws its elements in the order of section 7.2, the cross-section lines last", () => {
    expect(drawing.elements.map((item) => [item.type, item.address])).toEqual([
      ["block", {}],
      ["card", at("clt_1", "card")],
      ["timeline", at("clt_1")],
      ["child", at("clt_2")],
      ["wedge", at("clt_1", "start")],
      ["wedge", at("clt_1", "end")],
      ["wedge", at("timestamp_1")],
      ["wedge", at("timestamp_2")],
      ["wedge", at("timestamp_3")],
      ["name", at("clt_2", "name")],
      ["name", at("clt_1", "name")],
      ["label", at("clt_1", "start", "label")],
      ["label", at("clt_1", "end", "label")],
      ["label", at("timestamp_1", "label")],
      ["label", at("timestamp_2", "label")],
      ["label", at("timestamp_3", "label")],
      ["cross_section", at("timestamp_1", "line")],
      ["cross_section", at("timestamp_3", "line")],
    ]);
  });

  it("places the lines, the card and the block", () => {
    expect([lineY(drawing, "clt_1"), lineY(drawing, "clt_2")]).toEqual([56.9765625, 23]);
    const clt2 = element(drawing, at("clt_2"));
    expect(clt2.type === "child" && [clt2.xs, clt2.xe]).toEqual([149.91552734375, 349.91552734375]);
    const card = element(drawing, at("clt_1", "card"));
    expect(card.type === "card" && [card.x, card.y, card.width, card.height]).toEqual([
      8, 8, 458.91552734375, 83.953125,
    ]);
    expect([drawing.width, drawing.height]).toEqual([476.91552734375, 101.953125]);
  });

  it("draws each wedge at its X in its timeline's markers band", () => {
    const shape = (address: ElementAddress) => {
      const { x, yt, yb, base } = wedge(drawing, address);
      return [x, yt, yb, base];
    };
    expect(shape(at("timestamp_1"))).toEqual([124.91552734375, 58.4765625, 71.4765625, 6]);
    expect(shape(at("timestamp_2"))).toEqual([349.91552734375, 58.4765625, 71.4765625, 6]);
    expect(shape(at("timestamp_3"))).toEqual([199.91552734375, 24.5, 37.5, 6]);
    expect(wedge(drawing, at("timestamp_1")).style.fill).toBe("#000000");
  });

  it("labels each wedge with its name in the band's one first fit", () => {
    const labels = drawing.elements.flatMap((item) =>
      item.type === "label" ? [[item.text, item.x, item.baseline]] : [],
    );
    expect(labels).toEqual([
      ["0 ♩", 49.91552734375, 81.83056640625],
      ["8 ♩", 449.91552734375, 81.83056640625],
      ["Downbeat", 124.91552734375, 81.83056640625],
      ["Climax", 349.91552734375, 81.83056640625],
      ["Entry", 199.91552734375, 47.85400390625],
    ]);
  });

  it("draws the cross-section lines of section 6.6, none where hidden", () => {
    const first = line(drawing, "timestamp_1");
    const third = line(drawing, "timestamp_3");
    expect([first.x, first.y1, first.y2]).toEqual([124.91552734375, 16, 83.953125]);
    expect([third.x, third.y1, third.y2]).toEqual([199.91552734375, 23, 16]);
    expect(first.style).toMatchObject(DASHED);
    expect(third.style).toMatchObject(DASHED);
    expect(find(drawing, "cross_section", at("timestamp_2", "line"))).toBeUndefined();
  });

  it("moves the root's line down by the room the child's timestamp takes", () => {
    const without = drawn(stamped("timestamps", []));
    expect([lineY(without, "clt_1"), lineY(without, "clt_2")]).toEqual([37, 23]);
    expect(lineY(drawing, "clt_1") - lineY(without, "clt_1")).toBe(19.9765625);
  });
});

describe("display, each on its own", () => {
  // The fixture's own named timestamps, written again with a statement added.
  const stamps: Stamp[] = [
    { id: "timestamp_1", timeline: "clt_1", coordinate: [3, 2], name: "Downbeat" },
    { id: "timestamp_2", timeline: "clt_1", coordinate: [6, 1], name: "Climax" },
    { id: "timestamp_3", timeline: "clt_2", coordinate: [1, 1], name: "Entry" },
  ];

  it("hides a wedge with its label and keeps its line", () => {
    const drawing = drawn(stamped("timestamps", stamps, [hide(at("timestamp_3"))]));
    expect(find(drawing, "wedge", at("timestamp_3"))).toBeUndefined();
    expect(find(drawing, "label", at("timestamp_3", "label"))).toBeUndefined();
    const kept = line(drawing, "timestamp_3");
    expect([kept.x, kept.y1, kept.y2]).toEqual([199.91552734375, 23, 16]);
    expect(lineY(drawing, "clt_1")).toBe(37);
  });

  it("hides the wedge and label a hidden markers band holds and keeps the line", () => {
    const drawing = drawn(stamped("timestamps", stamps, [hide({ id: "clt_2", facet: "markers" })]));
    expect(
      drawing.elements.filter((item) => item.address.id === "timestamp_3").map((item) => item.type),
    ).toEqual(["cross_section"]);
    const kept = line(drawing, "timestamp_3");
    expect([kept.x, kept.y1, kept.y2]).toEqual([199.91552734375, 23, 16]);
    expect(lineY(drawing, "clt_1")).toBe(37);
    expect(lineY(drawing, "clt_2")).toBe(23);
  });

  it("hides the cross-section lines a hidden timeline line holds", () => {
    const drawing = drawn(stamped("timestamps", stamps, [hide({ id: "clt_2" })]));
    expect(
      drawing.elements.filter((item) => item.address.id === "timestamp_3").map((item) => item.type),
    ).toEqual([]);
    expect(line(drawing, "timestamp_1").y1).toBe(16);
  });
});

describe("named timestamps in the layout", () => {
  it("places a timestamp's label after the start and end labels", () => {
    const drawing = drawn(
      stamped("bare", [{ id: "timestamp_1", timeline: "bare", coordinate: [0, 1], name: "Zero" }]),
    );
    const zero = element(drawing, at("timestamp_1", "label"));
    expect(zero.type === "label" && zero.baseline).toBe(57.73291015625);
    const card = element(drawing, at("bare", "card"));
    expect(card.type === "card" && card.height).toBe(59.85546875);
  });

  it("counts a child's wedge in its extent", () => {
    expect([
      lineY(drawn(loadFile("contiguous")), "piece"),
      lineY(drawn(loadFile("contiguous")), "b"),
    ]).toEqual([51, 37]);
    const drawing = drawn(
      stamped(
        "contiguous",
        [{ id: "timestamp_1", timeline: "b", coordinate: [0, 1], name: "B" }],
        [hide(at("timestamp_1", "label"))],
      ),
    );
    expect([lineY(drawing, "piece"), lineY(drawing, "b")]).toEqual([72.5, 23]);
  });

  it("joins a segment's timestamps to its segment line's markers band", () => {
    const drawing = drawn(
      stamped("segment_line", [
        { id: "timestamp_1", timeline: "b1", coordinate: [2, 1], name: "Here" },
      ]),
    );
    const y = lineY(drawing, "b");
    const mark = wedge(drawing, at("timestamp_1"));
    expect([mark.x, mark.yt, mark.yb]).toEqual([lineXs(drawing, "form") + 125, y + 1.5, y + 14.5]);
    const crossing = line(drawing, "timestamp_1");
    expect([crossing.x, crossing.y1, crossing.y2]).toEqual([mark.x, y, 16]);
  });

  it("extends the reach of a timeline of unknown length", () => {
    const drawing = drawn(
      stamped("unknown_length", [
        { id: "timestamp_1", timeline: "score", coordinate: [20, 1], name: "Mark" },
      ]),
    );
    const coda = element(drawing, at("coda"));
    expect(coda.type === "child" && [coda.xs, coda.xe]).toEqual([253.798828125, 333.798828125]);
    expect(wedge(drawing, at("timestamp_1")).x).toBe(453.798828125);
  });
});

describe("the marks at any position", () => {
  const drawing = drawn(loadFile("timestamps"));

  /** The drawn cross-section line and wedge of the timestamp `id`, as the marks give them. */
  const drawnMarks = (from: Drawing, id: string) => {
    const crossing = line(from, id);
    const mark = wedge(from, at(id));
    return {
      line: { x: crossing.x, y1: crossing.y1, y2: crossing.y2, style: crossing.style },
      wedge: { points: wedgePoints(mark), style: mark.style },
    };
  };
  const marksAt = (from: Drawing, key: string, x: number) => ({
    line: crossSection(from, key, x),
    wedge: wedgeAt(from, key, x),
  });

  it("agree exactly with the named timestamps drawn", () => {
    expect(marksAt(drawing, keyOf(CLT_1, "clt_1"), 124.91552734375)).toEqual(
      drawnMarks(drawing, "timestamp_1"),
    );
    expect(marksAt(drawing, keyOf(CLT_1, "clt_2"), 199.91552734375)).toEqual(
      drawnMarks(drawing, "timestamp_3"),
    );
  });

  it("are never styled by a statement naming addresses", () => {
    const unnamed = crossSection(drawing, keyOf(CLT_1, "clt_1"), 349.91552734375);
    expect(unnamed && [unnamed.x, unnamed.y1, unnamed.y2]).toEqual([
      349.91552734375, 16, 83.953125,
    ]);
    expect(unnamed?.style).toMatchObject({ ...DASHED, display: "inline" });
  });

  it("agree at an item's scale", () => {
    const scaled = drawn(loadFile("timestamps"), {
      ...DEFAULT_PLACEMENT,
      places: { clt_1: { scale: 2 } },
    });
    for (const [timeline, id] of [
      ["clt_1", "timestamp_1"],
      ["clt_2", "timestamp_3"],
    ] as const) {
      const expected = drawnMarks(scaled, id);
      expect(marksAt(scaled, keyOf(CLT_1, timeline), expected.line.x)).toEqual(expected);
    }
    expect(crossSection(scaled, keyOf(CLT_1, "clt_1"), 0)?.style).toMatchObject({
      "stroke-width": 2,
      "stroke-dasharray": "6 6",
    });
  });

  it("lie where an absent markers band would start", () => {
    const nested = drawn(loadFile("nested"));
    expect(marksAt(nested, keyOf(CLT_1, "clt_3"), 200)).toMatchObject({
      line: { x: 200, y1: 37, y2: 16 },
      wedge: {
        points: [
          [200, 38.5],
          [197, 51.5],
          [203, 51.5],
        ],
      },
    });
    expect(marksAt(nested, keyOf(CLT_1, "clt_1"), 200)).toMatchObject({
      line: { x: 200, y1: 16, y2: 77.9765625 },
      wedge: {
        points: [
          [200, 52.5],
          [197, 65.5],
          [203, 65.5],
        ],
      },
    });
  });

  it("are none on an ancestor line or where no line is keyed", () => {
    const member = drawn(loadFile("groups/group_child_member"));
    const ancestor = member.axes.find((axis) => sameAddress(axis.address, at("piece")));
    if (ancestor === undefined) throw new Error("no ancestor line");
    const key = placeKeyText(ancestor.card) + addressKey(ancestor.address);
    expect(marksAt(member, key, 100)).toEqual({ line: null, wedge: null });
    expect(marksAt(drawing, keyOf(CLT_1, "nothing"), 100)).toEqual({ line: null, wedge: null });
  });
});
