/**
 * The arithmetic of closing the gap a removed segment leaves in its segment
 * line. Deleting a segment is not offered by the editor yet; these functions
 * hold the arithmetic of the four ways to close its gap, which the editor
 * will offer later: a neighbour grows by the segment's length (`extend`), or
 * the segments on one side move by it (`shift`). When the editor offers it,
 * shifting left on a root, which has no offset to move, shortens the line by
 * the deleted length instead of being refused.
 */

import { canonicalOrder } from "@timetoalign/timetoshare";
import { canonicalText } from "../json.ts";
import type { Coordinate } from "../number/coordinate.ts";
import { axisCoordinate, toAxisValue } from "../number/coordinate.ts";
import { Rational } from "../number/rational.ts";
import { exactCoordinate, fromFloat, realOf } from "../number/real.ts";
import { orderedChildren } from "./elements.ts";
import { checkOrdered } from "./invariants.ts";
import { schemaProblems } from "./io.ts";
import { withoutElements } from "./remove.ts";
import { isSegment } from "./tree.ts";
import type { AxisValue, ChildTimeline, Manifest, TimelineManifest } from "./types.ts";

/** The side whose neighbour closes the gap, and how: by growing or by moving. */
export type GapSide = "left" | "right";
export type GapVerb = "extend" | "shift";

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
  readonly segments: readonly ChildTimeline[];
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
  const replace = <T extends TimelineManifest>(here: T): T =>
    here.id === timeline.id
      ? { ...here, ...timeline }
      : { ...here, children: here.children.map(replace) };
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
  const segment = segments[index] as ChildTimeline;
  const before = segments[index - 1];
  const after = segments[index + 1];
  const start = exactOn(segment.offset, line);
  const end =
    segment.length !== null
      ? start.add(exactOn(segment.length, segment))
      : after !== undefined
        ? exactOn(after.offset, line)
        : line.length !== null
          ? exactOn(line.length, line)
          : null;
  const length = end === null ? null : end.subtract(start);
  const exactly = (timeline: TimelineManifest, what: string) =>
    `the ${what} of ${timeline.id} would not be exact as ${timeline.number_type}`;
  const changed = new Map<string, ChildTimeline>();
  let changedLine: TimelineManifest = line;

  if (gap.verb === "extend") {
    const neighbour = gap.side === "left" ? before : after;
    if (neighbour === undefined) {
      return gap.side === "left" ? "no segment precedes it" : "no segment follows it";
    }
    // A segment that is no segment line itself is never locked (reading a
    // manifest unlocks it), so this refuses only a neighbour that is itself
    // a segment line, which is locked. A plain segment is never locked, so
    // its neighbours may always extend; a segment that is itself a segment
    // line is locked, so a line of such segments extends only into a
    // neighbour of unknown length.
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
    // "Left shifts" names the neighbour that moves: the line's offset in its
    // parent moves by the deleted length, which a root does not have.
    if (gap.side === "left" && parent === undefined) {
      return `its segment line ${line.id} is a root and has no offset to move`;
    }
    if (length !== null) {
      for (const later of segments.slice(index + 1)) {
        const offset = placedOn(exactOn(later.offset, line).subtract(length), line);
        if (offset === undefined) return exactly(line, "offsets");
        changed.set(later.id, { ...later, offset });
      }
      if (line.length !== null) {
        // The shortened line is drawn at its full graphical length, so its
        // remaining segments widen and fill the gap from both sides.
        const shortened = placedOn(exactOn(line.length, line).subtract(length), line);
        if (shortened === undefined) return exactly(line, "length");
        changedLine = { ...changedLine, length: shortened };
      }
    }
    if (gap.side === "left") {
      if (length === null) return "its length is not known";
      if (parent === undefined || line.offset === undefined) {
        return `its segment line ${line.id} is a root and has no offset to move`;
      }
      const offset = placedOn(exactOn(line.offset, parent).add(length), parent);
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
 * length; a segment that is no segment line itself is never locked);
 * shifting needs the segment line not locked, and shifting left needs it to
 * be a child. A way whose result the manifest's rules refuse (a segment
 * line that is itself a segment changing its length, a child leaving its
 * parent) is refused with that rule's message. A way is named by the
 * neighbour that moves: "left shifts" moves the line's offset in its parent.
 */
export function segmentGaps(manifest: Manifest, id: string): readonly GapOption[] | undefined {
  if (!isSegment(manifest, id)) return undefined;
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
        visit(child, start.add(exactOn(child.offset, timeline)));
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
