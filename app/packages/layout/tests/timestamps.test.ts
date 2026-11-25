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
  TextMeasure,
  wedgeAt,
  wedgePoints,
} from "../src/index.ts";
import { wedgeCorners } from "../src/rotation.ts";
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
  SINE_45,
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

/** The pieces of the cross-section line of the timestamp `id`, as `[x, y1, y2]`, in drawing order. */
const pieces = (drawing: Drawing, id: string) =>
  drawing.elements.flatMap((item) =>
    item.type === "cross_section" && sameAddress(item.address, at(id, "line"))
      ? [[item.x, item.y1, item.y2]]
      : [],
  );

const measure = new TextMeasure(metrics);

/** The top and bottom of the card of the ungrouped root `id`. */
function cardOf(drawing: Drawing, id: string): { readonly top: number; readonly bottom: number } {
  const card = element(drawing, at(id, "card"));
  if (card.type !== "card") throw new Error(`no card of ${id}`);
  return { top: card.y, bottom: card.y + card.height };
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
      ["cross_section", at("timestamp_1", "line")],
      ["cross_section", at("timestamp_3", "line")],
      ["cross_section", at("timestamp_3", "line")],
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

  it("crosses the whole card with each line, less the gap of its wedge and its stack", () => {
    // The card runs from 8 to 8 + 104.90625; `clt_1`'s markers band starts at 0 below its line
    // at 77.9296875, `clt_2`'s below its line at 23 (section 6.6): a gap from the wedge's tip,
    // `w / 2` out, to the end of the stack's last line, `w / 2 + 13 + 2 + j × h(9)` out.
    const h = measure.lineHeight(9);
    expect(pieces(drawing, "timestamp_1")).toEqual([
      [124.91552734375, 8, 77.9296875 + 1.5],
      [124.91552734375, 77.9296875 + (1.5 + 13 + 2 + h), 8 + 104.90625],
    ]);
    expect(pieces(drawing, "timestamp_3")).toEqual([
      [199.91552734375, 8, 23 + 1.5],
      [199.91552734375, 23 + (1.5 + 13 + 2 + 3 * h), 8 + 104.90625],
    ]);
    expect(line(drawing, "timestamp_1").style).toMatchObject(DASHED);
    expect(find(drawing, "cross_section", at("timestamp_2", "line"))).toBeUndefined();
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
    expect(typesOf(drawing, "timestamp_3")).toEqual([
      "label",
      "label",
      "label",
      "cross_section",
      "cross_section",
    ]);
    expect(labels(drawing).slice(2)).toEqual([
      [at("timestamp_3", "name"), "Entry", 199.91552734375, 47.85400390625],
      [at("timestamp_3", "id"), "timestamp_3", 199.91552734375, 58.33056640625],
      [at("timestamp_3", "coordinate"), "1 ♩", 199.91552734375, 68.80712890625],
    ]);
    expect(lineY(drawing, "clt_1")).toBe(77.9296875);
  });

  it("hides the wedge and labels a hidden markers band holds and keeps the line", () => {
    const drawing = drawn(stamped("timestamps", STAMPS, [hide({ id: "clt_2", facet: "markers" })]));
    // Its line stays, across the whole card: nothing of it stands on the line to leave a gap.
    const card = element(drawing, at("clt_1", "card"));
    if (card.type !== "card") throw new Error("no card of clt_1");
    expect(pieces(drawing, "timestamp_3")).toEqual([[199.91552734375, 8, 8 + card.height]]);
    expect([lineY(drawing, "clt_1"), lineY(drawing, "clt_2")]).toEqual([37, 23]);
    expect(pieces(drawing, "timestamp_1")).toEqual([
      [124.91552734375, 8, 37 + 1.5],
      [124.91552734375, 37 + (1.5 + 13 + 2 + measure.lineHeight(9)), 8 + card.height],
    ]);
  });

  it("draws nothing of a hidden child's timestamp, and the root's line across the card", () => {
    const drawing = drawn(stamped("timestamps", STAMPS, [hide({ id: "clt_2" })]));
    expect(typesOf(drawing, "timestamp_3")).toEqual([]);
    expect(typesOf(drawing, "timestamp_1")).toEqual([
      "wedge",
      "label",
      "cross_section",
      "cross_section",
    ]);
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
    // Its line crosses `form`'s whole card, its gap from the wedge's tip to its name's end.
    const x = lineXs(drawing, "form") + 125;
    const { top, bottom } = cardOf(drawing, "form");
    expect(pieces(drawing, "timestamp_1")).toEqual([
      [x, top, y + 1.5],
      [x, y + (1.5 + 13 + 2 + measure.lineHeight(9)), bottom],
    ]);
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

  it("crosses the whole card, its gap where its wedge and label lie beyond the children", () => {
    expect([lineY(drawing, "r"), lineY(drawing, "c")]).toEqual([22.5, 36.5]);
    const mark = wedge(drawing, at("timestamp_3"));
    expect([mark.yt, mark.corners]).toEqual([49, unturned(62)]);
    const x = lineXs(drawing, "r") + 150;
    const { top, bottom } = cardOf(drawing, "r");
    expect(pieces(drawing, "timestamp_3")).toEqual([
      [x, top, 49],
      [x, 22.5 + (26.5 + 13 + 2 + measure.lineHeight(9)), bottom],
    ]);
  });

  it("gives the same card at any position, cut by the wedge alone, and the lines it crosses", () => {
    const key = keyOf({ item: "r" }, "r");
    const { top, bottom } = cardOf(drawing, "r");
    expect(crossSection(drawing, key, 100)).toMatchObject([
      { x: 100, y1: top, y2: 49 },
      { x: 100, y1: 62, y2: bottom },
    ]);
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

  /**
   * The drawn wedge of the timestamp `id` and its cross-section line as it would be drawn without
   * labels: its upper piece as drawn, its lower piece from the wedge's base, its gap being the
   * wedge's alone (section 6.6).
   */
  const drawnMarks = (from: Drawing, id: string) => {
    const mark = wedge(from, at(id));
    const drawnPieces = from.elements.flatMap((item) =>
      item.type === "cross_section" && sameAddress(item.address, at(id, "line")) ? [item] : [],
    );
    const [upper, lower] = drawnPieces;
    if (upper === undefined || lower === undefined) throw new Error(`no gap in ${id}'s line`);
    const piece = ({ x, y1, y2, style }: (typeof drawnPieces)[number]) => ({ x, y1, y2, style });
    return {
      line: [piece(upper), { ...piece(lower), y1: mark.corners[0].y }],
      wedge: { points: wedgePoints(mark), style: mark.style },
    };
  };
  const marksAt = (from: Drawing, key: string, x: number) => ({
    line: crossSection(from, key, x),
    wedge: wedgeAt(from, key, x),
  });
  /**
   * The style of an ancestor line's mark under the defaults, property by property as README.md
   * derives it (a wedge held by a logical ancestor line, faded by `{inside: ancestor}`).
   */
  const ANCESTOR_MARK_STYLE = {
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
    "elision-mode": "auto",
    "elision-proportion": "auto",
    "elision-depths": "auto",
    "elision-display": "ellipsis name",
    "label-display": "label",
  };

  it("agree exactly with the named timestamps drawn", () => {
    expect(marksAt(drawing, keyOf(CLT_1, "clt_1"), 124.91552734375)).toEqual(
      drawnMarks(drawing, "timestamp_1"),
    );
    expect(marksAt(drawing, keyOf(CLT_1, "clt_2"), 199.91552734375)).toEqual(
      drawnMarks(drawing, "timestamp_3"),
    );
  });

  it("are never styled by a rule naming addresses", () => {
    const hidden = drawn(stamped("timestamps", STAMPS, [hide(at("timestamp_1", "line"))]));
    expect(find(hidden, "cross_section", at("timestamp_1", "line"))).toBeUndefined();
    const unnamed = crossSection(hidden, keyOf(CLT_1, "clt_1"), 124.91552734375);
    expect(unnamed.map(({ x, y1, y2 }) => [x, y1, y2])).toEqual([
      [124.91552734375, 8, 79.4296875],
      [124.91552734375, 92.4296875, 8 + 104.90625],
    ]);
    expect(unnamed[0]?.style).toMatchObject({ ...DASHED, display: "inline" });
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
    expect(crossSection(scaled, keyOf(CLT_1, "clt_1"), 0)[0]?.style).toMatchObject({
      "stroke-width": 2,
      "stroke-dasharray": "6 6",
    });
  });

  it("lie where an absent markers band would start, across the bands present", () => {
    const nested = drawn(loadFile("nested"));
    const { top, bottom } = cardOf(nested, "clt_1");
    expect(marksAt(nested, keyOf(CLT_1, "clt_3"), 200)).toMatchObject({
      line: [
        { x: 200, y1: top, y2: 38.5 },
        { x: 200, y1: 51.5, y2: bottom },
      ],
      wedge: {
        points: [
          [200, 38.5],
          [197, 51.5],
          [203, 51.5],
        ],
      },
    });
    expect(marksAt(nested, keyOf(CLT_1, "clt_1"), 200)).toMatchObject({
      line: [
        { x: 200, y1: top, y2: 52.5 },
        { x: 200, y1: 65.5, y2: bottom },
      ],
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

  it("are an ancestor line's mark alone on it, styled by no rule naming an address", () => {
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
      85.18359375,
      null,
    ]);
    // `piece`'s line lies below the member's, so its mark points down, away from the member.
    const mark = {
      points: [
        [100, 85.18359375 + 1.5],
        [97, 85.18359375 + (1.5 + 13)],
        [103, 85.18359375 + (1.5 + 13)],
      ],
      style: ANCESTOR_MARK_STYLE,
    };
    expect(marksAt(member, key, 100)).toEqual({ line: [], wedge: mark });
    expect(mark.points).toEqual([
      [100, 86.68359375],
      [97, 99.68359375],
      [103, 99.68359375],
    ]);
    // The member's `origin` and `length`, whose secondary coordinates lie on that line.
    const restyled = layered([
      {
        select: { element: "wedge", addresses: [at("timestamp_3")] },
        set: { display: "none" },
      },
      {
        select: { element: "wedge", addresses: [at("timestamp_4")] },
        set: { fill: "#FF0000", rotation: 90 },
      },
    ]);
    expect(wedgeAt(restyled, key, 100)).toEqual(wedgeAt(member, key, 100));
    const everyWedge = layered([{ select: { element: "wedge" }, set: { fill: "#123456" } }]);
    expect(wedgeAt(everyWedge, key, 100)).toEqual({
      points: mark.points,
      style: { ...ANCESTOR_MARK_STYLE, fill: "#123456" },
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
      85.18359375,
      null,
    ]);
    const mark = {
      points: [
        [200, 86.68359375],
        [197, 99.68359375],
        [203, 99.68359375],
      ],
      style: ANCESTOR_MARK_STYLE,
    };
    expect(wedgeAt(plain, key, 200)).toEqual(mark);
    // No mark of the member's start is drawn on the ancestor line (section 8.3).
    expect(
      plain.elements.filter((item) => sameAddress(item.address, at("middle", "start"))),
    ).toEqual([]);

    // `middle`'s `origin`, whose secondary coordinate lies on that line.
    const startRecoloured = layered([
      {
        select: { element: "wedge", addresses: [at("timestamp_1")] },
        set: { fill: "#FF0000" },
      },
    ]);
    expect(wedgeAt(startRecoloured, key, 200)).toEqual(mark);

    const ancestorWedges = layered([
      { select: { element: "wedge", inside: "ancestor" }, set: { fill: "#123456", opacity: 1 } },
    ]);
    expect(wedgeAt(ancestorWedges, key, 200)).toEqual({
      ...mark,
      style: { ...ANCESTOR_MARK_STYLE, fill: "#123456", opacity: 1 },
    });
    expect(wedgeAt(ancestorWedges, keyIn(ancestorWedges, "middle"), 200)?.style).toEqual({
      ...ANCESTOR_MARK_STYLE,
      opacity: 1,
    });

    const scaled = layered([], { ...DEFAULT_PLACEMENT, places: { group_1: { scale: 2 } } });
    const y = ancestorOf(scaled).line;
    const x = 300;
    expect(wedgeAt(scaled, keyIn(scaled, "piece"), x)).toEqual({
      points: [
        [x, y + 3],
        [x - 6, y + 3 + 26],
        [x + 6, y + 3 + 26],
      ],
      style: { ...ANCESTOR_MARK_STYLE, "stroke-width": 6, "font-size": 18 },
    });
  });

  it("are none where no line is keyed", () => {
    expect(marksAt(drawing, keyOf(CLT_1, "nothing"), 100)).toEqual({ line: [], wedge: null });
  });
});

describe("secondary coordinates, shown by a rule selecting them", () => {
  // `clt_2` spans 2 to 6 on `clt_1`'s axis: `timestamp_3` (1 on `clt_2`) lies at 3 on `clt_1`,
  // `timestamp_2` (6 on `clt_1`) at `clt_2`'s end; `timestamp_1` (3/2) lies on `clt_1` alone.
  const SHOW: Rule = { select: { coordinates: "secondary" }, set: { display: "inline" } };
  const WEDGES: Rule = {
    select: { element: "wedge", coordinates: "secondary" },
    set: { display: "inline" },
  };
  const h = measure.lineHeight(9);
  const a = measure.ascent(9);
  const plain = drawn(stamped("timestamps", STAMPS));
  const shown = drawn(stamped("timestamps", STAMPS, [SHOW]));
  /** The drawings of the wedge `{id}` in `drawing`, as `[x, yt, corners, rotation]`. */
  const wedgesOf = (drawing: Drawing, id: string) =>
    drawing.elements.flatMap((item) =>
      item.type === "wedge" && sameAddress(item.address, at(id))
        ? [[item.x, item.yt, item.corners, item.style.rotation]]
        : [],
    );
  /** The wedge of a secondary coordinate turned −45 on the line at `y`, its tip `1.5` out below. */
  const turned = (x: number, y: number) => [
    x,
    y + 1.5,
    wedgeCorners(-45).map(({ dx, out }) => ({ dx, y: y + (1.5 + out) })),
    -45,
  ];
  /**
   * The labels of a stack of `texts` in tier 1 of a band below the line at `y`, its wedge at `x`
   * turned −45 (section 6.6): `t = 15 + W / 2 × 0.7071 + H / 2 × 0.7071`, centred `t × −0.7071`
   * across, the box's centre `1.5 + t × 0.7071` out, line `i` starting `H / 2` before it plus
   * `i × h(9)`, its baseline `a(9)` beyond.
   */
  const carriedStack = (x: number, y: number, texts: readonly string[]) => {
    const W = Math.max(...texts.map((text) => measure.width(text, 9)));
    const H = texts.length * h;
    const t = 15 + (W / 2) * SINE_45 + (H / 2) * SINE_45;
    const first = 1.5 + t * SINE_45 - H / 2;
    return texts.map((text, index) => [text, x + t * -SINE_45, y + (first + index * h) + a]);
  };

  it("draws a wedge turned −45 and the stack its display lists on each timeline it crosses", () => {
    const [y1, y2] = [lineY(shown, "clt_1"), lineY(shown, "clt_2")];
    expect([y1, y2]).toEqual([77.9296875, 23]);
    // The root's markers band's wedges are drawn first, then the child's (section 7.2).
    expect(wedgesOf(shown, "timestamp_2")).toEqual([
      [349.91552734375, 79.4296875, unturned(92.4296875), 0],
      turned(349.91552734375, 23),
    ]);
    expect(wedgesOf(shown, "timestamp_3")).toEqual([
      turned(199.91552734375, 77.9296875),
      [199.91552734375, 24.5, unturned(37.5), 0],
    ]);
    expect(wedgesOf(shown, "timestamp_1")).toEqual([
      [124.91552734375, 79.4296875, unturned(92.4296875), 0],
    ]);
    const labelsOf = (id: string) =>
      labels(shown).filter(([address]) => (address as ElementAddress).id === id);
    expect(labelsOf("timestamp_2").map(([, text, x, baseline]) => [text, x, baseline])).toEqual([
      ["Climax", 349.91552734375, 102.78369140625],
      ...carriedStack(349.91552734375, 23, ["Climax"]),
    ]);
    expect(labelsOf("timestamp_3").map(([, text, x, baseline]) => [text, x, baseline])).toEqual([
      ...carriedStack(199.91552734375, 77.9296875, ["Entry", "timestamp_3", "3 ♩"]),
      ["Entry", 199.91552734375, 47.85400390625],
      ["timestamp_3", 199.91552734375, 58.33056640625],
      ["1 ♩", 199.91552734375, 68.80712890625],
    ]);
  });

  it("reads a secondary coordinate label on its own timeline's axis", () => {
    const coordinates = shown.elements.flatMap((item) =>
      item.type === "label" && sameAddress(item.address, at("timestamp_3", "coordinate"))
        ? [item.coordinate]
        : [],
    );
    expect(coordinates).toEqual([
      { unit: "quarters", value: Rational.of(3) },
      { unit: "quarters", value: Rational.of(1) },
    ]);
  });

  it("takes room only for what is shown, its stack placed in the band's tiers", () => {
    // Hidden by default, nothing of them is drawn and the card keeps its height; their wedges
    // alone take none either (`w / 2 + 13` is the band's without labels); the three labels of
    // `timestamp_3` on `clt_1` make its band three lines deep, two more than `Downbeat`'s.
    const height = (drawing: Drawing) =>
      cardOf(drawing, "clt_1").bottom - cardOf(drawing, "clt_1").top;
    expect(wedgesOf(plain, "timestamp_3")).toHaveLength(1);
    expect(height(plain)).toBe(104.90625);
    expect(height(drawn(stamped("timestamps", STAMPS, [WEDGES])))).toBe(104.90625);
    expect(height(shown)).toBe(104.90625 + 2 * h);
  });
});
