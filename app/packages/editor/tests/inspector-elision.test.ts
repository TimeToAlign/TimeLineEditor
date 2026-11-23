/**
 * The elision section of the Properties tab: the root's block, the group's
 * block and the form of a selected elision. The expected values are derived
 * in `README.md` ("The elision section").
 */

import type { Editing, Selection, Subject } from "@timetoalign/tilie-arranger";
import {
  drawingOf,
  liveStore,
  resolveSelection,
  selectionOf,
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
import ElisionSection from "../src/inspector/ElisionSection.svelte";
import type { ElisionForm, GroupElisions, RootElisions } from "../src/inspector/elisions.ts";
import {
  elisionFormOf,
  fieldCommand,
  groupElisionsOf,
  rootElisionsOf,
} from "../src/inspector/elisions.ts";
import PropertiesPanel from "../src/inspector/PropertiesPanel.svelte";
import { nameOf } from "../src/inspector/properties.ts";
import { PropertyDrafts } from "../src/inspector/propertyDrafts.svelte.ts";
import { selectedBlock } from "../src/inspector/selection.ts";
import { blockId, informing, storeOf } from "./support.ts";

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
  const exposure = drawn(store).elisions.find(
    (each) => each.kind === "ancestor_card" && each.key.member === "piece",
  );
  if (exposure === undefined) throw new Error("piece draws no ancestor card");
  return exposure.display;
}

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

describe("the section in the Properties tab", () => {
  let app: ReturnType<typeof mount> | undefined;
  let selected: Address[] = [];
  /** The journal's length when the panel was mounted: the block's own `add` before it. */
  let base = 0;

  afterEach(() => {
    if (app !== undefined) unmount(app);
    app = undefined;
    document.body.innerHTML = "";
  });

  /** Mount the panel on `store` for `elements` of `B`, in `editing`. */
  function show(store: Store, elements: ElementAddress[], editing: Editing | null = null): void {
    const live = liveStore(store);
    const selection: Selection = selectionOf(elements.map((element) => ({ block: B, ...element })));
    const subjects = () => resolveSelection(live.view, selection, editing, fontMetrics);
    selected = [];
    base = store.journal.length;
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
        editing,
        placement: null,
        drafts: new PropertyDrafts(),
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

  it("stands directly under the name, outside the geometry form", () => {
    show(storeOf(INSIDE), [{ id: "excerpt", part: ["card"] }]);
    const section = part("elisions");
    expect(section?.previousElementSibling?.matches("label.name")).toBe(true);
    expect(section?.closest("form")).toBe(null);
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
    expect(part("group-elisions")?.querySelector("h3")?.textContent).toBe(
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
    click(input("proportion-automatic", section));
    expect(last(store)).toEqual(rootStyle("piece", { "elision-proportion": 0.142857 }));
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
    expect(form?.querySelector("legend")?.textContent).toBe('Elision on "Second"');
    expect([input("start", form)?.value, input("end", form)?.value]).toEqual(["1", "31"]);
    expect([input("start", form)?.disabled, input("end", form)?.disabled]).toEqual([true, true]);
    expect(form?.querySelector(".hint")?.textContent).toBe("Choose Custom to edit");
    expect(form?.querySelector(".width")).toBe(null);
    expect(button("Delete elision", form)).toBe(undefined);
  });
});

describe("a root drawn once behind a row side by side", () => {
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
        arrangement: { direction: "horizontal", order: ["page", "group_3", "group_1", "group_2"] },
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

  it("lists the arrangement's seams and gap read-only", () => {
    const store = storeOf(ARRANGED);
    expect(arrangedOf(arrangedRoot(store, { id: "development" }))).toEqual([
      ['between "Exposition" and "Development"', "seam at 16 ♩"],
      ['between "Development" and "Recapitulation"', "seam at 32 ♩"],
    ]);
    expect(arrangedOf(arrangedRoot(store, { id: "take_b" }))).toEqual([
      ['between "Exposition" and "Recapitulation"', "33″–44″"],
    ]);
    expect(arrangedOf(rootOf(store, { id: "development" }))).toEqual([]);
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

  it("shows the gap and the undrawn elision in the section", () => {
    const store = dispatched(SESSION_ELISION);
    const app = mount(ElisionSection, {
      target: document.body,
      props: {
        view: store.view,
        store,
        block: blockOf(store),
        subjects: subjectsOf(store, [{ id: "take_b" }]),
        drawing: sideBySide(store),
        edited: null,
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
      ["group_3", 0.5],
    ]);
    const root = arrangedRoot(store, { id: "recapitulation" });
    expect(root?.proportional?.automatic).toBe(true);
    expect(root?.proportional?.proportion).toBe("0.29");
  });
});
