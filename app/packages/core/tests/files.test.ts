import { dumps, JsonFloat } from "@timetoalign/timetoshare";
import { describe, expect, it } from "vitest";
import { apply } from "../src/commands/apply.ts";
import { isLoadError } from "../src/errors.ts";
import type { ElementAddress, Facet, Part } from "../src/manifest/address.ts";
import { manifestElements, selectorMatches, timelineAncestry } from "../src/manifest/elements.ts";
import { memberDrawings } from "../src/manifest/files.ts";
import { loadManifest } from "../src/manifest/io.ts";
import { removedBy } from "../src/manifest/remove.ts";
import { findTimeline } from "../src/manifest/tree.ts";
import type { Manifest } from "../src/manifest/types.ts";
import type { Address } from "../src/workspace/address.ts";
import { manifestIds, resolveElement } from "../src/workspace/address.ts";
import { readWorkspace, writeWorkspace } from "../src/workspace/file.ts";
import { createStore } from "../src/workspace/store.ts";
import type { View } from "../src/workspace/view.ts";
import { createView } from "../src/workspace/view.ts";
import {
  A,
  addBlock,
  at,
  B,
  block,
  C,
  changed,
  deepFreeze,
  key,
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
const set = (target: Address, values: object) => ({ type: "set", changes: [{ target, values }] });
/** The element address of `value`, with the part words `part`. */
const id = (value: string, ...part: Part[]): ElementAddress =>
  part.length === 0 ? { id: value } : { id: value, part };
/** The address of the band drawing the facet `facet` of the timeline `timeline`. */
const bandOf = (timeline: string, facet: Facet): ElementAddress => ({ id: timeline, facet });
const region = (id: string, start: unknown, end: unknown) => ({
  id,
  name: "A",
  start,
  end,
  meta: {},
});
const addRegion = (into: string, value: object) => ({
  type: "add",
  into: at(into),
  region: value,
});

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
      expect(read.view.meta).toEqual({ format: "tilie-workspace", version: 5 });
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
    const none = [null, null, null, null, null];
    const frame = ["block", "frame"];
    const line = [...frame, "timeline"];
    const ancestor = [...line, "ancestor"];
    const marker = [...line, "band"];
    const band = (timeline: string, facet: Facet) => [
      "band",
      bandOf(timeline, facet),
      timeline,
      null,
      null,
      null,
      facet,
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
        key.facet,
        key.inside,
      ]),
    ).toEqual([
      ["block", {}, ...none, []],
      ["frame", id("group_1"), ...none, ["block"]],
      ["name", id("group_1", "name"), ...none, frame],
      ["card", id("second-half", "card"), ...half, null, frame],
      ["ancestor", id("piece"), ...piece, null, line],
      ["name", id("piece", "name"), ...piece, null, ancestor],
      ["wedge", id("second-half", "start"), ...half, null, ancestor],
      ["label", id("second-half", "start", "label"), ...half, null, [...ancestor, "wedge"]],
      ["wedge", id("second-half", "end"), ...half, null, ancestor],
      ["label", id("second-half", "end", "label"), ...half, null, [...ancestor, "wedge"]],
      ["timeline", id("second-half"), ...half, null, frame],
      ["name", id("second-half", "name"), ...half, null, line],
      band("second-half", "children"),
      band("second-half", "conversion_maps"),
      band("second-half", "markers"),
      ["wedge", id("second-half", "start"), ...half, null, marker],
      ["label", id("second-half", "start", "label"), ...half, null, [...marker, "wedge"]],
      ["wedge", id("second-half", "end"), ...half, null, marker],
      ["label", id("second-half", "end", "label"), ...half, null, [...marker, "wedge"]],
      band("second-half", "regions"),
      band("second-half", "flow_control"),
      ["card", id("recording", "card"), ...recording, null, frame],
      ["timeline", id("recording"), ...recording, null, frame],
      ["name", id("recording", "name"), ...recording, null, line],
      band("recording", "children"),
      band("recording", "conversion_maps"),
      band("recording", "markers"),
      ["wedge", id("recording", "start"), ...recording, null, marker],
      ["label", id("recording", "start", "label"), ...recording, null, [...marker, "wedge"]],
      ["wedge", id("recording", "end"), ...recording, null, marker],
      ["label", id("recording", "end", "label"), ...recording, null, [...marker, "wedge"]],
      band("recording", "regions"),
      band("recording", "flow_control"),
    ]);
  });

  it("are matched by within, element and inside", () => {
    const matching = (select: object) =>
      keys.filter((key) => selectorMatches(select, key, ancestry));
    const matched = (select: object) => matching(select).map((key) => key.address);
    const marks = [
      id("second-half", "start"),
      id("second-half", "start", "label"),
      id("second-half", "end"),
      id("second-half", "end", "label"),
    ];
    expect(matched({ within: "piece" })).toEqual([
      id("second-half", "card"),
      id("piece"),
      id("piece", "name"),
      ...marks,
      id("second-half"),
      id("second-half", "name"),
      bandOf("second-half", "children"),
      bandOf("second-half", "conversion_maps"),
      bandOf("second-half", "markers"),
      ...marks,
      bandOf("second-half", "regions"),
      bandOf("second-half", "flow_control"),
    ]);
    expect(matched({ within: "piece" }).length).toBe(18);
    expect(matched({ element: "frame" })).toEqual([id("group_1")]);
    expect(matched({ element: "card" })).toEqual([
      id("second-half", "card"),
      id("recording", "card"),
    ]);
    expect(
      matching({ inside: "ancestor" }).map((key) => [key.address, key.inside.join(" ")]),
    ).toEqual([
      [id("piece", "name"), "block frame timeline ancestor"],
      [id("second-half", "start"), "block frame timeline ancestor"],
      [id("second-half", "start", "label"), "block frame timeline ancestor wedge"],
      [id("second-half", "end"), "block frame timeline ancestor"],
      [id("second-half", "end", "label"), "block frame timeline ancestor wedge"],
    ]);
    expect(matched({ element: "wedge", inside: "ancestor" })).toEqual([
      id("second-half", "start"),
      id("second-half", "end"),
    ]);
    expect(matched({ element: "name", inside: "ancestor" })).toEqual([id("piece", "name")]);
    expect(matched({ inside: "frame" })).toEqual(keys.slice(2).map((key) => key.address));
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
    timeline: string,
    { maps = [], regions = [], flow = [] }: { [band: string]: ElementAddress[] } = {},
  ) => [
    id(timeline),
    id(timeline, "name"),
    bandOf(timeline, "children"),
    bandOf(timeline, "conversion_maps"),
    ...maps,
    bandOf(timeline, "markers"),
    id(timeline, "start"),
    id(timeline, "start", "label"),
    id(timeline, "end"),
    id(timeline, "end", "label"),
    bandOf(timeline, "regions"),
    ...regions,
    bandOf(timeline, "flow_control"),
    ...flow,
  ];

  it("list the title, the frames and the ungrouped roots", () => {
    const keys = manifestElements(manifest);
    expect(keys.map((key) => key.address)).toEqual([
      {},
      { part: ["name"] },
      id("group_1"),
      id("group_1", "name"),
      id("score", "card"),
      ...drawn("score", {
        maps: [id("cmap_1"), id("cmap_2")],
        flow: [id("jump_from_1"), id("jump_from_1", "label")],
      }),
      id("performance", "card"),
      ...drawn("performance", { maps: [id("cmap_3")] }),
      id("group_2"),
      id("group_2", "name"),
      id("page", "card"),
      ...drawn("page", { maps: [id("cmap_4")] }),
      id("excerpt", "card"),
      id("recording"),
      id("recording", "name"),
      id("excerpt", "start"),
      id("excerpt", "start", "label"),
      id("excerpt", "end"),
      id("excerpt", "end", "label"),
      ...drawn("excerpt", { maps: [id("cmap_6")] }),
      id("annotations", "card"),
      ...drawn("annotations", {
        regions: [id("region_1"), id("region_1", "label"), id("region_2"), id("region_2", "label")],
      }),
    ]);
    const same = (address: ElementAddress) => (item: { readonly address: ElementAddress }) =>
      JSON.stringify(item.address) === JSON.stringify(address);
    const inside = (address: ElementAddress) => keys.filter(same(address)).map((key) => key.inside);
    expect(keys.find(same(id("recording")))?.type).toBe("ancestor");
    expect(keys.some(same(id("cmap_5")))).toBe(false);
    expect([
      inside({ part: ["name"] }),
      inside(id("annotations", "card")),
      inside(id("annotations")),
      inside(id("annotations", "name")),
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
          member.ancestors.map((ancestor) => [ancestor.timeline.id, ancestor.offset]),
        ]),
      ]),
    ).toEqual([
      [
        "group_1",
        [
          ["score", []],
          ["performance", []],
        ],
      ],
      [
        "group_2",
        [
          ["page", []],
          ["excerpt", [["recording", recording?.children[0]?.offset]]],
        ],
      ],
    ]);
    expect(ungrouped.map((member) => member.timeline.id)).toEqual(["annotations"]);
  });
});

describe("addresses in a one-root block", () => {
  const view = viewOf([A, "map.json"]);

  it("hold every ID of the manifest once, whatever element carries it", () => {
    expect([...manifestIds(file(view))].sort()).toEqual(["melody", "phrase", "tempo", "ticks"]);
  });

  it("reach a map of a child by its ID alone, and never compose IDs", () => {
    const payload = { ...(file(view).timelines[0]?.children[0]?.conversion_maps[0] ?? {}) };
    const changedMap = changed(view, set(at("ticks"), { map: { ...payload, scalar: 960 } }));
    expect(file(changedMap).timelines[0]?.children[0]?.conversion_maps[0]).toEqual({
      ...payload,
      scalar: 960,
    });
    for (const element of ["melody/ticks", "phrase/ticks"]) {
      expect(rejected(view, set(at(element), { name: "x" }))).toEqual({
        code: "unknown_target",
        path: [key(at(element))],
      });
    }
  });
});

describe("addresses in a block of several roots", () => {
  it("hold every ID of every root's tree, entries included", () => {
    const view = numbersWithRegion();
    expect(file(view).timelines[2]?.regions).toEqual([
      region("region_1", quarters(2), quarters(4)),
    ]);
    expect([...manifestIds(file(view))].sort()).toEqual([
      "group_1",
      "page",
      "performance",
      "region_1",
      "score",
    ]);
  });

  it("take any ID, a part word too, and keep a part apart from an element", () => {
    const view = numbersWithRegion();
    for (const word of ["start", "card"]) {
      const added = changed(view, addRegion("score", region(word, quarters(0), quarters(1))));
      expect(file(added).timelines[2]?.regions.map((item) => item.id)).toEqual([word, "region_1"]);
      const named = changed(added, set(at(word), { name: "x" }));
      expect(file(named).timelines[2]?.regions[0]?.name).toBe("x");
    }
    const wedge: Address = { block: A, id: "score", part: ["start"] };
    expect(rejected(view, set(wedge, { name: "x" }))).toEqual({
      code: "unknown_target",
      path: [key(wedge)],
    });
  });

  it.each<[Address]>([
    [{ block: A, id: "page/region_1" }],
    [{ block: A, id: "score/region_1" }],
    [{ block: A, id: "region_1", part: ["start"] }],
    [{ block: A, id: "region_1", part: ["label"] }],
  ])("refuses %j as no target", (address) => {
    expect(rejected(numbersWithRegion(), set(address, { name: "x" }))).toEqual({
      code: "unknown_target",
      path: [key(address)],
    });
  });

  it("finds a group, which sets no length", () => {
    expect(rejected(numbersWithRegion(), set(at("group_1"), { length: 4 }))).toEqual({
      code: "wrong_target_kind",
      path: [key(at("group_1")), "length"],
    });
  });

  it("finds a timeline by its id in every root's tree, and nothing else", () => {
    const manifest = load(BUNDLE);
    expect(findTimeline(manifest, "annotations")).toBe(manifest.timelines[0]);
    expect(findTimeline(manifest, "excerpt")).toBe(manifest.timelines[3]?.children[0]);
    for (const id of ["group_1", "name", "recording/excerpt", "cmap_6", "nothing"]) {
      expect(findTimeline(manifest, id)).toBeUndefined();
    }
  });

  it("finds a map, region or flow-control element by its ID, and nothing else", () => {
    const findEntry = (manifest: Manifest, address: ElementAddress) => {
      const found = resolveElement(manifest, address);
      return found?.kind === "entry" ? { kind: found.entry, entry: found.element } : undefined;
    };
    const maps = load("map.json");
    const melody = maps.timelines[0];
    expect(findEntry(maps, id("tempo"))?.kind).toBe("map");
    expect(findEntry(maps, id("tempo"))?.entry).toBe(melody?.conversion_maps[0]);
    expect(findEntry(maps, id("ticks"))?.kind).toBe("map");
    expect(findEntry(maps, id("ticks"))?.entry).toBe(melody?.children[0]?.conversion_maps[0]);
    const flow = load("flow_control.json");
    const control = flow.timelines[0]?.flow_control ?? [];
    for (const item of ["flow_marker_1", "jump_from_1", "jump_to_1"]) {
      const found = findEntry(flow, id(item));
      expect(found?.kind).toBe("flow_control");
      expect(found?.entry).toBe(control.find((entry) => entry.id === item));
    }
    const numbers = file(numbersWithRegion());
    expect(findEntry(numbers, id("region_1"))?.kind).toBe("region");
    expect(findEntry(numbers, id("region_1"))?.entry).toBe(numbers.timelines[2]?.regions[0]);
    for (const address of [
      id("score"),
      id("group_1"),
      { part: ["name"] } as ElementAddress,
      id("score/region_1"),
      id("region_1", "label"),
      id("nothing"),
    ]) {
      expect(findEntry(numbers, address)).toBeUndefined();
    }
  });
});

describe("commands in blocks of several roots", () => {
  it("set a timeline at any depth and an entry of any root", () => {
    const group = viewOf([A, GROUP]);
    const late = file(changed(group, set(at("second-half"), { name: "Late" })));
    const before = file(group);
    expect(late.timelines[0]?.children[0]).toEqual({
      ...before.timelines[0]?.children[0],
      name: "Late",
    });
    expect(late.timelines[1]).toEqual(before.timelines[1]);
    const named = file(changed(numbersWithRegion(), set(at("region_1"), { name: "Intro" })));
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

  it("refuse an ID the manifest holds, in any root", () => {
    const view = numbersWithRegion();
    expect(rejected(view, { type: "add", into: at("score"), child: childOf("page") })).toEqual({
      code: "duplicate_id",
      path: [key(at("score")), "child", "id"],
    });
    for (const into of ["score", "page"]) {
      const value = into === "score" ? quarters(5) : pixels(5);
      expect(rejected(view, addRegion(into, region("region_1", value, value)))).toEqual({
        code: "duplicate_id",
        path: [key(at(into)), "region", "id"],
      });
    }
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
        { select: { element: "frame" }, set: "frame-highlight" },
        {
          select: { addresses: [{ id: "group_1", part: ["name"] }], element: "name" },
          set: { fill: "#7F00FF" },
        },
        { select: { element: "card", inside: "frame" }, set: { rx: 2, shadow: "#C4B5FD" } },
        { select: { element: "ancestor" }, set: { opacity: 0.5 } },
      ],
    });
  });

  it("style every block holding a group", () => {
    const view = viewOf([A, NUMBERS], [B, BUNDLE], [C, "bare.json"]);
    const styled = changed(view, {
      type: "style",
      select: { element: "frame" },
      set: { stroke: "#C00000" },
    });
    const statement = { select: { element: "frame" }, set: { stroke: "#C00000" } };
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
    file(changed(deepFreeze(view), { type: "remove", targets: targets.map((item) => at(item)) }));
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
      new Set(["recording", "excerpt", "cmap_5", "cmap_6"]),
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
    const view = changed(viewOf([A, NUMBERS]), {
      type: "add",
      into: { block: A },
      measure_map: bars,
    });
    expect(file(view).measure_maps).toEqual([{ ...bars, name: null, meta: {} }]);
    expect(removedBy(file(view), ["bars"])).toEqual(new Set(["bars"]));
    const after = remove(view, "bars");
    expect(after.measure_maps).toEqual([]);
    expect(after.timelines).toEqual(file(view).timelines);
  });

  it("removes the addresses naming a removed element, and a statement left without", () => {
    const styled = [
      {
        select: { addresses: [{ id: "page" }, { id: "score", part: ["card"] }] },
        set: { opacity: 0.5 },
      },
      {
        select: {
          addresses: [
            { id: "page", part: ["name"] },
            { id: "page", facet: "regions" },
          ],
        },
        set: { opacity: 0.4 },
      },
    ].reduce(
      (view, { select, set: properties }) =>
        changed(view, { type: "style", select, set: properties, blocks: [A] }),
      viewOf([A, STYLED]),
    );
    const own = file(viewOf([A, STYLED])).graphical?.statements ?? [];
    expect(remove(styled, "page").graphical?.statements).toEqual([
      ...own,
      { select: { addresses: [{ id: "score", part: ["card"] }] }, set: { opacity: 0.5 } },
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

describe("IDs of new elements", () => {
  it("refuse the IDs of every root's maps, the groups and the manifest's own", () => {
    const value = { ...manifestValue(BUNDLE), id: "edition" };
    const view = changed(createView(), {
      type: "add",
      into: {},
      block: { id: A, manifest: loadText(dumps(value)), x: 0, y: 0 },
    });
    for (const id of ["group_1", "edition", "cmap_5"]) {
      expect(rejected(view, addRegion("score", region(id, quarters(2), quarters(4))))).toEqual({
        code: "duplicate_id",
        path: [key(at("score")), "region", "id"],
      });
      expect(rejected(view, { type: "add", into: at("score"), child: childOf(id) })).toEqual({
        code: "duplicate_id",
        path: [key(at("score")), "child", "id"],
      });
    }
  });

  it("refuse the IDs of the maps other maps hold, which no address names", () => {
    const view = viewOf([A, "conversion_maps__maps_quarters.json"]);
    expect([...manifestIds(file(view))].sort()).toEqual([
      "cmap_1",
      "cmap_2",
      "cmap_3",
      "cmap_4",
      "cmap_5",
      "cmap_6",
      "cmap_7",
      "cmap_8",
      "lmap_1",
      "lmap_2",
      "lmap_3",
      "lmap_4",
      "lmap_5",
      "maps:quarters",
      "measuremap_1",
      "pmap_1",
      "tmap_1",
      "tmap_2",
      "tmap_3",
      "tmap_4",
    ]);
    const held = region("lmap_3", quarters(0), quarters(1));
    expect(rejected(view, addRegion("maps:quarters", held))).toEqual({
      code: "duplicate_id",
      path: [key(at("maps:quarters")), "region", "id"],
    });
    expect(resolveElement(file(view), { id: "lmap_3" })).toBeUndefined();
  });
});
