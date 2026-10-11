/**
 * @timetoalign/tilie-layout: the geometry block of one TimeSkeleton manifest.
 *
 * `layout(manifest)` implements the geometry specification of timeskeleton:
 * rows and primitives in exact numbers, pure
 * and deterministic. The style cascade is exported on its own.
 */

export const name = "@timetoalign/tilie-layout" as const;

export type { Domain, DrawnElement, Modality, ScopedRule, Style } from "./cascade.ts";
export { defaultStyle, matches, rank, resolveStyle, scopedRules } from "./cascade.ts";
export type { LayoutOptions, LosslessBlock } from "./layout.ts";
export { layout } from "./layout.ts";
export type { GeometryNumber } from "./numbers.ts";
