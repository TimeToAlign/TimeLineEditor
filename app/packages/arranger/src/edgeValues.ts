/**
 * The values an edge dragged or stepped along a timeline's own axis takes:
 * read exact from the manifest, snapped to the timeline's ends and its
 * children's, or to the simplest value of its number type near the
 * pointer, and written as a command writes them. Shared by the handles of
 * a stored elision's gap (`gaps.ts`) and of a region's brace
 * (`gestures/region.ts`).
 */

import type { BlockId, Granularity, TimelineManifest } from "@timetoalign/tilie-core";
import { snapOnRow, timelineAxisOf } from "@timetoalign/tilie-core";
import {
  axisCoordinate,
  axisValueOf,
  exactCoordinate,
  Rational,
  type Real,
  realOf,
  toRational,
} from "@timetoalign/tilie-core/numbers";

const ZERO = Rational.fromParts(0n, 1n);

/** A value on `timeline`'s own axis, as the manifest writes it, read exact. */
export function exactOn(value: unknown, timeline: TimelineManifest): Rational {
  return toRational(realOf(axisCoordinate(value, timeline)));
}

/** The larger and the smaller of two exact values. */
export const max = (a: Rational, b: Rational): Rational => (a.compare(b) >= 0 ? a : b);
export const min = (a: Rational, b: Rational): Rational => (a.compare(b) <= 0 ? a : b);

/**
 * The values of `timeline`'s own axis an edge on it snaps to: its start,
 * its known end, and the start and the known end of each of its children.
 */
export function timelineTargets(timeline: TimelineManifest): Rational[] {
  const targets = [ZERO];
  if (timeline.length !== null) targets.push(exactOn(timeline.length, timeline));
  for (const child of timeline.children) {
    const offset = exactOn(child.offset, timeline);
    targets.push(offset);
    if (child.length !== null) targets.push(offset.add(exactOn(child.length, timeline)));
  }
  return targets;
}

/**
 * The simplest value of `timeline`'s number type within `reach` of `p` on
 * its own axis (core's `snapOnRow` on a spec of that timeline alone: an int
 * axis the nearest integer); `null` for a value or reach that is not finite.
 */
export function snappedOn(
  block: BlockId,
  timeline: TimelineManifest,
  p: number,
  reach: number,
  granularity: Granularity,
): Rational | null {
  if (!Number.isFinite(p) || !(reach > 0) || !Number.isFinite(reach)) return null;
  const spec = { block, granularity, anchor: timelineAxisOf(timeline, []), members: [] };
  return snapOnRow(spec, { timeline: timeline.id, map: null }, p, reach, "no_server");
}

/** An exact value on `timeline`'s own axis as a command writes it; `undefined` where its number type cannot hold it. */
export function axisValue(value: Real, timeline: TimelineManifest) {
  const coordinate = exactCoordinate(value, timeline.unit, timeline.number_type);
  return coordinate === undefined ? undefined : axisValueOf(coordinate.value);
}
