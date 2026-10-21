import { describe, expect, it } from "vitest";
import { apply } from "../src/commands/apply.ts";
import { canonicalText } from "../src/json.ts";
import { addressKey } from "../src/manifest/address.ts";
import type { Gap } from "../src/manifest/segments.ts";
import { movedBy, segmentGaps, withoutSegment } from "../src/manifest/segments.ts";
import { isSegment } from "../src/manifest/tree.ts";
import type { Manifest, TimelineManifest } from "../src/manifest/types.ts";
import type { Address } from "../src/workspace/address.ts";
import type { View } from "../src/workspace/view.ts";
import { A, block, changed, deepFreeze, load, refusal, unlockedView, viewOf } from "./support.ts";

const CHILDREN = "segment_children.json";
const UNKNOWN = "unknown_length_segments.json";
const LINE = "segment_line.json";

const at = (id: string): Address => ({ block: A, id });
const LEFT_EXTEND: Gap = { side: "left", verb: "extend" };
const RIGHT_EXTEND: Gap = { side: "right", verb: "extend" };
const LEFT_SHIFT: Gap = { side: "left", verb: "shift" };
const RIGHT_SHIFT: Gap = { side: "right", verb: "shift" };

/**
 * Block `A` holding a manifest fixture, the segment lines `unlocked` stating
 * `locked: false` before it is read; its segments read unlocked.
 */
function viewWith(fixture: string, ...unlocked: string[]): View {
  return deepFreeze(unlockedView(fixture, ...unlocked));
}

/** Block `A`'s manifest without `segment`, its gap closed as `gap` says, failing loudly if refused. */
function closed(view: View, segment: string, gap: Gap): Manifest {
  const result = withoutSegment(block(view).manifest, segment, gap);
  if (typeof result === "string") throw new Error(`${segment} ${gap.side} ${gap.verb}: ${result}`);
  return result;
}

function timeline(manifest: Manifest, id: string): TimelineManifest {
  const find = (here: TimelineManifest): TimelineManifest | undefined =>
    here.id === id ? here : here.children.map(find).find((item) => item !== undefined);
  const found = manifest.timelines.map(find).find((item) => item !== undefined);
  if (found === undefined) throw new Error(`no timeline ${id}`);
  return found;
}

/** A timeline's offset and length as plain JSON, whatever integers the manifest holds them in. */
function place(manifest: Manifest, id: string): { offset: unknown; length: unknown } {
  const { offset, length } = timeline(manifest, id);
  return JSON.parse(canonicalText({ offset: offset ?? null, length }));
}

const childIds = (manifest: Manifest, id: string) =>
  timeline(manifest, id).children.map((child) => child.id);

describe("a segment", () => {
  it("is a child of a segment line; the lines, the root and an unknown id are not", () => {
    const manifest = load("segment_children.json");
    const ids = ["piece", "intro", "i1", "i2", "theme", "t1", "t2", "t3", "coda", "c1", "c2"];
    expect(ids.filter((id) => isSegment(manifest, id))).toEqual([
      "i1",
      "i2",
      "t1",
      "t2",
      "t3",
      "c1",
      "c2",
    ]);
    expect(isSegment(manifest, "nothing")).toBe(false);
  });
});

describe("deleting a segment of known length", () => {
  const view = viewWith(CHILDREN, "theme");

  it("left extend grows the preceding segment", () => {
    const result = closed(view, "t2", LEFT_EXTEND);
    expect(childIds(result, "theme")).toEqual(["t1", "t3"]);
    expect(place(result, "t1")).toEqual({ offset: [0, 1], length: [8, 1] });
    expect(place(result, "t3")).toEqual({ offset: [8, 1], length: [4, 1] });
    expect(place(result, "theme")).toEqual({ offset: [6, 1], length: [12, 1] });
  });

  it("right extend starts the following segment where the removed one started", () => {
    const result = closed(view, "t2", RIGHT_EXTEND);
    expect(childIds(result, "theme")).toEqual(["t1", "t3"]);
    expect(place(result, "t1")).toEqual({ offset: [0, 1], length: [4, 1] });
    expect(place(result, "t3")).toEqual({ offset: [4, 1], length: [8, 1] });
    expect(place(result, "theme")).toEqual({ offset: [6, 1], length: [12, 1] });
  });

  it("right shift moves the later segments back and shortens the line", () => {
    const result = closed(view, "t2", RIGHT_SHIFT);
    expect(childIds(result, "theme")).toEqual(["t1", "t3"]);
    expect(place(result, "t3")).toEqual({ offset: [4, 1], length: [4, 1] });
    expect(place(result, "theme")).toEqual({ offset: [6, 1], length: [8, 1] });
  });

  it("left shift moves the line on in its parent and shortens it", () => {
    const result = closed(view, "t2", LEFT_SHIFT);
    expect(childIds(result, "theme")).toEqual(["t1", "t3"]);
    expect(place(result, "t1")).toEqual({ offset: [0, 1], length: [4, 1] });
    expect(place(result, "t3")).toEqual({ offset: [4, 1], length: [4, 1] });
    expect(place(result, "theme")).toEqual({ offset: [10, 1], length: [8, 1] });
  });

  it("names what each way moves or resizes on the root's axis", () => {
    const { manifest } = block(view);
    expect(movedBy(manifest, "t2", LEFT_EXTEND)).toEqual(new Set(["t1"]));
    expect(movedBy(manifest, "t2", RIGHT_EXTEND)).toEqual(new Set(["t3"]));
    expect(movedBy(manifest, "t2", RIGHT_SHIFT)).toEqual(new Set(["theme", "t3"]));
    expect(movedBy(manifest, "t2", LEFT_SHIFT)).toEqual(new Set(["theme", "t1"]));
  });
});

describe("deleting a segment of unknown length", () => {
  it("keeps lengths that are not known unknown", () => {
    const view = viewWith(UNKNOWN);
    const extended = closed(view, "b", LEFT_EXTEND);
    expect(place(extended, "a")).toEqual({ offset: [0, 1], length: null });
    expect(place(extended, "c")).toEqual({ offset: [14, 1], length: null });
    expect(place(extended, "form").length).toBeNull();
    const following = closed(view, "b", RIGHT_EXTEND);
    expect(place(following, "c")).toEqual({ offset: [8, 1], length: null });
    expect(place(following, "form").length).toBeNull();
    const shifted = closed(view, "b", RIGHT_SHIFT);
    expect(place(shifted, "c")).toEqual({ offset: [8, 1], length: null });
    expect(place(shifted, "form").length).toBeNull();
    expect(childIds(shifted, "form")).toEqual(["a", "c"]);
  });

  it("closes the gap of the last segment, whose length is not known", () => {
    const view = viewWith(UNKNOWN);
    expect(place(closed(view, "c", LEFT_EXTEND), "b")).toEqual({
      offset: [8, 1],
      length: null,
    });
    expect(place(closed(view, "c", RIGHT_SHIFT), "b")).toEqual({
      offset: [8, 1],
      length: [6, 1],
    });
  });

  it("reads the length of a segment of unknown length from its successor", () => {
    const result = closed(viewWith(UNKNOWN), "a", RIGHT_SHIFT);
    expect(place(result, "b")).toEqual({ offset: [0, 1], length: [6, 1] });
    expect(place(result, "c")).toEqual({ offset: [6, 1], length: null });
  });
});

describe("the permitted ways", () => {
  const reasons = (view: View, id: string) =>
    segmentGaps(block(view).manifest, id)?.map((option) => option.refused);

  it("gives the reason of every refused way, in the order of preference", () => {
    const view = viewWith(CHILDREN);
    expect(segmentGaps(block(view).manifest, "t2")?.map((option) => option.gap)).toEqual([
      LEFT_EXTEND,
      RIGHT_EXTEND,
      LEFT_SHIFT,
      RIGHT_SHIFT,
    ]);
    // Its neighbours are segments, which are never locked.
    expect(reasons(view, "t2")).toEqual([
      null,
      null,
      "its segment line 'theme' is locked",
      "its segment line 'theme' is locked",
    ]);
    expect(reasons(view, "t1")?.[0]).toBe("no segment precedes it");
    expect(reasons(view, "t3")?.[1]).toBe("no segment follows it");
    expect(segmentGaps(block(view).manifest, "theme")).toBeUndefined();
  });

  it("lets neighbours of unknown length extend and keeps a root from shifting left", () => {
    expect(reasons(viewWith(UNKNOWN), "b")).toEqual([
      null,
      null,
      "its segment line 'form' is a root and has no offset to move",
      null,
    ]);
  });

  it("refuses a way whose result the manifest's rules refuse", () => {
    const view = viewWith(LINE, "b");
    const found = reasons(view, "b1");
    expect(found?.[2]).toBe(
      "segment 'b' of segment line 'form' does not start where the one before it ends",
    );
    expect(found?.[3]).toBe(
      "segment 'c' of segment line 'form' does not start where the one before it ends",
    );
  });
});

describe("removing a segment", () => {
  const rejected = (view: View, command: object) => refusal(apply(view, command));

  it("is refused while the editor offers no way to close its gap", () => {
    const view = viewWith(CHILDREN);
    expect(rejected(view, { type: "remove", targets: [at("t2")] })).toEqual({
      code: "segment_not_removable",
      path: [addressKey(at("t2"))],
    });
    expect(rejected(view, { type: "remove", targets: [at("t2"), at("t3")] })).toEqual({
      code: "segment_not_removable",
      path: [addressKey(at("t2"))],
    });
  });
});

describe("what needs no gap", () => {
  it("removes a segment that goes with another target", () => {
    const view = viewWith(CHILDREN);
    const withLine = changed(view, { type: "remove", targets: [at("theme"), at("t2")] });
    expect(childIds(block(withLine).manifest, "piece")).toEqual(["intro", "coda"]);
    expect(changed(view, { type: "remove", targets: [{ block: A }, at("t2")] }).blocks).toEqual({});
  });
});

describe("statements naming a removed timeline", () => {
  it("removes a statement whose within names a removed timeline", () => {
    let view: View = viewOf([A, CHILDREN]);
    for (const [within, opacity] of [
      ["theme", 0.5],
      ["t1", 0.4],
      ["coda", 0.3],
    ] as const) {
      view = changed(view, {
        type: "style",
        select: { element: "boundary", within },
        set: { opacity },
        blocks: [A],
      });
    }
    const result = changed(deepFreeze(view), { type: "remove", targets: [at("theme")] });
    expect(block(result).manifest.graphical?.statements).toEqual([
      { select: { element: "boundary", within: "coda" }, set: { opacity: 0.3 } },
    ]);
  });
});
