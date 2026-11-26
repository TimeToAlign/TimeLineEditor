/**
 * Show coordinates: what the pointer hovers on a drawn line, the position
 * it picks there and the timestamp of that position.
 *
 * A timestamp is the cross-section of a timeline at a position: the
 * timeline of the hovered line (the anchor), then every timeline the card
 * of that line draws whose span holds the position (what a cross-section
 * line there crosses: root, ancestors, siblings, children, ancestor lines
 * and segments), each with the maps drawn for it. A line is hovered anywhere from
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
  Coordinate,
  CrossSectionMember,
  CrossSectionSpec,
  Expressed,
  Granularity,
  Knots,
  KnotsAbsence,
  Manifest,
  MeasureKnots,
  NamedTimestamp,
  Occurrence,
  Pin,
  Real,
  ResolvedVirtualTimeline,
  Row,
  TimelineAxis,
  TimelineManifest,
  Timestamp,
  TimestampRow,
} from "@timetoalign/tilie-core";
import {
  ancestorMembers,
  compareCodePoints,
  displayOrder,
  FlowMapError,
  findTimeline,
  foldVirtual,
  idAddress,
  measureText,
  placeAt,
  placeKeyText,
  prettyText,
  resolveVirtualTimeline,
  samePlaceKey,
  saveManifest,
  snapOnRow,
  timelineAxisOf,
  timestampAt,
  timestampRows,
  unfoldVirtual,
} from "@timetoalign/tilie-core";
import { memberDrawings, orderedChildren } from "@timetoalign/tilie-core/drawing";
import {
  addReal,
  axisCoordinate,
  compareCoordinates,
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
  readsAcrossGroup,
  wedgeAt,
} from "@timetoalign/tilie-layout";
import type { AffordanceSource, Covered, Stacking } from "./boxes.ts";
import { raisedRoot, stackingOf } from "./boxes.ts";
import { zeroOf } from "./cardAxis.ts";
import type { Editing } from "./editing.ts";
import { gapAt } from "./gaps.ts";
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

const virtualRoots = new WeakMap<Manifest, Map<string, TimelineManifest>>();

/**
 * The virtual timeline `id` of `manifest` read as the root its card draws
 * (TimeToShare's `docs/drawing.md`, section 8.10): a locked root of its ID,
 * name (else its ID), unit, number type and length, holding nothing; once
 * per manifest and ID. Undefined where `id` names no virtual timeline.
 */
function virtualRoot(manifest: Manifest, id: string): TimelineManifest | undefined {
  let known = virtualRoots.get(manifest);
  if (known === undefined) {
    known = new Map();
    virtualRoots.set(manifest, known);
  }
  const found = known.get(id);
  if (found !== undefined) return found;
  const virtual = (manifest.virtual_timelines ?? []).find((item) => item.id === id);
  if (virtual === undefined) return undefined;
  const root: TimelineManifest = {
    id,
    name: virtual.name ?? id,
    unit: virtual.unit,
    number_type: virtual.number_type,
    length: virtual.length,
    locked: true,
    is_segment_line: false,
    meta: {},
    children: [],
    conversion_maps: [],
    regions: [],
    flow_control: [],
  };
  known.set(id, root);
  return root;
}

/** The timeline `id` of `manifest`: one of its trees', or a virtual timeline read as a root (`virtualRoot`). */
function timelineOrVirtual(manifest: Manifest, id: string): TimelineManifest | undefined {
  return findTimeline(manifest, id) ?? virtualRoot(manifest, id);
}

/** The timeline `id` of `manifest`, which a drawing of it draws (`timelineOrVirtual`). */
function drawnTimeline(manifest: Manifest, id: string): TimelineManifest {
  const timeline = timelineOrVirtual(manifest, id);
  if (timeline === undefined) throw new Error(`the drawn timeline '${id}' is not in its manifest`);
  return timeline;
}

/**
 * A timeline drawn in a card (`cardTimelines`): the timeline, where its
 * zero lies on its root's axis (exact), the ordinate of the line it is
 * crossed at there, where the card's drawing of it ends when its length is
 * not known (its `reach` there, on its own axis), and the maps drawn for it
 * in the card with their ordinates, in the order they are drawn.
 */
interface CardTimeline {
  readonly timeline: TimelineManifest;
  readonly zero: Rational;
  readonly ordinate: number;
  readonly reach?: Real;
  readonly maps: readonly ConversionMap[];
  readonly mapOrdinates: ReadonlyMap<string, number>;
}

const traversalRanks = new WeakMap<Manifest, ReadonlyMap<string, number>>();

/**
 * The rank of every timeline of `manifest` in traversal order (section 6.1:
 * pre-order, a root's children by offset), once per manifest.
 */
function traversalRankOf(manifest: Manifest): ReadonlyMap<string, number> {
  let ranks = traversalRanks.get(manifest);
  if (ranks === undefined) {
    const found = new Map<string, number>();
    const walk = (timeline: TimelineManifest): void => {
      if (!found.has(timeline.id)) found.set(timeline.id, found.size);
      for (const child of orderedChildren(timeline)) walk(child);
    };
    for (const root of manifest.timelines) walk(root);
    ranks = found;
    traversalRanks.set(manifest, ranks);
  }
  return ranks;
}

const cardTimelinesByDrawing = new WeakMap<Drawing, Map<string, readonly CardTimeline[]>>();

/**
 * Every timeline the card drawing the line keyed `lineKey` (a key of
 * `lineAxes`) of `drawing`, a drawing of `manifest`, draws, once per drawing
 * and line: each drawn there as a line of its own, as an ancestor line
 * (section 8.3) or as a segment without a line of its own on its segment
 * line, once, in traversal order (pre-order, children by offset). All of
 * them share one root (the card's member drawing and its ancestor lines),
 * so each one's `zero` places it against every other. A timeline's
 * ordinate is its own line's, else its segment line's; where its length is
 * not known, its reach is where that line ends (its `start` plus its drawn
 * length), else its drawn span as a segment; its maps are those drawn at
 * the card's lines whose owner it is. These are what a
 * cross-section line at any abscissa of the card crosses (drawing.md
 * section 2: a timestamp's coordinates in a card), wherever it spans that
 * abscissa. An ancestor card (section 8.8) is a card of its own: its lines
 * are never another card's.
 */
function cardTimelines(
  manifest: Manifest,
  drawing: Drawing,
  lineKey: string,
): readonly CardTimeline[] {
  let byLine = cardTimelinesByDrawing.get(drawing);
  if (byLine === undefined) {
    byLine = new Map();
    cardTimelinesByDrawing.set(drawing, byLine);
  }
  const known = byLine.get(lineKey);
  if (known !== undefined) return known;
  const all = lineAxes(drawing);
  const line = all.get(lineKey);
  if (line === undefined) throw new Error(`the drawing draws no line ${lineKey}`);
  const card = placeKeyText(line.card);
  const lines = [...all.values()].filter(
    (each) =>
      placeKeyText(each.card) === card &&
      (each.ancestor === undefined) === (line.ancestor === undefined),
  );
  const ordinates = new Map<string, number>();
  const ends = new Map<string, Real>();
  for (const each of lines) {
    ordinates.set(each.timeline, each.y);
    ends.set(each.timeline, addReal(each.start, each.drawnLength));
  }
  for (const each of lines) {
    for (const segment of each.segments) {
      if (ordinates.has(segment.id)) continue;
      ordinates.set(segment.id, each.y);
      ends.set(segment.id, segment.length);
    }
  }
  const maps = new Map<string, ConversionMap[]>();
  const mapOrdinates = new Map<string, Map<string, number>>();
  for (const { maps: drawn } of lines) {
    for (const { id, owner, yc } of drawn) {
      const owned = mapOrdinates.get(owner) ?? new Map<string, number>();
      if (owned.has(id)) continue;
      const map = drawnTimeline(manifest, owner).conversion_maps.find((item) => item.id === id);
      if (map === undefined) continue;
      owned.set(id, yc);
      mapOrdinates.set(owner, owned);
      maps.set(owner, [...(maps.get(owner) ?? []), map]);
    }
  }
  const ranks = traversalRankOf(manifest);
  const rankOf = (id: string): number => ranks.get(id) ?? ranks.size;
  const found = [...ordinates]
    .sort(([left], [right]) => rankOf(left) - rankOf(right))
    .map(([id, ordinate]): CardTimeline => {
      const timeline = drawnTimeline(manifest, id);
      const reach = timeline.length === null ? ends.get(id) : undefined;
      return {
        timeline,
        zero: zeroOf(manifest, id),
        ordinate,
        ...(reach === undefined ? {} : { reach }),
        maps: maps.get(id) ?? [],
        mapOrdinates: mapOrdinates.get(id) ?? new Map(),
      };
    });
  byLine.set(lineKey, found);
  return found;
}

/** `item`'s axis with the maps drawn for it and its reach there, read at its ordinate in its card. */
function cardAxis(item: CardTimeline): TimelineAxis {
  const axis = timelineAxisOf(item.timeline, item.maps);
  return crossedAt(
    item.reach === undefined ? axis : { ...axis, reach: item.reach },
    item.ordinate,
    item.mapOrdinates,
  );
}

/**
 * The cross-section read on the line keyed `lineKey` (a key of `axesOf`)
 * of `drawing`, block `block`'s drawing of `manifest`, anchored on the
 * timeline `anchor` (the line's own by default, else a segment the line
 * holds): what a cross-section line in the line's card crosses (drawing.md
 * section 2), every timeline the card draws (`cardTimelines`: the root,
 * the anchor's ancestors, siblings, children and every other timeline of
 * the card, as lines, ancestor lines or segments of a line) at its offset
 * from the anchor's zero, exact, each with the maps drawn for it in the
 * card, at the ordinate of its line there, so its rows are listed top to
 * bottom, and, of unknown length, with its reach there; plus the anchor's
 * ancestors wherever they are drawn or not: an ancestor the card does not
 * draw (its line hidden) follows at its offset (core's `ancestorMembers`),
 * without maps or ordinate, so it is listed after the drawn rows. Core's
 * `timestampAt` keeps of them those whose span holds the position, ends
 * included. An anchor the card does not draw is read on its own axis
 * without maps.
 */
export function crossSectionSpec(
  manifest: Manifest,
  block: BlockId,
  drawing: Drawing,
  lineKey: string,
  granularity: Granularity,
  anchor?: string,
): CrossSectionSpec {
  const line = lineAxes(drawing).get(lineKey);
  if (line === undefined) throw new Error(`the drawing draws no line ${lineKey}`);
  const id = anchor ?? line.timeline;
  const timelines = cardTimelines(manifest, drawing, lineKey);
  const own = timelines.find((item) => item.timeline.id === id);
  const zero = own?.zero ?? zeroOf(manifest, id);
  const drawn = timelines
    .filter((item) => item !== own)
    .map((item): CrossSectionMember => ({ ...cardAxis(item), offset: item.zero.subtract(zero) }));
  const listed = new Set(timelines.map((item) => item.timeline.id));
  return {
    block,
    granularity,
    anchor: own === undefined ? timelineAxisOf(drawnTimeline(manifest, id), []) : cardAxis(own),
    members: [
      ...drawn,
      ...ancestorMembers(manifest, id).filter((ancestor) => !listed.has(ancestor.timeline)),
    ],
  };
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

const runsByDrawing = new WeakMap<Drawing, ReadonlyMap<string, readonly LineAxis[]>>();

/**
 * The runs of the line `axis` of `drawing` is one run of: every line of
 * `lineAxes` drawing its timeline in its card at its ordinate, `axis`
 * included, from the left (one where the line is drawn whole).
 */
function runsOf(drawing: Drawing, axis: LineAxis): readonly LineAxis[] {
  let byLine = runsByDrawing.get(drawing);
  if (byLine === undefined) {
    const found = new Map<string, LineAxis[]>();
    for (const line of lineAxes(drawing).values()) {
      const key = JSON.stringify([placeKeyText(line.card), line.timeline, line.y]);
      found.set(key, [...(found.get(key) ?? []), line]);
    }
    for (const runs of found.values()) runs.sort((left, right) => left.xStart - right.xStart);
    byLine = found;
    runsByDrawing.set(drawing, byLine);
  }
  return byLine.get(JSON.stringify([placeKeyText(axis.card), axis.timeline, axis.y])) ?? [axis];
}

/** The position, on its timeline's own axis, at the end of the run `axis`: its start plus its drawn length. */
const endOf = (axis: LineAxis): Rational =>
  toRational(axis.start).add(toRational(axis.drawnLength));

/**
 * Whether the seam between the runs `left` and `right` of an ancestor
 * card's line of `drawing` (section 8.8, step 2, and "Drawn once") lies at
 * the start of the card's protected span: `left` ends at the left edge of
 * the leftmost frame the card lies behind (its member's frame, or the first
 * anchor's of a root drawn once), where the card's axis jumps by that
 * frame's room before its member drawings.
 */
function startsSpan(drawing: Drawing, left: LineAxis, right: LineAxis): boolean {
  if (left.ancestor === undefined) return false;
  const card = drawing.boxes.find(
    (box) => box.ancestor !== undefined && box.key !== null && samePlaceKey(box.key, left.card),
  );
  const groups = card?.ancestor?.groups ?? [];
  const edges = drawing.boxes
    .filter(
      (box) =>
        box.kind === "frame" && box.key !== null && groups.includes(box.key.item) && box.displayed,
    )
    .map((box) => box.x);
  if (edges.length === 0) return false;
  const edge = Math.min(...edges);
  return left.xEnd <= edge && edge < right.xStart;
}

/**
 * Whether the run `axis` of a line of `drawing` holds the position `at` of
 * its timeline's own axis (`docs/drawing.md` in TimeToShare, section 3.2,
 * Seams): where another run of the line starts where `axis` ends, or ends
 * where it starts, the two meet at a seam, which leaves nothing out, and a
 * position at the seam lies on one side of it alone: on the right run at
 * the seam where an ancestor card's protected span starts (`startsSpan`),
 * so under the frame, and on the left run at every other one (the span's
 * end, and between two anchors of a root drawn once, where a line ending
 * at the seam ends on the left run). Every other position on its span is
 * held.
 */
export function holdsAt(drawing: Drawing, axis: LineAxis, at: Rational): boolean {
  const runs = runsOf(drawing, axis);
  if (runs.length < 2) return true;
  if (at.compare(endOf(axis)) === 0) {
    const right = runs.find((run) => run !== axis && toRational(run.start).compare(at) === 0);
    if (right !== undefined && startsSpan(drawing, axis, right)) return false;
  }
  if (at.compare(toRational(axis.start)) === 0) {
    const left = runs.find((run) => run !== axis && endOf(run).compare(at) === 0);
    if (left !== undefined && !startsSpan(drawing, left, axis)) return false;
  }
  return true;
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
 * offset added) on the side of a seam it lies on (`holdsAt`), and its
 * abscissa there (layout's `abscissaOf`) within the part, both ends
 * included. None where the user sees no line of the timeline at that
 * value. The one place rule of a coordinate: screen order
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
    if (!spans(axis, onLine) || !holdsAt(drawing, axis, onLine)) return [];
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
 * `drawing` added after its members, each with every timeline its card
 * draws (`cardTimelines`: what the groupstamp's line crosses there,
 * ancestor lines included): the frames whose cards draw a line `holds`
 * says carries the timestamp (layout's `frameMemberLines` names each
 * frame's members). A group's members start and end together, so each
 * other member is read by the group from the member card holding the
 * anchor: at that member's offset from the anchor's zero (0 where the
 * anchor is the member, its ancestor offset where the anchor is a
 * descendant of it), scaled by its drawn end over that member's; every
 * other timeline of its card at the member's offset plus its own offset
 * from the member's zero (negative for an ancestor) divided by that scale,
 * with the same scale, so that its coordinate is the member's less that
 * offset; each with the maps drawn for it there; then each ancestor of the
 * member its card does not draw (its line hidden) alike, without maps. Where
 * that member's length or the length of the member card holding the anchor is
 * not known (layout's `readsAcrossGroup`), the group gives it no coordinate:
 * each timeline read for it is `valueless`, listed without a value, its
 * scale (a drawn length that is a reach) only placing it. Each is read at the
 * ordinate of its line in the member's card, or, while `raised`
 * (`raisedRoot`) names a root whose cards draw the member, in the raised
 * card, on the line of it lifted in the stacking (the first of `linesOf`),
 * as its own reading is placed there first (`placesAt`). The member is read
 * on that line whatever the position, so a reading's cross-section does not
 * depend on where the pointer lies. The member card holding the anchor adds
 * the timelines it draws beyond `spec`'s, unscaled. A timeline already in
 * `spec` or added, a member card whose drawn end is 0 and an anchor whose
 * member card is not among `spec`'s timelines are passed over. The one
 * reading of a groupstamp's members: a named groupstamp's pin and a hover
 * above a timeline editor take it, so the Timestamp tab and the coordinate
 * flag read the same timelines.
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
   * The member drawn as `line` and every timeline its card draws, at
   * `offset` and `scale`; read by the group (`scale` given), then its
   * ancestors its card does not draw (`ancestorMembers`), without maps or
   * ordinate, at the same scale; each `valueless` where `valueless`.
   */
  const read = (
    line: DrawnAxis,
    offset: Rational,
    scale: Rational | undefined,
    valueless = false,
  ): void => {
    const marked = valueless ? { valueless } : {};
    const timeline = line.address.id;
    if (timeline === undefined) return;
    const [first] = linesOf(drawing, timeline, stacking);
    const lifted = first !== undefined && stacking.lifted(first.axis) ? first : undefined;
    const key = lifted?.key ?? markedKey(drawing, line);
    if (key === undefined) return;
    const zero = zeroOf(manifest, timeline);
    for (const item of cardTimelines(manifest, drawing, key)) {
      const own = item.zero.subtract(zero);
      const axis = cardAxis(item);
      add(
        scale === undefined
          ? { ...axis, offset: offset.add(own) }
          : { ...axis, offset: offset.add(own.divide(scale)), scale, ...marked },
      );
    }
    if (scale === undefined) return;
    for (const ancestor of ancestorMembers(manifest, timeline)) {
      const at = offset.add(toRational(ancestor.offset).divide(scale));
      add({ ...ancestor, offset: at, scale, ...marked });
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
      read(line, at, other.divide(drawnEnd), !readsAcrossGroup(held, line));
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
  const found = timelineOrVirtual(manifest, timeline);
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
  const timeline = named === undefined ? undefined : timelineOrVirtual(manifest, named.timeline);
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
    axis.marker !== null && axis.timestamps.some((item) => item.id === named.id);
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
    const timeline = timelineOrVirtual(manifest, named.timeline);
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
 * no line is hovered. A node in which the point lies inside a gap of an
 * elision (`gapAt`) reads nothing: the stretch it elides is not drawn
 * there, so nothing is placed, not even the end of a run beside it; every
 * full run of an elided line is a line of its own (`axesOf`), read alike,
 * and a position read at a seam lies on the run holding it (`seamHit`).
 * An ancestor line is read as its ancestor's (`crossSectionSpec`). The
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
    const stacking = stackingOf(drawing, raisedRoot(block, node.data.editing));
    // Inside a gap nothing is placed: the stretch it elides is not drawn there.
    if (gapAt(drawing, local, stacking) !== null) continue;
    const hit = lineAt(axesOf(drawing), local, tolerance, stacking.covered);
    if (
      hit !== null &&
      (found === null || hit.distance * devicePixels <= found.hit.distance * found.devicePixels)
    ) {
      found = { node, hit, devicePixels };
    }
  }
  if (found === null) return null;
  const { node, devicePixels } = found;
  const { block, drawing } = node.data;
  const read = found.hit;
  const length = toFloat(toRational(read.axis.drawnLength));
  const width = read.axis.xEnd - read.axis.xStart;
  const p = toFloat(toRational(read.axis.start)) + ((read.x - read.axis.xStart) / width) * length;
  const h = length / width / devicePixels / 2;
  const raised = raisedRoot(block, node.data.editing);
  const specOf = (line: LineHit) =>
    hoveredSpec(block, drawing, line, options.granularity, raised, groupScoped(node.data.editing));
  const knots = options.knotsOf?.(block.manifest) ?? "no_server";
  const row = rowOf(read);
  const position = snapOnRow(specOf(read), row, p, h, knots);
  const hit = seamHit(drawing, read, position, stackingOf(drawing, raised));
  if (hit === null) return null;
  const { axis } = hit;
  const spec = specOf(hit);
  const pin: Pin = { spec, knots, timestamp: timestampAt(spec, position, knots), named: null };
  const [line] = crossSection(drawing, hit.key, 0);
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
 * The line a reading on `hit` lies on once its position `position` (on the
 * hit line's own axis) is read: `hit` itself, or where the position lies at
 * a seam on the other side (`holdsAt`), the run of the line holding it, at
 * the position's abscissa there, with the map hovered where that run draws
 * it; `null` where that run is covered there, so the position is not seen.
 */
function seamHit(
  drawing: Drawing,
  hit: LineHit,
  position: Rational,
  stacking: Stacking,
): LineHit | null {
  if (holdsAt(drawing, hit.axis, position)) return hit;
  for (const [key, axis] of axesOf(drawing)) {
    if (!runsOf(drawing, hit.axis).includes(axis) || axis === hit.axis) continue;
    if (!spans(axis, position) || !holdsAt(drawing, axis, position)) continue;
    const x = abscissaOf(axis, position);
    if (stacking.covered(axis, { x, y: axis.y })) return null;
    const map = hit.map === null ? null : (axis.maps.find(({ id }) => id === hit.map?.id) ?? null);
    return { key, axis, map, x, distance: hit.distance };
  }
  return null;
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

/** The width of the flag's pole in pixels. */
export const POLE_WIDTH = 1;
/** How far, in pixels, the flag's pole rises above what it marks. */
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

/** One row the flag adds for a flow: what it names and its value as the flag writes it. */
export interface FlowFlagRow {
  /** Unique within its part. */
  readonly key: string;
  readonly name: string;
  readonly value: string;
}

/**
 * A part the flag adds below the timestamp's for a flow (plan of the canvas's
 * virtual cards; TimeToShare's `docs/drawing.md`, section 8.10): the written
 * position of a virtual timeline's played one, or the played positions of a
 * root's written one on its virtual cards.
 */
export interface FlowFlagPart {
  /** Unique within the flag: `written <V>` or `played <R>`. */
  readonly key: string;
  readonly name: string;
  readonly rows: readonly FlowFlagRow[];
}

/** A card of a virtual timeline the block draws: its timeline and the group whose frame holds it, `null` for one of its own. */
export interface VirtualCard {
  readonly timeline: string;
  readonly group: string | null;
}

/**
 * The cards of virtual timelines `manifest` draws at `places`, in the order
 * the block draws them (section 8.1): the virtual members of each frame in
 * its display order, frame by frame in the canonical order of their groups,
 * then each placed virtual timeline in no group whose ID `places` holds, by ID.
 */
export function virtualCards(manifest: Manifest, places: Block["places"]): VirtualCard[] {
  const virtual = new Set((manifest.virtual_timelines ?? []).map((item) => item.id));
  if (virtual.size === 0) return [];
  const framed = memberDrawings(manifest).frames.flatMap(({ group }) =>
    displayOrder(manifest, group.id)
      .filter((id) => virtual.has(id))
      .map((timeline) => ({ timeline, group: group.id })),
  );
  const grouped = new Set(manifest.groups.flatMap((group) => group.members));
  const placed = [...virtual]
    .filter((id) => !grouped.has(id) && placeAt(places, { item: id }) !== undefined)
    .sort(compareCodePoints)
    .map((timeline) => ({ timeline, group: null }));
  return [...framed, ...placed];
}

/** A virtual timeline of `manifest` resolved through a FlowMap of its own root, else `null`. */
function flowVirtual(manifest: Manifest, id: string): ResolvedVirtualTimeline | null {
  try {
    const resolved = resolveVirtualTimeline(manifest, id);
    return resolved.kind === "flow_map" && resolved.through === null ? resolved : null;
  } catch (error) {
    if (error instanceof FlowMapError) return null;
    throw error;
  }
}

/** The name of a timeline, a virtual timeline or a group of `manifest`: its `name`, else its ID. */
function nameIn(manifest: Manifest, id: string): string {
  const named =
    findTimeline(manifest, id) ??
    (manifest.virtual_timelines ?? []).find((item) => item.id === id) ??
    manifest.groups.find((item) => item.id === id);
  return named?.name ?? id;
}

/** A coordinate as the flag writes it, rounded to `decimals` places. */
function coordinateText(coordinate: Coordinate, decimals: number): string {
  return prettyText(coordinate.value, coordinate.numberType, coordinate.unit, decimals);
}

/**
 * The parts the flag adds to `pin`'s for flows, the block's manifest
 * `manifest` drawn at `places`, its values rounded to `decimals` places:
 *
 * - where the anchor is a virtual timeline `V` resolved through a FlowMap of
 *   its root `R`, the part `written <V>`, named by `R`, with the row
 *   `coordinate`, the position written that `V` plays at the anchor's
 *   (core's `foldVirtual`), and the row `occurrence`, `k of n`, the place of
 *   the anchor's position among every played position of that written one
 *   (`unfoldVirtual`); inside a gap the one row `coordinate`, `in a gap`;
 * - for every part of the timestamp whose timeline is a root `R` with a
 *   virtual card drawn (`virtualCards`), the part `played <R>`, named
 *   `<R's name> played`, with one row per such card in the block's order,
 *   named by its virtual timeline (followed by ` in <group's name>` for a
 *   card in a frame), its value every played position of the part's
 *   coordinate in the order played, joined by `, `, or `not played`.
 *
 * None for a pin of a timeline outside every flow.
 */
export function flowFlagParts(
  manifest: Manifest,
  places: Block["places"],
  pin: Pin,
  decimals: number,
): FlowFlagPart[] {
  const parts: FlowFlagPart[] = [];
  const [anchor] = pin.timestamp.parts;
  const resolved = anchor === undefined ? null : flowVirtual(manifest, anchor.timeline);
  if (anchor !== undefined && resolved !== null) {
    const played = { unit: anchor.unit, numberType: anchor.numberType, value: anchor.position };
    parts.push({
      key: `written ${anchor.timeline}`,
      name: nameIn(manifest, resolved.source),
      rows: writtenRows(resolved, played, decimals),
    });
  }
  const cards = virtualCards(manifest, places);
  for (const part of pin.timestamp.parts) {
    if (!manifest.timelines.some((root) => root.id === part.timeline)) continue;
    const written = { unit: part.unit, numberType: part.numberType, value: part.position };
    const rows = cards.flatMap(({ timeline, group }): FlowFlagRow[] => {
      const virtual = flowVirtual(manifest, timeline);
      if (virtual === null || virtual.source !== part.timeline) return [];
      const own = nameIn(manifest, timeline);
      return [
        {
          key: `${timeline} ${group ?? ""}`,
          name: group === null ? own : `${own} in ${nameIn(manifest, group)}`,
          value: playedText(virtual, written, decimals),
        },
      ];
    });
    if (rows.length > 0) {
      parts.push({
        key: `played ${part.timeline}`,
        name: `${nameIn(manifest, part.timeline)} played`,
        rows,
      });
    }
  }
  return parts;
}

/** The rows of the written position `resolved` plays at `played`. */
function writtenRows(
  resolved: ResolvedVirtualTimeline,
  played: Coordinate,
  decimals: number,
): FlowFlagRow[] {
  const written = foldOrNull(resolved, played);
  if (written === null) return [{ key: "coordinate", name: "coordinate", value: "in a gap" }];
  const occurrences = unfoldVirtual(resolved, written);
  const index = occurrences.findIndex((each) => compareCoordinates(each.played, played) === 0);
  const rows: FlowFlagRow[] = [
    { key: "coordinate", name: "coordinate", value: coordinateText(written, decimals) },
  ];
  const found = occurrences[index];
  if (found !== undefined) {
    rows.push({
      key: "occurrence",
      name: "occurrence",
      value: `${found.occurrence} of ${found.of}`,
    });
  }
  return rows;
}

/** The written position `resolved` plays at `played`; `null` in a gap, at its length or outside its axis. */
function foldOrNull(resolved: ResolvedVirtualTimeline, played: Coordinate): Coordinate | null {
  try {
    return foldVirtual(resolved, played);
  } catch (error) {
    if (error instanceof FlowMapError) return null;
    throw error;
  }
}

/** Every played position of `written` on `virtual`, joined by `, `; `not played` for none. */
function playedText(
  virtual: ResolvedVirtualTimeline,
  written: Coordinate,
  decimals: number,
): string {
  let occurrences: readonly Occurrence[];
  try {
    occurrences = unfoldVirtual(virtual, written);
  } catch (error) {
    if (!(error instanceof FlowMapError)) throw error;
    occurrences = [];
  }
  if (occurrences.length === 0) return "not played";
  return occurrences.map((each) => coordinateText(each.played, decimals)).join(", ");
}
