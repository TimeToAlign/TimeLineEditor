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
import { groupLinePieces } from "./groupstamps.ts";
import { add, negate } from "./numbers.ts";
import { cut } from "./stacks.ts";

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
   * is known, else up to the reach's (section 3.2), on the scale of its run:
   * one scale per run of an elided card, a root drawn once behind a row
   * taking each anchor's frame's (section 8.8, Drawn once).
   */
  readonly drawnLength: Real;
  readonly numberType: NumberType;
  readonly unit: TimeUnit;
  /** Its timeline's segments when it is a segment line, each on its own axis. */
  readonly segments: readonly AxisSegment[];
  /** The maps drawn at its line, its own and its segments', in the order they are drawn. */
  readonly maps: readonly AxisMap[];
  /** Set where its card is an ancestor card (section 8.8), as `DrawnAxis.ancestor`. */
  readonly ancestor?: { readonly group: string; readonly member: string };
}

/**
 * The key of a drawn line: the place key text of the card `card` drawing it followed by the
 * address key of its timeline's address `address`, and, from a line's second full run between
 * strips on, the run's number.
 */
const axisKey = (card: PlaceKey, address: ElementAddress, run?: number): string =>
  placeKeyText(card) + addressKey(address) + (run === undefined ? "" : `#${run}`);

/** The key of a drawn axis, as `lineAxes` keys it. */
const keyOf = (axis: DrawnAxis): string => axisKey(axis.card, axis.address, axis.run);

/**
 * Every drawn line of `drawing` (its `axes`, in their order) for a hit test,
 * keyed by the place key text of the card drawing it followed by the address
 * key of its timeline, so that a timeline drawn in two cards has two entries;
 * the lines of an ancestor card (section 8.8) come last and are marked so.
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
        ...(axis.ancestor === undefined ? {} : { ancestor: axis.ancestor }),
      };
      return [[keyOf(axis), line]];
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
  const axis = drawing.axes.find((each) => keyOf(each) === lineKey);
  return axis === undefined || axis.marker === null ? null : { axis, marker: axis.marker };
}

/**
 * The cross-section line at the abscissa `x` of the line keyed `lineKey` in
 * `drawing` (a key of `lineAxes`), as a named timestamp of its timeline
 * lying there draws its own (`docs/drawing.md` in TimeToShare, section 6.6,
 * Cross-section lines): across the card drawing the line, from its top to
 * its bottom, less the gap where the line's wedge stands (`AxisMarker`), up
 * to two pieces from the top, with the style of a cross-section line of
 * that timeline that no named timestamp holds; none where the key names no
 * line, or an ancestor line, which draws none.
 */
export function crossSection(drawing: Drawing, lineKey: string, x: number): CrossSection[] {
  const crossing = markedLine(drawing, lineKey)?.marker.crossSection;
  if (crossing === undefined) return [];
  const { span, gap, style } = crossing;
  return cut([span.y1, span.y2], gap === null ? null : [gap.y1, gap.y2]).map(([y1, y2]) => ({
    x,
    y1,
    y2,
    style,
  }));
}

/**
 * The lines a groupstamp lying at the abscissa `x` of the line keyed
 * `lineKey` in `drawing` (a key of `lineAxes`) draws across the frame
 * holding that line's card, as a named groupstamp of its timeline lying there
 * draws them (`groupstampElements`): the pieces of `groupLinePieces`, which
 * leave out the line's own card and fade the pieces over a member card where
 * the group gives no coordinate, with the style of a cross-section line of
 * that timeline that no named timestamp holds; none where the line's card is
 * held by no frame, and where the key names no line, or an ancestor line.
 */
export function groupCrossSections(drawing: Drawing, lineKey: string, x: number): CrossSection[] {
  const marked = markedLine(drawing, lineKey);
  if (marked === null) return [];
  return groupLinePieces(
    drawing.axes,
    drawing.boxes,
    marked.axis,
    marked.marker.crossSection.style,
  ).map(({ y1, y2, style }) => ({ x, y1, y2, style }));
}

/**
 * A cross-section segment (section 8.7): the vertical segment from `(x, y1)`
 * to `(x, y2)`, `y1 ≤ y2`, in block-local canvas units, that a cross-section
 * line at `x` spans, drawn or not: from the top of the card drawing its line
 * to the card's bottom, its gap included.
 */
export interface CrossSectionSegment {
  readonly x: number;
  readonly y1: number;
  readonly y2: number;
}

/**
 * The cross-section segment at the abscissa `x` of the line keyed `lineKey`
 * in `drawing` (a key of `lineAxes`), as a named timestamp of its timeline
 * lying there has it (section 8.7): the span of the card drawing the line;
 * null where the key names no line, or an ancestor line, which draws none.
 * What `anchorLine` joins.
 */
export function crossSectionSegment(
  drawing: Drawing,
  lineKey: string,
  x: number,
): CrossSectionSegment | null {
  const span = markedLine(drawing, lineKey)?.marker.crossSection.span;
  return span === undefined ? null : { x, y1: span.y1, y2: span.y2 };
}

/**
 * Every cross-section segment of the named timestamp `id` among the drawn
 * lines `axes` (section 8.7): one in every member drawing that draws its
 * timeline's line, or its segment line's for a segment without a line of its
 * own, or draws its timeline as an ancestor line and the timestamp on it, in
 * the order of the lines, which is the order of their descriptors; none in
 * an ancestor card, which gives an alignment anchor no segment (section
 * 8.8), and none where no line drawn holds it.
 */
export function timestampSegments(axes: readonly DrawnAxis[], id: string): CrossSectionSegment[] {
  return axes.flatMap((axis) =>
    axis.ancestor !== undefined
      ? []
      : axis.timestamps.flatMap((timestamp) =>
          timestamp.id === id
            ? [{ x: timestamp.x, y1: timestamp.segment.y1, y2: timestamp.segment.y2 }]
            : [],
        ),
  );
}

/**
 * The lines a cross-section line of the line keyed `lineKey` in `drawing`
 * crosses, as keys of `lineAxes`: that line's first, then those of its
 * timeline's displayed descendants drawn with a line of their own in the
 * same member drawing, in traversal order (section 6.1), every one lying in
 * its children band, each with every full run it is drawn in between
 * strips, from the left. A segment without a line of its own is no line: it
 * lies on its segment line's axis (`LineAxis.segments`). None where the key
 * names no line, or an ancestor line.
 */
export function crossedLines(drawing: Drawing, lineKey: string): readonly string[] {
  const marked = markedLine(drawing, lineKey);
  if (marked === null) return [];
  const { axis, marker } = marked;
  const runs = runsOf(drawing);
  return [
    lineKey,
    ...marker.descendants.flatMap((id) => {
      const first = axisKey(axis.card, idAddress(id));
      return runs.get(first) ?? [first];
    }),
  ];
}

const runKeys = new WeakMap<Drawing, ReadonlyMap<string, readonly string[]>>();

/**
 * The keys of every drawn line of `drawing` by the key of its first run: a
 * line drawn in runs between strips has one per run, from the left; memoised
 * by the drawing.
 */
function runsOf(drawing: Drawing): ReadonlyMap<string, readonly string[]> {
  const known = runKeys.get(drawing);
  if (known !== undefined) return known;
  const runs = new Map<string, string[]>();
  for (const axis of drawing.axes) {
    const first = axisKey(axis.card, axis.address);
    const keys = runs.get(first);
    if (keys === undefined) runs.set(first, [keyOf(axis)]);
    else keys.push(keyOf(axis));
  }
  runKeys.set(drawing, runs);
  return runs;
}

/**
 * The wedge at the abscissa `x` of the line keyed `lineKey` in `drawing` (a
 * key of `lineAxes`), as a named timestamp of its timeline lying there draws
 * its own (section 6.6, Wedges): in the line's markers band, from where that
 * band starts, or would start were it present; with the style of a wedge of
 * that timeline that no named timestamp holds, turned by that style's
 * `rotation` (a rule on the band's wedges, never one naming addresses). An
 * ancestor line (section 8.3), which draws no
 * named timestamp, has the mark its marks are drawn as (`DrawnAxis.mark`):
 * always above the line, its tip on the line's edge, with the style of a
 * wedge held by the ancestor line that no named timestamp holds and that
 * style's `rotation`, so that it is faded as the marks are and no rule on
 * the marks of the member's start and end changes it. Null where the key
 * names no line.
 */
export function wedgeAt(drawing: Drawing, lineKey: string, x: number): WedgeMark | null {
  const axis = drawing.axes.find((each) => keyOf(each) === lineKey);
  const wedge = axis?.marker?.wedge ?? axis?.mark;
  if (wedge === undefined || wedge === null) return null;
  const { style, ...geometry } = wedge;
  return { points: wedgePoints({ x, ...geometry }), style };
}
