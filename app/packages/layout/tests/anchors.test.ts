/**
 * The alignment anchors of named MatchStamps: the one geometry `anchorLine`
 * between cross-section segments, and the lines and labels a drawing draws
 * after every item; every number is derived in tests/README.md.
 */

import {
  type Manifest,
  type NamedMatchStamp,
  partAddress,
  sameAddress,
} from "@timetoalign/tilie-core";
import {
  type Address,
  canonicalOrder,
  type Rule,
  validate,
  withFileIds,
} from "@timetoalign/timetoshare";
import { describe, expect, it } from "vitest";
import {
  anchorLine,
  type CrossSectionSegment,
  crossSectionSegment,
  DEFAULT_LAYER,
  DEFAULT_PLACEMENT,
  type Drawing,
  type DrawnElement,
  draw,
  lineAxes,
  manifestLayer,
  TextMeasure,
  timestampSegments,
} from "../src/index.ts";
import { at, loadFile, metrics } from "./support.ts";

/** A match timestamp as `graphical.timestamps` holds it in the complete form. */
interface MatchTimestamp {
  readonly id: string;
  readonly timeline: string;
  readonly coordinate: number | readonly [number, number];
  readonly name?: string;
  readonly display: readonly ("wedge" | "name" | "id" | "coordinate" | "cross_section")[];
}

/**
 * The fixture `name` with the match timestamps `timestamps` added to its own
 * named timestamps, the named MatchStamps `stamps` in place of its own (none) and
 * `rules` appended to its own, in canonical order and validated.
 */
function matched(
  name: string,
  timestamps: readonly MatchTimestamp[],
  stamps: readonly NamedMatchStamp[],
  rules: readonly Rule[] = [],
): Manifest {
  const manifest = loadFile(name);
  const graphical = manifest.graphical ?? {};
  const result: Manifest = canonicalOrder({
    ...manifest,
    graphical: {
      ...graphical,
      rules: [...(graphical.rules ?? []), ...rules],
      timestamps: [
        ...(graphical.timestamps ?? []),
        ...timestamps.map((timestamp) => ({ ...timestamp, matchstamp: true, groupstamp: false })),
      ],
      matchstamps: [...stamps],
    },
  });
  validate(withFileIds(result));
  return result;
}

const hide = (address: Address): Rule => ({
  select: { addresses: [address] },
  set: { display: "none" },
});

const drawn = (manifest: Manifest): Drawing =>
  draw(manifest, DEFAULT_PLACEMENT, [DEFAULT_LAYER, manifestLayer(manifest)], metrics);

/** The geometry and text of the elements of the alignment anchors, in drawing order. */
function anchorsOf(drawing: Drawing): unknown[] {
  return drawing.elements.flatMap((item: DrawnElement): unknown[] => {
    if (item.type === "alignment_anchor") {
      const { address, x1, y1, x2, y2 } = item;
      return [{ address, x1, y1, x2, y2 }];
    }
    if (item.type === "label" && item.address.id?.startsWith("anchor_") === true) {
      const { address, x, baseline, anchor, text } = item;
      return [{ address, x, baseline, anchor, text }];
    }
    return [];
  });
}

const point = (x: number, y: number): CrossSectionSegment => ({ x, y1: y, y2: y });
const span = (x: number, y1: number, y2: number): CrossSectionSegment => ({ x, y1, y2 });
const measure = new TextMeasure(metrics);

/** The top and bottom of every card drawing `timeline`'s line in `drawing`, in drawing order. */
function cards(
  drawing: Drawing,
  timeline: string,
): { readonly top: number; readonly bottom: number }[] {
  return drawing.boxes.flatMap((box) =>
    box.kind === "card" && sameAddress(box.address, { id: timeline, part: ["card"] })
      ? [{ top: box.y, bottom: box.y + box.height }]
      : [],
  );
}

/** The one card drawing `timeline`'s line. */
function card(
  drawing: Drawing,
  timeline: string,
): { readonly top: number; readonly bottom: number } {
  const [only, ...others] = cards(drawing, timeline);
  if (only === undefined || others.length > 0) throw new Error(`not one card of ${timeline}`);
  return only;
}

/** The baseline of a label of size 9 centred on the ordinate `y` (section 8.7). */
const centredOn = (y: number) => y + (measure.ascent(9) - measure.descent(9)) / 2;

describe("anchorLine", () => {
  it("joins overlapping segments horizontally at the middle of their overlap", () => {
    expect(anchorLine([span(1, 0, 10)], [span(5, 4, 20)])).toEqual({ x1: 1, y1: 7, x2: 5, y2: 7 });
    expect(anchorLine([point(2, 5)], [point(6, 5)])).toEqual({ x1: 2, y1: 5, x2: 6, y2: 5 });
  });

  it("joins the lower end of a segment above to the upper end of one below, and back", () => {
    expect(anchorLine([span(0, 0, 2)], [span(3, 5, 9)])).toEqual({ x1: 0, y1: 2, x2: 3, y2: 5 });
    expect(anchorLine([span(0, 10, 12)], [span(3, 1, 4)])).toEqual({
      x1: 0,
      y1: 10,
      x2: 3,
      y2: 4,
    });
  });

  it("takes the shortest of every pair, the first of equal ones", () => {
    expect(anchorLine([point(0, 0), point(0, 100)], [point(10, 90)])).toEqual({
      x1: 0,
      y1: 100,
      x2: 10,
      y2: 90,
    });
    expect(anchorLine([point(0, 0), point(20, 0)], [point(10, 0)])).toEqual({
      x1: 0,
      y1: 0,
      x2: 10,
      y2: 0,
    });
    expect(anchorLine([point(0, 0)], [point(10, 0), point(-10, 0)])).toEqual({
      x1: 0,
      y1: 0,
      x2: 10,
      y2: 0,
    });
  });

  it("returns a line of no length, and none without a segment on either side", () => {
    expect(anchorLine([point(3, 4)], [point(3, 4)])).toEqual({ x1: 3, y1: 4, x2: 3, y2: 4 });
    expect(anchorLine([], [point(3, 4)])).toBe(null);
    expect(anchorLine([point(3, 4)], [])).toBe(null);
  });
});

describe("bundle_matchstamps", () => {
  const manifest = loadFile("bundles/bundle_matchstamps");
  const drawing = drawn(manifest);

  it("draws both lines, then the one label, after every item", () => {
    // `score`'s card lies above `take_1`'s and `take_2`'s: each line runs from the bottom of
    // `score`'s card to the top of the other (section 8.7), the label at its middle.
    const score = card(drawing, "score");
    const [x1, x2] = [261.0927734375, 161.0927734375];
    expect(anchorsOf(drawing)).toEqual([
      { address: { id: "anchor_1" }, x1, y1: score.bottom, x2, y2: card(drawing, "take_1").top },
      { address: { id: "anchor_2" }, x1, y1: score.bottom, x2, y2: card(drawing, "take_2").top },
      {
        address: { id: "anchor_1", part: ["name"] },
        x: (x1 + x2) / 2,
        baseline: centredOn((score.bottom + card(drawing, "take_1").top) / 2),
        anchor: "middle",
        text: "Bar 2, downbeat (take 1)",
      },
    ]);
    expect(drawing.elements.slice(-3).map((item) => item.type)).toEqual([
      "alignment_anchor",
      "alignment_anchor",
      "label",
    ]);
    expect(drawing.boxes[0]?.range).toEqual({ start: 0, end: drawing.elements.length });
    expect([drawing.width, drawing.height]).toEqual([508.71630859375, 202.94140625]);
  });

  it("styles them by the default rule and the label rule", () => {
    const line = drawing.elements.find((item) => item.type === "alignment_anchor");
    const label = drawing.elements.at(-1);
    expect(
      [line, label].map((item) => [
        item?.style.stroke,
        item?.style["stroke-width"],
        item?.style["stroke-dasharray"],
        item?.style.fill,
        item?.style["font-size"],
      ]),
    ).toEqual([
      ["#1BA1E2", 1, "3 3", "#F3F4F6", 9],
      ["#1BA1E2", 1, "3 3", "#000000", 9],
    ]);
  });

  it("draws each line across its card, cut where a name stands, and no name it lacks", () => {
    // `timestamp_3` draws its name below `take_2`'s line, tier 1, the band starting at 0: its gap
    // runs from `w / 2 + 13 + 2` to that plus `h(9)` (section 6.6).
    const take2 = card(drawing, "take_2");
    const line = drawing.axes.find((axis) => axis.address.id === "take_2")?.line ?? 0;
    const out = (distance: number) => take2.top + (line - take2.top + distance);
    const crossings = drawing.elements.flatMap((item) =>
      item.type === "cross_section" ? [[item.address.id, item.x, item.y1, item.y2]] : [],
    );
    expect(crossings).toEqual([
      ["timestamp_1", 261.0927734375, card(drawing, "score").top, card(drawing, "score").bottom],
      ["timestamp_2", 161.0927734375, card(drawing, "take_1").top, card(drawing, "take_1").bottom],
      ["timestamp_3", 161.0927734375, take2.top, out(1.5 + 13 + 2)],
      ["timestamp_3", 161.0927734375, out(1.5 + 13 + 2 + measure.lineHeight(9)), take2.bottom],
    ]);
    expect(
      drawing.elements.filter((item) => sameAddress(item.address, at("timestamp_1", "name"))),
    ).toEqual([]);
  });

  it("gives every match timestamp its card's span as its segment", () => {
    const segment = (x: number, timeline: string) => {
      const { top, bottom } = card(drawing, timeline);
      return span(x, top, bottom);
    };
    expect(
      ["timestamp_1", "timestamp_2", "timestamp_3"].map((id) =>
        timestampSegments(drawing.axes, id),
      ),
    ).toEqual([
      [segment(261.0927734375, "score")],
      [segment(161.0927734375, "take_1")],
      [segment(161.0927734375, "take_2")],
    ]);
    const key = [...lineAxes(drawing).keys()][0] ?? "";
    expect(crossSectionSegment(drawing, key, 100)).toEqual(segment(100, "score"));
    expect(crossSectionSegment(drawing, "no line", 100)).toBe(null);
  });

  it("hides a line and keeps its label in place, or hides the label alone", () => {
    const hidden = (address: Address) => {
      const rules = [...(manifest.graphical?.rules ?? []), hide(address)];
      return anchorsOf(drawn({ ...manifest, graphical: { ...manifest.graphical, rules } }));
    };
    const [first, second, label] = anchorsOf(drawing);
    expect(hidden(at("anchor_1"))).toEqual([second, label]);
    expect(hidden(at("anchor_1", "name"))).toEqual([first, second]);
  });
});

describe("anchors in drawings of their own", () => {
  it("joins two lines of one card horizontally at the card's middle", () => {
    // `nested`: the root's at 8, `clt_2`'s at 1 on its own axis, 13/2 on the root's.
    const nested = (rules: readonly Rule[]) =>
      drawn(
        matched(
          "nested",
          [
            {
              id: "timestamp_9",
              timeline: "clt_1",
              coordinate: [8, 1],
              display: ["cross_section"],
            },
            {
              id: "timestamp_10",
              timeline: "clt_2",
              coordinate: [1, 1],
              display: ["cross_section"],
            },
          ],
          [
            {
              id: "matchstamp_1",
              name: "Eight",
              match_claims: [],
              alignment_anchors: [
                { id: "anchor_1", timestamps: ["timestamp_9", "timestamp_10"], display: ["line"] },
              ],
            },
          ],
          rules,
        ),
      );
    const crossings = (drawing: Drawing) =>
      drawing.elements.flatMap((item) =>
        item.type === "cross_section" ? [[item.address, item.x, item.y1, item.y2]] : [],
      );
    // Both lines cross the one card whole: their segments overlap, and the anchor runs
    // horizontally at the card's middle.
    const drawing = nested([]);
    const { top, bottom } = card(drawing, "clt_1");
    const middle = (top + bottom) / 2;
    const anchor = [
      {
        address: { id: "anchor_1" },
        x1: 249.91552734375,
        y1: middle,
        x2: 212.41552734375,
        y2: middle,
      },
    ];
    expect(crossings(drawing)).toEqual([
      [partAddress({ id: "timestamp_9" }, "line"), 249.91552734375, top, bottom],
      [partAddress({ id: "timestamp_10" }, "line"), 212.41552734375, top, bottom],
    ]);
    expect(anchorsOf(drawing)).toEqual(anchor);
    // A cross-section line that is not displayed keeps its segment.
    const hidden = nested([hide({ id: "timestamp_9", part: ["line"] })]);
    expect(crossings(hidden)).toEqual([
      [partAddress({ id: "timestamp_10" }, "line"), 212.41552734375, top, bottom],
    ]);
    expect(anchorsOf(hidden)).toEqual(anchor);
  });

  it("uses the nearest card of a timeline drawn in several", () => {
    // `bundle_shared_member`: `t` in the frames of `g1` and `g2`.
    const manifest = matched(
      "bundles/bundle_shared_member",
      [
        { id: "timestamp_7", timeline: "t", coordinate: [4, 1], display: ["cross_section"] },
        { id: "timestamp_8", timeline: "u", coordinate: 2.0, display: ["cross_section"] },
        { id: "timestamp_9", timeline: "v", coordinate: 400, display: ["cross_section"] },
      ],
      [
        {
          id: "matchstamp_1",
          name: "Half",
          match_claims: [],
          alignment_anchors: [
            { id: "anchor_1", timestamps: ["timestamp_7", "timestamp_8"], display: ["line"] },
            { id: "anchor_2", timestamps: ["timestamp_9", "timestamp_7"], display: ["line"] },
          ],
        },
      ],
    );
    const drawing = drawn(manifest);
    // `t`'s cards in `g1`'s and `g2`'s frames; `u`'s below the first, `v`'s below the second.
    const [first, second] = cards(drawing, "t");
    if (first === undefined || second === undefined) throw new Error("t is drawn twice");
    const x = 302.29150390625;
    expect(timestampSegments(drawing.axes, "timestamp_7")).toEqual([
      span(x, first.top, first.bottom),
      span(x, second.top, second.bottom),
    ]);
    expect(anchorsOf(drawing)).toEqual([
      { address: { id: "anchor_1" }, x1: x, y1: first.bottom, x2: x, y2: card(drawing, "u").top },
      { address: { id: "anchor_2" }, x1: x, y1: card(drawing, "v").top, x2: x, y2: second.bottom },
    ]);
  });

  it("draws a name alone, and no name label for a match timestamp without a name", () => {
    const manifest = matched(
      "bundles/bundle_shared_member",
      [
        {
          id: "timestamp_7",
          timeline: "t",
          coordinate: [4, 1],
          display: ["name", "cross_section"],
        },
        { id: "timestamp_8", timeline: "u", coordinate: 2.0, display: ["cross_section"] },
      ],
      [
        {
          id: "matchstamp_1",
          name: "Half",
          match_claims: [],
          alignment_anchors: [
            { id: "anchor_1", timestamps: ["timestamp_7", "timestamp_8"], display: ["name"] },
          ],
        },
      ],
    );
    const drawing = drawn(manifest);
    expect(anchorsOf(drawing)).toEqual([
      {
        address: { id: "anchor_1", part: ["name"] },
        x: 302.29150390625,
        baseline: centredOn(((cards(drawing, "t")[0]?.bottom ?? 0) + card(drawing, "u").top) / 2),
        anchor: "middle",
        text: "Half",
      },
    ]);
    expect(
      drawing.elements.filter((item) => sameAddress(item.address, at("timestamp_7", "name"))),
    ).toEqual([]);
  });
});
