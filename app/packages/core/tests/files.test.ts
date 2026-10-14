import { dumps, parse } from "@timetoalign/timeskeleton";
import { describe, expect, it } from "vitest";
import type { BundleFile, GroupFile, Manifest, View } from "../src/index.ts";
import {
  apply,
  checkWorkspace,
  createStore,
  createView,
  elementOf,
  elementOfIn,
  isCommandError,
  isLoadError,
  isRemovable,
  isRemovableIn,
  loadManifest,
  manifestElements,
  manifestIds,
  manifestKind,
  manifestRoots,
  memberDrawings,
  nextId,
  readWorkspace,
  selectorMatches,
  timelineAncestry,
  writeWorkspace,
} from "../src/index.ts";
import {
  A,
  addBlock,
  B,
  block,
  C,
  changed,
  deepFreeze,
  load,
  loadFile,
  refusal,
  testClock,
  viewOf,
} from "./support.ts";

const CLT = "ContinuousLogicalTimeline";
const CPT = "ContinuousPhysicalTimeline";
const GROUP = "groups/group_child_member.json";
const NUMBERS = "groups/group_number_types.json";
const STYLED = "groups/group_styled.json";
const BUNDLE = "bundles/bundle_mixed.json";

const quarters = (numerator: number) => ({
  unit: "quarters",
  number_type: "fraction",
  value: [numerator, 1],
});
const pixels = (value: number) => ({ unit: "pixels", number_type: "int", value });
const at = (element: string) => `${A}/${element}`;
const set = (target: string, values: object) => ({ type: "set", changes: [{ target, values }] });
const region = (id: string, start: object, end: object) => ({
  id,
  name: "A",
  start,
  end,
  meta: {},
});
const addRegion = (into: string, value: object) => ({ type: "add", into: at(into), region: value });

/** The manifest of block `A`, a group or bundle file. */
function file(view: View, id = A): GroupFile {
  return block(view, id).manifest as GroupFile;
}

/** A view of `group_number_types.json` in block `A` with `region_1` (2 to 4 ♩) in `score`. */
function numbersWithRegion(): View {
  return changed(
    viewOf([A, NUMBERS]),
    addRegion("score", region("region_1", quarters(2), quarters(4))),
  );
}

function rejected(view: View, command: object) {
  return refusal(apply(deepFreeze(view), command));
}

describe("the file kind", () => {
  it.each([
    ["bare.json", "timeline", ["bare"]],
    [GROUP, "group", ["piece", "recording"]],
    [BUNDLE, "bundle", ["annotations", "page", "performance", "recording", "score"]],
  ] as const)("%s is a %s file", (name, kind, roots) => {
    const manifest = loadFile(name);
    expect(manifestKind(manifest)).toBe(kind);
    expect(manifestRoots(manifest).map((root) => root.id)).toEqual(roots);
  });
});

describe("blocks of every kind", () => {
  it("take their kind from the manifest", () => {
    const view = viewOf([A, GROUP], [B, BUNDLE]);
    expect([block(view, A).blockKind, block(view, B).blockKind]).toEqual(["group", "bundle"]);
    expect(rejected(view, set(A, { manifest: load("bare.json") }))).toEqual({
      code: "block_kind_mismatch",
      path: [A, "manifest"],
    });
  });

  it("refuse a kind that does not describe the manifest", () => {
    const view = viewOf([A, GROUP]);
    const wrong = { ...view, blocks: { [A]: { ...block(view), blockKind: "timeline" as const } } };
    expect(checkWorkspace(wrong).map(({ code, path }) => ({ code, path }))).toEqual([
      { code: "block_kind_mismatch", path: ["blocks", A, "blockKind"] },
    ]);
  });

  it("are written and read back by the workspace file", () => {
    const store = createStore({ view: createView(), journal: [] }, { clock: testClock() });
    for (const command of [addBlock(A, "bare.json"), addBlock(B, GROUP), addBlock(C, BUNDLE)]) {
      expect(store.dispatch(command)).toBeNull();
    }
    const workspace = { view: store.view, journal: store.journal };
    const text = writeWorkspace(workspace);
    const read = readWorkspace(text);
    expect(read).toEqual(workspace);
    if (!isLoadError(read)) {
      expect(read.view.meta).toEqual({ format: "tilie-workspace", version: 1 });
      expect(writeWorkspace(read)).toBe(text);
    }
  });
});

describe("invariants root by root", () => {
  it("refuses an unlocked child below timelines/<index>", () => {
    const fixture = loadFile(GROUP);
    const value = parse(dumps(fixture)) as unknown as {
      timelines: { children: Record<string, { timeline: { locked: boolean } }> }[];
    };
    const child = value.timelines[0]?.children["second-half"]?.timeline;
    if (child === undefined) throw new Error("second-half is missing");
    child.locked = false;
    const result = loadManifest(dumps(value as never));
    expect(
      isLoadError(result) ? result.problems.map(({ code, path }) => ({ code, path })) : result,
    ).toEqual([
      {
        code: "child_not_locked",
        path: ["timelines", 0, "children", "second-half", "timeline", "locked"],
      },
    ]);
  });
});

describe("the elements of a group file", () => {
  const manifest = loadFile(GROUP);
  const keys = manifestElements(manifest);
  const ancestry = timelineAncestry(manifest);

  it("follow the tree of frames, ancestors and members", () => {
    const piece = ["piece", "logical", "continuous", CLT];
    const half = ["second-half", "logical", "continuous", CLT];
    const recording = ["recording", "physical", "continuous", CPT];
    const none = [null, null, null, null];
    const frame = ["block", "group"];
    const line = [...frame, "timeline"];
    const ancestor = [...line, "ancestor"];
    expect(
      keys.map((key) => [
        key.type,
        key.address,
        key.timeline,
        key.domain,
        key.modality,
        key.class,
        key.inside,
      ]),
    ).toEqual([
      ["block", null, ...none, []],
      ["group", "group_1", ...none, ["block"]],
      ["name", "group_1/name", ...none, frame],
      ["card", "second-half/card", ...half, frame],
      ["ancestor", "piece", ...piece, line],
      ["name", "piece/name", ...piece, ancestor],
      ["wedge", "second-half/start", ...half, ancestor],
      ["label", "second-half/start/label", ...half, [...ancestor, "wedge"]],
      ["wedge", "second-half/end", ...half, ancestor],
      ["label", "second-half/end/label", ...half, [...ancestor, "wedge"]],
      ["timeline", "second-half", ...half, frame],
      ["name", "second-half/name", ...half, line],
      ["wedge", "second-half/start", ...half, line],
      ["label", "second-half/start/label", ...half, [...line, "wedge"]],
      ["wedge", "second-half/end", ...half, line],
      ["label", "second-half/end/label", ...half, [...line, "wedge"]],
      ["card", "recording/card", ...recording, frame],
      ["timeline", "recording", ...recording, frame],
      ["name", "recording/name", ...recording, line],
      ["wedge", "recording/start", ...recording, line],
      ["label", "recording/start/label", ...recording, [...line, "wedge"]],
      ["wedge", "recording/end", ...recording, line],
      ["label", "recording/end/label", ...recording, [...line, "wedge"]],
    ]);
  });

  it("are matched by within, element and inside", () => {
    const matching = (select: object) =>
      keys.filter((key) => selectorMatches(select, key, ancestry));
    const matched = (select: object) => matching(select).map((key) => key.address);
    const marks = [
      "second-half/start",
      "second-half/start/label",
      "second-half/end",
      "second-half/end/label",
    ];
    expect(matched({ within: "piece" })).toEqual([
      "second-half/card",
      "piece",
      "piece/name",
      ...marks,
      "second-half",
      "second-half/name",
      ...marks,
    ]);
    expect(matched({ element: "group" })).toEqual(["group_1"]);
    expect(matched({ element: "card" })).toEqual(["second-half/card", "recording/card"]);
    expect(
      matching({ inside: "ancestor" }).map((key) => [key.address, key.inside.join(" ")]),
    ).toEqual([
      ["piece/name", "block group timeline ancestor"],
      ["second-half/start", "block group timeline ancestor"],
      ["second-half/start/label", "block group timeline ancestor wedge"],
      ["second-half/end", "block group timeline ancestor"],
      ["second-half/end/label", "block group timeline ancestor wedge"],
    ]);
    expect(matched({ element: "wedge", inside: "ancestor" })).toEqual([
      "second-half/start",
      "second-half/end",
    ]);
    expect(matched({ element: "name", inside: "ancestor" })).toEqual(["piece/name"]);
    expect(matched({ inside: "group" })).toEqual(keys.slice(2).map((key) => key.address));
  });
});

describe("the elements of a bundle file", () => {
  const manifest = loadFile(BUNDLE);
  const drawn = (id: string) => [
    id,
    `${id}/name`,
    `${id}/start`,
    `${id}/start/label`,
    `${id}/end`,
    `${id}/end/label`,
  ];

  it("list the bundle's title, the frames and the ungrouped roots", () => {
    const keys = manifestElements(manifest);
    expect(keys.map((key) => key.address)).toEqual([
      null,
      "bundle_1/name",
      "group_1",
      "group_1/name",
      "score/card",
      ...drawn("score"),
      "performance/card",
      ...drawn("performance"),
      "group_2",
      "group_2/name",
      "page/card",
      ...drawn("page"),
      "excerpt/card",
      "recording",
      "recording/name",
      "excerpt/start",
      "excerpt/start/label",
      "excerpt/end",
      "excerpt/end/label",
      ...drawn("excerpt"),
      "annotations/card",
      ...drawn("annotations"),
    ]);
    const inside = (address: string) =>
      keys.filter((key) => key.address === address).map((key) => key.inside);
    expect(keys.find((key) => key.address === "recording")?.type).toBe("ancestor");
    expect([
      inside("bundle_1/name"),
      inside("annotations/card"),
      inside("annotations"),
      inside("annotations/name"),
    ]).toEqual([[["block"]], [["block"]], [["block"]], [["block", "timeline"]]]);
  });

  it("draw members in display order with their ancestors", () => {
    const { frames, ungrouped } = memberDrawings(manifest);
    const recording = (manifest as BundleFile).timelines[3];
    expect(
      frames.map((frame) => [
        frame.group.id,
        frame.members.map((member) => [
          member.timeline.id,
          member.root,
          member.ancestors.map((ancestor) => [ancestor.timeline.id, ancestor.offset]),
        ]),
      ]),
    ).toEqual([
      [
        "group_1",
        [
          ["score", "score", []],
          ["performance", "performance", []],
        ],
      ],
      [
        "group_2",
        [
          ["page", "page", []],
          ["excerpt", "recording", [["recording", recording?.children.excerpt?.offset]]],
        ],
      ],
    ]);
    expect(ungrouped.map((member) => member.timeline.id)).toEqual(["annotations"]);
  });
});

describe("addresses in a group block", () => {
  it("qualify every element but timelines, groups and the bundle by its root", () => {
    const view = numbersWithRegion();
    expect(file(view).timelines[2]?.regions).toEqual([
      region("region_1", quarters(2), quarters(4)),
    ]);
    expect([...manifestIds(file(view))].sort()).toEqual([
      "group_1",
      "page",
      "performance",
      "score",
      "score/region_1",
    ]);
  });

  it.each([
    ["score/region_1/label", "score/region_1"],
    ["score/end/label", "score"],
    ["score/start", "score"],
    ["score/card", "score"],
    ["group_1/name", "group_1"],
  ])("%s is a part of %s", (path, element) => {
    expect(elementOf(file(numbersWithRegion()), path)).toBe(element);
  });

  it("never reads score/start as an element: a part word is no id", () => {
    const view = numbersWithRegion();
    expect(rejected(view, addRegion("score", region("start", quarters(0), quarters(1))))).toEqual({
      code: "schema_violation",
      path: [A, "manifest", "timelines", 2, "regions", 0, "id"],
    });
    expect(rejected(view, addRegion("score", region("card", quarters(0), quarters(1))))).toEqual({
      code: "schema_violation",
      path: [A, "manifest", "timelines", 2, "regions", 0, "id"],
    });
    expect(rejected(view, set(at("score/start"), { name: "x" }))).toEqual({
      code: "unknown_target",
      path: [at("score/start")],
    });
  });

  it.each(["region_1", "page/region_1", "group_1", "score/region_1/x"])(
    "refuses %s as no target",
    (element) => {
      expect(rejected(numbersWithRegion(), set(at(element), { name: "x" }))).toEqual({
        code: "unknown_target",
        path: [at(element)],
      });
    },
  );
});

describe("commands in group and bundle blocks", () => {
  it("set a timeline at any depth and an element of a root's tree", () => {
    const group = viewOf([A, GROUP]);
    const late = file(changed(group, set(at("second-half"), { name: "Late" })));
    const before = file(group);
    expect(late.timelines[0]?.children["second-half"]?.timeline).toEqual({
      ...before.timelines[0]?.children["second-half"]?.timeline,
      name: "Late",
    });
    expect(late.timelines[1]).toEqual(before.timelines[1]);
    const named = file(changed(numbersWithRegion(), set(at("score/region_1"), { name: "Intro" })));
    expect(named.timelines[2]?.regions).toEqual([
      { ...region("region_1", quarters(2), quarters(4)), name: "Intro" },
    ]);
  });

  it("add a child into a root of the file", () => {
    const child = {
      offset: quarters(0),
      timeline: { ...load("bare.json").timeline, id: "clt_1", locked: true },
    };
    const view = changed(viewOf([A, NUMBERS]), { type: "add", into: at("score"), child });
    expect(file(view).timelines[2]?.children).toEqual({ clt_1: child });
  });

  it("scope duplicate ids as the file scopes them", () => {
    const view = numbersWithRegion();
    const child = {
      offset: quarters(0),
      timeline: { ...load("bare.json").timeline, id: "page", locked: true },
    };
    expect(rejected(view, { type: "add", into: at("score"), child })).toEqual({
      code: "duplicate_id",
      path: [at("page")],
    });
    expect(
      rejected(view, addRegion("score", region("region_1", quarters(5), quarters(6)))),
    ).toEqual({ code: "duplicate_id", path: [at("score/region_1")] });
    const page = changed(view, addRegion("page", region("region_1", pixels(2), pixels(4))));
    expect(file(page).timelines[0]?.regions).toEqual([region("region_1", pixels(2), pixels(4))]);
  });

  it("refuse to remove a timeline and remove an element", () => {
    for (const [fixture, timeline] of [
      [NUMBERS, "score"],
      [GROUP, "second-half"],
    ] as const) {
      expect(rejected(viewOf([A, fixture]), { type: "remove", targets: [at(timeline)] })).toEqual({
        code: "unsupported_target",
        path: [at(timeline)],
      });
    }
    const removed = changed(numbersWithRegion(), {
      type: "remove",
      targets: [at("score/region_1")],
    });
    expect(file(removed).timelines[2]?.regions).toEqual([]);
  });

  it("style the file's graphical block, keeping its order", () => {
    const styled = changed(viewOf([A, STYLED]), {
      type: "style",
      select: { element: "ancestor" },
      set: { opacity: 0.5 },
      blocks: [A],
    });
    expect(file(styled).graphical).toEqual({
      order: ["score", "page", "performance"],
      styles: { "frame-highlight": { stroke: "#7F00FF" } },
      statements: [
        { select: { element: "group" }, set: "frame-highlight" },
        { select: { element: "name", ids: ["group_1/name"] }, set: { fill: "#7F00FF" } },
        { select: { element: "card", inside: "group" }, set: { rx: 2, shadow: "#C4B5FD" } },
        { select: { element: "ancestor" }, set: { opacity: 0.5 } },
      ],
    });
  });

  it("style every group and bundle block holding a frame", () => {
    const view = viewOf([A, NUMBERS], [B, BUNDLE], [C, "bare.json"]);
    const styled = changed(view, {
      type: "style",
      select: { element: "group" },
      set: { stroke: "#C00000" },
    });
    const statement = { select: { element: "group" }, set: { stroke: "#C00000" } };
    expect(block(styled, A).manifest.graphical).toEqual({
      ...file(view).graphical,
      styles: {},
      statements: [statement],
    });
    expect((block(styled, B).manifest as Manifest).graphical).toEqual({
      ...block(view, B).manifest.graphical,
      styles: {},
      statements: [statement],
    });
    expect(block(styled, C)).toBe(block(view, C));
  });
});

describe("what can be removed", () => {
  const ROOT = { code: "not_removable", message: "root cannot be removed" };
  const TIMELINE = {
    code: "unsupported_target",
    message: "removing a timeline from a group or bundle file is not supported yet",
  };
  const NOTHING = { code: "unknown_target" };
  const cases: [string, () => View, [string, boolean, object | null][]][] = [
    [
      "nested",
      () => viewOf([A, "nested.json"]),
      [
        ["clt_1", false, ROOT],
        ["clt_3", true, null],
        ["clt_2", true, null],
        ["nobody", true, NOTHING],
      ],
    ],
    [
      "group_child_member",
      () => viewOf([A, GROUP]),
      [
        ["piece", false, TIMELINE],
        ["second-half", false, TIMELINE],
        ["recording", false, TIMELINE],
        ["group_1", false, NOTHING],
        ["nobody", true, NOTHING],
      ],
    ],
    [
      "numbers",
      numbersWithRegion,
      [
        ["score", false, TIMELINE],
        ["page", false, TIMELINE],
        ["performance", false, TIMELINE],
        ["group_1", false, NOTHING],
        ["score/region_1", true, null],
        ["nobody", true, NOTHING],
      ],
    ],
    [
      "bundle_mixed",
      () => viewOf([A, BUNDLE]),
      [
        ["annotations", false, TIMELINE],
        ["page", false, TIMELINE],
        ["performance", false, TIMELINE],
        ["recording", false, TIMELINE],
        ["excerpt", false, TIMELINE],
        ["score", false, TIMELINE],
        ["bundle_1", false, NOTHING],
        ["group_1", false, NOTHING],
        ["group_2", false, NOTHING],
        ["nobody", true, NOTHING],
      ],
    ],
  ];

  it.each(cases)("in %s is exactly what remove does not refuse by kind", (_, build, expected) => {
    const view = build();
    const { manifest } = block(view);
    const removable = isRemovableIn(manifest);
    for (const [element, answer, refused] of expected) {
      expect([element, isRemovable(manifest, element)]).toEqual([element, answer]);
      expect([element, removable(element)]).toEqual([element, answer]);
      const result = apply(deepFreeze(view), { type: "remove", targets: [at(element)] });
      if (refused === null) {
        expect([element, isCommandError(result)]).toEqual([element, false]);
      } else {
        const message = "message" in refused ? refused.message : `${at(element)} names nothing`;
        expect(result).toEqual({ ...refused, message, path: [at(element)] });
      }
    }
  });

  it("has a precomputed elementOf giving elementOf's answers", () => {
    const { manifest } = block(numbersWithRegion());
    const element = elementOfIn(manifest);
    for (const path of [
      "score/region_1/label",
      "score/end/label",
      "score/start",
      "score/card",
      "group_1/name",
    ]) {
      expect(element(path)).toBe(elementOf(manifest, path));
    }
  });
});

describe("ids for new elements of a group block", () => {
  it("are unique within the tree, timelines across the file", () => {
    let view = numbersWithRegion();
    expect(nextId(view, A, "region", "score")).toBe("region_2");
    expect(nextId(view, A, "region", "page")).toBe("region_1");
    expect(nextId(view, A, "region")).toBe("region_2");
    view = changed(view, addRegion("page", region("clt_1", pixels(2), pixels(4))));
    expect(nextId(view, A, "clt", "score")).toBe("clt_1");
    expect(nextId(view, A, "clt", "page")).toBe("clt_2");
    const child = {
      offset: quarters(0),
      timeline: { ...load("bare.json").timeline, id: "clt_1", locked: true },
    };
    view = changed(view, { type: "add", into: at("score"), child });
    expect(nextId(view, A, "clt", "page")).toBe("clt_2");
    expect(nextId(view, A, "clt", "performance")).toBe("clt_2");
    expect(nextId(view, A, "group")).toBe("group_2");
  });
});
