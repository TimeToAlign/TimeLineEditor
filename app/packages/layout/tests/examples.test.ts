/**
 * Examples per component and per cascade level, each manifest built through
 * core's commands and each expected value derived from the specification.
 */

import type { Manifest } from "@timetoalign/tilie-core";
import { JsonFloat, validateGeometry } from "@timetoalign/timeskeleton";
import { describe, expect, it } from "vitest";
import { layout } from "../src/index.ts";
import { build, clt, quarters } from "./support.ts";

type Item = Record<string, unknown>;

function blockOf(manifest: Manifest, graphical: object = {}): Item {
  const block = layout({ ...manifest, graphical } as Manifest);
  validateGeometry({ meta: { schema_version: "0.3.0" }, blocks: [block] });
  return block as unknown as Item;
}

const primitives = (block: Item): Item[] => block.primitives as Item[];
const ofKind = (block: Item, kind: string): Item[] =>
  primitives(block).filter((item) => item.kind === kind);
const byId = (block: Item, id: string): Item | undefined =>
  primitives(block).find((item) => item.id === id);

describe("the frame", () => {
  it("holds Fraction pairs for an int root: plot 6, names 6/4, frame 15/2", () => {
    const block = blockOf(
      build({
        type: "createTimeline",
        id: "t",
        class: "DiscreteLogicalTimeline",
        unit: "ticks",
        number_type: "int",
        length: { unit: "ticks", number_type: "int", value: 6 },
      }),
    );
    expect(block.frame).toEqual({
      length: [15, 2],
      names: { offset: [0, 1], length: [3, 2] },
      plot: { offset: [3, 2], length: [6, 1] },
    });
    expect(byId(block, "t")).toMatchObject({ start: 0, end: 6 });
  });

  it("holds floats, names 1.0, for a float root of length 0.0", () => {
    const block = blockOf(
      build({
        type: "createTimeline",
        id: "t",
        class: "ContinuousPhysicalTimeline",
        unit: "seconds",
        number_type: "float",
        length: { unit: "seconds", number_type: "float", value: new JsonFloat(0) },
      }),
    );
    expect(block.frame).toEqual({
      length: new JsonFloat(1),
      names: { offset: new JsonFloat(0), length: new JsonFloat(1) },
      plot: { offset: new JsonFloat(1), length: new JsonFloat(0) },
    });
    expect(block.placement).toMatchObject({ scalar: new JsonFloat(1), offset: new JsonFloat(0) });
    expect(byId(block, "t")).toMatchObject({ start: new JsonFloat(0), end: new JsonFloat(0) });
  });

  it("uses an exact one-half name column", () => {
    const manifest = build({ type: "createTimeline", ...clt("r", 8, "Root") });
    const block = layout(manifest, [], { nameColumn: { width: [1, 2] } }) as unknown as Item;
    expect(block.frame).toEqual({
      length: [12, 1],
      names: { offset: [0, 1], length: [4, 1] },
      plot: { offset: [4, 1], length: [8, 1] },
    });
  });

  it("uses no name column or name label when hidden", () => {
    const manifest = build({ type: "createTimeline", ...clt("r", 8, "Root") });
    const block = layout(manifest, [], { nameColumn: { visible: false } }) as unknown as Item;
    expect(block.frame).toEqual({
      length: [8, 1],
      names: { offset: [0, 1], length: [0, 1] },
      plot: { offset: [0, 1], length: [8, 1] },
    });
    expect(byId(block, "r/name")).toBeUndefined();
  });
});

describe("mixed number types", () => {
  it("turns a Fraction offset plus a float length into a float end", () => {
    const block = blockOf(
      build(
        { type: "createTimeline", ...clt("r", 4) },
        {
          type: "addChild",
          parent: "r",
          offset: quarters(1, 2),
          child: {
            id: "f",
            class: "ContinuousLogicalTimeline",
            unit: "quarters",
            number_type: "float",
            length: { unit: "quarters", number_type: "float", value: 0.25 },
          },
        },
      ),
    );
    expect(byId(block, "f")).toMatchObject({ start: [1, 2], end: 0.75 });
    expect(byId(block, "f/end/label")).toMatchObject({ text: "0.25 ♩" });
  });

  it("writes a non-integral exact position on an int root as a pair", () => {
    const block = blockOf(
      build(
        {
          type: "createTimeline",
          id: "r",
          class: "ContinuousLogicalTimeline",
          unit: "number",
          number_type: "int",
          length: { unit: "number", number_type: "int", value: 8 },
        },
        {
          type: "addChild",
          parent: "r",
          offset: { unit: "number", number_type: "int", value: 3 },
          child: {
            id: "c",
            class: "ContinuousLogicalTimeline",
            unit: "number",
            number_type: "fraction",
            length: { unit: "number", number_type: "fraction", value: [1, 2] },
          },
        },
      ),
    );
    expect(byId(block, "c")).toMatchObject({ start: 3, end: [7, 2] });
    expect(byId(block, "c/end/label")).toMatchObject({ text: "1/2 number" });
  });
});

describe("break labels", () => {
  const breakManifest = (label: string | null) =>
    build(
      { type: "createTimeline", ...clt("r", 8) },
      {
        type: "addBreak",
        timeline: "r",
        break: {
          coordinate: quarters(4),
          control_type: "fine",
          condition: "always",
          repeat_count: 1,
          label,
          name: null,
          meta: {},
        },
      },
    );

  it("sits at the bottom of the break by default and at the top above", () => {
    expect(byId(blockOf(breakManifest("Fine")), "r/break/0/label")).toEqual({
      kind: "label",
      id: "r/break/0/label",
      timeline: "r",
      at: { space: "root", x: [4, 1], y: [-1, 2] },
      anchor: "north",
      text: "Fine",
      colour: "#000000",
    });
    const above = blockOf(breakManifest("Fine"), {
      styles: [{ select: { element: "break" }, set: { side: "above" } }],
    });
    expect(byId(above, "r/break/0/label")).toMatchObject({
      at: { space: "root", x: [4, 1], y: [1, 2] },
      anchor: "south",
    });
  });

  it("is absent when the break has no label", () => {
    expect(byId(blockOf(breakManifest(null)), "r/break/0/label")).toBeUndefined();
  });
});

describe("rows", () => {
  it("separate two children starting at one point and join one ending where another starts", () => {
    const block = blockOf(
      build(
        { type: "createTimeline", ...clt("r", 8) },
        { type: "addChild", parent: "r", offset: quarters(2), child: clt("y", 0) },
        { type: "addChild", parent: "r", offset: quarters(2), child: clt("z", 0) },
        { type: "addChild", parent: "r", offset: quarters(0), child: clt("c", 2) },
      ),
    );
    expect(ofKind(block, "child").map((item) => [item.id, item.row])).toEqual([
      ["c", 1],
      ["y", 1],
      ["z", 2],
    ]);
  });

  it("nest jumps by span", () => {
    const jump = (from: number, to: number) => ({
      type: "addJump",
      timeline: "r",
      jump: {
        from_coordinate: quarters(from),
        to_coordinate: quarters(to),
        control_type: "repeat_end",
        condition: "always",
        repeat_count: 1,
        target_name: null,
        label: null,
        meta: {},
      },
    });
    const block = blockOf(
      build({ type: "createTimeline", ...clt("r", 8) }, jump(0, 8), jump(2, 4), jump(5, 6)),
    );
    expect(ofKind(block, "jump").map((item) => [item.id, item.row, item.base])).toEqual([
      ["r/jump/2", -1, [-1, 2]],
      ["r/jump/1", -1, [-1, 2]],
      ["r/jump/0", -2, [-1, 2]],
    ]);
    expect(byId(block, "r/jump/0/label")).toMatchObject({
      at: { space: "root", x: [4, 1], y: [-15, 8] },
      anchor: "north",
      text: "repeat_end",
    });
    expect(block.rows).toEqual({ min: -2, max: 0 });
  });
});

describe("the cascade on drawn components", () => {
  const nestedManifest = () =>
    build(
      { type: "createTimeline", ...clt("r", 8, "Root") },
      { type: "addChild", parent: "r", offset: quarters(0), child: clt("a", 8) },
      { type: "addChild", parent: "a", offset: quarters(1), child: clt("b", 2) },
    );

  it("hides the root but keeps row 0", () => {
    const block = blockOf(nestedManifest(), {
      styles: [{ select: { element: "timeline" }, set: { visible: false } }],
    });
    expect(byId(block, "r")).toBeUndefined();
    expect(byId(block, "r/start")).toBeUndefined();
    expect(byId(block, "r/name")).toBeUndefined();
    expect(block.rows).toEqual({ min: 0, max: 2 });
  });

  it("moves the children of a hidden child down to its parent's next row", () => {
    const block = blockOf(nestedManifest(), {
      styles: [{ select: { ids: ["a"] }, set: { visible: false } }],
    });
    expect(ofKind(block, "child").map((item) => [item.id, item.row])).toEqual([["b", 1]]);
    expect(block.rows).toEqual({ min: 0, max: 1 });
  });

  it("ignores a property the selected kind does not read", () => {
    const block = blockOf(nestedManifest(), {
      styles: [{ select: { element: "wedge" }, set: { show_length: true } }],
    });
    expect(primitives(block).filter((item) => String(item.id).endsWith("/length"))).toEqual([]);
  });

  it("applies a container's rules to its subtree only, over the manifest's", () => {
    const block = blockOf(nestedManifest(), {
      styles: [{ select: { element: "child" }, set: { colour: "#000001" } }],
      timelines: { a: [{ select: { domain: "logical" }, set: { colour: "#000002" } }] },
    });
    expect(byId(block, "r")).toMatchObject({ colour: "#00CC00" });
    expect(byId(block, "a")).toMatchObject({ colour: "#000002" });
    expect(byId(block, "b")).toMatchObject({ colour: "#000002" });
    expect(byId(block, "r/start")).toMatchObject({ colour: "#00CC00" });
    expect(byId(block, "b/start")).toMatchObject({ colour: "#000002" });
  });

  it("selects nothing through a container of an unknown timeline", () => {
    const block = blockOf(nestedManifest(), {
      timelines: { ghost: [{ select: {}, set: { visible: false } }] },
    });
    expect(ofKind(block, "child").map((item) => item.id)).toEqual(["a", "b"]);
  });

  it("draws a child on the side a rule gives it, and its child beyond it", () => {
    const block = blockOf(nestedManifest(), {
      styles: [{ select: { element: "child" }, set: { side: "below" } }],
    });
    expect(ofKind(block, "child").map((item) => [item.id, item.row])).toEqual([
      ["a", -1],
      ["b", -2],
    ]);
  });
});
