/**
 * The slots of the conversion maps bands of a member drawing
 * (`docs/drawing.md` in TimeToShare, section 6.4, Conversion maps): the
 * present conversion maps bands of the lines of one row that lie on one side
 * of those lines at one level share one sequence of slots, those whose
 * line's children band lies nearer the line apart from the others. Found in
 * the
 * first pass, from the rows alone: which lines form a row is an input, so a
 * rule that decides rows otherwise leaves this module as it is.
 */

import type { Side } from "./bands.ts";
import type { Fitted } from "./children.ts";
import { MAP_GAP, MAP_SPACING } from "./constants.ts";
import { mapSlots, type Slots } from "./maps.ts";
import { type Row, rowsBelow } from "./rows.ts";
import type { PreparedTimeline } from "./timeline.ts";
import { type Entry, known, nth } from "./traversal.ts";

/** The level of the conversion maps band of `prepared`, signed; it is present on its side. */
function mapsLevel(prepared: PreparedTimeline): { side: Side; level: number } {
  const side = prepared.sides.conversion_maps;
  const level = prepared.levels[side].indexOf("conversion_maps") + 1;
  return { side, level: side === "above" ? level : -level };
}

/**
 * The slots of the conversion maps bands of `lines` (in traversal order),
 * each present, on one side at one level: their maps taken line by line
 * (`PreparedTimeline.maps`) and given their slots (`mapSlots`), `w` the
 * largest stroke width of their lines, each band `e = w / 2 + J × (g + d)`
 * wide.
 */
export function slotsOf(lines: readonly PreparedTimeline[]): Slots {
  const { side, level } = mapsLevel(nth(lines, 0));
  const { slot, J } = mapSlots(lines.flatMap((line) => line.maps));
  const w = Math.max(...lines.map((line) => line.line.style["stroke-width"]));
  return {
    side,
    level,
    lines: lines.map((line) => line.line),
    slot,
    J,
    w,
    width: w / 2 + J * (MAP_GAP + MAP_SPACING),
  };
}

/**
 * The slots of every present conversion maps band of a member drawing whose
 * root's row is `rootRow`, after the first pass `fitted`, by its line: for
 * every row (`rowsBelow`), the bands of its lines grouped by side and level
 * and, within those, by whether their line's children band lies on that
 * side nearer the line, so that no maps band's start waits on itself through
 * the children bands of the row (section 6.4, Where a band lies, The order of
 * the starts); each group laid out together (`slotsOf`). Reads only the lines
 * of each row and their prepared bands.
 */
export function rowSlots(rootRow: Row, fitted: ReadonlyMap<Entry, Fitted>): Map<Entry, Slots> {
  const slots = new Map<Entry, Slots>();
  for (const row of rowsBelow(rootRow)) {
    const groups = new Map<string, PreparedTimeline[]>();
    for (const line of row.lines) {
      const { prepared } = known(fitted, line);
      // A band is present where it holds a map, or in a row of one band order where another does.
      if (!prepared.levels[prepared.sides.conversion_maps].includes("conversion_maps")) continue;
      const { side, level } = mapsLevel(prepared);
      const outwards = prepared.levels[side];
      const children = outwards.indexOf("children");
      const nearer = children !== -1 && children < outwards.indexOf("conversion_maps");
      const key = `${level} ${nearer}`;
      const group = groups.get(key);
      if (group === undefined) groups.set(key, [prepared]);
      else group.push(prepared);
    }
    for (const group of groups.values()) {
      const shared = slotsOf(group);
      for (const line of shared.lines) slots.set(line, shared);
    }
  }
  return slots;
}
