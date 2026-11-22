/** Drawings of the fixtures and hand-built drawings for the writers. */

import {
  BUNDLE_ADDRESS,
  type ElementAddress,
  idAddress,
  type Part,
  partAddress,
} from "@timetoalign/tilie-core";
import {
  type Drawing,
  type DrawnElement,
  INITIAL_STYLE,
  type LineElement,
  type Style,
} from "@timetoalign/tilie-layout";

import type { Graphical } from "@timetoalign/timetoshare";

export {
  drawingsDirectory,
  fixturesDirectory,
  fontDirectory,
  inputsText,
  loadFixture,
  reviewCases,
} from "../scripts/review-cases.ts";

/** The address `{id}` with the part words `part`, built by core's address builders (section 2.2). */
export function at(id: string, ...part: Part[]): ElementAddress {
  return part.reduce(partAddress, idAddress(id));
}

/**
 * An application layer hiding every ancestor card (section 8.8), which the
 * defaults show: a drawing of a test whose subject is not the ancestor card
 * keeps the points derived without it, the cards taking no room.
 */
export const HIDDEN_ANCESTOR_CARDS: Graphical = {
  rules: [{ select: { element: "ancestor_card" }, set: { display: "none" } }],
};

export function style(changes: Partial<Style> = {}): Style {
  return { ...INITIAL_STYLE, ...changes };
}

/** A drawing `width` by `height` holding `elements` after its background. */
export function boxed(
  width: number,
  height: number,
  background: Style,
  ...elements: DrawnElement[]
): Drawing {
  return {
    width,
    height,
    origin: { x: 0, y: 0 },
    boxes: [],
    axes: [],
    elements: [
      { type: "block", address: BUNDLE_ADDRESS, style: background, width, height },
      ...elements,
    ],
    unmapped: [],
  };
}

/** A synthetic drawing of `height` 30 and width 60 holding `elements` after its block. */
export function synthetic(...elements: DrawnElement[]): Drawing {
  return boxed(60, 30, style(), ...elements);
}

const BLACK = style({ fill: "#000000" });
const CARD = style({
  fill: "#FFFFFF",
  stroke: "#C4C9D1",
  "stroke-width": 0.75,
  rx: 5,
  shadow: "#B8BEC8",
});
const LOGICAL = style({ stroke: "#00CC00", fill: "#00CC00", "stroke-width": 3 });

/**
 * The drawing of the timeline file `bare`, built from its derivation by hand
 * from the specification (tests/README.md).
 */
export function bare(): Drawing {
  const [x0, xe, y] = [49.5771484375, 449.5771484375, 22.40234375];
  // The coordinate label of `bare`'s named timestamp `id`: `origin` or `length`.
  const label = (id: string, x: number, text: string): DrawnElement => ({
    type: "label",
    address: at(id, "coordinate"),
    style: style({ fill: "#000000", "font-size": 9 }),
    x,
    baseline: 47.25634765625,
    anchor: "middle",
    text,
  });
  return boxed(
    476.5771484375,
    67.37890625,
    style({ fill: "#F3F4F6", rx: 10 }),
    {
      type: "card",
      address: at("bare", "card"),
      style: CARD,
      x: 8,
      y: 8,
      width: 458.5771484375,
      height: 49.37890625,
      shadowOffset: 2,
    },
    {
      type: "timeline",
      address: at("bare"),
      style: LOGICAL,
      xs: x0,
      xe,
      y,
      start: "circle",
      end: "arrowhead",
    },
    {
      type: "wedge",
      address: at("timestamp_1"),
      style: BLACK,
      x: x0,
      yt: 23.90234375,
      corners: [
        { dx: -3, y: 36.90234375 },
        { dx: 3, y: 36.90234375 },
      ],
    },
    {
      type: "wedge",
      address: at("timestamp_2"),
      style: BLACK,
      x: xe,
      yt: 23.90234375,
      corners: [
        { dx: -3, y: 36.90234375 },
        { dx: 3, y: 36.90234375 },
      ],
    },
    {
      type: "name",
      address: at("bare", "name"),
      style: style({ fill: "#000000", "font-size": 11 }),
      x: 16,
      baseline: 26.21044921875,
      anchor: "start",
      text: "Bare",
    },
    label("timestamp_1", x0, "0 ♩"),
    label("timestamp_2", xe, "8 ♩"),
  );
}

/** A line of `everything()`. */
function line(
  type: LineElement["type"],
  address: ElementAddress,
  [xs, xe, y]: readonly [number, number, number],
  start: LineElement["start"],
  end: LineElement["end"],
  changes: Partial<Style> = {},
): LineElement {
  return { type, address, style: { ...LOGICAL, ...changes }, xs, xe, y, start, end };
}

/**
 * A drawing holding every kind of element, with TeX specials, a code point
 * of DejaVu Sans (`♩`) and one only Noto Music draws (`𝅝`) in its texts.
 */
export function everything(): Drawing {
  const blue = { stroke: "#0050EF", fill: "#0050EF", "stroke-width": 2 };
  return boxed(
    200,
    130,
    style({ fill: "#F3F4F6", rx: 10 }),
    {
      type: "frame",
      address: at("g"),
      style: style({ fill: "#FFFFFF", stroke: "#D1D5DB", rx: 6 }),
      x: 8,
      y: 8,
      width: 184,
      height: 114,
      shadowOffset: 0,
    },
    {
      type: "name",
      address: at("g", "name"),
      style: style({ fill: "#000000", "font-size": 11 }),
      x: 16,
      baseline: 20,
      anchor: "start",
      text: " \\~^#$%&_{}  ♩ 𝅝 ",
    },
    {
      type: "card",
      address: at("c", "card"),
      style: CARD,
      x: 16,
      y: 26,
      width: 168,
      height: 88,
      shadowOffset: 2,
    },
    line("ancestor", at("a"), [40, 160, 40], "chevrons", "chevrons", { opacity: 0.35 }),
    line("timeline", at("c"), [52, 148, 56], "circle", "diamond"),
    line("child", at("d"), [60, 100, 68], "circle", "open", { ...blue, "stroke-dasharray": "3 3" }),
    line("child", at("e"), [100, 140, 74], "circle", "circle", blue),
    line("child", at("f"), [60, 120, 80], "circle", "arrowhead", blue),
    {
      type: "map",
      address: at("m"),
      style: style({ stroke: "#0050EF", "stroke-dasharray": "1 1" }),
      xs: 60,
      xe: 100,
      yc: 64,
      spacing: 2,
    },
    {
      type: "region",
      address: at("r"),
      style: style({ stroke: "#000000" }),
      x1: 60,
      x2: 100,
      xm: 80,
      yb: 90,
      ya: 96,
    },
    {
      type: "jump_from",
      address: at("j"),
      style: style({ stroke: "#000000", fill: "#000000" }),
      start: [70, 50],
      c1: [80, 44],
      c2: [100, 44],
      tip: [110, 50],
      base: [108, 48],
      corners: [
        [106, 50],
        [110, 46],
      ],
    },
    {
      type: "flow_marker",
      address: at("k"),
      style: style({ stroke: "#FF0000", "stroke-dasharray": "2" }),
      x: 120,
      y1: 30,
      y2: 110,
    },
    {
      type: "boundary",
      address: at("s", "start"),
      style: style({ stroke: "#000000" }),
      x: 90,
      y1: 52,
      y2: 60,
    },
    {
      type: "cross_section",
      address: at("t", "line"),
      style: style({ stroke: "#1BA1E2", "stroke-dasharray": "3 3" }),
      x: 70,
      y1: 56,
      y2: 34,
    },
    {
      type: "wedge",
      address: at("c", "start"),
      style: BLACK,
      x: 52,
      yt: 57.5,
      corners: [
        { dx: -3, y: 70.5 },
        { dx: 3, y: 70.5 },
      ],
    },
    {
      type: "label",
      address: at("c", "start", "label"),
      style: style({ fill: "#000000", "font-size": 9, opacity: 0.5 }),
      x: 52,
      baseline: 104,
      anchor: "middle",
      text: "0 ♩",
    },
  );
}
