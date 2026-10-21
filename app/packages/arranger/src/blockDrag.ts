/**
 * Dragging blocks on the arranger: Svelte Flow drags the nodes, and the
 * canvas snaps the dragged ones to the grid and to the other blocks' edges
 * and origins (`snap`).
 */

import type { Command, View, WorkspaceSettings } from "@timetoalign/tilie-core";
import type { FontMetrics } from "@timetoalign/timetoshare";
import { moveCommand } from "./commands.ts";
import type { BlockNode, LivePlacement } from "./project.ts";
import { livePlacement } from "./project.ts";
import type { Selection } from "./selection.ts";
import { blockOf } from "./selection.ts";
import type { Box, Guide } from "./snap.ts";
import { snap } from "./snap.ts";

/** How close, in screen pixels, a dragged block snaps to another block's edge or origin. */
export const SNAP_TOLERANCE = 6;

/**
 * The box of `node` on the canvas at `position` (its own by default): its
 * node's rectangle, and as its origin the abscissa where the first root
 * line drawn starts, the node's left edge where none is drawn.
 */
export function nodeBox(node: BlockNode, position = node.position): Box {
  const { drawing, block } = node.data;
  const root = drawing.elements.find((element) => element.type === "timeline");
  return {
    id: node.id,
    x: position.x,
    y: position.y,
    width: node.width ?? drawing.width * block.scale,
    height: node.height ?? drawing.height * block.scale,
    origin: position.x + (root?.type === "timeline" ? root.xs : 0) * block.scale,
  };
}

/** The boxes the dragged blocks `dragged` snap to, fixed for one gesture: every other block's. */
export function anchors(nodes: readonly BlockNode[], dragged: ReadonlySet<string>): Box[] {
  return nodes.filter(({ id }) => !dragged.has(id)).map((node) => nodeBox(node));
}

/**
 * The offset that snaps the dragged nodes, from where Svelte Flow put the
 * leading one `lead`, and the guides the snap shows; `zoom` turns the
 * tolerance into canvas units.
 */
export function snapOffset(
  lead: BlockNode,
  boxes: readonly Box[],
  grid: WorkspaceSettings["grid"],
  zoom: number,
): { dx: number; dy: number; guides: readonly Guide[] } {
  const snapped = snap(nodeBox(lead), boxes, grid, SNAP_TOLERANCE / zoom);
  return {
    dx: snapped.x - lead.position.x,
    dy: snapped.y - lead.position.y,
    guides: snapped.guides,
  };
}

/** What a block drag reads from the canvas and does through it. */
export interface DragHost {
  view(): View;
  metrics(): FontMetrics;
  zoom(): number;
  /** The projected nodes, which a drag snaps to and falls back on. */
  projected(): readonly BlockNode[];
  /** The nodes Svelte Flow shows, which a snap moves. */
  shown(): BlockNode[];
  show(nodes: BlockNode[]): void;
  selection(): Selection;
  select(next: Selection): void;
  guides(guides: readonly Guide[]): void;
  /** Runs a command; whether the store accepted it. */
  dispatch(command: Command): boolean;
  /** The placement of the one block under drag, as shown; `null` once the drag ends. */
  report(placement: LivePlacement | null): void;
}

/** Svelte Flow's node drag event. */
export interface NodeDrag {
  readonly targetNode: BlockNode | null;
  readonly nodes: BlockNode[];
}

/**
 * The arranger's block drag over Svelte Flow's: the dragged nodes snap to
 * the grid and to the other blocks, fixed for one gesture; the release
 * stores one move, or shows the projection again when nothing is stored.
 * Dragging a block that is not selected selects it, unless the selection
 * lies inside it.
 */
export class BlockDrag {
  readonly #host: DragHost;
  /** The ids of the blocks under drag, from the drag's start to its end. */
  #dragging: readonly string[] | null = null;
  #boxes: readonly Box[] = [];

  constructor(host: DragHost) {
    this.#host = host;
  }

  start({ targetNode, nodes }: NodeDrag): void {
    const host = this.#host;
    const ids = new Set(nodes.map(({ id }) => id));
    this.#dragging = [...ids];
    this.#boxes = anchors(host.projected(), ids);
    const selection = host.selection();
    if (targetNode !== null && !selection.has(targetNode.id)) {
      const inside = [...selection].some((address) => blockOf(address) === targetNode.id);
      if (!inside) host.select(new Set(ids));
    }
    const lead = targetNode ?? nodes[0];
    if (lead !== undefined) host.report(this.#placed(lead, 0, 0));
  }

  drag({ targetNode, nodes }: NodeDrag): void {
    const host = this.#host;
    const lead = targetNode ?? nodes[0];
    if (lead === undefined) return;
    const { dx, dy, guides } = this.#offset(lead);
    host.guides(guides);
    host.report(this.#placed(lead, dx, dy));
    if (dx === 0 && dy === 0) return;
    const ids = new Set(nodes.map(({ id }) => id));
    host.show(
      host
        .shown()
        .map((node) =>
          ids.has(node.id)
            ? { ...node, position: { x: node.position.x + dx, y: node.position.y + dy } }
            : node,
        ),
    );
  }

  stop({ targetNode, nodes }: NodeDrag): void {
    const host = this.#host;
    host.guides([]);
    this.#dragging = null;
    host.report(null);
    const lead = targetNode ?? nodes[0];
    if (lead === undefined) return;
    const { dx, dy } = this.#offset(lead);
    this.#boxes = [];
    const moves = nodes.map(({ id, position }) => ({ id, x: position.x + dx, y: position.y + dy }));
    const command = moveCommand(host.view(), moves, host.metrics());
    // Nothing stored: show the projection again instead of the dragged positions.
    if (command === null || !host.dispatch(command)) host.show([...host.projected()]);
  }

  #offset(lead: BlockNode): { dx: number; dy: number; guides: readonly Guide[] } {
    return snapOffset(lead, this.#boxes, this.#host.view().settings.grid, this.#host.zoom());
  }

  /** The placement of `lead` moved by `(dx, dy)` when it is the one block under drag. */
  #placed(lead: BlockNode, dx: number, dy: number): LivePlacement | null {
    if (this.#dragging?.length !== 1) return null;
    const position = { x: lead.position.x + dx, y: lead.position.y + dy };
    return livePlacement(lead.data.block, position, {}, lead.data.drawing);
  }
}
