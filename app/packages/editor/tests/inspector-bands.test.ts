/**
 * A selected band shows three read-only rows, and the form leaves bands
 * out; the expected values are derived in `README.md` ("The Properties
 * form", "A selected band").
 */

import type { LivePlacement } from "@timetoalign/tilie-arranger";
import { drawingOf, liveStore, resolveSelection, selectionOf } from "@timetoalign/tilie-arranger";
import type { Address, Block, ElementAddress, Facet, Store, View } from "@timetoalign/tilie-core";
import { addressKey } from "@timetoalign/tilie-core";
import type { DrawnBox } from "@timetoalign/tilie-layout";
import { fontMetrics } from "@timetoalign/timetoshare";
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

/** The address of `element` in block `block`; the block itself without an element. */
function at(block: string, element: ElementAddress = {}): Address {
  return { block, ...element };
}

/** The address of the band of `facet` of `timeline` in block `block`. */
function bandOf(block: string, timeline: string, facet: Facet): Address {
  return at(block, { id: timeline, facet });
}

function subjectsOf(view: View, selection: readonly Address[]) {
  return resolveSelection(view, selectionOf(selection), null, fontMetrics);
}

/** The rows of `selection` as `[label, value]` pairs, shown as `shown` (its block stored by default); `null` when it has none. */
function rows(view: View, selection: readonly Address[], shown?: Shown): [string, string][] | null {
  const subjects = subjectsOf(view, selection);
  const found = bandRows(subjects, shown ?? stored(view, subjects[0]?.block ?? A));
  return found?.map(({ label, value }) => [label, value]) ?? null;
}

/** The three rows of a band. */
const band = (word: string, level: string, elements: string): [string, string][] => [
  ["Band", word],
  ["Level", level],
  ["Elements", elements],
];

/** A band's record written for the test; the rows read only its address, level and elements. */
function record(timeline: string, facet: Facet, level: number, elements: number): DrawnBox {
  return {
    kind: "band",
    key: null,
    address: { id: timeline, facet },
    holder: { item: timeline },
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    range: { start: 0, end: 0 },
    displayed: false,
    band: { timeline, facet, level, elements, line: 0 },
  };
}

/** A placement of `id` at its stored values, showing its stored drawing with `bands` instead of its own. */
function placementOf(view: View, id: string, bands: readonly DrawnBox[]): LivePlacement {
  const { drawing, x, y, scale, length, spacing, margin, width, height } = stored(view, id);
  const boxes = [...drawing.boxes.filter((box) => box.kind !== "band"), ...bands];
  return {
    id,
    x,
    y,
    scale,
    length,
    spacing,
    margin,
    width,
    height,
    drawing: { ...drawing, boxes },
  };
}

describe("bandRows", () => {
  it.each(
    [
      [bandOf(A, "melody", "conversion_maps"), band("Conversion maps", "1", "1")],
      [bandOf(A, "melody", "children"), band("Children", "2", "1")],
      [bandOf(A, "melody", "markers"), band("Markers", "−1", "2")],
      [bandOf(A, "phrase", "conversion_maps"), band("Conversion maps", "1", "1")],
      [bandOf(B, "phrase", "conversion_maps"), band("Conversion maps", "−1", "1")],
    ].map(([address, expected]) => [addressKey(address as Address), address, expected] as const),
  )("gives the word, signed level and element count of %s", (_key, address, expected) => {
    expect(rows(storeOf().view, [address as Address])).toEqual(expected);
  });

  it.each([
    ["no selection", []],
    ["a block", [at(A)]],
    ["a map", [at(A, { id: "tempo" })]],
    ["a card", [at(A, { id: "melody", part: ["card"] })]],
    ["an absent band of a root", [bandOf(A, "melody", "regions")]],
    ["an absent band of a child", [bandOf(A, "phrase", "markers")]],
    ["two bands", [bandOf(A, "melody", "markers"), bandOf(A, "melody", "conversion_maps")]],
    [
      "a band with an element",
      [bandOf(A, "melody", "markers"), at(A, { id: "melody", part: ["card"] })],
    ],
    ["a band of a block the workspace does not hold", [bandOf("0000000009", "melody", "markers")]],
  ] as const)("gives null for %s", (_case, selection) => {
    expect(rows(storeOf().view, selection)).toBe(null);
  });

  it("reads the drawing a gesture shows", () => {
    const { view } = storeOf();
    const shown = placementOf(view, A, [
      record("melody", "markers", 1, 3),
      record("melody", "regions", -2, 4),
      record("melody", "flow_control", -12, 1),
    ]);
    expect(rows(view, [bandOf(A, "melody", "markers")], shown)).toEqual(band("Markers", "1", "3"));
    expect(rows(view, [bandOf(A, "melody", "regions")], shown)).toEqual(band("Regions", "−2", "4"));
    expect(rows(view, [bandOf(A, "melody", "flow_control")], shown)).toEqual(
      band("Flow control", "−12", "1"),
    );
  });
});

describe("the other readers of the selection", () => {
  const markers = bandOf(A, "melody", "markers");
  const card = at(A, { id: "melody", part: ["card"] });

  function geometry(view: View, selection: readonly Address[]) {
    return geometryOf(blockOf(view, A), subjectsOf(view, selection), stored(view, A), null);
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
    const withBlock = geometry(view, [markers, at(A)]);
    expect(withBlock?.label).toBe("Block properties");
    expect(withBlock).toEqual(geometry(view, [at(A)]));
    expect(selectedBlock(view, subjectsOf(view, [markers, at(B, { id: "melody" })]))).toBe(null);
  });
});
describe("the Properties panel of a band", () => {
  let app: ReturnType<typeof mount> | undefined;

  afterEach(() => {
    if (app !== undefined) unmount(app);
    app = undefined;
    document.body.innerHTML = "";
  });

  function show(store: Store, selection: readonly Address[]): void {
    app = mount(Inspector, {
      target: document.body,
      props: { live: liveStore(store), selection: selectionOf(selection) },
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
    show(store, [bandOf(A, "melody", "markers")]);
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
    show(storeOf(), [at(A, { id: "melody", part: ["card"] })]);
    const alone = geometry();
    expect(panel().querySelectorAll('input[name="name"], input[type=checkbox]')).toHaveLength(2);
    hide();

    show(storeOf(), [bandOf(A, "melody", "markers"), at(A, { id: "melody", part: ["card"] })]);
    expect(geometry()).toEqual(alone);
    expect(panel().querySelector('input[name="name"]')).toBe(null);
    expect(
      [...panel().querySelectorAll("form")].map((form) => form.getAttribute("aria-label")),
    ).toEqual(["Card properties"]);
    expect(
      [...panel().querySelectorAll<HTMLInputElement>("input[type=number]")].map(
        (input) => input.name,
      ),
    ).toEqual(["x", "y", "length", "scale", "spacing", "margin", "width", "height"]);
    expect(panel().querySelectorAll("input[type=checkbox]")).toHaveLength(0);
    expect(panel().querySelector("dl")).toBe(null);
  });

  it("shows only the geometry hint for two bands", () => {
    show(storeOf(), [bandOf(A, "melody", "markers"), bandOf(A, "melody", "conversion_maps")]);
    expect(panel().textContent?.trim()).toBe(GEOMETRY_HINT);
    expect(panel().querySelector("form")).toBe(null);
    expect(panel().querySelector("dl")).toBe(null);
  });

  it("lists the store's refusal of a map given an ID the manifest holds", () => {
    const store = storeOf();
    show(store, [at(A)]);
    openTab("Manifest");
    const textarea = document.querySelector("textarea") as HTMLTextAreaElement;
    const edited = textarea.value.replace('"id": "tempo"', '"id": "phrase"');
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
      "schema_violation 'phrase' is not unique in the manifest, first at #/timelines/0/conversion_maps/0/id at /timelines/0/children/0/id",
    ]);
    expect([...(items[0]?.querySelectorAll("code") ?? [])].map((item) => item.textContent)).toEqual(
      ["schema_violation", "/timelines/0/children/0/id"],
    );
    expect(textarea.value).toBe(edited);
    expect(store.journal).toHaveLength(2);
  });
});
