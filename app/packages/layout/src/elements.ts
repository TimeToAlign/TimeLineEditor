/**
 * The elements of a drawing and the placement it is drawn at
 * (`docs/drawing.md` in TimeToShare, sections 1, 6.6 and 8).
 */

import type {
  ElementAddress,
  FlowLineRole,
  ItemArrangement,
  ItemDirection,
  Places,
  Real,
} from "@timetoalign/tilie-core";
import type { ArrangementConflict } from "@timetoalign/tilie-core/drawing";
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
  /**
   * The block's arrangement (sections 1 and 8.6): its items placed in an order, one under another
   * or side by side, instead of at the `x` and `y` their places state; left out or null, each item
   * lies at its place.
   */
  readonly arrangement?: ItemArrangement | null;
}

/**
 * The arrangement a drawing states (section 1): its direction as asked, the IDs of its items in
 * the order they are drawn (for `horizontal` the row, else the item order), the shared roots drawn
 * once, line by line from the top and on each line from the left (none unless drawn side by side),
 * and, where `horizontal` is refused and the block drawn `vertical`, the conflict.
 */
export interface DrawnArrangement {
  readonly direction: ItemDirection;
  readonly row: readonly string[];
  readonly roots: readonly string[];
  readonly refused?: ArrangementConflict;
}

/** A view: the screen area a drawing is meant for, in canvas units at the scale 1 (section 1). */
export interface View {
  readonly width: number;
  readonly height: number;
}

/** The default view, 1280 × 720 (section 1). */
export const DEFAULT_VIEW: View = { width: 1280, height: 720 };

/**
 * The placement used when none is given: length 400, spacing 8, margin 0, no stated width or
 * height, no places.
 */
export const DEFAULT_PLACEMENT: Placement = {
  length: 400,
  spacing: 8,
  margin: 0,
  width: null,
  height: null,
  places: {},
};

/** A timestamp's coordinate as a label carries it: its value on its timeline's own axis, and that axis' unit. */
export interface ShownCoordinate {
  readonly unit: TimeUnit;
  readonly value: Real;
}

interface Addressed {
  readonly address: ElementAddress;
  readonly style: Style;
}

/** The block itself, the first element of every drawing: its width and height. */
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
 * where its start lies in a gap and it starts at the gap's right edge (section 6.6, Elisions).
 */
export type LineStart = "circle" | "chevrons" | "none";

/**
 * How a line ends (sections 6.6 and 8.3): `unknown`, three chevrons, where its
 * own length is not known; `chevrons`, a double chevron, where an ancestor
 * line runs on; `none`, without a mark, where its end lies in a gap and it
 * ends at the gap's left edge (section 6.6, Elisions).
 */
export type LineEnd = "arrowhead" | "open" | "circle" | "diamond" | "unknown" | "chevrons" | "none";

/** A timeline's line: the root's, a child's, or an ancestor line drawn behind a root (section 8.3). */
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
  /**
   * The spans `[Xa, Xb]` of the gaps of the FlowMap the line draws (section 8.10), from the left,
   * where the line is not drawn and a gap line, the line's own stroke in a fixed grey, stands in
   * for it (section 6.6, Gap lines); absent on a line that draws none.
   */
  readonly gapLines?: readonly Cut[];
}

/** The edges `x(a)` and `x(b)` of a gap a row crosses, where its line or outline stops and resumes. */
export type Cut = readonly [number, number];

/** A conversion map: a closed double line from `xs` to `xe` (section 6.6). */
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

/** A region: a brace from its start to its end (section 6.6, Regions). */
export interface RegionElement extends Addressed {
  readonly type: "region";
  /** The x of the region's start. */
  readonly x1: number;
  /** The x of the region's end. */
  readonly x2: number;
  /** The x of its midpoint, where the brace has its tip. */
  readonly xm: number;
  /** The ordinate of the brace's arms. */
  readonly yb: number;
  /** The ordinate of the brace's tip. */
  readonly ya: number;
  /**
   * The gaps the brace spans (section 6.6, Elisions), each its left and right edge `x(a)` and
   * `x(b)` (`x(p)` and `x(q)` across a frame), from the left: each of the brace's two straight
   * parts leaves out what a gap meets of it, its arms, tip and label drawn whole (`brace`).
   */
  readonly cuts: readonly Cut[];
}

/** A point `(x, y)` in block-local canvas units. */
export type Point = readonly [number, number];

/** One path command and its points, in the order they are written. */
export type PathCommand =
  | { readonly command: "M" | "L"; readonly points: readonly [Point] }
  | { readonly command: "Q"; readonly points: readonly [Point, Point] }
  | { readonly command: "C"; readonly points: readonly [Point, Point, Point] };

/** One arc of a jump, from the jump's coordinate to the place of one of its destinations, and its arrowhead. */
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

/**
 * A vertical line: a break, a section break or a barline of a flow control
 * band, the boundary of a segment, or the cross-section line of a named
 * timestamp, from `(x, y1)` to `(x, y2)`.
 */
export interface VerticalLineElement extends Addressed {
  readonly type: FlowLineRole | "boundary" | "cross_section";
  readonly x: number;
  readonly y1: number;
  readonly y2: number;
}

/**
 * The symbol of a flow-control element (section 6.4, Symbols): the glyphs of
 * its manifestation, or of its destinations' side by side, written as one
 * text centred at `x` on the flow row's symbol line, `baseline` its baseline.
 */
export interface SymbolElement extends Addressed {
  readonly type: "symbol";
  readonly x: number;
  readonly baseline: number;
  readonly text: string;
}

/**
 * One branch of a volta fork (section 6.4, Forks): its arrow from the fork's
 * branch point, its shaft to `base`, the centre of its arrowhead's base, the
 * arrowhead the triangle `tip`, `corners`; its text, the passes as printed,
 * written from `tx` on `baseline`, null for a destination without passes.
 */
export interface ForkBranch {
  readonly base: Point;
  readonly tip: Point;
  readonly corners: readonly [Point, Point];
  readonly tx: number;
  readonly baseline: number;
  readonly text: string | null;
}

/**
 * A volta fork (section 6.4, Forks): its stem from `stem` to its branch
 * point `point`, then its branches in the order of their places, the first
 * straight on and each further one bending away from the root's line.
 */
export interface ForkElement extends Addressed {
  readonly type: "fork";
  readonly stem: Point;
  readonly point: Point;
  readonly branches: readonly ForkBranch[];
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
 * A leader line (section 6.6): a thin line joining a label that its first
 * fit moved beyond its first tier to its element, from `(x1, y1)` at the
 * element to `(x2, y2)` where the label's tier begins. It has the label's
 * address and is held by the label.
 */
export interface LeaderElement extends Addressed {
  readonly type: "leader";
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

/**
 * Where a gap comes from (sections 8.8 and 8.9): a stored elision, a derived one, a group
 * elision carried into an ancestor card, or the gap or seam between two anchors of a root drawn
 * once behind a row.
 */
export type GapOrigin = "stored" | "default" | "carried" | "arrangement";

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

/** A name or a label: its text, written from `x` on its `baseline`, anchored at its start or middle. */
export interface TextElement extends Addressed {
  readonly type: "name" | "label";
  readonly x: number;
  readonly baseline: number;
  readonly anchor: "start" | "middle";
  readonly text: string;
  /**
   * The timestamp's coordinate on a wedge's coordinate label and on a stack's label on an
   * ancestor line that shows a value; absent on every other text.
   */
  readonly coordinate?: ShownCoordinate;
}

/** Any element of a drawing. */
export type DrawnElement =
  | BlockElement
  | RectElement
  | LineElement
  | MapElement
  | RegionElement
  | JumpElement
  | VerticalLineElement
  | SymbolElement
  | ForkElement
  | AnchorElement
  | LeaderElement
  | MarkerElement
  | ElisionElement
  | EllipsisElement
  | TextElement;

/** One block drawn: its size, its containers and lines, and every element in drawing order. */
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
  /** Every element, the block first, in drawing order. */
  readonly elements: readonly DrawnElement[];
  /**
   * What each container drawing gaps or able to draw them decides of its elisions (section
   * 8.9): every ungrouped root's card, every drawn ancestor card and every frame, in drawing order.
   */
  readonly elisions: readonly ElisionExposure[];
  /** The code points the font has no advance for, measured with its fallback advance, ascending. */
  readonly unmapped: readonly number[];
  /** The arrangement it is drawn in (section 1); absent where the placement asks for none. */
  readonly arrangement?: DrawnArrangement;
}
