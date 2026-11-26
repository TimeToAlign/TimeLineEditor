import { addressKey, idAddress, type Manifest, sameAddress } from "@timetoalign/tilie-core";
import { BLOCK_KEY, bandKey, manifestElements } from "@timetoalign/tilie-core/drawing";
import type { Address, Graphical, Rule, Selector } from "@timetoalign/timetoshare";
import { describe, expect, it, vi } from "vitest";
import {
  Cascade,
  DEFAULT_LAYER,
  DEFAULT_PLACEMENT,
  type DrawnElement,
  draw,
  type ElementKey,
  INITIAL_STYLE,
  manifestLayer,
} from "../src/index.ts";
import {
  at,
  CHILD_REGIONS_HIDDEN,
  childMemberTwice,
  drawFixture,
  edit,
  element,
  load,
  loadFile,
  manifestNames,
  metrics,
  quarters,
  target,
} from "./support.ts";

// A child `c` of a root `r`: the key of its line, held by the children band of `r`.
const ancestry = new Map<string, readonly string[]>([
  ["r", ["r"]],
  ["c", ["r", "c"]],
]);
const key: ElementKey = {
  type: "child",
  address: at("c"),
  timeline: "c",
  domain: "logical",
  modality: "continuous",
  class: "ContinuousLogicalTimeline",
  facet: null,
  inside: ["block", "timeline", "band"],
};
const ALL: Selector = {
  addresses: [at("c")],
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
const rule = (select: Selector, colour: string) => ({ select, set: { stroke: colour } });
const winnerFirst = (winner: Selector, loser: Selector): Graphical[] => [
  { rules: [rule(winner, "#111111"), rule(loser, "#222222")] },
];

describe("rank", () => {
  it("1. a later layer outranks every rule of an earlier one", () => {
    expect(stroke([{ rules: [rule(ALL, "#222222")] }, { rules: [rule({}, "#111111")] }])).toBe(
      "#111111",
    );
  });

  it("2. addresses outrank within, class, element, inside, domain and modality", () => {
    const { addresses: _, ...rest } = ALL;
    expect(stroke(winnerFirst({ addresses: [at("c")] }, rest))).toBe("#111111");
  });

  it("3. a deeper within outranks a shallower one with every lower member", () => {
    const { addresses: _, within: __, ...rest } = ALL;
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

  it("4. facet ranks where class does: it outranks element, inside, domain and modality", () => {
    const band = bandKey("c", "regions", key);
    const strokeOf = (layers: Graphical[]) =>
      new Cascade(layers, ancestry).resolve(band, undefined).stroke;
    expect(strokeOf(winnerFirst({ facet: "regions" }, { element: "band", inside: "child" }))).toBe(
      "#111111",
    );
    expect(strokeOf(winnerFirst({ within: "c" }, { facet: "regions", element: "band" }))).toBe(
      "#111111",
    );
  });

  it("4. coordinates ranks where class does: it outranks element and inside, not within", () => {
    // The wedge of a named timestamp's primary coordinate in the markers band of `c`.
    const wedge: ElementKey = {
      ...key,
      type: "wedge",
      address: at("timestamp_1"),
      inside: [...key.inside, "child", "band"],
      coordinates: "primary",
    };
    const strokeOf = (layers: Graphical[]) =>
      new Cascade(layers, ancestry).resolve(wedge, undefined).stroke;
    expect(
      strokeOf(winnerFirst({ coordinates: "primary" }, { element: "wedge", inside: "band" })),
    ).toBe("#111111");
    expect(
      strokeOf(winnerFirst({ within: "c" }, { coordinates: "primary", element: "wedge" })),
    ).toBe("#111111");
    // Of two rules of rank 4, the one naming `element` too wins; `secondary` matches nothing here.
    expect(
      strokeOf(
        winnerFirst(
          { coordinates: "primary", element: "wedge" },
          { class: "ContinuousLogicalTimeline" },
        ),
      ),
    ).toBe("#111111");
    expect(strokeOf([{ rules: [rule({ coordinates: "secondary" }, "#111111")] }])).toBe("none");
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

  it("8. of two equal rules the later wins", () => {
    expect(stroke(winnerFirst({ element: "child" }, { element: "child" }))).toBe("#222222");
  });

  it("sets a named style, and nothing for a missing name", () => {
    const layer: Graphical = {
      styles: { mine: { stroke: "#333333" } },
      rules: [
        { select: {}, set: { stroke: "#111111" } },
        { select: { element: "child" }, set: "mine" },
        { select: { addresses: [at("c")] }, set: "missing" },
      ],
    };
    expect(stroke([layer])).toBe("#333333");
  });

  it("matches nothing with a within outside the manifest", () => {
    expect(stroke([{ rules: [rule({ within: "elsewhere" }, "#111111")] }])).toBe("none");
  });

  it("never matches the block with domain, class, facet, an element's address or within", () => {
    const block: ElementKey = BLOCK_KEY;
    const cascade = new Cascade(
      [
        {
          rules: [
            rule({ domain: "logical" }, "#111111"),
            rule({ addresses: [at("c")] }, "#111111"),
            rule({ within: "r" }, "#111111"),
            rule({ class: "ContinuousLogicalTimeline" }, "#111111"),
            rule({ facet: "regions" }, "#111111"),
          ],
        },
      ],
      ancestry,
    );
    expect(cascade.resolve(block, undefined).stroke).toBe("none");
  });
});

describe("candidate buckets", () => {
  it("tests only general rules and the key's element, class, facet and address buckets", () => {
    const general: Selector = { domain: "logical" };
    const element: Selector = { element: "child" };
    const className: Selector = { class: "ContinuousLogicalTimeline" };
    const id: Selector = { addresses: [at("c")] };
    const band: Selector = { element: "band" };
    const facet: Selector = { facet: "regions" };
    const bandId: Selector = { addresses: [{ id: "c", facet: "regions" }] };
    const otherElement: Selector = { element: "frame" };
    const otherClass: Selector = { class: "ChainMap" };
    const otherId: Selector = { addresses: [at("elsewhere")] };
    const otherFacet: Selector = { facet: "markers" };
    const selectors = [
      general,
      element,
      className,
      id,
      band,
      facet,
      bandId,
      otherElement,
      otherClass,
      otherId,
      otherFacet,
    ];
    const cascade = new Cascade(
      [{ rules: selectors.map((select) => rule(select, "#111111")) }],
      ancestry,
    );
    const matches = vi.spyOn(cascade, "matches");
    cascade.resolve(key, undefined);
    expect(matches.mock.calls.map(([select]) => select)).toEqual([general, element, className, id]);
    matches.mockClear();
    cascade.resolve(bandKey("c", "regions", key), undefined);
    expect(matches.mock.calls.map(([select]) => select)).toEqual([general, band, facet, bandId]);
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
    expect(stroke([{ rules: [rule(select, "#111111")] }])).toBe(expected);
  });
});

describe("bands", () => {
  // The regions band of `c`, held by its line, and that of `r`, held by its line in the block.
  const root: ElementKey = {
    ...key,
    type: "timeline",
    address: at("r"),
    timeline: "r",
    inside: ["block"],
  };
  const bands = [bandKey("c", "regions", key), bandKey("r", "regions", root)];

  it.each([
    [{ element: "band" }, ["#111111", "#111111"]],
    [{ element: "band", facet: "regions" }, ["#111111", "#111111"]],
    [{ element: "band", facet: "markers" }, ["none", "none"]],
    [{ inside: "band" }, ["#111111", "none"]],
    [{ inside: "child" }, ["#111111", "none"]],
    [{ domain: "logical" }, ["none", "none"]],
    [{ class: "ContinuousLogicalTimeline" }, ["none", "none"]],
    [{ within: "c" }, ["#111111", "none"]],
    [{ addresses: [{ id: "c", facet: "regions" }] }, ["#111111", "none"]],
    [{ addresses: [{ id: "c" }] }, ["none", "none"]],
  ] as [Selector, string[]][])("%j sets %j on the regions bands of c and r", (select, expected) => {
    const cascade = new Cascade([{ rules: [rule(select, "#111111")] }], ancestry);
    expect(bands.map((band) => cascade.resolve(band, undefined).stroke)).toEqual(expected);
  });

  it("passes its timeline's style through to what it holds, and its own", () => {
    const strokes = (layer: Graphical) => {
      const drawing = draw(load("with_region"), DEFAULT_PLACEMENT, [layer], metrics);
      return [at("region_1"), at("region_1", "label"), at("clt_2")].map(
        (address) => element(drawing, address).style.stroke,
      );
    };
    expect(strokes({ rules: [rule({ addresses: [at("clt_1")] }, "#111111")] })).toEqual([
      "#111111",
      "#111111",
      "#111111",
    ]);
    expect(
      strokes({
        rules: [rule({ addresses: [{ id: "clt_1", facet: "regions" }] }, "#111111")],
      }),
    ).toEqual(["#111111", "#111111", "none"]);
    expect(
      strokes({
        rules: [rule({ addresses: [{ id: "clt_1", facet: "children" }] }, "#111111")],
      }),
    ).toEqual(["none", "none", "#111111"]);
  });
});

describe("a band's display", () => {
  // `with_region` with a region of its child `clt_2`.
  const manifest = edit("with_region", {
    type: "add",
    into: target("clt_2"),
    region: { id: "region_2", name: null, start: quarters(0), end: quarters(2), meta: {} },
  });
  const display = (addresses: [Address, ...Address[]], value: "inline" | "none"): Rule => ({
    select: { addresses },
    set: { display: value },
  });
  const drawnWith = (...rules: Rule[]) =>
    draw(
      manifest,
      DEFAULT_PLACEMENT,
      [DEFAULT_LAYER, CHILD_REGIONS_HIDDEN, { rules }, manifestLayer(manifest)],
      metrics,
    ).elements.flatMap((item) =>
      item.type === "region" || item.type === "child" ? [item.address] : [],
    );

  it("hides what the band holds, and nothing a band of another timeline holds", () => {
    expect(drawnWith()).toEqual([at("region_1"), at("clt_2"), at("clt_3")]);
    expect(drawnWith(display([{ id: "clt_2", facet: "regions" }], "inline"))).toEqual([
      at("region_1"),
      at("region_2"),
      at("clt_2"),
      at("clt_3"),
    ]);
    expect(
      drawnWith(
        display([{ id: "clt_2", facet: "regions" }], "inline"),
        display([{ id: "clt_1", facet: "regions" }], "none"),
      ),
    ).toEqual([at("region_2"), at("clt_2"), at("clt_3")]);
    expect(drawnWith(display([{ id: "clt_1", facet: "regions" }], "inline"))).toEqual([
      at("region_1"),
      at("clt_2"),
      at("clt_3"),
    ]);
  });

  it("hides the children it holds with everything their bands hold", () => {
    expect(
      drawnWith(
        display([{ id: "clt_2", facet: "regions" }], "inline"),
        display([{ id: "clt_1", facet: "children" }], "none"),
      ),
    ).toEqual([at("region_1")]);
  });
});

describe("one address drawn twice", () => {
  // A named timestamp `s` of the member `m`, drawn on an ancestor line and on `m`'s own line.
  const drawingOf = (inside: ElementKey["inside"]): ElementKey => ({
    type: "wedge",
    address: at("s"),
    timeline: "m",
    domain: "logical",
    modality: "continuous",
    class: "ContinuousLogicalTimeline",
    facet: null,
    inside,
  });

  it("matches inside by each drawing's own holders and inherits from its own parent", () => {
    const cascade = new Cascade(
      [
        {
          rules: [
            { select: { inside: "ancestor" }, set: { opacity: 0.5 } },
            { select: { addresses: [at("s")] }, set: { fill: "#654321" } },
          ],
        },
      ],
      new Map([["m", ["m"]]]),
    );
    const parent = (colour: string) => ({ ...INITIAL_STYLE, stroke: colour });
    const secondary = cascade.resolve(
      drawingOf(["block", "frame", "timeline", "ancestor"]),
      parent("#111111"),
    );
    const wedge = cascade.resolve(drawingOf(["block", "frame", "timeline"]), parent("#222222"));
    expect([secondary.opacity, secondary.fill, secondary.stroke]).toEqual([
      0.5,
      "#654321",
      "#111111",
    ]);
    expect([wedge.opacity, wedge.fill, wedge.stroke]).toEqual([1, "#654321", "#222222"]);
  });

  it.each([
    [at("timestamp_3")],
    [at("timestamp_4")],
    [at("timestamp_3", "coordinate")],
    [at("timestamp_4", "coordinate")],
  ])(
    "draws %j inside the ancestor line on it and outside it on the member's own line",
    (address) => {
      // Without the default layer the secondary coordinates are shown (section 2), and the
      // ancestor card is hidden by a rule of this layer.
      const drawing = draw(
        loadFile("groups/group_child_member"),
        DEFAULT_PLACEMENT,
        [
          {
            rules: [
              { select: { element: "ancestor_card" }, set: { display: "none" } },
              { select: { addresses: [at("piece")] }, set: { stroke: "#111111" } },
              { select: { inside: "ancestor" }, set: { opacity: 0.5 } },
            ],
          },
        ],
        metrics,
      );
      const pairs = drawing.elements
        .filter((item) => sameAddress(item.address, address))
        .map((item) => [item.style.stroke, item.style.opacity]);
      // The secondary coordinate on `piece`'s ancestor line in the member's card, the primary on
      // the member's line, then, a groupstamp, the secondary on `recording`'s line in its card.
      expect(pairs).toEqual([
        ["#111111", 0.5],
        ["none", 1],
        ["none", 1],
      ]);
    },
  );
});

describe("shadow", () => {
  it("is none initially and never inherited", () => {
    const cascade = (layers: Graphical[]) => new Cascade(layers, ancestry);
    const parent = { ...INITIAL_STYLE, shadow: "#123456" };
    expect(cascade([]).resolve(key, parent).shadow).toBe("none");
    expect(
      cascade([{ rules: [{ select: { element: "child" }, set: { shadow: "#ABCDEF" } }] }]).resolve(
        key,
        parent,
      ).shadow,
    ).toBe("#ABCDEF");
  });

  it("stays on the block it is set on, not on the card the block holds", () => {
    const drawing = draw(
      load("bare"),
      DEFAULT_PLACEMENT,
      [{ rules: [{ select: { element: "block" }, set: { shadow: "#123456" } }] }],
      metrics,
    );
    expect([
      element(drawing, BLOCK_KEY.address).style.shadow,
      element(drawing, at("bare", "card")).style.shadow,
    ]).toEqual(["#123456", "none"]);
  });
});

describe("inheritance", () => {
  it("gives every element the initial values without layers, a wedge its rotation 0", () => {
    const drawing = draw(load("with_region"), DEFAULT_PLACEMENT, [], metrics);
    expect(drawing.elements.filter((item) => item.type === "wedge")).toHaveLength(2);
    for (const item of drawing.elements) {
      const initial = item.type === "wedge" ? { ...INITIAL_STYLE, rotation: 0 } : INITIAL_STYLE;
      expect(item.style, addressKey(item.address)).toEqual(initial);
    }
  });

  it("inherits fill from the block, never opacity or rx", () => {
    const drawing = draw(
      load("bare"),
      DEFAULT_PLACEMENT,
      [
        {
          rules: [{ select: { element: "block" }, set: { fill: "#111111", opacity: 0.5, rx: 4 } }],
        },
      ],
      metrics,
    );
    expect(element(drawing, BLOCK_KEY.address).style).toMatchObject({
      fill: "#111111",
      opacity: 0.5,
      rx: 4,
    });
    expect(element(drawing, at("bare")).style).toMatchObject({
      fill: "#111111",
      opacity: 1,
      rx: 0,
    });
  });

  it("passes a root's stroke to its child and grandchild", () => {
    const drawing = draw(
      load("nested"),
      DEFAULT_PLACEMENT,
      [{ rules: [{ select: { addresses: [at("clt_1")] }, set: { stroke: "#123456" } }] }],
      metrics,
    );
    expect(element(drawing, at("clt_3")).style.stroke).toBe("#123456");
    expect(element(drawing, at("clt_2")).style.stroke).toBe("#123456");
  });

  it("passes a timeline's stroke width to its map, which has no name", () => {
    const drawing = draw(
      load("map"),
      DEFAULT_PLACEMENT,
      [{ rules: [{ select: { addresses: [at("melody")] }, set: { "stroke-width": 7 } }] }],
      metrics,
    );
    expect(element(drawing, at("tempo")).style["stroke-width"]).toBe(7);
    expect(drawing.elements.some((item) => sameAddress(item.address, at("tempo", "name")))).toBe(
      false,
    );
  });

  it("passes a region's font size to its label", () => {
    const drawing = draw(
      load("with_region"),
      DEFAULT_PLACEMENT,
      [{ rules: [{ select: { element: "region" }, set: { "font-size": 13 } }] }],
      metrics,
    );
    expect(element(drawing, at("region_1", "label")).style["font-size"]).toBe(13);
  });
});

describe("maps by target unit", () => {
  const name = "conversion_maps__maps_quarters";

  it("draws a map in the domain and modality it converts to", () => {
    const drawing = drawFixture(name);
    expect(element(drawing, at("cmap_15")).style).toMatchObject({
      stroke: "#0050EF",
      "stroke-dasharray": "none",
    });
    expect(element(drawing, at("cmap_3")).style).toMatchObject({
      stroke: "#00CC00",
      "stroke-dasharray": "none",
    });
    const samples = drawFixture("conversion_maps__maps_seconds");
    expect(element(samples, at("cmap_1")).style).toMatchObject({
      stroke: "#0050EF",
      "stroke-dasharray": "1 1",
    });
  });

  it("lets a map with a null target inherit its timeline's stroke", () => {
    const drawing = drawFixture(name, [
      {
        rules: [{ select: { addresses: [at("maps:quarters")] }, set: { stroke: "#ABCDEF" } }],
      },
    ]);
    expect(element(drawing, at("cmap_11")).style.stroke).toBe("#ABCDEF");
    expect(element(drawing, at("cmap_15")).style.stroke).toBe("#0050EF");
  });

  it("gives a map its type as class", () => {
    const drawing = drawFixture(name, [
      { rules: [{ select: { class: "ConstantMap" }, set: { stroke: "#FEDCBA" } }] },
    ]);
    const reached = drawing.elements
      .filter((item) => item.type === "map" && item.style.stroke === "#FEDCBA")
      .map((item) => item.address);
    expect(reached).toEqual([at("cmap_11")]);
  });
});

/**
 * That every element `manifest` draws, every ancestor card shown, is listed
 * by core's `manifestElements` with its type, as often as it is drawn at
 * least.
 */
function expectEnumerated(manifest: Manifest): void {
  // Keyed by each address's one string form.
  const listed = new Map<string, string[]>();
  for (const key of manifestElements(manifest)) {
    if (key.type === null) continue;
    const own = addressKey(key.address);
    listed.set(own, [...(listed.get(own) ?? []), key.type]);
  }
  // Every ancestor card shown, so that its drawing is checked with the rest.
  const drawing = draw(
    manifest,
    DEFAULT_PLACEMENT,
    [
      DEFAULT_LAYER,
      { rules: [{ select: { element: "ancestor_card" }, set: { display: "inline" } }] },
      manifestLayer(manifest),
    ],
    metrics,
  );
  const cards = drawing.boxes.filter((box) => box.kind === "card");
  const frames = drawing.boxes.filter((box) => box.kind === "frame");
  // The jumps, each drawn as one arc per destination, each arc with a label of its own.
  const jumps = new Set(
    [...listed].flatMap(([own, types]) => (types.includes("jump") ? [own] : [])),
  );
  // One drawing of an address: an element, but the pieces a cross-section line is drawn in
  // across a card, on either side of its gap, which are one drawing of that card, the arcs of
  // a jump in a card and their labels, which are one drawing of that card each, and the
  // pieces a groupstamp's line is drawn in across a frame, outside every card, which are one
  // drawing of that frame.
  const drawingOf = (item: DrawnElement, index: number): string => {
    const inCard = cards.findIndex(({ range }) => range.start <= index && index < range.end);
    if (item.type === "cross_section" && inCard !== -1) return `card ${inCard}`;
    const owner = addressKey(idAddress(item.address.id ?? ""));
    if (jumps.has(owner) && inCard !== -1) return `card ${inCard}`;
    const frame =
      item.type !== "cross_section"
        ? undefined
        : frames.find(
            (box) =>
              box.x <= item.x &&
              item.x <= box.x + box.width &&
              box.y <= item.y1 &&
              item.y2 <= box.y + box.height,
          );
    return frame === undefined ? `element ${index}` : `frame ${frames.indexOf(frame)}`;
  };
  // A gap is one drawing of its card, or of its frame, wherever its pieces lie, and its
  // ellipses, which follow it (section 8.5), are one drawing with it: core lists one ellipsis
  // key per gap, standing for all of them.
  const gapOf = (item: DrawnElement, index: number): string => {
    if (item.type !== "elision") return drawingOf(item, index);
    const inCard = cards.findIndex(({ range }) => range.start <= index && index < range.end);
    if (inCard !== -1) return `card ${inCard}`;
    const frame = frames.find(
      (box) =>
        box.x <= item.x1 &&
        item.x2 <= box.x + box.width &&
        box.y <= item.yt &&
        item.yb <= box.y + box.height,
    );
    return frame === undefined ? `element ${index}` : `frame ${frames.indexOf(frame)}`;
  };
  const lastGap = new Map<string, string>();
  const drawn = new Map<string, { types: string[]; drawings: Set<string> }>();
  drawing.elements.forEach((item, index) => {
    // A default elision and its labels depend on the drawing's geometry, so core lists none.
    if (item.address.part?.[0] === "elision") return;
    const own = addressKey(item.address);
    const entry = drawn.get(own) ?? { types: [], drawings: new Set<string>() };
    entry.types.push(item.type);
    if (item.type === "elision") lastGap.set(item.address.id ?? "", gapOf(item, index));
    entry.drawings.add(
      item.type === "ellipsis" ? `gap ${lastGap.get(item.address.id ?? "")}` : gapOf(item, index),
    );
    drawn.set(own, entry);
  });
  for (const [address, { types, drawings }] of drawn) {
    const keys = listed.get(address) ?? [];
    expect([...new Set(types)], address).toEqual([...new Set(keys)]);
    expect(drawings.size, address).toBeLessThanOrEqual(keys.length);
  }
}

describe("the elements core enumerates", () => {
  it.each(manifestNames())("include every drawn element of %s with its key", (name) => {
    expectEnumerated(loadFile(name));
  });

  it("include every drawn element of a switched frame carrying a child member", () => {
    // groups/group_child_member switched by recording's FlowMap twice (Switched cards, 12).
    expectEnumerated(childMemberTwice().manifest);
  });
});

describe("rotation", () => {
  /** The `rotation` of every wedge of `groups/group_groupstamp` by its address's ID. */
  const rotations = (extra: Graphical[] = []) =>
    Object.fromEntries(
      drawFixture("groups/group_groupstamp", extra)
        .elements.filter((item) => item.type === "wedge")
        .map((item) => [item.address.id, item.style.rotation]),
    );
  const wedges = (rotation: number): Graphical[] => [
    { rules: [{ select: { element: "wedge" }, set: { rotation } }] },
  ];

  it("turns every wedge of a primary coordinate 0 where no rule sets it, a groupstamp's too", () => {
    expect(rotations()).toEqual({
      timestamp_1: 0,
      timestamp_2: 0,
      timestamp_3: 0,
      timestamp_4: 0,
      timestamp_5: 0,
    });
  });

  it("takes a rule's value on every wedge, 0 included", () => {
    expect(new Set(Object.values(rotations(wedges(0))))).toEqual(new Set([0]));
    expect(new Set(Object.values(rotations(wedges(30))))).toEqual(new Set([30]));
  });

  it("is never inherited from the band holding a wedge", () => {
    const band: Graphical[] = [
      {
        rules: [
          { select: { addresses: [{ id: "score", facet: "markers" }] }, set: { rotation: 30 } },
        ],
      },
    ];
    expect(rotations(band)).toEqual(rotations());
  });
});
