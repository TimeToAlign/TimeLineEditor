import { JsonFloat, SCHEMA_VERSION, SUPPORTED_VERSIONS } from "@timetoalign/timeskeleton";
import { describe, expect, it } from "vitest";
import type { TimelineFile, View } from "../src/index.ts";
import { apply, createView, DEFAULT_SETTINGS, parseCommand } from "../src/index.ts";
import {
  A,
  addBlock,
  asVersion,
  B,
  block,
  C,
  changed,
  deepFreeze,
  load,
  refusal,
  viewOf,
} from "./support.ts";

const quarters = (numerator: number, denominator = 1) => ({
  unit: "quarters",
  number_type: "fraction",
  value: [numerator, denominator],
});
const at = (element: string) => `${A}/${element}`;
const set = (target: string, properties: object) => ({
  type: "set",
  changes: [{ target, values: properties }],
});
const frozen = (...blocks: (readonly [string, string])[]): View => deepFreeze(viewOf(...blocks));
const tempo = () => load("map.json").timeline.conversion_maps[0] as object;
const ticks = () =>
  (load("map.json").timeline.children.phrase?.timeline.conversion_maps[0] ?? {}) as object;

/** The value of `apply`, the input view having been deep-frozen first. */
function applied(view: View, command: object): View {
  return changed(deepFreeze(view), command);
}

function rejected(view: View, command: object) {
  return refusal(apply(deepFreeze(view), command));
}

/** The manifest of a timeline block. */
function manifest(view: View, id = A): TimelineFile {
  return block(view, id).manifest as TimelineFile;
}

describe("add", () => {
  it("adds a block with the defaults and an index after the others", () => {
    const view = applied(createView(), addBlock(A, "bare.json"));
    expect(block(view)).toEqual({
      id: A,
      blockKind: "timeline",
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

  it("adds a locked child, normalizing its offset and growing the unlocked root", () => {
    const bare = load("bare.json");
    const view = applied(viewOf([A, "bare.json"]), {
      type: "add",
      into: at("bare"),
      child: { offset: quarters(2, 4), timeline: { ...bare.timeline, id: "clt_1", locked: true } },
    });
    const root = manifest(view).timeline;
    expect(root.length).toEqual({ unit: "quarters", number_type: "fraction", value: [17, 2] });
    expect(root.children).toEqual({
      clt_1: {
        offset: quarters(1, 2),
        timeline: { ...bare.timeline, id: "clt_1", locked: true },
      },
    });
  });

  it("adds conversion maps verbatim, in id order whichever comes first", () => {
    for (const order of [
      [tempo(), ticks()],
      [ticks(), tempo()],
    ]) {
      let view = viewOf([A, "bare.json"]);
      for (const map of order) view = applied(view, { type: "add", into: at("bare"), map });
      expect(manifest(view).timeline.conversion_maps).toEqual([tempo(), ticks()]);
    }
  });

  it("refuses with the exact code and path", () => {
    const view = viewOf([A, "map.json"]);
    const bare = load("bare.json");
    expect(rejected(view, { type: "add", into: at("tempo"), child: {} })).toEqual({
      code: "wrong_target_kind",
      path: [at("tempo"), "child"],
    });
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
    const root = viewOf([A, "bare.json"]);
    expect(
      rejected(root, {
        type: "add",
        into: at("bare"),
        child: { offset: quarters(0), timeline: { ...bare.timeline, locked: true } },
      }),
    ).toEqual({ code: "duplicate_id", path: [at("bare")] });
    expect(
      rejected(root, { type: "add", into: at("bare"), map: { ...tempo(), id: "bare" } }),
    ).toEqual({ code: "duplicate_id", path: [at("bare")] });
    expect(
      rejected(root, {
        type: "add",
        into: at("bare"),
        map: { ...tempo(), source_unit: "seconds" },
      }),
    ).toEqual({
      code: "map_source_unit_mismatch",
      path: [A, "manifest", "timeline", "conversion_maps", 0, "source_unit"],
    });
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

  it("replaces a block's manifest whole", () => {
    const view = applied(viewOf([A, "bare.json"]), set(A, { manifest: load("nested.json") }));
    expect(manifest(view)).toEqual(load("nested.json"));
  });

  it.each(SUPPORTED_VERSIONS)("stores a manifest declaring %s at the latest version", (version) => {
    const latest = load("nested.json");
    const older = asVersion(latest, version);
    const view = applied(viewOf([A, "bare.json"]), set(A, { manifest: older }));
    expect(manifest(view).meta.schema_version).toBe(SCHEMA_VERSION);
    expect(manifest(view)).toEqual(latest);
  });

  it("sets timeline members, growing the unlocked root for a child's offset", () => {
    const view = frozen([A, "nested.json"]);
    const root = manifest(view).timeline;
    expect(manifest(applied(view, set(at("clt_1"), { name: "Score" }))).timeline).toEqual({
      ...root,
      name: "Score",
    });
    expect(
      manifest(applied(view, set(at("clt_1"), { meta: { composer: "Anon" } }))).timeline.meta,
    ).toEqual({ composer: "Anon" });
    expect(
      manifest(applied(view, set(at("clt_1"), { length: quarters(12) }))).timeline.length,
    ).toEqual(quarters(12));
    const moved = manifest(applied(view, set(at("clt_3"), { offset: quarters(6) }))).timeline;
    expect([moved.children.clt_3?.offset, moved.length]).toEqual([quarters(6), quarters(16)]);
    const grown = manifest(applied(view, set(at("clt_3"), { offset: quarters(10) }))).timeline;
    expect([grown.children.clt_3?.offset, grown.length]).toEqual([quarters(10), quarters(18)]);
  });

  it("replaces a conversion map's payload, keeping its id", () => {
    const view = frozen([A, "map.json"]);
    const payload = { ...tempo(), scalar: [1, 4] };
    expect(
      manifest(applied(view, set(at("tempo"), { map: payload }))).timeline.conversion_maps,
    ).toEqual([payload]);
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
      [
        set(at("clt_1"), { length: { ...quarters(1), value: 0.5 } }),
        "invalid_coordinate",
        [at("clt_1"), "length", "value"],
      ],
      [
        set(at("clt_1"), { length: { unit: "seconds", number_type: "float", value: 1.5 } }),
        "off_axis",
        [at("clt_1"), "length"],
      ],
      [set(at("clt_3"), { length: quarters(4) }), "locked", [at("clt_3"), "length"]],
      [
        set(at("clt_1"), { length: quarters(23, 2) }),
        "length_below_content",
        [at("clt_1"), "length"],
      ],
      [
        set(A, {
          manifest: { ...load("bare.json"), meta: { schema_version: "0.0.0" } },
        }),
        "schema_violation",
        [A, "manifest", "meta", "schema_version"],
      ],
      [
        set(at("clt_3"), { locked: false }),
        "child_not_locked",
        [A, "manifest", "timeline", "children", "clt_3", "timeline", "locked"],
      ],
      [
        set(at("clt_2"), { offset: quarters(7) }),
        "child_exceeds_parent",
        [A, "manifest", "timeline", "children", "clt_3", "timeline", "children", "clt_2", "offset"],
      ],
      [set("short", { x: 1 }), "invalid_address", ["short"]],
      [set("0000000009", { x: 1 }), "unknown_target", ["0000000009"]],
      [set(at("nothing"), { name: null }), "unknown_target", [at("nothing")]],
    ];
    for (const [command, code, path] of cases)
      expect(rejected(view, command)).toEqual({ code, path });
    const maps = viewOf([A, "map.json"]);
    expect(rejected(maps, set(at("tempo"), { name: "x" }))).toEqual({
      code: "wrong_target_kind",
      path: [at("tempo"), "name"],
    });
    expect(rejected(maps, set(at("tempo"), { map: { ...tempo(), id: "other" } }))).toEqual({
      code: "id_not_settable",
      path: [at("tempo"), "map", "id"],
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

describe("regions, breaks, jumps and markers", () => {
  const into = (kind: string, value: object) => ({ type: "add", into: at("bare"), [kind]: value });
  const region = { id: "region_1", name: "A", start: quarters(2), end: quarters(4), meta: {} };

  it("adds and sets a region", () => {
    const added = applied(viewOf([A, "bare.json"]), into("region", region));
    expect(manifest(added).timeline.regions).toEqual([region]);
    const changed = applied(added, set(at("region_1"), { end: quarters(6), name: null }));
    expect(manifest(changed).timeline.regions).toEqual([
      { ...region, end: quarters(6), name: null },
    ]);
  });

  it("adds, sets and removes markers, breaks and jumps", () => {
    const view = frozen([A, "flow_control.json"]);
    const flow = manifest(view).timeline.flow_control;
    const marker = { id: "marker_2", name: "fine", coordinate: quarters(12) };
    const retargeted = applied(
      applied(view, { type: "add", into: at("flow:quarters"), marker }),
      set(at("jump_1"), { target: "marker_2" }),
    );
    const moved = manifest(retargeted).timeline.flow_control;
    expect(moved.jumps).toEqual([{ ...flow.jumps[0], target: "marker_2" }]);
    expect(moved.markers).toEqual([flow.markers[0], marker]);
    const copy = { ...flow.breaks[0], id: "break_2", coordinate: quarters(3) };
    const swapped = applied(
      applied(view, { type: "add", into: at("flow:quarters"), break: copy }),
      { type: "remove", targets: [at("break_1")] },
    );
    expect(manifest(swapped).timeline.flow_control.breaks).toEqual([copy]);
    const unjumped = applied(view, { type: "remove", targets: [at("jump_1")] });
    expect(manifest(unjumped).timeline.flow_control.jumps).toEqual([]);
    const shifted = applied(view, set(at("marker_1"), { coordinate: quarters(1) }));
    expect(manifest(shifted).timeline.flow_control.markers).toEqual([
      { ...flow.markers[0], coordinate: quarters(1) },
    ]);
  });

  it("refuses with the exact code and path", () => {
    const flow = viewOf([A, "flow_control.json"]);
    const jumpTarget = [A, "manifest", "timeline", "flow_control", "jumps", 0, "target"];
    expect(rejected(flow, set(at("jump_1"), { target: "nothing" }))).toEqual({
      code: "schema_violation",
      path: jumpTarget,
    });
    expect(rejected(flow, { type: "remove", targets: [at("marker_1")] })).toEqual({
      code: "schema_violation",
      path: jumpTarget,
    });
    const seconds = { unit: "seconds", number_type: "float", value: 1.5 };
    expect(rejected(flow, set(at("break_1"), { coordinate: seconds }))).toEqual({
      code: "off_axis",
      path: [at("break_1"), "coordinate"],
    });
    const regions = viewOf([A, "with_region.json"]);
    expect(rejected(regions, set(at("region_1"), { end: quarters(0) }))).toEqual({
      code: "region_end_before_start",
      path: [A, "manifest", "timeline", "regions", 0, "end"],
    });
    expect(rejected(regions, set(at("region_1"), { coordinate: quarters(0) }))).toEqual({
      code: "wrong_target_kind",
      path: [at("region_1"), "coordinate"],
    });
    const bare = viewOf([A, "bare.json"]);
    expect(rejected(bare, into("region", { ...region, id: "bare" }))).toEqual({
      code: "duplicate_id",
      path: [at("bare")],
    });
    expect(rejected(bare, into("region", { ...region, id: "a/b" }))).toEqual({
      code: "schema_violation",
      path: [A, "manifest", "timeline", "regions", 0, "id"],
    });
  });
});

describe("remove", () => {
  it("removes children, maps and blocks", () => {
    const view = frozen([A, "map.json"], [B, "bare.json"]);
    const withoutChild = manifest(applied(view, { type: "remove", targets: [at("phrase")] }));
    expect(withoutChild.timeline.children).toEqual({});
    const withoutMap = manifest(applied(view, { type: "remove", targets: [at("tempo")] }));
    expect(withoutMap.timeline.conversion_maps).toEqual([]);
    expect(applied(view, { type: "remove", targets: [A, B] }).blocks).toEqual({});
    const nested = {
      ...view,
      blocks: { ...view.blocks, [B]: { ...block(view, B), parent: A } },
    };
    expect(applied(nested, { type: "remove", targets: [A] }).blocks).toEqual({});
  });

  it("refuses the workspace, a root and an unknown target, atomically", () => {
    const view = frozen([A, "map.json"]);
    expect(rejected(view, { type: "remove", targets: ["workspace"] })).toEqual({
      code: "not_removable",
      path: ["workspace"],
    });
    expect(rejected(view, { type: "remove", targets: [at("melody")] })).toEqual({
      code: "not_removable",
      path: [at("melody")],
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
    expect(manifest(view).graphical).toEqual({
      styles: {},
      statements: [{ select: { element: "map" }, set: red }],
    });
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
    expect(manifest(view).graphical).toEqual({ styles: {}, statements: [] });
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
    expect(manifest(named, B).graphical).toEqual({
      styles: { green: { stroke: "#00CC00" } },
      statements: [{ select: { element: "timeline" }, set: "green" }],
    });
    expect(manifest(named)).toEqual(manifest(view));
    const inline = applied(
      named,
      style({ select: { element: "timeline" }, set: { opacity: 0.5 }, blocks: [B] }),
    );
    expect(manifest(inline, B).graphical).toEqual({
      styles: { green: { stroke: "#00CC00" } },
      statements: [{ select: { element: "timeline" }, set: { stroke: "#00CC00", opacity: 0.5 } }],
    });
    const emptied = applied(
      named,
      style({ select: { element: "timeline" }, set: { stroke: null }, name: "green", blocks: [B] }),
    );
    expect(manifest(emptied, B).graphical).toEqual({ styles: {}, statements: [] });
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
