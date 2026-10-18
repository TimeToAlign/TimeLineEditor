/**
 * Distances outwards from the root's line, the bands that fill a side, the
 * canvas positions of a member drawing once it is placed, and an element
 * drawn at its item's place and shifted from the place origin into the box
 * (`docs/drawing.md` in timeskeleton, sections 3.3, 6.4, 8.4 and 8.6).
 */

import type { Real } from "@timetoalign/tilie-core";
import type { Side, Style } from "./cascade.ts";
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

/** A member drawing placed at the shared start `x0`, the name column `n` and its top. */
export interface Position {
  readonly x0: number;
  readonly n: number;
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
  n: number,
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
  return { x0, n, top, yRoot, x, xEnd, yAt, beyond, lineY };
}

/** A style at the scale `scale`: each of its lengths multiplied by it (section 8.6). */
function scaledStyle(style: Style, scale: number): Style {
  if (scale === 1) return style;
  const dashes = style["stroke-dasharray"];
  const maxWidth = style["max-width"];
  return {
    ...style,
    "stroke-width": scale * style["stroke-width"],
    "stroke-dasharray":
      dashes === "none"
        ? dashes
        : dashes
            .split(" ")
            .map((dash) => String(scale * Number(dash)))
            .join(" "),
    "font-size": scale * style["font-size"],
    rx: scale * style.rx,
    "max-width": maxWidth === "none" ? maxWidth : scale * maxWidth,
  };
}

/**
 * An element drawn at `(dx, dy)` and the scale `scale`: each of its positions
 * `(u, v)` taken to `(dx + scale × u, dy + scale × v)` and each of its lengths
 * multiplied by `scale`. An item is drawn at its place so (section 8.6), and
 * every finished position in place coordinates is shifted into the box at
 * scale 1 (section 8.4), where a position becomes `u + dx` and no length changes.
 */
export function placedAt(element: DrawnElement, dx: number, dy: number, scale = 1): DrawnElement {
  const x = (u: number) => dx + scale * u;
  const y = (v: number) => dy + scale * v;
  const point = ([u, v]: Point): Point => [x(u), y(v)];
  if (element.type === "block") return element;
  const style = scaledStyle(element.style, scale);
  switch (element.type) {
    case "group":
    case "card":
      return {
        ...element,
        style,
        x: x(element.x),
        y: y(element.y),
        width: scale * element.width,
        height: scale * element.height,
        shadowOffset: scale * element.shadowOffset,
      };
    case "timeline":
    case "child":
    case "ancestor":
      return { ...element, style, xs: x(element.xs), xe: x(element.xe), y: y(element.y) };
    case "map":
      return {
        ...element,
        style,
        xs: x(element.xs),
        xe: x(element.xe),
        yc: y(element.yc),
        spacing: scale * element.spacing,
      };
    case "region":
      return {
        ...element,
        style,
        x1: x(element.x1),
        x2: x(element.x2),
        xm: x(element.xm),
        yb: y(element.yb),
        ya: y(element.ya),
      };
    case "jump":
      return {
        ...element,
        style,
        start: point(element.start),
        c1: point(element.c1),
        c2: point(element.c2),
        tip: point(element.tip),
        base: point(element.base),
        corners: [point(element.corners[0]), point(element.corners[1])],
      };
    case "break":
    case "boundary":
      return { ...element, style, x: x(element.x), y1: y(element.y1), y2: y(element.y2) };
    case "wedge":
      return {
        ...element,
        style,
        x: x(element.x),
        yt: y(element.yt),
        yb: y(element.yb),
        base: scale * element.base,
      };
    case "name":
    case "label":
      return { ...element, style, x: x(element.x), baseline: y(element.baseline) };
  }
}
