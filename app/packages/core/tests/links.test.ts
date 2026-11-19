/** Links of the manifest, its timelines and its regions; the expected values are derived in `README.md` ("Links"). */

import { dumps, linkFromUrl } from "@timetoalign/timetoshare";
import { describe, expect, it } from "vitest";
import { apply } from "../src/commands/apply.ts";
import { importedManifest } from "../src/commands/timestamps.ts";
import { isCommandError } from "../src/errors.ts";
import { loadManifest, saveManifest } from "../src/manifest/io.ts";
import { linkHolder } from "../src/manifest/links.ts";
import { findTimeline } from "../src/manifest/tree.ts";
import type { Link, Manifest } from "../src/manifest/types.ts";
import type { Address } from "../src/workspace/address.ts";
import { manifestIds, resolveAddress } from "../src/workspace/address.ts";
import type { View } from "../src/workspace/view.ts";
import { createView } from "../src/workspace/view.ts";
import {
  A,
  at,
  block,
  changed,
  deepFreeze,
  fileText,
  key,
  loadText,
  manifestValue,
  storeOf,
  viewOf,
} from "./support.ts";

const MIXED = "bundles/bundle_mixed.yaml";
const BLOCK: Address = { block: A };
const MB = "http://musicbrainz.org/work/4a622b0d-b0c0-405e-b49e-05b70c108284";
const PAGE = "https://musicbrainz.org/work/4a622b0d-b0c0-405e-b49e-05b70c108284";

/** The link `W`, given in its minimal form. */
const W = { relation: "pertains_to", level: "work", uri: [MB], label: "Op. 106" };

/** `W*`, the complete form of `W`. */
const COMPLETE_W = {
  relation: "pertains_to",
  level: "work",
  uri: [MB],
  identifiers: [],
  records: [],
  label: "Op. 106",
  assertion: null,
  parts_relation: null,
  parts: [],
  parts_ordered: true,
  part_of: [],
};

/** A `set` of `links` on each target. */
function setLinks(...changes: (readonly [Address, unknown])[]) {
  return {
    type: "set",
    changes: changes.map(([target, links]) => ({ target, values: { links } })),
  };
}

/** The view a command leaves, its input deep-frozen. */
const applied = (view: View, command: object): View => changed(deepFreeze(view), command);

/** The code, message and path of a refusal. */
function refused(view: View, command: object) {
  const result = apply(deepFreeze(view), command);
  if (!isCommandError(result)) throw new Error("expected a refusal");
  return { code: result.code, message: result.message, path: result.path };
}

const manifestOf = (view: View): Manifest => block(view).manifest;

/** The links of the timeline `id` of block A's manifest. */
function timelineLinks(view: View, id: string): readonly Link[] {
  const found = findTimeline(manifestOf(view), id);
  if (found === undefined) throw new Error(`no timeline ${id}`);
  return found.links;
}

/** The links of the region `id` of the timeline `timeline` in block A. */
function regionLinks(view: View, timeline: string, id: string): readonly Link[] {
  const found = findTimeline(manifestOf(view), timeline)?.regions.find(
    (region) => region.id === id,
  );
  if (found === undefined) throw new Error(`no region ${id}`);
  return found.links;
}

/** Every timeline's and region's links of block A, by ID. */
function everyList(view: View): Record<string, readonly Link[]> {
  const lists: Record<string, readonly Link[]> = { "": manifestOf(view).links };
  const visit = (timeline: Manifest["timelines"][number]) => {
    lists[timeline.id] = timeline.links;
    for (const region of timeline.regions) lists[region.id] = region.links;
    for (const child of timeline.children) visit(child);
  };
  for (const root of manifestOf(view).timelines) visit(root);
  return lists;
}

/** Block A holding `bare.yaml` with a scheme `clt_1`. */
function withScheme(): View {
  const value = manifestValue("bare.yaml");
  const manifest = loadText(
    fileText({ ...value, schemes: [{ id: "clt_1", name: "Opus numbers" }] }),
    "bare.yaml with a scheme",
  );
  return changed(createView(), { type: "add", into: {}, block: { id: A, manifest, x: 0, y: 0 } });
}

/** All four owners of `bundle_mixed` given `[W]` (item 1). */
const linked = () =>
  applied(
    viewOf([A, MIXED]),
    setLinks([BLOCK, [W]], [at("score"), [W]], [at("excerpt"), [W]], [at("region_1"), [W]]),
  );

describe("links", () => {
  it("W* is TimeToShare's link from the work's page", () => {
    expect(linkFromUrl(PAGE, { label: "Op. 106" })).toEqual(COMPLETE_W);
  });

  it("are set on the bundle, a root, a child and a region (item 1)", () => {
    const view = linked();
    const lists = everyList(view);
    const linkedIds = ["", "score", "excerpt", "region_1"];
    expect(Object.keys(lists).sort()).toEqual(
      [
        "",
        "annotations",
        "excerpt",
        "page",
        "performance",
        "recording",
        "region_1",
        "region_2",
        "score",
      ].sort(),
    );
    for (const [id, links] of Object.entries(lists)) {
      expect([id, links]).toEqual([id, linkedIds.includes(id) ? [COMPLETE_W] : []]);
    }
    expect(manifestOf(view).schemes).toEqual([]);
  });

  it("are one journal entry, undone and redone (item 2)", () => {
    const store = storeOf(viewOf([A, MIXED]));
    const before = store.view;
    expect(store.dispatch(setLinks([BLOCK, [W]]))).toBe(null);
    const after = store.view;
    expect(store.journal).toHaveLength(2);
    expect(manifestOf(after).links).toEqual([COMPLETE_W]);
    store.undo();
    expect(dumps(store.view)).toBe(dumps(before));
    expect(manifestOf(store.view).links).toEqual([]);
    store.redo();
    expect(dumps(store.view)).toBe(dumps(after));
    expect(store.dispatch(setLinks([BLOCK, []]))).toBe(null);
    expect(store.journal).toHaveLength(3);
    expect(manifestOf(store.view).links).toEqual([]);
  });

  it("refuse a list equal to the stored one (item 3)", () => {
    expect(refused(linked(), setLinks([at("score"), [W]]))).toEqual({
      code: "invalid_value",
      message: "the command changes nothing",
      path: [key(at("score")), "links"],
    });
  });

  it("refuse what is no list of links of the manifest (item 4)", () => {
    const view = viewOf([A, MIXED]);
    const { level: _, ...levelless } = W;
    const cases = [
      [at("score"), "W"],
      [BLOCK, [levelless]],
      [BLOCK, [{ ...W, identifiers: [{ scheme: "opus", value: "106" }] }]],
      [
        BLOCK,
        [
          {
            ...W,
            parts_relation: "has_part",
            parts: [{ label: "I", represented_by: ["nowhere"] }],
          },
        ],
      ],
      [at("group_1"), [W]],
    ] as const;
    expect(cases.map(([target, links]) => refused(view, setLinks([target, links])))).toEqual([
      {
        code: "invalid_value",
        message: "links is a list of links",
        path: [key(at("score")), "links"],
      },
      {
        code: "schema_violation",
        message: "must have required property 'level'",
        path: [A, "manifest", "links", 0],
      },
      {
        code: "schema_violation",
        message: "'opus' names no scheme of this manifest and is no absolute URI",
        path: [A, "manifest", "links", 0, "identifiers", 0, "scheme"],
      },
      {
        code: "schema_violation",
        message: "'nowhere' names no timeline or region of this manifest",
        path: [A, "manifest", "links", 0, "parts", 0, "represented_by", 0],
      },
      {
        code: "wrong_target_kind",
        message: "links is a property of block, root, child, region, not of group",
        path: [key(at("group_1")), "links"],
      },
    ]);
  });

  it("are no member of a block (item 5)", () => {
    const manifest = loadText(fileText(manifestValue("bare.yaml")), "bare.yaml");
    expect(
      refused(createView(), {
        type: "add",
        into: {},
        block: { id: A, manifest, x: 0, y: 0, links: [] },
      }),
    ).toEqual({
      code: "unknown_property",
      message: "unknown member links",
      path: [key({}), "block", "links"],
    });
  });
});

describe("schemes", () => {
  it("are manifest IDs, never drawn (item 6)", () => {
    const view = withScheme();
    expect(manifestOf(view).schemes).toEqual([
      { id: "clt_1", name: "Opus numbers", uri: [], criteria: null },
    ]);
    expect([...manifestIds(manifestOf(view))].sort()).toEqual(
      ["bare", "clt_1", "timestamp_1", "timestamp_2"].sort(),
    );
    expect(
      refused(view, {
        type: "add",
        into: BLOCK,
        timeline: { id: "clt_1", unit: "quarters", length: [4, 1] },
      }),
    ).toEqual({
      code: "duplicate_id",
      message: "'clt_1' is already an ID of the manifest",
      path: [key(BLOCK), "timeline", "id"],
    });
    const line = applied(view, {
      type: "set",
      changes: [{ target: at("bare"), values: { is_segment_line: true } }],
    });
    expect(findTimeline(manifestOf(line), "bare")?.children.map(({ id }) => id)).toEqual(["clt_2"]);
    const resolved = resolveAddress(view, at("clt_1"));
    expect(isCommandError(resolved) ? resolved.code : resolved.kind).toBe("unknown_target");
  });

  it("are named by identifiers of links and of entries given to add (item 7)", () => {
    const named = { ...W, identifiers: [{ scheme: "clt_1", value: "op. 106" }] };
    const region = { id: "region_1", start: [0, 1], end: [4, 1], links: [named] };
    const view = withScheme();
    const set = applied(view, setLinks([at("bare"), [named]]));
    expect(timelineLinks(set, "bare")).toEqual([
      { ...COMPLETE_W, identifiers: [{ scheme: "clt_1", value: "op. 106" }] },
    ]);
    const added = applied(view, { type: "add", into: at("bare"), region });
    expect(regionLinks(added, "bare", "region_1")).toEqual([
      { ...COMPLETE_W, identifiers: [{ scheme: "clt_1", value: "op. 106" }] },
    ]);
    expect(refused(viewOf([A, "bare.yaml"]), { type: "add", into: at("bare"), region })).toEqual({
      code: "schema_violation",
      message: "'clt_1' names no scheme of this manifest and is no absolute URI",
      path: [A, "manifest", "timelines", 0, "regions", 0, "links", 0, "identifiers", 0, "scheme"],
    });
  });
});

describe("links through edits", () => {
  it("survive other commands and the file (item 8)", () => {
    let view = linked();
    view = applied(view, {
      type: "set",
      changes: [{ target: at("score"), values: { name: "Partitur" } }],
    });
    view = applied(view, {
      type: "add",
      into: at("annotations"),
      region: { id: "region_3", start: [0, 1], end: [1, 1] },
    });
    view = applied(view, {
      type: "style",
      select: { addresses: [{ id: "score" }] },
      set: { "stroke-width": 2 },
    });
    view = applied(view, {
      type: "set",
      changes: [{ target: BLOCK, values: { name: "Gemischt" } }],
    });
    expect([
      manifestOf(view).links,
      timelineLinks(view, "score"),
      timelineLinks(view, "excerpt"),
      regionLinks(view, "annotations", "region_1"),
      regionLinks(view, "annotations", "region_3"),
    ]).toEqual([[COMPLETE_W], [COMPLETE_W], [COMPLETE_W], [COMPLETE_W], []]);
    const manifest = manifestOf(view);
    for (const options of [{}, { minimal: false }]) {
      expect(loadText(saveManifest(manifest, options))).toEqual(manifest);
    }
  });

  it("lose the IDs a removal takes from their part slots (item 9)", () => {
    const P = {
      ...W,
      parts_relation: "has_part",
      parts: [
        { label: "I", represented_by: ["score", "region_1"] },
        { label: "II", represented_by: ["performance"] },
        { label: "III", absent: "lost" },
      ],
    };
    const slot = (label: string, represented: string[], absent: string | null) => ({
      uri: [],
      identifiers: [],
      label,
      represented_by: represented,
      absent,
      assertion: null,
    });
    const complete = {
      ...COMPLETE_W,
      parts_relation: "has_part",
      parts: [
        slot("I", ["score", "region_1"], null),
        slot("II", ["performance"], null),
        slot("III", [], "lost"),
      ],
    };
    const store = storeOf(applied(viewOf([A, MIXED]), setLinks([BLOCK, [P]])));
    expect(manifestOf(store.view).links).toEqual([complete]);
    expect(store.dispatch({ type: "remove", targets: [at("performance")] })).toBe(null);
    expect(manifestOf(store.view).links).toEqual([
      {
        ...complete,
        parts: [
          slot("I", ["score", "region_1"], null),
          slot("II", [], "not_represented"),
          slot("III", [], "lost"),
        ],
      },
    ]);
    expect(store.dispatch({ type: "remove", targets: [at("annotations")] })).toBe(null);
    expect(manifestOf(store.view).links).toEqual([
      {
        ...complete,
        parts: [
          slot("I", ["score"], null),
          slot("II", [], "not_represented"),
          slot("III", [], "lost"),
        ],
      },
    ]);
    store.undo();
    store.undo();
    expect(manifestOf(store.view).links).toEqual([complete]);
  });

  it("change in an editor only on the edited element (item 10)", () => {
    const store = storeOf(viewOf([A, MIXED]));
    expect(store.open(at("score"))).toBe(null);
    expect(store.dispatch(setLinks([at("score"), [W]]))).toBe(null);
    expect(timelineLinks(store.view, "score")).toEqual([COMPLETE_W]);
    const refusal = store.dispatch(setLinks([BLOCK, [W]]));
    expect(refusal === null ? null : [refusal.code, refusal.message, refusal.path]).toEqual([
      "side_effect",
      "the manifest's links in bundle 'Mixed' lie outside timeline 'Score': an editor changes only what it edits",
      [A, "manifest", "links"],
    ]);
  });

  it("are held by a manifest without timelines (item 11)", () => {
    const { graphical: _, ...value } = manifestValue("bare.yaml");
    const read = loadManifest(fileText({ ...value, timelines: [] }));
    if ("problems" in read) throw new Error("refused");
    expect(importedManifest(read)).toEqual(read);
    const view = applied(
      changed(createView(), {
        type: "add",
        into: {},
        block: { id: A, manifest: read, x: 0, y: 0 },
      }),
      setLinks([BLOCK, [W]]),
    );
    const text = saveManifest(manifestOf(view));
    expect(text.includes("timelines: []\n")).toBe(true);
    expect(loadText(text).links).toEqual([COMPLETE_W]);
  });
});

/** `S(x, …)`: `W` reading one part `I` represented by the elements `ids`. */
const S = (...ids: string[]) => ({
  ...W,
  parts_relation: "has_part",
  parts: [{ label: "I", represented_by: ids }],
});

/** A part slot in its complete form. */
const slot = (label: string, represented: string[], absent: string | null = null) => ({
  uri: [],
  identifiers: [],
  label,
  represented_by: represented,
  absent,
  assertion: null,
});

/** `S*(x, …)`, the complete form of `S(x, …)`; `S∅` for none. */
const completeS = (...ids: string[]) => ({
  ...COMPLETE_W,
  parts_relation: "has_part",
  parts: [ids.length > 0 ? slot("I", ids) : slot("I", [], "not_represented")],
});

/** `T`: `W` reading `I` represented by `clt_2` and `clt_3`, and `II` by `clt_2`. */
const T = {
  ...W,
  parts_relation: "has_part",
  parts: [
    { label: "I", represented_by: ["clt_2", "clt_3"] },
    { label: "II", represented_by: ["clt_2"] },
  ],
};

/** The links of the element `id` of block A's manifest (`null` the manifest's own). */
function heldBy(view: View, id: string | null): readonly Link[] | undefined {
  return linkHolder(manifestOf(view), id)?.links;
}

describe("links given with an element", () => {
  it("are read where they will lie (item 12)", () => {
    const view = viewOf([A, MIXED]);
    const region = applied(view, {
      type: "add",
      into: at("annotations"),
      region: { id: "region_3", start: [0, 1], end: [1, 1], links: [S("score")] },
    });
    const child = applied(view, {
      type: "add",
      into: at("recording"),
      child: { id: "take", unit: "samples", length: 100, offset: 0, links: [S("region_1")] },
    });
    const extra = {
      id: "extra",
      unit: "quarters",
      length: [4, 1],
      regions: [{ id: "region_9", start: [0, 1], end: [1, 1], links: [S("score")] }],
    };
    const root = applied(view, { type: "add", into: BLOCK, timeline: extra });
    expect([heldBy(region, "region_3"), heldBy(child, "take"), heldBy(root, "region_9")]).toEqual([
      [completeS("score")],
      [completeS("region_1")],
      [completeS("score")],
    ]);
    expect(
      refused(view, { type: "add", into: BLOCK, timeline: { ...extra, links: [S("nowhere")] } }),
    ).toEqual({
      code: "schema_violation",
      message: "'nowhere' names no timeline or region of this manifest",
      path: [A, "manifest", "timelines", 5, "links", 0, "parts", 0, "represented_by", 0],
    });
    const own = applied(view, setLinks([at("recording"), [S("excerpt")]]));
    const scaled = {
      id: "scaled",
      type: "LinearMap",
      source_unit: "samples",
      target_unit: "seconds",
      scalar: [1, 44100],
    };
    const mapped = applied(own, { type: "add", into: at("recording"), map: scaled });
    const regioned = applied(own, {
      type: "add",
      into: at("recording"),
      region: { id: "take_region", start: 0, end: 100 },
    });
    expect([
      findTimeline(manifestOf(mapped), "recording")?.conversion_maps.map(({ id }) => id),
      findTimeline(manifestOf(regioned), "recording")?.regions.map(({ id }) => id),
      heldBy(mapped, "recording"),
    ]).toEqual([["cmap_5", "scaled"], ["take_region"], [completeS("excerpt")]]);
  });
});

describe("removing what a part slot names", () => {
  /** `nested.yaml` with `clt_1`'s links `[S(clt_2)]` and its region `region_1` holding `[T]`. */
  const nested = () =>
    applied(
      applied(viewOf([A, "nested.yaml"]), {
        type: "add",
        into: at("clt_1"),
        region: { id: "region_1", start: [0, 1], end: [4, 1], links: [T] },
      }),
      setLinks([at("clt_1"), [S("clt_2")]]),
    );
  const completeT = (first: string[], second: string[]) => ({
    ...COMPLETE_W,
    parts_relation: "has_part",
    parts: [
      first.length > 0 ? slot("I", first) : slot("I", [], "not_represented"),
      second.length > 0 ? slot("II", second) : slot("II", [], "not_represented"),
    ],
  });

  it("prunes every holder's slots, a child at depth 2 and a segment alike (item 13)", () => {
    const store = storeOf(nested());
    expect([heldBy(store.view, "clt_1"), heldBy(store.view, "region_1")]).toEqual([
      [completeS("clt_2")],
      [completeT(["clt_2", "clt_3"], ["clt_2"])],
    ]);
    const entries = store.journal.length;
    expect(store.dispatch({ type: "remove", targets: [at("clt_2")] })).toBe(null);
    expect([
      store.journal.length - entries,
      heldBy(store.view, "clt_1"),
      heldBy(store.view, "region_1"),
    ]).toEqual([1, [completeS()], [completeT(["clt_3"], [])]]);
    const segments = applied(
      applied(viewOf([A, "segment_children.yaml"]), {
        type: "add",
        into: at("coda"),
        region: { id: "region_1", start: [0, 1], end: [1, 1], links: [S("i2")] },
      }),
      setLinks([at("piece"), [S("i1")]]),
    );
    const removed = applied(segments, { type: "remove", targets: [at("intro")] });
    expect([heldBy(removed, "piece"), heldBy(removed, "region_1")]).toEqual([
      [completeS()],
      [completeS()],
    ]);
  });

  it("keeps a region's links through changes of the region (item 14)", () => {
    const view = applied(nested(), {
      type: "set",
      changes: [{ target: at("region_1"), values: { start: [1, 1], end: [3, 1], name: "Theme" } }],
    });
    const region = findTimeline(manifestOf(view), "clt_1")?.regions[0];
    expect([region?.start, region?.end, region?.name, region?.links]).toEqual([
      [1, 1],
      [3, 1],
      "Theme",
      [completeT(["clt_2", "clt_3"], ["clt_2"])],
    ]);
  });

  it("is refused in an editor where it prunes outside (item 15)", () => {
    const refusal = (view: View, editing: string, removed: string) => {
      const store = storeOf(view);
      expect(store.open(at(editing))).toBe(null);
      const before = store.view;
      const result = store.dispatch({ type: "remove", targets: [at(removed)] });
      expect(store.view).toBe(before);
      return result === null ? null : [result.code, result.message, result.path];
    };
    const outside = (what: string, where: string) =>
      `${what} lie outside ${where}: an editor changes only what it edits`;
    const own = applied(viewOf([A, "nested.yaml"]), setLinks([at("clt_1"), [S("clt_2")]]));
    const manifest = applied(viewOf([A, "nested.yaml"]), setLinks([BLOCK, [S("clt_2")]]));
    const mixed = applied(viewOf([A, MIXED]), setLinks([at("score"), [S("region_1")]]));
    expect([
      refusal(own, "clt_3", "clt_2"),
      refusal(manifest, "clt_3", "clt_2"),
      refusal(mixed, "annotations", "region_1"),
    ]).toEqual([
      [
        "side_effect",
        outside("the links of timeline 'clt_1'", "timeline 'clt_3'"),
        [key(at("clt_1")), "links"],
      ],
      [
        "side_effect",
        outside("the manifest's links in the anonymous bundle", "timeline 'clt_3'"),
        [A, "manifest", "links"],
      ],
      [
        "side_effect",
        outside("the links of timeline 'Score'", "timeline 'Annotations'"),
        [key(at("score")), "links"],
      ],
    ]);
  });
});
