import { indexBetween } from "@timetoalign/tilie-core";
import { toDescriptors } from "@timetoalign/tilie-writers";
import { describe, expect, it } from "vitest";
import type { BlockNode } from "../src/index.ts";
import { drawingOf, livePlacement, project } from "../src/index.ts";
import { A, B, blockIn, changed, metrics, numbersView, viewOf } from "./support.ts";

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
  const nodes = project(view, selection, [], metrics);

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
    expect(dataA.containsSelection).toBe(false);
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
    expect(dataB.containsSelection).toBe(true);
    expect(dataB.affectedElements).toEqual(new Set(["clt_2", "clt_2/name"]));
    expect(dataA.affectedElements).toEqual(new Set());
    expect(dataB.descriptors).toEqual(toDescriptors(dataB.drawing));
    expect("draggable" in node(nodes, A)).toBe(false);
  });

  it("projects a group block through the same drawing, with root-qualified selections", () => {
    const numbers = numbersView();
    const [only] = project(numbers, new Set([`${A}/score/region_1/label`]), [], metrics);
    expect(only?.data.selectedElements).toEqual(new Set(["score/region_1/label"]));
    expect(only?.data.containsSelection).toBe(true);
    expect(only?.data.affectedElements).toEqual(new Set(["score/region_1"]));
    expect(only?.data.drawing).toBe(drawingOf(blockIn(numbers, A), numbers.settings, metrics));
  });

  it("orders nodes by index and ranks them", () => {
    const lowered = changed(view, {
      type: "set",
      changes: [{ target: B, values: { index: indexBetween(null, blockIn(view, A).index) } }],
    });
    const result = project(lowered, selection, [], metrics);
    expect(result.map((item) => [item.id, item.zIndex])).toEqual([
      [B, 0],
      [A, 1],
    ]);
  });

  it("restores the selected flags Svelte Flow changed", () => {
    const tampered = nodes.map((item) => ({ ...item, selected: item.id !== A }));
    const again = project(view, selection, tampered, metrics);
    expect(node(again, A).selected).toBe(true);
    expect(node(again, B).selected).toBe(false);
    expect(node(again, A)).not.toBe(node(tampered, A));
    expect(node(again, B)).not.toBe(node(tampered, B));
    expect(again.map((item) => [item.id, item.selected])).toEqual(
      again.map((item) => [item.id, selection.has(item.id)]),
    );
  });

  it("returns the identical nodes for an unchanged view", () => {
    const again = project(view, selection, nodes, metrics);
    expect(again).toHaveLength(2);
    for (const [index, item] of again.entries()) expect(item).toBe(nodes[index]);
  });

  it("renews only the moved block's node", () => {
    const moved = changed(view, { type: "set", changes: [{ target: A, values: { x: 48 } }] });
    const again = project(moved, selection, nodes, metrics);
    expect(node(again, A)).not.toBe(node(nodes, A));
    expect(node(again, A).position).toEqual({ x: 48, y: 80 });
    expect(node(again, B)).toBe(node(nodes, B));
  });

  it("renews only the nodes whose selection changed", () => {
    const blockOnly = project(view, new Set([`${B}/clt_3`]), nodes, metrics);
    expect(node(blockOnly, A)).not.toBe(node(nodes, A));
    expect(node(blockOnly, B)).toBe(node(nodes, B));
    const elements = project(view, new Set([A, `${B}/clt_2`]), nodes, metrics);
    expect(node(elements, A)).toBe(node(nodes, A));
    expect(node(elements, B)).not.toBe(node(nodes, B));
  });

  it("drops a position Svelte Flow wrote during an abandoned drag", () => {
    const dragged = nodes.map((item) =>
      item.id === A ? { ...item, position: { x: 61.25, y: 93 } } : item,
    );
    const again = project(view, selection, dragged, metrics);
    expect(node(again, A).position).toEqual({ x: 40, y: 80 });
    expect(node(again, B)).toBe(node(nodes, B));
  });
});

describe("livePlacement", () => {
  const block = blockIn(view, A);
  const stored = { id: A, scale: 1, length: 400, spacing: 1, width: null, height: null };

  it("takes the position from the node", () => {
    expect(livePlacement(block, { x: 104, y: 40 }, {})).toStrictEqual({
      ...stored,
      x: 104,
      y: 40,
    });
  });

  it("takes previewed values over stored ones", () => {
    expect(livePlacement(block, { x: 40, y: 80 }, { width: 478.5771484375 })).toStrictEqual({
      ...stored,
      x: 40,
      y: 80,
      width: 478.5771484375,
    });
    expect(livePlacement(block, { x: 19, y: 80 }, { x: 19, scale: 2 })).toStrictEqual({
      ...stored,
      x: 19,
      y: 80,
      scale: 2,
    });
  });
});
