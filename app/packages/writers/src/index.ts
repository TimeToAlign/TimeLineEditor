/**
 * @timetoalign/tilie-writers: SVG and TikZ text from drawings.
 *
 * `toDescriptors`, `writeSvg` and `writeTikz` implement the element
 * descriptors, the page, the number format and the two output profiles of
 * timeskeleton's drawing specification (`docs/drawing.md`, section 7), so
 * another implementation of it writes the same bytes.
 */

export const name = "@timetoalign/tilie-writers" as const;

export type {
  Attribute,
  AttributeValue,
  CircleDescriptor,
  Descriptor,
  LineDescriptor,
  PathCommand,
  PathDescriptor,
  Point,
  PointsDescriptor,
  RectDescriptor,
  Tag,
  TextDescriptor,
} from "./descriptors.ts";
export { toDescriptors } from "./descriptors.ts";
export type { OnPage, Page, Placed } from "./page.ts";
export { formatNumber, MARGIN, page } from "./page.ts";
export type { DescriptorSource } from "./source.ts";
export { attributeText, descriptorSvg, writeSvg } from "./svg.ts";
export type { TikzOptions } from "./tikz.ts";
export { writeTikz } from "./tikz.ts";
