import { indexBetween } from "@timetoalign/tilie-core";
import { toDescriptors } from "@timetoalign/tilie-writers";
import { describe, expect, it } from "vitest";
import type { BlockNode, Editing } from "../src/index.ts";
import { drawingOf, livePlacement, nodePosition, project } from "../src/index.ts";
import {
  A,
  B,
  blockIn,
  changed,
  metrics,
  mixedPlain,
  numbersView,
  placed,
  viewOf,
} from "./support.ts";

const view = viewOf(
  { id: A, fixture: "bare", x: 40, y: 80 },
  { id: B, fixture: "nested", scale: 2 },
);

function node(nodes: readonly BlockNode[], id: string): BlockNode {
  const found = nodes.find((item) => item.id === id);
  if (found === undefined) throw new Error(`no node ${id}`);
  return found;
}

describe("project", () => {
  const selection = new Set([A, `${B}/clt_3`]);
  const nodes = project(view, selection, [], metrics, null);

  it("gives every node its exact shape", () => {
    const { data: dataA, ...a } = node(nodes, A);
    expect(a).toStrictEqual({
      id: A,
      type: "block",
      position: { x: 40, y: 80 },
      width: 476.5771484375,
      height: 67.37890625,
      measured: { width: 476.5771484375, height: 67.37890625 },
      handles: [],
      selected: true,
      zIndex: 0,
    });
    expect(dataA.block).toBe(blockIn(view, A));
    expect(dataA.selectedElements).toEqual(new Set());
    const { data: dataB, ...b } = node(nodes, B);
    expect(b).toStrictEqual({
      id: B,
      type: "block",
      position: { x: 0, y: 0 },
      width: 954.38916015625,
      height: 191.953125,
      measured: { width: 954.38916015625, height: 191.953125 },
      handles: [],
      selected: false,
      zIndex: 1,
    });
    expect(dataB.selectedElements).toEqual(new Set(["clt_3"]));
    expect(dataB.affectedElements).toEqual(new Set(["clt_2", "clt_2/name"]));
    expect(dataA.affectedElements).toEqual(new Set());
    expect(dataB.descriptors).toEqual(toDescriptors(dataB.drawing));
    for (const member of ["draggable", "selectable", "class"]) {
      expect(member in node(nodes, A)).toBe(false);
    }
    expect(dataA.editing).toBeNull();
    expect([...dataA.inside]).toEqual([
      "bare/card",
      "bare",
      "bare/start",
      "bare/end",
      "bare/name",
      "bare/start/label",
      "bare/end/label",
    ]);
  });

  it("projects a group block through the same drawing, with root-qualified selections", () => {
    const numbers = numbersView();
    const [only] = project(numbers, new Set([`${A}/score/region_1/label`]), [], metrics, null);
    expect(only?.data.selectedElements).toEqual(new Set(["score/region_1/label"]));
    expect(only?.data.affectedElements).toEqual(new Set(["score/region_1"]));
    expect(only?.data.drawing).toBe(drawingOf(blockIn(numbers, A), numbers.settings, metrics));
  });

  it("orders nodes by index and ranks them", () => {
    const lowered = changed(view, {
      type: "set",
      changes: [{ target: B, values: { index: indexBetween(null, blockIn(view, A).index) } }],
    });
    const result = project(lowered, selection, [], metrics, null);
    expect(result.map((item) => [item.id, item.zIndex])).toEqual([
      [B, 0],
      [A, 1],
    ]);
  });

  it("restores the selected flags Svelte Flow changed", () => {
    const tampered = nodes.map((item) => ({ ...item, selected: item.id !== A }));
    const again = project(view, selection, tampered, metrics, null);
    expect(node(again, A).selected).toBe(true);
    expect(node(again, B).selected).toBe(false);
    expect(node(again, A)).not.toBe(node(tampered, A));
    expect(node(again, B)).not.toBe(node(tampered, B));
    expect(again.map((item) => [item.id, item.selected])).toEqual(
      again.map((item) => [item.id, selection.has(item.id)]),
    );
  });

  it("returns the identical nodes for an unchanged view", () => {
    const again = project(view, selection, nodes, metrics, null);
    expect(again).toHaveLength(2);
    for (const [index, item] of again.entries()) expect(item).toBe(nodes[index]);
  });

  it("renews only the moved block's node", () => {
    const moved = changed(view, { type: "set", changes: [{ target: A, values: { x: 48 } }] });
    const again = project(moved, selection, nodes, metrics, null);
    expect(node(again, A)).not.toBe(node(nodes, A));
    expect(node(again, A).position).toEqual({ x: 48, y: 80 });
    expect(node(again, B)).toBe(node(nodes, B));
  });

  it("renews only the nodes whose selection changed", () => {
    const blockOnly = project(view, new Set([`${B}/clt_3`]), nodes, metrics, null);
    expect(node(blockOnly, A)).not.toBe(node(nodes, A));
    expect(node(blockOnly, B)).toBe(node(nodes, B));
    const elements = project(view, new Set([A, `${B}/clt_2`]), nodes, metrics, null);
    expect(node(elements, A)).toBe(node(nodes, A));
    expect(node(elements, B)).not.toBe(node(nodes, B));
  });

  it("drops a position Svelte Flow wrote during an abandoned drag", () => {
    const dragged = nodes.map((item) =>
      item.id === A ? { ...item, position: { x: 61.25, y: 93 } } : item,
    );
    const again = project(view, selection, dragged, metrics, null);
    expect(node(again, A).position).toEqual({ x: 40, y: 80 });
    expect(node(again, B)).toBe(node(nodes, B));
  });
});

describe("livePlacement", () => {
  const block = blockIn(view, A);
  const drawing = drawingOf(block, view.settings, metrics);
  const stored = { id: A, scale: 1, length: 400, spacing: 1, width: null, height: null, drawing };

  it("takes the position from the node", () => {
    expect(livePlacement(block, { x: 104, y: 40 }, {}, drawing)).toStrictEqual({
      ...stored,
      x: 104,
      y: 40,
    });
  });

  it("takes previewed values over stored ones", () => {
    expect(
      livePlacement(block, { x: 40, y: 80 }, { width: 478.5771484375 }, drawing),
    ).toStrictEqual({
      ...stored,
      x: 40,
      y: 80,
      width: 478.5771484375,
    });
    expect(livePlacement(block, { x: 19, y: 80 }, { x: 19, scale: 2 }, drawing)).toStrictEqual({
      ...stored,
      x: 19,
      y: 80,
      scale: 2,
    });
  });
});

describe("the node of a block placed by its place origin", () => {
  const moved = placed(mixedPlain(), A, "annotations", { x: -30, y: -20 });

  it("lies left of and above the place origin by the origin times the scale", () => {
    const [only] = project(moved, new Set(), [], metrics, null);
    expect(only?.data.drawing.origin).toEqual({ x: 38, y: 48.8046875 });
    expect(only?.position).toEqual({ x: 2, y: 31.1953125 });
    expect([only?.width, only?.height]).toEqual([616.484619140625, 407.30859375]);
    const doubled = changed(moved, { type: "set", changes: [{ target: A, values: { scale: 2 } }] });
    const [large] = project(doubled, new Set(), [], metrics, null);
    expect(large?.position).toEqual({ x: -36, y: -17.609375 });
    expect([large?.width, large?.height]).toEqual([1232.96923828125, 814.6171875]);
    const block = blockIn(doubled, A);
    expect(nodePosition(block, drawingOf(block, doubled.settings, metrics))).toEqual({
      x: -36,
      y: -17.609375,
    });
  });

  it("gives the place origin back from the node's position", () => {
    const block = blockIn(moved, A);
    const drawing = drawingOf(block, moved.settings, metrics);
    expect(livePlacement(block, { x: 2, y: 31.1953125 }, {}, drawing)).toMatchObject({
      x: 40,
      y: 80,
    });
    expect(livePlacement(block, { x: -36, y: -17.609375 }, { scale: 2 }, drawing)).toMatchObject({
      x: 40,
      y: 80,
      scale: 2,
    });
  });
});

describe("the projection under an editor", () => {
  const view = changed(mixedPlain(), {
    type: "add",
    into: "workspace",
    block: {
      id: B,
      manifest: blockIn(viewOf({ id: B, fixture: "bare" }), B).manifest,
      x: 600,
      y: 0,
    },
  });
  const none = new Set<string>();
  const plain = project(view, none, [], metrics, null);

  it("fades every other block and keeps the edited one in place", () => {
    const editing: Editing = { target: A, kind: "bundle" };
    const nodes = project(view, none, [], metrics, editing);
    const a = node(nodes, A);
    expect(a.draggable).toBe(false);
    expect("selectable" in a || "class" in a).toBe(false);
    expect(a.data.editing).toBe(editing);
    expect(a.data.inside).toBe(node(plain, A).data.inside);
    const b = node(nodes, B);
    expect([b.selectable, b.draggable, b.class]).toEqual([false, false, "tilie-outside"]);
    expect(b.data.inside).toEqual(new Set());
  });

  it("holds inside exactly what the edited group or timeline contains", () => {
    const group = project(view, none, [], metrics, { target: `${A}/group_1`, kind: "group" });
    expect([...node(group, A).data.inside]).toEqual([
      "group_1",
      "group_1/name",
      "score/card",
      "score",
      "score/start",
      "score/end",
      "score/name",
      "score/start/label",
      "score/end/label",
      "performance/card",
      "performance",
      "performance/start",
      "performance/end",
      "performance/name",
      "performance/start/label",
      "performance/end/label",
    ]);
    const editing: Editing = { target: `${A}/annotations`, kind: "timeline" };
    const timeline = project(view, none, [], metrics, editing);
    expect([...node(timeline, A).data.inside]).toEqual([
      "annotations/card",
      "annotations",
      "annotations/start",
      "annotations/end",
      "annotations/name",
      "annotations/start/label",
      "annotations/end/label",
    ]);
    expect(node(timeline, A).draggable).toBe(false);
  });

  it("reuses the nodes under an equal editor and renews them under another", () => {
    const first = project(view, none, [], metrics, { target: A, kind: "bundle" });
    const again = project(view, none, first, metrics, { target: A, kind: "bundle" });
    for (const [index, item] of again.entries()) expect(item).toBe(first[index]);
    const group = project(view, none, first, metrics, { target: `${A}/group_1`, kind: "group" });
    const closed = project(view, none, first, metrics, null);
    for (const [index, item] of first.entries()) {
      expect(group[index]).not.toBe(item);
      expect(closed[index]).not.toBe(item);
    }
  });
});
