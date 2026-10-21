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

  it("fades an ancestor line, its marks and their labels, not its name", () => {
    const drawing = drawn("groups/group_child_member");
    expect(styles(drawing, at("group_1"), ["fill", "stroke", "stroke-width", "rx"])).toEqual([
      ["#FFFFFF", "#D1D5DB", 1, 6],
    ]);
    expect(
      styles(drawing, at("piece"), ["stroke", "stroke-width", "stroke-dasharray", "opacity"]),
    ).toEqual([["#00CC00", 3, "none", 0.35]]);
    expect(styles(drawing, at("piece", "name"), ["fill", "font-size", "opacity"])).toEqual([
      ["#6B7280", 9, 1],
    ]);
    expect(
      styles(drawing, at("second-half", "name"), ["fill", "font-size", "max-width", "opacity"]),
    ).toEqual([["#000000", 11, 160, 1]]);
    for (const end of ["start", "end"] as const) {
      const wedges = styles(drawing, at("second-half", end), ["fill", "opacity"]);
      expect(wedges.toSorted((a, b) => (a[1] as number) - (b[1] as number))).toEqual([
        ["#000000", 0.35],
        ["#000000", 1],
      ]);
      const labels = styles(drawing, at("second-half", end, "label"), [
        "fill",
        "font-size",
        "opacity",
      ]);
      expect(labels.toSorted((a, b) => (a[2] as number) - (b[2] as number))).toEqual([
        ["#000000", 9, 0.35],
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
  const three = (id: string) => [
    bandAddress(id, "markers"),
    bandAddress(id, "regions"),
    bandAddress(id, "flow_control"),
  ];

  it("hide the markers, regions and flow control bands of every timeline held by a band", () => {
    expect(hidden("with_region")).toEqual([...three("clt_2"), ...three("clt_3")]);
    expect(hidden("unknown_length_segments")).toEqual([
      ...three("a"),
      ...three("b"),
      ...three("c"),
    ]);
  });

  it("show every band of a member drawing's root, a member that is a child included", () => {
    expect(hidden("groups/group_child_member")).toEqual([]);
    expect(hidden("bare")).toEqual([]);
  });
});
