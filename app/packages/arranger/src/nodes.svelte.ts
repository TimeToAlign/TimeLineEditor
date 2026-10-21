/**
 * The canvas's nodes: the projection of the view (one node per block), and
 * the nodes Svelte Flow shows, the projection with the block under a
 * gesture drawn as the gesture's preview. A preview never projects the
 * view again: only the previewed block's node is replaced.
 */

import type { BlockId, View } from "@timetoalign/tilie-core";
import type { DrawnBox } from "@timetoalign/tilie-layout";
import type { FontMetrics } from "@timetoalign/timetoshare";
import { keyedBox } from "./boxes.ts";
import { descriptorsOf, drawingOf, nodePosition } from "./drawing.ts";
import type { Editing } from "./editing.ts";
import type { Rect } from "./marquee.ts";
import { rectOnCanvas } from "./marquee.ts";
import type { BlockNode, LivePlacement } from "./project.ts";
import { livePlacement, project } from "./project.ts";
import type { Selection } from "./selection.ts";

/** What the projection reads. */
export interface Projected {
  readonly view: View;
  readonly selection: Selection;
  readonly metrics: FontMetrics;
  readonly editing: Editing | null;
}

/** The block a gesture previews, and the view its command gives. */
export interface Preview {
  readonly id: BlockId;
  readonly view: View;
}

/** The node `node` drawn as `view` holds its block: a preview's. */
function drawnAt(node: BlockNode, view: View, metrics: FontMetrics): BlockNode {
  const block = view.blocks[node.id];
  if (block === undefined) return node;
  const drawing = drawingOf(block, view.settings, metrics);
  const width = drawing.width * block.scale;
  const height = drawing.height * block.scale;
  return {
    ...node,
    position: nodePosition(block, drawing),
    width,
    height,
    measured: { width, height },
    data: { ...node.data, block, drawing, descriptors: descriptorsOf(drawing) },
  };
}

/** The nodes of a canvas, read from `input` whenever it changes. */
export class CanvasNodes {
  /** The last projection: `project` reuses the nodes of unchanged blocks. */
  #previous: BlockNode[] = [];
  readonly #input: () => Projected;

  /** The block a gesture previews; shown, never stored, until the gesture ends. */
  preview: Preview | null = $state.raw(null);
  /**
   * Bumped to show the projection again although nothing it reads changed:
   * after Svelte Flow has set its nodes' `selected` flags itself.
   */
  resync = $state(0);

  /** One node per block of the view: re-run when the view, the selection or the editor changes. */
  readonly projected: readonly BlockNode[] = $derived.by(() => {
    const { view, selection, metrics, editing } = this.#input();
    this.#previous = project(view, selection, this.#previous, metrics, editing);
    return this.#previous;
  });

  /** The projected nodes by block id. */
  readonly byId: ReadonlyMap<string, BlockNode> = $derived(
    new Map(this.projected.map((node) => [node.id, node])),
  );

  /** The previewed block's node, drawn at its preview; `null` without a preview. */
  readonly previewed: BlockNode | null = $derived.by(() => {
    const preview = this.preview;
    const node = preview === null ? undefined : this.byId.get(preview.id);
    return preview === null || node === undefined
      ? null
      : drawnAt(node, preview.view, this.#input().metrics);
  });

  /**
   * The nodes Svelte Flow shows: the projection, the previewed block's node
   * replaced. Svelte Flow writes the dragged positions into this value
   * during a block drag; the next projection or preview replaces them.
   */
  nodes: BlockNode[] = $derived.by(() => {
    void this.resync;
    const shown = this.previewed;
    return shown === null
      ? [...this.projected]
      : this.projected.map((node) => (node.id === shown.id ? shown : node));
  });

  /** The node of block `id` as shown: its preview's while one is under way. */
  shown(id: BlockId): BlockNode | undefined {
    const shown = this.previewed;
    return shown?.id === id ? shown : this.byId.get(id);
  }

  /**
   * The rectangle on the canvas of `box` of block `id` as shown, its
   * preview's while one is under way: the node's for the block itself, a
   * frame's or a card's where the shown drawing draws it; `undefined` where
   * it is not shown.
   */
  boundsOf(id: BlockId, box: DrawnBox): Rect | undefined {
    const node = this.shown(id);
    if (node === undefined) return undefined;
    if (box.kind === "block") {
      const { x, y } = node.position;
      return { x, y, width: node.width ?? 0, height: node.height ?? 0 };
    }
    const shown = box.key === null ? undefined : keyedBox(node.data.drawing, box.key);
    return shown === undefined ? undefined : rectOnCanvas(node, shown);
  }

  /**
   * The placement of the previewed block, or else of block `dragged`, as
   * shown, with the drawing its node shows; `null` without either.
   */
  live(dragged: BlockId | null): LivePlacement | null {
    const id = this.preview?.id ?? dragged;
    const node = id === null ? undefined : this.shown(id);
    if (node === undefined) return null;
    return livePlacement(node.data.block, node.position, {}, node.data.drawing);
  }

  constructor(input: () => Projected) {
    this.#input = input;
  }
}
