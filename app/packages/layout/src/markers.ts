/**
 * The markers band: the wedges of the root's start and end with their label
 * tiers, and the reach of a line's marks, which ancestor lines share
 * (`docs/drawing.md` in TimeToShare, sections 6.4, Markers, 6.6 and 8.3).
 */

import { bandAddress, partAddress } from "@timetoalign/tilie-core";
import type { PreparedBand } from "./bands.ts";
import { LABEL_GAP, MARKER_BASE, MARKER_HEIGHT } from "./constants.ts";
import { labelExtent, labelTiers, Rows } from "./fit.ts";
import { centredLabel } from "./names.ts";
import { coordinateText } from "./numbers.ts";
import { type Entry, known, maxSize, type Scope, shown } from "./traversal.ts";

/** The reach of the wedges or marks of a line of width `w`: `w / 2 + 13`, and the label tiers beyond. */
export const markReach = (scope: Scope, w: number, tiers: number, size: number): number =>
  tiers === 0 ? w / 2 + MARKER_HEIGHT : w / 2 + MARKER_HEIGHT + LABEL_GAP + tiers * scope.h(size);

/** The distance from the axis of a line of width `w` to the inner edge of its mark label tier `tier`. */
export const markLabelOffset = (scope: Scope, w: number, tier: number, size: number): number =>
  w / 2 + MARKER_HEIGHT + LABEL_GAP + (tier - 1) * scope.h(size);

/**
 * The markers band of the timeline drawn with the line `line` (section 6.4,
 * Markers): only the root of the member drawing marks its start and end, so
 * the band draws wedges only when the root is among `sources` (its line
 * displayed, section 2.4); every other timeline's markers band holds nothing
 * and is absent, and a segment's adds nothing. The root's drawn wedges,
 * start before end (its start alone when its end is open), each labelled
 * with the coordinate it marks in the root's unit; the labels placed by one
 * first fit, start before end, into the band's tiers, centred on their
 * wedge's `X`. Its width is `w / 2 + 13`, or `w / 2 + 13 + 2 + T × h(9)`
 * when the labels fill `T ≥ 1` tiers, `w` the root's stroke width and 9 the
 * largest font size of its drawn labels. Drawn from its start `c`, a wedge's
 * tip lies `c + w / 2` out and its base 13 further, and tier `k` starts `c +
 * w / 2 + 13 + 2 + (k − 1) × h(9)` out, summed in that order (section 6.6,
 * Wedges): never `c` plus `markLabelOffset`, which sums from `w / 2`.
 */
export function markersBand(scope: Scope, line: Entry, sources: readonly Entry[]): PreparedBand {
  const { root, rootEntry, lambda, owned, measured, u, relativeX, h } = scope;
  const band = line.bands.markers;
  const wedges = !sources.includes(rootEntry)
    ? []
    : [
        { ...owned("wedge", partAddress(root.id, "start"), line, "markers"), at: rootEntry.start },
        ...(rootEntry.open
          ? []
          : [{ ...owned("wedge", partAddress(root.id, "end"), line, "markers"), at: lambda }]),
      ].filter((wedge) => shown(wedge.style) && shown(band.style));
  const labels = wedges
    .filter((wedge) => shown(wedge.label.style))
    .map((wedge) => ({ wedge, ...measured(wedge.label, coordinateText(wedge.at, root.unit)) }));
  const tiers = new Rows();
  const tier = labelTiers(labels, (item) => relativeX(item.wedge.at), tiers);
  const size = maxSize(labels.map((item) => item.wedge.label));
  const w = rootEntry.style["stroke-width"];
  return {
    kind: "markers",
    address: bandAddress(line.manifest.id, "markers"),
    elements: wedges.length,
    width: wedges.length === 0 ? 0 : markReach(scope, w, tiers.count, size),
    extents: labels.map((item) => labelExtent(relativeX(item.wedge.at), item.width)),
    centred: labels.map((item) => ({ width: item.width, u: u(item.wedge.at) })),
    draw: (start, side, at) => ({
      wedges: wedges.map((wedge) => ({
        type: "wedge",
        address: wedge.address,
        style: wedge.style,
        x: at.x(wedge.at),
        yt: at.yAt(side, start + w / 2),
        yb: at.yAt(side, start + w / 2 + MARKER_HEIGHT),
        base: MARKER_BASE,
      })),
      wedgeLabels: labels.map((item) => {
        const outwards =
          start + w / 2 + MARKER_HEIGHT + LABEL_GAP + (known(tier, item) - 1) * h(size);
        return centredLabel(
          item.wedge.label,
          at.x(item.wedge.at),
          at.beyond(side, at.yAt(side, outwards), size),
          item,
          { unit: root.unit, value: item.wedge.at },
        );
      }),
    }),
  };
}
