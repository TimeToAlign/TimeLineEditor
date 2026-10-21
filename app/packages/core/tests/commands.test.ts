import { JsonFloat, parseJson } from "@timetoalign/timetoshare";
import { describe, expect, it } from "vitest";
import { apply } from "../src/commands/apply.ts";
import { parseCommand } from "../src/commands/parse.ts";
import { preview } from "../src/commands/preview.ts";
import { addressKey } from "../src/manifest/address.ts";
import { findTimeline } from "../src/manifest/tree.ts";
import type { Manifest, TimelineManifest } from "../src/manifest/types.ts";
import type { Address } from "../src/workspace/address.ts";
import type { View } from "../src/workspace/view.ts";
import { createView, DEFAULT_SETTINGS } from "../src/workspace/view.ts";
import {
  A,
  addBlock,
  B,
  block,
  C,
  changed,
  deepFreeze,
  fixture,
  load,
  refusal,
  unlockedView,
  viewOf,
} from "./support.ts";

/** A bare value on a `fraction` axis. */
const quarters = (numerator: number, denominator = 1) => [numerator, denominator];
/** The address of the element with ID `id` in block `A`. */
const at = (id: string): Address => ({ block: A, id });
/** The addresses of block `A` and of the workspace. */
const BLOCK: Address = { block: A };
const WORKSPACE: Address = {};
/** The first segment of a path naming `address`. */
const key = (address: Address) => addressKey(address);
const set = (target: Address, properties: object) => ({
  type: "set",
  changes: [{ target, values: properties }],
});
const frozen = (...blocks: (readonly [string, string])[]): View => deepFreeze(viewOf(...blocks));
const tempo = () => load("map.json").timelines[0]?.conversion_maps[0] as object;
const ticks = () => load("map.json").timelines[0]?.children[0]?.conversion_maps[0] as object;
/** A `graphical` block as a settled manifest holds it: in its complete form. */
const held = (graphical: object) => ({ order: {}, ...graphical });
/** The refusal of a `set` that changes nothing, at its first value. */
const nothing = (target: Address, property: string) => ({
  code: "invalid_value",
  message: "the command changes nothing",
  path: [key(target), property],
});

/** The value of `apply`, the input view having been deep-frozen first. */
function applied(view: View, command: object): View {
  return changed(deepFreeze(view), command);
}

function rejected(view: View, command: object) {
  return refusal(apply(deepFreeze(view), command));
}

/** The manifest of a block. */
function manifest(view: View, id = A): Manifest {
  return block(view, id).manifest;
}

/** The first root timeline of a block's manifest. */
function root(view: View, id = A): TimelineManifest {
  const [first] = manifest(view, id).timelines;
  if (first === undefined) throw new Error(`block ${id} has no root`);
  return first;
}

describe("add", () => {
  it("adds a block with the defaults and an index after the others", () => {
    const view = applied(createView(), addBlock(A, "bare.json"));
    expect(block(view)).toEqual({
      id: A,
      parent: null,
      index: "a0",
      x: 0,
      y: 0,
      scale: 1,
      length: 400,
      spacing: 8,
      width: null,
      height: null,
      places: {},
      manifest: load("bare.json"),
    });
    const second = applied(view, {
      type: "add",
      into: WORKSPACE,
      block: { id: B, manifest: load("bare.json"), x: 0, y: 0, scale: 2 },
    });
    expect([block(second, B).index, block(second, B).scale]).toEqual(["a1", 2]);
    const given = applied(view, {
      type: "add",
      into: WORKSPACE,
      block: { id: C, manifest: load("bare.json"), x: 0, y: 0, index: "Zz" },
    });
    expect(block(given, C).index).toBe("Zz");
  });

  it("adds a child given in the minimal form, normalizing its offset and growing the root", () => {
    const view = applied(viewOf([A, "bare.json"]), {
      type: "add",
      into: at("bare"),
      child: {
        id: "clt_1",
        offset: quarters(2, 4),
        unit: "quarters",
        length: [8, 1],
        locked: true,
      },
    });
    const [bare] = load("bare.json").timelines;
    if (bare === undefined) throw new Error("bare.json holds a root");
    expect(root(view).length).toEqual([17, 2]);
    expect(root(view).children).toEqual([
      { ...bare, id: "clt_1", name: null, offset: quarters(1, 2), locked: true },
    ]);
  });

  it("adds conversion maps verbatim, in id order whichever comes first", () => {
    for (const order of [
      [tempo(), ticks()],
      [ticks(), tempo()],
    ]) {
      let view = viewOf([A, "bare.json"]);
      for (const map of order) view = applied(view, { type: "add", into: at("bare"), map });
      expect(root(view).conversion_maps).toEqual([tempo(), ticks()]);
    }
  });

  it("adds a conversion map into a segment line, validating the entry alone", () => {
    const view = applied(viewOf([A, "segment_line.json"]), {
      type: "add",
      into: at("b"),
      map: tempo(),
    });
    const line = findTimeline(manifest(view), "b");
    expect(line?.conversion_maps).toEqual([tempo()]);
    expect(line?.length).toEqual(quarters(12));
    expect(line?.children.map((child) => child.id)).toEqual(["b1", "b2"]);
  });

  it("refuses with the exact code and path", () => {
    const view = viewOf([A, "map.json"]);
    const bare = load("bare.json");
    expect(rejected(view, { type: "add", into: at("tempo"), child: {} })).toEqual({
      code: "wrong_target_kind",
      path: [key(at("tempo")), "child"],
    });
    expect(
      rejected(viewOf([A, "groups/group_number_types.json"]), {
        type: "add",
        into: at("group_1"),
        region: { id: "region_1", start: [0, 1], end: [1, 1] },
      }),
    ).toEqual({ code: "wrong_target_kind", path: [key(at("group_1")), "region"] });
    expect(rejected(view, { type: "add", into: WORKSPACE, child: {} })).toEqual({
      code: "wrong_target_kind",
      path: [key(WORKSPACE), "child"],
    });
    const blockValue = (value: object) => ({ type: "add", into: WORKSPACE, block: value });
    expect(rejected(view, blockValue({ id: "BAD", manifest: bare, x: 0, y: 0 }))).toEqual({
      code: "invalid_block_id",
      path: [key(WORKSPACE), "block", "id"],
    });
    expect(rejected(view, blockValue({ id: A, manifest: bare, x: 0, y: 0 }))).toEqual({
      code: "duplicate_id",
      path: [key(WORKSPACE), "block", "id"],
    });
    expect(
      rejected(view, blockValue({ id: B, manifest: bare, x: 0, y: 0, overrides: {} })),
    ).toEqual({ code: "unknown_property", path: [key(WORKSPACE), "block", "overrides"] });
    expect(rejected(view, blockValue({ id: B, manifest: bare, y: 0 }))).toEqual({
      code: "invalid_value",
      path: [key(WORKSPACE), "block", "x"],
    });
    expect(rejected(view, blockValue({ id: B, manifest: bare, x: 0, y: 0, scale: 0 }))).toEqual({
      code: "non_positive_number",
      path: [key(WORKSPACE), "block", "scale"],
    });
    const one = viewOf([A, "bare.json"]);
    expect(
      rejected(one, {
        type: "add",
        into: at("bare"),
        child: { ...bare.timelines[0], offset: quarters(0), locked: true },
      }),
    ).toEqual({ code: "duplicate_id", path: [key(at("bare")), "child", "id"] });
    expect(
      rejected(one, { type: "add", into: at("bare"), map: { ...tempo(), id: "bare" } }),
    ).toEqual({ code: "duplicate_id", path: [key(at("bare")), "map", "id"] });
    // A given ID below the value's own that the manifest holds is refused where it would lie.
    const [own] = bare.timelines;
    const nested = { ...own, id: "fresh", children: [{ ...own, id: "bare", offset: quarters(0) }] };
    expect(rejected(one, { type: "add", into: BLOCK, timeline: nested })).toEqual({
      code: "duplicate_id",
      path: [A, "manifest", "timelines", 1, "children", 0, "id"],
    });
    expect(
      rejected(one, { type: "add", into: at("bare"), child: { ...nested, offset: quarters(0) } }),
    ).toEqual({
      code: "duplicate_id",
      path: [A, "manifest", "timelines", 0, "children", 0, "children", 0, "id"],
    });
    const mapped = { ...own, id: "fresh", conversion_maps: [{ ...tempo(), id: "bare" }] };
    expect(rejected(one, { type: "add", into: BLOCK, timeline: mapped })).toEqual({
      code: "duplicate_id",
      path: [A, "manifest", "timelines", 1, "conversion_maps", 0, "id"],
    });
    expect(
      rejected(one, {
        type: "add",
        into: at("bare"),
        map: { ...tempo(), source_unit: "seconds" },
      }),
    ).toEqual({
      code: "schema_violation",
      path: [A, "manifest", "timelines", 0, "conversion_maps", 0, "source_unit"],
    });
    expect(
      rejected(one, {
        type: "add",
        into: at("bare"),
        child: { id: "clt_1", offset: quarters(0), unit: "seconds", length: null },
      }),
    ).toEqual({
      code: "schema_violation",
      path: [A, "manifest", "timelines", 0, "children", 0, "unit"],
    });
    expect(
      rejected(one, {
        type: "add",
        into: at("bare"),
        child: { id: "clt_1", offset: quarters(-1), unit: "quarters", length: quarters(4) },
      }),
    ).toEqual({
      code: "negative_child_offset",
      path: [A, "manifest", "timelines", 0, "children", 0, "offset"],
    });
    const child = [A, "manifest", "timelines", 0, "children", 0];
    for (const [member, path] of [
      [{ children: 5 }, [...child, "children"]],
      [{ children: [5] }, [...child, "children", 0]],
      [{ flow_control: 5 }, [...child, "flow_control"]],
    ] as const) {
      const value = { id: "clt_1", offset: quarters(0), unit: "quarters", length: null, ...member };
      expect(rejected(one, { type: "add", into: at("bare"), child: value })).toEqual({
        code: "schema_violation",
        path,
      });
    }
  });
});

describe("set", () => {
  it("moves two blocks in one command and changes nothing else", () => {
    const view = frozen([A, "bare.json"], [B, "map.json"]);
    const moved = applied(view, {
      type: "set",
      changes: [
        { target: BLOCK, values: { x: 128, y: 64 } },
        { target: { block: B }, values: { x: 1, y: 2 } },
      ],
    });
    expect(block(moved)).toEqual({ ...block(view), x: 128, y: 64 });
    expect(block(moved, B)).toEqual({ ...block(view, B), x: 1, y: 2 });
  });

  it("sets the placement of a block", () => {
    const view = frozen([A, "bare.json"]);
    const placement = { scale: 2, width: 120, height: null, length: 800, spacing: 2 };
    expect(block(applied(view, set(BLOCK, placement)))).toEqual({ ...block(view), ...placement });
    expect(block(applied(view, set(BLOCK, { spacing: 0 }))).spacing).toBe(0);
  });

  it("sets the workspace settings member by member, graphical whole", () => {
    const view = frozen([A, "bare.json"]);
    const defaults = applied(view, set(WORKSPACE, { blockDefaults: { length: 640 } }));
    expect(defaults.settings).toEqual({
      ...DEFAULT_SETTINGS,
      blockDefaults: { ...DEFAULT_SETTINGS.blockDefaults, length: 640 },
    });
    const grid = applied(view, set(WORKSPACE, { grid: { snap: false } }));
    expect(grid.settings.grid).toEqual({ size: 8, snap: false });
    const graphical = { statements: [{ select: { element: "map" }, set: { stroke: "#C00000" } }] };
    expect(applied(view, set(WORKSPACE, { graphical })).settings.graphical).toEqual(graphical);
  });

  it("reads a declaration's integral float of a setting or a style command as its double", () => {
    // A command text that writes `2.0` reads the number as a `JsonFloat`; the stored
    // declaration holds the double, so the cascade computes with a number.
    const view = frozen([A, "map.json"]);
    const float = new JsonFloat(2);
    const statement = { select: { element: "map" }, set: { "stroke-width": float } };
    const stored = { statements: [{ select: { element: "map" }, set: { "stroke-width": 2 } }] };
    expect(
      applied(view, set(WORKSPACE, { graphical: { statements: [statement] } })).settings.graphical,
    ).toEqual(stored);
    const styled = applied(view, {
      type: "style",
      select: { element: "map" },
      set: { "stroke-width": float, opacity: null },
    });
    expect(manifest(styled).graphical?.statements).toEqual([
      { select: { element: "map" }, set: { "stroke-width": 2 } },
    ]);
    expect(
      parseCommand({
        type: "style",
        select: { element: "map" },
        set: { "stroke-width": float, opacity: null },
      }),
    ).toEqual({
      type: "style",
      select: { element: "map" },
      set: { "stroke-width": 2, opacity: null },
    });
  });

  it("replaces a block's manifest whole, whatever it holds", () => {
    const view = applied(viewOf([A, "bare.json"]), set(BLOCK, { manifest: load("nested.json") }));
    expect(manifest(view)).toEqual(load("nested.json"));
    const bundle = load("bundles/bundle_mixed.json");
    expect(manifest(applied(view, set(BLOCK, { manifest: bundle })))).toEqual(bundle);
  });

  it("sets timeline members, growing the unlocked root for a child's offset", () => {
    const view = frozen([A, "nested.json"]);
    expect(root(applied(view, set(at("clt_1"), { name: "Score" })))).toEqual({
      ...root(view),
      name: "Score",
    });
    expect(root(applied(view, set(at("clt_1"), { meta: { composer: "Anon" } }))).meta).toEqual({
      composer: "Anon",
    });
    expect(root(applied(view, set(at("clt_1"), { length: quarters(12) }))).length).toEqual(
      quarters(12),
    );
    const moved = root(applied(view, set(at("clt_3"), { offset: quarters(6) })));
    expect([moved.children[0]?.offset, moved.length]).toEqual([quarters(6), quarters(16)]);
    const grown = root(applied(view, set(at("clt_3"), { offset: quarters(10) })));
    expect([grown.children[0]?.offset, grown.length]).toEqual([quarters(10), quarters(18)]);
  });

  it("replaces a conversion map's payload, keeping its id", () => {
    const view = frozen([A, "map.json"]);
    const payload = { ...tempo(), scalar: [1, 4] };
    expect(root(applied(view, set(at("tempo"), { map: payload }))).conversion_maps).toEqual([
      payload,
    ]);
  });

  it("refuses by the target's kind with the exact code and path", () => {
    const view = viewOf([A, "nested.json"], [B, "bare.json"]);
    const cases: [object, string, (string | number)[]][] = [
      [set(at("clt_1"), { id: "x" }), "id_not_settable", [key(at("clt_1")), "id"]],
      [set(BLOCK, { colour: 1 }), "unknown_property", [key(BLOCK), "colour"]],
      [set(WORKSPACE, { x: 1 }), "wrong_target_kind", [key(WORKSPACE), "x"]],
      [set(BLOCK, { grid: { size: 4 } }), "wrong_target_kind", [key(BLOCK), "grid"]],
      [
        set(at("clt_1"), { offset: quarters(0) }),
        "wrong_target_kind",
        [key(at("clt_1")), "offset"],
      ],
      [set(BLOCK, { x: "1" }), "invalid_value", [key(BLOCK), "x"]],
      [set(BLOCK, { x: Number.POSITIVE_INFINITY }), "non_finite_number", [key(BLOCK), "x"]],
      [set(BLOCK, { scale: 0 }), "non_positive_number", [key(BLOCK), "scale"]],
      [set(BLOCK, { width: -5 }), "non_positive_number", [key(BLOCK), "width"]],
      [set(BLOCK, { spacing: -1 }), "invalid_value", [key(BLOCK), "spacing"]],
      [set(BLOCK, { index: "a00" }), "invalid_index", [key(BLOCK), "index"]],
      [set(BLOCK, { index: "a1" }), "duplicate_index", [key(BLOCK), "index"]],
      [
        set(WORKSPACE, { grid: { size: 0 } }),
        "non_positive_number",
        [key(WORKSPACE), "grid", "size"],
      ],
      [
        set(WORKSPACE, { graphical: { statements: [{ select: {}, set: { stroke: "red" } }] } }),
        "schema_violation",
        [key(WORKSPACE), "graphical", "statements", 0, "set", "stroke"],
      ],
      [set(at("clt_1"), { length: 0.5 }), "invalid_coordinate", [key(at("clt_1")), "length"]],
      [set(at("clt_1"), { length: 8 }), "invalid_coordinate", [key(at("clt_1")), "length"]],
      [set(at("clt_3"), { length: quarters(4) }), "locked", [key(at("clt_3")), "length"]],
      [
        set(at("clt_1"), { length: quarters(23, 2) }),
        "length_below_content",
        [key(at("clt_1")), "length"],
      ],
      [
        set(BLOCK, { manifest: { ...load("bare.json"), timetoshare: "0.6.0" } }),
        "schema_violation",
        [A, "manifest", "timetoshare"],
      ],
      [
        set(at("clt_2"), { offset: quarters(7) }),
        "child_exceeds_parent",
        [key(at("clt_2")), "offset"],
      ],
      [
        set(at("clt_2"), { offset: quarters(-1) }),
        "negative_child_offset",
        [A, "manifest", "timelines", 0, "children", 0, "children", 0, "offset"],
      ],
      [set({ block: "short" }, { x: 1 }), "invalid_address", ["changes", 0, "target"]],
      [set({ block: "0000000009" }, { x: 1 }), "unknown_target", [key({ block: "0000000009" })]],
      [set(at("nothing"), { name: null }), "unknown_target", [key(at("nothing"))]],
    ];
    for (const [command, code, path] of cases)
      expect(rejected(view, command)).toEqual({ code, path });
    const maps = viewOf([A, "map.json"]);
    expect(rejected(maps, set(at("tempo"), { start: 0 }))).toEqual({
      code: "wrong_target_kind",
      path: [key(at("tempo")), "start"],
    });
    expect(rejected(maps, set(at("tempo"), { map: { ...tempo(), id: "other" } }))).toEqual({
      code: "id_not_settable",
      path: [key(at("tempo")), "map", "id"],
    });
    // The manifest's own ID addresses nothing.
    const bare = viewOf([A, "bare.json"]);
    const takes = {
      ...bare,
      blocks: { [A]: { ...block(bare), manifest: { ...manifest(bare), id: "takes" } } },
    };
    expect(rejected(takes, set(at("takes"), { x: 1 }))).toEqual({
      code: "unknown_target",
      path: [key(at("takes"))],
    });
  });

  it("is atomic", () => {
    const view = frozen([A, "bare.json"]);
    expect(
      rejected(view, {
        type: "set",
        changes: [
          { target: BLOCK, values: { x: 1 } },
          { target: { block: "0000000009" }, values: { x: 2 } },
        ],
      }),
    ).toEqual({ code: "unknown_target", path: [key({ block: "0000000009" })] });
    expect(block(view).x).toBe(0);
  });

  it("refuses a set that changes nothing, on every kind of target", () => {
    const view = frozen([A, "nested.json"], [B, "bare.json"]);
    const maps = frozen([A, "map.json"]);
    const flow = frozen([A, "flow_control.json"]);
    const cases: [View, Address, object][] = [
      [view, WORKSPACE, { grid: { size: 8 } }],
      [view, WORKSPACE, { blockDefaults: { length: 400 } }],
      [view, WORKSPACE, { graphical: {} }],
      [view, BLOCK, { x: 0 }],
      [view, BLOCK, { index: "a0" }],
      [view, BLOCK, { width: null }],
      [view, BLOCK, { manifest: load("nested.json") }],
      [view, at("clt_1"), { name: null }],
      [view, at("clt_1"), { meta: {} }],
      [view, at("clt_1"), { length: quarters(32, 2) }],
      [view, at("clt_3"), { offset: quarters(4) }],
      [maps, at("tempo"), { map: tempo() }],
      [flow, at("jump_to_1"), { coordinate: quarters(4, 2) }],
    ];
    expect(cases.map(([start, target, values]) => apply(start, set(target, values)))).toEqual(
      cases.map(([, target, values]) => nothing(target, Object.keys(values)[0] as string)),
    );
  });

  it("judges the whole set, never one value", () => {
    const view = frozen([A, "nested.json"], [B, "bare.json"]);
    const moves = (a: number, b: number) => ({
      type: "set",
      changes: [
        { target: BLOCK, values: { x: a } },
        { target: { block: B }, values: { x: b } },
      ],
    });
    const moved = applied(view, moves(0, 7));
    expect([block(moved), block(moved, B)]).toEqual([block(view), { ...block(view, B), x: 7 }]);
    expect(apply(view, moves(0, 0))).toEqual(nothing(BLOCK, "x"));
    const nested = load("nested.json");
    const named = { ...nested, timelines: nested.timelines.map((t) => ({ ...t, name: "Score" })) };
    const undone = {
      type: "set",
      changes: [
        { target: BLOCK, values: { manifest: named } },
        { target: at("clt_1"), values: { name: null } },
      ],
    };
    expect(apply(view, undone)).toEqual(nothing(BLOCK, "manifest"));
    const changes = (...items: [Address, object][]) => ({
      type: "set",
      changes: items.map(([target, values]) => ({ target, values })),
    });
    expect(apply(view, changes([BLOCK, { x: 5 }], [BLOCK, { x: 0 }]))).toEqual(nothing(BLOCK, "x"));
    expect(
      apply(
        view,
        changes([at("clt_1"), { place: { x: 3 } }], [at("clt_1"), { place: { x: null } }]),
      ),
    ).toEqual(nothing(at("clt_1"), "place"));
    const other = applied(
      view,
      changes([BLOCK, { x: 5 }], [BLOCK, { x: 0 }], [{ block: B }, { x: 7 }]),
    );
    expect([block(other), block(other, B)]).toEqual([block(view), { ...block(view, B), x: 7 }]);
    // The child's offset comes back, but the parent it pushed keeps its new length.
    const pushed = applied(
      view,
      changes([at("clt_3"), { offset: quarters(12) }], [at("clt_3"), { offset: quarters(4) }]),
    );
    expect(findTimeline(manifest(pushed), "clt_1")?.length).toEqual(quarters(20));
    expect(findTimeline(manifest(pushed), "clt_3")?.offset).toEqual(quarters(4));
  });
});

describe("locks by place", () => {
  const SEGMENT = "A segment is never locked: lock its segment line '%s' instead.";
  const UNLOCKING =
    "Unlocking a segment line that is a child, a segment or a group member is not supported yet.";
  /** The exact refusal of a command on a deep-frozen view, which a mutation would throw on. */
  const refusedWith = (view: View, command: object) => apply(deepFreeze(view), command);
  /** The `locked` of timeline `id` in block `A`. */
  function lockOf(view: View, id: string): unknown {
    return findTimeline(manifest(view), id)?.locked;
  }

  it("refuses to lock a segment, whose unlock changes nothing", () => {
    const view = frozen([A, "segment_line.json"]);
    expect(refusedWith(view, set(at("b1"), { locked: true }))).toEqual({
      code: "segment_never_locked",
      message: SEGMENT.replace("%s", "b"),
      path: [key(at("b1")), "locked"],
    });
    expect(refusedWith(view, set(at("b1"), { locked: false }))).toEqual(
      nothing(at("b1"), "locked"),
    );
  });

  it("refuses to unlock a segment line that is a child, a segment or a group member", () => {
    for (const [fixture, id] of [
      ["segment_line.json", "b"],
      ["segment_children.json", "intro"],
      ["bundles/corpus_ieee1599.json", "original_score:dgt_1"],
    ] as const) {
      const view = frozen([A, fixture]);
      expect(refusedWith(view, set(at(id), { locked: false }))).toEqual({
        code: "unlocking_not_supported",
        message: UNLOCKING,
        path: [key(at(id)), "locked"],
      });
      expect(lockOf(view, id)).toBe(true);
      expect(refusedWith(view, set(at(id), { locked: true }))).toEqual(nothing(at(id), "locked"));
    }
  });

  it("never refuses the lock a timeline has, even where the opposite is refused", () => {
    // The file states `b` unlocked, which reading keeps: only segments are unlocked.
    const view = deepFreeze(unlockedView("segment_line.json", "b"));
    expect(refusedWith(view, set(at("b"), { locked: false }))).toEqual(nothing(at("b"), "locked"));
    const kept = applied(view, set(at("b"), { locked: false, name: "Bridge" }));
    expect([lockOf(kept, "b"), findTimeline(manifest(kept), "b")?.name]).toEqual([false, "Bridge"]);
    expect(manifest(kept)).toEqual({
      ...manifest(view),
      timelines: [
        {
          ...root(view),
          children: root(view).children.map((child) =>
            child.id === "b" ? { ...child, name: "Bridge" } : child,
          ),
        },
      ],
    });
    const locked = applied(view, set(at("b"), { locked: true }));
    expect(lockOf(locked, "b")).toBe(true);
    expect(refusedWith(locked, set(at("b"), { locked: false }))).toEqual({
      code: "unlocking_not_supported",
      message: UNLOCKING,
      path: [key(at("b")), "locked"],
    });
  });

  it("lets a root segment line outside a group take either lock", () => {
    const locked = applied(frozen([A, "segment_line.json"]), set(at("form"), { locked: true }));
    expect(lockOf(locked, "form")).toBe(true);
    expect(lockOf(applied(locked, set(at("form"), { locked: false })), "form")).toBe(false);
  });

  it("adds into a segment line with the lock the place decides", () => {
    const add = (child: object) => ({ type: "add", into: at("form"), child });
    // A segment line's segments are all segment lines or none.
    const plain = frozen([A, "unknown_length_segments.json"]);
    const lines = frozen([A, "segment_line.json"]);
    const d = { id: "d", unit: "quarters", offset: quarters(20), length: quarters(4) };
    const e = { ...d, id: "e", offset: quarters(32), length: null, is_segment_line: true };
    expect(lockOf(applied(plain, add(d)), "d")).toBe(false);
    expect(lockOf(applied(lines, add(e)), "e")).toBe(true);
    expect(refusedWith(plain, add({ ...d, locked: true }))).toEqual({
      code: "segment_never_locked",
      message: SEGMENT.replace("%s", "form"),
      path: [key(at("form")), "child"],
    });
    expect(refusedWith(lines, add({ ...e, locked: false }))).toEqual({
      code: "unlocking_not_supported",
      message: UNLOCKING,
      path: [key(at("form")), "child"],
    });
  });

  it("gives every timeline of an added subtree the lock its place decides", () => {
    const view = frozen([A, "bare.json"]);
    const segment = { id: "s1", unit: "quarters", offset: quarters(0), length: quarters(4) };
    const line = (s1: object) => ({
      type: "add",
      into: at("bare"),
      child: {
        id: "sl",
        unit: "quarters",
        offset: quarters(0),
        length: quarters(4),
        is_segment_line: true,
        children: [s1],
      },
    });
    const added = applied(view, line(segment));
    expect([lockOf(added, "sl"), lockOf(added, "s1")]).toEqual([true, false]);
    expect(refusedWith(view, line({ ...segment, locked: true }))).toEqual({
      code: "segment_never_locked",
      message: SEGMENT.replace("%s", "sl"),
      path: [key(at("bare")), "child"],
    });
  });
});

describe("regions and flow-control elements", () => {
  const into = (kind: string, value: object) => ({ type: "add", into: at("bare"), [kind]: value });
  const region = { id: "region_1", name: "A", start: quarters(2), end: quarters(4) };
  const flowPath = [A, "manifest", "timelines", 0, "flow_control"];

  it("adds and sets a region", () => {
    const added = applied(viewOf([A, "bare.json"]), into("region", region));
    expect(root(added).regions).toEqual([{ ...region, meta: {} }]);
    const changed = applied(added, set(at("region_1"), { end: quarters(6), name: null }));
    expect(root(changed).regions).toEqual([{ ...region, meta: {}, end: quarters(6), name: null }]);
  });

  it("adds, sets and removes flow-control elements", () => {
    const view = frozen([A, "flow_control.json"]);
    const [marker, segno, jump, fine, ds] = root(view).flow_control;
    if (!marker || !segno || !jump || !fine || !ds) {
      throw new Error(
        "flow_control.json holds two jump targets, two jump origins and a flow marker",
      );
    }
    expect([marker.id, segno.id, jump.id, fine.id, ds.id]).toEqual([
      "jump_to_1",
      "jump_to_2",
      "jump_from_1",
      "flow_marker_1",
      "jump_from_2",
    ]);
    const flow = (next: View) => root(next).flow_control;
    const add = (value: object) => ({
      type: "add",
      into: at("flow:quarters"),
      flow_control: value,
    });
    const coda = { id: "coda_1", type: "jump_to", manifestation: "coda", coordinate: quarters(12) };
    const retargeted = applied(
      applied(view, add(coda)),
      set(at("jump_from_1"), { target: "coda_1" }),
    );
    expect(flow(retargeted)).toEqual([
      marker,
      segno,
      { ...jump, target: "coda_1" },
      { ...coda, name: null, label: null, meta: {} },
      fine,
      ds,
    ]);
    const copy = { ...fine, id: "flow_marker_2", coordinate: quarters(3) };
    const swapped = applied(applied(view, add(copy)), {
      type: "remove",
      targets: [at("flow_marker_1")],
    });
    expect(flow(swapped)).toEqual([marker, copy, segno, jump, ds]);
    const unjumped = applied(view, { type: "remove", targets: [at("jump_from_1")] });
    expect(flow(unjumped)).toEqual([marker, segno, fine, ds]);
    const shifted = applied(view, set(at("jump_to_1"), { coordinate: quarters(2, 2) }));
    expect(flow(shifted)).toEqual([{ ...marker, coordinate: quarters(1) }, segno, jump, fine, ds]);
    const { target: _, ...toStart } = jump;
    const untargeted = applied(view, set(at("jump_from_1"), { target: null }));
    expect(flow(untargeted)).toEqual([marker, segno, toStart, fine, ds]);
    const barline = {
      id: "jump_from_1",
      type: "flow_marker",
      manifestation: "double_barline",
      coordinate: quarters(8),
    };
    const replaced = applied(view, set(at("jump_from_1"), { flow_control: barline }));
    expect(flow(replaced)).toEqual([
      marker,
      segno,
      { ...barline, name: null, label: null, meta: {} },
      fine,
      ds,
    ]);
  });

  it("refuses with the exact code and path", () => {
    const flow = viewOf([A, "flow_control.json"]);
    expect(rejected(flow, set(at("jump_from_1"), { target: "nothing" }))).toEqual({
      code: "schema_violation",
      path: [...flowPath, 2, "target"],
    });
    // Removing the jump target a jump origin names leaves that origin second.
    expect(rejected(flow, { type: "remove", targets: [at("jump_to_1")] })).toEqual({
      code: "schema_violation",
      path: [...flowPath, 1, "target"],
    });
    expect(rejected(flow, set(at("flow_marker_1"), { manifestation: "repeat_end" }))).toEqual({
      code: "schema_violation",
      path: [...flowPath, 3, "manifestation"],
    });
    expect(rejected(flow, set(at("flow_marker_1"), { repeat_count: 2 }))).toEqual({
      code: "schema_violation",
      path: [...flowPath, 3, "repeat_count"],
    });
    expect(rejected(flow, set(at("jump_from_1"), { type: "jump_to" }))).toEqual({
      code: "unknown_property",
      path: [key(at("jump_from_1")), "type"],
    });
    const other = {
      id: "other",
      type: "flow_marker",
      manifestation: "fine",
      coordinate: quarters(8),
    };
    expect(rejected(flow, set(at("jump_from_1"), { flow_control: other }))).toEqual({
      code: "id_not_settable",
      path: [key(at("jump_from_1")), "flow_control", "id"],
    });
    const dict = { unit: "quarters", number_type: "fraction", value: [1, 1] };
    expect(rejected(flow, set(at("flow_marker_1"), { coordinate: dict }))).toEqual({
      code: "invalid_coordinate",
      path: [key(at("flow_marker_1")), "coordinate"],
    });
    const regions = viewOf([A, "with_region.json"]);
    expect(rejected(regions, set(at("region_1"), { end: quarters(0) }))).toEqual({
      code: "region_end_before_start",
      path: [A, "manifest", "timelines", 0, "regions", 0, "end"],
    });
    expect(rejected(regions, set(at("region_1"), { coordinate: quarters(0) }))).toEqual({
      code: "wrong_target_kind",
      path: [key(at("region_1")), "coordinate"],
    });
    const bare = viewOf([A, "bare.json"]);
    expect(rejected(bare, into("region", { ...region, id: "a\u0001b" }))).toEqual({
      code: "schema_violation",
      path: [A, "manifest", "timelines", 0, "regions", 0, "id"],
    });
  });
});

describe("measure maps", () => {
  const bars = { id: "bars", rows: [{ count: 1, qstamp: quarters(0) }] };
  const record = {
    id: "record",
    type: "MeasureRecordMap",
    source_unit: "quarters",
    target_unit: null,
    measure_map: "bars",
  };
  const withBars = () =>
    applied(frozen([A, "bare.json"]), { type: "add", into: BLOCK, measure_map: bars });
  const viewPath = [A, "manifest", "timelines", 0, "conversion_maps", 0, "measure_map"];

  it("adds, sets and removes a measure map, which a measure view names", () => {
    const view = withBars();
    expect(manifest(view).measure_maps).toEqual([{ ...bars, name: null, meta: {} }]);
    const rows = [...bars.rows, { count: 2, qstamp: quarters(4) }];
    const named = applied(view, set(at("bars"), { name: "Bars", rows }));
    expect(manifest(named).measure_maps).toEqual([{ id: "bars", name: "Bars", meta: {}, rows }]);
    const viewed = applied(view, { type: "add", into: at("bare"), map: record });
    expect(root(viewed).conversion_maps).toEqual([{ ...record, name: null }]);
    const gone = applied(viewed, { type: "remove", targets: [at("record"), at("bars")] });
    expect([manifest(gone).measure_maps, root(gone).conversion_maps]).toEqual([[], []]);
  });

  it("refuses with the exact code and path", () => {
    const bare = viewOf([A, "bare.json"]);
    expect(rejected(bare, { type: "add", into: at("bare"), map: record })).toEqual({
      code: "schema_violation",
      path: viewPath,
    });
    const viewed = applied(withBars(), { type: "add", into: at("bare"), map: record });
    // Removing the measure map a view names leaves the view dangling.
    expect(rejected(viewed, { type: "remove", targets: [at("bars")] })).toEqual({
      code: "schema_violation",
      path: viewPath,
    });
    expect(
      rejected(bare, { type: "add", into: BLOCK, measure_map: { ...bars, id: "bare" } }),
    ).toEqual({
      code: "duplicate_id",
      path: [key(BLOCK), "measure_map", "id"],
    });
    expect(
      rejected(bare, { type: "add", into: BLOCK, measure_map: { ...bars, rows: [] } }),
    ).toEqual({
      code: "schema_violation",
      path: [key(BLOCK), "measure_map", "rows"],
    });
    expect(rejected(viewed, set(at("bars"), { rows: [] }))).toEqual({
      code: "schema_violation",
      path: [A, "manifest", "measure_maps", 0, "rows"],
    });
    expect(apply(viewed, set(at("bars"), { name: null }))).toEqual(nothing(at("bars"), "name"));
    expect(rejected(bare, { type: "add", into: at("bare"), measure_map: bars })).toEqual({
      code: "wrong_target_kind",
      path: [key(at("bare")), "measure_map"],
    });
  });
});

describe("remove", () => {
  it("removes children, maps, roots and blocks", () => {
    const view = frozen([A, "map.json"], [B, "bare.json"]);
    const withoutChild = root(applied(view, { type: "remove", targets: [at("phrase")] }));
    expect(withoutChild.children).toEqual([]);
    const withoutMap = root(applied(view, { type: "remove", targets: [at("tempo")] }));
    expect(withoutMap.conversion_maps).toEqual([]);
    const withoutRoot = applied(view, { type: "remove", targets: [at("melody")] });
    expect(manifest(withoutRoot).timelines).toEqual([]);
    expect(applied(view, { type: "remove", targets: [BLOCK, { block: B }] }).blocks).toEqual({});
    const nested = {
      ...view,
      blocks: { ...view.blocks, [B]: { ...block(view, B), parent: A } },
    };
    expect(applied(nested, { type: "remove", targets: [BLOCK] }).blocks).toEqual({});
  });

  it("refuses the workspace and an unknown target, atomically", () => {
    const view = frozen([A, "map.json"]);
    expect(rejected(view, { type: "remove", targets: [WORKSPACE] })).toEqual({
      code: "not_removable",
      path: [key(WORKSPACE)],
    });
    expect(rejected(view, { type: "remove", targets: [BLOCK, { block: C }] })).toEqual({
      code: "unknown_target",
      path: [key({ block: C })],
    });
    expect(Object.keys(view.blocks)).toEqual([A]);
  });
});

describe("style", () => {
  const red = { stroke: "#C00000" };
  const style = (properties: object) => ({ type: "style", ...properties });

  it("embeds a statement in every manifest it concerns and merges equal selectors", () => {
    let view = frozen([A, "map.json"], [B, "bare.json"]);
    view = applied(view, style({ select: { element: "map" }, set: red }));
    expect(manifest(view).graphical).toEqual(
      held({ styles: {}, statements: [{ select: { element: "map" }, set: red }] }),
    );
    expect(manifest(view, B)).toEqual(load("bare.json"));
    view = applied(view, style({ select: { element: "map" }, set: { "stroke-width": 2 } }));
    expect(manifest(view).graphical?.statements).toEqual([
      { select: { element: "map" }, set: { ...red, "stroke-width": 2 } },
    ]);
    const other = applied(
      view,
      style({ select: { domain: "physical", element: "map" }, set: { opacity: 0.5 } }),
    );
    expect(manifest(other).graphical?.statements?.length).toBe(2);
    const merged = applied(
      other,
      style({ select: { element: "map", domain: "physical" }, set: { opacity: 1 } }),
    );
    expect(manifest(merged).graphical?.statements?.[1]).toEqual({
      select: { domain: "physical", element: "map" },
      set: { opacity: 1 },
    });
    view = applied(view, style({ select: { element: "map" }, set: { stroke: null } }));
    expect(manifest(view).graphical?.statements).toEqual([
      { select: { element: "map" }, set: { "stroke-width": 2 } },
    ]);
    view = applied(view, style({ select: { element: "map" }, set: { "stroke-width": null } }));
    expect(manifest(view).graphical).toEqual(held({ styles: {}, statements: [] }));
  });

  it("names a style in the listed blocks only", () => {
    const view = frozen([A, "map.json"], [B, "bare.json"]);
    const named = applied(
      view,
      style({
        select: { element: "timeline" },
        set: { stroke: "#00CC00" },
        name: "green",
        blocks: [B],
      }),
    );
    expect(manifest(named, B).graphical).toEqual(
      held({
        styles: { green: { stroke: "#00CC00" } },
        statements: [{ select: { element: "timeline" }, set: "green" }],
      }),
    );
    expect(manifest(named)).toEqual(manifest(view));
    const inline = applied(
      named,
      style({ select: { element: "timeline" }, set: { opacity: 0.5 }, blocks: [B] }),
    );
    expect(manifest(inline, B).graphical).toEqual(
      held({
        styles: { green: { stroke: "#00CC00" } },
        statements: [{ select: { element: "timeline" }, set: { stroke: "#00CC00", opacity: 0.5 } }],
      }),
    );
    const emptied = applied(
      named,
      style({ select: { element: "timeline" }, set: { stroke: null }, name: "green", blocks: [B] }),
    );
    expect(manifest(emptied, B).graphical).toEqual(held({ styles: {}, statements: [] }));
  });

  it("refuses an unknown block and a malformed statement", () => {
    const view = viewOf([A, "map.json"]);
    expect(rejected(view, style({ select: {}, set: red, blocks: [C] }))).toEqual({
      code: "unknown_target",
      path: [key({ block: C })],
    });
    expect(rejected(view, style({ select: {}, set: { stroke: "red" } }))).toEqual({
      code: "schema_violation",
      path: ["set", "stroke"],
    });
  });
});

describe("malformed commands", () => {
  it.each([
    [{ type: "move" }, ["type"]],
    [{ type: "add", into: {} }, []],
    [{ type: "add", into: {}, block: {}, map: {} }, []],
    [{ type: "set", changes: [] }, ["changes"]],
    [{ type: "set", changes: [{ target: BLOCK }] }, ["changes", 0, "values"]],
    [{ type: "set", changes: [{ target: BLOCK, values: {} }] }, ["changes", 0, "values"]],
    [{ type: "set", changes: [{ target: BLOCK, x: 1 }] }, ["changes", 0, "x"]],
    [{ type: "remove", targets: [] }, ["targets"]],
    [{ type: "remove", targets: [BLOCK], gap: { side: "left", verb: "extend" } }, ["gap"]],
    [{ type: "style", set: {} }, ["select"]],
    [{ type: "style", select: {}, set: {}, blocks: [1] }, ["blocks", 0]],
  ] as [object, (string | number)[]][])("refuses %j at %j", (command, path) => {
    expect(refusal(parseCommand(command))).toEqual({ code: "invalid_command", path });
  });

  it.each([
    [{ type: "add", into: "workspace", block: {} }, ["into"], "an address is an object"],
    [
      { type: "set", changes: [{ target: 1, values: { x: 1 } }] },
      ["changes", 0, "target"],
      "an address is an object",
    ],
    [
      {
        type: "set",
        changes: [{ target: { block: A, id: "score", facet: "region" }, values: { x: 1 } }],
      },
      ["changes", 0, "target"],
      "an address's facet is a facet",
    ],
    [
      { type: "remove", targets: [BLOCK, { id: "score" }] },
      ["targets", 1],
      "an element's address names its block",
    ],
  ] as [object, (string | number)[], string][])(
    "refuses the address of %j at %j",
    (command, path, message) => {
      expect(parseCommand(command)).toEqual({ code: "invalid_address", message, path });
    },
  );

  it("reads addresses as objects", () => {
    expect(
      parseCommand({
        type: "remove",
        targets: [
          { block: A, id: "perf/take 2" },
          { block: A, id: "score", part: ["card"] },
        ],
      }),
    ).toEqual({
      type: "remove",
      targets: [
        { block: A, id: "perf/take 2" },
        { block: A, id: "score", part: ["card"] },
      ],
    });
  });

  it("keeps integral floats as floats", () => {
    const value = new JsonFloat(2);
    expect(parseCommand(set(BLOCK, { x: value }))).toEqual(set(BLOCK, { x: value }));
  });
});

describe("where a timeline lies", () => {
  const mixed = () => frozen([A, "bundles/bundle_mixed.json"]);
  const groupOf = (view: View, id: string) => manifest(view).groups.find((item) => item.id === id);
  const rootIds = (view: View) => manifest(view).timelines.map((item) => item.id);
  const timeline = (view: View, id: string) => findTimeline(manifest(view), id);
  /** The default band order of `id` turned to start with its regions band. */
  const regionsFirst = [
    "regions",
    "flow_control",
    "children",
    "conversion_maps",
    "line",
    "markers",
  ];

  it("adds a root timeline completed as a manifest's root is", () => {
    const [minimal] = (parseJson(fixture("bare.json").twin) as { timelines: object[] }).timelines;
    const view = applied(mixed(), { type: "add", into: BLOCK, timeline: minimal });
    expect(timeline(view, "bare")).toEqual(root(viewOf([A, "bare.json"])));
  });

  it("adds a group, its new member's card keeping only its size and stretch", () => {
    const placed = applied(
      mixed(),
      set(at("annotations"), { place: { x: 10, width: 300, spacing: 2 } }),
    );
    const view = applied(placed, {
      type: "add",
      into: BLOCK,
      group: { id: "group_3", members: ["annotations"] },
    });
    expect(groupOf(view, "group_3")).toEqual({
      id: "group_3",
      name: null,
      meta: {},
      members: ["annotations"],
    });
    expect(block(view).places).toEqual({
      group_3: { cards: { annotations: { width: 300, spacing: 2 } } },
    });
  });

  it("adds a minimal group in its complete form, keeping its unknown keys", () => {
    const view = applied(mixed(), {
      type: "add",
      into: BLOCK,
      group: { id: "group_3", members: [], color: "red" },
    });
    expect(groupOf(view, "group_3")).toEqual({
      id: "group_3",
      name: null,
      meta: {},
      members: [],
      color: "red",
    });
  });

  it("makes a child a root, keeping its band order and its card's size", () => {
    let view = applied(mixed(), set(at("excerpt"), { place: { width: 200, height: 80 } }));
    view = applied(view, set(at("recording"), { order: regionsFirst }));
    const before = timeline(view, "excerpt");
    if (before === undefined) throw new Error("excerpt is a timeline of bundle_mixed");
    view = applied(view, set(at("excerpt"), { parent: null }));
    const { offset: _, ...unplaced } = before;
    expect(timeline(view, "recording")?.children).toEqual([]);
    expect(manifest(view).timelines.find((item) => item.id === "excerpt")).toEqual(unplaced);
    expect(groupOf(view, "group_2")?.members).toEqual(["excerpt", "page"]);
    expect(block(view).places).toEqual({
      group_2: { cards: { excerpt: { width: 200, height: 80 } } },
    });
    expect(manifest(view).graphical?.order?.excerpt).toEqual(regionsFirst);
  });

  it("moves a root under another, growing its new parent", () => {
    const view = applied(
      mixed(),
      set(at("annotations"), { parent: { timeline: "score", offset: quarters(4) } }),
    );
    const score = timeline(view, "score");
    expect(score?.length).toEqual(quarters(16));
    expect(score?.children.map((child) => [child.id, child.offset])).toEqual([
      ["annotations", quarters(4)],
    ]);
    expect(rootIds(view)).not.toContain("annotations");
  });

  it("joins and leaves a group, its display order following", () => {
    const joined = applied(mixed(), set(at("annotations"), { group: "group_1" }));
    expect(groupOf(joined, "group_1")?.members).toEqual(["annotations", "performance", "score"]);
    expect(manifest(joined).graphical?.order?.group_1).toEqual([
      "score",
      "performance",
      "annotations",
    ]);
    const left = applied(mixed(), set(at("performance"), { group: null }));
    expect(groupOf(left, "group_1")?.members).toEqual(["score"]);
    expect(manifest(left).graphical?.order?.group_1).toEqual(["score"]);
  });

  it("refuses with the exact code and path", () => {
    const view = mixed();
    const samples = applied(view, {
      type: "add",
      into: BLOCK,
      timeline: { id: "extra", unit: "samples", length: 4 },
    });
    expect(
      rejected(view, { type: "add", into: BLOCK, timeline: { ...root(view), id: "score" } }),
    ).toEqual({
      code: "duplicate_id",
      path: [key(BLOCK), "timeline", "id"],
    });
    expect(
      rejected(view, { type: "add", into: BLOCK, group: { id: "group_3", members: ["score"] } }),
    ).toEqual({
      code: "already_member",
      path: [key(BLOCK), "group", "members", 0],
    });
    expect(rejected(view, set(at("score"), { group: "group_2" }))).toEqual({
      code: "already_member",
      path: [key(at("score")), "group"],
    });
    expect(rejected(view, set(at("recording"), { group: "group_2" }))).toEqual({
      code: "nested_member",
      path: [key(at("recording")), "group"],
    });
    const grouped = applied(view, {
      type: "add",
      into: BLOCK,
      timeline: { id: "extra", unit: "quarters", length: quarters(4) },
    });
    const joined = applied(grouped, set(at("extra"), { group: "group_1" }));
    expect(
      rejected(joined, set(at("score"), { parent: { timeline: "extra", offset: quarters(0) } })),
    ).toEqual({ code: "nested_member", path: [key(at("score")), "parent"] });
    expect(
      rejected(joined, set(at("extra"), { parent: { timeline: "score", offset: quarters(0) } })),
    ).toEqual({ code: "nested_member", path: [key(at("extra")), "parent"] });
    expect(
      rejected(view, { type: "add", into: BLOCK, group: { id: "group_3", name: 3, members: [] } }),
    ).toEqual({ code: "schema_violation", path: [key(BLOCK), "group", "name"] });
    expect(rejected(view, set(at("score"), { group: "ghost" }))).toEqual({
      code: "unknown_target",
      path: [key(at("score")), "group"],
    });
    expect(rejected(view, set(at("score"), { group: 3 }))).toEqual({
      code: "invalid_value",
      path: [key(at("score")), "group"],
    });
    expect(
      rejected(view, set(at("annotations"), { parent: { timeline: "recording", offset: 0 } })),
    ).toEqual({ code: "unit_mismatch", path: [key(at("annotations")), "parent"] });
    expect(
      rejected(view, set(at("recording"), { parent: { timeline: "excerpt", offset: 0 } })),
    ).toEqual({ code: "cycle", path: [key(at("recording")), "parent"] });
    expect(
      rejected(
        view,
        set(at("annotations"), { parent: { timeline: "ghost", offset: quarters(0) } }),
      ),
    ).toEqual({ code: "unknown_target", path: [key(at("annotations")), "parent", "timeline"] });
    expect(rejected(view, set(at("annotations"), { parent: "score" }))).toEqual({
      code: "invalid_value",
      path: [key(at("annotations")), "parent"],
    });
    expect(
      rejected(samples, set(at("extra"), { parent: { timeline: "excerpt", offset: 88_200 } })),
    ).toEqual({ code: "child_exceeds_parent", path: [key(at("extra")), "parent"] });
    const line = frozen([A, "segment_line.json"]);
    const extra = applied(line, {
      type: "add",
      into: BLOCK,
      timeline: { id: "extra", unit: "quarters", length: quarters(4) },
    });
    expect(rejected(line, set(at("b1"), { parent: null }))).toEqual({
      code: "segment_structure",
      path: [key(at("b1")), "parent"],
    });
    expect(rejected(line, set(at("b"), { parent: null }))).toEqual({
      code: "segment_structure",
      path: [key(at("b")), "parent"],
    });
    expect(
      rejected(extra, set(at("extra"), { parent: { timeline: "form", offset: quarters(0) } })),
    ).toEqual({ code: "segment_structure", path: [key(at("extra")), "parent"] });
  });
});

describe("removing a segment", () => {
  const segments = () => frozen([A, "segment_children.json"]);

  it("refuses a segment on its own, which would leave a gap", () => {
    expect(apply(segments(), { type: "remove", targets: [at("t2")] })).toEqual({
      code: "segment_not_removable",
      message: "Removing segment 't2' of line 'theme' is not supported yet",
      path: [key(at("t2"))],
    });
  });

  it("removes a segment with its line or its block", () => {
    const withLine = applied(segments(), { type: "remove", targets: [at("theme"), at("t2")] });
    expect(findTimeline(manifest(withLine), "theme")).toBeUndefined();
    expect(findTimeline(manifest(withLine), "t1")).toBeUndefined();
    const withBlock = applied(segments(), { type: "remove", targets: [BLOCK, at("t2")] });
    expect(withBlock.blocks).toEqual({});
  });
});

describe("previews", () => {
  it("shows what apply stores", () => {
    const view = frozen([A, "bundles/bundle_mixed.json"]);
    for (const command of [
      set(at("annotations"), { parent: { timeline: "score", offset: quarters(4) } }),
      set(at("annotations"), { group: "group_1" }),
      { type: "add", into: BLOCK, group: { id: "group_3", members: ["annotations"] } },
      set(BLOCK, { x: 128, y: 64 }),
    ]) {
      const parsed = parseCommand(command);
      if ("code" in parsed) throw new Error(parsed.message);
      expect(preview(view, parsed)).toEqual(apply(view, command));
    }
  });

  it("shows a value only the invariants refuse, and gives back the view for no change", () => {
    const view = frozen([A, "nested.json"]);
    const negative = parseCommand(set(at("clt_2"), { offset: quarters(-1) }));
    const nothing = parseCommand(set(BLOCK, { x: 0 }));
    const unknown = parseCommand(set(at("ghost"), { name: "G" }));
    if ("code" in negative || "code" in nothing || "code" in unknown) throw new Error("parsed");
    const shown = preview(view, negative);
    if ("code" in shown) throw new Error(shown.message);
    expect(findTimeline(shown.blocks[A]?.manifest ?? manifest(view), "clt_2")?.offset).toEqual(
      quarters(-1),
    );
    expect(preview(view, nothing)).toBe(view);
    expect(preview(view, unknown)).toEqual(apply(view, set(at("ghost"), { name: "G" })));
  });
});
