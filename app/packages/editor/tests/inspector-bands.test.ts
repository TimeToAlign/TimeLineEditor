/**
 * A selected band shows three read-only rows, and every other reader of
 * the selection leaves bands out; the expected values are derived in
 * `README.md` ("The inspector", "A selected band shows three read-only
 * rows").
 */

import type { LivePlacement } from "@timetoalign/tilie-arranger";
import { drawingOf, liveStore } from "@timetoalign/tilie-arranger";
import type { Block, Store, View } from "@timetoalign/tilie-core";
import { createStore, createView } from "@timetoalign/tilie-core";
import type { DrawnBand } from "@timetoalign/tilie-layout";
import { fontMetrics } from "@timetoalign/timeskeleton";
import { flushSync, mount, unmount } from "svelte";
import { afterEach, describe, expect, it } from "vitest";
import {
  manifestOf,
  manifestText,
  selectedBlock,
  selectedTimeline,
} from "../src/inspector/edit.ts";
import Inspector from "../src/inspector/Inspector.svelte";
import { bandRows, geometryOf } from "../src/inspector/properties.ts";
import { fixture } from "./support.ts";

/** `map`. */
const A = "0000000000";
/** `map_child_band_order`. */
const B = "0000000001";

const GEOMETRY_HINT = "Select a block, a frame or a card to edit its geometry.";

/** The store of the two blocks, each written by one `add`. */
function storeOf(): Store {
  const store = createStore({ view: createView(), journal: [], sessions: {} });
  for (const [id, name, x] of [
    [A, "map", 0],
    [B, "map_child_band_order", 800],
  ] as const) {
    const refusal = store.dispatch({
      type: "add",
      into: "workspace",
      block: { id, manifest: fixture(name), x, y: 0 },
    });
    if (refusal !== null) throw new Error(refusal.message);
  }
  return store;
}

/** The rows of `selection` as `[label, value]` pairs; `null` when it has none. */
function rows(
  view: View,
  selection: string[],
  placement: LivePlacement | null = null,
): [string, string][] | null {
  return bandRows(view, selection, placement)?.map(({ label, value }) => [label, value]) ?? null;
}

/** The three rows of a band. */
const band = (kind: string, level: string, elements: string): [string, string][] => [
  ["Band", kind],
  ["Level", level],
  ["Elements", elements],
];

/** A record written for the test; the rows read only its address, level and elements. */
function record(address: string, level: number, elements: number): DrawnBand {
  const [timeline = "", id = ""] = address.split("/");
  const kind = id.slice(0, -2) as DrawnBand["kind"];
  return { address, timeline, kind, level, line: 0, elements, x: 0, y: 0, width: 10, height: 10 };
}

/** A placement of `block` at its stored values, showing its stored drawing with `bands` instead. */
function placementOf(view: View, id: string, bands: readonly DrawnBand[]): LivePlacement {
  const block = view.blocks[id] as Block;
  const { x, y, scale, length, spacing, width, height } = block;
  const drawing = { ...drawingOf(block, view.settings, fontMetrics), bands };
  return { id, x, y, scale, length, spacing, width, height, drawing };
}

describe("bandRows", () => {
  it.each([
    [`${A}/melody/conversion_maps_1`, band("Conversion maps", "1", "1")],
    [`${A}/melody/children_1`, band("Children", "2", "1")],
    [`${A}/melody/markers_1`, band("Markers", "−1", "2")],
    [`${A}/phrase/conversion_maps_1`, band("Conversion maps", "1", "1")],
    [`${B}/phrase/conversion_maps_1`, band("Conversion maps", "−1", "1")],
  ])("gives the kind, signed level and element count of %s", (address, expected) => {
    expect(rows(storeOf().view, [address])).toEqual(expected);
  });

  it.each([
    ["no selection", []],
    ["a block", [A]],
    ["a map", [`${A}/melody/tempo`]],
    ["a card", [`${A}/melody/card`]],
    ["an absent band of a root", [`${A}/melody/regions_1`]],
    ["an absent band of a child", [`${A}/phrase/markers_1`]],
    ["two bands", [`${A}/melody/markers_1`, `${A}/melody/conversion_maps_1`]],
    ["a band with an element", [`${A}/melody/markers_1`, `${A}/melody/card`]],
    ["a band of a block the workspace does not hold", ["0000000009/melody/markers_1"]],
  ])("gives null for %s", (_case, selection) => {
    expect(rows(storeOf().view, selection)).toBe(null);
  });

  it("reads the drawing a gesture shows on the band's block", () => {
    const { view } = storeOf();
    const shown = placementOf(view, A, [
      record("melody/markers_1", 1, 3),
      record("melody/regions_1", -2, 4),
      record("melody/flow_control_1", -12, 1),
    ]);
    expect(rows(view, [`${A}/melody/markers_1`], shown)).toEqual(band("Markers", "1", "3"));
    expect(rows(view, [`${A}/melody/regions_1`], shown)).toEqual(band("Regions", "−2", "4"));
    expect(rows(view, [`${A}/melody/flow_control_1`], shown)).toEqual(
      band("Flow control", "−12", "1"),
    );
    const elsewhere = placementOf(view, B, [record("melody/markers_1", 1, 3)]);
    expect(rows(view, [`${A}/melody/markers_1`], elsewhere)).toEqual(band("Markers", "−1", "2"));
  });
});

describe("the other readers of the selection", () => {
  const markers = `${A}/melody/markers_1`;
  const card = `${A}/melody/card`;

  it("leave a band alone without geometry or timeline, in its block", () => {
    const { view } = storeOf();
    expect(geometryOf(view, [markers])).toBe(null);
    expect(selectedTimeline(view, [markers])).toBe(null);
    expect(selectedBlock(view, [markers])).toBe(view.blocks[A]);
  });

  it("read a mixed selection as the selection without its bands", () => {
    const { view } = storeOf();
    const geometry = geometryOf(view, [markers, card]);
    expect(geometry?.label).toBe("Card properties");
    expect(geometry).toEqual(geometryOf(view, [card]));
    const timeline = selectedTimeline(view, [markers, card]);
    expect(timeline?.address).toBe(`${A}/melody`);
    expect(timeline).toEqual(selectedTimeline(view, [card]));

    const block = geometryOf(view, [markers, A]);
    expect(block?.label).toBe("Block properties");
    expect(block).toEqual(geometryOf(view, [A]));
    expect(selectedTimeline(view, [markers, A])).toBe(null);

    expect(selectedBlock(view, [markers, `${B}/melody`])).toBe(null);
  });
});

describe("the Properties panel of a band", () => {
  let app: ReturnType<typeof mount> | undefined;

  afterEach(() => {
    if (app !== undefined) unmount(app);
    app = undefined;
    document.body.innerHTML = "";
  });

  function show(store: Store, selection: string[]): void {
    app = mount(Inspector, {
      target: document.body,
      props: { live: liveStore(store), selection: new Set(selection) },
    });
    flushSync();
  }

  function hide(): void {
    if (app !== undefined) unmount(app);
    app = undefined;
    document.body.innerHTML = "";
  }

  function panel(): HTMLElement {
    return document.getElementById("inspector-panel-properties") as HTMLElement;
  }

  function texts(selector: string): string[] {
    return [...panel().querySelectorAll(selector)].map((element) => element.textContent ?? "");
  }

  function openTab(name: string): void {
    (document.getElementById(`inspector-tab-${name}`) as HTMLButtonElement).click();
    flushSync();
  }

  it("shows the three rows of a band and nothing to edit", () => {
    const store = storeOf();
    show(store, [`${A}/melody/markers_1`]);
    expect(panel().querySelectorAll("dl")).toHaveLength(1);
    expect(texts("dt")).toEqual(["Band", "Level", "Elements"]);
    expect(texts("dd")).toEqual(["Markers", "−1", "2"]);
    expect(panel().querySelectorAll("form, input, select, textarea, button")).toHaveLength(0);
    expect(panel().querySelector(".hint")).toBe(null);

    openTab("manifest");
    const expected = manifestText(manifestOf(store.view.blocks[A] as Block), "json", {
      includeStyling: false,
      minimal: false,
    });
    if (!expected.ok) throw new Error("the manifest is not written");
    expect(document.querySelector("textarea")?.value).toBe(expected.value.text);
  });

  it("shows for a band with a card exactly what the card alone shows", () => {
    show(storeOf(), [`${A}/melody/card`]);
    const alone = panel().innerHTML;
    hide();

    show(storeOf(), [`${A}/melody/markers_1`, `${A}/melody/card`]);
    expect(panel().innerHTML).toBe(alone);
    expect(
      [...panel().querySelectorAll("form")].map((form) => form.getAttribute("aria-label")),
    ).toEqual(["Card properties"]);
    expect(
      [...panel().querySelectorAll<HTMLInputElement>("input[type=number]")].map(
        (input) => input.name,
      ),
    ).toEqual(["x", "y", "scale", "length", "spacing", "width", "height"]);
    expect(panel().querySelectorAll("input[type=checkbox]")).toHaveLength(1);
    expect(panel().querySelector("dl")).toBe(null);
  });

  it("shows only the geometry hint for two bands", () => {
    show(storeOf(), [`${A}/melody/markers_1`, `${A}/melody/conversion_maps_1`]);
    expect(panel().textContent?.trim()).toBe(GEOMETRY_HINT);
    expect(panel().querySelector("form")).toBe(null);
    expect(panel().querySelector("dl")).toBe(null);
  });

  it("lists the store's refusal of a band's id given to a map", () => {
    const store = storeOf();
    show(store, [A]);
    openTab("manifest");
    const textarea = document.querySelector("textarea") as HTMLTextAreaElement;
    const edited = textarea.value.replace('"id": "tempo"', '"id": "conversion_maps_1"');
    expect(edited).not.toBe(textarea.value);
    textarea.value = edited;
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    flushSync();
    const apply = [...document.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Apply",
    ) as HTMLButtonElement;
    apply.click();
    flushSync();

    const items = [...document.querySelectorAll("#inspector-problems li")];
    expect(items.map((item) => item.textContent?.replace(/\s+/g, " ").trim())).toEqual([
      'schema_violation id "conversion_maps_1" is reserved for the bands of a timeline at /timelines/0/conversion_maps/0/id',
    ]);
    expect(items[0]?.querySelector(".code")?.textContent).toBe("schema_violation");
    expect(items[0]?.querySelector(".pointer")?.textContent).toBe(
      "/timelines/0/conversion_maps/0/id",
    );
    expect(textarea.value).toBe(edited);
    expect(store.journal).toHaveLength(2);
  });
});
