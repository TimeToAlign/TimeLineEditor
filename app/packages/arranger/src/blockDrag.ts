/**
 * Dragging blocks on the arranger: Svelte Flow drags the nodes, and the
 * canvas snaps the dragged ones to the grid and to the other blocks' edges
 * and origins (`snap`); on an arranged canvas the dragged block moves to
 * another place of the arrangement instead, the others making room for it.
 */

import type { Command, View, WorkspaceSettings } from "@timetoalign/tilie-core";
import type { FontMetrics } from "@timetoalign/timetoshare";
import { moveCommand } from "./commands.ts";
import type { Arranged } from "./containers.ts";
import { nodePosition } from "./drawing.ts";
import type { BlockNode, LivePlacement } from "./node.ts";
import type { PaneSource } from "./pane.ts";
import { arrangedPlaces, livePlacement, packingOrigin } from "./project.ts";
import { blockIndexCommand, orderAt } from "./reorder.ts";
import type { Selection } from "./selection.ts";
import { blockOf, isSelected, selectionOf } from "./selection.ts";
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

/** The rectangle of `node` on the canvas at `position` (its own by default). */
function rectOf(node: BlockNode, position = node.position) {
  const { drawing, block } = node.data;
  return {
    id: node.id,
    x: position.x,
    y: position.y,
    width: node.width ?? drawing.width * block.scale,
    height: node.height ?? drawing.height * block.scale,
  };
}

/** Where a block dragged on an arranged canvas drops: the blocks' new order and their places in it. */
export interface ArrangedDrop {
  /** Every block's id in the new order. */
  readonly order: readonly string[];
  /** Where each block lies in that order. */
  readonly places: ReadonlyMap<string, { x: number; y: number }>;
}

/**
 * Where the block `dragged`, shown at `position`, drops on a canvas arranged
 * `arranged` whose blocks `projected` shows (in index order, at their packed
 * places): the order `orderAt` gives at the middle of its node, read
 * against the places before the drop, and the places of every block packed
 * in that order (`arrangedPlaces`) from the top left of every block's
 * stated place (`packingOrigin` of their `nodePosition`s), as the canvas
 * packs them once the order is stored.
 */
export function arrangedDrop(
  projected: readonly BlockNode[],
  dragged: BlockNode,
  position: { readonly x: number; readonly y: number },
  arranged: Arranged,
): ArrangedDrop {
  const rects = projected.map((node) => rectOf(node));
  const moved = rectOf(dragged, position);
  const middle = { x: moved.x + moved.width / 2, y: moved.y + moved.height / 2 };
  const order = orderAt(rects, dragged.id, middle, arranged.direction);
  const byId = new Map(rects.map((rect) => [rect.id, rect]));
  const inOrder = order.flatMap((id) => {
    const rect = byId.get(id);
    return rect === undefined ? [] : [rect];
  });
  const start = packingOrigin(
    projected.map((node) => nodePosition(node.data.block, node.data.drawing)),
  );
  return { order, places: arrangedPlaces(inOrder, arranged, start) };
}

/** What a block drag reads from the canvas and does through it. */
export interface DragHost {
  view(): View;
  metrics(): FontMetrics;
  /** The pane the canvas's drawings are fitted to (`Pane.view`). */
  pane(): PaneSource | undefined;
  zoom(): number;
  /** The projected nodes, which a drag snaps to and falls back on. */
  projected(): readonly BlockNode[];
  /** The nodes Svelte Flow shows, which a snap moves. */
  shown(): BlockNode[];
  show(nodes: BlockNode[]): void;
  selection(): Selection;
  select(next: Selection): void;
  guides(guides: readonly Guide[]): void;
  /** How the canvas's blocks are arranged (`arrangedOf`); `null` where they lie at their places. */
  arranged(): Arranged | null;
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
 * lies inside it. On an arranged canvas nothing snaps: the leading block
 * follows the pointer while the others are shown at their places in the
 * order its drop gives (`arrangedDrop`), and the release stores that order
 * as one new `index` of the leading block (`blockIndexCommand`).
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
    this.#boxes = host.arranged() === null ? anchors(host.projected(), ids) : [];
    const selection = host.selection();
    if (targetNode !== null && !isSelected(selection, { block: targetNode.id })) {
      const inside = [...selection.values()].some((address) => blockOf(address) === targetNode.id);
      if (!inside) host.select(selectionOf([...ids].map((block) => ({ block }))));
    }
    const lead = targetNode ?? nodes[0];
    if (lead !== undefined && host.arranged() === null) host.report(this.#placed(lead, 0, 0));
  }

  drag({ targetNode, nodes }: NodeDrag): void {
    const host = this.#host;
    const lead = targetNode ?? nodes[0];
    if (lead === undefined) return;
    const arranged = host.arranged();
    if (arranged !== null) {
      const { places } = arrangedDrop(host.projected(), lead, lead.position, arranged);
      host.show(
        host.shown().map((node) => {
          const place = places.get(node.id);
          return node.id === lead.id || place === undefined ? node : { ...node, position: place };
        }),
      );
      return;
    }
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
    const arranged = host.arranged();
    if (arranged !== null) {
      this.#boxes = [];
      const { order } = arrangedDrop(host.projected(), lead, lead.position, arranged);
      const command = blockIndexCommand(host.view(), order, lead.id);
      if (command === null || !host.dispatch(command)) host.show([...host.projected()]);
      return;
    }
    const { dx, dy } = this.#offset(lead);
    this.#boxes = [];
    const moves = nodes.map(({ id, position }) => ({ id, x: position.x + dx, y: position.y + dy }));
    const command = moveCommand(host.view(), moves, host.metrics(), host.pane());
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
