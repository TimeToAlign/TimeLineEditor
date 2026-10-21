/**
 * An element, a container's record or a line's axis, drawn at its item's
 * place and shifted from the place origin into the box (`docs/drawing.md`
 * in TimeToShare, sections 8.4 and 8.6).
 */

import type { DrawnAxis, DrawnBox } from "./boxes.ts";
import type { Style } from "./cascade.ts";
import type { DrawnElement, Point } from "./elements.ts";

/** A style at the scale `scale`: each of its lengths multiplied by it (section 8.6). */
function scaledStyle(style: Style, scale: number): Style {
  if (scale === 1) return style;
  const dashes = style["stroke-dasharray"];
  const maxWidth = style["max-width"];
  return {
    ...style,
    "stroke-width": scale * style["stroke-width"],
    "stroke-dasharray":
      dashes === "none"
        ? dashes
        : dashes
            .split(" ")
            .map((dash) => String(scale * Number(dash)))
            .join(" "),
    "font-size": scale * style["font-size"],
    rx: scale * style.rx,
    "max-width": maxWidth === "none" ? maxWidth : scale * maxWidth,
  };
}

/**
 * An element drawn at `(dx, dy)` and the scale `scale`: each of its positions
 * `(u, v)` taken to `(dx + scale × u, dy + scale × v)` and each of its lengths
 * multiplied by `scale`. An item is drawn at its place so (section 8.6), and
 * every finished position in place coordinates is shifted into the box at
 * scale 1 (section 8.4), where a position becomes `u + dx` and no length changes.
 */
export function placedAt(element: DrawnElement, dx: number, dy: number, scale = 1): DrawnElement {
  const x = (u: number) => dx + scale * u;
  const y = (v: number) => dy + scale * v;
  const point = ([u, v]: Point): Point => [x(u), y(v)];
  if (element.type === "block") return element;
  const style = scaledStyle(element.style, scale);
  switch (element.type) {
    case "group":
    case "card":
      return {
        ...element,
        style,
        x: x(element.x),
        y: y(element.y),
        width: scale * element.width,
        height: scale * element.height,
        shadowOffset: scale * element.shadowOffset,
      };
    case "timeline":
    case "child":
    case "ancestor":
      return { ...element, style, xs: x(element.xs), xe: x(element.xe), y: y(element.y) };
    case "map":
      return {
        ...element,
        style,
        xs: x(element.xs),
        xe: x(element.xe),
        yc: y(element.yc),
        spacing: scale * element.spacing,
      };
    case "region":
      return {
        ...element,
        style,
        x1: x(element.x1),
        x2: x(element.x2),
        xm: x(element.xm),
        yb: y(element.yb),
        ya: y(element.ya),
      };
    case "jump_from":
      return {
        ...element,
        style,
        start: point(element.start),
        c1: point(element.c1),
        c2: point(element.c2),
        tip: point(element.tip),
        base: point(element.base),
        corners: [point(element.corners[0]), point(element.corners[1])],
      };
    case "flow_marker":
    case "boundary":
      return { ...element, style, x: x(element.x), y1: y(element.y1), y2: y(element.y2) };
    case "wedge":
      return {
        ...element,
        style,
        x: x(element.x),
        yt: y(element.yt),
        yb: y(element.yb),
        base: scale * element.base,
      };
    case "name":
    case "label":
      return { ...element, style, x: x(element.x), baseline: y(element.baseline) };
  }
}

/**
 * A container's record drawn at `(dx, dy)` and the scale `scale`, as
 * `placedAt` draws a frame or a card: its `x` and `y`, and a band's `line`,
 * taken to `dx + scale × x`, `dy + scale × y` and `dy + scale × line`, its
 * `width` and `height` multiplied by `scale`. Its range and what it states
 * stay as they are.
 */
export function placedBox(box: DrawnBox, dx: number, dy: number, scale = 1): DrawnBox {
  const placed = {
    ...box,
    x: dx + scale * box.x,
    y: dy + scale * box.y,
    width: scale * box.width,
    height: scale * box.height,
  };
  return box.band === undefined
    ? placed
    : { ...placed, band: { ...box.band, line: dy + scale * box.band.line } };
}

/** A line's axis drawn at `(dx, dy)` and the scale `scale`, as `placedAt` draws its line. */
export function placedAxis(axis: DrawnAxis, dx: number, dy: number, scale = 1): DrawnAxis {
  return {
    ...axis,
    xStart: dx + scale * axis.xStart,
    xEnd: dx + scale * axis.xEnd,
    line: dy + scale * axis.line,
  };
}
