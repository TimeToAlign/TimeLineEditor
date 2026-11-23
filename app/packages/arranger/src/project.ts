/** The projection of a workspace view onto Svelte Flow nodes: one node per block. */

import type { Block, ElementAddress, Manifest, View } from "@timetoalign/tilie-core";
import { addressKey, contains } from "@timetoalign/tilie-core";
import type { Drawing, PackedSize } from "@timetoalign/tilie-layout";
import { packed } from "@timetoalign/tilie-layout";
import type { FontMetrics } from "@timetoalign/timetoshare";
import { affectedBy } from "./affected.ts";
import { raisedRoot } from "./boxes.ts";
import type { Arranged } from "./containers.ts";
import { arrangedOf } from "./containers.ts";
import { affordancesOf } from "./coordinates.ts";
import { descriptorsOf, drawingOf, nodePosition } from "./drawing.ts";
import type { Editing } from "./editing.ts";
import { addressParts, sameEditing } from "./editing.ts";
import type { BlockNode, LivePlacement } from "./node.ts";
import type { PaneSource } from "./pane.ts";
import { isSelected, type Selection } from "./selection.ts";

const NO_ELEMENTS: ReadonlySet<string> = new Set();

const NOTHING: ReadonlyMap<string, ElementAddress> = new Map();

const insides = new WeakMap<Drawing, Map<string | null, Map<string | null, ReadonlySet<string>>>>();

/**
 * The keys of the element addresses `drawing` draws inside `element`, the ID
 * of a group or a timeline of `manifest` (core's `contains`), or of every
 * address it draws but the block's background when `element` is `null`, the
 * whole block; a named timestamp that draws nothing counts as drawn where
 * the canvas shows it in its place (`affordancesOf`, `raised` naming the
 * root whose ancestor cards are raised, `raisedRoot`, else `null`, as the
 * block node draws them). Memoized by the drawing, the element and the
 * root, so an unchanged node keeps the identical set.
 */
export function insideOf(
  manifest: Manifest,
  drawing: Drawing,
  element: string | null,
  raised: string | null = null,
): ReadonlySet<string> {
  let byElement = insides.get(drawing);
  if (byElement === undefined) {
    byElement = new Map();
    insides.set(drawing, byElement);
  }
  let byRoot = byElement.get(element);
  if (byRoot === undefined) {
    byRoot = new Map();
    byElement.set(element, byRoot);
  }
  let found = byRoot.get(raised);
  if (found === undefined) {
    const shown = [
      ...drawing.elements.flatMap((drawn) => (drawn.type === "block" ? [] : [drawn.address])),
      ...affordancesOf(manifest, drawing, raised).map(({ address }) => address),
    ];
    found = new Set(
      shown
        .filter((address) => element === null || contains(manifest, element, address))
        .map(addressKey),
    );
    byRoot.set(raised, found);
  }
  return found;
}

const orders = new WeakMap<View, readonly Block[]>();

/**
 * The blocks of a view by their parent, then their index (ids break ties),
 * memoized by the view: a view is immutable.
 */
export function blocksInOrder(view: View): readonly Block[] {
  let found = orders.get(view);
  if (found === undefined) {
    found = Object.values(view.blocks).sort((left, right) => {
      const leftParent = left.parent ?? "";
      const rightParent = right.parent ?? "";
      if (leftParent !== rightParent) return leftParent < rightParent ? -1 : 1;
      if (left.index !== right.index) return left.index < right.index ? -1 : 1;
      return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
    });
    orders.set(view, found);
  }
  return found;
}

/** The gap, in canvas units, between two blocks of an arranged canvas, and between two rows or columns. */
export const ARRANGEMENT_GAP = 32;

/** A block's node rectangle on the canvas: its top left corner and its size. */
export interface NodeRect extends PackedSize {
  readonly x: number;
  readonly y: number;
}

/**
 * Where the blocks lie on a canvas arranged `arranged` (`arrangedOf` on the
 * arranger), by block id: their nodes, given in index order with their
 * rectangles at their places, packed in that order by layout's `packed`
 * (`docs/drawing.md` in TimeToShare, section 8.6) from `start`, by default
 * the first one's top left corner, `ARRANGEMENT_GAP` apart, in a matrix of
 * `arranged.columns` columns. Each block's stated `x` and `y` are kept and
 * not used; a free canvas uses them again.
 */
export function arrangedPlaces(
  nodes: readonly (NodeRect & { readonly id: string })[],
  arranged: Arranged,
  start: { readonly x: number; readonly y: number } | undefined = nodes[0],
): Map<string, { x: number; y: number }> {
  if (start === undefined) return new Map();
  const offsets = packed(nodes, {
    direction: arranged.direction,
    gap: ARRANGEMENT_GAP,
    start: { x: start.x, y: start.y },
    columns: arranged.columns,
  });
  return new Map(nodes.map((node, index) => [node.id, offsets[index] ?? { x: node.x, y: node.y }]));
}

/**
 * The node rectangles of every block of `view` at their places, in index
 * order: each at `nodePosition`, sized as its drawing times its scale.
 */
function placedRects(
  view: View,
  draw: (block: Block) => Drawing,
): (NodeRect & { readonly id: string })[] {
  return blocksInOrder(view).map((block) => {
    const drawing = draw(block);
    return {
      id: block.id,
      ...nodePosition(block, drawing),
      width: drawing.width * block.scale,
      height: drawing.height * block.scale,
    };
  });
}

/**
 * Where every block of `view` lies on the canvas, by id: packed where the
 * workspace arranges its blocks (`arrangedPlaces`), at `nodePosition`
 * otherwise.
 */
export function blockPlaces(
  view: View,
  metrics: FontMetrics,
  pane?: PaneSource,
): Map<string, { x: number; y: number }> {
  const rects = placedRects(view, (block) =>
    drawingOf(block, view.graphical, metrics, undefined, pane),
  );
  const arranged = arrangedOf(view, null);
  return arranged === null
    ? new Map(rects.map(({ id, x, y }) => [id, { x, y }]))
    : arrangedPlaces(rects, arranged);
}

function sameMembers(
  left: ReadonlyMap<string, ElementAddress>,
  right: ReadonlyMap<string, ElementAddress>,
): boolean {
  if (left.size !== right.size) return false;
  for (const key of left.keys()) if (!right.has(key)) return false;
  return true;
}

/** The selected element addresses of every block holding one (`addressParts`), by their keys. */
function elementsByBlock(selection: Selection): Map<string, Map<string, ElementAddress>> {
  const result = new Map<string, Map<string, ElementAddress>>();
  for (const address of selection.values()) {
    const { block, element } = addressParts(address);
    if (element === null) continue;
    let elements = result.get(block);
    if (elements === undefined) {
      elements = new Map();
      result.set(block, elements);
    }
    elements.set(addressKey(element), element);
  }
  return result;
}

/**
 * One node per block of `view`, in index order. A node lies at
 * `nodePosition`, or where an arranged workspace packs it (`blockPlaces`); its size is the drawing's times the block's scale,
 * given as `width`, `height` and `measured` so Svelte Flow never measures
 * it, and its `zIndex` is the block's rank among its siblings. With
 * `editing`, the innermost open editor, every node of another block is
 * outside it: not selectable, not draggable and of class `tilie-outside`;
 * the edited block's node is not draggable either, its `inside` naming what
 * the editor edits, read with the root the editor raises (`raisedRoot`), so
 * it names what the node draws. A node of `previous` whose block, drawing, position,
 * rank, selection and editor are unchanged is returned as the same object,
 * so Svelte Flow skips it.
 */
export function project(
  view: View,
  selection: Selection,
  previous: readonly BlockNode[],
  metrics: FontMetrics,
  editing: Editing | null,
  pane?: PaneSource,
): BlockNode[] {
  const before = new Map(previous.map((node) => [node.id, node]));
  const elements = elementsByBlock(selection);
  const ranks = new Map<string, number>();
  const edited = editing === null ? null : addressParts(editing.target);
  const places = blockPlaces(view, metrics, pane);
  return blocksInOrder(view).map((block) => {
    const siblings = block.parent ?? "";
    const zIndex = ranks.get(siblings) ?? 0;
    ranks.set(siblings, zIndex + 1);
    const drawing = drawingOf(block, view.graphical, metrics, undefined, pane);
    const position = places.get(block.id) ?? nodePosition(block, drawing);
    const outside = edited !== null && edited.block !== block.id;
    const inside = outside
      ? NO_ELEMENTS
      : insideOf(
          block.manifest,
          drawing,
          edited === null ? null : (edited.element?.id ?? null),
          raisedRoot(block, editing),
        );
    const selected = isSelected(selection, { block: block.id });
    const selectedElements = elements.get(block.id) ?? NOTHING;
    const prior = before.get(block.id);
    if (
      prior !== undefined &&
      prior.data.block === block &&
      prior.data.drawing === drawing &&
      prior.selected === selected &&
      prior.zIndex === zIndex &&
      prior.position.x === position.x &&
      prior.position.y === position.y &&
      sameMembers(prior.data.selectedElements, selectedElements) &&
      sameEditing(prior.data.editing, editing) &&
      prior.data.inside === inside
    ) {
      return prior;
    }
    const width = drawing.width * block.scale;
    const height = drawing.height * block.scale;
    const editorMembers =
      editing === null
        ? {}
        : outside
          ? { selectable: false, draggable: false, class: "tilie-outside" }
          : { draggable: false };
    return {
      id: block.id,
      type: "block",
      position,
      width,
      height,
      measured: { width, height },
      handles: [],
      selected,
      zIndex,
      ...editorMembers,
      data: {
        block,
        drawing,
        descriptors: descriptorsOf(drawing),
        selectedElements,
        affectedElements:
          selectedElements.size === 0
            ? NO_ELEMENTS
            : affectedBy(
                block.manifest,
                selectedElements,
                outside || edited === null ? null : (edited.element?.id ?? null),
              ),
        editing,
        inside,
      },
    };
  });
}

/**
 * The placement of `block` as a gesture shows it: the previewed `values`
 * over the stored ones, `drawing` the drawing its node shows, and `x`, `y`
 * the place origin of the node where the canvas has it, `position`, the
 * drawing placing its origin at `drawing.origin` in the block (`nodePosition`
 * inverted).
 */
export function livePlacement(
  block: Block,
  position: { readonly x: number; readonly y: number },
  values: Partial<Block>,
  drawing: Drawing,
): LivePlacement {
  const shown = { ...block, ...values };
  const { origin } = drawing;
  return {
    id: block.id,
    x: position.x + origin.x * shown.scale,
    y: position.y + origin.y * shown.scale,
    scale: shown.scale,
    length: shown.length,
    spacing: shown.spacing,
    margin: shown.margin,
    width: shown.width,
    height: shown.height,
    drawing,
  };
}
