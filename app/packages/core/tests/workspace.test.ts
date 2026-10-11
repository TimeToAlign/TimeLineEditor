import { dumps, parseJson } from "@timetoalign/timeskeleton";
import { describe, expect, it } from "vitest";
import type { BlockRecord, Command, TextRecord, View, WorkspaceRecord } from "../src/index.ts";
import {
  apply,
  COMMAND_TYPES,
  checkWorkspace,
  createView,
  DEFAULT_SETTINGS,
  isCommandError,
  parseCommand,
} from "../src/index.ts";
import { deepFreeze, load } from "./support.ts";

const A = "0000000000";
const B = "0000000001";
const C = "0000000002";
const meta = { created: "2026-10-11T00:00:00Z", generator: "core-tests" };

function empty(): View {
  return createView(meta);
}

function changed(view: View, command: Command): View {
  const result = apply(view, command);
  if (isCommandError(result)) throw new Error(`${result.code}: ${result.message}`);
  return result;
}

function withBlock(id = A): View {
  return changed(empty(), {
    type: "createBlock",
    id,
    manifest: load("bare.json"),
    x: 12.5,
    y: -4,
  });
}

function record(view: View, id = A): BlockRecord {
  const value = view.records[id];
  if (value?.kind !== "block") throw new Error(`block ${id} is missing`);
  return value;
}

function text(id: string, parent: string | null, index: string): TextRecord {
  return { id, kind: "text", parent, index, x: 1, y: 2, width: 3, text: "x", style: {} };
}

function viewWith(...records: WorkspaceRecord[]): View {
  return { ...empty(), records: Object.fromEntries(records.map((item) => [item.id, item])) };
}

describe("workspace creation and checks", () => {
  it("creates exactly the fixed metadata, defaults and no records", () => {
    expect(empty()).toEqual({
      meta: { format: "tilie-workspace", version: 1, ...meta },
      settings: DEFAULT_SETTINGS,
      records: {},
    });
  });

  it("reports structural record problems in id order with exact paths", () => {
    const one = text(A, B, "a00");
    const two = text(B, A, "a0");
    const malformed = { ...text("bad", null, "a0"), id: "bad" };
    const view = {
      ...empty(),
      records: { [A]: one, [B]: two, [C]: malformed },
    } as unknown as View;
    expect(checkWorkspace(view).map(({ code, path }) => ({ code, path }))).toEqual([
      { code: "parent_cycle", path: ["records", A, "parent"] },
      { code: "invalid_index", path: ["records", A, "index"] },
      { code: "parent_cycle", path: ["records", B, "parent"] },
      { code: "key_mismatch", path: ["records", C, "id"] },
      { code: "invalid_record_id", path: ["records", C, "id"] },
    ]);
  });

  it("reports an unknown parent and the later duplicate sibling index", () => {
    const view = viewWith(text(A, "9999999999", "a0"), text(B, null, "a1"), text(C, null, "a1"));
    expect(checkWorkspace(view).map(({ code, path }) => ({ code, path }))).toEqual([
      { code: "unknown_parent", path: ["records", A, "parent"] },
      { code: "duplicate_index", path: ["records", C, "index"] },
    ]);
  });

  it("reports canvas and prefixed manifest problems exactly", () => {
    const base = record(
      changed(empty(), {
        type: "createBlock",
        id: A,
        manifest: load("with_region.json"),
        x: 0,
        y: 0,
      }),
    );
    const region = base.manifest.timeline.regions[0];
    const invalid = {
      ...base,
      x: Number.POSITIVE_INFINITY,
      scale: 0,
      zoom: -1,
      manifest: {
        ...base.manifest,
        timeline: {
          ...base.manifest.timeline,
          regions: [region, region],
        },
      },
    } as BlockRecord;
    expect(checkWorkspace(viewWith(invalid)).map(({ code, path }) => ({ code, path }))).toEqual([
      { code: "non_finite_number", path: ["records", A, "x"] },
      { code: "non_positive_number", path: ["records", A, "scale"] },
      { code: "non_positive_number", path: ["records", A, "zoom"] },
      {
        code: "duplicate_region",
        path: ["records", A, "manifest", "timeline", "regions", 1, "name"],
      },
    ]);
  });
});

describe("workspace commands", () => {
  it("exports exactly eight record and sixteen manifest commands", () => {
    expect(COMMAND_TYPES.length).toBe(24);
    expect(COMMAND_TYPES.slice(0, 8)).toEqual([
      "createBlock",
      "moveRecords",
      "resizeRecord",
      "setRecordProperties",
      "setIndex",
      "deleteRecords",
      "setSettings",
      "setBlockManifest",
    ]);
  });

  it("creates a complete block from settings and increasing root indices", () => {
    let view = withBlock(A);
    view = changed(view, {
      type: "createBlock",
      id: B,
      manifest: load("continuous_physical.json"),
      x: 3,
      y: 4,
      scale: 50,
      zoom: 2,
    });
    expect(record(view, A)).toMatchObject({
      id: A,
      kind: "block",
      blockKind: "timeline",
      parent: null,
      index: "a0",
      x: 12.5,
      y: -4,
      scale: 40,
      zoom: 1,
      margins: { top: 16, right: 16, bottom: 16, left: 16 },
      background: null,
      nameColumn: { visible: true, width: [1, 4] },
      overrides: {},
    });
    expect(record(view, B)).toMatchObject({ index: "a1", x: 3, y: 4, scale: 50, zoom: 2 });
    expect(checkWorkspace(view)).toEqual([]);
  });

  it("moves, resizes, changes properties, order, settings and the manifest", () => {
    let view = withBlock();
    view = changed(view, { type: "moveRecords", moves: [{ id: A, x: -3.5, y: 8 }] });
    view = changed(view, { type: "resizeRecord", id: A, scale: 24 });
    view = changed(view, {
      type: "setRecordProperties",
      id: A,
      properties: {
        zoom: 1.5,
        margins: { top: 1, right: 2, bottom: 3, left: 4 },
        background: "#ABCDEF",
        nameColumn: { visible: false, width: [2, 5] },
        overrides: { statements: [{ select: {}, set: { stroke: "#123456" } }] },
      },
    });
    view = changed(view, { type: "setIndex", id: A, index: "a2" });
    view = changed(view, {
      type: "setSettings",
      settings: { grid: { snap: false }, blockDefaults: { scale: 64 } },
    });
    view = changed(view, { type: "setBlockManifest", block: A, manifest: load("map.json") });
    view = changed(view, {
      type: "setName",
      block: A,
      id: record(view).manifest.timeline.id,
      name: "Changed",
    });
    expect(record(view)).toMatchObject({
      x: -3.5,
      y: 8,
      scale: 24,
      zoom: 1.5,
      index: "a2",
      margins: { top: 1, right: 2, bottom: 3, left: 4 },
      background: "#ABCDEF",
      nameColumn: { visible: false, width: [2, 5] },
      overrides: { statements: [{ select: {}, set: { stroke: "#123456" } }] },
    });
    expect(record(view).manifest.timeline.name).toBe("Changed");
    expect(view.settings.blockDefaults.scale).toBe(64);
    expect(view.settings.blockDefaults.zoom).toBe(1);
    expect(view.settings.grid).toEqual({ size: 8, snap: false });
    expect(checkWorkspace(view)).toEqual([]);
  });

  it("refuses a manifest of another schema version through createBlock", () => {
    const manifest = parseJson(
      dumps(load("bare.json")).replace('"schema_version": "0.4.0"', '"schema_version": "0.0.0"'),
    );
    const result = apply(empty(), {
      type: "createBlock",
      id: A,
      manifest: manifest as never,
      x: 0,
      y: 0,
    });
    expect(isCommandError(result) ? { code: result.code, path: result.path } : result).toEqual({
      code: "schema_violation",
      path: ["records", A, "manifest", "meta", "schema_version"],
    });
  });

  it("deletes descendants and leaves unrelated records", () => {
    const view = viewWith(text(A, null, "a0"), text(B, A, "a0"), text(C, null, "a1"));
    expect(changed(view, { type: "deleteRecords", ids: [A] }).records).toEqual({
      [C]: text(C, null, "a1"),
    });
  });

  it.each([
    [
      { type: "createBlock", id: "bad", manifest: load("bare.json"), x: 0, y: 0 },
      "invalid_record_id",
      ["id"],
    ],
    [
      { type: "createBlock", id: A, manifest: load("bare.json"), x: Number.NaN, y: 0 },
      "non_finite_number",
      ["x"],
    ],
    [{ type: "resizeRecord", id: A, scale: 0 }, "non_positive_number", ["scale"]],
    [{ type: "moveRecords", moves: [{ id: B, x: 0, y: 0 }] }, "unknown_record", ["records", B]],
    [{ type: "setIndex", id: A, index: "a00" }, "invalid_index", ["index"]],
    [
      { type: "setRecordProperties", id: A, properties: { x: 1 } },
      "invalid_command",
      ["properties", "x"],
    ],
  ] as const)("refuses %j without changing the view", (command, code, path) => {
    const view = deepFreeze(withBlock());
    const result = apply(view, command as unknown as Command);
    expect(isCommandError(result) && { code: result.code, path: result.path }).toEqual({
      code,
      path,
    });
    expect(view).toBe(view);
  });

  it("distinguishes unknown records from non-block records", () => {
    const view = viewWith(text(A, null, "a0"));
    const absent = apply(view, { type: "setName", block: B, id: "x", name: null });
    const wrong = apply(view, { type: "setName", block: A, id: "x", name: null });
    expect(isCommandError(absent) && absent.code).toBe("unknown_record");
    expect(isCommandError(wrong) && wrong.code).toBe("not_a_block");
  });

  it("points a record-command error into the view: setIndex on a missing record is at records/<id>", () => {
    const result = apply(withBlock(), { type: "setIndex", id: B, index: "a0" });
    expect(isCommandError(result) && { code: result.code, path: result.path }).toEqual({
      code: "unknown_record",
      path: ["records", B],
    });
  });

  it("points a manifest-command error into the view: records/<block>/manifest/<member>", () => {
    const view = withBlock();
    const result = apply(view, {
      type: "removeRegion",
      block: A,
      timeline: "bare",
      name: "missing",
    });
    expect(isCommandError(result) && { code: result.code, path: result.path }).toEqual({
      code: "unknown_region",
      path: ["records", A, "manifest", "name"],
    });
  });

  it("parseCommand pins record-member validation", () => {
    expect(
      parseCommand({ type: "createBlock", id: A, manifest: load("bare.json"), x: 0, y: 0 }),
    ).toMatchObject({
      type: "createBlock",
      id: A,
      x: 0,
      y: 0,
    });
    const bad = parseCommand({ type: "setSettings", settings: { grid: { size: Infinity } } });
    expect(isCommandError(bad) && { code: bad.code, path: bad.path }).toEqual({
      code: "non_finite_number",
      path: ["settings", "grid", "size"],
    });
  });
});
