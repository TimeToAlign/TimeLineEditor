/** Links of the manifest, its timelines and its regions; the expected values are derived in `README.md` ("Links"). */

import { dumps, linkFromUrl } from "@timetoalign/timetoshare";
import { describe, expect, it } from "vitest";
import { apply } from "../src/commands/apply.ts";
import { importedManifest } from "../src/commands/timestamps.ts";
import { isCommandError } from "../src/errors.ts";
import { loadManifest, saveManifest } from "../src/manifest/io.ts";
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
  key,
  loadText,
  manifestValue,
  storeOf,
  viewOf,
} from "./support.ts";

const MIXED = "bundles/bundle_mixed.json";
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

/** Block A holding `bare.json` with a scheme `clt_1`. */
function withScheme(): View {
  const value = manifestValue("bare.json");
  const manifest = loadText(
    dumps({ ...value, schemes: [{ id: "clt_1", name: "Opus numbers" }] }),
    "bare.json with a scheme",
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
    const manifest = loadText(dumps(manifestValue("bare.json")), "bare.json");
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
    expect(refused(viewOf([A, "bare.json"]), { type: "add", into: at("bare"), region })).toEqual({
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
    for (const options of [{}, { minimal: true }]) {
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
      "the manifest's links in bundle 'Mixed' lies outside timeline 'Score': an editor changes only what it edits",
      [A, "manifest", "links"],
    ]);
  });

  it("are held by a manifest without timelines (item 11)", () => {
    const { graphical: _, ...value } = manifestValue("bare.json");
    const read = loadManifest(dumps({ ...value, timelines: [] }));
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
    expect(text.includes('"timelines": []')).toBe(true);
    expect(loadText(text).links).toEqual([COMPLETE_W]);
  });
});
