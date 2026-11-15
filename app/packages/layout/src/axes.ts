/**
 * The lines of a drawing for a hit test: where each drawn line and each map
 * drawn at it lies, and what a position on it stands for (`docs/drawing.md`
 * in TimeToShare, sections 3, 6.4 and 8.3).
 */

import { addressKey, placeKeyText, type Real } from "@timetoalign/tilie-core";
import type { NumberType, TimeUnit } from "@timetoalign/timetoshare";
import type { AxisMap, AxisMarker, AxisSegment, DrawnAxis } from "./boxes.ts";
import type { Style } from "./cascade.ts";
import type { Drawing, Point } from "./elements.ts";
import { wedgePoints } from "./geometry.ts";
import { add, negate } from "./numbers.ts";

/** One drawn line of a drawing, in block-local canvas units, with the coordinates it stands for. */
export interface LineAxis {
  /** The ID of the timeline drawn. */
  readonly timeline: string;
  /** The ordinate of its line. */
  readonly y: number;
  /** The abscissas of its start and its end, the reach's where its end is not known. */
  readonly xStart: number;
  readonly xEnd: number;
  /** The coordinate at `xStart` on its timeline's own axis: 0, or an ancestor's where it is clipped. */
  readonly start: Real;
  /** The coordinates from `xStart` to `xEnd`: the end less the start; null where the end is not known. */
  readonly length: Real | null;
  readonly numberType: NumberType;
  readonly unit: TimeUnit;
  /** Its timeline's segments when it is a segment line, each on its own axis. */
  readonly segments: readonly AxisSegment[];
  /** The maps drawn at its line, its own and its segments', in the order they are drawn. */
  readonly maps: readonly AxisMap[];
}

/**
 * Every drawn line of `drawing` (its `axes`, in their order) for a hit test,
 * keyed by the place key text of the card drawing it followed by the address
 * key of its timeline, so that a timeline drawn in two cards has two entries.
 */
/**
 * The key of a drawn line: the place key text of the card drawing it followed by the address key
 * of its timeline.
 */
const axisKey = (axis: DrawnAxis): string => placeKeyText(axis.card) + addressKey(axis.address);

export function lineAxes(drawing: Drawing): ReadonlyMap<string, LineAxis> {
  return new Map(
    drawing.axes.flatMap((axis) => {
      const { id } = axis.address;
      if (id === undefined) return [];
      const line: LineAxis = {
        timeline: id,
        y: axis.line,
        xStart: axis.xStart,
        xEnd: axis.xEnd,
        start: axis.start,
        length: axis.end === null ? null : add(axis.end, negate(axis.start)),
        numberType: axis.numberType,
        unit: axis.unit,
        segments: axis.segments,
        maps: axis.maps,
      };
      return [[axisKey(axis), line]];
    }),
  );
}

/** A cross-section line from `(x, y1)` to `(x, y2)`, in block-local canvas units, and its style. */
export interface CrossSection {
  readonly x: number;
  readonly y1: number;
  readonly y2: number;
  readonly style: Style;
}

/** A wedge's three points (its tip, then its base's corners), in block-local canvas units, and its style. */
export interface WedgeMark {
  readonly points: readonly [Point, Point, Point];
  readonly style: Style;
}

/** The marker of the line keyed `lineKey` (a key of `lineAxes`), null for an ancestor line or no line. */
function markerOf(drawing: Drawing, lineKey: string): AxisMarker | null {
  return drawing.axes.find((axis) => axisKey(axis) === lineKey)?.marker ?? null;
}

/**
 * The cross-section line at the abscissa `x` of the line keyed `lineKey` in
 * `drawing` (a key of `lineAxes`), as a named timestamp of its timeline lying
 * there draws its own (`docs/drawing.md` in TimeToShare, section 6.6,
 * Cross-section lines), with the style of a cross-section line of that
 * timeline that no named timestamp holds; null where the key names no line,
 * or an ancestor line, which draws none.
 */
export function crossSection(drawing: Drawing, lineKey: string, x: number): CrossSection | null {
  const marker = markerOf(drawing, lineKey);
  if (marker === null) return null;
  const { y1, y2, style } = marker.crossSection;
  return { x, y1, y2, style };
}

/**
 * The wedge at the abscissa `x` of the line keyed `lineKey` in `drawing` (a
 * key of `lineAxes`), as a named timestamp of its timeline lying there draws
 * its own (section 6.6, Wedges): in the line's markers band, from where that
 * band starts, or would start were it present; with the style of a wedge of
 * that timeline that no named timestamp holds; null where the key names no
 * line, or an ancestor line, which draws none.
 */
export function wedgeAt(drawing: Drawing, lineKey: string, x: number): WedgeMark | null {
  const marker = markerOf(drawing, lineKey);
  if (marker === null) return null;
  const { style, ...geometry } = marker.wedge;
  return { points: wedgePoints({ x, ...geometry }), style };
}
