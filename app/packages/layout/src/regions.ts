/**
 * The regions band: a timeline's displayed regions and those of the
 * segments that join it, placed by first fit into rows, each drawn as a
 * brace with its label (`docs/drawing.md` in TimeToShare, sections 6.4, 6.6
 * and 7.2).
 */

import { idAddress } from "@timetoalign/tilie-core";
import { regionClasses } from "@timetoalign/tilie-core/drawing";
import type { PreparedBand } from "./bands.ts";
import { BRACE, LABEL_GAP } from "./constants.ts";
import { type Extent, labelExtent, type Tiered, type TieredItem, tieredFit } from "./fit.ts";
import { centredLabel } from "./names.ts";
import { coordinateValue, midpoint } from "./numbers.ts";
import { type Entry, maxSize, nth, type Scope, shown } from "./traversal.ts";

/**
 * A regions band before its tiered first fit (section 6.4, Regions): its
 * regions with their drawn labels' extents in the order its first fit takes
 * them, the largest font size of its drawn labels, and the band once they
 * are placed by `fit`, its labels' tiers `size` high: its own first fit
 * alone, or one first fit over the regions bands of a row of one band order.
 */
export interface StagedRegions {
  readonly items: readonly TieredItem[];
  readonly size: number;
  band(fit: Tiered, size: number): PreparedBand;
}

/** A staged regions band placed by its own tiered first fit alone. */
export const regionsAlone = (staged: StagedRegions): PreparedBand =>
  staged.band(tieredFit(staged.items), staged.size);

/**
 * The regions band of the timeline drawn with the line `line` (section 6.4,
 * Regions and Segments without a line): the displayed regions of each
 * timeline of `sources`, the line first and then each joined segment, each
 * one's in canonical order, placed in that order by one tiered first fit
 * (`tieredFit`): each region into a row by its extent alone, from the smaller
 * to the larger of its start and end, so that no label moves it, and its
 * drawn label by its label extent into the label tiers of that row. Row `k`
 * with `Tk` tiers has the pitch `prk = 6 + 2 + Tk × h(9) + S`, `S` the card
 * spacing, 9 the largest font size of the band's drawn labels; the band is
 * `pr1 + … + prR − S` wide. Drawn from its start `r0`, row `k` has its
 * brace's arms `r0 + pr1 + … + pr(k − 1)` out, the tip 6 further, and a label
 * in tier `j` its ordinate `2 + (j − 1) × h(9)` beyond the tip, each distance
 * summed whole first (section 6.6, Regions); a label beyond tier 1 is joined
 * to the tip by a leader from the tip to where its tier begins. A region
 * whose start, end or midpoint lies in a gap is not drawn, nor is its label;
 * another is drawn at their elided x, its brace cut at every gap it spans
 * (section 6.6, Elisions). Its extents, which its timeline's extent holds,
 * are its regions' and their drawn labels'.
 */
export function regionsBand(scope: Scope, sources: readonly Entry[]): StagedRegions {
  const { owned, measured, relativeX, S, h } = scope;
  // On a switched card, and in a window of a virtual card, each region is drawn whole over its
  // played stretch in every piece it reaches into, with its label (section 8.10).
  const regions = sources.flatMap((source) =>
    shown(source.bands.regions.style)
      ? source.manifest.regions.flatMap((region) => {
          const type = source.manifest.number_type;
          const span = scope.over(
            source,
            coordinateValue(region.start, type),
            coordinateValue(region.end, type),
          );
          if (span === undefined) return [];
          const item = {
            ...owned(
              "region",
              idAddress(region.id),
              source,
              "regions",
              regionClasses(scope.manifest, region),
            ),
            start: span.start,
            end: span.end,
            text: region.name,
          };
          return shown(item.style) ? [item] : [];
        })
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
    const extent: Extent = [Math.min(xs, xe), Math.max(xs, xe)];
    const labelled = label === undefined ? undefined : labelExtent(relativeX(middle), label.width);
    return { region, middle, label, extent, labelled };
  });
  const items = placed.map((item) => ({ extent: item.extent, label: item.labelled }));
  return {
    items,
    size: maxSize(placed.flatMap((item) => (item.label === undefined ? [] : [item.region.label]))),
    band: fittedBand,
  };

  function fittedBand(fit: Tiered, size: number): PreparedBand {
    const pitch = (tiers: number) => BRACE + LABEL_GAP + tiers * h(size) + S;
    // Row `k`'s arms at `r0 + (pr1 + … + pr(k − 1))`, the pitches summed first, left to right.
    const arms = (start: number, row: number) =>
      start + fit.tiers.slice(0, row - 1).reduce((sum, tiers) => sum + pitch(tiers), 0);
    const width =
      fit.tiers.length === 0 ? 0 : fit.tiers.reduce((sum, tiers) => sum + pitch(tiers), 0) - S;
    return {
      facet: "regions",
      elements: regions.length,
      width,
      extents: placed.flatMap((item) =>
        item.labelled === undefined ? [item.extent] : [item.extent, item.labelled],
      ),
      centred: placed.flatMap((item) => {
        // A region marking a position in a gap is not drawn, nor is its label (section 6.6).
        const x = scope.drawnX(item.middle);
        const elided = [item.region.start, item.region.end].some(
          (value) => scope.drawnX(value) === undefined,
        );
        return item.label === undefined || x === undefined || elided
          ? []
          : [{ width: item.label.width, x }];
      }),
      draw: (start, side, at) => {
        const drawn = placed.flatMap((item, index) =>
          [item.region.start, item.region.end, item.middle].some(
            (value) => at.gap(value) !== undefined,
          )
            ? []
            : [{ ...item, out: arms(start, nth(fit.row, index)), tier: fit.tier[index] }],
        );
        // The distance of a label's tier from the band's start, its row's arms `out` given.
        const tierAt = (out: number, tier: number) =>
          out + BRACE + LABEL_GAP + (tier - 1) * h(size);
        return {
          regions: drawn.map(({ region, middle, out }) => ({
            type: "region" as const,
            address: region.address,
            style: region.style,
            x1: at.xAfter(region.start),
            x2: at.x(region.end),
            xm: at.x(middle),
            yb: at.yAt(side, out),
            ya: at.yAt(side, out + BRACE),
            // The brace is cut at every gap it spans, as a row is (section 6.6, Elisions).
            cuts: at.cuts(region.start, region.end),
          })),
          regionLabels: drawn.flatMap(({ region, middle, label, out, tier }) =>
            label === undefined || tier === undefined
              ? []
              : [
                  centredLabel(
                    region.label,
                    at.x(middle),
                    at.beyond(side, at.yAt(side, tierAt(out, tier)), size),
                    label,
                  ),
                ],
          ),
          // A label beyond its first tier is joined to its brace's tip by its leader, displayed
          // only with the label (sections 2.4 and 6.6, Leaders).
          regionLeaders: drawn.flatMap(({ region, middle, label, out, tier }) => {
            if (label === undefined || tier === undefined || tier === 1) return [];
            // Only a label beyond its first tier has a leader to cascade.
            const leader = scope.leaderOf(region.label);
            return !shown(leader.style)
              ? []
              : [
                  {
                    type: "leader" as const,
                    ...leader,
                    x1: at.x(middle),
                    y1: at.yAt(side, out + BRACE),
                    x2: at.x(middle),
                    y2: at.yAt(side, tierAt(out, tier)),
                  },
                ];
          }),
        };
      },
    };
  }
}
