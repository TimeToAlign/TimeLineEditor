/**
 * The conversion maps band: a timeline's displayed maps and those of the
 * segments that join it, stacked outwards from its start
 * (`docs/drawing.md` in timeskeleton, sections 6.4 and 6.6).
 */

import { bandAddress } from "@timetoalign/tilie-core";
import type { PreparedBand } from "./bands.ts";
import { MAP_GAP, MAP_SPACING } from "./constants.ts";
import { type Entry, type Scope, shown } from "./traversal.ts";

/**
 * The conversion maps band of the timeline drawn with the line `line`
 * (section 6.4, Conversion maps and Segments without a line): the displayed
 * maps of each timeline of `sources`, the line first and then each joined
 * segment, each one's in canonical order. `J` maps are `e = w / 2 + J × (g + d)` wide, `w` the line's
 * stroke width; drawn from its start `c`, map `j` (from 1) is centred `c + w
 * / 2 + j × (g + d) − d / 2` out from the line, summed in that order, and
 * spans its own timeline, from `Xs` to `Xe` (a segment's map its segment).
 * Maps are no first-fit items: the band adds no extent.
 */
export function conversionMapsBand(
  scope: Scope,
  line: Entry,
  sources: readonly Entry[],
): PreparedBand {
  const { address, owned } = scope;
  const maps = sources.flatMap((source) =>
    shown(source.bands.conversion_maps.style)
      ? source.manifest.conversion_maps
          .map((map) => owned("map", address(map.id), source, "conversion_maps", map))
          .filter((map) => shown(map.style))
      : [],
  );
  const w = line.style["stroke-width"];
  return {
    kind: "conversion_maps",
    address: bandAddress(line.manifest.id, "conversion_maps"),
    elements: maps.length,
    width: maps.length === 0 ? 0 : w / 2 + maps.length * (MAP_GAP + MAP_SPACING),
    extents: [],
    centred: [],
    draw: (start, side, at) => ({
      maps: maps.map((map, index) => ({
        type: "map",
        address: map.address,
        style: map.style,
        xs: at.x(map.entry.start),
        xe: at.xEnd(map.entry),
        yc: at.yAt(side, start + w / 2 + (index + 1) * (MAP_GAP + MAP_SPACING) - MAP_SPACING / 2),
        spacing: MAP_SPACING,
      })),
    }),
  };
}
