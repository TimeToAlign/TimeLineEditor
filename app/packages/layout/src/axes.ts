/**
 * The lines of a drawing for a hit test: where each drawn line and each map
 * drawn at it lies, and what a position on it stands for (`docs/drawing.md`
 * in TimeToShare, sections 3, 6.4 and 8.3).
 */

import { addressKey, placeKeyText, type Real } from "@timetoalign/tilie-core";
import type { NumberType, TimeUnit } from "@timetoalign/timetoshare";
import type { AxisMap, AxisSegment } from "./boxes.ts";
import type { Drawing } from "./elements.ts";
import { add, negate } from "./numbers.ts";

/** One drawn line of a drawing, in block-local canvas units, with the coordinates it stands for. */
export interface LineAxis {
  /** The ID of the timeline drawn. */
  readonly timeline: string;
  /** The ordinate of its line. */
  readonly y: number;
  /** The abscissas of its start and its end, the reach's where its end is not known. */
  readonly xStart: number;
  readonly xEnd: number;
  /** The coordinate at `xStart` on its timeline's own axis: 0, or an ancestor's where it is clipped. */
  readonly start: Real;
  /** The coordinates from `xStart` to `xEnd`: the end less the start; null where the end is not known. */
  readonly length: Real | null;
  readonly numberType: NumberType;
  readonly unit: TimeUnit;
  /** Its timeline's segments when it is a segment line, each on its own axis. */
  readonly segments: readonly AxisSegment[];
  /** The maps drawn at its line, its own and its segments', in the order they are drawn. */
  readonly maps: readonly AxisMap[];
}

/**
 * Every drawn line of `drawing` (its `axes`, in their order) for a hit test,
 * keyed by the place key text of the card drawing it followed by the address
 * key of its timeline, so that a timeline drawn in two cards has two entries.
 */
export function lineAxes(drawing: Drawing): ReadonlyMap<string, LineAxis> {
  return new Map(
    drawing.axes.flatMap((axis) => {
      const { id } = axis.address;
      if (id === undefined) return [];
      const line: LineAxis = {
        timeline: id,
        y: axis.line,
        xStart: axis.xStart,
        xEnd: axis.xEnd,
        start: axis.start,
        length: axis.end === null ? null : add(axis.end, negate(axis.start)),
        numberType: axis.numberType,
        unit: axis.unit,
        segments: axis.segments,
        maps: axis.maps,
      };
      return [[placeKeyText(axis.card) + addressKey(axis.address), line]];
    }),
  );
}
