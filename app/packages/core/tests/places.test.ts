import { dumps } from "@timetoalign/timeskeleton";
import { describe, expect, it } from "vitest";
import type { Block, Manifest, View } from "../src/index.ts";
import { apply, checkWorkspace, createStore, createView, memberDrawings } from "../src/index.ts";
import {
  block,
  changed,
  deepFreeze,
  load,
  loadText,
  manifestValue,
  refusal,
  testClock,
} from "./support.ts";

const ID = "bundle0001";
const BUNDLE = "bundles/bundle_mixed.json";
const CHILD_MEMBER = "groups/group_child_member.json";

/** A view with block `bundle0001` holding `fixture`, frozen. */
function mixed(extra: object = {}, fixture = BUNDLE): View {
  return deepFreeze(
    changed(createView(), {
      type: "add",
      into: "workspace",
      block: { id: ID, manifest: load(fixture), x: 0, y: 0, ...extra },
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

/** The default band order of the timeline `id`. */
const defaultOrder = (id: string) => [
  `${id}/children_1`,
  `${id}/conversion_maps_1`,
  id,
  `${id}/markers_1`,
  `${id}/regions_1`,
  `${id}/flow_control_1`,
];

/** The root `recording`'s markers band at the top, its conversion maps band below its line. */
const R = [
  "recording/markers_1",
  "recording/children_1",
  "recording",
  "recording/conversion_maps_1",
  "recording/regions_1",
  "recording/flow_control_1",
];

/** Every band of the child `excerpt` below its line. */
const E = [
  "excerpt",
  "excerpt/children_1",
  "excerpt/conversion_maps_1",
  "excerpt/markers_1",
  "excerpt/regions_1",
  "excerpt/flow_control_1",
];

/** The display orders `bundle_mixed.json` states. */
const DISPLAY = { group_1: ["score", "performance"], group_2: ["page", "excerpt"] };

const orderOf = (view: View) => block(view, ID).manifest.graphical?.order;

describe("places, display orders and band orders, accepted", () => {
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

  it("states and unstates a scale on a group and an ungrouped root", () => {
    const scaled = after(mixed(), set("group_1", { place: { scale: 1.5 } }));
    expect(block(scaled, ID).places).toEqual({ group_1: { scale: 1.5 } });
    expect(block(after(scaled, set("group_1", { place: { scale: null } })), ID).places).toEqual({});
    const root = after(mixed(), set("annotations", { place: { scale: 1.5 } }));
    expect(block(root, ID).places).toEqual({ annotations: { scale: 1.5 } });
  });

  it("sizes the card of a member root and of a member child", () => {
    const sized = after(mixed(), set("score", { place: { width: 650, height: 120 } }));
    expect(block(sized, ID).places).toEqual({ score: { width: 650, height: 120 } });
    expect(block(after(sized, set("score", { place: { width: null } })), ID).places).toEqual({
      score: { height: 120 },
    });
    const child = after(
      mixed({}, CHILD_MEMBER),
      set("second-half", { place: { width: 650, height: 120 } }),
    );
    expect(block(child, ID).places).toEqual({ "second-half": { width: 650, height: 120 } });
  });

  it("states a spacing on a group, an ungrouped root and a member's card", () => {
    const group = after(mixed(), set("group_1", { place: { spacing: 1.5 } }));
    expect(block(group, ID).places).toEqual({ group_1: { spacing: 1.5 } });
    const root = after(mixed(), set("annotations", { place: { spacing: 1.5 } }));
    expect(block(root, ID).places).toEqual({ annotations: { spacing: 1.5 } });
    const card = after(mixed(), set("score", { place: { spacing: 1.5 } }));
    expect(block(card, ID).places).toEqual({ score: { spacing: 1.5 } });
    const sized = after(card, set("score", { place: { width: 650 } }));
    expect(block(sized, ID).places).toEqual({ score: { spacing: 1.5, width: 650 } });
    expect(block(after(sized, set("score", { place: { spacing: null } })), ID).places).toEqual({
      score: { width: 650 },
    });
  });

  it("writes a group's display order, and null deletes it", () => {
    const start = mixed();
    const swapped = after(start, set("group_1", { order: ["performance", "score"] }));
    expect(orderOf(swapped)).toEqual({
      group_1: ["performance", "score"],
      group_2: ["page", "excerpt"],
    });
    const deleted = after(start, set("group_1", { order: null }));
    const { manifest } = block(deleted, ID);
    expect(manifest.graphical?.order).toEqual({ group_2: ["page", "excerpt"] });
    const [frame] = memberDrawings(manifest).frames;
    expect(frame?.members.map((member) => member.timeline.id)).toEqual(["performance", "score"]);
  });

  it("writes a root's and a child's band order, and null deletes each", () => {
    const start = mixed();
    const root = after(start, set("recording", { order: R }));
    expect(orderOf(root)).toEqual({ ...DISPLAY, recording: R });
    const manifest = block(start, ID).manifest;
    expect(block(root, ID)).toEqual({
      ...block(start, ID),
      manifest: {
        ...manifest,
        graphical: { ...manifest.graphical, order: { ...DISPLAY, recording: R } },
      },
    });
    const child = after(root, set("excerpt", { order: E }));
    expect(orderOf(child)).toEqual({ ...DISPLAY, recording: R, excerpt: E });
    const parentDeleted = after(child, set("recording", { order: null }));
    expect(orderOf(parentDeleted)).toEqual({ ...DISPLAY, excerpt: E });
    const childDeleted = after(parentDeleted, set("excerpt", { order: null }));
    expect(orderOf(childDeleted)).toEqual(DISPLAY);
  });

  it("stores a band order equal to what the timeline inherits as an entry", () => {
    const view = after(mixed(), set("annotations", { order: defaultOrder("annotations") }));
    expect(orderOf(view)).toEqual({ ...DISPLAY, annotations: defaultOrder("annotations") });
  });

  it("writes a display order and a band order in one set", () => {
    const view = after(mixed(), {
      type: "set",
      changes: [
        { target: `${ID}/group_1`, values: { order: ["performance", "score"] } },
        { target: `${ID}/recording`, values: { order: R } },
      ],
    });
    expect(orderOf(view)).toEqual({
      group_1: ["performance", "score"],
      group_2: ["page", "excerpt"],
      recording: R,
    });
    const stated = after(mixed(), {
      type: "set",
      changes: [
        { target: `${ID}/group_1`, values: { order: DISPLAY.group_1 } },
        { target: `${ID}/recording`, values: { order: R } },
      ],
    });
    expect(orderOf(stated)).toEqual({ ...DISPLAY, recording: R });
  });

  it("journals a band order as one entry and undoes it in one step", () => {
    const store = createStore(
      { view: createView(), journal: [], sessions: {} },
      { clock: testClock() },
    );
    const add = {
      type: "add",
      into: "workspace",
      block: { id: ID, manifest: load(BUNDLE), x: 0, y: 0 },
    };
    expect(store.dispatch(add)).toBeNull();
    const before = store.view;
    const command = set("excerpt", { order: E });
    expect(store.dispatch(command)).toBeNull();
    const done = store.view;
    expect(store.journal.slice(1)).toEqual([
      { command, author: "Gerhardt", time: "2026-10-11T14:03:13.418Z" },
    ]);
    store.undo();
    expect(store.view).toBe(before);
    store.redo();
    expect(store.view).toBe(done);
    expect(orderOf(done)?.excerpt).toEqual(E);
  });
});

describe("places, display orders and band orders, refused", () => {
  const view = mixed();

  it("refuses a place for what is neither an item nor a member", () => {
    expect(refused(view, set("recording", { place: { x: 1 } }))).toEqual({
      code: "not_an_item",
      path: [`${ID}/recording`, "place"],
      message: "recording is not drawn in a card of its own",
    });
    expect(refusal(apply(view, set("recording", { place: { x: "a" } })))).toEqual({
      code: "not_an_item",
      path: [`${ID}/recording`, "place"],
    });
    expect(
      refusal(apply(mixed({}, CHILD_MEMBER), set("piece", { place: { width: 650 } }))),
    ).toEqual({ code: "not_an_item", path: [`${ID}/piece`, "place"] });
  });

  it("refuses a member's card anything but its size and spacing", () => {
    const card = "score is a member: its card takes only width, height and spacing";
    expect(refused(view, set("score", { place: { x: 1 } }))).toEqual({
      code: "not_an_item",
      path: [`${ID}/score`, "place", "x"],
      message: card,
    });
    expect(
      [{ width: 650, length: 300 }, { scale: 2 }, { x: "a" }].map((place) =>
        refusal(apply(view, set("score", { place }))),
      ),
    ).toEqual(
      ["length", "scale", "x"].map((member) => ({
        code: "not_an_item",
        path: [`${ID}/score`, "place", member],
      })),
    );
    expect(refused(mixed({}, CHILD_MEMBER), set("second-half", { place: { x: 10 } }))).toEqual({
      code: "not_an_item",
      path: [`${ID}/second-half`, "place", "x"],
      message: "second-half is a member: its card takes only width, height and spacing",
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
    [{ scale: 0 }, "non_positive_number", ["scale"]],
    [{ scale: -1 }, "non_positive_number", ["scale"]],
    [{ spacing: 0 }, "non_positive_number", ["spacing"]],
    [{ spacing: -1 }, "non_positive_number", ["spacing"]],
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

  const without = (order: readonly string[], ...gone: string[]) =>
    order.filter((entry) => !gone.includes(entry));

  it.each([
    [
      E.map((entry) => (entry === "excerpt/flow_control_1" ? "recording/flow_control_1" : entry)),
      '"recording/flow_control_1" is not "excerpt" or one of its bands',
    ],
    [
      without(E, "excerpt/regions_1"),
      '"excerpt/regions_1" is missing from the band order of "excerpt"',
    ],
    [without(E, "excerpt"), '"excerpt" is missing from the band order of "excerpt"'],
    [
      without(E, "excerpt/markers_1", "excerpt/children_1"),
      '"excerpt/children_1" is missing from the band order of "excerpt"',
    ],
    [[...E, "excerpt/regions_2"], '"excerpt/regions_2" is not "excerpt" or one of its bands'],
    [["score", "performance"], '"score" is not "excerpt" or one of its bands'],
    [[...E, "excerpt"], '"excerpt" is repeated in the band order of "excerpt"'],
    ["excerpt", 'the band order of "excerpt" is not an array of strings'],
    [[1, 2], 'the band order of "excerpt" is not an array of strings'],
  ])("refuses the band order %j of a child", (order, message) => {
    expect(refused(view, set("excerpt", { order }))).toEqual({
      code: "invalid_order",
      path: [`${ID}/excerpt`, "order"],
      message,
    });
  });

  it("refuses a root's band order without its own id", () => {
    expect(refused(view, set("recording", { order: without(R, "recording") }))).toEqual({
      code: "invalid_order",
      path: [`${ID}/recording`, "order"],
      message: '"recording" is missing from the band order of "recording"',
    });
  });

  it("refuses a place or an order that changes nothing", () => {
    const sized = after(view, set("score", { place: { width: 650 } }));
    const ordered = after(view, set("excerpt", { order: E }));
    const deleted = after(view, set("group_1", { order: null }));
    const bare = mixed({}, "map.json");
    expect(block(bare, ID).manifest.graphical).toBeUndefined();
    const cases: [View, string, object][] = [
      [view, "annotations", { place: { x: null } }],
      [sized, "score", { place: { width: 650 } }],
      [view, "group_1", { order: DISPLAY.group_1 }],
      [ordered, "excerpt", { order: E }],
      [view, "recording", { order: null }],
      [view, "excerpt", { order: null }],
      [deleted, "group_1", { order: null }],
      [bare, "melody", { order: null }],
      [bare, "phrase", { order: null }],
    ];
    expect(cases.map(([start, id, values]) => refused(start, set(id, values)))).toEqual(
      cases.map(([, id, values]) => ({
        code: "invalid_value",
        path: [`${ID}/${id}`, Object.keys(values)[0]],
        message: "the command changes nothing",
      })),
    );
  });

  it("journals nothing for a set that changes nothing", () => {
    const store = createStore(
      { view: createView(), journal: [], sessions: {} },
      { clock: testClock() },
    );
    const add = {
      type: "add",
      into: "workspace",
      block: { id: ID, manifest: load("map.json"), x: 0, y: 0 },
    };
    expect(store.dispatch(add)).toBeNull();
    const before = store.view;
    expect(store.dispatch(set("phrase", { order: null }))).toEqual({
      code: "invalid_value",
      message: "the command changes nothing",
      path: [`${ID}/phrase`, "order"],
    });
    expect(store.view).toBe(before);
    expect(store.journal).toHaveLength(1);
  });

  it("refuses each property on a target of another kind", () => {
    const cases: [string, string][] = [
      ["", "place"],
      ["", "order"],
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
  it("drops a removed group's keys and keeps a member's card", () => {
    const view = after(
      mixed(),
      set("group_2", { place: { x: 10 } }),
      set("excerpt", { place: { width: 650 } }),
      set("page", { place: { width: 650 } }),
      { type: "remove", targets: [`${ID}/group_2`] },
    );
    expect(block(view, ID).places).toEqual({ page: { width: 650 } });
    const placed = after(view, set("recording", { place: { x: 1 } }));
    expect(block(placed, ID).places).toEqual({ page: { width: 650 }, recording: { x: 1 } });
  });

  it("cuts the place of a root that becomes a group member to what its card takes", () => {
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
      set("annotations", { place: { x: 1 } }),
      set("", { manifest: grouped }),
    );
    expect(block(view, ID).places).toEqual({});
    const sized = after(
      mixed(),
      set("annotations", { place: { x: 1, scale: 2, spacing: 1.5, width: 700 } }),
      set("", { manifest: grouped }),
    );
    expect(block(sized, ID).places).toEqual({ annotations: { spacing: 1.5, width: 700 } });
  });

  it("drops a removed timeline's place", () => {
    const view = after(mixed(), set("annotations", { place: { x: 1 } }), {
      type: "remove",
      targets: [`${ID}/annotations`],
    });
    expect(block(view, ID).places).toEqual({});
  });
});

describe("band orders go with their timelines", () => {
  const ordered = after(
    mixed(),
    set("recording", { order: R }),
    set("excerpt", { order: E }),
    set("annotations", { order: defaultOrder("annotations") }),
  );
  const remove = (id: string) => ({ type: "remove", targets: [`${ID}/${id}`] });

  it("removes a timeline's entry and keeps its parent's", () => {
    expect(orderOf(after(ordered, remove("excerpt")))).toEqual({
      group_1: ["score", "performance"],
      group_2: ["page"],
      recording: R,
      annotations: defaultOrder("annotations"),
    });
  });

  it("removes the entries of a removed timeline's descendants", () => {
    expect(orderOf(after(ordered, remove("recording")))).toEqual({
      group_1: ["score", "performance"],
      group_2: ["page"],
      annotations: defaultOrder("annotations"),
    });
  });

  it("drops a removed timeline's band addresses from statements", () => {
    const inline = { display: "inline" };
    const styled = after(
      mixed(),
      {
        type: "style",
        select: { ids: ["excerpt/regions_1", "annotations/regions_1"] },
        set: inline,
        blocks: [ID],
      },
      { type: "style", select: { ids: ["excerpt/markers_1"] }, set: inline, blocks: [ID] },
    );
    const removed = after(styled, remove("excerpt"));
    expect(block(removed, ID).manifest.graphical?.statements).toEqual([
      { select: { ids: ["annotations/regions_1"] }, set: inline },
    ]);
  });

  it("renames nothing: a whole manifest changing an id brings its own orders", () => {
    const inline = { display: "inline" };
    const start = after(mixed(), set("excerpt", { order: E }), {
      type: "style",
      select: { ids: ["excerpt/regions_1"] },
      set: inline,
      blocks: [ID],
    });
    const stored = block(start, ID).manifest;
    const fragment = E.map((entry) => entry.replace(/^excerpt/, "fragment"));
    /** The stored manifest with `excerpt` renamed `fragment`, its band orders `orders`. */
    const renamed = (orders: { readonly [key: string]: readonly string[] }): Manifest => ({
      ...stored,
      timelines: stored.timelines.map((root) =>
        root.id === "recording"
          ? { ...root, children: root.children.map((child) => ({ ...child, id: "fragment" })) }
          : root,
      ),
      groups: stored.groups.map((group) =>
        group.id === "group_2" ? { ...group, members: ["fragment", "page"] } : group,
      ),
      graphical: {
        ...stored.graphical,
        order: { group_1: DISPLAY.group_1, group_2: ["page", "fragment"], ...orders },
      },
    });
    expect(refused(start, set("", { manifest: renamed({ excerpt: E }) }))).toEqual({
      code: "schema_violation",
      path: [ID, "manifest", "graphical", "order", "excerpt"],
      message: '"excerpt" names no group or timeline of this manifest',
    });
    const accepted = after(start, set("", { manifest: renamed({ fragment }) }));
    expect(orderOf(accepted)).toEqual({
      group_1: DISPLAY.group_1,
      group_2: ["page", "fragment"],
      fragment,
    });
    expect(block(accepted, ID).manifest.graphical?.statements).toEqual([
      { select: { ids: ["excerpt/regions_1"] }, set: inline },
    ]);
  });
});

describe("a block's places as stored", () => {
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
    [{ places: { group_1: { scale: 0 } } }, "non_positive_number", ["places", "group_1", "scale"]],
    [
      { places: { group_1: { spacing: 0 } } },
      "non_positive_number",
      ["places", "group_1", "spacing"],
    ],
    [
      { places: { score: { height: 2, scale: 1 } } },
      "unknown_member",
      ["places", "score", "scale"],
    ],
    [
      { places: { score: { length: 3, width: 2 } } },
      "unknown_member",
      ["places", "score", "length"],
    ],
    [{ places: { group_1: { depth: 1 } } }, "unknown_member", ["places", "group_1", "depth"]],
  ])("refuses %j", (changes, code, path) => {
    expect(found(changes).map(({ code, path }) => ({ code, path }))).toEqual([
      { code, path: at(...path) },
    ]);
  });

  it("refuses keys naming no item or member, and a card beyond what it takes", () => {
    expect(
      found({
        places: {
          score: { x: 1 },
          nowhere: { y: 2 },
          group_1: { x: 3 },
          recording: { x: 4 },
          page: { width: 650 },
          performance: { spacing: 1.5 },
        },
      }),
    ).toEqual([
      {
        code: "unknown_place",
        path: at("places", "nowhere"),
        message: `nowhere is no group, no ungrouped root and no member of block ${ID}`,
      },
      {
        code: "unknown_place",
        path: at("places", "recording"),
        message: `recording is no group, no ungrouped root and no member of block ${ID}`,
      },
      {
        code: "unknown_member",
        path: at("places", "score", "x"),
        message: "score is a member: its card takes only width, height and spacing",
      },
    ]);
  });

  it("adds a block with the places it states, refusing a wrong key", () => {
    const given = block(mixed({ places: { annotations: { y: 8 }, score: { width: 650 } } }), ID);
    expect(given.places).toEqual({ annotations: { y: 8 }, score: { width: 650 } });
    expect(stored.places).toEqual({});
    const add = (extra: object) => ({
      type: "add",
      into: "workspace",
      block: { id: ID, manifest: load(BUNDLE), x: 0, y: 0, ...extra },
    });
    expect(
      [
        { places: { score: { x: 1 } } },
        { places: { recording: { x: 1 } } },
        { places: { group_1: {} } },
      ].map((extra) => refusal(apply(createView(), add(extra)))),
    ).toEqual([
      { code: "unknown_member", path: [ID, "places", "score", "x"] },
      { code: "unknown_place", path: [ID, "places", "recording"] },
      { code: "invalid_value", path: [ID, "places", "group_1"] },
    ]);
  });
});
