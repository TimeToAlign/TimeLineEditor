/**
 * Where a timeline lies in its manifest: under which parent, at which
 * offset, in which groups. A child is placed by one rule wherever it comes
 * from (`placeChild`): added, given another offset, or moved with its subtree
 * under another parent (`moveTimeline`). A timeline joins and leaves groups
 * by `setGroups`. IDs never change, and so no address does.
 */

import type { CommandError } from "../errors.ts";
import { ErrorCode, isCommandError, problem } from "../errors.ts";
import type { PathSegment } from "../json.ts";
import { orderedChildren } from "../manifest/elements.ts";
import { childEnd, childReach, lengthOf, readOnAxis } from "../manifest/invariants.ts";
import { withPlaceLocks } from "../manifest/locks.ts";
import { bandOrderOf } from "../manifest/order.ts";
import type { Located } from "../manifest/tree.ts";
import { isSegmentAt, locateTimeline } from "../manifest/tree.ts";
import type { ChildTimeline, Group, Manifest, TimelineManifest } from "../manifest/types.ts";
import type { Coordinate } from "../number/coordinate.ts";
import { axisCoordinate, toAxisValue } from "../number/coordinate.ts";
import { compareReal, exactCoordinate, realOf } from "../number/real.ts";
import { readObject, unknownMember } from "../values.ts";
import { indexOf } from "../workspace/address.ts";
import type { View } from "../workspace/view.ts";
import type { ChangeSet } from "./mutations.ts";
import { record, replaceTimeline, sameJson, withBlock, withKey } from "./mutations.ts";
import type { TimelineTarget } from "./targets.ts";

/** The refusal of a child reaching past its parent's known length. */
function exceedsParent(
  child: TimelineManifest,
  parent: TimelineManifest,
  path: readonly PathSegment[],
): CommandError {
  return problem(
    ErrorCode.childExceedsParent,
    child.length === null
      ? `child '${child.id}' starts after its parent '${parent.id}' ends`
      : `child '${child.id}' ends after its parent '${parent.id}'`,
    path,
  );
}

/**
 * Why the timeline at `at` cannot take `length`, if it cannot. A length
 * change never pushes a parent: the new end stays within the parent's known
 * length. Segments fix ends, which keeps a segment within its line too: a
 * segment ends where its successor starts, and the last one where its line
 * ends while the line's length is known; a segment line ends where its last
 * segment ends while that segment's length is known. A length of null is
 * always taken: it bounds nothing, and a segment or line of unknown length
 * ends where its neighbours say.
 */
export function lengthProblem(
  at: Located,
  length: Coordinate | null,
  path: readonly PathSegment[],
): CommandError | undefined {
  if (length === null) return undefined;
  const { timeline } = at;
  const parent = at.parent?.timeline;
  if (parent !== undefined) {
    const end = childEnd(axisCoordinate(timeline.offset, parent), length);
    const parentLength = lengthOf(parent);
    if (!parent.is_segment_line) {
      if (parentLength !== null && compareReal(end, realOf(parentLength)) > 0) {
        return exceedsParent({ ...timeline, length: toAxisValue(length) }, parent, path);
      }
    } else {
      const segments = orderedChildren(parent);
      const successor = segments[segments.findIndex((segment) => segment.id === timeline.id) + 1];
      const fixed =
        successor === undefined ? parentLength : axisCoordinate(successor.offset, parent);
      if (fixed !== null && compareReal(end, realOf(fixed)) !== 0) {
        const where =
          successor === undefined
            ? `its segment line '${parent.id}' ends`
            : `segment '${successor.id}' starts`;
        return problem(
          ErrorCode.segmentEndFixed,
          `segment '${timeline.id}' ends where ${where}`,
          path,
        );
      }
    }
  }
  const last = timeline.is_segment_line ? orderedChildren(timeline).at(-1) : undefined;
  const lastLength = last === undefined ? null : lengthOf(last);
  if (last !== undefined && lastLength !== null) {
    const lastEnd = childEnd(axisCoordinate(last.offset, timeline), lastLength);
    if (compareReal(realOf(length), lastEnd) !== 0) {
      return problem(
        ErrorCode.segmentEndFixed,
        `segment line '${timeline.id}' ends where its last segment '${last.id}' ends`,
        path,
      );
    }
  }
  return undefined;
}

/**
 * Put `child` under the timeline at `at` at `offset`, a coordinate on that
 * timeline's axis, stored normalized. A child reaching past that timeline's
 * known end (its end, or its offset when its length is not known) grows the
 * timeline to that point when it is unlocked and its number type holds the
 * point exactly, and is refused otherwise (`child_exceeds_parent` at
 * `path`). Only that timeline grows: its new length must be one it may take
 * (`lengthProblem`). A timeline of unknown length stays unknown.
 */
export function placeChild(
  at: Located,
  child: TimelineManifest,
  offset: Coordinate,
  path: readonly PathSegment[],
): TimelineManifest | CommandError {
  const parent = at.timeline;
  const placedChild: ChildTimeline = { ...child, offset: toAxisValue(offset) };
  const placed = { ...parent, children: [...parent.children, placedChild] };
  const reach = childReach(offset, placedChild);
  const known = lengthOf(parent);
  if (known === null || compareReal(reach, realOf(known)) <= 0) return placed;
  const grown = parent.locked ? undefined : exactCoordinate(reach, parent.unit, parent.number_type);
  if (grown === undefined) return exceedsParent(placedChild, parent, path);
  const refused = lengthProblem({ ...at, timeline: placed }, grown, path);
  return refused ?? { ...placed, length: toAxisValue(grown) };
}

/**
 * The refusal of a timeline of `changed` and another member of `group`
 * where one would hold the other (`nested_member`), by `ancestorsOf` (the
 * ids from a timeline's root down to itself, as the timelines will lie);
 * undefined when none would.
 */
function nestingProblem(
  group: Group,
  changed: readonly string[],
  ancestorsOf: (id: string) => readonly string[],
  path: readonly PathSegment[],
): CommandError | undefined {
  for (const id of changed) {
    const above = ancestorsOf(id);
    const other = group.members.find(
      (member) => member !== id && (above.includes(member) || ancestorsOf(member).includes(id)),
    );
    if (other !== undefined) {
      return problem(
        ErrorCode.nestedMember,
        `'${id}' and '${other}', a member of group '${group.id}', would hold one another`,
        path,
      );
    }
  }
  return undefined;
}

// ---------------------------------------------------------------- parent

/** `manifest` without the timeline `at` locates (with its subtree). */
function withoutTimeline(manifest: Manifest, at: Located): Manifest {
  const index = at.path.at(-1);
  const { parent } = at;
  if (parent === undefined) {
    return { ...manifest, timelines: manifest.timelines.filter((_, item) => item !== index) };
  }
  const children = parent.timeline.children.filter((_, item) => item !== index);
  return replaceTimeline(manifest, parent, { ...parent.timeline, children });
}

/**
 * `manifest` with `id`'s band order written as its own entry when its new
 * place would draw it otherwise: a moved timeline keeps the band order it
 * was drawn with, and its descendants, which follow it, keep theirs.
 */
function withBandOrderKept(manifest: Manifest, id: string, order: readonly string[]): Manifest {
  if (sameJson(bandOrderOf(manifest, id), order)) return manifest;
  const graphical = manifest.graphical ?? {};
  return {
    ...manifest,
    graphical: { ...graphical, order: { ...graphical.order, [id]: [...order] } },
  };
}

/** The new parent a `parent` value names, read: the parent located and the offset on its axis. */
function readParent(
  manifest: Manifest,
  value: unknown,
  path: readonly PathSegment[],
): { readonly at: Located; readonly offset: Coordinate } | CommandError {
  const object = readObject(value, path);
  if (isCommandError(object)) return object;
  const extra = unknownMember(object, ["timeline", "offset"], path, ErrorCode.unknownProperty);
  if (extra !== undefined) return extra;
  for (const member of ["timeline", "offset"]) {
    if (!Object.hasOwn(object, member)) {
      return problem(ErrorCode.invalidValue, `a parent names its ${member}`, [...path, member]);
    }
  }
  const { timeline, offset } = object;
  if (typeof timeline !== "string") {
    return problem(ErrorCode.invalidValue, "a parent's timeline is a timeline id", [
      ...path,
      "timeline",
    ]);
  }
  const at = locateTimeline(manifest, timeline);
  if (at === undefined) {
    return problem(ErrorCode.unknownTarget, `'${timeline}' names no timeline of the manifest`, [
      ...path,
      "timeline",
    ]);
  }
  const read = readOnAxis(offset, at.timeline, [...path, "offset"]);
  return isCommandError(read) ? read : { at, offset: read };
}

/**
 * Set where a timeline lies (`set parent`): `null` makes it a root, `{timeline,
 * offset}` a child of that timeline at that bare offset on its axis, placed
 * by `placeChild`'s rule, its subtree with it. Refused: `unit_mismatch` for a
 * parent of another unit; `segment_structure` when the moved timeline is a
 * segment or a segment line, or the new parent a segment line; `cycle` for
 * the timeline itself or one of its descendants as the parent;
 * `nested_member` when a timeline of the moved subtree and one of its new
 * ancestors are members of one group. A child that
 * becomes a root leaves its offset behind (a root's offset means another
 * thing); the moved timeline keeps its band order and its card's stated size,
 * and `settle` fits the block's places to the new drawing.
 */
export function moveTimeline(
  view: View,
  target: TimelineTarget,
  value: unknown,
  path: readonly PathSegment[],
  changes: ChangeSet,
): View | CommandError {
  const { block, at } = target;
  const { manifest } = block;
  const timeline = at.timeline;
  const parent = value === null ? null : readParent(manifest, value, path);
  if (parent !== null && isCommandError(parent)) return parent;
  if (parent === null && at.parent === undefined) return view;
  if (isSegmentAt(at) || timeline.is_segment_line) {
    const what = isSegmentAt(at) ? "a segment" : "a segment line";
    return problem(
      ErrorCode.segmentStructure,
      `'${timeline.id}' is ${what} and keeps its place`,
      path,
    );
  }
  if (parent !== null) {
    const host = parent.at.timeline;
    const { ancestry } = indexOf(manifest);
    // Whether a timeline lies in the moved subtree: the moved one is among its ancestors.
    const moving = (id: string) => ancestry.get(id)?.includes(timeline.id) ?? false;
    if (moving(host.id)) {
      return problem(ErrorCode.cycle, `'${host.id}' lies in the subtree of '${timeline.id}'`, path);
    }
    if (host.is_segment_line) {
      return problem(
        ErrorCode.segmentStructure,
        `'${host.id}' is a segment line: it holds only its segments`,
        path,
      );
    }
    if (host.unit !== timeline.unit) {
      return problem(
        ErrorCode.unitMismatch,
        `'${timeline.id}' is in ${timeline.unit}, its new parent '${host.id}' in ${host.unit}`,
        path,
      );
    }
    const offset = toAxisValue(parent.offset);
    if (at.parent?.timeline.id === host.id && sameJson(timeline.offset, offset)) return view;
    const under = ancestry.get(host.id) ?? [];
    // A timeline of the moved subtree lies under the new parent, the path from the moved one down kept.
    const after = (id: string) => {
      const own = ancestry.get(id) ?? [];
      return moving(id) ? [...under, ...own.slice(own.indexOf(timeline.id))] : own;
    };
    for (const group of manifest.groups) {
      const changed = group.members.filter(moving);
      const nested = nestingProblem(group, changed, after, path);
      if (nested !== undefined) return nested;
    }
  }
  const order = bandOrderOf(manifest, timeline.id);
  const without = withoutTimeline(manifest, at);
  let moved: Manifest;
  if (parent === null) {
    const { offset: _, ...root } = timeline;
    moved = { ...without, timelines: [...without.timelines, root] };
  } else {
    // The new parent lies outside the moved subtree, so it is still there.
    const host = locateTimeline(without, parent.at.timeline.id);
    if (host === undefined) throw new Error(`${parent.at.timeline.id} left with ${timeline.id}`);
    const placed = placeChild(host, timeline, parent.offset, path);
    if (isCommandError(placed)) return placed;
    moved = replaceTimeline(without, host, placed);
  }
  const kept = withBandOrderKept(moved, timeline.id, order);
  record(changes, path, block.id, true);
  return withBlock(view, { ...block, manifest: kept });
}

// ---------------------------------------------------------------- group

/** `manifest` with `group` replaced by `next`, its display order, if stated, listing `next`'s members. */
function withGroup(manifest: Manifest, group: Group, next: Group): Manifest {
  const groups = manifest.groups.map((item) => (item === group ? next : item));
  const graphical = manifest.graphical;
  const order = graphical?.order?.[group.id];
  if (graphical === undefined || order === undefined) return { ...manifest, groups };
  const display = [
    ...order.filter((id) => next.members.includes(id)),
    ...next.members.filter((id) => !order.includes(id)),
  ];
  return {
    ...manifest,
    groups,
    graphical: { ...graphical, order: withKey(graphical.order ?? {}, group.id, display) },
  };
}

/**
 * Set the groups a timeline is a member of (`set groups`): a list of
 * distinct group IDs. The timeline joins each group the list names that it
 * was no member of, as that group's last member, and leaves each group it
 * was a member of that the list does not name; the order of the list means
 * nothing. A timeline may be a member of several groups, but no member of a
 * group holds or lies inside another (`nested_member`). A display order a
 * group states lists the member it gains last and loses the one that
 * leaves. The lock its new place decides is applied (a segment line that
 * becomes a member is locked).
 */
export function setGroups(
  view: View,
  target: TimelineTarget,
  value: unknown,
  path: readonly PathSegment[],
  changes: ChangeSet,
): View | CommandError {
  const { block, at } = target;
  const { manifest } = block;
  const { id } = at.timeline;
  if (!Array.isArray(value)) {
    return problem(ErrorCode.invalidValue, "a timeline's groups are a list of group ids", path);
  }
  const named: string[] = [];
  for (const [index, entry] of value.entries()) {
    const where = [...path, index];
    if (typeof entry !== "string") {
      return problem(ErrorCode.invalidValue, "a group is named by its id", where);
    }
    if (named.includes(entry)) {
      return problem(ErrorCode.invalidValue, `group '${entry}' is listed twice`, where);
    }
    if (!manifest.groups.some((group) => group.id === entry)) {
      return problem(ErrorCode.unknownTarget, `'${entry}' names no group of the manifest`, where);
    }
    named.push(entry);
  }
  const { ancestry } = indexOf(manifest);
  let next = manifest;
  for (const group of manifest.groups) {
    const listed = named.includes(group.id);
    if (group.members.includes(id) === listed) continue;
    if (listed) {
      const where = [...path, named.indexOf(group.id)];
      const nested = nestingProblem(group, [id], (member) => ancestry.get(member) ?? [], where);
      if (nested !== undefined) return nested;
    }
    const members = listed
      ? [...group.members, id]
      : group.members.filter((member) => member !== id);
    next = withGroup(next, group, { ...group, members });
  }
  if (next === manifest) return view;
  const members = new Set(next.groups.flatMap((group) => group.members));
  const locked = withPlaceLocks(at.timeline, at.parent?.timeline, (member) => members.has(member));
  if (locked !== at.timeline) {
    const located = locateTimeline(next, id);
    if (located !== undefined) next = replaceTimeline(next, located, locked);
  }
  record(changes, path, block.id, true);
  return withBlock(view, { ...block, manifest: next });
}
