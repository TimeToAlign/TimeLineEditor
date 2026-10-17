/** Gestures as commands: every completed gesture is one `set` or one `remove`. */

import type {
  AddCommand,
  Block,
  BlockId,
  Change,
  Gap,
  GapOption,
  Manifest,
  RemoveCommand,
  SetCommand,
  View,
} from "@timetoalign/tilie-core";
import {
  elementOf,
  indicesBetween,
  isSegment,
  removedBy,
  TITLE_ADDRESS,
} from "@timetoalign/tilie-core";
import type { FontMetrics } from "@timetoalign/timeskeleton";
import { drawingOf } from "./drawing.ts";
import { GRID_FREE, positionStep, quantize } from "./numbers.ts";
import { blocksInOrder, nodePosition } from "./project.ts";
import { blockOf, type Selection } from "./selection.ts";

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
    changes.push({ target: move.id, values: { x, y } });
  }
  return setOf(changes);
}

/**
 * One `set` placing every moved block where its node is dropped, `moves`
 * holding node positions (the box's top-left corner, `nodePosition`): each
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

/**
 * One `add` of a new block `id` holding `manifest`, its top-left at the
 * centre of what `visible` shows, quantized as a move under the view's grid
 * is. Its other placement members are the workspace's block defaults.
 */
export function addCommand(
  view: View,
  id: BlockId,
  manifest: Manifest,
  visible: Visible,
): AddCommand {
  const step = positionStep(view.settings.grid);
  const x = quantize((visible.width / 2 - visible.x) / visible.zoom, step);
  const y = quantize((visible.height / 2 - visible.y) / visible.zoom, step);
  return { type: "add", into: "workspace", block: { id, manifest, x, y } };
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

/** A segment to delete, and the ways of closing its gap, of which one at least is permitted. */
export interface SegmentDelete {
  /** The segment's address, `<block>/<id>`. */
  readonly segment: string;
  readonly options: readonly GapOption[];
}

/** The way preselected for a segment's gap: the first permitted one, in the order of preference. */
export function preferredGap(options: readonly GapOption[]): Gap | null {
  return options.find((option) => option.refused === null)?.gap ?? null;
}

/**
 * The segments among `targets` that leave a gap: those going neither with
 * their block nor with another target of their block.
 */
function gapSegments(view: View, targets: readonly string[]): string[] {
  const found: string[] = [];
  for (const target of targets) {
    const block = view.blocks[blockOf(target)];
    if (block === undefined || target === block.id) continue;
    const id = target.slice(block.id.length + 1);
    if (!isSegment(block.manifest, id) || targets.includes(block.id)) continue;
    const others = targets
      .filter((other) => other !== target && blockOf(other) === block.id && other !== block.id)
      .map((other) => other.slice(block.id.length + 1));
    if (!removedBy(block.manifest, others).has(id)) found.push(target);
  }
  return found;
}

/**
 * One `remove` of the selected addresses, an element's part standing for
 * the element (core's `elementOf`). Every element can be removed, timelines
 * and groups included; a selection holding a manifest's title, which goes
 * only with its block, is refused whole, with a hint naming the block.
 *
 * A segment leaves a gap in its segment line. Deleting a segment is not
 * supported yet: a selection holding a segment that leaves a gap is refused
 * whole. A segment that goes with its segment line or its block leaves no
 * gap and is removed with it.
 */
export function removeCommand(
  view: View,
  selection: Selection,
): RemoveCommand | { readonly refused: string } {
  if (selection.size === 0) return { refused: "Nothing is selected." };
  const targets: string[] = [];
  for (const address of selection) {
    const block = view.blocks[blockOf(address)];
    if (block === undefined || address === block.id) {
      if (!targets.includes(address)) targets.push(address);
      continue;
    }
    const element = elementOf(block.manifest, address.slice(block.id.length + 1));
    if (element === TITLE_ADDRESS) {
      return {
        refused: `Block ${block.id}: its title is removed only with the block; select the block to delete it.`,
      };
    }
    const target = `${block.id}/${element}`;
    if (!targets.includes(target)) targets.push(target);
  }
  const [segment] = gapSegments(view, targets);
  if (segment === undefined) return { type: "remove", targets };
  // Deleting a segment is not enabled yet. Enabling it restores the
  // parameter `gap?: Gap` after `selection`, `SegmentDelete` in the return
  // type, core's `segmentGaps` among the imports, and the branch below in
  // place of this refusal: with a `gap` the remove carries it, without one
  // the segment and its options go to the canvas's menu. Before that,
  // the options must follow the meaning of the ways: "left shifts" moves
  // the left neighbour, so the segment line's offset in its parent moves
  // or, on a root, the line becomes shorter by the deleted length; a plain
  // segment is never locked, so its neighbours may always extend; a segment
  // that is itself a segment line is locked, so a line of such segments
  // extends only into a neighbour of unknown length; and the options of a
  // segment line that is a root must be checked against those rules.
  return { refused: "Deleting a segment is not supported yet." };
  // if (targets.length > 1) return { refused: "Delete one segment at a time." };
  // if (gap !== undefined) return { type: "remove", targets, gap };
  // const { manifest, id: block } = view.blocks[blockOf(segment)] as Block;
  // const id = segment.slice(block.length + 1);
  // const options = segmentGaps(manifest, id) ?? [];
  // if (options.every((option) => option.refused !== null)) {
  //   return {
  //     refused: `Segment ${id} cannot be deleted: no neighbour may extend and its segment line may not shift.`,
  //   };
  // }
  // return { segment, options };
}
