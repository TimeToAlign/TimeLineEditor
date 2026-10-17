/** The projection of a workspace view onto Svelte Flow nodes: one node per block. */

import type { Block, Gap, Manifest, View } from "@timetoalign/tilie-core";
import { contains } from "@timetoalign/tilie-core";
import type { Drawing } from "@timetoalign/tilie-layout";
import type { Descriptor } from "@timetoalign/tilie-writers";
import type { FontMetrics } from "@timetoalign/timeskeleton";
import type { Node } from "@xyflow/svelte";
import { affectedBy, movedByGap } from "./affected.ts";
import { descriptorsOf, drawingOf } from "./drawing.ts";
import type { Editing } from "./editors.ts";
import { editedElement, sameEditing } from "./editors.ts";
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
  /** What closing the gap of a segment about to be deleted moves or resizes. */
  readonly movedElements: ReadonlySet<string>;
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

/** A segment about to be deleted, `<block>/<id>`, and the way its gap is to be closed. */
export interface GapPreview {
  readonly segment: string;
  readonly gap: Gap;
}

export type BlockNode = Node<BlockNodeData, "block">;

/** A block's placement as the canvas shows it during a gesture, before anything is stored. */
export type LivePlacement = Pick<
  Block,
  "id" | "x" | "y" | "scale" | "length" | "spacing" | "width" | "height"
>;

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

/**
 * Where the node of `block` drawn as `drawing` lies: a block's `x`, `y` are
 * the canvas position of its place origin (`docs/drawing.md` in
 * timeskeleton, section 8.6), which lies at `drawing.origin` in the box, so
 * a box that grows left or up moves nothing it holds.
 */
export function nodePosition(
  block: Pick<Block, "x" | "y" | "scale">,
  drawing: Drawing,
): { x: number; y: number } {
  return {
    x: block.x - drawing.origin.x * block.scale,
    y: block.y - drawing.origin.y * block.scale,
  };
}

/** The blocks of a view by their parent, then their index (ids break ties). */
export function blocksInOrder(view: View): Block[] {
  return Object.values(view.blocks).sort((left, right) => {
    const leftParent = left.parent ?? "";
    const rightParent = right.parent ?? "";
    if (leftParent !== rightParent) return leftParent < rightParent ? -1 : 1;
    if (left.index !== right.index) return left.index < right.index ? -1 : 1;
    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
  });
}

function sameMembers(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  if (left.size !== right.size) return false;
  for (const item of left) if (!right.has(item)) return false;
  return true;
}

/** The selected element ids of every block holding one. */
function elementsByBlock(selection: Selection): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>();
  for (const address of selection) {
    const slash = address.indexOf("/");
    if (slash < 0) continue;
    const block = address.slice(0, slash);
    let elements = result.get(block);
    if (elements === undefined) {
      elements = new Set();
      result.set(block, elements);
    }
    elements.add(address.slice(slash + 1));
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
 * the editor edits. With a `preview`, the block holding its segment marks
 * what closing the gap moves. A node of `previous` whose block, drawing,
 * position, rank, selection, marks and editor are unchanged is returned as
 * the same object, so Svelte Flow skips it.
 */
export function project(
  view: View,
  selection: Selection,
  previous: readonly BlockNode[],
  metrics: FontMetrics,
  editing: Editing | null,
  preview: GapPreview | null = null,
): BlockNode[] {
  const before = new Map(previous.map((node) => [node.id, node]));
  const elements = elementsByBlock(selection);
  const ranks = new Map<string, number>();
  const edited = editing === null ? null : editedElement(editing.target);
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
    const movedElements = preview?.segment.startsWith(`${block.id}/`)
      ? movedByGap(block.manifest, preview.segment.slice(block.id.length + 1), preview.gap)
      : NO_ELEMENTS;
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
      sameMembers(prior.data.movedElements, movedElements) &&
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
          selectedElements.size === 0 ? NO_ELEMENTS : affectedBy(block.manifest, selectedElements),
        movedElements,
        editing,
        inside,
      },
    };
  });
}

/**
 * The placement of `block` as a gesture shows it: the previewed `values`
 * over the stored ones, and `x`, `y` the place origin of the node where the
 * canvas has it, `position`, the drawing as shown placing its origin at
 * `origin` in its box (`nodePosition` inverted).
 */
export function livePlacement(
  block: Block,
  position: { readonly x: number; readonly y: number },
  values: Partial<Block>,
  origin: { readonly x: number; readonly y: number },
): LivePlacement {
  const shown = { ...block, ...values };
  return {
    id: block.id,
    x: position.x + origin.x * shown.scale,
    y: position.y + origin.y * shown.scale,
    scale: shown.scale,
    length: shown.length,
    spacing: shown.spacing,
    width: shown.width,
    height: shown.height,
  };
}
