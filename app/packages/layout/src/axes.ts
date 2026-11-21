/**
 * The lines of a drawing for a hit test: where each drawn line and each map
 * drawn at it lies, and what a position on it stands for (`docs/drawing.md`
 * in TimeToShare, sections 3, 6.4 and 8.3).
 */

import {
  addressKey,
  type ElementAddress,
  idAddress,
  type PlaceKey,
  placeKeyText,
  type Real,
} from "@timetoalign/tilie-core";
import { toFloat, toRational } from "@timetoalign/tilie-core/numbers";
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
  /** The place key of the card whose member drawing draws it. */
  readonly card: PlaceKey;
  /** The ordinate of its line. */
  readonly y: number;
  /** The abscissas of its start and its end, the reach's where its end is not known. */
  readonly xStart: number;
  readonly xEnd: number;
  /** The coordinate at `xStart` on its timeline's own axis: 0, or an ancestor's where it is clipped. */
  readonly start: Real;
  /** The coordinates from `xStart` to `xEnd`: the end less the start; null where the end is not known. */
  readonly length: Real | null;
  /**
   * The coordinates from `xStart` to `xEnd` as drawn: `length` where the end
   * is known, else up to the reach's (section 3.2), on the scale every line
   * of its member drawing shares.
   */
  readonly drawnLength: Real;
  readonly numberType: NumberType;
  readonly unit: TimeUnit;
  /** Its timeline's segments when it is a segment line, each on its own axis. */
  readonly segments: readonly AxisSegment[];
  /** The maps drawn at its line, its own and its segments', in the order they are drawn. */
  readonly maps: readonly AxisMap[];
}

/**
 * The key of a drawn line: the place key text of the card `card` drawing it followed by the
 * address key of its timeline's address `address`.
 */
const axisKey = (card: PlaceKey, address: ElementAddress): string =>
  placeKeyText(card) + addressKey(address);

/**
 * Every drawn line of `drawing` (its `axes`, in their order) for a hit test,
 * keyed by the place key text of the card drawing it followed by the address
 * key of its timeline, so that a timeline drawn in two cards has two entries.
 */
export function lineAxes(drawing: Drawing): ReadonlyMap<string, LineAxis> {
  return new Map(
    drawing.axes.flatMap((axis) => {
      const { id } = axis.address;
      if (id === undefined) return [];
      const line: LineAxis = {
        timeline: id,
        card: axis.card,
        y: axis.line,
        xStart: axis.xStart,
        xEnd: axis.xEnd,
        start: axis.start,
        length: axis.end === null ? null : add(axis.end, negate(axis.start)),
        drawnLength: add(axis.drawnEnd, negate(axis.start)),
        numberType: axis.numberType,
        unit: axis.unit,
        segments: axis.segments,
        maps: axis.maps,
      };
      return [[axisKey(axis.card, axis.address), line]];
    }),
  );
}

/**
 * The abscissa of the coordinate `position` on the line `axis`'s own axis, in
 * block-local canvas units: `xStart + (position − start) / drawnLength ×
 * (xEnd − xStart)`, the share computed on the exact difference and drawn
 * length, each read as a double; `xStart` where the drawn length is 0. A
 * line of unknown length places a coordinate up to its reach alike, and
 * beyond it on the same scale.
 */
export function abscissaOf(axis: LineAxis, position: Real): number {
  const length = toFloat(toRational(axis.drawnLength));
  const offset = toFloat(toRational(position).subtract(toRational(axis.start)));
  return axis.xStart + (length === 0 ? 0 : offset / length) * (axis.xEnd - axis.xStart);
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

/**
 * The drawn line keyed `lineKey` (a key of `lineAxes`) with where its
 * coordinate markers lie; null where the key names no line, or an ancestor
 * line, which draws none: the one reading of a line's marks and of the
 * extent of its cross-section lines.
 */
function markedLine(
  drawing: Drawing,
  lineKey: string,
): { readonly axis: DrawnAxis; readonly marker: AxisMarker } | null {
  const axis = drawing.axes.find((each) => axisKey(each.card, each.address) === lineKey);
  return axis === undefined || axis.marker === null ? null : { axis, marker: axis.marker };
}

/**
 * The cross-section line at the abscissa `x` of the line keyed `lineKey` in
 * `drawing` (a key of `lineAxes`), as a named timestamp of its timeline lying
 * there draws its own (`docs/drawing.md` in TimeToShare, section 6.6,
 * Cross-section lines): across the line, its children band and its
 * conversion maps band, with the style of a cross-section line of that
 * timeline that no named timestamp holds; null where neither band is
 * present, so that the line has no length, and where the key names no line,
 * or an ancestor line, which draws none.
 */
export function crossSection(drawing: Drawing, lineKey: string, x: number): CrossSection | null {
  const crossing = markedLine(drawing, lineKey)?.marker.crossSection ?? null;
  if (crossing === null) return null;
  const { y1, y2, style } = crossing;
  return { x, y1, y2, style };
}

/**
 * A cross-section segment (section 8.7): the vertical segment from `(x, y1)`
 * to `(x, y2)`, `y1 ≤ y2`, in block-local canvas units, that a cross-section
 * line at `x` spans, drawn or not; the point `(x, y)` on its line, `y1 = y2
 * = y`, where neither the children band nor the conversion maps band of the
 * line is present.
 */
export interface CrossSectionSegment {
  readonly x: number;
  readonly y1: number;
  readonly y2: number;
}

/** The cross-section segment at `x` of the drawn line `axis`, whose marker is `marker`. */
function segmentAt(axis: DrawnAxis, marker: AxisMarker, x: number): CrossSectionSegment {
  const crossing = marker.crossSection;
  return crossing === null
    ? { x, y1: axis.line, y2: axis.line }
    : { x, y1: crossing.y1, y2: crossing.y2 };
}

/**
 * The cross-section segment at the abscissa `x` of the line keyed `lineKey`
 * in `drawing` (a key of `lineAxes`), as a named timestamp of its timeline
 * lying there has it (section 8.7): the extent of the line's cross-section
 * lines, else the point on the line; null where the key names no line, or an
 * ancestor line, which draws none. What `anchorLine` joins.
 */
export function crossSectionSegment(
  drawing: Drawing,
  lineKey: string,
  x: number,
): CrossSectionSegment | null {
  const marked = markedLine(drawing, lineKey);
  return marked === null ? null : segmentAt(marked.axis, marked.marker, x);
}

/**
 * Every cross-section segment of the named timestamp `id` among the drawn
 * lines `axes` (section 8.7): one in every member drawing that draws its
 * timeline's line, or its segment line's for a segment without a line of its
 * own, in the order of the lines, which is the order of their descriptors;
 * none where no line drawn holds it.
 */
export function timestampSegments(axes: readonly DrawnAxis[], id: string): CrossSectionSegment[] {
  return axes.flatMap((axis) => {
    const { marker } = axis;
    if (marker === null) return [];
    return marker.timestamps.flatMap((timestamp) =>
      timestamp.id === id ? [segmentAt(axis, marker, timestamp.x)] : [],
    );
  });
}

/**
 * The lines a cross-section line of the line keyed `lineKey` in `drawing`
 * crosses, as keys of `lineAxes`: that line's first, then those of its
 * timeline's displayed descendants drawn with a line of their own in the
 * same member drawing, in traversal order (section 6.1), every one lying in
 * its children band. A segment without a line of its own is no line: it
 * lies on its segment line's axis (`LineAxis.segments`). None where the key
 * names no line, or an ancestor line.
 */
export function crossedLines(drawing: Drawing, lineKey: string): readonly string[] {
  const marked = markedLine(drawing, lineKey);
  if (marked === null) return [];
  const { axis, marker } = marked;
  return [lineKey, ...marker.descendants.map((id) => axisKey(axis.card, idAddress(id)))];
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
  const marked = markedLine(drawing, lineKey);
  if (marked === null) return null;
  const { style, ...geometry } = marked.marker.wedge;
  return { points: wedgePoints({ x, ...geometry }), style };
}
