import { JsonFloat } from "@timetoalign/timeskeleton";
import { describe, expect, it } from "vitest";
import type { Manifest, TimelineManifest, View } from "../src/index.ts";
import { apply, createView, DEFAULT_SETTINGS, findTimeline, parseCommand } from "../src/index.ts";
import {
  A,
  addBlock,
  B,
  block,
  C,
  changed,
  deepFreeze,
  load,
  refusal,
  unlockedView,
  viewOf,
} from "./support.ts";

/** A bare value on a `fraction` axis. */
const quarters = (numerator: number, denominator = 1) => [numerator, denominator];
const at = (element: string) => `${A}/${element}`;
const set = (target: string, properties: object) => ({
  type: "set",
  changes: [{ target, values: properties }],
});
const frozen = (...blocks: (readonly [string, string])[]): View => deepFreeze(viewOf(...blocks));
const tempo = () => load("map.json").timelines[0]?.conversion_maps[0] as object;
const ticks = () => load("map.json").timelines[0]?.children[0]?.conversion_maps[0] as object;
/** A `graphical` block as a settled manifest holds it: in its complete form. */
const held = (graphical: object) => ({ order: {}, ...graphical });

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
      spacing: 1,
      width: null,
      height: null,
      order: ["children", "regions", "flow"],
      manifest: load("bare.json"),
    });
    const second = applied(view, {
      type: "add",
      into: "workspace",
      block: { id: B, manifest: load("bare.json"), x: 0, y: 0, scale: 2 },
    });
    expect([block(second, B).index, block(second, B).scale]).toEqual(["a1", 2]);
    const given = applied(view, {
      type: "add",
      into: "workspace",
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
    const bare = load("bare.json").timelines[0] as TimelineManifest;
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

  it("refuses with the exact code and path", () => {
    const view = viewOf([A, "map.json"]);
    const bare = load("bare.json");
    expect(rejected(view, { type: "add", into: at("melody/tempo"), child: {} })).toEqual({
      code: "wrong_target_kind",
      path: [at("melody/tempo"), "child"],
    });
    expect(
      rejected(viewOf([A, "groups/group_number_types.json"]), {
        type: "add",
        into: at("group_1"),
        region: { id: "region_1", start: [0, 1], end: [1, 1] },
      }),
    ).toEqual({ code: "wrong_target_kind", path: [at("group_1"), "region"] });
    expect(rejected(view, { type: "add", into: "workspace", child: {} })).toEqual({
      code: "wrong_target_kind",
      path: ["workspace", "child"],
    });
    const blockValue = (value: object) => ({ type: "add", into: "workspace", block: value });
    expect(rejected(view, blockValue({ id: "BAD", manifest: bare, x: 0, y: 0 }))).toEqual({
      code: "invalid_block_id",
      path: ["workspace", "block", "id"],
    });
    expect(rejected(view, blockValue({ id: A, manifest: bare, x: 0, y: 0 }))).toEqual({
      code: "duplicate_id",
      path: [A],
    });
    expect(
      rejected(view, blockValue({ id: B, manifest: bare, x: 0, y: 0, overrides: {} })),
    ).toEqual({ code: "unknown_property", path: [B, "overrides"] });
    expect(rejected(view, blockValue({ id: B, manifest: bare, y: 0 }))).toEqual({
      code: "invalid_value",
      path: [B, "x"],
    });
    const one = viewOf([A, "bare.json"]);
    expect(
      rejected(one, {
        type: "add",
        into: at("bare"),
        child: { ...bare.timelines[0], offset: quarters(0), locked: true },
      }),
    ).toEqual({ code: "duplicate_id", path: [at("bare")] });
    expect(
      rejected(one, { type: "add", into: at("bare"), map: { ...tempo(), id: "bare" } }),
    ).toEqual({ code: "duplicate_id", path: [at("bare/bare")] });
    expect(
      rejected(one, {
        type: "add",
        into: at("bare"),
        map: { ...tempo(), source_unit: "seconds" },
      }),
    ).toEqual({
      code: "map_source_unit_mismatch",
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
        { target: A, values: { x: 128, y: 64 } },
        { target: B, values: { x: 1, y: 2 } },
      ],
    });
    expect(block(moved)).toEqual({ ...block(view), x: 128, y: 64 });
    expect(block(moved, B)).toEqual({ ...block(view, B), x: 1, y: 2 });
  });

  it("sets the placement of a block", () => {
    const view = frozen([A, "bare.json"]);
    const placement = {
      scale: 2,
      width: 120,
      height: null,
      length: 800,
      spacing: 2,
      order: ["flow", "regions", "children"],
    };
    expect(block(applied(view, set(A, placement)))).toEqual({ ...block(view), ...placement });
  });

  it("sets the workspace settings member by member, graphical whole", () => {
    const view = frozen([A, "bare.json"]);
    const defaults = applied(view, set("workspace", { blockDefaults: { length: 640 } }));
    expect(defaults.settings).toEqual({
      ...DEFAULT_SETTINGS,
      blockDefaults: { ...DEFAULT_SETTINGS.blockDefaults, length: 640 },
    });
    const grid = applied(view, set("workspace", { grid: { snap: false } }));
    expect(grid.settings.grid).toEqual({ size: 8, snap: false });
    const graphical = { statements: [{ select: { element: "map" }, set: { stroke: "#C00000" } }] };
    expect(applied(view, set("workspace", { graphical })).settings.graphical).toEqual(graphical);
  });

  it("replaces a block's manifest whole, whatever it holds", () => {
    const view = applied(viewOf([A, "bare.json"]), set(A, { manifest: load("nested.json") }));
    expect(manifest(view)).toEqual(load("nested.json"));
    const bundle = load("bundles/bundle_mixed.json");
    expect(manifest(applied(view, set(A, { manifest: bundle })))).toEqual(bundle);
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
    expect(root(applied(view, set(at("melody/tempo"), { map: payload }))).conversion_maps).toEqual([
      payload,
    ]);
  });

  it("refuses by the target's kind with the exact code and path", () => {
    const view = viewOf([A, "nested.json"], [B, "bare.json"]);
    const cases: [object, string, (string | number)[]][] = [
      [set(at("clt_1"), { id: "x" }), "id_not_settable", [at("clt_1"), "id"]],
      [set(A, { colour: 1 }), "unknown_property", [A, "colour"]],
      [set("workspace", { x: 1 }), "wrong_target_kind", ["workspace", "x"]],
      [set(A, { grid: { size: 4 } }), "wrong_target_kind", [A, "grid"]],
      [set(at("clt_1"), { offset: quarters(0) }), "wrong_target_kind", [at("clt_1"), "offset"]],
      [set(A, { x: "1" }), "invalid_value", [A, "x"]],
      [set(A, { x: Number.POSITIVE_INFINITY }), "non_finite_number", [A, "x"]],
      [set(A, { scale: 0 }), "non_positive_number", [A, "scale"]],
      [set(A, { width: -5 }), "non_positive_number", [A, "width"]],
      [set(A, { order: ["children", "children", "flow"] }), "invalid_order", [A, "order"]],
      [set(A, { index: "a00" }), "invalid_index", [A, "index"]],
      [set(A, { index: "a1" }), "duplicate_index", [A, "index"]],
      [
        set("workspace", { grid: { size: 0 } }),
        "non_positive_number",
        ["workspace", "grid", "size"],
      ],
      [
        set("workspace", { graphical: { statements: [{ select: {}, set: { stroke: "red" } }] } }),
        "schema_violation",
        ["workspace", "graphical", "statements", 0, "set", "stroke"],
      ],
      [set(at("clt_1"), { length: 0.5 }), "invalid_coordinate", [at("clt_1"), "length"]],
      [set(at("clt_1"), { length: 8 }), "invalid_coordinate", [at("clt_1"), "length"]],
      [set(at("clt_3"), { length: quarters(4) }), "locked", [at("clt_3"), "length"]],
      [
        set(at("clt_1"), { length: quarters(23, 2) }),
        "length_below_content",
        [at("clt_1"), "length"],
      ],
      [
        set(A, { manifest: { ...load("bare.json"), timeskeleton: "0.6.0" } }),
        "schema_violation",
        [A, "manifest", "timeskeleton"],
      ],
      [set(at("clt_2"), { offset: quarters(7) }), "child_exceeds_parent", [at("clt_2"), "offset"]],
      [
        set(at("clt_2"), { offset: quarters(-1) }),
        "negative_child_offset",
        [A, "manifest", "timelines", 0, "children", 0, "children", 0, "offset"],
      ],
      [set("short", { x: 1 }), "invalid_address", ["short"]],
      [set("0000000009", { x: 1 }), "unknown_target", ["0000000009"]],
      [set(at("nothing"), { name: null }), "unknown_target", [at("nothing")]],
    ];
    for (const [command, code, path] of cases)
      expect(rejected(view, command)).toEqual({ code, path });
    const maps = viewOf([A, "map.json"]);
    expect(rejected(maps, set(at("melody/tempo"), { name: "x" }))).toEqual({
      code: "wrong_target_kind",
      path: [at("melody/tempo"), "name"],
    });
    expect(rejected(maps, set(at("melody/tempo"), { map: { ...tempo(), id: "other" } }))).toEqual({
      code: "id_not_settable",
      path: [at("melody/tempo"), "map", "id"],
    });
  });

  it("is atomic", () => {
    const view = frozen([A, "bare.json"]);
    expect(
      rejected(view, {
        type: "set",
        changes: [
          { target: A, values: { x: 1 } },
          { target: "0000000009", values: { x: 2 } },
        ],
      }),
    ).toEqual({ code: "unknown_target", path: ["0000000009"] });
    expect(block(view).x).toBe(0);
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

  it("refuses to lock a segment and accepts its unlock", () => {
    const view = frozen([A, "segment_line.json"]);
    expect(refusedWith(view, set(at("b1"), { locked: true }))).toEqual({
      code: "segment_never_locked",
      message: SEGMENT.replace("%s", "b"),
      path: [at("b1"), "locked"],
    });
    expect(lockOf(applied(view, set(at("b1"), { locked: false })), "b1")).toBe(false);
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
        path: [at(id), "locked"],
      });
      expect(lockOf(applied(view, set(at(id), { locked: true })), id)).toBe(true);
    }
  });

  it("accepts setting the lock a timeline has, even where the opposite is refused", () => {
    // The file states `b` unlocked, which reading keeps: only segments are unlocked.
    const view = deepFreeze(unlockedView("segment_line.json", "b"));
    const kept = applied(view, set(at("b"), { locked: false }));
    expect(lockOf(kept, "b")).toBe(false);
    expect(manifest(kept)).toEqual(manifest(view));
    const locked = applied(kept, set(at("b"), { locked: true }));
    expect(lockOf(locked, "b")).toBe(true);
    expect(refusedWith(locked, set(at("b"), { locked: false }))).toEqual({
      code: "unlocking_not_supported",
      message: UNLOCKING,
      path: [at("b"), "locked"],
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
      path: [at("form"), "child"],
    });
    expect(refusedWith(lines, add({ ...e, locked: false }))).toEqual({
      code: "unlocking_not_supported",
      message: UNLOCKING,
      path: [at("form"), "child"],
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
      path: [at("bare"), "child"],
    });
  });
});

describe("regions, breaks, jumps and markers", () => {
  const into = (kind: string, value: object) => ({ type: "add", into: at("bare"), [kind]: value });
  const region = { id: "region_1", name: "A", start: quarters(2), end: quarters(4) };

  it("adds and sets a region", () => {
    const added = applied(viewOf([A, "bare.json"]), into("region", region));
    expect(root(added).regions).toEqual([{ ...region, meta: {} }]);
    const changed = applied(added, set(at("bare/region_1"), { end: quarters(6), name: null }));
    expect(root(changed).regions).toEqual([{ ...region, meta: {}, end: quarters(6), name: null }]);
  });

  it("adds, sets and removes markers, breaks and jumps", () => {
    const view = frozen([A, "flow_control.json"]);
    const flow = root(view).flow_control;
    const marker = { id: "marker_2", name: "fine", coordinate: quarters(12) };
    const retargeted = applied(
      applied(view, { type: "add", into: at("flow:quarters"), marker }),
      set(at("flow:quarters/jump_1"), { target: "marker_2" }),
    );
    const moved = root(retargeted).flow_control;
    expect(moved.jumps).toEqual([{ ...flow.jumps[0], target: "marker_2" }]);
    expect(moved.markers).toEqual([flow.markers[0], marker]);
    const copy = { ...flow.breaks[0], id: "break_2", coordinate: quarters(3) };
    const swapped = applied(
      applied(view, { type: "add", into: at("flow:quarters"), break: copy }),
      { type: "remove", targets: [at("flow:quarters/break_1")] },
    );
    expect(root(swapped).flow_control.breaks).toEqual([copy]);
    const unjumped = applied(view, { type: "remove", targets: [at("flow:quarters/jump_1")] });
    expect(root(unjumped).flow_control.jumps).toEqual([]);
    const shifted = applied(
      view,
      set(at("flow:quarters/marker_1"), { coordinate: quarters(2, 2) }),
    );
    expect(root(shifted).flow_control.markers).toEqual([
      { ...flow.markers[0], coordinate: quarters(1) },
    ]);
  });

  it("refuses with the exact code and path", () => {
    const flow = viewOf([A, "flow_control.json"]);
    const jumpTarget = [A, "manifest", "timelines", 0, "flow_control", "jumps", 0, "target"];
    expect(rejected(flow, set(at("flow:quarters/jump_1"), { target: "nothing" }))).toEqual({
      code: "schema_violation",
      path: jumpTarget,
    });
    expect(rejected(flow, { type: "remove", targets: [at("flow:quarters/marker_1")] })).toEqual({
      code: "schema_violation",
      path: jumpTarget,
    });
    const dict = { unit: "quarters", number_type: "fraction", value: [1, 1] };
    expect(rejected(flow, set(at("flow:quarters/break_1"), { coordinate: dict }))).toEqual({
      code: "invalid_coordinate",
      path: [at("flow:quarters/break_1"), "coordinate"],
    });
    const regions = viewOf([A, "with_region.json"]);
    expect(rejected(regions, set(at("clt_1/region_1"), { end: quarters(0) }))).toEqual({
      code: "region_end_before_start",
      path: [A, "manifest", "timelines", 0, "regions", 0, "end"],
    });
    expect(rejected(regions, set(at("clt_1/region_1"), { coordinate: quarters(0) }))).toEqual({
      code: "wrong_target_kind",
      path: [at("clt_1/region_1"), "coordinate"],
    });
    expect(rejected(regions, set(at("region_1"), { name: "x" }))).toEqual({
      code: "unknown_target",
      path: [at("region_1")],
    });
    const bare = viewOf([A, "bare.json"]);
    expect(rejected(bare, into("region", { ...region, id: "a/b" }))).toEqual({
      code: "schema_violation",
      path: [A, "manifest", "timelines", 0, "regions", 0, "id"],
    });
  });
});

describe("remove", () => {
  it("removes children, maps, roots and blocks", () => {
    const view = frozen([A, "map.json"], [B, "bare.json"]);
    const withoutChild = root(applied(view, { type: "remove", targets: [at("phrase")] }));
    expect(withoutChild.children).toEqual([]);
    const withoutMap = root(applied(view, { type: "remove", targets: [at("melody/tempo")] }));
    expect(withoutMap.conversion_maps).toEqual([]);
    const withoutRoot = applied(view, { type: "remove", targets: [at("melody")] });
    expect(manifest(withoutRoot).timelines).toEqual([]);
    expect(applied(view, { type: "remove", targets: [A, B] }).blocks).toEqual({});
    const nested = {
      ...view,
      blocks: { ...view.blocks, [B]: { ...block(view, B), parent: A } },
    };
    expect(applied(nested, { type: "remove", targets: [A] }).blocks).toEqual({});
  });

  it("refuses the workspace and an unknown target, atomically", () => {
    const view = frozen([A, "map.json"]);
    expect(rejected(view, { type: "remove", targets: ["workspace"] })).toEqual({
      code: "not_removable",
      path: ["workspace"],
    });
    expect(rejected(view, { type: "remove", targets: [A, C] })).toEqual({
      code: "unknown_target",
      path: [C],
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
      path: [C],
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
    [{ type: "add", into: "workspace" }, []],
    [{ type: "add", into: "workspace", block: {}, map: {} }, []],
    [{ type: "set", changes: [] }, ["changes"]],
    [{ type: "set", changes: [{ target: 1, values: { x: 1 } }] }, ["changes", 0, "target"]],
    [{ type: "set", changes: [{ target: A }] }, ["changes", 0, "values"]],
    [{ type: "set", changes: [{ target: A, values: {} }] }, ["changes", 0, "values"]],
    [{ type: "set", changes: [{ target: A, x: 1 }] }, ["changes", 0, "x"]],
    [{ type: "remove", targets: [] }, ["targets"]],
    [{ type: "style", set: {} }, ["select"]],
    [{ type: "style", select: {}, set: {}, blocks: [1] }, ["blocks", 0]],
  ] as [object, (string | number)[]][])("refuses %j at %j", (command, path) => {
    expect(refusal(parseCommand(command))).toEqual({ code: "invalid_command", path });
  });

  it("keeps integral floats as floats", () => {
    const value = new JsonFloat(2);
    expect(parseCommand(set(A, { x: value }))).toEqual(set(A, { x: value }));
  });
});
