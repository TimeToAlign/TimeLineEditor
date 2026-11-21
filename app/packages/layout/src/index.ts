/**
 * @timetoalign/tilie-layout: the drawing of one TimeToShare manifest.
 *
 * `draw(manifest, placement, layers, metrics)` implements TimeToShare's
 * drawing specification (`docs/drawing.md`, sections 1 to 6 and 8): the
 * cascade of style layers, exact positions, text measured from the font's
 * advance widths, the layout of bands and rows, and the block of section 8
 * that holds every manifest, each root in its card. Pure and
 * deterministic.
 */

export const name = "@timetoalign/tilie-layout" as const;

export type { Domain, ElementKey, Modality } from "@timetoalign/tilie-core/drawing";
export type { AnchorLine } from "./anchors.ts";
export { anchorLine } from "./anchors.ts";
export type { CrossSection, CrossSectionSegment, LineAxis, WedgeMark } from "./axes.ts";
export {
  abscissaOf,
  crossedLines,
  crossSection,
  crossSectionSegment,
  groupCrossSections,
  lineAxes,
  timestampSegments,
  wedgeAt,
} from "./axes.ts";
export { draw } from "./block.ts";
export type {
  AxisMap,
  AxisMarker,
  AxisSegment,
  AxisTimestamp,
  DrawnAxis,
  DrawnBox,
  ElementRange,
} from "./boxes.ts";
export { coordinateAt } from "./boxes.ts";
export type { Style } from "./cascade.ts";
export { Cascade, INITIAL_STYLE } from "./cascade.ts";
export { GROUPSTAMP_ROTATION } from "./constants.ts";
export { DEFAULT_LAYER, manifestLayer } from "./defaults.ts";
export type {
  AnchorElement,
  BlockElement,
  Drawing,
  DrawnElement,
  JumpElement,
  LineElement,
  LineEnd,
  LineStart,
  MapElement,
  MarkerElement,
  PathCommand,
  Placement,
  Point,
  RectElement,
  RegionElement,
  ShownCoordinate,
  TextElement,
  VerticalLineElement,
} from "./elements.ts";
export { DEFAULT_PLACEMENT } from "./elements.ts";
export type { Bounds, Circle, LineGeometry, LineMark } from "./geometry.ts";
export { boundsOf, brace, lineGeometry, wedgePoints } from "./geometry.ts";
export type { Span } from "./groupstamps.ts";
export { frameMemberLines, groupSpans } from "./groupstamps.ts";
export { cleanText, TextMeasure } from "./metrics.ts";
export { times } from "./numbers.ts";
export type { WedgeCorner } from "./rotation.ts";
