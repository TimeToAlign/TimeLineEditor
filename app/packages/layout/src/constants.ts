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
/** The offset of the label of a break, a section break or a barline from its line. */
export const FLOW_LINE_LABEL_OFFSET = 3;
/** The fixed part of the row pitch `p = max(10 + S, h(s))`. */
export const ROW_PITCH = 10;
/** The fixed part of the first jump depth `4 + S`. */
export const JUMP_DEPTH = 4;
/** The fixed part of the jump row pitch `pj = 6 + S + h(9)`. */
export const JUMP_PITCH = 6;
/** The boundary half-height `k`. */
export const BOUNDARY = 8;
/** The standard gap of an elision: the drawn width of a gap without a `width` (section 2). */
export const STANDARD_GAP = 32;
/** An ellipsis: the radius of each of its three dots and the spacing of their centres. */
export const ELLIPSIS_RADIUS = 2;
export const ELLIPSIS_SPACING = 6;
/** The narrowest gap that draws an ellipsis. */
export const ELLIPSIS_GAP = 20;
