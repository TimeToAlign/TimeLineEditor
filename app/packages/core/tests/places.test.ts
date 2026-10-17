import { dumps } from "@timetoalign/timeskeleton";
import { describe, expect, it } from "vitest";
import type { Block, View } from "../src/index.ts";
import { apply, checkWorkspace, createView, memberDrawings } from "../src/index.ts";
import { block, changed, deepFreeze, load, loadText, manifestValue, refusal } from "./support.ts";

const ID = "bundle0001";
const BUNDLE = "bundles/bundle_mixed.json";

/** A view with block `bundle0001` holding `bundle_mixed.json`, frozen. */
function mixed(extra: object = {}): View {
  return deepFreeze(
    changed(createView(), {
      type: "add",
      into: "workspace",
      block: { id: ID, manifest: load(BUNDLE), x: 0, y: 0, ...extra },
    }),
  );
}

/** One `set` of `values` on the element `element` of block `bundle0001`. */
const set = (element: string, values: object) => ({
  type: "set",
  changes: [{ target: element === "" ? ID : `${ID}/${element}`, values }],
});

/** The view after each command in turn, frozen at every step. */
function after(view: View, ...commands: object[]): View {
  return commands.reduce<View>((current, command) => deepFreeze(changed(current, command)), view);
}

/** The refusal of `command` on `view`, with its message. */
function refused(view: View, command: object) {
  const result = apply(view, command);
  return { ...refusal(result), message: (result as { message: string }).message };
}

const FLOW_FIRST = ["flow", "regions", "children"];

describe("places, band orders and display orders, accepted", () => {
  it("merges a place, unstates with null and deletes an emptied place", () => {
    const start = mixed();
    const one = after(start, set("group_1", { place: { length: 300 } }));
    expect(block(one, ID)).toEqual({ ...block(start, ID), places: { group_1: { length: 300 } } });
    const two = after(one, set("group_1", { place: { length: null, x: 12 } }));
    expect(block(two, ID).places).toEqual({ group_1: { x: 12 } });
    const three = after(two, set("group_1", { place: { x: null } }));
    expect(block(three, ID).places).toEqual({});
  });

  it("places an ungrouped root anywhere", () => {
    const view = after(
      mixed(),
      set("annotations", { place: { x: -30, y: 4.5, width: 700, height: 120 } }),
    );
    expect(block(view, ID).places).toEqual({
      annotations: { x: -30, y: 4.5, width: 700, height: 120 },
    });
  });

  it("writes a group's display order, and null deletes it", () => {
    const start = mixed();
    const swapped = after(start, set("group_1", { order: ["performance", "score"] }));
    expect(block(swapped, ID).manifest.graphical?.order).toEqual({
      group_1: ["performance", "score"],
      group_2: ["page", "excerpt"],
    });
    const same = after(start, set("group_1", { order: ["score", "performance"] }));
    expect(block(same, ID).manifest.graphical?.order?.group_1).toEqual(["score", "performance"]);
    const deleted = after(start, set("group_1", { order: null }));
    const { manifest } = block(deleted, ID);
    expect(manifest.graphical?.order).toEqual({ group_2: ["page", "excerpt"] });
    const [frame] = memberDrawings(manifest).frames;
    expect(frame?.members.map((member) => member.timeline.id)).toEqual(["performance", "score"]);
  });

  it("sets and deletes band orders of a child, a root and a group", () => {
    const view = after(
      mixed(),
      set("excerpt", { band_order: FLOW_FIRST }),
      set("annotations", { band_order: ["regions", "children", "flow"] }),
      set("group_2", { band_order: ["regions", "flow", "children"] }),
    );
    expect(block(view, ID).bands).toEqual({
      excerpt: FLOW_FIRST,
      annotations: ["regions", "children", "flow"],
      group_2: ["regions", "flow", "children"],
    });
    const deleted = after(view, set("annotations", { band_order: null }));
    expect(block(deleted, ID).bands).toEqual({
      excerpt: FLOW_FIRST,
      group_2: ["regions", "flow", "children"],
    });
  });
});

describe("places, band orders and display orders, refused", () => {
  const view = mixed();

  it("refuses a place for what is drawn in no card of its own", () => {
    expect(refused(view, set("score", { place: { x: 1 } }))).toEqual({
      code: "not_an_item",
      path: [`${ID}/score`, "place"],
      message: "score is not drawn in a card of its own",
    });
    expect(refusal(apply(view, set("recording", { place: { x: 1 } })))).toEqual({
      code: "not_an_item",
      path: [`${ID}/recording`, "place"],
    });
    expect(refusal(apply(view, set("score", { place: { x: "a" } })))).toEqual({
      code: "not_an_item",
      path: [`${ID}/score`, "place"],
    });
  });

  it.each([
    [["score"]],
    [["score", "score"]],
    [["score", "performance", "score"]],
    [["score", "annotations"]],
    ["score"],
  ])("refuses the display order %j", (order) => {
    expect(refused(view, set("group_1", { order }))).toEqual({
      code: "invalid_order",
      path: [`${ID}/group_1`, "order"],
      message: "order must list every member of group_1 once",
    });
  });

  it.each([
    [{ x: "1" }, "invalid_value", ["x"]],
    [{ y: Number.POSITIVE_INFINITY }, "non_finite_number", ["y"]],
    [{ length: 0 }, "non_positive_number", ["length"]],
    [{ width: -1 }, "non_positive_number", ["width"]],
    [{ depth: 1 }, "unknown_property", ["depth"]],
    [5, "invalid_value", []],
  ])("refuses the place value %j", (place, code, inside) => {
    expect(refusal(apply(view, set("group_1", { place })))).toEqual({
      code,
      path: [`${ID}/group_1`, "place", ...inside],
    });
  });

  it("refuses an empty place value", () => {
    expect(refused(view, set("group_1", { place: {} }))).toEqual({
      code: "invalid_value",
      path: [`${ID}/group_1`, "place"],
      message: "a place value states at least one member",
    });
  });

  it("refuses a band order that is none", () => {
    expect(refusal(apply(view, set("excerpt", { band_order: ["flow"] })))).toEqual({
      code: "invalid_order",
      path: [`${ID}/excerpt`, "band_order"],
    });
  });

  it("refuses each property on a target of another kind", () => {
    const cases: [string, string][] = [
      ["excerpt", "place"],
      ["", "place"],
      ["", "band_order"],
      ["annotations", "order"],
      ["group_1", "locked"],
    ];
    expect(
      cases.map(([element, property]) => refusal(apply(view, set(element, { [property]: null })))),
    ).toEqual(
      cases.map(([element, property]) => ({
        code: "wrong_target_kind",
        path: [element === "" ? ID : `${ID}/${element}`, property],
      })),
    );
  });
});

describe("pruning stale keys", () => {
  it("drops a removed group's keys and keeps a timeline's", () => {
    const view = after(
      mixed(),
      set("group_2", { place: { x: 10 }, band_order: ["regions", "flow", "children"] }),
      set("excerpt", { band_order: FLOW_FIRST }),
      { type: "remove", targets: [`${ID}/group_2`] },
    );
    expect([block(view, ID).places, block(view, ID).bands]).toEqual([{}, { excerpt: FLOW_FIRST }]);
    const placed = after(view, set("recording", { place: { x: 1 } }));
    expect(block(placed, ID).places).toEqual({ recording: { x: 1 } });
  });

  it("drops the place of a root that becomes a group member", () => {
    const value = manifestValue(BUNDLE) as {
      groups: { id: string; members: string[] }[];
      graphical: { order: { [group: string]: string[] } };
    };
    const [first, ...others] = value.groups as [{ id: string; members: string[] }];
    const grouped = loadText(
      dumps({
        ...value,
        groups: [{ ...first, members: [...first.members, "annotations"] }, ...others],
        graphical: {
          ...value.graphical,
          order: {
            ...value.graphical.order,
            group_1: [...(value.graphical.order.group_1 as string[]), "annotations"],
          },
        },
      } as never),
    );
    const view = after(
      mixed(),
      set("annotations", { place: { x: 1 }, band_order: FLOW_FIRST }),
      set("", { manifest: grouped }),
    );
    expect([block(view, ID).places, block(view, ID).bands]).toEqual([
      {},
      { annotations: FLOW_FIRST },
    ]);
  });

  it("drops a removed timeline's keys", () => {
    const view = after(mixed(), set("annotations", { place: { x: 1 }, band_order: FLOW_FIRST }), {
      type: "remove",
      targets: [`${ID}/annotations`],
    });
    expect([block(view, ID).places, block(view, ID).bands]).toEqual([{}, {}]);
  });
});

describe("a block's places and band orders as stored", () => {
  const stored = block(mixed(), ID);
  const found = (changes: object) =>
    checkWorkspace({
      ...createView(),
      blocks: { [ID]: { ...stored, ...changes } as unknown as Block },
    }).map(({ code, path, message }) => ({ code, path, message }));
  const at = (...path: (string | number)[]) => ["blocks", ID, ...path];

  it.each([
    [{ places: [] }, "invalid_value", ["places"]],
    [{ places: { group_1: {} } }, "invalid_value", ["places", "group_1"]],
    [{ places: { group_1: null } }, "invalid_value", ["places", "group_1"]],
    [{ places: { group_1: { x: null } } }, "invalid_value", ["places", "group_1", "x"]],
    [
      { places: { group_1: { x: Number.POSITIVE_INFINITY } } },
      "non_finite_number",
      ["places", "group_1", "x"],
    ],
    [
      { places: { group_1: { height: 0 } } },
      "non_positive_number",
      ["places", "group_1", "height"],
    ],
    [{ places: { group_1: { depth: 1 } } }, "unknown_member", ["places", "group_1", "depth"]],
    [{ bands: { score: ["flow"] } }, "invalid_order", ["bands", "score"]],
  ])("refuses %j", (changes, code, path) => {
    expect(found(changes).map(({ code, path }) => ({ code, path }))).toEqual([
      { code, path: at(...path) },
    ]);
  });

  it("refuses keys naming no item, group or timeline", () => {
    expect(
      found({
        places: { score: { x: 1 }, nowhere: { y: 2 }, group_1: { x: 3 } },
        bands: { nowhere: FLOW_FIRST, excerpt: FLOW_FIRST },
      }),
    ).toEqual([
      {
        code: "unknown_place",
        path: at("places", "nowhere"),
        message: `nowhere is no group and no ungrouped root of block ${ID}`,
      },
      {
        code: "unknown_place",
        path: at("places", "score"),
        message: `score is no group and no ungrouped root of block ${ID}`,
      },
      {
        code: "unknown_band_key",
        path: at("bands", "nowhere"),
        message: `nowhere is no group and no timeline of block ${ID}`,
      },
    ]);
  });

  it("adds a block with the places and band orders it states, refusing a wrong key", () => {
    const given = block(
      mixed({ places: { annotations: { y: 8 } }, bands: { score: FLOW_FIRST } }),
      ID,
    );
    expect([given.places, given.bands]).toEqual([{ annotations: { y: 8 } }, { score: FLOW_FIRST }]);
    expect([stored.places, stored.bands]).toEqual([{}, {}]);
    const add = (extra: object) => ({
      type: "add",
      into: "workspace",
      block: { id: ID, manifest: load(BUNDLE), x: 0, y: 0, ...extra },
    });
    expect(
      [
        { places: { score: { x: 1 } } },
        { bands: { nowhere: FLOW_FIRST } },
        { places: { group_1: {} } },
      ].map((extra) => refusal(apply(createView(), add(extra)))),
    ).toEqual([
      { code: "unknown_place", path: [ID, "places", "score"] },
      { code: "unknown_band_key", path: [ID, "bands", "nowhere"] },
      { code: "invalid_value", path: [ID, "places", "group_1"] },
    ]);
  });
});
