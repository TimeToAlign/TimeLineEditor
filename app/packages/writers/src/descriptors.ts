/**
 * `toDescriptors(drawing)`: the SVG element descriptors of one drawing
 * (`docs/drawing.md` in timeskeleton, sections 7.2 and 8.5). An editor
 * renders these descriptors on screen; the SVG and TikZ writers serialize
 * them.
 */

import type {
  Drawing,
  DrawnElement,
  LineElement,
  PathCommand,
  Point,
  Style,
} from "@timetoalign/tilie-layout";
import { brace, MAP_SPACING, MARKER_BASE, SHADOW_OFFSET, times } from "@timetoalign/tilie-layout";
import { formatNumber } from "./page.ts";

export type { PathCommand, Point } from "@timetoalign/tilie-layout";

/** An attribute value: a number, a string, polygon points or path data. */
export type AttributeValue = number | string | readonly Point[] | readonly PathCommand[];

export type Tag = "rect" | "line" | "circle" | "polygon" | "polyline" | "path" | "text";

/** One SVG element: its tag, its attributes in the order they are written, and its text. */
export interface Descriptor {
  readonly tag: Tag;
  readonly attrs: readonly (readonly [string, AttributeValue])[];
  readonly text: string | null;
}

type Attributes = (readonly [string, AttributeValue])[];

/** The stroke attributes: `stroke`, `stroke-width` and, unless it is `none`, `stroke-dasharray`. */
function strokeAttributes(stroke: string, width: number, dasharray: string): Attributes {
  const result: Attributes = [
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
 * The writer of one element's descriptors: each carries the element's
 * address, its geometric attributes, its paint and its opacity, in that
 * order (section 7.2).
 */
function writerOf(address: string, style: Style) {
  const tail: Attributes = style.opacity === 1 ? [] : [["opacity", style.opacity]];
  const w = style["stroke-width"];
  const none: Attributes = [["fill", "none"]];
  const stroked = strokeAttributes(style.stroke, w, style["stroke-dasharray"]);
  return {
    write: (
      tag: Tag,
      geometry: Attributes,
      paint: Attributes,
      text: string | null = null,
    ): Descriptor => ({
      tag,
      attrs: [["data-address", address], ...geometry, ...paint, ...tail],
      text,
    }),
    /** `fill` alone: a circle, a filled polygon, a text. */
    filled: [["fill", style.fill]] as Attributes,
    /** The stroke attributes alone: a line. */
    stroked,
    /** `fill="none"` and the stroke attributes: a path, a map. */
    open: [...none, ...stroked],
    /** `fill="none"`, the stroke at `w / 2` and no dash: the open arrowhead, the diamond, a chevron. */
    outline: [...none, ...strokeAttributes(style.stroke, w / 2, "none")],
  };
}

const points = (...corners: Point[]): Attributes => [["points", corners]];

/**
 * The descriptors of a line (sections 6.6, 7.2 and 8.3): its `<line>` to
 * where it stops, its start circle or left chevrons, its end or right
 * chevrons.
 */
function lineDescriptors(element: LineElement): Descriptor[] {
  const { xs, xe, y } = element;
  const { write, filled, stroked, outline } = writerOf(element.address, element.style);
  const w = element.style["stroke-width"];
  const circle = (cx: number) =>
    write(
      "circle",
      [
        ["cx", cx],
        ["cy", y],
        ["r", w],
      ],
      filled,
    );
  // `count` chevrons at `x`, pointing left (-1) or right (1), the inner one first: two where
  // a line runs on, three where its length is not known.
  const chevrons = (x: number, direction: -1 | 1, count: 2 | 3): Descriptor[] => {
    const at = (offset: number) => x + direction * offset;
    const half = 1.5 * w;
    return [
      [w, 2.5 * w],
      [2.5 * w, 4 * w],
      [4 * w, 5.5 * w],
    ]
      .slice(0, count)
      .map(([arm = 0, tip = 0]) =>
        write("polyline", points([at(arm), y - half], [at(tip), y], [at(arm), y + half]), outline),
      );
  };
  const arrowhead = points([xe + 3 * w, y], [xe, y - 1.5 * w], [xe, y + 1.5 * w]);
  const stop = element.end === "diamond" ? xe - 1.5 * w : xe;
  const line = write(
    "line",
    [
      ["x1", xs],
      ["y1", y],
      ["x2", stop],
      ["y2", y],
    ],
    stroked,
  );
  const start = element.start === "circle" ? [circle(xs)] : chevrons(xs, -1, 2);
  const end = (() => {
    switch (element.end) {
      case "arrowhead":
        return [write("polygon", arrowhead, filled)];
      case "open":
        return [write("polygon", arrowhead, outline)];
      case "circle":
        return [circle(xe)];
      case "diamond": {
        const half = times(6n, 5n, w);
        const diamond = points([stop, y], [xe, y - half], [xe + 1.5 * w, y], [xe, y + half]);
        return [write("polygon", diamond, outline)];
      }
      case "unknown":
        return chevrons(xe, 1, 3);
      case "chevrons":
        return chevrons(xe, 1, 2);
    }
  })();
  return [line, ...start, ...end];
}

function elementDescriptors(element: DrawnElement): Descriptor[] {
  if (element.type === "block") {
    // The background: its template, then `opacity`, and no address.
    const { style } = element;
    const attrs: Attributes = [
      ["x", 0],
      ["y", 0],
      ["width", element.width],
      ["height", element.height],
      ["rx", style.rx],
      ["fill", style.fill],
    ];
    if (style.opacity !== 1) attrs.push(["opacity", style.opacity]);
    return [{ tag: "rect", attrs, text: null }];
  }
  if (element.type === "timeline" || element.type === "child" || element.type === "ancestor") {
    return lineDescriptors(element);
  }
  const { style } = element;
  const { write, filled, stroked, open } = writerOf(element.address, style);
  switch (element.type) {
    case "group":
    case "card": {
      const rect = (x: number, y: number): Attributes => [
        ["x", x],
        ["y", y],
        ["width", element.width],
        ["height", element.height],
        ["rx", style.rx],
      ];
      const own = write("rect", rect(element.x, element.y), [...filled, ...stroked]);
      if (element.type === "group" || style.shadow === "none") return [own];
      const shadow = rect(element.x + SHADOW_OFFSET, element.y + SHADOW_OFFSET);
      return [write("rect", shadow, [["fill", style.shadow]]), own];
    }
    case "wedge": {
      const half = MARKER_BASE / 2;
      const { x, yt, yb } = element;
      return [write("polygon", points([x, yt], [x - half, yb], [x + half, yb]), filled)];
    }
    case "map": {
      const { xs, xe, yc } = element;
      const half = MAP_SPACING / 2;
      const outline = points([xs, yc - half], [xe, yc - half], [xe, yc + half], [xs, yc + half]);
      return [write("polygon", outline, open)];
    }
    case "region": {
      const d = brace(element.x1, element.x2, element.xm, element.yb, element.ya);
      return [write("path", [["d", d]], open)];
    }
    case "jump": {
      const shaft: PathCommand[] = [
        { command: "M", points: [element.start] },
        { command: "C", points: [element.c1, element.c2, element.base] },
      ];
      return [
        write("path", [["d", shaft]], open),
        write("polygon", points(element.tip, ...element.corners), filled),
      ];
    }
    case "break":
    case "boundary": {
      const { x, y1, y2 } = element;
      const geometry: Attributes = [
        ["x1", x],
        ["y1", y1],
        ["x2", x],
        ["y2", y2],
      ];
      return [write("line", geometry, stroked)];
    }
    case "name":
    case "label": {
      const geometry: Attributes = [
        ["x", element.x],
        ["y", element.baseline],
        ["text-anchor", element.anchor],
        ["font-size", style["font-size"]],
      ];
      return [write("text", geometry, filled, element.text)];
    }
  }
}

/** The descriptors of a drawing, in the order of its elements. */
export function toDescriptors(drawing: Drawing): Descriptor[] {
  return drawing.elements.flatMap(elementDescriptors);
}
