/**
 * The Elisions tab: the root's block, the group's block and the form of a
 * selected elision, each a collapsible block. The expected values are
 * derived in `README.md` ("The Elisions tab").
 */

import type { Editing, Selection, Subject } from "@timetoalign/tilie-arranger";
import {
  drawingOf,
  liveStore,
  Pane,
  resolveSelection,
  selectionOf,
  stretchText,
  styleLayers,
} from "@timetoalign/tilie-arranger";
import type {
  Address,
  Block,
  Command,
  CommandEntry,
  ElementAddress,
  Store,
} from "@timetoalign/tilie-core";
import type { Drawing } from "@timetoalign/tilie-layout";
import { draw } from "@timetoalign/tilie-layout";
import { fontMetrics } from "@timetoalign/timetoshare";
import { flushSync, mount, unmount } from "svelte";
import { afterEach, describe, expect, it } from "vitest";
import ElisionsPanel from "../src/inspector/ElisionsPanel.svelte";
import type { ElisionForm, GroupElisions, RootElisions } from "../src/inspector/elisions.ts";
import {
  elisionFormOf,
  fieldCommand,
  groupElisionsOf,
  rootElisionsOf,
} from "../src/inspector/elisions.ts";
import Inspector from "../src/inspector/Inspector.svelte";
import PropertiesPanel from "../src/inspector/PropertiesPanel.svelte";
import { nameOf } from "../src/inspector/properties.ts";
import { PropertyDrafts } from "../src/inspector/propertyDrafts.svelte.ts";
import { selectedBlock } from "../src/inspector/selection.ts";
import { paneContext } from "../src/pane.ts";
import { holder } from "./holder.svelte.ts";
import { blockId, informing, providing, storeOf } from "./support.ts";

const B = blockId(0);
const INSIDE = "groups/group_elided_inside";
const STORED = "bundles/bundle_elisions_stored";
const MEMBERS = "groups/group_elided_members";
const ARRANGED = "bundles/bundle_arranged_roots";

function blockOf(store: Store): Block {
  const block = store.view.blocks[B];
  if (block === undefined) throw new Error(`no block ${B}`);
  return block;
}

function subjectsOf(store: Store, elements: readonly ElementAddress[]): Subject[] {
  const selection = selectionOf(elements.map((element) => ({ block: B, ...element })));
  return resolveSelection(store.view, selection, null, fontMetrics);
}

function drawn(store: Store) {
  return drawingOf(blockOf(store), store.view.graphical, fontMetrics);
}

function rootOf(store: Store, ...elements: ElementAddress[]): RootElisions | null {
  return rootElisionsOf(store.view, blockOf(store), subjectsOf(store, elements), drawn(store));
}

function groupOf(
  store: Store,
  edited: string | null,
  ...elements: ElementAddress[]
): GroupElisions | null {
  return groupElisionsOf(blockOf(store), subjectsOf(store, elements), drawn(store), edited);
}

function formOf(store: Store, element: ElementAddress): ElisionForm | null {
  return elisionFormOf(blockOf(store), subjectsOf(store, [element]), drawn(store));
}

/**
 * What layout resolves `piece`'s `elision-display` to in `group_elided_inside`
 * (its initial value, drawing.md section 2.4): the oracle of every default
 * elision's display, which the editor never states itself.
 */
function layoutDisplay(store: Store): readonly string[] {
  return pieceExposure(drawn(store)).display;
}

/** The exposure of `piece`'s ancestor card in `drawing` of `group_elided_inside`. */
function pieceExposure(drawing: Drawing) {
  const exposure = drawing.elisions.find(
    (each) => each.kind === "ancestor_card" && each.key.member === "piece",
  );
  if (exposure === undefined) throw new Error("piece draws no ancestor card");
  return exposure;
}

/** Where `piece`'s card draws each of its gaps: its elision's address and its edges. */
const gapEdges = (drawing: Drawing) =>
  pieceExposure(drawing).gaps.map((gap) => [gap.address, gap.x1, gap.x2]);

const rowsOf = (rows: readonly { name: string; timeline: string; stretch: string }[]) =>
  rows.map((row) => [row.name, row.timeline, row.stretch]);

const rootRule = (root: string) => ({ addresses: [{ id: root, part: ["card"] }] });
const rootStyle = (root: string, set: object) => ({
  type: "style",
  select: rootRule(root),
  set,
  blocks: [B],
});
const at = (id: string): Address => ({ block: B, id });

/** `piece` of `group_elided_inside` made the one member of a new group "Whole". */
function insideWithPieceGrouped(): Store {
  const store = storeOf(INSIDE);
  const error = store.dispatch({
    type: "add",
    into: { block: B },
    group: { id: "group_2", name: "Whole", members: ["piece"] },
  });
  if (error !== null) throw new Error(error.message);
  return store;
}

describe("where the blocks are offered", () => {
  it.each<[ElementAddress[]]>([
    [[{ id: "excerpt", part: ["card"] }]],
    [[{ id: "first" }]],
    [[{ id: "piece" }]],
    [[{ id: "second", part: ["elision"] }]],
  ])("offers piece's block for %j", (elements) => {
    const root = rootOf(storeOf(INSIDE), ...elements);
    expect(root?.title).toBe('Parent timeline "Piece"');
    expect(root?.options.map((option) => option.mode)).toEqual([
      "hidden",
      "full",
      "proportional",
      "custom",
    ]);
  });

  it.each<[ElementAddress[]]>([
    [[{ id: "recording" }]],
    [[{}]],
    [[{ id: "group_1" }]],
    [[{ id: "excerpt" }, { id: "recording" }]],
  ])("offers no root's block for %j", (elements) => {
    expect(rootOf(storeOf(INSIDE), ...elements)).toBe(null);
  });

  it("offers an ungrouped root's block with Full and Custom", () => {
    const root = rootOf(storeOf(STORED), { id: "page" });
    expect(root?.title).toBe('Elisions of "Page"');
    expect(root?.options.map((option) => option.mode)).toEqual(["full", "custom"]);
  });

  it.each<[ElementAddress[]]>([
    [[{ id: "theme" }]],
    [[{ id: "group_1" }]],
    [[{ id: "elision_3" }]],
  ])("offers group_1's block for %j", (elements) => {
    const group = groupOf(storeOf(STORED), null, ...elements);
    expect(group?.title).toBe('Elisions in group "Theme"');
    expect(group?.options.map((option) => option.mode)).toEqual(["full", "custom"]);
  });

  it("offers group_1's block in its editor with nothing selected", () => {
    expect(groupOf(storeOf(STORED), "group_1")?.group).toBe("group_1");
    expect(groupOf(storeOf(STORED), null)).toBe(null);
  });

  it.each<[ElementAddress[]]>([[[{ id: "score" }]], [[{ id: "page" }]]])(
    "offers no group's block for %j",
    (elements) => {
      expect(groupOf(storeOf(STORED), null, ...elements)).toBe(null);
    },
  );

  it("offers no root's block for a group elision on a member root", () => {
    expect(rootOf(storeOf(STORED), { id: "elision_3" })).toBe(null);
  });
});

describe("what the blocks read", () => {
  it("reads piece's Proportional settings", () => {
    const store = storeOf(INSIDE);
    const root = rootOf(store, { id: "piece" });
    expect(root?.mode).toBe("proportional");
    expect(root?.proportional).toEqual({
      automatic: true,
      proportion: "0.142857",
      value: 0.14285714285714285,
      depthsAutomatic: true,
      depths: [
        { depth: 2, names: "First, Second", chosen: true },
        { depth: 1, names: "Piece", chosen: true },
      ],
      display: layoutDisplay(store),
    });
    expect(root?.custom).toBe(null);
  });

  it("reads score's stored card elisions", () => {
    const root = rootOf(storeOf(STORED), { id: "score" });
    expect(root?.mode).toBe("custom");
    expect(root?.proportional).toBe(null);
    expect(rowsOf(root?.custom?.rows ?? [])).toEqual([
      ["—", "Score", "0–16 ♩"],
      ["Development", "Score", "32–48 ♩"],
      ["—", "Score", "48–56 ♩"],
    ]);
    expect(root?.custom?.removeAll).toEqual({
      type: "remove",
      targets: ["elision_1", "elision_4", "elision_5", "elision_6"].map(at),
    });
    expect(root?.custom?.add).toEqual({
      type: "add",
      into: at("score"),
      elision: { start: [112, 3], end: [152, 3] },
    });
  });

  it("reads session Full and page Custom", () => {
    const store = storeOf(STORED);
    expect(rootOf(store, { id: "session" })?.mode).toBe("full");
    const page = rootOf(store, { id: "page" });
    expect(page?.mode).toBe("custom");
    expect(rowsOf(page?.custom?.rows ?? [])).toEqual([["Appendix", "Page", "600–1 754 px"]]);
    expect(page?.custom?.add).toEqual({
      type: "add",
      into: at("page"),
      elision: { start: 585, end: 1169 },
    });
  });

  it("reads group_1's elisions", () => {
    const store = storeOf(STORED);
    const group = groupOf(store, null, { id: "theme" });
    expect(group?.mode).toBe("custom");
    expect(group?.count).toBe("1 elision");
    expect(rowsOf(group?.rows ?? [])).toEqual([["—", "Recording", "0″–2″"]]);
    expect(group?.removeAll).toEqual({ type: "remove", targets: [at("elision_3")] });
    expect(group?.add).toEqual({
      type: "add",
      into: at("theme"),
      elision: { start: [8, 3], end: [16, 3] },
    });
    expect(groupOf(store, null, { id: "recording" })?.add).toEqual({
      type: "add",
      into: at("recording"),
      elision: { start: 3.3333333333333335, end: 6.666666666666667 },
    });
  });

  it("reads a frame's two elisions and adds into its first member", () => {
    const group = groupOf(storeOf(MEMBERS), null, { id: "group_1" });
    expect(group?.count).toBe("2 elisions");
    expect(rowsOf(group?.rows ?? [])).toEqual([
      ["Development", "Excerpt", "2–8 ♩"],
      ["—", "Phrase", "2–6 ♩"],
    ]);
    expect(group?.add).toEqual({
      type: "add",
      into: at("excerpt"),
      elision: { start: [16, 3], end: [32, 3] },
    });
  });

  it("disables Custom for a root whose elisions belong to its group", () => {
    const root = rootOf(insideWithPieceGrouped(), { id: "piece" });
    expect(root?.options.find((option) => option.mode === "custom")).toEqual({
      mode: "custom",
      commands: [],
      reason: 'its elisions belong to group "Whole"',
    });
  });
});

describe("a selected elision's form", () => {
  it("reads a span width and converts the others through layout", () => {
    const form = formOf(storeOf(STORED), { id: "elision_5" });
    expect(form?.title).toBe('Elision on "Score"');
    expect([form?.start, form?.end, form?.unit, form?.form]).toEqual(["32", "48", "♩", "span"]);
    expect(form?.widths).toEqual({ ratio: "0.25", span: "4", canvas: "200" });
    expect(form?.also).toBe(null);
  });

  it.each([
    ["elision_4", "ratio", { ratio: "0.5", span: "8", canvas: "400" }],
    ["elision_6", "canvas", { ratio: "0.075", span: "3/5", canvas: "30" }],
  ])("reads %s's widths", (id, form, widths) => {
    const read = formOf(storeOf(STORED), { id });
    expect(read?.form).toBe(form);
    expect(read?.widths).toEqual(widths);
  });

  it("reads a group elision with what it also elides", () => {
    const form = formOf(storeOf(MEMBERS), { id: "elision_1" });
    expect(form?.title).toBe('Elision on "Excerpt"');
    expect(form?.form).toBe("standard");
    expect(form?.widths).toEqual({ ratio: "0.21333333333333335", span: "32/25", canvas: "32" });
    expect(form?.also).toEqual([
      { timeline: "Piece", stretch: "18–24 ♩" },
      { timeline: "Voice", stretch: "3–12 ♩" },
      { timeline: "Sketch", stretch: "—" },
    ]);
    const seconds = formOf(storeOf(STORED), { id: "elision_3" });
    expect([seconds?.start, seconds?.end, seconds?.unit]).toEqual(["0.0", "2.0", "s"]);
    expect(seconds?.also).toEqual([
      { timeline: "Theme", stretch: "0–1 3/5 ♩" },
      { timeline: "Score", stretch: "16–17 3/5 ♩" },
      { timeline: "Take", stretch: "0″–5.1″" },
      { timeline: "Session", stretch: "30″–35.1″" },
    ]);
  });

  it("keeps a numerator past 2^53 whole", () => {
    const form = formOf(storeOf(STORED), { id: "elision_5" });
    if (form === null) throw new Error("no form");
    expect(fieldCommand(form, "start", "9007199254740993/2")).toEqual({
      ok: true,
      value: {
        type: "set",
        changes: [{ target: at("elision_5"), values: { start: [9007199254740993n, 2] } }],
      },
    });
  });

  it("names a stored elision and no default one", () => {
    const store = storeOf(STORED);
    expect(nameOf(store.view, subjectsOf(store, [{ id: "elision_5" }]), null)).toEqual({
      target: at("elision_5"),
      name: "Development",
      nullable: true,
      manifest: blockOf(store).manifest,
    });
    expect(nameOf(store.view, subjectsOf(store, [{ id: "elision_4" }]), null)?.name).toBe(null);
    const inside = storeOf(INSIDE);
    expect(
      nameOf(inside.view, subjectsOf(inside, [{ id: "second", part: ["elision"] }]), null),
    ).toBe(null);
  });

  it("reads a default elision read-only", () => {
    const form = formOf(storeOf(INSIDE), { id: "second", part: ["elision"] });
    expect(form?.title).toBe('Elision on "Second"');
    expect([form?.start, form?.end, form?.stored]).toEqual(["1", "31", null]);
  });

  it("is absent for anything but one elision", () => {
    expect(formOf(storeOf(INSIDE), { id: "piece" })).toBe(null);
  });
});

describe("the Elisions tab", () => {
  let app: ReturnType<typeof mount> | undefined;
  let selected: Address[] = [];
  /** The journal's length when the panel was mounted: the block's own `add` before it. */
  let base = 0;

  /** Unmount what is shown. */
  function hide(): void {
    if (app !== undefined) unmount(app);
    app = undefined;
    document.body.innerHTML = "";
  }

  afterEach(hide);

  /** Mount the tab's panel on `store` for `elements` of `B`, in `editing`, with `drafts`. */
  function show(
    store: Store,
    elements: ElementAddress[],
    editing: Editing | null = null,
    pane: Pane | null = null,
    drafts: PropertyDrafts = new PropertyDrafts(),
  ): void {
    const live = liveStore(store);
    const selection: Selection = selectionOf(elements.map((element) => ({ block: B, ...element })));
    const subjects = () =>
      resolveSelection(live.view, selection, editing, fontMetrics, pane ?? undefined);
    selected = [];
    base = store.journal.length;
    const context: Map<unknown, unknown> = informing([]);
    if (pane !== null) for (const [key, value] of paneContext(pane)) context.set(key, value);
    app = mount(ElisionsPanel, {
      target: document.body,
      context,
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
        drafts,
        onselect: (address: Address) => selected.push(address),
      },
    });
    flushSync();
  }

  const part = (testid: string) => document.querySelector(`[data-testid="${testid}"]`);
  const radio = (testid: string, word: string) =>
    [...(part(testid)?.querySelectorAll<HTMLInputElement>('.mode input[type="radio"]') ?? [])].find(
      (input) => input.parentElement?.textContent?.trim() === word,
    );
  const checked = (testid: string) =>
    [...(part(testid)?.querySelectorAll<HTMLInputElement>('.mode input[type="radio"]') ?? [])]
      .filter((input) => input.checked)
      .map((input) => input.value);
  const button = (text: string, within: Element | null = document.body) =>
    [...(within?.querySelectorAll<HTMLButtonElement>("button") ?? [])].find(
      (found) => found.textContent?.trim() === text,
    );
  const input = (name: string, within: Element | null = document.body) =>
    within?.querySelector<HTMLInputElement>(`input[name="${name}"]`) ?? null;

  function click(found: HTMLElement | undefined | null): void {
    found?.click();
    flushSync();
  }

  function enter(field: HTMLInputElement | null, text: string): void {
    if (field === null) throw new Error("no field");
    field.value = text;
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    flushSync();
  }

  const commands = (store: Store) =>
    store.journal.map((entry) => (entry as CommandEntry | undefined)?.command);
  const last = (store: Store) => commands(store).at(-1);

  /** The disclosure button heading the block of `testid`. */
  const expander = (testid: string) =>
    document.querySelector<HTMLButtonElement>(`[data-testid="${testid}-expand"]`);
  /** Every block as [its test ID, its button's accessible name, aria-expanded, its region hidden]. */
  const blocks = () =>
    [...document.querySelectorAll<HTMLElement>("section.tile")].map((tile) => {
      const button = tile.querySelector("h3 button");
      const region = document.getElementById(button?.getAttribute("aria-controls") ?? "");
      return [
        tile.dataset.testid,
        button?.textContent?.replace(/\s+/g, " ").trim(),
        button?.getAttribute("aria-expanded"),
        region?.hidden,
      ];
    });

  it("holds the blocks the Properties panel no longer shows", () => {
    for (const [fixture, element] of [
      [INSIDE, { id: "excerpt", part: ["card"] }],
      [STORED, { id: "theme" }],
      [STORED, { id: "elision_5" }],
    ] as const) {
      const store = storeOf(fixture);
      const live = liveStore(store);
      const selection = selectionOf([{ block: B, ...element }]);
      const subjects = resolveSelection(live.view, selection, null, fontMetrics);
      const properties = mount(PropertiesPanel, {
        target: document.body,
        context: informing([]),
        props: {
          view: live.view,
          store,
          block: selectedBlock(live.view, subjects),
          subjects,
          editing: null,
          placement: null,
          drafts: new PropertyDrafts(),
        },
      });
      flushSync();
      expect(["elisions", "group-elisions", "elision-form"].map((testid) => part(testid))).toEqual([
        null,
        null,
        null,
      ]);
      unmount(properties);
      document.body.innerHTML = "";
    }
  });

  it("tells a timeline's block from a group's by their names, both collapsed", () => {
    show(storeOf(MEMBERS), [{ id: "excerpt" }]);
    expect(blocks()).toEqual([
      ["elisions", 'Timeline Parent timeline "Piece" Proportional', "false", true],
      ["group-elisions", 'Group Elisions in group "Theme" Custom, 2 elisions', "false", true],
    ]);
  });

  it("opens one block on a click, and closes it again", () => {
    show(storeOf(MEMBERS), [{ id: "excerpt" }]);
    click(expander("elisions"));
    expect(blocks().map(([testid, , expanded, hidden]) => [testid, expanded, hidden])).toEqual([
      ["elisions", "true", false],
      ["group-elisions", "false", true],
    ]);
    click(expander("elisions"));
    expect(blocks().map(([, , expanded]) => expanded)).toEqual(["false", "false"]);
  });

  it.each<[string, ElementAddress, unknown[]]>([
    [
      STORED,
      { id: "elision_5" },
      [
        ["elisions", 'Timeline Parent timeline "Score" Custom, 3 elisions', "true", false],
        ["elision-form", 'Elision Elision on "Score" 32–48 ♩', "true", false],
      ],
    ],
    [
      STORED,
      { id: "elision_3" },
      [
        ["group-elisions", 'Group Elisions in group "Theme" Custom, 1 elision', "true", false],
        ["elision-form", 'Elision Elision on "Recording" 0.0–2.0 s', "true", false],
      ],
    ],
    [
      INSIDE,
      { id: "second", part: ["elision"] },
      [
        ["elisions", 'Timeline Parent timeline "Piece" Proportional', "true", false],
        ["elision-form", 'Elision Elision on "Second" 1–31 ♩, automatic', "true", false],
      ],
    ],
  ])("opens the blocks of %s's %j without a click", (fixture, element, expected) => {
    show(storeOf(fixture), [element]);
    expect(blocks()).toEqual(expected);
  });

  it("keeps a block's state for the selected elision apart from its own", () => {
    const store = storeOf(STORED);
    const drafts = new PropertyDrafts();
    show(store, [{ id: "elision_5" }], null, null, drafts);
    click(expander("elisions"));
    expect(expander("elisions")?.getAttribute("aria-expanded")).toBe("false");
    hide();
    show(store, [{ id: "elision_5" }], null, null, drafts);
    expect(expander("elisions")?.getAttribute("aria-expanded")).toBe("false");
    hide();
    show(store, [{ id: "score" }], null, null, drafts);
    expect(expander("elisions")?.getAttribute("aria-expanded")).toBe("false");
    click(expander("elisions"));
    hide();
    show(store, [{ id: "score" }], null, null, drafts);
    expect(expander("elisions")?.getAttribute("aria-expanded")).toBe("true");
    hide();
    show(store, [{ id: "elision_5" }], null, null, drafts);
    expect(expander("elisions")?.getAttribute("aria-expanded")).toBe("false");
  });

  /** The timeline's block of `score` in `bundle_elisions_stored`, mounted for `score` with `drafts`. */
  function scoreBlock(store: Store, drafts: PropertyDrafts): ReturnType<typeof blocks> {
    hide();
    show(store, [{ id: "score" }], null, null, drafts);
    return blocks();
  }

  it.each<[string, () => HTMLElement | null | undefined, Command, string]>([
    [
      "the form's Delete",
      () => button("Delete elision", part("elision-form")),
      { type: "remove", targets: [at("elision_5")] },
      "Custom, 2 elisions",
    ],
    [
      "the × of its row",
      () =>
        part("elisions")?.querySelector<HTMLButtonElement>(
          '.rows .delete[aria-label="Delete the elision of Score, 32–48 ♩"]',
        ),
      { type: "remove", targets: [at("elision_5")] },
      "Custom, 2 elisions",
    ],
    [
      "Remove all",
      () => button("Remove all", part("elisions")),
      {
        type: "remove",
        targets: [at("elision_1"), at("elision_4"), at("elision_5"), at("elision_6")],
      },
      "Proportional",
    ],
  ])("keeps the block that held elision_5 open after %s", (_, control, command, summary) => {
    const store = storeOf(STORED);
    const drafts = new PropertyDrafts();
    show(store, [{ id: "elision_5" }], null, null, drafts);
    click(control());
    expect(last(store)).toEqual(command);
    expect(store.journal.length - base).toBe(1);
    expect(scoreBlock(store, drafts)).toEqual([
      ["elisions", `Timeline Parent timeline "Score" ${summary}`, "true", false],
    ]);
  });

  it("leaves a block never acted in collapsed", () => {
    const store = storeOf(MEMBERS);
    const drafts = new PropertyDrafts();
    show(store, [{ id: "elision_1" }], null, null, drafts);
    click(button("Remove all", part("group-elisions")));
    expect(last(store)).toEqual({
      type: "remove",
      targets: [at("elision_1"), at("elision_2")],
    });
    hide();
    show(store, [{ id: "excerpt" }], null, null, drafts);
    expect(blocks()).toEqual([
      ["elisions", 'Timeline Parent timeline "Piece" Proportional', "false", true],
      ["group-elisions", 'Group Elisions in group "Theme" Custom, 0 elisions', "true", false],
    ]);
  });

  it("respects a close after an action", () => {
    const store = storeOf(STORED);
    const drafts = new PropertyDrafts();
    show(store, [{ id: "elision_5" }], null, null, drafts);
    click(button("Delete elision", part("elision-form")));
    expect(scoreBlock(store, drafts).map(([, , expanded]) => expanded)).toEqual(["true"]);
    click(expander("elisions"));
    expect(scoreBlock(store, drafts)).toEqual([
      ["elisions", 'Timeline Parent timeline "Score" Custom, 2 elisions', "false", true],
    ]);
  });

  it.each<[string, () => void, unknown[], Address[], string]>([
    [
      "a mode change",
      () => click(radio("elisions", "Full")),
      [rootStyle("score", { "elision-mode": "full", display: null })],
      [],
      "Full",
    ],
    [
      "Add elision",
      () => click(button("Add elision", part("elisions"))),
      [{ type: "add", into: at("score"), elision: { start: [112, 3], end: [152, 3] } }],
      [],
      "Custom, 4 elisions",
    ],
    [
      "a row's click",
      () => click(part("elisions")?.querySelectorAll<HTMLButtonElement>(".rows .row")[0]),
      [],
      [at("elision_4")],
      "Custom, 3 elisions",
    ],
  ])(
    "keeps the block that held elision_5 open after %s",
    (_, act, journal, rowsSelected, summary) => {
      const store = storeOf(STORED);
      const drafts = new PropertyDrafts();
      show(store, [{ id: "elision_5" }], null, null, drafts);
      act();
      expect([commands(store).slice(base), selected]).toEqual([journal, rowsSelected]);
      expect(scoreBlock(store, drafts)).toEqual([
        ["elisions", `Timeline Parent timeline "Score" ${summary}`, "true", false],
      ]);
    },
  );

  it.each<[string, () => void, unknown[], string]>([
    [
      "the × of elision_4's row",
      () => click(part("elisions")?.querySelectorAll<HTMLButtonElement>(".rows .delete")[0]),
      [{ type: "remove", targets: [at("elision_4")] }],
      "Custom, 2 elisions",
    ],
    [
      "a mode change",
      () => click(radio("elisions", "Full")),
      [rootStyle("score", { "elision-mode": "full", display: null })],
      "Full",
    ],
  ])("keeps a close made while elision_5 is selected, after %s", (_, act, journal, summary) => {
    const store = storeOf(STORED);
    const drafts = new PropertyDrafts();
    show(store, [{ id: "elision_5" }], null, null, drafts);
    act();
    click(expander("elisions"));
    expect([
      commands(store).slice(base),
      expander("elisions")?.getAttribute("aria-expanded"),
    ]).toEqual([journal, "false"]);
    expect(scoreBlock(store, drafts)).toEqual([
      ["elisions", `Timeline Parent timeline "Score" ${summary}`, "false", true],
    ]);
  });

  it("keeps a close of the group's block made while elision_3 is selected", () => {
    const store = storeOf(STORED);
    const drafts = new PropertyDrafts();
    show(store, [{ id: "elision_3" }], null, null, drafts);
    click(radio("group-elisions", "Full"));
    click(expander("group-elisions"));
    expect(commands(store).slice(base)).toEqual([
      {
        type: "style",
        select: { addresses: [{ id: "group_1" }] },
        set: { "elision-mode": "full" },
        blocks: [B],
      },
    ]);
    hide();
    show(store, [{ id: "theme" }], null, null, drafts);
    expect(blocks()).toEqual([
      ["elisions", 'Timeline Parent timeline "Score" Custom, 3 elisions', "false", true],
      ["group-elisions", 'Group Elisions in group "Theme" Full, 1 elision', "false", true],
    ]);
  });

  it("keeps an opened block through a change of tab and a closed drawer", () => {
    const store = storeOf(INSIDE);
    const live = liveStore(store);
    const drafts = new PropertyDrafts();
    const selected = holder<Selection>(selectionOf([{ block: B, id: "piece" }]));
    const inspect = () => {
      app = mount(providing(Inspector), {
        target: document.body,
        context: informing([]),
        props: {
          live,
          get selection() {
            return selected.value;
          },
          drafts,
        },
      });
      flushSync();
    };
    const tab = (name: string) =>
      click(
        [...document.querySelectorAll<HTMLElement>('[role="tab"]')].find(
          (each) => each.textContent?.trim() === name,
        ),
      );
    inspect();
    tab("Elisions");
    expect(expander("elisions")?.getAttribute("aria-expanded")).toBe("false");
    click(expander("elisions"));
    tab("Properties");
    expect(expander("elisions")).toBe(null);
    tab("Elisions");
    expect(expander("elisions")?.getAttribute("aria-expanded")).toBe("true");
    hide();
    inspect();
    tab("Elisions");
    expect(expander("elisions")?.getAttribute("aria-expanded")).toBe("true");
  });

  it("says what to select with nothing to configure", () => {
    for (const elements of [[], [{}]]) {
      show(storeOf(STORED), elements);
      expect(blocks()).toEqual([]);
      expect(document.body.textContent?.trim()).toBe(
        "Select one timeline, card or group frame to edit its elisions.",
      );
      hide();
    }
  });

  it("switches to Full and back by undo, one entry each", () => {
    const store = storeOf(INSIDE);
    show(store, [{ id: "piece" }]);
    expect(checked("elisions")).toEqual(["proportional"]);
    click(radio("elisions", "Full"));
    expect(store.journal.length - base).toBe(1);
    expect(last(store)).toEqual(rootStyle("piece", { "elision-mode": "full", display: null }));
    expect(checked("elisions")).toEqual(["full"]);
    store.undo();
    flushSync();
    expect(checked("elisions")).toEqual(["proportional"]);
  });

  it("hides the card and shows it Proportional again, leaving no rule", () => {
    const store = storeOf(INSIDE);
    show(store, [{ id: "piece" }]);
    click(radio("elisions", "Hidden"));
    expect(last(store)).toEqual(rootStyle("piece", { display: "none" }));
    expect(checked("elisions")).toEqual(["hidden"]);
    expect(drawn(store).boxes.filter((box) => box.ancestor !== undefined)).toEqual([]);
    click(radio("elisions", "Proportional"));
    expect(store.journal.length - base).toBe(2);
    expect(last(store)).toEqual(rootStyle("piece", { "elision-mode": null, display: null }));
    expect(checked("elisions")).toEqual(["proportional"]);
    expect(blockOf(store).manifest.graphical?.rules).toEqual([]);
  });

  it("stores the drawn defaults in one add and removes them all in one", () => {
    const store = storeOf(INSIDE);
    const display = layoutDisplay(store);
    show(store, [{ id: "piece" }]);
    click(radio("elisions", "Custom"));
    expect(store.journal.length - base).toBe(1);
    expect(last(store)).toEqual({
      type: "add",
      into: { block: B },
      elision: [
        {
          timeline: "first",
          start: [0, 1],
          end: [8, 1],
          width: { canvas: 57.14285714285714 },
          display: [...display],
        },
        {
          timeline: "first",
          start: [16, 1],
          end: [32, 1],
          width: { canvas: 114.28571428571428 },
          display: [...display],
        },
        {
          timeline: "second",
          start: [1, 1],
          end: [31, 1],
          width: { canvas: 128.57142857142856 },
          display: [...display],
        },
      ],
    });
    expect(checked("elisions")).toEqual(["custom"]);
    expect(part("elisions")?.querySelectorAll(".rows li")).toHaveLength(3);
    click(button("Remove all", part("elisions")));
    expect(store.journal.length - base).toBe(2);
    expect(last(store)).toEqual({
      type: "remove",
      targets: ["elision_1", "elision_2", "elision_3"].map(at),
    });
    expect(checked("elisions")).toEqual(["proportional"]);
  });

  it("keeps stored elisions in the background through Full and Proportional", () => {
    const store = storeOf(STORED);
    show(store, [{ id: "score" }]);
    click(radio("elisions", "Full"));
    expect(last(store)).toEqual(rootStyle("score", { "elision-mode": "full", display: null }));
    click(radio("elisions", "Custom"));
    expect(last(store)).toEqual(rootStyle("score", { "elision-mode": null, display: null }));
    expect(checked("elisions")).toEqual(["custom"]);
    click(radio("elisions", "Proportional"));
    expect(last(store)).toEqual(
      rootStyle("score", { "elision-mode": "proportional", display: null }),
    );
    expect(store.journal.length - base).toBe(3);
  });

  it("starts Custom from full timelines with nothing stored", () => {
    const store = storeOf(INSIDE);
    show(store, [{ id: "piece" }]);
    click(radio("elisions", "Full"));
    click(radio("elisions", "Custom"));
    expect(last(store)).toEqual(rootStyle("piece", { "elision-mode": "custom", display: null }));
    expect(checked("elisions")).toEqual(["custom"]);
  });

  it("switches a frame between Full and Custom", () => {
    const store = storeOf(STORED);
    show(store, [{ id: "theme" }]);
    const frame = (set: object) => ({
      type: "style",
      select: { addresses: [{ id: "group_1" }] },
      set,
      blocks: [B],
    });
    click(radio("group-elisions", "Full"));
    expect(last(store)).toEqual(frame({ "elision-mode": "full" }));
    expect(checked("group-elisions")).toEqual(["full"]);
    click(radio("group-elisions", "Custom"));
    expect(last(store)).toEqual(frame({ "elision-mode": null }));
    expect(checked("group-elisions")).toEqual(["custom"]);
  });

  it("shows the group's block in its editor with nothing selected", () => {
    show(storeOf(STORED), [], { kind: "group", target: { block: B, id: "group_1" } });
    expect(part("group-elisions")?.querySelector("h3 .title")?.textContent).toBe(
      'Elisions in group "Theme"',
    );
  });

  it("holds Custom with its reason where the root's elisions belong to its group", () => {
    const store = insideWithPieceGrouped();
    show(store, [{ id: "piece" }]);
    const custom = radio("elisions", "Custom");
    expect(custom?.getAttribute("aria-disabled")).toBe("true");
    const hint = document.getElementById(custom?.getAttribute("aria-describedby") ?? "");
    expect(hint?.textContent).toBe('Custom: its elisions belong to group "Whole"');
    click(custom);
    expect(store.journal.length - base).toBe(0);
    expect(checked("elisions")).toEqual(["proportional"]);
  });

  it("states the proportion, types it and gives it back to Automatic", () => {
    const store = storeOf(INSIDE);
    show(store, [{ id: "piece" }]);
    const section = part("elisions");
    const before = gapEdges(drawn(store));
    click(input("proportion-automatic", section));
    expect(last(store)).toEqual(rootStyle("piece", { "elision-proportion": 0.14285714285714285 }));
    expect(pieceExposure(drawn(store)).automatic).toBe(false);
    expect(gapEdges(drawn(store))).toEqual(before);
    expect(input("proportion-automatic", section)?.checked).toBe(false);
    expect(input("proportion", section)?.value).toBe("0.142857");
    enter(input("proportion", section), "0.5");
    expect(last(store)).toEqual(rootStyle("piece", { "elision-proportion": 0.5 }));
    enter(input("proportion", section), "2");
    expect(store.journal.length - base).toBe(2);
    expect(input("proportion", section)?.getAttribute("aria-invalid")).toBe("true");
    expect(section?.querySelector(".problem")?.textContent).toBe(
      "2 is no proportion: write a number above 0 and at most 1",
    );
    click(input("proportion-automatic", section));
    expect(last(store)).toEqual(rootStyle("piece", { "elision-proportion": null }));
    expect(store.journal.length - base).toBe(3);
  });

  it("reads the proportion the canvas draws at its pane", () => {
    const store = storeOf(INSIDE);
    const pane = new Pane();
    pane.measure(1100, 800);
    const block = blockOf(store);
    const canvas = pieceExposure(
      drawingOf(block, store.view.graphical, fontMetrics, undefined, pane),
    ).proportion;
    const paneless = pieceExposure(drawn(store)).proportion;
    expect(paneless).toBe(0.14285714285714285);
    expect(canvas).not.toBe(paneless);
    if (canvas === null) throw new Error("piece's card takes no proportion");
    show(store, [{ id: "piece" }], null, pane);
    const section = part("elisions");
    expect(input("proportion", section)?.value).toBe(String(Number(canvas.toFixed(6))));
    click(input("proportion-automatic", section));
    expect(last(store)).toEqual(rootStyle("piece", { "elision-proportion": canvas }));
  });

  it("chooses the rows by depth, never none", () => {
    const store = storeOf(INSIDE);
    show(store, [{ id: "piece" }]);
    const section = part("elisions");
    click(input("depths-automatic", section));
    expect(last(store)).toEqual(rootStyle("piece", { "elision-depths": "1 2" }));
    const depth = (n: number) =>
      section?.querySelector<HTMLInputElement>(`input[name="depth"][value="${n}"]`) ?? null;
    click(depth(2));
    expect(last(store)).toEqual(rootStyle("piece", { "elision-depths": "1" }));
    expect(depth(1)?.disabled).toBe(true);
    expect(store.journal.length - base).toBe(2);
  });

  it("toggles what every default elision shows", () => {
    const store = storeOf(INSIDE);
    show(store, [{ id: "piece" }]);
    const shown = layoutDisplay(store);
    const pressed = () =>
      [...(part("elisions")?.querySelectorAll<HTMLButtonElement>(".toggle") ?? [])]
        .filter((toggle) => toggle.getAttribute("aria-pressed") === "true")
        .map((toggle) => toggle.textContent?.trim());
    const LABELS: { [word: string]: string } = {
      ellipsis: "Ellipsis",
      name: "Name",
      coordinate: "Coordinate",
      continuation: "Lines",
    };
    expect(pressed()).toEqual(shown.map((word) => LABELS[word]));
    click(button("Lines", part("elisions")));
    expect(last(store)).toEqual(
      rootStyle("piece", { "elision-display": [...shown, "continuation"].join(" ") }),
    );
    store.dispatch({
      type: "style",
      select: { addresses: [{ id: "piece", part: ["card"] }] },
      set: { "elision-display": "ellipsis" },
      blocks: [B],
    });
    flushSync();
    expect(pressed()).toEqual(["Ellipsis"]);
    click(button("Ellipsis", part("elisions")));
    expect(last(store)).toEqual(rootStyle("piece", { "elision-display": "none" }));
  });

  it("selects a row and deletes one stored elision", () => {
    const store = storeOf(STORED);
    show(store, [{ id: "score" }]);
    const rows = part("elisions")?.querySelectorAll<HTMLButtonElement>(".rows .row");
    click(rows?.[1]);
    expect(selected).toEqual([at("elision_5")]);
    click(part("elisions")?.querySelectorAll<HTMLButtonElement>(".rows .delete")[0]);
    expect(last(store)).toEqual({ type: "remove", targets: [at("elision_4")] });
    expect(store.journal.length - base).toBe(1);
  });

  it("edits a stored elision exactly, one command each", () => {
    const store = storeOf(STORED);
    show(store, [{ id: "elision_5" }]);
    const form = () => part("elision-form");
    enter(input("start", form()), "33.5");
    expect(last(store)).toEqual({
      type: "set",
      changes: [{ target: at("elision_5"), values: { start: [67, 2] } }],
    });
    enter(input("start", form()), "x");
    expect(store.journal.length - base).toBe(1);
    expect(input("start", form())?.getAttribute("aria-invalid")).toBe("true");
    expect(form()?.querySelector(".problem")?.textContent).toBe(
      '"x" is no fraction value; write an integer, n/d, a b/c or a decimal',
    );
    expect(store.journal.length - base).toBe(1);
  });

  it("converts a width form, toggles a word and deletes, one command each", () => {
    const store = storeOf(STORED);
    show(store, [{ id: "elision_5" }]);
    const form = () => part("elision-form");
    const widthRadio = (value: string) =>
      part("elision-form")?.querySelector<HTMLInputElement>(
        `.width input[type="radio"][value="${value}"]`,
      ) ?? null;
    click(widthRadio("canvas"));
    expect(last(store)).toEqual({
      type: "set",
      changes: [{ target: at("elision_5"), values: { width: { canvas: 200 } } }],
    });
    click(widthRadio("ratio"));
    expect(last(store)).toEqual({
      type: "set",
      changes: [{ target: at("elision_5"), values: { width: { ratio: 0.25 } } }],
    });
    click(widthRadio("standard"));
    expect(last(store)).toEqual({
      type: "set",
      changes: [{ target: at("elision_5"), values: { width: null } }],
    });
    click(button("Ellipsis", form()));
    expect(last(store)).toEqual({
      type: "set",
      changes: [{ target: at("elision_5"), values: { display: ["ellipsis", "name"] } }],
    });
    click(button("Delete elision", form()));
    expect(last(store)).toEqual({ type: "remove", targets: [at("elision_5")] });
    expect(store.journal.length - base).toBe(5);
  });

  it("shows a default elision read-only", () => {
    show(storeOf(INSIDE), [{ id: "second", part: ["elision"] }]);
    const form = part("elision-form");
    expect(form?.querySelector("h3 .title")?.textContent).toBe('Elision on "Second"');
    expect([input("start", form)?.value, input("end", form)?.value]).toEqual(["1", "31"]);
    expect([input("start", form)?.disabled, input("end", form)?.disabled]).toEqual([true, true]);
    expect(form?.querySelector(".hint")?.textContent).toBe("Choose Custom to edit");
    expect(form?.querySelector(".width")).toBe(null);
    expect(button("Delete elision", form)).toBe(undefined);
  });
});

describe("a root drawn once behind a row side by side", () => {
  /** The row the fixture is arranged in: `page`, then the groups by their stretches. */
  const ARRANGEMENT = {
    direction: "horizontal",
    order: ["page", "group_3", "group_1", "group_2"],
  } as const;

  /** The block of `store` drawn side by side, as layout draws the placement's arrangement. */
  function sideBySide(store: Store): Drawing {
    const block = blockOf(store);
    return draw(
      block.manifest,
      {
        length: block.length,
        spacing: block.spacing,
        margin: block.margin,
        width: block.width,
        height: block.height,
        places: block.places,
        arrangement: ARRANGEMENT,
      },
      styleLayers(store.view.graphical, block.manifest),
      fontMetrics,
    );
  }

  function arrangedRoot(store: Store, ...elements: ElementAddress[]): RootElisions | null {
    return rootElisionsOf(
      store.view,
      blockOf(store),
      subjectsOf(store, elements),
      sideBySide(store),
    );
  }

  function dispatched(...commands: Command[]): Store {
    const store = storeOf(ARRANGED);
    for (const command of commands) {
      const error = store.dispatch(command);
      if (error !== null) throw new Error(error.message);
    }
    return store;
  }

  const SESSION_ELISION: Command = {
    type: "add",
    into: at("session"),
    elision: { start: 50.0, end: 80.0 },
  };

  const arrangedOf = (root: RootElisions | null) =>
    root?.arranged.map((gap) => [gap.between, gap.stretch]);

  it("records one card per root, under the first group's key, behind every group", () => {
    const cards = sideBySide(storeOf(ARRANGED)).boxes.flatMap((box) =>
      box.ancestor === undefined ? [] : [[box.key, box.ancestor.groups]],
    );
    expect(cards).toEqual([
      [{ item: "group_1", member: "score" }, ["group_1", "group_2", "group_3"]],
      [{ item: "group_1", member: "session" }, ["group_1", "group_3"]],
    ]);
  });

  it.each<[ElementAddress, string]>([
    [{ id: "exposition" }, "score"],
    [{ id: "development" }, "score"],
    [{ id: "recapitulation" }, "score"],
    [{ id: "take_a" }, "session"],
    [{ id: "take_b" }, "session"],
  ])("reads the once card for %j", (element, root) => {
    const read = arrangedRoot(storeOf(ARRANGED), element);
    expect(read?.root).toBe(root);
    expect(read?.mode).toBe("proportional");
  });

  it("lists the arrangement's gap read-only, and no seam", () => {
    const store = storeOf(ARRANGED);
    expect(arrangedOf(arrangedRoot(store, { id: "development" }))).toEqual([]);
    expect(arrangedOf(arrangedRoot(store, { id: "take_b" }))).toEqual([
      ['between "Exposition" and "Recapitulation"', "33″–44″"],
    ]);
    expect(arrangedOf(rootOf(store, { id: "development" }))).toEqual([]);
  });

  it("names a gap by the anchors its stretch separates, past a seam", () => {
    const store = dispatched({
      type: "set",
      changes: [
        { target: at("score"), values: { length: [56, 1] } },
        { target: at("recapitulation"), values: { offset: [40, 1] } },
      ],
    });
    const drawing = sideBySide(store);
    const exposure = drawing.elisions.find(
      (each) => each.kind === "ancestor_card" && each.key.member === "score",
    );
    const gaps = exposure?.gaps.filter((gap) => gap.origin === "arrangement") ?? [];
    expect(gaps.length).toBe(1);
    const [gap] = gaps;
    if (gap === undefined) throw new Error("no gap");
    const score = blockOf(store).manifest.timelines.find((timeline) => timeline.id === "score");
    if (score === undefined) throw new Error("no score");
    expect(arrangedOf(arrangedRoot(store, { id: "development" }))).toEqual([
      ['between "Development" and "Recapitulation"', stretchText(score, gap.start, gap.end)],
    ]);
  });

  it("offers no form for the address the arrangement's gaps share", () => {
    const store = storeOf(ARRANGED);
    const subjects = subjectsOf(store, [{ id: "score", part: ["elision"] }]);
    expect(elisionFormOf(blockOf(store), subjects, sideBySide(store))).toBe(null);
  });

  it("stores none of them when Proportional turns Custom", () => {
    const root = arrangedRoot(storeOf(ARRANGED), { id: "development" });
    expect(root?.options.find((option) => option.mode === "custom")?.commands).toEqual([
      {
        type: "style",
        select: rootRule("score"),
        set: { "elision-mode": "custom", display: null },
        blocks: [B],
      },
    ]);
  });

  it("keeps a stored elision between two anchors, listed as not drawn", () => {
    const store = dispatched(SESSION_ELISION);
    const free = rootOf(store, { id: "take_b" });
    expect(free?.mode).toBe("custom");
    expect(
      free?.custom?.rows.map((row) => [row.name, row.timeline, row.stretch, row.note]),
    ).toEqual([["—", "Session", "50″–1′20″", null]]);
    const arranged = arrangedRoot(store, { id: "take_b" });
    expect(arranged?.mode).toBe("custom");
    expect(
      arranged?.custom?.rows.map((row) => [row.name, row.timeline, row.stretch, row.note]),
    ).toEqual([["—", "Session", "50″–1′20″", "not drawn while arranged side by side"]]);
    expect(arranged?.custom?.rows[0]?.remove).toEqual({
      type: "remove",
      targets: [at("elision_1")],
    });
    expect(arranged?.custom?.removeAll).toEqual({ type: "remove", targets: [at("elision_1")] });
  });

  it("shows the gap and the undrawn elision in the tab", () => {
    const store = dispatched(SESSION_ELISION, {
      type: "set",
      changes: [{ target: { block: B }, values: { arrangement: ARRANGEMENT } }],
    });
    const app = mount(ElisionsPanel, {
      target: document.body,
      props: {
        view: store.view,
        store,
        block: blockOf(store),
        subjects: subjectsOf(store, [{ id: "take_b" }]),
        editing: null,
        placement: null,
        drafts: new PropertyDrafts(),
        onselect: () => {},
      },
    });
    flushSync();
    try {
      const section = document.querySelector('[data-testid="elisions"]');
      const gaps = [...(section?.querySelectorAll('[data-testid="arranged-gaps"] li') ?? [])];
      expect(gaps.map((gap) => gap.textContent)).toEqual([
        'between "Exposition" and "Recapitulation" 33″–44″',
      ]);
      expect(section?.querySelector(".count")?.textContent).toBe("1 elision");
      expect(section?.querySelector(".rows .note")?.textContent).toBe(
        "not drawn while arranged side by side",
      );
    } finally {
      unmount(app);
      document.body.innerHTML = "";
    }
  });

  it("shows the least of the anchors' proportions", () => {
    const store = dispatched({
      type: "add",
      into: at("development"),
      elision: { start: [4, 1], end: [12, 1] },
    });
    const free = drawn(store).elisions.flatMap((exposure) =>
      exposure.kind === "ancestor_card" && exposure.key.member === "score"
        ? [[exposure.key.item, exposure.proportion]]
        : [],
    );
    expect(free).toEqual([
      ["group_1", 0.5],
      ["group_2", 0.29],
      ["group_3", 0.34211419677734367],
    ]);
    const root = arrangedRoot(store, { id: "recapitulation" });
    expect(root?.proportional?.automatic).toBe(true);
    expect(root?.proportional?.proportion).toBe("0.29");
  });
});
