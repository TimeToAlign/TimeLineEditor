import { describe, expect, it } from "vitest";
import type { Block, View } from "../src/index.ts";
import { checkWorkspace, createView, DEFAULT_SETTINGS } from "../src/index.ts";
import { A, B, block, C, viewOf } from "./support.ts";

const found = (view: View) => checkWorkspace(view).map(({ code, path }) => ({ code, path }));

function viewWith(...blocks: Block[]): View {
  return { ...createView(), blocks: Object.fromEntries(blocks.map((item) => [item.id, item])) };
}

describe("workspace creation", () => {
  it("defaults blocks to the drawing's placement defaults and scale 1", () => {
    expect(DEFAULT_SETTINGS).toEqual({
      grid: { size: 8, snap: true },
      blockDefaults: {
        scale: 1,
        length: 400,
        spacing: 1,
        width: null,
        height: null,
        order: ["children", "regions", "flow"],
      },
      graphical: {},
    });
  });

  it("creates exactly the fixed metadata, the settings and no blocks", () => {
    expect(createView()).toEqual({
      meta: { format: "tilie-workspace", version: 2 },
      settings: DEFAULT_SETTINGS,
      blocks: {},
    });
    const settings = { ...DEFAULT_SETTINGS, grid: { size: 4, snap: false } };
    expect(createView(settings)).toEqual({
      meta: { format: "tilie-workspace", version: 2 },
      settings,
      blocks: {},
    });
  });

  it("gives a block exactly its twelve members", () => {
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
        "width",
        "height",
        "order",
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
    const invalid = {
      ...region,
      x: Number.POSITIVE_INFINITY,
      scale: 0,
      length: -1,
      spacing: 0,
      width: -5,
      height: null,
      order: ["children", "children", "flow"],
      manifest: {
        ...region.manifest,
        timelines: [{ ...timeline, regions: [{ ...first, end: [0, 1] }] }],
      },
    } as unknown as Block;
    expect(found(viewWith(invalid))).toEqual([
      { code: "non_finite_number", path: ["blocks", A, "x"] },
      { code: "non_positive_number", path: ["blocks", A, "scale"] },
      { code: "non_positive_number", path: ["blocks", A, "length"] },
      { code: "non_positive_number", path: ["blocks", A, "spacing"] },
      { code: "non_positive_number", path: ["blocks", A, "width"] },
      { code: "invalid_order", path: ["blocks", A, "order"] },
      {
        code: "region_end_before_start",
        path: ["blocks", A, "manifest", "timelines", 0, "regions", 0, "end"],
      },
    ]);
  });
});
