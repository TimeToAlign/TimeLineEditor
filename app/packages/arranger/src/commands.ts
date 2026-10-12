/** Gestures as commands: every completed gesture is one `set` or one `remove`. */

import type {
  Block,
  BlockId,
  Change,
  RemoveCommand,
  SetCommand,
  View,
} from "@timetoalign/tilie-core";
import { indicesBetween } from "@timetoalign/tilie-core";
import { ownerOf } from "./affected.ts";
import { GRID_FREE, positionStep, quantize } from "./numbers.ts";
import { blocksInOrder } from "./project.ts";
import { blockOf, type Selection } from "./selection.ts";

/** A block's position after a gesture, before quantization. */
export interface Move {
  readonly id: BlockId;
  readonly x: number;
  readonly y: number;
}

function setOf(changes: readonly Change[]): SetCommand | null {
  return changes.length === 0 ? null : { type: "set", changes };
}

/** One `set` of `{x, y}` per block, leaving out a block whose position is its stored one. */
function placing(view: View, moves: readonly Move[], step: number): SetCommand | null {
  const changes: Change[] = [];
  for (const move of moves) {
    const x = quantize(move.x, step);
    const y = quantize(move.y, step);
    const block = view.blocks[move.id];
    if (block !== undefined && block.x === x && block.y === y) continue;
    changes.push({ target: move.id, values: { x, y } });
  }
  return setOf(changes);
}

/**
 * One `set` placing every moved block at its position quantized to
 * `GRID_FREE`, in the order of `moves`; a block whose quantized position is
 * its stored one is left out, and `null` is returned when nothing is left.
 * Snapping is `snap`'s job: the caller passes the dragged block's snapped
 * position, and the other blocks of the drag moved by the same delta.
 */
export function moveCommand(view: View, moves: readonly Move[]): SetCommand | null {
  return placing(view, moves, GRID_FREE);
}

/**
 * One `set` moving the blocks `ids` by `dx`, `dy` grid steps, quantized to
 * the grid when it snaps, otherwise to `GRID_FREE`. `null` when nothing
 * moves.
 */
export function nudgeCommand(
  view: View,
  ids: readonly BlockId[],
  dx: number,
  dy: number,
): SetCommand | null {
  if (dx === 0 && dy === 0) return null;
  const { grid } = view.settings;
  const moves: Move[] = [];
  for (const id of ids) {
    const block = view.blocks[id];
    if (block === undefined) continue;
    moves.push({ id, x: block.x + dx * grid.size, y: block.y + dy * grid.size });
  }
  return placing(view, moves, positionStep(grid));
}

export type ZOrderAction = "front" | "back" | "forward" | "backward";

/** The ids of one sibling list after `action` on its members in `chosen`. */
function reordered(order: readonly BlockId[], chosen: ReadonlySet<BlockId>, action: ZOrderAction) {
  const picked = order.filter((id) => chosen.has(id));
  const rest = order.filter((id) => !chosen.has(id));
  switch (action) {
    case "front":
      return [...rest, ...picked];
    case "back":
      return [...picked, ...rest];
    case "forward": {
      // From the top down, each chosen block passes the unchosen one above it.
      const next = [...order];
      for (let index = next.length - 2; index >= 0; index -= 1) {
        const here = next[index] as BlockId;
        const above = next[index + 1] as BlockId;
        if (chosen.has(here) && !chosen.has(above)) {
          next[index] = above;
          next[index + 1] = here;
        }
      }
      return next;
    }
    case "backward": {
      const next = [...order];
      for (let index = 1; index < next.length; index += 1) {
        const here = next[index] as BlockId;
        const below = next[index - 1] as BlockId;
        if (chosen.has(here) && !chosen.has(below)) {
          next[index] = below;
          next[index - 1] = here;
        }
      }
      return next;
    }
  }
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
    if (target.every((id, index) => id === order[index])) continue;
    const indexOf = new Map(family.map((block) => [block.id, block.index]));
    const held = family.filter((block) => chosen.has(block.id)).map((block) => block.index);
    let start = 0;
    while (start < target.length) {
      if (!chosen.has(target[start] as BlockId)) {
        start += 1;
        continue;
      }
      let end = start;
      while (end < target.length && chosen.has(target[end] as BlockId)) end += 1;
      const lower = start === 0 ? null : (indexOf.get(target[start - 1] as BlockId) as string);
      let upper = end === target.length ? null : (indexOf.get(target[end] as BlockId) as string);
      // A `set` applies its changes in turn, so no new index may equal an index a
      // chosen block still holds: the run fills the gap below the first of them.
      for (const index of held) {
        if ((lower === null || index > lower) && (upper === null || index < upper)) upper = index;
      }
      const indices = indicesBetween(lower, upper, end - start);
      for (const [offset, index] of indices.entries()) {
        changes.push({ target: target[start + offset] as BlockId, values: { index } });
      }
      start = end;
    }
  }
  return setOf(changes);
}

/** The element an element address names, as an address within its block. */
function owner(address: string): string {
  const block = blockOf(address);
  return address === block ? address : `${block}/${ownerOf(address.slice(block.length + 1))}`;
}

/**
 * One `remove` of the selected addresses, an element's part standing for
 * the element. A selection holding a block's root timeline is refused
 * whole, with a hint naming the block: the root goes only with its block.
 */
export function removeCommand(
  view: View,
  selection: Selection,
): RemoveCommand | { readonly refused: string } {
  if (selection.size === 0) return { refused: "Nothing is selected." };
  const targets = [...new Set([...selection].map(owner))];
  for (const target of targets) {
    const block = view.blocks[blockOf(target)];
    if (block !== undefined && target === `${block.id}/${block.manifest.timeline.id}`) {
      return {
        refused: `Block ${block.id}: its root timeline ${block.manifest.timeline.id} is removed only with the block; select the block to delete it.`,
      };
    }
  }
  return { type: "remove", targets };
}
