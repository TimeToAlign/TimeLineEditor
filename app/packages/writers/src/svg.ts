/**
 * `writeSvg(geometry, options)`: the SVG profile of the geometry
 * specification (`docs/geometry.md` in timeskeleton, section 8.4).
 */

import type { JsonObject, Rational } from "@timetoalign/tilie-core";
import type { LosslessGeometry } from "@timetoalign/tilie-layout";
import {
  exact,
  fmt,
  INNER_SEP,
  labelPoint,
  labelText,
  MARGIN,
  type PageOptions,
  type PlacedBlock,
  page,
  q,
} from "./page.ts";

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Path data: each command letter followed by its coordinates, separated by single spaces. */
function path(...segments: readonly (readonly [string, ...Rational[]])[]): string {
  return segments
    .map(([command, ...values]) => `${command}${values.map((value) => fmt(value)).join(" ")}`)
    .join("");
}

function stroke(colour: string, pattern: unknown): string {
  const dash =
    pattern === "dotted"
      ? ' stroke-dasharray="0.8 1"'
      : pattern === "dashed"
        ? ' stroke-dasharray="3 3"'
        : "";
  return `stroke="${colour}" stroke-width="0.8"${dash}`;
}

/** The elements of one primitive. */
function primitive(item: JsonObject, block: PlacedBlock): string[] {
  const colour = item.colour as string;
  const pattern = item.line_pattern;
  switch (item.kind) {
    case "timeline":
    case "child": {
      const xs = block.rootX(item.start);
      const xe = block.rootX(item.end);
      const y = block.y([item.row, 1]);
      const circle = `<circle cx="${fmt(xs)}" cy="${fmt(y)}" r="2" fill="${colour}"/>`;
      if (item.kind === "timeline") {
        return [
          `<line x1="${fmt(xs)}" y1="${fmt(y)}" x2="${fmt(xe.subtract(q(4)))}" y2="${fmt(y)}" ${stroke(colour, pattern)}/>`,
          circle,
          `<path d="${path(["M", xe, y], ["L", xe.subtract(q(6)), y.subtract(q(2))], ["L", xe.subtract(q(4)), y], ["L", xe.subtract(q(6)), y.add(q(2))], ["Z"])}" fill="${colour}"/>`,
        ];
      }
      return [
        `<line x1="${fmt(xs)}" y1="${fmt(y)}" x2="${fmt(xe.subtract(q(3)))}" y2="${fmt(y)}" ${stroke(colour, pattern)}/>`,
        circle,
        `<path d="${path(["M", xe.subtract(q(3)), y], ["L", xe, y.subtract(q(2))], ["L", xe.add(q(3)), y], ["L", xe, y.add(q(2))], ["Z"])}" fill="none" stroke="${colour}" stroke-width="0.8"/>`,
      ];
    }
    case "map": {
      const xs = block.rootX(item.start);
      const xe = block.rootX(item.end);
      const y = block.y([item.row, 1]);
      const left = xs.compare(xe) <= 0 ? xs : xe;
      const span = xs.compare(xe) <= 0 ? xe.subtract(xs) : xs.subtract(xe);
      return [
        `<rect x="${fmt(left)}" y="${fmt(y.subtract(q(2)))}" width="${fmt(span)}" height="4" fill="none" ${stroke(colour, pattern)}/>`,
      ];
    }
    case "region": {
      const [move, ...rest] = brace(item, block);
      const segments = rest.map(([command, ...points]): readonly [string, ...Rational[]] => [
        command,
        ...points.flat(),
      ]);
      return [
        `<path d="${path(["M", ...(move as Point)], ...segments)}" fill="none" ${stroke(colour, pattern)}/>`,
      ];
    }
    case "jump": {
      const { start, first, second, end } = arc(item, block);
      const [x, y] = end;
      const up = second[1].compare(y) > 0;
      const d = up ? q(1) : q(-1);
      return [
        `<path d="${path(["M", ...start], ["C", ...first, ...second, ...end])}" fill="none" ${stroke(colour, pattern)}/>`,
        `<path d="${path(["M", x, y], ["L", x.subtract(q(2)), y.add(d.multiply(q(6)))], ["L", x, y.add(d.multiply(q(4)))], ["L", x.add(q(2)), y.add(d.multiply(q(6)))], ["Z"])}" fill="${colour}"/>`,
      ];
    }
    case "break": {
      const x = block.rootX(item.at);
      return [
        `<line x1="${fmt(x)}" y1="${fmt(block.y(item.top))}" x2="${fmt(x)}" y2="${fmt(block.y(item.bottom))}" ${stroke(colour, pattern)}/>`,
      ];
    }
    case "wedge": {
      const x = block.rootX(item.at);
      const tip = block.y(item.tip);
      const base = block.y(item.base);
      return [
        `<path d="${path(["M", x, tip], ["L", x.subtract(q(3)), base], ["L", x.add(q(3)), base], ["Z"])}" fill="${colour}"/>`,
      ];
    }
    case "label": {
      const text = labelText(item, block);
      if (text === undefined) return [];
      const [x, y] = labelPoint(item, block);
      const anchor = item.anchor as string;
      const [textAnchor, tx] = anchor.includes("west")
        ? ["start", x.add(INNER_SEP)]
        : anchor.includes("east")
          ? ["end", x.subtract(INNER_SEP)]
          : ["middle", x];
      const baseline = anchor.startsWith("north")
        ? y.add(q(29, 4n))
        : anchor.startsWith("south")
          ? y.subtract(q(15, 4n))
          : anchor.startsWith("base")
            ? y
            : y.add(q(7, 4n));
      const rotate =
        item.rotate === undefined
          ? ""
          : ` transform="rotate(${fmt(exact(item.rotate).multiply(q(-1)))} ${fmt(x)} ${fmt(y)})"`;
      return [
        `<text x="${fmt(tx)}" y="${fmt(baseline)}" text-anchor="${textAnchor}"${rotate} fill="${colour}">${escapeXml(text)}</text>`,
      ];
    }
    default:
      return [];
  }
}

export type Point = readonly [Rational, Rational];

/**
 * The brace of a region in page coordinates: the start point, then each
 * segment as `["Q", control, end]` or `["L", end]`.
 */
export function brace(
  item: JsonObject,
  block: PlacedBlock,
): [Point, ...(readonly ["Q", Point, Point] | readonly ["L", Point])[]] {
  const x1 = block.rootX(item.start);
  const x2 = block.rootX(item.end);
  const yb = block.y(item.base);
  const ya = block.y(item.apex);
  const half = q(1, 2n);
  const ym = yb.add(ya).multiply(half);
  const difference = ya.subtract(yb);
  const k = (difference.compare(q(0)) < 0 ? difference.multiply(q(-1)) : difference).multiply(half);
  const xm = x1.add(x2).multiply(half);
  return [
    [x1, yb],
    ["Q", [x1, ym], [x1.add(k), ym]],
    ["L", [xm.subtract(k), ym]],
    ["Q", [xm, ym], [xm, ya]],
    ["Q", [xm, ym], [xm.add(k), ym]],
    ["L", [x2.subtract(k), ym]],
    ["Q", [x2, ym], [x2, yb]],
  ];
}

/** The arc of a jump in page coordinates: a cubic Bézier curve through its apex halfway. */
export function arc(
  item: JsonObject,
  block: PlacedBlock,
): { start: Point; first: Point; second: Point; end: Point } {
  const from = block.rootX(item.from);
  const to = block.rootX(item.to);
  const base = exact(item.base);
  const control = base.add(exact(item.apex).subtract(base).multiply(q(4, 3n)));
  const yb = block.y(item.base);
  const yc = block.y([control.numerator, control.denominator]);
  return { start: [from, yb], first: [from, yc], second: [to, yc], end: [to, yb] };
}

/** Write a geometry as SVG text. */
export function writeSvg(geometry: LosslessGeometry, options: PageOptions = {}): string {
  const placed = page(geometry, options, false);
  const width = placed.width.add(MARGIN).add(MARGIN);
  const height = placed.height.add(MARGIN).add(MARGIN);
  const lines = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(width)}" height="${fmt(height)}" viewBox="${fmt(MARGIN.multiply(q(-1)))} ${fmt(MARGIN.multiply(q(-1)))} ${fmt(width)} ${fmt(height)}" font-family="DejaVu Sans, sans-serif" font-size="7">`,
  ];
  for (const block of placed.blocks) {
    lines.push(
      `<rect x="0" y="${fmt(block.top)}" width="${fmt(placed.width)}" height="${fmt(block.bottom.subtract(block.top))}" fill="${block.block.background as string}"/>`,
    );
    for (const item of block.primitives) lines.push(...primitive(item, block));
  }
  lines.push("</svg>");
  return `${lines.join("\n")}\n`;
}
