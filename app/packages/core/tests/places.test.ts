import { dumps } from "@timetoalign/timetoshare";
import { describe, expect, it } from "vitest";
import { apply } from "../src/commands/apply.ts";
import { addressKey } from "../src/manifest/address.ts";
import { memberDrawings } from "../src/manifest/files.ts";
import type { Manifest } from "../src/manifest/types.ts";
import type { Address } from "../src/workspace/address.ts";
import { createStore } from "../src/workspace/store.ts";
import type { View } from "../src/workspace/view.ts";
import { checkWorkspace, createView } from "../src/workspace/view.ts";
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
      into: {},
      block: { id: ID, manifest: load(fixture), x: 0, y: 0, ...extra },
    }),
  );
}

/** The address of the element with ID `element` of block `bundle0001`, or of the block for "". */
const target = (element: string): Address =>
  element === "" ? { block: ID } : { block: ID, id: element };

/** The first segment of a path naming the element `element` of block `bundle0001`. */
const where = (element: string) => addressKey(target(element));

/** One `set` of `values` on the element `element` of block `bundle0001`. */
const set = (element: string, values: object) => ({
  type: "set",
  changes: [{ target: target(element), values }],
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

/** The default band order. */
const D = ["children", "conversion_maps", "line", "markers", "regions", "flow_control"];

/** The root `recording`'s markers band at the top, its conversion maps band below its line. */
const R = ["markers", "children", "line", "conversion_maps", "regions", "flow_control"];

/** Every band of the child `excerpt` below its line. */
const E = ["line", "children", "conversion_maps", "markers", "regions", "flow_control"];

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
    expect(block(sized, ID).places).toEqual({
      group_1: { cards: { score: { width: 650, height: 120 } } },
    });
    expect(block(after(sized, set("score", { place: { width: null } })), ID).places).toEqual({
      group_1: { cards: { score: { height: 120 } } },
    });
    const child = after(
      mixed({}, CHILD_MEMBER),
      set("second-half", { place: { width: 650, height: 120 } }),
    );
    expect(block(child, ID).places).toEqual({
      group_1: { cards: { "second-half": { width: 650, height: 120 } } },
    });
  });

  it("states a spacing on a group, an ungrouped root and a member's card", () => {
    const group = after(mixed(), set("group_1", { place: { spacing: 1.5 } }));
    expect(block(group, ID).places).toEqual({ group_1: { spacing: 1.5 } });
    const root = after(mixed(), set("annotations", { place: { spacing: 1.5 } }));
    expect(block(root, ID).places).toEqual({ annotations: { spacing: 1.5 } });
    const card = after(mixed(), set("score", { place: { spacing: 1.5 } }));
    expect(block(card, ID).places).toEqual({ group_1: { cards: { score: { spacing: 1.5 } } } });
    const sized = after(card, set("score", { place: { width: 650 } }));
    expect(block(sized, ID).places).toEqual({
      group_1: { cards: { score: { spacing: 1.5, width: 650 } } },
    });
    expect(block(after(sized, set("score", { place: { spacing: null } })), ID).places).toEqual({
      group_1: { cards: { score: { width: 650 } } },
    });
    const both = after(sized, set("group_1", { place: { x: 10 } }));
    expect(block(both, ID).places).toEqual({
      group_1: { x: 10, cards: { score: { spacing: 1.5, width: 650 } } },
    });
    expect(block(after(both, set("group_1", { place: { x: null } })), ID).places).toEqual({
      group_1: { cards: { score: { spacing: 1.5, width: 650 } } },
    });
    const gapless = after(mixed(), set("group_1", { place: { spacing: 0 } }));
    expect(block(gapless, ID).places).toEqual({ group_1: { spacing: 0 } });
  });

  it("states a margin wherever a spacing is stated", () => {
    const group = after(mixed(), set("group_1", { place: { margin: 12 } }));
    expect(block(group, ID).places).toEqual({ group_1: { margin: 12 } });
    const root = after(mixed(), set("annotations", { place: { margin: 12 } }));
    expect(block(root, ID).places).toEqual({ annotations: { margin: 12 } });
    const card = after(mixed(), set("score", { place: { margin: 12 } }));
    expect(block(card, ID).places).toEqual({ group_1: { cards: { score: { margin: 12 } } } });
    const spaced = after(card, set("score", { place: { spacing: 1.5 } }));
    const place = block(spaced, ID).places.group_1?.cards?.score;
    expect(place).toEqual({ spacing: 1.5, margin: 12 });
    expect(Object.keys(place ?? {})).toEqual(["spacing", "margin"]);
    expect(block(after(spaced, set("score", { place: { margin: null } })), ID).places).toEqual({
      group_1: { cards: { score: { spacing: 1.5 } } },
    });
    const cards = after(mixed(), set("group_1", { cards: { score: { margin: 3 } } }));
    expect(block(cards, ID).places).toEqual({ group_1: { cards: { score: { margin: 3 } } } });
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
    const view = after(mixed(), set("annotations", { order: D }));
    expect(orderOf(view)).toEqual({ ...DISPLAY, annotations: D });
  });

  it("writes a display order and a band order in one set", () => {
    const view = after(mixed(), {
      type: "set",
      changes: [
        { target: target("group_1"), values: { order: ["performance", "score"] } },
        { target: target("recording"), values: { order: R } },
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
        { target: target("group_1"), values: { order: DISPLAY.group_1 } },
        { target: target("recording"), values: { order: R } },
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
      into: {},
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

describe("member cards placed through their group", () => {
  const shared = () => mixed({}, "bundles/bundle_shared_member.json");
  const cards = (group: string, values: object) => set(group, { cards: values });
  const placesOf = (view: View) => block(view, ID).places;

  it("places each card of a member of several groups through its group, merging member by member", () => {
    const one = after(shared(), cards("g1", { t: { width: 650, spacing: 2 } }));
    expect(placesOf(one)).toEqual({ g1: { cards: { t: { width: 650, spacing: 2 } } } });
    const two = after(one, cards("g2", { t: { height: 80 }, v: { width: 300 } }));
    expect(placesOf(two)).toEqual({
      g1: { cards: { t: { width: 650, spacing: 2 } } },
      g2: { cards: { t: { height: 80 }, v: { width: 300 } } },
    });
    const three = after(two, cards("g1", { t: { width: null } }));
    expect(placesOf(three).g1).toEqual({ cards: { t: { spacing: 2 } } });
    const four = after(three, cards("g1", { t: { spacing: null } }));
    expect(placesOf(four)).toEqual({ g2: { cards: { t: { height: 80 }, v: { width: 300 } } } });
    expect(refused(four, cards("g2", { v: { width: 300 } }))).toEqual({
      code: "invalid_value",
      path: [where("g2"), "cards"],
      message: "the command changes nothing",
    });
  });

  it("places a member of one group as `place` on the member does", () => {
    const through = after(shared(), cards("g1", { u: { width: 650 } }));
    expect(through).toEqual(after(shared(), set("u", { place: { width: 650 } })));
    expect(placesOf(through)).toEqual({ g1: { cards: { u: { width: 650 } } } });
  });

  it("refuses a card of no member, a member beyond a card's, and an empty value", () => {
    const view = shared();
    expect(refused(view, cards("g1", { v: { width: 650 } }))).toEqual({
      code: "unknown_place",
      path: [where("g1"), "cards", "v"],
      message: "'v' is no member of group 'g1'",
    });
    expect(refused(view, cards("g1", { t: { x: 1 } }))).toEqual({
      code: "not_an_item",
      path: [where("g1"), "cards", "t", "x"],
      message: "'t' is a member: its card takes only width, height, spacing and margin",
    });
    expect(
      [{}, { t: {} }, { t: { width: 0 } }, { t: null }].map((values) =>
        refusal(apply(view, cards("g1", values))),
      ),
    ).toEqual([
      { code: "invalid_value", path: [where("g1"), "cards"] },
      { code: "invalid_value", path: [where("g1"), "cards", "t"] },
      { code: "non_positive_number", path: [where("g1"), "cards", "t", "width"] },
      { code: "invalid_value", path: [where("g1"), "cards", "t"] },
    ]);
    expect(refusal(apply(view, set("t", { cards: { t: { width: 1 } } })))).toEqual({
      code: "wrong_target_kind",
      path: [where("t"), "cards"],
    });
  });
});

describe("places, display orders and band orders, refused", () => {
  const view = mixed();

  it("refuses a place for what is neither an item nor a member", () => {
    expect(refused(view, set("recording", { place: { x: 1 } }))).toEqual({
      code: "not_an_item",
      path: [where("recording"), "place"],
      message: "'recording' is not drawn in a card of its own",
    });
    expect(refusal(apply(view, set("recording", { place: { x: "a" } })))).toEqual({
      code: "not_an_item",
      path: [where("recording"), "place"],
    });
    expect(
      refusal(apply(mixed({}, CHILD_MEMBER), set("piece", { place: { width: 650 } }))),
    ).toEqual({ code: "not_an_item", path: [where("piece"), "place"] });
  });

  it("refuses the one place of a timeline drawn in the frames of several groups", () => {
    const shared = mixed({}, "bundles/bundle_shared_member.json");
    expect(refused(shared, set("t", { place: { width: 650 } }))).toEqual({
      code: "not_an_item",
      path: [where("t"), "place"],
      message: "'t' is drawn in the frames of several groups",
    });
    expect(block(after(shared, set("u", { place: { width: 650 } })), ID).places).toEqual({
      g1: { cards: { u: { width: 650 } } },
    });
  });

  it("refuses a member's card anything but its size, spacing and margin", () => {
    const card = "'score' is a member: its card takes only width, height, spacing and margin";
    expect(refused(view, set("score", { place: { x: 1 } }))).toEqual({
      code: "not_an_item",
      path: [where("score"), "place", "x"],
      message: card,
    });
    expect(
      [{ width: 650, length: 300 }, { scale: 2 }, { x: "a" }].map((place) =>
        refusal(apply(view, set("score", { place }))),
      ),
    ).toEqual(
      ["length", "scale", "x"].map((member) => ({
        code: "not_an_item",
        path: [where("score"), "place", member],
      })),
    );
    expect(refused(mixed({}, CHILD_MEMBER), set("second-half", { place: { x: 10 } }))).toEqual({
      code: "not_an_item",
      path: [where("second-half"), "place", "x"],
      message: "'second-half' is a member: its card takes only width, height, spacing and margin",
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
      path: [where("group_1"), "order"],
      message: "order must list every member of 'group_1' once",
    });
  });

  it.each([
    [{ x: "1" }, "invalid_value", ["x"]],
    [{ y: Number.POSITIVE_INFINITY }, "non_finite_number", ["y"]],
    [{ length: 0 }, "non_positive_number", ["length"]],
    [{ width: -1 }, "non_positive_number", ["width"]],
    [{ scale: 0 }, "non_positive_number", ["scale"]],
    [{ scale: -1 }, "non_positive_number", ["scale"]],
    [{ spacing: -1 }, "invalid_value", ["spacing"]],
    [{ margin: -1 }, "invalid_value", ["margin"]],
    [{ margin: Number.POSITIVE_INFINITY }, "non_finite_number", ["margin"]],
    [{ margin: Number.NaN }, "non_finite_number", ["margin"]],
    [{ depth: 1 }, "unknown_property", ["depth"]],
    [5, "invalid_value", []],
  ])("refuses the place value %j", (place, code, inside) => {
    expect(refusal(apply(view, set("group_1", { place })))).toEqual({
      code,
      path: [where("group_1"), "place", ...inside],
    });
  });

  it("refuses an empty place value", () => {
    expect(refused(view, set("group_1", { place: {} }))).toEqual({
      code: "invalid_value",
      path: [where("group_1"), "place"],
      message: "a place value states at least one member",
    });
  });

  const without = (order: readonly string[], ...gone: string[]) =>
    order.filter((entry) => !gone.includes(entry));

  it.each([
    [
      E.map((entry) => (entry === "flow_control" ? "flow" : entry)),
      "'flow' is not 'line' or a facet, in the band order of 'excerpt'",
    ],
    [without(E, "regions"), "'regions' is missing from the band order of 'excerpt'"],
    [without(E, "line"), "'line' is missing from the band order of 'excerpt'"],
    [without(E, "markers", "children"), "'children' is missing from the band order of 'excerpt'"],
    [
      E.map((entry) => (entry === "regions" ? "excerpt/regions_1" : entry)),
      "'excerpt/regions_1' is not 'line' or a facet, in the band order of 'excerpt'",
    ],
    [
      E.map((entry) => (entry === "line" ? "excerpt" : entry)),
      "'excerpt' is not 'line' or a facet, in the band order of 'excerpt'",
    ],
    [["score", "performance"], "'score' is not 'line' or a facet, in the band order of 'excerpt'"],
    [[...E, "line"], "'line' is repeated in the band order of 'excerpt'"],
    ["excerpt", "the band order of 'excerpt' is not an array of strings"],
    [[1, 2], "the band order of 'excerpt' is not an array of strings"],
  ])("refuses the band order %j of a child", (order, message) => {
    expect(refused(view, set("excerpt", { order }))).toEqual({
      code: "invalid_order",
      path: [where("excerpt"), "order"],
      message,
    });
  });

  it("refuses a root's band order without its line", () => {
    expect(refused(view, set("recording", { order: without(R, "line") }))).toEqual({
      code: "invalid_order",
      path: [where("recording"), "order"],
      message: "'line' is missing from the band order of 'recording'",
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
        path: [where(id), Object.keys(values)[0]],
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
      into: {},
      block: { id: ID, manifest: load("map.json"), x: 0, y: 0 },
    };
    expect(store.dispatch(add)).toBeNull();
    const before = store.view;
    expect(store.dispatch(set("phrase", { order: null }))).toEqual({
      code: "invalid_value",
      message: "the command changes nothing",
      path: [where("phrase"), "order"],
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
        path: [where(element), property],
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
      { type: "remove", targets: [target("group_2")] },
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
      }),
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
    expect(block(sized, ID).places).toEqual({
      group_1: { cards: { annotations: { spacing: 1.5, width: 700 } } },
    });
  });

  it("moves a card's place with its timeline into a group and out of it", () => {
    const joined = after(
      mixed(),
      set("annotations", { place: { x: 1, width: 700, spacing: 2 } }),
      set("annotations", { group: "group_1" }),
    );
    expect(block(joined, ID).places).toEqual({
      group_1: { cards: { annotations: { width: 700, spacing: 2 } } },
    });
    const left = after(joined, set("annotations", { group: null }));
    expect(block(left, ID).places).toEqual({ annotations: { width: 700, spacing: 2 } });
    const member = after(
      mixed(),
      set("group_1", { place: { x: 10 } }),
      set("score", { place: { width: 650 } }),
      set("score", { group: null }),
    );
    expect(block(member, ID).places).toEqual({ group_1: { x: 10 }, score: { width: 650 } });
  });

  it("drops a removed timeline's place", () => {
    const view = after(mixed(), set("annotations", { place: { x: 1 } }), {
      type: "remove",
      targets: [target("annotations")],
    });
    expect(block(view, ID).places).toEqual({});
  });
});

describe("band orders go with their timelines", () => {
  const ordered = after(
    mixed(),
    set("recording", { order: R }),
    set("excerpt", { order: E }),
    set("annotations", { order: D }),
  );
  const remove = (id: string) => ({ type: "remove", targets: [target(id)] });

  it("removes a timeline's entry and keeps its parent's", () => {
    expect(orderOf(after(ordered, remove("excerpt")))).toEqual({
      group_1: ["score", "performance"],
      group_2: ["page"],
      recording: R,
      annotations: D,
    });
  });

  it("removes the entries of a removed timeline's descendants", () => {
    expect(orderOf(after(ordered, remove("recording")))).toEqual({
      group_1: ["score", "performance"],
      group_2: ["page"],
      annotations: D,
    });
  });

  it("drops a removed timeline's band addresses from statements", () => {
    const inline = { display: "inline" };
    const styled = after(
      mixed(),
      {
        type: "style",
        select: {
          addresses: [
            { id: "excerpt", facet: "regions" },
            { id: "annotations", facet: "regions" },
          ],
        },
        set: inline,
        blocks: [ID],
      },
      {
        type: "style",
        select: { addresses: [{ id: "excerpt", facet: "markers" }] },
        set: inline,
        blocks: [ID],
      },
    );
    const removed = after(styled, remove("excerpt"));
    expect(block(removed, ID).manifest.graphical?.statements).toEqual([
      { select: { addresses: [{ id: "annotations", facet: "regions" }] }, set: inline },
    ]);
  });

  it("renames nothing: a whole manifest changing an id brings its own orders", () => {
    const inline = { display: "inline" };
    const start = after(mixed(), set("excerpt", { order: E }), {
      type: "style",
      select: { addresses: [{ id: "excerpt", facet: "regions" }] },
      set: inline,
      blocks: [ID],
    });
    const stored = block(start, ID).manifest;
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
      message: "'excerpt' names no group or timeline of this manifest",
    });
    const accepted = after(start, set("", { manifest: renamed({ fragment: E }) }));
    expect(orderOf(accepted)).toEqual({
      group_1: DISPLAY.group_1,
      group_2: ["page", "fragment"],
      fragment: E,
    });
    expect(block(accepted, ID).manifest.graphical?.statements).toEqual([
      { select: { addresses: [{ id: "excerpt", facet: "regions" }] }, set: inline },
    ]);
  });
});

describe("a block's places as stored", () => {
  const stored = block(mixed(), ID);
  const found = (changes: object) =>
    checkWorkspace({
      ...createView(),
      blocks: { [ID]: { ...stored, ...changes } },
    }).map(({ code, path, message }) => ({ code, path, message }));
  const at = (...path: (string | number)[]) => ["blocks", ID, ...path];
  const score = (place: object) => ({ group_1: { cards: { score: place } } });

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
    [{ places: { group_1: { spacing: -1 } } }, "invalid_value", ["places", "group_1", "spacing"]],
    [{ places: { group_1: { depth: 1 } } }, "unknown_member", ["places", "group_1", "depth"]],
    [{ places: { group_1: { cards: [] } } }, "invalid_value", ["places", "group_1", "cards"]],
    [{ places: { group_1: { cards: {} } } }, "invalid_value", ["places", "group_1", "cards"]],
    [{ places: score({}) }, "invalid_value", ["places", "group_1", "cards", "score"]],
    [
      { places: score({ height: 2, scale: 1 }) },
      "unknown_member",
      ["places", "group_1", "cards", "score", "scale"],
    ],
    [
      { places: score({ length: 3, width: 2 }) },
      "unknown_member",
      ["places", "group_1", "cards", "score", "length"],
    ],
    [
      { places: score({ width: 2, cards: {} }) },
      "unknown_member",
      ["places", "group_1", "cards", "score", "cards"],
    ],
    [
      { places: score({ width: 0 }) },
      "non_positive_number",
      ["places", "group_1", "cards", "score", "width"],
    ],
  ])("refuses %j", (changes, code, path) => {
    expect(found(changes).map(({ code, path }) => ({ code, path }))).toEqual([
      { code, path: at(...path) },
    ]);
  });

  it("refuses keys naming no item or member, cards outside a group, and a card beyond its size", () => {
    expect(
      found({
        places: {
          score: { width: 650 },
          group_1: {
            x: 3,
            cards: { score: { x: 1 }, page: { width: 650 }, performance: { spacing: 1.5 } },
          },
          nowhere: { y: 2 },
          recording: { x: 4 },
          annotations: { cards: { score: { width: 1 } } },
          group_2: { cards: { page: { width: 650 } } },
        },
      }),
    ).toEqual([
      {
        code: "unknown_member",
        path: at("places", "annotations", "cards"),
        message: "'annotations' is no group: its place has no cards",
      },
      {
        code: "unknown_place",
        path: at("places", "group_1", "cards", "page"),
        message: `'page' is no member of group 'group_1' of block '${ID}'`,
      },
      {
        code: "unknown_member",
        path: at("places", "group_1", "cards", "score", "x"),
        message: "'score' is a member: its card takes only width, height, spacing and margin",
      },
      {
        code: "unknown_place",
        path: at("places", "nowhere"),
        message: `'nowhere' is no group and no ungrouped root of block '${ID}'`,
      },
      {
        code: "unknown_place",
        path: at("places", "recording"),
        message: `'recording' is no group and no ungrouped root of block '${ID}'`,
      },
      {
        code: "unknown_place",
        path: at("places", "score"),
        message: `'score' is no group and no ungrouped root of block '${ID}'`,
      },
    ]);
  });

  it("adds a block with the places it states, refusing a wrong key", () => {
    const places = { annotations: { y: 8 }, group_1: { cards: { score: { width: 650 } } } };
    const given = block(mixed({ places }), ID);
    expect(given.places).toEqual(places);
    expect(stored.places).toEqual({});
    const add = (extra: object) => ({
      type: "add",
      into: {},
      block: { id: ID, manifest: load(BUNDLE), x: 0, y: 0, ...extra },
    });
    const into = [addressKey({}), "block"];
    expect(
      [
        { places: score({ x: 1 }) },
        { places: { recording: { x: 1 } } },
        { places: { group_1: {} } },
        { places: { "group_1/score": { width: 650 } } },
      ].map((extra) => refusal(apply(createView(), add(extra)))),
    ).toEqual([
      { code: "unknown_member", path: [...into, "places", "group_1", "cards", "score", "x"] },
      { code: "unknown_place", path: [...into, "places", "recording"] },
      { code: "invalid_value", path: [...into, "places", "group_1"] },
      { code: "unknown_place", path: [...into, "places", "group_1/score"] },
    ]);
  });
});
