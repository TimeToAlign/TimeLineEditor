import { describe, expect, it } from "vitest";
import { bandOrderOf, DEFAULT_BAND_ORDER } from "../src/manifest/order.ts";
import { findTimeline } from "../src/manifest/tree.ts";
import type { ChildTimeline, Manifest, TimelineManifest } from "../src/manifest/types.ts";
import { load } from "./support.ts";

/** `timeline` with a getter on `children` that counts each read in `reads`. */
function counted<T extends TimelineManifest>(timeline: T, reads: { count: number }): T {
  const { children } = timeline;
  const copy = { ...timeline };
  Object.defineProperty(copy, "children", {
    get() {
      reads.count += 1;
      return children;
    },
    enumerable: true,
  });
  return copy;
}

/** `bare.yaml`'s root with 99 children `child_0` to `child_98`, every timeline's `children` counted. */
function hundredTimelines(reads: { count: number }): Manifest {
  const bare = load("bare.yaml");
  const root = bare.timelines[0];
  if (root === undefined) throw new Error("bare.yaml has its root");
  const children: ChildTimeline[] = Array.from({ length: 99 }, (_, index) =>
    counted({ ...root, id: `child_${index}`, offset: [0, 1] }, reads),
  );
  return { ...bare, timelines: [counted({ ...root, children }, reads)] };
}

const IDS = ["bare", ...Array.from({ length: 99 }, (_, index) => `child_${index}`)];

describe("one walk to find timelines", () => {
  it("walks the tree once for every lookup", () => {
    const reads = { count: 0 };
    const manifest = hundredTimelines(reads);
    const orders = IDS.map((id) => bandOrderOf(manifest, id));
    expect(reads.count).toBe(100);
    expect(orders.every((order) => order === DEFAULT_BAND_ORDER)).toBe(true);
  });

  it("keeps the walk for the manifest object", () => {
    const reads = { count: 0 };
    const manifest = hundredTimelines(reads);
    for (const id of IDS) bandOrderOf(manifest, id);
    for (const id of IDS) bandOrderOf(manifest, id);
    expect(findTimeline(manifest, "nothing")).toBeUndefined();
    expect(reads.count).toBe(100);
    expect(findTimeline(manifest, "child_42")).toBe(manifest.timelines[0]?.children[42]);
  });

  it("walks another manifest object again", () => {
    const reads = { count: 0 };
    const manifest = hundredTimelines(reads);
    bandOrderOf(manifest, "child_98");
    expect(reads.count).toBe(100);
    bandOrderOf({ ...manifest }, "child_98");
    expect(reads.count).toBe(200);
  });
});
