/**
 * The rows of a member drawing (`docs/drawing.md` in timeskeleton, sections
 * 6.2 and 6.4, Children): the root's row, and the rows of the children bands
 * of each row's lines on one side, laid out together, at every depth. Holds
 * the second pass from the deepest rows up and places every line in the
 * third, from the root's line down.
 */

import { opposite, type Side } from "./bands.ts";
import type { Fitted } from "./children.ts";
import { lineNames } from "./names.ts";
import {
  childrenStart,
  type LaidChildren,
  type LinePlace,
  layoutTimeline,
  type TimelineDrawing,
} from "./timeline.ts";
import { type Entry, known, nth, rowPitch, type Scope } from "./traversal.ts";

/**
 * A row of lines at one ordinate (section 6.4, Children): the root's row, or
 * row `k` of children bands laid out together, which holds every child that
 * any of them places in its row `k`.
 */
export interface Row {
  /** Its lines in traversal order. */
  readonly lines: readonly Entry[];
  /**
   * Its name size `s` (section 6.2): the root's name font size for the root's row, else that of
   * the children bands laid out together whose row it is.
   */
  readonly size: number;
  /** Its pitch: `p0 = max(14 × v, h(s))` for the root's row, else the pitch `p` of its joint layout. */
  readonly pitch: number;
  /**
   * The present children bands of its lines on each side, laid out together; `undefined` for a
   * side where none of its lines has a present children band.
   */
  readonly joints: Readonly<Record<Side, Joint | undefined>>;
}

/**
 * The present children bands of the lines of one row that lie on one side of
 * those lines, laid out together (section 6.4, Children), also when there is
 * only one.
 */
export interface Joint {
  /** The side of their lines they lie on: the side of their rows' outer halves. */
  readonly side: Side;
  /** The lines of the row whose children band it lays out, in traversal order. */
  readonly lines: readonly Entry[];
  /** Its rows, row `k` at index `k − 1`: every child that any of its bands places in its row `k`. */
  readonly rows: readonly Row[];
  /**
   * Its name size `s` (section 6.2): the largest font size of the names of the lines of its rows,
   * displayed or not, a row of segment lines alone counting its first line's.
   */
  readonly size: number;
  /** Its pitch `p = max(14 × v, h(s))`, the pitch of each of its rows. */
  readonly pitch: number;
}

/** A timeline's drawing with its line placed (section 6.4, the third pass). */
export interface PlacedLine {
  readonly drawing: TimelineDrawing;
  readonly place: LinePlace;
  /** The row its line lies in. */
  readonly row: Row;
}

const SIDES = ["above", "below"] as const;

/**
 * The name size a row counts (section 6.2): the largest font size of the
 * names its lines give it (`lineNames`), displayed or not; a row whose lines
 * contribute no name, segment lines alone, counts its first line's.
 */
function countedSize(lines: readonly Entry[]): number {
  const named = lineNames(lines).map((item) => item.name);
  const counted = named.length === 0 ? [nth(lines, 0).name] : named;
  return Math.max(...counted.map((name) => name.style["font-size"]));
}

/**
 * The first pass's rows (section 6.4, Children): the root's row of the
 * member drawing and, top-down, every joint layout below it, with every
 * row's name size and pitch, from the first fits of `fitted` alone.
 */
export function rowsOf(scope: Scope, fitted: ReadonlyMap<Entry, Fitted>): Row {
  /** The joint of the lines of a row whose present children band lies on `side`. */
  const jointOf = (lines: readonly Entry[], side: Side): Joint | undefined => {
    const holding = lines.filter((line) => {
      const { prepared, fit } = known(fitted, line);
      return fit.count > 0 && prepared.sides.children === side;
    });
    if (holding.length === 0) return undefined;
    // Row k holds every child that any of the bands places in its row k.
    const rowLines: Entry[][] = [];
    for (const line of holding) {
      for (const [child, row] of known(fitted, line).fit.row) {
        while (rowLines.length < row) rowLines.push([]);
        nth(rowLines, row - 1).push(child);
      }
    }
    for (const children of rowLines) children.sort(scope.byTraversal);
    const size = Math.max(...rowLines.map(countedSize));
    const pitch = rowPitch(scope, size);
    return {
      side,
      lines: holding,
      rows: rowLines.map((children) => rowOf(children, size, pitch)),
      size,
      pitch,
    };
  };
  const rowOf = (lines: readonly Entry[], size: number, pitch: number): Row => ({
    lines,
    size,
    pitch,
    joints: { above: jointOf(lines, "above"), below: jointOf(lines, "below") },
  });
  // The root's row counts on its own: its pitch `p0` takes the root's name size alone.
  const size = scope.rootEntry.name.style["font-size"];
  return rowOf([scope.rootEntry], size, rowPitch(scope, size));
}

/**
 * The second pass for the lines of `row` (section 6.4, Children: "the
 * distances, from the deepest rows up"): for each side, the joint layout of
 * its lines' children bands (`layoutChildren`), which first lays out its own
 * rows, then each line of `row` laid out by `layoutTimeline` with its
 * children band. Keyed by the row's lines, each drawing holding its subtree.
 */
export function layoutRow(
  row: Row,
  fitted: ReadonlyMap<Entry, Fitted>,
): ReadonlyMap<Entry, TimelineDrawing> {
  const laid = new Map<Entry, LaidChildren>();
  for (const side of SIDES) {
    const joint = row.joints[side];
    if (joint === undefined) continue;
    const drawings = new Map<Entry, TimelineDrawing>();
    for (const jointRow of joint.rows) {
      for (const [line, drawing] of layoutRow(jointRow, fitted)) drawings.set(line, drawing);
    }
    for (const [line, children] of layoutChildren(joint, row.pitch, fitted, drawings)) {
      laid.set(line, children);
    }
  }
  return new Map(
    row.lines.map((line) => [line, layoutTimeline(known(fitted, line).prepared, laid.get(line))]),
  );
}

/**
 * The children bands of `joint` laid out together (section 6.4, Children),
 * `pl` the pitch of the row whose lines hold them, each row of `joint`
 * already laid out (`layoutRow`, its lines' drawings in `drawings`):
 *
 * - `c0`, the largest of the bands' own starts (`childrenStart` with `pl`);
 * - row `k`'s inner half `ik` and outer half `ok`, each the larger of `p /
 *   2` and the largest edge of row `k`'s children on that half's side,
 *   whichever band places them, `p` the joint's pitch; the outer half's side
 *   is `joint.side`, the inner half's the opposite one;
 * - `l1 = c0 + i1` and `l(k + 1) = lk + (ok + i(k + 1))`;
 * - each band `i1 + o1 + … + iC + oC` wide, summed left to right over its
 *   own `C` rows.
 *
 * Keyed by the lines of `joint`, each band with the children it places.
 */
export function layoutChildren(
  joint: Joint,
  pl: number,
  fitted: ReadonlyMap<Entry, Fitted>,
  drawings: ReadonlyMap<Entry, TimelineDrawing>,
): ReadonlyMap<Entry, LaidChildren> {
  const half = joint.pitch / 2;
  const c0 = Math.max(
    ...joint.lines.map((line) => childrenStart(known(fitted, line).prepared, pl)),
  );
  const halves = (side: Side) =>
    joint.rows.map((row) =>
      Math.max(half, ...row.lines.map((line) => known(drawings, line).edges[side])),
    );
  const inner = halves(opposite(joint.side));
  const outer = halves(joint.side);
  const distances: number[] = [];
  inner.forEach((ik, index) => {
    distances.push(
      index === 0 ? c0 + ik : nth(distances, index - 1) + (nth(outer, index - 1) + ik),
    );
  });
  return new Map(
    joint.lines.map((line) => {
      const { prepared, fit } = known(fitted, line);
      let width = 0;
      for (let index = 0; index < fit.count; index += 1) {
        width = width + nth(inner, index) + nth(outer, index);
      }
      const children = prepared.children.map((child) => {
        const row = known(fit.row, child);
        return {
          drawing: known(drawings, child),
          row,
          distance: nth(distances, row - 1),
        };
      });
      return [line, { start: c0, width, children }];
    }),
  );
}

/**
 * The third pass (section 6.4: "the ordinates, from the root's line down"):
 * every line of the member drawing placed, in traversal order, from the
 * root's drawing `root` in the root's row `row` at `place`. A child in a
 * band above its parent's line lies at `yl − lk`, one below at `yl + lk`,
 * `yl` its parent's ordinate and `lk` its `PlacedChild.distance`; it shares
 * `x0`, the top, `P × v` and `Hc` of `place` and takes the name size of its
 * own row.
 */
export function placeLines(root: TimelineDrawing, row: Row, place: LinePlace): PlacedLine[] {
  const rows = new Map<Entry, Row>();
  const collect = (each: Row) => {
    for (const line of each.lines) rows.set(line, each);
    for (const side of SIDES) for (const inner of each.joints[side]?.rows ?? []) collect(inner);
  };
  collect(row);
  const placed: PlacedLine[] = [];
  const visit = (drawing: TimelineDrawing, at: LinePlace) => {
    placed.push({ drawing, place: at, row: known(rows, drawing.prepared.line) });
    const side = drawing.prepared.sides.children;
    for (const child of drawing.children?.children ?? []) {
      const y = side === "above" ? at.y - child.distance : at.y + child.distance;
      const size = known(rows, child.drawing.prepared.line).size;
      visit(child.drawing, { ...at, y, size });
    }
  };
  visit(root, place);
  // A children band places its own children before those of its joined segments, so the walk
  // above is not the traversal order of section 6.1 where a segment line holds both.
  return placed.sort((left, right) =>
    root.prepared.scope.byTraversal(left.drawing.prepared.line, right.drawing.prepared.line),
  );
}
