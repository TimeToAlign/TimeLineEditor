/**
 * The rows of a member drawing (`docs/drawing.md` in TimeToShare, sections
 * 6.2 and 6.4, Children): the root's row, and the rows of the children bands
 * of each row's lines on one side, laid out together, at every depth. Holds
 * the second pass from the deepest rows up, in which the children bands and
 * the conversion maps bands of a row's lines laid out together take their
 * common starts, and places every line in the third, from the root's line
 * down.
 */

import { type BandSpan, opposite, type Side } from "./bands.ts";
import type { Fitted } from "./children.ts";
import type { Slots } from "./maps.ts";
import { lineNames } from "./names.ts";
import {
  type LaidChildren,
  type LinePlace,
  layoutTimeline,
  ownStart,
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
  /** Its pitch: `p0 = max(10 + S, h(s))` for the root's row, else the pitch `p` of its joint layout. */
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
  /** Its pitch `p = max(10 + S, h(s))`, the pitch of each of its rows. */
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

/** Every row of a member drawing, the root's first, then each joint's rows, at every depth. */
export function rowsBelow(row: Row): Row[] {
  return [
    row,
    ...[row.joints.above, row.joints.below].flatMap((joint) =>
      (joint?.rows ?? []).flatMap(rowsBelow),
    ),
  ];
}

/** The spans of a line's bands laid out together with other lines' bands, as they are found. */
type Spans = Partial<Record<"children" | "conversion_maps", BandSpan>>;

/**
 * Bands of the lines of one row on one side laid out together (section 6.4,
 * Children and Conversion maps): the children bands of a joint, or the
 * conversion maps bands sharing one set of slots.
 */
interface Together {
  readonly facet: "children" | "conversion_maps";
  readonly lines: readonly Entry[];
  /** The width of each line's band. */
  readonly width: (line: Entry) => number;
}

/**
 * The starts of the bands of the lines of `row` on `side` that are laid out
 * together with other lines' (section 6.4, Where a band lies, The order of
 * the starts), `sets` those bands, step by step: a set starts at `c0`, the
 * largest of its bands' own starts (`ownStart`), once every band nearer each
 * of their lines that is laid out together has its start. Since the slots
 * keep apart the conversion maps bands whose lines' children bands lie on
 * either side of them (`rowSlots`), no set waits on itself, and the order of
 * the steps changes no start.
 */
function resolveStarts(
  sets: readonly Together[],
  side: Side,
  pl: number,
  fitted: ReadonlyMap<Entry, Fitted>,
  slots: ReadonlyMap<Entry, Slots>,
  spans: Map<Entry, Spans>,
): void {
  const spansOf = (line: Entry): Spans => {
    const found = spans.get(line);
    if (found !== undefined) return found;
    const created: Spans = {};
    spans.set(line, created);
    return created;
  };
  const ready = (line: Entry, facet: Together["facet"]): boolean => {
    const { levels } = known(fitted, line).prepared;
    const nearer = levels[side].slice(0, levels[side].indexOf(facet));
    return nearer.every(
      (each) =>
        (each !== "children" && each !== "conversion_maps") || spansOf(line)[each] !== undefined,
    );
  };
  const pending = [...sets];
  while (pending.length > 0) {
    const index = pending.findIndex((set) => set.lines.every((line) => ready(line, set.facet)));
    const set = pending[index];
    if (set === undefined) throw new Error("the bands of a row wait on each other");
    const c0 = Math.max(
      ...set.lines.map((line) =>
        ownStart(known(fitted, line).prepared, slots.get(line), set.facet, spansOf(line), pl),
      ),
    );
    for (const line of set.lines) spansOf(line)[set.facet] = { start: c0, width: set.width(line) };
    pending.splice(index, 1);
  }
}

/**
 * The second pass for the lines of `row` (section 6.4, Children: "the
 * distances, from the deepest rows up"), `slots` the slots of every present
 * conversion maps band (`rowSlots`): for each side, the rows of the joint
 * layout of its lines' children bands, each laid out first; their halves
 * (`childrenHalves`); the common start of each set of bands laid out
 * together, the children bands and the conversion maps bands sharing slots
 * (`resolveStarts`); the children placed (`placeChildren`); then each line
 * of `row` laid out by `layoutTimeline`. Keyed by the row's lines, each
 * drawing holding its subtree.
 */
export function layoutRow(
  row: Row,
  fitted: ReadonlyMap<Entry, Fitted>,
  slots: ReadonlyMap<Entry, Slots>,
): ReadonlyMap<Entry, TimelineDrawing> {
  const laid = new Map<Entry, LaidChildren>();
  const spans = new Map<Entry, Spans>();
  for (const side of SIDES) {
    const joint = row.joints[side];
    const sets: Together[] = [];
    let halves: Halves | undefined;
    let drawings: Map<Entry, TimelineDrawing> | undefined;
    if (joint !== undefined) {
      drawings = new Map<Entry, TimelineDrawing>();
      for (const jointRow of joint.rows) {
        for (const [line, drawing] of layoutRow(jointRow, fitted, slots)) {
          drawings.set(line, drawing);
        }
      }
      const found = childrenHalves(joint, fitted, drawings);
      halves = found;
      sets.push({
        facet: "children",
        lines: joint.lines,
        width: (line) => known(found.widths, line),
      });
    }
    const shared = new Set(
      row.lines.flatMap((line) => {
        const each = slots.get(line);
        return each !== undefined && each.side === side ? [each] : [];
      }),
    );
    for (const each of shared) {
      sets.push({ facet: "conversion_maps", lines: each.lines, width: () => each.width });
    }
    resolveStarts(sets, side, row.pitch, fitted, slots, spans);
    if (joint !== undefined && halves !== undefined && drawings !== undefined) {
      for (const [line, children] of placeChildren(joint, halves, fitted, drawings, spans)) {
        laid.set(line, children);
      }
    }
  }
  return new Map(
    row.lines.map((line) => {
      const lineSlots = slots.get(line);
      const start = spans.get(line)?.conversion_maps?.start;
      const maps =
        lineSlots === undefined || start === undefined ? undefined : { slots: lineSlots, start };
      return [line, layoutTimeline(known(fitted, line).prepared, laid.get(line), maps)];
    }),
  );
}

/** The halves of the rows of a joint layout, and the width of each of its bands. */
interface Halves {
  /** `ik`, row `k`'s inner half, at index `k − 1`. */
  readonly inner: readonly number[];
  /** `ok`, row `k`'s outer half, at index `k − 1`. */
  readonly outer: readonly number[];
  /** Each band's width `i1 + o1 + … + iC + oC`, by the line whose band it is. */
  readonly widths: ReadonlyMap<Entry, number>;
}

/**
 * The rows of the children bands of `joint` laid out together (section 6.4,
 * Children), each row of `joint` already laid out (`layoutRow`, its lines'
 * drawings in `drawings`): row `k`'s inner half `ik` and outer half `ok`,
 * each the larger of `p / 2` and the largest edge of row `k`'s children on
 * that half's side, whichever band places them, `p` the joint's pitch (the
 * outer half's side is `joint.side`, the inner half's the opposite one); and
 * each band `i1 + o1 + … + iC + oC` wide, summed left to right over its own
 * `C` rows. None of it depends on where the bands start.
 */
function childrenHalves(
  joint: Joint,
  fitted: ReadonlyMap<Entry, Fitted>,
  drawings: ReadonlyMap<Entry, TimelineDrawing>,
): Halves {
  const half = joint.pitch / 2;
  const halves = (side: Side) =>
    joint.rows.map((row) =>
      Math.max(half, ...row.lines.map((line) => known(drawings, line).edges[side])),
    );
  const inner = halves(opposite(joint.side));
  const outer = halves(joint.side);
  const widths = new Map(
    joint.lines.map((line) => {
      let width = 0;
      for (let index = 0; index < known(fitted, line).fit.count; index += 1) {
        width = width + nth(inner, index) + nth(outer, index);
      }
      return [line, width];
    }),
  );
  return { inner, outer, widths };
}

/**
 * The children bands of `joint` placed from their common start `c0`, found
 * in `spans` (section 6.4, Children): `l1 = c0 + i1` and `l(k + 1) = lk +
 * (ok + i(k + 1))`, by the halves `halves`. Keyed by the lines of `joint`,
 * each band with the children it places.
 */
function placeChildren(
  joint: Joint,
  halves: Halves,
  fitted: ReadonlyMap<Entry, Fitted>,
  drawings: ReadonlyMap<Entry, TimelineDrawing>,
  spans: ReadonlyMap<Entry, Spans>,
): ReadonlyMap<Entry, LaidChildren> {
  const { inner, outer, widths } = halves;
  const c0 = spans.get(nth(joint.lines, 0))?.children?.start;
  if (c0 === undefined) throw new Error("a children band is placed before its start");
  const distances: number[] = [];
  inner.forEach((ik, index) => {
    distances.push(
      index === 0 ? c0 + ik : nth(distances, index - 1) + (nth(outer, index - 1) + ik),
    );
  });
  return new Map(
    joint.lines.map((line) => {
      const { prepared, fit } = known(fitted, line);
      const children = prepared.children.map((child) => {
        const row = known(fit.row, child);
        return {
          drawing: known(drawings, child),
          row,
          distance: nth(distances, row - 1),
        };
      });
      return [line, { start: c0, width: known(widths, line), children }];
    }),
  );
}

/**
 * The third pass (section 6.4: "the ordinates, from the root's line down"):
 * every line of the member drawing placed, in traversal order, from the
 * root's drawing `root` in the root's row `row` at `place`. A child in a
 * band above its parent's line lies at `yl − lk`, one below at `yl + lk`,
 * `yl` its parent's ordinate and `lk` its `PlacedChild.distance`; it shares
 * `x0`, the top, `Hc` and the card's bottom of `place` and takes the name
 * size of its own row.
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
