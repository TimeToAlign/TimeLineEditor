/** The block holding a manifest to import already; derived in `README.md` ("A manifest held already"). */

import { describe, expect, it } from "vitest";
import { blockHolding } from "../src/commands/add.ts";
import { importedManifest } from "../src/commands/timestamps.ts";
import type { Manifest } from "../src/manifest/types.ts";
import { createIdMinter } from "../src/workspace/ids.ts";
import type { View } from "../src/workspace/view.ts";
import { createView } from "../src/workspace/view.ts";
import { A, B, changed, load, viewOf } from "./support.ts";

/** A view holding `manifests` in blocks `A`, `B`, … in that order. */
function holding(...manifests: Manifest[]): View {
  const ids = [A, B];
  return manifests.reduce(
    (view, manifest, index) =>
      changed(view, { type: "add", into: {}, block: { id: ids[index], manifest, x: 0, y: 0 } }),
    createView(),
  );
}

describe("blockHolding", () => {
  it("finds nothing in an empty view", () => {
    expect(blockHolding(createView(), load("bare.yaml"))).toBe(null);
  });

  it("compares a manifest without id but with graphical whole", () => {
    const view = viewOf([A, "bare.yaml"], [B, "nested.yaml"]);
    expect([
      blockHolding(view, load("bare.yaml")),
      blockHolding(view, load("nested.yaml")),
      blockHolding(view, load("with_region.yaml")),
    ]).toEqual([A, B, null]);
    const edited = changed(view, {
      type: "set",
      changes: [{ target: { block: A }, values: { name: "Edited" } }],
    });
    expect(blockHolding(edited, load("bare.yaml"))).toBe(null);
  });

  it("leaves the block's graphical out for a manifest without one", () => {
    const file = load("flow/virtual_cards.yaml");
    expect(file.graphical).toBe(undefined);
    const view = holding(importedManifest(file, createIdMinter({ seed: 1n })));
    expect([
      blockHolding(view, file),
      blockHolding(view, { ...file, name: "Other cards" }),
      blockHolding(view, importedManifest(file, createIdMinter({ seed: 2n }))),
    ]).toEqual([A, null, null]);
  });

  it("compares a manifest with id by its id alone", () => {
    const bare = load("bare.yaml");
    const view = holding({ ...bare, id: "work" });
    expect([
      blockHolding(view, { ...bare, id: "work", name: "Edited" }),
      blockHolding(view, { ...bare, id: "other" }),
      blockHolding(view, bare),
      blockHolding(holding({ ...bare, id: "work" }, bare), { ...bare, id: "bare" }),
    ]).toEqual([A, null, null, null]);
  });

  it("names the first of several blocks holding it", () => {
    expect(blockHolding(viewOf([A, "bare.yaml"], [B, "bare.yaml"]), load("bare.yaml"))).toBe(A);
  });
});
