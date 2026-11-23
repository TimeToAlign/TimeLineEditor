import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import {
  BUNDLE_ADDRESS,
  bandAddress,
  type ElementAddress,
  sameAddress,
} from "@timetoalign/tilie-core";
import { manifestElements, timelineAncestry } from "@timetoalign/tilie-core/drawing";
import { parseJson } from "@timetoalign/timetoshare";
import { describe, expect, it } from "vitest";
import {
  BOUNDARY,
  BRACE,
  CARD_SPACING,
  ELLIPSIS_GAP,
  ELLIPSIS_RADIUS,
  ELLIPSIS_SPACING,
  F,
  FLOW_MARKER_LABEL_OFFSET,
  FRAME_SPACING,
  G,
  JUMP_DEPTH,
  JUMP_PITCH,
  K,
  LABEL_GAP,
  MAP_GAP,
  MAP_SPACING,
  MARKER_BASE,
  MARKER_HEIGHT,
  P,
  Q,
  ROW_PITCH,
  SHADOW_OFFSET,
  STANDARD_GAP,
  TITLE_GAP,
} from "../src/constants.ts";
import { labelExtent } from "../src/fit.ts";
import {
  Cascade,
  DEFAULT_LAYER,
  DEFAULT_PLACEMENT,
  type Drawing,
  draw,
  type Style,
} from "../src/index.ts";
import { at, loadFile, metrics } from "./support.ts";

/** The drawing specification the installed TimeToShare package ships. */
const specification = path.join(
  path.dirname(createRequire(import.meta.url).resolve("@timetoalign/timetoshare/package.json")),
  "docs",
  "drawing.md",
);

/** The JSON block of the "Defaults" section of the drawing specification. */
function specifiedDefaults(file: string): unknown {
  const text = readFileSync(file, "utf8");
  const section = text.slice(text.indexOf("## 4. Defaults"));
  const start = section.indexOf("```json\n") + "```json\n".length;
  return parseJson(section.slice(start, section.indexOf("```", start)));
}

describe("DEFAULT_LAYER", () => {
  it("equals the JSON block of the specification", () => {
    expect(DEFAULT_LAYER).toEqual(specifiedDefaults(specification));
  });
});

/** The text of the section headed `heading` of the drawing specification, up to the next heading. */
function sectionOf(file: string, heading: string): string {
  const text = readFileSync(file, "utf8");
  const start = text.indexOf(`\n${heading}\n`);
  if (start === -1) throw new Error(`the specification has no section ${heading}`);
  const end = text.indexOf("\n#", start + heading.length + 2);
  return text.slice(start, end === -1 ? undefined : end);
}

/** The rows of the table of section 6.2, description to value, in the specification's order. */
function specifiedConstants(file: string): [string, string][] {
  return sectionOf(file, "### 6.2 Constants")
    .split("\n")
    .filter((line) => line.startsWith("| ") && !line.startsWith("| Constant |"))
    .map((line): [string, string] => {
      const [description, value] = line.slice(2, -2).split(" | ");
      if (description === undefined || value === undefined)
        throw new Error(`a row of section 6.2 has no value: ${line}`);
      return [description, value];
    });
}

describe("the constants", () => {
  // The label separation is the width of a label of width 0's extent (section 6.3).
  const [left, right] = labelExtent(0, 0);
  const expected: [string, string][] = [
    ["padding `P`", `${P}`],
    ["gap between the name column and the root's start `G`", `${G}`],
    ["gap between bands", "`S`"],
    ["row pitch `p`", `max(${ROW_PITCH} + S, h(s))`],
    ["map double-line spacing `d`", `${MAP_SPACING}`],
    ["map gap `g` (1.5 × d)", `${MAP_GAP}`],
    ["wedge: base, height", `${MARKER_BASE}, ${MARKER_HEIGHT}`],
    ["label gap (marker to label)", `${LABEL_GAP}`],
    ["label separation (horizontal, between labels)", `${right - left}`],
    ["brace height", `${BRACE}`],
    ["region row pitch `pr`", `${BRACE} + ${LABEL_GAP} + h(9) + S`],
    ["first jump depth", `${JUMP_DEPTH} + S`],
    ["jump row pitch `pj`", `${JUMP_PITCH} + S + h(9)`],
    ["flow-marker label offset", `${FLOW_MARKER_LABEL_OFFSET}`],
    ["boundary half-height `k`", `${BOUNDARY}`],
    ["group frame padding `Q`", `${Q}`],
    ["card padding `K`", `${K}`],
    ["gap after the manifest's title `F`", `${F}`],
    ["gap after a frame's title", `${TITLE_GAP}`],
    ["card shadow offset", `${SHADOW_OFFSET}`],
    ["standard gap of an elision", `${STANDARD_GAP}`],
    [
      "ellipsis: dot radius, dot spacing, narrowest gap drawing one",
      `${ELLIPSIS_RADIUS}, ${ELLIPSIS_SPACING}, ${ELLIPSIS_GAP}`,
    ],
  ];

  it("give every row of the table of section 6.2 its value", () => {
    expect(specifiedConstants(specification)).toEqual(expected);
  });

  it("make the map gap 1.5 times the map double-line spacing", () => {
    expect(MAP_GAP).toBe(1.5 * MAP_SPACING);
  });

  it("give the card's and the frame's default spacing as sections 6.2 and 8.6 state them", () => {
    expect(sectionOf(specification, "### 6.2 Constants")).toContain(
      `With the default \`S = ${CARD_SPACING}\``,
    );
    expect(sectionOf(specification, "### 8.6 Places")).toContain(
      `- \`spacing\`: ${FRAME_SPACING} for a frame, ${CARD_SPACING} for a card;`,
    );
  });

  it("give no wedge an initial rotation but 0, and the elision properties theirs, as section 2.5 states them", () => {
    expect(sectionOf(specification, "### 2.5 The cascade").replace(/\s+/g, " ")).toContain(
      "`max-width` `none`, `rotation` 0, `elision-mode` `auto`, `elision-proportion` `auto`, `elision-depths` `auto`, `elision-display` `ellipsis name`.",
    );
  });
});

describe("the default layer resolved", () => {
  const drawn = (name: string): Drawing =>
    draw(loadFile(name), DEFAULT_PLACEMENT, [DEFAULT_LAYER], metrics);
  /** The listed properties of every drawing of `address`, in drawing order. */
  const styles = (drawing: Drawing, address: ElementAddress, properties: (keyof Style)[]) =>
    drawing.elements
      .filter((item) => sameAddress(item.address, address))
      .map((item) => properties.map((property) => item.style[property]));

  it("draws bare's block and card", () => {
    const drawing = drawn("bare");
    expect(styles(drawing, BUNDLE_ADDRESS, ["fill", "rx", "shadow"])).toEqual([
      ["#F3F4F6", 10, "none"],
    ]);
    expect(
      styles(drawing, at("bare", "card"), [
        "fill",
        "stroke",
        "stroke-width",
        "rx",
        "shadow",
        "opacity",
      ]),
    ).toEqual([["#FFFFFF", "#C4C9D1", 0.75, 5, "#B8BEC8", 1]]);
    expect(styles(drawing, at("bare"), ["rx", "shadow"])).toEqual([[0, "none"]]);
  });

  it("fades an ancestor line, not its name, nor the ancestor card, and marks no member's ends there", () => {
    const drawing = drawn("groups/group_child_member");
    expect(styles(drawing, at("group_1"), ["fill", "stroke", "stroke-width", "rx"])).toEqual([
      ["#FFFFFF", "#D1D5DB", 1, 6],
    ]);
    // `piece` is drawn first whole in its ancestor card, nothing of it faded (section 8.8), then
    // as the ancestor line in `second-half`'s card.
    expect(
      styles(drawing, at("piece"), ["stroke", "stroke-width", "stroke-dasharray", "opacity"]),
    ).toEqual([
      ["#00CC00", 3, "none", 1],
      ["#00CC00", 3, "none", 0.35],
    ]);
    expect(styles(drawing, at("piece", "name"), ["fill", "font-size", "opacity"])).toEqual([
      ["#000000", 11, 1],
      ["#6B7280", 9, 1],
    ]);
    expect(
      styles(drawing, at("second-half", "name"), ["fill", "font-size", "max-width", "opacity"]),
    ).toEqual([
      ["#000000", 11, 160, 1],
      ["#000000", 11, 160, 1],
    ]);
    // No mark of the member's start or end on the ancestor line (section 8.3); the member's own
    // `origin` and `length` are not faded.
    for (const [end, own] of [
      ["start", "timestamp_3"],
      ["end", "timestamp_4"],
    ] as const) {
      expect(styles(drawing, at("second-half", end), ["fill", "opacity"])).toEqual([]);
      expect(styles(drawing, at(own), ["fill", "opacity"])).toEqual([
        ["#000000", 1],
        ["#000000", 1],
      ]);
      expect(
        styles(drawing, at("second-half", end, "label"), ["fill", "font-size", "opacity"]),
      ).toEqual([]);
      expect(styles(drawing, at(own, "coordinate"), ["fill", "font-size", "opacity"])).toEqual([
        ["#000000", 9, 1],
        ["#000000", 9, 1],
      ]);
    }
  });
});

describe("the default layer's bands", () => {
  /** The bands of a fixture hidden by the default layer alone, by address. */
  const hidden = (name: string) => {
    const manifest = loadFile(name);
    const cascade = new Cascade([DEFAULT_LAYER], timelineAncestry(manifest));
    return manifestElements(manifest)
      .filter((key) => key.type === "band" && cascade.resolve(key, undefined).display === "none")
      .map((key) => key.address);
  };
  const two = (id: string) => [bandAddress(id, "regions"), bandAddress(id, "flow_control")];

  it("hide the regions and flow control bands of every timeline held by a band", () => {
    expect(hidden("with_region")).toEqual([...two("clt_2"), ...two("clt_3")]);
    expect(hidden("unknown_length_segments")).toEqual([...two("a"), ...two("b"), ...two("c")]);
  });

  it("show the markers band of every timeline, so every named timestamp stays visible", () => {
    expect(hidden("timestamps")).toEqual([
      bandAddress("clt_2", "regions"),
      bandAddress("clt_2", "flow_control"),
    ]);
  });

  it("show every band of a member drawing's root, a member that is a child included", () => {
    // `second-half` is also a child row in `piece`'s ancestor card, where the bands of a child
    // are hidden as anywhere else; its own card shows every band.
    expect(hidden("groups/group_child_member")).toEqual(two("second-half"));
    expect(hidden("bare")).toEqual([]);
  });
});
