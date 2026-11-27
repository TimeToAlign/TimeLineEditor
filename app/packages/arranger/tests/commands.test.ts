import type { Address, Part, StyleCommand, View } from "@timetoalign/tilie-core";
import {
  addressKey,
  apply,
  FACETS,
  isIndex,
  manifestIds,
  WORKSPACE,
} from "@timetoalign/tilie-core";
import { describe, expect, it } from "vitest";
import type { ZOrderAction } from "../src/commands.ts";
import {
  addCommand,
  deleteQuestion,
  moveCommand,
  nudgeCommand,
  removeCommand,
  rootDisplayCommand,
  rootHidden,
  zOrderCommand,
} from "../src/commands.ts";
import { NOTHING_SELECTED, selectionOf } from "../src/selection.ts";
import {
  A,
  B,
  blockIn,
  C,
  CHILD_MEMBER,
  changed,
  conversionMapOf,
  load,
  MPM,
  metrics,
  mixedPlain,
  numbersView,
  placed,
  viewOf,
  withGrid,
  withoutAncestorCards,
} from "./support.ts";
import { BY_HAND, DEFAULT, drawingIn, virtualView } from "./virtualCards.ts";

/**
 * `bundle_mixed` at (40, 80) with `annotations` at `{x: −30, y: −20}`, its ancestor card hidden:
 * the origin (38, 48.8046875).
 */
const shifted = placed(withoutAncestorCards(mixedPlain()), A, "annotations", { x: -30, y: -20 });
const doubled = changed(shifted, {
  type: "set",
  changes: [{ target: { block: A }, values: { scale: 2 } }],
});

describe("moveCommand", () => {
  const view = viewOf({ id: A, fixture: "bare", x: 40, y: 80 }, { id: B, fixture: "nested" });
  const moves = [
    { id: A, x: 41.5771484375, y: 203 },
    { id: B, x: 19.999999999999943, y: 0 },
  ];

  it("quantizes to 1/2048, in the order of the moves", () => {
    expect(moveCommand(view, moves, metrics)).toEqual({
      type: "set",
      changes: [
        { target: { block: A }, values: { x: 41.5771484375, y: 203 } },
        { target: { block: B }, values: { x: 20, y: 0 } },
      ],
    });
  });

  it("leaves out a block that did not move, and gives null when none moved", () => {
    expect(moveCommand(view, [], metrics)).toBeNull();
    expect(moveCommand(view, [{ id: A, x: 40.0001, y: 79.9999 }], metrics)).toBeNull();
    expect(
      moveCommand(view, [{ id: A, x: 40.0001, y: 79.9999 }, ...moves.slice(1)], metrics),
    ).toEqual({
      type: "set",
      changes: [{ target: { block: B }, values: { x: 20, y: 0 } }],
    });
  });

  it("stores the place origin of the dropped node", () => {
    expect(moveCommand(shifted, [{ id: A, x: 10, y: 60 }], metrics)?.changes).toEqual([
      { target: { block: A }, values: { x: 48, y: 108.8046875 } },
    ]);
    expect(moveCommand(doubled, [{ id: A, x: 10, y: 60 }], metrics)?.changes).toEqual([
      { target: { block: A }, values: { x: 86, y: 157.609375 } },
    ]);
    expect(moveCommand(shifted, [{ id: A, x: 2, y: 31.1953125 }], metrics)).toBeNull();
  });

  it("is accepted by apply", () => {
    const after = changed(view, moveCommand(view, moves, metrics));
    expect([blockIn(after, A).x, blockIn(after, A).y, blockIn(after, B).x]).toEqual([
      41.5771484375, 203, 20,
    ]);
  });
});

describe("nudgeCommand", () => {
  const view = viewOf({ id: A, fixture: "bare", x: 40, y: 80 });
  const offGrid = viewOf({ id: A, fixture: "bare", x: 41, y: 80 });

  it("moves by grid steps", () => {
    expect(nudgeCommand(view, [A], 1, 0, metrics)).toEqual({
      type: "set",
      changes: [{ target: { block: A }, values: { x: 48, y: 80 } }],
    });
    expect(nudgeCommand(view, [A], -8, 2, metrics)).toEqual({
      type: "set",
      changes: [{ target: { block: A }, values: { x: -24, y: 96 } }],
    });
  });

  it("snaps an off-grid block, and steps by the grid size without snapping", () => {
    expect(nudgeCommand(offGrid, [A], 1, 0, metrics)?.changes).toEqual([
      { target: { block: A }, values: { x: 48, y: 80 } },
    ]);
    expect(nudgeCommand(withGrid(offGrid, 8, false), [A], 1, 0, metrics)?.changes).toEqual([
      { target: { block: A }, values: { x: 49, y: 80 } },
    ]);
  });

  it("moves and snaps the node, and stores its place origin", () => {
    expect(nudgeCommand(shifted, [A], 1, 0, metrics)?.changes).toEqual([
      { target: { block: A }, values: { x: 46, y: 80.8046875 } },
    ]);
    expect(nudgeCommand(withGrid(shifted, 8, false), [A], 1, 0, metrics)?.changes).toEqual([
      { target: { block: A }, values: { x: 48, y: 80 } },
    ]);
  });

  it("gives null for no block or no step", () => {
    expect(nudgeCommand(view, [], 1, 0, metrics)).toBeNull();
    expect(nudgeCommand(offGrid, [A], 0, 0, metrics)).toBeNull();
  });
});

describe("zOrderCommand", () => {
  const view = viewOf(
    { id: A, fixture: "bare" },
    { id: B, fixture: "bare" },
    { id: C, fixture: "bare" },
  );

  function order(after: View): string[] {
    return Object.values(after.blocks)
      .sort((left, right) => (left.index < right.index ? -1 : 1))
      .map((block) => block.id);
  }

  it.each<[string[], ZOrderAction, string[], string[]]>([
    [[A], "front", [B, C, A], [A]],
    [[C], "back", [C, A, B], [C]],
    [[A], "forward", [B, A, C], [A]],
    [[C], "backward", [A, C, B], [C]],
    [[A, B], "forward", [C, A, B], [A, B]],
  ])("moves %j %s", (ids, action, expected, touched) => {
    const command = zOrderCommand(view, ids, action);
    expect(command?.changes.map((change) => change.target)).toEqual(
      touched.map((block) => ({ block })),
    );
    for (const change of command?.changes ?? []) {
      expect(isIndex(change.values.index as string)).toBe(true);
    }
    expect(order(changed(view, command))).toEqual(expected);
  });

  it("never gives a block an index another chosen block still holds", () => {
    const front = changed(view, zOrderCommand(view, [A], "front"));
    expect(order(changed(front, zOrderCommand(front, [A, B], "front")))).toEqual([C, B, A]);
  });

  it("gives null when the order is unchanged", () => {
    expect(zOrderCommand(view, [C], "front")).toBeNull();
    expect(zOrderCommand(view, [A], "back")).toBeNull();
    expect(zOrderCommand(view, [A], "backward")).toBeNull();
    expect(zOrderCommand(view, [], "front")).toBeNull();
  });
});

/** The address of the element `id` of block A, or of its part `words`. */
const at = (id: string, ...words: Part[]): Address =>
  words.length === 0 ? { block: A, id } : { block: A, id, part: words };

/** The `remove` of `targets`. */
const removing = (...targets: Address[]) => ({ type: "remove", targets });

describe("removeCommand", () => {
  const nested = viewOf({ id: A, fixture: "nested" }, { id: B, fixture: "bare" });
  const region = viewOf({ id: A, fixture: "with_region" });

  it("removes the selected addresses", () => {
    expect(removeCommand(nested, selectionOf([{ block: A }]), null)).toEqual(
      removing({ block: A }),
    );
    expect(removeCommand(nested, selectionOf([at("clt_3")]), null)).toEqual(removing(at("clt_3")));
  });

  it("folds an element's parts into the element", () => {
    expect(removeCommand(nested, selectionOf([at("clt_3", "name"), at("clt_3")]), null)).toEqual(
      removing(at("clt_3")),
    );
    const command = removeCommand(region, selectionOf([at("region_1", "label")]), null);
    expect(command).toEqual(removing(at("region_1")));
    expect(manifestIds(blockIn(changed(region, command), A).manifest)).toEqual(
      new Set(["clt_1", "clt_2", "clt_3", "timestamp_1", "timestamp_2"]),
    );
  });

  it("removes a root timeline", () => {
    const command = removeCommand(nested, selectionOf([at("clt_1")]), null);
    expect(command).toEqual(removing(at("clt_1")));
    expect(blockIn(changed(nested, command), A).manifest.timelines).toEqual([]);
    expect(removeCommand(nested, selectionOf([{ block: B }, at("clt_1", "name")]), null)).toEqual(
      removing({ block: B }, at("clt_1")),
    );
  });

  it("refuses an empty selection", () => {
    expect(removeCommand(nested, NOTHING_SELECTED, null)).toEqual({
      refused: "Nothing is selected.",
    });
  });

  it("never removes a flow-control element: it is left out, and alone it is refused with a hint", () => {
    const flow = viewOf({ id: A, fixture: "flow_control" });
    const hint = {
      refused: "A flow-control element is not deleted: reject it with a belief in Properties.",
    };
    // A break, a jump, its label and symbol, a jump target, which is selected by no drawing, and
    // a part of the jump that no drawing has, which core cannot resolve.
    for (const address of [
      at("break_1"),
      at("jump_1"),
      at("jump_1", "label"),
      at("jump_1", "symbol"),
      at("jump_target_1"),
      at("jump_1", "elision"),
    ]) {
      expect(removeCommand(flow, selectionOf([address]), null)).toEqual(hint);
    }
    expect(removeCommand(flow, selectionOf([at("break_1"), at("jump_2", "label")]), null)).toEqual(
      hint,
    );
    const mixed = removeCommand(
      flow,
      selectionOf([at("jump_1"), at("timestamp_1"), at("break_1", "label")]),
      null,
    );
    expect(mixed).toEqual(removing(at("timestamp_1")));
    expect(
      blockIn(changed(flow, mixed), A).manifest.timelines[0]?.flow_control.map(({ id }) => id),
    ).toEqual(["jump_target_1", "jump_target_2", "jump_1", "break_1", "jump_2"]);
    // Its timeline takes it along.
    const whole = removeCommand(flow, selectionOf([at("jump_1"), at("flow:quarters")]), null);
    expect(whole).toEqual(removing(at("flow:quarters")));
    expect(blockIn(changed(flow, whole), A).manifest.timelines).toEqual([]);
  });

  it("is accepted by apply", () => {
    const after = changed(nested, removeCommand(nested, selectionOf([at("clt_3")]), null));
    expect(manifestIds(blockIn(after, A).manifest)).toEqual(
      new Set(["clt_1", "timestamp_1", "timestamp_2"]),
    );
  });

  describe("with several roots and groups", () => {
    const numbers = numbersView();
    const mpm = viewOf({ id: A, fixture: MPM }, { id: B, fixture: "bare" });
    const hint = {
      refused:
        "The title of bundle 'Beethoven_op35_1971Curzon_Var14only' is removed only with its block; select the block to delete it.",
    };

    it("removes an element of a root's tree by its ID", () => {
      const command = removeCommand(numbers, selectionOf([at("region_1", "label")]), null);
      expect(command).toEqual(removing(at("region_1")));
      expect(manifestIds(blockIn(changed(numbers, command), A).manifest).has("region_1")).toBe(
        false,
      );
      expect(
        removeCommand(numbers, selectionOf([at("region_1"), at("region_1", "label")]), null),
      ).toEqual(removing(at("region_1")));
      const table = conversionMapOf(MPM, "TableMap");
      const map = removeCommand(mpm, selectionOf([at(table)]), null);
      expect(map).toEqual(removing(at(table)));
      expect(manifestIds(blockIn(changed(mpm, map), A).manifest).has(table)).toBe(false);
    });

    it("removes timelines and groups, a part standing for its element", () => {
      expect(removeCommand(numbers, selectionOf([at("score")]), null)).toEqual(
        removing(at("score")),
      );
      const child = viewOf({ id: A, fixture: CHILD_MEMBER });
      expect(removeCommand(child, selectionOf([at("second-half", "start")]), null)).toEqual(
        removing(at("second-half")),
      );
      expect(removeCommand(numbers, selectionOf([at("group_1", "name")]), null)).toEqual(
        removing(at("group_1")),
      );
    });

    it("removes a member of two groups by the one address of its cards", () => {
      const shared = viewOf({ id: A, fixture: "bundles/bundle_shared_member" });
      const command = removeCommand(shared, selectionOf([at("t", "card")]), null);
      expect(command).toEqual(removing(at("t")));
      expect(manifestIds(blockIn(changed(shared, command), A).manifest).has("t")).toBe(false);
    });

    it("refuses a selection holding a manifest's title whole", () => {
      const title: Address = { block: A, part: ["name"] };
      expect(removeCommand(mpm, selectionOf([title]), null)).toEqual(hint);
      expect(removeCommand(mpm, selectionOf([{ block: B }, title]), null)).toEqual(hint);
    });
  });
});

describe("addCommand", () => {
  const view = viewOf();
  const bare = load("bare");
  const visible = { x: 100, y: 50, zoom: 2, width: 1000, height: 600 };
  /** Where `bare` added as C lands among `bare` blocks A and B at the given place origins. */
  const landing = (...origins: readonly (readonly [number, number])[]) => {
    const among = viewOf(
      ...origins.map(([x, y], index) => ({ id: index === 0 ? A : B, fixture: "bare", x, y })),
    );
    const { x, y } = addCommand(among, C, bare, visible, metrics).block as {
      x: number;
      y: number;
    };
    return [x, y];
  };

  it("places the block's top-left at the centre of the view, snapped to the grid", () => {
    expect(addCommand(view, C, bare, visible, metrics)).toEqual({
      type: "add",
      into: WORKSPACE,
      block: { id: C, manifest: bare, x: 200, y: 128 },
    });
  });

  it("quantizes to 1/2048 when the grid does not snap", () => {
    const free = withGrid(view, 8, false);
    expect(addCommand(free, C, bare, visible, metrics).block).toEqual({
      id: C,
      manifest: bare,
      x: 200,
      y: 125,
    });
    const odd = { x: 0, y: 0, zoom: 3, width: 1001, height: 1 };
    expect(addCommand(free, C, bare, odd, metrics).block).toEqual({
      id: C,
      manifest: bare,
      x: 166.83349609375,
      y: 0.16650390625,
    });
  });

  it("moves right past a block at the centre, by the grid size, rounded up", () => {
    expect(landing([200, 128])).toEqual([688, 128]);
  });

  it("moves past the rightmost of two touching blocks in one step", () => {
    expect(landing([100, 128], [576.5771484375, 128])).toEqual([1064, 128]);
  });

  it("tests again after each move", () => {
    expect(landing([200, 128], [688, 128])).toEqual([1176, 128]);
  });

  it("ignores a block above whose grown rectangle at most touches it", () => {
    expect(landing([200, 40])).toEqual([200, 128]);
    expect(landing([200, 52.62109375])).toEqual([200, 128]);
    expect(landing([200, 53])).toEqual([688, 128]);
  });

  it("is accepted by apply, giving the block the workspace's defaults", () => {
    const among = viewOf({ id: A, fixture: "bare", x: 200, y: 128 });
    const after = changed(among, addCommand(among, C, bare, visible, metrics));
    const block = blockIn(after, C);
    const { scale, length, spacing, width, height } = view.settings.blockDefaults;
    expect([block.x, block.y, block.scale, block.length, block.spacing]).toEqual([
      688,
      128,
      scale,
      length,
      spacing,
    ]);
    expect([block.width, block.height]).toEqual([width, height]);
    expect(block.manifest).toEqual(bare);
    expect(block.index > blockIn(after, A).index).toBe(true);
  });
});

describe("Delete on a virtual card", () => {
  const view = virtualView();
  const card = (id: string): Address => ({ block: A, id, part: ["card"] });
  const hiding = (...changes: [string, object][]) => ({
    type: "set",
    changes: changes.map(([id, place]) => ({ target: { block: A, id }, values: { place } })),
  });
  const unplaced = { x: null, y: null };

  it("hides it: its place unstated, its virtual timeline kept", () => {
    const command = removeCommand(view, selectionOf([card(DEFAULT)]), null);
    expect(command).toEqual(hiding([DEFAULT, unplaced]));
    const after = blockIn(changed(view, command), A);
    expect(Object.hasOwn(after.places, DEFAULT)).toBe(false);
    expect((after.manifest.virtual_timelines ?? []).map((item) => item.id)).toEqual([
      BY_HAND,
      DEFAULT,
      "allegro_single",
    ]);
  });

  it("hides both cards in one set, and unstates every member of a place", () => {
    expect(removeCommand(view, selectionOf([card(BY_HAND), card(DEFAULT)]), null)).toEqual(
      hiding([BY_HAND, unplaced], [DEFAULT, unplaced]),
    );
    const wide = changed(view, {
      type: "set",
      changes: [{ target: { block: A, id: DEFAULT }, values: { place: { width: 300 } } }],
    });
    expect(removeCommand(wide, selectionOf([card(DEFAULT)]), null)).toEqual(
      hiding([DEFAULT, { x: null, y: null, width: null }]),
    );
  });

  it("removes the virtual timeline by its own address", () => {
    expect(removeCommand(view, selectionOf([{ block: A, id: DEFAULT }]), null)).toEqual(
      removing({ block: A, id: DEFAULT }),
    );
  });

  it("refuses a card hidden beside an element deleted, and leaves a chunk out", () => {
    expect(
      removeCommand(view, selectionOf([card(DEFAULT), { block: A, id: "section_b" }]), null),
    ).toEqual({
      refused:
        "Virtual cards are hidden apart from what is deleted; select the virtual cards alone to hide them.",
    });
    const chunkHint = {
      refused:
        "A chunk is changed in its FlowMap; open the flow-control editor of its root to change it.",
    };
    const chunk: Address = { block: A, id: DEFAULT, part: [1] };
    const label: Address = { block: A, id: DEFAULT, part: [1, "label"] };
    const band: Address = { block: A, id: DEFAULT, facet: "regions", part: [1] };
    expect(removeCommand(view, selectionOf([chunk]), null)).toEqual(chunkHint);
    expect(removeCommand(view, selectionOf([label]), null)).toEqual(chunkHint);
    expect(removeCommand(view, selectionOf([band]), null)).toEqual(chunkHint);
    expect(removeCommand(view, selectionOf([chunk, { block: A, id: "section_b" }]), null)).toEqual(
      removing({ block: A, id: "section_b" }),
    );
  });

  it("leaves a virtual member's card in its frame alone", () => {
    const member = viewOf({ id: A, fixture: "groups/virtual_member" });
    expect(removeCommand(member, selectionOf([card(DEFAULT)]), null)).toEqual({
      refused:
        "A virtual card in a frame is not hidden; delete its virtual timeline in the Properties tab.",
    });
  });
});

describe("deleteQuestion", () => {
  const id = (element: string): Address => ({ block: A, id: element });
  /** `view` with `again`, a virtual timeline made from `allegro_default` through `map`. */
  const withAgain = (view: View, map: string) =>
    changed(view, {
      type: "add",
      into: { block: A },
      virtual_timeline: { map, timeline: DEFAULT },
      ids: ["again"],
    });
  const asked = (view: View, ...targets: Address[]) =>
    deleteQuestion(view, { type: "remove", targets });
  const virtualIds = (view: View) =>
    (blockIn(view, A).manifest.virtual_timelines ?? []).map((item) => item.id);

  it("names the virtual timelines a root takes along, and hides the root instead", () => {
    const view = virtualView();
    const question = asked(view, id("allegro"));
    const hiding: StyleCommand = {
      type: "style",
      select: {
        addresses: [
          { id: "allegro", part: ["card"] },
          { id: "allegro" },
          ...FACETS.map((facet) => ({ id: "allegro", facet })),
        ],
      },
      set: { display: "none" },
      blocks: [A],
    };
    expect(question).toEqual({
      question:
        "Deleting timeline 'Allegro' also deletes what is made from it: virtual timeline 'Allegro, practice', virtual timeline 'Allegro, default' and virtual timeline 'Allegro, single'. Delete all, or hide its card instead?",
      remove: removing(id("allegro"), id(BY_HAND), id(DEFAULT), id("allegro_single")),
      hide: hiding,
    });
    expect(rootDisplayCommand(A, "allegro", true)).toEqual(hiding);
    if (question === null || question.hide === null) throw new Error("no question");
    const manifest = blockIn(changed(view, question.remove), A).manifest;
    expect([manifest.timelines, manifest.flow_maps, manifest.virtual_timelines]).toEqual([
      [],
      [],
      [],
    ]);
    const before = blockIn(view, A).manifest;
    const hidden = changed(view, question.hide);
    const kept = blockIn(hidden, A).manifest;
    expect([kept.timelines, kept.flow_maps, kept.virtual_timelines]).toEqual([
      before.timelines,
      before.flow_maps,
      before.virtual_timelines,
    ]);
    expect(kept.graphical?.rules).toEqual([
      ...(before.graphical?.rules ?? []),
      { select: hiding.select, set: { display: "none" } },
    ]);
    expect([rootHidden(before, "allegro"), rootHidden(kept, "allegro")]).toEqual([false, true]);
    // Nothing of allegro's card is drawn; the virtual cards are drawn as before.
    const ids = (shown: View, keep: (id: string) => boolean) =>
      drawingIn(shown)
        .elements.map((element) => ("address" in element ? element.address.id : undefined))
        .filter((element): element is string => element !== undefined && keep(element));
    const virtual = (element: string) => [BY_HAND, DEFAULT, "allegro_single"].includes(element);
    expect(ids(hidden, (element) => !virtual(element))).toEqual([]);
    expect(ids(hidden, virtual)).toEqual(ids(view, virtual));
    const shown = changed(hidden, rootDisplayCommand(A, "allegro", false));
    expect(blockIn(shown, A).manifest.graphical?.rules).toEqual(before.graphical?.rules ?? []);
  });

  it("offers to hide a placed virtual card another virtual timeline is made from", () => {
    const view = withAgain(virtualView(), "single");
    const question = asked(view, id(DEFAULT));
    expect(question).toEqual({
      question:
        "Deleting virtual timeline 'Allegro, default' also deletes what is made from it: virtual timeline 'again'. Delete all, or hide its card instead?",
      remove: removing(id(DEFAULT), id("again")),
      hide: {
        type: "set",
        changes: [{ target: id(DEFAULT), values: { place: { x: null, y: null } } }],
      },
    });
    if (question === null || question.hide === null) throw new Error("no question");
    expect(apply(view, removing(id(DEFAULT)))).toEqual({
      code: "not_removable",
      path: [addressKey(id(DEFAULT))],
      message:
        "virtual timeline 'Allegro, default' is still named: the virtual timeline 'again' comes from it",
    });
    expect(virtualIds(changed(view, question.remove))).toEqual([BY_HAND, "allegro_single"]);
    const hidden = blockIn(changed(view, question.hide), A);
    expect(Object.hasOwn(hidden.places, DEFAULT)).toBe(false);
    expect(virtualIds(changed(view, question.hide))).toEqual([
      "again",
      BY_HAND,
      DEFAULT,
      "allegro_single",
    ]);
  });

  it("asks nothing where nothing else goes", () => {
    const view = withAgain(virtualView(), "single");
    expect(asked(view, id(DEFAULT), id("again"))).toBeNull();
    expect(asked(view, id(BY_HAND))).toBeNull();
    expect(asked(view, id("section_b"))).toBeNull();
    expect(asked(view, { block: A })).toBeNull();
    expect(asked(view, { block: A }, id("allegro"))).toBeNull();
  });

  /** `view` with `loop`, one more FlowMap of `allegro`, its one chunk `again`. */
  const withLoop = (view: View) =>
    changed(view, {
      type: "add",
      into: id("allegro"),
      flow_map: { chunks: ["again"] },
      ids: ["loop"],
    });
  const loopRefusal =
    "virtual timeline 'again' is still named: the FlowMap 'loop' names it as a chunk";

  it("offers no Delete all where core refuses it, saying why, and hides instead", () => {
    const view = withLoop(withAgain(virtualView(), "single"));
    expect(apply(view, removing(id(DEFAULT), id("again")))).toEqual({
      code: "not_removable",
      path: [addressKey(id("again"))],
      message: loopRefusal,
    });
    const question = asked(view, id(DEFAULT));
    const hide = {
      type: "set",
      changes: [{ target: id(DEFAULT), values: { place: { x: null, y: null } } }],
    };
    expect(question).toEqual({
      question:
        "Deleting virtual timeline 'Allegro, default' also deletes what is made from it: virtual timeline 'again'. They cannot all be deleted. Virtual timeline 'again' is still named: the FlowMap 'loop' names it as a chunk. Hide its card instead?",
      remove: null,
      hide,
    });
    if (question === null || question.hide === null) throw new Error("no question");
    const hidden = blockIn(changed(view, question.hide), A);
    expect(Object.hasOwn(hidden.places, DEFAULT)).toBe(false);
  });

  it("offers nothing but Cancel where core refuses Delete all and nothing can be hidden", () => {
    const view = withLoop(
      withAgain(viewOf({ id: A, fixture: "groups/virtual_member" }), "printed"),
    );
    expect(asked(view, id(DEFAULT))).toEqual({
      question:
        "Deleting virtual timeline 'Allegro, default' also deletes what is made from it: virtual timeline 'again'. They cannot all be deleted. Virtual timeline 'again' is still named: the FlowMap 'loop' names it as a chunk.",
      remove: null,
      hide: null,
    });
  });

  it("offers no hiding of a member's card in its frame", () => {
    const view = withAgain(viewOf({ id: A, fixture: "groups/virtual_member" }), "printed");
    expect(asked(view, id(DEFAULT))).toEqual({
      question:
        "Deleting virtual timeline 'Allegro, default' also deletes what is made from it: virtual timeline 'again'. Delete all?",
      remove: removing(id(DEFAULT), id("again")),
      hide: null,
    });
  });
});
