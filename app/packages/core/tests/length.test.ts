import { dumps, SCHEMA_VERSION } from "@timetoalign/timeskeleton";
import { describe, expect, it } from "vitest";
import { apply } from "../src/commands/apply.ts";
import { isLoadError } from "../src/errors.ts";
import { loadManifest, saveManifest } from "../src/manifest/io.ts";
import type { Manifest, TimelineManifest } from "../src/manifest/types.ts";
import type { View } from "../src/workspace/view.ts";
import { createView } from "../src/workspace/view.ts";
import {
  A,
  block,
  changed,
  deepFreeze,
  viewOf as fixtureView,
  loadText,
  refusal,
  storeOf,
  unlockedView,
} from "./support.ts";

type Length = readonly [number, number] | null;

/** A root `score` on a `fraction` quarters axis, its children given as `[id, offset, length]`. */
function manifestOf(length: Length, children: [string, number, Length][] = [], locked = false) {
  return {
    timeskeleton: SCHEMA_VERSION,
    timelines: [
      {
        id: "score",
        unit: "quarters",
        length,
        locked,
        children: children.map(([id, offset, own]) => ({
          id,
          unit: "quarters",
          offset: [offset, 1],
          length: own,
        })),
      },
    ],
  };
}

const text = (...parts: Parameters<typeof manifestOf>) => dumps(manifestOf(...parts));

function viewOf(...parts: Parameters<typeof manifestOf>): View {
  return changed(createView(), {
    type: "add",
    into: "workspace",
    block: { id: A, manifest: loadText(text(...parts)), x: 0, y: 0 },
  });
}

const root = (view: View): TimelineManifest =>
  block(view).manifest.timelines[0] as TimelineManifest;
const setLength = (length: unknown) => ({
  type: "set",
  changes: [{ target: `${A}/score`, values: { length } }],
});
const problems = (input: string) => {
  const result = loadManifest(input);
  return isLoadError(result) ? result.problems.map(({ code, path }) => ({ code, path })) : [];
};
const CHILD_OFFSET = ["timelines", 0, "children", 0, "offset"];

describe("a length of null means the length is not known", () => {
  it.each([
    ["a root", text(null)],
    ["a locked root", text(null, [], true)],
    ["a child in a root of known length", text([16, 1], [["part", 4, null]])],
    ["a child of known length in a root of unknown length", text(null, [["part", 4, [8, 1]]])],
    ["a child and a root both of unknown length", text(null, [["part", 4, null]])],
  ])("is accepted on %s and saved as null", (_, input) => {
    expect(problems(input)).toEqual([]);
    const saved = saveManifest(loadText(input));
    expect(saved).toContain('"length": null');
    expect(loadText(saved)).toEqual(loadText(input));
  });
});

describe("checks that need an end run where the end is known", () => {
  it("refuses a child of unknown length starting past its parent's known end", () => {
    const result = loadManifest(text([16, 1], [["part", 20, null]]));
    expect(isLoadError(result) ? result.problems : result).toEqual([
      {
        code: "schema_violation",
        message: "offset [20, 1] of 'part' is beyond the length [16, 1] of its parent 'score'",
        path: CHILD_OFFSET,
      },
    ]);
  });

  it("refuses a negative offset whatever the lengths", () => {
    for (const length of [[16, 1] as const, null]) {
      const result = loadManifest(text(length, [["part", -1, null]]));
      expect(isLoadError(result) ? result.problems : result).toEqual([
        {
          code: "negative_child_offset",
          message: "A negative child offset is not supported yet: child 'part' has offset [-1, 1].",
          path: CHILD_OFFSET,
        },
      ]);
    }
  });
});

describe("setting a length to and from null", () => {
  it("is an ordinary set, bounded below by what the children reach", () => {
    const view = deepFreeze(viewOf([16, 1], [["part", 4, [8, 1]]]));
    const unknown = changed(view, setLength(null));
    expect(root(unknown).length).toBe(null);
    expect(root(changed(unknown, setLength([12, 1]))).length).toEqual([12, 1]);
    expect(refusal(apply(unknown, setLength([23, 2])))).toEqual({
      code: "length_below_content",
      path: [`${A}/score`, "length"],
    });
    const open = deepFreeze(viewOf(null, [["part", 6, null]]));
    expect(refusal(apply(open, setLength([5, 1])))).toEqual({
      code: "length_below_content",
      path: [`${A}/score`, "length"],
    });
    expect(root(changed(open, setLength([6, 1]))).length).toEqual([6, 1]);
  });

  it("is refused on a locked timeline in both directions", () => {
    for (const [from, to] of [
      [[16, 1], null],
      [null, [16, 1]],
    ] as [Length, Length][]) {
      expect(refusal(apply(deepFreeze(viewOf(from, [], true)), setLength(to)))).toEqual({
        code: "locked",
        path: [`${A}/score`, "length"],
      });
    }
  });

  it("is undone like any other command", () => {
    const store = storeOf(viewOf([16, 1]));
    const before = store.view;
    expect(store.dispatch(setLength(null))).toBeNull();
    expect(root(store.view).length).toBe(null);
    store.undo();
    expect(store.view).toBe(before);
  });
});

describe("adding content", () => {
  it("leaves an unknown length unknown", () => {
    let view = viewOf(null);
    view = changed(view, {
      type: "add",
      into: `${A}/score`,
      child: { id: "part", unit: "quarters", offset: [4, 1], length: [8, 1] },
    });
    view = changed(view, {
      type: "add",
      into: `${A}/score`,
      region: { id: "region_1", start: [2, 1], end: [30, 1] },
    });
    expect(root(view).length).toBe(null);
  });

  it("grows an unlocked parent of known length to the offset of a child of unknown length", () => {
    const view = changed(viewOf([16, 1]), {
      type: "add",
      into: `${A}/score`,
      child: { id: "part", unit: "quarters", offset: [20, 1], length: null },
    });
    expect(root(view).length).toEqual([20, 1]);
    expect((block(view).manifest as Manifest).timelines[0]?.children[0]?.length).toBe(null);
  });
});

describe("a length change never pushes a parent", () => {
  const set = (values: Record<string, Record<string, unknown>>) => ({
    type: "set",
    changes: Object.entries(values).map(([id, own]) => ({ target: `${A}/${id}`, values: own })),
  });
  const add = (into: string, child: object) => ({ type: "add", into: `${A}/${into}`, child });
  const child = (id: string, offset: number, length: number) => ({
    id,
    unit: "quarters",
    offset: [offset, 1],
    length: [length, 1],
  });
  /** The length of every timeline of block `A`, by id. */
  function lengths(view: View): Record<string, unknown> {
    const found: Record<string, unknown> = {};
    const walk = (timeline: TimelineManifest) => {
      found[timeline.id] = timeline.length;
      for (const own of timeline.children) walk(own);
    };
    for (const own of block(view).manifest.timelines) walk(own as TimelineManifest);
    return found;
  }

  describe("on nested.json", () => {
    const nested = deepFreeze(
      changed(
        fixtureView([A, "nested.json"]),
        set({ clt_3: { locked: false }, clt_2: { locked: false } }),
      ),
    );

    it("refuses a length past the parent's end, locked parent or not", () => {
      const view = changed(nested, set({ clt_3: { length: [12, 1] } }));
      expect(lengths(view)).toEqual({ clt_1: [16, 1], clt_3: [12, 1], clt_2: [2, 1] });
      const locked = changed(nested, set({ clt_1: { locked: true } }));
      for (const start of [nested, locked]) {
        expect(refusal(apply(start, set({ clt_3: { length: [13, 1] } })))).toEqual({
          code: "child_exceeds_parent",
          path: [`${A}/clt_3`, "length"],
        });
      }
    });

    it("grows the timeline a child is added into, never its parent", () => {
      const view = changed(nested, add("clt_3", child("g", 5, 6)));
      expect(lengths(view)).toEqual({ clt_1: [16, 1], clt_3: [11, 1], clt_2: [2, 1], g: [6, 1] });
      expect(refusal(apply(nested, add("clt_3", child("g", 5, 8))))).toEqual({
        code: "child_exceeds_parent",
        path: [`${A}/clt_3`, "child"],
      });
    });

    it("grows the timeline a child is moved in, never its parent", () => {
      const view = changed(nested, set({ clt_2: { offset: [7, 1] } }));
      expect(lengths(view)).toEqual({ clt_1: [16, 1], clt_3: [9, 1], clt_2: [2, 1] });
      expect(refusal(apply(nested, set({ clt_2: { offset: [11, 1] } })))).toEqual({
        code: "child_exceeds_parent",
        path: [`${A}/clt_2`, "offset"],
      });
    });

    it("grows a root, which has no parent", () => {
      const view = changed(nested, add("clt_1", child("g", 14, 4)));
      expect(lengths(view).clt_1).toEqual([18, 1]);
    });
  });

  describe("on segment_line.json", () => {
    // Segments read unlocked; a segment line that is a segment is unlocked
    // by its value stating so, which no command can do yet.
    const lines = deepFreeze(fixtureView([A, "segment_line.json"]));

    it("keeps the last segment ending where its line of known length ends", () => {
      for (const length of [
        [8, 1],
        [4, 1],
      ]) {
        expect(refusal(apply(lines, set({ b2: { length } })))).toEqual({
          code: "segment_end_fixed",
          path: [`${A}/b2`, "length"],
        });
      }
      expect(apply(lines, set({ b2: { length: [6, 1] } }))).toEqual({
        code: "invalid_value",
        message: "the command changes nothing",
        path: [`${A}/b2`, "length"],
      });
      const unknown = lengths(changed(lines, set({ b2: { length: null } })));
      expect([unknown.b2, unknown.b]).toEqual([null, [12, 1]]);
    });

    it("keeps a segment ending where its successor starts", () => {
      expect(refusal(apply(lines, set({ b1: { length: [4, 1] } })))).toEqual({
        code: "segment_end_fixed",
        path: [`${A}/b1`, "length"],
      });
      expect(lengths(changed(lines, set({ b1: { length: null } }))).b1).toBe(null);
    });

    it("lets the last segment of a line of unknown length change", () => {
      const view = deepFreeze(unlockedView("segment_line.json", "b"));
      const open = changed(view, set({ b: { length: null } }));
      const grown = lengths(changed(open, set({ b2: { length: [8, 1] } })));
      expect([grown.b2, grown.b]).toEqual([[8, 1], null]);
    });

    it("keeps a segment line ending where its last segment of known length ends", () => {
      const view = changed(unlockedView("segment_line.json", "c"), set({ form: { length: null } }));
      expect(refusal(apply(view, set({ c: { length: [14, 1] } })))).toEqual({
        code: "segment_end_fixed",
        path: [`${A}/c`, "length"],
      });
    });

    it("refuses a segment growing to hold a child while its line's length is known", () => {
      const view = deepFreeze(unlockedView("segment_line.json", "c"));
      expect(refusal(apply(view, add("c", child("c2", 12, 4))))).toEqual({
        code: "segment_end_fixed",
        path: [`${A}/c`, "child"],
      });
      const open = changed(view, set({ form: { length: null } }));
      const grown = lengths(changed(open, add("c", child("c2", 12, 4))));
      expect([grown.c, grown.form]).toEqual([[16, 1], null]);
    });
  });
});
