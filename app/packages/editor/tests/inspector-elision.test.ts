/**
 * The elision section of the Properties tab and the form of a selected
 * elision. The expected values are derived in `README.md` ("The elision
 * section").
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import type { Selection, Subject } from "@timetoalign/tilie-arranger";
import { drawingOf, liveStore, resolveSelection, selectionOf } from "@timetoalign/tilie-arranger";
import type { Address, Block, CommandEntry, ElementAddress, Store } from "@timetoalign/tilie-core";
import { createStore, isLoadError, readWorkspace } from "@timetoalign/tilie-core";
import { fontMetrics } from "@timetoalign/timetoshare";
import { flushSync, mount, unmount } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ElisionForm, ElisionSection } from "../src/inspector/elisions.ts";
import { elisionFormOf, elisionSectionOf } from "../src/inspector/elisions.ts";
import { groupsOf } from "../src/inspector/groups.ts";
import { describesNothing, shownOf } from "../src/inspector/metadata/frame.ts";
import PropertiesPanel from "../src/inspector/PropertiesPanel.svelte";
import { lockOf, nameOf } from "../src/inspector/properties.ts";
import { PropertyDrafts } from "../src/inspector/propertyDrafts.svelte.ts";
import { selectedBlock } from "../src/inspector/selection.ts";
import { blockId, informing, storeOf, withFullCards } from "./support.ts";

// The arranger itself, its `drawingOf` counted: the section's trials are counted through it.
vi.mock("@timetoalign/tilie-arranger", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@timetoalign/tilie-arranger")>();
  return { ...actual, drawingOf: vi.fn(actual.drawingOf) };
});

const B = blockId(0);
const INSIDE = "groups/group_elided_inside";
const STORED = "bundles/bundle_elisions_stored";

function blockOf(store: Store): Block {
  const block = store.view.blocks[B];
  if (block === undefined) throw new Error(`no block ${B}`);
  return block;
}

/** The subjects of `elements` of `B` in the store. */
function subjectsOf(store: Store, elements: readonly ElementAddress[]): Subject[] {
  const selection = selectionOf(elements.map((element) => ({ block: B, ...element })));
  return resolveSelection(store.view, selection, null, fontMetrics);
}

/** The section `elements` of `B` are offered. */
function sectionOf(store: Store, ...elements: ElementAddress[]): ElisionSection | null {
  const block = blockOf(store);
  const drawing = drawingOf(block, store.view.graphical, fontMetrics);
  return elisionSectionOf(store.view, block, subjectsOf(store, elements), drawing);
}

/** The form of the one selected `element` of `B`. */
function formOf(store: Store, element: ElementAddress): ElisionForm | null {
  const block = blockOf(store);
  const drawing = drawingOf(block, store.view.graphical, fontMetrics);
  return elisionFormOf(block, subjectsOf(store, [element]), drawing);
}

/** The rows of a section as plain text: timeline, stretch, width. */
function rowsOf(section: ElisionSection | null): string[][] {
  return (section?.rows ?? []).map((row) => [row.timeline, row.stretch, row.width]);
}

/** The strips the block's drawing holds. */
function strips(store: Store): number {
  return drawingOf(blockOf(store), store.view.graphical, fontMetrics).elements.filter(
    (element) => element.type === "elision",
  ).length;
}

/** The ancestor cards of `root` the block's drawing holds. */
function cards(store: Store, root: string): number {
  return drawingOf(blockOf(store), store.view.graphical, fontMetrics).boxes.filter(
    (box) => box.ancestor !== undefined && box.address.id === root,
  ).length;
}

function lastCommand(store: Store): unknown {
  return (store.journal.at(-1) as CommandEntry | undefined)?.command;
}

/** The style command of `select` in `B` setting `display`. */
const style = (select: unknown, display: "none" | "inline" | null) => ({
  type: "style",
  select,
  set: { display },
  blocks: [B],
});
const within = (root: string) => ({ element: "elision", within: root });
const card = (root: string) => ({
  element: "ancestor_card",
  addresses: [{ id: root, part: ["card"] }],
});

describe("where the section is offered", () => {
  it.each<[ElementAddress[]]>([
    [[{ id: "excerpt", part: ["card"] }]],
    [[{ id: "first" }]],
    [[{ id: "piece" }]],
    [[{ id: "second", part: ["elision"] }]],
  ])("offers piece's section for %j", (elements) => {
    expect(sectionOf(storeOf(INSIDE), ...elements)?.title).toBe('Parent timeline "Piece"');
  });

  it.each<[ElementAddress[]]>([
    [[{ id: "recording" }]],
    [[{}]],
    [[{ id: "group_1" }]],
    [[{ id: "excerpt" }, { id: "recording" }]],
  ])("offers none for %j", (elements) => {
    expect(sectionOf(storeOf(INSIDE), ...elements)).toBe(null);
  });

  it("offers an ungrouped root's section with two modes", () => {
    const section = sectionOf(storeOf(STORED), { id: "page" });
    expect(section?.title).toBe('Elisions of "Page"');
    expect(section?.options.map((option) => option.mode)).toEqual(["elided", "full"]);
  });
});

describe("what the section reads", () => {
  it("reads piece's default elisions", () => {
    const section = sectionOf(storeOf(INSIDE), { id: "piece" });
    expect(section?.mode).toBe("elided");
    expect(section?.status).toBe("automatic, 0.1429 of their length");
    expect(rowsOf(section)).toEqual([
      ["First", "0–8 ♩, 16–32 ♩", "automatic"],
      ["Second", "0–32 ♩", "automatic"],
    ]);
    expect(section?.rows.map((row) => row.address)).toEqual([
      { block: B, id: "first", part: ["elision"] },
      { block: B, id: "second", part: ["elision"] },
    ]);
    expect(section?.rootLeftRight).toEqual({
      type: "add",
      into: { block: B },
      elision: [
        { timeline: "piece", start: [0, 1], end: [8, 1] },
        { timeline: "piece", start: [16, 1], end: [64, 1] },
      ],
    });
    expect(section?.reset).toBe(null);
    expect(section?.options).toEqual([
      { mode: "elided", commands: [], reason: null },
      { mode: "full", commands: [style(within("piece"), "none")], reason: null },
      { mode: "hidden", commands: [style(card("piece"), "none")], reason: null },
    ]);
  });

  it("reads score's stored elisions with their widths", () => {
    const section = sectionOf(storeOf(STORED), { id: "score" });
    expect([section?.mode, section?.status]).toEqual(["elided", "4 stored elisions"]);
    expect(rowsOf(section)).toEqual([
      ["Score", "0–16 ♩", "0.5 of its length"],
      ["Score", "32–48 ♩", "as wide as 4 ♩"],
      ["Score", "48–56 ♩", "30 px"],
    ]);
    expect(section?.reset).toEqual({
      type: "remove",
      targets: ["elision_1", "elision_4", "elision_5", "elision_6"].map((id) => ({ block: B, id })),
    });
  });

  it("reads session drawn whole by its own rule", () => {
    const section = sectionOf(storeOf(STORED), { id: "session" });
    expect([section?.mode, section?.status, rowsOf(section)]).toEqual([
      "full",
      "1 stored elision",
      [],
    ]);
    expect(section?.options[0]).toEqual({
      mode: "elided",
      commands: [style(within("session"), null)],
      reason: null,
    });
  });

  it("reads the ungrouped page", () => {
    const section = sectionOf(storeOf(STORED), { id: "page" });
    expect([section?.mode, section?.status, rowsOf(section)]).toEqual([
      "elided",
      "1 stored elision",
      [["Page", "600–1 754 px", "automatic"]],
    ]);
  });

  it("reads the Full view of the workspace's layer as held, Elided outranking it", () => {
    const store = withFullCards(storeOf(INSIDE));
    const section = sectionOf(store, { id: "piece" });
    expect(section?.mode).toBe("full");
    expect(section?.options[0]?.commands).toEqual([style(within("piece"), "inline")]);
    expect(section?.status).toBe("automatic, 0.1429 of their length");
  });

  it("tries its commands once per manifest and workspace layer", () => {
    const store = storeOf(INSIDE);
    const calls = () => vi.mocked(drawingOf).mock.calls.length;
    const block = blockOf(store);
    const drawing = drawingOf(block, store.view.graphical, fontMetrics);
    const subjects = subjectsOf(store, [{ id: "piece" }]);
    elisionSectionOf(store.view, block, subjects, drawing);
    const before = calls();
    elisionSectionOf(store.view, block, subjects, drawing);
    expect(calls() - before).toBe(0);
    const refused = store.dispatch({
      type: "set",
      changes: [{ target: { block: B }, values: { name: "Op. 1" } }],
    });
    expect(refused).toBe(null);
    const renamed = blockOf(store);
    const again = calls();
    elisionSectionOf(store.view, renamed, subjectsOf(store, [{ id: "piece" }]), drawing);
    expect(calls() - again).toBe(4);
  });
});

describe("a selected elision's form", () => {
  it("reads a default elision, its widths converted from the drawn one", () => {
    const form = formOf(storeOf(INSIDE), { id: "second", part: ["elision"] });
    expect({
      title: form?.title,
      start: form?.start,
      end: form?.end,
      unit: form?.unit,
      share: form?.share,
      form: form?.form,
      widths: form?.widths,
      proportion: form?.proportion,
      display: form?.display,
    }).toEqual({
      title: 'Elision of "Second"',
      start: "0",
      end: "32",
      unit: "♩",
      share: "0 % … 100 % of Second",
      form: "automatic",
      widths: { ratio: "0.1429", span: "4.5714", canvas: "228.57" },
      proportion: "0.1429",
      display: ["strip", "name", "coordinate"],
    });
  });

  it("reads a stored elision as stored", () => {
    const form = formOf(storeOf(STORED), { id: "elision_5" });
    expect([form?.start, form?.end, form?.form, form?.widths.span]).toEqual([
      "32",
      "48",
      "span",
      "4",
    ]);
    expect(formOf(storeOf(STORED), { id: "elision_2" })?.proportion).toBe("0.5199");
  });

  it("is absent for anything but one elision", () => {
    const store = storeOf(INSIDE);
    expect(formOf(store, { id: "piece" })).toBe(null);
  });
});

describe("a stored elision's other fields", () => {
  /** The end-to-end `bundles` workspace with `elision_1` added to the timeline `score`. */
  function storeWithElision(): Store {
    const text = readFileSync(
      path.join(import.meta.dirname, "..", "..", "..", "e2e", "fixtures", "bundles.tle.json"),
      "utf8",
    );
    const read = readWorkspace(text);
    if (isLoadError(read)) throw new Error("bundles.tle.json is refused");
    const store = createStore(read);
    const error = store.dispatch({
      type: "add",
      into: { block: "bmixed0000", id: "score" },
      elision: { start: [1, 1], end: [2, 1] },
    });
    if (error !== null) throw new Error(error.message);
    return store;
  }

  it("has no statements, name, lock or groups", () => {
    const { view } = storeWithElision();
    const subjects = resolveSelection(
      view,
      selectionOf([{ block: "bmixed0000", id: "elision_1" }]),
      null,
      fontMetrics,
    );
    expect(subjects.map((subject) => subject.resolved.kind)).toEqual(["elision"]);
    expect(shownOf(view, subjects, null)).toEqual({
      kind: "none",
      hint: describesNothing("elision 'elision_1' in bundle 'Mixed'"),
    });
    expect(nameOf(view, subjects, null)).toBeNull();
    expect(lockOf(subjects)).toBeNull();
    expect(groupsOf(view, subjects, null)).toBeNull();
  });
});

describe("the section in the Properties tab", () => {
  let app: ReturnType<typeof mount> | undefined;
  let selected: Address[] = [];

  afterEach(() => {
    if (app !== undefined) unmount(app);
    app = undefined;
    document.body.innerHTML = "";
  });

  /** Mount the panel on `store` for `elements` of `B`. */
  function show(store: Store, ...elements: ElementAddress[]): void {
    const live = liveStore(store);
    const selection: Selection = selectionOf(elements.map((element) => ({ block: B, ...element })));
    const subjects = () => resolveSelection(live.view, selection, null, fontMetrics);
    selected = [];
    app = mount(PropertiesPanel, {
      target: document.body,
      context: informing([]),
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
        editing: null,
        placement: null,
        drafts: new PropertyDrafts(),
        onselect: (address: Address) => selected.push(address),
      },
    });
    flushSync();
  }

  const radio = (word: string) =>
    [...document.querySelectorAll<HTMLInputElement>('.mode input[type="radio"]')].find(
      (input) => input.parentElement?.textContent?.trim() === word,
    );
  const checked = () =>
    [...document.querySelectorAll<HTMLInputElement>('.mode input[type="radio"]')]
      .filter((input) => input.checked)
      .map((input) => input.value);
  const status = () =>
    document.querySelector('[data-testid="elision-status"]')?.textContent?.trim();
  const button = (text: string) =>
    [...document.querySelectorAll<HTMLButtonElement>("button")].find(
      (found) => found.textContent?.trim() === text,
    );

  /** Choose a radio as a click does. */
  function choose(input: HTMLInputElement | undefined): void {
    input?.click();
    flushSync();
  }

  function click(found: HTMLButtonElement | undefined | null): void {
    found?.click();
    flushSync();
  }

  function enter(name: string, text: string): HTMLInputElement | null {
    const input = document.querySelector<HTMLInputElement>(
      `[data-testid="elision-form"] input[name="${name}"]`,
    );
    if (input === null) return null;
    input.value = text;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    flushSync();
    return input;
  }

  it("stands directly under the name, outside the geometry form", () => {
    show(storeOf(INSIDE), { id: "excerpt", part: ["card"] });
    const section = document.querySelector('[data-testid="elisions"]');
    expect(document.querySelector("label.name")?.nextElementSibling).toBe(section);
    expect(section?.closest("form")).toBe(null);
    expect(section?.querySelector("h3")?.textContent).toBe('Parent timeline "Piece"');
  });

  it("switches to Full by one command, and undo gives Elided back", () => {
    const store = storeOf(INSIDE);
    const rules = blockOf(store).manifest.graphical?.rules;
    show(store, { id: "excerpt" });
    expect(checked()).toEqual(["elided"]);
    expect(strips(store)).toBe(3);
    const before = store.journal.length;
    choose(radio("Full"));
    expect(store.journal.length).toBe(before + 1);
    expect(lastCommand(store)).toEqual(style(within("piece"), "none"));
    expect(strips(store)).toBe(0);
    expect(checked()).toEqual(["full"]);
    expect(status()).toBe("Elisions: automatic, 0.1429 of their length");
    store.undo();
    flushSync();
    expect(blockOf(store).manifest.graphical?.rules).toEqual(rules);
    expect(checked()).toEqual(["elided"]);
  });

  it("hides the card, and shows it Elided by one command or Full by two", () => {
    const store = storeOf(INSIDE);
    show(store, { id: "piece" });
    const before = store.journal.length;
    choose(radio("Hidden"));
    expect(lastCommand(store)).toEqual(style(card("piece"), "none"));
    expect([cards(store, "piece"), checked()]).toEqual([0, ["hidden"]]);
    choose(radio("Elided"));
    expect(store.journal.length).toBe(before + 2);
    expect(lastCommand(store)).toEqual(style(card("piece"), null));
    expect([cards(store, "piece"), strips(store), checked()]).toEqual([1, 3, ["elided"]]);
    choose(radio("Hidden"));
    choose(radio("Full"));
    expect(store.journal.length).toBe(before + 5);
    expect(store.journal.slice(-2).map((entry) => (entry as CommandEntry).command)).toEqual([
      style(card("piece"), null),
      style(within("piece"), "none"),
    ]);
    expect([cards(store, "piece"), strips(store), checked()]).toEqual([1, 0, ["full"]]);
  });

  it.each([
    ["inline", "Hidden", "Hidden: Shown by another style rule"],
    ["none", "Elided", "Elided: Hidden by another style rule"],
    ["none", "Full", "Full: Hidden by another style rule"],
  ] as const)(
    "holds %s by a rule the own one cannot outrank: %s reachable and explained",
    (display, word, hint) => {
      const store = storeOf(INSIDE);
      expect(
        store.dispatch(
          style({ ...card("piece"), within: "piece" }, display) as Parameters<Store["dispatch"]>[0],
        ),
      ).toBe(null);
      show(store, { id: "piece" });
      const input = radio(word);
      const described = (input?.getAttribute("aria-describedby") ?? "")
        .split(" ")
        .map((id) => document.getElementById(id)?.textContent?.trim());
      expect([input?.getAttribute("aria-disabled"), input?.disabled, described]).toEqual([
        "true",
        false,
        [hint],
      ]);
      const journal = store.journal;
      choose(input);
      expect(store.journal).toBe(journal);
    },
  );

  it("stores the root left and right in one entry and resets it in one", () => {
    const store = storeOf(INSIDE);
    show(store, { id: "piece" });
    const before = store.journal.length;
    click(button("Root left and right"));
    expect(store.journal.length).toBe(before + 1);
    expect(blockOf(store).manifest.graphical?.elisions?.map((each) => each.id)).toEqual([
      "elision_1",
      "elision_2",
    ]);
    expect(status()).toBe("Elisions: 2 stored elisions");
    click(button("Reset to automatic"));
    expect(store.journal.length).toBe(before + 2);
    expect(lastCommand(store)).toEqual({
      type: "remove",
      targets: [
        { block: B, id: "elision_1" },
        { block: B, id: "elision_2" },
      ],
    });
    expect(status()).toBe("Elisions: automatic, 0.1429 of their length");
  });

  it("selects a row, and deletes a default one by storing the others, undone at once", () => {
    const store = storeOf(INSIDE);
    show(store, { id: "piece" });
    click(document.querySelector<HTMLButtonElement>("button.row:last-of-type"));
    const rows = [...document.querySelectorAll<HTMLButtonElement>("button.row")];
    click(rows[1]);
    expect(selected).toEqual([{ block: B, id: "second", part: ["elision"] }]);
    const before = store.journal.length;
    click(document.querySelectorAll<HTMLButtonElement>("button.delete")[1]);
    expect(store.journal.length).toBe(before + 1);
    expect(lastCommand(store)).toEqual({
      type: "add",
      into: { block: B },
      elision: [
        { timeline: "first", start: [0, 1], end: [8, 1] },
        { timeline: "first", start: [16, 1], end: [32, 1] },
      ],
    });
    store.undo();
    flushSync();
    expect(blockOf(store).manifest.graphical?.elisions).toEqual([]);
  });

  it("stores the defaults with a typed end of a default elision", () => {
    const store = storeOf(INSIDE);
    show(store, { id: "second", part: ["elision"] });
    enter("end", "16");
    expect(lastCommand(store)).toEqual({
      type: "add",
      into: { block: B },
      elision: [
        { timeline: "first", start: [0, 1], end: [8, 1] },
        { timeline: "first", start: [16, 1], end: [32, 1] },
        { timeline: "second", start: [0, 1], end: [16, 1] },
      ],
    });
  });

  it("edits a stored elision exactly, one command each", () => {
    const store = storeOf(STORED);
    show(store, { id: "elision_5" });
    const target = { block: B, id: "elision_5" };
    enter("start", "33.5");
    expect(lastCommand(store)).toEqual({
      type: "set",
      changes: [{ target, values: { start: [67, 2] } }],
    });
    const before = store.journal.length;
    const refused = enter("start", "x");
    expect(store.journal.length).toBe(before);
    expect(refused?.getAttribute("aria-invalid")).toBe("true");
    expect(
      document.getElementById(refused?.getAttribute("aria-describedby") ?? "")?.textContent,
    ).toBe('"x" is no fraction value; write an integer, n/d, a b/c or a decimal');
    const name = [...document.querySelectorAll<HTMLInputElement>('input[name="display"]')].find(
      (input) => input.value === "name",
    );
    name?.click();
    flushSync();
    expect(lastCommand(store)).toEqual({
      type: "set",
      changes: [{ target, values: { display: ["strip", "coordinate"] } }],
    });
    click(button("Delete elision"));
    expect(lastCommand(store)).toEqual({ type: "remove", targets: [target] });
  });

  it("chooses Fixed with the drawn width, so that it does not jump", () => {
    const store = storeOf(STORED);
    show(store, { id: "elision_5" });
    const drawn = drawingOf(blockOf(store), store.view.graphical, fontMetrics).elements.find(
      (element) => element.type === "elision" && element.address.id === "elision_5",
    );
    const width = drawn?.type === "elision" ? drawn.x2 - drawn.x1 : Number.NaN;
    const fixed = document.querySelector<HTMLInputElement>('input[type="radio"][value="canvas"]');
    fixed?.click();
    flushSync();
    expect(lastCommand(store)).toEqual({
      type: "set",
      changes: [
        {
          target: { block: B, id: "elision_5" },
          values: { width: { canvas: Number(width.toFixed(2)) } },
        },
      ],
    });
  });
});
