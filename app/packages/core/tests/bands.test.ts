import type { PathSegment } from "@timetoalign/timetoshare";
import {
  dumps,
  identityProblems,
  SchemaValidationError,
  schema,
  validate,
} from "@timetoalign/timetoshare";
import { describe, expect, it } from "vitest";
import { FACETS, isFacet } from "../src/manifest/address.ts";
import {
  bandOrderOf,
  bandOrderProblem,
  DEFAULT_BAND_ORDER,
  inheritedBandOrder,
  LINE,
} from "../src/manifest/order.ts";
import type { Manifest } from "../src/manifest/types.ts";
import { load, loadText, manifestValue } from "./support.ts";

/** The default band order, drawing.md section 4. */
const D = ["children", "conversion_maps", "line", "markers", "regions", "flow_control"];

/** The README's example band order: the marks above the line, the maps below it. */
const R = ["children", "markers", "line", "conversion_maps", "regions", "flow_control"];

/** A third band order, different from the default and from `R`. */
const K = ["flow_control", "line", "children", "conversion_maps", "markers", "regions"];

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

describe("facets", () => {
  it("lists the five facets in the order of the default band order", () => {
    expect(FACETS).toEqual(["children", "conversion_maps", "markers", "regions", "flow_control"]);
    expect([...FACETS, "line", "region", "card", 1].map(isFacet)).toEqual([
      true,
      true,
      true,
      true,
      true,
      false,
      false,
      false,
      false,
    ]);
  });
});

describe("band orders", () => {
  const ids = ["clt_1", "clt_3", "clt_2"];
  const orders = (manifest: Manifest) =>
    ids.map((id) => [id, bandOrderOf(manifest, id), inheritedBandOrder(manifest, id)]);

  it("defaults to the children and maps above the line, the rest below", () => {
    expect(LINE).toBe("line");
    expect(DEFAULT_BAND_ORDER).toEqual(D);
  });

  it("give every timeline of a manifest without entries the default", () => {
    expect(orders(load("nested.json"))).toEqual(ids.map((id) => [id, D, D]));
  });

  it("let a child follow its parent's entry verbatim", () => {
    expect(orders(withOrder("nested.json", { clt_1: R }))).toEqual([
      ["clt_1", R, D],
      ["clt_3", R, R],
      ["clt_2", R, R],
    ]);
  });

  it("let a grandchild follow its parent's own entry, not the root's", () => {
    const manifest = withOrder("nested.json", { clt_1: R, clt_3: K });
    expect(orders(manifest)).toEqual([
      ["clt_1", R, D],
      ["clt_3", K, R],
      ["clt_2", K, K],
    ]);
  });

  it("let a member that is a child follow its parent, a root member the default", () => {
    const manifest = withOrder("groups/group_child_member.json", { piece: R });
    expect(
      ["second-half", "recording"].map((id) => [
        bandOrderOf(manifest, id),
        inheritedBandOrder(manifest, id),
      ]),
    ).toEqual([
      [R, R],
      [D, D],
    ]);
  });

  it("give an ID no timeline carries the default", () => {
    const manifest = load("nested.json");
    expect([bandOrderOf(manifest, "nothing"), inheritedBandOrder(manifest, "nothing")]).toEqual([
      D,
      D,
    ]);
  });
});

describe("band order problems", () => {
  const manifest = load("nested.json");

  it.each([[D], [R], [K], [[...D].reverse()]])("accept %j", (value) => {
    expect(bandOrderProblem(manifest, "clt_3", value)).toBeNull();
  });

  it.each([["line"], [null], [{}], [["line", 1]]])("refuse %j as no array of strings", (value) => {
    expect(bandOrderProblem(manifest, "clt_3", value)).toBe(
      "the band order of 'clt_3' is not an array of strings",
    );
  });

  it("refuses a repeated entry", () => {
    expect(bandOrderProblem(manifest, "clt_3", [...D, "line"])).toBe(
      "'line' is repeated in the band order of 'clt_3'",
    );
  });

  it("refuses an ID no timeline carries", () => {
    expect(bandOrderProblem(manifest, "nothing", D)).toBe(
      "'nothing' names no group or timeline of this manifest",
    );
  });

  const others: [string, readonly string[], string][] = [
    [
      "an entry that is neither line nor a facet",
      [...D, "region"],
      "'region' is not 'line' or a facet, in the band order of 'clt_3'",
    ],
    [
      "the timeline's ID for its line, before the line it displaces",
      D.map((entry) => (entry === "line" ? "clt_3" : entry)),
      "'clt_3' is not 'line' or a facet, in the band order of 'clt_3'",
    ],
    [
      "a band address of the former string form",
      D.map((entry) => (entry === "regions" ? "clt_3/regions_1" : entry)),
      "'clt_3/regions_1' is not 'line' or a facet, in the band order of 'clt_3'",
    ],
    [
      "a missing facet",
      D.filter((entry) => entry !== "markers"),
      "'markers' is missing from the band order of 'clt_3'",
    ],
    [
      "a missing line",
      D.filter((entry) => entry !== "line"),
      "'line' is missing from the band order of 'clt_3'",
    ],
    ["an empty order", [], "'children' is missing from the band order of 'clt_3'"],
  ];

  it.each(others)("refuses %s as the validators do", (_, value, message) => {
    expect(bandOrderProblem(manifest, "clt_3", value)).toBe(message);
    expect(identityProblems(carrying(manifest, "clt_3", value))[0]?.detail).toBe(message);
  });

  it.each([[""], ["li\u0000ne"]])(
    "reports %j, which the schema's pattern refuses, as a stranger",
    (entry) => {
      const value = [...D, entry];
      expect(bandOrderProblem(manifest, "clt_3", value)).toBe(
        `'${entry}' is not 'line' or a facet, in the band order of 'clt_3'`,
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
      R,
      K,
      [...D].reverse(),
      "line",
      null,
      {},
      ["line", 1],
      [...D, "line"],
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
