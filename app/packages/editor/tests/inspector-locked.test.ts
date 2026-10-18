/**
 * The Locked checkbox of a selected timeline; the expected values are
 * derived in `README.md` ("The inspector").
 */

import { liveStore } from "@timetoalign/tilie-arranger";
import type { Block, Json, Store } from "@timetoalign/tilie-core";
import { createStore, createView, isLoadError, loadManifest } from "@timetoalign/tilie-core";
import { flushSync, mount, unmount } from "svelte";
import { afterEach, describe, expect, it } from "vitest";
import { manifestText, selectedTimeline } from "../src/inspector/edit.ts";
import Inspector from "../src/inspector/Inspector.svelte";

const A = "0000000000";
const UNAVAILABLE = "Locking and unlocking is not available yet.";

/**
 * Locked and unlocked roots, a child, a segment line whose segments are
 * segment lines holding plain segments, a region and a group, every
 * `locked` as a writer writes it.
 */
const LOCKABLE = {
  timeskeleton: "0.7.0",
  timelines: [
    {
      id: "fixed",
      unit: "pixels",
      length: 300,
      locked: true,
      children: [{ id: "take", unit: "pixels", offset: 20, length: 100, locked: false }],
    },
    {
      id: "free",
      unit: "pixels",
      length: 300,
      locked: false,
      regions: [{ id: "region_1", start: 0, end: 100 }],
    },
    {
      id: "pages",
      unit: "pixels",
      length: 300,
      locked: false,
      is_segment_line: true,
      children: [
        {
          id: "page_1",
          unit: "pixels",
          offset: 0,
          length: 100,
          locked: true,
          is_segment_line: true,
          children: [{ id: "part_1", unit: "pixels", offset: 0, length: 100, locked: false }],
        },
        {
          id: "page_2",
          unit: "pixels",
          offset: 100,
          length: 200,
          locked: true,
          is_segment_line: true,
          children: [{ id: "part_2", unit: "pixels", offset: 0, length: 200, locked: false }],
        },
      ],
    },
  ],
  groups: [{ id: "group_1", members: ["fixed"] }],
};

/** A store holding `LOCKABLE` in block `A`. */
function storeOf(): Store {
  const manifest = loadManifest(JSON.stringify(LOCKABLE));
  if (isLoadError(manifest)) {
    throw new Error(`refused: ${manifest.problems.map((item) => item.message).join("; ")}`);
  }
  const store = createStore({ view: createView(), journal: [], sessions: {} });
  const error = store.dispatch({
    type: "add",
    into: "workspace",
    block: { id: A, manifest, x: 0, y: 0 },
  });
  if (error !== null) throw new Error(error.message);
  return store;
}

describe("selectedTimeline", () => {
  const { view } = storeOf();

  it.each([
    ["fixed", "fixed", true],
    ["free", "free", false],
    ["take", "take", false],
    ["pages", "pages", false],
    ["page_1", "page_1", true],
    ["page_2", "page_2", true],
    ["part_1", "part_1", false],
    ["fixed/card", "fixed", true],
    ["take/card", "take", false],
    ["fixed/name", "fixed", true],
    ["page_1/start", "page_1", true],
  ])("gives the timeline %s names", (element, id, locked) => {
    const found = selectedTimeline(view, [`${A}/${element}`]);
    expect(found?.block.id).toBe(A);
    expect(found?.address).toBe(`${A}/${id}`);
    expect(found?.timeline.id).toBe(id);
    expect(found?.timeline.locked).toBe(locked);
  });

  it.each([
    ["no selection", []],
    ["a block", [A]],
    ["a group", [`${A}/group_1`]],
    ["a region", [`${A}/free/region_1`]],
    ["an address naming nothing", [`${A}/free/nothing`]],
    ["a block that does not exist", ["0000000001/fixed"]],
    ["two addresses of one timeline", [`${A}/fixed`, `${A}/fixed/card`]],
  ])("gives null for %s", (_case, selection) => {
    expect(selectedTimeline(view, selection)).toBe(null);
  });
});

describe("the Locked checkbox", () => {
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

  /** The Properties panel's one form, and its accessible name. */
  function form(): HTMLFormElement | null {
    return document.querySelector<HTMLFormElement>("#inspector-panel-properties form");
  }

  function checkboxes(): HTMLInputElement[] {
    return [...document.querySelectorAll<HTMLInputElement>("input[type=checkbox]")].filter(
      (input) => input.closest("label")?.textContent?.trim() === "Locked",
    );
  }

  it.each([
    ["fixed", true, "Card properties"],
    ["free", false, "Card properties"],
    ["take", false, "Timeline properties"],
    ["pages", false, "Card properties"],
    ["page_1", true, "Timeline properties"],
    ["part_1", false, "Timeline properties"],
    ["fixed/card", true, "Card properties"],
  ])("shows %s's locked, disabled", (element, locked, label) => {
    show(storeOf(), [`${A}/${element}`]);
    const found = checkboxes();
    expect(found).toHaveLength(1);
    const [checkbox] = found as [HTMLInputElement];
    expect(checkbox.checked).toBe(locked);
    expect(checkbox.disabled).toBe(true);
    expect(checkbox.title).toBe(UNAVAILABLE);
    const cell = checkbox.closest("label");
    expect(form()?.getAttribute("aria-label")).toBe(label);
    expect(cell?.parentElement).toBe(form());
    if (label === "Timeline properties") {
      // A child drawn in no card of its own has no geometry: the checkbox is the form's only cell.
      expect(form()?.children).toHaveLength(1);
    } else {
      expect(cell?.previousElementSibling?.querySelector("input[name=height]")).not.toBe(null);
    }
    expect(document.querySelectorAll("fieldset, legend, .locked-hint")).toHaveLength(0);
    const notes = [...document.querySelectorAll("*")].filter(
      (node) => node.textContent === UNAVAILABLE,
    );
    expect(notes).toHaveLength(0);
  });

  it.each([
    ["a block", [A], "Block properties"],
    ["a group", [`${A}/group_1`], "Frame properties"],
    ["a region", [`${A}/free/region_1`], null],
    ["two timelines", [`${A}/fixed`, `${A}/free`], null],
  ])("is absent for %s", (_case, selection, label) => {
    show(storeOf(), selection);
    expect(checkboxes()).toHaveLength(0);
    expect(form()?.getAttribute("aria-label") ?? null).toBe(label);
    if (label !== null) {
      expect(form()?.lastElementChild?.querySelector("input[name=height]")).not.toBe(null);
    }
  });

  it("follows the store", () => {
    const store = storeOf();
    show(store, [`${A}/free`]);
    expect(checkboxes()[0]?.checked).toBe(false);
    const refusal = store.dispatch({
      type: "set",
      changes: [{ target: `${A}/free`, values: { locked: true } }],
    });
    expect(refusal).toBe(null);
    flushSync();
    expect(checkboxes()[0]?.checked).toBe(true);
  });

  it("follows an applied manifest without a change of selection", () => {
    const store = storeOf();
    show(store, [`${A}/free`]);
    const tab = (name: string) => document.getElementById(`inspector-tab-${name}`) as HTMLElement;
    tab("manifest").click();
    flushSync();
    const stored = (store.view.blocks[A] as Block).manifest;
    const edited = {
      ...stored,
      timelines: stored.timelines.map((item) =>
        item.id === "free" ? { ...item, locked: true } : item,
      ),
    } as unknown as Json;
    const written = manifestText(edited, "json", { includeStyling: false, minimal: false });
    if (!written.ok) throw new Error("not written");
    const area = document.querySelector("textarea") as HTMLTextAreaElement;
    area.value = written.value.text;
    area.dispatchEvent(new Event("input", { bubbles: true }));
    flushSync();
    expect(checkboxes()[0]?.checked).toBe(false);
    const apply = [...document.querySelectorAll("button")].find(
      (item) => item.textContent?.trim() === "Apply",
    );
    apply?.click();
    flushSync();
    expect(store.journal).toHaveLength(2);
    expect(
      store.view.blocks[A]?.manifest.timelines.find((item) => item.id === "free")?.locked,
    ).toBe(true);
    expect(tab("manifest").getAttribute("aria-selected")).toBe("true");
    expect(checkboxes()[0]?.checked).toBe(true);
    tab("properties").click();
    flushSync();
    expect(checkboxes()[0]?.checked).toBe(true);
  });
});
