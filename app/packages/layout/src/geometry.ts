/**
 * The geometry an element is drawn with, read by the layout for its extents
 * and by the writers for its descriptors (`docs/drawing.md` in
 * TimeToShare, sections 6.6, 6.7 and 7.2), so the two never differ.
 */

import type { Style } from "./cascade.ts";
import type {
  Cut,
  DrawnElement,
  LineElement,
  MarkerElement,
  PathCommand,
  Point,
  RegionElement,
} from "./elements.ts";
import type { TextMeasure } from "./metrics.ts";
import { times } from "./numbers.ts";

/** A circle at `(cx, cy)` of radius `r`. */
export interface Circle {
  readonly cx: number;
  readonly cy: number;
  readonly r: number;
}

/**
 * One mark at an end of a line: its circle, its arrowhead or diamond (a
 * polygon, `filled` or drawn in outline), or one of its chevrons.
 */
export type LineMark =
  | ({ readonly shape: "circle" } & Circle)
  | { readonly shape: "polygon"; readonly points: readonly Point[]; readonly filled: boolean }
  | { readonly shape: "polyline"; readonly points: readonly Point[] };

/** A line's stroke from `x1` to `x2` at `y`, and the marks at its start and its end. */
export interface LineGeometry {
  readonly x1: number;
  readonly x2: number;
  readonly y: number;
  readonly start: readonly LineMark[];
  readonly end: readonly LineMark[];
}

/**
 * The geometry of a line (sections 6.6, 7.2 and 8.3): its stroke to where it
 * stops (short of a diamond), its start circle or two left chevrons, and its
 * end mark: the arrowhead, `3w` long and `3w` wide; the circle; the diamond,
 * `1.2w` high; three chevrons where its length is not known, two where it
 * runs on; no mark at an end that lies in a gap (section 6.6, Elisions). A
 * chevron's arms lie `w`, `2.5w` and `4w` from the end, each tip `1.5w`
 * further, the inner one first.
 */
export function lineGeometry(element: LineElement): LineGeometry {
  const { xs, xe, y } = element;
  const w = element.style["stroke-width"];
  const circle = (cx: number): LineMark => ({ shape: "circle", cx, cy: y, r: w });
  const chevrons = (x: number, direction: -1 | 1, count: 2 | 3): LineMark[] => {
    const at = (offset: number) => x + direction * offset;
    const half = 1.5 * w;
    return [
      [w, 2.5 * w],
      [2.5 * w, 4 * w],
      [4 * w, 5.5 * w],
    ]
      .slice(0, count)
      .map(([arm = 0, tip = 0]) => ({
        shape: "polyline",
        points: [
          [at(arm), y - half],
          [at(tip), y],
          [at(arm), y + half],
        ],
      }));
  };
  const arrowhead = (filled: boolean): LineMark => ({
    shape: "polygon",
    points: [
      [xe + 3 * w, y],
      [xe, y - 1.5 * w],
      [xe, y + 1.5 * w],
    ],
    filled,
  });
  const x2 = element.end === "diamond" ? xe - 1.5 * w : xe;
  const end = (): LineMark[] => {
    switch (element.end) {
      case "arrowhead":
        return [arrowhead(true)];
      case "open":
        return [arrowhead(false)];
      case "circle":
        return [circle(xe)];
      case "diamond": {
        const half = times(6n, 5n, w);
        const points: Point[] = [
          [x2, y],
          [xe, y - half],
          [xe + 1.5 * w, y],
          [xe, y + half],
        ];
        return [{ shape: "polygon", points, filled: false }];
      }
      case "unknown":
        return chevrons(xe, 1, 3);
      case "chevrons":
        return chevrons(xe, 1, 2);
      case "none":
        return [];
    }
  };
  const start = (): LineMark[] => {
    switch (element.start) {
      case "circle":
        return [circle(xs)];
      case "chevrons":
        return chevrons(xs, -1, 2);
      case "none":
        return [];
    }
  };
  return { x1: xs, x2, y, start: start(), end: end() };
}

/**
 * The brace of a region from `x1` to `x2`, arms at `yb`, tip at `(xm, ya)`
 * (section 7.2), as the path commands it is written with. Each of its two
 * straight parts at `ym`, from `x1 + k` to `xm − k` and from `xm + k` to
 * `x2 − k`, is cut where the gaps it spans meet it (section 6.6, Elisions;
 * `straightPart`); its arms and tip are drawn whole.
 */
export function brace({ x1, x2, xm, yb, ya, cuts }: RegionElement): PathCommand[] {
  const ym = (yb + ya) / 2;
  const k = Math.abs(ya - yb) / 2;
  return [
    { command: "M", points: [[x1, yb]] },
    {
      command: "Q",
      points: [
        [x1, ym],
        [x1 + k, ym],
      ],
    },
    ...straightPart(x1 + k, xm - k, ym, cuts),
    {
      command: "Q",
      points: [
        [xm, ym],
        [xm, ya],
      ],
    },
    {
      command: "Q",
      points: [
        [xm, ym],
        [xm + k, ym],
      ],
    },
    ...straightPart(xm + k, x2 - k, ym, cuts),
    {
      command: "Q",
      points: [
        [x2, ym],
        [x2, yb],
      ],
    },
  ];
}

/**
 * A straight part of a brace at `ym`, from the pen at `from` to `to` (section 7.2). A gap
 * `[left, right]` meeting it leaves out the stretch from the larger of `left` and `from` to the
 * smaller of `right` and `to`, where that stretch has a length; cuts that touch are one cut
 * (section 6.6, Elisions). Uncut, the part is `L to`; cut at `[c1, c1']`, …, `[cj, cj']`, it is
 * `L c1 M c1' L c2 … M cj' L to`, every `L` to the point the pen stands at left out.
 */
function straightPart(from: number, to: number, ym: number, cuts: readonly Cut[]): PathCommand[] {
  const parts: [number, number][] = [];
  for (const [left, right] of cuts) {
    const [start, end] = [Math.max(left, from), Math.min(right, to)];
    if (!(end > start)) continue;
    const last = parts.at(-1);
    if (last !== undefined && start <= last[1]) last[1] = Math.max(last[1], end);
    else parts.push([start, end]);
  }
  if (parts.length === 0) return [{ command: "L", points: [[to, ym]] }];
  const commands: PathCommand[] = [];
  let pen = from;
  const lineTo = (x: number) => {
    if (x !== pen) commands.push({ command: "L", points: [[x, ym]] });
  };
  for (const [start, end] of parts) {
    lineTo(start);
    commands.push({ command: "M", points: [[end, ym]] });
    pen = end;
  }
  lineTo(to);
  return commands;
}

/** An axis-aligned rectangle by its edges. */
export interface Bounds {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** The bounds of some points. */
function boundsOfPoints(points: readonly Point[]): Bounds {
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  return {
    left: Math.min(...xs),
    top: Math.min(...ys),
    right: Math.max(...xs),
    bottom: Math.max(...ys),
  };
}

/**
 * A wedge's three points (sections 6.6 and 7.2): its tip `(X, yt)`, then
 * the corners of its base `(X + dx, y)` in their order.
 */
export function wedgePoints({
  x,
  yt,
  corners: [first, second],
}: Pick<MarkerElement, "x" | "yt" | "corners">): readonly [Point, Point, Point] {
  return [
    [x, yt],
    [x + first.dx, first.y],
    [x + second.dx, second.y],
  ];
}

/** The points a line mark's bounds are taken over. */
function markPoints(mark: LineMark): Point[] {
  if (mark.shape !== "circle") return [...mark.points];
  return [
    [mark.cx - mark.r, mark.cy - mark.r],
    [mark.cx + mark.r, mark.cy + mark.r],
  ];
}

/** The bounds of a text written from `x` on `baseline`, anchored at its start or middle. */
function textBounds(
  measure: TextMeasure,
  { x, baseline, text, style }: { x: number; baseline: number; text: string; style: Style },
  anchor: "start" | "middle",
): Bounds {
  const size = style["font-size"];
  const width = measure.width(text, size);
  return {
    left: anchor === "start" ? x : x - width / 2,
    top: baseline - measure.ascent(size),
    right: anchor === "start" ? x + width : x + width / 2,
    bottom: baseline + measure.descent(size),
  };
}

/**
 * The geometric bounds of an element (section 6.7): its outline, no stroke
 * width counted; a brace or a jump by its points, controls included; a text
 * by its advance width from its anchor and its ascent and descent.
 */
export function boundsOf(element: DrawnElement, measure: TextMeasure): Bounds {
  switch (element.type) {
    case "block":
      return { left: 0, top: 0, right: element.width, bottom: element.height };
    case "frame":
    case "card":
    case "ancestor_card":
      return {
        left: element.x,
        top: element.y,
        right: element.x + element.width,
        bottom: element.y + element.height,
      };
    case "timeline":
    case "child":
    case "ancestor": {
      const line = lineGeometry(element);
      return boundsOfPoints([
        [line.x1, line.y],
        [line.x2, line.y],
        ...[...line.start, ...line.end].flatMap(markPoints),
      ]);
    }
    case "map": {
      const half = element.spacing / 2;
      return {
        left: element.xs,
        top: element.yc - half,
        right: element.xe,
        bottom: element.yc + half,
      };
    }
    case "region":
      return boundsOfPoints(brace(element).flatMap((command) => command.points));
    case "jump":
      return boundsOfPoints([
        element.start,
        element.c1,
        element.c2,
        element.base,
        element.tip,
        ...element.corners,
      ]);
    case "break":
    case "section_break":
    case "barline":
    case "boundary":
    case "cross_section":
      return {
        left: element.x,
        top: Math.min(element.y1, element.y2),
        right: element.x,
        bottom: Math.max(element.y1, element.y2),
      };
    case "alignment_anchor":
    case "leader":
      return boundsOfPoints([
        [element.x1, element.y1],
        [element.x2, element.y2],
      ]);
    case "wedge":
      return boundsOfPoints(wedgePoints(element));
    case "elision":
      return { left: element.x1, top: element.yt, right: element.x2, bottom: element.yb };
    case "ellipsis": {
      // Its three dots, the outer ones centred `spacing` from its middle.
      const reach = element.spacing + element.r;
      return {
        left: element.x - reach,
        top: element.y - element.r,
        right: element.x + reach,
        bottom: element.y + element.r,
      };
    }
    case "name":
    case "label":
      return textBounds(measure, element, element.anchor);
    case "symbol":
      return textBounds(measure, element, "middle");
    case "bracket": {
      const line = boundsOfPoints([
        [element.x1, element.yh],
        [element.x1, element.y],
        [element.x2, element.y],
      ]);
      if (element.text === null) return line;
      const { tx: x, baseline, text, style } = element;
      const own = textBounds(measure, { x, baseline, text, style }, "start");
      return {
        left: Math.min(line.left, own.left),
        top: Math.min(line.top, own.top),
        right: Math.max(line.right, own.right),
        bottom: Math.max(line.bottom, own.bottom),
      };
    }
  }
}

/**
 * The right edge of an element's content (section 6.7): its bounds' right,
 * none for the block, a frame or a card, which hold content and are none.
 */
export function rightEdge(element: DrawnElement, measure: TextMeasure): number | undefined {
  if (
    element.type === "block" ||
    element.type === "frame" ||
    element.type === "card" ||
    element.type === "ancestor_card"
  ) {
    return undefined;
  }
  return boundsOf(element, measure).right;
}

/** The largest right edge of some elements, or `undefined` when none has one. */
export function largestRightEdge(
  elements: readonly DrawnElement[],
  measure: TextMeasure,
): number | undefined {
  const edges = elements
    .map((element) => rightEdge(element, measure))
    .filter((edge): edge is number => edge !== undefined);
  return edges.length === 0 ? undefined : Math.max(...edges);
}
