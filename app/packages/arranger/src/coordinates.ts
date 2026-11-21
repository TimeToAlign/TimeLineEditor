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
 * frame that needs one.
 */

import type {
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
  Real,
  Row,
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
import type { AffordanceSource } from "./boxes.ts";
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
const axesByDrawing = new WeakMap<Drawing, ReadonlyMap<string, LineAxis>>();

/**
 * The lines of `drawing` that draw coordinate markers (each one
 * `crossedLines` crosses), once per drawing, keyed as in layout's
 * `lineAxes` and in its order: never an ancestor line, which draws none.
 * A named timestamp has its place on them, whatever their length.
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

/**
 * The lines of `drawing` a pointer reads a timestamp on, once per drawing:
 * the marked lines (`markedOf`) that are measurable, a line of unknown
 * length over its drawn span, never a zero-length line.
 */
export function axesOf(drawing: Drawing): ReadonlyMap<string, LineAxis> {
  let axes = axesByDrawing.get(drawing);
  if (axes === undefined) {
    axes = new Map([...markedOf(drawing)].filter(([, axis]) => measurable(axis)));
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
 * around: of every line whose zone holds the point (`zoneHit`), the one
 * nearest in ordinate by the line or the map hovered in it, an earlier line
 * on a tie; `null` where none does.
 */
export function lineAt(
  axes: ReadonlyMap<string, LineAxis>,
  point: Point,
  tolerance: number,
): LineHit | null {
  let best: LineHit | null = null;
  for (const [key, axis] of axes) {
    const hit = zoneHit(key, axis, point, tolerance);
    if (hit !== null && (best === null || hit.distance < best.distance)) best = hit;
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

/** The timeline `id` of `manifest`, which a drawing of it draws. */
function drawnTimeline(manifest: Manifest, id: string): TimelineManifest {
  const timeline = findTimeline(manifest, id);
  if (timeline === undefined) throw new Error(`the drawn timeline '${id}' is not in its manifest`);
  return timeline;
}

/**
 * The cross-section read on the line keyed `lineKey` (a key of `markedOf`)
 * of `drawing`, block `block`'s drawing of `manifest`, anchored on the
 * timeline `anchor` (the line's own by default, else a segment the line
 * holds): the anchor's timeline, then as members its ancestors, parent
 * first, without maps (core's `ancestorMembers`: a parent's coordinate is
 * its child's plus the child's offset, up to the root, whether the anchor
 * is drawn in its parent's card or in a card of its own as a group's
 * member), then every timeline in its subtree that the cross-section line
 * crosses (`crossedLines` after the line itself, and the segments of every
 * crossed line), each once, in traversal order (pre-order, children by
 * offset), each at its offset from the anchor's zero, exact. Every
 * timeline of the subtree carries the maps drawn for it at the crossed
 * lines, in the order they are drawn, as the manifest holds them. No
 * sibling segment of a segment anchor is a member.
 */
export function crossSectionSpec(
  manifest: Manifest,
  block: BlockId,
  drawing: Drawing,
  lineKey: string,
  granularity: Granularity,
  anchor?: string,
): CrossSectionSpec {
  const all = lineAxes(drawing);
  const lines = crossedLines(drawing, lineKey).flatMap((key) => {
    const line = all.get(key);
    return line === undefined ? [] : [line];
  });
  const [line] = lines;
  if (line === undefined) throw new Error(`the line ${lineKey} draws no cross-section`);
  const drawn = new Map<string, ConversionMap[]>();
  for (const { maps } of lines) {
    for (const { id, owner } of maps) {
      const map = drawnTimeline(manifest, owner).conversion_maps.find((item) => item.id === id);
      if (map !== undefined) drawn.set(owner, [...(drawn.get(owner) ?? []), map]);
    }
  }
  const crossed = new Set(
    lines.flatMap((each, index) => [
      ...(index === 0 ? [] : [each.timeline]),
      ...each.segments.map((segment) => segment.id),
    ]),
  );
  const root = drawnTimeline(manifest, anchor ?? line.timeline);
  const members: CrossSectionMember[] = ancestorMembers(manifest, root.id);
  const walk = (timeline: TimelineManifest, offset: Rational): void => {
    for (const child of orderedChildren(timeline)) {
      const at = offset.add(toRational(realOf(axisCoordinate(child.offset, timeline))));
      if (crossed.has(child.id)) {
        members.push({ ...timelineAxisOf(child, drawn.get(child.id) ?? []), offset: at });
      }
      walk(child, at);
    }
  };
  walk(root, ZERO);
  return {
    block,
    granularity,
    anchor: timelineAxisOf(root, drawn.get(root.id) ?? []),
    members,
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
 * Where the pinned timestamp `pin` is marked in `drawing`, its block's: on
 * the line keyed `preferred` (the line it was pinned on) while that line
 * draws its anchor, else on the first line of `axesOf` drawing it, at the
 * abscissa of its position, across the group's frame where the pin reads
 * the group (`readsGroup`); `null` where no such line draws its anchor or
 * the position lies outside the line's drawn span.
 */
export function pinnedPlace(
  drawing: Drawing,
  pin: Pin,
  preferred: string | null,
): MarkPlace | null {
  const axes = axesOf(drawing);
  const { timeline } = pin.spec.anchor;
  const own = preferred === null ? undefined : axes.get(preferred);
  const found =
    preferred !== null && own?.timeline === timeline
      ? ([preferred, own] as const)
      : [...axes].find(([, axis]) => axis.timeline === timeline);
  const [anchor] = pin.timestamp.parts;
  if (found === undefined || anchor === undefined) return null;
  const [key, axis] = found;
  const position = toRational(anchor.position);
  return spans(axis, position)
    ? { key, x: abscissaOf(axis, position), group: readsGroup(pin) }
    : null;
}

/**
 * A line a timeline has its place on: its key, its axis, where the
 * timeline's zero lies on it, and the timeline's length there when it is a
 * segment of the line (`null` on a line of its own).
 */
export interface Holding {
  readonly key: string;
  readonly axis: LineAxis;
  readonly offset: Rational;
  readonly length: Rational | null;
}

/**
 * The marked lines of `drawing` (`markedOf`) drawing the timeline
 * `timeline`, in their order, each with its timeline's zero on it (0):
 * every line of its own, else every line whose segment it is, at the
 * segment's offset and with its length; none where no such line is drawn.
 * Where a named timestamp, and a coordinate shown by "Show matches", has
 * its place.
 */
export function holdings(drawing: Drawing, timeline: string): Holding[] {
  const lines = [...markedOf(drawing)];
  const own = lines.filter(([, axis]) => axis.timeline === timeline);
  if (own.length > 0) return own.map(([key, axis]) => ({ key, axis, offset: ZERO, length: null }));
  return lines.flatMap(([key, axis]) => {
    const segment = axis.segments.find((item) => item.id === timeline);
    return segment === undefined
      ? []
      : [
          {
            key,
            axis,
            offset: toRational(segment.offset),
            length: toRational(segment.length),
          },
        ];
  });
}

/**
 * `spec` with every member of each group whose frame draws its timestamp in
 * `drawing` added after its members: the frames whose cards draw a line
 * `holds` says carries the timestamp (layout's `frameMemberLines` names each
 * frame's members). A group's members start and end together, so each other
 * member is read by the group from the member card holding the anchor: at
 * that member's offset from the anchor's zero (0 where the anchor is the
 * member, its ancestor offset where the anchor is a descendant of it), scaled
 * by its drawn end over that member's, with the maps drawn at its line for
 * it. A timeline already in `spec`, a member card whose drawn end is 0 and
 * an anchor whose member card is not among `spec`'s timelines are passed
 * over. The one reading of a groupstamp's members: a named groupstamp's pin
 * and a hover above a timeline editor take it.
 */
function withGroupMembers(
  spec: CrossSectionSpec,
  manifest: Manifest,
  drawing: Drawing,
  holds: (axis: DrawnAxis) => boolean,
): CrossSectionSpec {
  const offsets = new Map<string, Real>([
    [spec.anchor.timeline, ZERO],
    ...spec.members.map((member) => [member.timeline, member.offset] as const),
  ]);
  const taken = new Set(offsets.keys());
  const members: CrossSectionMember[] = [];
  for (const own of drawing.axes) {
    const holder = own.card.member;
    if (holder === undefined || !holds(own)) continue;
    const lines = frameMemberLines(drawing.axes, own.card.item);
    const offset = offsets.get(holder);
    const held = lines.find((line) => line.address.id === holder);
    if (offset === undefined || held === undefined) continue;
    const drawnEnd = toRational(held.drawnEnd);
    if (drawnEnd.numerator === 0n) continue;
    for (const line of lines) {
      const member = line.address.id;
      const other = toRational(line.drawnEnd);
      if (member === undefined || taken.has(member) || other.numerator === 0n) continue;
      taken.add(member);
      const node = drawnTimeline(manifest, member);
      const maps = line.maps.flatMap(({ id, owner }) => {
        const map =
          owner === member ? node.conversion_maps.find((item) => item.id === id) : undefined;
        return map === undefined ? [] : [map];
      });
      members.push({ ...timelineAxisOf(node, maps), offset, scale: other.divide(drawnEnd) });
    }
  }
  return members.length === 0 ? spec : { ...spec, members: [...spec.members, ...members] };
}

/** A named timestamp's coordinate, exact on its own timeline's axis. */
function namedCoordinate(named: NamedTimestamp, timeline: TimelineManifest): Rational {
  return toRational(realOf(axisCoordinate(named.coordinate, timeline)));
}

/**
 * The pin of the named timestamp `id` of `manifest`, block `block`'s,
 * drawn as `drawing`: its timeline the anchor, at its coordinate, read on
 * the first marked line holding its timeline (`holdings`,
 * `crossSectionSpec` anchored on it): a segment without a line of its own
 * on its segment line's line, its members those of its own subtree that
 * line crosses; where no line holds its timeline (a hidden line), with all
 * its own maps and its ancestors alone as members. A groupstamp's adds the
 * other members of its groups' frames, read by the group
 * (`withGroupMembers`): the Timestamp tab shows the whole GroupStamp. `knots` as `timestampAt` takes them; `null`
 * where the manifest holds no timestamp `id`.
 */
export function namedPin(
  manifest: Manifest,
  block: BlockId,
  drawing: Drawing,
  id: string,
  granularity: Granularity,
  knots: Knots,
): Pin | null {
  const named = manifest.graphical?.timestamps?.find((item) => item.id === id);
  const timeline = named === undefined ? undefined : findTimeline(manifest, named.timeline);
  if (named === undefined || timeline === undefined) return null;
  const [holding] = holdings(drawing, named.timeline);
  const spec: CrossSectionSpec =
    holding === undefined
      ? {
          block,
          granularity,
          anchor: timelineAxisOf(timeline, timeline.conversion_maps),
          members: ancestorMembers(manifest, timeline.id),
        }
      : crossSectionSpec(manifest, block, drawing, holding.key, granularity, named.timeline);
  const holds = (axis: DrawnAxis) =>
    axis.marker?.timestamps.some((item) => item.id === named.id) ?? false;
  const read = named.groupstamp ? withGroupMembers(spec, manifest, drawing, holds) : spec;
  const position = namedCoordinate(named, timeline);
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
  { readonly manifest: Manifest; readonly affordances: readonly Affordance[] }
>();

/**
 * The affordances of the named timestamps of `manifest` whose `display` is
 * empty, `drawing` being its drawing, but for a match timestamp, which
 * leaves no placeholder (its MatchStamp is reached through its lines and
 * connectors): each on every marked line holding its
 * timeline (`holdings`), whatever its length, its wedge at the abscissa of
 * its coordinate (layout's `abscissaOf`: the line's start on a zero-length
 * line), in the order the manifest lists them; a place outside the line's
 * drawn span is left out. The one place their geometry is computed, once
 * per drawing: the block node draws them, the marquee takes their bounds,
 * the projection counts their addresses as drawn.
 */
export function affordancesOf(manifest: Manifest, drawing: Drawing): readonly Affordance[] {
  const known = affordancesByDrawing.get(drawing);
  if (known?.manifest === manifest) return known.affordances;
  const affordances = (manifest.graphical?.timestamps ?? []).flatMap((named) => {
    if (named.display.length > 0 || named.matchstamp) return [];
    const timeline = findTimeline(manifest, named.timeline);
    if (timeline === undefined) return [];
    const coordinate = namedCoordinate(named, timeline);
    const address = idAddress(named.id);
    return holdings(drawing, named.timeline).flatMap(({ key, axis, offset }): Affordance[] => {
      const position = offset.add(coordinate);
      const wedge = spans(axis, position)
        ? wedgeAt(drawing, key, abscissaOf(axis, position))
        : null;
      return wedge === null
        ? []
        : [{ kind: "affordance", address, line: key, points: wedge.points }];
    });
  });
  affordancesByDrawing.set(drawing, { manifest, affordances });
  return affordances;
}

/**
 * The expanded MeasureMaps of a manifest, or why they are not at hand;
 * `undefined` for a manifest without MeasureMaps.
 */
export type KnotsOf = (manifest: Manifest) => readonly MeasureKnots[] | KnotsAbsence | undefined;

/**
 * The reading of the canvas point `point` over `nodes` at `zoom`, with
 * `ratio` device pixels per CSS pixel: of every node whose drawing holds a
 * line `point` hovers (`lineAt`, `HIT_TOLERANCE` device pixels around), the
 * nearest, a later node on a tie; `null` where no line is hovered. The
 * position is core's `snapOnRow` on the hovered row (`rowOf`) of the
 * line's cross-section (`crossSectionSpec`), `p` the pointer's coordinate
 * on the line's axis and `h` half a device pixel there: the line's drawn
 * length (up to its reach where its length is not known) over its width,
 * over zoom × the block's scale × `ratio`, halved. Above a timeline editor
 * (`groupScoped` of the node's editor) the cross-section also holds every
 * member of each group whose frame draws the hovered line's timeline, read
 * by the group as a groupstamp's (`withGroupMembers`).
 * `knotsOf` gives the expanded MeasureMaps of a manifest, or why they are
 * not at hand; without it no server expands them.
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
    const hit = lineAt(axesOf(drawing), local, tolerance);
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
  const crossing = crossSectionSpec(
    block.manifest,
    block.id,
    drawing,
    hit.key,
    options.granularity,
  );
  const spec = groupScoped(node.data.editing)
    ? withGroupMembers(
        crossing,
        block.manifest,
        drawing,
        (line) => line.marker !== null && line.address.id === axis.timeline,
      )
    : crossing;
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
  /** Its coordinate's row first, then one row per map drawn for it. */
  readonly rows: readonly TimestampRow[];
}

/** The rows of `pin` (core's `timestampRows`) grouped by part, in the timestamp's order. */
export function flagParts(pin: Pin): FlagPart[] {
  const rows = timestampRows(pin);
  return pin.timestamp.parts.map((part) => ({
    timeline: part.timeline,
    name: part.name,
    rows: rows.filter((row) => row.timeline === part.timeline),
  }));
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
  /** Whether the flag opens to the left of the pole. */
  readonly flipped: boolean;
}

/**
 * Where the flag of a reading hangs: its pole stands at `x` from `POLE_RISE`
 * above `top` (the topmost of the line, its maps and its cross-section
 * line), held below the canvas's top edge, down to `y`, the line; the flag
 * hangs from the pole's top, its near edge touching the pole's side, so it
 * never covers the pole nor the abscissa it marks. It opens to the right,
 * and to the left where a flag `flagWidth` wide would leave the canvas,
 * `width` wide, at its right edge.
 */
export function flagPlace(
  at: { readonly x: number; readonly y: number; readonly top: number },
  flagWidth: number,
  width: number,
): FlagPlace {
  const poleTop = Math.max(0, at.top - POLE_RISE);
  const right = at.x + POLE_WIDTH / 2;
  const flipped = right + flagWidth > width;
  return {
    pole: { x: at.x, top: poleTop, bottom: at.y },
    left: flipped ? at.x - POLE_WIDTH / 2 - flagWidth : right,
    top: poleTop,
    flipped,
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
