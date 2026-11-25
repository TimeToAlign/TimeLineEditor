/**
 * The constants of the layout (`docs/drawing.md` in TimeToShare, section
 * 6.2; the default spacings of section 8.6). A distance that depends on the card spacing `S`
 * holds its fixed part here.
 */

/** The padding `P`. */
export const P = 8;
/** The gap `G'` after the name column when a name is drawn. */
export const G = 8;
/** The group frame padding `Q`. */
export const Q = 8;
/** The card padding `K`, horizontal only. */
export const K = 8;
/** The gap `F` after the manifest's title. */
export const F = 8;
/** A frame's default spacing, the gap between its cards (section 8.6). */
export const FRAME_SPACING = 8;
/** A card's default spacing `S`, the gap between its rows and between its bands (section 8.6). */
export const CARD_SPACING = 4;
/** The gap after a frame's title. */
export const TITLE_GAP = 4;
/** The offset of a card's shadow, to the right and down. */
export const SHADOW_OFFSET = 2;
/** The map double-line spacing `d`. */
export const MAP_SPACING = 2;
/** The map gap `g`. */
export const MAP_GAP = 3;
/** The width of a wedge's base. */
export const MARKER_BASE = 6;
/** The distance from a wedge's tip to the middle of its base. */
export const MARKER_HEIGHT = 13;
/** The label gap, from a marker to its label. */
export const LABEL_GAP = 2;
/** The brace height. */
export const BRACE = 6;
/** The flow label offset, from a flow-control element's `x` to its stack. */
export const FLOW_LINE_LABEL_OFFSET = 3;
/** The fixed part of the row pitch `p = max(10 + S, h(s))`. */
export const ROW_PITCH = 10;
/** The fixed part of the first jump depth `4 + S`. */
export const JUMP_DEPTH = 4;
/** The fixed part of the jump row pitch `pjk = 6 + S + Tk × h(9)`. */
export const JUMP_PITCH = 6;
/** The symbol gap, between a symbol's glyph box and the lines it meets: `Hs = 2 + h(zs) + 2`. */
export const SYMBOL_GAP = 2;
/** The length of a volta fork's stem, left of its branch point. */
export const FORK_STEM = 6;
/** The length of each arrow of a volta fork, from its branch point to its tip. */
export const FORK_BRANCH = 10;
/** The angle step of a volta fork's branches, in degrees. */
export const FORK_ANGLE = 25;
/** The fork text offset, from a fork's branch point to the start of its texts. */
export const FORK_TEXT_OFFSET = 12;
/** The boundary half-height `k`. */
export const BOUNDARY = 8;
/** The standard gap of an elision: the drawn width of a gap without a `width` (section 2). */
export const STANDARD_GAP = 32;
/** The radius of each of an ellipsis' three dots. */
export const ELLIPSIS_RADIUS = 2;
/** The spacing of the centres of an ellipsis' three dots. */
export const ELLIPSIS_SPACING = 6;
/** The narrowest gap that draws an ellipsis. */
export const ELLIPSIS_GAP = 20;
/**
 * The directions `(ck, sk)` of a volta fork's branches by `min(k − 1, 3)`, along the axis and away
 * from the root's line: 0°, 25°, 50° and 75°, the specification's decimals read as doubles.
 */
export const FORK_DIRECTIONS: readonly (readonly [number, number])[] = [
  [1, 0],
  [0.906307787, 0.4226182617],
  [0.6427876097, 0.7660444431],
  [0.2588190451, 0.9659258263],
];
