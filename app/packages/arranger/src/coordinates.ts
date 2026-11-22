/**
 * Show coordinates: what the pointer hovers on a drawn line, the position
 * it picks there and the timestamp of that position.
 *
 * A timestamp is the cross-section of a timeline at a position: the
 * timeline of the hovered line (the anchor), then its ancestors, then
 * every timeline its cross-section line crosses (layout's `crossedLines`: its displayed
 * descendants with a line of their own, and the segments of every crossed
 * line), each with the maps drawn for it. A line is hovered anywhere from
 * the line out to the outermost map drawn at it, `HIT_TOLERANCE` device
 * pixels beyond; what is hovered there, the line or one map, is the row
 * the position is picked on (core's `snapOnRow`). Nothing here evaluates
 * or inverts a map or keeps a value: a timestamp is computed anew for every
 * frame that needs one, on the cross-section made once per hovered line.
 *
 * Where a coordinate lies is one rule: it is placed wherever it is seen,
 * on every line of its timeline where the block's stacking (`stackingOf`)
 * leaves the line uncovered (`seenOn`, `placesAt`), and the pointer reads a
 * line exactly there, so hover, pins, a named timestamp's rows, "Show
 * matches" and the affordances read the same places.
 */

import type {
  Block,
  BlockId,
  ConversionMap,
  CrossSectionMember,
  CrossSectionSpec,
  Expressed,
  Granularity,
  Knots,
  KnotsAbsence,
  Manifest,
  MeasureKnots,
  NamedTimestamp,
  Pin,
  PlaceKey,
  Real,
  Row,
  TimelineAxis,
  TimelineManifest,
  Timestamp,
  TimestampRow,
} from "@timetoalign/tilie-core";
import {
  ancestorMembers,
  findTimeline,
  idAddress,
  measureText,
  prettyText,
  samePlaceKey,
  saveManifest,
  snapOnRow,
  timelineAxisOf,
  timestampAt,
  timestampRows,
} from "@timetoalign/tilie-core";
import { orderedChildren } from "@timetoalign/tilie-core/drawing";
import {
  axisCoordinate,
  Rational,
  realOf,
  toFloat,
  toRational,
} from "@timetoalign/tilie-core/numbers";
import type { AxisMap, Drawing, DrawnAxis, LineAxis, WedgeMark } from "@timetoalign/tilie-layout";
import {
  abscissaOf,
  crossedLines,
  crossSection,
  frameMemberLines,
  lineAxes,
  wedgeAt,
} from "@timetoalign/tilie-layout";
import type { AffordanceSource, Covered, Stacking } from "./boxes.ts";
import { raisedRoot, stackingOf } from "./boxes.ts";
import type { Editing } from "./editing.ts";
import type { Point } from "./gesture.ts";
import type { BlockNode } from "./node.ts";

/** How near, in device pixels, the pointer must come to a line or a map to hover it. */
export const HIT_TOLERANCE = 8;

const ZERO = Rational.fromParts(0n, 1n);

/** A hovered line: its key in `lineAxes`, the map hovered at it, and the abscissa on it. */
export interface LineHit {
  /** The key of the line in `lineAxes`. */
  readonly key: string;
  readonly axis: LineAxis;
  /** The map whose drawing is hovered; `null` when the line itself is. */
  readonly map: AxisMap | null;
  /** The pointer's abscissa held to the span of what is hovered, in block-local canvas units. */
  readonly x: number;
  /** The vertical distance from the pointer to what is hovered, the line or its nearest map. */
  readonly distance: number;
}

/** What the pointer reads on a block: the hovered line and row, the position and the pin a click there makes. */
export interface Reading {
  readonly block: BlockId;
  readonly hit: LineHit;
  /** The row hovered (`rowOf`): the position is picked on its axis. */
  readonly row: Row;
  /** The position picked, exact, on the hovered line's own axis. */
  readonly position: Rational;
  /** The pin of the position: its spec, the MeasureMaps read, its timestamp; unnamed. */
  readonly pin: Pin;
  /** Where the position lies on the line, in block-local canvas units. */
  readonly at: Point;
  /**
   * The topmost ordinate of the line, the maps drawn at it and its
   * cross-section line, in block-local canvas units: the flag's pole rises
   * above it.
   */
  readonly top: number;
}

/**
 * Whether a pointer picks a coordinate on `axis`: it spans some width and
 * some coordinates as drawn (its length, or up to its reach where its
 * length is not known), so a zero-length line is not hovered.
 */
function measurable(axis: LineAxis): boolean {
  return axis.xEnd > axis.xStart && toFloat(toRational(axis.drawnLength)) > 0;
}

const markedByDrawing = new WeakMap<Drawing, ReadonlyMap<string, LineAxis>>();
const ancestorLinesByDrawing = new WeakMap<Drawing, ReadonlyMap<string, AncestorLine>>();
const axesByDrawing = new WeakMap<Drawing, ReadonlyMap<string, LineAxis>>();

/**
 * The lines of `drawing` that draw coordinate markers (each one
 * `crossedLines` crosses), once per drawing, keyed as in layout's
 * `lineAxes` and in its order, so an ancestor card's lines (section 8.8)
 * come after every other: never an ancestor line, which draws none. A
 * named timestamp has its place on them, whatever their length.
 */
function markedOf(drawing: Drawing): ReadonlyMap<string, LineAxis> {
  let marked = markedByDrawing.get(drawing);
  if (marked === undefined) {
    marked = new Map(
      [...lineAxes(drawing)].filter(([key]) => crossedLines(drawing, key).length > 0),
    );
    markedByDrawing.set(drawing, marked);
  }
  return marked;
}

/** An ancestor line in a member's card: its line and the key in `markedOf` of the member's line. */
interface AncestorLine {
  readonly axis: LineAxis;
  readonly member: string;
}

/**
 * The ancestor lines of `drawing`, the lines of a child member's ancestors
 * drawn beside its line in its card (on the side each ancestor's band
 * order gives: below it by default), which draw no markers, once per
 * drawing, keyed as in `lineAxes` and in its order, each with the key of
 * the member's own line in that card (`markedOf`), whose cross-section a
 * reading there reads.
 */
function ancestorLinesOf(drawing: Drawing): ReadonlyMap<string, AncestorLine> {
  let found = ancestorLinesByDrawing.get(drawing);
  if (found === undefined) {
    const marked = [...markedOf(drawing)];
    found = new Map(
      [...lineAxes(drawing)].flatMap(([key, axis]): [string, AncestorLine][] => {
        if (markedOf(drawing).has(key)) return [];
        const member = marked.find(
          ([, line]) => line.timeline === axis.card.member && samePlaceKey(line.card, axis.card),
        );
        return member === undefined ? [] : [[key, { axis, member: member[0] }]];
      }),
    );
    ancestorLinesByDrawing.set(drawing, found);
  }
  return found;
}

/**
 * The lines of `drawing` a pointer reads a timestamp on, once per drawing,
 * in `lineAxes`' order: the marked lines (`markedOf`) and the ancestor
 * lines (`ancestorLinesOf`) that are measurable, a line of unknown length
 * over its drawn span, never a zero-length line.
 */
export function axesOf(drawing: Drawing): ReadonlyMap<string, LineAxis> {
  let axes = axesByDrawing.get(drawing);
  if (axes === undefined) {
    const marked = markedOf(drawing);
    const ancestors = ancestorLinesOf(drawing);
    axes = new Map(
      [...lineAxes(drawing)].filter(
        ([key, axis]) => (marked.has(key) || ancestors.has(key)) && measurable(axis),
      ),
    );
    axesByDrawing.set(drawing, axes);
  }
  return axes;
}

/** `value` held to `[low, high]`. */
function held(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}

/**
 * Where `point` hovers the line `axis`, `tolerance` canvas units around, or
 * `null`: its zone runs from the line out to its outermost map, `tolerance`
 * beyond, over the line's span widened by `tolerance`. In the zone the
 * nearest in ordinate of the line and of each map whose span, widened
 * alike, holds the abscissa is hovered, the line on a tie and an earlier
 * map before a later one; the abscissa is held to its span.
 */
function zoneHit(key: string, axis: LineAxis, point: Point, tolerance: number): LineHit | null {
  if (point.x < axis.xStart - tolerance || point.x > axis.xEnd + tolerance) return null;
  const ordinates = axis.maps.map((map) => map.yc);
  const top = Math.min(axis.y, ...ordinates) - tolerance;
  const bottom = Math.max(axis.y, ...ordinates) + tolerance;
  if (point.y < top || point.y > bottom) return null;
  let hit: LineHit = {
    key,
    axis,
    map: null,
    x: held(point.x, axis.xStart, axis.xEnd),
    distance: Math.abs(point.y - axis.y),
  };
  for (const map of axis.maps) {
    if (point.x < map.xs - tolerance || point.x > map.xe + tolerance) continue;
    const distance = Math.abs(point.y - map.yc);
    if (distance < hit.distance) {
      hit = { key, axis, map, x: held(point.x, map.xs, map.xe), distance };
    }
  }
  return hit;
}

/**
 * The line `point` hovers among `axes` (`axesOf`), `tolerance` canvas units
 * around: of every line whose zone holds the point (`zoneHit`) and that is
 * not covered where the reading lands on it (`covered` at the abscissa
 * hovered, on the line: the stacking's, `stackingOf`; nothing is by
 * default), the one nearest in ordinate by the line or the map hovered in
 * it, an earlier line on a tie; `null` where none does.
 */
export function lineAt(
  axes: ReadonlyMap<string, LineAxis>,
  point: Point,
  tolerance: number,
  covered: Covered = () => false,
): LineHit | null {
  let best: LineHit | null = null;
  for (const [key, axis] of axes) {
    const hit = zoneHit(key, axis, point, tolerance);
    if (hit === null || (best !== null && hit.distance >= best.distance)) continue;
    if (!covered(axis, { x: hit.x, y: axis.y })) best = hit;
  }
  return best;
}

/** The row a hit hovers: the line's timeline's coordinate, or the hovered map of the timeline owning it. */
export function rowOf(hit: Pick<LineHit, "axis" | "map">): Row {
  const { axis, map } = hit;
  return map === null
    ? { timeline: axis.timeline, map: null }
    : { timeline: map.owner, map: map.id };
}

/**
 * The ordinate in `drawing` of the line at which a reading in the card
 * keyed `card` crosses the timeline `timeline`: the timeline's own line or
 * ancestor line in that card, else the line there whose segment it is;
 * `undefined` where the card draws neither.
 */
function ordinateIn(drawing: Drawing, card: PlaceKey, timeline: string): number | undefined {
  let holding: number | undefined;
  for (const axis of drawing.axes) {
    if (!samePlaceKey(axis.card, card)) continue;
    if (axis.address.id === timeline) return axis.line;
    if (holding === undefined && axis.segments.some((segment) => segment.id === timeline)) {
      holding = axis.line;
    }
  }
  return holding;
}

/**
 * `axis` read at the ordinate `ordinate` (`TimelineAxis.ordinate`), its maps
 * drawn at `mapOrdinates` (`TimelineAxis.mapOrdinates`, left out where
 * empty); as it is where neither is given.
 */
function crossedAt<T extends TimelineAxis>(
  axis: T,
  ordinate: number | undefined,
  mapOrdinates?: ReadonlyMap<string, number>,
): T {
  const maps = mapOrdinates === undefined || mapOrdinates.size === 0 ? {} : { mapOrdinates };
  if (ordinate === undefined) return "mapOrdinates" in maps ? { ...axis, ...maps } : axis;
  return { ...axis, ordinate, ...maps };
}

/** The timeline `id` of `manifest`, which a drawing of it draws. */
function drawnTimeline(manifest: Manifest, id: string): TimelineManifest {
  const timeline = findTimeline(manifest, id);
  if (timeline === undefined) throw new Error(`the drawn timeline '${id}' is not in its manifest`);
  return timeline;
}

/**
 * The timeline a cross-section line of the line keyed `lineKey` (a key of
 * `markedOf`) of `drawing`, a drawing of `manifest`, is read from (`anchor`,
 * else the line's own; a segment the line holds), as an axis with the maps
 * drawn for it, and the timelines of its subtree that the line crosses
 * (`crossedLines` after the line itself, and the segments of every crossed
 * line), each once, in traversal order (pre-order, children by offset), each
 * at its offset from that timeline's zero, exact, with the maps drawn for it
 * at the crossed lines, in the order they are drawn, as the manifest holds
 * them, and at the ordinate of the line it is crossed at in the line's card
 * (`ordinateIn`). No sibling segment of a segment anchor is among them.
 * On an ancestor line (`ancestorLinesOf`) the cross-section line is its
 * member's at the same abscissa: the anchor is the ancestor drawn, and
 * among its descendants the member's line, the lines between, and the
 * timelines that line crosses, at their offsets from the ancestor's zero.
 */
function crossedSubtree(
  manifest: Manifest,
  drawing: Drawing,
  lineKey: string,
  anchor?: string,
): {
  readonly card: PlaceKey;
  readonly root: TimelineAxis;
  readonly descendants: readonly CrossSectionMember[];
} {
  const ancestorLine = ancestorLinesOf(drawing).get(lineKey);
  if (ancestorLine !== undefined) {
    return crossedSubtree(manifest, drawing, ancestorLine.member, ancestorLine.axis.timeline);
  }
  const all = lineAxes(drawing);
  const lines = crossedLines(drawing, lineKey).flatMap((key) => {
    const line = all.get(key);
    return line === undefined ? [] : [line];
  });
  const [line] = lines;
  if (line === undefined) throw new Error(`the line ${lineKey} draws no cross-section`);
  const drawn = new Map<string, ConversionMap[]>();
  const ordinates = new Map<string, Map<string, number>>();
  for (const { maps } of lines) {
    for (const { id, owner, yc } of maps) {
      const map = drawnTimeline(manifest, owner).conversion_maps.find((item) => item.id === id);
      if (map === undefined) continue;
      drawn.set(owner, [...(drawn.get(owner) ?? []), map]);
      const owned = ordinates.get(owner) ?? new Map<string, number>();
      if (!owned.has(id)) owned.set(id, yc);
      ordinates.set(owner, owned);
    }
  }
  const root = drawnTimeline(manifest, anchor ?? line.timeline);
  // Read from an ancestor of the line's timeline, that timeline and its ancestors below the
  // anchor are crossed; none of them lies in a segment anchor's subtree.
  const below =
    root.id === line.timeline
      ? []
      : [line.timeline, ...ancestorMembers(manifest, line.timeline).map((item) => item.timeline)];
  const crossed = new Set([
    ...below,
    ...lines.flatMap((each, index) => [
      ...(index === 0 ? [] : [each.timeline]),
      ...each.segments.map((segment) => segment.id),
    ]),
  ]);
  const descendants: CrossSectionMember[] = [];
  const walk = (timeline: TimelineManifest, from: Rational): void => {
    for (const child of orderedChildren(timeline)) {
      const offset = from.add(toRational(realOf(axisCoordinate(child.offset, timeline))));
      if (crossed.has(child.id)) {
        const axis = timelineAxisOf(child, drawn.get(child.id) ?? []);
        descendants.push(
          crossedAt(
            { ...axis, offset },
            ordinateIn(drawing, line.card, child.id),
            ordinates.get(child.id),
          ),
        );
      }
      walk(child, offset);
    }
  };
  walk(root, ZERO);
  return {
    card: line.card,
    root: crossedAt(
      timelineAxisOf(root, drawn.get(root.id) ?? []),
      ordinateIn(drawing, line.card, root.id),
      ordinates.get(root.id),
    ),
    descendants,
  };
}

/**
 * The cross-section read on the line keyed `lineKey` (a key of `axesOf`)
 * of `drawing`, block `block`'s drawing of `manifest`, anchored on the
 * timeline `anchor` (the line's own by default, else a segment the line
 * holds; on an ancestor line its ancestor, read across its member's line,
 * `crossedSubtree`): the anchor's timeline, then as members its ancestors, parent
 * first, without maps (core's `ancestorMembers`: a parent's coordinate is
 * its child's plus the child's offset, up to the root, whether the anchor
 * is drawn in its parent's card or in a card of its own as a group's
 * member), then every timeline in its subtree that the cross-section line
 * crosses (`crossedSubtree`), each at its offset from the anchor's zero,
 * exact, with the maps drawn for it at the crossed lines. Each is read at
 * the ordinate of its line in the line's card (`ordinateIn`: an ancestor's
 * ancestor line where the anchor is a member drawn in a card of its own),
 * so its rows are listed top to bottom. No sibling segment of a segment
 * anchor is a member.
 */
export function crossSectionSpec(
  manifest: Manifest,
  block: BlockId,
  drawing: Drawing,
  lineKey: string,
  granularity: Granularity,
  anchor?: string,
): CrossSectionSpec {
  const { card, root, descendants } = crossedSubtree(manifest, drawing, lineKey, anchor);
  const ancestors = ancestorMembers(manifest, root.timeline).map((member) =>
    crossedAt(member, ordinateIn(drawing, card, member.timeline)),
  );
  return { block, granularity, anchor: root, members: [...ancestors, ...descendants] };
}

/** Where a timestamp's wedge and cross-section line are drawn: on a line, at an abscissa. */
export interface MarkPlace {
  /** The key of the line in `lineAxes`. */
  readonly key: string;
  /** The abscissa of the timestamp's position on the line, in block-local canvas units. */
  readonly x: number;
  /**
   * Whether the timestamp is read across the members of the group whose frame holds the line
   * (`readsGroup` of its pin), so that its line extends across that frame as a groupstamp's
   * does (layout's `groupCrossSections`); not where absent.
   */
  readonly group?: boolean;
}

/**
 * Whether the timestamp of `pin` is read across a group's members, as a
 * groupstamp's is (`withGroupMembers`): some member is read by the group,
 * scaled.
 */
export function readsGroup(pin: Pin): boolean {
  return pin.spec.members.some((member) => member.scale !== undefined);
}

/**
 * The marks of a timestamp as the canvas draws them: the hovered position's
 * or the pinned one's, its block's drawing, its place there, and the
 * block's node: its top-left corner on the canvas and its scale.
 */
export interface PlacedMarks extends MarkPlace {
  readonly kind: "hover" | "pin";
  readonly drawing: Drawing;
  readonly origin: Point;
  readonly scale: number;
}

/**
 * Whether `position` lies on `axis`'s drawn span `[start, start +
 * drawnLength]`: up to its end, or its reach where its length is not known.
 */
function spans(axis: LineAxis, position: Rational): boolean {
  const start = toRational(axis.start);
  const end = start.add(toRational(axis.drawnLength));
  return position.compare(start) >= 0 && position.compare(end) <= 0;
}

/**
 * Where the pinned timestamp `pin` is marked in `drawing`, its block's,
 * `raised` naming the root whose ancestor cards are raised (`raisedRoot`),
 * else `null`, across the group's frame where the pin reads the group
 * (`readsGroup`): at the place of its anchor's position on the line keyed
 * `preferred` (the line it was pinned on), else at its first place
 * (`placeOf`); `null` where the position has no place.
 */
export function pinnedPlace(
  drawing: Drawing,
  pin: Pin,
  preferred: string | null,
  raised: string | null,
): MarkPlace | null {
  const [anchor] = pin.timestamp.parts;
  if (anchor === undefined) return null;
  const place = placeOf(
    drawing,
    pin.spec.anchor.timeline,
    toRational(anchor.position),
    raised,
    preferred,
  );
  return place === undefined ? null : { key: place.key, x: place.x, group: readsGroup(pin) };
}

/**
 * A line a timeline is drawn on (`linesOf`): its key, its axis, where the
 * timeline's zero lies on it, the timeline's length there when it is a
 * segment of the line (`null` on a line of its own), and the key of the
 * line whose cross-section line a coordinate there is drawn as (layout's
 * `crossSectionSegment`): the line's own, or on an ancestor line, which
 * draws none, the line of the member in whose card it is drawn.
 */
export interface Holding {
  readonly key: string;
  readonly axis: LineAxis;
  readonly offset: Rational;
  readonly length: Rational | null;
  readonly section: string;
}

/**
 * The lines of `drawing` the timeline `timeline` is drawn on, covered or
 * not, without exception: every marked line of its own (`markedOf`, in any
 * card, an ancestor card's included), else every marked line whose segment
 * it is, at the segment's offset and with its length; and every ancestor
 * line of it in a member's card (`ancestorLinesOf`). The topmost in
 * `stacking` first (a raised card's line, then a line of a frame or card,
 * then an ancestor card's below the frames), else in `lineAxes`' order.
 */
export function linesOf(drawing: Drawing, timeline: string, stacking: Stacking): Holding[] {
  const ancestors = ancestorLinesOf(drawing);
  const marked = markedOf(drawing);
  const found: Holding[] = [];
  let own = false;
  for (const [key, axis] of lineAxes(drawing)) {
    const ancestor = ancestors.get(key);
    if (ancestor !== undefined || marked.has(key)) {
      if (axis.timeline === timeline) {
        own ||= ancestor === undefined;
        found.push({ key, axis, offset: ZERO, length: null, section: ancestor?.member ?? key });
        continue;
      }
    }
    const segment = marked.has(key)
      ? axis.segments.find((item) => item.id === timeline)
      : undefined;
    if (segment === undefined) continue;
    const offset = toRational(segment.offset);
    found.push({ key, axis, offset, length: toRational(segment.length), section: key });
  }
  return (own ? found.filter(({ length }) => length === null) : found).sort(
    (left, right) => stacking.rankOf(right.axis) - stacking.rankOf(left.axis),
  );
}

/** The part of a line where a timeline drawn on it is seen (`seenOn`). */
export interface SeenHolding extends Holding {
  /** The ends of the part seen, in block-local canvas units, both included. */
  readonly xFrom: number;
  readonly xTo: number;
}

const seenByDrawing = new WeakMap<
  Drawing,
  Map<string | null, Map<string, readonly SeenHolding[]>>
>();

/**
 * Where the timeline `timeline` is seen on the lines of `drawing` it is
 * drawn on (`linesOf`), `raised` naming the root whose ancestor cards are
 * raised (`raisedRoot`), else `null`: each line cut at the left and right
 * borders of every displayed frame and card into parts, and the parts it is
 * not covered on (`stackingOf`'s `covered`, tested at the part's middle on
 * the line), neighbours joined, both ends included; once per drawing, root
 * and timeline. Where the user sees a line of the timeline, and nowhere
 * else: the one place decision. The pointer reads a line exactly where it
 * is not covered (`lineAt`), "Show matches" draws a coordinate and the
 * pointer hits it on these parts (`matchLinesOf`), and every other reader
 * of a coordinate's place takes it from them (`placesAt`).
 */
export function seenOn(
  drawing: Drawing,
  timeline: string,
  raised: string | null,
): readonly SeenHolding[] {
  let byRoot = seenByDrawing.get(drawing);
  if (byRoot === undefined) {
    byRoot = new Map();
    seenByDrawing.set(drawing, byRoot);
  }
  let byTimeline = byRoot.get(raised);
  if (byTimeline === undefined) {
    byTimeline = new Map();
    byRoot.set(raised, byTimeline);
  }
  const known = byTimeline.get(timeline);
  if (known !== undefined) return known;
  const stacking = stackingOf(drawing, raised);
  const borders = drawing.boxes
    .filter((box) => box.displayed && (box.kind === "frame" || box.kind === "card"))
    .flatMap((box) => [box.x, box.x + box.width]);
  const found = linesOf(drawing, timeline, stacking).flatMap((holding): SeenHolding[] => {
    const { axis } = holding;
    const { xStart, xEnd, y } = axis;
    const cuts = [
      ...new Set([xStart, ...borders.filter((x) => x > xStart && x < xEnd), xEnd]),
    ].sort((left, right) => left - right);
    if (cuts.length === 1) {
      return stacking.covered(axis, { x: xStart, y })
        ? []
        : [{ ...holding, xFrom: xStart, xTo: xEnd }];
    }
    const seen: SeenHolding[] = [];
    for (let at = 0; at + 1 < cuts.length; at += 1) {
      const xFrom = cuts[at] as number;
      const xTo = cuts[at + 1] as number;
      if (stacking.covered(axis, { x: (xFrom + xTo) / 2, y })) continue;
      const last = seen.at(-1);
      if (last?.xTo === xFrom) seen[seen.length - 1] = { ...last, xTo };
      else seen.push({ ...holding, xFrom, xTo });
    }
    return seen;
  });
  byTimeline.set(timeline, found);
  return found;
}

/** A place of a coordinate: a part of a line where its timeline is seen, and its abscissa there. */
export interface Place extends SeenHolding {
  /** The abscissa of the coordinate on the line, in block-local canvas units (layout's `abscissaOf`). */
  readonly x: number;
}

/**
 * The places of the value `value` (exact, on the timeline's own axis) of
 * the timeline `timeline` in `drawing`, `raised` naming the root whose
 * ancestor cards are raised (`raisedRoot`), else `null`: of the parts of
 * lines where the timeline is seen (`seenOn`), in their order, each one
 * holding the value: from 0, up to a segment's length, within the line's
 * drawn span (`start` to `start + drawnLength` on its axis, the segment's
 * offset added), and its abscissa there (layout's `abscissaOf`) within the
 * part, both ends included. None where the user sees no line of the
 * timeline at that value. The one place rule of a coordinate: screen order
 * (`screenPlace`), the affordances (`affordancesOf`), the pin's mark
 * (`pinnedPlace`) and the cross-section a timestamp is read with
 * (`timelineSpec`) read it, as "Show matches" reads `seenOn`.
 */
export function placesAt(
  drawing: Drawing,
  timeline: string,
  value: Rational,
  raised: string | null,
): Place[] {
  if (value.compare(ZERO) < 0) return [];
  return seenOn(drawing, timeline, raised).flatMap((seen): Place[] => {
    const { axis, offset, length } = seen;
    if (length !== null && value.compare(length) > 0) return [];
    const onLine = value.add(offset);
    if (!spans(axis, onLine)) return [];
    const x = abscissaOf(axis, onLine);
    return x < seen.xFrom || x > seen.xTo ? [] : [{ ...seen, x }];
  });
}

/**
 * The place of the value `value` of the timeline `timeline` (`placesAt`)
 * a reader takes: the one on the line keyed `preferred` (the line it was
 * read on) while that line is one of its places, else the first;
 * `undefined` where it has none. Every reader of one place takes it so.
 */
export function placeOf(
  drawing: Drawing,
  timeline: string,
  value: Rational,
  raised: string | null,
  preferred: string | null,
): Place | undefined {
  const places = placesAt(drawing, timeline, value, raised);
  return places.find(({ key }) => key === preferred) ?? places[0];
}

/** The key in `markedOf(drawing)` of the drawn line `axis`; undefined for an ancestor line. */
function markedKey(drawing: Drawing, axis: DrawnAxis): string | undefined {
  for (const [key, line] of markedOf(drawing)) {
    if (line.timeline === axis.address.id && samePlaceKey(line.card, axis.card)) return key;
  }
  return undefined;
}

/**
 * `spec` with every member of each group whose frame draws its timestamp in
 * `drawing` added after its members, each with its ancestors, drawn as the
 * ancestor lines its card crosses, and the descendants its line's
 * cross-section line crosses there (`crossedSubtree`): the frames whose
 * cards draw a line `holds` says carries the timestamp (layout's
 * `frameMemberLines` names each frame's members). A group's members start
 * and end together, so each other member is read by the group from the
 * member card holding the anchor: at that member's offset from the anchor's
 * zero (0 where the anchor is the member, its ancestor offset where the
 * anchor is a descendant of it), scaled by its drawn end over that member's,
 * with the maps drawn for it; a descendant of it at the member's offset plus
 * its own offset in the member divided by that scale, with the same scale,
 * so that its coordinate is the member's less its offset; an ancestor of it
 * likewise at the member's offset plus the ancestor's (negative) offset
 * divided by that scale, so that its coordinate is the member's less that
 * offset. Each is read at the ordinate of its line in the member's card,
 * or, while `raised` (`raisedRoot`) names a root whose cards draw the
 * member, on the raised card's line of it (the first of `linesOf`, lifted
 * in the stacking), as its own reading is placed there first
 * (`placesAt`): its ancestors and crossed descendants then those of that
 * line. The member is read on that line whatever the position, so a
 * reading's cross-section does not depend on where the pointer lies. The member holding the anchor adds the crossed
 * descendants it has beyond `spec`'s, unscaled.
 * A timeline already in `spec` or added, a member card whose drawn end is 0
 * and an anchor whose member card is not among `spec`'s timelines are
 * passed over. The one reading of a groupstamp's members: a named
 * groupstamp's pin and a hover above a timeline editor take it, so the
 * Timestamp tab and the coordinate flag read the same timelines.
 */
function withGroupMembers(
  spec: CrossSectionSpec,
  manifest: Manifest,
  drawing: Drawing,
  holds: (axis: DrawnAxis) => boolean,
  raised: string | null,
): CrossSectionSpec {
  const stacking = stackingOf(drawing, raised);
  const offsets = new Map<string, Real>([
    [spec.anchor.timeline, ZERO],
    ...spec.members.map((member) => [member.timeline, member.offset] as const),
  ]);
  const taken = new Set(offsets.keys());
  const members: CrossSectionMember[] = [];
  const add = (member: CrossSectionMember): void => {
    if (taken.has(member.timeline)) return;
    taken.add(member.timeline);
    members.push(member);
  };
  /**
   * The member drawn as `line` and, read by the group (`scale` given), its
   * ancestors, then its crossed descendants, at `offset` and `scale`.
   */
  const read = (line: DrawnAxis, offset: Rational, scale: Rational | undefined): void => {
    const timeline = line.address.id;
    const [first] = timeline === undefined ? [] : linesOf(drawing, timeline, stacking);
    const lifted = first !== undefined && stacking.lifted(first.axis) ? first : undefined;
    const key = lifted?.key ?? markedKey(drawing, line);
    if (key === undefined) return;
    const segment = lifted !== undefined && lifted.length !== null ? timeline : undefined;
    const { card, root, descendants } = crossedSubtree(manifest, drawing, key, segment);
    if (scale !== undefined) {
      add({ ...root, offset, scale });
      for (const ancestor of ancestorMembers(manifest, root.timeline)) {
        const own = toRational(ancestor.offset).divide(scale);
        const ordinate = ordinateIn(drawing, card, ancestor.timeline);
        add(crossedAt({ ...ancestor, offset: offset.add(own), scale }, ordinate));
      }
    }
    for (const descendant of descendants) {
      const own = toRational(descendant.offset);
      add(
        scale === undefined
          ? { ...descendant, offset: offset.add(own) }
          : { ...descendant, offset: offset.add(own.divide(scale)), scale },
      );
    }
  };
  for (const own of drawing.axes) {
    const holder = own.card.member;
    if (holder === undefined || !holds(own)) continue;
    const lines = frameMemberLines(drawing.axes, own.card.item);
    const offset = offsets.get(holder);
    const held = lines.find((line) => line.address.id === holder);
    if (offset === undefined || held === undefined) continue;
    const drawnEnd = toRational(held.drawnEnd);
    if (drawnEnd.numerator === 0n) continue;
    const at = toRational(offset);
    for (const line of lines) {
      if (line === held) {
        read(line, at, undefined);
        continue;
      }
      const other = toRational(line.drawnEnd);
      if (line.address.id === undefined || taken.has(line.address.id) || other.numerator === 0n) {
        continue;
      }
      read(line, at, other.divide(drawnEnd));
    }
  }
  return members.length === 0 ? spec : { ...spec, members: [...spec.members, ...members] };
}

/** A named timestamp's coordinate, exact on its own timeline's axis. */
function namedCoordinate(named: NamedTimestamp, timeline: TimelineManifest): Rational {
  return toRational(realOf(axisCoordinate(named.coordinate, timeline)));
}

/**
 * The cross-section a timestamp at the value `position` (exact, on its own
 * axis) of `timeline` of `manifest`, block `block`'s, drawn as `drawing`,
 * is read with, its timeline the anchor, `raised` naming the root whose
 * ancestor cards are raised (`raisedRoot`), else `null`: on the line of
 * its place (`placeOf`: the line keyed `preferred`, the line it was read
 * on, while that is one of its places, else the first), read as the
 * pointer reads it there (`crossSectionSpec` anchored on it: on an
 * ancestor line the cross-section of the member's line in that card; on a
 * segment line the segment's subtree), so its members are its ancestors
 * and the timelines of its own subtree that line crosses, each with the
 * maps drawn at the crossed lines. Where the position has no place (no line
 * of the timeline is seen there, or none is drawn), with all its own maps
 * and its ancestors alone as members: nothing seen is read. The one spec of
 * a timestamp read at a timeline rather than at a hovered line, so a
 * timestamp named from a reading is read back as the reading was: the rows
 * depend on the line read (another card orders them by other ordinates; an
 * ancestor line lists no maps), so a reading at any place and the pin made
 * from it read alike.
 */
function timelineSpec(
  manifest: Manifest,
  block: BlockId,
  drawing: Drawing,
  timeline: TimelineManifest,
  position: Rational,
  granularity: Granularity,
  raised: string | null,
  preferred: string | null,
): CrossSectionSpec {
  const place = placeOf(drawing, timeline.id, position, raised, preferred);
  return place === undefined
    ? {
        block,
        granularity,
        anchor: timelineAxisOf(timeline, timeline.conversion_maps),
        members: ancestorMembers(manifest, timeline.id),
      }
    : crossSectionSpec(manifest, block, drawing, place.key, granularity, timeline.id);
}

/**
 * The pin of the position `position` (exact, on the timeline's own axis)
 * of the timeline `timeline` of `manifest`, block `block`'s, drawn as
 * `drawing`, read with the spec `namedPin` reads a named timestamp there
 * with, but unnamed: where `groupstamp`, the spec of a groupstamp there,
 * the members of the groups whose frames draw the timeline's line added
 * (`withGroupMembers`, every drawn line of the timeline holding it), else
 * the timeline's alone. The Matchstamp tab's Coordinates show each
 * coordinate of a potential MatchStamp with it, `groupstamp` what naming
 * stores, so they list exactly the rows the Timestamp tab lists for the
 * timestamp naming stores at that coordinate. `knots` as `timestampAt`
 * takes them, `raised` and `preferred` (the line the position was read on,
 * `null` for none) as `timelineSpec` takes them; `null` where the manifest
 * holds no timeline `timeline`. Read at a place of the position with that
 * place's line preferred, it lists the rows a reading there lists.
 */
export function timelinePin(
  manifest: Manifest,
  block: BlockId,
  drawing: Drawing,
  timeline: string,
  position: Rational,
  granularity: Granularity,
  knots: Knots,
  groupstamp: boolean,
  raised: string | null,
  preferred: string | null,
): Pin | null {
  const found = findTimeline(manifest, timeline);
  if (found === undefined) return null;
  const spec = timelineSpec(
    manifest,
    block,
    drawing,
    found,
    position,
    granularity,
    raised,
    preferred,
  );
  const holds = (axis: DrawnAxis) => axis.marker !== null && axis.address.id === timeline;
  const read = groupstamp ? withGroupMembers(spec, manifest, drawing, holds, raised) : spec;
  return { spec: read, knots, timestamp: timestampAt(read, position, knots), named: null };
}

/**
 * The unnamed pin `pin` of block `manifest`'s drawing `drawing` read again
 * at its anchor's timeline and position (`timelinePin`), as a fresh reading
 * there reads it once the open editor changes: under the root raised now
 * (`raised`, `raisedRoot`), reading a group where `groupstamp` says a fresh
 * reading does (`groupScoped` of the open editor), with its knots and its
 * granularity, on the line keyed `preferred` (the line it was read on)
 * while that line is still a place of its position, else at its first
 * place; `null` where the manifest no longer holds its anchor's timeline.
 */
export function rereadPin(
  manifest: Manifest,
  drawing: Drawing,
  pin: Pin,
  groupstamp: boolean,
  raised: string | null,
  preferred: string | null,
): Pin | null {
  const [anchor] = pin.timestamp.parts;
  if (anchor === undefined) return null;
  return timelinePin(
    manifest,
    pin.spec.block,
    drawing,
    pin.spec.anchor.timeline,
    toRational(anchor.position),
    pin.spec.granularity,
    pin.knots,
    groupstamp,
    raised,
    preferred,
  );
}

/**
 * The pin of the named timestamp `id` of `manifest`, block `block`'s,
 * drawn as `drawing`: its timeline the anchor, at its coordinate, read with
 * the cross-section of its timeline at its place there (`timelineSpec`,
 * `raised` naming the root whose ancestor cards are raised, else `null`,
 * `preferred` the line it was named from, `null` where it is not known),
 * so the Timestamp tab of a timestamp named from a reading lists what the
 * reading's flag listed. A groupstamp's adds the other members of its
 * groups' frames, read by the group (`withGroupMembers`): the Timestamp tab
 * shows the whole GroupStamp. `knots` as `timestampAt` takes them; `null`
 * where the manifest holds no timestamp `id`.
 */
export function namedPin(
  manifest: Manifest,
  block: BlockId,
  drawing: Drawing,
  id: string,
  granularity: Granularity,
  knots: Knots,
  raised: string | null,
  preferred: string | null,
): Pin | null {
  const named = manifest.graphical?.timestamps?.find((item) => item.id === id);
  const timeline = named === undefined ? undefined : findTimeline(manifest, named.timeline);
  if (named === undefined || timeline === undefined) return null;
  const position = namedCoordinate(named, timeline);
  const spec = timelineSpec(
    manifest,
    block,
    drawing,
    timeline,
    position,
    granularity,
    raised,
    preferred,
  );
  const holds = (axis: DrawnAxis) =>
    axis.marker?.timestamps.some((item) => item.id === named.id) ?? false;
  const read = named.groupstamp ? withGroupMembers(spec, manifest, drawing, holds, raised) : spec;
  return { spec: read, knots, timestamp: timestampAt(read, position, knots), named };
}

/**
 * A named timestamp whose `display` is empty (not a match timestamp),
 * which the drawing therefore draws nothing of, as the canvas alone shows
 * it so it stays selectable: a
 * wedge where its own would lie on one line. It is its own canvas source
 * (`drawn`): a press on it hits the timestamp's address.
 */
export interface Affordance extends AffordanceSource {
  /** The key of the line in `lineAxes`. */
  readonly line: string;
  /** The wedge's corners in block-local canvas units (layout's `wedgeAt`). */
  readonly points: WedgeMark["points"];
}

const affordancesByDrawing = new WeakMap<
  Drawing,
  Map<string | null, { readonly manifest: Manifest; readonly affordances: readonly Affordance[] }>
>();

/**
 * The affordances of the named timestamps of `manifest` whose `display` is
 * empty, `drawing` being its drawing, but for a match timestamp, which
 * leaves no placeholder (its MatchStamp is reached through its lines and
 * connectors): one at every place of its coordinate (`placesAt`, `raised`
 * naming the root whose ancestor cards are raised, else `null`), whatever
 * the line's length, its wedge layout's `wedgeAt` there (an ancestor
 * line's mark on an ancestor line), in the order the manifest lists them;
 * none where its coordinate has no place. The one place their geometry is
 * computed, once per drawing and root: the block node draws them, the
 * marquee takes their bounds, the projection counts their addresses as
 * drawn.
 */
export function affordancesOf(
  manifest: Manifest,
  drawing: Drawing,
  raised: string | null = null,
): readonly Affordance[] {
  let byRoot = affordancesByDrawing.get(drawing);
  if (byRoot === undefined) {
    byRoot = new Map();
    affordancesByDrawing.set(drawing, byRoot);
  }
  const known = byRoot.get(raised);
  if (known?.manifest === manifest) return known.affordances;
  const affordances = (manifest.graphical?.timestamps ?? []).flatMap((named) => {
    if (named.display.length > 0 || named.matchstamp) return [];
    const timeline = findTimeline(manifest, named.timeline);
    if (timeline === undefined) return [];
    const coordinate = namedCoordinate(named, timeline);
    const address = idAddress(named.id);
    return placesAt(drawing, named.timeline, coordinate, raised).flatMap(
      ({ key, x }): Affordance[] => {
        const wedge = wedgeAt(drawing, key, x);
        return wedge === null
          ? []
          : [{ kind: "affordance", address, line: key, points: wedge.points }];
      },
    );
  });
  byRoot.set(raised, { manifest, affordances });
  return affordances;
}

/**
 * The expanded MeasureMaps of a manifest, or why they are not at hand;
 * `undefined` for a manifest without MeasureMaps.
 */
export type KnotsOf = (manifest: Manifest) => readonly MeasureKnots[] | KnotsAbsence | undefined;

const hoveredSpecs = new WeakMap<
  Drawing,
  Map<
    string,
    {
      readonly manifest: Manifest;
      readonly granularity: Granularity;
      readonly spec: CrossSectionSpec;
    }
  >
>();

/**
 * The cross-section a reading on the line `hit` hovers of `drawing`, block
 * `block`'s drawing, is read with: the line's (`crossSectionSpec`), with
 * every member of each group whose frame draws the line's timeline where
 * `group` (`withGroupMembers`), `raised` naming the root whose ancestor
 * cards are raised. It depends on the line and never on where the pointer
 * lies on it, so it is made once per drawing, block, line, root, group
 * reading, manifest and granularity, and every pointer frame on the line
 * reuses it.
 */
function hoveredSpec(
  block: Block,
  drawing: Drawing,
  hit: LineHit,
  granularity: Granularity,
  raised: string | null,
  group: boolean,
): CrossSectionSpec {
  let byLine = hoveredSpecs.get(drawing);
  if (byLine === undefined) {
    byLine = new Map();
    hoveredSpecs.set(drawing, byLine);
  }
  const key = JSON.stringify([block.id, hit.key, raised, group]);
  const known = byLine.get(key);
  if (known?.manifest === block.manifest && known.granularity === granularity) return known.spec;
  const crossing = crossSectionSpec(block.manifest, block.id, drawing, hit.key, granularity);
  const timeline = hit.axis.timeline;
  const spec = group
    ? withGroupMembers(
        crossing,
        block.manifest,
        drawing,
        (line) => line.marker !== null && line.address.id === timeline,
        raised,
      )
    : crossing;
  byLine.set(key, { manifest: block.manifest, granularity, spec });
  return spec;
}

/**
 * The reading of the canvas point `point` over `nodes` at `zoom`, with
 * `ratio` device pixels per CSS pixel: of every node whose drawing holds a
 * line `point` hovers (`lineAt`, `HIT_TOLERANCE` device pixels around,
 * where it is not covered: `stackingOf`, the root raised by the node's
 * editor, `raisedRoot`), the nearest, a later node on a tie; `null` where
 * no line is hovered. An ancestor line is read as its ancestor's
 * (`crossSectionSpec`). The
 * position is core's `snapOnRow` on the hovered row (`rowOf`) of the
 * line's cross-section (`crossSectionSpec`), `p` the pointer's coordinate
 * on the line's axis and `h` half a device pixel there: the line's drawn
 * length (up to its reach where its length is not known) over its width,
 * over zoom × the block's scale × `ratio`, halved. Above a timeline editor
 * (`groupScoped` of the node's editor) the cross-section also holds every
 * member of each group whose frame draws the hovered line's timeline, read
 * by the group as a groupstamp's (`withGroupMembers`).
 * `knotsOf` gives the expanded MeasureMaps of a manifest, or why they are
 * not at hand; without it no server expands them. A point that is not
 * finite reads nothing.
 */
export function readingAt(
  nodes: readonly BlockNode[],
  point: Point,
  options: {
    readonly zoom: number;
    readonly ratio: number;
    readonly granularity: Granularity;
    readonly knotsOf?: KnotsOf | undefined;
  },
): Reading | null {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
  let found: { node: BlockNode; hit: LineHit; devicePixels: number } | null = null;
  for (const node of nodes) {
    const { block, drawing } = node.data;
    const devicePixels = options.zoom * block.scale * options.ratio;
    const tolerance = HIT_TOLERANCE / devicePixels;
    const local = {
      x: (point.x - node.position.x) / block.scale,
      y: (point.y - node.position.y) / block.scale,
    };
    if (
      local.x < -tolerance ||
      local.y < -tolerance ||
      local.x > drawing.width + tolerance ||
      local.y > drawing.height + tolerance
    ) {
      continue;
    }
    const { covered } = stackingOf(drawing, raisedRoot(block, node.data.editing));
    const hit = lineAt(axesOf(drawing), local, tolerance, covered);
    if (
      hit !== null &&
      (found === null || hit.distance * devicePixels <= found.hit.distance * found.devicePixels)
    ) {
      found = { node, hit, devicePixels };
    }
  }
  if (found === null) return null;
  const { node, hit, devicePixels } = found;
  const { block, drawing } = node.data;
  const { axis } = hit;
  const length = toFloat(toRational(axis.drawnLength));
  const width = axis.xEnd - axis.xStart;
  const p = toFloat(toRational(axis.start)) + ((hit.x - axis.xStart) / width) * length;
  const h = length / width / devicePixels / 2;
  const spec = hoveredSpec(
    block,
    drawing,
    hit,
    options.granularity,
    raisedRoot(block, node.data.editing),
    groupScoped(node.data.editing),
  );
  const knots = options.knotsOf?.(block.manifest) ?? "no_server";
  const row = rowOf(hit);
  const position = snapOnRow(spec, row, p, h, knots);
  const pin: Pin = { spec, knots, timestamp: timestampAt(spec, position, knots), named: null };
  const line = crossSection(drawing, hit.key, 0);
  const top = Math.min(axis.y, ...axis.maps.map((map) => map.yc), line?.y1 ?? axis.y);
  return {
    block: block.id,
    hit,
    row,
    position,
    pin,
    at: { x: abscissaOf(axis, position), y: axis.y },
    top,
  };
}

/**
 * Whether a position read in the editor `editing` (the innermost open
 * editor, `null` on the arranger) reads a group's members with its timeline
 * as a groupstamp would: above a timeline editor, never inside one, where it
 * stays on its timeline.
 */
export function groupScoped(editing: Editing | null): boolean {
  return editing?.kind !== "timeline";
}

/** Where a timestamp lies: its anchor's name and pretty coordinate, as `Form at 13 1/2 ♩`. */
export function placeText(timestamp: Timestamp): string {
  const [anchor] = timestamp.parts;
  if (anchor === undefined) throw new Error("a timestamp has its anchor's part");
  const { position, numberType, unit } = anchor;
  return `${anchor.name} at ${prettyText(position, numberType, unit, timestamp.granularity.decimals)}`;
}

/**
 * An expressed value as the flag writes it, rounded to `decimals` places:
 * a number as its pretty text, a label as it is, a measure by its name,
 * outputs by name.
 */
function expressedText(value: Expressed, decimals: number): string {
  if (typeof value === "string") return value;
  if ("record" in value) return `${measureText(value.record)} measure`;
  if ("outputs" in value) {
    return Object.entries(value.outputs)
      .map(([name, output]) => `${name} ${expressedText(output, decimals)}`)
      .join(" · ");
  }
  return prettyText(value.value, value.numberType, value.unit, decimals);
}

/**
 * The value of one row of a timestamp as the flag writes it, rounded to
 * `decimals` places; a row that gives none says why, in core's words.
 */
export function rowValueText(row: TimestampRow, decimals: number): string {
  if (row.value !== null) return expressedText(row.value, decimals);
  return row.missing ?? "";
}

/** One part of a timestamp as the flag shows it: its timeline's name, then its rows. */
export interface FlagPart {
  readonly timeline: string;
  readonly name: string;
  /** Its coordinate's row and one row per map drawn for it, top to bottom as they are drawn. */
  readonly rows: readonly TimestampRow[];
}

/**
 * The rows of `pin` (core's `timestampRows`) grouped by part in their order,
 * top to bottom where the reading crosses each part's timeline: each part's
 * consecutive rows of one timeline, in their order (its maps drawn above its
 * line before its coordinate), named by its coordinate row's label.
 */
export function flagParts(pin: Pin): FlagPart[] {
  const parts: FlagPart[] = [];
  for (const row of timestampRows(pin)) {
    const last = parts.at(-1);
    if (last !== undefined && last.timeline === row.timeline) {
      const name = row.row.map === null ? row.label : last.name;
      parts[parts.length - 1] = { ...last, name, rows: [...last.rows, row] };
    } else {
      parts.push({ timeline: row.timeline, name: row.label, rows: [row] });
    }
  }
  return parts;
}

/** The width of the flag's pole in pixels, and how far the pole rises above what it marks. */
export const POLE_WIDTH = 1;
export const POLE_RISE = 22;

/** Where the flag and its pole lie, in pixels from the canvas's top-left corner. */
export interface FlagPlace {
  /** The pole: its abscissa (its centre), its top and its bottom, the line's ordinate. */
  readonly pole: { readonly x: number; readonly top: number; readonly bottom: number };
  /** The flag's left and top edges. */
  readonly left: number;
  readonly top: number;
}

/**
 * Where the flag of a reading starts: its pole stands at `x` from
 * `POLE_RISE` above `top` (the topmost of the line, its maps and its
 * cross-section line), held below the canvas's top edge, down to `y`, the
 * line; the flag hangs from the pole's top and opens to the right, its
 * left edge touching the pole's right side, so it never covers the pole
 * nor the abscissa it marks. It never changes sides: near a border it is
 * shifted by exactly what keeps it on screen (`onScreen`).
 */
export function flagPlace(at: {
  readonly x: number;
  readonly y: number;
  readonly top: number;
}): FlagPlace {
  const poleTop = Math.max(0, at.top - POLE_RISE);
  return {
    pole: { x: at.x, top: poleTop, bottom: at.y },
    left: at.x + POLE_WIDTH / 2,
    top: poleTop,
  };
}

/**
 * What a server answers for a manifest's text: its expanded MeasureMaps,
 * `unsupported` where the server cannot expand MeasureMaps, or
 * `unreachable` where no server answered the request.
 */
export type MeasureMapsAnswer = readonly MeasureKnots[] | "unsupported" | "unreachable";

/**
 * The expanded MeasureMaps of each manifest, asked of `fetch` with the
 * manifest's text once per manifest object (one version of a manifest)
 * that has MeasureMaps, and kept as the answer arrives; `changed` is
 * called then. `fetch` answers the rows or why there are none
 * (`MeasureMapsAnswer`); a request that fails otherwise leaves them
 * `failed`. Until the answer arrives they are `pending`, so nothing waits
 * for them.
 */
export class MeasureKnotsSource {
  readonly #fetch: (manifest: string) => Promise<MeasureMapsAnswer>;
  readonly #changed: () => void;
  readonly #known = new WeakMap<Manifest, readonly MeasureKnots[] | KnotsAbsence>();

  constructor(fetch: (manifest: string) => Promise<MeasureMapsAnswer>, changed: () => void) {
    this.#fetch = fetch;
    this.#changed = changed;
  }

  /** The expanded MeasureMaps of `manifest`, or why they are not at hand; asks for them the first time. */
  readonly knotsOf = (manifest: Manifest): readonly MeasureKnots[] | KnotsAbsence | undefined => {
    if (manifest.measure_maps.length === 0) return undefined;
    const known = this.#known.get(manifest);
    if (known !== undefined) return known;
    this.#known.set(manifest, "pending");
    const settle = (answer: readonly MeasureKnots[] | KnotsAbsence) => {
      this.#known.set(manifest, answer);
      this.#changed();
    };
    Promise.resolve()
      .then(() => this.#fetch(saveManifest(manifest)))
      .then(settle, () => settle("failed"));
    return "pending";
  };
}

/**
 * Pointer moves coalesced into one call of `run` per animation frame, with
 * the last point given; `cancel` drops a pending one.
 */
export class FrameCoalescer<T> {
  readonly #run: (value: T) => void;
  #pending: { value: T } | null = null;
  #frame: number | null = null;

  constructor(run: (value: T) => void) {
    this.#run = run;
  }

  /** Run with `value` at the next animation frame, replacing any value still waiting. */
  push(value: T): void {
    this.#pending = { value };
    if (this.#frame !== null) return;
    this.#frame = requestAnimationFrame(() => {
      this.#frame = null;
      const pending = this.#pending;
      this.#pending = null;
      if (pending !== null) this.#run(pending.value);
    });
  }

  cancel(): void {
    this.#pending = null;
    if (this.#frame !== null) cancelAnimationFrame(this.#frame);
    this.#frame = null;
  }
}
