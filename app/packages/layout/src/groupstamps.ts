/**
 * The lines of the groupstamps: a named timestamp with `groupstamp: true`
 * lies on a group's member (a timeline the group lists, or a descendant of
 * one), and its line extends across every member of each group whose frame
 * draws it, from the upper border of the frame's topmost member card to the
 * lower border of its bottommost, less the card its own line crosses. The
 * other members' coordinates and lines derive from the group (the members of a frame share its start and its
 * length, so one abscissa is one proportion of each member's drawn length)
 * and are never stored; they are drawn in the timestamp's own line style,
 * without wedges or labels. Where a member's length is not known, or the
 * length of the member the timestamp lies on, the group gives that member no
 * coordinate (one member's length is never carried to another): the piece
 * of the line over its card is drawn faded.
 */

import type { Manifest } from "@timetoalign/tilie-core";
import { idAddress, partAddress, samePlaceKey } from "@timetoalign/tilie-core";
import type { DrawnAxis, DrawnBox } from "./boxes.ts";
import type { VerticalLineElement } from "./elements.ts";
import { fadedStyle } from "./markers.ts";
import { cut, type Span } from "./stacks.ts";

/**
 * Whether `axis` is drawn in a card held by a group's frame: a member card, never an ancestor
 * card, which lies behind the frame and whose key only has a member card's shape.
 */
const inFrame = (axis: DrawnAxis): boolean =>
  axis.card.member !== undefined && axis.ancestor === undefined;

/**
 * The member lines of the frame of the group `group` among the drawn lines
 * `axes`, in their order: the line of each member card's own timeline (the
 * timeline the group lists), never an ancestor line drawn above it nor a
 * descendant's line drawn in its children band, nor a line of an ancestor
 * card behind the frame (section 8.8). The one statement of which
 * lines a group's frame holds, whose cards a groupstamp spans and whose
 * timelines (each with the descendants its cross-section line crosses) a
 * groupstamp's timestamp reads.
 */
export function frameMemberLines(axes: readonly DrawnAxis[], group: string): DrawnAxis[] {
  return axes.filter(
    (axis) =>
      inFrame(axis) &&
      axis.card.item === group &&
      axis.address.id === axis.card.member &&
      axis.marker !== null,
  );
}

/**
 * Whether a position read across a group from the member line `own` gives
 * the member line `other` of the same frame a coordinate (section 6.6): the
 * group maps it by the proportion of the two members' lengths, so only where
 * both are known (a member line's `end` is null where its length is not);
 * the drawn length of a member whose length is not known is its reach, which
 * places the position on the drawing but defines no coordinate.
 */
export function readsAcrossGroup(own: DrawnAxis, other: DrawnAxis): boolean {
  return own.end !== null && other.end !== null;
}

/**
 * The ordinates of the member cards of the frame drawing the line `primary`
 * over which a groupstamp lying on `primary`'s member has no coordinate
 * (`readsAcrossGroup`), among the drawn lines `axes` and boxes `boxes`, each
 * from the card's upper border to its lower one, top first; never the card
 * drawing `primary`.
 */
function valuelessCards(
  axes: readonly DrawnAxis[],
  boxes: readonly DrawnBox[],
  primary: DrawnAxis,
): Span[] {
  const lines = frameMemberLines(axes, primary.card.item);
  const own = lines.find((line) => samePlaceKey(line.card, primary.card));
  if (own === undefined) return [];
  return lines
    .filter((line) => line !== own && !readsAcrossGroup(own, line))
    .flatMap(({ card }) =>
      boxes.filter((box) => box.kind === "card" && box.key !== null && samePlaceKey(box.key, card)),
    )
    .map(({ y, height }): Span => [y, y + height])
    .sort(([a], [b]) => a - b);
}

/**
 * `span` cut at the spans `faded` (sorted, apart): its pieces from the top,
 * each marked whether it lies in one of them; none without a length.
 */
function fadedPieces(
  span: Span,
  faded: readonly Span[],
): { readonly span: Span; readonly faded: boolean }[] {
  const pieces: { span: Span; faded: boolean }[] = [];
  const push = (y1: number, y2: number, inside: boolean) => {
    if (y1 < y2) pieces.push({ span: [y1, y2], faded: inside });
  };
  let at = span[0];
  for (const [top, bottom] of faded) {
    const y1 = Math.max(top, at);
    const y2 = Math.min(bottom, span[1]);
    if (y1 >= y2) continue;
    push(at, y1, false);
    push(y1, y2, true);
    at = y2;
  }
  push(at, span[1], false);
  return pieces;
}

/**
 * The ordinates a groupstamp's line spans in the frame drawing the line
 * `primary` (a line drawn in a card of a group's frame), among the drawn lines
 * `axes` and the drawn boxes `boxes`: from the upper border of the topmost
 * card of the frame's member lines (`frameMemberLines`) to the lower border of
 * the bottommost, as the cards' boxes are drawn in that frame, less the card
 * drawing `primary`, which the timestamp's own cross-section line crosses
 * (section 6.6); the pieces in order from the top, none without a length.
 * None where `primary` is drawn in no frame.
 */
export function groupSpans(
  axes: readonly DrawnAxis[],
  boxes: readonly DrawnBox[],
  primary: DrawnAxis,
): Span[] {
  if (!inFrame(primary)) return [];
  const boxOf = (card: DrawnAxis["card"]) =>
    boxes.filter((box) => box.kind === "card" && box.key !== null && samePlaceKey(box.key, card));
  const cards = frameMemberLines(axes, primary.card.item).flatMap(({ card }) => boxOf(card));
  if (cards.length === 0) return [];
  const whole: Span = [
    Math.min(...cards.map(({ y }) => y)),
    Math.max(...cards.map(({ y, height }) => y + height)),
  ];
  return boxOf(primary.card).reduce<Span[]>(
    (pieces, { y, height }) => pieces.flatMap((piece) => cut(piece, [y, y + height])),
    [whole],
  );
}

/**
 * The lines of `manifest`'s groupstamps among the drawn lines `axes` and the
 * drawn boxes `boxes`, in block coordinates: timestamp by timestamp in the
 * order of `graphical.timestamps`, frame by frame in the order of the lines,
 * for each groupstamp whose cross-section line is listed and displayed (its
 * `AxisTimestamp.line`) and for each line drawn in a card of a group's frame
 * that holds it, vertical `cross_section` elements at the timestamp's
 * abscissa there over the frame's spans (`groupSpans`: from the upper border
 * of its topmost member card to the lower border of its bottommost, less the
 * card the timestamp's own line crosses), cut at the borders of each member
 * card over which the timestamp has no coordinate (`readsAcrossGroup`). Their
 * address is the timestamp's line's, `{id, part: ["line"]}`, and their style
 * that line's, at the frame's scale, faded (`fadedStyle`) over such a card.
 * They take no room.
 */
export function groupstampElements(
  manifest: Manifest,
  axes: readonly DrawnAxis[],
  boxes: readonly DrawnBox[],
): VerticalLineElement[] {
  const lines: VerticalLineElement[] = [];
  for (const timestamp of manifest.graphical?.timestamps ?? []) {
    if (!timestamp.groupstamp) continue;
    const address = partAddress(idAddress(timestamp.id), "line");
    for (const axis of axes) {
      if (!inFrame(axis)) continue;
      const held = axis.timestamps.find((item) => item.id === timestamp.id);
      if (held === undefined || held.line === null) continue;
      const valueless = valuelessCards(axes, boxes, axis);
      for (const whole of groupSpans(axes, boxes, axis)) {
        for (const { span, faded } of fadedPieces(whole, valueless)) {
          const style = faded ? fadedStyle(held.line) : held.line;
          lines.push({
            type: "cross_section",
            address,
            style,
            x: held.x,
            y1: span[0],
            y2: span[1],
          });
        }
      }
    }
  }
  return lines;
}
