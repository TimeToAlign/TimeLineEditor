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
import { type Extent, labelExtent, labelTiers, Rows } from "./fit.ts";
import { centredLabel } from "./names.ts";
import { midpoint } from "./numbers.ts";
import { type Entry, endOf, known, maxSize, type Scope, shown } from "./traversal.ts";

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
 * Level 0 of the timeline drawn with the line `line` (sections 6.1, 6.4 and
 * 6.6): its segments are its children when it is a segment line, every one
 * of them, with a line of its own or not; their labels are placed by one
 * first fit, in canonical order, into the segment-label tiers above the
 * line. A segment's boundary and label are held by its segment line,
 * directly and in no band (section 2.1), and drawn only with that line.
 */
export function levelZero(scope: Scope, line: Entry): LevelZero {
  const { index, rootEntry, member, styled, measured, relativeX, relativeEnd, u, h, d } = scope;
  const drawn = shown(line.style);
  const segments =
    drawn && line.manifest.is_segment_line
      ? (index.childrenByParent.get(line.manifest.id) ?? [])
      : [];
  const part = (segment: Entry, word: "start" | "label") =>
    styled(
      elementKey(
        word === "start" ? "boundary" : "label",
        partAddress(idAddress(segment.manifest.id), word),
        segment.manifest,
        line.key,
      ),
      line.style,
    );
  const boundaries = segments
    .filter((segment) => !segment.first)
    .map((segment) => ({ segment, ...part(segment, "start") }))
    .filter((boundary) => shown(boundary.style));
  const bounded = boundaries.length > 0;
  const labels = segments.flatMap((segment) => {
    const text = segment.manifest.name;
    const label = part(segment, "label");
    if (text === null || !shown(label.style)) return [];
    return [{ segment, label, ...measured(label, text), at: midpoint(segment.start, segment.end) }];
  });
  const tiers = new Rows();
  const tier = labelTiers(labels, (item) => relativeX(item.at), tiers);
  const size = maxSize(labels.map((item) => item.label));
  const w = line.style["stroke-width"];
  const end = relativeEnd(line);
  const m = (against: number) => Math.max(against, bounded ? BOUNDARY : 0);

  return {
    extents: [
      [relativeX(line.start), line.open ? end + 9.5 * w : end],
      ...labels.map((item) => labelExtent(relativeX(item.at), item.width)),
    ],
    centred: labels.map((item) => ({ width: item.width, u: u(item.at) })),
    reach: (side, against) => {
      if (side === "below" || tiers.count === 0) return m(against);
      return m(against) + LABEL_GAP + tiers.count * h(size);
    },
    draw: (at, against) => ({
      line: !drawn
        ? []
        : [
            {
              type: line === rootEntry ? "timeline" : "child",
              address: line.key.address,
              style: line.style,
              xs: at.x(line.start),
              xe: line.open ? at.xEnd(line) + 4 * w : at.xEnd(line),
              y: at.y,
              start: "circle",
              end: endOf(
                line.manifest,
                line === rootEntry && member.ancestors.length === 0,
                line.open,
              ),
            },
          ],
      boundaries: boundaries.map(({ segment, address, style }) => ({
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
      segmentLabels: labels.map((item) => {
        const outwards = m(against) + LABEL_GAP + (known(tier, item) - 1) * h(size);
        return {
          segment: item.segment,
          element: centredLabel(item.label, at.x(item.at), at.y - outwards - d(size), item),
        };
      }),
    }),
  };
}
