/**
 * The children band: the child lines placed by first fit into rows beyond
 * their parents' (`docs/drawing.md` in timeskeleton, sections 6.4 and 6.6).
 */

import type { Band, Position } from "./canvas.ts";
import type { Side } from "./cascade.ts";
import type { LineElement } from "./elements.ts";
import { Rows } from "./fit.ts";
import type { LineReach } from "./segments.ts";
import { type Entry, opposite, rowPitch, type Scope, shown } from "./traversal.ts";

interface ChildRows {
  /** Every line but the root's, in traversal order: the children and the segment lines among segments. */
  readonly drawn: readonly Entry[];
  readonly rows: Record<Side, Rows>;
  /** The lines of each child row, in traversal order. */
  readonly lines: Record<Side, Entry[][]>;
  /** The row of each drawn line on its side. */
  readonly row: ReadonlyMap<Entry, number>;
}

/** Place every drawn line but the root's into its side's rows, beyond its parent's anchor. */
export function childRows(scope: Scope): ChildRows {
  const { entries, rootEntry, relativeX, relativeEnd } = scope;
  const drawnChildren = entries.slice(1).filter((entry) => entry.line && shown(entry.style));
  const rows = { above: new Rows(), below: new Rows() };
  const rowLines: Record<Side, Entry[][]> = { above: [], below: [] };
  const childRow = new Map<Entry, number>();
  const anchors = new Map<Entry, Record<Side, number>>([[rootEntry, { above: 0, below: 0 }]]);
  for (const entry of entries.slice(1)) {
    const parent = anchors.get(entry.parent as Entry) as Record<Side, number>;
    if (!entry.line || !shown(entry.style)) {
      anchors.set(entry, { ...parent });
      continue;
    }
    const side = entry.style.side;
    // An open end's chevrons take room in the row: the extent runs on 8w past its end.
    const end = relativeEnd(entry);
    const right = entry.open ? end + 8 * entry.style["stroke-width"] : end;
    const row = rows[side].place([relativeX(entry.start), right], parent[side] + 1);
    childRow.set(entry, row);
    while (rowLines[side].length < row) rowLines[side].push([]);
    (rowLines[side][row - 1] as Entry[]).push(entry);
    anchors.set(entry, { ...parent, [side]: row });
  }
  return { drawn: drawnChildren, rows, lines: rowLines, row: childRow };
}

/**
 * The name size of a children band (section 6.2): the largest of its rows'
 * names, displayed or not; a row of segment lines counts its first line's.
 */
const nameBandSize = (children: ChildRows, side: Side): number =>
  Math.max(
    ...children.lines[side].map((lines) => {
      const counted = lines.some((line) => !line.segment)
        ? lines.filter((line) => !line.segment)
        : lines.slice(0, 1);
      return Math.max(...counted.map((line) => line.name.style["font-size"]));
    }),
  );

/**
 * The children band of a side, starting no nearer than `p0 / 2`: the
 * distance of each row's line from the root's line, row 1 first.
 */
export function childrenBand(
  scope: Scope,
  children: ChildRows,
  reach: LineReach,
  side: Side,
  p0: number,
): Band<number[]> | undefined {
  if (children.rows[side].count === 0) return undefined;
  const p = rowPitch(scope, nameBandSize(children, side));
  const halves = (half: Side) =>
    children.lines[side].map((lines) =>
      Math.max(p / 2, ...lines.map((line) => reach.reach(line, half))),
    );
  const inner = halves(opposite(side));
  const outer = halves(side);
  let width = 0;
  inner.forEach((half, index) => {
    width = width + half + (outer[index] as number);
  });
  return {
    width,
    minimum: p0 / 2,
    at: (c0) => {
      const rows: number[] = [];
      let line = c0 + (inner[0] as number);
      rows.push(line);
      for (let index = 1; index < inner.length; index += 1) {
        line = line + ((outer[index - 1] as number) + (inner[index] as number));
        rows.push(line);
      }
      return rows;
    },
  };
}

/** The child lines, each ending with the open diamond, or running on into chevrons where open. */
export function childElements(children: ChildRows, placed: Position): LineElement[] {
  const { x, xEnd, lineY } = placed;
  return children.drawn.map((entry) => ({
    type: "child",
    address: entry.manifest.id,
    style: entry.style,
    xs: x(entry.start),
    xe: entry.open ? xEnd(entry) + 4 * entry.style["stroke-width"] : xEnd(entry),
    y: lineY(entry),
    start: "circle",
    end: entry.open ? "chevrons" : "diamond",
  }));
}
