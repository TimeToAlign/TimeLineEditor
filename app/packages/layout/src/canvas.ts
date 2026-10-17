/**
 * Distances outwards from the root's line, the bands that fill a side, the
 * canvas positions of a member drawing once it is placed, and an element
 * shifted from the place origin into the box (`docs/drawing.md` in
 * timeskeleton, sections 3.3, 6.4 and 8.4).
 */

import type { Real } from "@timetoalign/tilie-core";
import type { Side } from "./cascade.ts";
import type { DrawnElement, Point } from "./elements.ts";
import type { Entry, Scope } from "./traversal.ts";

/** The ordinate of a distance `o` outwards from the root's line: `y_root − o` above, `y_root + o` below. */
export const at = (side: Side, outwards: number) => (yRoot: number) =>
  side === "above" ? yRoot - outwards : yRoot + outwards;

/**
 * A band of a side (section 6.4): its width, the distance it starts no nearer
 * than, and what it places once its start `c0` is known.
 */
export interface Band<T> {
  readonly width: number;
  readonly minimum: number;
  readonly at: (start: number) => T;
}

/** A member drawing placed at the shared start `x0`, the name column `xn` and its top. */
export interface Position {
  readonly x0: number;
  readonly xn: number;
  readonly top: number;
  /** The root line's ordinate. */
  readonly yRoot: number;
  /** `x` of an exact position on the root's axis. */
  readonly x: (value: Real) => number;
  /** `Xe`, `x` of a timeline's end: `x0 + L` for the root's open end (section 3.4). */
  readonly xEnd: (entry: Entry) => number;
  /** The ordinate of a distance outwards from the root's line. */
  readonly yAt: (side: Side, outwards: number) => number;
  /** The baseline of a label beyond the ordinate `y` (section 6.6). */
  readonly beyond: (side: Side, y: number, size: number) => number;
  /** The ordinate of a drawn line: the root's or a child row's. */
  readonly lineY: (line: Entry) => number;
}

/**
 * Place a member drawing: its root's line `yLocal` below its top, each child
 * line at `distance` from the root's line on its side.
 */
export function position(
  scope: Scope,
  yLocal: number,
  distance: (line: Entry) => number,
  x0: number,
  xn: number,
  top: number,
): Position {
  const x = (value: Real) => x0 + scope.relativeX(value);
  const xEnd = (entry: Entry) => x0 + scope.relativeEnd(entry);
  const yRoot = top + yLocal;
  const yAt = (side: Side, outwards: number) => at(side, outwards)(yRoot);
  const beyond = (side: Side, y: number, size: number) =>
    side === "above" ? y - scope.d(size) : y + scope.a(size);
  const lineY = (line: Entry): number =>
    line === scope.rootEntry ? yRoot : yAt(line.style.side, distance(line));
  return { x0, xn, top, yRoot, x, xEnd, yAt, beyond, lineY };
}

/**
 * An element drawn shifted by `(dx, dy)`: each finished position measured
 * from the place origin becomes a position in the box (section 8.4).
 */
export function shifted(element: DrawnElement, dx: number, dy: number): DrawnElement {
  const point = ([x, y]: Point): Point => [x + dx, y + dy];
  switch (element.type) {
    case "block":
      return element;
    case "group":
    case "card":
      return { ...element, x: element.x + dx, y: element.y + dy };
    case "timeline":
    case "child":
    case "ancestor":
      return { ...element, xs: element.xs + dx, xe: element.xe + dx, y: element.y + dy };
    case "map":
      return { ...element, xs: element.xs + dx, xe: element.xe + dx, yc: element.yc + dy };
    case "region":
      return {
        ...element,
        x1: element.x1 + dx,
        x2: element.x2 + dx,
        xm: element.xm + dx,
        yb: element.yb + dy,
        ya: element.ya + dy,
      };
    case "jump":
      return {
        ...element,
        start: point(element.start),
        c1: point(element.c1),
        c2: point(element.c2),
        tip: point(element.tip),
        base: point(element.base),
        corners: [point(element.corners[0]), point(element.corners[1])],
      };
    case "break":
    case "boundary":
      return { ...element, x: element.x + dx, y1: element.y1 + dy, y2: element.y2 + dy };
    case "wedge":
      return { ...element, x: element.x + dx, yt: element.yt + dy, yb: element.yb + dy };
    case "name":
    case "label":
      return { ...element, x: element.x + dx, baseline: element.baseline + dy };
  }
}
