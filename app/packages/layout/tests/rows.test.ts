/** Rows and the children bands of a row laid out together; every number is derived in tests/README.md. */

import type { Manifest } from "@timetoalign/tilie-core";
import type { Graphical } from "@timetoalign/timetoshare";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_LAYER,
  DEFAULT_PLACEMENT,
  type Drawing,
  draw,
  manifestLayer,
  type RectElement,
  type TextElement,
} from "../src/index.ts";
import {
  BLOCK,
  bandOrder,
  build,
  child,
  drawFixture,
  load,
  metrics,
  quarters,
  set,
} from "./support.ts";

const drawn = (manifest: Manifest, extra: readonly Graphical[] = []): Drawing =>
  draw(manifest, DEFAULT_PLACEMENT, [DEFAULT_LAYER, ...extra, manifestLayer(manifest)], metrics);

/** The ordinate of every drawn line, by address. */
const lines = (drawing: Drawing) =>
  Object.fromEntries(
    drawing.elements.flatMap((item) =>
      item.type === "timeline" || item.type === "child" ? [[item.address, item.y]] : [],
    ),
  );

/** The name texts, top down: address, text and baseline. */
const names = (drawing: Drawing) =>
  drawing.elements
    .filter((item): item is TextElement => item.type === "name")
    .map((item) => [item.address, item.text, item.baseline]);

/** `r` holding `a` at 0 and `b` at 4, each 4 long, and further commands. */
const pair = (...commands: object[]) =>
  build("r", 8, child("r", "a", 0, 4), child("r", "b", 4, 4), ...commands);

describe("joint rows at two depths (joint_rows)", () => {
  const drawing = drawFixture("joint_rows");

  it("lays the children bands of each row's lines out together", () => {
    expect(lines(drawing)).toEqual({
      piece: 81.5,
      b: 67.5,
      d: 67.5,
      b1: 50,
      d1: 50,
      b11: 27.5,
      d11: 27.5,
    });
    const maps = drawing.elements.flatMap((item) =>
      item.type === "map" ? [[item.address, item.yc]] : [],
    );
    expect(maps).toEqual([
      ["piece/ticks_b", 62],
      ["piece/tempo_d1", 44.5],
      ["piece/ticks_d1", 39.5],
      ["piece/tempo_d11", 22],
      ["piece/ticks_d11", 17],
    ]);
  });

  it("draws one name text per row, top down", () => {
    expect(names(drawing)).toEqual([
      ["b11/name", "B11, D11", 31.30810546875],
      ["b1/name", "B1, D1", 53.80810546875],
      ["b/name", "B, D", 71.30810546875],
      ["piece/name", "Piece", 85.30810546875],
    ]);
  });

  it("has the hand-derived figure's height and width", () => {
    const card = drawing.elements.find((item): item is RectElement => item.type === "card");
    expect(card?.height).toBe(108.4765625);
    expect([drawing.width, drawing.height]).toEqual([502.282958984375, 126.4765625]);
  });
});

describe("a row", () => {
  it("takes the room of the children bands on both sides of its lines", () => {
    const below = bandOrder(
      "b",
      ["conversion_maps"],
      ["children", "markers", "regions", "flow_control"],
    );
    const drawing = drawn(
      pair(child("a", "a1", 1, 2), child("b", "b1", 1, 2), set("b", { order: below })),
    );
    expect(lines(drawing)).toEqual({ r: 65, a: 37, a1: 23, b: 37, b1: 51 });
    expect(names(drawing)).toEqual([
      ["a1/name", "a1", 26.80810546875],
      ["a/name", "a, b", 40.80810546875],
      ["b1/name", "b1", 54.80810546875],
      ["r/name", "r", 68.80810546875],
    ]);
    expect(drawing.height).toBe(109.9765625);
  });

  const fewer = (...extra: Graphical[]) =>
    drawn(
      pair(
        child("a", "a1", 0, 2),
        child("a", "a2", 1, 2),
        child("b", "b1", 1, 2),
        {
          type: "add",
          into: `${BLOCK}/b`,
          region: { id: "region_1", name: null, start: quarters(0), end: quarters(4), meta: {} },
        },
        set("b", {
          order: bandOrder(
            "b",
            ["regions", "children", "conversion_maps"],
            ["markers", "flow_control"],
          ),
        }),
      ),
      [
        { statements: [{ select: { ids: ["b/regions_1"] }, set: { display: "inline" } }] },
        ...extra,
      ],
    );
  const brace = (drawing: Drawing) => {
    const found = drawing.elements.find((item) => item.type === "region");
    return found?.type === "region" ? [found.yb, found.ya] : [];
  };

  it("ends a band with fewer rows than its joint layout at its own rows", () => {
    const drawing = fewer();
    expect(lines(drawing)).toEqual({
      r: 73.4765625,
      a: 59.4765625,
      a1: 45.4765625,
      a2: 31.4765625,
      b: 59.4765625,
      b1: 45.4765625,
    });
    expect(brace(drawing)).toEqual([34.4765625, 28.4765625]);
    expect(names(drawing).map(([address, text]) => [address, text])).toEqual([
      ["a2/name", "a2"],
      ["a1/name", "a1, b1"],
      ["a/name", "a, b"],
      ["r/name", "r"],
    ]);
    expect(drawing.height).toBe(118.453125);
  });

  it("gives every row of a joint layout one name size and pitch", () => {
    const drawing = fewer({
      statements: [{ select: { ids: ["a2/name"] }, set: { "font-size": 20 } }],
    });
    expect(lines(drawing)).toEqual({
      r: 83.5625,
      a: 69.5625,
      a1: 50.921875,
      a2: 27.640625,
      b: 69.5625,
      b1: 50.921875,
    });
    expect(drawing.height).toBe(128.5390625);
  });
});

describe("a child's room", () => {
  const manifest = build(
    "r",
    8,
    child("r", "a", 0, 4),
    child("r", "b", 2, 4),
    child("a", "a1", 1, 2),
  );

  it("holds its own children: the next row lies beyond them", () => {
    const drawing = drawn(manifest);
    expect(lines(drawing)).toEqual({ r: 65, a: 51, a1: 37, b: 23 });
    expect(names(drawing)).toEqual([
      ["b/name", "b", 26.80810546875],
      ["a1/name", "a1", 40.80810546875],
      ["a/name", "a", 54.80810546875],
      ["r/name", "r", 68.80810546875],
    ]);
    expect(drawing.height).toBe(109.9765625);
  });

  it("is none for a hidden child, nor for anything its bands hold", () => {
    const drawing = drawn(manifest, [
      { statements: [{ select: { ids: ["a"] }, set: { display: "none" } }] },
    ]);
    expect(lines(drawing)).toEqual({ r: 37, b: 23 });
    expect(names(drawing)).toEqual([
      ["b/name", "b", 26.80810546875],
      ["r/name", "r", 40.80810546875],
    ]);
    expect(drawing.elements.some((item) => item.address?.startsWith("a"))).toBe(false);
    expect(drawing.height).toBe(81.9765625);
  });
});

describe("a joint row mixing segment lines and a child", () => {
  /** A locked quarters segment line placed as a child, with the segments `segments`. */
  const segmentLine = (id: string, offset: number, length: number, segments: object[]) => {
    const [timeline] = load("bare").timelines;
    return {
      ...timeline,
      id,
      name: null,
      offset: quarters(offset),
      length: quarters(length),
      locked: true,
      is_segment_line: true,
      children: segments,
    };
  };
  /** An unnamed quarters segment at 0, `length` long, with no line of its own. */
  const segment = (id: string, length: number) => {
    const [timeline] = load("bare").timelines;
    return { ...timeline, id, name: null, offset: quarters(0), length: quarters(length) };
  };
  const manifest = build("r", 8, child("r", "a", 0, 4), child("a", "a1", 0, 2), {
    type: "add",
    into: `${BLOCK}/r`,
    child: segmentLine("s", 4, 4, [
      segmentLine("s1", 0, 2, [segment("s1a", 2)]),
      segmentLine("s2", 2, 2, [segment("s2a", 2)]),
    ]),
  });
  const nameSize = (address: string): Graphical => ({
    statements: [{ select: { ids: [address] }, set: { "font-size": 20 } }],
  });

  it("counts the child's name and no segment line's", () => {
    const drawing = drawn(manifest);
    expect(lines(drawing)).toEqual({ r: 57, a: 42, a1: 23, s: 42, s1: 23, s2: 23 });
    expect(names(drawing)).toEqual([
      ["a1/name", "a1", 26.80810546875],
      ["a/name", "a, s", 45.80810546875],
      ["r/name", "r", 60.80810546875],
    ]);
    expect(drawing.height).toBe(101.9765625);
    expect(drawn(manifest, [nameSize("s1/name")]).elements).toEqual(drawing.elements);
  });

  it("takes the pitch of the child's name size for every line of the row", () => {
    const drawing = drawn(manifest, [nameSize("a1/name")]);
    expect(lines(drawing)).toEqual({
      r: 66.28125,
      a: 51.28125,
      a1: 27.640625,
      s: 51.28125,
      s1: 27.640625,
      s2: 27.640625,
    });
    expect(drawing.height).toBe(111.2578125);
  });
});
