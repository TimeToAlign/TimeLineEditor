/**
 * `writeTikz(geometry, options)`: the TikZ profile of the geometry
 * specification (`docs/geometry.md` in timeskeleton, section 8.5).
 */

import type { JsonObject, Rational } from "@timetoalign/tilie-core";
import type { LosslessGeometry } from "@timetoalign/tilie-layout";
import {
  exact,
  fmt,
  labelPoint,
  labelText,
  type PageOptions,
  type PlacedBlock,
  page,
  q,
} from "./page.ts";
import { arc, brace, type Point } from "./svg.ts";

/** The TikZ options: the page, and whether to write a complete LuaLaTeX document. */
export interface TikzOptions extends PageOptions {
  /** A complete `standalone` document (default), or the `tikzpicture` alone. */
  readonly standalone?: boolean;
}

const PREAMBLE = [
  "\\documentclass{standalone}",
  "\\usepackage{fontspec}",
  "\\setsansfont{DejaVu Sans}",
  "\\usepackage{tikz}",
  "\\usetikzlibrary{arrows.meta}",
  "\\begin{document}",
];

const STEALTH = "Stealth[length=6pt,width=4pt,inset=2pt]";

const SPECIAL: Readonly<Record<string, string>> = {
  "\\": "\\textbackslash{}",
  "~": "\\textasciitilde{}",
  "^": "\\textasciicircum{}",
  "#": "\\#",
  $: "\\$",
  "%": "\\%",
  "&": "\\&",
  _: "\\_",
  "{": "\\{",
  "}": "\\}",
};

function escapeTex(text: string): string {
  return Array.from(text, (character) => SPECIAL[character] ?? character).join("");
}

const colourName = (colour: string): string => `ts${colour.slice(1)}`;

const point = ([x, y]: Point): string => `(${fmt(x)},${fmt(y)})`;

function pattern(value: unknown): string {
  return value === "dotted" ? ",densely dotted" : value === "dashed" ? ",dashed" : "";
}

/** The command of one primitive, or none. */
function command(item: JsonObject, block: PlacedBlock): string | undefined {
  const c = colourName(item.colour as string);
  const style = `${c}${pattern(item.line_pattern)}`;
  switch (item.kind) {
    case "timeline":
    case "child": {
      const y = block.y([item.row, 1]);
      const from = point([block.rootX(item.start), y]);
      const to = point([block.rootX(item.end), y]);
      const tips =
        item.kind === "timeline"
          ? `{Circle[length=4pt]}-{${STEALTH}},shorten <=-2pt`
          : "{Circle[length=4pt]}-{Diamond[open,length=6pt,width=4pt]},shorten <=-2pt,shorten >=-3pt";
      return `\\draw[${style},${tips}] ${from} -- ${to};`;
    }
    case "map": {
      const y = block.y([item.row, 1]);
      return `\\draw[${style}] ${point([block.rootX(item.start), y.subtract(q(2))])} rectangle ${point([block.rootX(item.end), y.add(q(2))])};`;
    }
    case "region": {
      const [start, ...segments] = brace(item, block);
      let current = start;
      const parts = [point(start)];
      for (const segment of segments) {
        if (segment[0] === "L") {
          parts.push(`-- ${point(segment[1])}`);
          current = segment[1];
        } else {
          const [, control, end] = segment;
          const twoThirds = q(2, 3n);
          const toward = (from: Point): Point => [
            from[0].add(control[0].subtract(from[0]).multiply(twoThirds)),
            from[1].add(control[1].subtract(from[1]).multiply(twoThirds)),
          ];
          parts.push(
            `.. controls ${point(toward(current))} and ${point(toward(end))} .. ${point(end)}`,
          );
          current = end;
        }
      }
      return `\\draw[${style}] ${parts.join(" ")};`;
    }
    case "jump": {
      const { start, first, second, end } = arc(item, block);
      return `\\draw[${style},-{${STEALTH}}] ${point(start)} .. controls ${point(first)} and ${point(second)} .. ${point(end)};`;
    }
    case "break": {
      const x = block.rootX(item.at);
      return `\\draw[${style}] ${point([x, block.y(item.bottom)])} -- ${point([x, block.y(item.top)])};`;
    }
    case "wedge": {
      const x = block.rootX(item.at);
      const base = block.y(item.base);
      return `\\fill[${c}] ${point([x, block.y(item.tip)])} -- ${point([x.subtract(q(3)), base])} -- ${point([x.add(q(3)), base])} -- cycle;`;
    }
    case "label": {
      const text = labelText(item, block);
      if (text === undefined) return undefined;
      const rotate =
        item.rotate === undefined ? "" : `,rotate=${fmt(exact(item.rotate) as Rational)}`;
      return `\\node[anchor=${item.anchor as string}${rotate},text=${c}] at ${point(labelPoint(item, block))} {${escapeTex(text)}};`;
    }
    default:
      return undefined;
  }
}

/** Write a geometry as TikZ text. */
export function writeTikz(geometry: LosslessGeometry, options: TikzOptions = {}): string {
  const placed = page(geometry, options, true);
  const colours = new Set<string>();
  for (const block of placed.blocks) {
    colours.add(block.block.background as string);
    for (const item of block.primitives) colours.add(item.colour as string);
  }
  const lines = [
    "\\begin{tikzpicture}[x=1pt,y=1pt,line width=0.8pt,inner sep=2pt,font=\\sffamily\\fontsize{7}{8.4}\\selectfont]",
    ...[...colours]
      .map((colour) => colour.slice(1))
      .sort()
      .map((hex) => `\\definecolor{ts${hex}}{HTML}{${hex}}`),
  ];
  for (const block of placed.blocks) {
    lines.push(
      `\\fill[${colourName(block.block.background as string)}] (0,${fmt(block.bottom)}) rectangle (${fmt(placed.width)},${fmt(block.top)});`,
    );
    for (const item of block.primitives) {
      const line = command(item, block);
      if (line !== undefined) lines.push(line);
    }
  }
  lines.push("\\end{tikzpicture}");
  const standalone = options.standalone ?? true;
  return `${[...(standalone ? PREAMBLE : []), ...lines, ...(standalone ? ["\\end{document}"] : [])].join("\n")}\n`;
}
