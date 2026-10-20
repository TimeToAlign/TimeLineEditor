/**
 * `toDescriptors(drawing)`: the SVG element descriptors of one drawing
 * (`docs/drawing.md` in timeskeleton, sections 7.2 and 8.5). An editor
 * renders these descriptors on screen; the SVG and TikZ writers serialize
 * them.
 */

import type {
  Drawing,
  DrawnElement,
  LineMark,
  PathCommand,
  Point,
} from "@timetoalign/tilie-layout";
import { brace, lineGeometry } from "@timetoalign/tilie-layout";
import { formatNumber } from "./page.ts";
import type { DescriptorSource } from "./source.ts";

export type { PathCommand, Point } from "@timetoalign/tilie-layout";

export type Tag = "rect" | "line" | "circle" | "polygon" | "polyline" | "path" | "text";

/** One SVG attribute, its name and its value, as the descriptor writes it. */
export type Attribute =
  | readonly ["data-address" | "fill" | "stroke" | "stroke-dasharray" | "text-anchor", string]
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

export interface RectDescriptor extends Written {
  readonly tag: "rect";
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly text: null;
}

export interface LineDescriptor extends Written {
  readonly tag: "line";
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly text: null;
}

export interface CircleDescriptor extends Written {
  readonly tag: "circle";
  readonly cx: number;
  readonly cy: number;
  readonly r: number;
  readonly text: null;
}

export interface PointsDescriptor extends Written {
  readonly tag: "polygon" | "polyline";
  readonly points: readonly Point[];
  readonly text: null;
}

export interface PathDescriptor extends Written {
  readonly tag: "path";
  readonly d: readonly PathCommand[];
  readonly text: null;
}

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
 * The writer of one element's descriptors, `index` its place in the
 * drawing: each carries the element's address (the box's background none),
 * its geometric attributes, its paint and its opacity, in that order
 * (section 7.2).
 */
function writerOf(element: DrawnElement, index: number) {
  const { address, style } = element;
  const head: Attributes = address === null ? [] : [["data-address", address]];
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
    ): RectDescriptor => ({
      tag: "rect",
      x,
      y,
      width,
      height,
      text: null,
      ...written(
        [
          ["x", x],
          ["y", y],
          ["width", width],
          ["height", height],
          ["rx", style.rx],
        ],
        paint,
        role,
      ),
    }),
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

/** The descriptors of one element (sections 7.2 and 8.5). */
function elementDescriptors(element: DrawnElement, index: number): Descriptor[] {
  const writer = writerOf(element, index);
  const { filled, stroked, open } = writer;
  switch (element.type) {
    case "block":
      // The background: its template, then `opacity`, and no address.
      return [writer.rect(0, 0, element.width, element.height, filled)];
    case "group":
    case "card": {
      const { x, y, width, height, shadowOffset } = element;
      const own = writer.rect(x, y, width, height, [...filled, ...stroked]);
      const shadow = element.style.shadow;
      if (element.type === "group" || shadow === "none") return [own];
      const [sx, sy] = [x + shadowOffset, y + shadowOffset];
      return [writer.rect(sx, sy, width, height, [["fill", shadow]], "shadow"), own];
    }
    case "timeline":
    case "child":
    case "ancestor": {
      // The line to where it stops, its start circle or left chevrons, its end mark or chevrons.
      const line = lineGeometry(element);
      return [
        writer.line(line.x1, line.y, line.x2, line.y),
        ...[...line.start, ...line.end].map((mark) => markDescriptor(mark, writer)),
      ];
    }
    case "wedge": {
      const half = element.base / 2;
      const { x, yt, yb } = element;
      return [
        writer.points(
          "polygon",
          [
            [x, yt],
            [x - half, yb],
            [x + half, yb],
          ],
          filled,
        ),
      ];
    }
    case "map": {
      const { xs, xe, yc } = element;
      const half = element.spacing / 2;
      return [
        writer.points(
          "polygon",
          [
            [xs, yc - half],
            [xe, yc - half],
            [xe, yc + half],
            [xs, yc + half],
          ],
          open,
        ),
      ];
    }
    case "region":
      return [writer.path(brace(element), open)];
    case "jump_from": {
      const shaft: PathCommand[] = [
        { command: "M", points: [element.start] },
        { command: "C", points: [element.c1, element.c2, element.base] },
      ];
      return [
        writer.path(shaft, open),
        writer.points("polygon", [element.tip, ...element.corners], filled),
      ];
    }
    case "flow_marker":
    case "boundary":
      return [writer.line(element.x, element.y1, element.x, element.y2)];
    case "name":
    case "label":
      return [writer.text(element.x, element.baseline, element.anchor, element.text)];
  }
}

/** The descriptors of a drawing, in the order of its elements, each naming its element. */
export function toDescriptors(drawing: Drawing): Descriptor[] {
  return drawing.elements.flatMap(elementDescriptors);
}
