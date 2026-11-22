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
  ElisionExposure,
  ExposedGap,
  Run,
} from "./boxes.ts";
export type { Style } from "./cascade.ts";
export { Cascade, INITIAL_STYLE } from "./cascade.ts";
export { DEFAULT_LAYER, manifestLayer } from "./defaults.ts";
export type {
  AnchorElement,
  BlockElement,
  Cut,
  Drawing,
  DrawnElement,
  ElisionElement,
  EllipsisElement,
  GapOrigin,
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
  View,
} from "./elements.ts";
export { DEFAULT_PLACEMENT, DEFAULT_VIEW } from "./elements.ts";
export type { StoredWidth, WidthForm } from "./elisions.ts";
export { widthAs } from "./elisions.ts";
export type { Bounds, Circle, LineGeometry, LineMark } from "./geometry.ts";
export { boundsOf, brace, lineGeometry, wedgePoints } from "./geometry.ts";
export { frameMemberLines, groupSpans, readsAcrossGroup } from "./groupstamps.ts";
export { cleanText, TextMeasure } from "./metrics.ts";
export { times } from "./numbers.ts";
export type { WedgeCorner } from "./rotation.ts";
export type { Span } from "./stacks.ts";
