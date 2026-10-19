/**
 * The lock a timeline's place in its manifest decides. A segment (a child of
 * a segment line that is no segment line itself) is never locked: its
 * segment line's lock governs it. A segment line that is a child, a segment
 * or a group member is locked, and lifting that lock is not supported yet.
 * Every other timeline keeps its own `locked`.
 */

import type { Lossless, Timeline } from "@timetoalign/timeskeleton";
import type { CommandError } from "../errors.ts";
import { ErrorCode, problem } from "../errors.ts";
import type { PathSegment } from "../json.ts";
import type { TimelineManifest } from "./types.ts";

/**
 * The lock the place of `timeline` decides: `false` for a segment of
 * `parent`, `true` for a segment line that is a child (of `parent`) or a
 * group member, `undefined` where the timeline's own value stands.
 */
function placeLock(
  timeline: Pick<Timeline, "id" | "is_segment_line">,
  parent: Pick<Timeline, "id" | "is_segment_line"> | undefined,
  member: boolean,
): boolean | undefined {
  const line = timeline.is_segment_line === true;
  if (parent?.is_segment_line === true && !line) return false;
  if (line && (parent !== undefined || member)) return true;
  return undefined;
}

/**
 * Why `locked` cannot be set on `timeline` in its place (`placeLock`), if it
 * cannot. `current` is the timeline's own `locked`, absent for a value given
 * to `add`: the value a timeline already has is never refused here. A `set`
 * that changes nothing else is refused as every `set` that changes nothing
 * is; beside a value that changes something, it is accepted.
 */
export function lockProblem(
  locked: boolean,
  current: boolean | undefined,
  timeline: Pick<Timeline, "id" | "is_segment_line">,
  parent: Pick<Timeline, "id" | "is_segment_line"> | undefined,
  member: boolean,
  path: readonly PathSegment[],
): CommandError | undefined {
  if (locked === current) return undefined;
  const decided = placeLock(timeline, parent, member);
  if (decided === undefined || decided === locked) return undefined;
  return decided
    ? problem(
        ErrorCode.unlockingNotSupported,
        "Unlocking a segment line that is a child, a segment or a group member is not supported yet.",
        path,
      )
    : problem(
        ErrorCode.segmentNeverLocked,
        `A segment is never locked: lock its segment line '${parent?.id ?? ""}' instead.`,
        path,
      );
}

/**
 * The first `locked` that `value`, a timeline given to `add` under `parent`
 * and already accepted by the schema as a fragment, or a timeline of its
 * subtree states against its place (`lockProblem`), refused at `path`. A
 * timeline stating no `locked` takes its place's.
 */
export function statedLockProblem(
  value: Lossless<Timeline>,
  parent: Pick<Timeline, "id" | "is_segment_line">,
  path: readonly PathSegment[],
): CommandError | undefined {
  if (value.locked !== undefined) {
    const refused = lockProblem(value.locked, undefined, value, parent, false, path);
    if (refused !== undefined) return refused;
  }
  for (const child of value.children ?? []) {
    const refused = statedLockProblem(child, value, path);
    if (refused !== undefined) return refused;
  }
  return undefined;
}

/**
 * `timeline` under `parent` and its subtree, each with the lock its place
 * decides (`placeLock`; `member` tells a group member by id); with
 * `unlockOnly`, only the segments' locks, as reading a manifest does,
 * keeping a lock a file states elsewhere. A timeline left as it was is the
 * same object, and every other member is kept whole.
 */
export function withPlaceLocks<T extends TimelineManifest>(
  timeline: T,
  parent: TimelineManifest | undefined,
  member: (id: string) => boolean,
  unlockOnly = false,
): T {
  const decided = placeLock(timeline, parent, member(timeline.id));
  const locked = decided === undefined || (unlockOnly && decided) ? timeline.locked : decided;
  const { children } = timeline;
  const placed = children.map((child) => withPlaceLocks(child, timeline, member, unlockOnly));
  const same =
    locked === timeline.locked && placed.every((child, index) => child === children[index]);
  return same ? timeline : { ...timeline, locked, children: placed };
}

/** A timeline's subtree with every segment unlocked, as reading a manifest does. */
export function withSegmentsUnlocked<T extends TimelineManifest>(timeline: T): T {
  return withPlaceLocks(timeline, undefined, () => false, true);
}
