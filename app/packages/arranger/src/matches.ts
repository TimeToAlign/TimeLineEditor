/**
 * Show matches: the potential MatchStamps of the MatchClaim table drawn over
 * a block, what the pointer hovers among them, the flag of one, and the
 * colours of the alignment anchors and match timestamps of the MatchStamps
 * shown: by the editor user's belief in the MatchClaims stating each anchor,
 * and all red for a named MatchStamp out of date.
 *
 * Every coordinate of the table's anchor index (core's `anchorIndexOf`) is
 * drawn where a named timestamp at it would draw its cross-section line, on
 * every line its timeline is seen on (`seenOn`), and every anchor as the
 * line layout draws a named one's (`anchorLine` between two cross-section
 * segments, `crossSectionSegment`): no second geometry. A coordinate's
 * float position, the index's sort and hit-test key, places it; an exact
 * value is read only for the flag. What is drawn follows the view: of the
 * coordinates in view, at most one per device pixel column of a card, each
 * found by a binary search from the column before, so the cost follows the
 * viewport and never the size of the table.
 */

import type {
  AnchorBelief,
  AnchorIndex,
  Manifest,
  MatchStampCheck,
  TimelineManifest,
} from "@timetoalign/tilie-core";
import {
  addressKey,
  anchorBelief,
  coordinateNear,
  coordinatesWithin,
  coordinateValue,
  findTimeline,
  idAddress,
  matchStampAnchors,
  matchStampMembers,
  namedAsGroupstamp,
  partAddress,
  placeKeyText,
  prettyText,
} from "@timetoalign/tilie-core";
import type { CoordinateValue } from "@timetoalign/tilie-core/numbers";
import { toFloat, toRational } from "@timetoalign/tilie-core/numbers";
import type { CrossSectionSegment, Drawing } from "@timetoalign/tilie-layout";
import {
  anchorLine,
  crossSectionSegment,
  groupCrossSections,
  lineAxes,
} from "@timetoalign/tilie-layout";
import { attributeText } from "@timetoalign/tilie-writers";
import { placesAt, seenOn } from "./coordinates.ts";
import type { Point } from "./gesture.ts";

/**
 * A named MatchStamp of a block's manifest compared with the current table
 * (core's `checkMatchStamp`): `stated` follows the order of its
 * `alignment_anchors`.
 */
export interface NamedComparison {
  readonly id: string;
  readonly comparison: MatchStampCheck;
}

/**
 * What "Show matches" draws in one block: the anchor index of the MatchClaim
 * table loaded for block `block` (its potential MatchStamps, under the
 * block's MatchClaim filter), the block's named MatchStamps compared with
 * the table, and the editor user's belief in each MatchClaim of the table
 * (per row, core's `believedBy`), which the anchors of the MatchStamps shown
 * are drawn by; without `beliefs` (a host without a user) every MatchClaim
 * is undecided.
 */
export interface MatchOverlayInput {
  readonly block: string;
  readonly index: AnchorIndex;
  readonly named: readonly NamedComparison[];
  readonly beliefs?: Uint8Array;
}

/**
 * A pinned potential MatchStamp: the block whose table holds it and its
 * number in that table's index. Every block's table numbers its own
 * MatchStamps from 0, so a number alone names none.
 */
export interface MatchStampPin {
  readonly block: string;
  readonly matchStamp: number;
}

/** No block with a table: what the canvas draws from by default. */
export const NO_TABLES: readonly MatchOverlayInput[] = [];

/** The potential MatchStamps' lines and connectors: light grey, 70 % opaque, width 1, dash 3 3. */
export const POTENTIAL_STROKE = "#C8C8C8";
export const POTENTIAL_OPACITY = 0.7;
/** The hovered MatchStamp's. */
export const HOVERED_STROKE = "#6E6E6E";
/** The pinned MatchStamp's: the blue of a cross-section line (TimeToShare's `docs/drawing.md`, section 6.6). */
export const PINNED_STROKE = "#1BA1E2";
/**
 * An alignment anchor of a shown MatchStamp (the pinned one, a named one)
 * by the editor user's belief in the MatchClaims stating it (core's
 * `anchorBelief`): undecided the cross-section blue, true green, unlikely
 * dark orange, false red, whatever the anchor's style. The green and the
 * orange lie between the blue and the red in luminance, each at least 3:1
 * against the white of a card and the canvas's dark `#1A1D23`.
 */
export const UNDECIDED_STROKE = PINNED_STROKE;
export const TRUE_STROKE = "#339933";
export const UNLIKELY_STROKE = "#E07000";
export const FALSE_STROKE = "#E51400";
export const BELIEF_STROKES: Readonly<Record<AnchorBelief, string>> = {
  false: FALSE_STROKE,
  unlikely: UNLIKELY_STROKE,
  undecided: UNDECIDED_STROKE,
  true: TRUE_STROKE,
};
/**
 * A named MatchStamp out of date (core's `checkMatchStamp`): its anchors'
 * lines, its match timestamps' lines and its name label, whatever their
 * style; the label begins with `OUT_OF_DATE_MARK`.
 */
export const OUT_OF_DATE_STROKE = FALSE_STROKE;
export const OUT_OF_DATE_MARK = "! ";
export const MATCH_STROKE_WIDTH = 1;
export const MATCH_DASH = "3 3";

/**
 * What "Show matches" says while it has no table to show, where its host
 * says nothing more: the canvas knows only that no table is loaded, never
 * why.
 */
export const NO_MATCHES = "No MatchClaim table loaded.";

/**
 * A line of a drawing holding a timeline of the index, as floats: where its
 * coordinates lie and how far its cross-section lines reach.
 */
export interface MatchLine {
  /** The key of the line in `lineAxes`. */
  readonly key: string;
  /** The place key text of the card drawing it. */
  readonly card: string;
  /** The timeline's number in the index. */
  readonly timeline: number;
  readonly xStart: number;
  readonly xEnd: number;
  /** The line's ordinate. */
  readonly y: number;
  /** The extent of its cross-section lines (`crossSectionSegment`): the line's ordinate twice without one. */
  readonly y1: number;
  readonly y2: number;
  /** The coordinate at `xStart` on the line's own axis. */
  readonly start: number;
  /** The coordinates from `xStart` to `xEnd` as drawn (layout's `drawnLength`); 0 where it draws none. */
  readonly length: number;
  /** Where the timeline's zero lies on the line's axis: 0, or a segment's offset. */
  readonly offset: number;
  /** The positions on the timeline's own axis the line draws, both included. */
  readonly from: number;
  readonly to: number;
}

/**
 * The abscissa of `position`, on `line`'s timeline's own axis, in
 * block-local canvas units, as layout's `abscissaOf` computes it in
 * doubles: `xStart + (position + offset − start) / length × (xEnd −
 * xStart)`; `xStart` on a line of no drawn length.
 */
export function abscissa(line: MatchLine, position: number): number {
  const share = line.length === 0 ? 0 : (position + line.offset - line.start) / line.length;
  return line.xStart + share * (line.xEnd - line.xStart);
}

/** The position on `line`'s timeline's own axis at the abscissa `x`. */
function positionAt(line: MatchLine, x: number): number {
  return line.length === 0
    ? line.start - line.offset
    : line.start + ((x - line.xStart) / (line.xEnd - line.xStart)) * line.length - line.offset;
}

/** Positions on `line`'s timeline's own axis per canvas unit; 0 on a line of no drawn length. */
function perUnit(line: MatchLine): number {
  return line.length === 0 ? 0 : line.length / (line.xEnd - line.xStart);
}

/** The lines of a drawing for one index, all of them and by the index's timeline number. */
export interface MatchLines {
  /** The drawing they were read from. */
  readonly drawing: Drawing;
  /** The root whose ancestor cards were raised as they were read (`raisedRoot`), else `null`. */
  readonly raised: string | null;
  readonly all: readonly MatchLine[];
  readonly byTimeline: ReadonlyMap<number, readonly MatchLine[]>;
}

const linesByDrawing = new WeakMap<
  Drawing,
  { index: AnchorIndex; raised: string | null; lines: MatchLines }
>();

/**
 * The lines of `drawing` holding a timeline of `index` (matched by ID), once
 * per drawing, index and raised root: for every timeline the parts of the
 * lines it is seen on (`seenOn`, `raised` the root whose ancestor cards are
 * raised, `raisedRoot` of the block's editor, none by default: an
 * ancestor card's line only for a timeline no other line holds, and there
 * only beyond the frames and member cards drawn over it, its ancestor lines
 * in its members' cards in between), in the drawing's order of its lines, a
 * timeline of the index before a later one on one line, the parts of one
 * line left to right. A line of its own draws its drawn span; a segment's
 * line the part of it the segment covers; a part of a line the positions
 * from its left end to its right end. On an ancestor line a coordinate's
 * line spans the cross-section of the member's line it lies above.
 */
export function matchLinesOf(
  drawing: Drawing,
  index: AnchorIndex,
  raised: string | null = null,
): MatchLines {
  const known = linesByDrawing.get(drawing);
  if (known?.index === index && known.raised === raised) return known.lines;
  const rank = new Map([...lineAxes(drawing).keys()].map((key, at) => [key, at]));
  const found: MatchLine[] = [];
  for (const [id, timeline] of index.timelineNumbers) {
    for (const seen of seenOn(drawing, id, raised)) {
      const { key, axis, offset, length } = seen;
      const start = toFloat(toRational(axis.start));
      const drawnLength = toFloat(toRational(axis.drawnLength));
      const width = axis.xEnd - axis.xStart;
      const zero = toFloat(offset);
      const segment = crossSectionSegment(drawing, seen.section, axis.xStart);
      const end = length === null ? Number.POSITIVE_INFINITY : zero + toFloat(length);
      const line: MatchLine = {
        key,
        card: placeKeyText(axis.card),
        timeline,
        xStart: axis.xStart,
        xEnd: axis.xEnd,
        y: axis.y,
        y1: segment?.y1 ?? axis.y,
        y2: segment?.y2 ?? axis.y,
        start,
        length: drawnLength > 0 && width > 0 ? drawnLength : 0,
        offset: zero,
        from: Math.max(start, zero) - zero,
        to: Math.min(start + drawnLength, end) - zero,
      };
      if (seen.xFrom === axis.xStart && seen.xTo === axis.xEnd) {
        found.push(line);
        continue;
      }
      const from = Math.max(line.from, positionAt(line, seen.xFrom));
      const to = Math.min(line.to, positionAt(line, seen.xTo));
      if (from <= to) found.push({ ...line, from, to });
    }
  }
  found.sort(
    (left, right) =>
      (rank.get(left.key) ?? 0) - (rank.get(right.key) ?? 0) || left.timeline - right.timeline,
  );
  const byTimeline = new Map<number, MatchLine[]>();
  for (const line of found) {
    byTimeline.set(line.timeline, [...(byTimeline.get(line.timeline) ?? []), line]);
  }
  const lines = { drawing, raised, all: found, byTimeline };
  linesByDrawing.set(drawing, { index, raised, lines });
  return lines;
}

/** A coordinate's cross-section line as the overlay draws it, in block-local canvas units. */
export interface OverlayLine {
  readonly coordinate: number;
  readonly x: number;
  readonly y1: number;
  readonly y2: number;
}

/** An anchor's connector as the overlay draws it, in block-local canvas units. */
export interface OverlayConnector {
  readonly anchor: number;
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

/** What the overlay draws in one block. */
export interface MatchOverlay {
  readonly lines: readonly OverlayLine[];
  readonly connectors: readonly OverlayConnector[];
}

/** The canvas as seen: the viewport, the canvas's size in CSS pixels and the device pixels per CSS pixel. */
export interface Screen {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
  readonly width: number;
  readonly height: number;
  readonly ratio: number;
}

/** A block's node on the canvas: its top-left corner and its scale. */
export interface Placed {
  readonly origin: Point;
  readonly scale: number;
}

/** The lines whose drawn part holds coordinate `coordinate`, each with its abscissa there. */
function placesOf(
  index: AnchorIndex,
  lines: MatchLines,
  coordinate: number,
): { readonly line: MatchLine; readonly x: number }[] {
  const position = index.coordinates.position[coordinate] as number;
  const held = lines.byTimeline.get(index.coordinates.timeline[coordinate] as number) ?? [];
  return held.flatMap((line) =>
    position >= line.from && position <= line.to ? [{ line, x: abscissa(line, position) }] : [],
  );
}

/** The cross-section segments of coordinate `coordinate` on the lines holding it. */
function segmentsOf(
  index: AnchorIndex,
  lines: MatchLines,
  coordinate: number,
): CrossSectionSegment[] {
  return placesOf(index, lines, coordinate).map(({ line, x }) => ({ x, y1: line.y1, y2: line.y2 }));
}

/** The connector of anchor `anchor` (`anchorLine`), `null` where it has no length or an end is not drawn. */
function connectorOf(
  index: AnchorIndex,
  lines: MatchLines,
  anchor: number,
): OverlayConnector | null {
  const line = anchorLine(
    segmentsOf(index, lines, index.anchors.low[anchor] as number),
    segmentsOf(index, lines, index.anchors.high[anchor] as number),
  );
  if (line === null || (line.x1 === line.x2 && line.y1 === line.y2)) return null;
  return { anchor, ...line };
}

/** The connectors of `anchors`, each once. */
function connectorsOf(
  index: AnchorIndex,
  lines: MatchLines,
  anchors: Iterable<number>,
): OverlayConnector[] {
  const found: OverlayConnector[] = [];
  for (const anchor of anchors) {
    const connector = connectorOf(index, lines, anchor);
    if (connector !== null) found.push(connector);
  }
  return found;
}

/**
 * What the overlay draws of `index` in a block, its lines `lines` (`matchLinesOf`)
 * and its node `placed`, on `screen`: on every line, the coordinates whose
 * abscissa lies in view on the line's drawn part, the line's cross-section
 * extent meeting the view, at most one per device pixel column of the
 * card (the first in the drawing's order of lines, then by position, takes
 * the column); then every anchor of a drawn coordinate, each once, joined
 * to its other coordinate wherever the block draws it. A column is `⌊(screen.x
 * + (origin.x + x · scale) · zoom) · ratio⌋`; after a coordinate the next one
 * looked at is the first at or past the next column.
 */
export function overlayOf(
  index: AnchorIndex,
  lines: MatchLines,
  placed: Placed,
  screen: Screen,
): MatchOverlay {
  const { origin, scale } = placed;
  const { zoom, ratio } = screen;
  const localX = (pixel: number) => ((pixel - screen.x) / zoom - origin.x) / scale;
  const localY = (pixel: number) => ((pixel - screen.y) / zoom - origin.y) / scale;
  const columnOf = (x: number) => Math.floor((screen.x + (origin.x + x * scale) * zoom) * ratio);
  const left = localX(0);
  const right = localX(screen.width);
  const top = localY(0);
  const bottom = localY(screen.height);
  const columns = Math.ceil(screen.width * ratio) + 1;
  const used = new Map<string, Uint8Array>();
  const positions = index.coordinates.position;
  const drawn: OverlayLine[] = [];
  for (const line of lines.all) {
    if (line.y2 < top || line.y1 > bottom) continue;
    const xl = Math.max(line.xStart, left);
    const xr = Math.min(line.xEnd, right);
    if (xl > xr) continue;
    const from = line.length === 0 ? line.from : Math.max(line.from, positionAt(line, xl));
    const to = line.length === 0 ? line.to : Math.min(line.to, positionAt(line, xr));
    if (from > to) continue;
    let taken = used.get(line.card);
    if (taken === undefined) {
      taken = new Uint8Array(columns);
      used.set(line.card, taken);
    }
    let [c, end] = coordinatesWithin(index, line.timeline, from, to);
    while (c < end) {
      const x = abscissa(line, positions[c] as number);
      const column = columnOf(x);
      if (column >= columns) break;
      if (column >= 0 && taken[column] === 0) {
        taken[column] = 1;
        drawn.push({ coordinate: c, x, y1: line.y1, y2: line.y2 });
      }
      const next = coordinatesWithin(
        index,
        line.timeline,
        positionAt(line, localX((column + 1) / ratio)),
        to,
      )[0];
      c = Math.max(next, c + 1);
    }
  }
  const { offsets, anchors } = index.neighbours;
  const seen = new Set<number>();
  for (const { coordinate } of drawn) {
    for (
      let at = offsets[coordinate] as number;
      at < (offsets[coordinate + 1] as number);
      at += 1
    ) {
      seen.add(anchors[at] as number);
    }
  }
  return { lines: drawn, connectors: connectorsOf(index, lines, seen) };
}

/** Whether naming would store a coordinate of an index as a groupstamp, by the coordinate's number. */
export type GroupstampAt = (coordinate: number) => boolean;

/**
 * Whether naming a MatchStamp in `manifest` would store each coordinate of
 * `index` as a groupstamp (core's `namedAsGroupstamp`: the `groupstamp` of
 * the match timestamp `manifest` holds there, else whether its timeline is a
 * member of a group).
 */
export function namedGroupstamps(manifest: Manifest, index: AnchorIndex): GroupstampAt {
  return (coordinate) => {
    const timeline = index.columns.timelines[index.coordinates.timeline[coordinate] as number];
    return (
      timeline !== undefined &&
      namedAsGroupstamp(manifest, timeline.id, coordinateValue(index, coordinate))
    );
  };
}

/**
 * Every line and connector of the potential MatchStamp `stamp` in a block,
 * as a named one would draw them: each of its coordinates on every line
 * holding it, and where `groupstampAt` says naming would store it as a
 * groupstamp, after each such line the lines layout's `groupCrossSections`
 * draws across the frame holding that line's card (none on a line in no
 * frame); then each of its anchors. Without `groupstampAt` no coordinate is
 * taken for a groupstamp. Nothing for a number the index does not have.
 */
export function stampOverlay(
  index: AnchorIndex,
  lines: MatchLines,
  stamp: number,
  groupstampAt?: GroupstampAt,
): MatchOverlay {
  if (!Number.isInteger(stamp) || stamp < 0 || stamp >= index.matchStamps.count) {
    return { lines: [], connectors: [] };
  }
  const drawn: OverlayLine[] = [];
  for (const coordinate of matchStampMembers(index, stamp)) {
    const across = groupstampAt?.(coordinate) === true;
    for (const { line, x } of placesOf(index, lines, coordinate)) {
      drawn.push({ coordinate, x, y1: line.y1, y2: line.y2 });
      if (!across) continue;
      for (const { y1, y2 } of groupCrossSections(lines.drawing, line.key, x)) {
        drawn.push({ coordinate, x, y1, y2 });
      }
    }
  }
  return { lines: drawn, connectors: connectorsOf(index, lines, matchStampAnchors(index, stamp)) };
}

/** What the pointer hovers among the potential MatchStamps of a block. */
export interface MatchHit {
  /** The potential MatchStamp hovered. */
  readonly stamp: number;
  /** The coordinate whose line is hovered, or the anchor whose connector is. */
  readonly coordinate: number | null;
  readonly anchor: number | null;
  /** The distance from the pointer to it, in block-local canvas units. */
  readonly distance: number;
  /** Where the flag's pole stands: its abscissa, its foot and its top, in block-local canvas units. */
  readonly at: { readonly x: number; readonly y: number; readonly top: number };
}

/** The point of the segment from `(x1, y1)` to `(x2, y2)` nearest to `point`. */
function nearestOn(connector: OverlayConnector, point: Point): Point {
  const { x1, y1, x2, y2 } = connector;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const t = Math.min(
    Math.max(((point.x - x1) * dx + (point.y - y1) * dy) / (dx * dx + dy * dy), 0),
    1,
  );
  return { x: x1 + t * dx, y: y1 + t * dy };
}

/**
 * What `point` (block-local) hovers within `tolerance` canvas units: of
 * every line's nearest coordinate (core's `coordinateNear`, whatever was
 * drawn) lying on the part of the line `lines` holds (`matchLinesOf`: where
 * the timeline is seen, so never where its line is covered) whose
 * cross-section line, from `y1` to `y2`, lies within the tolerance, and of
 * every connector drawn (`connectors`, the overlay's),
 * the nearest by Euclidean distance, a line before a connector and an
 * earlier one before a later on a tie; `null` where none is near.
 */
export function matchHitAt(
  index: AnchorIndex,
  lines: MatchLines,
  connectors: readonly OverlayConnector[],
  point: Point,
  tolerance: number,
): MatchHit | null {
  let best: MatchHit | null = null;
  const stampOf = index.matchStamps.of;
  for (const line of lines.all) {
    if (point.x < line.xStart - tolerance || point.x > line.xEnd + tolerance) continue;
    const dy = point.y < line.y1 ? line.y1 - point.y : point.y > line.y2 ? point.y - line.y2 : 0;
    if (dy > tolerance) continue;
    const near = coordinateNear(
      index,
      line.timeline,
      positionAt(line, point.x),
      tolerance * perUnit(line),
    );
    if (near < 0) continue;
    const position = index.coordinates.position[near] as number;
    if (position < line.from || position > line.to) continue;
    const x = abscissa(line, position);
    const distance = Math.hypot(x - point.x, dy);
    if (distance > tolerance || (best !== null && distance >= best.distance)) continue;
    best = {
      stamp: stampOf[near] as number,
      coordinate: near,
      anchor: null,
      distance,
      at: { x, y: line.y, top: line.y1 },
    };
  }
  for (const connector of connectors) {
    const nearest = nearestOn(connector, point);
    const distance = Math.hypot(nearest.x - point.x, nearest.y - point.y);
    if (distance > tolerance || (best !== null && distance >= best.distance)) continue;
    best = {
      stamp: stampOf[index.anchors.low[connector.anchor] as number] as number,
      coordinate: null,
      anchor: connector.anchor,
      distance,
      at: { x: nearest.x, y: nearest.y, top: nearest.y },
    };
  }
  return best;
}

/** One timestamp of a MatchStamp's flag: its coordinate's number and value as the flag writes it. */
export interface MatchFlagRow {
  readonly coordinate: number;
  readonly text: string;
}

/** One timeline of a MatchStamp's flag: its ID, its name and its timestamps. */
export interface MatchFlagGroup {
  readonly timeline: string;
  readonly name: string;
  readonly rows: readonly MatchFlagRow[];
}

/** A coordinate as screen order reads it: a timeline's ID and a value on that timeline's own axis. */
export interface ScreenCoordinate {
  readonly timeline: string;
  readonly value: CoordinateValue;
}

/**
 * Where `coordinate` shows first in `drawing`, in block-local canvas units,
 * `raised` naming the root whose ancestor cards are raised (`raisedRoot`),
 * else `null`: of its places (`placesAt`: where the user sees a line of its
 * timeline at its value, the parts "Show matches" draws it on), the
 * topmost, then the leftmost; `null` where it has none.
 */
export function screenPlace(
  drawing: Drawing,
  coordinate: ScreenCoordinate,
  raised: string | null = null,
): Point | null {
  let best: Point | null = null;
  for (const { axis, x } of placesAt(
    drawing,
    coordinate.timeline,
    toRational(coordinate.value),
    raised,
  )) {
    if (best === null || axis.y < best.y || (axis.y === best.y && x < best.x)) {
      best = { x, y: axis.y };
    }
  }
  return best;
}

/**
 * Screen order of two places (`screenPlace`): top to bottom, then left to
 * right; a place not drawn (`null`) after every drawn one. Negative where
 * `left` comes first, positive where `right` does, 0 for one place.
 */
export function screenOrder(left: Point | null, right: Point | null): number {
  if (left === null || right === null) return left === null ? (right === null ? 0 : 1) : -1;
  return left.y - right.y || left.x - right.x;
}

/**
 * `items` in screen order (`screenOrder` of each one's `screenPlace` in
 * `drawing` with `raised`, `coordinateOf` giving its coordinate); items at
 * one place, or none drawn, keep their given order. The one screen order of
 * the flag of a potential MatchStamp and of the coordinates and alignment
 * anchors of a MatchStamp wherever it is listed or named.
 */
export function inScreenOrder<T>(
  drawing: Drawing,
  items: readonly T[],
  coordinateOf: (item: T) => ScreenCoordinate,
  raised: string | null = null,
): T[] {
  return items
    .map((item) => ({ item, place: screenPlace(drawing, coordinateOf(item), raised) }))
    .sort((left, right) => screenOrder(left.place, right.place))
    .map(({ item }) => item);
}

/**
 * The flag of the potential MatchStamp `stamp`: one group per timeline,
 * named as `manifest` names it (its ID where it holds none), each of its
 * coordinates a row written as core's `prettyText` with `decimals` places,
 * in the timeline's unit; groups and rows in screen order (`inScreenOrder`
 * over the drawing `lines` were read from, with the root raised as they
 * were read, a group by its first row), what
 * the block does not draw last, in the index's order.
 */
export function matchFlag(
  index: AnchorIndex,
  manifest: Manifest,
  lines: MatchLines,
  stamp: number,
  decimals: number,
): MatchFlagGroup[] {
  const members = inScreenOrder(
    lines.drawing,
    [...matchStampMembers(index, stamp)],
    (c) => ({
      timeline: index.columns.timelines[index.coordinates.timeline[c] as number]?.id ?? "",
      value: coordinateValue(index, c),
    }),
    lines.raised,
  );
  const groups = new Map<number, MatchFlagRow[]>();
  for (const coordinate of members) {
    const timeline = index.coordinates.timeline[coordinate] as number;
    const claimed = index.columns.timelines[timeline];
    const found: TimelineManifest | undefined =
      claimed === undefined ? undefined : findTimeline(manifest, claimed.id);
    const text = prettyText(
      coordinateValue(index, coordinate),
      found?.number_type ?? claimed?.numberType ?? "float",
      found?.unit ?? null,
      decimals,
    );
    groups.set(timeline, [...(groups.get(timeline) ?? []), { coordinate, text }]);
  }
  return [...groups].map(([timeline, rows]) => {
    const id = index.columns.timelines[timeline]?.id ?? "";
    return { timeline: id, name: findTimeline(manifest, id)?.name ?? id, rows };
  });
}

/** A part of a MatchStamp shown in one colour: its connectors by belief, with the lines in blue. */
export interface BeliefOverlay {
  /** The belief its connectors are drawn by; `undecided` holds the cross-section lines too. */
  readonly belief: AnchorBelief;
  readonly stroke: string;
  readonly overlay: MatchOverlay;
}

/** The order the colours of a MatchStamp are drawn in, the most critical last, on top. */
const DRAWN_BELIEFS: readonly AnchorBelief[] = ["true", "undecided", "unlikely", "false"];

const pinnedByOverlay = new WeakMap<
  MatchOverlay,
  { readonly beliefs: Uint8Array | undefined; readonly parts: readonly BeliefOverlay[] }
>();

/**
 * The pinned MatchStamp `overlay` (`stampOverlay` of `index`) by colour: its
 * cross-section lines in the cross-section blue, each connector by the
 * belief in the MatchClaims stating its anchor (`anchorBelief` over
 * `beliefs`, every one undecided without them); a part per colour that has
 * anything, true first and false last. Once per overlay and beliefs.
 */
export function pinnedOverlays(
  index: AnchorIndex,
  overlay: MatchOverlay,
  beliefs: Uint8Array | undefined,
): readonly BeliefOverlay[] {
  const known = pinnedByOverlay.get(overlay);
  if (known !== undefined && known.beliefs === beliefs) return known.parts;
  const { claimOffsets, claimRows } = index.anchors;
  const byBelief = new Map<AnchorBelief, OverlayConnector[]>();
  for (const connector of overlay.connectors) {
    const { anchor } = connector;
    const belief =
      beliefs === undefined
        ? "undecided"
        : anchorBelief(
            beliefs,
            claimRows.subarray(claimOffsets[anchor] as number, claimOffsets[anchor + 1] as number),
          );
    const same = byBelief.get(belief);
    if (same === undefined) byBelief.set(belief, [connector]);
    else same.push(connector);
  }
  const parts = DRAWN_BELIEFS.flatMap((belief): BeliefOverlay[] => {
    const lines = belief === "undecided" ? overlay.lines : [];
    const connectors = byBelief.get(belief) ?? [];
    if (lines.length === 0 && connectors.length === 0) return [];
    return [{ belief, stroke: BELIEF_STROKES[belief], overlay: { lines, connectors } }];
  });
  pinnedByOverlay.set(overlay, { beliefs, parts });
  return parts;
}

/** How a drawn part of a named MatchStamp is painted over its style. */
export interface Paint {
  /** What it sets: a line's stroke, a label's fill. */
  readonly attribute: "stroke" | "fill";
  readonly colour: string;
  /** Whether its text begins with `OUT_OF_DATE_MARK`. */
  readonly marked: boolean;
}

/** The paint of a block's named MatchStamps' drawn parts, by the key of each part's address. */
export type MatchPaint = ReadonlyMap<string, Paint>;

/** No paint: a block without a table. */
export const NO_PAINT: MatchPaint = new Map();

const paintByNamed = new WeakMap<
  readonly NamedComparison[],
  {
    readonly manifest: Manifest;
    readonly beliefs: Uint8Array | undefined;
    readonly paint: MatchPaint;
  }
>();

/**
 * How the named MatchStamps of `manifest` are painted, `named` each one
 * compared with the table by ID: one out of date all red
 * (`OUT_OF_DATE_STROKE`), its alignment anchors' lines, its match
 * timestamps' lines and its name labels, which take `OUT_OF_DATE_MARK`;
 * of any other, each anchor's line by the belief in the MatchClaims stating
 * it (`statedBy`, `anchorBelief` over `beliefs`, undecided without them).
 * A match timestamp of an out-of-date MatchStamp is red whatever another
 * MatchStamp holding it is. Keyed by the address key of each part: an
 * anchor's line `{id: A}`, its label `{id: A, part: ["name"]}`, a match
 * timestamp's line `{id: T, part: ["line"]}`. Once per comparisons,
 * manifest and beliefs.
 */
export function namedPaint(
  manifest: Manifest,
  named: readonly NamedComparison[],
  beliefs: Uint8Array | undefined,
): MatchPaint {
  const known = paintByNamed.get(named);
  if (known?.manifest === manifest && known.beliefs === beliefs) return known.paint;
  const paint = new Map<string, Paint>();
  const stamps = manifest.graphical?.matchstamps ?? [];
  const red: Paint = { attribute: "stroke", colour: OUT_OF_DATE_STROKE, marked: false };
  for (const { id, comparison } of named) {
    const stamp = stamps.find((each) => each.id === id);
    if (stamp === undefined) continue;
    stamp.alignment_anchors.forEach((anchor, at) => {
      const address = idAddress(anchor.id);
      if (comparison.outOfDate) {
        paint.set(addressKey(address), red);
        paint.set(addressKey(partAddress(address, "name")), {
          attribute: "fill",
          colour: OUT_OF_DATE_STROKE,
          marked: true,
        });
        for (const timestamp of anchor.timestamps) {
          paint.set(addressKey(partAddress(idAddress(timestamp), "line")), red);
        }
        return;
      }
      const rows = comparison.statedBy[at] ?? new Uint32Array(0);
      const belief = beliefs === undefined ? "undecided" : anchorBelief(beliefs, rows);
      paint.set(addressKey(address), {
        attribute: "stroke",
        colour: BELIEF_STROKES[belief],
        marked: false,
      });
    });
  }
  paintByNamed.set(named, { manifest, beliefs, paint });
  return paint;
}

/** What the overlay draws in one block's node: the potential MatchStamps, the hovered and the pinned one. */
export interface MatchLayer {
  readonly block: string;
  /** The block's drawing's size, in its units. */
  readonly width: number;
  readonly height: number;
  readonly origin: Point;
  readonly scale: number;
  readonly potential: MatchOverlay;
  readonly hovered: MatchOverlay | null;
  /** The pinned MatchStamp by colour (`pinnedOverlays`); empty for none. */
  readonly pinned: readonly BeliefOverlay[];
}

const pathByOverlay = new WeakMap<MatchOverlay, string>();

/**
 * The path data of an overlay, one subpath per line (`M x y1 V y2`) and per
 * connector (`M x1 y1 L x2 y2`), numbers written as the writers write them;
 * a dash pattern starts again on every subpath. Written once per overlay
 * object: an overlay never changes, so a layer redrawn around the same
 * overlay (the potential MatchStamps while the pointer moves) costs a
 * lookup.
 */
export function pathOf(overlay: MatchOverlay): string {
  const known = pathByOverlay.get(overlay);
  if (known !== undefined) return known;
  const texts = new Map<number, string>();
  /** `value` as the writers write it, each number once: a line's ordinates repeat on every coordinate. */
  const text = (value: number) => {
    let written = texts.get(value);
    if (written === undefined) {
      written = attributeText(value);
      texts.set(value, written);
    }
    return written;
  };
  const lines = overlay.lines.map(({ x, y1, y2 }) => `M${text(x)} ${text(y1)}V${text(y2)}`);
  const connectors = overlay.connectors.map(
    ({ x1, y1, x2, y2 }) => `M${text(x1)} ${text(y1)}L${text(x2)} ${text(y2)}`,
  );
  const path = [...lines, ...connectors].join("");
  pathByOverlay.set(overlay, path);
  return path;
}
