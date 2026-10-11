/** Jump levels and order, a float axis, and the band order, at exact ordinates. */

import { describe, expect, it } from "vitest";
import {
  DEFAULT_LAYER,
  DEFAULT_PLACEMENT,
  type DrawnElement,
  draw,
  type JumpElement,
  type TextElement,
} from "../src/index.ts";
import { build, drawFixture, load, metrics, quarters } from "./support.ts";

const jump = (from: number, to: number, label: string) => ({
  from_coordinate: quarters(from),
  to_coordinate: quarters(to),
  control_type: "repeat_end",
  condition: "first_n",
  repeat_count: 2,
  target_name: null,
  label,
  meta: {},
});

describe("jump placement order and levels", () => {
  it("places four jumps on three exact levels and emits them in placement order", () => {
    const manifest = build(
      "r",
      16,
      { type: "addJump", timeline: "r", jump: jump(4, 6, "one") },
      { type: "addJump", timeline: "r", jump: jump(8, 10, "two") },
      { type: "addJump", timeline: "r", jump: jump(3, 11, "three") },
      { type: "addJump", timeline: "r", jump: jump(2, 12, "four") },
    );
    const drawing = draw(manifest, DEFAULT_PLACEMENT, [DEFAULT_LAYER], metrics);
    const jumps = drawing.elements.filter((item): item is JumpElement => item.type === "jump");
    expect(jumps.map((item) => item.address)).toEqual([
      "r/jump/2",
      "r/jump/3",
      "r/jump/1",
      "r/jump/0",
    ]);
    expect(jumps.map((item) => item.yf)).toEqual([
      45.37890625, 45.37890625, 45.37890625, 45.37890625,
    ]);
    expect(jumps.map((item) => item.yc)).toEqual([
      45.37890625 + (4 / 3) * 8,
      45.37890625 + (4 / 3) * 8,
      45.37890625 + (4 / 3) * 28.4765625,
      45.37890625 + (4 / 3) * 48.953125,
    ]);
    expect(
      drawing.elements
        .filter((item) => item.type === "label" && item.address.includes("/jump/"))
        .map((item) => item.address),
    ).toEqual(["r/jump/2/label", "r/jump/3/label", "r/jump/1/label", "r/jump/0/label"]);
  });
});

describe("float axis", () => {
  it("uses binary64 proportions and float coordinate text", () => {
    const drawing = drawFixture("continuous_physical");
    const root = drawing.elements.find((item) => item.address === "tl:7");
    const first = drawing.elements.find((item) => item.address === "tl:8");
    const labels = drawing.elements.filter(
      (item): item is TextElement => item.type === "label" && item.address.startsWith("tl:7/"),
    );
    expect(root).toMatchObject({ xs: 59.140625, xe: 459.140625 });
    expect(first).toMatchObject({ xs: 75.140625, xe: 211.140625 });
    expect(labels.map((item) => item.text)).toEqual(["0.0 s", "12.5 s"]);
  });
});

describe("band order", () => {
  it("lays groups outward in the requested order on both sides", () => {
    const normal = drawFixture("map");
    const reversed = drawFixture("map", [], {
      ...DEFAULT_PLACEMENT,
      order: ["flow", "regions", "maps", "children"],
    });
    const ys = (drawing: typeof normal) =>
      Object.fromEntries(
        drawing.elements
          .filter(
            (item): item is Extract<DrawnElement, { type: "child" | "map" }> =>
              item.type === "child" || item.type === "map",
          )
          .map((item) => [item.address, item.y]),
      );
    expect(ys(normal)).toEqual({
      "melody/map/tempo": 27.5,
      "phrase/map/ticks": 14.5,
      phrase: 45,
    });
    expect(ys(reversed)).toEqual({
      "melody/map/tempo": 45.5,
      "phrase/map/ticks": 32.5,
      phrase: 15,
    });
  });

  it("keeps first-fit rows independent of name width and x0", () => {
    const manifest = load("map");
    const narrow = draw(manifest, DEFAULT_PLACEMENT, [DEFAULT_LAYER], metrics);
    const wide = draw(
      manifest,
      DEFAULT_PLACEMENT,
      [
        DEFAULT_LAYER,
        { statements: [{ select: { element: "name" }, set: { content: "a very wide row name" } }] },
      ],
      metrics,
    );
    const rows = (drawing: typeof narrow) =>
      drawing.elements
        .filter(
          (item): item is Extract<DrawnElement, { type: "child" | "map" }> =>
            item.type === "child" || item.type === "map",
        )
        .map((item) => [item.address, item.y]);
    expect(rows(wide)).toEqual(rows(narrow));
  });
});
