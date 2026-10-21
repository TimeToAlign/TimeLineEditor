import type { Address, ElementAddress, Part } from "@timetoalign/tilie-core";
import {
  addressKey,
  cardAddress,
  idAddress,
  indexBetween,
  WORKSPACE,
} from "@timetoalign/tilie-core";
import { toDescriptors } from "@timetoalign/tilie-writers";
import { describe, expect, it } from "vitest";
import { drawingOf, nodePosition } from "../src/drawing.ts";
import type { Editing } from "../src/editing.ts";
import type { BlockNode } from "../src/project.ts";
import { blocksInOrder, livePlacement, project } from "../src/project.ts";
import { isSelected, NOTHING_SELECTED, selectionOf } from "../src/selection.ts";
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

/** The element address of `id`, with the part words `words` when given. */
const at = (id: string, ...words: Part[]): ElementAddress =>
  words.length === 0 ? idAddress(id) : { id, part: words };

/** The address of the element `id` of block `block`, with the part words `words` when given. */
const of = (block: string, id: string, ...words: Part[]): Address => ({
  block,
  ...at(id, ...words),
});

/** The keys of `addresses`, in order. */
const keysOf = (addresses: readonly ElementAddress[]) => addresses.map(addressKey);

/** `addresses` by their keys, as a node's selected elements hold them. */
const keyed = (...addresses: ElementAddress[]) =>
  new Map(addresses.map((address) => [addressKey(address), address]));

/** The marks of a wedge-ended timeline `id`, in drawing order after its line. */
const wedges = (id: string) => [
  at(id, "start"),
  at(id, "end"),
  at(id, "name"),
  at(id, "start", "label"),
  at(id, "end", "label"),
];

function node(nodes: readonly BlockNode[], id: string): BlockNode {
  const found = nodes.find((item) => item.id === id);
  if (found === undefined) throw new Error(`no node ${id}`);
  return found;
}

describe("project", () => {
  const selection = selectionOf([{ block: A }, of(B, "clt_3")]);
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
    expect(dataA.selectedElements).toEqual(new Map());
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
    expect(dataB.selectedElements).toEqual(keyed(at("clt_3")));
    expect(dataB.affectedElements).toEqual(new Set(keysOf([at("clt_2"), at("clt_2", "name")])));
    expect(dataA.affectedElements).toEqual(new Set());
    expect(dataB.descriptors).toEqual(toDescriptors(dataB.drawing));
    for (const member of ["draggable", "selectable", "class"]) {
      expect(member in node(nodes, A)).toBe(false);
    }
    expect(dataA.editing).toBeNull();
    expect([...dataA.inside]).toEqual(keysOf([cardAddress("bare"), at("bare"), ...wedges("bare")]));
  });

  it("projects a group block through the same drawing, with its elements selected", () => {
    const numbers = numbersView();
    const label = of(A, "region_1", "label");
    const [only] = project(numbers, selectionOf([label]), [], metrics, null);
    expect(only?.data.selectedElements).toEqual(keyed(at("region_1", "label")));
    expect(only?.data.affectedElements).toEqual(new Set(keysOf([at("region_1")])));
    expect(only?.data.drawing).toBe(drawingOf(blockIn(numbers, A), numbers.settings, metrics));
  });

  it("marks nothing a Delete would not take: never the edited element", () => {
    const mixed = mixedPlain();
    const selection = selectionOf([of(A, "group_1", "name")]);
    const group: Editing = { target: of(A, "group_1"), kind: "group" };
    const [free] = project(mixed, selection, [], metrics, null);
    const [edited] = project(mixed, selection, [], metrics, group);
    expect(free?.data.affectedElements).toEqual(new Set(keysOf([at("group_1")])));
    expect(edited?.data.affectedElements).toEqual(new Set());
  });

  it("orders nodes by index and ranks them", () => {
    const lowered = changed(view, {
      type: "set",
      changes: [
        { target: { block: B }, values: { index: indexBetween(null, blockIn(view, A).index) } },
      ],
    });
    const result = project(lowered, selection, [], metrics, null);
    expect(result.map((item) => [item.id, item.zIndex])).toEqual([
      [B, 0],
      [A, 1],
    ]);
    expect(blocksInOrder(lowered).map((block) => block.id)).toEqual([B, A]);
    expect(blocksInOrder(lowered)).toBe(blocksInOrder(lowered));
  });

  it("restores the selected flags Svelte Flow changed", () => {
    const tampered = nodes.map((item) => ({ ...item, selected: item.id !== A }));
    const again = project(view, selection, tampered, metrics, null);
    expect(node(again, A).selected).toBe(true);
    expect(node(again, B).selected).toBe(false);
    expect(node(again, A)).not.toBe(node(tampered, A));
    expect(node(again, B)).not.toBe(node(tampered, B));
    expect(again.map((item) => [item.id, item.selected])).toEqual(
      again.map((item) => [item.id, isSelected(selection, { block: item.id })]),
    );
  });

  it("returns the identical nodes for an unchanged view", () => {
    const again = project(view, selection, nodes, metrics, null);
    expect(again).toHaveLength(2);
    for (const [index, item] of again.entries()) expect(item).toBe(nodes[index]);
  });

  it("renews only the moved block's node", () => {
    const moved = changed(view, {
      type: "set",
      changes: [{ target: { block: A }, values: { x: 48 } }],
    });
    const again = project(moved, selection, nodes, metrics, null);
    expect(node(again, A)).not.toBe(node(nodes, A));
    expect(node(again, A).position).toEqual({ x: 48, y: 80 });
    expect(node(again, B)).toBe(node(nodes, B));
  });

  it("renews only the nodes whose selection changed", () => {
    const blockOnly = project(view, selectionOf([of(B, "clt_3")]), nodes, metrics, null);
    expect(node(blockOnly, A)).not.toBe(node(nodes, A));
    expect(node(blockOnly, B)).toBe(node(nodes, B));
    const elements = project(
      view,
      selectionOf([{ block: A }, of(B, "clt_2")]),
      nodes,
      metrics,
      null,
    );
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
  const stored = { id: A, scale: 1, length: 400, spacing: 8, width: null, height: null, drawing };

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
    const [only] = project(moved, NOTHING_SELECTED, [], metrics, null);
    expect(only?.data.drawing.origin).toEqual({ x: 38, y: 48.8046875 });
    expect(only?.position).toEqual({ x: 2, y: 31.1953125 });
    expect([only?.width, only?.height]).toEqual([616.484619140625, 440.578125]);
    const doubled = changed(moved, {
      type: "set",
      changes: [{ target: { block: A }, values: { scale: 2 } }],
    });
    const [large] = project(doubled, NOTHING_SELECTED, [], metrics, null);
    expect(large?.position).toEqual({ x: -36, y: -17.609375 });
    expect([large?.width, large?.height]).toEqual([1232.96923828125, 881.15625]);
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
    into: WORKSPACE,
    block: {
      id: B,
      manifest: blockIn(viewOf({ id: B, fixture: "bare" }), B).manifest,
      x: 600,
      y: 0,
    },
  });
  const none = NOTHING_SELECTED;
  const plain = project(view, none, [], metrics, null);

  it("fades every other block and keeps the edited one in place", () => {
    const editing: Editing = { target: { block: A }, kind: "bundle" };
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
    const group = project(view, none, [], metrics, { target: of(A, "group_1"), kind: "group" });
    expect([...node(group, A).data.inside]).toEqual(
      keysOf([
        at("group_1"),
        at("group_1", "name"),
        cardAddress("score"),
        at("cmap_1"),
        at("cmap_2"),
        at("jump_from_1"),
        at("score"),
        ...wedges("score"),
        at("jump_from_1", "label"),
        cardAddress("performance"),
        at("cmap_3"),
        at("performance"),
        ...wedges("performance"),
      ]),
    );
    const editing: Editing = { target: of(A, "annotations"), kind: "timeline" };
    const timeline = project(view, none, [], metrics, editing);
    expect([...node(timeline, A).data.inside]).toEqual(
      keysOf([
        cardAddress("annotations"),
        at("region_1"),
        at("region_2"),
        at("annotations"),
        ...wedges("annotations"),
        at("region_1", "label"),
        at("region_2", "label"),
      ]),
    );
    expect(node(timeline, A).draggable).toBe(false);
  });

  it("reuses the nodes under an equal editor and renews them under another", () => {
    const first = project(view, none, [], metrics, { target: { block: A }, kind: "bundle" });
    const again = project(view, none, first, metrics, { target: { block: A }, kind: "bundle" });
    for (const [index, item] of again.entries()) expect(item).toBe(first[index]);
    const group = project(view, none, first, metrics, { target: of(A, "group_1"), kind: "group" });
    const closed = project(view, none, first, metrics, null);
    for (const [index, item] of first.entries()) {
      expect(group[index]).not.toBe(item);
      expect(closed[index]).not.toBe(item);
    }
  });
});
