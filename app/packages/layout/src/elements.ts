/**
 * The elements of a drawing and the placement it is drawn at
 * (`docs/drawing.md` in TimeToShare, sections 1, 6.6 and 8).
 */

import type { ElementAddress, Places, Real } from "@timetoalign/tilie-core";
import type { TimeUnit } from "@timetoalign/timetoshare";
import type { DrawnAxis, DrawnBox, ElisionExposure } from "./boxes.ts";
import type { Style } from "./cascade.ts";
import type { WedgeCorner } from "./rotation.ts";

export type { DrawnAxis, DrawnBox, ElementRange, ElisionExposure } from "./boxes.ts";

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
  /**
   * The gaps the line crosses (section 6.6, Elisions), each its left and right edge `x(a)` and
   * `x(b)`, from the left: the line is drawn in pieces from run to run, nothing of it in a gap.
   */
  readonly cuts: readonly Cut[];
}

/** The edges `x(a)` and `x(b)` of a gap a row crosses, where its line or outline stops and resumes. */
export type Cut = readonly [number, number];

export interface MapElement extends Addressed {
  readonly type: "map";
  readonly xs: number;
  readonly xe: number;
  /** The centre of the closed double line. */
  readonly yc: number;
  /** The spacing `d` of the double line. */
  readonly spacing: number;
  /** The gaps the map crosses, from the left: its outline is drawn in pieces (section 6.6). */
  readonly cuts: readonly Cut[];
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
 * The gap of an elision (sections 6.6 and 8.9): the rectangle from `x(a)` to
 * `x(b)` and from the top `yt` of its card to its bottom `yb` (across a
 * frame, from the top of its topmost member card to the bottom of its
 * bottommost), filled and not stroked, drawn only where its `fill` is not
 * `none`; and its continuations, one on each row that crosses it, at the
 * rows' ordinates, where its `display` lists `continuation`. It carries what
 * it leaves out on the timeline it lies on and where it comes from: a
 * derived elision, which no manifest stores, is read from here.
 */
export interface ElisionElement extends Addressed {
  readonly type: "elision";
  /** `x(a)` and `x(b)`, its left and right edges on the elided axis (section 3.2). */
  readonly x1: number;
  readonly x2: number;
  readonly yt: number;
  readonly yb: number;
  /** The ordinates of its continuations, in the order of its rows (section 8.5). */
  readonly continuations: readonly number[];
  /**
   * The stretch it leaves out on the timeline it lies on: that timeline's ID, and the start and
   * end of its elided coordinates on its own axis (a clipped piece's, a derived elision's own).
   */
  readonly elided: {
    readonly timeline: string;
    readonly start: Real;
    readonly end: Real;
  };
  /**
   * A stored elision's gap, a derived one's, or a group elision's gap carried into an ancestor
   * card behind its frame (section 8.9).
   */
  readonly origin: GapOrigin;
}

/** Where a gap comes from (section 8.9). */
export type GapOrigin = "stored" | "default" | "carried";

/**
 * The ellipsis of an elision on one row that crosses its gap (section 6.6):
 * three filled circles of radius 2 centred at `x − 6`, `x` and `x + 6` on the
 * row's ordinate `y`, `x` the gap's middle.
 */
export interface EllipsisElement extends Addressed {
  readonly type: "ellipsis";
  readonly x: number;
  readonly y: number;
  /** The radius of each dot, 2, and the spacing of their centres, 6, at the element's scale. */
  readonly r: number;
  readonly spacing: number;
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
  | EllipsisElement
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
  /**
   * What each container drawing gaps or able to draw them decides of its elisions (section
   * 8.9): every ungrouped root's card, every drawn ancestor card and every frame, in drawing order.
   */
  readonly elisions: readonly ElisionExposure[];
  readonly unmapped: readonly number[];
}
