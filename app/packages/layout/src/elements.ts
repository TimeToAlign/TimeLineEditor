/**
 * The elements of a drawing and the placement it is drawn at
 * (`docs/drawing.md` in timeskeleton, sections 1, 6.6 and 8).
 */

import type { ItemPlace, Real } from "@timetoalign/tilie-core";
import type { TimeUnit } from "@timetoalign/timeskeleton";
import type { DrawnAxis, DrawnBox } from "./boxes.ts";
import type { Style } from "./cascade.ts";

export type { DrawnAxis, DrawnBox, ElementRange } from "./boxes.ts";

/** Where and how large the drawing is placed (section 1). */
export interface Placement {
  readonly length: number;
  /** The box's spacing: the gap between its items at their default `y` (section 8.6). */
  readonly spacing: number;
  readonly width: number | null;
  readonly height: number | null;
  /**
   * The places of the box's items, by group id or ungrouped root id, and the sizes and
   * spacings of its members' cards, by `<group id>/<member id>` (section 8.6).
   */
  readonly places: { readonly [key: string]: ItemPlace };
}

export const DEFAULT_PLACEMENT: Placement = {
  length: 400,
  spacing: 8,
  width: null,
  height: null,
  places: {},
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
  /** How far a card's shadow lies to the right and down (section 8.4); 0 for a frame. */
  readonly shadowOffset: number;
}

/** How a line starts: with its circle, or running on in a double chevron (section 8.3). */
export type LineStart = "circle" | "chevrons";

/**
 * How a line ends (sections 6.6 and 8.3): `unknown`, three chevrons, where its
 * own length is not known; `chevrons`, a double chevron, where an ancestor
 * line runs on.
 */
export type LineEnd = "arrowhead" | "open" | "circle" | "diamond" | "unknown" | "chevrons";

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
  /** The spacing `d` of the double line. */
  readonly spacing: number;
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
export type PathCommand =
  | { readonly command: "M" | "L"; readonly points: readonly [Point] }
  | { readonly command: "Q"; readonly points: readonly [Point, Point] }
  | { readonly command: "C"; readonly points: readonly [Point, Point, Point] };

/** A jump origin's arc, from its coordinate to its target's, and its arrowhead. */
export interface JumpElement extends Addressed {
  readonly type: "jump_from";
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

/** A vertical line: a flow marker, or the boundary of a segment. */
export interface VerticalLineElement extends Addressed {
  readonly type: "flow_marker" | "boundary";
  readonly x: number;
  readonly y1: number;
  readonly y2: number;
}

export interface MarkerElement extends Addressed {
  readonly type: "wedge";
  readonly x: number;
  readonly yt: number;
  readonly yb: number;
  /** The width of the wedge's base, centred on `x`. */
  readonly base: number;
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
  | VerticalLineElement
  | MarkerElement
  | TextElement;

export interface Drawing {
  readonly width: number;
  readonly height: number;
  /** The place origin within the box (section 8.4). */
  readonly origin: { readonly x: number; readonly y: number };
  /**
   * Every container drawn: the box first, then in drawing order each frame, each card and each
   * band of the card's timelines (a timeline drawn twice, a child in one card and a member in
   * another, has two sets of bands under the same addresses, told apart by their `line`).
   */
  readonly boxes: readonly DrawnBox[];
  /** Every line drawn, in the order of its element: what a position on it stands for. */
  readonly axes: readonly DrawnAxis[];
  readonly elements: readonly DrawnElement[];
  readonly unmapped: readonly number[];
}
