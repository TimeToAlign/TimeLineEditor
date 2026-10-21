/// <reference types="node" />
/**
 * The Properties form edits the selected containers' own geometry; the
 * expected values are derived in `README.md` ("The Properties form").
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import type { Level, LivePlacement, PlaceProperty } from "@timetoalign/tilie-arranger";
import { drawingOf, liveStore, placeEdit, resolveSelection } from "@timetoalign/tilie-arranger";
import type { Block, CommandEntry, Store } from "@timetoalign/tilie-core";
import { createStore, isLoadError, readWorkspace } from "@timetoalign/tilie-core";
import type { Drawing, DrawnBox } from "@timetoalign/tilie-layout";
import { fontMetrics } from "@timetoalign/timetoshare";
import { flushSync, mount, unmount } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import Inspector from "../src/inspector/Inspector.svelte";
import type { Geometry, Shown } from "../src/inspector/properties.ts";
import {
  commonValue,
  decimalOf,
  fieldLabel,
  geometryOf,
  propertyCommand,
  STEPS,
  shownValue,
  stepCommand,
  stepValue,
} from "../src/inspector/properties.ts";
import { holder } from "./holder.svelte.ts";

const M = "bmixed0000";
/** The members of a place, in the order a place is written and the form shows them. */
const PLACE = ["x", "y", "length", "scale", "spacing", "width", "height"] as const;
/** The fields' labels in place order: the size is the container's. */
const LABELS = PLACE.map((property) =>
  property === "width" || property === "height" ? `container ${property}` : property,
);
const GEOMETRY_HINT = "Select a block, a frame or a card to edit its geometry.";

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

function blockOf(store: Store, id = M): Block {
  const block = store.view.blocks[id];
  if (block === undefined) throw new Error(`no block ${id}`);
  return block;
}

function dispatch(store: Store, target: string, values: { [property: string]: unknown }): void {
  const refusal = store.dispatch({ type: "set", changes: [{ target, values }] });
  if (refusal !== null) throw new Error(refusal.message);
}

/** `M`'s addresses of `elements`; `""` names the block. */
function addresses(...elements: string[]): Set<string> {
  return new Set(elements.map((element) => (element === "" ? M : `${M}/${element}`)));
}

/** What the canvas shows of `M` without a gesture: the stored placement and drawing. */
function stored(store: Store): Shown {
  const block = blockOf(store);
  return { ...block, drawing: drawingOf(block, store.view.settings, fontMetrics) };
}

/** A gesture's placement of `M`: its stored placement, its drawing that of the block with `places`. */
function livePlacementOf(store: Store, places: Block["places"]): LivePlacement {
  const block = blockOf(store);
  const { x, y, scale, length, spacing, width, height } = block;
  const drawing = drawingOf(block, store.view.settings, fontMetrics, { places });
  return { id: M, x, y, scale, length, spacing, width, height, drawing };
}

function geometryIn(
  store: Store,
  elements: string[],
  level: Level = "arranger",
  shown: Shown = stored(store),
): Geometry | null {
  const subjects = resolveSelection(store.view, addresses(...elements), fontMetrics);
  return geometryOf(blockOf(store), subjects, shown, level);
}

function geometry(store: Store, ...elements: string[]): Geometry {
  const found = geometryIn(store, elements);
  if (found === null) throw new Error(`no geometry for ${elements.join(", ")}`);
  return found;
}

/** The record of the container at `address` in `drawing`. */
function recorded(drawing: Drawing, kind: DrawnBox["kind"], address: string): DrawnBox {
  const found = drawing.boxes.find((box) => box.kind === kind && box.address === address);
  if (found === undefined) throw new Error(`no ${kind} ${address}`);
  return found;
}

/** An item's values as the drawing records them: stated, else drawn. */
function itemValues(box: DrawnBox) {
  const item = box.item;
  if (item === undefined) throw new Error(`${box.address} is no item`);
  const { place, stated } = item;
  return {
    x: stated.x ?? place.x,
    y: stated.y ?? place.y,
    scale: stated.scale ?? place.scale,
    length: stated.length ?? place.length,
    spacing: stated.spacing ?? place.spacing,
    width: stated.width ?? place.width,
    height: stated.height ?? place.height,
  };
}

describe("the geometry", () => {
  it("names the box for the block", () => {
    expect(geometry(storeOf(), "")).toMatchObject({
      role: "box",
      label: "Block properties",
      elements: [
        {
          kind: "box",
          holder: null,
          address: M,
          values: { x: 0, y: 0, scale: 1, length: 400, spacing: 8, width: null, height: null },
        },
      ],
    });
  });

  it.each(["group_1", "group_1/name"])("names group_1's frame for %s", (element) => {
    const store = storeOf();
    const frame = recorded(stored(store).drawing, "frame", "group_1");
    expect(geometry(store, element)).toMatchObject({
      role: "item",
      label: "Frame properties",
      elements: [
        { kind: "frame", holder: null, address: `${M}/${element}`, values: itemValues(frame) },
      ],
    });
    expect(itemValues(frame)).toMatchObject({ scale: 1, length: 400, spacing: 8 });
  });

  it.each(["annotations/card", "annotations"])("names the card the box holds for %s", (element) => {
    const store = storeOf();
    const card = recorded(stored(store).drawing, "card", "annotations/card");
    expect(geometry(store, element)).toMatchObject({
      role: "item",
      label: "Card properties",
      elements: [{ kind: "card", holder: "box", values: itemValues(card) }],
    });
  });

  it.each([
    ["group_1/score/card", "group_1"],
    ["group_2/excerpt/card", "group_2"],
  ])("names %s, held by the frame of %s, with its frame's scale and length", (element, group) => {
    const store = storeOf();
    const { drawing } = stored(store);
    const card = recorded(drawing, "card", element).card;
    const frame = recorded(drawing, "frame", group).item?.place;
    expect(geometry(store, element)).toMatchObject({
      role: "held",
      label: "Card properties",
      elements: [
        {
          kind: "card",
          holder: "frame",
          values: {
            scale: frame?.scale,
            length: frame?.length,
            spacing: card?.spacing,
            width: card?.size.width,
            height: card?.size.height,
          },
        },
      ],
    });
  });

  it("gathers several containers of one role, each once, in selection order", () => {
    const store = storeOf();
    const two = geometry(store, "group_1", "group_2");
    expect([two.role, two.label, two.elements.map((element) => element.address)]).toEqual([
      "item",
      "Frame properties",
      [`${M}/group_1`, `${M}/group_2`],
    ]);
    expect(geometry(store, "group_1", "annotations/card").label).toBe("Frame and card properties");
    expect(geometry(store, "annotations", "annotations/card").elements).toHaveLength(1);
  });

  it.each([
    [[]],
    [["group_1", "group_1/score/card"]],
    [["", "group_1"]],
    [["name"]],
    [["recording"]],
    [["score/tempo"]],
  ])("gives none for %j", (elements) => {
    expect(geometryIn(storeOf(), elements)).toBe(null);
  });

  it("gives none for addresses in two blocks", () => {
    const store = storeOf();
    const subjects = resolveSelection(
      store.view,
      new Set([`${M}/group_1`, "bshared000/group_1"]),
      fontMetrics,
    );
    expect(geometryOf(blockOf(store), subjects, stored(store), "arranger")).toBe(null);
  });

  it("shows stated values over drawn ones, a held card's spacing its own", () => {
    const store = storeOf();
    dispatch(store, `${M}/group_1`, { place: { length: 300, scale: 1.5, spacing: 2 } });
    dispatch(store, `${M}/score`, { place: { width: 650, spacing: 1.25 } });
    expect(geometry(store, "group_1").elements[0]?.values).toMatchObject({
      length: 300,
      scale: 1.5,
      spacing: 2,
    });
    expect(geometry(store, "group_1/score/card").elements[0]?.values).toMatchObject({
      scale: 1.5,
      length: 300,
      width: 650,
      spacing: 1.25,
    });
  });

  it("reads the drawing a gesture shows", () => {
    const store = storeOf();
    const live = livePlacementOf(store, { group_1: { length: 460 } });
    const frame = itemValues(recorded(live.drawing, "frame", "group_1"));
    expect(geometryIn(store, ["group_1"], "arranger", live)?.elements[0]?.values).toEqual(frame);
    expect(frame.length).toBe(460);
    const card = recorded(live.drawing, "card", "group_1/score/card").card;
    expect(
      geometryIn(store, ["group_1/score/card"], "arranger", live)?.elements[0]?.values,
    ).toMatchObject({
      length: 460,
      width: card?.size.width,
    });
    const moved = { ...live, x: 5.556 };
    expect(geometryIn(store, [""], "arranger", moved)?.elements[0]?.values.x).toBe(5.556);
  });

  it("gives the value every element shares, none when they differ", () => {
    const store = storeOf();
    expect(commonValue(geometry(store, "group_1", "group_2"), "length")).toBe(400);
    dispatch(store, `${M}/group_1`, { place: { length: 300 } });
    expect(commonValue(geometry(store, "group_1", "group_2"), "length")).toBe(undefined);
  });
});

describe("the fields", () => {
  it("offers each role's fields, labelling a held card's shared ones as the group's", () => {
    const store = storeOf();
    const labels = (element: string) => {
      const found = geometryIn(store, [element]);
      if (found === null) throw new Error("no geometry");
      return found.fields.map((field) => fieldLabel(found.role, field));
    };
    expect(labels("")).toEqual(LABELS);
    expect(labels("group_1")).toEqual(LABELS);
    expect(labels("annotations/card")).toEqual(LABELS);
    expect(labels("group_1/score/card")).toEqual([
      "group length",
      "group scale",
      "spacing",
      "container width",
      "container height",
    ]);
  });

  it.each([
    ["", "arranger", []],
    ["", "bundle", []],
    ["", "group", ["length", "scale", "spacing"]],
    ["", "timeline", ["length", "scale", "spacing"]],
    ["group_1", "arranger", ["x", "y"]],
    ["group_1", "bundle", []],
    ["group_1", "group", ["x", "y"]],
    ["annotations/card", "timeline", ["x", "y"]],
    ["group_1/score/card", "arranger", []],
    ["group_1/score/card", "group", []],
  ] as const)("withholds for %s in %s exactly %j", (element, level, withheld) => {
    const store = storeOf();
    const found = geometryIn(store, [element], level);
    if (found === null) throw new Error("no geometry");
    expect(found.fields.flatMap(({ property, offered }) => (offered ? [] : [property]))).toEqual(
      withheld,
    );
  });

  it("steps exactly, by 1 or by 0.1", () => {
    expect(STEPS).toEqual({ x: 1, y: 1, scale: 0.1, length: 1, spacing: 1, width: 1, height: 1 });
    const cases: [number | null, 1 | -1, number, number][] = [
      [10.123, 1, 1, 11.123],
      [1, -1, 0.1, 0.9],
      [0.9, -1, 0.1, 0.8],
      [0.7, 1, 0.1, 0.8],
      [1e-7, 1, 0.1, 0.1000001],
      [-0.05, 1, 0.1, 0.05],
      [null, 1, 1, 1],
    ];
    expect(cases.map(([value, direction, step]) => stepValue(value, direction, step))).toEqual(
      cases.map(([, , , result]) => result),
    );
  });

  it("shows a value with at most two decimals", () => {
    const cases: [number | null, string][] = [
      [12.5, "12.5"],
      [12.3449, "12.34"],
      [7, "7"],
      [10.123, "10.12"],
      [2.999, "3"],
      [478.5771484375, "478.58"],
      [1.49951171875, "1.5"],
      [0.125, "0.13"],
      [1.005, "1"],
      [-0.001, "0"],
      [null, ""],
    ];
    expect(cases.map(([value]) => shownValue(value))).toEqual(cases.map(([, shown]) => shown));
  });

  it("reads decimal text only", () => {
    const cases: [string, number | null][] = [
      ["12.5", 12.5],
      [" 300.0 ", 300],
      ["-.5", -0.5],
      ["1e3", 1000],
      ["+7", 7],
      ["0x10", null],
      ["Infinity", null],
      ["1e400", null],
      ["abc", null],
      ["", null],
    ];
    expect(cases.map(([text]) => decimalOf(text))).toEqual(cases.map(([, value]) => value));
  });
});

describe("the commands are the arranger's", () => {
  it.each([
    [[""], "x", "12.5", 12.5, "arranger"],
    [["group_1"], "length", "300", 300, "arranger"],
    [["group_1/score/card"], "scale", "1.5", 1.5, "arranger"],
    [["group_1/score/card"], "spacing", "1.5", 1.5, "group"],
    [["group_1/score/card"], "length", "500", 500, "group"],
    [["group_1", "group_2"], "length", "350", 350, "arranger"],
    [["group_1/performance/card", "group_1/score/card"], "width", "600", 600, "timeline"],
    [["group_1"], "scale", "1.5", 1.5, "bundle"],
  ] as const)("%j %s %s at %s is placeEdit's set", (elements, property, text, value, level) => {
    const store = storeOf();
    const found = geometryIn(store, [...elements], level);
    if (found === null) throw new Error("no geometry");
    const expected = placeEdit(
      store.view,
      addresses(...elements),
      property,
      value,
      level,
      fontMetrics,
    );
    expect(propertyCommand(store.view, found, property, text)).toEqual({
      ok: true,
      value: { command: expected, notice: null },
    });
  });

  it("sends an emptied width or height as null, and nothing for a value already stored", () => {
    const store = storeOf();
    dispatch(store, `${M}/score`, { place: { width: 650 } });
    const card = geometry(store, "group_1/score/card");
    expect(propertyCommand(store.view, card, "width", "")).toEqual({
      ok: true,
      value: {
        command: placeEdit(
          store.view,
          addresses("group_1/score/card"),
          "width",
          null,
          "arranger",
          fontMetrics,
        ),
        notice: null,
      },
    });
    expect(propertyCommand(store.view, card, "width", "650.0")).toEqual({
      ok: true,
      value: { command: null, notice: null },
    });
    expect(propertyCommand(store.view, geometry(store, ""), "length", "400")).toEqual({
      ok: true,
      value: { command: null, notice: null },
    });
  });

  it.each([
    ["length", "", "length needs a number"],
    ["spacing", "", "spacing needs a number"],
    ["x", "abc", "abc is not a number"],
    ["x", "0x10", "0x10 is not a number"],
  ] as const)("refuses %s %j before dispatch", (property, text, message) => {
    const store = storeOf();
    expect(propertyCommand(store.view, geometry(store, "group_1"), property, text)).toEqual({
      ok: false,
      problems: [{ code: "invalid_value", message, path: [`${M}/group_1`, property] }],
    });
  });

  it("steps each element from its own value through the same call", () => {
    const store = storeOf();
    dispatch(store, `${M}/group_1`, { place: { length: 300 } });
    const both = geometry(store, "group_1", "group_2");
    const step = (current: number | null) => stepValue(current, 1, STEPS.length);
    expect(stepCommand(store.view, both, "length", 1)).toEqual({
      ok: true,
      value: {
        command: placeEdit(
          store.view,
          addresses("group_1", "group_2"),
          "length",
          step,
          "arranger",
          fontMetrics,
        ),
        notice: null,
      },
    });
  });
});

describe("the Properties form", () => {
  let app: ReturnType<typeof mount> | undefined;

  afterEach(() => {
    if (app !== undefined) unmount(app);
    app = undefined;
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  /** Mount the inspector on `store`; the selection and the gesture can be changed afterwards. */
  function show(
    store: Store,
    elements: string[],
    placement = holder<LivePlacement | null>(null),
  ): { value: ReadonlySet<string> } {
    const selection = holder<ReadonlySet<string>>(addresses(...elements));
    app = mount(Inspector, {
      target: document.body,
      props: {
        live: liveStore(store),
        get selection() {
          return selection.value;
        },
        get placement() {
          return placement.value;
        },
      },
    });
    flushSync();
    const properties = [...document.querySelectorAll<HTMLElement>('[role="tab"]')].find(
      (tab) => tab.textContent === "Properties",
    );
    properties?.click();
    flushSync();
    return selection;
  }

  function open(store: Store, target: string): void {
    const refusal = store.open(target);
    if (refusal !== null) throw new Error(refusal.message);
  }

  function panel(): HTMLElement {
    const tab = document.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
    return document.getElementById(tab?.getAttribute("aria-controls") ?? "") as HTMLElement;
  }

  function forms(): string[] {
    return [...panel().querySelectorAll("form")].map(
      (form) => form.getAttribute("aria-label") ?? "",
    );
  }

  /** Each field as [label, value, placeholder, disabled]. */
  function fields(): [string | undefined, string, string, boolean][] {
    return [...panel().querySelectorAll<HTMLInputElement>("input[type=number]")].map((input) => [
      input.labels?.[0]?.textContent?.trim(),
      input.value,
      input.placeholder,
      input.disabled,
    ]);
  }

  function field(name: PlaceProperty): HTMLInputElement {
    return panel().querySelector(`input[name="${name}"]`) as HTMLInputElement;
  }

  function type(name: PlaceProperty, value: string): void {
    const input = field(name);
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    flushSync();
  }

  function press(name: PlaceProperty, key: string): void {
    field(name).dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    flushSync();
  }

  /** The refusal shown beside the field `name`, or `null`. */
  function problem(name: PlaceProperty): string | null {
    const id = field(name).getAttribute("aria-describedby");
    return id === null ? null : (document.getElementById(id)?.textContent ?? null);
  }

  function lastCommand(store: Store): unknown {
    return (store.journal.at(-1) as CommandEntry | undefined)?.command;
  }

  it("edits a frame's place with the arranger's command, never the block's", () => {
    const store = storeOf();
    show(store, ["group_1"]);
    const frame = itemValues(recorded(stored(store).drawing, "frame", "group_1"));
    expect(forms()).toEqual(["Frame properties"]);
    expect(fields()).toEqual(
      PLACE.map((property, index) => [
        LABELS[index],
        shownValue(frame[property]),
        "",
        positional(property),
      ]),
    );
    const before = store.journal.length;
    const expected = placeEdit(
      store.view,
      addresses("group_1"),
      "length",
      300,
      "arranger",
      fontMetrics,
    );
    type("length", "300");
    press("length", "Enter");
    expect([store.journal.length - before, lastCommand(store)]).toEqual([1, expected]);
    expect(blockOf(store).length).toBe(400);
    expect(field("length").value).toBe("300");
  });

  it("commits an unchanged field by dispatching nothing and showing nothing", () => {
    const store = storeOf();
    show(store, ["group_1"]);
    const spy = vi.spyOn(store, "dispatch");
    type("length", "300");
    press("length", "Enter");
    const journal = store.journal.length;
    for (const text of ["300", "300.0"]) {
      type("length", text);
      press("length", "Enter");
    }
    expect([spy.mock.calls.length, store.journal.length - journal]).toEqual([1, 0]);
    expect([field("length").value, problem("length")]).toEqual(["300", null]);
  });

  it("shows a refusal beside its field until a value is accepted or the draft discarded", () => {
    const store = storeOf();
    show(store, [""]);
    type("scale", "0");
    press("scale", "Enter");
    expect([field("scale").value, field("scale").getAttribute("aria-invalid")]).toEqual([
      "0",
      "true",
    ]);
    expect(problem("scale")).not.toBe(null);
    press("scale", "Escape");
    expect([field("scale").value, problem("scale")]).toEqual(["1", null]);
    type("scale", "");
    press("scale", "Enter");
    expect(problem("scale")).toBe("scale needs a number");
    type("scale", "1");
    press("scale", "Enter");
    expect([field("scale").value, problem("scale")]).toEqual(["1", null]);
  });

  it("shows a draft only for the containers and the manifest it was typed for", () => {
    const store = storeOf();
    const selection = show(store, ["group_1"]);
    type("length", "999");
    selection.value = addresses("group_2");
    flushSync();
    expect(field("length").value).toBe("400");
    selection.value = addresses("group_1");
    flushSync();
    expect(field("length").value).toBe("999");
    dispatch(store, `${M}/score`, { name: "Renamed" });
    flushSync();
    expect(field("length").value).toBe("400");
  });

  it("shows differing values as mixed and steps each from its own", () => {
    const store = storeOf();
    dispatch(store, `${M}/group_1`, { place: { length: 300 } });
    show(store, ["group_1", "group_2"]);
    expect([field("length").value, field("length").placeholder]).toEqual(["", "mixed"]);
    const step = (current: number | null) => stepValue(current, 1, STEPS.length);
    const expected = placeEdit(
      store.view,
      addresses("group_1", "group_2"),
      "length",
      step,
      "arranger",
      fontMetrics,
    );
    press("length", "ArrowUp");
    expect(lastCommand(store)).toEqual(expected);
  });

  it("labels a held card's fields and offers them at every level", () => {
    const store = storeOf();
    show(store, ["group_1/score/card"]);
    expect(forms()).toEqual(["Card properties"]);
    expect(fields().map(([label, , , disabled]) => [label, disabled])).toEqual([
      ["group length", false],
      ["group scale", false],
      ["spacing", false],
      ["container width", false],
      ["container height", false],
    ]);
  });

  it.each([
    [null, true],
    [M, false],
    [`${M}/group_1`, true],
  ])("in the editor of %s disables a frame's x and y: %s", (target, disabled) => {
    const store = storeOf();
    if (target !== null) open(store, target);
    show(store, ["group_1"]);
    expect([field("x").disabled, field("y").disabled, field("length").disabled]).toEqual([
      disabled,
      disabled,
      false,
    ]);
  });

  it("follows a gesture on its block live, and only on its block", () => {
    const store = storeOf();
    const gesture = holder<LivePlacement | null>(null);
    show(store, ["group_1"], gesture);
    const live = livePlacementOf(store, { group_1: { length: 460 } });
    const width = itemValues(recorded(live.drawing, "frame", "group_1")).width;
    gesture.value = live;
    flushSync();
    expect([field("length").value, field("width").value]).toEqual(["460", shownValue(width)]);
    gesture.value = { ...live, id: "bshared000" };
    flushSync();
    expect(field("length").value).toBe("400");
    gesture.value = null;
    flushSync();
    expect(field("length").value).toBe("400");
  });

  it("shows the block's seven fields for the block", () => {
    show(storeOf(), [""]);
    expect(forms()).toEqual(["Block properties"]);
    expect(fields().map(([label]) => label)).toEqual(LABELS);
  });

  it.each([
    [["group_1", "group_1/score/card"], null],
    [["name"], "Mixed"],
  ])("shows the hint for %j, after the name %j", (elements, name) => {
    show(storeOf(), elements);
    const named = panel().querySelector<HTMLInputElement>('input[name="name"]');
    expect([panel().querySelector(".hint")?.textContent, forms(), named?.value ?? null]).toEqual([
      GEOMETRY_HINT,
      [],
      name,
    ]);
  });
});

/** Whether a frame's field is withheld on the arranger: its position. */
function positional(property: PlaceProperty): boolean {
  return property === "x" || property === "y";
}
