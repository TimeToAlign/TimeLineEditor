/**
 * Groupstamps: the line a groupstamp draws across the members of its
 * group's frame; every number is derived in tests/README.md ("Groupstamps").
 */

import type { Manifest } from "@timetoalign/tilie-core";
import { idAddress, partAddress, sameAddress, samePlaceKey } from "@timetoalign/tilie-core";
import type { Rule } from "@timetoalign/timetoshare";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_LAYER,
  DEFAULT_PLACEMENT,
  type Drawing,
  type DrawnAxis,
  type DrawnElement,
  draw,
  groupCrossSections,
  lineAxes,
  type MarkerElement,
  manifestLayer,
  type TextElement,
  TextMeasure,
} from "../src/index.ts";
import {
  at,
  child,
  drawFixture,
  edit,
  loadFile,
  metrics,
  quarters,
  set,
  target,
} from "./support.ts";

const FIXTURE = "groups/group_groupstamp";

/** The fixture without conversion maps. */
function plain(...commands: object[]): Manifest {
  const maps = loadFile(FIXTURE).timelines.flatMap((timeline) =>
    timeline.conversion_maps.map((map) => target(map.id)),
  );
  const removed = maps.length === 0 ? [] : [{ type: "remove", targets: maps }];
  return edit(FIXTURE, ...removed, ...commands);
}
const LINE = partAddress(idAddress("timestamp_1"), "line");
/** The default cross-section style. */
const STYLE = { stroke: "#1BA1E2", "stroke-width": 1, "stroke-dasharray": "3 3" };

function drawn(manifest = plain(), rules: readonly Rule[] = []): Drawing {
  const layer = { rules: [...rules] };
  return draw(
    manifest,
    DEFAULT_PLACEMENT,
    [DEFAULT_LAYER, layer, manifestLayer(manifest)],
    metrics,
  );
}

const lines = (drawing: Drawing): DrawnElement[] =>
  drawing.elements.filter((item) => sameAddress(item.address, LINE));

function axisOf(drawing: Drawing, id: string): DrawnAxis {
  const found = drawing.axes.find((axis) => axis.address.id === id);
  if (found === undefined) throw new Error(`no line of ${id}`);
  return found;
}

/** The ordinate of the first corner of the wedge of `axis`'s marker. */
function wedgeTop(axis: DrawnAxis): number {
  if (axis.marker === null) throw new Error(`no marker on the line of ${axis.address.id}`);
  return axis.marker.wedge.corners[0].y;
}

/** The upper and lower borders of the card of the member `member` in `group_1`'s frame. */
function card(drawing: Drawing, member: string): { readonly top: number; readonly bottom: number } {
  const key = { item: "group_1", member };
  const found = drawing.boxes.find(
    (box) => box.kind === "card" && box.key !== null && samePlaceKey(box.key, key),
  );
  if (found === undefined) throw new Error(`no card of ${member} in group_1's frame`);
  return { top: found.y, bottom: found.y + found.height };
}

/** The label `{id, part: [name]}` of the timestamp `id`, a text element. */
function nameLabel(drawing: Drawing, id: string): TextElement {
  const found = drawing.elements.find((item) => sameAddress(item.address, at(id, "name")));
  if (found?.type !== "label") throw new Error(`no name label of ${id}`);
  return found;
}

/** The top and bottom of the one line of labels whose label is `label`: `b − a(9)`, plus `h(9)`. */
function labelLine(label: TextElement): readonly [number, number] {
  const top = label.baseline - measure.ascent(9);
  return [top, top + measure.lineHeight(9)];
}

const measure = new TextMeasure(metrics);

/**
 * The ordinate `distance` out below the line of `id`, summed whole first and then added to the
 * line's ordinate in item coordinates, the card of `score` at the item's origin (section 8.6).
 */
function out(drawing: Drawing, id: string, distance: number): number {
  const origin = card(drawing, "score").top;
  return origin + (axisOf(drawing, id).line - origin + distance);
}

/** The distance out of the end of a stack of one label in tier 1, its wedge's tip at 1.5. */
const stackEnd = () => 1.5 + 13 + 2 + measure.lineHeight(9);

describe("a groupstamp's line", () => {
  it("crosses its own card but its gap, and the frame's other member cards", () => {
    const drawing = drawn();
    const score = axisOf(drawing, "score");
    const performance = axisOf(drawing, "performance");
    const middle = score.xStart + (score.xEnd - score.xStart) / 2;
    expect(performance.xStart + (performance.xEnd - performance.xStart) / 2).toBe(middle);
    const first = card(drawing, "score");
    const last = card(drawing, "performance");
    const style = STYLE;
    const drawnLines = lines(drawing);
    // Its own line from the card's top to the wedge's tip, and from its label's end to the card's
    // bottom; then, after every item, the frame's line from that card's bottom to the last card's.
    expect(drawnLines).toMatchObject([
      { type: "cross_section", x: middle, y1: first.top, y2: out(drawing, "score", 1.5), style },
      {
        type: "cross_section",
        x: middle,
        y1: out(drawing, "score", stackEnd()),
        y2: first.bottom,
        style,
      },
      { type: "cross_section", x: middle, y1: first.bottom, y2: last.bottom, style },
    ]);
    expect(drawing.elements.at(-1)).toEqual(drawnLines[2]);
  });

  it("is drawn for a member's descendant, across the card it lies in and the frame beyond", () => {
    const motif: object = {
      type: "add",
      into: target("motif"),
      timestamp: { name: "Motif", coordinate: quarters(1), groupstamp: true },
    };
    const drawing = drawn(plain(child("score", "motif", 2, 4), motif));
    const score = axisOf(drawing, "score");
    const line = axisOf(drawing, "motif");
    const x = score.xStart + (3 / 8) * (score.xEnd - score.xStart);
    expect(line.xStart + (1 / 4) * (line.xEnd - line.xStart)).toBe(x);
    const first = card(drawing, "score");
    const last = card(drawing, "performance");
    const stamp = partAddress(idAddress("timestamp_6"), "line");
    const pieces = drawing.elements.filter((item) => sameAddress(item.address, stamp));
    expect(pieces).toMatchObject([
      { address: stamp, style: STYLE, x, y1: first.top, y2: out(drawing, "motif", 1.5) },
      { address: stamp, style: STYLE, x, y1: out(drawing, "motif", stackEnd()), y2: first.bottom },
      { address: stamp, style: STYLE, x, y1: first.bottom, y2: last.bottom },
    ]);
  });

  it("is its own card's line alone where the timestamp is no groupstamp, none where not drawn", () => {
    expect(lines(drawn(plain(set("timestamp_1", { groupstamp: false }))))).toHaveLength(2);
    const unlisted = plain(set("timestamp_1", { display: ["wedge", "name"] }));
    expect(lines(drawn(unlisted))).toEqual([]);
    const hidden: Rule = {
      select: { addresses: [at("timestamp_1", "line")] },
      set: { display: "none" },
    };
    expect(lines(drawn(plain(), [hidden]))).toEqual([]);
  });
});

describe("a groupstamp's wedge", () => {
  /** The drawn wedge at `{id}`, a marker element. */
  function wedgeOf(drawing: Drawing, id: string): MarkerElement {
    const found = drawing.elements.find(
      (item) => item.type === "wedge" && sameAddress(item.address, at(id)),
    );
    if (found?.type !== "wedge") throw new Error(`no wedge of ${id}`);
    return found;
  }
  /** The ordinate `distance` below `score`'s line, summed in item coordinates (section 8.6). */
  function below(drawing: Drawing, distance: number): number {
    const origin = card(drawing, "score").top;
    return origin + (axisOf(drawing, "score").line - origin + distance);
  }
  it("is not turned where no rule sets its rotation: it marks its primary coordinate", () => {
    const drawing = drawn();
    const wedge = wedgeOf(drawing, "timestamp_1");
    const score = axisOf(drawing, "score");
    const middle = score.xStart + (score.xEnd - score.xStart) / 2;
    expect([wedge.x, wedge.yt]).toEqual([middle, score.marker?.wedge.yt]);
    expect(wedge.corners).toEqual([
      { dx: -3, y: below(drawing, 1.5 + 13) },
      { dx: 3, y: below(drawing, 1.5 + 13) },
    ]);
    expect(wedge.style.rotation).toBe(0);
    const [top] = labelLine(nameLabel(drawing, "timestamp_1"));
    expect(top).toBe(wedgeTop(score) + 2);
    for (const id of ["timestamp_2", "timestamp_3", "timestamp_4", "timestamp_5"]) {
      expect(wedgeOf(drawing, id).style.rotation, id).toBe(0);
    }
  });

  it("is unturned by a rule setting 0 or as no groupstamp", () => {
    const unturned = (drawing: Drawing) => [
      { dx: -3, y: below(drawing, 1.5 + 13) },
      { dx: 3, y: below(drawing, 1.5 + 13) },
    ];
    const zero: Rule = { select: { element: "wedge" }, set: { rotation: 0 } };
    const ruled = drawn(plain(), [zero]);
    expect(wedgeOf(ruled, "timestamp_1").corners).toEqual(unturned(ruled));
    const ordinary = drawn(plain(set("timestamp_1", { groupstamp: false })));
    expect(wedgeOf(ordinary, "timestamp_1").corners).toEqual(unturned(ordinary));
  });
});

describe("the lines a position read across its group draws", () => {
  it("span the member cards of the frame holding the line, less its own card", () => {
    const drawing = drawn();
    const score = axisOf(drawing, "score");
    const key = [...lineAxes(drawing)].find(([, axis]) => axis.timeline === "score")?.[0] ?? "";
    const middle = score.xStart + (score.xEnd - score.xStart) / 2;
    expect(groupCrossSections(drawing, key, middle)).toEqual([
      {
        x: middle,
        y1: card(drawing, "score").bottom,
        y2: card(drawing, "performance").bottom,
        style: score.marker?.crossSection.style,
      },
    ]);
  });

  it("are none on a line held by no frame", () => {
    const drawing = drawFixture("nested");
    const keys = [...lineAxes(drawing).keys()];
    expect(keys.flatMap((key) => groupCrossSections(drawing, key, 100))).toEqual([]);
  });
});
