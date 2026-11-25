/**
 * The rows of a member drawing (`docs/drawing.md` in TimeToShare, sections
 * 6.2 and 6.4, Children): the root's row, and the rows of the children bands
 * of each row's lines on one side, laid out together, at every depth. Holds
 * the second pass from the deepest rows up, in which the children bands and
 * the conversion maps bands of a row's lines laid out together take their
 * common starts, and places every line in the third, from the root's line
 * down.
 */

import type { Facet } from "@timetoalign/tilie-core";
import { type BandSpan, bandStart, fillSide, opposite, type Side } from "./bands.ts";
import { type ChildrenFit, type Fitted, fitChildren, type Unplaced } from "./children.ts";
import type { Slots } from "./maps.ts";
import { lineNames } from "./names.ts";
import {
  type LaidChildren,
  type LinePlace,
  layoutTimeline,
  ownStart,
  prepareRow,
  reachOf,
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
   * Whether aligned children bands place its lines (section 6.4, Children), so that they lay
   * out their bands together, facet by facet (Rows of one band order); false for the root's row.
   */
  readonly aligned: boolean;
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

/** The first pass of a member drawing (section 6.4): its root's row and every line fitted. */
export interface FirstPass {
  readonly root: Row;
  readonly fitted: ReadonlyMap<Entry, Fitted>;
}

/**
 * The first pass's rows (section 6.4, Children): the root's row of the
 * member drawing and, top-down, every joint layout below it, with every
 * row's name size and pitch, from the lines `lines` prepared alone. The
 * children bands of a joint are **aligned** when every child they place has
 * one band order; each band places its children by first fit
 * (`fitChildren`), by their line-only extents where aligned and their whole
 * extents otherwise. The lines of a row placed by aligned bands are prepared
 * together (`prepareRow`); every other line keeps its own preparation.
 */
export function rowsOf(scope: Scope, lines: ReadonlyMap<Entry, Unplaced>): FirstPass {
  const fitted = new Map<Entry, Fitted>();
  const fits = new Map<Entry, ChildrenFit>();
  const alone = (line: Entry) => known(lines, line).prepared;
  /** The joint of the lines of a row whose present children band lies on `side`. */
  const jointOf = (rowLines: readonly Entry[], side: Side): Joint | undefined => {
    const holding = rowLines.filter((line) => {
      const prepared = alone(line);
      return prepared.children.length > 0 && prepared.sides.children === side;
    });
    if (holding.length === 0) return undefined;
    const placed = holding.flatMap((line) => alone(line).children);
    const orders = new Set(placed.map((child) => alone(child).order.join(" ")));
    const aligned = orders.size === 1;
    const extentOf = (child: Entry) =>
      aligned ? known(lines, child).lineOnly : known(lines, child).whole;
    // Row k holds every child that any of the bands places in its row k.
    const children: Entry[][] = [];
    for (const line of holding) {
      const fit = fitChildren(alone(line).children, extentOf);
      fits.set(line, fit);
      for (const [child, row] of fit.row) {
        while (children.length < row) children.push([]);
        nth(children, row - 1).push(child);
      }
    }
    for (const each of children) each.sort(scope.byTraversal);
    const size = Math.max(...children.map(countedSize));
    const pitch = rowPitch(scope, size);
    return {
      side,
      lines: holding,
      rows: children.map((each) => rowOf(each, size, pitch, aligned)),
      size,
      pitch,
    };
  };
  const rowOf = (
    rowLines: readonly Entry[],
    size: number,
    pitch: number,
    aligned: boolean,
  ): Row => {
    const prepared = aligned ? prepareRow(rowLines.map(alone)) : rowLines.map(alone);
    rowLines.forEach((line, index) => {
      fitted.set(line, {
        prepared: nth(prepared, index),
        extent: aligned ? known(lines, line).lineOnly : known(lines, line).whole,
        fit: { row: new Map(), count: 0 },
      });
    });
    const row = {
      lines: rowLines,
      size,
      pitch,
      aligned,
      joints: { above: jointOf(rowLines, "above"), below: jointOf(rowLines, "below") },
    };
    for (const line of rowLines) {
      const fit = fits.get(line);
      if (fit !== undefined) fitted.set(line, { ...known(fitted, line), fit });
    }
    return row;
  };
  // The root's row counts on its own: its pitch `p0` takes the root's name size alone.
  const size = scope.rootEntry.name.style["font-size"];
  const root = rowOf([scope.rootEntry], size, rowPitch(scope, size), false);
  return { root, fitted };
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
type Spans = Partial<Record<Facet, BandSpan>>;

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
 * The spans of every band of the lines of `row`, a row of one band order, on
 * `side` (section 6.4, Rows of one band order): their bands have one band
 * order and one set of present facets, so lie at the same levels; level by
 * level outwards, the bands of a facet start at one distance `c0`, the
 * largest of their own starts (`bandStart` after the bands below them, as
 * laid out so far; for a children band at least half the row's pitch), and
 * each is as wide as the widest of them: a children band by the halves of
 * its rows (`widths`, 0 for a line placing no child there), a conversion
 * maps band by its slots, any other by its first fits.
 */
function alignStarts(
  row: Row,
  side: Side,
  fitted: ReadonlyMap<Entry, Fitted>,
  slots: ReadonlyMap<Entry, Slots>,
  widths: ReadonlyMap<Entry, number> | undefined,
  spans: Map<Entry, Spans>,
): void {
  const spansOf = (line: Entry): Spans => {
    const found = spans.get(line);
    if (found !== undefined) return found;
    const created: Spans = {};
    spans.set(line, created);
    return created;
  };
  const facets = known(fitted, nth(row.lines, 0)).prepared.levels[side];
  facets.forEach((facet, level) => {
    const lower = facets.slice(0, level);
    const starts = row.lines.map((line) => {
      const { prepared } = known(fitted, line);
      const { S } = prepared.scope;
      const reach = reachOf(prepared, slots.get(line))[side];
      const w = prepared.line.style["stroke-width"];
      const bands = lower.map((each) => prepared.bands[each]);
      const before = fillSide(side, bands, reach, S, w, spansOf(line));
      const start = bandStart(facet, level === 0 ? undefined : before.edge, reach, w, S);
      return facet === "children" ? Math.max(start, row.pitch / 2) : start;
    });
    const widthOf = (line: Entry): number => {
      if (facet === "children") return widths?.get(line) ?? 0;
      if (facet === "conversion_maps") return slots.get(line)?.width ?? 0;
      return known(fitted, line).prepared.bands[facet].width;
    };
    const start = Math.max(...starts);
    const width = Math.max(...row.lines.map(widthOf));
    for (const line of row.lines) spansOf(line)[facet] = { start, width };
  });
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
    if (row.aligned && row.lines.length > 1) {
      alignStarts(row, side, fitted, slots, halves?.widths, spans);
    } else {
      resolveStarts(sets, side, row.pitch, fitted, slots, spans);
    }
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
      const aligned = row.aligned && row.lines.length > 1 ? spans.get(line) : undefined;
      return [line, layoutTimeline(known(fitted, line).prepared, laid.get(line), maps, aligned)];
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
