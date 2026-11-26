/**
 * The Regions tab: which timeline a selection lists, its rows, the
 * commands its edits send and the panel; the expected values are derived
 * in `README.md` ("The Regions tab").
 */

import { liveStore, resolveSelection, selectionOf } from "@timetoalign/tilie-arranger";
import type { Address, Command, ElementAddress, Problem, Store } from "@timetoalign/tilie-core";
import { fontMetrics } from "@timetoalign/timetoshare";
import { flushSync, mount, unmount } from "svelte";
import { afterEach, describe, expect, it } from "vitest";
import { PropertyDrafts } from "../src/inspector/propertyDrafts.svelte.ts";
import RegionsPanel from "../src/inspector/RegionsPanel.svelte";
import type { RegionRow, RegionsShown } from "../src/inspector/regions.ts";
import { addRegionCommand, regionFieldCommand, regionsOf } from "../src/inspector/regions.ts";
import { selectedBlock } from "../src/inspector/selection.ts";
import { blockId, storeOf } from "./support.ts";

const A = blockId(0);

const HINT = "Select a timeline, its card or one of its regions to list its regions.";

/** The region the test gives the child `b`, an ID of its own. */
const MOTIF = {
  type: "add",
  into: { block: A, id: "b" },
  region: { id: "motif", name: "motif", start: [1, 1], end: [3, 1] },
} as const;

/** `styled_score_flow_inner` in block `A`, its child `b` given `motif`. */
function styled(): Store {
  const store = storeOf("styled_score_flow_inner");
  if (store.dispatch(MOTIF) !== null) throw new Error("motif is refused");
  return store;
}

const subjectsOf = (store: Store, ...elements: ElementAddress[]) =>
  resolveSelection(
    store.view,
    selectionOf(elements.map((element): Address => ({ block: A, ...element }))),
    null,
    fontMetrics,
  );

function shownOf(store: Store, ...elements: ElementAddress[]): RegionsShown | null {
  const subjects = subjectsOf(store, ...elements);
  return regionsOf(selectedBlock(store.view, subjects), subjects);
}

/** What a row shows, its address and its removal. */
const rowShape = (row: RegionRow) => ({
  id: row.id,
  address: row.address,
  name: row.name,
  type: row.type,
  start: row.start,
  end: row.end,
  unit: row.unit,
  readOnly: row.readOnly,
  remove: row.remove,
});

/** The sections as `[heading, timeline, rows]`. */
const sectionsOf = (shown: RegionsShown | null) =>
  shown?.sections.map((section) => [
    section.heading,
    section.timeline,
    section.rows.map(rowShape),
  ]) ?? null;

const at = (id: string): Address => ({ block: A, id });

const editable = (id: string, name: string, start: string, end: string) => ({
  id,
  address: at(id),
  name,
  type: "",
  start,
  end,
  unit: "♩",
  readOnly: false,
  remove: { type: "remove", targets: [at(id)] },
});

const INTRO = editable("intro", "intro", "0", "2");
const MOTIF_ROW = editable("motif", "motif", "1", "3");

/** The row `id` of `store`'s list for `score`. */
function rowOf(store: Store, id: string): RegionRow {
  const row = shownOf(store, { id: "score", part: ["card"] })
    ?.sections.flatMap((section) => section.rows)
    .find((item) => item.id === id);
  if (row === undefined) throw new Error(`no row ${id}`);
  return row;
}

describe("the timeline listed", () => {
  it("is the timeline the card, line, band or region selected names", () => {
    const store = styled();
    const score = [
      [null, "score", [INTRO]],
      ["b", "b", [MOTIF_ROW]],
    ];
    expect(sectionsOf(shownOf(store, { id: "score", part: ["card"] }))).toEqual(score);
    expect(sectionsOf(shownOf(store, { id: "score" }))).toEqual(score);
    expect(sectionsOf(shownOf(store, { id: "score", facet: "regions" }))).toEqual(score);
    expect(sectionsOf(shownOf(store, { id: "intro" }))).toEqual(score);
    expect(sectionsOf(shownOf(store, { id: "intro", part: ["label"] }))).toEqual(score);
    expect(sectionsOf(shownOf(store, { id: "intro" }, { id: "intro", part: ["label"] }))).toEqual(
      score,
    );
    const b = [[null, "b", [MOTIF_ROW]]];
    expect(sectionsOf(shownOf(store, { id: "b" }))).toEqual(b);
    expect(sectionsOf(shownOf(store, { id: "motif" }))).toEqual(b);
  });

  it("is none for any other selection", () => {
    const store = styled();
    expect(shownOf(store)).toBeNull();
    expect(regionsOf(store.view.blocks[A] ?? null, subjectsOf(store))).toBeNull();
    expect(
      regionsOf(
        store.view.blocks[A] ?? null,
        resolveSelection(store.view, selectionOf([{ block: A }]), null, fontMetrics),
      ),
    ).toBeNull();
    expect(shownOf(store, { id: "score" }, { id: "b" })).toBeNull();
    expect(shownOf(store, { id: "intro" }, { id: "motif" })).toBeNull();
    expect(shownOf(store, { id: "da-capo" })).toBeNull();
  });

  it("marks the selected regions", () => {
    const store = styled();
    expect([...(shownOf(store, { id: "intro" })?.selected ?? [])]).toEqual(["intro"]);
    expect([...(shownOf(store, { id: "intro", part: ["label"] })?.selected ?? [])]).toEqual([
      "intro",
    ]);
    expect([...(shownOf(store, { id: "score", part: ["card"] })?.selected ?? [])]).toEqual([]);
  });

  it("shows atomic sections read only", () => {
    const store = storeOf("flow/sonata_exposition");
    const regions = store.view.blocks[A]?.manifest.timelines[0]?.regions ?? [];
    expect(regions.map((region) => region.name)).toEqual(["A", "B", "C"]);
    const atomic = (index: number, start: string, end: string) => {
      const id = regions[index]?.id ?? "";
      return {
        id,
        address: at(id),
        name: regions[index]?.name,
        type: "Atomic section",
        start,
        end,
        unit: "♩",
        readOnly: true,
        remove: null,
      };
    };
    expect(sectionsOf(shownOf(store, { id: "score", part: ["card"] }))).toEqual([
      [null, "score", [atomic(0, "0", "12"), atomic(1, "12", "16"), atomic(2, "16", "24")]],
    ]);
  });
});

describe("the commands", () => {
  it("add a region over the whole timeline, or up to its reach, without an ID", () => {
    const store = styled();
    const block = store.view.blocks[A];
    const timelines = block?.manifest.timelines[0];
    const b = timelines?.children[1];
    if (block === undefined || timelines === undefined || b === undefined)
      throw new Error("no score");
    expect(addRegionCommand(block, timelines)).toEqual({
      type: "add",
      into: at("score"),
      region: { start: [0, 1], end: [8, 1] },
    });
    expect(addRegionCommand(block, b)).toEqual({
      type: "add",
      into: at("b"),
      region: { start: [0, 1], end: [4, 1] },
    });
    const unknown = storeOf("unknown_length").view.blocks[A];
    const score = unknown?.manifest.timelines[0];
    if (unknown === undefined || score === undefined) throw new Error("no score");
    expect(addRegionCommand(unknown, score)).toEqual({
      type: "add",
      into: at("score"),
      region: { start: [0, 1], end: [14, 1] },
    });
  });

  it("set a field from typed text, or refuse text that is no value of the axis", () => {
    const row = rowOf(styled(), "intro");
    const set = (values: object) => ({
      ok: true,
      value: { type: "set", changes: [{ target: at("intro"), values }] },
    });
    expect(regionFieldCommand(row, "name", "Intro")).toEqual(set({ name: "Intro" }));
    expect(regionFieldCommand(row, "name", "")).toEqual(set({ name: null }));
    expect(regionFieldCommand(row, "name", "intro")).toEqual({ ok: true, value: null });
    expect(regionFieldCommand(row, "start", "1/2")).toEqual(set({ start: [1, 2] }));
    expect(regionFieldCommand(row, "start", " 0 ")).toEqual({ ok: true, value: null });
    expect(regionFieldCommand(row, "end", "2.5")).toEqual(set({ end: [5, 2] }));
    expect(regionFieldCommand(row, "start", "x")).toEqual({
      ok: false,
      problems: [
        {
          code: "invalid_value",
          message: '"x" is no fraction value; write an integer, n/d, a b/c or a decimal',
          path: ['{"block":"0000000000","id":"intro"}', "start"],
        },
      ],
    });
  });
});

describe("the panel", () => {
  let app: ReturnType<typeof mount> | undefined;
  let selected: (readonly Address[])[] = [];

  afterEach(() => {
    if (app !== undefined) unmount(app);
    app = undefined;
    document.body.innerHTML = "";
  });

  function show(store: Store, ...elements: ElementAddress[]): void {
    const live = liveStore(store);
    const subjects = () =>
      resolveSelection(
        live.view,
        selectionOf(elements.map((element): Address => ({ block: A, ...element }))),
        null,
        fontMetrics,
      );
    selected = [];
    app = mount(RegionsPanel, {
      target: document.body,
      props: {
        store,
        get block() {
          return selectedBlock(live.view, subjects());
        },
        get subjects() {
          return subjects();
        },
        drafts: new PropertyDrafts(),
        onselect: (addresses: readonly Address[]) => {
          selected.push(addresses);
        },
      },
    });
    flushSync();
  }

  const rows = () => [...document.querySelectorAll<HTMLElement>('[data-testid="region-row"]')];
  const rowNamed = (id: string) => {
    const row = rows().find((item) => item.querySelector(".id")?.textContent === id);
    if (row === undefined) throw new Error(`no row ${id}`);
    return row;
  };
  const input = (id: string, name: string) => {
    const found = rowNamed(id).querySelector<HTMLInputElement>(`input[name="${name}"]`);
    if (found === null) throw new Error(`no field ${name} of ${id}`);
    return found;
  };
  const enter = (field: HTMLInputElement, text: string) => {
    field.value = text;
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    flushSync();
  };
  const status = () => document.querySelector('[role="status"]')?.textContent;

  it("says what to select without a timeline", () => {
    show(styled());
    expect(document.body.textContent?.trim()).toBe(HINT);
  });

  it("lists the rows with their fields, and selects a row's region", () => {
    show(styled(), { id: "intro" });
    expect([...document.querySelectorAll("h3")].map((heading) => heading.textContent)).toEqual([
      "b",
    ]);
    expect(
      rows().map((row) => [
        row.querySelector(".id")?.textContent,
        [...row.querySelectorAll("label")].map((label) => [
          label.querySelector("span")?.textContent,
          label.querySelector("input")?.value,
          label.querySelector(".unit")?.textContent ?? null,
        ]),
        row.querySelector(".remove")?.getAttribute("aria-label"),
        row.querySelector(".select")?.getAttribute("aria-pressed"),
        row.classList.contains("selected"),
      ]),
    ).toEqual([
      [
        "intro",
        [
          ["Name", "intro", null],
          ["Start", "0", "♩"],
          ["End", "2", "♩"],
        ],
        "Remove region intro",
        "true",
        true,
      ],
      [
        "motif",
        [
          ["Name", "motif", null],
          ["Start", "1", "♩"],
          ["End", "3", "♩"],
        ],
        "Remove region motif",
        "false",
        false,
      ],
    ]);
    rowNamed("motif").querySelector<HTMLButtonElement>(".select")?.click();
    expect(selected).toEqual([[at("motif")]]);
  });

  it("journals a name, keeps a refused draft with the store's words, and drops it on Escape", () => {
    const store = styled();
    show(store, { id: "score", part: ["card"] });
    const entries = store.listed.length;
    enter(input("intro", "name"), "Intro");
    expect(store.listed.length).toBe(entries + 1);
    expect(store.listed.at(-1)?.entry).toMatchObject({
      command: { type: "set", changes: [{ target: at("intro"), values: { name: "Intro" } }] },
    });
    expect(input("intro", "name").value).toBe("Intro");

    enter(input("intro", "start"), "3");
    expect(store.listed.length).toBe(entries + 1);
    const start = input("intro", "start");
    const problem = document.getElementById(start.getAttribute("aria-describedby") ?? "");
    expect([start.value, start.getAttribute("aria-invalid"), problem?.textContent]).toEqual([
      "3",
      "true",
      "region 'intro' ends before it starts",
    ]);
    start.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    flushSync();
    expect([
      input("intro", "start").value,
      input("intro", "start").getAttribute("aria-invalid"),
    ]).toEqual(["0", "false"]);

    enter(input("intro", "start"), "x");
    expect(
      document.getElementById(input("intro", "start").getAttribute("aria-describedby") ?? "")
        ?.textContent,
    ).toBe('"x" is no fraction value; write an integer, n/d, a b/c or a decimal');
    expect(store.listed.length).toBe(entries + 1);
  });

  it("removes a region and sends Add region's add", () => {
    const store = styled();
    const sent: Command[] = [];
    const answers: (Problem | null)[] = [];
    const dispatch = store.dispatch.bind(store);
    store.dispatch = (command: Command) => {
      sent.push(command);
      const answer = dispatch(command);
      answers.push(answer);
      return answer;
    };
    show(store, { id: "score", part: ["card"] });
    rowNamed("intro").querySelector<HTMLButtonElement>(".remove")?.click();
    flushSync();
    expect(sent).toEqual([{ type: "remove", targets: [at("intro")] }]);
    expect(answers).toEqual([null]);
    expect(rows().map((row) => row.querySelector(".id")?.textContent)).toEqual(["motif"]);
    expect(status()).toBe("");

    const add = [...document.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Add region",
    );
    add?.click();
    flushSync();
    expect(sent.at(-1)).toEqual({
      type: "add",
      into: at("score"),
      region: { start: [0, 1], end: [8, 1] },
    });
    expect(status()).toBe(answers.at(-1)?.message ?? "");
  });

  it("shows atomic sections as text", () => {
    show(storeOf("flow/sonata_exposition"), { id: "score", part: ["card"] });
    expect(document.querySelectorAll("input, .remove").length).toBe(0);
    expect(
      [...(rows()[0]?.querySelectorAll("dd") ?? [])].map((value) => value.textContent),
    ).toEqual(["A", "0 ♩", "12 ♩"]);
    expect(rows()[0]?.querySelector(".type")?.textContent).toBe("Atomic section");
  });
});
