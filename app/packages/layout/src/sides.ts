/**
 * The sides of the root: each filled outwards from the root's line in bands,
 * the root band first, then the three groups in the placement's order, and
 * above, last, the ancestor band (`docs/drawing.md` in timeskeleton,
 * sections 6.4 and 8.3).
 */

import type { BandGroup } from "@timetoalign/tilie-core";
import type { Band } from "./canvas.ts";
import type { FlowBand } from "./flow.ts";
import type { RegionBand } from "./regions.ts";

/** The bands present on one side, `undefined` for a band the side does not hold. */
interface SideBands {
  readonly root: Band<void> | undefined;
  readonly children: Band<number[]> | undefined;
  readonly regions: Band<RegionBand> | undefined;
  readonly flow: Band<FlowBand> | undefined;
  readonly ancestors: Band<number[]> | undefined;
}

/** Where the bands of one side lie, as distances outwards from the root's line. */
interface Bands {
  /** The distance of each child row's line from the root's line, row 1 first. */
  rows: number[];
  /** The distance of each ancestor row's line, the nearest ancestor's first. */
  ancestors: number[];
  region: number;
  pr: number;
  flow: number;
  pj: number;
  /** The side's outer edge. */
  edge: number;
}

/**
 * Fill one side: each band starts at the outer edge of the one before plus
 * `B = 4 × v`, or no nearer than its minimum.
 */
export function fillSide(v: number, order: readonly BandGroup[], bands: SideBands): Bands {
  const B = 4 * v;
  let edge = 0;
  let first = true;
  const next = <T>(band: Band<T>): T => {
    const start = Math.max(first ? 0 : edge + B, band.minimum);
    edge = start + band.width;
    first = false;
    return band.at(start);
  };
  const result: Omit<Bands, "edge"> = {
    rows: [],
    ancestors: [],
    region: 0,
    pr: 0,
    flow: 0,
    pj: 0,
  };
  if (bands.root !== undefined) next(bands.root);
  for (const group of order) {
    if (group === "children" && bands.children !== undefined) {
      result.rows.push(...next(bands.children));
    } else if (group === "regions" && bands.regions !== undefined) {
      const { region, pr } = next(bands.regions);
      result.pr = pr;
      result.region = region;
    } else if (group === "flow" && bands.flow !== undefined) {
      const { flow, pj } = next(bands.flow);
      result.pj = pj;
      result.flow = flow;
    }
  }
  if (bands.ancestors !== undefined) result.ancestors.push(...next(bands.ancestors));
  return { ...result, edge };
}
