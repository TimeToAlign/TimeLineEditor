import { describe, expect, it } from "vitest";
import type { Block } from "../src/workspace/blocks.ts";
import type { View } from "../src/workspace/view.ts";
import { checkWorkspace, createView, DEFAULT_SETTINGS } from "../src/workspace/view.ts";
import { A, B, block, C, viewOf } from "./support.ts";

const found = (view: View) => checkWorkspace(view).map(({ code, path }) => ({ code, path }));

function viewWith(...blocks: Block[]): View {
  return { ...createView(), blocks: Object.fromEntries(blocks.map((item) => [item.id, item])) };
}

describe("workspace creation", () => {
  it("defaults blocks to the drawing's placement defaults and scale 1", () => {
    expect(DEFAULT_SETTINGS).toEqual({
      grid: { size: 8, snap: true },
      blockDefaults: { scale: 1, length: 400, spacing: 8, margin: 0, width: null, height: null },
      graphical: {},
    });
  });

  it("creates exactly the fixed metadata, the name, the settings and no blocks", () => {
    expect(createView()).toEqual({
      meta: { format: "tilie-workspace", version: 6 },
      name: "untitled",
      settings: DEFAULT_SETTINGS,
      blocks: {},
    });
    const settings = { ...DEFAULT_SETTINGS, grid: { size: 4, snap: false } };
    expect(createView(settings)).toEqual({
      meta: { format: "tilie-workspace", version: 6 },
      name: "untitled",
      settings,
      blocks: {},
    });
  });

  it("gives a block exactly its thirteen members", () => {
    expect(Object.keys(block(viewOf([A, "bare.json"]))).sort()).toEqual(
      [
        "id",
        "parent",
        "index",
        "x",
        "y",
        "scale",
        "length",
        "spacing",
        "margin",
        "width",
        "height",
        "places",
        "manifest",
      ].sort(),
    );
  });
});

describe("workspace checks", () => {
  const bare = block(viewOf([A, "bare.json"]));
  const at = (id: string, changes: Partial<Block> = {}): Block => ({ ...bare, id, ...changes });

  it("reports parents, indices and ids in id order with exact paths", () => {
    const view = {
      ...createView(),
      blocks: {
        [A]: at(A, { parent: B, index: "a00" }),
        [B]: at(B, { parent: A }),
        [C]: at("bad", { index: "a1" }),
      },
    };
    expect(found(view)).toEqual([
      { code: "parent_cycle", path: ["blocks", A, "parent"] },
      { code: "invalid_index", path: ["blocks", A, "index"] },
      { code: "parent_cycle", path: ["blocks", B, "parent"] },
      { code: "key_mismatch", path: ["blocks", C, "id"] },
      { code: "invalid_block_id", path: ["blocks", C, "id"] },
    ]);
  });

  it("reports an unknown parent and the later duplicate sibling index", () => {
    const view = viewWith(
      at(A, { parent: "9999999999" }),
      at(B, { index: "a1" }),
      at(C, { index: "a1" }),
    );
    expect(found(view)).toEqual([
      { code: "unknown_parent", path: ["blocks", A, "parent"] },
      { code: "duplicate_index", path: ["blocks", C, "index"] },
    ]);
  });

  it("reports the placement and prefixed manifest problems exactly", () => {
    const region = block(viewOf([A, "with_region.json"]));
    const [timeline] = region.manifest.timelines;
    const [first] = timeline?.regions ?? [];
    if (timeline === undefined || first === undefined) throw new Error("the fixture has a region");
    const invalid = {
      ...region,
      x: Number.POSITIVE_INFINITY,
      scale: 0,
      length: -1,
      spacing: -1,
      margin: -1,
      width: -5,
      height: null,
      manifest: {
        ...region.manifest,
        timelines: [{ ...timeline, regions: [{ ...first, end: [0, 1] as const }] }],
      },
    };
    expect(found(viewWith(invalid))).toEqual([
      { code: "non_finite_number", path: ["blocks", A, "x"] },
      { code: "non_positive_number", path: ["blocks", A, "scale"] },
      { code: "non_positive_number", path: ["blocks", A, "length"] },
      { code: "non_positive_number", path: ["blocks", A, "width"] },
      { code: "invalid_value", path: ["blocks", A, "spacing"] },
      { code: "invalid_value", path: ["blocks", A, "margin"] },
      {
        code: "region_end_before_start",
        path: ["blocks", A, "manifest", "timelines", 0, "regions", 0, "end"],
      },
    ]);
  });
});
