/**
 * Segment lines: the boundaries and labels of their segments, and how far a
 * line reaches with its stack, its boundaries and its segment labels
 * (`docs/drawing.md` in timeskeleton, sections 6.4 and 6.6).
 */

import { elementKey, type Real } from "@timetoalign/tilie-core";
import type { Position } from "./canvas.ts";
import type { Side } from "./cascade.ts";
import { BOUNDARY, LABEL_GAP } from "./constants.ts";
import type { BreakElement, TextElement } from "./elements.ts";
import { labelTiers, Rows } from "./fit.ts";
import type { MapStacks } from "./maps.ts";
import { centredLabel } from "./names.ts";
import { midpoint } from "./numbers.ts";
import { type Entry, type Measured, maxSize, type Scope, type Styled, shown } from "./traversal.ts";

interface Boundary extends Styled {
  readonly entry: Entry;
}

export interface SegmentLabel extends Measured {
  readonly entry: Entry;
  readonly label: Styled;
  /** The exact midpoint of its segment. */
  readonly at: Real;
}

interface Segments {
  /** The drawn boundaries, in the traversal order of their segments. */
  readonly boundaries: readonly Boundary[];
  /** The segment lines with a drawn boundary. */
  readonly bounded: ReadonlySet<Entry>;
  /** The drawn segment labels, in the traversal order of their segments. */
  readonly labels: readonly SegmentLabel[];
  /** The segment-label tiers above each segment line, filled by one first fit. */
  readonly tiers: ReadonlyMap<Entry, Rows>;
  readonly tier: ReadonlyMap<SegmentLabel, number>;
}

/** The reach of the drawn lines, their segment labels' size and their tick reach `m`. */
export interface LineReach {
  /** The label size of a line's segment labels: its band's. */
  readonly labelSize: (line: Entry) => number;
  /** `m`: the larger of a line's stack reach on a side and, with a drawn boundary, `k`. */
  readonly tick: (line: Entry, side: Side) => number;
  /** How far a line reaches on a side ("above" is up): its stack, its boundaries and its segment labels. */
  readonly reach: (line: Entry, side: Side) => number;
}

/** A segment's segment line: its boundary and label lie on that line, drawn only with it. */
export const segmentLine = (entry: Entry) => entry.parent as Entry;

export function segmentLines(scope: Scope): Segments {
  const { entries, styled, textOf, measured, relativeX } = scope;
  const segments = entries.filter((entry) => entry.segment);
  const boundaries = segments
    .filter((entry) => !entry.first)
    .map((entry) => ({
      entry,
      ...styled(
        elementKey("boundary", `${entry.manifest.id}/start`, entry.manifest, entry.key),
        entry.style,
      ),
    }))
    .filter((item) => shown(item.style) && shown(segmentLine(item.entry).style));
  const bounded = new Set(boundaries.map((item) => segmentLine(item.entry)));
  const segmentLabels = segments
    .filter((entry) => entry.manifest.name !== null)
    .map((entry) => {
      const label = textOf(entry, "label");
      return {
        entry,
        label,
        ...measured(label, entry.manifest.name as string),
        at: midpoint(entry.start, entry.end),
      };
    })
    .filter((item) => shown(item.label.style) && shown(segmentLine(item.entry).style));

  // The segment labels of every segment line, by one first fit into tiers above its line.
  const segmentTiers = new Map<Entry, Rows>();
  const segmentTier = labelTiers(
    segmentLabels,
    (item) => relativeX(item.at),
    (item) => {
      const line = segmentLine(item.entry);
      if (!segmentTiers.has(line)) segmentTiers.set(line, new Rows());
      return segmentTiers.get(line) as Rows;
    },
  );
  return { boundaries, bounded, labels: segmentLabels, tiers: segmentTiers, tier: segmentTier };
}

/**
 * The reach of every drawn line, the root's segment labels taking the size
 * `rootLabelSize` of the root band above.
 */
export function lineReach(
  scope: Scope,
  maps: MapStacks,
  segments: Segments,
  rootLabelSize: number,
): LineReach {
  const { rootEntry, h } = scope;
  /** The largest label size of a children band: the segment labels on its lines. */
  const childrenBandSize = (side: Side): number =>
    maxSize(
      segments.labels
        .filter((item) => {
          const line = segmentLine(item.entry);
          return line !== rootEntry && line.style.side === side;
        })
        .map((item) => item.label),
    );
  const labelSize = (line: Entry): number =>
    line === rootEntry ? rootLabelSize : childrenBandSize(line.style.side);
  const tick = (line: Entry, side: Side): number =>
    Math.max(maps.reach(line, side), segments.bounded.has(line) ? BOUNDARY : 0);
  const reach = (line: Entry, side: Side): number => {
    const extent = tick(line, side);
    const tiers = side === "above" ? (segments.tiers.get(line)?.count ?? 0) : 0;
    return tiers === 0 ? extent : extent + LABEL_GAP + tiers * h(labelSize(line));
  };
  return { labelSize, tick, reach };
}

/** The boundaries: thin vertical rules `k` to either side of their segment line's line. */
export function boundaryElements(segments: Segments, placed: Position): BreakElement[] {
  const { x, lineY } = placed;
  return segments.boundaries.map((boundary) => {
    const y = lineY(segmentLine(boundary.entry));
    return {
      type: "boundary",
      address: boundary.address,
      style: boundary.style,
      x: x(boundary.entry.start),
      y1: y - BOUNDARY,
      y2: y + BOUNDARY,
    };
  });
}

/** The segment labels, each in its tier above its segment line. */
export function segmentLabelElements(
  scope: Scope,
  segments: Segments,
  reach: LineReach,
  placed: Position,
): TextElement[] {
  const { h, d } = scope;
  const { x, lineY } = placed;
  return segments.labels.map((item) => {
    // Segment labels lie above their line, whichever side of the root the line lies on.
    const line = segmentLine(item.entry);
    const size = reach.labelSize(line);
    const outwards =
      reach.tick(line, "above") + LABEL_GAP + ((segments.tier.get(item) as number) - 1) * h(size);
    return centredLabel(item.label, x(item.at), lineY(line) - outwards - d(size), item);
  });
}
