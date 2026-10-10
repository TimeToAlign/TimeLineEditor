/**
 * @timetoalign/tilie-writers: SVG and TikZ text from a geometry.
 *
 * Both writers implement the page, number formatting and output profiles of
 * the timeskeleton geometry specification (`docs/geometry.md`), so another
 * implementation of it writes the same bytes.
 */

export const name = "@timetoalign/tilie-writers" as const;

export type { PageOptions } from "./page.ts";
export { formatNumber } from "./page.ts";
export { writeSvg } from "./svg.ts";
export type { TikzOptions } from "./tikz.ts";
export { writeTikz } from "./tikz.ts";
