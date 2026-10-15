/**
 * Map stacks: each line's displayed maps, lying against it on either side
 * (`docs/drawing.md` in timeskeleton, sections 6.4 and 6.6).
 */

import type { Position } from "./canvas.ts";
import type { Side } from "./cascade.ts";
import { MAP_GAP, MAP_SPACING } from "./constants.ts";
import type { MapElement } from "./elements.ts";
import { type Entry, type Owned, type Scope, shown } from "./traversal.ts";

export interface MapStacks {
  /** The drawn maps, in traversal order and each timeline's in canonical order. */
  readonly drawn: readonly Owned[];
  /** Each line's stack on each side; a segment's maps join its segment line's. */
  readonly stacks: ReadonlyMap<Entry, Record<Side, Owned[]>>;
  /** The reach `e = w / 2 + J × (g + d)` of a line's map stack on a side, 0 when empty. */
  readonly reach: (line: Entry, side: Side) => number;
}

export function mapStacks(scope: Scope): MapStacks {
  const { entries, address, owned } = scope;
  const maps: Owned[] = [];
  for (const entry of entries) {
    for (const map of entry.manifest.conversion_maps) {
      maps.push(owned("map", address(map.id), entry, map));
    }
  }
  // A map is drawn only when its timeline's line is drawn; a segment's joins its segment line's stack.
  const drawnMaps = maps.filter((map) => shown(map.style) && shown(map.entry.holder.style));
  const stacks = new Map<Entry, Record<Side, Owned[]>>();
  for (const map of drawnMaps) {
    const line = map.entry.holder;
    if (!stacks.has(line)) stacks.set(line, { above: [], below: [] });
    (stacks.get(line) as Record<Side, Owned[]>)[map.side].push(map);
  }
  const reach = (line: Entry, side: Side): number => {
    const count = stacks.get(line)?.[side].length ?? 0;
    return count === 0 ? 0 : line.style["stroke-width"] / 2 + count * (MAP_GAP + MAP_SPACING);
  };
  return { drawn: drawnMaps, stacks, reach };
}

/** The maps' closed double lines, map `j` of a stack centred `w / 2 + j × (g + d) − d / 2` from its line. */
export function mapElements(maps: MapStacks, placed: Position): MapElement[] {
  const { x, xEnd, lineY } = placed;
  return maps.drawn.map((map) => {
    const { entry, side } = map;
    const line = entry.holder;
    const j = (maps.stacks.get(line) as Record<Side, Owned[]>)[side].indexOf(map) + 1;
    const centre = line.style["stroke-width"] / 2 + j * (MAP_GAP + MAP_SPACING) - MAP_SPACING / 2;
    const y = lineY(line);
    return {
      type: "map",
      address: map.address,
      style: map.style,
      xs: x(entry.start),
      xe: xEnd(entry),
      yc: side === "above" ? y - centre : y + centre,
    };
  });
}
