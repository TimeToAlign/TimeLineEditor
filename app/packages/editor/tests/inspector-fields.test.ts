/**
 * The name field, the Locked checkbox beside the container size, and a size
 * below its minimum; the expected values are derived in `README.md` ("The
 * Properties form", items 7 to 9).
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import type { Level, Selection } from "@timetoalign/tilie-arranger";
import {
  drawingOf,
  liveStore,
  NOTHING_SELECTED,
  placeEdit,
  resolveSelection,
  selectionOf,
} from "@timetoalign/tilie-arranger";
import type { Block, CommandEntry, ElementAddress, Store } from "@timetoalign/tilie-core";
import { createStore, isLoadError, readWorkspace, sameAddress } from "@timetoalign/tilie-core";
import { fontMetrics } from "@timetoalign/timetoshare";
import { flushSync, mount, unmount } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import PropertiesPanel from "../src/inspector/PropertiesPanel.svelte";
import { ancestorCardOf, nameCommand, nameOf, shownValue } from "../src/inspector/properties.ts";
import { PropertyDrafts } from "../src/inspector/propertyDrafts.svelte.ts";
import { selectedBlock } from "../src/inspector/selection.ts";
import { blockId, editorAt, storeOf as fixtureStore, informing } from "./support.ts";

// The arranger itself, its `drawingOf` counted: the ancestor-card trials are counted through it.
vi.mock("@timetoalign/tilie-arranger", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@timetoalign/tilie-arranger")>();
  return { ...actual, drawingOf: vi.fn(actual.drawingOf) };
});

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

/** The selection of `elements` of `M`; `{}` names the block. */
function addresses(...elements: ElementAddress[]): Selection {
  return selectionOf(elements.map((element) => ({ block: M, ...element })));
}

/** The name field `nameOf` gives for `selection` in the store's innermost editor, or at the top level. */
function nameIn(store: Store, selection: Selection) {
  const editing = store.editing.at(-1) ?? null;
  const subjects = resolveSelection(store.view, selection, editing, fontMetrics);
  return nameOf(store.view, subjects, editing);
}

/** The name field for `elements` of `M`, or for nothing selected with `null`. */
function fieldOf(store: Store, elements: ElementAddress[] | null) {
  return nameIn(store, addresses(...(elements ?? [])));
}

describe("the name field", () => {
  it("names the workspace with nothing selected at the top level", () => {
    const store = storeOf();
    expect(fieldOf(store, null)).toEqual({
      target: {},
      name: "untitled",
      nullable: false,
      manifest: null,
    });
  });

  it.each([
    [{ block: M, id: "group_1" }, { block: M, id: "group_1" }, "Performance"],
    [{ block: M }, { block: M }, "Mixed"],
  ])(
    "names the edited element with nothing selected in the editor of %j",
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

  it.each<[ElementAddress[], ElementAddress, string | null]>([
    [[{}], {}, "Mixed"],
    [[{ part: ["name"] }], {}, "Mixed"],
    [[{ id: "group_1" }], { id: "group_1" }, "Performance"],
    [[{ id: "score" }], { id: "score" }, "Score"],
    [[{ id: "score", part: ["card"] }], { id: "score" }, "Score"],
    [[{ id: "score", part: ["name"] }], { id: "score" }, "Score"],
    [[{ id: "cmap_4" }], { id: "cmap_4" }, null],
    [[{ id: "jump_from_1" }], { id: "jump_from_1" }, null],
  ])("names %j by %j, %j", (elements, element, name) => {
    const target = { block: M, ...element };
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
    const error = store.dispatch({ type: "add", into: { block: M }, measure_map: bars });
    if (error !== null) throw new Error(error.message);
    expect(fieldOf(store, [{ id: "bars" }])).toEqual({
      target: { block: M, id: "bars" },
      name: null,
      nullable: true,
      manifest: blockOf(store).manifest,
    });
  });

  it.each<[ElementAddress[]]>([
    [[{ id: "performance", facet: "markers" }]],
    [[{ id: "score" }, { id: "page" }]],
  ])("is absent for %j", (elements) => {
    expect(fieldOf(storeOf(), elements)).toBe(null);
  });

  it("is absent for two blocks", () => {
    expect(nameIn(storeOf(), selectionOf([{ block: M }, { block: "bshared000" }]))).toBe(null);
  });

  it("sets what was typed, unstates an empty nullable name, and sends nothing for the stored one", () => {
    const store = storeOf();
    const manifest = fieldOf(store, [{}]);
    const workspace = fieldOf(store, null);
    if (manifest === null || workspace === null) throw new Error("no name field");
    expect(nameCommand(manifest, "Op. 35")).toEqual({
      type: "set",
      changes: [{ target: { block: M }, values: { name: "Op. 35" } }],
    });
    expect(nameCommand(manifest, "")).toEqual({
      type: "set",
      changes: [{ target: { block: M }, values: { name: null } }],
    });
    expect(nameCommand(manifest, "Mixed")).toBe(null);
    expect(nameCommand(workspace, "")).toEqual({
      type: "set",
      changes: [{ target: {}, values: { name: "" } }],
    });
  });
});

describe("the name field among named MatchStamps", () => {
  const S = blockId(0);
  const stampsStore = () => fixtureStore("bundles/bundle_matchstamps");
  const fieldIn = (store: Store, id: string) => nameIn(store, selectionOf([{ block: S, id }]));
  const manifestOf = (store: Store) => store.view.blocks[S]?.manifest;

  it.each<[string, string, boolean]>([
    ["matchstamp_1", "Bar 2, downbeat (take 1)", false],
    ["timestamp_3", "Take 2, bar 2", true],
    ["timestamp_4", "origin", false],
  ])("names %s %j, nullable %j", (id, name, nullable) => {
    const store = stampsStore();
    expect(fieldIn(store, id)).toEqual({
      target: { block: S, id },
      name,
      nullable,
      manifest: manifestOf(store),
    });
  });

  it("is absent for an alignment anchor", () => {
    expect(fieldIn(stampsStore(), "anchor_1")).toBe(null);
  });

  it("deletes a match timestamp's name when emptied, and sends a MatchStamp's empty", () => {
    const store = stampsStore();
    const timestamp = fieldIn(store, "timestamp_3");
    const matchstamp = fieldIn(store, "matchstamp_1");
    if (timestamp === null || matchstamp === null) throw new Error("no name field");
    expect(nameCommand(matchstamp, "")).toEqual({
      type: "set",
      changes: [{ target: { block: S, id: "matchstamp_1" }, values: { name: "" } }],
    });
    const command = nameCommand(timestamp, "");
    expect(command).toEqual({
      type: "set",
      changes: [{ target: { block: S, id: "timestamp_3" }, values: { name: null } }],
    });
    if (command === null) throw new Error("no command");
    const entries = store.journal.length;
    expect(store.dispatch(command)).toBe(null);
    expect(store.journal).toHaveLength(entries + 1);
    const stored = manifestOf(store)?.graphical?.timestamps?.find(
      (item) => item.id === "timestamp_3",
    );
    expect(stored).toStrictEqual({
      id: "timestamp_3",
      timeline: "take_2",
      coordinate: 99225,
      display: ["name", "cross_section"],
      matchstamp: true,
      groupstamp: false,
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
  function show(store: Store, elements: ElementAddress[] | null, level: Level = "arranger"): void {
    showSelection(store, addresses(...(elements ?? [])), level);
  }

  /** The information the panel posted to the message bar since it was mounted. */
  let informed: string[] = [];

  /** Mount the panel on `store` for the addresses `selection`. */
  function showSelection(store: Store, selection: Selection, level: Level = "arranger"): void {
    const live = liveStore(store);
    const editing = editorAt(level, M);
    const subjects = () => resolveSelection(live.view, selection, editing, fontMetrics);
    informed = [];
    app = mount(PropertiesPanel, {
      target: document.body,
      context: informing(informed),
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
        editing,
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
    return document.querySelector<HTMLInputElement>("label.locked input[type=checkbox]");
  }

  function lastCommand(store: Store): unknown {
    return (store.journal.at(-1) as CommandEntry | undefined)?.command;
  }

  it("shows the name first, and renames the manifest in one entry", () => {
    const store = storeOf();
    show(store, [{ id: "group_1" }]);
    const [first] = document.querySelectorAll("input");
    expect([first?.name, first?.type, first?.labels?.[0]?.textContent?.trim()]).toEqual([
      "name",
      "text",
      "Name",
    ]);
    expect(input("name").value).toBe("Performance");
    if (app !== undefined) unmount(app);
    document.body.innerHTML = "";
    show(store, [{}]);
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
    showSelection(storeOf(), selectionOf([{ block: M }, { block: "bshared000" }]));
    expect(document.querySelector('input[name="name"]')).toBe(null);
    expect(document.querySelector(".hint")?.textContent).toBe(
      "Select a block, a frame or a card to edit its geometry.",
    );
  });

  it("names the edited group in its editor with nothing selected, and renames it there", () => {
    const store = storeOf();
    expect(store.open({ block: M, id: "group_1" })).toBe(null);
    showSelection(store, NOTHING_SELECTED, "group");
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
    show(storeOf(), [{ id: "score", part: ["card"] }]);
    const row = input("height").closest("label")?.parentElement;
    const cells = [...(row?.children ?? [])].map((cell) => cell.textContent?.trim());
    expect(cells).toEqual(["container width", "container height", "Locked"]);
    const box = locked();
    expect([box?.checked, box?.disabled, box?.indeterminate]).toEqual([false, true, false]);
  });

  it.each<[ElementAddress[], boolean, boolean]>([
    [[{ id: "excerpt", part: ["card"] }], true, false],
    [
      [
        { id: "score", part: ["card"] },
        { id: "excerpt", part: ["card"] },
      ],
      false,
      true,
    ],
    [[{ id: "recording" }], false, false],
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

  it.each<[ElementAddress[]]>([
    [[{}]],
    [[{ id: "group_1" }]],
    [[{ id: "performance", facet: "markers" }]],
  ])("shows no Locked checkbox for %j", (elements) => {
    show(storeOf(), elements);
    expect(locked()).toBe(null);
  });

  function ancestorCard(): HTMLButtonElement | null {
    return document.querySelector<HTMLButtonElement>('button[data-testid="ancestor-card"]');
  }

  /** The ancestor cards of `recording` the store's block draws. */
  const recordingCards = (store: Store) =>
    drawingOf(blockOf(store), store.view.graphical, fontMetrics).boxes.filter(
      (box) => box.ancestor !== undefined && box.address.id === "recording",
    ).length;

  /** The own rule's command of `recording`'s ancestor cards setting `display`. */
  const ownCommand = (display: "none" | "inline" | null) => ({
    type: "style",
    select: { element: "ancestor_card", addresses: [{ id: "recording", part: ["card"] }] },
    set: { display },
    blocks: [M],
  });

  /** Dispatch `command`, failing on a refusal. */
  function dispatched(store: Store, command: Parameters<Store["dispatch"]>[0]): void {
    const refusal = store.dispatch(command);
    if (refusal !== null) throw new Error(refusal.message);
  }

  /** The workspace's layer showing every ancestor card, so no case rests on the defaults. */
  function showAll(store: Store): void {
    dispatched(store, {
      type: "set",
      changes: [
        {
          target: {},
          values: {
            graphical: {
              rules: [{ select: { element: "ancestor_card" }, set: { display: "inline" } }],
            },
          },
        },
      ],
    });
  }

  /** The button's text, whether it is disabled (`aria-disabled`), and its title. */
  const button = () => {
    const found = ancestorCard();
    return [
      found?.textContent?.trim(),
      found?.getAttribute("aria-disabled") === "true",
      found?.title,
    ];
  };

  /**
   * What assistive technology reads of the button: its name (its text, no `aria-label`), its
   * `aria-disabled`, the text of the elements `aria-describedby` names, and whether it takes the
   * focus (never the `disabled` attribute, which would take it out of the tab order).
   */
  const reachable = () => {
    const found = ancestorCard();
    found?.focus();
    const described = (found?.getAttribute("aria-describedby") ?? "")
      .split(" ")
      .filter((id) => id !== "")
      .map((id) => document.getElementById(id)?.textContent?.trim());
    return {
      name: found?.textContent?.trim(),
      label: found?.getAttribute("aria-label"),
      disabled: found?.getAttribute("aria-disabled"),
      described,
      focused: found !== null && document.activeElement === found && !found.disabled,
    };
  };
  const TITLE = "The timeline drawn whole behind the frames of its members' groups";

  /** Click the button and let the panel follow the store. */
  function click(): void {
    ancestorCard()?.click();
    flushSync();
  }

  it.each<[ElementAddress[]]>([[[{ id: "recording" }]], [[{ id: "recording", part: ["card"] }]]])(
    "hides recording's drawn ancestor cards by its own rule and shows them again for %j",
    (elements) => {
      const store = storeOf();
      showAll(store);
      const rules = blockOf(store).manifest.graphical?.rules;
      expect(recordingCards(store)).toBe(1);
      show(store, elements);
      expect(button()).toEqual(["Hide card behind its groups", false, TITLE]);
      const before = store.journal.length;
      click();
      expect(store.journal.length).toBe(before + 1);
      expect(lastCommand(store)).toEqual(ownCommand("none"));
      expect(recordingCards(store)).toBe(0);
      expect(button()).toEqual(["Show card behind its groups", false, TITLE]);
      click();
      expect(store.journal.length).toBe(before + 2);
      expect(lastCommand(store)).toEqual(ownCommand(null));
      expect(recordingCards(store)).toBe(1);
      expect(blockOf(store).manifest.graphical?.rules).toEqual(rules);
      expect(button()).toEqual(["Hide card behind its groups", false, TITLE]);
    },
  );

  it.each<[ElementAddress[]]>([
    [[{ id: "score", part: ["card"] }]],
    [[{ id: "excerpt" }]],
    [[{ id: "group_1" }]],
    [[{}]],
    [[{ id: "recording" }, { id: "score" }]],
  ])("offers no ancestor-card button for %j", (elements) => {
    show(storeOf(), elements);
    expect(ancestorCard()).toBe(null);
  });

  it("shows a card a manifest-wide rule hides by the own rule, which outranks it", () => {
    const store = storeOf();
    showAll(store);
    dispatched(store, {
      type: "style",
      select: { element: "ancestor_card" },
      set: { display: "none" },
      blocks: [M],
    });
    expect(recordingCards(store)).toBe(0);
    show(store, [{ id: "recording" }]);
    expect(button()).toEqual(["Show card behind its groups", false, TITLE]);
    click();
    expect(lastCommand(store)).toEqual(ownCommand("inline"));
    expect(recordingCards(store)).toBe(1);
    expect(button()).toEqual(["Hide card behind its groups", false, TITLE]);
    click();
    expect(lastCommand(store)).toEqual(ownCommand("none"));
    expect(recordingCards(store)).toBe(0);
    click();
    expect(lastCommand(store)).toEqual(ownCommand("inline"));
    expect(recordingCards(store)).toBe(1);
  });

  it("disables Show where a rule the own one cannot outrank hides the card", () => {
    const store = storeOf();
    showAll(store);
    dispatched(store, {
      type: "style",
      select: {
        element: "ancestor_card",
        addresses: [{ id: "recording", part: ["card"] }],
        within: "recording",
      },
      set: { display: "none" },
      blocks: [M],
    });
    expect(recordingCards(store)).toBe(0);
    show(store, [{ id: "recording" }]);
    expect(button()).toEqual(["Show card behind its groups", true, TITLE]);
    expect(reachable()).toEqual({
      name: "Show card behind its groups",
      label: null,
      disabled: "true",
      described: ["Hidden by another style rule"],
      focused: true,
    });
    const before = store.journal.length;
    click();
    expect(store.journal.length).toBe(before);
    expect(recordingCards(store)).toBe(0);
  });

  it("disables Hide where a rule the own one cannot outrank shows the card", () => {
    const store = storeOf();
    showAll(store);
    dispatched(store, {
      type: "style",
      select: {
        element: "ancestor_card",
        addresses: [{ id: "recording", part: ["card"] }],
        within: "recording",
      },
      set: { display: "inline" },
      blocks: [M],
    });
    expect(recordingCards(store)).toBe(1);
    show(store, [{ id: "recording" }]);
    expect(button()).toEqual(["Hide card behind its groups", true, TITLE]);
    expect(reachable()).toEqual({
      name: "Hide card behind its groups",
      label: null,
      disabled: "true",
      described: ["Shown by another style rule"],
      focused: true,
    });
    const journal = store.journal;
    click();
    expect(store.journal).toBe(journal);
    expect(store.journal.length).toBe(journal.length);
    expect(recordingCards(store)).toBe(1);
  });

  it("describes an enabled button by nothing and sets no aria-disabled", () => {
    const store = storeOf();
    showAll(store);
    show(store, [{ id: "recording" }]);
    expect(reachable()).toEqual({
      name: "Hide card behind its groups",
      label: null,
      disabled: null,
      described: [],
      focused: true,
    });
  });

  it("tries the button's commands once per manifest and workspace layer", () => {
    const store = storeOf();
    showAll(store);
    dispatched(store, ownCommand("none"));
    const evaluate = () => {
      const view = store.view;
      const block = blockOf(store);
      const drawing = drawingOf(block, view.graphical, fontMetrics);
      const subjects = resolveSelection(view, addresses({ id: "recording" }), null, fontMetrics);
      const draws = vi.mocked(drawingOf).mock.calls.length;
      const shown = ancestorCardOf(view, block, subjects, drawing);
      return [shown?.drawn, shown?.command?.set, vi.mocked(drawingOf).mock.calls.length - draws];
    };
    expect(evaluate()).toEqual([false, { display: null }, 1]);
    expect(evaluate()).toEqual([false, { display: null }, 0]);
    dispatched(store, {
      type: "set",
      changes: [{ target: { block: M }, values: { name: "Op. 35" } }],
    });
    expect(evaluate()).toEqual([false, { display: null }, 1]);
  });

  /** The notice a size below `minimum` gives. */
  const below = (property: string, minimum: number) =>
    `To decrease the ${property} below ${shownValue(minimum)} px, decrease the size of the contained elements first.`;

  it("gives the block its minimum height as a number, and says so", () => {
    const store = storeOf();
    const minimum = drawingOf(blockOf(store), store.view.graphical, fontMetrics).height;
    const expected = placeEdit(store.view, addresses({}), "height", minimum, null, fontMetrics);
    show(store, [{}]);
    type("height", "1");
    press("height", "Enter");
    expect(lastCommand(store)).toEqual(expected);
    expect(informed).toEqual([below("height", minimum)]);
    expect(input("height").value).toBe(shownValue(minimum));
    type("height", "2");
    expect(informed).toEqual([below("height", minimum)]);
  });

  it.each(["height", "width"] as const)(
    "unstates a frame's %s at or below its minimum, and says so below it",
    (property) => {
      const store = storeOf();
      const minimum = frameSize(blockOf(store), store, "group_1", property);
      const stated = {
        type: "set",
        changes: [
          { target: { block: M, id: "group_1" }, values: { place: { [property]: minimum + 10 } } },
        ],
      };
      expect(store.dispatch(stated)).toBe(null);
      const expected = placeEdit(
        store.view,
        addresses({ id: "group_1" }),
        property,
        null,
        null,
        fontMetrics,
      );
      show(store, [{ id: "group_1" }]);
      expect(input(property).value).toBe(shownValue(minimum + 10));
      type(property, "1");
      press(property, "Enter");
      expect(lastCommand(store)).toEqual(expected);
      expect(blockOf(store).places.group_1?.[property]).toBe(undefined);
      expect(informed).toEqual([below(property, minimum)]);
      expect(input(property).value).toBe(shownValue(minimum));
      const entries = store.journal.length;
      type(property, "1");
      press(property, "Enter");
      expect(store.journal.length).toBe(entries);
      expect(informed).toEqual([below(property, minimum), below(property, minimum)]);
      type(property, String(minimum));
      press(property, "Enter");
      expect([store.journal.length, informed.length]).toEqual([entries, 2]);
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
      addresses({ id: "group_1" }, { id: "group_2" }),
      "height",
      value,
      null,
      fontMetrics,
    );
    if (both === null || "code" in both) throw new Error("no edit of both frames");
    show(store, [{ id: "group_1" }, { id: "group_2" }]);
    type("height", String(value));
    press("height", "Enter");
    expect(lastCommand(store)).toEqual({
      ...both,
      changes: both.changes.filter(
        (change) => !sameAddress(change.target, { block: M, id: high.key }),
      ),
    });
    expect([
      block.places,
      blockOf(store).places[low.key]?.height,
      blockOf(store).places[high.key]?.height,
    ]).toEqual([{}, value, undefined]);
    expect(informed).toEqual([below("height", high.minimum)]);
  });

  it("says nothing for a size above the minimum", () => {
    const store = storeOf();
    show(store, [{ id: "group_1" }]);
    type("height", String(frameSize(blockOf(store), store, "group_1", "height") + 10));
    press("height", "Enter");
    expect(informed).toEqual([]);
  });
});

/** The drawn size of the frame of `group`, which nothing states: its minimum. */
function frameSize(
  block: Block,
  store: Store,
  group: string,
  property: "width" | "height",
): number {
  const drawing = drawingOf(block, store.view.graphical, fontMetrics);
  const frame = drawing.boxes.find(
    (box) => box.kind === "frame" && sameAddress(box.address, { id: group }),
  );
  const size = frame?.item?.place[property];
  if (size === undefined) throw new Error(`no frame ${group}`);
  return size;
}
