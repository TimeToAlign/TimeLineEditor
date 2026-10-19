/**
 * A selected band shows three read-only rows, and the form leaves bands
 * out; the expected values are derived in `README.md` ("The Properties
 * form", "A selected band").
 */

import type { LivePlacement } from "@timetoalign/tilie-arranger";
import { drawingOf, liveStore, resolveSelection } from "@timetoalign/tilie-arranger";
import type { Block, Store, View } from "@timetoalign/tilie-core";
import type { DrawnBox } from "@timetoalign/tilie-layout";
import { fontMetrics } from "@timetoalign/timeskeleton";
import { flushSync, mount, unmount } from "svelte";
import { afterEach, describe, expect, it } from "vitest";
import Inspector from "../src/inspector/Inspector.svelte";
import { manifestOf, manifestText } from "../src/inspector/manifestText.ts";
import type { Shown } from "../src/inspector/properties.ts";
import { bandRows, geometryOf } from "../src/inspector/properties.ts";
import { selectedBlock } from "../src/inspector/selection.ts";
import { storeOf as storeOfFixtures } from "./support.ts";

/** `map`. */
const A = "0000000000";
/** `map_child_band_order`. */
const B = "0000000001";

const GEOMETRY_HINT = "Select a block, a frame or a card to edit its geometry.";

/** The store of the two blocks, each written by one `add`. */
function storeOf(): Store {
  return storeOfFixtures("map", "map_child_band_order");
}

function blockOf(view: View, id: string): Block {
  const block = view.blocks[id];
  if (block === undefined) throw new Error(`no block ${id}`);
  return block;
}

/** What the canvas shows of `id` without a gesture. */
function stored(view: View, id: string): Shown {
  const block = blockOf(view, id);
  return { ...block, drawing: drawingOf(block, view.settings, fontMetrics) };
}

function subjectsOf(view: View, selection: string[]) {
  return resolveSelection(view, new Set(selection), fontMetrics);
}

/** The rows of `selection` as `[label, value]` pairs, shown as `shown` (its block stored by default); `null` when it has none. */
function rows(view: View, selection: string[], shown?: Shown): [string, string][] | null {
  const subjects = subjectsOf(view, selection);
  const found = bandRows(subjects, shown ?? stored(view, subjects[0]?.block ?? A));
  return found?.map(({ label, value }) => [label, value]) ?? null;
}

/** The three rows of a band. */
const band = (kind: string, level: string, elements: string): [string, string][] => [
  ["Band", kind],
  ["Level", level],
  ["Elements", elements],
];

/** A band's record written for the test; the rows read only its address, level and elements. */
function record(
  timeline: string,
  kind: NonNullable<DrawnBox["band"]>["kind"],
  level: number,
  elements: number,
): DrawnBox {
  return {
    kind: "band",
    key: null,
    address: `${timeline}/${kind}_1`,
    holder: `${timeline}/card`,
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    range: { start: 0, end: 0 },
    displayed: false,
    band: { timeline, kind, level, elements, line: 0 },
  };
}

/** A placement of `id` at its stored values, showing its stored drawing with `bands` instead of its own. */
function placementOf(view: View, id: string, bands: readonly DrawnBox[]): LivePlacement {
  const { drawing, x, y, scale, length, spacing, width, height } = stored(view, id);
  const boxes = [...drawing.boxes.filter((box) => box.kind !== "band"), ...bands];
  return { id, x, y, scale, length, spacing, width, height, drawing: { ...drawing, boxes } };
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

  it("reads the drawing a gesture shows", () => {
    const { view } = storeOf();
    const shown = placementOf(view, A, [
      record("melody", "markers", 1, 3),
      record("melody", "regions", -2, 4),
      record("melody", "flow_control", -12, 1),
    ]);
    expect(rows(view, [`${A}/melody/markers_1`], shown)).toEqual(band("Markers", "1", "3"));
    expect(rows(view, [`${A}/melody/regions_1`], shown)).toEqual(band("Regions", "−2", "4"));
    expect(rows(view, [`${A}/melody/flow_control_1`], shown)).toEqual(
      band("Flow control", "−12", "1"),
    );
  });
});

describe("the other readers of the selection", () => {
  const markers = `${A}/melody/markers_1`;
  const card = `${A}/melody/card`;

  function geometry(view: View, selection: string[]) {
    return geometryOf(blockOf(view, A), subjectsOf(view, selection), stored(view, A), "arranger");
  }

  it("leave a band alone without geometry, in its block", () => {
    const { view } = storeOf();
    expect(geometry(view, [markers])).toBe(null);
    expect(selectedBlock(view, subjectsOf(view, [markers]))).toBe(view.blocks[A]);
  });

  it("read a mixed selection as the selection without its bands", () => {
    const { view } = storeOf();
    const withCard = geometry(view, [markers, card]);
    expect(withCard?.label).toBe("Card properties");
    expect(withCard).toEqual(geometry(view, [card]));
    const withBlock = geometry(view, [markers, A]);
    expect(withBlock?.label).toBe("Block properties");
    expect(withBlock).toEqual(geometry(view, [A]));
    expect(selectedBlock(view, subjectsOf(view, [markers, `${B}/melody`]))).toBe(null);
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
    const tab = document.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
    return document.getElementById(tab?.getAttribute("aria-controls") ?? "") as HTMLElement;
  }

  function texts(selector: string): string[] {
    return [...panel().querySelectorAll(selector)].map((element) => element.textContent ?? "");
  }

  function openTab(name: string): void {
    const tabs = [...document.querySelectorAll<HTMLElement>('[role="tab"]')];
    tabs.find((tab) => tab.textContent === name)?.click();
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

    openTab("Manifest");
    const expected = manifestText(manifestOf(blockOf(store.view, A)), "json", {
      includeStyling: false,
      minimal: false,
    });
    if (!expected.ok) throw new Error("the manifest is not written");
    expect(document.querySelector("textarea")?.value).toBe(expected.value.text);
  });

  it("shows for a band with a card the card's geometry, without its name and lock", () => {
    const geometry = () =>
      [...panel().querySelectorAll<HTMLInputElement>("form input[type=number]")].map((input) => [
        input.name,
        input.value,
        input.disabled,
      ]);
    show(storeOf(), [`${A}/melody/card`]);
    const alone = geometry();
    expect(panel().querySelectorAll('input[name="name"], input[type=checkbox]')).toHaveLength(2);
    hide();

    show(storeOf(), [`${A}/melody/markers_1`, `${A}/melody/card`]);
    expect(geometry()).toEqual(alone);
    expect(panel().querySelector('input[name="name"]')).toBe(null);
    expect(
      [...panel().querySelectorAll("form")].map((form) => form.getAttribute("aria-label")),
    ).toEqual(["Card properties"]);
    expect(
      [...panel().querySelectorAll<HTMLInputElement>("input[type=number]")].map(
        (input) => input.name,
      ),
    ).toEqual(["x", "y", "length", "scale", "spacing", "width", "height"]);
    expect(panel().querySelectorAll("input[type=checkbox]")).toHaveLength(0);
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
    openTab("Manifest");
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

    const items = [...document.querySelectorAll('ul[aria-label="Problems"] li')];
    expect(items.map((item) => item.textContent?.replace(/\s+/g, " ").trim())).toEqual([
      'schema_violation id "conversion_maps_1" is reserved for the bands of a timeline at /timelines/0/conversion_maps/0/id',
    ]);
    expect([...(items[0]?.querySelectorAll("code") ?? [])].map((item) => item.textContent)).toEqual(
      ["schema_violation", "/timelines/0/conversion_maps/0/id"],
    );
    expect(textarea.value).toBe(edited);
    expect(store.journal).toHaveLength(2);
  });
});
