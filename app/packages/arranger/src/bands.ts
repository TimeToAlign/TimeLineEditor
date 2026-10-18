/**
 * The bands of a timeline (`docs/drawing.md` in timeskeleton, section 6.4) as
 * boxes of its timeline editor: which bands it offers, the band under a
 * point, where a dragged or stepped band lands in the timeline's band order,
 * and the one `set` that writes the new order. A band draws nothing: the
 * drawing records it (`Drawing.bands`) and only the editor marks it. No other
 * module computes these.
 *
 * Every order here is a band order: the timeline's five band addresses and
 * its id, top to bottom. The **visible** entries of a timeline in a drawing
 * are its present bands and its own id, top to bottom; a band's position is
 * the middle of its rectangle, the id's the ordinate of the timeline's line.
 * A timeline drawn with two lines in one drawing has two sets of records,
 * told apart by their `line`: a band moves among the records of its own line.
 */

import type { BlockId, SetCommand, View } from "@timetoalign/tilie-core";
import { inheritedBandOrder } from "@timetoalign/tilie-core";
import type { Drawing, DrawnBand } from "@timetoalign/tilie-layout";

/** The direction of a step (`bandStep`): the arrow pressed with Ctrl or Cmd. */
export type BandDirection = "up" | "down";

/**
 * The bands the drawing records for `timeline`, in `Drawing.bands` order: the
 * bands its timeline editor offers. Every recorded band is present; whether
 * an editor offers them at all (the timeline editor of `timeline`, the
 * innermost open editor of its block) is the caller's test.
 */
export function offeredBands(drawing: Drawing, timeline: string): readonly DrawnBand[] {
  return drawing.bands.filter((band) => band.timeline === timeline);
}

/**
 * The offered band of `timeline` whose rectangle, its edges included, holds
 * `point` (in the drawing's units), the first in `Drawing.bands` order, else
 * `null`. A band 0 high holds the points of its edge only. A drawn element
 * is hit before any band: the caller asks only where the press hit no
 * element.
 */
export function bandAt(
  drawing: Drawing,
  timeline: string,
  point: { readonly x: number; readonly y: number },
): DrawnBand | null {
  const { x, y } = point;
  return (
    offeredBands(drawing, timeline).find(
      (band) => band.x <= x && x <= band.x + band.width && band.y <= y && y <= band.y + band.height,
    ) ?? null
  );
}

/**
 * The visible entries of the line `band` lies at, in `order` (top to
 * bottom), each with its position: a present band's middle, the timeline's
 * id at the line's ordinate.
 */
function visibleEntries(
  drawing: Drawing,
  band: DrawnBand,
  order: readonly string[],
): { readonly entry: string; readonly at: number }[] {
  const middles = new Map(
    drawing.bands
      .filter((other) => other.timeline === band.timeline && other.line === band.line)
      .map((other) => [other.address, other.y + other.height / 2]),
  );
  return order.flatMap((entry) => {
    if (entry === band.timeline) return [{ entry, at: band.line }];
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
  const at = above === null ? rest.indexOf(below as string) : rest.indexOf(above) + 1;
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
  band: DrawnBand,
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
  band: DrawnBand,
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
  const inherited = inheritedBandOrder(found.manifest, timeline);
  const inherits =
    order.length === inherited.length && order.every((entry, index) => entry === inherited[index]);
  return {
    type: "set",
    changes: [{ target: `${block}/${timeline}`, values: { order: inherits ? null : [...order] } }],
  };
}
