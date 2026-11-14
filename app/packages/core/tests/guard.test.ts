import type { Declaration, Selector, Statement } from "@timetoalign/timetoshare";
import { describe, expect, it } from "vitest";
import { applyChanges } from "../src/commands/apply.ts";
import { parseCommand } from "../src/commands/parse.ts";
import { isCommandError } from "../src/errors.ts";
import { addressKey } from "../src/manifest/address.ts";
import type { Manifest } from "../src/manifest/types.ts";
import type { Address } from "../src/workspace/address.ts";
import { addressWords } from "../src/workspace/address.ts";
import type { Block } from "../src/workspace/blocks.ts";
import { sideEffect, statementInside } from "../src/workspace/guard.ts";
import type { View } from "../src/workspace/view.ts";
import { A, addBlock, B, block, changed, deepFreeze, viewOf } from "./support.ts";

const BUNDLE = "bundle0001";
/** The address of block `bundle0001`, and of the element `id` of its manifest. */
const BLOCK: Address = { block: BUNDLE };
const at = (id: string): Address => ({ block: BUNDLE, id });
/** The first segment of a path naming `address`. */
const key = (address: Address) => addressKey(address);
const G1 = at("group_1");
const MIXED = "bundles/bundle_mixed.json";
const RED: Declaration = { stroke: "#FF0000" };
const TIMELINES: Selector = { element: "timeline" };
const SCORE: Selector = { addresses: [{ id: "score" }] };

/** The default band order. */
const D = ["children", "conversion_maps", "line", "markers", "regions", "flow_control"];

/** The root `recording`'s markers band at the top, its conversion maps band below its line. */
const R = ["markers", "children", "line", "conversion_maps", "regions", "flow_control"];

/** Every band of the child `excerpt` below its line. */
const E = ["line", "children", "conversion_maps", "markers", "regions", "flow_control"];

/** The member `score`'s line at the top, its bands below it in their default order. */
const SCORE_LINE_FIRST = E;

const before = deepFreeze(viewOf([BUNDLE, MIXED]));
/** `before` with a second block, `A`, holding `bare.json`. */
const two = deepFreeze(viewOf([BUNDLE, MIXED], [A, "bare.json"]));

/** `view` with members of the bundle's block replaced. */
const withBlock = (view: View, values: Partial<Block>): View => ({
  ...view,
  blocks: { ...view.blocks, [BUNDLE]: { ...block(view, BUNDLE), ...values } },
});

/** `view` with members of the bundle's manifest replaced. */
const withManifest = (view: View, values: Partial<Manifest>): View =>
  withBlock(view, { manifest: { ...block(view, BUNDLE).manifest, ...values } });

const withGrid = (view: View): View => ({
  ...view,
  settings: { ...view.settings, grid: { size: 16, snap: true } },
});

const set = (target: Address, values: object) => ({
  type: "set",
  changes: [{ target, values }],
});

const named = (id: string, name: string) => set(at(id), { name });

/** The name of `address` in a message, in `view` (`addressWords`, pinned in `address.test.ts`). */
const words = (address: Address, view: View = before) => addressWords(view, address);

const outside = (
  what: string,
  path: readonly (string | number)[],
  target = G1,
  view: View = before,
) => ({
  code: "side_effect",
  message: `${what} lies outside ${words(target, view)}: an editor changes only what it edits`,
  path,
});

describe("sideEffect, the exact cases", () => {
  it("accepts a place of the edited group", () => {
    const after = withBlock(before, { places: { group_1: { length: 300 } } });
    expect(sideEffect(before, after, G1)).toBeNull();
  });

  it("refuses a place of another group", () => {
    const after = withBlock(before, { places: { group_2: { x: 10 } } });
    expect(sideEffect(before, after, G1)).toEqual(
      outside(`the place of ${words(at("group_2"))}`, [key(at("group_2"))]),
    );
  });

  it("accepts a member's name and refuses an ungrouped root's", () => {
    expect(sideEffect(before, changed(before, named("score", "S")), G1)).toBeNull();
    expect(sideEffect(before, changed(before, named("annotations", "A")), G1)).toEqual(
      outside(words(at("annotations")), [key(at("annotations"))]),
    );
  });

  it("refuses the block's length and accepts the block adapting", () => {
    expect(sideEffect(before, changed(before, set(BLOCK, { length: 500 })), G1)).toEqual(
      outside("the length of bundle 'Mixed'", [key(BLOCK), "length"]),
    );
    const adapting = set(BLOCK, { x: 40, y: -8, width: 900, height: 300 });
    expect(sideEffect(before, changed(before, adapting), G1)).toBeNull();
  });

  it("refuses a statement reaching outside and accepts one reaching only inside", () => {
    const wide = changed(before, { type: "style", select: TIMELINES, set: RED });
    expect(sideEffect(before, wide, G1)).toEqual(
      outside("the graphical statements of bundle 'Mixed'", [
        BUNDLE,
        "manifest",
        "graphical",
        "statements",
      ]),
    );
    const narrow = changed(before, { type: "style", select: SCORE, set: RED });
    expect(sideEffect(before, narrow, G1)).toBeNull();
  });
});

describe("sideEffect, each rule's path", () => {
  it("refuses a workspace setting in every editor", () => {
    const after = withGrid(before);
    expect(sideEffect(before, after, G1)).toEqual(
      outside("the workspace setting grid", ["{}", "grid"]),
    );
    expect(sideEffect(before, after, BLOCK)).toEqual(
      outside("the workspace setting grid", ["{}", "grid"], BLOCK),
    );
  });

  it("refuses another block changing, appearing or going", () => {
    const moved = changed(two, set({ block: A }, { x: 50 }));
    expect(sideEffect(two, moved, G1)).toEqual(
      outside("the anonymous bundle", [key({ block: A })], G1, two),
    );
    expect(sideEffect(two, changed(two, addBlock(B, "bare.json")), G1)).toEqual(
      outside("the anonymous bundle", [key({ block: B })], G1, two),
    );
    expect(sideEffect(two, changed(two, { type: "remove", targets: [{ block: A }] }), G1)).toEqual(
      outside("the anonymous bundle", [key({ block: A })], G1, two),
    );
    expect(sideEffect(two, moved, BLOCK)).toEqual(
      outside("the anonymous bundle", [key({ block: A })], BLOCK, two),
    );
  });

  it("accepts a band order in every editor holding its timeline, and refuses it elsewhere", () => {
    const excerpt = at("excerpt");
    const recording = at("recording");
    const group2 = at("group_2");
    const order = (target: Address) =>
      outside(
        "the graphical order of bundle 'Mixed'",
        [BUNDLE, "manifest", "graphical", "order"],
        target,
      );
    const child = changed(before, set(excerpt, { order: E }));
    expect(sideEffect(before, child, excerpt)).toBeNull();
    expect(sideEffect(before, child, recording)).toBeNull();
    expect(sideEffect(before, child, group2)).toBeNull();
    expect(sideEffect(child, changed(child, set(excerpt, { order: null })), excerpt)).toBeNull();
    const parent = changed(before, set(recording, { order: R }));
    expect(sideEffect(before, parent, excerpt)).toEqual(order(excerpt));
    expect(sideEffect(before, parent, group2)).toEqual(order(group2));
    const member = changed(before, set(at("score"), { order: SCORE_LINE_FIRST }));
    expect(sideEffect(before, member, G1)).toBeNull();
    const root = changed(before, set(at("annotations"), { order: D }));
    expect(sideEffect(before, root, G1)).toEqual(order(G1));
  });

  it("refuses a top-level member of the manifest", () => {
    expect(sideEffect(before, withManifest(before, { name: "Other" }), G1)).toEqual(
      outside("the manifest's name in bundle 'Mixed'", [BUNDLE, "manifest", "name"]),
    );
  });

  it("refuses a measure map, which no timeline or group contains, at its address", () => {
    const bars = {
      id: "bars",
      name: null,
      meta: {},
      rows: [{ count: 1, qstamp: [0, 1] as const }],
    };
    expect(sideEffect(before, withManifest(before, { measure_maps: [bars] }), G1)).toEqual(
      outside("measure map 'bars'", [key(at("bars"))]),
    );
  });

  it("compares a named style only where an outside statement uses it", () => {
    const styled = (select: object, stroke: string) => ({
      type: "style",
      select,
      set: { stroke },
      name: "accent",
    });
    const wide = changed(before, styled(TIMELINES, "#FF0000"));
    expect(sideEffect(wide, changed(wide, styled(TIMELINES, "#00FF00")), G1)).toEqual(
      outside("the graphical styles of bundle 'Mixed'", [
        BUNDLE,
        "manifest",
        "graphical",
        "styles",
      ]),
    );
    const narrow = changed(before, styled(SCORE, "#FF0000"));
    expect(sideEffect(narrow, changed(narrow, styled(SCORE, "#00FF00")), G1)).toBeNull();
  });

  it("hides the edited group's display order, not another editor's", () => {
    const graphical = block(before, BUNDLE).manifest.graphical ?? {};
    const after = withManifest(before, {
      graphical: { ...graphical, order: { ...graphical.order, group_1: ["performance", "score"] } },
    });
    expect(sideEffect(before, after, G1)).toBeNull();
    const score = at("score");
    expect(sideEffect(before, after, score)).toEqual(
      outside(
        "the graphical order of bundle 'Mixed'",
        [BUNDLE, "manifest", "graphical", "order"],
        score,
      ),
    );
  });

  it("refuses removing the edited element or its block", () => {
    const removal = outside(`the removal of ${words(G1)}`, [key(G1)]);
    expect(sideEffect(before, changed(before, { type: "remove", targets: [G1] }), G1)).toEqual(
      removal,
    );
    expect(sideEffect(before, changed(before, { type: "remove", targets: [BLOCK] }), G1)).toEqual(
      removal,
    );
    const annotations = at("annotations");
    expect(
      sideEffect(before, changed(before, { type: "remove", targets: [annotations] }), annotations),
    ).toEqual(outside(`the removal of ${words(annotations)}`, [key(annotations)], annotations));
    expect(
      sideEffect(before, changed(before, { type: "remove", targets: [BLOCK] }), BLOCK),
    ).toEqual(outside(`the removal of ${words(BLOCK)}`, [key(BLOCK)], BLOCK));
  });
});

describe("sideEffect, the order of the rules", () => {
  it("reports another block before the manifest", () => {
    const after = changed(two, { type: "style", select: TIMELINES, set: RED });
    expect(sideEffect(two, after, G1)).toEqual(
      outside("the anonymous bundle", [key({ block: A })], G1, two),
    );
  });

  it("reports the first rule that applies", () => {
    const renamed = changed(before, named("annotations", "A"));
    const placed = withBlock(renamed, { places: { group_2: { x: 10 } } });
    const longer = withBlock(placed, { length: 500 });
    expect(sideEffect(before, withGrid(longer), G1)).toEqual(
      outside("the workspace setting grid", ["{}", "grid"]),
    );
    expect(sideEffect(before, longer, G1)).toEqual(
      outside("the length of bundle 'Mixed'", [key(BLOCK), "length"]),
    );
    expect(sideEffect(before, placed, G1)).toEqual(
      outside(`the place of ${words(at("group_2"))}`, [key(at("group_2"))]),
    );
    expect(sideEffect(before, renamed, G1)).toEqual(
      outside(words(at("annotations")), [key(at("annotations"))]),
    );
  });
});

describe("sideEffect, with the command's change set", () => {
  const grid = set({}, { grid: { size: 16, snap: true } });
  it.each([
    [before, grid, G1, outside("the workspace setting grid", ["{}", "grid"])],
    [before, grid, {}, null],
    [
      two,
      set({ block: A }, { x: 50 }),
      G1,
      outside("the anonymous bundle", [key({ block: A })], G1, two),
    ],
    [
      two,
      addBlock(B, "bare.json"),
      G1,
      outside("the anonymous bundle", [key({ block: B })], G1, two),
    ],
    [
      two,
      { type: "remove", targets: [{ block: A }] },
      G1,
      outside("the anonymous bundle", [key({ block: A })], G1, two),
    ],
    [
      two,
      { type: "style", select: TIMELINES, set: RED },
      G1,
      outside("the anonymous bundle", [key({ block: A })], G1, two),
    ],
    [two, set({ block: A }, { x: 50 }), { block: A }, null],
    [before, named("score", "S"), G1, null],
    [
      before,
      named("annotations", "A"),
      G1,
      outside(words(at("annotations")), [key(at("annotations"))]),
    ],
    [
      before,
      set(BLOCK, { length: 500 }),
      G1,
      outside("the length of bundle 'Mixed'", [key(BLOCK), "length"]),
    ],
    [before, set(at("score"), { order: SCORE_LINE_FIRST }), G1, null],
    [before, set(G1, { order: ["performance", "score"] }), G1, null],
    [before, set(G1, { place: { length: 300 } }), at("score"), null],
    [before, set(at("region_1"), { name: "R" }), at("annotations"), null],
    [
      before,
      set(at("region_1"), { name: "R" }),
      G1,
      outside(words(at("region_1")), [key(at("region_1"))]),
    ],
    [before, set(at("excerpt"), { offset: 22050 }), at("recording"), null],
    [
      before,
      set(at("excerpt"), { offset: 22050 }),
      G1,
      outside(words(at("excerpt")), [key(at("excerpt"))]),
    ],
  ])("refuses what the full comparison refuses (%#)", (view, command, target, expected) => {
    const parsed = parseCommand(command);
    if (isCommandError(parsed)) throw new Error(parsed.message);
    const applied = applyChanges(view, parsed);
    if (isCommandError(applied)) throw new Error(applied.message);
    expect(sideEffect(view, applied.view, target, applied.changes)).toEqual(expected);
    expect(sideEffect(view, applied.view, target)).toEqual(expected);
  });

  it("reads nothing of the manifest outside the target when every change lies inside", () => {
    // A value without a text, outside group_1: only a projection of the manifest writes it.
    const { manifest } = block(before, BUNDLE);
    const timelines = manifest.timelines.map((timeline) =>
      timeline.id === "annotations" ? { ...timeline, meta: { unread: Number.NaN } } : timeline,
    );
    const view = withManifest(before, { timelines });
    const parsed = parseCommand(named("score", "S"));
    if (isCommandError(parsed)) throw new Error(parsed.message);
    const applied = applyChanges(view, parsed, false);
    if (isCommandError(applied)) throw new Error(applied.message);
    expect(sideEffect(view, applied.view, G1, applied.changes)).toBeNull();
    expect(() => sideEffect(view, applied.view, G1)).toThrow(RangeError);
  });
});

describe("statements inside and outside", () => {
  const was = block(before, BUNDLE).manifest;
  const { group_1: _, ...order } = was.graphical?.order ?? {};
  const shrunk = withManifest(before, {
    groups: was.groups.map((group) =>
      group.id === "group_1" ? { ...group, members: ["performance"] } : group,
    ),
    graphical: { ...was.graphical, order },
  });
  const now = block(shrunk, BUNDLE).manifest;
  const statement = (select: Selector): Statement => ({ select, set: RED });

  it("is inside only when every element it matches in each manifest is contained", () => {
    expect(statementInside([was], "group_1")(statement(SCORE))).toBe(true);
    expect(statementInside([was, now], "group_1")(statement(SCORE))).toBe(false);
    expect(statementInside([was], "group_1")(statement(TIMELINES))).toBe(false);
    expect(
      statementInside([was, now], "group_1")(statement({ addresses: [{ id: "nothing" }] })),
    ).toBe(true);
  });

  it("is moved across the boundary only by a change the projection shows", () => {
    expect(sideEffect(before, shrunk, G1)).toEqual(outside(words(at("score")), [key(at("score"))]));
  });

  it("lies inside when every band it matches belongs to a timeline the editor holds", () => {
    const inline = { display: "inline" };
    const statements = (target: Address) =>
      outside(
        "the graphical statements of bundle 'Mixed'",
        [BUNDLE, "manifest", "graphical", "statements"],
        target,
      );
    const one = changed(before, {
      type: "style",
      select: { addresses: [{ id: "excerpt", facet: "regions" }] },
      set: inline,
      blocks: [BUNDLE],
    });
    expect(sideEffect(before, one, at("excerpt"))).toBeNull();
    expect(sideEffect(before, one, at("recording"))).toBeNull();
    expect(sideEffect(before, one, at("score"))).toEqual(statements(at("score")));
    const every = changed(before, {
      type: "style",
      select: { element: "band", facet: "regions" },
      set: inline,
    });
    expect(sideEffect(before, every, G1)).toEqual(statements(G1));
    expect(sideEffect(before, every, BLOCK)).toBeNull();
  });
});

describe("the editors of a timeline and of the bundle", () => {
  it("lets a child's editor change the child and never its parent", () => {
    const excerpt = at("excerpt");
    expect(sideEffect(before, changed(before, named("recording", "R")), excerpt)).toEqual(
      outside(words(at("recording")), [key(at("recording"))], excerpt),
    );
    expect(sideEffect(before, changed(before, named("excerpt", "E")), excerpt)).toBeNull();
  });

  it("lets the bundle editor change anything in its own block", () => {
    for (const after of [
      changed(before, named("annotations", "A")),
      changed(before, set(BLOCK, { length: 500 })),
      changed(before, { type: "style", select: TIMELINES, set: RED }),
      withBlock(before, { places: { group_2: { x: 10 } } }),
    ]) {
      expect(sideEffect(before, after, BLOCK)).toBeNull();
    }
  });
});

describe("the element a manifest refusal names", () => {
  const remove = (element: string) => ({ type: "remove", targets: [at(element)] });

  it("names a removed member's parent, not the member its group contains", () => {
    const group2 = at("group_2");
    expect(sideEffect(before, changed(before, remove("excerpt")), group2)).toEqual(
      outside(words(at("recording")), [key(at("recording"))], group2),
    );
  });

  it("lets a timeline's editor change its subtree and names what lies outside", () => {
    const recording = at("recording");
    expect(sideEffect(before, changed(before, named("excerpt", "E")), recording)).toBeNull();
    expect(sideEffect(before, changed(before, remove("excerpt")), recording)).toEqual(
      outside(words(at("group_2")), [key(at("group_2"))], recording),
    );
    const excerpt = at("excerpt");
    const both = {
      type: "set",
      changes: [
        { target: excerpt, values: { name: "E" } },
        { target: recording, values: { name: "R" } },
      ],
    };
    expect(sideEffect(before, changed(before, both), excerpt)).toEqual(
      outside(words(at("recording")), [key(at("recording"))], excerpt),
    );
  });
});

describe("removals inside the target", () => {
  const group2 = at("group_2");
  const remove = (element: string) => ({ type: "remove", targets: [at(element)] });

  it("lets a group's editor remove a root member", () => {
    const after = changed(before, remove("page"));
    expect(sideEffect(before, after, group2)).toBeNull();
    const { manifest } = block(after, BUNDLE);
    expect(manifest.timelines.map((timeline) => timeline.id)).toEqual([
      "annotations",
      "performance",
      "recording",
      "score",
    ]);
    expect(manifest.groups.find((group) => group.id === "group_2")?.members).toEqual(["excerpt"]);
    expect(manifest.graphical?.order?.group_2).toEqual(["excerpt"]);
  });

  it("refuses a member's removal or departure that reaches outside", () => {
    expect(sideEffect(before, changed(before, remove("excerpt")), group2)).toEqual(
      outside(words(at("recording")), [key(at("recording"))], group2),
    );
    const was = block(before, BUNDLE).manifest;
    const left = withManifest(before, {
      groups: was.groups.map((group) =>
        group.id === "group_2" ? { ...group, members: ["excerpt"] } : group,
      ),
      graphical: { ...was.graphical, order: { ...was.graphical?.order, group_2: ["excerpt"] } },
    });
    expect(sideEffect(before, left, group2)).toEqual(
      outside(words(at("page")), [key(at("page"))], group2),
    );
  });
});

describe("geometry in the editors", () => {
  const score = at("score");
  const place = (id: string, values: object) => set(at(id), { place: values });

  /** One `set` of each `[id, place]` in turn. */
  const places = (...changes: [string, object][]) => ({
    type: "set",
    changes: changes.map(([id, values]) => ({
      target: at(id),
      values: { place: values },
    })),
  });

  it("lets a member's editor change its group's length and scale and its own card", () => {
    const all = {
      type: "set",
      changes: [
        { target: G1, values: { place: { length: 500 } } },
        { target: G1, values: { place: { scale: 1.5 } } },
        { target: score, values: { place: { width: 650 } } },
      ],
    };
    for (const command of [
      place("group_1", { length: 500 }),
      place("group_1", { scale: 1.5 }),
      place("score", { width: 650 }),
      place("score", { spacing: 1.5, height: 120 }),
      all,
    ]) {
      expect(sideEffect(before, changed(before, command), score)).toBeNull();
    }
    const moved = deepFreeze(changed(before, place("group_1", { x: 10 })));
    expect(sideEffect(moved, changed(moved, place("group_1", { length: 500 })), score)).toBeNull();
  });

  it("lets a member's editor keep the group's size and its siblings' widths in proportion", () => {
    const stretch = places(
      ["group_1", { length: 500, width: 900 }],
      ["performance", { width: 650 }],
    );
    expect(sideEffect(before, changed(before, stretch), score)).toBeNull();
    for (const command of [
      place("group_1", { height: 300 }),
      places(["group_1", { height: 300 }], ["score", { spacing: 2 }]),
    ]) {
      expect(sideEffect(before, changed(before, command), score)).toBeNull();
    }
    const sized = deepFreeze(
      changed(before, place("performance", { width: 650, height: 120, spacing: 1.5 })),
    );
    const unsized = changed(sized, place("performance", { width: null }));
    expect(sideEffect(sized, unsized, score)).toBeNull();
  });

  it("refuses a member's editor every other place", () => {
    const performance = outside(
      `the place of ${words(at("performance"))}`,
      [key(at("performance"))],
      score,
    );
    const group2 = outside(`the place of ${words(at("group_2"))}`, [key(at("group_2"))], score);
    for (const [command, refusal] of [
      [place("group_1", { x: 10 }), outside(`the place of ${words(G1)}`, [key(G1)], score)],
      [place("group_1", { spacing: 1.5 }), outside(`the place of ${words(G1)}`, [key(G1)], score)],
      [place("performance", { spacing: 1.5 }), performance],
      [place("performance", { height: 120 }), performance],
      [places(["group_1", { length: 500 }], ["performance", { spacing: 1.5 }]), performance],
      [places(["group_1", { length: 500 }], ["performance", { height: 120 }]), performance],
      [place("group_2", { length: 500 }), group2],
      [place("group_2", { width: 900 }), group2],
      [
        place("page", { width: 650 }),
        outside(`the place of ${words(at("page"))}`, [key(at("page"))], score),
      ],
    ] as const) {
      expect(sideEffect(before, changed(before, command), score)).toEqual(refusal);
    }
  });

  it("lets a child member's editor change its group's length, not its parent's editor", () => {
    const longer = changed(before, place("group_2", { length: 500 }));
    expect(sideEffect(before, longer, at("excerpt"))).toBeNull();
    const recording = at("recording");
    expect(sideEffect(before, longer, recording)).toEqual(
      outside(`the place of ${words(at("group_2"))}`, [key(at("group_2"))], recording),
    );
  });

  it("lets a group's editor size and stretch its frame and its members' cards", () => {
    const sized = changed(before, place("score", { width: 650, height: 120, spacing: 1.5 }));
    expect(sideEffect(before, sized, G1)).toBeNull();
    const stretched = changed(before, place("group_1", { spacing: 1.5 }));
    expect(sideEffect(before, stretched, G1)).toBeNull();
  });

  it("lets an ungrouped root's editor change its whole place", () => {
    const annotations = at("annotations");
    const resized = changed(before, place("annotations", { scale: 1.5, width: 700 }));
    expect(sideEffect(before, resized, annotations)).toBeNull();
  });

  it("lets the bundle editor scale its block", () => {
    expect(sideEffect(before, changed(before, set(BLOCK, { scale: 2 })), BLOCK)).toBeNull();
  });
});
