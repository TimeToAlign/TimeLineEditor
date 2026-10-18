/**
 * A member drawing: one timeline drawn as a root, every timeline drawn with
 * a line of its own laid out with its bands at its own line, the rows of
 * their children bands laid out together, the ancestor band, and its
 * elements in descriptor order with its bands' records (`docs/drawing.md` in
 * timeskeleton, sections 6, 7.2, 8.3 and 8.5).
 */

import type { MemberDrawing } from "@timetoalign/tilie-core";
import {
  ancestorBand,
  ancestorLabelElements,
  ancestorLineElements,
  ancestorLines,
  ancestorMarkElements,
  ancestorNames,
  ancestorY,
  chevrons,
} from "./ancestors.ts";
import type { Centred, LineElements, SegmentElement } from "./bands.ts";
import { type Fitted, fitTimelines } from "./children.ts";
import type { DrawnBand, DrawnElement } from "./elements.ts";
import { heights } from "./heights.ts";
import { lineNames, nameElement, type RowName, rowName } from "./names.ts";
import { layoutRow, type PlacedLine, placeLines, type Row, rowsOf } from "./rows.ts";
import type { TimelineDrawing } from "./timeline.ts";
import { type Context, type Entry, type Holder, traverse } from "./traversal.ts";

/**
 * One member drawing laid out before its horizontal start and its top are
 * known: what the shared start `x0` needs, its height, and its elements and
 * bands once `x0`, the name column `n` and its top are given.
 */
export interface MemberLayout {
  /** The widths of its drawn names, its ancestors' included. */
  readonly names: readonly number[];
  /** Its centred labels: their widths and the proportions they are centred on. */
  readonly centred: readonly Centred[];
  /** The stroke widths of its drawn ancestor lines that run on to the left. */
  readonly chevrons: readonly number[];
  /** Its height `Hm`: the content height `Hc` (section 6.5), the ancestor band included. */
  readonly height: number;
  /** It drawn with the shared start `x0`, the name column `n` and its top `top`, in item coordinates. */
  drawAt(x0: number, n: number, top: number): MemberDrawn;
}

/** A member drawing drawn in its item, in item coordinates. */
export interface MemberDrawn {
  /** Its elements in descriptor order (sections 7.2 and 8.5), its card excluded. */
  readonly elements: DrawnElement[];
  /** Its bands, its timelines in traversal order, each one's top to bottom (`Drawing.bands`). */
  readonly bands: DrawnBand[];
}

/** Every row of a member drawing, the root's first, then each joint's rows, at every depth. */
function rowsBelow(row: Row): Row[] {
  return [
    row,
    ...[row.joints.above, row.joints.below].flatMap((joint) =>
      (joint?.rows ?? []).flatMap(rowsBelow),
    ),
  ];
}

/**
 * Lay out one timeline drawn as a root (sections 3 to 6, and 8.3 for its
 * ancestors), its line held by `holder`, the block or its group's frame, by
 * the three passes of section 6.4: every first fit and every row; the
 * distances, from the deepest rows up, then the ancestor band and the
 * heights; the ordinates, from the root's line down, once `drawAt` gives the
 * member drawing's start and top.
 */
export function layoutMember(
  context: Context,
  member: MemberDrawing,
  holder: Holder,
): MemberLayout {
  const scope = traverse(context, member, holder);
  const { rootEntry } = scope;

  const fitted = fitTimelines(scope);
  const rootRow = rowsOf(scope, fitted);
  const root = layoutRow(rootRow, fitted).get(rootEntry) as TimelineDrawing;
  const ancestors = ancestorLines(scope);
  const band = ancestorBand(scope, ancestors, rootRow.pitch, root.edges.above);
  const { Pv, yLocal, Hc } = heights(scope, band.edge, root.edges.below);

  // One text per row (section 6.6): each ancestor's, then the rows of lines, whose order from
  // the top down is known once their ordinates are. A line that is not displayed hides its name,
  // so the root's row draws none where the root's line is hidden.
  const ancestorTexts = ancestorNames(ancestors).map((item) => rowName(scope, [item]));
  const rowTexts = rowsBelow(rootRow).map((row) => ({
    row,
    text: rowName(scope, lineNames(row.lines.filter((line) => line.drawn))),
  }));
  const drawnNames = [...ancestorTexts, ...rowTexts.map((item) => item.text)].filter(
    (text): text is RowName => text !== undefined,
  );

  const centred = [
    ...ancestors.flatMap((ancestor) =>
      ancestor.labelled.map((mark) => ({ width: mark.width, u: mark.u })),
    ),
    ...[...fitted.values()].flatMap((line) => line.prepared.centred),
  ];

  const drawAt = (x0: number, n: number, top: number): MemberDrawn => {
    const yRoot = top + yLocal;
    const placed = placeLines(root, rootRow, { x0, y: yRoot, size: rootRow.size, top, Pv, Hc });
    const drawn = placed.map((line) => line.drawing.elements(line.place));
    const each = <K extends keyof LineElements>(key: K): LineElements[K][number][] =>
      drawn.flatMap((elements) => [...elements[key]]);
    // Boundaries and segment labels follow their segments' traversal order across lines.
    const bySegment = <T>(items: readonly SegmentElement<T>[]): T[] =>
      [...items]
        .sort((left, right) => scope.byTraversal(left.segment, right.segment))
        .map((item) => item.element);
    const ordinate = new Map<Row, number>(placed.map((line) => [line.row, line.place.y]));
    const names = [
      ...ancestorTexts.flatMap((text, index) =>
        text === undefined ? [] : [nameElement(scope, text, n, ancestorY(band, index, yRoot))],
      ),
      ...rowTexts
        .map((item) => ({ text: item.text, y: ordinate.get(item.row) as number }))
        .sort((left, right) => left.y - right.y)
        .flatMap((item) =>
          item.text === undefined ? [] : [nameElement(scope, item.text, n, item.y)],
        ),
    ];
    return {
      elements: [
        ...each("breaks"),
        ...each("maps"),
        ...each("regions"),
        ...each("jumps"),
        ...ancestorLineElements(scope, ancestors, band, x0, yRoot),
        ...each("line"),
        ...bySegment(each("boundaries")),
        ...ancestorMarkElements(scope, ancestors, band, x0, yRoot),
        ...each("wedges"),
        ...names,
        ...ancestorLabelElements(scope, ancestors, band, x0, yRoot),
        ...each("wedgeLabels"),
        ...bySegment(each("segmentLabels")),
        ...each("regionLabels"),
        ...each("jumpLabels"),
        ...each("breakLabels"),
      ],
      bands: bandRecords(placed, fitted),
    };
  };

  return {
    names: drawnNames.map((item) => item.width),
    centred,
    chevrons: chevrons(ancestors),
    height: Hc,
    drawAt,
  };
}

/**
 * The bands of a member drawing whose lines are placed as `lines` (in
 * traversal order) after the first pass `fitted`, in item coordinates,
 * before its item is placed: for each line, each band of
 * `TimelineDrawing.bands` (top to bottom) with its address, timeline, kind,
 * level and elements, its line's ordinate `yl`, and its rectangle.
 * Vertically a band above its line runs from `yl − E` to `yl − c`, one below
 * from `yl + c` to `yl + E`, `c` its start and `E` its outer edge (section
 * 6.4, Where a band lies); `y` is the top, `height` the bottom less the top.
 * Horizontally every line's bands, the root's as a child's, run from `x0 +
 * a` to `x0 + b`, `[a, b]` its `Fitted.extent` (section 6.4, Children); `x`
 * is the left, `width` the right less the left.
 */
export function bandRecords(
  lines: readonly PlacedLine[],
  fitted: ReadonlyMap<Entry, Fitted>,
): DrawnBand[] {
  return lines.flatMap(({ drawing, place }) => {
    const timeline = drawing.prepared.line.manifest.id;
    const [a, b] = (fitted.get(drawing.prepared.line) as Fitted).extent;
    const left = place.x0 + a;
    const right = place.x0 + b;
    const yl = place.y;
    return drawing.bands.map((band) => {
      const top = band.side === "above" ? yl - band.edge : yl + band.start;
      const bottom = band.side === "above" ? yl - band.start : yl + band.edge;
      return {
        address: band.address,
        timeline,
        kind: band.kind,
        level: band.level,
        line: yl,
        elements: band.elements,
        x: left,
        y: top,
        width: right - left,
        height: bottom - top,
      };
    });
  });
}
