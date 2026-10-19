/**
 * `writeTikz(placed, options)`: the TikZ profile (`docs/drawing.md` in
 * timeskeleton, section 7.4).
 */

import { times } from "@timetoalign/tilie-layout";
import { type Descriptor, type PathCommand, type Point, toDescriptors } from "./descriptors.ts";
import { formatNumber, type Placed, page } from "./page.ts";

/** The TikZ options. */
export interface TikzOptions {
  /** A complete LuaLaTeX document (default), or the `tikzpicture` environment alone. */
  readonly standalone?: boolean;
  /** The directory holding `DejaVuSans.ttf`, `.` by default. */
  readonly fontDirectory?: string;
}

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
  const characters = Array.from(text);
  return characters
    .map((character, index) => {
      if (
        character === " " &&
        (index === 0 || index === characters.length - 1 || characters[index - 1] === " ")
      ) {
        return "\\ ";
      }
      return SPECIAL[character] ?? character;
    })
    .join("");
}

const colourName = (colour: string): string => `ts${colour.slice(1)}`;
const isColour = (value: string): boolean => value.startsWith("#");

/** `h(s)`, the line height of the drawing font at size `s`. */
const lineHeight = (size: number): number => (2384 * size) / 2048;

/** A `stroke-dasharray`, its numbers already written by the number rule, as a dash pattern. */
function dashPattern(value: string): string {
  const parts = value.split(" ");
  const list = parts.length % 2 === 1 ? [...parts, ...parts] : parts;
  return list.map((part, index) => `${index % 2 === 0 ? "on" : "off"} ${part}pt`).join(" ");
}

/** The options of a command, in the order of the descriptor's attributes. */
function options({ tag, attrs }: Descriptor): string[] {
  const result: string[] = [];
  for (const [name, value] of attrs) {
    if (name === "rx") result.push(`rounded corners=${formatNumber(value)}pt`);
    else if (name === "font-size") {
      result.push(
        `font=\\sffamily\\fontsize{${formatNumber(value)}}{${formatNumber(lineHeight(value))}}\\selectfont`,
      );
    } else if (name === "fill" && isColour(value)) {
      result.push(`${tag === "text" ? "text" : "fill"}=${colourName(value)}`);
    } else if (name === "stroke" && isColour(value)) result.push(`draw=${colourName(value)}`);
    else if (name === "stroke-width") result.push(`line width=${formatNumber(value)}pt`);
    else if (name === "stroke-dasharray") result.push(`dash pattern=${dashPattern(value)}`);
    else if (name === "opacity") result.push(`opacity=${formatNumber(value)}`);
  }
  return result;
}

/** A path's commands as TikZ path operations, each quadratic curve raised to a cubic one. */
function pathText(commands: readonly PathCommand[], point: (at: Point) => string): string {
  const parts: string[] = [];
  let current: Point = [0, 0];
  for (const item of commands) {
    switch (item.command) {
      case "M":
      case "L": {
        const [to] = item.points;
        parts.push(item.command === "M" ? point(to) : `-- ${point(to)}`);
        current = to;
        break;
      }
      case "C": {
        const [c1, c2, end] = item.points;
        parts.push(`.. controls ${point(c1)} and ${point(c2)} .. ${point(end)}`);
        current = end;
        break;
      }
      case "Q": {
        // `P0 + 2/3 × (C − P0)` and `P + 2/3 × (C − P)`, 2/3 formed before it multiplies.
        const [control, end] = item.points;
        const toward = ([x, y]: Point): Point => [
          x + times(2n, 3n, control[0] - x),
          y + times(2n, 3n, control[1] - y),
        ];
        const [c1, c2] = [toward(current), toward(end)];
        parts.push(`.. controls ${point(c1)} and ${point(c2)} .. ${point(end)}`);
        current = end;
        break;
      }
    }
  }
  return parts.join(" ");
}

/** One descriptor as one TikZ command, `height` the drawing's height. */
function command(descriptor: Descriptor, height: number): string {
  const point = ([x, y]: Point): string => `(${formatNumber(x)},${formatNumber(height - y)})`;
  const path = (text: string) => `\\path[${options(descriptor).join(",")}] ${text};`;
  switch (descriptor.tag) {
    case "rect": {
      const { x, y, width: w, height: h } = descriptor;
      return path(
        `(${formatNumber(x)},${formatNumber(height - y - h)}) rectangle (${formatNumber(x + w)},${formatNumber(height - y)})`,
      );
    }
    case "line":
      return path(
        `${point([descriptor.x1, descriptor.y1])} -- ${point([descriptor.x2, descriptor.y2])}`,
      );
    case "circle":
      return path(
        `${point([descriptor.cx, descriptor.cy])} circle[radius=${formatNumber(descriptor.r)}]`,
      );
    case "polygon":
      return path(`${descriptor.points.map(point).join(" -- ")} -- cycle`);
    case "polyline":
      return path(descriptor.points.map(point).join(" -- "));
    case "path":
      return path(pathText(descriptor.d, point));
    case "text": {
      const anchor = descriptor.anchor === "start" ? "base west" : "base";
      return `\\node[anchor=${anchor},inner sep=0,${options(descriptor).join(",")}] at ${point([descriptor.x, descriptor.y])} {${escapeTex(descriptor.text)}};`;
    }
  }
}

/** Write placed drawings as TikZ. */
export function writeTikz(placed: readonly Placed[], options_: TikzOptions = {}): string {
  const { standalone = true, fontDirectory = "." } = options_;
  const sheet = page(placed);
  const scopes = sheet.drawings.map((item) => ({ item, descriptors: toDescriptors(item.drawing) }));
  const colours = new Set<string>();
  for (const { descriptors } of scopes) {
    for (const descriptor of descriptors) {
      for (const [name, value] of descriptor.attrs) {
        if ((name === "fill" || name === "stroke") && isColour(value)) colours.add(value.slice(1));
      }
    }
  }
  const lines = [
    "\\begin{tikzpicture}[x=1pt,y=1pt,miter limit=4,font=\\sffamily]",
    ...[...colours].sort().map((digits) => `\\definecolor{ts${digits}}{HTML}{${digits}}`),
  ];
  for (const { item, descriptors } of scopes) {
    const y = sheet.height - item.pageY - item.drawing.height * item.scale;
    const scale = item.scale === 1 ? "" : `,scale=${formatNumber(item.scale)},transform shape`;
    lines.push(
      `\\begin{scope}[shift={(${formatNumber(item.pageX)},${formatNumber(y)})}${scale}]`,
      ...descriptors.map((descriptor) => command(descriptor, item.drawing.height)),
      "\\end{scope}",
    );
  }
  lines.push("\\end{tikzpicture}");
  const body = standalone
    ? [
        "\\documentclass{standalone}",
        "\\usepackage{fontspec}",
        `\\setsansfont{DejaVuSans.ttf}[Path=${fontDirectory}/,Kerning=Off,Ligatures={TeXOff,NoCommon}]`,
        "\\usepackage{tikz}",
        "\\begin{document}",
        ...lines,
        "\\end{document}",
      ]
    : lines;
  return `${body.join("\n")}\n`;
}
