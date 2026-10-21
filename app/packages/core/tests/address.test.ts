import { describe, expect, it } from "vitest";
import type { ElementAddress } from "../src/manifest/address.ts";
import {
  addressKey,
  BUNDLE_ADDRESS,
  bandAddress,
  cardAddress,
  FACETS,
  idAddress,
  PART_WORDS,
  partAddress,
  sameAddress,
  TITLE_ADDRESS,
} from "../src/manifest/address.ts";
import type { ElementKey } from "../src/manifest/elements.ts";
import { manifestElements, timelineAncestry } from "../src/manifest/elements.ts";
import type { Address, ResolvedAddress, ResolvedElement } from "../src/workspace/address.ts";
import {
  elementAddressOf,
  inBlock,
  indexOf,
  isElementAddress,
  manifestIds,
  readAddress,
  resolveAddress,
  resolveElement,
  WORKSPACE,
} from "../src/workspace/address.ts";
import { A, allFixtures, B, block, changed, loadText, refusal, viewOf } from "./support.ts";

const MIXED = "bundles/bundle_mixed.json";
const FREE = "bundles/bundle_free_ids.json";
const view = viewOf([A, MIXED], [B, "map.json"]);

/** The address in block `A` of the element `element`. */
const inA = (element: ElementAddress): Address => inBlock(A, element);

/** A resolution reduced to what tells its kinds apart: kind, ids and words, owners nested. */
function shape(resolved: ResolvedAddress | ResolvedElement): unknown {
  switch (resolved.kind) {
    case "workspace":
    case "title":
      return [resolved.kind];
    case "block":
      return [resolved.kind, resolved.block.id];
    case "frame":
      return [resolved.kind, resolved.group.id, resolved.container.key];
    case "timeline":
    case "card":
      return [resolved.kind, resolved.at.timeline.id, resolved.cards.map((card) => card.key)];
    case "band":
      return [
        resolved.kind,
        resolved.at.timeline.id,
        resolved.facet,
        resolved.containers.map((band) => band.holder?.key),
      ];
    case "entry":
      return [
        resolved.kind,
        resolved.at.timeline.id,
        resolved.entry,
        resolved.index,
        resolved.element.id,
      ];
    case "measure_map":
      return [resolved.kind, resolved.map.id, resolved.index];
    case "part":
      return [resolved.kind, resolved.word, shape(resolved.owner)];
  }
}

const resolved = (address: Address) => {
  const found = resolveAddress(view, address);
  if ("code" in found) throw new Error(`${addressKey(address)}: ${found.code}`);
  return shape(found);
};

describe("the shape of an address", () => {
  it.each<[unknown]>([
    [{}],
    [{ block: A }],
    [{ block: A, id: "score" }],
    [{ block: A, id: "score", facet: "regions" }],
    [{ block: A, id: "score", part: ["end", "label"] }],
    [{ block: A, id: "score", part: ["card"] }],
    [{ block: A, part: ["name"] }],
    [{ block: A, id: "https://example.org/piece/score#exposition" }],
    [{ block: A, id: "perf/take 2" }],
  ])("reads %j as itself", (value) => {
    expect(readAddress(value, ["into"])).toEqual(value);
  });

  it.each<[unknown, string]>([
    ["score", "an address is an object"],
    [null, "an address is an object"],
    [[A], "an address is an object"],
    [{ block: A, colour: "red" }, "an address has no member colour"],
    [{ block: "short" }, "an address's block is a block id"],
    [{ block: 3 }, "an address's block is a block id"],
    [{ block: A, id: "" }, "an address's id is a non-empty string without control characters"],
    [
      { block: A, id: "a\u0001b" },
      "an address's id is a non-empty string without control characters",
    ],
    [{ block: A, id: 3 }, "an address's id is a non-empty string without control characters"],
    [{ block: A, id: "score", facet: "region" }, "an address's facet is a facet"],
    [{ block: A, id: "score", part: [] }, "an address's part is a non-empty array of part words"],
    [
      { block: A, id: "score", part: ["middle"] },
      "an address's part is a non-empty array of part words",
    ],
    [
      { block: A, id: "score", part: "name" },
      "an address's part is a non-empty array of part words",
    ],
    [{ block: A, facet: "regions" }, "a facet stands with an id"],
    [
      { block: A, id: "score", facet: "regions", part: ["label"] },
      "a facet never stands with a part",
    ],
    [{ id: "score" }, "an element's address names its block"],
    [{ part: ["name"] }, "an element's address names its block"],
  ])("refuses %j: %s", (value, message) => {
    expect(readAddress(value, ["changes", 0, "target"])).toEqual({
      code: "invalid_address",
      message,
      path: ["changes", 0, "target"],
    });
  });

  it("builds the element addresses of the manifest's own address", () => {
    expect([BUNDLE_ADDRESS, TITLE_ADDRESS]).toEqual([{}, { part: ["name"] }]);
    expect(idAddress("score")).toEqual({ id: "score" });
    expect(bandAddress("score", "regions")).toEqual({ id: "score", facet: "regions" });
    expect(cardAddress("score")).toEqual({ id: "score", part: ["card"] });
    expect(partAddress({ id: "score" }, "end")).toEqual({ id: "score", part: ["end"] });
    expect(partAddress({ id: "score", part: ["end"] }, "label")).toEqual({
      id: "score",
      part: ["end", "label"],
    });
    expect(partAddress({ block: A, id: "group_1" }, "name")).toEqual({
      block: A,
      id: "group_1",
      part: ["name"],
    });
    // @ts-expect-error A band has no part: its address is no owner.
    partAddress(bandAddress("score", "regions"), "label");
    expect(FACETS).toEqual(["children", "conversion_maps", "markers", "regions", "flow_control"]);
    expect(PART_WORDS).toEqual(["start", "end", "name", "label", "card"]);
  });

  it("puts an element into its block and takes it out again", () => {
    expect(WORKSPACE).toEqual({});
    expect(inA({ id: "score", part: ["end"] })).toEqual({ block: A, id: "score", part: ["end"] });
    expect(elementAddressOf({ block: A, id: "score", facet: "regions" })).toEqual({
      id: "score",
      facet: "regions",
    });
    expect(elementAddressOf({ block: A })).toEqual({});
    expect(
      [{}, { block: A }, { block: A, id: "score" }, { block: A, part: ["name"] }].map((address) =>
        isElementAddress(address as Address),
      ),
    ).toEqual([false, false, true, true]);
  });
});

describe("the one string form of an address", () => {
  it.each<[Address, string]>([
    [{}, "{}"],
    [{ block: A }, '{"block":"0000000000"}'],
    [{ block: A, id: "score" }, '{"block":"0000000000","id":"score"}'],
    [{ id: "score", facet: "regions" }, '{"facet":"regions","id":"score"}'],
    [
      { part: ["end", "label"], id: "score", block: A },
      '{"block":"0000000000","id":"score","part":["end","label"]}',
    ],
    [{ part: ["name"] }, '{"part":["name"]}'],
    [{ id: 'say "hi"/2' }, '{"id":"say \\"hi\\"/2"}'],
  ])("writes %j as %s", (address, text) => {
    expect(addressKey(address)).toBe(text);
  });

  it("gives different addresses different keys", () => {
    const addresses: Address[] = [
      {},
      { block: A },
      { block: B },
      { block: A, id: "score" },
      { block: A, id: "score/end" },
      { block: A, id: "score", part: ["end"] },
      { block: A, id: "score", part: ["end", "label"] },
      { block: A, id: "score", part: ["label", "end"] },
      { block: A, id: "score", part: ["card"] },
      { block: A, id: "score", facet: "regions" },
      { block: A, id: "score/regions_1" },
      { block: A, part: ["name"] },
      { block: A, id: "name" },
      { id: "score" },
    ];
    expect(new Set(addresses.map(addressKey)).size).toBe(addresses.length);
  });

  it("compares addresses as whole objects", () => {
    expect(
      [
        [
          { id: "score", part: ["end"] },
          { part: ["end"], id: "score" },
        ],
        [
          { block: A, id: "score" },
          { id: "score", block: A },
        ],
        [{}, { block: undefined }],
        [{ id: "score" }, { id: "score", part: ["card"] }],
        [
          { id: "score", part: ["end", "label"] },
          { id: "score", part: ["label", "end"] },
        ],
        [{ block: A, id: "score" }, { id: "score" }],
        [
          { id: "score", facet: "regions" },
          { id: "score", facet: "markers" },
        ],
      ].map(([left, right]) => sameAddress(left as Address, right as Address)),
    ).toEqual([true, true, true, false, false, false, false]);
  });
});

describe("resolving an address", () => {
  it.each<[Address, unknown]>([
    [{}, ["workspace"]],
    [{ block: A }, ["block", A]],
    [inA({ part: ["name"] }), ["title"]],
    [inA({ id: "group_1" }), ["frame", "group_1", { item: "group_1" }]],
    [
      inA({ id: "group_1", part: ["name"] }),
      ["part", "name", ["frame", "group_1", { item: "group_1" }]],
    ],
    [inA({ id: "score" }), ["timeline", "score", [{ item: "group_1", member: "score" }]]],
    [inA({ id: "excerpt" }), ["timeline", "excerpt", [{ item: "group_2", member: "excerpt" }]]],
    [inA({ id: "recording" }), ["timeline", "recording", []]],
    [
      inA({ id: "score", part: ["card"] }),
      ["card", "score", [{ item: "group_1", member: "score" }]],
    ],
    [
      inA({ id: "annotations", part: ["card"] }),
      ["card", "annotations", [{ item: "annotations" }]],
    ],
    [
      inA({ id: "score", facet: "regions" }),
      ["band", "score", "regions", [{ item: "group_1", member: "score" }]],
    ],
    [
      inA({ id: "excerpt", facet: "children" }),
      ["band", "excerpt", "children", [{ item: "group_2", member: "excerpt" }]],
    ],
    [inA({ id: "region_2" }), ["entry", "annotations", "region", 1, "region_2"]],
    [inA({ id: "cmap_6" }), ["entry", "excerpt", "map", 0, "cmap_6"]],
    [inA({ id: "jump_from_1" }), ["entry", "score", "flow_control", 0, "jump_from_1"]],
    [
      inA({ id: "region_1", part: ["label"] }),
      ["part", "label", ["entry", "annotations", "region", 0, "region_1"]],
    ],
    [
      inA({ id: "score", part: ["end"] }),
      ["part", "end", ["timeline", "score", [{ item: "group_1", member: "score" }]]],
    ],
    [
      inA({ id: "score", part: ["end", "label"] }),
      [
        "part",
        "label",
        ["part", "end", ["timeline", "score", [{ item: "group_1", member: "score" }]]],
      ],
    ],
    [
      inA({ id: "excerpt", part: ["name"] }),
      ["part", "name", ["timeline", "excerpt", [{ item: "group_2", member: "excerpt" }]]],
    ],
  ])("resolves %j", (address, expected) => {
    expect(resolved(address)).toEqual(expected);
  });

  it("names nothing by the manifest's own id", () => {
    const named = block(view, A);
    const withId = {
      ...view,
      blocks: { ...view.blocks, [A]: { ...named, manifest: { ...named.manifest, id: "takes" } } },
    };
    const address = inA({ id: "takes" });
    expect(resolveAddress(withId, address)).toEqual({
      code: "unknown_target",
      message: '{"block":"0000000000","id":"takes"} names nothing',
      path: ['{"block":"0000000000","id":"takes"}'],
    });
    expect(resolveAddress(withId, { block: A })).toEqual({
      kind: "block",
      block: withId.blocks[A],
    });
  });

  it("resolves a measure map by its id, without parts", () => {
    const bars = { id: "bars", rows: [{ count: 1, qstamp: [0, 1] }] };
    const held = changed(view, { type: "add", into: { block: A }, measure_map: bars });
    const found = resolveAddress(held, inA({ id: "bars" }));
    expect(found).toEqual({
      kind: "measure_map",
      block: block(held, A),
      map: { ...bars, name: null, meta: {} },
      index: 0,
    });
    const address = inA({ id: "bars", part: ["name"] });
    expect(refusal(resolveAddress(held, address))).toEqual({
      code: "unknown_target",
      path: [addressKey(address)],
    });
  });

  it("carries the block of its manifest at every level", () => {
    const found = resolveAddress(view, inA({ id: "score", part: ["end", "label"] }));
    expect(found).toMatchObject({ block: block(view, A), owner: { block: block(view, A) } });
  });

  it.each<[Address]>([
    [{ block: "0000000009" }],
    [inA({ id: "nothing" })],
    [inA({ id: "score/cmap_1" })],
    [inA({ id: "recording", facet: "regions" })],
    [inA({ id: "recording", part: ["card"] })],
    [inA({ id: "group_1", facet: "regions" })],
    [inA({ id: "cmap_1", facet: "regions" })],
    [inA({ id: "score", part: ["card", "label"] })],
    [inA({ id: "group_1", part: ["label"] })],
    [inA({ id: "group_1", part: ["card"] })],
    [inA({ part: ["name", "label"] })],
    [inA({ part: ["label"] })],
    [inA({ id: "score", part: ["start", "end"] })],
    [inA({ id: "region_1", part: ["start"] })],
    [{ block: B, part: ["name"] }],
    // Parts nothing draws: a root drawn only as an ancestor line has no wedges; only a segment
    // has a label of its own; a region, a flow-control element and a map have no name; a map
    // and a MeasureMap no label.
    [inA({ id: "recording", part: ["start"] })],
    [inA({ id: "recording", part: ["end", "label"] })],
    [inA({ id: "score", part: ["label"] })],
    [inA({ id: "region_1", part: ["name"] })],
    [inA({ id: "jump_from_1", part: ["name"] })],
    [inA({ id: "cmap_1", part: ["label"] })],
    [inA({ id: "cmap_1", part: ["name"] })],
  ])("names nothing at %j", (address) => {
    const key = addressKey(address);
    expect(resolveAddress(view, address)).toEqual({
      code: "unknown_target",
      message: `${key} names nothing`,
      path: [key],
    });
  });

  it.each<[Address, string]>([
    [{ block: "short" }, "an address's block is a block id"],
    [inA({ id: "score", facet: "regions", part: ["label"] }), "a facet never stands with a part"],
    [{ id: "score" }, "an element's address names its block"],
  ])("refuses the malformed %j", (address, message) => {
    const key = addressKey(address);
    expect(resolveAddress(view, address)).toEqual({
      code: "invalid_address",
      message,
      path: [key],
    });
  });
});

describe("free IDs", () => {
  const free = viewOf([A, FREE]);
  const found = (address: Address) => {
    const result = resolveAddress(free, address);
    if ("code" in result) throw new Error(`${addressKey(address)}: ${result.code}`);
    return shape(result);
  };
  const score = "https://example.org/piece/score";

  it("resolves a URI, an ID with a slash and a space, and a region's ID with a fragment", () => {
    expect(found(inA({ id: score }))).toEqual([
      "timeline",
      score,
      [{ item: "group_1", member: score }],
    ]);
    expect(found(inA({ id: "perf/take 2" }))).toEqual([
      "timeline",
      "perf/take 2",
      [{ item: "group_1", member: "perf/take 2" }],
    ]);
    expect(found(inA({ id: `${score}#exposition` }))).toEqual([
      "entry",
      score,
      "region",
      0,
      `${score}#exposition`,
    ]);
    expect(found(inA({ id: "take 2/intro", part: ["label"] }))).toEqual([
      "part",
      "label",
      ["entry", "perf/take 2", "region", 0, "take 2/intro"],
    ]);
    expect(found(inA({ id: "perf/take 2", part: ["end", "label"] }))).toEqual([
      "part",
      "label",
      ["part", "end", ["timeline", "perf/take 2", [{ item: "group_1", member: "perf/take 2" }]]],
    ]);
  });

  it("never splits an ID", () => {
    for (const id of ["perf", "take 2", "https:", "intro", `${score}#`]) {
      expect(refusal(resolveAddress(free, inA({ id })))).toEqual({
        code: "unknown_target",
        path: [addressKey(inA({ id }))],
      });
    }
  });
});

/** The kind every drawn element's address resolves to, by its element type. */
function kindOf(key: ElementKey): ResolvedElement["kind"] {
  switch (key.type) {
    case "card":
      return "card";
    case "band":
      return "band";
    case "frame":
      return "frame";
    case "map":
    case "region":
    case "flow_marker":
    case "jump_from":
      return "entry";
    case "name":
      return key.address.id === undefined ? "title" : "part";
    case "label":
    case "wedge":
    case "boundary":
      return "part";
    default:
      return "timeline";
  }
}

describe("every drawn element", () => {
  it.each(allFixtures.map((fixture) => [fixture.name, fixture.text] as const))(
    "of %s resolves to its kind",
    (_, text) => {
      const manifest = loadText(text);
      const drawn = manifestElements(manifest).filter((key) => key.type !== "block");
      const found = drawn.map((key) => [key.address, resolveElement(manifest, key.address)?.kind]);
      expect(found).toEqual(drawn.map((key) => [key.address, kindOf(key)]));
      expect(resolveElement(manifest, BUNDLE_ADDRESS)).toBeUndefined();
    },
  );
});

describe("every resolvable part", () => {
  it.each(allFixtures.map((fixture) => [fixture.name, fixture.text] as const))(
    "of %s is drawn",
    (_, text) => {
      const manifest = loadText(text);
      const drawn = new Set(
        indexOf(manifest)
          .elements.filter((key) => key.address.part !== undefined)
          .map((key) => addressKey(key.address)),
      );
      // Every ID and none, with every part of one or two words.
      const parts = PART_WORDS.flatMap((word) => [
        [word],
        ...PART_WORDS.map((next) => [word, next]),
      ]);
      const resolvable = [undefined, ...manifestIds(manifest)].flatMap((id) =>
        parts
          .map((part) => (id === undefined ? { part } : { id, part }))
          .filter((address) => resolveElement(manifest, address) !== undefined)
          .map(addressKey),
      );
      expect(new Set(resolvable)).toEqual(drawn);
    },
  );
});

describe("the index of a manifest", () => {
  const manifest = block(view, A).manifest;

  it("is memoised by identity", () => {
    expect(indexOf(manifest)).toBe(indexOf(manifest));
  });

  it("maps every timeline to itself and every entry to the timeline holding it", () => {
    const { owners, ancestry } = indexOf(manifest);
    expect(owners.get("score")).toBe("score");
    expect(owners.get("excerpt")).toBe("excerpt");
    expect(owners.get("region_1")).toBe("annotations");
    expect(owners.get("cmap_6")).toBe("excerpt");
    expect(owners.get("cmap_5")).toBe("recording");
    expect(owners.get("group_1")).toBeUndefined();
    expect(owners.size).toBe(6 + 9);
    expect(ancestry).toEqual(timelineAncestry(manifest));
  });

  it("lists the drawing's elements", () => {
    expect(indexOf(manifest).elements).toEqual(manifestElements(manifest));
  });
});
