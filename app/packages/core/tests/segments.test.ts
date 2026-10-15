import { canonicalJson } from "@timetoalign/timeskeleton";
import { describe, expect, it } from "vitest";
import type { Gap, Manifest, TimelineManifest, View } from "../src/index.ts";
import { apply, createStore, movedBy, segmentGaps } from "../src/index.ts";
import { A, block, changed, deepFreeze, refusal, viewOf } from "./support.ts";

const CHILDREN = "segment_children.json";
const UNKNOWN = "unknown_length_segments.json";
const LINE = "segment_line.json";

const at = (element: string) => `${A}/${element}`;
const LEFT_EXTEND: Gap = { side: "left", verb: "extend" };
const RIGHT_EXTEND: Gap = { side: "right", verb: "extend" };
const LEFT_SHIFT: Gap = { side: "left", verb: "shift" };
const RIGHT_SHIFT: Gap = { side: "right", verb: "shift" };

/** Block `A` holding a manifest fixture, the timelines `unlocked` set unlocked by one `set`. */
function viewWith(fixture: string, ...unlocked: string[]): View {
  const view = viewOf([A, fixture]);
  if (unlocked.length === 0) return deepFreeze(view);
  const changes = unlocked.map((id) => ({ target: at(id), values: { locked: false } }));
  return deepFreeze(changed(view, { type: "set", changes }));
}

const remove = (segment: string, gap?: Gap) => ({
  type: "remove",
  targets: [at(segment)],
  ...(gap === undefined ? {} : { gap }),
});

function timeline(manifest: Manifest, id: string): TimelineManifest {
  const find = (here: TimelineManifest): TimelineManifest | undefined =>
    here.id === id ? here : here.children.map(find).find((item) => item !== undefined);
  const found = manifest.timelines.map(find).find((item) => item !== undefined);
  if (found === undefined) throw new Error(`no timeline ${id}`);
  return found;
}

/** A timeline's offset and length as plain JSON, whatever integers the manifest holds them in. */
function place(view: View, id: string): { offset: unknown; length: unknown } {
  const { offset, length } = timeline(block(view).manifest, id);
  return JSON.parse(canonicalJson({ offset: offset ?? null, length } as never));
}

const childIds = (view: View, id: string) =>
  timeline(block(view).manifest, id).children.map((child) => child.id);

describe("deleting a segment of known length", () => {
  const view = viewWith(CHILDREN, "theme", "t1", "t3");

  it("left extend grows the preceding segment", () => {
    const result = changed(view, remove("t2", LEFT_EXTEND));
    expect(childIds(result, "theme")).toEqual(["t1", "t3"]);
    expect(place(result, "t1")).toEqual({ offset: [0, 1], length: [8, 1] });
    expect(place(result, "t3")).toEqual({ offset: [8, 1], length: [4, 1] });
    expect(place(result, "theme")).toEqual({ offset: [6, 1], length: [12, 1] });
  });

  it("right extend starts the following segment where the removed one started", () => {
    const result = changed(view, remove("t2", RIGHT_EXTEND));
    expect(childIds(result, "theme")).toEqual(["t1", "t3"]);
    expect(place(result, "t1")).toEqual({ offset: [0, 1], length: [4, 1] });
    expect(place(result, "t3")).toEqual({ offset: [4, 1], length: [8, 1] });
    expect(place(result, "theme")).toEqual({ offset: [6, 1], length: [12, 1] });
  });

  it("right shift moves the later segments back and shortens the line", () => {
    const result = changed(view, remove("t2", RIGHT_SHIFT));
    expect(childIds(result, "theme")).toEqual(["t1", "t3"]);
    expect(place(result, "t3")).toEqual({ offset: [4, 1], length: [4, 1] });
    expect(place(result, "theme")).toEqual({ offset: [6, 1], length: [8, 1] });
  });

  it("left shift moves the line on in its parent and shortens it", () => {
    const result = changed(view, remove("t2", LEFT_SHIFT));
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
    const extended = changed(view, remove("b", LEFT_EXTEND));
    expect(place(extended, "a")).toEqual({ offset: [0, 1], length: null });
    expect(place(extended, "c")).toEqual({ offset: [14, 1], length: null });
    expect(place(extended, "form").length).toBeNull();
    const following = changed(view, remove("b", RIGHT_EXTEND));
    expect(place(following, "c")).toEqual({ offset: [8, 1], length: null });
    expect(place(following, "form").length).toBeNull();
    const shifted = changed(view, remove("b", RIGHT_SHIFT));
    expect(place(shifted, "c")).toEqual({ offset: [8, 1], length: null });
    expect(place(shifted, "form").length).toBeNull();
    expect(childIds(shifted, "form")).toEqual(["a", "c"]);
  });

  it("closes the gap of the last segment, whose length is not known", () => {
    const view = viewWith(UNKNOWN, "b");
    expect(place(changed(view, remove("c", LEFT_EXTEND)), "b")).toEqual({
      offset: [8, 1],
      length: null,
    });
    expect(place(changed(view, remove("c", RIGHT_SHIFT)), "b")).toEqual({
      offset: [8, 1],
      length: [6, 1],
    });
  });

  it("reads the length of a segment of unknown length from its successor", () => {
    const result = changed(viewWith(UNKNOWN), remove("a", RIGHT_SHIFT));
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
    expect(reasons(view, "t2")).toEqual([
      "the preceding segment t1 is locked",
      "the following segment t3 is locked",
      "its segment line theme is locked",
      "its segment line theme is locked",
    ]);
    expect(reasons(view, "t1")?.[0]).toBe("no segment precedes it");
    expect(reasons(view, "t3")?.[1]).toBe("no segment follows it");
    expect(segmentGaps(block(view).manifest, "theme")).toBeUndefined();
  });

  it("lets a neighbour of unknown length extend though it is locked", () => {
    expect(reasons(viewWith(UNKNOWN), "b")).toEqual([
      null,
      null,
      "its segment line form is a root and has no offset to move",
      null,
    ]);
  });

  it("refuses a way whose result the manifest's rules refuse", () => {
    const view = viewWith(LINE, "b");
    const found = reasons(view, "b1");
    expect(found?.[2]).toBe(
      'segment "b" of segment line "form" does not start where the one before it ends',
    );
    expect(found?.[3]).toBe(
      'segment "c" of segment line "form" does not start where the one before it ends',
    );
  });
});

describe("refusals", () => {
  const rejected = (view: View, command: object) => refusal(apply(view, command));

  it("asks how to close the gap", () => {
    const view = viewWith(CHILDREN);
    expect(rejected(view, remove("t2"))).toEqual({ code: "gap_required", path: [at("t2")] });
    expect(rejected(view, { type: "remove", targets: [at("t2"), at("t3")] })).toEqual({
      code: "gap_required",
      path: [at("t2")],
    });
    expect(rejected(view, remove("t2", LEFT_EXTEND))).toEqual({
      code: "gap_not_permitted",
      path: [at("t2"), "gap"],
    });
  });

  it("closes the gap of a segment only", () => {
    const view = viewWith(CHILDREN);
    for (const target of ["intro", "piece"]) {
      expect(rejected(view, remove(target, RIGHT_SHIFT))).toEqual({
        code: "wrong_target_kind",
        path: [at(target), "gap"],
      });
    }
  });

  it("refuses a malformed gap", () => {
    const view = viewWith(CHILDREN, "theme");
    const malformed = (command: object) => rejected(view, { type: "remove", ...command });
    expect(malformed({ targets: [at("t2"), at("t3")], gap: RIGHT_SHIFT })).toEqual({
      code: "invalid_command",
      path: ["targets"],
    });
    expect(malformed({ targets: [at("t2")], gap: { side: "up", verb: "shift" } })).toEqual({
      code: "invalid_command",
      path: ["gap", "side"],
    });
    expect(malformed({ targets: [at("t2")], gap: { side: "left", verb: "grow" } })).toEqual({
      code: "invalid_command",
      path: ["gap", "verb"],
    });
    expect(malformed({ targets: [at("t2")], gap: { ...RIGHT_SHIFT, by: 1 } })).toEqual({
      code: "invalid_command",
      path: ["gap", "by"],
    });
  });

  it("refuses a result the manifest's rules refuse", () => {
    expect(rejected(viewWith(LINE, "b"), remove("b1", RIGHT_SHIFT))).toEqual({
      code: "schema_violation",
      path: [A, "manifest", "timelines", 0, "children", 2, "offset"],
    });
  });
});

describe("what needs no gap", () => {
  it("removes a segment that goes with another target", () => {
    const view = viewWith(CHILDREN);
    const withLine = changed(view, { type: "remove", targets: [at("theme"), at("t2")] });
    expect(childIds(withLine, "piece")).toEqual(["intro", "coda"]);
    expect(changed(view, { type: "remove", targets: [A, at("t2")] }).blocks).toEqual({});
  });
});

describe("undo", () => {
  it("journals the gap and undoes the removal", () => {
    const store = createStore({ view: viewWith(CHILDREN, "theme"), journal: [] });
    const before = store.view;
    expect(store.dispatch(remove("t2", RIGHT_SHIFT))).toBeNull();
    const after = store.view;
    expect(store.journal.at(-1)?.command).toEqual({
      type: "remove",
      targets: [at("t2")],
      gap: { side: "right", verb: "shift" },
    });
    store.undo();
    expect(store.view).toBe(before);
    store.redo();
    expect(store.view).toBe(after);
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
