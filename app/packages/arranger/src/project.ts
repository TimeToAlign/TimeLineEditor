/** The projection of a workspace view onto Svelte Flow nodes: one node per block. */

import type { Block, Gap, View } from "@timetoalign/tilie-core";
import type { Drawing } from "@timetoalign/tilie-layout";
import type { Descriptor } from "@timetoalign/tilie-writers";
import type { FontMetrics } from "@timetoalign/timeskeleton";
import type { Node } from "@xyflow/svelte";
import { affectedBy, movedByGap } from "./affected.ts";
import { descriptorsOf, drawingOf } from "./drawing.ts";
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
 * One node per block of `view`, in index order. A node's box is the
 * drawing's box times the block's scale, given as `width`, `height` and
 * `measured` so Svelte Flow never measures it, and its `zIndex` is the
 * block's rank among its siblings. With a `preview`, the block holding its
 * segment marks what closing the gap moves. A node of `previous` whose
 * block, drawing, position, rank, selection and marks are unchanged is
 * returned as the same object, so Svelte Flow skips it.
 */
export function project(
  view: View,
  selection: Selection,
  previous: readonly BlockNode[],
  metrics: FontMetrics,
  preview: GapPreview | null = null,
): BlockNode[] {
  const before = new Map(previous.map((node) => [node.id, node]));
  const elements = elementsByBlock(selection);
  const ranks = new Map<string, number>();
  return blocksInOrder(view).map((block) => {
    const siblings = block.parent ?? "";
    const zIndex = ranks.get(siblings) ?? 0;
    ranks.set(siblings, zIndex + 1);
    const drawing = drawingOf(block, view.settings, metrics);
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
      prior.position.x === block.x &&
      prior.position.y === block.y &&
      sameMembers(prior.data.selectedElements, selectedElements) &&
      sameMembers(prior.data.movedElements, movedElements)
    ) {
      return prior;
    }
    const width = drawing.width * block.scale;
    const height = drawing.height * block.scale;
    return {
      id: block.id,
      type: "block",
      position: { x: block.x, y: block.y },
      width,
      height,
      measured: { width, height },
      handles: [],
      selected,
      zIndex,
      data: {
        block,
        drawing,
        descriptors: descriptorsOf(drawing),
        selectedElements,
        affectedElements:
          selectedElements.size === 0 ? NO_ELEMENTS : affectedBy(block.manifest, selectedElements),
        movedElements,
      },
    };
  });
}

/**
 * The placement of `block` as a gesture shows it: the previewed `values`
 * over the stored ones, and `x`, `y` where the canvas has the node.
 */
export function livePlacement(
  block: Block,
  position: { readonly x: number; readonly y: number },
  values: Partial<Block>,
): LivePlacement {
  const shown = { ...block, ...values };
  return {
    id: block.id,
    x: position.x,
    y: position.y,
    scale: shown.scale,
    length: shown.length,
    spacing: shown.spacing,
    width: shown.width,
    height: shown.height,
  };
}
