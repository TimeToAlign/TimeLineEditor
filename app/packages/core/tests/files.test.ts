import { dumps, JsonFloat } from "@timetoalign/timeskeleton";
import { describe, expect, it } from "vitest";
import { apply } from "../src/commands/apply.ts";
import { isLoadError } from "../src/errors.ts";
import { manifestElements, selectorMatches, timelineAncestry } from "../src/manifest/elements.ts";
import { memberDrawings } from "../src/manifest/files.ts";
import { loadManifest } from "../src/manifest/io.ts";
import { removedBy } from "../src/manifest/remove.ts";
import { findTimeline } from "../src/manifest/tree.ts";
import type { Manifest } from "../src/manifest/types.ts";
import { elementOf, resolveElement } from "../src/workspace/address.ts";
import { readWorkspace, writeWorkspace } from "../src/workspace/file.ts";
import { manifestIds, nextId } from "../src/workspace/ids.ts";
import { createStore } from "../src/workspace/store.ts";
import type { View } from "../src/workspace/view.ts";
import { createView } from "../src/workspace/view.ts";
import {
  A,
  addBlock,
  B,
  block,
  C,
  changed,
  deepFreeze,
  load,
  loadText,
  manifestValue,
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

/** Bare values on a `fraction` and on an `int` axis. */
const quarters = (numerator: number) => [numerator, 1];
const pixels = (value: number) => value;
const at = (element: string) => `${A}/${element}`;
const set = (target: string, values: object) => ({ type: "set", changes: [{ target, values }] });
const region = (id: string, start: unknown, end: unknown) => ({
  id,
  name: "A",
  start,
  end,
  meta: {},
});
const addRegion = (into: string, value: object) => ({ type: "add", into: at(into), region: value });

/** The manifest of block `A`. */
function file(view: View, id = A): Manifest {
  return block(view, id).manifest;
}

/** A child timeline given to `add`: bare's root under another id, locked, at 0. */
const childOf = (id: string) => ({
  ...load("bare.json").timelines[0],
  id,
  offset: quarters(0),
  locked: true,
});

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

describe("blocks hold any manifest", () => {
  it("are written and read back by the workspace file", () => {
    const store = createStore(
      { view: createView(), journal: [], sessions: {} },
      { clock: testClock() },
    );
    for (const command of [addBlock(A, "bare.json"), addBlock(B, GROUP), addBlock(C, BUNDLE)]) {
      expect(store.dispatch(command)).toBeNull();
    }
    const workspace = store.snapshot();
    const text = writeWorkspace(workspace);
    const read = readWorkspace(text);
    expect(read).toEqual(workspace);
    if (!isLoadError(read)) {
      expect(read.view.meta).toEqual({ format: "tilie-workspace", version: 4 });
      expect(writeWorkspace(read)).toBe(text);
    }
  });
});

describe("invariants root by root", () => {
  it("refuses a child of another unit below timelines/<index>", () => {
    const value = manifestValue(GROUP) as { timelines: { children: object[] }[] };
    const child = value.timelines[0]?.children[0];
    if (child === undefined) throw new Error("second-half is missing");
    Object.assign(child, { unit: "seconds", number_type: "float", length: new JsonFloat(8) });
    const result = loadManifest(dumps(value));
    expect(isLoadError(result) ? result.problems : result).toEqual([
      {
        code: "schema_violation",
        message: "child 'second-half' has unit 'seconds', its parent 'piece' has 'quarters'",
        path: ["timelines", 0, "children", 0, "unit"],
      },
    ]);
  });
});

describe("the elements of a group manifest", () => {
  const manifest = load(GROUP);
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
    const marker = [...line, "band"];
    const band = (timeline: string, kind: string) => [
      "band",
      `${timeline}/${kind}_1`,
      timeline,
      null,
      null,
      kind,
      line,
    ];
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
      band("second-half", "children"),
      band("second-half", "conversion_maps"),
      band("second-half", "markers"),
      ["wedge", "second-half/start", ...half, marker],
      ["label", "second-half/start/label", ...half, [...marker, "wedge"]],
      ["wedge", "second-half/end", ...half, marker],
      ["label", "second-half/end/label", ...half, [...marker, "wedge"]],
      band("second-half", "regions"),
      band("second-half", "flow_control"),
      ["card", "recording/card", ...recording, frame],
      ["timeline", "recording", ...recording, frame],
      ["name", "recording/name", ...recording, line],
      band("recording", "children"),
      band("recording", "conversion_maps"),
      band("recording", "markers"),
      ["wedge", "recording/start", ...recording, marker],
      ["label", "recording/start/label", ...recording, [...marker, "wedge"]],
      ["wedge", "recording/end", ...recording, marker],
      ["label", "recording/end/label", ...recording, [...marker, "wedge"]],
      band("recording", "regions"),
      band("recording", "flow_control"),
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
      "second-half/children_1",
      "second-half/conversion_maps_1",
      "second-half/markers_1",
      ...marks,
      "second-half/regions_1",
      "second-half/flow_control_1",
    ]);
    expect(matched({ within: "piece" }).length).toBe(18);
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

describe("the elements of a named manifest with two groups", () => {
  const manifest = load(BUNDLE);
  /**
   * A line drawn as a root: its name, then its five bands, each followed by
   * what it holds (none of these lines draws a child): `maps`, its wedges,
   * `regions` and `flow`.
   */
  const drawn = (
    id: string,
    { maps = [], regions = [], flow = [] }: { [band: string]: string[] } = {},
  ) => [
    id,
    `${id}/name`,
    `${id}/children_1`,
    `${id}/conversion_maps_1`,
    ...maps,
    `${id}/markers_1`,
    `${id}/start`,
    `${id}/start/label`,
    `${id}/end`,
    `${id}/end/label`,
    `${id}/regions_1`,
    ...regions,
    `${id}/flow_control_1`,
    ...flow,
  ];

  it("list the title, the frames and the ungrouped roots", () => {
    const keys = manifestElements(manifest);
    expect(keys.map((key) => key.address)).toEqual([
      null,
      "name",
      "group_1",
      "group_1/name",
      "score/card",
      ...drawn("score", {
        maps: ["score/cmap_1", "score/cmap_2"],
        flow: ["score/jump_1", "score/jump_1/label"],
      }),
      "performance/card",
      ...drawn("performance", { maps: ["performance/cmap_1"] }),
      "group_2",
      "group_2/name",
      "page/card",
      ...drawn("page", { maps: ["page/cmap_1"] }),
      "excerpt/card",
      "recording",
      "recording/name",
      "excerpt/start",
      "excerpt/start/label",
      "excerpt/end",
      "excerpt/end/label",
      ...drawn("excerpt", { maps: ["recording/cmap_2"] }),
      "annotations/card",
      ...drawn("annotations", {
        regions: [
          "annotations/region_1",
          "annotations/region_1/label",
          "annotations/region_2",
          "annotations/region_2/label",
        ],
      }),
    ]);
    const inside = (address: string) =>
      keys.filter((key) => key.address === address).map((key) => key.inside);
    expect(keys.find((key) => key.address === "recording")?.type).toBe("ancestor");
    expect([
      inside("name"),
      inside("annotations/card"),
      inside("annotations"),
      inside("annotations/name"),
    ]).toEqual([[["block"]], [["block"]], [["block"]], [["block", "timeline"]]]);
  });

  it("draw members in display order with their ancestors", () => {
    const { frames, ungrouped } = memberDrawings(manifest);
    const recording = manifest.timelines[3];
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
          ["excerpt", "recording", [["recording", recording?.children[0]?.offset]]],
        ],
      ],
    ]);
    expect(ungrouped.map((member) => member.timeline.id)).toEqual(["annotations"]);
  });
});

describe("addresses in a one-root block", () => {
  const view = viewOf([A, "map.json"]);

  it("name timelines by their ids and every other element below its root", () => {
    expect([...manifestIds(file(view))].sort()).toEqual([
      "melody",
      "melody/tempo",
      "melody/ticks",
      "phrase",
    ]);
  });

  it.each([
    ["melody/ticks", "melody/ticks"],
    ["phrase/name", "phrase"],
    ["melody/end/label", "melody"],
    ["melody/card", "melody"],
    ["name", "name"],
  ])("%s is a part of %s", (path, element) => {
    expect(elementOf(file(view), path)).toBe(element);
  });

  it("reach a map of a child through the root", () => {
    const payload = { ...(file(view).timelines[0]?.children[0]?.conversion_maps[0] ?? {}) };
    const changedMap = changed(view, set(at("melody/ticks"), { map: { ...payload, scalar: 960 } }));
    expect(file(changedMap).timelines[0]?.children[0]?.conversion_maps[0]).toEqual({
      ...payload,
      scalar: 960,
    });
    for (const element of ["ticks", "phrase/ticks"]) {
      expect(rejected(view, set(at(element), { name: "x" }))).toEqual({
        code: "unknown_target",
        path: [at(element)],
      });
    }
  });
});

describe("addresses in a block of several roots", () => {
  it("qualify every element but timelines and groups by its root", () => {
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

  it.each(["region_1", "page/region_1", "score/region_1/x"])(
    "refuses %s as no target",
    (element) => {
      expect(rejected(numbersWithRegion(), set(at(element), { name: "x" }))).toEqual({
        code: "unknown_target",
        path: [at(element)],
      });
    },
  );

  it("finds a group, which sets no length", () => {
    expect(rejected(numbersWithRegion(), set(at("group_1"), { length: 4 }))).toEqual({
      code: "wrong_target_kind",
      path: [at("group_1"), "length"],
    });
  });

  it("finds a timeline by its id in every root's tree, and nothing else", () => {
    const manifest = load(BUNDLE);
    expect(findTimeline(manifest, "annotations")).toBe(manifest.timelines[0]);
    expect(findTimeline(manifest, "excerpt")).toBe(manifest.timelines[3]?.children[0]);
    for (const id of ["group_1", "name", "recording/excerpt", "nothing"]) {
      expect(findTimeline(manifest, id)).toBeUndefined();
    }
  });

  it("finds a map, region or flow-control element by its address, and nothing else", () => {
    const findEntry = (manifest: Manifest, address: string) => {
      const found = resolveElement(manifest, address);
      return found?.kind === "entry" ? { kind: found.entry, entry: found.element } : undefined;
    };
    const maps = load("map.json");
    const melody = maps.timelines[0];
    expect(findEntry(maps, "melody/tempo")?.kind).toBe("map");
    expect(findEntry(maps, "melody/tempo")?.entry).toBe(melody?.conversion_maps[0]);
    expect(findEntry(maps, "melody/ticks")?.kind).toBe("map");
    expect(findEntry(maps, "melody/ticks")?.entry).toBe(melody?.children[0]?.conversion_maps[0]);
    const flow = load("flow_control.json");
    const control = flow.timelines[0]?.flow_control ?? [];
    for (const id of ["break_1", "jump_1", "marker_1"]) {
      const found = findEntry(flow, `flow:quarters/${id}`);
      expect(found?.kind).toBe("flow_control");
      expect(found?.entry).toBe(control.find((item) => item.id === id));
    }
    const numbers = file(numbersWithRegion());
    expect(findEntry(numbers, "score/region_1")?.kind).toBe("region");
    expect(findEntry(numbers, "score/region_1")?.entry).toBe(numbers.timelines[2]?.regions[0]);
    for (const address of [
      "score",
      "group_1",
      "name",
      "region_1",
      "page/region_1",
      "score/region_1/label",
      "score/nothing",
    ]) {
      expect(findEntry(numbers, address)).toBeUndefined();
    }
  });
});

describe("commands in blocks of several roots", () => {
  it("set a timeline at any depth and an element of a root's tree", () => {
    const group = viewOf([A, GROUP]);
    const late = file(changed(group, set(at("second-half"), { name: "Late" })));
    const before = file(group);
    expect(late.timelines[0]?.children[0]).toEqual({
      ...before.timelines[0]?.children[0],
      name: "Late",
    });
    expect(late.timelines[1]).toEqual(before.timelines[1]);
    const named = file(changed(numbersWithRegion(), set(at("score/region_1"), { name: "Intro" })));
    expect(named.timelines[2]?.regions).toEqual([
      { ...region("region_1", quarters(2), quarters(4)), name: "Intro" },
    ]);
  });

  it("add a child into a root of the manifest", () => {
    const view = changed(viewOf([A, NUMBERS]), {
      type: "add",
      into: at("score"),
      child: childOf("clt_1"),
    });
    expect(file(view).timelines[2]?.children).toEqual([{ ...childOf("clt_1"), name: "Bare" }]);
  });

  it("scope duplicate ids as the manifest scopes them", () => {
    const view = numbersWithRegion();
    expect(rejected(view, { type: "add", into: at("score"), child: childOf("page") })).toEqual({
      code: "duplicate_id",
      path: [at("page")],
    });
    expect(
      rejected(view, addRegion("score", region("region_1", quarters(5), quarters(6)))),
    ).toEqual({ code: "duplicate_id", path: [at("score/region_1")] });
    const page = changed(view, addRegion("page", region("region_1", pixels(2), pixels(4))));
    expect(file(page).timelines[0]?.regions).toEqual([region("region_1", pixels(2), pixels(4))]);
  });

  it("style the manifest's graphical block, keeping its order", () => {
    const styled = changed(viewOf([A, STYLED]), {
      type: "style",
      select: { element: "ancestor" },
      set: { opacity: 0.5 },
      blocks: [A],
    });
    expect(file(styled).graphical).toEqual({
      order: { group_1: ["score", "page", "performance"] },
      styles: { "frame-highlight": { stroke: "#7F00FF" } },
      statements: [
        { select: { element: "group" }, set: "frame-highlight" },
        { select: { element: "name", ids: ["group_1/name"] }, set: { fill: "#7F00FF" } },
        { select: { element: "card", inside: "group" }, set: { rx: 2, shadow: "#C4B5FD" } },
        { select: { element: "ancestor" }, set: { opacity: 0.5 } },
      ],
    });
  });

  it("style every block holding a group", () => {
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
    expect(block(styled, B).manifest.graphical).toEqual({
      ...block(view, B).manifest.graphical,
      styles: {},
      statements: [statement],
    });
    expect(block(styled, C)).toBe(block(view, C));
  });
});

describe("delete deletes", () => {
  const remove = (view: View, ...targets: string[]) =>
    file(changed(deepFreeze(view), { type: "remove", targets: targets.map(at) }));
  const ids = (manifest: Manifest) => manifest.timelines.map((timeline) => timeline.id);

  it("removes a subtree and its ids from every group and order", () => {
    const view = viewOf([A, BUNDLE]);
    const before = file(view);
    const after = remove(view, "recording");
    expect(ids(after)).toEqual(["annotations", "page", "performance", "score"]);
    expect(after.groups).toEqual([before.groups[0], { ...before.groups[1], members: ["page"] }]);
    expect(after.graphical?.order).toEqual({
      group_1: ["score", "performance"],
      group_2: ["page"],
    });
    expect(removedBy(before, ["recording"])).toEqual(
      new Set(["recording", "excerpt", "recording/cmap_1", "recording/cmap_2"]),
    );
  });

  it("removes a child from its parent and its group", () => {
    const after = remove(viewOf([A, GROUP]), "second-half");
    expect(after.timelines[0]?.children).toEqual([]);
    expect(after.groups[0]?.members).toEqual(["recording"]);
    expect(after.graphical?.order).toEqual({ group_1: ["recording"] });
  });

  it("removes no map of another timeline: a map belongs to its timeline only", () => {
    const warp = {
      type: "TableMap",
      id: "warp",
      source_unit: "quarters",
      target_unit: "seconds",
      x_values: [0, 12],
      y_values: [0, 12.5],
    };
    const view = changed(viewOf([A, NUMBERS]), { type: "add", into: at("score"), map: warp });
    const stored = { ...warp, name: null, kind: "linear", extrapolate: "none" };
    expect(file(view).timelines[2]?.conversion_maps).toEqual([stored]);
    expect(removedBy(file(view), ["performance"])).toEqual(new Set(["performance"]));
    expect(remove(view, "performance").timelines[1]?.conversion_maps).toEqual([stored]);
  });

  it("removes a measure map alone", () => {
    const bars = { id: "bars", rows: [{ count: 1, qstamp: [0, 1] }] };
    const view = changed(viewOf([A, NUMBERS]), { type: "add", into: A, measure_map: bars });
    expect(file(view).measure_maps).toEqual([{ ...bars, name: null, meta: {} }]);
    expect(removedBy(file(view), ["bars"])).toEqual(new Set(["bars"]));
    const after = remove(view, "bars");
    expect(after.measure_maps).toEqual([]);
    expect(after.timelines).toEqual(file(view).timelines);
  });

  it("removes the ids entries addressing a removed element, and a statement left without", () => {
    const styled = [
      { select: { ids: ["page", "score/card"] }, set: { opacity: 0.5 } },
      { select: { ids: ["page/name"] }, set: { opacity: 0.4 } },
    ].reduce(
      (view, { select, set: properties }) =>
        changed(view, { type: "style", select, set: properties, blocks: [A] }),
      viewOf([A, STYLED]),
    );
    const own = file(viewOf([A, STYLED])).graphical?.statements ?? [];
    expect(remove(styled, "page").graphical?.statements).toEqual([
      ...own,
      { select: { ids: ["score/card"] }, set: { opacity: 0.5 } },
    ]);
  });

  it("keeps a group left without members and leaves no root", () => {
    const after = remove(viewOf([A, NUMBERS]), "page", "performance", "score");
    expect(after.timelines).toEqual([]);
    expect(after.groups).toEqual([{ id: "group_1", name: "Edition", meta: {}, members: [] }]);
    expect(after.graphical?.order).toEqual({ group_1: [] });
  });

  it("removes a group only, its members staying as ungrouped roots", () => {
    const view = viewOf([A, BUNDLE]);
    const before = file(view);
    const after = remove(view, "group_1");
    expect(after.timelines).toEqual(before.timelines);
    expect(after.groups).toEqual([before.groups[1]]);
    expect(after.graphical?.order).toEqual({ group_2: ["page", "excerpt"] });
    expect(memberDrawings(after).ungrouped.map((member) => member.timeline.id)).toEqual([
      "annotations",
      "performance",
      "score",
    ]);
  });

  it("does not refuse a target that goes with another", () => {
    const view = viewOf([A, BUNDLE]);
    expect(remove(view, "recording", "excerpt")).toEqual(remove(view, "recording"));
  });
});

describe("ids for new elements of a block of several roots", () => {
  it("are unique within the tree, timelines, groups and the manifest across it", () => {
    let view = numbersWithRegion();
    expect(nextId(view, A, "region", "score")).toBe("region_2");
    expect(nextId(view, A, "region", "page")).toBe("region_1");
    expect(nextId(view, A, "region")).toBe("region_2");
    view = changed(view, addRegion("page", region("clt_1", pixels(2), pixels(4))));
    expect(nextId(view, A, "clt", "score")).toBe("clt_1");
    expect(nextId(view, A, "clt", "page")).toBe("clt_2");
    view = changed(view, { type: "add", into: at("score"), child: childOf("clt_1") });
    expect(nextId(view, A, "clt", "page")).toBe("clt_2");
    expect(nextId(view, A, "clt", "performance")).toBe("clt_2");
  });

  it("leave a group's id and the manifest's id to everything but a timeline", () => {
    const value = { ...manifestValue(BUNDLE), id: "edition" };
    const view = changed(createView(), {
      type: "add",
      into: "workspace",
      block: { id: A, manifest: loadText(dumps(value)), x: 0, y: 0 },
    });
    expect(nextId(view, A, "group", "score")).toBe("group_1");
    for (const id of ["group_1", "edition"]) {
      const added = changed(view, addRegion("score", region(id, quarters(2), quarters(4))));
      expect(file(added).timelines[4]?.regions.map((item) => item.id)).toEqual([id]);
      expect(rejected(view, { type: "add", into: at("score"), child: childOf(id) })).toEqual({
        code: "duplicate_id",
        path: [at(id)],
      });
    }
  });
});
