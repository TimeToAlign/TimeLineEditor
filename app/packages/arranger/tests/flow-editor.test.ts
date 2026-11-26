/**
 * The flow subeditor: what opens it, its rows and their drawing, what each
 * of its actions stores, and how a twin is carried. The expected values are
 * derived in `README.md` ("The flow subeditor").
 */

import type { Address, Command, Facet, Manifest, Store } from "@timetoalign/tilie-core";
import { idAddress, inBlock, WORKSPACE } from "@timetoalign/tilie-core";
import { describe, expect, it } from "vitest";
import type { Hit } from "../src/boxes.ts";
import { keyedBox } from "../src/boxes.ts";
import { drawingOf } from "../src/drawing.ts";
import type { Editing } from "../src/editing.ts";
import { editorOf, editorTargetOf } from "../src/editors.ts";
import { FlowEditorSession, type FlowTarget } from "../src/flowEditor.svelte.ts";
import { flowRows, recomputeCommands } from "../src/flowEditor.ts";
import { flowPaneOf } from "../src/flowEditorRows.ts";
import {
  dropAt,
  dropIndex,
  insideDistance,
  twinOpacity,
  unionRect,
} from "../src/gestures/flowDrag.ts";
import { A, B, bandsOf, blockIn, changed, load, metrics, storeOf, viewOf } from "./support.ts";

const FIXTURE = "flow/virtual_cards";
const ROOT = "allegro";
const view = viewOf({ id: A, fixture: FIXTURE, x: 40, y: 80 });
const block = blockIn(view, A);
const drawing = drawingOf(block, view.graphical, metrics);
const allegro = inBlock(A, idAddress(ROOT));

/**
 * A hit on the band of `ROOT` drawing `facet`: the flow control band read
 * from the drawing's records; another facet's (which `virtual_cards` does
 * not draw, its atomic sections hidden) that record with its facet changed.
 */
function bandHit(facet: Facet): Hit {
  const flow = bandsOf(drawing).find(
    (found) => found.band.timeline === ROOT && found.band.facet === "flow_control",
  );
  if (flow === undefined) throw new Error("no flow control band");
  const band =
    facet === "flow_control"
      ? flow
      : { ...flow, address: { id: ROOT, facet }, band: { ...flow.band, facet } };
  return {
    block: A,
    kind: "band",
    address: inBlock(A, band.address),
    box: band,
    boundary: false,
    within: null,
  };
}

const timelineEditor: Editing = { target: allegro, kind: "timeline" };

describe("opening the flow editor", () => {
  it("opens from the root's flow control band in the root's timeline editor", () => {
    const band = { block: A, id: ROOT, facet: "flow_control" } as const;
    expect(editorTargetOf(view, bandHit("flow_control"), timelineEditor)).toEqual(band);
    expect(editorOf(band)).toEqual({ target: allegro, kind: "flow" });
    const store = storeOf(view);
    expect(store.open(allegro)).toBeNull();
    const opened = editorOf(band);
    expect(store.open(opened.target, opened.kind)).toBeNull();
    expect(store.editing.map(({ target, kind }) => ({ target, kind }))).toEqual([
      { target: allegro, kind: "timeline" },
      { target: allegro, kind: "flow" },
    ]);
  });

  it("opens from an element the band draws, hit before the band", () => {
    const jump: Hit = {
      block: A,
      kind: "element",
      address: inBlock(A, idAddress("volta_jump")),
      box: null,
      boundary: false,
      within: null,
    };
    expect(editorTargetOf(view, jump, timelineEditor)).toEqual({
      block: A,
      id: ROOT,
      facet: "flow_control",
    });
    const card = keyedBox(drawing, { item: ROOT }) ?? null;
    expect(editorTargetOf(view, { ...jump, within: card }, null)).toEqual(allegro);
  });

  it("opens nothing from any other band, without the root's timeline editor, or inside", () => {
    expect(editorTargetOf(view, bandHit("regions"), timelineEditor)).toBeNull();
    expect(editorTargetOf(view, bandHit("flow_control"), null)).toBeNull();
    expect(
      editorTargetOf(view, bandHit("flow_control"), { target: { block: A }, kind: "bundle" }),
    ).toBeNull();
    const other = changed(view, {
      type: "add",
      into: WORKSPACE,
      block: { id: B, manifest: load(FIXTURE), x: 2000, y: 0 },
    });
    const elsewhere: Editing = { target: inBlock(B, idAddress(ROOT)), kind: "timeline" };
    expect(editorTargetOf(other, bandHit("flow_control"), elsewhere)).toBeNull();
    const flow: Editing = { target: allegro, kind: "flow" };
    expect(editorTargetOf(view, bandHit("flow_control"), flow)).toBeNull();
    const line: Hit = { ...bandHit("flow_control"), kind: "element", address: allegro, box: null };
    expect(editorTargetOf(view, line, flow)).toBeNull();
    const card: Address = { block: A, id: ROOT, part: ["card"] };
    expect(editorOf(card)).toEqual({ target: card });
    expect(editorOf({ block: A })).toEqual({ target: { block: A } });
  });
});

describe("rows", () => {
  const convention = (text: string) => ({
    kind: "convention",
    text,
    title: `Convention: ${text}`,
  });
  const inferred = { kind: "provenance", text: "inferred", title: "Provenance: inferred" };

  it("lists the computed FlowMaps first, each part in the manifest's order", () => {
    const rows = flowRows(block.manifest, ROOT);
    expect(
      rows.map(({ id, name, computed, virtual, chips }) => ({
        id,
        name,
        computed,
        virtual,
        chips,
      })),
    ).toEqual([
      {
        id: "default",
        name: "default",
        computed: true,
        virtual: "allegro_default",
        chips: [convention("default"), inferred],
      },
      {
        id: "printed",
        name: "printed",
        computed: true,
        virtual: null,
        chips: [convention("printed"), inferred],
      },
      {
        id: "single",
        name: "single",
        computed: true,
        virtual: "allegro_single",
        chips: [convention("single"), inferred],
      },
      {
        id: "by_hand",
        name: "Practice",
        computed: false,
        virtual: "allegro_by_hand",
        chips: [{ kind: "provenance", text: "manual", title: "Provenance: manual" }],
      },
    ]);
  });

  it("adds the findings of a convention to its row alone", () => {
    const plain = flowRows(block.manifest, ROOT);
    const found = flowRows(block.manifest, ROOT, new Map([["default", ["one", "two"]]]));
    expect(found[0]?.chips.at(-1)).toEqual({
      kind: "findings",
      text: "2 findings",
      title: "one\ntwo",
    });
    expect(found.slice(1)).toEqual(plain.slice(1));
    const one = flowRows(block.manifest, ROOT, new Map([["single", ["only"]]]));
    expect(one[2]?.chips.at(-1)).toEqual({ kind: "findings", text: "1 finding", title: "only" });
  });
});

describe("the pane as drawn", () => {
  const pane = flowPaneOf(
    block,
    drawing,
    view.graphical,
    metrics,
    ROOT,
    flowRows(block.manifest, ROOT),
  );

  it("folds out under the card, its rows' lines starting where the card's does", () => {
    expect(pane).not.toBeNull();
    expect(pane?.x).toBe(8);
    expect(pane?.card.width).toBe(471.6396484375);
    expect(pane?.lineStart).toBe(54.6396484375);
    expect(pane?.rows.map((row) => row.row.id)).toEqual([
      "default",
      "printed",
      "single",
      "by_hand",
    ]);
    for (const row of pane?.rows ?? []) expect(row.lineStart).toBe(54.6396484375);
  });

  it("draws each entry as long as the written stretch it plays", () => {
    const row = pane?.rows[0];
    expect(row?.lineEnd).toBe(54.6396484375 + (400 * 2120.5) / 1644);
    expect(row?.chunks.map(({ index, last, gap }) => ({ index, last, gap }))).toEqual([
      { index: 0, last: 0, gap: false },
      { index: 1, last: 1, gap: false },
      { index: 2, last: 2, gap: false },
      { index: 3, last: 3, gap: false },
    ]);
    expect(row?.chunks[0]?.x1).toBe(54.6396484375);
    expect(row?.chunks[0]?.x2).toBe(170.5763880968674);
    expect((row?.chunks[0]?.x2 ?? 0) - (row?.chunks[0]?.x1 ?? 0)).toBe((400 * 476.5) / 1644);
  });

  it("draws a run once, a gap apart, and nothing but the virtual card's line and chunks", () => {
    const row = pane?.rows[3];
    expect(row?.chunks.map(({ index, last, gap }) => ({ index, last, gap }))).toEqual([
      { index: 0, last: 3, gap: false },
      { index: 4, last: 4, gap: true },
      { index: 5, last: 5, gap: false },
    ]);
    const texts = row?.items.flatMap((item) =>
      item.text === null || item.text === "" ? [] : [item.text],
    );
    expect(texts).toEqual(["A × 4", "4 ♩", "C"]);
    for (const item of pane?.rows.flatMap((each) => each.items) ?? []) {
      expect(Object.keys(item.attributes).some((name) => name.startsWith("data-"))).toBe(false);
    }
  });
});

/** A flow editor open on `allegro`, its session, and what it dispatched and reported. */
function opened(): {
  store: Store;
  session: FlowEditorSession;
  target: FlowTarget;
  sent: Command[];
  said: string[];
} {
  const store = storeOf(view);
  expect(store.open(allegro, "flow")).toBeNull();
  const sent: Command[] = [];
  const said: string[] = [];
  const session = new FlowEditorSession({
    store: () => store,
    dispatch(command) {
      sent.push(command);
      const refused = store.dispatch(command);
      if (refused !== null) said.push(refused.message);
      return refused === null;
    },
    refuse: (message) => said.push(message),
    drawing: (id) => {
      const shown = store.view.blocks[id];
      return shown === undefined ? undefined : drawingOf(shown, store.view.graphical, metrics);
    },
    server: () => undefined,
  });
  const innermost = store.editing.at(-1);
  if (innermost === undefined) throw new Error("no editor");
  return {
    store,
    session,
    target: { session: innermost.session, block: A, root: ROOT },
    sent,
    said,
  };
}

const manifestOf = (store: Store): Manifest => blockIn(store.view, A).manifest;
const flowMapIds = (store: Store) => (manifestOf(store).flow_maps ?? []).map((item) => item.id);
const set = (flowMap: string, chunks: unknown) => ({
  type: "set",
  changes: [{ target: inBlock(A, idAddress(flowMap)), values: { chunks } }],
});

describe("what each action stores", () => {
  it("stores nothing without the new row", () => {
    const { session, target, sent, said } = opened();
    expect(session.land(target, { kind: "element", id: "section_b" })).toBe(false);
    expect(sent).toEqual([]);
    expect(said).toEqual(["Add a new FlowMap (Add +) to drop into it"]);
    session.add(target);
    expect(sent).toEqual([]);
  });

  it("writes the new FlowMap, then sets its entries per change", () => {
    const { store, session, target, sent } = opened();
    const before = flowMapIds(store);
    session.add(target);
    expect(session.land(target, { kind: "element", id: "section_b" })).toBe(true);
    expect(sent).toEqual([{ type: "add", into: allegro, flow_map: { chunks: ["section_b"] } }]);
    const [F] = flowMapIds(store).filter((id) => !before.includes(id));
    if (F === undefined) throw new Error("no FlowMap added");
    expect(session.draftOf(target)?.flowMap).toBe(F);
    session.land(
      target,
      { kind: "entry", entry: "section_a", from: { flowMap: "default", index: 0 } },
      0,
    );
    expect(sent.at(-1)).toEqual(set(F, ["section_a", "section_b"]));

    // The whole root: a Region over it, written once, then landed by its ID.
    const regionsBefore = manifestOf(store).timelines[0]?.regions.map((region) => region.id) ?? [];
    session.land(target, { kind: "root" });
    expect(sent.at(-2)).toEqual({
      type: "add",
      into: allegro,
      region: { start: [0, 1], end: [1644, 1] },
    });
    const [R] = (manifestOf(store).timelines[0]?.regions ?? [])
      .map((region) => region.id)
      .filter((id) => !regionsBefore.includes(id));
    expect(sent.at(-1)).toEqual(set(F, ["section_a", "section_b", R]));
    const count = sent.length;
    session.land(target, { kind: "root" });
    expect(sent.slice(count)).toEqual([set(F, ["section_a", "section_b", R, R])]);

    // A row: its virtual timeline written where none applies it.
    const virtualBefore = (manifestOf(store).virtual_timelines ?? []).map((item) => item.id);
    session.land(target, { kind: "row", flowMap: "printed" });
    expect(sent.at(-2)).toEqual({
      type: "add",
      into: { block: A },
      virtual_timeline: { map: "printed", timeline: ROOT },
    });
    const [V] = (manifestOf(store).virtual_timelines ?? [])
      .map((item) => item.id)
      .filter((id) => !virtualBefore.includes(id));
    expect(sent.at(-1)).toEqual(set(F, ["section_a", "section_b", R, R, V]));
    const rows = sent.length;
    session.land(target, { kind: "row", flowMap: "default" });
    expect(sent.slice(rows)).toEqual([
      set(F, ["section_a", "section_b", R, R, V, "allegro_default"]),
    ]);
  });

  it("moves, copies and removes the new FlowMap's entries", () => {
    const { session, target, sent } = opened();
    session.add(target);
    session.land(target, { kind: "element", id: "section_a" });
    session.land(target, { kind: "element", id: "section_b" });
    const F = session.draftOf(target)?.flowMap ?? "";
    session.move(target, 0, 2, false);
    expect(sent.at(-1)).toEqual(set(F, ["section_b", "section_a"]));
    session.move(target, 1, 0, true);
    expect(sent.at(-1)).toEqual(set(F, ["section_a", "section_b", "section_a"]));
    session.remove(target, 0);
    expect(sent.at(-1)).toEqual(set(F, ["section_b", "section_a"]));
  });

  it("adds a gap of an exact length, and refuses one that is none", () => {
    const { session, target, sent } = opened();
    session.add(target);
    session.land(target, { kind: "element", id: "section_a" });
    const F = session.draftOf(target)?.flowMap ?? "";
    expect(session.gap(target, "4")).toBeNull();
    expect(sent.at(-1)).toEqual(set(F, ["section_a", { gap: [4, 1] }]));
    const count = sent.length;
    expect(session.gap(target, "0")).toBe("a gap is longer than 0: 0");
    expect(typeof session.gap(target, "x")).toBe("string");
    expect(sent.length).toBe(count);
  });

  it("cancels the new row down to Add +, and keeps it on Done", () => {
    const { store, session, target } = opened();
    const before = JSON.stringify(manifestOf(store));
    session.add(target);
    const mark = store.entries.length;
    session.land(target, { kind: "root" });
    session.land(target, { kind: "row", flowMap: "printed" });
    session.cancel(target);
    expect(store.entries.length).toBe(mark);
    expect(JSON.stringify(manifestOf(store))).toBe(before);
    expect(session.draftOf(target)).toBeNull();
    session.add(target);
    session.land(target, { kind: "element", id: "section_c" });
    const F = session.draftOf(target)?.flowMap;
    session.done(target);
    expect(session.draftOf(target)).toBeNull();
    expect(flowMapIds(store)).toContain(F);
  });

  it("lands a swept stretch as the Region it writes, opening the new row", () => {
    const { store, session, target, sent } = opened();
    const regionsBefore = manifestOf(store).timelines[0]?.regions.map((region) => region.id) ?? [];
    session.land(target, { kind: "sweep", timeline: ROOT, start: [10, 1], end: [20, 1] });
    expect(sent[0]).toEqual({
      type: "add",
      into: allegro,
      region: { start: [10, 1], end: [20, 1] },
    });
    const [R] = (manifestOf(store).timelines[0]?.regions ?? [])
      .map((region) => region.id)
      .filter((id) => !regionsBefore.includes(id));
    expect(sent[1]).toEqual({ type: "add", into: allegro, flow_map: { chunks: [R] } });
  });

  it("places a row as a card, its virtual timeline written where none is", () => {
    const { store, session, target, sent } = opened();
    const virtualBefore = (manifestOf(store).virtual_timelines ?? []).map((item) => item.id);
    expect(session.place(target, "printed", 120, 400)).toBe(true);
    expect(sent[0]).toEqual({
      type: "add",
      into: { block: A },
      virtual_timeline: { map: "printed", timeline: ROOT },
    });
    const [V] = (manifestOf(store).virtual_timelines ?? [])
      .map((item) => item.id)
      .filter((id) => !virtualBefore.includes(id));
    const placed = sent[1];
    expect(placed?.type).toBe("set");
    if (placed?.type !== "set" || V === undefined) throw new Error("no place stored");
    expect(placed.changes[0]).toEqual({
      target: inBlock(A, idAddress(V)),
      values: { place: { x: 120, y: 400 } },
    });
    expect(placed.changes.length).toBe(1);
    expect(store.view.blocks[A]?.places[V]).toMatchObject({ x: 120, y: 400 });
    const count = sent.length;
    session.place(target, "default", 0, 600);
    expect(sent.length).toBe(count + 1);
  });
});

describe("recompute", () => {
  const manifest = block.manifest;

  it("stores nothing where the server's flows are the manifest's", () => {
    expect(recomputeCommands(manifest, A, ROOT, manifest)).toEqual([]);
  });

  it("replaces a computed FlowMap that changed, and adds a new atomic section first", () => {
    const flowMaps = manifest.flow_maps ?? [];
    const single = flowMaps.find((item) => item.id === "single");
    if (single === undefined) throw new Error("no single");
    const [root] = manifest.timelines;
    const first = root?.regions[0];
    if (root === undefined || first === undefined) throw new Error("no root");
    const extra = { ...first, id: "section_d", name: "D" };
    const answer: Manifest = {
      ...manifest,
      timelines: [{ ...root, regions: [...root.regions, extra] }],
      flow_maps: flowMaps.map((item) =>
        item.id === "single" ? { ...item, chunks: ["section_a", "section_b", "section_c"] } : item,
      ),
    };
    expect(recomputeCommands(manifest, A, ROOT, answer)).toEqual([
      { type: "add", into: allegro, region: extra },
      { type: "remove", targets: [inBlock(A, idAddress("single"))] },
      {
        type: "add",
        into: allegro,
        flow_map: {
          id: "single",
          chunks: ["section_a", "section_b", "section_c"],
          name: single.name,
          convention: "single",
          canonical: single.canonical,
          provenance: single.provenance,
        },
      },
    ]);
  });
});

describe("carrying a twin", () => {
  it("grows opaque towards the editor's border", () => {
    expect([-5, 0, 24, 48, 72, 96, 200].map(twinOpacity)).toEqual([
      1, 1, 0.8, 0.6000000000000001, 0.4, 0.2, 0.2,
    ]);
  });

  it("measures the distance inside the editor's rectangle from its nearest edge", () => {
    const editor = unionRect(
      { left: 100, top: 100, right: 300, bottom: 160 },
      { left: 100, top: 166, right: 500, bottom: 300 },
    );
    expect(editor).toEqual({ left: 100, top: 100, right: 500, bottom: 300 });
    expect(insideDistance(editor, { x: 130, y: 250 })).toBe(30);
    expect(insideDistance(editor, { x: 520, y: 250 })).toBe(-20);
    expect(insideDistance(editor, { x: 100, y: 200 })).toBe(0);
  });

  it("lands on the new row, flies back inside, and makes a row a card beyond the border", () => {
    const editor = { left: 100, top: 100, right: 500, bottom: 300 };
    const draft = { left: 100, top: 250, right: 500, bottom: 300 };
    expect(dropAt({ x: 200, y: 260 }, editor, draft, true)).toBe("draft");
    expect(dropAt({ x: 200, y: 260 }, editor, draft, false)).toBe("draft");
    expect(dropAt({ x: 200, y: 150 }, editor, draft, true)).toBe("back");
    expect(dropAt({ x: 600, y: 150 }, editor, draft, true)).toBe("canvas");
    expect(dropAt({ x: 600, y: 150 }, editor, draft, false)).toBe("back");
    expect(dropAt({ x: 200, y: 260 }, editor, null, true)).toBe("back");
  });

  it("inserts before the first drawn entry whose middle lies right of the pointer", () => {
    const spans = [
      { index: 0, x1: 0, x2: 10 },
      { index: 4, x1: 10, x2: 30 },
      { index: 5, x1: 30, x2: 40 },
    ];
    expect([-1, 4, 6, 19, 21, 36, 50].map((x) => dropIndex(spans, x, 6))).toEqual([
      0, 0, 4, 4, 5, 6, 6,
    ]);
  });
});
