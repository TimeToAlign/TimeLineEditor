/**
 * @timetoalign/tilie-layout: the drawing of one TimeSkeleton manifest.
 *
 * `draw(manifest, placement, layers, metrics)` implements timeskeleton's
 * drawing specification (`docs/drawing.md`, sections 1 to 6): the cascade of
 * style layers, exact positions, text measured from the font's advance
 * widths, and the layout of bands and rows. Pure and deterministic.
 */

export const name = "@timetoalign/tilie-layout" as const;

export type { BandGroup, Domain, ElementKey, Modality } from "@timetoalign/tilie-core";
export type { Side, Style } from "./cascade.ts";
export { Cascade, INITIAL_STYLE } from "./cascade.ts";
export { DEFAULT_LAYER } from "./defaults.ts";
export type {
  BlockElement,
  BreakElement,
  Drawing,
  DrawnElement,
  JumpElement,
  LineElement,
  MapElement,
  MarkerElement,
  Placement,
  Point,
  RegionElement,
  ShownCoordinate,
  TextElement,
} from "./draw.ts";
export { DEFAULT_PLACEMENT, draw, MAP_SPACING, MARKER_BASE } from "./draw.ts";
export { cleanText, TextMeasure } from "./metrics.ts";
