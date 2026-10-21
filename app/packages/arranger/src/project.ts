/** The projection of a workspace view onto Svelte Flow nodes: one node per block. */

import type { Block, Manifest, View } from "@timetoalign/tilie-core";
import { contains } from "@timetoalign/tilie-core";
import type { Drawing } from "@timetoalign/tilie-layout";
import type { Descriptor } from "@timetoalign/tilie-writers";
import type { FontMetrics } from "@timetoalign/timetoshare";
import type { Node } from "@xyflow/svelte";
import { affectedBy } from "./affected.ts";
import { descriptorsOf, drawingOf, nodePosition } from "./drawing.ts";
import type { Editing } from "./editing.ts";
import { addressParts, sameEditing } from "./editing.ts";
import type { Selection } from "./selection.ts";

/** What a block node renders. */
export type BlockNodeData = {
  readonly block: Block;
  readonly drawing: Drawing;
  readonly descriptors: readonly Descriptor[];
  /** The ids of the block's selected elements. */
  readonly selectedElements: ReadonlySet<string>;
  /** What removing the selected elements would also remove, highlighted with them. */
  readonly affectedElements: ReadonlySet<string>;
  /** The innermost open editor, the same on every node; `null` on the arranger. */
  readonly editing: Editing | null;
  /**
   * The drawn element addresses that lie inside the edited element, the only
   * ones that are hovered and selected: every drawn address on the arranger
   * and in this block's bundle editor, those the edited group or timeline
   * contains in its editor, none in another block while an editor is open.
   */
  readonly inside: ReadonlySet<string>;
};

export type BlockNode = Node<BlockNodeData, "block">;

/**
 * A block's placement as the canvas shows it during a gesture, before
 * anything is stored, and the drawing its node shows then, its items and
 * cards where the gesture puts them.
 */
export type LivePlacement = Pick<
  Block,
  "id" | "x" | "y" | "scale" | "length" | "spacing" | "width" | "height"
> & { readonly drawing: Drawing };

const NO_ELEMENTS: ReadonlySet<string> = new Set();

const insides = new WeakMap<Drawing, Map<string | null, ReadonlySet<string>>>();

/**
 * The element addresses `drawing` draws inside `element`, an element address
 * of `manifest` (core's `contains`), or every address it draws when `element`
 * is `null`, the whole block. Memoized by the drawing and the element, so an
 * unchanged node keeps the identical set.
 */
export function insideOf(
  manifest: Manifest,
  drawing: Drawing,
  element: string | null,
): ReadonlySet<string> {
  let byElement = insides.get(drawing);
  if (byElement === undefined) {
    byElement = new Map();
    insides.set(drawing, byElement);
  }
  let found = byElement.get(element);
  if (found === undefined) {
    const addresses = new Set<string>();
    for (const drawn of drawing.elements) {
      if (drawn.address === null) continue;
      if (element === null || contains(manifest, element, drawn.address)) {
        addresses.add(drawn.address);
      }
    }
    found = addresses;
    byElement.set(element, found);
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

function sameMembers(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  if (left.size !== right.size) return false;
  for (const item of left) if (!right.has(item)) return false;
  return true;
}

/** The selected element addresses of every block holding one (`addressParts`). */
function elementsByBlock(selection: Selection): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>();
  for (const address of selection) {
    const { block, element } = addressParts(address);
    if (element === null) continue;
    let elements = result.get(block);
    if (elements === undefined) {
      elements = new Set();
      result.set(block, elements);
    }
    elements.add(element);
  }
  return result;
}

/**
 * One node per block of `view`, in index order. A node lies at
 * `nodePosition`; its box is the drawing's box times the block's scale,
 * given as `width`, `height` and `measured` so Svelte Flow never measures
 * it, and its `zIndex` is the block's rank among its siblings. With
 * `editing`, the innermost open editor, every node of another block is
 * outside it: not selectable, not draggable and of class `tilie-outside`;
 * the edited block's node is not draggable either, its `inside` naming what
 * the editor edits. A node of `previous` whose block, drawing, position,
 * rank, selection and editor are unchanged is returned as the same object,
 * so Svelte Flow skips it.
 */
export function project(
  view: View,
  selection: Selection,
  previous: readonly BlockNode[],
  metrics: FontMetrics,
  editing: Editing | null,
): BlockNode[] {
  const before = new Map(previous.map((node) => [node.id, node]));
  const elements = elementsByBlock(selection);
  const ranks = new Map<string, number>();
  const edited = editing === null ? null : addressParts(editing.target);
  return blocksInOrder(view).map((block) => {
    const siblings = block.parent ?? "";
    const zIndex = ranks.get(siblings) ?? 0;
    ranks.set(siblings, zIndex + 1);
    const drawing = drawingOf(block, view.settings, metrics);
    const position = nodePosition(block, drawing);
    const outside = edited !== null && edited.block !== block.id;
    const inside = outside
      ? NO_ELEMENTS
      : insideOf(block.manifest, drawing, edited === null ? null : edited.element);
    const selected = selection.has(block.id);
    const selectedElements = elements.get(block.id) ?? NO_ELEMENTS;
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
                outside || edited === null ? null : edited.element,
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
 * drawing placing its origin at `drawing.origin` in its box (`nodePosition`
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
    width: shown.width,
    height: shown.height,
    drawing,
  };
}
