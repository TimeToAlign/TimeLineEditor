/**
 * `toDescriptors(drawing)`: the SVG element descriptors of one drawing
 * (`docs/drawing.md` in TimeToShare, sections 7.2 and 8.5). An editor
 * renders these descriptors on screen; the SVG and TikZ writers serialize
 * them.
 */

import type { ElementAddress } from "@timetoalign/tilie-core";
import type {
  Cut,
  Drawing,
  DrawnElement,
  LineMark,
  PathCommand,
  Point,
} from "@timetoalign/tilie-layout";
import { brace, lineGeometry, wedgePoints } from "@timetoalign/tilie-layout";
import { formatNumber } from "./page.ts";
import type { DescriptorSource } from "./source.ts";

export type { PathCommand, Point } from "@timetoalign/tilie-layout";

/** The SVG attributes that carry an element's address (section 7.2), in the order written. */
export const ADDRESS_ATTRIBUTES = ["data-id", "data-facet", "data-part"] as const;

/** The SVG element a descriptor writes. */
export type Tag = "rect" | "line" | "circle" | "polygon" | "polyline" | "path" | "text";

/** One SVG attribute, its name and its value, as the descriptor writes it. */
export type Attribute =
  | readonly [
      (typeof ADDRESS_ATTRIBUTES)[number] | "fill" | "stroke" | "stroke-dasharray" | "text-anchor",
      string,
    ]
  | readonly [
      (
        | "x"
        | "y"
        | "width"
        | "height"
        | "rx"
        | "x1"
        | "y1"
        | "x2"
        | "y2"
        | "cx"
        | "cy"
        | "r"
        | "font-size"
        | "stroke-width"
        | "opacity"
      ),
      number,
    ]
  | readonly ["points", readonly Point[]]
  | readonly ["d", readonly PathCommand[]];

/** An attribute value: a number, a string, polygon points or path data. */
export type AttributeValue = Attribute[1];

interface Written {
  /** Its attributes in the order they are written: its address, geometry, paint and opacity. */
  readonly attrs: readonly Attribute[];
  readonly source: DescriptorSource;
}

/** A `rect`: its top-left corner `(x, y)`, its width and its height. */
export interface RectDescriptor extends Written {
  readonly tag: "rect";
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly text: null;
}

/** A `line` from `(x1, y1)` to `(x2, y2)`. */
export interface LineDescriptor extends Written {
  readonly tag: "line";
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly text: null;
}

/** A `circle` of radius `r` around `(cx, cy)`. */
export interface CircleDescriptor extends Written {
  readonly tag: "circle";
  readonly cx: number;
  readonly cy: number;
  readonly r: number;
  readonly text: null;
}

/** A `polygon` (closed) or `polyline` (open) through `points`. */
export interface PointsDescriptor extends Written {
  readonly tag: "polygon" | "polyline";
  readonly points: readonly Point[];
  readonly text: null;
}

/** A `path` drawn by the commands `d`. */
export interface PathDescriptor extends Written {
  readonly tag: "path";
  readonly d: readonly PathCommand[];
  readonly text: null;
}

/** A `text` element holding `text`, anchored at `(x, y)` by its start or middle. */
export interface TextDescriptor extends Written {
  readonly tag: "text";
  readonly x: number;
  readonly y: number;
  readonly anchor: "start" | "middle";
  readonly text: string;
}

/**
 * One SVG element: its tag, its geometry, its attributes in the order they
 * are written, its text, and the element it was written from.
 */
export type Descriptor =
  | RectDescriptor
  | LineDescriptor
  | CircleDescriptor
  | PointsDescriptor
  | PathDescriptor
  | TextDescriptor;

type Attributes = readonly Attribute[];

/** The stroke attributes: `stroke`, `stroke-width` and, unless it is `none`, `stroke-dasharray`. */
function strokeAttributes(stroke: string, width: number, dasharray: string): Attribute[] {
  const result: Attribute[] = [
    ["stroke", stroke],
    ["stroke-width", width],
  ];
  if (dasharray !== "none") {
    const dashes = dasharray.split(" ").map((part) => formatNumber(Number(part)));
    result.push(["stroke-dasharray", dashes.join(" ")]);
  }
  return result;
}

/**
 * The attributes of an address (section 7.2): `data-id`, `data-facet` and
 * `data-part`, its part words joined by one space, each only when the
 * address has its member; none for the bundle's address `{}`.
 */
function addressAttributes(address: ElementAddress): Attributes {
  const values = [address.id, address.facet, address.part?.join(" ")];
  const result: Attribute[] = [];
  ADDRESS_ATTRIBUTES.forEach((name, index) => {
    const value = values[index];
    if (value !== undefined) result.push([name, value]);
  });
  return result;
}

/**
 * The writer of one element's descriptors, `index` its place in the
 * drawing: each carries the element's address (the block's background
 * none), its geometric attributes, its paint and its opacity, in that order
 * (section 7.2).
 */
function writerOf(element: DrawnElement, index: number) {
  const { address, style } = element;
  const head = addressAttributes(address);
  const tail: Attributes = style.opacity === 1 ? [] : [["opacity", style.opacity]];
  const w = style["stroke-width"];
  const none: Attributes = [["fill", "none"]];
  const stroked = strokeAttributes(style.stroke, w, style["stroke-dasharray"]);
  const written = (
    geometry: Attributes,
    paint: Attributes,
    role: DescriptorSource["role"] = "primary",
  ): Written => ({
    attrs: [...head, ...geometry, ...paint, ...tail],
    source: { element: index, type: element.type, address, role },
  });
  return {
    rect: (
      x: number,
      y: number,
      width: number,
      height: number,
      paint: Attributes,
      role?: DescriptorSource["role"],
      rounded = true,
    ): RectDescriptor => {
      const geometry: Attribute[] = [
        ["x", x],
        ["y", y],
        ["width", width],
        ["height", height],
      ];
      if (rounded) geometry.push(["rx", style.rx]);
      return { tag: "rect", x, y, width, height, text: null, ...written(geometry, paint, role) };
    },
    line: (x1: number, y1: number, x2: number, y2: number): LineDescriptor => ({
      tag: "line",
      x1,
      y1,
      x2,
      y2,
      text: null,
      ...written(
        [
          ["x1", x1],
          ["y1", y1],
          ["x2", x2],
          ["y2", y2],
        ],
        stroked,
      ),
    }),
    /**
     * A gap line from `(x1, y)` to `(x2, y)` (section 6.6, Gap lines): stroked in the line's
     * `stroke`, half its stroke width, dashed `w / 2` on and `w` off.
     */
    gapLine: (x1: number, y: number, x2: number): LineDescriptor => ({
      tag: "line",
      x1,
      y1: y,
      x2,
      y2: y,
      text: null,
      ...written(
        [
          ["x1", x1],
          ["y1", y],
          ["x2", x2],
          ["y2", y],
        ],
        strokeAttributes(style.stroke, w / 2, `${w / 2} ${w}`),
      ),
    }),
    circle: (cx: number, cy: number, r: number, paint: Attributes): CircleDescriptor => ({
      tag: "circle",
      cx,
      cy,
      r,
      text: null,
      ...written(
        [
          ["cx", cx],
          ["cy", cy],
          ["r", r],
        ],
        paint,
      ),
    }),
    points: (
      tag: "polygon" | "polyline",
      points: readonly Point[],
      paint: Attributes,
    ): PointsDescriptor => ({ tag, points, text: null, ...written([["points", points]], paint) }),
    path: (d: readonly PathCommand[], paint: Attributes): PathDescriptor => ({
      tag: "path",
      d,
      text: null,
      ...written([["d", d]], paint),
    }),
    text: (x: number, y: number, anchor: "start" | "middle", text: string): TextDescriptor => ({
      tag: "text",
      x,
      y,
      anchor,
      text,
      ...written(
        [
          ["x", x],
          ["y", y],
          ["text-anchor", anchor],
          ["font-size", style["font-size"]],
        ],
        [["fill", style.fill]],
      ),
    }),
    /** `fill` alone: a circle, a filled polygon, a text. */
    filled: [["fill", style.fill]] satisfies Attributes,
    /** The stroke attributes alone: a line. */
    stroked,
    /** `fill="none"` and the stroke attributes: a path, a map. */
    open: [...none, ...stroked],
    /** `fill="none"`, the stroke at `w / 2`, no dash: the open arrowhead, diamond and chevrons. */
    outline: [...none, ...strokeAttributes(style.stroke, w / 2, "none")],
  };
}

type Writer = ReturnType<typeof writerOf>;

/** The descriptor of one mark at a line's end (section 7.2). */
function markDescriptor(mark: LineMark, writer: Writer): Descriptor {
  switch (mark.shape) {
    case "circle":
      return writer.circle(mark.cx, mark.cy, mark.r, writer.filled);
    case "polygon":
      return writer.points("polygon", mark.points, mark.filled ? writer.filled : writer.outline);
    case "polyline":
      return writer.points("polyline", mark.points, writer.outline);
  }
}

/**
 * The pieces `[from, to]` of a row from `x1` to `x2` that crosses the gaps
 * `cuts`, from run to run (section 6.6, Elisions); a piece without length is
 * not drawn.
 */
function piecesOf(x1: number, x2: number, cuts: readonly Cut[]): (readonly [number, number])[] {
  const pieces: (readonly [number, number])[] = [];
  let from = x1;
  for (const [left, right] of cuts) {
    pieces.push([from, left]);
    from = right;
  }
  pieces.push([from, x2]);
  return pieces.filter(([left, right]) => right > left);
}

/** The descriptors of one element (sections 7.2 and 8.5). */
function elementDescriptors(element: DrawnElement, index: number): Descriptor[] {
  const writer = writerOf(element, index);
  const { filled, stroked, open } = writer;
  switch (element.type) {
    case "block":
      // The background: its template, then `opacity`, and no address attribute.
      return [writer.rect(0, 0, element.width, element.height, filled)];
    case "frame":
    case "card":
    case "ancestor_card": {
      const { x, y, width, height, shadowOffset } = element;
      const own = writer.rect(x, y, width, height, [...filled, ...stroked]);
      const shadow = element.style.shadow;
      if (element.type === "frame" || shadow === "none") return [own];
      const [sx, sy] = [x + shadowOffset, y + shadowOffset];
      return [writer.rect(sx, sy, width, height, [["fill", shadow]], "shadow"), own];
    }
    case "timeline":
    case "child":
    case "ancestor": {
      // The line to where it stops, in pieces from run to run where it crosses gaps or the gaps
      // of its FlowMap interrupt it, then its gap lines from the left, its start circle or left
      // chevrons, its end mark or chevrons.
      const line = lineGeometry(element);
      const gapLines = element.gapLines ?? [];
      const cuts = [...element.cuts, ...gapLines].sort(([left], [right]) => left - right);
      return [
        ...piecesOf(line.x1, line.x2, cuts).map(([from, to]) =>
          writer.line(from, line.y, to, line.y),
        ),
        ...gapLines.map(([from, to]) => writer.gapLine(from, line.y, to)),
        ...[...line.start, ...line.end].map((mark) => markDescriptor(mark, writer)),
      ];
    }
    case "wedge":
      return [writer.points("polygon", wedgePoints(element), filled)];
    case "map": {
      // Its closed double line, in pieces from run to run where it crosses gaps.
      const { xs, xe, yc } = element;
      const half = element.spacing / 2;
      return piecesOf(xs, xe, element.cuts).map(([from, to]) =>
        writer.points(
          "polygon",
          [
            [from, yc - half],
            [to, yc - half],
            [to, yc + half],
            [from, yc + half],
          ],
          open,
        ),
      );
    }
    case "region":
      return [writer.path(brace(element), open)];
    case "jump": {
      const shaft: PathCommand[] = [
        { command: "M", points: [element.start] },
        { command: "C", points: [element.c1, element.c2, element.base] },
      ];
      return [
        writer.path(shaft, open),
        writer.points("polygon", [element.tip, ...element.corners], filled),
      ];
    }
    case "symbol":
      return [writer.text(element.x, element.baseline, "middle", element.text)];
    case "fork": {
      // Its stem; branch by branch its shaft and its arrowhead; then its texts.
      const [X, yb] = element.point;
      return [
        writer.line(element.stem[0], element.stem[1], X, yb),
        ...element.branches.flatMap(({ base, tip, corners }) => [
          writer.line(X, yb, base[0], base[1]),
          writer.points("polygon", [tip, ...corners], filled),
        ]),
        ...element.branches.flatMap(({ tx, baseline, text }) =>
          text === null ? [] : [writer.text(tx, baseline, "start", text)],
        ),
      ];
    }
    case "break":
    case "section_break":
    case "barline":
    case "boundary":
    case "cross_section":
      return [writer.line(element.x, element.y1, element.x, element.y2)];
    case "alignment_anchor":
    case "leader":
      return [writer.line(element.x1, element.y1, element.x2, element.y2)];
    case "elision": {
      // Its gap, filled and not stroked, without corners, only where its fill is not `none`; then
      // its continuations.
      const { x1, x2, yt, yb } = element;
      return [
        ...(element.style.fill === "none"
          ? []
          : [writer.rect(x1, yt, x2 - x1, yb - yt, filled, "primary", false)]),
        ...element.continuations.map((y) => writer.line(x1, y, x2, y)),
      ];
    }
    case "ellipsis": {
      // Three filled dots, `spacing` apart, on the row's ordinate.
      const { x, y, r, spacing } = element;
      return [x - spacing, x, x + spacing].map((cx) => writer.circle(cx, y, r, filled));
    }
    case "name":
    case "label":
      return [writer.text(element.x, element.baseline, element.anchor, element.text)];
  }
}

/** The descriptors of a drawing, in the order of its elements, each naming its element. */
export function toDescriptors(drawing: Drawing): Descriptor[] {
  return drawing.elements.flatMap(elementDescriptors);
}
