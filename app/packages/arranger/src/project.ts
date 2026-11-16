/** The projection of a workspace view onto Svelte Flow nodes: one node per block. */

import type { Block, ElementAddress, Manifest, View } from "@timetoalign/tilie-core";
import { addressKey, contains } from "@timetoalign/tilie-core";
import type { Drawing } from "@timetoalign/tilie-layout";
import type { FontMetrics } from "@timetoalign/timetoshare";
import { affectedBy } from "./affected.ts";
import { affordancesOf } from "./coordinates.ts";
import { descriptorsOf, drawingOf, nodePosition } from "./drawing.ts";
import type { Editing } from "./editing.ts";
import { addressParts, sameEditing } from "./editing.ts";
import type { BlockNode, LivePlacement } from "./node.ts";
import { isSelected, type Selection } from "./selection.ts";

const NO_ELEMENTS: ReadonlySet<string> = new Set();

const NOTHING: ReadonlyMap<string, ElementAddress> = new Map();

const insides = new WeakMap<Drawing, Map<string | null, ReadonlySet<string>>>();

/**
 * The keys of the element addresses `drawing` draws inside `element`, the ID
 * of a group or a timeline of `manifest` (core's `contains`), or of every
 * address it draws but the block's background when `element` is `null`, the
 * whole block; a named timestamp that draws nothing counts as drawn where
 * the canvas shows it in its place (`affordancesOf`). Memoized by the
 * drawing and the element, so an unchanged node keeps the identical set.
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
    const shown = [
      ...drawing.elements.flatMap((drawn) => (drawn.type === "block" ? [] : [drawn.address])),
      ...affordancesOf(manifest, drawing).map(({ address }) => address),
    ];
    found = new Set(
      shown
        .filter((address) => element === null || contains(manifest, element, address))
        .map(addressKey),
    );
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
 * `nodePosition`; its size is the drawing's times the block's scale,
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
    const drawing = drawingOf(block, view.graphical, metrics);
    const position = nodePosition(block, drawing);
    const outside = edited !== null && edited.block !== block.id;
    const inside = outside
      ? NO_ELEMENTS
      : insideOf(block.manifest, drawing, edited === null ? null : (edited.element?.id ?? null));
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
