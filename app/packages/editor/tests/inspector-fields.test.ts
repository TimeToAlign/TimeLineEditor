/**
 * The name field, the Locked checkbox beside the container size, and a size
 * below its minimum; the expected values are derived in `README.md` ("The
 * Properties form", items 7 to 9).
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import type { Level } from "@timetoalign/tilie-arranger";
import { drawingOf, liveStore, placeEdit, resolveSelection } from "@timetoalign/tilie-arranger";
import type { Block, CommandEntry, Store } from "@timetoalign/tilie-core";
import { createStore, isLoadError, readWorkspace } from "@timetoalign/tilie-core";
import { fontMetrics } from "@timetoalign/timeskeleton";
import { flushSync, mount, unmount } from "svelte";
import { afterEach, describe, expect, it } from "vitest";
import PropertiesPanel from "../src/inspector/PropertiesPanel.svelte";
import { nameCommand, nameOf, shownValue } from "../src/inspector/properties.ts";
import { PropertyDrafts } from "../src/inspector/propertyDrafts.svelte.ts";
import { selectedBlock } from "../src/inspector/selection.ts";

const M = "bmixed0000";

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

function blockOf(store: Store): Block {
  const block = store.view.blocks[M];
  if (block === undefined) throw new Error(`no block ${M}`);
  return block;
}

/** `M`'s addresses of `elements`; `""` names the block. */
function addresses(...elements: string[]): Set<string> {
  return new Set(elements.map((element) => (element === "" ? M : `${M}/${element}`)));
}

/** The name field `nameOf` gives for `selection` in the store's innermost editor, or at the top level. */
function nameIn(store: Store, selection: Set<string>) {
  const subjects = resolveSelection(store.view, selection, fontMetrics);
  return nameOf(store.view, subjects, store.editing.at(-1) ?? null);
}

/** The name field for `elements` of `M`, or for nothing selected with `null`. */
function fieldOf(store: Store, elements: string[] | null) {
  return nameIn(store, addresses(...(elements ?? [])));
}

describe("the name field", () => {
  it("names the workspace with nothing selected at the top level", () => {
    const store = storeOf();
    expect(fieldOf(store, null)).toEqual({
      target: "workspace",
      name: "untitled",
      nullable: false,
      manifest: null,
    });
  });

  it.each([
    [`${M}/group_1`, `${M}/group_1`, "Performance"],
    [M, M, "Mixed"],
  ])(
    "names the edited element with nothing selected in the editor of %s",
    (edited, target, name) => {
      const store = storeOf();
      expect(store.open(edited)).toBe(null);
      expect(fieldOf(store, null)).toEqual({
        target,
        name,
        nullable: true,
        manifest: blockOf(store).manifest,
      });
    },
  );

  it.each([
    [[""], M, "Mixed"],
    [["name"], M, "Mixed"],
    [["group_1"], `${M}/group_1`, "Performance"],
    [["score"], `${M}/score`, "Score"],
    [["score/card"], `${M}/score`, "Score"],
    [["score/start"], `${M}/score`, "Score"],
    [["page/cmap_1"], `${M}/page/cmap_1`, null],
    [["score/jump_1"], `${M}/score/jump_1`, null],
  ])("names %j by %s, %j", (elements, target, name) => {
    const store = storeOf();
    expect(fieldOf(store, elements)).toEqual({
      target,
      name,
      nullable: true,
      manifest: blockOf(store).manifest,
    });
  });

  it("names a measure map by its own address", () => {
    const store = storeOf();
    const bars = { id: "bars", rows: [{ count: 1, qstamp: [0, 1] }] };
    const error = store.dispatch({ type: "add", into: M, measure_map: bars });
    if (error !== null) throw new Error(error.message);
    expect(fieldOf(store, ["bars"])).toEqual({
      target: `${M}/bars`,
      name: null,
      nullable: true,
      manifest: blockOf(store).manifest,
    });
  });

  it.each([[["performance/markers_1"]], [["score", "page"]]])("is absent for %j", (elements) => {
    expect(fieldOf(storeOf(), elements)).toBe(null);
  });

  it("is absent for two blocks", () => {
    expect(nameIn(storeOf(), new Set([M, "bshared000"]))).toBe(null);
  });

  it("sets what was typed, unstates an empty nullable name, and sends nothing for the stored one", () => {
    const store = storeOf();
    const manifest = fieldOf(store, [""]);
    const workspace = fieldOf(store, null);
    if (manifest === null || workspace === null) throw new Error("no name field");
    expect(nameCommand(manifest, "Op. 35")).toEqual({
      type: "set",
      changes: [{ target: M, values: { name: "Op. 35" } }],
    });
    expect(nameCommand(manifest, "")).toEqual({
      type: "set",
      changes: [{ target: M, values: { name: null } }],
    });
    expect(nameCommand(manifest, "Mixed")).toBe(null);
    expect(nameCommand(workspace, "")).toEqual({
      type: "set",
      changes: [{ target: "workspace", values: { name: "" } }],
    });
  });
});

describe("the Properties panel", () => {
  let app: ReturnType<typeof mount> | undefined;

  afterEach(() => {
    if (app !== undefined) unmount(app);
    app = undefined;
    document.body.innerHTML = "";
  });

  /** Mount the panel on `store` for `elements` of `M`, or for nothing selected with `null`. */
  function show(store: Store, elements: string[] | null, level: Level = "arranger"): void {
    showSelection(store, addresses(...(elements ?? [])), level);
  }

  /** Mount the panel on `store` for the addresses `selection`. */
  function showSelection(store: Store, selection: Set<string>, level: Level = "arranger"): void {
    const live = liveStore(store);
    const subjects = () => resolveSelection(live.view, selection, fontMetrics);
    app = mount(PropertiesPanel, {
      target: document.body,
      props: {
        get view() {
          return live.view;
        },
        store,
        get block() {
          return selectedBlock(live.view, subjects());
        },
        get subjects() {
          return subjects();
        },
        level,
        placement: null,
        drafts: new PropertyDrafts(),
      },
    });
    flushSync();
  }

  function input(name: string): HTMLInputElement {
    const found = document.querySelector<HTMLInputElement>(`input[name="${name}"]`);
    if (found === null) throw new Error(`no field ${name}`);
    return found;
  }

  function type(name: string, value: string): void {
    const field = input(name);
    field.value = value;
    field.dispatchEvent(new Event("input", { bubbles: true }));
    flushSync();
  }

  function press(name: string, key: string): void {
    input(name).dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    flushSync();
  }

  function locked(): HTMLInputElement | null {
    return document.querySelector<HTMLInputElement>("input[type=checkbox]");
  }

  function status(): string | null {
    return document.querySelector('[role="status"]')?.textContent ?? null;
  }

  function lastCommand(store: Store): unknown {
    return (store.journal.at(-1) as CommandEntry | undefined)?.command;
  }

  it("shows the name first, and renames the manifest in one entry", () => {
    const store = storeOf();
    show(store, ["group_1"]);
    const [first] = document.querySelectorAll("input");
    expect([first?.name, first?.type, first?.labels?.[0]?.textContent?.trim()]).toEqual([
      "name",
      "text",
      "Name",
    ]);
    expect(input("name").value).toBe("Performance");
    if (app !== undefined) unmount(app);
    document.body.innerHTML = "";
    show(store, [""]);
    const before = store.journal.length;
    type("name", "Op. 35");
    press("name", "Enter");
    expect(store.journal.length).toBe(before + 1);
    expect(blockOf(store).manifest.name).toBe("Op. 35");
    expect(input("name").value).toBe("Op. 35");
  });

  it("names only the workspace without a block, and refuses its empty name", () => {
    const store = storeOf();
    show(store, null);
    expect([...document.querySelectorAll("input")].map((item) => item.name)).toEqual(["name"]);
    expect(input("name").value).toBe("untitled");
    type("name", "");
    press("name", "Enter");
    const field = input("name");
    const described = document.getElementById(field.getAttribute("aria-describedby") ?? "");
    expect([field.value, field.getAttribute("aria-invalid"), described?.textContent]).toEqual([
      "",
      "true",
      "a name is a non-empty string",
    ]);
    press("name", "Escape");
    expect([input("name").value, input("name").getAttribute("aria-invalid")]).toEqual([
      "untitled",
      "false",
    ]);
    type("name", "Eroica");
    input("name").dispatchEvent(new FocusEvent("blur"));
    flushSync();
    expect(store.view.name).toBe("Eroica");
  });

  it("shows no name and the geometry hint for two blocks", () => {
    showSelection(storeOf(), new Set([M, "bshared000"]));
    expect(document.querySelector('input[name="name"]')).toBe(null);
    expect(document.querySelector(".hint")?.textContent).toBe(
      "Select a block, a frame or a card to edit its geometry.",
    );
  });

  it("names the edited group in its editor with nothing selected, and renames it there", () => {
    const store = storeOf();
    expect(store.open(`${M}/group_1`)).toBe(null);
    showSelection(store, new Set(), "group");
    expect([...document.querySelectorAll("input")].map((item) => item.name)).toEqual(["name"]);
    expect(input("name").value).toBe("Performance");
    const before = store.entries.length;
    type("name", "Duo");
    press("name", "Enter");
    expect(store.entries.length).toBe(before + 1);
    expect(blockOf(store).manifest.groups.find((group) => group.id === "group_1")?.name).toBe(
      "Duo",
    );
    expect(input("name").value).toBe("Duo");
  });

  it("puts the container size in one row with the Locked checkbox last", () => {
    show(storeOf(), ["score/card"]);
    const row = input("height").closest("label")?.parentElement;
    const cells = [...(row?.children ?? [])].map((cell) => cell.textContent?.trim());
    expect(cells).toEqual(["container width", "container height", "Locked"]);
    const box = locked();
    expect([box?.checked, box?.disabled, box?.indeterminate]).toEqual([false, true, false]);
  });

  it.each([
    [["excerpt/card"], true, false],
    [["score/card", "excerpt/card"], false, true],
    [["recording"], false, false],
  ])("shows the stored lock of %j: checked %s, mixed %s", (elements, checked, mixed) => {
    const store = storeOf();
    show(store, elements);
    const box = locked();
    expect([box?.checked, box?.indeterminate, box?.disabled]).toEqual([checked, mixed, true]);
    const before = store.journal.length;
    box?.click();
    flushSync();
    expect(store.journal.length).toBe(before);
  });

  it.each([[[""]], [["group_1"]], [["performance/markers_1"]]])(
    "shows no Locked checkbox for %j",
    (elements) => {
      show(storeOf(), elements);
      expect(locked()).toBe(null);
    },
  );

  /** The notice a size below `minimum` gives. */
  const below = (property: string, minimum: number) =>
    `To decrease the ${property} below ${shownValue(minimum)} px, decrease the size of the contained elements first.`;

  it("gives the block its minimum height as a number, and says so", () => {
    const store = storeOf();
    const minimum = drawingOf(blockOf(store), store.view.settings, fontMetrics).height;
    const expected = placeEdit(
      store.view,
      addresses(""),
      "height",
      minimum,
      "arranger",
      fontMetrics,
    );
    show(store, [""]);
    type("height", "1");
    press("height", "Enter");
    expect(lastCommand(store)).toEqual(expected);
    expect(status()).toBe(below("height", minimum));
    expect(input("height").value).toBe(shownValue(minimum));
    type("height", "2");
    expect(status()).toBe("");
  });

  it.each(["height", "width"] as const)(
    "unstates a frame's %s at or below its minimum, and says so below it",
    (property) => {
      const store = storeOf();
      const minimum = frameSize(blockOf(store), store, "group_1", property);
      const stated = {
        type: "set",
        changes: [{ target: `${M}/group_1`, values: { place: { [property]: minimum + 10 } } }],
      };
      expect(store.dispatch(stated)).toBe(null);
      const expected = placeEdit(
        store.view,
        addresses("group_1"),
        property,
        null,
        "arranger",
        fontMetrics,
      );
      show(store, ["group_1"]);
      expect(input(property).value).toBe(shownValue(minimum + 10));
      type(property, "1");
      press(property, "Enter");
      expect(lastCommand(store)).toEqual(expected);
      expect(blockOf(store).places.group_1?.[property]).toBe(undefined);
      expect(status()).toBe(below(property, minimum));
      expect(input(property).value).toBe(shownValue(minimum));
      const entries = store.journal.length;
      type(property, "1");
      press(property, "Enter");
      expect(store.journal.length).toBe(entries);
      expect(status()).toBe(below(property, minimum));
      type(property, String(minimum));
      press(property, "Enter");
      expect([store.journal.length, status()]).toEqual([entries, ""]);
    },
  );

  it("holds each frame to its own minimum", () => {
    const store = storeOf();
    const block = blockOf(store);
    const heights = (["group_1", "group_2"] as const).map((key) => ({
      key,
      minimum: frameSize(block, store, key, "height"),
    }));
    const [low, high] = heights.sort((left, right) => left.minimum - right.minimum);
    // The value one above the smaller minimum lies below the larger one.
    if (low === undefined || high === undefined || high.minimum - low.minimum <= 1) {
      throw new Error("the frames' minimum heights lie no more than 1 apart");
    }
    const value = low.minimum + 1;
    const both = placeEdit(
      store.view,
      addresses("group_1", "group_2"),
      "height",
      value,
      "arranger",
      fontMetrics,
    );
    if (both === null || "code" in both) throw new Error("no edit of both frames");
    show(store, ["group_1", "group_2"]);
    type("height", String(value));
    press("height", "Enter");
    expect(lastCommand(store)).toEqual({
      ...both,
      changes: both.changes.filter((change) => change.target !== `${M}/${high.key}`),
    });
    expect([
      block.places,
      blockOf(store).places[low.key]?.height,
      blockOf(store).places[high.key]?.height,
    ]).toEqual([{}, value, undefined]);
    expect(status()).toBe(below("height", high.minimum));
  });

  it("says nothing for a size above the minimum", () => {
    const store = storeOf();
    show(store, ["group_1"]);
    type("height", String(frameSize(blockOf(store), store, "group_1", "height") + 10));
    press("height", "Enter");
    expect(status()).toBe("");
  });
});

/** The drawn size of the frame of `group`, which nothing states: its minimum. */
function frameSize(
  block: Block,
  store: Store,
  group: string,
  property: "width" | "height",
): number {
  const drawing = drawingOf(block, store.view.settings, fontMetrics);
  const frame = drawing.boxes.find((box) => box.kind === "frame" && box.address === group);
  const size = frame?.item?.place[property];
  if (size === undefined) throw new Error(`no frame ${group}`);
  return size;
}
