/**
 * `toDescriptors(drawing)`: the SVG element descriptors of one drawing
 * (`docs/drawing.md` in timeskeleton, section 7.2). An editor renders these
 * descriptors on screen; the SVG and TikZ writers serialize them.
 */

import type { Drawing, DrawnElement, Style } from "@timetoalign/tilie-layout";
import { MAP_SPACING, MARKER_BASE } from "@timetoalign/tilie-layout";
import { formatNumber } from "./page.ts";

export type Point = readonly [number, number];

/** One path command and its points, in the order they are written. */
export interface PathCommand {
  readonly command: "M" | "C" | "Q" | "L";
  readonly points: readonly Point[];
}

/** An attribute value: a number, a string, polygon points or path data. */
export type AttributeValue = number | string | readonly Point[] | readonly PathCommand[];

export type Tag = "rect" | "line" | "circle" | "polygon" | "path" | "text";

/** One SVG element: its tag, its attributes in the order they are written, and its text. */
export interface Descriptor {
  readonly tag: Tag;
  readonly attrs: readonly (readonly [string, AttributeValue])[];
  readonly text: string | null;
}

type Attributes = [string, AttributeValue][];

function strokeAttributes(style: Style, width = style["stroke-width"], dash = true): Attributes {
  const result: Attributes = [
    ["stroke", style.stroke],
    ["stroke-width", width],
  ];
  if (dash && style["stroke-dasharray"] !== "none") {
    const dashes = style["stroke-dasharray"].split(" ");
    result.push(["stroke-dasharray", dashes.map((part) => formatNumber(Number(part))).join(" ")]);
  }
  return result;
}

function opacity(style: Style): Attributes {
  return style.opacity === 1 ? [] : [["opacity", style.opacity]];
}

function descriptor(tag: Tag, attrs: Attributes, text: string | null = null): Descriptor {
  return { tag, attrs, text };
}

/** The brace from `x1` to `x2`, arms at `yb`, tip at `ya`. */
function brace(x1: number, x2: number, xm: number, yb: number, ya: number): PathCommand[] {
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

function elementDescriptors(element: DrawnElement): Descriptor[] {
  const { style } = element;
  if (element.type === "block") {
    return [
      descriptor("rect", [
        ["x", 0],
        ["y", 0],
        ["width", element.width],
        ["height", element.height],
        ["rx", style.rx],
        ["fill", style.fill],
        ...opacity(style),
      ]),
    ];
  }
  const address: [string, AttributeValue] = ["data-address", element.address];
  const line = (x1: number, y1: number, x2: number, y2: number): Descriptor =>
    descriptor("line", [
      address,
      ["x1", x1],
      ["y1", y1],
      ["x2", x2],
      ["y2", y2],
      ...strokeAttributes(style),
      ...opacity(style),
    ]);
  const filled = (points: readonly Point[]): Descriptor =>
    descriptor("polygon", [address, ["points", points], ["fill", style.fill], ...opacity(style)]);
  switch (element.type) {
    case "timeline":
    case "child": {
      const { xs, xe, y } = element;
      const w = style["stroke-width"];
      const circle = descriptor("circle", [
        address,
        ["cx", xs],
        ["cy", y],
        ["r", w],
        ["fill", style.fill],
        ...opacity(style),
      ]);
      if (element.type === "timeline") {
        return [
          line(xs, y, xe - 3 * w, y),
          circle,
          filled([
            [xe, y],
            [xe - 3 * w, y - 1.5 * w],
            [xe - 3 * w, y + 1.5 * w],
          ]),
        ];
      }
      return [
        line(xs, y, xe - 1.5 * w, y),
        circle,
        descriptor("polygon", [
          address,
          [
            "points",
            [
              [xe - 1.5 * w, y],
              [xe, y - 1.2 * w],
              [xe + 1.5 * w, y],
              [xe, y + 1.2 * w],
            ],
          ],
          ["fill", "none"],
          ...strokeAttributes(style, w / 2, false),
          ...opacity(style),
        ]),
      ];
    }
    case "wedge": {
      const half = MARKER_BASE / 2;
      return [
        descriptor("polygon", [
          address,
          [
            "points",
            [
              [element.x, element.yt],
              [element.x - half, element.yb],
              [element.x + half, element.yb],
            ],
          ],
          ["fill", style.fill],
          ...opacity(style),
        ]),
      ];
    }
    case "map": {
      const half = MAP_SPACING / 2;
      return [
        line(element.xs, element.y - half, element.xe, element.y - half),
        line(element.xs, element.y + half, element.xe, element.y + half),
      ];
    }
    case "region":
      return [
        descriptor("path", [
          address,
          ["d", brace(element.x1, element.x2, element.xm, element.yb, element.ya)],
          ["fill", "none"],
          ...strokeAttributes(style),
          ...opacity(style),
        ]),
      ];
    case "jump": {
      const { xFrom, xTo, yf, yc, yo } = element;
      const w = style["stroke-width"];
      return [
        descriptor("path", [
          address,
          [
            "d",
            [
              { command: "M", points: [[xFrom, yf]] },
              {
                command: "C",
                points: [
                  [xFrom, yc],
                  [xTo, yc],
                  [xTo, yf],
                ],
              },
            ],
          ],
          ["fill", "none"],
          ...strokeAttributes(style),
          ...opacity(style),
        ]),
        filled([
          [xTo, yf],
          [xTo - 2 * w, yo],
          [xTo + 2 * w, yo],
        ]),
      ];
    }
    case "break":
      return [line(element.x, element.y1, element.x, element.y2)];
    case "name":
    case "label":
      return [
        descriptor(
          "text",
          [
            address,
            ["x", element.x],
            ["y", element.baseline],
            ["text-anchor", element.anchor],
            ["font-size", style["font-size"]],
            ["fill", style.fill],
            ...opacity(style),
          ],
          element.text,
        ),
      ];
  }
}

/** The descriptors of a drawing, in the order of its elements. */
export function toDescriptors(drawing: Drawing): Descriptor[] {
  return drawing.elements.flatMap(elementDescriptors);
}
