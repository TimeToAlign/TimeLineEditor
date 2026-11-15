/**
 * Show coordinates: what the pointer hovers on a drawn line and the
 * timestamp of the grid point under it.
 *
 * A line is hovered anywhere from the line out to the outermost map drawn
 * at it (layout's `lineAxes`), `HIT_TOLERANCE` device pixels beyond, so
 * the reading never stops over its maps or between them. The pointer's abscissa picks an exact count of grid steps
 * from the timeline's start (core's `gridStep` and `snapPosition`); the
 * values at that position are core's `timestampAt`, which evaluates each
 * map through its compiled evaluator. Nothing here evaluates a map or keeps
 * a value: a timestamp is computed anew for every frame that needs one.
 */

import type {
  BlockId,
  ConversionMap,
  Expressed,
  Granularity,
  KnotsAbsence,
  Manifest,
  MeasureKnots,
  Timestamp,
  TimestampMap,
  TimestampSegment,
  TimestampSpec,
  TimestampTimeline,
} from "@timetoalign/tilie-core";
import {
  displayValue,
  findTimeline,
  gridStep,
  measureText,
  missingValueText,
  saveManifest,
  snapPosition,
  timestampAt,
  unitSymbol,
} from "@timetoalign/tilie-core";
import { type Rational, type Real, toFloat, toRational } from "@timetoalign/tilie-core/numbers";
import type { AxisMap, Drawing, LineAxis } from "@timetoalign/tilie-layout";
import { lineAxes } from "@timetoalign/tilie-layout";
import type { Point } from "./gesture.ts";
import type { BlockNode } from "./project.ts";

/** How near, in device pixels, the pointer must come to a line or a map to hover it. */
export const HIT_TOLERANCE = 8;

/** A hovered line: its entry in `lineAxes`, the map hovered at it, and the abscissa on it. */
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

/** What the pointer reads on a block: the hovered line, the grid step, the position and its timestamp. */
export interface Reading {
  readonly block: BlockId;
  readonly hit: LineHit;
  readonly step: Rational;
  /** The grid point, exact, on the line's own axis. */
  readonly position: Rational;
  readonly timestamp: Timestamp;
  /** Where the position lies on the line, in block-local canvas units. */
  readonly at: Point;
  /** The topmost ordinate of the line and the maps drawn at it, in block-local canvas units. */
  readonly top: number;
}

const axesByDrawing = new WeakMap<Drawing, ReadonlyMap<string, LineAxis>>();

/** The drawn lines of `drawing` (layout's `lineAxes`), once per drawing. */
export function axesOf(drawing: Drawing): ReadonlyMap<string, LineAxis> {
  let axes = axesByDrawing.get(drawing);
  if (axes === undefined) {
    axes = lineAxes(drawing);
    axesByDrawing.set(drawing, axes);
  }
  return axes;
}

/** Whether a position on `axis` stands for a coordinate: its length is known and it spans some width. */
function measurable(axis: LineAxis): axis is LineAxis & { readonly length: Real } {
  return axis.length !== null && toFloat(toRational(axis.length)) > 0 && axis.xEnd > axis.xStart;
}

/** `value` held to `[low, high]`. */
function held(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}

/**
 * Where `point` hovers the measurable line `axis`, `tolerance` canvas units
 * around, or `null`: its zone runs from the line out to its outermost map,
 * `tolerance` beyond, over the line's span widened by `tolerance`. In the
 * zone the nearest in ordinate of the line and of each map whose span,
 * widened alike, holds the abscissa is hovered, the line on a tie and an
 * earlier map before a later one; the abscissa is held to its span.
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
 * The line `point` hovers among `axes`, `tolerance` canvas units around: of
 * every measurable line whose zone holds the point (`zoneHit`), the one
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
    if (!measurable(axis)) continue;
    const hit = zoneHit(key, axis, point, tolerance);
    if (hit !== null && (best === null || hit.distance < best.distance)) best = hit;
  }
  return best;
}

/**
 * The grid step on `axis` where one canvas unit of the block covers
 * `devicePixels` device pixels (the zoom times the block's scale times the
 * device pixel ratio).
 */
export function stepOf(axis: LineAxis, granularity: Granularity, devicePixels: number): Rational {
  const length = axis.length === null ? 0 : toFloat(toRational(axis.length));
  const perUnit = ((axis.xEnd - axis.xStart) / length) * devicePixels;
  return gridStep(axis.numberType, granularity, perUnit);
}

/**
 * The grid point on `axis` for the abscissa `x`: the multiple of `step`
 * nearest to the coordinate there, counted from the timeline's 0, held to
 * the line's drawn span `[start, start + length]`.
 */
export function positionAt(axis: LineAxis, x: number, step: Rational): Rational {
  const start = toRational(axis.start);
  const length = toRational(axis.length ?? 0);
  const fromStart = ((x - axis.xStart) / (axis.xEnd - axis.xStart)) * toFloat(length);
  const position = snapPosition(toFloat(start) + fromStart, step, start.add(length));
  return position.compare(start) < 0 ? start : position;
}

/** The abscissa of `position` on `axis`, in block-local canvas units. */
export function abscissaOf(axis: LineAxis, position: Rational): number {
  const start = toRational(axis.start);
  const length = toFloat(toRational(axis.length ?? 0));
  const share = length === 0 ? 0 : toFloat(position.subtract(start)) / length;
  return axis.xStart + share * (axis.xEnd - axis.xStart);
}

/** The maps of `owner` drawn at `axis`, in drawing order, as the manifest holds them. */
function drawnMaps(manifest: Manifest, axis: LineAxis, owner: string): ConversionMap[] {
  const timeline = findTimeline(manifest, owner);
  if (timeline === undefined) return [];
  return axis.maps.flatMap((drawn) => {
    if (drawn.owner !== owner) return [];
    const map = timeline.conversion_maps.find((candidate) => candidate.id === drawn.id);
    return map === undefined ? [] : [map];
  });
}

/** The timeline `id` of `manifest` as a timestamp reads it at `axis`. */
function timelineOf(manifest: Manifest, axis: LineAxis, id: string): TimestampTimeline {
  const timeline = findTimeline(manifest, id);
  if (timeline === undefined) throw new Error(`the drawn timeline '${id}' is not in its manifest`);
  return {
    timeline: id,
    name: timeline.name ?? id,
    unit: timeline.unit,
    numberType: timeline.number_type,
    maps: drawnMaps(manifest, axis, id),
  };
}

/**
 * What `timestampAt` reads for a position on `hit`'s line of block `block`:
 * the line's timeline with the maps drawn for it, and its segments with
 * theirs, in drawing order. A hovered map of a segment names that segment
 * alone, so the segment whose map the pointer is on is the one read, also
 * on the boundary it shares with the next.
 */
export function timestampSpec(
  manifest: Manifest,
  block: BlockId,
  hit: Pick<LineHit, "axis" | "map">,
  step: Rational,
): TimestampSpec {
  const { axis, map } = hit;
  const segments = axis.segments
    .filter((segment) => map === null || map.owner === axis.timeline || map.owner === segment.id)
    .map(
      (segment): TimestampSegment => ({
        ...timelineOf(manifest, axis, segment.id),
        offset: segment.offset,
        length: segment.length,
      }),
    );
  return { block, step, line: timelineOf(manifest, axis, axis.timeline), segments };
}

/** The topmost ordinate of `axis`'s line and the maps drawn at it. */
function topOf(axis: LineAxis): number {
  return axis.maps.reduce((top, map) => Math.min(top, map.yc), axis.y);
}

/**
 * The reading of the canvas point `point` over `nodes` at `zoom`, with
 * `ratio` device pixels per CSS pixel: of every node whose drawing holds a
 * line `point` hovers (`lineAt`, `HIT_TOLERANCE` device pixels around), the
 * nearest, a later node on a tie; `null` where no line is hovered.
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
    readonly knotsOf?:
      | ((manifest: Manifest) => readonly MeasureKnots[] | KnotsAbsence | undefined)
      | undefined;
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
  const { block } = node.data;
  const step = stepOf(hit.axis, options.granularity, devicePixels);
  const position = positionAt(hit.axis, hit.x, step);
  const spec = timestampSpec(block.manifest, block.id, hit, step);
  const knots = options.knotsOf === undefined ? "no_server" : options.knotsOf(block.manifest);
  const timestamp = timestampAt(spec, position, knots);
  return {
    block: block.id,
    hit,
    step,
    position,
    timestamp,
    at: { x: abscissaOf(hit.axis, position), y: hit.axis.y },
    top: topOf(hit.axis),
  };
}

/** A map's value as the flag writes it: the text and its unit's symbol, `null` where it names none. */
export interface ValueText {
  readonly text: string;
  readonly unit: string | null;
}

/** An expressed result as text: a number in its type, a label as it is, a measure by its name, outputs by name. */
function expressedText(value: Expressed): ValueText {
  if (typeof value === "string") return { text: value, unit: null };
  if ("record" in value) return { text: measureText(value.record), unit: "measure" };
  if ("outputs" in value) {
    const outputs = Object.entries(value.outputs).map(([name, output]) => {
      const { text, unit } = expressedText(output);
      return `${name} ${text}${unit === null ? "" : ` ${unit}`}`;
    });
    return { text: outputs.join(" · "), unit: null };
  }
  return {
    text: displayValue(value.value, value.numberType),
    unit: value.unit === null ? null : unitSymbol(value.unit),
  };
}

/** The value of one map of a timestamp as text; a map that gives none says why, in core's words. */
export function mapValueText(map: TimestampMap): ValueText {
  if (map.value !== null) return expressedText(map.value);
  return { text: missingValueText(map), unit: null };
}

/**
 * The expanded MeasureMaps of each manifest, asked of `fetch` with the
 * manifest's text once per manifest object (one version of a manifest)
 * that has MeasureMaps, and kept as the answer arrives; `changed` is
 * called then. `fetch` answers the rows, or `unsupported` where the server
 * cannot expand MeasureMaps; a request that fails leaves them `failed`.
 * Until the answer arrives they are `pending`, so nothing waits for them.
 */
export class MeasureKnotsSource {
  readonly #fetch: (manifest: string) => Promise<readonly MeasureKnots[] | "unsupported">;
  readonly #changed: () => void;
  readonly #known = new WeakMap<Manifest, readonly MeasureKnots[] | KnotsAbsence>();

  constructor(
    fetch: (manifest: string) => Promise<readonly MeasureKnots[] | "unsupported">,
    changed: () => void,
  ) {
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
