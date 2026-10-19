/**
 * The regions band: a timeline's displayed regions and those of the
 * segments that join it, placed by first fit into rows, each drawn as a
 * brace with its label (`docs/drawing.md` in timeskeleton, sections 6.4, 6.6
 * and 7.2).
 */

import { bandAddress } from "@timetoalign/tilie-core";
import type { PreparedBand } from "./bands.ts";
import { BRACE, LABEL_GAP } from "./constants.ts";
import { type Extent, labelExtent, Rows, widen } from "./fit.ts";
import { centredLabel } from "./names.ts";
import { add, coordinateValue, midpoint } from "./numbers.ts";
import { type Entry, maxSize, nth, type Scope, shown } from "./traversal.ts";

/**
 * The regions band of the timeline drawn with the line `line` (section 6.4,
 * Regions and Segments without a line): the displayed regions of each
 * timeline of `sources`, the line first and then each joined segment, each
 * one's in canonical order, placed in that order by one first fit with the
 * extent from the smaller to the larger of their start and end, widened to
 * their drawn label's extent. `R` rows are `R × pr − 4 × v` wide, `pr = 6 +
 * 2 + h(9) + 4 × v`, 9 the largest font size of the band's drawn labels.
 * Drawn from its start `r0`, row `k` has its brace's arms `r0 + (k − 1) ×
 * pr` out, the tip 6 further and the label's ordinate 2 further again, each
 * distance summed whole first (section 6.6, Regions).
 */
export function regionsBand(scope: Scope, line: Entry, sources: readonly Entry[]): PreparedBand {
  const { address, owned, measured, relativeX, u, v, h } = scope;
  const regions = sources.flatMap((source) =>
    shown(source.bands.regions.style)
      ? source.manifest.regions
          .map((region) => ({
            ...owned("region", address(region.id), source, "regions"),
            start: add(source.start, coordinateValue(region.start, source.manifest.number_type)),
            end: add(source.start, coordinateValue(region.end, source.manifest.number_type)),
            text: region.name,
          }))
          .filter((region) => shown(region.style))
      : [],
  );
  const placed = regions.map((region) => {
    const middle = midpoint(region.start, region.end);
    const label =
      region.text !== null && shown(region.label.style)
        ? measured(region.label, region.text)
        : undefined;
    const xs = relativeX(region.start);
    const xe = relativeX(region.end);
    let extent: Extent = [Math.min(xs, xe), Math.max(xs, xe)];
    if (label !== undefined) extent = widen(extent, labelExtent(relativeX(middle), label.width));
    return { region, middle, label, extent };
  });
  const rows = new Rows();
  const row = placed.map((item) => rows.place(item.extent));
  const size = maxSize(
    placed.flatMap((item) => (item.label === undefined ? [] : [item.region.label])),
  );
  const pr = BRACE + LABEL_GAP + h(size) + 4 * v;
  return {
    kind: "regions",
    address: bandAddress(line.manifest.id, "regions"),
    elements: regions.length,
    width: rows.count === 0 ? 0 : rows.count * pr - 4 * v,
    extents: placed.map((item) => item.extent),
    centred: placed.flatMap((item) =>
      item.label === undefined ? [] : [{ width: item.label.width, u: u(item.middle) }],
    ),
    draw: (start, side, at) => {
      const arms = (index: number) => start + (nth(row, index) - 1) * pr;
      return {
        regions: placed.map(({ region, middle }, index) => ({
          type: "region",
          address: region.address,
          style: region.style,
          x1: at.x(region.start),
          x2: at.x(region.end),
          xm: at.x(middle),
          yb: at.yAt(side, arms(index)),
          ya: at.yAt(side, arms(index) + BRACE),
        })),
        regionLabels: placed.flatMap(({ region, middle, label }, index) =>
          label === undefined
            ? []
            : [
                centredLabel(
                  region.label,
                  at.x(middle),
                  at.beyond(side, at.yAt(side, arms(index) + BRACE + LABEL_GAP), size),
                  label,
                ),
              ],
        ),
      };
    },
  };
}
