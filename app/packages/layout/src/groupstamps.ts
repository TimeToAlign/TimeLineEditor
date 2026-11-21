/**
 * The lines of the groupstamps: a named timestamp with `groupstamp: true`
 * lies on a group's member (a timeline the group lists, or a descendant of
 * one), and its line extends across every member of each group whose frame
 * draws it. The other members' coordinates and lines derive from the group
 * (the members of a frame share its start and its length, so one abscissa is
 * one proportion of each member's drawn length) and are never stored; they
 * are drawn in the timestamp's own line style, without wedges or labels.
 */

import type { Manifest } from "@timetoalign/tilie-core";
import { idAddress, partAddress } from "@timetoalign/tilie-core";
import type { DrawnAxis } from "./boxes.ts";
import type { VerticalLineElement } from "./elements.ts";

/** An interval of ordinates `[y1, y2]`, `y1 ≤ y2`, in the drawing's units. */
export type Span = readonly [number, number];

/** Whether `axis` is drawn in a card held by a group's frame. */
const inFrame = (axis: DrawnAxis): boolean => axis.card.member !== undefined;

/**
 * The member lines of the frame of the group `group` among the drawn lines
 * `axes`, in their order: the line of each member card's own timeline (the
 * timeline the group lists), never an ancestor line drawn above it nor a
 * descendant's line drawn in its children band. The one statement of which
 * lines a group's frame holds, which a groupstamp spans and whose timelines
 * a groupstamp's timestamp reads.
 */
export function frameMemberLines(axes: readonly DrawnAxis[], group: string): DrawnAxis[] {
  return axes.filter(
    (axis) =>
      axis.card.item === group &&
      axis.card.member !== undefined &&
      axis.address.id === axis.card.member &&
      axis.marker !== null,
  );
}

/**
 * The ordinates a groupstamp's line spans in the frame drawing the line
 * `primary` (a line drawn in a card of a group's frame), among the drawn lines
 * `axes`: from the topmost to the bottommost cross-section segment of the
 * frame's member lines (`frameMemberLines`; each its cross-section extent,
 * else the point on its line), less each of `cuts`; the pieces in order from
 * the top, none without a length. None where `primary` is drawn in no frame.
 */
export function groupSpans(
  axes: readonly DrawnAxis[],
  primary: DrawnAxis,
  cuts: readonly Span[],
): Span[] {
  if (!inFrame(primary)) return [];
  const ordinates = frameMemberLines(axes, primary.card.item).flatMap(({ line, marker }) => {
    const extent = marker?.crossSection.extent ?? null;
    return extent === null ? [line] : [extent.y1, extent.y2];
  });
  if (ordinates.length === 0) return [];
  let pieces: Span[] = [[Math.min(...ordinates), Math.max(...ordinates)]];
  for (const [low, high] of cuts) {
    pieces = pieces.flatMap(([y1, y2]): Span[] =>
      high <= y1 || low >= y2
        ? [[y1, y2]]
        : [
            [y1, Math.min(y2, low)],
            [Math.max(y1, high), y2],
          ],
    );
  }
  return pieces.filter(([y1, y2]) => y2 > y1);
}

/**
 * The lines of `manifest`'s groupstamps among the drawn lines `axes`, in block
 * coordinates: timestamp by timestamp in the order of `graphical.timestamps`,
 * frame by frame in the order of the lines, for each groupstamp whose
 * cross-section line is listed and displayed (its `AxisTimestamp.line`) and
 * for each line drawn in a card of a group's frame that holds it, vertical
 * `cross_section` elements at the timestamp's abscissa there over the frame's
 * spans (`groupSpans`), less the timestamp's own cross-section line where
 * that has a length and less the lines its stack of labels lies on, so that
 * the line passes behind its labels. Their address is the timestamp's line's,
 * `{id, part: ["line"]}`, and their style that line's, at the frame's scale.
 * They take no room.
 */
export function groupstampElements(
  manifest: Manifest,
  axes: readonly DrawnAxis[],
): VerticalLineElement[] {
  const lines: VerticalLineElement[] = [];
  for (const timestamp of manifest.graphical?.timestamps ?? []) {
    if (!timestamp.groupstamp) continue;
    const address = partAddress(idAddress(timestamp.id), "line");
    for (const axis of axes) {
      if (!inFrame(axis)) continue;
      const held = axis.marker?.timestamps.find((item) => item.id === timestamp.id);
      if (held === undefined || held.line === null) continue;
      const own = axis.marker?.crossSection.extent ?? null;
      const cuts: Span[] = [
        ...(own === null ? [] : [[own.y1, own.y2] as const]),
        ...(held.labels === null ? [] : [held.labels]),
      ];
      for (const [y1, y2] of groupSpans(axes, axis, cuts)) {
        lines.push({ type: "cross_section", address, style: held.line, x: held.x, y1, y2 });
      }
    }
  }
  return lines;
}
