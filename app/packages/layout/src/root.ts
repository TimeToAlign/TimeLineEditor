/**
 * The root band: the root's line, its map stack and its wedges with their
 * label tiers (`docs/drawing.md` in timeskeleton, sections 6.4 and 6.6).
 */

import type { Real } from "@timetoalign/tilie-core";
import type { Band, Position } from "./canvas.ts";
import type { Side } from "./cascade.ts";
import { LABEL_GAP, MARKER_BASE, MARKER_HEIGHT } from "./constants.ts";
import type { LineElement, MarkerElement, TextElement } from "./elements.ts";
import { labelTiers, Rows } from "./fit.ts";
import { centredLabel } from "./names.ts";
import { coordinateText } from "./numbers.ts";
import { type LineReach, type SegmentLabel, segmentLine } from "./segments.ts";
import { endOf, type Measured, maxSize, type Owned, type Scope, shown } from "./traversal.ts";

interface Marker extends Owned {
  readonly at: Real;
}

interface MarkerLabel extends Measured {
  readonly marker: Marker;
  readonly u: number;
}

interface Wedges {
  /** The root's wedges, start before end, drawn or not. */
  readonly markers: readonly Marker[];
  /** The drawn wedge labels, start before end. */
  readonly labels: readonly MarkerLabel[];
  readonly tiers: Record<Side, Rows>;
  readonly tier: ReadonlyMap<MarkerLabel, number>;
  /** The largest label size of the root band of a side: its wedge labels and the root's segment labels. */
  readonly labelSize: (side: Side) => number;
}

/** The reach of the wedges or marks of a line of width `w`: `w / 2 + 13`, and the label tiers beyond. */
export const markReach = (scope: Scope, w: number, tiers: number, size: number): number =>
  tiers === 0 ? w / 2 + MARKER_HEIGHT : w / 2 + MARKER_HEIGHT + LABEL_GAP + tiers * scope.h(size);

/** The distance from the axis of a line of width `w` to the inner edge of its mark label tier `tier`. */
export const markLabelOffset = (scope: Scope, w: number, tier: number, size: number): number =>
  w / 2 + MARKER_HEIGHT + LABEL_GAP + (tier - 1) * scope.h(size);

/**
 * The root's wedges, their labels placed by first fit into each side's
 * tiers; a root whose end is open has its start wedge only.
 */
export function wedges(scope: Scope, segmentLabels: readonly SegmentLabel[]): Wedges {
  const { root, rootEntry, lambda, owned, measured, u, relativeX } = scope;
  const markers: Marker[] = [
    { ...owned("wedge", `${root.id}/start`, rootEntry), at: rootEntry.start },
  ];
  if (!rootEntry.open) markers.push({ ...owned("wedge", `${root.id}/end`, rootEntry), at: lambda });
  const markerLabels = markers
    .filter((marker) => shown(marker.style) && shown(marker.label.style))
    .map((marker) => ({
      marker,
      ...measured(marker.label, coordinateText(marker.at, root.unit)),
      u: u(marker.at),
    }));
  const markerTiers = { above: new Rows(), below: new Rows() };
  const markerTier = labelTiers(
    markerLabels,
    (item) => relativeX(item.marker.at),
    (item) => markerTiers[item.marker.side],
  );
  const labelSize = (side: Side): number =>
    maxSize([
      ...markerLabels.filter((item) => item.marker.side === side).map((item) => item.marker.label),
      ...segmentLabels
        .filter((item) => side === "above" && segmentLine(item.entry) === rootEntry)
        .map((item) => item.label),
    ]);
  return { markers, labels: markerLabels, tiers: markerTiers, tier: markerTier, labelSize };
}

/** The root band of a side, present when it draws a wedge or the root's line reaches into it. */
export function rootBand(
  scope: Scope,
  marks: Wedges,
  reach: LineReach,
  side: Side,
): Band<void> | undefined {
  const { rootEntry } = scope;
  const rootWidth = rootEntry.style["stroke-width"];
  const wedgeDrawn = marks.markers.some((marker) => marker.side === side && shown(marker.style));
  const rootReach = reach.reach(rootEntry, side);
  if (!(wedgeDrawn || rootReach > 0)) return undefined;
  const wedgeReach = !wedgeDrawn
    ? 0
    : markReach(scope, rootWidth, marks.tiers[side].count, marks.labelSize(side));
  return { width: Math.max(wedgeReach, rootReach), minimum: 0, at: () => undefined };
}

/** The root's line, when it is displayed; an open end runs on `4w` into its three chevrons. */
export function rootLineElements(scope: Scope, placed: Position): LineElement[] {
  const { root, rootEntry, member } = scope;
  const { x, xEnd, yRoot } = placed;
  if (!shown(rootEntry.style)) return [];
  const w = rootEntry.style["stroke-width"];
  return [
    {
      type: "timeline",
      address: root.id,
      style: rootEntry.style,
      xs: x(rootEntry.start),
      xe: rootEntry.open ? xEnd(rootEntry) + 4 * w : xEnd(rootEntry),
      y: yRoot,
      start: "circle",
      end: endOf(root, member.ancestors.length === 0, rootEntry.open),
    },
  ];
}

/** The drawn wedges: their tips on the root line's edge, their bases 13 further out. */
export function wedgeElements(scope: Scope, marks: Wedges, placed: Position): MarkerElement[] {
  const rootWidth = scope.rootEntry.style["stroke-width"];
  const { x, yAt } = placed;
  return marks.markers
    .filter((item) => shown(item.style))
    .map((marker) => ({
      type: "wedge",
      address: marker.address,
      style: marker.style,
      x: x(marker.at),
      yt: yAt(marker.side, rootWidth / 2),
      yb: yAt(marker.side, rootWidth / 2 + MARKER_HEIGHT),
      base: MARKER_BASE,
    }));
}

/** The wedge labels, each in its tier beyond its wedge's base. */
export function wedgeLabelElements(scope: Scope, marks: Wedges, placed: Position): TextElement[] {
  const { root } = scope;
  const rootWidth = scope.rootEntry.style["stroke-width"];
  const { x, yAt, beyond } = placed;
  return marks.labels.map((item) => {
    const side = item.marker.side;
    const size = marks.labelSize(side);
    const outwards = markLabelOffset(scope, rootWidth, marks.tier.get(item) as number, size);
    return centredLabel(
      item.marker.label,
      x(item.marker.at),
      beyond(side, yAt(side, outwards), size),
      item,
      { unit: root.unit, value: item.marker.at },
    );
  });
}
