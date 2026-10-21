/**
 * The geometry an element is drawn with, read by the layout for its extents
 * and by the writers for its descriptors (`docs/drawing.md` in
 * TimeToShare, sections 6.6, 6.7 and 7.2), so the two never differ.
 */

import type { DrawnElement, LineElement, PathCommand, Point, RegionElement } from "./elements.ts";
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
 * runs on. A chevron's arms lie `w`, `2.5w` and `4w` from the end, each tip
 * `1.5w` further, the inner one first.
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
    }
  };
  return {
    x1: xs,
    x2,
    y,
    start: element.start === "circle" ? [circle(xs)] : chevrons(xs, -1, 2),
    end: end(),
  };
}

/**
 * The brace of a region from `x1` to `x2`, arms at `yb`, tip at `(xm, ya)`
 * (section 7.2), as the path commands it is written with.
 */
export function brace({ x1, x2, xm, yb, ya }: RegionElement): PathCommand[] {
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
    { command: "L", points: [[xm - k, ym]] },
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
    { command: "L", points: [[x2 - k, ym]] },
    {
      command: "Q",
      points: [
        [x2, ym],
        [x2, yb],
      ],
    },
  ];
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

/** The points a line mark's bounds are taken over. */
function markPoints(mark: LineMark): Point[] {
  if (mark.shape !== "circle") return [...mark.points];
  return [
    [mark.cx - mark.r, mark.cy - mark.r],
    [mark.cx + mark.r, mark.cy + mark.r],
  ];
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
    case "jump_from":
      return boundsOfPoints([
        element.start,
        element.c1,
        element.c2,
        element.base,
        element.tip,
        ...element.corners,
      ]);
    case "flow_marker":
    case "boundary":
      return { left: element.x, top: element.y1, right: element.x, bottom: element.y2 };
    case "wedge":
      return {
        left: element.x - element.base / 2,
        top: Math.min(element.yt, element.yb),
        right: element.x + element.base / 2,
        bottom: Math.max(element.yt, element.yb),
      };
    case "name":
    case "label": {
      const size = element.style["font-size"];
      const width = measure.width(element.text, size);
      const left = element.anchor === "start" ? element.x : element.x - width / 2;
      return {
        left,
        top: element.baseline - measure.ascent(size),
        right: element.anchor === "start" ? element.x + width : element.x + width / 2,
        bottom: element.baseline + measure.descent(size),
      };
    }
  }
}

/**
 * The right edge of an element's content (section 6.7): its bounds' right,
 * none for the block, a frame or a card, which hold content and are none.
 */
export function rightEdge(element: DrawnElement, measure: TextMeasure): number | undefined {
  if (element.type === "block" || element.type === "frame" || element.type === "card") {
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
