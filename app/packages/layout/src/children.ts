/**
 * The children band's first fit: each child line placed as a whole, by its
 * extent, into the rows of its parent's children band, and the first pass's
 * preparation of every line of a member drawing (`docs/drawing.md` in
 * TimeToShare, sections 6.3 and 6.4, Children).
 */

import { type Extent, Rows } from "./fit.ts";
import { type PreparedTimeline, prepareTimeline, wholeExtent } from "./timeline.ts";
import type { Entry, Scope } from "./traversal.ts";

/** The first fit of one children band (sections 6.3 and 6.4, Children). */
export interface ChildrenFit {
  /** The row of each child line the band places, from 1. */
  readonly row: ReadonlyMap<Entry, number>;
  /** The number `C` of rows its children fill; 0 for an absent band. */
  readonly count: number;
}

/** One timeline drawn with a line of its own, prepared alone, with its two extents (section 6.4, Children). */
export interface Unplaced {
  /** Its bands with their first fits placed alone (`prepareTimeline`). */
  readonly prepared: PreparedTimeline;
  /**
   * Its extent where bands that are not aligned place it: the smallest interval holding its own
   * extent and the whole extent of every child its children band places, at any depth.
   */
  readonly whole: Extent;
  /**
   * Its extent where aligned bands place it: the smallest interval holding its line's extent and
   * this extent of every child its children band places, at any depth.
   */
  readonly lineOnly: Extent;
}

/** One timeline drawn with a line of its own after the first pass (section 6.4). */
export interface Fitted {
  /** Its bands with their first fits placed: alone, or together in a row of one band order. */
  readonly prepared: PreparedTimeline;
  /**
   * The extent by which its parent's first fit places it (section 6.4, Children), from the root's
   * start: `Unplaced.lineOnly` where aligned bands place it, else `Unplaced.whole`, the root's
   * `whole`. Its band records span it.
   */
  readonly extent: Extent;
  /** Its children band's first fit. */
  readonly fit: ChildrenFit;
}

/**
 * The first fit of a children band (section 6.4, Children): the child lines
 * `lines`, in the order `PreparedTimeline.children` gives them, each placed
 * as a whole by its extent `extentOf` into the lowest row holding no child
 * whose extent conflicts with it (section 6.3). Each band fills its own rows,
 * from 1, whatever the rows of its timeline's parent.
 */
export function fitChildren(
  lines: readonly Entry[],
  extentOf: (line: Entry) => Extent,
): ChildrenFit {
  const rows = new Rows();
  const row = new Map(lines.map((line) => [line, rows.place(extentOf(line))]));
  return { row, count: rows.count };
}

/**
 * Every timeline of a member drawing drawn with a line of its own, from the
 * root down through `PreparedTimeline.children`, prepared alone
 * (`prepareTimeline`), and, from the deepest up, its two extents
 * (`wholeExtent`). Keyed by each line's entry, the root's included; uses no
 * distance.
 */
export function prepareTimelines(scope: Scope): ReadonlyMap<Entry, Unplaced> {
  const lines = new Map<Entry, Unplaced>();
  const visit = (line: Entry): Unplaced => {
    const prepared = prepareTimeline(scope, line);
    const children = prepared.children.map(visit);
    const result: Unplaced = {
      prepared,
      whole: wholeExtent(
        prepared.extent,
        children.map((child) => child.whole),
      ),
      lineOnly: wholeExtent(
        prepared.lineExtent,
        children.map((child) => child.lineOnly),
      ),
    };
    lines.set(line, result);
    return result;
  };
  visit(scope.rootEntry);
  return lines;
}
