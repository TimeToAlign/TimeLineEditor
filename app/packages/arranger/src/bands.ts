/**
 * The bands of a timeline (`docs/drawing.md` in TimeToShare, section 6.4) as
 * containers of its timeline editor: where a dragged or stepped band lands in
 * the timeline's band order, and the one `set` that writes the new order. A
 * band draws nothing: the drawing records it among its boxes and only the
 * editor marks it; which bands an editor offers and the band under a point
 * are read from those boxes (`boxes.ts`). No other module computes these.
 *
 * Every order here is a band order: the timeline's five band addresses and
 * its id, top to bottom. The **visible** entries of a timeline in a drawing
 * are its present bands and its own id, top to bottom; a band's position is
 * the middle of its rectangle, the id's the ordinate of the timeline's line.
 * A timeline drawn with two lines in one drawing has two sets of records,
 * told apart by their `line`: a band moves among the records of its own line.
 */

import type { Address, BlockId, SetCommand, View } from "@timetoalign/tilie-core";
import { bandOrderOf, inheritedBandOrder, qualify } from "@timetoalign/tilie-core";
import type { Drawing } from "@timetoalign/tilie-layout";
import type { FontMetrics } from "@timetoalign/timetoshare";
import type { BandBox } from "./boxes.ts";
import { offeredBands } from "./boxes.ts";
import { drawingOf } from "./drawing.ts";
import type { Editing } from "./editing.ts";
import { sameSequence } from "./numbers.ts";
import { offersBand, selectedBand } from "./selection.ts";

/** The direction of a step (`bandStep`): the arrow pressed with Ctrl or Cmd. */
export type BandDirection = "up" | "down";

/**
 * The visible entries of the line `band` lies at, in `order` (top to
 * bottom), each with its position: a present band's middle, the timeline's
 * id at the line's ordinate.
 */
function visibleEntries(
  drawing: Drawing,
  band: BandBox,
  order: readonly string[],
): { readonly entry: string; readonly at: number }[] {
  const { timeline, line } = band.band;
  const middles = new Map(
    offeredBands(drawing, timeline)
      .filter((other) => other.band.line === line)
      .map((other) => [other.address, other.y + other.height / 2]),
  );
  return order.flatMap((entry) => {
    if (entry === timeline) return [{ entry, at: line }];
    const at = middles.get(entry);
    return at === undefined ? [] : [{ entry, at }];
  });
}

/**
 * `order` with `band` moved to lie between the entries `above` and `below`,
 * one of which may be `null` (none that way): just after `above`, or just
 * before `below` when there is no `above`; `null` when it already lies
 * between them, relative to them alone, so that a move that changes nothing
 * seen writes nothing.
 */
function movedBetween(
  order: readonly string[],
  band: string,
  above: string | null,
  below: string | null,
): readonly string[] | null {
  const index = order.indexOf(band);
  const between =
    (above === null || order.indexOf(above) < index) &&
    (below === null || index < order.indexOf(below));
  if (between) return null;
  const rest = order.filter((entry) => entry !== band);
  const at = above !== null ? rest.indexOf(above) + 1 : below !== null ? rest.indexOf(below) : 0;
  return [...rest.slice(0, at), band, ...rest.slice(at)];
}

/**
 * Where a drag of `band` released at the drawing ordinate `y` lands: the new
 * own band order of its timeline, or `null` when nothing changes. `order` is
 * the timeline's effective band order (core's `bandOrderOf`). Of the visible
 * entries without the dragged band, let `k` be how many lie above `y`; the
 * band moves in `order` to just after the `k`-th of them, or just before the
 * first when `k` is 0. When the band already lies between those two
 * neighbours in `order`, relative to them alone, the result is `null`: a
 * release in place never writes. A drop across the line follows the same
 * rule, the timeline's id being a visible entry like any band.
 */
export function bandDrop(
  drawing: Drawing,
  band: BandBox,
  y: number,
  order: readonly string[],
): readonly string[] | null {
  const others = visibleEntries(drawing, band, order).filter(({ entry }) => entry !== band.address);
  const k = others.filter(({ at }) => at < y).length;
  return movedBetween(order, band.address, others[k - 1]?.entry ?? null, others[k]?.entry ?? null);
}

/**
 * `band` moved past the next visible entry in `direction`, the timeline's
 * line included, so every step changes what is seen: the new own band order
 * of its timeline, or `null` when no visible entry lies that way (the top or
 * the bottom). `order` is the timeline's effective band order.
 */
export function bandStep(
  drawing: Drawing,
  band: BandBox,
  direction: BandDirection,
  order: readonly string[],
): readonly string[] | null {
  const visible = visibleEntries(drawing, band, order).map(({ entry }) => entry);
  const index = visible.indexOf(band.address);
  const passed = visible[direction === "up" ? index - 1 : index + 1];
  if (index < 0 || passed === undefined) return null;
  return direction === "up"
    ? movedBetween(order, band.address, null, passed)
    : movedBetween(order, band.address, passed, null);
}

/**
 * The one `set` that gives `timeline` of block `block` the band order
 * `order`: one change `{target: "<block>/<timeline>", values: {order: X}}`,
 * `X` being `order`, or `null` when `order` equals the timeline's inherited
 * band order (core's `inheritedBandOrder` over the block's manifest), so the
 * timeline inherits again. A move is one command, one journal entry, one
 * undo step.
 */
export function bandMoveCommand(
  view: View,
  block: BlockId,
  timeline: string,
  order: readonly string[],
): SetCommand {
  const found = view.blocks[block];
  if (found === undefined) throw new RangeError(`${block} is no block of the view`);
  const inherits = sameSequence(order, inheritedBandOrder(found.manifest, timeline));
  return {
    type: "set",
    changes: [
      { target: qualify(block, timeline), values: { order: inherits ? null : [...order] } },
    ],
  };
}

/**
 * The `set` that steps the selected band `address` past the next band or
 * line drawn in `direction` (`bandStep`, `bandMoveCommand`): `null` unless
 * `address` names a band the view offers under `editing` (`offersBand`)
 * that its block's drawing records, and when nothing lies that way. Whether
 * the canvas moves bands at all is the caller's question (`rulesOf`).
 */
export function bandStepCommand(
  view: View,
  address: Address,
  direction: BandDirection,
  editing: Editing | null,
  metrics: FontMetrics,
): SetCommand | null {
  const selected = selectedBand(view, address);
  if (selected === null || !offersBand(view, selected, editing)) return null;
  const block = view.blocks[selected.block];
  if (block === undefined) return null;
  const drawing = drawingOf(block, view.settings, metrics);
  const drawn = offeredBands(drawing, selected.timeline).find(
    (band) => band.band.kind === selected.kind,
  );
  if (drawn === undefined) return null;
  const order = bandStep(drawing, drawn, direction, bandOrderOf(block.manifest, selected.timeline));
  return order === null ? null : bandMoveCommand(view, block.id, selected.timeline, order);
}
