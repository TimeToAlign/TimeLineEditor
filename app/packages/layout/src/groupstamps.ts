/**
 * The lines of the groupstamps: a named timestamp with `groupstamp: true`
 * lies on a group's member, and its line extends across every member of
 * each group having that member, in the group's frame. The members'
 * coordinates and lines derive from the group (the members of a frame share
 * its start and its length, so one abscissa is one proportion of each
 * member's drawn length) and are never stored; they are drawn in the
 * timestamp's own line style, without wedges or labels.
 */

import {
  findTimeline,
  idAddress,
  type Manifest,
  type NamedTimestamp,
  partAddress,
} from "@timetoalign/tilie-core";
import { elementKey } from "@timetoalign/tilie-core/drawing";
import type { DrawnAxis } from "./boxes.ts";
import { scaledStyle } from "./canvas.ts";
import type { Cascade, Style } from "./cascade.ts";
import type { VerticalLineElement } from "./elements.ts";
import { type Holder, shown } from "./traversal.ts";

/** A group's frame as the groupstamps read it: its holder (key and style) and its item's scale. */
export interface FrameHolder {
  readonly holder: Holder;
  readonly scale: number;
}

/**
 * The style of the line of the timestamp `timestamp`, on the member `member`
 * drawn as a root in the frame held by `frame`: the cascade's for the
 * timestamp's line held by the member's line, as the member's own card draws
 * it; undefined where the member's line or the timestamp's line is not
 * displayed.
 */
function lineStyle(
  manifest: Manifest,
  timestamp: NamedTimestamp,
  frame: Holder,
  cascade: Cascade,
): Style | undefined {
  const member = findTimeline(manifest, timestamp.timeline);
  if (member === undefined) return undefined;
  const lineKey = elementKey("timeline", idAddress(member.id), member, frame.key);
  const memberStyle = cascade.resolve(lineKey, frame.style);
  if (!shown(memberStyle)) return undefined;
  const address = partAddress(idAddress(timestamp.id), "line");
  const style = cascade.resolve(elementKey("cross_section", address, member, lineKey), memberStyle);
  return shown(style) ? style : undefined;
}

/** Whether `axis` is the line of the member drawn as the root of a card in the frame of `group`. */
const memberLineIn = (axis: DrawnAxis, group: string): boolean =>
  axis.card.item === group &&
  axis.card.member !== undefined &&
  axis.address.id === axis.card.member &&
  axis.marker !== null;

/**
 * The lines of `manifest`'s groupstamps among the drawn lines `axes`, in block
 * coordinates: timestamp by timestamp in the order of `graphical.timestamps`,
 * group by group in the order of `groups`, for each groupstamp listing
 * `cross_section` in its `display` and for each group having its timeline as
 * a member whose frame `frames` holds (by the group's ID), one vertical line
 * at the abscissa of the timestamp on its timeline's line in that frame,
 * spanning the cross-section segments of every member's line drawn in the
 * frame (each its cross-section extent, else the point on its line), less
 * the timestamp's own cross-section line where that is drawn (so the span
 * may give two lines, above and below it). Its address is the timestamp's
 * line's, `{id, part: ["line"]}`, and its style that line's, at the frame's
 * scale. None where the member's line or the timestamp's line is not
 * displayed, where the timestamp's line is not drawn in the frame, or
 * where a span has no length. They take no room.
 */
export function groupstampElements(
  manifest: Manifest,
  axes: readonly DrawnAxis[],
  cascade: Cascade,
  frames: ReadonlyMap<string, FrameHolder>,
): VerticalLineElement[] {
  const lines: VerticalLineElement[] = [];
  for (const timestamp of manifest.graphical?.timestamps ?? []) {
    if (!timestamp.groupstamp || !timestamp.display.includes("cross_section")) continue;
    for (const group of manifest.groups) {
      const frame = frames.get(group.id);
      if (frame === undefined || !group.members.includes(timestamp.timeline)) continue;
      const style = lineStyle(manifest, timestamp, frame.holder, cascade);
      if (style === undefined) continue;
      const members = axes.filter((axis) => memberLineIn(axis, group.id));
      const marker = members.find((axis) => axis.address.id === timestamp.timeline)?.marker;
      const x = marker?.timestamps.find((item) => item.id === timestamp.id)?.x;
      if (marker === null || marker === undefined || x === undefined) continue;
      const ordinates = members.flatMap(({ line, marker: crossed }) => {
        const extent = crossed?.crossSection ?? null;
        return extent === null ? [line] : [extent.y1, extent.y2];
      });
      const top = Math.min(...ordinates);
      const bottom = Math.max(...ordinates);
      const drawn = marker.crossSection;
      const spans: (readonly [number, number])[] =
        drawn === null
          ? [[top, bottom]]
          : [
              [top, drawn.y1],
              [drawn.y2, bottom],
            ];
      const address = partAddress(idAddress(timestamp.id), "line");
      const scaled = scaledStyle(style, frame.scale);
      for (const [y1, y2] of spans) {
        if (y2 > y1) lines.push({ type: "cross_section", address, style: scaled, x, y1, y2 });
      }
    }
  }
  return lines;
}
