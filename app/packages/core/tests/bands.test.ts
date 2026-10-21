import type { PathSegment } from "@timetoalign/timetoshare";
import {
  dumps,
  identityProblems,
  SchemaValidationError,
  schema,
  validate,
} from "@timetoalign/timetoshare";
import { describe, expect, it } from "vitest";
import type { BandKind } from "../src/manifest/bands.ts";
import { BAND_ID_PATTERN, BAND_KINDS, bandAddress } from "../src/manifest/bands.ts";
import { isReservedId } from "../src/manifest/files.ts";
import {
  bandOrderOf,
  bandOrderProblem,
  defaultBandOrder,
  inheritedBandOrder,
} from "../src/manifest/order.ts";
import type { Manifest } from "../src/manifest/types.ts";
import { elementOf, parseAddressSyntax, parseBand } from "../src/workspace/address.ts";
import { A, load, loadText, manifestValue } from "./support.ts";

/** The README's example band order: the marks above the line, the maps below it. */
const R = (id: string) => [
  `${id}/children_1`,
  `${id}/markers_1`,
  id,
  `${id}/conversion_maps_1`,
  `${id}/regions_1`,
  `${id}/flow_control_1`,
];

/** A third band order, different from the default and from `R`. */
const K = (id: string) => [
  `${id}/flow_control_1`,
  id,
  `${id}/children_1`,
  `${id}/conversion_maps_1`,
  `${id}/markers_1`,
  `${id}/regions_1`,
];

/** `manifest` carrying `value` as the band order of `id`, its only entry of `graphical.order`. */
function carrying(manifest: Manifest, id: string, value: unknown): Record<string, unknown> {
  return { ...manifest, graphical: { ...manifest.graphical, order: { [id]: value } } };
}

/** Where and why TimeToShare's validator refuses `value`, or `null` when it is a manifest. */
function validatorRefusal(value: unknown): { path: readonly PathSegment[]; detail: string } | null {
  try {
    validate(value);
    return null;
  } catch (error) {
    if (error instanceof SchemaValidationError) return { path: error.path, detail: error.detail };
    throw error;
  }
}

/** The pattern the schema document gives every entry of an order. */
const ENTRY_PATTERN = schema.$defs.Order.items.pattern;

/** A fixture carrying `order` as its `graphical.order` entries for timelines, beside its own. */
function withOrder(name: string, order: Record<string, readonly string[]>): Manifest {
  const value = manifestValue(name);
  const graphical = (value.graphical ?? {}) as { order?: object };
  return loadText(
    dumps({ ...value, graphical: { ...graphical, order: { ...graphical.order, ...order } } }),
  );
}

describe("band kinds and addresses", () => {
  it("lists the kinds in the order of the default band order", () => {
    expect(BAND_KINDS).toEqual([
      "children",
      "conversion_maps",
      "markers",
      "regions",
      "flow_control",
    ]);
  });

  it.each(BAND_KINDS.map((kind) => [kind]))("addresses the %s band and parses it back", (kind) => {
    expect(bandAddress("score", kind as BandKind)).toBe(`score/${kind}_1`);
    expect(parseBand(`score/${kind}_1`)).toEqual({ timeline: "score", kind });
  });

  it("parses a child's band, and nothing that is not a band address", () => {
    expect(parseBand("b/flow_control_1")).toEqual({ timeline: "b", kind: "flow_control" });
    for (const address of [
      "score/regions_2",
      "score/region_1",
      "score/card",
      "score/regions_1/label",
      "regions_1",
      "/regions_1",
      "score",
    ]) {
      expect([address, parseBand(address)]).toEqual([address, null]);
    }
  });
});

describe("the reserved pattern", () => {
  const bands = ["regions_1", "markers_1", "conversion_maps_1", "children_1", "flow_control_1"];
  const free = ["regions_0", "regions_01", "regions", "region_1", "regions_1x", "x_regions_1"];
  const parts = ["start", "end", "name", "label", "card"];

  it("matches a band id whatever its number, and nothing else", () => {
    for (const id of [...bands, "regions_10"])
      expect([id, BAND_ID_PATTERN.test(id)]).toEqual([id, true]);
    for (const id of [...free, "card"]) expect([id, BAND_ID_PATTERN.test(id)]).toEqual([id, false]);
  });

  it("reserves the band ids and the part words, and no other id", () => {
    for (const id of [...bands, "regions_10", ...parts]) {
      expect([id, isReservedId(id)]).toEqual([id, true]);
    }
    for (const id of free) expect([id, isReservedId(id)]).toEqual([id, false]);
  });
});

describe("band addresses", () => {
  const manifest = load("map.json");

  it.each([
    ["melody/regions_1", "melody"],
    ["melody/children_1", "melody"],
    ["phrase/conversion_maps_1", "phrase"],
    ["melody/tempo", "melody/tempo"],
  ])("read %s as a part of %s", (path, element) => {
    expect(elementOf(manifest, path)).toBe(element);
  });

  it("split from their block as a card's address does", () => {
    for (const part of ["regions_1", "card"]) {
      const parsed = parseAddressSyntax(`${A}/melody/${part}`);
      expect(parsed).toEqual({ block: A, segments: ["melody", part] });
    }
  });
});

describe("band orders", () => {
  const ids = ["clt_1", "clt_3", "clt_2"];
  const orders = (manifest: Manifest) =>
    ids.map((id) => [id, bandOrderOf(manifest, id), inheritedBandOrder(manifest, id)]);

  it("defaults to the children and maps above the line, the rest below", () => {
    expect(defaultBandOrder("score")).toEqual([
      "score/children_1",
      "score/conversion_maps_1",
      "score",
      "score/markers_1",
      "score/regions_1",
      "score/flow_control_1",
    ]);
  });

  it("give every timeline of a manifest without entries its default", () => {
    expect(orders(load("nested.json"))).toEqual(
      ids.map((id) => [id, defaultBandOrder(id), defaultBandOrder(id)]),
    );
  });

  it("let a child follow its parent's entry, band by band id", () => {
    expect(orders(withOrder("nested.json", { clt_1: R("clt_1") }))).toEqual([
      ["clt_1", R("clt_1"), defaultBandOrder("clt_1")],
      ["clt_3", R("clt_3"), R("clt_3")],
      ["clt_2", R("clt_2"), R("clt_2")],
    ]);
  });

  it("let a grandchild follow its parent's own entry, not the root's", () => {
    const manifest = withOrder("nested.json", { clt_1: R("clt_1"), clt_3: K("clt_3") });
    expect(orders(manifest)).toEqual([
      ["clt_1", R("clt_1"), defaultBandOrder("clt_1")],
      ["clt_3", K("clt_3"), R("clt_3")],
      ["clt_2", K("clt_2"), K("clt_2")],
    ]);
  });

  it("let a member that is a child follow its parent, a root member the default", () => {
    const manifest = withOrder("groups/group_child_member.json", { piece: R("piece") });
    expect(
      ["second-half", "recording"].map((id) => [
        bandOrderOf(manifest, id),
        inheritedBandOrder(manifest, id),
      ]),
    ).toEqual([
      [R("second-half"), R("second-half")],
      [defaultBandOrder("recording"), defaultBandOrder("recording")],
    ]);
  });

  it("give an id no timeline carries the default", () => {
    const manifest = load("nested.json");
    expect([bandOrderOf(manifest, "nothing"), inheritedBandOrder(manifest, "nothing")]).toEqual([
      defaultBandOrder("nothing"),
      defaultBandOrder("nothing"),
    ]);
  });
});

describe("band order problems", () => {
  const manifest = load("nested.json");
  const D = [...defaultBandOrder("clt_3")];

  it.each([[D], [R("clt_3")], [K("clt_3")], [[...D].reverse()]])("accept %j", (value) => {
    expect(bandOrderProblem(manifest, "clt_3", value)).toBeNull();
  });

  it.each([["clt_3"], [null], [{}], [["clt_3", 1]]])(
    "refuse %j as no array of strings",
    (value) => {
      expect(bandOrderProblem(manifest, "clt_3", value)).toBe(
        'the band order of "clt_3" is not an array of strings',
      );
    },
  );

  it("refuses a repeated entry", () => {
    expect(bandOrderProblem(manifest, "clt_3", [...D, "clt_3"])).toBe(
      '"clt_3" is repeated in the band order of "clt_3"',
    );
  });

  it("refuses an id no timeline carries", () => {
    expect(bandOrderProblem(manifest, "nothing", defaultBandOrder("nothing"))).toBe(
      '"nothing" names no group or timeline of this manifest',
    );
  });

  const others: [string, readonly string[], string][] = [
    [
      "an entry that is no band of the timeline",
      [...D, "clt_3/regions_2"],
      '"clt_3/regions_2" is not "clt_3" or one of its bands',
    ],
    [
      "a parent's band before the band it displaces",
      D.map((entry) => (entry === "clt_3/regions_1" ? "clt_1/regions_1" : entry)),
      '"clt_1/regions_1" is not "clt_3" or one of its bands',
    ],
    [
      "a missing band",
      D.filter((entry) => entry !== "clt_3/markers_1"),
      '"clt_3/markers_1" is missing from the band order of "clt_3"',
    ],
    ["an empty order", [], '"clt_3/children_1" is missing from the band order of "clt_3"'],
  ];

  it.each(others)("refuses %s as the validators do", (_, value, message) => {
    expect(bandOrderProblem(manifest, "clt_3", value)).toBe(message);
    expect(identityProblems(carrying(manifest, "clt_3", value))[0]?.detail).toBe(message);
  });

  it.each([["clt_3/foo"], ["clt_3/regions_0"], ["clt_3/region_1"], ["clt_3/start"]])(
    "reports %s, which the schema's pattern refuses, as a stranger",
    (entry) => {
      const value = [...D, entry];
      expect(bandOrderProblem(manifest, "clt_3", value)).toBe(
        `"${entry}" is not "clt_3" or one of its bands`,
      );
      expect(validatorRefusal(carrying(manifest, "clt_3", value))).toEqual({
        path: ["graphical", "order", "clt_3", 6],
        detail: `must match pattern "${ENTRY_PATTERN}"`,
      });
    },
  );

  it("refuses exactly the values the validators refuse", () => {
    const values: unknown[] = [
      D,
      R("clt_3"),
      K("clt_3"),
      [...D].reverse(),
      "clt_3",
      null,
      {},
      ["clt_3", 1],
      [...D, "clt_3"],
      ...others.map(([, value]) => value),
    ];
    expect(
      values.map((value) => [
        bandOrderProblem(manifest, "clt_3", value) === null,
        validatorRefusal(carrying(manifest, "clt_3", value)) === null,
      ]),
    ).toEqual(values.map((_, index) => (index < 4 ? [true, true] : [false, false])));
  });
});
