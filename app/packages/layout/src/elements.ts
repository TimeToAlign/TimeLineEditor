/**
 * The elements of a drawing and the placement it is drawn at
 * (`docs/drawing.md` in TimeToShare, sections 1, 6.6 and 8).
 */

import type { ElementAddress, Places, Real } from "@timetoalign/tilie-core";
import type { TimeUnit } from "@timetoalign/timetoshare";
import type { DrawnAxis, DrawnBox } from "./boxes.ts";
import type { Style } from "./cascade.ts";
import type { WedgeCorner } from "./rotation.ts";

export type { DrawnAxis, DrawnBox, ElementRange } from "./boxes.ts";

/** Where and how large the drawing is placed (section 1). */
export interface Placement {
  readonly length: number;
  /** The block's spacing: the gap between its items at their default `y` (section 8.6). */
  readonly spacing: number;
  /**
   * The block's margin `Vb`: empty space above its first item and below its last (sections 8.4
   * and 8.6), finite, at least 0; left out, 0.
   */
  readonly margin?: number;
  readonly width: number | null;
  readonly height: number | null;
  /**
   * The places of the block's items, by group ID or ungrouped root ID, each group's holding
   * the sizes, spacings and margins of its members' cards in its `cards`, by member ID (section
   * 8.6).
   */
  readonly places: Places;
  /**
   * The view `{width, height}`, the screen area the drawing is meant for, in canvas units at the
   * scale 1, each finite and positive (section 1): it sets the default width of elisions (section
   * 8.9) and nothing else. Left out, the default view.
   */
  readonly view?: View;
}

/** A view: the screen area a drawing is meant for, in canvas units at the scale 1 (section 1). */
export interface View {
  readonly width: number;
  readonly height: number;
}

/** The default view, 1280 × 720 (section 1). */
export const DEFAULT_VIEW: View = { width: 1280, height: 720 };

export const DEFAULT_PLACEMENT: Placement = {
  length: 400,
  spacing: 8,
  margin: 0,
  width: null,
  height: null,
  places: {},
};

export interface ShownCoordinate {
  readonly unit: TimeUnit;
  readonly value: Real;
}

interface Addressed {
  readonly address: ElementAddress;
  readonly style: Style;
}

export interface BlockElement {
  readonly type: "block";
  /** The bundle's address, `{}`. */
  readonly address: ElementAddress;
  readonly style: Style;
  readonly width: number;
  readonly height: number;
}

/** A group's frame, a timeline's card or a root's ancestor card: a rounded rectangle (section 8). */
export interface RectElement extends Addressed {
  readonly type: "frame" | "card" | "ancestor_card";
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** How far a card's shadow lies to the right and down (section 8.4); 0 for a frame. */
  readonly shadowOffset: number;
}

/**
 * How a line starts: with its circle, running on in a double chevron (section 8.3), or `none`
 * where its start lies in a strip and it starts at the strip's right edge (section 6.6, Elisions).
 */
export type LineStart = "circle" | "chevrons" | "none";

/**
 * How a line ends (sections 6.6 and 8.3): `unknown`, three chevrons, where its
 * own length is not known; `chevrons`, a double chevron, where an ancestor
 * line runs on; `none`, without a mark, where its end lies in a strip and it
 * ends at the strip's left edge (section 6.6, Elisions).
 */
export type LineEnd = "arrowhead" | "open" | "circle" | "diamond" | "unknown" | "chevrons" | "none";

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

/** A point `(x, y)` in block-local canvas units. */
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

/**
 * A vertical line: a flow marker, the boundary of a segment, or the
 * cross-section line of a named timestamp, from `(x, y1)` to `(x, y2)`.
 */
export interface VerticalLineElement extends Addressed {
  readonly type: "flow_marker" | "boundary" | "cross_section";
  readonly x: number;
  readonly y1: number;
  readonly y2: number;
}

/**
 * The line of an alignment anchor of a named MatchStamp, from `(x1, y1)` to
 * `(x2, y2)`: from a cross-section segment of its first timestamp to one of
 * its second (section 8.7).
 */
export interface AnchorElement extends Addressed {
  readonly type: "alignment_anchor";
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

/**
 * A wedge (section 6.6, Wedges): its tip at `(x, yt)` and the two corners of
 * its base, in the order section 6.6 gives them, turned by its style's
 * `rotation` about the tip.
 */
export interface MarkerElement extends Addressed {
  readonly type: "wedge";
  readonly x: number;
  readonly yt: number;
  readonly corners: readonly [WedgeCorner, WedgeCorner];
}

/**
 * The strip of an elision (sections 6.6 and 8.9): a rectangle from `x(a)`
 * to `x(b)` and from its card's top `yt` to its bottom `yb`, filled and not
 * stroked; its rule at `x(a)` from `yt` to `yb` where it touches the strip
 * before it; and the continuations of the lines whose span holds its whole
 * stretch, at their ordinates, in the traversal order of their lines. It
 * carries what it elides, on the timeline it lies on: a default elision,
 * which no manifest stores, is read from here.
 */
export interface ElisionElement extends Addressed {
  readonly type: "elision";
  /** `x(a)` and `x(b)`, its left and right edges on the elided axis (section 3.2). */
  readonly x1: number;
  readonly x2: number;
  /** Its card's top and bottom. */
  readonly yt: number;
  readonly yb: number;
  /** It starts where the strip before it ends, and is parted from it by a rule. */
  readonly rule: boolean;
  /** The ordinates of its continuations, in the traversal order of their lines. */
  readonly continuations: readonly number[];
  /**
   * The stretch it draws on the timeline it lies on: that timeline's ID, and the start and end
   * of the stretch on its own axis (a clipped or a default elision's own bounds).
   */
  readonly elided: {
    readonly timeline: string;
    readonly start: Real;
    readonly end: Real;
  };
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
  | AnchorElement
  | MarkerElement
  | ElisionElement
  | TextElement;

export interface Drawing {
  readonly width: number;
  readonly height: number;
  /** The place origin within the block (section 8.4). */
  readonly origin: { readonly x: number; readonly y: number };
  /**
   * Every container drawn: the block first, then in drawing order each frame, each card and each
   * band of the card's timelines (a timeline drawn twice, a child in one card and a member in
   * another, has two sets of bands under the same addresses, told apart by their `line`).
   */
  readonly boxes: readonly DrawnBox[];
  /** Every line drawn, in the order of its element: what a position on it stands for. */
  readonly axes: readonly DrawnAxis[];
  readonly elements: readonly DrawnElement[];
  readonly unmapped: readonly number[];
}
