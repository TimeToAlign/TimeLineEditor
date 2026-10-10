/**
 * @timetoalign/tilie-layout: the geometry of a TimeSkeleton document.
 *
 * `layout(document)` implements the geometry specification of timeskeleton
 * (`docs/geometry.md`): blocks, rows and primitives in exact numbers, pure
 * and deterministic. The style cascade is exported on its own.
 */

export const name = "@timetoalign/tilie-layout" as const;

export type { Domain, DrawnElement, Modality, ScopedRule, Style } from "./cascade.ts";
export { defaultStyle, matches, rank, resolveStyle, scopedRules } from "./cascade.ts";
export type { LosslessGeometry } from "./layout.ts";
export { layout } from "./layout.ts";
export type { GeometryNumber } from "./numbers.ts";
