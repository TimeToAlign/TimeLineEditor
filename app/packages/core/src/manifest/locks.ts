/**
 * The lock a timeline's place in its manifest decides. A segment (a child of
 * a segment line that is no segment line itself) is never locked: its
 * segment line's lock governs it. A segment line that is a child, a segment
 * or a group member is locked, and lifting that lock is not supported yet.
 * Every other timeline keeps its own `locked`.
 */

import type { CommandError } from "../errors.ts";
import { ErrorCode, problem } from "../errors.ts";
import type { PathSegment } from "../json.ts";
import { isJsonObject } from "../json.ts";
import type { Manifest, TimelineManifest } from "./types.ts";

/** What of a timeline its place reads; a value given to `add` may be malformed. */
type Placed = { readonly id?: unknown; readonly is_segment_line?: unknown };

/**
 * The lock the place of `timeline` decides: `false` for a segment of
 * `parent`, `true` for a segment line that is a child (of `parent`) or a
 * group member, `undefined` where the timeline's own value stands.
 */
export function placeLock(
  timeline: Placed,
  parent: Placed | undefined,
  member: boolean,
): boolean | undefined {
  const line = timeline.is_segment_line === true;
  if (parent?.is_segment_line === true && !line) return false;
  if (line && (parent !== undefined || member)) return true;
  return undefined;
}

/** The ids of every group member of a manifest. */
export function memberIds(manifest: Manifest): ReadonlySet<string> {
  return new Set(manifest.groups.flatMap((group) => group.members));
}

/**
 * Why `locked` cannot be set on `timeline` in its place (`placeLock`), if it
 * cannot. `current` is the timeline's own `locked`, absent for a value given
 * to `add`: setting the value a timeline already has changes nothing and is
 * never refused.
 */
export function lockProblem(
  locked: boolean,
  current: boolean | undefined,
  timeline: Placed,
  parent: Placed | undefined,
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
        `A segment is never locked: lock its segment line '${String(parent?.id)}' instead.`,
        path,
      );
}

/**
 * The first `locked` that `value`, a timeline given to `add` under `parent`,
 * or a timeline of its subtree states against its place (`lockProblem`),
 * refused at `path`. A timeline stating no `locked` takes its place's.
 */
export function statedLockProblem(
  value: unknown,
  parent: Placed,
  path: readonly PathSegment[],
): CommandError | undefined {
  if (!isJsonObject(value)) return undefined;
  if (typeof value.locked === "boolean") {
    const refused = lockProblem(value.locked, undefined, value, parent, false, path);
    if (refused !== undefined) return refused;
  }
  if (!Array.isArray(value.children)) return undefined;
  for (const child of value.children) {
    const refused = statedLockProblem(child, value, path);
    if (refused !== undefined) return refused;
  }
  return undefined;
}

/**
 * `timeline` under `parent` and its subtree, each with the lock its place
 * decides (`placeLock`); with `unlockOnly`, only the segments' locks, as
 * reading a manifest does, keeping a lock a file states elsewhere. A
 * timeline left as it was is the same object, and every other member is
 * kept whole.
 */
export function withPlaceLocks(
  timeline: TimelineManifest,
  parent: TimelineManifest | undefined,
  members: ReadonlySet<string>,
  unlockOnly = false,
): TimelineManifest {
  // A malformed value is left for the schema to refuse.
  if (!isJsonObject(timeline as unknown)) return timeline;
  const decided = placeLock(timeline, parent, members.has(timeline.id));
  const locked = decided === undefined || (unlockOnly && decided) ? timeline.locked : decided;
  const { children } = timeline;
  const placed = Array.isArray(children)
    ? children.map((child) => withPlaceLocks(child, timeline, members, unlockOnly))
    : children;
  const same =
    locked === timeline.locked &&
    (placed === children || placed.every((child, index) => child === children[index]));
  return same ? timeline : { ...timeline, locked, children: placed };
}

/** `manifest` with every segment unlocked, as it is read; every other lock as its file states. */
export function withSegmentsUnlocked(manifest: Manifest): Manifest {
  const timelines = manifest.timelines.map((root) =>
    withPlaceLocks(root, undefined, new Set(), true),
  );
  return timelines.every((root, index) => root === manifest.timelines[index])
    ? manifest
    : { ...manifest, timelines };
}
