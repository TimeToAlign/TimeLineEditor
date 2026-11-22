/**
 * Groupstamps: the line a groupstamp draws across the members of its
 * group's frame; every number is derived in tests/README.md ("Groupstamps").
 */

import type { Manifest } from "@timetoalign/tilie-core";
import { idAddress, partAddress, sameAddress, samePlaceKey } from "@timetoalign/tilie-core";
import { Rational } from "@timetoalign/tilie-core/numbers";
import { JsonFloat, type Rule } from "@timetoalign/timetoshare";
import { describe, expect, it } from "vitest";
import { FADED_OPACITY } from "../src/defaults.ts";
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
import { wedgeCorners } from "../src/rotation.ts";
import {
  at,
  child,
  drawFixture,
  edit,
  loadFile,
  metrics,
  quarters,
  SINE_45,
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

describe("a groupstamp's secondary coordinates on the frame's other members", () => {
  // `timestamp_1` at 4 of `score`'s 8 quarters lies at the half of every member: on
  // `performance` (4.0 seconds) at 2.0, where the frame's line crosses its card.
  const SHOW: Rule = { select: { coordinates: "secondary" }, set: { display: "inline" } };
  const manifest = plain(
    set("timestamp_1", { display: ["wedge", "name", "coordinate", "cross_section"] }),
  );
  const wedges = (drawing: Drawing) =>
    drawing.elements.filter(
      (item): item is MarkerElement =>
        item.type === "wedge" && sameAddress(item.address, at("timestamp_1")),
    );
  const stampLabels = (drawing: Drawing) =>
    drawing.elements.filter(
      (item): item is TextElement => item.type === "label" && item.address.id === "timestamp_1",
    );
  const height = (drawing: Drawing, member: string) => {
    const { top, bottom } = card(drawing, member);
    return bottom - top;
  };

  it("are not drawn by default and take no room", () => {
    const drawing = drawn(manifest);
    expect(wedges(drawing)).toHaveLength(1);
    expect(stampLabels(drawing).map((label) => label.address.part)).toEqual([
      ["name"],
      ["coordinate"],
    ]);
    // `performance`'s markers band holds its `origin` and `length` labels in one line.
    expect(height(drawing, "performance")).toBe(height(drawn(plain()), "performance"));
  });

  it("draw on the other member at the frame line's x, turned −45, read on that member's axis", () => {
    const drawing = drawn(manifest, [SHOW]);
    const [primary, secondary] = wedges(drawing);
    if (primary === undefined || secondary === undefined) throw new Error("two wedges");
    const score = axisOf(drawing, "score");
    const middle = score.xStart + (score.xEnd - score.xStart) / 2;
    expect([primary.x, primary.style.rotation]).toEqual([middle, 0]);
    expect([secondary.x, secondary.style.rotation]).toEqual([middle, -45]);
    expect(secondary.yt).toBe(out(drawing, "performance", 1.5));
    expect(secondary.corners).toEqual(
      wedgeCorners(-45).map(({ dx, out: o }) => ({ dx, y: out(drawing, "performance", 1.5 + o) })),
    );
    const [, , name, coordinate] = stampLabels(drawing);
    expect([name?.address.part, coordinate?.address.part]).toEqual([["name"], ["coordinate"]]);
    expect(coordinate?.coordinate).toEqual({ unit: "seconds", value: 2 });
    // Its stack of two labels in tier 1 of `performance`'s band, carried by the turned wedge
    // (section 6.6): `t = 15 + W / 2 × 0.7071 + H / 2 × 0.7071`, across `t × −0.7071`, its box's
    // centre `1.5 + t × 0.7071` out, its lines from `H / 2` before it.
    const h = measure.lineHeight(9);
    const W = Math.max(...[name, coordinate].map((label) => measure.width(label?.text ?? "", 9)));
    const H = 2 * h;
    const t = 15 + (W / 2) * SINE_45 + (H / 2) * SINE_45;
    const first = 1.5 + t * SINE_45 - H / 2;
    const origin = card(drawing, "score").top;
    const baseline = (start: number) =>
      origin + (axisOf(drawing, "performance").line - origin + start + measure.ascent(9));
    expect([name?.x, name?.baseline, coordinate?.x, coordinate?.baseline]).toEqual([
      middle + t * -SINE_45,
      baseline(first),
      middle + t * -SINE_45,
      baseline(first + h),
    ]);
    // Shown, the stack takes room: `performance`'s band holds two lines, one more than before.
    expect(height(drawing, "performance")).toBe(height(drawn(manifest), "performance") + h);
    // The frame's line crosses them uncut.
    expect(lines(drawing).at(-1)).toMatchObject({
      x: middle,
      y1: card(drawing, "score").bottom,
      y2: card(drawing, "performance").bottom,
    });
  });

  it("label a secondary coordinate in its timeline's number type", () => {
    // `timestamp_6` at the float 1.0 of `performance`'s 4.0: on `score` (fraction) at 2 quarters.
    const beat = plain({
      type: "add",
      into: target("performance"),
      timestamp: {
        name: "Beat",
        coordinate: new JsonFloat(1),
        display: ["wedge", "coordinate"],
        groupstamp: true,
      },
    });
    const coordinates = drawn(beat, [SHOW]).elements.filter(
      (item): item is TextElement =>
        item.type === "label" &&
        sameAddress(item.address, partAddress(idAddress("timestamp_6"), "coordinate")),
    );
    expect(coordinates.map((label) => [label.text, label.coordinate])).toEqual([
      ["2 ♩", { unit: "quarters", value: Rational.of(2n) }],
      ["1″", { unit: "seconds", value: 1 }],
    ]);
  });
});

describe("a groupstamp where a length of the group is not known", () => {
  const FADED = { ...STYLE, opacity: FADED_OPACITY };
  /** The pieces of the frame's line: every piece of `timestamp_1`'s line but its own two. */
  const framePieces = (drawing: Drawing) => lines(drawing).slice(2);

  it("draws the frame's line faded over the card of a member of unknown length", () => {
    const drawing = drawn(plain(set("performance", { length: null })));
    const score = axisOf(drawing, "score");
    const middle = score.xStart + (score.xEnd - score.xStart) / 2;
    expect(lines(drawing).slice(0, 2)).toEqual(lines(drawn()).slice(0, 2));
    expect(framePieces(drawing)).toEqual([
      {
        type: "cross_section",
        address: LINE,
        style: expect.objectContaining(STYLE),
        x: middle,
        y1: card(drawing, "score").bottom,
        y2: card(drawing, "performance").top,
      },
      {
        type: "cross_section",
        address: LINE,
        style: expect.objectContaining(FADED),
        x: middle,
        y1: card(drawing, "performance").top,
        y2: card(drawing, "performance").bottom,
      },
    ]);
    const [solid, faded] = framePieces(drawing);
    expect(faded?.style).toEqual({ ...solid?.style, opacity: FADED_OPACITY });
    // Both lengths known, the frame's line is one piece at the full opacity.
    expect(framePieces(drawn()).map((piece) => piece.style.opacity)).toEqual([1]);
  });

  it("draws the frame's line faded whole and uncut from a member of unknown length", () => {
    const drawing = drawn(plain(set("score", { length: null })));
    const score = axisOf(drawing, "score");
    const middle = score.xStart + (score.xEnd - score.xStart) / 2;
    expect(lines(drawing).slice(0, 2)).toEqual(lines(drawn()).slice(0, 2));
    expect(framePieces(drawing)).toEqual([
      {
        type: "cross_section",
        address: LINE,
        style: expect.objectContaining(FADED),
        x: middle,
        y1: card(drawing, "score").bottom,
        y2: card(drawing, "performance").bottom,
      },
    ]);
  });

  it("fades a line of a cascaded opacity to the fading opacity, not by it", () => {
    const half: Rule = {
      select: { addresses: [at("timestamp_1", "line")] },
      set: { opacity: 0.5 },
    };
    const drawing = drawn(plain(set("performance", { length: null })), [half]);
    expect(framePieces(drawing).map((piece) => piece.style.opacity)).toEqual([0.5, FADED_OPACITY]);
  });
});

describe("a groupstamp's secondary coordinates where a length of the group is not known", () => {
  const SHOW: Rule = { select: { coordinates: "secondary" }, set: { display: "inline" } };
  const wedgesOf = (drawing: Drawing, id: string) =>
    drawing.elements.filter(
      (item): item is MarkerElement => item.type === "wedge" && sameAddress(item.address, at(id)),
    );
  const labelParts = (drawing: Drawing, id: string) =>
    drawing.elements
      .filter((item) => item.type === "label" && item.address.id === id)
      .map((item) => item.address.part);
  /** `valued`'s wedges with each secondary one's (turned −45) opacity `FADED_OPACITY`. */
  const faded = (valued: readonly MarkerElement[]) =>
    valued.map(({ x, style }) => ({
      x,
      style: style.rotation === -45 ? { ...style, opacity: FADED_OPACITY } : style,
    }));
  const placed = (wedges: readonly MarkerElement[]) => wedges.map(({ x, style }) => ({ x, style }));

  it.each(["performance", "score"])(
    "fade the wedge and draw no coordinate label on the other member (%s unknown)",
    (unknown) => {
      const display = set("timestamp_1", {
        display: ["wedge", "name", "coordinate", "cross_section"],
      });
      const valued = drawn(plain(display), [SHOW]);
      const drawing = drawn(plain(display, set(unknown, { length: null })), [SHOW]);
      expect(placed(wedgesOf(drawing, "timestamp_1"))).toEqual(
        faded(wedgesOf(valued, "timestamp_1")),
      );
      expect(wedgesOf(valued, "timestamp_1").map((wedge) => wedge.style.opacity)).toEqual([1, 1]);
      const [, secondary] = wedgesOf(drawing, "timestamp_1");
      expect(secondary?.yt).toBe(out(drawing, "performance", 1.5));
      expect(labelParts(valued, "timestamp_1")).toEqual([
        ["name"],
        ["coordinate"],
        ["name"],
        ["coordinate"],
      ]);
      expect(labelParts(drawing, "timestamp_1")).toEqual([["name"], ["coordinate"], ["name"]]);
    },
  );

  it("fade the wedges and draw no coordinate label on an ancestor line too", () => {
    const half = {
      type: "add",
      into: target("recording"),
      timestamp: {
        name: "Half",
        coordinate: new JsonFloat(5),
        display: ["wedge", "name", "coordinate"],
        groupstamp: true,
      },
    };
    const fixture = "groups/group_child_member_stamps";
    const valued = drawn(edit(fixture, half), [SHOW]);
    const drawing = drawn(edit(fixture, half, set("recording", { length: null })), [SHOW]);
    const secondaries = (wedges: readonly MarkerElement[]) =>
      wedges.filter((wedge) => wedge.style.rotation === -45).map((wedge) => wedge.style.opacity);
    // On `middle`'s line and on its ancestor line `piece`, faded by the defaults there.
    expect(secondaries(wedgesOf(valued, "timestamp_8"))).toEqual([FADED_OPACITY, 1]);
    expect(placed(wedgesOf(drawing, "timestamp_8"))).toEqual(
      faded(wedgesOf(valued, "timestamp_8")),
    );
    const coordinates = (shown: Drawing) =>
      labelParts(shown, "timestamp_8").filter((part) => part?.[0] === "coordinate").length;
    expect([coordinates(valued), coordinates(drawing)]).toEqual([3, 1]);
  });
});
