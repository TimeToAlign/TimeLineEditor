/**
 * Removing elements from a manifest. Removing a timeline, root or child,
 * removes its subtree, its id from every group and from every display order,
 * the conversion maps naming a removed timeline as `source_id` or
 * `target_id`, every `ids` entry of a `graphical` statement addressing a
 * removed element (a statement left with no `ids` goes), and every statement
 * whose `within` names a removed timeline. Removing a group removes the group
 * only: its members stay where they are. A group left without members stays.
 *
 * Removing a segment leaves a gap in its segment line, which a neighbour
 * closes (`withoutSegment`).
 */

import { canonicalOrder } from "@timetoalign/timeskeleton";
import { canonicalText } from "../json.ts";
import type { Coordinate } from "../number/coordinate.ts";
import { axisCoordinate, toAxisValue } from "../number/coordinate.ts";
import { Rational } from "../number/rational.ts";
import { exactCoordinate, fromFloat, realOf } from "../number/real.ts";
import { orderedChildren } from "./elements.ts";
import { elementAddress, elementOfIn } from "./files.ts";
import { checkOrdered } from "./invariants.ts";
import { schemaProblems } from "./io.ts";
import type {
  AxisValue,
  ConversionMap,
  Manifest,
  ManifestGraphical,
  TimelineManifest,
} from "./types.ts";

const LISTS = ["conversion_maps", "regions"] as const;
const FLOW_LISTS = ["breaks", "jumps", "markers"] as const;

/** The element addresses of every map, region, break, jump and marker of one timeline. */
function entryAddresses(timeline: TimelineManifest, root: string): string[] {
  const { flow_control: flow } = timeline;
  return [
    ...LISTS.flatMap((list) => timeline[list].map((item) => elementAddress(root, item.id))),
    ...FLOW_LISTS.flatMap((list) => flow[list].map((item) => elementAddress(root, item.id))),
  ];
}

/**
 * The element addresses that removing `elements` (element addresses: a
 * timeline's or a group's id, `<root>/<id>` for any other element) removes:
 * the elements themselves, every timeline below a removed one and every map,
 * region, break, jump and marker those timelines hold, and every conversion
 * map naming a removed timeline. An address naming nothing removes nothing.
 */
export function removedBy(manifest: Manifest, elements: Iterable<string>): Set<string> {
  const asked = new Set(elements);
  const removed = new Set<string>();
  const timelines = new Set<string>();
  const visit = (timeline: TimelineManifest, root: string, inRemoved: boolean): void => {
    const gone = inRemoved || asked.has(timeline.id);
    if (gone) {
      timelines.add(timeline.id);
      removed.add(timeline.id);
    }
    for (const address of entryAddresses(timeline, root)) {
      if (gone || asked.has(address)) removed.add(address);
    }
    for (const child of timeline.children) visit(child, root, gone);
  };
  for (const root of manifest.timelines) visit(root, root.id, false);
  for (const group of manifest.groups) if (asked.has(group.id)) removed.add(group.id);
  const named = (map: ConversionMap): boolean =>
    (map.source_id !== undefined && timelines.has(map.source_id)) ||
    (map.target_id !== undefined && timelines.has(map.target_id));
  const maps = (timeline: TimelineManifest, root: string): void => {
    for (const map of timeline.conversion_maps) {
      if (named(map)) removed.add(elementAddress(root, map.id));
    }
    for (const child of timeline.children) maps(child, root);
  };
  for (const root of manifest.timelines) maps(root, root.id);
  return removed;
}

/** `manifest` with `elements` removed, and everything `removedBy` names with them. */
export function withoutElements(manifest: Manifest, elements: Iterable<string>): Manifest {
  const removed = removedBy(manifest, elements);
  if (removed.size === 0) return manifest;
  const kept = (root: string) => (item: { readonly id: string }) =>
    !removed.has(elementAddress(root, item.id));
  const prune = (timeline: TimelineManifest, root: string): TimelineManifest => ({
    ...timeline,
    children: timeline.children
      .filter((child) => !removed.has(child.id))
      .map((child) => prune(child, root)),
    conversion_maps: timeline.conversion_maps.filter(kept(root)),
    regions: timeline.regions.filter(kept(root)),
    flow_control: {
      ...timeline.flow_control,
      breaks: timeline.flow_control.breaks.filter(kept(root)),
      jumps: timeline.flow_control.jumps.filter(kept(root)),
      markers: timeline.flow_control.markers.filter(kept(root)),
    },
  });
  const element = elementOfIn(manifest);
  const result: Manifest = {
    ...manifest,
    timelines: manifest.timelines
      .filter((root) => !removed.has(root.id))
      .map((root) => prune(root, root.id)),
    groups: manifest.groups
      .filter((group) => !removed.has(group.id))
      .map((group) => ({ ...group, members: group.members.filter((id) => !removed.has(id)) })),
  };
  const { graphical } = manifest;
  if (graphical === undefined) return result;
  const changed: { -readonly [key in keyof ManifestGraphical]: ManifestGraphical[key] } = {
    ...graphical,
  };
  if (graphical.order !== undefined) {
    changed.order = Object.fromEntries(
      Object.entries(graphical.order)
        .filter(([group]) => !removed.has(group))
        .map(([group, members]) => [group, members.filter((id) => !removed.has(id))]),
    );
  }
  if (graphical.statements !== undefined) {
    changed.statements = graphical.statements.flatMap((statement) => {
      const { ids, within } = statement.select;
      if (within !== undefined && removed.has(within)) return [];
      if (ids === undefined) return [statement];
      const left = ids.filter((address) => !removed.has(element(address)));
      if (left.length === 0) return [];
      if (left.length === ids.length) return [statement];
      return [
        { ...statement, select: { ...statement.select, ids: left as [string, ...string[]] } },
      ];
    });
  }
  return { ...result, graphical: changed as ManifestGraphical };
}

// ---------------------------------------------------------------- segments

/** The side whose neighbour closes the gap, and how: by growing or by moving. */
export type GapSide = "left" | "right";
export type GapVerb = "extend" | "shift";
export const GAP_SIDES: readonly GapSide[] = ["left", "right"];
export const GAP_VERBS: readonly GapVerb[] = ["extend", "shift"];

/**
 * How the gap a removed segment leaves is closed. `left` `extend`: the
 * segment before it grows by its length. `right` `extend`: the segment after
 * it starts where it started and grows by its length. `right` `shift`: every
 * later segment moves back by its length and the segment line shortens by
 * it. `left` `shift`: every earlier segment moves on by its length, which
 * the segment line's offset in its parent grows by while the line shortens
 * by it, so the later segments keep their place in the parent.
 */
export interface Gap {
  readonly side: GapSide;
  readonly verb: GapVerb;
}

/** The four ways of closing a gap, in the order they are preferred. */
export const GAPS: readonly Gap[] = [
  { side: "left", verb: "extend" },
  { side: "right", verb: "extend" },
  { side: "left", verb: "shift" },
  { side: "right", verb: "shift" },
];

/** One way of closing a gap, and why it is refused, or `null` when it is permitted. */
export interface GapOption {
  readonly gap: Gap;
  readonly refused: string | null;
}

/** A segment in its segment line: the line's segments in offset order, and the line's parent. */
interface SegmentAt {
  readonly line: TimelineManifest;
  readonly parent: TimelineManifest | undefined;
  readonly segments: readonly TimelineManifest[];
  readonly index: number;
}

function segmentAt(manifest: Manifest, id: string): SegmentAt | undefined {
  const visit = (
    timeline: TimelineManifest,
    parent: TimelineManifest | undefined,
  ): SegmentAt | undefined => {
    if (timeline.is_segment_line) {
      const segments = orderedChildren(timeline);
      const index = segments.findIndex((segment) => segment.id === id);
      if (index >= 0) return { line: timeline, parent, segments, index };
    }
    for (const child of timeline.children) {
      const found = visit(child, timeline);
      if (found !== undefined) return found;
    }
    return undefined;
  };
  for (const root of manifest.timelines) {
    const found = visit(root, undefined);
    if (found !== undefined) return found;
  }
  return undefined;
}

/** Whether timeline `id` is a segment: a child of a segment line. */
export function isSegment(manifest: Manifest, id: string): boolean {
  return segmentAt(manifest, id) !== undefined;
}

/** A bare value on an axis as an exact value. */
function exactOn(value: AxisValue, axis: TimelineManifest): Rational {
  const real = realOf(axisCoordinate(value, axis));
  return real instanceof Rational ? real : fromFloat(real);
}

/** An exact value as a bare value on an axis, when the axis's number type holds it exactly. */
function placedOn(value: Rational, axis: TimelineManifest): AxisValue | undefined {
  const coordinate: Coordinate | undefined = exactCoordinate(value, axis.unit, axis.number_type);
  return coordinate === undefined ? undefined : toAxisValue(coordinate);
}

/** `manifest` with the timeline carrying `timeline.id` replaced by `timeline`. */
function withTimeline(manifest: Manifest, timeline: TimelineManifest): Manifest {
  const replace = (here: TimelineManifest): TimelineManifest =>
    here.id === timeline.id ? timeline : { ...here, children: here.children.map(replace) };
  return { ...manifest, timelines: manifest.timelines.map(replace) };
}

/**
 * The segment line after closing the gap of its segment `at`, or why that
 * way is not permitted. A segment of unknown length ends where its
 * successor starts, or the last one where its line ends; a length that is
 * not known stays unknown, and a neighbour of known length growing by an
 * unknown length becomes of unknown length.
 */
function closedLine(at: SegmentAt, gap: Gap): TimelineManifest | string {
  const { line, parent, segments, index } = at;
  const segment = segments[index] as TimelineManifest;
  const before = segments[index - 1];
  const after = segments[index + 1];
  const start = exactOn(segment.offset as AxisValue, line);
  const end =
    segment.length !== null
      ? start.add(exactOn(segment.length, segment))
      : after !== undefined
        ? exactOn(after.offset as AxisValue, line)
        : line.length !== null
          ? exactOn(line.length, line)
          : null;
  const length = end === null ? null : end.subtract(start);
  const exactly = (timeline: TimelineManifest, what: string) =>
    `the ${what} of ${timeline.id} would not be exact as ${timeline.number_type}`;
  const changed = new Map<string, TimelineManifest>();
  let changedLine: TimelineManifest = line;

  if (gap.verb === "extend") {
    const neighbour = gap.side === "left" ? before : after;
    if (neighbour === undefined) {
      return gap.side === "left" ? "no segment precedes it" : "no segment follows it";
    }
    if (neighbour.locked && neighbour.length !== null) {
      return `the ${gap.side === "left" ? "preceding" : "following"} segment ${neighbour.id} is locked`;
    }
    let grown: AxisValue | null = null;
    if (neighbour.length !== null && length !== null) {
      const value = placedOn(exactOn(neighbour.length, neighbour).add(length), neighbour);
      if (value === undefined) return exactly(neighbour, "length");
      grown = value;
    }
    changed.set(neighbour.id, {
      ...neighbour,
      length: grown,
      ...(gap.side === "right" ? { offset: segment.offset } : {}),
    });
  } else {
    if (line.locked) return `its segment line ${line.id} is locked`;
    if (gap.side === "left" && parent === undefined) {
      return `its segment line ${line.id} is a root and has no offset to move`;
    }
    if (length !== null) {
      for (const later of segments.slice(index + 1)) {
        const offset = placedOn(exactOn(later.offset as AxisValue, line).subtract(length), line);
        if (offset === undefined) return exactly(line, "offsets");
        changed.set(later.id, { ...later, offset });
      }
      if (line.length !== null) {
        const shortened = placedOn(exactOn(line.length, line).subtract(length), line);
        if (shortened === undefined) return exactly(line, "length");
        changedLine = { ...changedLine, length: shortened };
      }
    }
    if (gap.side === "left") {
      if (length === null) return "its length is not known";
      const holder = parent as TimelineManifest;
      const offset = placedOn(exactOn(line.offset as AxisValue, holder).add(length), holder);
      if (offset === undefined) return exactly(line, "offset");
      changedLine = { ...changedLine, offset };
    }
  }
  return {
    ...changedLine,
    children: line.children.map((child) => changed.get(child.id) ?? child),
  };
}

/**
 * `manifest` without segment `id` (and everything `removedBy` names with
 * it), its gap closed as `gap` says; or why that way is not permitted. The
 * result has not been checked; `segmentGaps` checks it.
 */
export function withoutSegment(manifest: Manifest, id: string, gap: Gap): Manifest | string {
  const at = segmentAt(manifest, id);
  if (at === undefined) return `${id} is not a segment`;
  const line = closedLine(at, gap);
  if (typeof line === "string") return line;
  return withoutElements(withTimeline(manifest, line), [id]);
}

/** The first problem of a manifest that the schema or the invariants find. */
function firstProblem(manifest: Manifest): string | undefined {
  const [refused] = schemaProblems(manifest);
  if (refused !== undefined) return refused.message;
  return checkOrdered(canonicalOrder(manifest))[0]?.message;
}

/**
 * The four ways of closing the gap removing segment `id` leaves, in the
 * order of `GAPS`, each with why it is refused or `null` when it is
 * permitted; `undefined` when `id` is no segment. Extending needs a neighbour
 * on that side whose length may change (one not locked, or of unknown
 * length); shifting needs the segment line not locked, and shifting left
 * needs it to be a child. A way whose result the manifest's rules refuse
 * (a segment line that is itself a segment changing its length, a child
 * leaving its parent) is refused with that rule's message.
 */
export function segmentGaps(manifest: Manifest, id: string): readonly GapOption[] | undefined {
  if (segmentAt(manifest, id) === undefined) return undefined;
  return GAPS.map((gap) => {
    const result = withoutSegment(manifest, id, gap);
    return { gap, refused: typeof result === "string" ? result : (firstProblem(result) ?? null) };
  });
}

/**
 * The timelines that closing the gap of segment `id` as `gap` moves or
 * resizes: those whose start on their root's axis or whose length changes
 * (a timeline below a moved one moves with it); none when that way is not
 * permitted.
 */
export function movedBy(manifest: Manifest, id: string, gap: Gap): ReadonlySet<string> {
  const result = withoutSegment(manifest, id, gap);
  const moved = new Set<string>();
  if (typeof result === "string") return moved;
  /** Every timeline's start on its root's axis and its length as written. */
  const places = (of: Manifest) => {
    const found = new Map<string, readonly [Rational, string]>();
    const visit = (timeline: TimelineManifest, start: Rational) => {
      found.set(timeline.id, [start, canonicalText(timeline.length)]);
      for (const child of timeline.children) {
        visit(child, start.add(exactOn(child.offset as AxisValue, timeline)));
      }
    };
    for (const root of of.timelines) visit(root, Rational.of(0n));
    return found;
  };
  const before = places(manifest);
  for (const [timeline, [start, length]] of places(result)) {
    const prior = before.get(timeline);
    if (prior !== undefined && (!prior[0].equals(start) || prior[1] !== length)) {
      moved.add(timeline);
    }
  }
  return moved;
}
