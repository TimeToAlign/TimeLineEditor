/**
 * The children band's first fit: each child line placed as a whole, by the
 * extent of its whole drawing, into the rows of its parent's children band,
 * and the first pass over a member drawing (`docs/drawing.md` in
 * timeskeleton, sections 6.3 and 6.4, Children).
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

/** One timeline drawn with a line of its own after the first pass (section 6.4). */
export interface Fitted {
  readonly prepared: PreparedTimeline;
  /**
   * Its extent (section 6.4, Children), from the root's start: the smallest interval holding its
   * own extent and the extent of every child its children band places, at any depth
   * (`wholeExtent`). Its parent's first fit places it by this, and its band records span it.
   */
  readonly extent: Extent;
  /** Its children band's first fit. */
  readonly fit: ChildrenFit;
}

/**
 * The first fit of a children band (section 6.4, Children): the child lines
 * `lines`, in the order `PreparedTimeline.children` gives them, each placed
 * as a whole by its extent from `extents` into the lowest row holding no
 * child whose extent conflicts with it (section 6.3). Each band fills its
 * own rows, from 1, whatever the rows of its timeline's parent.
 */
export function fitChildren(
  lines: readonly Entry[],
  extents: ReadonlyMap<Entry, Extent>,
): ChildrenFit {
  const rows = new Rows();
  const row = new Map(lines.map((line) => [line, rows.place(extents.get(line) as Extent)]));
  return { row, count: rows.count };
}

/**
 * The first pass of a member drawing (section 6.4): every timeline drawn with
 * a line of its own, from the root down through `PreparedTimeline.children`,
 * prepared (`prepareTimeline`), then, from the deepest up, its extent
 * (`wholeExtent` of its own extent and its children's) and its children
 * band's first fit (`fitChildren`). Keyed by each line's entry, the root's
 * included; uses no distance.
 */
export function fitTimelines(scope: Scope): ReadonlyMap<Entry, Fitted> {
  const fitted = new Map<Entry, Fitted>();
  const visit = (line: Entry): Fitted => {
    const prepared = prepareTimeline(scope, line);
    const children = prepared.children.map(visit);
    const extents = new Map(children.map((child) => [child.prepared.line, child.extent]));
    const result: Fitted = {
      prepared,
      extent: wholeExtent(
        prepared.extent,
        children.map((child) => child.extent),
      ),
      fit: fitChildren(prepared.children, extents),
    };
    fitted.set(line, result);
    return result;
  };
  visit(scope.rootEntry);
  return fitted;
}
