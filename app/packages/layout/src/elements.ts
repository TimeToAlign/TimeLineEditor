/**
 * The elements of a drawing and the placement it is drawn at
 * (`docs/drawing.md` in timeskeleton, sections 1, 6.6 and 8).
 */

import type { BandGroup, Real } from "@timetoalign/tilie-core";
import type { TimeUnit } from "@timetoalign/timeskeleton";
import type { Style } from "./cascade.ts";

/** Where and how large the drawing is placed (section 1). */
export interface Placement {
  readonly length: number;
  readonly spacing: number;
  readonly width: number | null;
  readonly height: number | null;
  readonly order: readonly [BandGroup, BandGroup, BandGroup];
}

export const DEFAULT_PLACEMENT: Placement = {
  length: 400,
  spacing: 1,
  width: null,
  height: null,
  order: ["children", "regions", "flow"],
};

export interface ShownCoordinate {
  readonly unit: TimeUnit;
  readonly value: Real;
}

interface Addressed {
  readonly address: string;
  readonly style: Style;
}

export interface BlockElement {
  readonly type: "block";
  readonly address: null;
  readonly style: Style;
  readonly width: number;
  readonly height: number;
}

/** A group's frame or a timeline's card: a rounded rectangle (section 8). */
export interface RectElement extends Addressed {
  readonly type: "group" | "card";
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** How a line starts: with its circle, or running on in a double chevron (section 8.3). */
export type LineStart = "circle" | "chevrons";

/** How a line ends (sections 6.6 and 8.3). */
export type LineEnd = "arrowhead" | "open" | "circle" | "diamond" | "chevrons";

export interface LineElement extends Addressed {
  readonly type: "timeline" | "child" | "ancestor";
  /** The start `Xs`, or `Xa` where an ancestor line runs on to the left. */
  readonly xs: number;
  /** The end `Xe`, or `Xr` where an ancestor line runs on to the right. */
  readonly xe: number;
  readonly y: number;
  readonly start: LineStart;
  readonly end: LineEnd;
}

export interface MapElement extends Addressed {
  readonly type: "map";
  readonly xs: number;
  readonly xe: number;
  /** The centre of the closed double line. */
  readonly yc: number;
}

export interface RegionElement extends Addressed {
  readonly type: "region";
  readonly x1: number;
  readonly x2: number;
  readonly xm: number;
  readonly yb: number;
  readonly ya: number;
}

/** A point `(x, y)` in box-local canvas units. */
export type Point = readonly [number, number];

/** One path command and its points, in the order they are written. */
export interface PathCommand {
  readonly command: "M" | "C" | "Q" | "L";
  readonly points: readonly Point[];
}

export interface JumpElement extends Addressed {
  readonly type: "jump";
  /** The curve's start `P0` and its controls `C1`, `C2`. */
  readonly start: Point;
  readonly c1: Point;
  readonly c2: Point;
  /** The arrowhead's tip `P3`, the curve's end. */
  readonly tip: Point;
  /** The arrowhead's base centre `Bh`, where the shaft ends. */
  readonly base: Point;
  /** The arrowhead's base corners `Bh − 2w × n` and `Bh + 2w × n`. */
  readonly corners: readonly [Point, Point];
}

/** A vertical line: a break, or the boundary of a segment. */
export interface BreakElement extends Addressed {
  readonly type: "break" | "boundary";
  readonly x: number;
  readonly y1: number;
  readonly y2: number;
}

export interface MarkerElement extends Addressed {
  readonly type: "wedge";
  readonly x: number;
  readonly yt: number;
  readonly yb: number;
}

export interface TextElement extends Addressed {
  readonly type: "name" | "label";
  readonly x: number;
  readonly baseline: number;
  readonly anchor: "start" | "middle";
  readonly text: string;
  readonly coordinate?: ShownCoordinate;
}

export type DrawnElement =
  | BlockElement
  | RectElement
  | LineElement
  | MapElement
  | RegionElement
  | JumpElement
  | BreakElement
  | MarkerElement
  | TextElement;

export interface Drawing {
  readonly width: number;
  readonly height: number;
  readonly elements: readonly DrawnElement[];
  readonly unmapped: readonly number[];
}
