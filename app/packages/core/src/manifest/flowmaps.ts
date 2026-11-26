/**
 * FlowMaps resolved, as timetoalign resolves them (`FlowMap.resolve`,
 * `ResolvedFlowMap.unfold` and `fold`), without a server; the virtual
 * timelines they give are resolved in `virtual.ts`.
 *
 * A FlowMap names one root timeline and its chunks in the order played:
 * each the ID of a Region of the root or of a descendant, of a child
 * timeline at any depth, of the root itself, or of a virtual timeline of
 * the root's tree, or a gap `{gap: length}`. Resolved, every chunk is a
 * stretch of the root's axis, carried there by exact parent–child offset
 * arithmetic in the root's number type, and the stretches are laid end to
 * end on the **virtual axis**, which starts at 0 and has the root's unit and
 * number type. A virtual timeline chunk plays the stretches of the FlowMap
 * it applies, in their order. Every stretch is half-open, its end excluded:
 * a written position is played wherever a stretch covers it (`unfold`), a
 * played position is the written one there or none inside a gap (`fold`),
 * and the virtual axis itself runs from 0 to its length, excluded.
 *
 * Every refusal is a `FlowMapError`, `{code, message, path}`, its path a
 * location in the manifest.
 */

import type { NumberType, TimeUnit } from "@timetoalign/timetoshare";
import type { PathSegment } from "../json.ts";
import { showJson } from "../json.ts";
import { readValue } from "../maps/compile.ts";
import { expressAs } from "../maps/express.ts";
import type { MapValue } from "../maps/values.ts";
import type { Coordinate, CoordinateValue } from "../number/coordinate.ts";
import {
  addCoordinates,
  axisCoordinate,
  compareCoordinates,
  coordinatesEqual,
  subtractCoordinates,
} from "../number/coordinate.ts";
import { toRational } from "../number/real.ts";
import { locateTimeline } from "./tree.ts";
import type { Manifest, TimelineManifest } from "./types.ts";

/** Why a FlowMap or a virtual timeline cannot be resolved, or a position not converted. */
export type FlowMapErrorCode =
  /** No FlowMap of the manifest has the ID asked for. */
  | "unknown_flow_map"
  /** No virtual timeline of the manifest has the ID asked for. */
  | "unknown_virtual_timeline"
  /** A FlowMap's `timeline` names no root timeline. */
  | "flow_map_timeline"
  /** A chunk names nothing giving an interval in the root's tree. */
  | "flow_map_chunk"
  /** A gap's length is no value of the root's number type. */
  | "gap_number_type"
  /** A chunk is a child timeline, or the root, of unknown length. */
  | "unknown_length"
  /** FlowMaps name one another as chunks in a circle, through the virtual timelines they apply. */
  | "flow_map_cycle"
  /** A virtual timeline cannot be read: it applies no FlowMap of the root to the root. */
  | "virtual_unresolved"
  /** A conversion map that core cannot evaluate into the virtual timeline's axis. */
  | "map_not_evaluated"
  /** A position, a virtual chunk or a virtual timeline in another unit than the axis it meets. */
  | "unit_mismatch"
  /** A played position outside the virtual axis, `[0, length)`. */
  | "outside_virtual_axis";

/** A FlowMap or a virtual timeline that cannot be resolved, or a position that cannot be converted. */
export class FlowMapError extends Error {
  readonly code: FlowMapErrorCode;
  readonly path: readonly PathSegment[];

  constructor(code: FlowMapErrorCode, message: string, path: readonly PathSegment[]) {
    super(message);
    this.name = "FlowMapError";
    this.code = code;
    this.path = path;
  }
}

/** A half-open stretch of one axis, `[start, end)`, both ends on that axis. */
export interface Stretch {
  readonly start: Coordinate;
  readonly end: Coordinate;
}

/** What a chunk names: a Region, a timeline (a child or the root), a virtual timeline, or a gap. */
export type FlowChunkKind = "region" | "timeline" | "virtual" | "gap";

/** One entry of a FlowMap's `chunks`, resolved. */
export interface FlowChunk {
  readonly kind: FlowChunkKind;
  /** Its index in the FlowMap's `chunks`. */
  readonly index: number;
  /** The ID it names; null for a gap. */
  readonly source: string | null;
  /**
   * What it plays: a Region's or a timeline's stretch on the root's axis; a
   * virtual timeline's whole axis, from 0 to its length; null for a gap.
   */
  readonly written: Stretch | null;
  /** Where it lies on the virtual axis. */
  readonly played: Stretch;
}

/**
 * One stretch of the virtual axis: the root's stretch played there (null
 * for a gap) and the chunk it belongs to; a virtual timeline chunk gives one
 * per stretch of the FlowMap it applies.
 */
export interface PlayedStretch {
  readonly written: Stretch | null;
  readonly played: Stretch;
  /** The index of its chunk in `chunks`. */
  readonly chunk: number;
}

/** A run of `count` consecutive equal chunks (the same ID, or gaps of one length), named by its first. */
export interface FlowRun {
  readonly chunk: FlowChunk;
  readonly count: number;
}

/** A FlowMap read against its root: its chunks laid end to end on the virtual axis. */
export interface ResolvedFlowMap {
  /** The FlowMap's ID. */
  readonly flowMap: string;
  /** The root timeline's ID. */
  readonly timeline: string;
  /** The unit of both axes, the root's. */
  readonly unit: TimeUnit;
  /** The number type of both axes, the root's. */
  readonly numberType: NumberType;
  readonly chunks: readonly FlowChunk[];
  /** The stretches in the order played, each placed where the one before it ends. */
  readonly stretches: readonly PlayedStretch[];
  /** The runs of equal chunks, in order: every chunk lies in exactly one. */
  readonly runs: readonly FlowRun[];
  /** The length of the virtual axis: the chunks and gaps together. */
  readonly length: Coordinate;
}

/** One played position of a written position: occurrence `occurrence` of `of`, in the order played. */
export interface Occurrence {
  readonly played: Coordinate;
  readonly occurrence: number;
  readonly of: number;
  /** The index of the chunk it lies in; null through a conversion map. */
  readonly chunk: number | null;
}

/** An axis: a unit and a number type. */
export interface Axis {
  readonly unit: TimeUnit;
  readonly numberType: NumberType;
}

/** A value on an axis, written in its number type. */
export function onAxis(axis: Axis, value: MapValue): Coordinate {
  const expressed = expressAs(value, axis.numberType);
  if (expressed === undefined) throw new RangeError(`${String(value)} lies on no axis`);
  return { unit: axis.unit, numberType: axis.numberType, value: expressed };
}

/** Zero, written in any number type through `onAxis`. */
export const ZERO: MapValue = 0n;

/** A position of `axis`, given on its unit, read in its number type. */
export function positionOn(axis: Axis, position: Coordinate, what: string): Coordinate {
  if (position.unit !== axis.unit) {
    throw new FlowMapError(
      "unit_mismatch",
      `the position is in ${position.unit}; the ${what} is in ${axis.unit}`,
      [],
    );
  }
  return onAxis(axis, position.value);
}

/** An ID as a message quotes it. */
export const quoted = (id: string) => `'${id}'`;

/**
 * The FlowMap `flowMapId` of `manifest` resolved against its root: its
 * chunks as stretches of the root's axis, laid end to end from 0.
 *
 * @throws {FlowMapError} when it cannot be read, with the path of the entry at fault.
 */
export function resolveFlowMap(manifest: Manifest, flowMapId: string): ResolvedFlowMap {
  return resolve(manifest, flowMapId, []);
}

/** The FlowMap `id` and its path, or a refusal at `path`. */
function flowMapOf(manifest: Manifest, id: string, path: readonly PathSegment[]) {
  const flowMaps = manifest.flow_maps ?? [];
  const index = flowMaps.findIndex((flowMap) => flowMap.id === id);
  const flowMap = flowMaps[index];
  if (flowMap === undefined) {
    throw new FlowMapError("unknown_flow_map", `${quoted(id)} names no FlowMap`, path);
  }
  return { flowMap, at: ["flow_maps", index] as const };
}

function resolve(manifest: Manifest, id: string, visiting: readonly string[]): ResolvedFlowMap {
  const { flowMap, at } = flowMapOf(manifest, id, ["flow_maps"]);
  const what = `FlowMap ${quoted(id)}`;
  const located = locateTimeline(manifest, flowMap.timeline);
  if (located === undefined || located.parent !== undefined) {
    throw new FlowMapError(
      "flow_map_timeline",
      `${what} names ${quoted(flowMap.timeline)}, which is no root timeline: a FlowMap names a root timeline`,
      [...at, "timeline"],
    );
  }
  if (visiting.includes(id)) {
    throw new FlowMapError(
      "flow_map_cycle",
      `${what} names itself as a chunk, through the virtual timelines its chunks name`,
      [...at, "chunks"],
    );
  }
  const root = located.timeline;
  const axis: Axis = { unit: root.unit, numberType: root.number_type };
  const chunks: FlowChunk[] = [];
  const stretches: PlayedStretch[] = [];
  let position = onAxis(axis, ZERO);
  const play = (written: Stretch | null, length: Coordinate, chunk: number) => {
    const start = position;
    position = addCoordinates(start, length);
    stretches.push({ written, played: { start, end: position }, chunk });
  };
  flowMap.chunks.forEach((chunk, index) => {
    const here = [...at, "chunks", index];
    const start = position;
    const placed = (kind: FlowChunkKind, source: string | null, written: Stretch | null) =>
      chunks.push({ kind, index, source, written, played: { start, end: position } });
    if (typeof chunk !== "string") {
      play(null, gapLength(chunk.gap, axis, what, here), index);
      placed("gap", null, null);
      return;
    }
    const found = stretchInTree(root, chunk, axis, what, here);
    if (found !== null) {
      play(found.stretch, subtractCoordinates(found.stretch.end, found.stretch.start), index);
      placed(found.kind, chunk, found.stretch);
      return;
    }
    const inner = virtualChunk(manifest, root, chunk, [...visiting, id], what, here);
    for (const stretch of inner.stretches) {
      play(stretch.written, subtractCoordinates(stretch.played.end, stretch.played.start), index);
    }
    placed("virtual", chunk, { start: onAxis(axis, ZERO), end: inner.length });
  });
  return {
    flowMap: id,
    timeline: root.id,
    unit: axis.unit,
    numberType: axis.numberType,
    chunks,
    stretches,
    runs: runsOf(chunks),
    length: position,
  };
}

/**
 * A gap's length on the root's axis, refused where it is no value of the
 * root's number type (it changes when written in it), as timetoalign
 * refuses it.
 */
function gapLength(
  gap: unknown,
  axis: Axis,
  what: string,
  path: readonly PathSegment[],
): Coordinate {
  const value = readValue(gap);
  const length = onAxis(axis, value);
  if (!toRational(length.value).equals(toRational(value))) {
    throw new FlowMapError(
      "gap_number_type",
      `the gap of ${showJson(gap)} in ${what} is no ${axis.numberType} value, the number type of its timeline`,
      [...path, "gap"],
    );
  }
  return length;
}

/** A value of `timeline`'s own axis, as a manifest writes it there. */
function ownValue(timeline: TimelineManifest, value: unknown): CoordinateValue {
  return axisCoordinate(value, timeline).value;
}

/**
 * The stretch on the root's axis of the Region, child timeline or root
 * named `id` in the tree of `root`, each bound carried up by adding the
 * offsets of the timelines between, in the root's number type; null when
 * the tree holds no such Region or timeline.
 */
function stretchInTree(
  root: TimelineManifest,
  id: string,
  axis: Axis,
  what: string,
  path: readonly PathSegment[],
): { kind: "region" | "timeline"; stretch: Stretch } | null {
  const pending: [TimelineManifest, Coordinate][] = [[root, onAxis(axis, ZERO)]];
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    const [timeline, origin] = next;
    const carried = (bound: CoordinateValue) => addCoordinates(origin, onAxis(axis, bound));
    if (timeline.id === id) {
      if (timeline.length === null) {
        throw new FlowMapError(
          "unknown_length",
          `timeline ${quoted(id)}, a chunk of ${what}, has no known length`,
          path,
        );
      }
      const end = ownValue(timeline, timeline.length);
      return { kind: "timeline", stretch: { start: carried(ZERO), end: carried(end) } };
    }
    const region = timeline.regions.find((item) => item.id === id);
    if (region !== undefined) {
      const start = carried(ownValue(timeline, region.start));
      return { kind: "region", stretch: { start, end: carried(ownValue(timeline, region.end)) } };
    }
    for (const child of timeline.children) {
      pending.push([child, carried(ownValue(timeline, child.offset))]);
    }
  }
  return null;
}

/**
 * The timeline a virtual timeline comes from, virtual timeline by virtual
 * timeline; undefined when the chain runs in a circle.
 */
function comesFrom(manifest: Manifest, id: string): string | undefined {
  const virtual = manifest.virtual_timelines ?? [];
  const passed = new Set<string>();
  let source = id;
  for (;;) {
    const entry = virtual.find((item) => item.id === source);
    if (entry === undefined) return source;
    if (passed.has(source)) return undefined;
    passed.add(source);
    source = entry.timeline;
  }
}

/** The index of the virtual timeline `id`, or a refusal at `path`. */
export function virtualIndex(manifest: Manifest, id: string, path: readonly PathSegment[]): number {
  const index = (manifest.virtual_timelines ?? []).findIndex((item) => item.id === id);
  if (index < 0) {
    throw new FlowMapError(
      "unknown_virtual_timeline",
      `${quoted(id)} names no virtual timeline`,
      path,
    );
  }
  return index;
}

/**
 * A chunk naming a virtual timeline of the root's tree, resolved as the
 * FlowMap it applies; refused where it names nothing in the tree, lies on
 * another unit, or applies no FlowMap of the root to the root.
 */
function virtualChunk(
  manifest: Manifest,
  root: TimelineManifest,
  id: string,
  visiting: readonly string[],
  what: string,
  path: readonly PathSegment[],
): ResolvedFlowMap {
  const source = comesFrom(manifest, id);
  const fromTree = source === undefined ? undefined : locateTimeline(manifest, source);
  let top = fromTree;
  while (top?.parent !== undefined) top = top.parent;
  const virtual = (manifest.virtual_timelines ?? []).find((item) => item.id === id);
  if (virtual === undefined || top?.timeline !== root) {
    throw new FlowMapError(
      "flow_map_chunk",
      `chunk ${quoted(id)} of ${what} names no region, child timeline or virtual timeline in the tree of ${quoted(root.id)}`,
      path,
    );
  }
  if (virtual.unit !== root.unit) {
    throw new FlowMapError(
      "unit_mismatch",
      `chunk ${quoted(id)} of ${what} is a virtual timeline in ${virtual.unit}; the axis of its root ${quoted(root.id)} is in ${root.unit}`,
      path,
    );
  }
  const at = ["virtual_timelines", virtualIndex(manifest, id, path)];
  return appliedFlowMap(manifest, virtual, root.id, visiting, at);
}

/**
 * The FlowMap a virtual timeline applies, resolved: refused where it is no
 * FlowMap of `rootId` applied to `rootId` itself without `through`.
 */
export function appliedFlowMap(
  manifest: Manifest,
  virtual: NonNullable<Manifest["virtual_timelines"]>[number],
  rootId: string,
  visiting: readonly string[],
  at: readonly PathSegment[],
): ResolvedFlowMap {
  const what = `virtual timeline ${quoted(virtual.id)}`;
  const flowMap = (manifest.flow_maps ?? []).find((item) => item.id === virtual.map);
  if (flowMap === undefined || flowMap.timeline !== rootId) {
    throw new FlowMapError(
      "virtual_unresolved",
      `${what} applies ${quoted(virtual.map)}, which is no FlowMap of timeline ${quoted(rootId)}: its positions are not converted`,
      [...at, "map"],
    );
  }
  if (virtual.through !== undefined || virtual.timeline !== flowMap.timeline) {
    const through = virtual.through === undefined ? "" : ` through ${quoted(virtual.through)}`;
    throw new FlowMapError(
      "virtual_unresolved",
      `${what} applies FlowMap ${quoted(flowMap.id)} to ${quoted(virtual.timeline)}${through}, not to the FlowMap's own timeline ${quoted(flowMap.timeline)}`,
      [...at, virtual.through === undefined ? "timeline" : "through"],
    );
  }
  return resolve(manifest, flowMap.id, visiting);
}

/** Whether two chunks are equal as written: the same ID, or gaps of one length. */
function sameChunk(left: FlowChunk, right: FlowChunk): boolean {
  if (left.kind === "gap" || right.kind === "gap") {
    return (
      left.kind === right.kind &&
      coordinatesEqual(
        subtractCoordinates(left.played.end, left.played.start),
        subtractCoordinates(right.played.end, right.played.start),
      )
    );
  }
  return left.source === right.source;
}

function runsOf(chunks: readonly FlowChunk[]): FlowRun[] {
  const runs: FlowRun[] = [];
  for (const chunk of chunks) {
    const last = runs.at(-1);
    if (last !== undefined && sameChunk(last.chunk, chunk)) {
      runs[runs.length - 1] = { chunk: last.chunk, count: last.count + 1 };
    } else runs.push({ chunk, count: 1 });
  }
  return runs;
}

/**
 * Every played position of the written position `written` (on the root's
 * axis), in the order played: one per stretch covering it, the stretch
 * half-open, its end excluded; none where it is never played.
 *
 * @throws {FlowMapError} `unit_mismatch` where `written` is on another unit.
 */
export function unfold(resolved: ResolvedFlowMap, written: Coordinate): Occurrence[] {
  const x = positionOn(resolved, written, `axis of ${quoted(resolved.timeline)}`);
  const covering = resolved.stretches.filter(
    (stretch) =>
      stretch.written !== null &&
      compareCoordinates(stretch.written.start, x) <= 0 &&
      compareCoordinates(x, stretch.written.end) < 0,
  );
  return covering.map((stretch, index) => ({
    played: addCoordinates(
      stretch.played.start,
      subtractCoordinates(x, (stretch.written as Stretch).start),
    ),
    occurrence: index + 1,
    of: covering.length,
    chunk: stretch.chunk,
  }));
}

/**
 * The written position (on the root's axis) played at `played`, a position
 * of the virtual axis; null inside a gap.
 *
 * @throws {FlowMapError} `outside_virtual_axis` where `played` lies outside
 * `[0, length)`, `unit_mismatch` where it is on another unit.
 */
export function fold(resolved: ResolvedFlowMap, played: Coordinate): Coordinate | null {
  const y = positionOn(resolved, played, `virtual axis of ${quoted(resolved.flowMap)}`);
  for (const stretch of resolved.stretches) {
    const { start, end } = stretch.played;
    if (compareCoordinates(start, y) <= 0 && compareCoordinates(y, end) < 0) {
      if (stretch.written === null) return null;
      return addCoordinates(stretch.written.start, subtractCoordinates(y, start));
    }
  }
  throw new FlowMapError(
    "outside_virtual_axis",
    `the position lies outside the virtual axis of ${quoted(resolved.flowMap)}, which runs from 0 to its length, the length excluded`,
    [],
  );
}
