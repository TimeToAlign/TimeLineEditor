/**
 * The region band: the regions placed by first fit into rows, each drawn as
 * a brace with its label (`docs/drawing.md` in timeskeleton, sections 6.4,
 * 6.6 and 7.2).
 */

import type { Real } from "@timetoalign/tilie-core";
import type { Band, Position } from "./canvas.ts";
import type { Side } from "./cascade.ts";
import { BRACE, LABEL_GAP } from "./constants.ts";
import type { PathCommand, RegionElement, TextElement } from "./elements.ts";
import { type Extent, labelExtent, Rows, widen } from "./fit.ts";
import { centredLabel } from "./names.ts";
import { add, coordinateValue, midpoint } from "./numbers.ts";
import { type Measured, maxSize, type Owned, type Scope, shown } from "./traversal.ts";

interface Region extends Owned {
  readonly start: Real;
  readonly end: Real;
  readonly text: string | null;
}

interface Regions {
  /** The drawn regions, in traversal order and each timeline's in canonical order. */
  readonly drawn: readonly Region[];
  /** The drawn labels of the drawn regions, centred on their regions' midpoints. */
  readonly labels: ReadonlyMap<Region, Measured & { readonly at: Real }>;
  readonly rows: Record<Side, Rows>;
  readonly row: ReadonlyMap<Region, number>;
}

/** Where a side's region band lies: its start `r0` and its row pitch `pr`. */
export interface RegionBand {
  readonly region: number;
  readonly pr: number;
}

/**
 * The brace of a region from `x1` to `x2`, arms at `yb`, tip at `(xm, ya)`
 * (section 7.2), as the path commands it is written with.
 */
export function brace(x1: number, x2: number, xm: number, yb: number, ya: number): PathCommand[] {
  const ym = (yb + ya) / 2;
  const k = Math.abs(ya - yb) / 2;
  return [
    { command: "M", points: [[x1, yb]] },
    {
      command: "Q",
      points: [
        [x1, ym],
        [x1 + k, ym],
      ],
    },
    { command: "L", points: [[xm - k, ym]] },
    {
      command: "Q",
      points: [
        [xm, ym],
        [xm, ya],
      ],
    },
    {
      command: "Q",
      points: [
        [xm, ym],
        [xm + k, ym],
      ],
    },
    { command: "L", points: [[x2 - k, ym]] },
    {
      command: "Q",
      points: [
        [x2, ym],
        [x2, yb],
      ],
    },
  ];
}

/** The regions of every timeline, the drawn ones placed by first fit, widened to their labels. */
export function regions(scope: Scope): Regions {
  const { entries, address, owned, measured, relativeX } = scope;
  const regions: Region[] = [];
  for (const entry of entries) {
    for (const region of entry.manifest.regions) {
      regions.push({
        ...owned("region", address(region.id), entry),
        start: add(entry.start, coordinateValue(region.start)),
        end: add(entry.start, coordinateValue(region.end)),
        text: region.name,
      });
    }
  }
  const drawnRegions = regions.filter((region) => shown(region.style));
  const regionLabels = new Map(
    drawnRegions
      .filter((region) => region.text !== null && shown(region.label.style))
      .map((region) => [
        region,
        {
          ...measured(region.label, region.text as string),
          at: midpoint(region.start, region.end),
        },
      ]),
  );
  const regionRows = { above: new Rows(), below: new Rows() };
  const regionRow = new Map<Region, number>();
  for (const region of drawnRegions) {
    const xs = relativeX(region.start);
    const xe = relativeX(region.end);
    let extent: Extent = [Math.min(xs, xe), Math.max(xs, xe)];
    const text = regionLabels.get(region);
    if (text !== undefined) extent = widen(extent, labelExtent(relativeX(text.at), text.width));
    regionRow.set(region, regionRows[region.side].place(extent));
  }
  return { drawn: drawnRegions, labels: regionLabels, rows: regionRows, row: regionRow };
}

const regionLabelSize = (regions: Regions, side: Side) =>
  maxSize(
    [...regions.labels.keys()].filter((item) => item.side === side).map((item) => item.label),
  );

/** The region band of a side: `R × pr − 4 × v` wide for `R` rows. */
export function regionBand(
  scope: Scope,
  regions: Regions,
  side: Side,
): Band<RegionBand> | undefined {
  const { v, h } = scope;
  if (regions.rows[side].count === 0) return undefined;
  const pr = BRACE + LABEL_GAP + h(regionLabelSize(regions, side)) + 4 * v;
  return {
    width: regions.rows[side].count * pr - 4 * v,
    minimum: 0,
    at: (start) => ({ region: start, pr }),
  };
}

/** The distance of a region's brace's arms from the root's line. */
const regionArms = (regions: Regions, band: (side: Side) => RegionBand, region: Region) => {
  const own = band(region.side);
  return own.region + ((regions.row.get(region) as number) - 1) * own.pr;
};

/** The regions' braces, each opening towards the root. */
export function regionElements(
  regions: Regions,
  band: (side: Side) => RegionBand,
  placed: Position,
): RegionElement[] {
  const { x, yAt } = placed;
  return regions.drawn.map((region) => {
    const outwards = regionArms(regions, band, region);
    return {
      type: "region",
      address: region.address,
      style: region.style,
      x1: x(region.start),
      x2: x(region.end),
      xm: x(midpoint(region.start, region.end)),
      yb: yAt(region.side, outwards),
      ya: yAt(region.side, outwards + BRACE),
    };
  });
}

/** The region labels, each centred beyond its brace's tip. */
export function regionLabelElements(
  regions: Regions,
  band: (side: Side) => RegionBand,
  placed: Position,
): TextElement[] {
  const { x, yAt, beyond } = placed;
  const drawn: TextElement[] = [];
  for (const region of regions.drawn) {
    const item = regions.labels.get(region);
    if (item === undefined) continue;
    const size = regionLabelSize(regions, region.side);
    drawn.push(
      centredLabel(
        region.label,
        x(item.at),
        beyond(
          region.side,
          yAt(region.side, regionArms(regions, band, region) + BRACE + LABEL_GAP),
          size,
        ),
        item,
      ),
    );
  }
  return drawn;
}
