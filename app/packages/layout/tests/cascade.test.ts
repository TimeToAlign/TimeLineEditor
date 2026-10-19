import { bandKey, manifestElements } from "@timetoalign/tilie-core/drawing";
import type { Graphical, Selector, Statement } from "@timetoalign/timeskeleton";
import { describe, expect, it, vi } from "vitest";
import {
  Cascade,
  DEFAULT_LAYER,
  DEFAULT_PLACEMENT,
  draw,
  type ElementKey,
  INITIAL_STYLE,
  manifestLayer,
} from "../src/index.ts";
import {
  BLOCK,
  drawFixture,
  edit,
  element,
  load,
  loadFile,
  manifestNames,
  metrics,
  quarters,
} from "./support.ts";

// A child `c` of a root `r`: the key of its line, held by the children band of `r`.
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
  inside: ["block", "timeline", "band"],
};
const ALL: Selector = {
  ids: ["c"],
  within: "c",
  class: "ContinuousLogicalTimeline",
  element: "child",
  inside: "timeline",
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

  it("2. ids outrank within, class, element, inside, domain and modality", () => {
    const { ids: _, ...rest } = ALL;
    expect(stroke(winnerFirst({ ids: ["c"] }, rest))).toBe("#111111");
  });

  it("3. a deeper within outranks a shallower one with every lower member", () => {
    const { ids: _, within: __, ...rest } = ALL;
    expect(stroke(winnerFirst({ within: "c" }, { ...rest, within: "r" }))).toBe("#111111");
  });

  it("4. class outranks element, inside, domain and modality", () => {
    expect(
      stroke(
        winnerFirst(
          { class: "ContinuousLogicalTimeline" },
          { element: "child", inside: "timeline", domain: "logical", modality: "continuous" },
        ),
      ),
    ).toBe("#111111");
  });

  it("5. element outranks inside, domain and modality", () => {
    expect(
      stroke(
        winnerFirst(
          { element: "child" },
          { inside: "timeline", domain: "logical", modality: "continuous" },
        ),
      ),
    ).toBe("#111111");
  });

  it("6. inside outranks domain and modality", () => {
    expect(
      stroke(winnerFirst({ inside: "timeline" }, { domain: "logical", modality: "continuous" })),
    ).toBe("#111111");
  });

  it("7. more of domain and modality outranks fewer", () => {
    expect(
      stroke(winnerFirst({ domain: "logical", modality: "continuous" }, { domain: "logical" })),
    ).toBe("#111111");
    expect(stroke(winnerFirst({ modality: "continuous" }, {}))).toBe("#111111");
  });

  it("8. of two equal statements the later wins", () => {
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
      inside: [],
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

describe("candidate buckets", () => {
  it("tests only general statements and the key's element, class and id buckets", () => {
    const general: Selector = { domain: "logical" };
    const element: Selector = { element: "child" };
    const className: Selector = { class: "ContinuousLogicalTimeline" };
    const id: Selector = { ids: ["c"] };
    const otherElement: Selector = { element: "group" };
    const otherClass: Selector = { class: "ChainMap" };
    const otherId: Selector = { ids: ["elsewhere"] };
    const selectors = [general, element, className, id, otherElement, otherClass, otherId];
    const cascade = new Cascade(
      [{ statements: selectors.map((select) => statement(select, "#111111")) }],
      ancestry,
    );
    const matches = vi.spyOn(cascade, "matches");
    cascade.resolve(key, undefined);
    expect(matches.mock.calls.map(([select]) => select)).toEqual([general, element, className, id]);
  });
});

describe("inside", () => {
  it.each([
    [{ inside: "timeline" }, "#111111"],
    [{ inside: "block" }, "#111111"],
    [{ inside: "band" }, "#111111"],
    [{ inside: "child" }, "none"],
    [{ inside: "ancestor" }, "none"],
  ] as [Selector, string][])("%j on a child's line sets %s", (select, expected) => {
    expect(stroke([{ statements: [statement(select, "#111111")] }])).toBe(expected);
  });
});

describe("bands", () => {
  // The regions band of `c`, held by its line, and that of `r`, held by its line in the block.
  const root: ElementKey = {
    ...key,
    type: "timeline",
    address: "r",
    timeline: "r",
    inside: ["block"],
  };
  const bands = [bandKey("c", "regions", key), bandKey("r", "regions", root)];

  it.each([
    [{ element: "band" }, ["#111111", "#111111"]],
    [{ element: "band", class: "regions" }, ["#111111", "#111111"]],
    [{ element: "band", class: "markers" }, ["none", "none"]],
    [{ inside: "band" }, ["#111111", "none"]],
    [{ inside: "child" }, ["#111111", "none"]],
    [{ domain: "logical" }, ["none", "none"]],
    [{ class: "ContinuousLogicalTimeline" }, ["none", "none"]],
    [{ within: "c" }, ["#111111", "none"]],
    [{ ids: ["c/regions_1"] }, ["#111111", "none"]],
  ] as [Selector, string[]][])("%j sets %j on the regions bands of c and r", (select, expected) => {
    const cascade = new Cascade([{ statements: [statement(select, "#111111")] }], ancestry);
    expect(bands.map((band) => cascade.resolve(band, undefined).stroke)).toEqual(expected);
  });

  it("passes its timeline's style through to what it holds, and its own", () => {
    const strokes = (layer: Graphical) => {
      const drawing = draw(load("with_region"), DEFAULT_PLACEMENT, [layer], metrics);
      return ["clt_1/region_1", "clt_1/region_1/label", "clt_2"].map(
        (address) => element(drawing, address).style.stroke,
      );
    };
    expect(strokes({ statements: [statement({ ids: ["clt_1"] }, "#111111")] })).toEqual([
      "#111111",
      "#111111",
      "#111111",
    ]);
    expect(strokes({ statements: [statement({ ids: ["clt_1/regions_1"] }, "#111111")] })).toEqual([
      "#111111",
      "#111111",
      "none",
    ]);
    expect(strokes({ statements: [statement({ ids: ["clt_1/children_1"] }, "#111111")] })).toEqual([
      "none",
      "none",
      "#111111",
    ]);
  });
});

describe("a band's display", () => {
  // `with_region` with a region of its child `clt_2`.
  const manifest = edit("with_region", {
    type: "add",
    into: `${BLOCK}/clt_2`,
    region: { id: "region_2", name: null, start: quarters(0), end: quarters(2), meta: {} },
  });
  const display = (ids: [string, ...string[]], value: "inline" | "none"): Statement => ({
    select: { ids },
    set: { display: value },
  });
  const drawnWith = (...statements: Statement[]) =>
    draw(
      manifest,
      DEFAULT_PLACEMENT,
      [DEFAULT_LAYER, { statements }, manifestLayer(manifest)],
      metrics,
    ).elements.flatMap((item) =>
      item.type === "region" || item.type === "child" ? [item.address] : [],
    );

  it("hides what the band holds, and nothing a band of another timeline holds", () => {
    expect(drawnWith()).toEqual(["clt_1/region_1", "clt_2", "clt_3"]);
    expect(drawnWith(display(["clt_2/regions_1"], "inline"))).toEqual([
      "clt_1/region_1",
      "clt_1/region_2",
      "clt_2",
      "clt_3",
    ]);
    expect(
      drawnWith(display(["clt_2/regions_1"], "inline"), display(["clt_1/regions_1"], "none")),
    ).toEqual(["clt_1/region_2", "clt_2", "clt_3"]);
    expect(drawnWith(display(["clt_1/regions_1"], "inline"))).toEqual([
      "clt_1/region_1",
      "clt_2",
      "clt_3",
    ]);
  });

  it("hides the children it holds with everything their bands hold", () => {
    expect(
      drawnWith(display(["clt_2/regions_1"], "inline"), display(["clt_1/children_1"], "none")),
    ).toEqual(["clt_1/region_1"]);
  });
});

describe("one address drawn twice", () => {
  const drawingOf = (inside: ElementKey["inside"]): ElementKey => ({
    type: "wedge",
    address: "m/start",
    timeline: "m",
    domain: "logical",
    modality: "continuous",
    class: "ContinuousLogicalTimeline",
    inside,
  });

  it("matches inside by each drawing's own holders and inherits from its own parent", () => {
    const cascade = new Cascade(
      [
        {
          statements: [
            { select: { inside: "ancestor" }, set: { opacity: 0.5 } },
            { select: { ids: ["m/start"] }, set: { fill: "#654321" } },
          ],
        },
      ],
      new Map([["m", ["m"]]]),
    );
    const parent = (colour: string) => ({ ...INITIAL_STYLE, stroke: colour });
    const mark = cascade.resolve(
      drawingOf(["block", "group", "timeline", "ancestor"]),
      parent("#111111"),
    );
    const wedge = cascade.resolve(drawingOf(["block", "group", "timeline"]), parent("#222222"));
    expect([mark.opacity, mark.fill, mark.stroke]).toEqual([0.5, "#654321", "#111111"]);
    expect([wedge.opacity, wedge.fill, wedge.stroke]).toEqual([1, "#654321", "#222222"]);
  });

  it.each([
    "second-half/start",
    "second-half/end",
    "second-half/start/label",
    "second-half/end/label",
  ])("draws %s on the ancestor line and on the member's own line", (address) => {
    const drawing = draw(
      loadFile("groups/group_child_member"),
      DEFAULT_PLACEMENT,
      [
        {
          statements: [
            { select: { ids: ["piece"] }, set: { stroke: "#111111" } },
            { select: { inside: "ancestor" }, set: { opacity: 0.5 } },
          ],
        },
      ],
      metrics,
    );
    const pairs = drawing.elements
      .filter((item) => item.address === address)
      .map((item) => [item.style.stroke, item.style.opacity])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    expect(pairs).toEqual([
      ["#111111", 0.5],
      ["none", 1],
    ]);
  });
});

describe("shadow", () => {
  it("is none initially and never inherited", () => {
    const cascade = (layers: Graphical[]) => new Cascade(layers, ancestry);
    const parent = { ...INITIAL_STYLE, shadow: "#123456" };
    expect(cascade([]).resolve(key, parent).shadow).toBe("none");
    expect(
      cascade([
        { statements: [{ select: { element: "child" }, set: { shadow: "#ABCDEF" } }] },
      ]).resolve(key, parent).shadow,
    ).toBe("#ABCDEF");
  });

  it("stays on the block it is set on, not on the card the block holds", () => {
    const drawing = draw(
      load("bare"),
      DEFAULT_PLACEMENT,
      [{ statements: [{ select: { element: "block" }, set: { shadow: "#123456" } }] }],
      metrics,
    );
    expect([
      element(drawing, null).style.shadow,
      element(drawing, "bare/card").style.shadow,
    ]).toEqual(["#123456", "none"]);
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
    expect(element(drawing, "melody/tempo").style["stroke-width"]).toBe(7);
    expect(drawing.elements.some((item) => item.address === "melody/tempo/name")).toBe(false);
  });

  it("passes a region's font size to its label", () => {
    const drawing = draw(
      load("with_region"),
      DEFAULT_PLACEMENT,
      [{ statements: [{ select: { element: "region" }, set: { "font-size": 13 } }] }],
      metrics,
    );
    expect(element(drawing, "clt_1/region_1/label").style["font-size"]).toBe(13);
  });
});

describe("maps by target unit", () => {
  const name = "conversion_maps__maps_quarters";

  it("draws a map in the domain and modality it converts to", () => {
    const drawing = drawFixture(name);
    expect(element(drawing, "maps:quarters/lmap_1").style).toMatchObject({
      stroke: "#0050EF",
      "stroke-dasharray": "none",
    });
    expect(element(drawing, "maps:quarters/cmap_11").style).toMatchObject({
      stroke: "#00CC00",
      "stroke-dasharray": "1 1",
    });
    expect(element(drawing, "maps:quarters/tmap_1").style).toMatchObject({
      stroke: "#00CC00",
      "stroke-dasharray": "none",
    });
  });

  it("lets a map with a null target inherit its timeline's stroke", () => {
    const drawing = drawFixture(name, [
      { statements: [{ select: { ids: ["maps:quarters"] }, set: { stroke: "#ABCDEF" } }] },
    ]);
    expect(element(drawing, "maps:quarters/cmap_6").style.stroke).toBe("#ABCDEF");
    expect(element(drawing, "maps:quarters/lmap_1").style.stroke).toBe("#0050EF");
  });

  it("gives a map its type as class", () => {
    const drawing = drawFixture(name, [
      { statements: [{ select: { class: "FloorMap" }, set: { stroke: "#FEDCBA" } }] },
    ]);
    const reached = drawing.elements
      .filter((item) => item.type === "map" && item.style.stroke === "#FEDCBA")
      .map((item) => item.address);
    expect(reached).toEqual(["maps:quarters/cmap_6"]);
  });
});

describe("the elements core enumerates", () => {
  it.each(manifestNames())("include every drawn element of %s with its key", (name) => {
    const listed = new Map<string, string[]>();
    for (const key of manifestElements(loadFile(name))) {
      if (key.address === null || key.type === null) continue;
      listed.set(key.address, [...(listed.get(key.address) ?? []), key.type]);
    }
    const drawn = new Map<string, string[]>();
    for (const item of drawFixture(name).elements) {
      if (item.type === "block") continue;
      drawn.set(item.address, [...(drawn.get(item.address) ?? []), item.type]);
    }
    for (const [address, types] of drawn) {
      const keys = listed.get(address) ?? [];
      expect([...new Set(types)], address).toEqual([...new Set(keys)]);
      expect(types.length, address).toBeLessThanOrEqual(keys.length);
    }
  });
});
