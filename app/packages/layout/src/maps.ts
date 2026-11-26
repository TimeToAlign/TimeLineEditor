/**
 * The conversion maps band: a timeline's displayed maps and those of the
 * segments that join it, each in the slot that the bands of its row, side
 * and level share (`docs/drawing.md` in TimeToShare, sections 6.4 and 6.6).
 */

import { compareCodePoints, idAddress } from "@timetoalign/tilie-core";
import type { LineElements, LinePosition, PreparedBand, Side } from "./bands.ts";
import { MAP_GAP, MAP_SPACING } from "./constants.ts";
import type { MapElement } from "./elements.ts";
import { type Extent, Rows } from "./fit.ts";
import { type Entry, type Holder, nth, type Scope, type Styled, shown } from "./traversal.ts";

/** One displayed map of a conversion maps band, before any slot or distance is known. */
export interface MapMember {
  readonly map: Styled & Holder;
  /** The timeline it spans: the band's own, or a segment without a line that joins it. */
  readonly entry: Entry;
  /** The extent of that timeline, from `L × u` of its start to its end (sections 3.4 and 6.3). */
  readonly extent: Extent;
  /** Its `name`, part of its key when not null. */
  readonly name: string | null;
  /** Its `type`, the rest of its key. */
  readonly type: string;
}

/**
 * The slots shared by the present conversion maps bands of the lines of one
 * row that lie on one side of those lines at one level (section 6.4,
 * Conversion maps): what every band of the set needs besides its start.
 */
export interface Slots {
  /** The side of their lines the bands lie on. */
  readonly side: Side;
  /** Their level: signed, 1, 2, … above, −1, −2, … below. */
  readonly level: number;
  /** The lines whose bands share the slots, in traversal order. */
  readonly lines: readonly Entry[];
  /** The slot of each of their maps, from 1. */
  readonly slot: ReadonlyMap<MapMember, number>;
  /** The number `J` of slots. */
  readonly J: number;
  /** `w`, the largest stroke width of their lines. */
  readonly w: number;
  /** The width `e = w / 2 + J × (g + d)` of each of the bands. */
  readonly width: number;
}

/**
 * The maps of the conversion maps band of a line whose bands draw `sources`
 * (section 6.4, Conversion maps and Segments without a line), in the order
 * they are taken: the displayed maps of each of `sources`, the line first
 * and then each joined segment, each one's in canonical order, each with the
 * extent of the timeline it spans. A map adds nothing to its line's extent.
 * None on a switched card (section 8.10).
 */
export function mapMembers(scope: Scope, sources: readonly Entry[]): MapMember[] {
  const { mapped, relativeX, relativeEnd } = scope;
  // A switched card has no conversion maps band: a map has no form per piece (section 8.10).
  if (scope.unfolding !== null) return [];
  return sources.flatMap((source) =>
    shown(source.bands.conversion_maps.style)
      ? source.manifest.conversion_maps.flatMap((map) => {
          const styled = mapped(idAddress(map.id), source, map);
          if (!shown(styled.style)) return [];
          const extent: Extent = [relativeX(source.start), relativeEnd(source)];
          return [{ map: styled, entry: source, extent, name: map.name ?? null, type: map.type }];
        })
      : [],
  );
}

/**
 * Keys in their order (section 6.4, Conversion maps): those with a name by
 * name, then by type, those without after them, by type, comparing Unicode
 * code points.
 */
function compareKeys(left: MapMember, right: MapMember): number {
  if (left.name !== null && right.name !== null) {
    return compareCodePoints(left.name, right.name) || compareCodePoints(left.type, right.type);
  }
  if (left.name !== null) return -1;
  if (right.name !== null) return 1;
  return compareCodePoints(left.type, right.type);
}

/**
 * The slots of `members`, the maps of the bands laid out together in the
 * order they are taken (section 6.4, Conversion maps): the maps of each key,
 * in that order, placed by first fit (section 6.3) with their extents into
 * that key's sub-slots; the sub-slots of the keys, in key order, are the
 * slots 1 to `J`.
 */
export function mapSlots(members: readonly MapMember[]): {
  readonly slot: ReadonlyMap<MapMember, number>;
  readonly J: number;
} {
  const keys: MapMember[][] = [];
  for (const member of members) {
    const key = keys.find((group) => compareKeys(nth(group, 0), member) === 0);
    if (key === undefined) keys.push([member]);
    else key.push(member);
  }
  keys.sort((left, right) => compareKeys(nth(left, 0), nth(right, 0)));
  const slot = new Map<MapMember, number>();
  let J = 0;
  for (const key of keys) {
    const rows = new Rows();
    for (const member of key) slot.set(member, J + rows.place(member.extent));
    J += rows.count;
  }
  return { slot, J };
}

/**
 * The conversion maps band of a line holding `members` (section 6.4): its
 * width and start come from its slots, so prepared it has none, and its maps
 * are drawn by `drawMaps`.
 */
export function conversionMapsBand(members: readonly MapMember[]): PreparedBand {
  return {
    facet: "conversion_maps",
    elements: members.length,
    width: 0,
    extents: [],
    centred: [],
    draw: () => ({}),
  };
}

/**
 * The maps of a conversion maps band starting at `start` outwards on `side`
 * of the line placed at `at`, in the order they are taken (section 6.4,
 * Conversion maps): the map in slot `j` centred `c + w / 2 + j × (g + d) −
 * d / 2` out from the line, summed in that order, `w` the slots' largest
 * stroke width, spanning its own timeline from `Xs` to `Xe`. A map whose
 * start lies in a gap starts at the gap's right edge, one whose end does
 * ends at its left edge, and one whose start and end so meet or cross is not
 * drawn (section 6.6, Elisions).
 */
export function drawMaps(
  members: readonly MapMember[],
  slots: Slots,
  start: number,
  side: Side,
  at: LinePosition,
): Pick<LineElements, "maps"> {
  const { w } = slots;
  return {
    maps: members.flatMap((member): MapElement[] => {
      const j = slots.slot.get(member);
      if (j === undefined) throw new Error("a map is drawn without its slot");
      const { entry } = member;
      const first = at.gap(entry.start);
      const last = entry.rootEnd ? undefined : at.gap(entry.end);
      const xs = first === undefined ? at.x(entry.start) : first[1];
      const xe = last === undefined ? at.xEnd(entry) : last[0];
      if ((first !== undefined || last !== undefined) && xs >= xe) return [];
      return [
        {
          type: "map",
          address: member.map.address,
          style: member.map.style,
          xs,
          xe,
          yc: at.yAt(side, start + w / 2 + j * (MAP_GAP + MAP_SPACING) - MAP_SPACING / 2),
          spacing: MAP_SPACING,
          cuts: at.cuts(entry.start, entry.rootEnd ? null : entry.end),
        },
      ];
    }),
  };
}
