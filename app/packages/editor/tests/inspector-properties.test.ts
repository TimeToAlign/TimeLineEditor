/// <reference types="node" />
/**
 * The Properties form edits the selected element's own geometry; the
 * expected values are derived in `README.md` ("The inspector", case 11).
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import type { Level, LivePlacement } from "@timetoalign/tilie-arranger";
import { drawingOf, liveStore } from "@timetoalign/tilie-arranger";
import type { Block, CommandEntry, Store } from "@timetoalign/tilie-core";
import { createStore, isLoadError, readWorkspace } from "@timetoalign/tilie-core";
import type { Drawing } from "@timetoalign/tilie-layout";
import { fontMetrics } from "@timetoalign/timeskeleton";
import { flushSync, mount, unmount } from "svelte";
import { afterEach, describe, expect, it } from "vitest";
import Inspector from "../src/inspector/Inspector.svelte";
import type { Geometry } from "../src/inspector/properties.ts";
import {
  commonValue,
  FIELDS,
  fieldLabel,
  geometryOf,
  offered,
  propertyCommand,
  stepCommand,
} from "../src/inspector/properties.ts";
import { holder } from "./holder.svelte.ts";

const M = "bmixed0000";
const GEOMETRY_HINT = "Select a block, a frame or a card to edit its geometry.";

/** The changes stating the drawn position of an item that states none. */
const G2 = { target: `${M}/group_2`, values: { place: { x: 8, y: 176.3671875 } } };
const AN = { target: `${M}/annotations`, values: { place: { x: 8, y: 358.50390625 } } };

/** `G2` and `AN` for `group_2` and `annotations` drawn at `y` `group2` and `annotations`. */
function positions(group2: number, annotations: number) {
  return [
    { target: `${M}/group_2`, values: { place: { x: 8, y: group2 } } },
    { target: `${M}/annotations`, values: { place: { x: 8, y: annotations } } },
  ];
}

/** `group_1`'s drawn width, 562.484619140625, quantized to 1/2048: the group editor pins it. */
const PINNED = 562.48486328125;

/** The places a Stretch of `group_1` by 60 previews, and stores on release, in the bundle editor. */
const STRETCHED = {
  group_1: { length: 460 },
  group_2: { x: 8, y: 176.3671875 },
  annotations: { x: 8, y: 358.50390625 },
};

/** A store reading the end-to-end `bundles` workspace, the generator's output. */
function storeOf(): Store {
  const text = readFileSync(
    path.join(import.meta.dirname, "..", "..", "..", "e2e", "fixtures", "bundles.tle.json"),
    "utf8",
  );
  const read = readWorkspace(text);
  if (isLoadError(read)) throw new Error("bundles.tle.json is refused");
  return createStore(read);
}

function dispatch(store: Store, target: string, values: { [property: string]: unknown }): void {
  const refusal = store.dispatch({ type: "set", changes: [{ target, values }] });
  if (refusal !== null) throw new Error(refusal.message);
}

/** The drawing of block `M` as the canvas draws it. */
function drawingOfMixed(store: Store): Drawing {
  return drawingOf(store.view.blocks[M] as Block, store.view.settings, fontMetrics);
}

/** The live placement of block `M` as stored, its drawing that of the block with `places`. */
function livePlacementOf(store: Store, places: Block["places"]): LivePlacement {
  const block = store.view.blocks[M] as Block;
  const { x, y, scale, length, spacing, width, height } = block;
  const drawing = drawingOf(block, store.view.settings, fontMetrics, { places });
  return { id: M, x, y, scale, length, spacing, width, height, drawing };
}

function geometry(store: Store, ...elements: string[]): Geometry {
  return geometryAt(store, "arranger", ...elements);
}

function geometryAt(store: Store, level: Level, ...elements: string[]): Geometry {
  const found = geometryOf(
    store.view,
    elements.map((element) => (element === "" ? M : `${M}/${element}`)),
    level,
  );
  if (found === null) throw new Error(`no geometry for ${elements.join(", ")}`);
  return found;
}

function changes(result: ReturnType<typeof propertyCommand>): unknown {
  if (!result.ok) throw new Error(result.problems[0]?.message);
  return result.value.changes;
}

describe("geometryOf", () => {
  it("names the block's placement", () => {
    const store = storeOf();
    const found = geometry(store, "");
    expect([found.kind, found.label]).toEqual(["block", "Block properties"]);
    expect(found.elements).toEqual([
      {
        target: M,
        group: null,
        values: { x: 0, y: 0, scale: 1, length: 400, spacing: 1, width: null, height: null },
      },
    ]);
  });

  it.each(["group_1", "group_1/name"])("names group_1's frame for %s", (element) => {
    const store = storeOf();
    const found = geometry(store, element);
    const place = drawingOfMixed(store).items.find((item) => item.key === "group_1")?.place;
    expect([found.kind, found.label]).toEqual(["item", "Frame properties"]);
    expect(found.elements).toEqual([
      {
        target: `${M}/group_1`,
        group: null,
        values: {
          x: place?.x,
          y: place?.y,
          scale: 1,
          length: 400,
          spacing: 1,
          width: place?.width,
          height: place?.height,
        },
      },
    ]);
  });

  it.each(["annotations/card", "annotations"])("names the ungrouped card for %s", (element) => {
    const found = geometry(storeOf(), element);
    expect([found.kind, found.label]).toEqual(["item", "Card properties"]);
    expect(found.elements.map((item) => [item.target, item.group])).toEqual([
      [`${M}/annotations`, null],
    ]);
  });

  it("names a member's card with its group", () => {
    const store = storeOf();
    const found = geometry(store, "score/card");
    const size = drawingOfMixed(store).cards.find((card) => card.key === "score")?.size;
    expect([found.kind, found.label]).toEqual(["card", "Card properties"]);
    expect(found.elements).toEqual([
      {
        target: `${M}/score`,
        group: `${M}/group_1`,
        values: { scale: 1, length: 400, spacing: 1, width: size?.width, height: size?.height },
      },
    ]);
    expect(geometry(store, "excerpt/card").elements.map((item) => item.group)).toEqual([
      `${M}/group_2`,
    ]);
  });

  it("gathers several elements of one kind", () => {
    const store = storeOf();
    expect(geometry(store, "group_1", "group_2").elements.map((item) => item.target)).toEqual([
      `${M}/group_1`,
      `${M}/group_2`,
    ]);
    const mixed = geometry(store, "group_1", "annotations/card");
    expect([mixed.kind, mixed.label]).toEqual(["item", "Frame and card properties"]);
    expect(geometry(store, "annotations", "annotations/card").elements).toHaveLength(1);
  });

  it.each([
    ["no selection", []],
    ["two kinds", [`${M}/group_1`, `${M}/score/card`]],
    ["the block with a frame", [M, `${M}/group_1`]],
    ["the title", [`${M}/name`]],
    ["a root drawn only as an ancestor", [`${M}/recording`]],
    ["two blocks", [`${M}/group_1`, "bshared000/group_1"]],
  ])("gives null for %s", (_case, selection) => {
    expect(geometryOf(storeOf().view, selection)).toBe(null);
  });

  it("shows stated values over drawn ones", () => {
    const store = storeOf();
    dispatch(store, `${M}/group_1`, { place: { length: 300, scale: 1.5, spacing: 2 } });
    dispatch(store, `${M}/score`, { place: { width: 650, spacing: 1.25 } });
    const [frame] = geometry(store, "group_1").elements;
    expect([frame?.values.length, frame?.values.scale, frame?.values.spacing]).toEqual([
      300, 1.5, 2,
    ]);
    const [card] = geometry(store, "score/card").elements;
    expect([
      card?.values.scale,
      card?.values.length,
      card?.values.width,
      card?.values.spacing,
    ]).toEqual([1.5, 300, 650, 1.25]);
  });
});

describe("the commands", () => {
  it("aims at the element's place", () => {
    const store = storeOf();
    expect(propertyCommand(geometry(store, "group_1"), "length", "300")).toEqual({
      ok: true,
      value: {
        type: "set",
        changes: [{ target: `${M}/group_1`, values: { place: { length: 300 } } }, G2, AN],
      },
    });
    const card = geometry(store, "score/card");
    expect(changes(propertyCommand(card, "scale", "1.5"))).toEqual([
      { target: `${M}/group_1`, values: { place: { scale: 1.5 } } },
      G2,
      AN,
    ]);
    expect(changes(propertyCommand(card, "width", "650"))).toEqual([
      { target: `${M}/score`, values: { place: { width: 650 } } },
      G2,
      AN,
    ]);
    expect(changes(propertyCommand(card, "width", ""))).toEqual([
      { target: `${M}/score`, values: { place: { width: null } } },
      G2,
      AN,
    ]);
    const refused = propertyCommand(card, "length", "");
    expect(
      refused.ok ? null : refused.problems.map((item) => [item.code, item.message, item.path]),
    ).toEqual([["invalid_value", "length needs a number", [`${M}/score`, "length"]]]);
  });

  it("states spacing on the frame's place and on the member card's own", () => {
    const store = storeOf();
    expect(changes(propertyCommand(geometry(store, "group_1"), "spacing", "1.5"))).toEqual([
      { target: `${M}/group_1`, values: { place: { spacing: 1.5 } } },
      G2,
      AN,
    ]);
    const card = geometry(store, "score/card");
    expect(changes(propertyCommand(card, "spacing", "1.5"))).toEqual([
      { target: `${M}/score`, values: { place: { spacing: 1.5 } } },
      G2,
      AN,
    ]);
    const refused = propertyCommand(card, "spacing", "");
    expect(
      refused.ok ? null : refused.problems.map((item) => [item.code, item.message, item.path]),
    ).toEqual([["invalid_value", "spacing needs a number", [`${M}/score`, "spacing"]]]);
  });

  it("changes several elements in one set, each target once", () => {
    const store = storeOf();
    expect(
      changes(propertyCommand(geometry(store, "group_1", "group_2"), "length", "350")),
    ).toEqual([
      { target: `${M}/group_1`, values: { place: { length: 350 } } },
      { target: `${M}/group_2`, values: { place: { length: 350 } } },
      AN,
    ]);
    const cards = geometry(store, "performance/card", "score/card");
    expect(changes(propertyCommand(cards, "scale", "2"))).toEqual([
      { target: `${M}/group_1`, values: { place: { scale: 2 } } },
      G2,
      AN,
    ]);
    expect(changes(propertyCommand(cards, "width", "500"))).toEqual([
      { target: `${M}/performance`, values: { place: { width: 500 } } },
      { target: `${M}/score`, values: { place: { width: 500 } } },
      G2,
      AN,
    ]);
  });

  it("steps each element from its own value", () => {
    const store = storeOf();
    dispatch(store, `${M}/group_1`, { place: { length: 300 } });
    const frames = geometry(store, "group_1", "group_2");
    expect(stepCommand(frames, "length", 1).changes).toEqual([
      { target: `${M}/group_1`, values: { place: { length: 301 } } },
      { target: `${M}/group_2`, values: { place: { length: 401 } } },
      AN,
    ]);
    expect(commonValue(frames, "length")).toBe(undefined);
    expect(commonValue(geometry(storeOf(), "group_1", "group_2"), "length")).toBe(400);
  });

  it("follows the gestures' rule of each level", () => {
    const store = storeOf();
    const scaled = [{ target: `${M}/group_1`, values: { place: { scale: 1.5 } } }];
    expect(changes(propertyCommand(geometry(store, "group_1"), "scale", "1.5"))).toEqual([
      ...scaled,
      G2,
      AN,
    ]);
    expect(
      changes(propertyCommand(geometryAt(store, "bundle", "group_1"), "scale", "1.5")),
    ).toEqual([...scaled, G2, AN]);
    expect(
      changes(propertyCommand(geometryAt(store, "group", "score/card"), "scale", "1.5")),
    ).toEqual(scaled);
    expect(
      changes(propertyCommand(geometryAt(store, "timeline", "score/card"), "width", "650")),
    ).toEqual([{ target: `${M}/score`, values: { place: { width: 650 } } }]);
    const spaced = [{ target: `${M}/score`, values: { place: { spacing: 1.5 } } }];
    for (const level of ["group", "timeline"] as const) {
      expect(
        changes(propertyCommand(geometryAt(store, level, "score/card"), "spacing", "1.5")),
      ).toEqual(spaced);
    }
    dispatch(store, `${M}/group_2`, { place: { y: 200 } });
    expect(changes(propertyCommand(geometry(store, "group_1"), "scale", "1.5"))).toEqual([
      ...scaled,
      { target: `${M}/group_2`, values: { place: { x: 8 } } },
      { target: `${M}/annotations`, values: { place: { x: 8, y: 382.13671875 } } },
    ]);
  });

  it("writes a typed length or spacing as a stretch to it, stated sizes in proportion", () => {
    const wide = storeOf();
    dispatch(wide, `${M}/performance`, { place: { width: 1092.96923828125 } });
    const widened = [
      { target: `${M}/group_1`, values: { place: { length: 430 } } },
      { target: `${M}/performance`, values: { place: { width: 1152.96923828125 } } },
      G2,
      AN,
    ];
    expect(changes(propertyCommand(geometry(wide, "score/card"), "length", "430"))).toEqual(
      widened,
    );
    expect(changes(propertyCommand(geometry(wide, "group_1"), "length", "430"))).toEqual(widened);
    const tallCard = storeOf();
    dispatch(tallCard, `${M}/performance`, { place: { height: 98.7578125 } });
    expect(changes(propertyCommand(geometry(tallCard, "group_1"), "spacing", "2"))).toEqual([
      { target: `${M}/group_1`, values: { place: { spacing: 2 } } },
      { target: `${M}/performance`, values: { place: { height: 130.7578125 } } },
      ...positions(225.74609375, 407.8828125),
    ]);
    const tallFrame = storeOf();
    dispatch(tallFrame, `${M}/group_1`, { place: { height: 279.125 } });
    expect(changes(propertyCommand(geometry(tallFrame, "score/card"), "spacing", "2"))).toEqual([
      { target: `${M}/score`, values: { place: { spacing: 2 } } },
      { target: `${M}/group_1`, values: { place: { height: 311.125 } } },
      ...positions(315.9296875, 498.06640625),
    ]);
  });

  it("caps a length in the group editor as a stretch does", () => {
    const store = storeOf();
    const capped = (length: number, width: number) => [
      { target: `${M}/group_1`, values: { place: { length, width } } },
    ];
    expect(
      changes(propertyCommand(geometryAt(store, "group", "group_1"), "length", "500")),
    ).toEqual(capped(400, PINNED));
    expect(
      changes(propertyCommand(geometryAt(store, "group", "score/card"), "length", "300")),
    ).toEqual(capped(300, PINNED));
    expect(stepCommand(geometryAt(store, "group", "group_1"), "length", 1).changes).toEqual(
      capped(400, PINNED),
    );
    expect(changes(propertyCommand(geometry(store, "group_1"), "length", "500"))).toEqual([
      { target: `${M}/group_1`, values: { place: { length: 500 } } },
      G2,
      AN,
    ]);
    dispatch(store, `${M}/group_1`, { place: { width: 600 } });
    expect(
      changes(propertyCommand(geometryAt(store, "group", "group_1"), "length", "500")),
    ).toEqual(capped(437.51513671875, 600));
    const wide = storeOf();
    dispatch(wide, `${M}/performance`, { place: { width: 1092.96923828125 } });
    expect(
      changes(propertyCommand(geometryAt(wide, "group", "score/card"), "length", "350")),
    ).toEqual([
      { target: `${M}/group_1`, values: { place: { length: 350, width: 1108.96923828125 } } },
      { target: `${M}/performance`, values: { place: { width: 992.96923828125 } } },
    ]);
  });

  it("offers an item's position in the bundle editor only", () => {
    const store = storeOf();
    const offers = (level: Level, element: string) => {
      const found = geometryAt(store, level, element);
      return FIELDS[found.kind].filter((property) => offered(found, property));
    };
    const sized = ["scale", "length", "spacing", "width", "height"];
    for (const level of ["arranger", "group", "timeline"] as const) {
      expect(offers(level, "group_1")).toEqual(sized);
      expect(offers(level, "annotations/card")).toEqual(sized);
    }
    expect(offers("bundle", "group_1")).toEqual(["x", "y", ...sized]);
    for (const level of ["arranger", "bundle", "group", "timeline"] as const) {
      expect(offers(level, "score/card")).toEqual(sized);
    }
    expect(offers("arranger", "")).toEqual(["x", "y", ...sized]);
    expect(offers("group", "")).toEqual(["x", "y", "width", "height"]);
    expect(offered(null, "x")).toBe(true);
  });

  it("reads items and cards from the drawing a gesture shows", () => {
    const store = storeOf();
    const live = livePlacementOf(store, { group_1: { length: 460 } });
    const values = (element: string, placement: LivePlacement | null) => {
      const found = geometryOf(store.view, [`${M}/${element}`], "bundle", placement);
      const [only] = found?.elements ?? [];
      return [only?.values.length, only?.values.width];
    };
    expect(values("group_1", live)).toEqual([460, 622.484619140625]);
    expect(values("score/card", live)).toEqual([460, 606.484619140625]);
    expect(values("group_1", { ...live, id: "bshared000" })).toEqual([400, 562.484619140625]);
    expect(values("group_1", null)).toEqual([400, 562.484619140625]);
    const spaced = livePlacementOf(store, { group_1: { spacing: 2 }, score: { spacing: 1.5 } });
    const spacing = (element: string, placement: LivePlacement | null) =>
      geometryOf(store.view, [`${M}/${element}`], "bundle", placement)?.elements[0]?.values.spacing;
    expect([spacing("group_1", spaced), spacing("score/card", spaced)]).toEqual([2, 1.5]);
    expect([spacing("group_1", null), spacing("score/card", null)]).toEqual([1, 1]);
  });

  it("labels a card's shared fields as the group's", () => {
    expect(
      (["scale", "length", "spacing", "width", "height"] as const).map((property) =>
        fieldLabel("card", property),
      ),
    ).toEqual(["group scale", "group length", "spacing", "width", "height"]);
    expect(fieldLabel("item", "scale")).toBe("scale");
  });
});

describe("the Properties form", () => {
  let app: ReturnType<typeof mount> | undefined;

  function clear(): void {
    if (app !== undefined) unmount(app);
    app = undefined;
    document.body.innerHTML = "";
  }

  afterEach(clear);

  function show(
    store: Store,
    elements: string[],
    placement = holder<LivePlacement | null>(null),
  ): void {
    app = mount(Inspector, {
      target: document.body,
      props: {
        live: liveStore(store),
        selection: new Set(elements.map((element) => (element === "" ? M : `${M}/${element}`))),
        get placement() {
          return placement.value;
        },
      },
    });
    flushSync();
  }

  /** Open the editor of `target`, before the inspector is mounted. */
  function open(store: Store, target: string): void {
    const refusal = store.open(target);
    if (refusal !== null) throw new Error(refusal.message);
  }

  function properties(): void {
    (document.getElementById("inspector-tab-properties") as HTMLButtonElement).click();
    flushSync();
  }

  function panel(): HTMLElement {
    return document.getElementById("inspector-panel-properties") as HTMLElement;
  }

  function forms(): string[] {
    return [...panel().querySelectorAll("form")].map(
      (form) => form.getAttribute("aria-label") ?? "",
    );
  }

  function fields(): string[] {
    return [...panel().querySelectorAll<HTMLInputElement>("input[type=number]")].map(
      (input) => input.name,
    );
  }

  function field(name: string): HTMLInputElement {
    return panel().querySelector(`input[name="${name}"]`) as HTMLInputElement;
  }

  function enter(name: string, value: string): void {
    const input = field(name);
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    flushSync();
  }

  function lastCommand(store: Store): unknown {
    return (store.journal.at(-1) as CommandEntry | undefined)?.command;
  }

  it("edits a frame's place, never the block's", () => {
    const store = storeOf();
    show(store, ["group_1"]);
    expect(forms()).toEqual(["Frame properties"]);
    expect(fields()).toEqual(["x", "y", "scale", "length", "spacing", "width", "height"]);
    expect([field("length").value, field("scale").value, field("spacing").value]).toEqual([
      "400",
      "1",
      "1",
    ]);
    const before = store.journal.length;
    enter("length", "300");
    expect(store.journal).toHaveLength(before + 1);
    expect(lastCommand(store)).toEqual({
      type: "set",
      changes: [{ target: `${M}/group_1`, values: { place: { length: 300 } } }, G2, AN],
    });
    expect(store.view.blocks[M]?.length).toBe(400);
    expect(field("length").value).toBe("300");
    enter("spacing", "1.5");
    expect(store.journal).toHaveLength(before + 2);
    expect(lastCommand(store)).toEqual({
      type: "set",
      changes: [{ target: `${M}/group_1`, values: { place: { spacing: 1.5 } } }],
    });
    expect(store.view.blocks[M]?.spacing).toBe(1);
    expect(field("spacing").value).toBe("1.5");
  });

  it("edits a member's card: its group's scale, its own size", () => {
    const store = storeOf();
    show(store, ["score/card"]);
    expect(forms()).toEqual(["Card properties"]);
    expect(fields()).toEqual(["scale", "length", "spacing", "width", "height"]);
    expect(
      [...panel().querySelectorAll("form label span")].map((span) => span.textContent),
    ).toEqual(["group scale", "group length", "spacing", "width", "height"]);
    expect(field("spacing").value).toBe("1");
    enter("scale", "1.5");
    expect(lastCommand(store)).toEqual({
      type: "set",
      changes: [{ target: `${M}/group_1`, values: { place: { scale: 1.5 } } }, G2, AN],
    });
    enter("width", "650");
    expect(lastCommand(store)).toEqual({
      type: "set",
      changes: [{ target: `${M}/score`, values: { place: { width: 650 } } }],
    });
    enter("width", "");
    expect(lastCommand(store)).toEqual({
      type: "set",
      changes: [{ target: `${M}/score`, values: { place: { width: null } } }],
    });
    expect(Object.hasOwn(store.view.blocks[M]?.places ?? {}, "score")).toBe(false);
    enter("spacing", "1.5");
    expect(lastCommand(store)).toEqual({
      type: "set",
      changes: [{ target: `${M}/score`, values: { place: { spacing: 1.5 } } }],
    });
    const places = store.view.blocks[M]?.places;
    expect([places?.score, places?.group_1?.spacing]).toEqual([{ spacing: 1.5 }, undefined]);
    expect(field("spacing").value).toBe("1.5");
  });

  it("edits several frames together", () => {
    const store = storeOf();
    show(store, ["group_1", "group_2"]);
    const before = store.journal.length;
    enter("length", "350");
    expect(store.journal).toHaveLength(before + 1);
    expect(lastCommand(store)).toEqual({
      type: "set",
      changes: [
        { target: `${M}/group_1`, values: { place: { length: 350 } } },
        { target: `${M}/group_2`, values: { place: { length: 350 } } },
        AN,
      ],
    });
    const places = store.view.blocks[M]?.places;
    expect([places?.group_1?.length, places?.group_2?.length]).toEqual([350, 350]);
  });

  it("shows differing values as mixed and steps each", () => {
    const store = storeOf();
    dispatch(store, `${M}/group_1`, { place: { length: 300 } });
    show(store, ["group_1", "group_2"]);
    expect([field("length").value, field("length").placeholder]).toEqual(["", "mixed"]);
    const before = store.journal.length;
    field("length").dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, cancelable: true }),
    );
    flushSync();
    expect(store.journal).toHaveLength(before + 1);
    expect(lastCommand(store)).toEqual({
      type: "set",
      changes: [
        { target: `${M}/group_1`, values: { place: { length: 301 } } },
        { target: `${M}/group_2`, values: { place: { length: 401 } } },
        AN,
      ],
    });
  });

  it("edits only the group's place in the group editor, the others' too in the bundle editor", () => {
    const store = storeOf();
    open(store, `${M}/group_1`);
    show(store, ["score/card"]);
    properties();
    enter("scale", "1.5");
    expect((store.entries.at(-1) as CommandEntry | undefined)?.command).toEqual({
      type: "set",
      changes: [{ target: `${M}/group_1`, values: { place: { scale: 1.5 } } }],
    });
    enter("length", "500");
    expect((store.entries.at(-1) as CommandEntry | undefined)?.command).toEqual({
      type: "set",
      changes: [{ target: `${M}/group_1`, values: { place: { length: 400, width: PINNED } } }],
    });
    clear();

    const bundle = storeOf();
    open(bundle, M);
    show(bundle, ["group_1"]);
    properties();
    enter("scale", "1.5");
    expect((bundle.entries.at(-1) as CommandEntry | undefined)?.command).toEqual({
      type: "set",
      changes: [{ target: `${M}/group_1`, values: { place: { scale: 1.5 } } }, G2, AN],
    });
  });

  it("disables an item's x and y outside the bundle editor", () => {
    const disabled = () =>
      ["x", "y", "scale", "length", "spacing", "width", "height"].map(
        (name) => field(name).disabled,
      );
    const outside = [true, true, false, false, false, false, false];
    show(storeOf(), ["group_1"]);
    expect(disabled()).toEqual(outside);
    clear();

    const bundle = storeOf();
    open(bundle, M);
    show(bundle, ["group_1"]);
    properties();
    expect(disabled()).toEqual([false, false, false, false, false, false, false]);
    clear();

    const group = storeOf();
    open(group, `${M}/group_1`);
    show(group, ["group_1"]);
    properties();
    expect(disabled()).toEqual(outside);
  });

  it("follows a gesture on the block live, items and cards alike", () => {
    const store = storeOf();
    open(store, M);
    const gesture = holder<LivePlacement | null>(null);
    show(store, ["group_1"], gesture);
    properties();
    expect([field("length").value, field("width").value]).toEqual(["400", "562.48"]);
    gesture.value = livePlacementOf(store, STRETCHED);
    flushSync();
    expect([field("length").value, field("width").value]).toEqual(["460", "622.48"]);
    expect(store.entries).toHaveLength(0);
    gesture.value = null;
    flushSync();
    expect([field("length").value, field("width").value]).toEqual(["400", "562.48"]);
    clear();

    show(store, ["score/card"], holder<LivePlacement | null>(livePlacementOf(store, STRETCHED)));
    properties();
    expect([field("length").value, field("width").value]).toEqual(["460", "606.48"]);
  });

  it("shows the block's seven fields for the block", () => {
    show(storeOf(), [""]);
    expect(forms()).toEqual(["Block properties"]);
    expect(fields()).toEqual(["x", "y", "scale", "length", "spacing", "width", "height"]);
  });

  it.each([
    ["two kinds", ["group_1", "score/card"]],
    ["the title", ["name"]],
  ])("shows only the hint for %s", (_case, elements) => {
    show(storeOf(), elements);
    expect(panel().textContent?.trim()).toBe(GEOMETRY_HINT);
    expect(forms()).toEqual([]);
  });
});
