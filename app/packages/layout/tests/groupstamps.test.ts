/**
 * Groupstamps: the line a groupstamp draws across the members of its
 * group's frame; every number is derived in tests/README.md ("Groupstamps").
 */

import type { Manifest } from "@timetoalign/tilie-core";
import { idAddress, partAddress, sameAddress } from "@timetoalign/tilie-core";
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
  manifestLayer,
  type TextElement,
  TextMeasure,
} from "../src/index.ts";
import {
  at,
  child,
  drawFixture,
  edit,
  linearMap,
  loadFile,
  metrics,
  quarters,
  set,
  target,
} from "./support.ts";

const FIXTURE = "groups/group_groupstamp";

/** The fixture without conversion maps, so that no member draws a cross-section extent. */
function plain(...commands: object[]): Manifest {
  const maps = loadFile(FIXTURE).timelines.flatMap((timeline) =>
    timeline.conversion_maps.map((map) => target(map.id)),
  );
  const removed = maps.length === 0 ? [] : [{ type: "remove", targets: maps }];
  return edit(FIXTURE, ...removed, ...commands);
}
const LINE = partAddress(idAddress("timestamp_1"), "line");

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

describe("a groupstamp's line", () => {
  it("spans the members of its frame where its own line is not drawn, behind its label", () => {
    const drawing = drawn();
    const score = axisOf(drawing, "score");
    const performance = axisOf(drawing, "performance");
    expect([score.marker?.crossSection.extent, performance.marker?.crossSection.extent]).toEqual([
      null,
      null,
    ]);
    const middle = score.xStart + (score.xEnd - score.xStart) / 2;
    expect(performance.xStart + (performance.xEnd - performance.xStart) / 2).toBe(middle);
    expect(score.line).toBeLessThan(performance.line);
    const [top, bottom] = labelLine(nameLabel(drawing, "timestamp_1"));
    expect(top).toBe((score.marker?.wedge.yb ?? 0) + 2);
    const style = { stroke: "#1BA1E2", "stroke-width": 1, "stroke-dasharray": "3 3" };
    const [above, below, ...others] = lines(drawing);
    expect(others).toEqual([]);
    expect(above).toMatchObject({
      type: "cross_section",
      x: middle,
      y1: score.line,
      y2: top,
      style,
    });
    expect(below).toMatchObject({
      type: "cross_section",
      x: middle,
      y1: bottom,
      y2: performance.line,
      style,
    });
    expect(drawing.elements.slice(-2)).toEqual([above, below]);
  });

  it("continues the timestamp's own line to the other members", () => {
    const drawing = drawn(plain(linearMap("score", "tempo")));
    const score = axisOf(drawing, "score");
    const performance = axisOf(drawing, "performance");
    const extent = score.marker?.crossSection.extent;
    if (extent === null || extent === undefined) throw new Error("score crosses its maps band");
    const middle = score.xStart + (score.xEnd - score.xStart) / 2;
    const [top, bottom] = labelLine(nameLabel(drawing, "timestamp_1"));
    const pieces: [number, number][] =
      top >= extent.y2
        ? [
            [extent.y2, top],
            [bottom, performance.line],
          ]
        : [[Math.max(extent.y2, bottom), performance.line]];
    const [own, ...group] = lines(drawing);
    expect(own).toMatchObject({ type: "cross_section", x: middle, y1: extent.y1, y2: extent.y2 });
    expect(group).toEqual(pieces.map(([y1, y2]) => ({ ...own, y1, y2 })));
  });

  it("is drawn for a member's descendant, from the frame's top to its other members", () => {
    const motif: object = {
      type: "add",
      into: target("motif"),
      timestamp: { name: "Motif", coordinate: quarters(1), groupstamp: true },
    };
    const drawing = drawn(plain(child("score", "motif", 2, 4), motif));
    const score = axisOf(drawing, "score");
    const line = axisOf(drawing, "motif");
    const performance = axisOf(drawing, "performance");
    const extent = score.marker?.crossSection.extent;
    if (extent === null || extent === undefined) throw new Error("score crosses its children");
    expect(line.marker?.crossSection.extent).toBe(null);
    const x = score.xStart + (3 / 8) * (score.xEnd - score.xStart);
    expect(line.xStart + (1 / 4) * (line.xEnd - line.xStart)).toBe(x);
    const [top, bottom] = labelLine(nameLabel(drawing, "timestamp_6"));
    const stamp = partAddress(idAddress("timestamp_6"), "line");
    const pieces = drawing.elements.filter((item) => sameAddress(item.address, stamp));
    expect(pieces).toMatchObject([
      { type: "cross_section", x, y1: extent.y1, y2: top },
      { type: "cross_section", x, y1: bottom, y2: performance.line },
    ]);
  });

  it("is none where the timestamp is no groupstamp or its line is not drawn", () => {
    expect(lines(drawn(plain(set("timestamp_1", { groupstamp: false }))))).toEqual([]);
    const unlisted = plain(set("timestamp_1", { display: ["wedge", "name"] }));
    expect(lines(drawn(unlisted))).toEqual([]);
    const hidden: Rule = {
      select: { addresses: [at("timestamp_1", "line")] },
      set: { display: "none" },
    };
    expect(lines(drawn(plain(), [hidden]))).toEqual([]);
  });
});

describe("the lines a position read across its group draws", () => {
  it("span the frame holding the line, less its own extent", () => {
    const drawing = drawn();
    const score = axisOf(drawing, "score");
    const performance = axisOf(drawing, "performance");
    const key = [...lineAxes(drawing)].find(([, axis]) => axis.timeline === "score")?.[0] ?? "";
    const middle = score.xStart + (score.xEnd - score.xStart) / 2;
    expect(groupCrossSections(drawing, key, middle)).toEqual([
      { x: middle, y1: score.line, y2: performance.line, style: score.marker?.crossSection.style },
    ]);
  });

  it("are none on a line held by no frame", () => {
    const drawing = drawFixture("nested");
    const keys = [...lineAxes(drawing).keys()];
    expect(keys.flatMap((key) => groupCrossSections(drawing, key, 100))).toEqual([]);
  });
});
