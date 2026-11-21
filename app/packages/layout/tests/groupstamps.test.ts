/**
 * Groupstamps: the line a groupstamp draws across the members of its
 * group's frame; every number is derived in tests/README.md ("Groupstamps").
 */

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
  manifestLayer,
} from "../src/index.ts";
import { at, edit, linearMap, metrics, set } from "./support.ts";

const FIXTURE = "groups/group_groupstamp";
const LINE = partAddress(idAddress("timestamp_1"), "line");

function drawn(manifest = edit(FIXTURE), rules: readonly Rule[] = []): Drawing {
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

describe("a groupstamp's line", () => {
  it("spans the members of its frame where its own line is not drawn", () => {
    const drawing = drawn();
    const score = axisOf(drawing, "score");
    const performance = axisOf(drawing, "performance");
    expect([score.marker?.crossSection, performance.marker?.crossSection]).toEqual([null, null]);
    const middle = score.xStart + (score.xEnd - score.xStart) / 2;
    expect(performance.xStart + (performance.xEnd - performance.xStart) / 2).toBe(middle);
    expect(score.line).toBeLessThan(performance.line);
    const [line, ...others] = lines(drawing);
    expect(others).toEqual([]);
    expect(line).toMatchObject({
      type: "cross_section",
      x: middle,
      y1: score.line,
      y2: performance.line,
      style: { stroke: "#1BA1E2", "stroke-width": 1, "stroke-dasharray": "3 3" },
    });
    expect(drawing.elements.at(-1)).toBe(line);
  });

  it("continues the timestamp's own line to the other members", () => {
    const drawing = drawn(edit(FIXTURE, linearMap("score", "tempo")));
    const score = axisOf(drawing, "score");
    const performance = axisOf(drawing, "performance");
    const extent = score.marker?.crossSection;
    if (extent === null || extent === undefined) throw new Error("score crosses its maps band");
    const middle = score.xStart + (score.xEnd - score.xStart) / 2;
    const [own, group, ...others] = lines(drawing);
    expect(others).toEqual([]);
    expect(own).toMatchObject({ type: "cross_section", x: middle, y1: extent.y1, y2: extent.y2 });
    expect(group).toEqual({
      ...own,
      y1: extent.y2,
      y2: performance.line,
    });
  });

  it("is none where the timestamp is no groupstamp or its line is not drawn", () => {
    expect(lines(drawn(edit(FIXTURE, set("timestamp_1", { groupstamp: false }))))).toEqual([]);
    const unlisted = edit(FIXTURE, set("timestamp_1", { display: ["wedge", "name"] }));
    expect(lines(drawn(unlisted))).toEqual([]);
    const hidden: Rule = {
      select: { addresses: [at("timestamp_1", "line")] },
      set: { display: "none" },
    };
    expect(lines(drawn(edit(FIXTURE), [hidden]))).toEqual([]);
  });
});
