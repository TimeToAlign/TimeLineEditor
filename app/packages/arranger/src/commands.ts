/** Gestures as commands: every completed gesture is one `set` or one `remove`. */

import type {
  AddCommand,
  Block,
  BlockId,
  Change,
  Manifest,
  RemoveCommand,
  SetCommand,
  View,
} from "@timetoalign/tilie-core";
import {
  type Address,
  addressKey,
  addressWords,
  idAddress,
  inBlock,
  indicesBetween,
  isCommandError,
  preview,
  sameAddress,
  TITLE_ADDRESS,
  WORKSPACE,
} from "@timetoalign/tilie-core";
import type { Drawing } from "@timetoalign/tilie-layout";
import type { FontMetrics } from "@timetoalign/timetoshare";
import { drawingOf, nodePosition } from "./drawing.ts";
import { addressParts, type Editing } from "./editing.ts";
import { GRID_FREE, positionStep, quantize, sameSequence } from "./numbers.ts";
import { blocksInOrder } from "./project.ts";
import { type Selection, selectedBand } from "./selection.ts";

/** A block's node position after a gesture, before quantization. */
export interface Move {
  readonly id: BlockId;
  readonly x: number;
  readonly y: number;
}

const NO_ORIGIN = { x: 0, y: 0 } as const;

function setOf(changes: readonly Change[]): SetCommand | null {
  return changes.length === 0 ? null : { type: "set", changes };
}

/**
 * One `set` of `{x, y}` per block: each node position quantized to `step`,
 * then turned into the position of the block's place origin (`nodePosition`
 * inverted) quantized to `GRID_FREE`, leaving out a block whose position is
 * its stored one.
 */
function placing(
  view: View,
  moves: readonly Move[],
  step: number,
  metrics: FontMetrics,
): SetCommand | null {
  const changes: Change[] = [];
  for (const move of moves) {
    const block = view.blocks[move.id];
    const origin =
      block === undefined ? NO_ORIGIN : drawingOf(block, view.settings, metrics).origin;
    const scale = block?.scale ?? 1;
    const x = quantize(quantize(move.x, step) + origin.x * scale, GRID_FREE);
    const y = quantize(quantize(move.y, step) + origin.y * scale, GRID_FREE);
    if (block !== undefined && block.x === x && block.y === y) continue;
    changes.push({ target: { block: move.id }, values: { x, y } });
  }
  return setOf(changes);
}

/**
 * One `set` placing every moved block where its node is dropped, `moves`
 * holding node positions (the block's top-left corner, `nodePosition`): each
 * quantized to `GRID_FREE` and stored as the position of the block's place
 * origin, in the order of `moves`; a block whose stored position does not
 * change is left out, and `null` is returned when nothing is left. Snapping
 * is `snap`'s job: the caller passes the dragged node's snapped position,
 * and the other nodes of the drag moved by the same delta.
 */
export function moveCommand(
  view: View,
  moves: readonly Move[],
  metrics: FontMetrics,
): SetCommand | null {
  return placing(view, moves, GRID_FREE, metrics);
}

/**
 * One `set` moving the blocks `ids` by `dx`, `dy` grid steps: each node's
 * position moved and quantized to the grid when it snaps, otherwise to
 * `GRID_FREE`, then stored as the position of its place origin. `null` when
 * nothing moves.
 */
export function nudgeCommand(
  view: View,
  ids: readonly BlockId[],
  dx: number,
  dy: number,
  metrics: FontMetrics,
): SetCommand | null {
  if (dx === 0 && dy === 0) return null;
  const { grid } = view.settings;
  const moves: Move[] = [];
  for (const id of ids) {
    const block = view.blocks[id];
    if (block === undefined) continue;
    const node = nodePosition(block, drawingOf(block, view.settings, metrics));
    moves.push({ id, x: node.x + dx * grid.size, y: node.y + dy * grid.size });
  }
  return placing(view, moves, positionStep(grid), metrics);
}

/** The visible part of the canvas: Svelte Flow's transform and the pane's size in screen pixels. */
export interface Visible {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
  readonly width: number;
  readonly height: number;
}

/** A node's rectangle on the canvas. */
interface NodeRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** The node rectangle of `block` drawn as `drawing`: its drawing's size times its scale, from its node position. */
function nodeRect(block: Pick<Block, "x" | "y" | "scale">, drawing: Drawing): NodeRect {
  const { x, y } = nodePosition(block, drawing);
  return {
    left: x,
    top: y,
    right: x + drawing.width * block.scale,
    bottom: y + drawing.height * block.scale,
  };
}

/** Whether the interiors of two rectangles intersect; edges that only touch do not. */
function overlaps(a: NodeRect, b: NodeRect): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

/** `rect` grown by `margin` on every side. */
function grown(rect: NodeRect, margin: number): NodeRect {
  return {
    left: rect.left - margin,
    top: rect.top - margin,
    right: rect.right + margin,
    bottom: rect.bottom + margin,
  };
}

/**
 * One `add` of a new block `id` holding `manifest`, its top-left at the
 * centre of what `visible` shows, quantized as a move under the view's grid
 * is, then moved right past every block it would overlap: while its node
 * rectangle (its drawing at the workspace's block defaults) meets a root
 * block's grown by the grid size on every side, its node moves to the right
 * edge of the rightmost such block plus the grid size, its `x` rounded up
 * to the position step. Its `y` never changes; its other placement members
 * are the workspace's block defaults.
 */
export function addCommand(
  view: View,
  id: BlockId,
  manifest: Manifest,
  visible: Visible,
  metrics: FontMetrics,
): AddCommand {
  const { grid } = view.settings;
  const step = positionStep(grid);
  let x = quantize((visible.width / 2 - visible.x) / visible.zoom, step);
  const y = quantize((visible.height / 2 - visible.y) / visible.zoom, step);
  const command = (): AddCommand => ({
    type: "add",
    into: WORKSPACE,
    block: { id, manifest, x, y },
  });
  const added = preview(view, command());
  const block = isCommandError(added) ? undefined : added.blocks[id];
  // A manifest core refuses is refused by the dispatch too; where it would lie does not matter.
  if (block === undefined) return command();
  const drawing = drawingOf(block, view.settings, metrics);
  let others = Object.values(view.blocks)
    .filter((other) => other.parent === null)
    .map((other) => grown(nodeRect(other, drawingOf(other, view.settings, metrics)), grid.size));
  for (;;) {
    const rect = nodeRect({ x, y, scale: block.scale }, drawing);
    const met = others.filter((other) => overlaps(rect, other));
    if (met.length === 0) return command();
    // The grown right edge is the block's right edge plus the grid size.
    const right = Math.max(...met.map((other) => other.right));
    x = Math.ceil((right + drawing.origin.x * block.scale) / step) * step + 0;
    // Every block met lies left of the new place, so each is passed once and the search ends.
    others = others.filter((other) => !met.includes(other));
  }
}

export type ZOrderAction = "front" | "back" | "forward" | "backward";

/** The ids of one sibling list after `action` on its members in `chosen`. */
function reordered(
  order: readonly BlockId[],
  chosen: ReadonlySet<BlockId>,
  action: ZOrderAction,
): BlockId[] {
  const picked = order.filter((id) => chosen.has(id));
  const rest = order.filter((id) => !chosen.has(id));
  switch (action) {
    case "front":
      return [...rest, ...picked];
    case "back":
      return [...picked, ...rest];
    case "forward":
      // From the top down, each chosen block passes the unchosen one above it.
      return passed([...order].reverse(), chosen).reverse();
    case "backward":
      return passed(order, chosen);
  }
}

/** `order` with every chosen id swapped with the unchosen one before it, from the start on. */
function passed(order: readonly BlockId[], chosen: ReadonlySet<BlockId>): BlockId[] {
  const next = [...order];
  for (let index = 1; index < next.length; index += 1) {
    const here = next[index];
    const before = next[index - 1];
    if (here === undefined || before === undefined) continue;
    if (chosen.has(here) && !chosen.has(before)) {
      next[index] = before;
      next[index - 1] = here;
    }
  }
  return next;
}

/**
 * One `set` of `index` raising or lowering the blocks `ids` among their
 * siblings: to the front or back, or one step past their unchosen
 * neighbour. Only the chosen blocks get new fractional indices, each run of
 * them between its unchosen neighbours and below every index a chosen block
 * holds there. `null` when the order is unchanged.
 */
export function zOrderCommand(
  view: View,
  ids: readonly BlockId[],
  action: ZOrderAction,
): SetCommand | null {
  const chosen = new Set(ids.filter((id) => view.blocks[id] !== undefined));
  const families = new Map<string, Block[]>();
  for (const block of blocksInOrder(view)) {
    const key = block.parent ?? "";
    families.set(key, [...(families.get(key) ?? []), block]);
  }
  const changes: Change[] = [];
  for (const family of families.values()) {
    const order = family.map((block) => block.id);
    const target = reordered(order, chosen, action);
    if (sameSequence(target, order)) continue;
    const indexOf = new Map(family.map((block) => [block.id, block.index]));
    const held = family.filter((block) => chosen.has(block.id)).map((block) => block.index);
    let run: BlockId[] = [];
    let lower: string | null = null;
    const place = (above: string | null) => {
      let upper = above;
      // A `set` applies its changes in turn, so no new index may equal an index a
      // chosen block still holds: the run fills the gap below the first of them.
      for (const index of held) {
        if ((lower === null || index > lower) && (upper === null || index < upper)) upper = index;
      }
      const indices = indicesBetween(lower, upper, run.length);
      for (const [offset, index] of indices.entries()) {
        const id = run[offset];
        if (id !== undefined) changes.push({ target: { block: id }, values: { index } });
      }
      run = [];
    };
    for (const id of target) {
      if (chosen.has(id)) {
        run.push(id);
        continue;
      }
      const index = indexOf.get(id) ?? null;
      if (run.length > 0) place(index);
      lower = index;
    }
    if (run.length > 0) place(null);
  }
  return setOf(changes);
}

/**
 * One `remove` of the selected addresses, an element's part or card
 * standing for the element whose ID it carries. Every element can be removed, timelines
 * and groups included; a selection holding a manifest's title, which goes
 * only with its block, is refused whole, with a hint naming the block. A
 * band is never removed: its address is left out, and a selection of bands
 * alone is refused with a hint. Whether a segment may go is core's to
 * decide: one that would leave a gap in its segment line is refused there
 * (`segment_not_removable`), and the canvas shows that refusal as it shows
 * every refusal of the store. Inside an editor the edited element is never
 * removed, a part of it standing for it as well: it is left out of the
 * targets, and a selection that names nothing else is refused with a hint
 * to close the editor first.
 */
export function removeCommand(
  view: View,
  selection: Selection,
  editing: Editing | null,
): RemoveCommand | { readonly refused: string } {
  if (selection.size === 0) return { refused: "Nothing is selected." };
  const addresses = [...selection.values()].filter(
    (address) => selectedBand(view, address) === null,
  );
  if (addresses.length === 0) {
    return { refused: "A band is not deleted; select its elements to delete them." };
  }
  const targets = new Map<string, Address>();
  const add = (target: Address) => targets.set(addressKey(target), target);
  for (const address of addresses) {
    const { block: id, element } = addressParts(address);
    const block = view.blocks[id];
    if (block === undefined || element === null) {
      add(address);
      continue;
    }
    if (element.id === undefined) {
      const title = addressWords(view, inBlock(block.id, TITLE_ADDRESS));
      return {
        refused: `${title.charAt(0).toUpperCase()}${title.slice(1)} is removed only with its block; select the block to delete it.`,
      };
    }
    add(inBlock(block.id, idAddress(element.id)));
  }
  const removed = [...targets.values()].filter(
    (target) => editing === null || !sameAddress(target, editing.target),
  );
  if (removed.length === 0) return { refused: "Close its editor to delete the edited element." };
  return { type: "remove", targets: removed };
}
