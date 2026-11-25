/**
 * An element, a container's record or a line's axis, drawn at its item's
 * place and shifted from the place origin into the block (`docs/drawing.md`
 * in TimeToShare, sections 8.4 and 8.6).
 */

import type { AxisWedge, DrawnAxis, DrawnBox } from "./boxes.ts";
import type { Style } from "./cascade.ts";
import type { DrawnElement, Point } from "./elements.ts";
import type { WedgeCorner } from "./rotation.ts";

/** A style at the scale `scale`: each of its lengths multiplied by it (section 8.6). */
export function scaledStyle(style: Style, scale: number): Style {
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

/** A wedge's corners at the scale `scale`: each offset across multiplied by it, each ordinate placed by `y`. */
function scaledCorners(
  [first, second]: readonly [WedgeCorner, WedgeCorner],
  scale: number,
  y: (v: number) => number,
): readonly [WedgeCorner, WedgeCorner] {
  return [
    { dx: scale * first.dx, y: y(first.y) },
    { dx: scale * second.dx, y: y(second.y) },
  ];
}

/**
 * An element drawn at `(dx, dy)` and the scale `scale`: each of its positions
 * `(u, v)` taken to `(dx + scale × u, dy + scale × v)` and each of its lengths
 * multiplied by `scale`. An item is drawn at its place so (section 8.6), and
 * every finished position in place coordinates is shifted into the block at
 * scale 1 (section 8.4), where a position becomes `u + dx` and no length changes.
 */
export function placedAt(element: DrawnElement, dx: number, dy: number, scale = 1): DrawnElement {
  const x = (u: number) => dx + scale * u;
  const y = (v: number) => dy + scale * v;
  const point = ([u, v]: Point): Point => [x(u), y(v)];
  if (element.type === "block") return element;
  const style = scaledStyle(element.style, scale);
  switch (element.type) {
    case "frame":
    case "card":
    case "ancestor_card":
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
      return {
        ...element,
        style,
        xs: x(element.xs),
        xe: x(element.xe),
        y: y(element.y),
        cuts: element.cuts.map(([left, right]) => [x(left), x(right)] as const),
      };
    case "map":
      return {
        ...element,
        style,
        xs: x(element.xs),
        xe: x(element.xe),
        yc: y(element.yc),
        spacing: scale * element.spacing,
        cuts: element.cuts.map(([left, right]) => [x(left), x(right)] as const),
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
        cuts: element.cuts.map(([left, right]) => [x(left), x(right)] as const),
      };
    case "jump":
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
    case "break":
    case "section_break":
    case "barline":
    case "boundary":
    case "cross_section":
      return { ...element, style, x: x(element.x), y1: y(element.y1), y2: y(element.y2) };
    case "alignment_anchor":
    case "leader":
      return {
        ...element,
        style,
        x1: x(element.x1),
        y1: y(element.y1),
        x2: x(element.x2),
        y2: y(element.y2),
      };
    case "wedge":
      return {
        ...element,
        style,
        x: x(element.x),
        yt: y(element.yt),
        corners: scaledCorners(element.corners, scale, y),
      };
    case "elision":
      return {
        ...element,
        style,
        x1: x(element.x1),
        x2: x(element.x2),
        yt: y(element.yt),
        yb: y(element.yb),
        continuations: element.continuations.map(y),
      };
    case "ellipsis":
      return {
        ...element,
        style,
        x: x(element.x),
        y: y(element.y),
        r: scale * element.r,
        spacing: scale * element.spacing,
      };
    case "name":
    case "label":
    case "symbol":
      return { ...element, style, x: x(element.x), baseline: y(element.baseline) };
    case "fork":
      return {
        ...element,
        style,
        stem: point(element.stem),
        point: point(element.point),
        branches: element.branches.map((branch) => ({
          ...branch,
          base: point(branch.base),
          tip: point(branch.tip),
          corners: [point(branch.corners[0]), point(branch.corners[1])] as const,
          tx: x(branch.tx),
          baseline: y(branch.baseline),
        })),
      };
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

/**
 * A line's axis drawn at `(dx, dy)` and the scale `scale`, as `placedAt` draws its line, and its
 * marker and its mark as `placedAt` draws a wedge and a cross-section line.
 */
export function placedAxis(axis: DrawnAxis, dx: number, dy: number, scale = 1): DrawnAxis {
  const { marker, mark } = axis;
  const y = (v: number) => dy + scale * v;
  const wedge = ({ yt, corners, style }: AxisWedge): AxisWedge => ({
    yt: y(yt),
    corners: scaledCorners(corners, scale, y),
    style: scaledStyle(style, scale),
  });
  return {
    ...axis,
    mark: mark === null ? null : wedge(mark),
    marker:
      marker === null
        ? null
        : {
            wedge: wedge(marker.wedge),
            crossSection: {
              span: { y1: y(marker.crossSection.span.y1), y2: y(marker.crossSection.span.y2) },
              gap:
                marker.crossSection.gap === null
                  ? null
                  : { y1: y(marker.crossSection.gap.y1), y2: y(marker.crossSection.gap.y2) },
              style: scaledStyle(marker.crossSection.style, scale),
            },
            descendants: marker.descendants,
          },
    timestamps: axis.timestamps.map(({ id, x, line, segment }) => ({
      id,
      x: dx + scale * x,
      line: line === null ? null : scaledStyle(line, scale),
      segment: { y1: y(segment.y1), y2: y(segment.y2) },
    })),
    xStart: dx + scale * axis.xStart,
    xEnd: dx + scale * axis.xEnd,
    line: dy + scale * axis.line,
    maps: axis.maps.map((map) => ({
      ...map,
      xs: dx + scale * map.xs,
      xe: dx + scale * map.xe,
      yc: dy + scale * map.yc,
    })),
  };
}
