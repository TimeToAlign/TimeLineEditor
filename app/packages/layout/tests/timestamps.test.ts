/**
 * Named timestamps: their wedges, stacked labels and cross-section lines, the
 * room they take, the reach they extend, the lines a cross-section line
 * crosses, and the marks at any position that share their geometry; every
 * number is derived in tests/README.md.
 */

import {
  addressKey,
  type ElementAddress,
  type Manifest,
  type PlaceKey,
  placeKeyText,
  sameAddress,
} from "@timetoalign/tilie-core";
import { Rational } from "@timetoalign/tilie-core/numbers";
import {
  type Address,
  canonicalOrder,
  type Rule,
  validate,
  withFileIds,
} from "@timetoalign/timetoshare";
import { describe, expect, it } from "vitest";
import {
  crossedLines,
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
import {
  at,
  bandOrder,
  boxAt,
  build,
  child,
  element,
  linearMap,
  loadFile,
  metrics,
  set,
  target,
  unturned,
} from "./support.ts";

type Word = "wedge" | "name" | "id" | "coordinate" | "cross_section";

/** A named timestamp as `graphical.timestamps` holds it, on a fraction axis. */
interface Stamp {
  readonly id: string;
  readonly timeline: string;
  readonly coordinate: readonly [number, number];
  readonly name: string;
  readonly display: readonly Word[];
}

const DEFAULT_DISPLAY: readonly Word[] = ["wedge", "name", "cross_section"];
const MARKS: readonly Word[] = ["wedge", "coordinate"];

/**
 * The fixture `name` with its named timestamps replaced by `timestamps`, none
 * a match timestamp nor a groupstamp (`matchstamp: false`, `groupstamp:
 * false`, the complete form), and `rules`
 * appended to its own, in canonical order and validated.
 */
function stamped(
  name: string,
  timestamps: readonly Stamp[],
  rules: readonly Rule[] = [],
): Manifest {
  const manifest = loadFile(name);
  const graphical = manifest.graphical ?? { styles: {}, rules: [], order: {} };
  const result: Manifest = canonicalOrder({
    ...manifest,
    graphical: {
      ...graphical,
      rules: [...(graphical.rules ?? []), ...rules],
      timestamps: timestamps.map((timestamp) => ({
        ...timestamp,
        matchstamp: false,
        groupstamp: false,
      })),
    },
  });
  validate(withFileIds(result));
  return result;
}

const hide = (address: Address): Rule => ({
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

/** The labels drawn, as `[address, text, x, baseline]`, in drawing order. */
const labels = (drawing: Drawing) =>
  drawing.elements.flatMap((item) =>
    item.type === "label" ? [[item.address, item.text, item.x, item.baseline]] : [],
  );

/** The types of the elements of the timestamp `id`, in drawing order. */
const typesOf = (drawing: Drawing, id: string) =>
  drawing.elements.filter((item) => item.address.id === id).map((item) => item.type);

/** The key of the line of `id` drawn in the card keyed `card`, as `lineAxes` keys it. */
const keyOf = (card: PlaceKey, id: string) => placeKeyText(card) + addressKey({ id });

const CLT_1 = { item: "clt_1" };
const DASHED = { stroke: "#1BA1E2", "stroke-width": 1, "stroke-dasharray": "3 3" };

/** The fixture's own named timestamps, written again with a rule or a `display` changed. */
const STAMPS: readonly Stamp[] = [
  {
    id: "timestamp_1",
    timeline: "clt_1",
    coordinate: [3, 2],
    name: "Downbeat",
    display: DEFAULT_DISPLAY,
  },
  {
    id: "timestamp_2",
    timeline: "clt_1",
    coordinate: [6, 1],
    name: "Climax",
    display: ["wedge", "name"],
  },
  {
    id: "timestamp_3",
    timeline: "clt_2",
    coordinate: [1, 1],
    name: "Entry",
    display: ["wedge", "name", "id", "coordinate", "cross_section"],
  },
];

/** `STAMPS` with the `display` of the timestamp `id` replaced. */
const displayed = (id: string, display: readonly Word[]): Stamp[] =>
  STAMPS.map((stamp) => (stamp.id === id ? { ...stamp, display } : stamp));

describe("the timestamps fixture", () => {
  const drawing = drawn(loadFile("timestamps"));

  it("draws its elements in the order of section 7.2, the cross-section lines last", () => {
    expect(drawing.elements.map((item) => [item.type, item.address])).toEqual([
      ["block", {}],
      ["card", at("clt_1", "card")],
      ["timeline", at("clt_1")],
      ["child", at("clt_2")],
      ["wedge", at("timestamp_1")],
      ["wedge", at("timestamp_2")],
      ["wedge", at("timestamp_3")],
      ["name", at("clt_2", "name")],
      ["name", at("clt_1", "name")],
      ["label", at("timestamp_1", "name")],
      ["label", at("timestamp_2", "name")],
      ["label", at("timestamp_3", "name")],
      ["label", at("timestamp_3", "id")],
      ["label", at("timestamp_3", "coordinate")],
      ["cross_section", at("timestamp_1", "line")],
    ]);
  });

  it("places the lines, the card and the block", () => {
    expect([lineY(drawing, "clt_1"), lineY(drawing, "clt_2")]).toEqual([77.9296875, 23]);
    const clt2 = element(drawing, at("clt_2"));
    expect(clt2.type === "child" && [clt2.xs, clt2.xe]).toEqual([149.91552734375, 349.91552734375]);
    const card = element(drawing, at("clt_1", "card"));
    expect(card.type === "card" && [card.x, card.y, card.width, card.height]).toEqual([
      8, 8, 458.91552734375, 104.90625,
    ]);
    expect([drawing.width, drawing.height]).toEqual([476.91552734375, 122.90625]);
  });

  it("draws each wedge at its X in its timeline's markers band", () => {
    const shape = (address: ElementAddress) => {
      const { x, yt, corners } = wedge(drawing, address);
      return [x, yt, corners];
    };
    expect(shape(at("timestamp_1"))).toEqual([124.91552734375, 79.4296875, unturned(92.4296875)]);
    expect(shape(at("timestamp_2"))).toEqual([349.91552734375, 79.4296875, unturned(92.4296875)]);
    expect(shape(at("timestamp_3"))).toEqual([199.91552734375, 24.5, unturned(37.5)]);
    expect(wedge(drawing, at("timestamp_1")).style.fill).toBe("#000000");
  });

  it("stacks each timestamp's labels, name, ID and coordinate, outwards from its wedge", () => {
    expect(labels(drawing)).toEqual([
      [at("timestamp_1", "name"), "Downbeat", 124.91552734375, 102.78369140625],
      [at("timestamp_2", "name"), "Climax", 349.91552734375, 102.78369140625],
      [at("timestamp_3", "name"), "Entry", 199.91552734375, 47.85400390625],
      [at("timestamp_3", "id"), "timestamp_3", 199.91552734375, 58.33056640625],
      [at("timestamp_3", "coordinate"), "1 ♩", 199.91552734375, 68.80712890625],
    ]);
    expect(element(drawing, at("timestamp_3", "coordinate"))).toMatchObject({
      coordinate: { unit: "quarters", value: Rational.of(1) },
    });
    expect(element(drawing, at("timestamp_3", "name"))).not.toHaveProperty("coordinate");
  });

  it("holds the wedges and labels in the markers band, which counts them", () => {
    const band = (id: string) => boxAt(drawing, { id, facet: "markers" }).band;
    expect([band("clt_1")?.elements, band("clt_2")?.elements]).toEqual([4, 4]);
  });

  it("spans the cross-section line over its timeline's line and children band only", () => {
    const first = line(drawing, "timestamp_1");
    expect([first.x, first.y1, first.y2]).toEqual([124.91552734375, 16, 77.9296875]);
    expect(first.style).toMatchObject(DASHED);
    expect(find(drawing, "cross_section", at("timestamp_2", "line"))).toBeUndefined();
    expect(find(drawing, "cross_section", at("timestamp_3", "line"))).toBeUndefined();
  });

  it("moves the root's line down by the room the child's timestamp takes", () => {
    const without = drawn(stamped("timestamps", []));
    expect([lineY(without, "clt_1"), lineY(without, "clt_2")]).toEqual([37, 23]);
    expect(lineY(drawing, "clt_1") - lineY(without, "clt_1")).toBe(40.9296875);
  });
});

describe("display, each on its own", () => {
  it("hides a wedge and keeps its labels where they were, and the band's room", () => {
    const drawing = drawn(stamped("timestamps", STAMPS, [hide(at("timestamp_3"))]));
    expect(typesOf(drawing, "timestamp_3")).toEqual(["label", "label", "label"]);
    expect(labels(drawing).slice(2)).toEqual([
      [at("timestamp_3", "name"), "Entry", 199.91552734375, 47.85400390625],
      [at("timestamp_3", "id"), "timestamp_3", 199.91552734375, 58.33056640625],
      [at("timestamp_3", "coordinate"), "1 ♩", 199.91552734375, 68.80712890625],
    ]);
    expect(lineY(drawing, "clt_1")).toBe(77.9296875);
  });

  it("hides the wedge and labels a hidden markers band holds and keeps the line", () => {
    const drawing = drawn(stamped("timestamps", STAMPS, [hide({ id: "clt_2", facet: "markers" })]));
    expect(typesOf(drawing, "timestamp_3")).toEqual([]);
    expect([lineY(drawing, "clt_1"), lineY(drawing, "clt_2")]).toEqual([37, 23]);
    const kept = line(drawing, "timestamp_1");
    expect([kept.x, kept.y1, kept.y2]).toEqual([124.91552734375, 16, 37]);
  });

  it("draws no cross-section line where a hidden child leaves no band to cross", () => {
    const drawing = drawn(stamped("timestamps", STAMPS, [hide({ id: "clt_2" })]));
    expect(typesOf(drawing, "timestamp_3")).toEqual([]);
    expect(typesOf(drawing, "timestamp_1")).toEqual(["wedge", "label"]);
    expect(lineY(drawing, "clt_1")).toBe(22.40234375);
  });

  it("draws only the words its display lists, the stack as high as its labels", () => {
    const drawing = drawn(stamped("timestamps", displayed("timestamp_3", ["name", "id"])));
    expect(typesOf(drawing, "timestamp_3")).toEqual(["label", "label"]);
    expect(labels(drawing).slice(2)).toEqual([
      [at("timestamp_3", "name"), "Entry", 199.91552734375, 47.85400390625],
      [at("timestamp_3", "id"), "timestamp_3", 199.91552734375, 58.33056640625],
    ]);
    expect([lineY(drawing, "clt_1"), lineY(drawing, "clt_2")]).toEqual([67.453125, 23]);
  });

  it("draws nothing of a timestamp whose display is empty", () => {
    const drawing = drawn(stamped("timestamps", displayed("timestamp_1", [])));
    expect(typesOf(drawing, "timestamp_1")).toEqual([]);
    expect(lineY(drawing, "clt_1")).toBe(77.9296875);
  });

  it("never draws by the cascade what its display leaves out", () => {
    const shown: Rule = {
      select: { addresses: [at("timestamp_2", "line"), at("timestamp_2", "id")] },
      set: { display: "inline" },
    };
    const drawing = drawn(stamped("timestamps", STAMPS, [shown]));
    expect(typesOf(drawing, "timestamp_2")).toEqual(["wedge", "label"]);
  });
});

describe("stacks in tiers", () => {
  // `bare` with `origin` and `length`, a stack of three labels at 4 and one of one at 9/2.
  const drawing = drawn(
    stamped("bare", [
      { id: "timestamp_1", timeline: "bare", coordinate: [0, 1], name: "origin", display: MARKS },
      { id: "timestamp_2", timeline: "bare", coordinate: [8, 1], name: "length", display: MARKS },
      {
        id: "timestamp_3",
        timeline: "bare",
        coordinate: [4, 1],
        name: "Mid",
        display: ["name", "id", "coordinate"],
      },
      { id: "timestamp_4", timeline: "bare", coordinate: [9, 2], name: "Late", display: ["name"] },
    ]),
  );

  it("puts a conflicting stack in the next tier, below the highest stack of the one before", () => {
    expect(labels(drawing)).toEqual([
      [at("timestamp_1", "coordinate"), "0 ♩", 49.5771484375, 47.25634765625],
      [at("timestamp_3", "name"), "Mid", 249.5771484375, 47.25634765625],
      [at("timestamp_3", "id"), "timestamp_3", 249.5771484375, 57.73291015625],
      [at("timestamp_3", "coordinate"), "4 ♩", 249.5771484375, 68.20947265625],
      [at("timestamp_4", "name"), "Late", 274.5771484375, 78.68603515625],
      [at("timestamp_2", "coordinate"), "8 ♩", 449.5771484375, 47.25634765625],
    ]);
  });

  it("makes the band as wide as its tiers' lines together", () => {
    const card = element(drawing, at("bare", "card"));
    expect(card.type === "card" && card.height).toBe(80.80859375);
    const band = boxAt(drawing, { id: "bare", facet: "markers" });
    expect([band.height, band.band?.elements]).toEqual([58.40625, 8]);
  });
});

describe("named timestamps in the layout", () => {
  it("counts a child's wedge in its extent", () => {
    expect([
      lineY(drawn(loadFile("contiguous")), "piece"),
      lineY(drawn(loadFile("contiguous")), "b"),
    ]).toEqual([51, 37]);
    const drawing = drawn(
      stamped("contiguous", [
        { id: "timestamp_1", timeline: "b", coordinate: [0, 1], name: "B", display: ["wedge"] },
      ]),
    );
    expect([lineY(drawing, "piece"), lineY(drawing, "b")]).toEqual([72.5, 23]);
  });

  it("counts a turned wedge's extent from its tip to its farthest corner across", () => {
    const turned = (rotation: number) =>
      drawn(
        stamped(
          "contiguous",
          [{ id: "timestamp_1", timeline: "b", coordinate: [0, 1], name: "B", display: ["wedge"] }],
          [{ select: { addresses: [at("timestamp_1")] }, set: { rotation } }],
        ),
      );
    const right = turned(90);
    expect([lineY(right, "piece"), lineY(right, "b")]).toEqual([58.5, 37]);
    const left = turned(-90);
    expect([lineY(left, "piece"), lineY(left, "b")]).toEqual([72.5, 23]);
  });

  it("joins a segment's timestamps to its segment line's markers band", () => {
    const drawing = drawn(
      stamped("segment_line", [
        {
          id: "timestamp_1",
          timeline: "b1",
          coordinate: [2, 1],
          name: "Here",
          display: DEFAULT_DISPLAY,
        },
      ]),
    );
    const y = lineY(drawing, "b");
    const mark = wedge(drawing, at("timestamp_1"));
    expect([mark.x, mark.yt, mark.corners]).toEqual([
      lineXs(drawing, "form") + 125,
      y + 1.5,
      unturned(y + 14.5),
    ]);
    // `b` has neither a children band nor a conversion maps band: its line has no length.
    expect(find(drawing, "cross_section", at("timestamp_1", "line"))).toBeUndefined();
  });

  it("extends the reach of a timeline of unknown length", () => {
    const drawing = drawn(
      stamped("unknown_length", [
        {
          id: "timestamp_1",
          timeline: "score",
          coordinate: [20, 1],
          name: "Mark",
          display: ["wedge"],
        },
      ]),
    );
    const coda = element(drawing, at("coda"));
    expect(coda.type === "child" && [coda.xs, coda.xe]).toEqual([253.798828125, 333.798828125]);
    expect(wedge(drawing, at("timestamp_1")).x).toBe(453.798828125);
  });
});

describe("a cross-section line in a band order of its own", () => {
  // Built through commands: the maps above `r`'s line, the children band below it, then markers.
  const manifest = build(
    "r",
    8,
    child("r", "c", 2, 4),
    linearMap("r", "m"),
    set("r", {
      order: bandOrder(["conversion_maps"], ["children", "markers", "regions", "flow_control"]),
    }),
    { type: "add", into: target("r"), timestamp: { name: "Here", coordinate: [3, 1] } },
  );
  const drawing = drawn(manifest);

  it("spans both bands across the line and stops short of the markers band", () => {
    expect([lineY(drawing, "r"), lineY(drawing, "c")]).toEqual([22.5, 36.5]);
    const crossing = line(drawing, "timestamp_3");
    expect([crossing.x, crossing.y1, crossing.y2]).toEqual([lineXs(drawing, "r") + 150, 16, 43.5]);
    const mark = wedge(drawing, at("timestamp_3"));
    expect([mark.yt, mark.corners]).toEqual([49, unturned(62)]);
  });

  it("gives the same extent at any position, and the lines it crosses", () => {
    const key = keyOf({ item: "r" }, "r");
    expect(crossSection(drawing, key, 100)).toMatchObject({ x: 100, y1: 16, y2: 43.5 });
    expect(crossedLines(drawing, key)).toEqual([key, keyOf({ item: "r" }, "c")]);
  });
});

describe("the lines a cross-section line crosses", () => {
  it("lists its own line first, then its displayed descendants' in traversal order", () => {
    const piece = { item: "piece" };
    expect(crossedLines(drawn(loadFile("contiguous")), keyOf(piece, "piece"))).toEqual(
      ["piece", "a", "c", "b"].map((id) => keyOf(piece, id)),
    );
    const nested = drawn(loadFile("nested"));
    expect(crossedLines(nested, keyOf(CLT_1, "clt_1"))).toEqual(
      ["clt_1", "clt_3", "clt_2"].map((id) => keyOf(CLT_1, id)),
    );
    expect(crossedLines(nested, keyOf(CLT_1, "clt_3"))).toEqual(
      ["clt_3", "clt_2"].map((id) => keyOf(CLT_1, id)),
    );
  });

  it("names no segment without a line, which lies on its segment line's axis", () => {
    const form = { item: "form" };
    const drawing = drawn(loadFile("segment_line"));
    expect(crossedLines(drawing, keyOf(form, "form"))).toEqual(
      ["form", "a", "b", "c"].map((id) => keyOf(form, id)),
    );
    expect(crossedLines(drawing, keyOf(form, "b"))).toEqual([keyOf(form, "b")]);
  });

  it("leaves out a hidden child and names none on an ancestor line or no line", () => {
    const hidden = drawn(stamped("timestamps", STAMPS, [hide({ id: "clt_2" })]));
    expect(crossedLines(hidden, keyOf(CLT_1, "clt_1"))).toEqual([keyOf(CLT_1, "clt_1")]);
    const member = drawn(loadFile("groups/group_child_member"));
    const ancestor = member.axes.find((axis) => sameAddress(axis.address, at("piece")));
    if (ancestor === undefined) throw new Error("no ancestor line");
    const key = placeKeyText(ancestor.card) + addressKey(ancestor.address);
    expect(crossedLines(member, key)).toEqual([]);
    expect(crossedLines(member, keyOf(CLT_1, "nothing"))).toEqual([]);
  });
});

describe("the marks at any position", () => {
  const drawing = drawn(loadFile("timestamps"));

  /** The drawn wedge of the timestamp `id` and its cross-section line, null where none is drawn. */
  const drawnMarks = (from: Drawing, id: string) => {
    const crossing = find(from, "cross_section", at(id, "line"));
    const mark = wedge(from, at(id));
    return {
      line:
        crossing?.type === "cross_section"
          ? { x: crossing.x, y1: crossing.y1, y2: crossing.y2, style: crossing.style }
          : null,
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
    expect(crossSection(drawing, keyOf(CLT_1, "clt_2"), 199.91552734375)).toBe(null);
  });

  it("are never styled by a rule naming addresses", () => {
    const hidden = drawn(stamped("timestamps", STAMPS, [hide(at("timestamp_1", "line"))]));
    expect(find(hidden, "cross_section", at("timestamp_1", "line"))).toBeUndefined();
    const unnamed = crossSection(hidden, keyOf(CLT_1, "clt_1"), 124.91552734375);
    expect(unnamed && [unnamed.x, unnamed.y1, unnamed.y2]).toEqual([
      124.91552734375, 16, 77.9296875,
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
      const x = wedge(scaled, at(id)).x;
      expect(marksAt(scaled, keyOf(CLT_1, timeline), x)).toEqual(expected);
    }
    expect(crossSection(scaled, keyOf(CLT_1, "clt_1"), 0)?.style).toMatchObject({
      "stroke-width": 2,
      "stroke-dasharray": "6 6",
    });
  });

  it("lie where an absent markers band would start, across the bands present", () => {
    const nested = drawn(loadFile("nested"));
    expect(marksAt(nested, keyOf(CLT_1, "clt_3"), 200)).toMatchObject({
      line: { x: 200, y1: 16, y2: 37 },
      wedge: {
        points: [
          [200, 38.5],
          [197, 51.5],
          [203, 51.5],
        ],
      },
    });
    expect(marksAt(nested, keyOf(CLT_1, "clt_1"), 200)).toMatchObject({
      line: { x: 200, y1: 16, y2: 51 },
      wedge: {
        points: [
          [200, 52.5],
          [197, 65.5],
          [203, 65.5],
        ],
      },
    });
  });

  it("turn with a rule on the line's wedges, never with one naming addresses", () => {
    const manifest = loadFile("nested");
    const layered = (rule: Rule) =>
      draw(
        manifest,
        DEFAULT_PLACEMENT,
        [DEFAULT_LAYER, { rules: [rule] }, manifestLayer(manifest)],
        metrics,
      );
    const within = layered({
      select: { element: "wedge", within: "clt_3" },
      set: { rotation: 90 },
    });
    expect(wedgeAt(within, keyOf(CLT_1, "clt_3"), 200)?.points).toEqual([
      [200, 38.5],
      [213, 37 + (1.5 + 3)],
      [213, 37 + (1.5 - 3)],
    ]);
    expect(wedgeAt(within, keyOf(CLT_1, "clt_3"), 200)?.points).toEqual([
      [200, 38.5],
      [213, 41.5],
      [213, 35.5],
    ]);
    expect(wedgeAt(within, keyOf(CLT_1, "clt_1"), 200)?.points).toEqual([
      [200, 52.5],
      [197, 65.5],
      [203, 65.5],
    ]);
    const addressed = layered({
      select: { element: "wedge", addresses: [at("clt_3")] },
      set: { rotation: 90 },
    });
    expect(wedgeAt(addressed, keyOf(CLT_1, "clt_3"), 200)?.points).toEqual([
      [200, 38.5],
      [197, 51.5],
      [203, 51.5],
    ]);
  });

  it("are an ancestor line's mark alone on it, styled by no rule on its marks", () => {
    const manifest = loadFile("groups/group_child_member");
    const layered = (rules: readonly Rule[]) =>
      draw(
        manifest,
        DEFAULT_PLACEMENT,
        [DEFAULT_LAYER, { rules: [...rules] }, manifestLayer(manifest)],
        metrics,
      );
    const member = layered([]);
    const ancestor = member.axes.find((axis) => sameAddress(axis.address, at("piece")));
    if (ancestor === undefined) throw new Error("no ancestor line");
    const key = placeKeyText(ancestor.card) + addressKey(ancestor.address);
    expect([ancestor.card, ancestor.line, ancestor.marker]).toEqual([
      { item: "group_1", member: "second-half" },
      67.78125,
      null,
    ]);
    const mark = {
      points: [
        [100, 67.78125 - 1.5],
        [97, 67.78125 - 1.5 - 13],
        [103, 67.78125 - 1.5 - 13],
      ],
      style: { fill: "#000000", opacity: 0.35, stroke: "#00CC00", rotation: 0 },
    };
    expect(marksAt(member, key, 100)).toMatchObject({ line: null, wedge: mark });
    expect(mark.points).toEqual([
      [100, 66.28125],
      [97, 53.28125],
      [103, 53.28125],
    ]);
    const restyled = layered([
      {
        select: { element: "wedge", addresses: [at("second-half", "start")] },
        set: { display: "none" },
      },
      {
        select: { element: "wedge", addresses: [at("second-half", "end")] },
        set: { fill: "#FF0000", rotation: 90 },
      },
    ]);
    expect(wedgeAt(restyled, key, 100)).toEqual(wedgeAt(member, key, 100));
    const everyWedge = layered([{ select: { element: "wedge" }, set: { fill: "#123456" } }]);
    expect(wedgeAt(everyWedge, key, 100)).toMatchObject({
      points: mark.points,
      style: { fill: "#123456" },
    });
  });

  it("are an ancestor line's mark in the style of a wedge held by that line", () => {
    const manifest = loadFile("groups/group_parent_both");
    const layered = (rules: readonly Rule[], placement: Placement = DEFAULT_PLACEMENT) =>
      draw(
        manifest,
        placement,
        [DEFAULT_LAYER, { rules: [...rules] }, manifestLayer(manifest)],
        metrics,
      );
    const ancestorOf = (drawing: Drawing) => {
      const found = drawing.axes.find(
        (axis) => sameAddress(axis.address, at("piece")) && axis.ancestor === undefined,
      );
      if (found === undefined) throw new Error("no ancestor line");
      return found;
    };
    const keyIn = (drawing: Drawing, id: string) => {
      const found = drawing.axes.find(
        (axis) => sameAddress(axis.address, at(id)) && axis.ancestor === undefined,
      );
      if (found === undefined) throw new Error(`no line of ${id}`);
      return placeKeyText(found.card) + addressKey(found.address);
    };
    const plain = layered([]);
    const ancestor = ancestorOf(plain);
    const key = keyIn(plain, "piece");
    expect([ancestor.card, ancestor.line, ancestor.marker]).toEqual([
      { item: "group_1", member: "middle" },
      67.78125,
      null,
    ]);
    const style = {
      stroke: "#00CC00",
      "stroke-width": 3,
      "stroke-dasharray": "none",
      fill: "#000000",
      opacity: 0.35,
      "font-size": 9,
      rx: 0,
      shadow: "none",
      display: "inline",
      content: "none",
      "max-width": "none",
      rotation: 0,
    };
    const mark = {
      points: [
        [200, 66.28125],
        [197, 53.28125],
        [203, 53.28125],
      ],
      style,
    };
    expect(wedgeAt(plain, key, 200)).toEqual(mark);
    const start = wedge(plain, at("middle", "start"));
    expect(start.style).toEqual(style);

    const startRecoloured = layered([
      {
        select: { element: "wedge", addresses: [at("middle", "start")] },
        set: { fill: "#FF0000" },
      },
    ]);
    expect(wedge(startRecoloured, at("middle", "start")).style.fill).toBe("#FF0000");
    expect(wedgeAt(startRecoloured, key, 200)).toEqual(mark);

    const ancestorWedges = layered([
      { select: { element: "wedge", inside: "ancestor" }, set: { fill: "#123456", opacity: 1 } },
    ]);
    expect(wedgeAt(ancestorWedges, key, 200)).toEqual({
      ...mark,
      style: { ...style, fill: "#123456", opacity: 1 },
    });
    expect(wedgeAt(ancestorWedges, keyIn(ancestorWedges, "middle"), 200)?.style).toMatchObject({
      fill: "#000000",
      opacity: 1,
    });

    const scaled = layered([], { ...DEFAULT_PLACEMENT, places: { group_1: { scale: 2 } } });
    const y = ancestorOf(scaled).line;
    const x = 300;
    expect(wedgeAt(scaled, keyIn(scaled, "piece"), x)).toEqual({
      points: [
        [x, y - 3],
        [x - 6, y - 3 - 26],
        [x + 6, y - 3 - 26],
      ],
      style: { ...style, "stroke-width": 6, "font-size": 18 },
    });
  });

  it("are none where no line is keyed", () => {
    expect(marksAt(drawing, keyOf(CLT_1, "nothing"), 100)).toEqual({ line: null, wedge: null });
  });
});
