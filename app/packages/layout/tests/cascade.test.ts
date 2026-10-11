import { manifestElements } from "@timetoalign/tilie-core";
import type { Graphical, Selector } from "@timetoalign/timeskeleton";
import { describe, expect, it } from "vitest";
import { Cascade, DEFAULT_PLACEMENT, draw, type ElementKey, INITIAL_STYLE } from "../src/index.ts";
import { drawFixture, element, load, manifestNames, metrics } from "./support.ts";

// A child `c` of a root `r`: the key of its line.
const ancestry = new Map<string, readonly string[]>([
  ["r", ["r"]],
  ["c", ["r", "c"]],
]);
const key: ElementKey = {
  type: "child",
  address: "c",
  timeline: "c",
  domain: "logical",
  modality: "continuous",
  class: "ContinuousLogicalTimeline",
};
const ALL: Selector = {
  ids: ["c"],
  within: "c",
  class: "ContinuousLogicalTimeline",
  element: "child",
  domain: "logical",
  modality: "continuous",
};

function stroke(layers: Graphical[]): string {
  return new Cascade(layers, ancestry).resolve(key, undefined).stroke;
}
const statement = (select: Selector, colour: string) => ({ select, set: { stroke: colour } });
const winnerFirst = (winner: Selector, loser: Selector): Graphical[] => [
  { statements: [statement(winner, "#111111"), statement(loser, "#222222")] },
];

describe("rank", () => {
  it("1. a later layer outranks every statement of an earlier one", () => {
    expect(
      stroke([
        { statements: [statement(ALL, "#222222")] },
        { statements: [statement({}, "#111111")] },
      ]),
    ).toBe("#111111");
  });

  it("2. ids outrank within, class, element, domain and modality", () => {
    const { ids: _, ...rest } = ALL;
    expect(stroke(winnerFirst({ ids: ["c"] }, rest))).toBe("#111111");
  });

  it("3. a deeper within outranks a shallower one with every lower member", () => {
    const { ids: _, within: __, ...rest } = ALL;
    expect(stroke(winnerFirst({ within: "c" }, { ...rest, within: "r" }))).toBe("#111111");
  });

  it("4. class outranks element, domain and modality", () => {
    expect(
      stroke(
        winnerFirst(
          { class: "ContinuousLogicalTimeline" },
          { element: "child", domain: "logical", modality: "continuous" },
        ),
      ),
    ).toBe("#111111");
  });

  it("5. element outranks domain and modality", () => {
    expect(
      stroke(winnerFirst({ element: "child" }, { domain: "logical", modality: "continuous" })),
    ).toBe("#111111");
  });

  it("6. more of domain and modality outranks fewer", () => {
    expect(
      stroke(winnerFirst({ domain: "logical", modality: "continuous" }, { domain: "logical" })),
    ).toBe("#111111");
    expect(stroke(winnerFirst({ modality: "continuous" }, {}))).toBe("#111111");
  });

  it("7. of two equal statements the later wins", () => {
    expect(stroke(winnerFirst({ element: "child" }, { element: "child" }))).toBe("#222222");
  });

  it("sets a named style, and nothing for a missing name", () => {
    const layer: Graphical = {
      styles: { mine: { stroke: "#333333" } },
      statements: [
        { select: {}, set: { stroke: "#111111" } },
        { select: { element: "child" }, set: "mine" },
        { select: { ids: ["c"] }, set: "missing" },
      ],
    };
    expect(stroke([layer])).toBe("#333333");
  });

  it("matches nothing with a within outside the manifest", () => {
    expect(stroke([{ statements: [statement({ within: "elsewhere" }, "#111111")] }])).toBe("none");
  });

  it("never matches the block with domain, class, ids or within", () => {
    const block: ElementKey = {
      type: "block",
      address: null,
      timeline: null,
      domain: null,
      modality: null,
      class: null,
    };
    const cascade = new Cascade(
      [
        {
          statements: [
            statement({ domain: "logical" }, "#111111"),
            statement({ ids: ["c"] }, "#111111"),
            statement({ within: "r" }, "#111111"),
            statement({ class: "ContinuousLogicalTimeline" }, "#111111"),
          ],
        },
      ],
      ancestry,
    );
    expect(cascade.resolve(block, undefined).stroke).toBe("none");
  });
});

describe("inheritance", () => {
  it("gives every element the initial values without layers", () => {
    const drawing = draw(load("with_region"), DEFAULT_PLACEMENT, [], metrics);
    for (const item of drawing.elements)
      expect(item.style, String(item.address)).toEqual(INITIAL_STYLE);
  });

  it("inherits fill from the block, never opacity or rx", () => {
    const drawing = draw(
      load("bare"),
      DEFAULT_PLACEMENT,
      [
        {
          statements: [
            { select: { element: "block" }, set: { fill: "#111111", opacity: 0.5, rx: 4 } },
          ],
        },
      ],
      metrics,
    );
    expect(element(drawing, null).style).toMatchObject({ fill: "#111111", opacity: 0.5, rx: 4 });
    expect(element(drawing, "bare").style).toMatchObject({ fill: "#111111", opacity: 1, rx: 0 });
  });

  it("passes a root's stroke to its child and grandchild", () => {
    const drawing = draw(
      load("nested"),
      DEFAULT_PLACEMENT,
      [{ statements: [{ select: { ids: ["clt_1"] }, set: { stroke: "#123456" } }] }],
      metrics,
    );
    expect(element(drawing, "clt_3").style.stroke).toBe("#123456");
    expect(element(drawing, "clt_2").style.stroke).toBe("#123456");
  });

  it("passes a timeline's stroke width to its map, which has no name", () => {
    const drawing = draw(
      load("map"),
      DEFAULT_PLACEMENT,
      [{ statements: [{ select: { ids: ["melody"] }, set: { "stroke-width": 7 } }] }],
      metrics,
    );
    expect(element(drawing, "tempo").style["stroke-width"]).toBe(7);
    expect(drawing.elements.some((item) => item.address === "tempo/name")).toBe(false);
  });

  it("passes a region's font size to its label", () => {
    const drawing = draw(
      load("with_region"),
      DEFAULT_PLACEMENT,
      [{ statements: [{ select: { element: "region" }, set: { "font-size": 13 } }] }],
      metrics,
    );
    expect(element(drawing, "region_1/label").style["font-size"]).toBe(13);
  });
});

describe("maps by target unit", () => {
  const name = "conversion_maps__maps_quarters";

  it("draws a map in the domain and modality it converts to", () => {
    const drawing = drawFixture(name);
    expect(element(drawing, "lmap_1").style).toMatchObject({
      stroke: "#0050EF",
      "stroke-dasharray": "none",
    });
    expect(element(drawing, "cmap_11").style).toMatchObject({
      stroke: "#00CC00",
      "stroke-dasharray": "1 1",
    });
    expect(element(drawing, "tmap_1").style).toMatchObject({
      stroke: "#00CC00",
      "stroke-dasharray": "none",
    });
  });

  it("lets a map with a null target inherit its timeline's stroke", () => {
    const drawing = drawFixture(name, [
      { statements: [{ select: { ids: ["maps:quarters"] }, set: { stroke: "#ABCDEF" } }] },
    ]);
    expect(element(drawing, "cmap_6").style.stroke).toBe("#ABCDEF");
    expect(element(drawing, "lmap_1").style.stroke).toBe("#0050EF");
  });

  it("gives a map its type as class", () => {
    const drawing = drawFixture(name, [
      { statements: [{ select: { class: "FloorMap" }, set: { stroke: "#FEDCBA" } }] },
    ]);
    const reached = drawing.elements
      .filter((item) => item.type === "map" && item.style.stroke === "#FEDCBA")
      .map((item) => item.address);
    expect(reached).toEqual(["cmap_6"]);
  });
});

describe("the elements core enumerates", () => {
  it.each(manifestNames())("include every drawn element of %s with its key", (name) => {
    const keys = new Map(manifestElements(load(name)).map((key) => [key.address, key]));
    for (const item of drawFixture(name).elements) {
      if (item.type === "block") continue;
      expect(keys.get(item.address)?.type, item.address).toBe(item.type);
    }
  });
});
