import { describe, expect, it } from "vitest";
import { apply } from "../src/commands/apply.ts";
import { isCommandError } from "../src/errors.ts";
import { containersOf, placedElement } from "../src/manifest/containers.ts";
import { contains } from "../src/manifest/contains.ts";
import { cardStamps, manifestElements } from "../src/manifest/elements.ts";
import { memberDrawings, withVirtualMembers } from "../src/manifest/files.ts";
import { schemaProblems } from "../src/manifest/io.ts";
import type { Manifest } from "../src/manifest/types.ts";
import type { Address } from "../src/workspace/address.ts";
import { resolveAddress } from "../src/workspace/address.ts";
import { readWorkspace, writeWorkspace } from "../src/workspace/file.ts";
import { createIdMinter } from "../src/workspace/ids.ts";
import { replay } from "../src/workspace/store.ts";
import type { View } from "../src/workspace/view.ts";
import { A, at, block, changed, key, refusal, storeOf, viewOf } from "./support.ts";

const BY_HAND = "flow/flow_map_by_hand.yaml";
const SONATA = "flow/sonata_exposition.yaml";

const byHand = () => viewOf([A, BY_HAND]);
const sonata = () => viewOf([A, SONATA]);
const manifestOf = (view: View): Manifest => block(view).manifest;

/** The manifest the view's block holds, checked whole by the schema and the validators. */
function valid(view: View): Manifest {
  const manifest = manifestOf(view);
  expect(schemaProblems(manifest)).toEqual([]);
  return manifest;
}

/** The code, path and message of a refusal. */
function refused(result: unknown) {
  if (!isCommandError(result)) throw new Error("expected a refusal");
  return { code: result.code, path: result.path, message: result.message };
}

const addFlowMap = (into: string, flow_map: object, ids: readonly string[] = []) => ({
  type: "add",
  into: at(into),
  flow_map,
  ...(ids.length > 0 ? { ids } : {}),
});

const addVirtual = (virtual_timeline: object, ids: readonly string[] = []) => ({
  type: "add",
  into: { block: A },
  virtual_timeline,
  ...(ids.length > 0 ? { ids } : {}),
});

const set = (target: Address, values: object) => ({
  type: "set",
  changes: [{ target, values }],
});

const ENCORE = { chunks: ["first", { gap: [2, 1] }, "second"], name: "Encore" };

describe("FlowMaps", () => {
  it("adds a FlowMap into the root it orders", () => {
    const view = changed(byHand(), addFlowMap("set", ENCORE, ["encore"]));
    const manifest = valid(view);
    expect(manifest.flow_maps?.map((item) => item.id)).toEqual(["encore", "flow_map_1"]);
    expect(manifest.flow_maps?.find((item) => item.id === "encore")).toEqual({
      id: "encore",
      timeline: "set",
      chunks: ["first", { gap: [2, 1] }, "second"],
      canonical: false,
      name: "Encore",
    });
  });

  it("gives a FlowMap without an ID the next minted one", () => {
    const view = changed(byHand(), addFlowMap("set", ENCORE), createIdMinter({ seed: 7n }));
    const expected = createIdMinter({ seed: 7n }).mint("flow");
    expect(valid(view).flow_maps?.map((item) => item.id)).toContain(expected);
  });

  it("refuses FlowMaps the validators or the target refuse", () => {
    const into = key(at("set"));
    const view = byHand();
    const rootChunk = refused(apply(view, addFlowMap("set", { chunks: ["set"] }, ["own"])));
    expect(rootChunk).toEqual({
      code: "schema_violation",
      path: [into, "flow_map", "chunks", 0],
      message: "'set' names no region, child timeline or virtual timeline in the tree of 'set'",
    });
    expect(
      refusal(apply(view, addFlowMap("set", { timeline: "first", chunks: ["first"] }, ["x"]))),
    ).toEqual({ code: "invalid_value", path: [into, "flow_map", "timeline"] });
    expect(refusal(apply(view, addFlowMap("set", { name: "Nothing" }, ["x"])))).toEqual({
      code: "invalid_value",
      path: [into, "flow_map", "chunks"],
    });
    expect(
      refusal(apply(view, addFlowMap("set", { chunks: ["first"], colour: "red" }, ["x"]))),
    ).toEqual({ code: "unknown_property", path: [into, "flow_map", "colour"] });
    expect(refusal(apply(view, addFlowMap("set", { id: "first", chunks: ["second"] })))).toEqual({
      code: "duplicate_id",
      path: [into, "flow_map", "id"],
    });
    expect(refusal(apply(view, addFlowMap("first", { chunks: ["first"] }, ["x"])))).toEqual({
      code: "wrong_target_kind",
      path: [key(at("first")), "flow_map"],
    });
    expect(refusal(apply(view, addFlowMap("set", { chunks: ["first"] })))).toEqual({
      code: "invalid_command",
      path: ["ids"],
    });
  });

  it("sets a hand-made FlowMap's chunks and name", () => {
    const view = changed(byHand(), set(at("flow_map_1"), { chunks: ["first", "first"] }));
    expect(valid(view).flow_maps?.[0]?.chunks).toEqual(["first", "first"]);
    const named = changed(view, set(at("flow_map_1"), { name: "Twice" }));
    expect(valid(named).flow_maps?.[0]?.name).toBe("Twice");
    expect(refused(apply(named, set(at("flow_map_1"), { name: "Twice" })))).toEqual({
      code: "invalid_value",
      path: [key(at("flow_map_1")), "name"],
      message: "the command changes nothing",
    });
    expect(refusal(apply(view, set(at("flow_map_1"), { chunks: ["first", "gone"] })))).toEqual({
      code: "schema_violation",
      path: [key(at("flow_map_1")), "chunks", 1],
    });
  });

  it("refuses every set on a computed FlowMap", () => {
    const view = sonata();
    for (const values of [{ chunks: ["region_1"] }, { name: "Once" }]) {
      const [property] = Object.keys(values);
      expect(refused(apply(view, set(at("flow_map_2"), values)))).toEqual({
        code: "computed_flow_map",
        path: [key(at("flow_map_2")), property],
        message:
          "FlowMap 'flow_map_2' is computed from the flow control of 'score' and is read only",
      });
    }
  });

  it("replaces a computed FlowMap by a recomputation, with the lengths playing it", () => {
    const computed = {
      chunks: ["region_1", "region_2", "region_3"],
      provenance: [{ method: "inferred" }],
    };
    const lengthOf = (view: View, id: string) =>
      manifestOf(view).virtual_timelines?.find((item) => item.id === id)?.length;
    const recomputed = changed(sonata(), set(at("flow_map_1"), { computed }));
    const flowMap = valid(recomputed).flow_maps?.find((item) => item.id === "flow_map_1");
    expect(flowMap).toMatchObject({ ...computed, convention: "default", name: null });
    expect(lengthOf(recomputed, "virtual_1")).toEqual([24, 1]);

    const twice = changed(
      changed(sonata(), addFlowMap("score", { chunks: ["virtual_1", "virtual_1"] }, ["twice"])),
      addVirtual({ map: "twice", timeline: "score" }, ["twice_card"]),
    );
    expect(lengthOf(twice, "twice_card")).toEqual([72, 1]);
    const store = storeOf(twice);
    expect(store.dispatch(set(at("flow_map_1"), { computed }))).toBeNull();
    valid(store.view);
    expect(lengthOf(store.view, "virtual_1")).toEqual([24, 1]);
    expect(lengthOf(store.view, "twice_card")).toEqual([48, 1]);
    store.undo();
    expect(lengthOf(store.view, "virtual_1")).toEqual([36, 1]);
    expect(lengthOf(store.view, "twice_card")).toEqual([72, 1]);

    expect(refused(apply(recomputed, set(at("flow_map_1"), { computed })))).toEqual({
      code: "invalid_value",
      path: [key(at("flow_map_1")), "computed"],
      message: "the command changes nothing",
    });
    const manual = { ...computed, provenance: [{ method: "manual" }] };
    expect(refused(apply(sonata(), set(at("flow_map_1"), { computed: manual })))).toEqual({
      code: "invalid_value",
      path: [key(at("flow_map_1")), "computed", "provenance"],
      message:
        "a computed value of FlowMap 'flow_map_1' carries a provenance entry of method inferred",
    });
    const bare = { chunks: computed.chunks };
    expect(refusal(apply(sonata(), set(at("flow_map_1"), { computed: bare })))).toEqual({
      code: "invalid_value",
      path: [key(at("flow_map_1")), "computed", "provenance"],
    });
    expect(refused(apply(byHand(), set(at("flow_map_1"), { computed })))).toEqual({
      code: "invalid_value",
      path: [key(at("flow_map_1")), "computed"],
      message:
        "FlowMap 'Encore order' is not computed from flow control: its chunks are set as chunks",
    });
  });

  it("writes the length of a virtual timeline playing a hand-made FlowMap whose chunks change", () => {
    const view = changed(
      byHand(),
      addVirtual({ map: "flow_map_1", timeline: "set" }, ["encore_card"]),
    );
    expect(manifestOf(view).virtual_timelines?.[0]?.length).toEqual([24, 1]);
    const twice = changed(view, set(at("flow_map_1"), { chunks: ["first", "first"] }));
    expect(valid(twice).virtual_timelines?.[0]?.length).toEqual([16, 1]);
  });

  it("admits a recomputation inside the flow editor of the root", () => {
    const store = storeOf(sonata());
    expect(store.open(at("score"), "flow")).toBeNull();
    const computed = { chunks: ["region_1", "region_3"], provenance: [{ method: "inferred" }] };
    expect(store.dispatch(set(at("flow_map_1"), { computed }))).toBeNull();
    expect(
      store.view.blocks[A]?.manifest.virtual_timelines?.find((item) => item.id === "virtual_1")
        ?.length,
    ).toEqual([20, 1]);
  });

  it("refuses to remove a FlowMap a virtual timeline applies", () => {
    const view = sonata();
    expect(refused(apply(view, { type: "remove", targets: [at("flow_map_1")] }))).toEqual({
      code: "not_removable",
      path: [key(at("flow_map_1"))],
      message: "FlowMap 'flow_map_1' is applied by the virtual timeline 'virtual_1'",
    });
    const both = changed(view, { type: "remove", targets: [at("flow_map_1"), at("virtual_1")] });
    const manifest = valid(both);
    expect(manifest.flow_maps?.map((item) => item.id)).toEqual(["flow_map_2", "flow_map_3"]);
    expect(manifest.virtual_timelines).toEqual([]);
    const one = changed(view, { type: "remove", targets: [at("flow_map_2")] });
    expect(valid(one).flow_maps?.map((item) => item.id)).toEqual(["flow_map_1", "flow_map_3"]);
  });
});

describe("Virtual timelines", () => {
  it("adds a virtual timeline with its axis computed", () => {
    const value = { map: "flow_map_2", timeline: "score", name: "As played once" };
    const view = changed(sonata(), addVirtual(value, ["single_card"]));
    expect(valid(view).virtual_timelines?.find((item) => item.id === "single_card")).toEqual({
      id: "single_card",
      map: "flow_map_2",
      timeline: "score",
      name: "As played once",
      unit: "quarters",
      number_type: "fraction",
      length: [20, 1],
    });
    const stated = changed(sonata(), addVirtual({ ...value, length: [40, 2] }, ["single_card"]));
    expect(
      valid(stated).virtual_timelines?.find((item) => item.id === "single_card")?.length,
    ).toEqual([20, 1]);
    const minted = changed(sonata(), addVirtual(value), createIdMinter({ seed: 3n }));
    const expected = createIdMinter({ seed: 3n }).mint("clt");
    expect(valid(minted).virtual_timelines?.map((item) => item.id)).toContain(expected);
  });

  it("refuses a virtual timeline core does not compute", () => {
    const into = key({ block: A });
    const view = sonata();
    const value = { map: "flow_map_2", timeline: "score" };
    expect(refused(apply(view, addVirtual({ ...value, length: [24, 1] }, ["x"])))).toEqual({
      code: "invalid_value",
      path: [into, "virtual_timeline", "length"],
      message: "the length of a virtual timeline is computed from its map: 20 ♩, not 24 ♩",
    });
    expect(refusal(apply(view, addVirtual({ ...value, unit: "quarters" }, ["x"])))).toEqual({
      code: "unknown_property",
      path: [into, "virtual_timeline", "unit"],
    });
    expect(refusal(apply(view, addVirtual({ map: "gone", timeline: "score" }, ["x"])))).toEqual({
      code: "invalid_value",
      path: [into, "virtual_timeline", "map"],
    });
    expect(refusal(apply(view, addVirtual({ ...value, through: "gone" }, ["x"])))).toEqual({
      code: "invalid_value",
      path: [into, "virtual_timeline", "length"],
    });
    expect(refusal(apply(view, addVirtual({ timeline: "score" }, ["x"])))).toEqual({
      code: "invalid_value",
      path: [into, "virtual_timeline", "map"],
    });
  });

  it("renames a virtual timeline", () => {
    const view = changed(sonata(), set(at("virtual_1"), { name: "Repeats played" }));
    expect(valid(view).virtual_timelines?.[0]?.name).toBe("Repeats played");
  });

  it("refuses to remove a virtual timeline a FlowMap names as a chunk", () => {
    const view = changed(sonata(), addFlowMap("score", { chunks: ["virtual_1"] }, ["twice"]));
    expect(refused(apply(view, { type: "remove", targets: [at("virtual_1")] }))).toEqual({
      code: "not_removable",
      path: [key(at("virtual_1"))],
      message:
        "virtual timeline 'virtual_1' is still named: the FlowMaps 'twice' name it as a chunk",
    });
  });

  it("removes a virtual timeline from its groups, its places and the rules naming it", () => {
    let view = changed(sonata(), {
      type: "add",
      into: { block: A },
      group: { members: ["score", "virtual_1"] },
      ids: ["both"],
    });
    view = changed(view, set(at("both"), { order: ["virtual_1", "score"] }));
    view = changed(view, {
      type: "style",
      select: { addresses: [{ id: "score", part: ["card"] }] },
      set: { flow: "virtual_1" },
      blocks: [A],
    });
    view = changed(view, {
      type: "style",
      select: { addresses: [{ id: "virtual_1", part: ["card"] }] },
      set: { opacity: 0.5 },
      blocks: [A],
    });
    view = changed(view, set({ block: A, id: "both" }, { cards: { virtual_1: { width: 300 } } }));
    expect(block(view).places.both?.cards?.virtual_1).toEqual({ width: 300 });
    const removed = changed(view, { type: "remove", targets: [at("virtual_1")] });
    const manifest = valid(removed);
    expect(manifest.groups.find((group) => group.id === "both")?.members).toEqual(["score"]);
    expect(manifest.graphical?.order?.both).toEqual(["score"]);
    expect(manifest.graphical?.rules ?? []).toEqual([]);
    expect(block(removed).places.both?.cards?.virtual_1).toBeUndefined();
  });
});

describe("Regions and other entries get minted IDs", () => {
  it("gives a region and a map without an ID the minter's next", () => {
    const minter = createIdMinter({ seed: 11n });
    const expected = createIdMinter({ seed: 11n });
    const region = { start: [0, 1], end: [4, 1], name: "Intro" };
    const view = changed(sonata(), { type: "add", into: at("score"), region }, minter);
    const regionId = expected.mint("region");
    const score = valid(view).timelines[0];
    expect(score?.regions.map((item) => item.id)).toContain(regionId);
    const map = {
      type: "LinearMap",
      source_unit: "quarters",
      target_unit: "ticks",
      scalar: 480,
      offset: 0,
    };
    const mapped = changed(view, { type: "add", into: at("score"), map }, minter);
    expect(valid(mapped).timelines[0]?.conversion_maps.map((item) => item.id)).toContain(
      expected.mint("cmap"),
    );
  });
});

describe("Groups admit virtual timelines", () => {
  const grouped = () =>
    changed(sonata(), {
      type: "add",
      into: { block: A },
      group: { members: ["score", "virtual_1"] },
      ids: ["both"],
    });

  it("draws a virtual member in a card of its own in the frame", () => {
    const view = grouped();
    const manifest = valid(view);
    expect(manifest.groups.find((group) => group.id === "both")?.members).toEqual([
      "score",
      "virtual_1",
    ]);
    const containers = containersOf(manifest);
    const [card, ...more] = containers.cards.get("virtual_1") ?? [];
    expect(more).toEqual([]);
    expect(card?.key).toEqual({ item: "both", member: "virtual_1" });
    expect(card?.holder).toBe(containers.frames.get("both"));
    expect([...(containers.bands.get("virtual_1")?.keys() ?? [])]).toEqual(["markers", "regions"]);
    expect(placedElement(manifest, { item: "both", member: "virtual_1" })).toBe("virtual_1");
    expect(contains(manifest, "both", { id: "virtual_1", part: ["card"] })).toBe(true);
    const kinds = [
      at("virtual_1"),
      at("virtual_1", ["card"]),
      { block: A, id: "virtual_1", facet: "regions" as const },
    ].map((address) => {
      const resolved = resolveAddress(view, address);
      return isCommandError(resolved) ? resolved.code : resolved.kind;
    });
    // A card's address resolves where the drawing's elements list it, as they list this one.
    expect(kinds).toEqual(["virtual_timeline", "virtual_card", "virtual_band"]);
    const children = resolveAddress(view, { block: A, id: "virtual_1", facet: "children" });
    expect(refusal(children).code).toBe("unknown_target");
  });

  it("lets a virtual timeline leave a group and the group order it", () => {
    const view = grouped();
    const ordered = changed(view, set(at("both"), { order: ["virtual_1", "score"] }));
    expect(valid(ordered).graphical?.order?.both).toEqual(["virtual_1", "score"]);
    const bands = changed(view, set(at("virtual_1"), { order: ["regions", "line", "markers"] }));
    expect(valid(bands).graphical?.order?.virtual_1).toEqual(["regions", "line", "markers"]);
    const left = changed(view, set(at("virtual_1"), { groups: [] }));
    expect(valid(left).groups.find((group) => group.id === "both")?.members).toEqual(["score"]);
  });

  it("lies inside the editor of its group, outside a timeline's", () => {
    const store = storeOf(grouped());
    expect(store.open(at("both"))).toBeNull();
    expect(store.dispatch(set(at("virtual_1"), { name: "In the frame" }))).toBeNull();
    store.done();
    expect(store.open(at("score"))).toBeNull();
    expect(refusal(store.dispatch(set(at("virtual_1"), { name: "Out" })))).toEqual({
      code: "side_effect",
      path: [key(at("virtual_1"))],
    });
  });

  it("places and hides a virtual timeline's card in no group", () => {
    const view = sonata();
    const [card] = containersOf(manifestOf(view)).cards.get("virtual_1") ?? [];
    expect(card?.key).toEqual({ item: "virtual_1" });
    const placed = changed(view, set(at("virtual_1"), { place: { x: 10, y: 20 } }));
    expect(block(placed).places.virtual_1).toEqual({ x: 10, y: 20 });
    const hidden = changed(placed, set(at("virtual_1"), { place: { x: null, y: null } }));
    expect(block(hidden).places.virtual_1).toBeUndefined();
    expect(valid(hidden).virtual_timelines?.map((item) => item.id)).toEqual(["virtual_1"]);
  });
});

describe("The flow property", () => {
  const flow = (value: string | null) => ({
    type: "style",
    select: { addresses: [{ id: "score", part: ["card"] }] },
    set: { flow: value },
    blocks: [A],
  });

  it("switches a card to a FlowMap and back", () => {
    const view = changed(sonata(), flow("flow_map_2"));
    expect(valid(view).graphical?.rules).toEqual([
      { select: { addresses: [{ id: "score", part: ["card"] }] }, set: { flow: "flow_map_2" } },
    ]);
    expect(refusal(apply(view, flow("region_1"))).code).toBe("schema_violation");
    const written = changed(view, flow(null));
    expect(valid(written).graphical?.rules).toEqual([]);
  });
});

describe("The flow editor", () => {
  const SCORE = at("score");

  it("opens on a root timeline only", () => {
    const store = storeOf(byHand());
    expect(refusal(store.open(at("first"), "flow"))).toEqual({
      code: "no_editor",
      path: [key(at("first"))],
    });
    expect(store.open(at("set"), "flow")).toBeNull();
    expect(store.editing.map((editor) => editor.kind)).toEqual(["flow"]);
  });

  it("admits the commands over the root's FlowMaps and nothing else", () => {
    const store = storeOf(sonata(), { minter: createIdMinter({ seed: 5n }) });
    expect(store.open(SCORE, "flow")).toBeNull();
    expect(
      store.dispatch(addFlowMap("score", { chunks: ["region_3", "region_1"] }, ["back"])),
    ).toBeNull();
    const region = { id: "coda", start: [20, 1], end: [24, 1] };
    expect(store.dispatch({ type: "add", into: SCORE, region })).toBeNull();
    expect(
      store.dispatch(addVirtual({ map: "back", timeline: "score" }, ["back_card"])),
    ).toBeNull();
    expect(store.dispatch(set(at("back_card"), { place: { x: 40, y: 300 } }))).toBeNull();
    expect(refused(store.dispatch(set(SCORE, { name: "Renamed" })))).toEqual({
      code: "side_effect",
      path: [key(SCORE), "name"],
      message:
        "the name of timeline 'Score' lies outside the flow editor of timeline 'Score': an editor changes only what it edits",
    });
    const style = { type: "style", select: { element: "card" }, set: { stroke: "#000000" } };
    expect(refusal(store.dispatch(style))).toEqual({ code: "side_effect", path: [key(SCORE)] });
    expect(refusal(store.open(at("region_1"))).code).toBe("no_editor");
    expect(refusal(store.open({ block: A })).code).toBe("not_inside");
    store.done();
    const [entry] = store.journal.slice(-1);
    const session =
      entry !== undefined && "session" in entry ? store.sessions[entry.session] : null;
    expect(session?.kind).toBe("flow");
    expect(session?.entries.length).toBe(4);
    const workspace = store.snapshot();
    const read = readWorkspace(writeWorkspace(workspace));
    expect(read).toEqual(workspace);
    const views = replay(workspace.journal, workspace.sessions);
    expect(views.at(-1)?.blocks).toEqual(store.view.blocks);
    expect(valid(store.view).virtual_timelines?.map((item) => item.id)).toEqual([
      "back_card",
      "virtual_1",
    ]);
  });

  it("reopens its own sessions only", () => {
    const store = storeOf(sonata());
    store.open(SCORE, "flow");
    store.dispatch(addFlowMap("score", { chunks: ["region_3"] }, ["last"]));
    store.done();
    const journal = store.journal.length;
    expect(store.open(SCORE)).toBeNull();
    expect(store.editing.at(-1)?.kind).toBe("timeline");
    expect(store.changes).toBe(0);
    store.cancel();
    expect(store.open(SCORE, "flow")).toBeNull();
    expect(store.journal.length).toBe(journal - 1);
    expect(store.entries.length).toBe(1);
    store.done();
    expect(store.open(SCORE)).toBeNull();
    expect(store.open(SCORE, "flow")).toBeNull();
    expect(store.editing.map((editor) => editor.kind)).toEqual(["timeline", "flow"]);
  });
});

describe("Named timestamps on a virtual timeline", () => {
  const member = () => viewOf([A, "groups/virtual_member.yaml"]);
  const into = at("allegro_default");
  const addSeam = (timestamp: object) => ({ type: "add", into, timestamp, ids: ["seam"] });
  const seamOf = (view: View) =>
    (valid(view).graphical?.timestamps ?? []).find((timestamp) => timestamp.id === "seam");

  it("adds, sets and removes a timestamp on the virtual timeline's own axis", () => {
    const added = changed(member(), addSeam({ name: "Seam", coordinate: [953, 2] }));
    expect(seamOf(added)).toEqual({
      id: "seam",
      timeline: "allegro_default",
      coordinate: [953, 2],
      name: "Seam",
      display: ["wedge", "name", "cross_section"],
      matchstamp: false,
      groupstamp: false,
    });
    const moved = changed(added, set(at("seam"), { coordinate: [500, 1] }));
    expect(seamOf(moved)?.coordinate).toEqual([500, 1]);
    const grouped = changed(moved, set(at("seam"), { groupstamp: true }));
    expect(seamOf(grouped)?.groupstamp).toBe(true);
    const removed = changed(grouped, { type: "remove", targets: [at("seam")] });
    expect(seamOf(removed)).toBeUndefined();
  });

  it("refuses a coordinate after its end and a groupstamp outside a group", () => {
    expect(refused(apply(member(), addSeam({ name: "Late", coordinate: [2121, 1] })))).toEqual({
      code: "invalid_value",
      path: [key(into), "timestamp", "coordinate"],
      message: "the coordinate lies after the end of timeline 'allegro_default'",
    });
    const single = {
      type: "add",
      into: at("allegro_single"),
      timestamp: { name: "Seam", coordinate: [0, 1], groupstamp: true },
      ids: ["seam"],
    };
    expect(refused(apply(member(), single))).toMatchObject({
      code: "invalid_value",
      path: [key(at("allegro_single")), "timestamp", "groupstamp"],
    });
  });

  it("carries a groupstamp of a virtual member across its frame", () => {
    const view = changed(
      member(),
      addSeam({
        name: "Seam",
        coordinate: [953, 2],
        groupstamp: true,
        display: ["wedge", "coordinate", "cross_section"],
      }),
    );
    const manifest = valid(view);
    const lines = manifestElements(manifest).filter(
      (item) => item.type === "cross_section" && item.address.id === "seam",
    );
    expect(lines.map((item) => [item.timeline, item.inside])).toEqual([
      ["allegro_default", ["block", "frame", "timeline"]],
      ["allegro_default", ["block", "frame"]],
    ]);
    const frame = memberDrawings(manifest).frames.find((item) => item.group.id === "performance");
    if (frame === undefined) throw new Error("performance draws a frame");
    const recording = frame.members.find((item) => item.timeline.id === "recording");
    if (recording === undefined) throw new Error("recording is a member");
    const drawn = cardStamps(manifest, recording, withVirtualMembers(manifest, frame));
    const seam = drawn.secondaries.get("recording")?.find((item) => item.timestamp.id === "seam");
    expect([seam?.source, seam?.value]).toEqual(["frame", 157.8595850035369]);
    const marks = manifestElements(manifest).filter(
      (item) => item.address.id === "seam" && item.coordinates === "secondary",
    );
    expect(marks.map((item) => [item.type, item.timeline])).toEqual([
      ["wedge", "recording"],
      ["label", "recording"],
    ]);
  });
});
