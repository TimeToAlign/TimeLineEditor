/**
 * Level 0 of a timeline (`docs/drawing.md` in TimeToShare, sections 6.4,
 * Level 0 and Segment lines, and 6.6): its line, the boundaries and labels of
 * its segments, which belong to the line and to no band, and how far the
 * line reaches on each side.
 */

import { idAddress, partAddress } from "@timetoalign/tilie-core";
import { elementKey } from "@timetoalign/tilie-core/drawing";
import type { Centred, LineElements, LinePosition, Side } from "./bands.ts";
import { BOUNDARY, LABEL_GAP } from "./constants.ts";
import type { LineElement } from "./elements.ts";
import { type Extent, labelExtent, labelTiers, Rows } from "./fit.ts";
import { centredLabel } from "./names.ts";
import { midpoint } from "./numbers.ts";
import { type Entry, endOf, known, maxSize, nth, type Scope, shown } from "./traversal.ts";

/** A timeline's line and its segments' boundaries and labels, before any distance is known. */
export interface LevelZero {
  /**
   * What level 0 adds to its timeline's extent (section 6.4, Children), measured from the root's
   * start: the line's own extent, from `L × u` of its start to `L × u` of its end, or for an open
   * end to `L × u + 9.5w` (summed as written, `w` its stroke width); and the extent of each drawn
   * segment label (section 6.3).
   */
  readonly extents: readonly Extent[];
  /** Its drawn segment labels, each centred on its segment's midpoint (section 6.7). */
  readonly centred: readonly Centred[];
  /**
   * How far the line reaches on `side` (section 6.4, Level 0 and Segment lines), `against` the
   * width of the band lying against the line on that side and sharing its room: the conversion
   * maps band at level 1 or −1 (the line's map stack, reaching `e`), or above the markers band at
   * level 1, else 0. Above, `m` (the larger of `against` and, with a drawn boundary, `k`) plus `2
   * + T × h(9)` when its segment labels fill `T ≥ 1` tiers (9 standing for their largest font
   * size, section 6.2), and `m` when they fill none; below, the larger of `against` and, with a
   * drawn boundary, `k`. A line that is not displayed draws no boundary and no segment label.
   */
  reach(side: Side, against: number): number;
  /**
   * Its elements at `at` (section 6.6), `against` as for `reach` above: its line, when displayed
   * (a `timeline` element for the root of the member drawing, ending as section 6.6 says for a
   * top-level timeline or a child, else a `child` ending in its diamond, either running on into
   * three chevrons where its end is open); its segments' boundaries, `k` to either side of the
   * line at `x` of each segment's start but the first's; its segments' labels, tier `n` with its
   * baseline at `y − (m + 2 + (n − 1) × h(9)) − d(9)`, each distance summed whole first (section
   * 3.3).
   */
  draw(at: LinePosition, against: number): Partial<LineElements>;
}

/**
 * The segment-label tiers of a line (section 6.4, Segment lines): the tier of
 * each of its segment labels, from 1, the number of tiers, whether the
 * distance `m` counts `k`, and the largest font size of the labels. Its own
 * first fit alone, or for the segment lines of a row of one band order one
 * first fit over all of them, with one `m` and one count.
 */
export interface SegmentTiers {
  readonly tier: readonly number[];
  readonly count: number;
  readonly bounded: boolean;
  readonly size: number;
}

/**
 * Level 0 of a timeline before its segment labels are tiered: its line's
 * extent, each label's centre and width, in canonical order; whether its line draws a boundary;
 * the largest font size of its labels; whether it is a displayed segment
 * line; and level 0 once its labels lie in `tiers`.
 */
export interface StagedZero {
  /**
   * The line's own extent (section 6.4, Children), from `L × u` of its start to `L × u` of its
   * end, or for an open end to `L × u + 9.5w`, summed as written, `w` its stroke width.
   */
  readonly lineExtent: Extent;
  readonly labels: readonly { readonly x: number; readonly width: number }[];
  readonly bounded: boolean;
  readonly size: number;
  readonly segmentLine: boolean;
  zero(tiers: SegmentTiers): LevelZero;
}

/** The segment-label tiers of `staged` by its own first fit alone (`labelTiers`). */
export function ownTiers(staged: StagedZero): SegmentTiers {
  const rows = new Rows();
  const tiers = labelTiers(staged.labels, (label) => label.x, rows);
  return {
    tier: staged.labels.map((label) => known(tiers, label)),
    count: rows.count,
    bounded: staged.bounded,
    size: staged.size,
  };
}

/**
 * Level 0 of the timeline drawn with the line `line` (sections 6.1, 6.4 and
 * 6.6): its segments are its children when it is a segment line, every one
 * of them, with a line of its own or not; their labels are placed by one
 * first fit, in canonical order, into the segment-label tiers above the
 * line. A segment's boundary and label are held by its segment line,
 * directly and in no band (section 2.1), and drawn only with that line.
 */
export function levelZero(scope: Scope, line: Entry): StagedZero {
  const { index, rootEntry, member, styled, measured, relativeX, relativeEnd, h, d } = scope;
  const drawn = shown(line.style);
  const segments =
    drawn && line.manifest.is_segment_line
      ? (index.childrenByParent.get(line.manifest.id) ?? [])
      : [];
  const part = (segment: Entry, word: "start" | "label") => {
    const key = elementKey(
      word === "start" ? "boundary" : "label",
      partAddress(idAddress(segment.manifest.id), word),
      segment.manifest,
      line.key,
    );
    return { ...styled(key, line.style), key };
  };
  const boundaries = segments
    .filter((segment) => !segment.first)
    .map((segment) => ({ segment, ...part(segment, "start") }))
    .filter((boundary) => shown(boundary.style));
  const bounded = boundaries.length > 0;
  const labels = segments.flatMap((segment) => {
    const text = segment.manifest.name;
    const label = part(segment, "label");
    if (text === null || !shown(label.style)) return [];
    return [
      {
        segment,
        label,
        ...measured(label, text),
        at: midpoint(segment.start, segment.end),
      },
    ];
  });
  const w = line.style["stroke-width"];
  const end = relativeEnd(line);
  const lineExtent: Extent = [relativeX(line.start), line.open ? end + 9.5 * w : end];

  return {
    lineExtent,
    labels: labels.map((item) => ({ x: relativeX(item.at), width: item.width })),
    bounded,
    size: maxSize(labels.map((item) => item.label)),
    segmentLine: drawn && line.manifest.is_segment_line,
    zero: placedZero,
  };

  function placedZero(placed: SegmentTiers): LevelZero {
    const { count, size } = placed;
    const tier = new Map(labels.map((item, index) => [item, nth(placed.tier, index)]));
    const m = (against: number) => Math.max(against, placed.bounded ? BOUNDARY : 0);

    return {
      extents: [lineExtent, ...labels.map((item) => labelExtent(relativeX(item.at), item.width))],
      centred: labels.flatMap((item) => {
        const x = scope.drawnX(item.at);
        return x === undefined ? [] : [{ width: item.width, x }];
      }),
      reach: (side, against) => {
        if (side === "below" || count === 0) return m(against);
        return m(against) + LABEL_GAP + count * h(size);
      },
      draw: (at, against) => ({
        line: drawn ? drawnLine(at) : [],
        boundaries: boundaries
          .filter(({ segment }) => at.gap(segment.start) === undefined)
          .map(({ segment, address, style }) => ({
            segment,
            element: {
              type: "boundary",
              address,
              style,
              x: at.x(segment.start),
              y1: at.y - BOUNDARY,
              y2: at.y + BOUNDARY,
            },
          })),
        segmentLabels: labels
          .filter((item) => at.gap(item.at) === undefined)
          .map((item) => {
            const outwards = m(against) + LABEL_GAP + (known(tier, item) - 1) * h(size);
            return {
              segment: item.segment,
              element: centredLabel(item.label, at.x(item.at), at.y - outwards - d(size), item),
            };
          }),
        // A label beyond its first tier is joined to the line by its leader (section 6.6, Leaders).
        segmentLeaders: labels
          .filter((item) => known(tier, item) > 1 && at.gap(item.at) === undefined)
          // Only a label beyond its first tier has a leader to cascade.
          .map((item) => ({ item, leader: scope.leaderOf(item.label) }))
          .filter(({ leader }) => shown(leader.style))
          .map(({ item, leader }) => {
            const x = at.x(item.at);
            const outwards = m(against) + LABEL_GAP + (known(tier, item) - 1) * h(size);
            return {
              segment: item.segment,
              element: {
                type: "leader",
                ...leader,
                x1: x,
                y1: at.y - m(against),
                x2: x,
                y2: at.y - outwards,
              },
            };
          }),
      }),
    };
  }

  /**
   * The line at `at`: from `Xs`, or from the right edge of the gap its start lies in, without
   * its circle; to its end mark past `Xe`, or to the left edge of the gap its end lies in,
   * without a mark; none where those meet or cross; cut at every gap it crosses (section 6.6,
   * Elisions).
   */
  function drawnLine(at: LinePosition): LineElement[] {
    const first = at.gap(line.start);
    const last = line.rootEnd ? undefined : at.gap(line.end);
    const xs = first === undefined ? at.x(line.start) : first[1];
    const xEnd = last === undefined ? at.xEnd(line) : last[0];
    if ((first !== undefined || last !== undefined) && xs >= xEnd) return [];
    const end =
      last === undefined
        ? endOf(line.manifest, line === rootEntry && member.ancestors.length === 0, line.open)
        : "none";
    return [
      {
        type: line === rootEntry ? "timeline" : "child",
        address: line.key.address,
        style: line.style,
        xs,
        xe: end === "unknown" ? xEnd + 4 * w : xEnd,
        y: at.y,
        start: first === undefined ? "circle" : "none",
        end,
        cuts: at.cuts(line.start, line.rootEnd ? null : line.end),
      },
    ];
  }
}
