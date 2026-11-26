/**
 * The timeline list of a selected bundle: which selection lists timelines,
 * its rows in drawing order, and the one `set` a virtual timeline's
 * Visible checkbox journals; the expected values are derived in
 * `README.md` ("The bundle's timeline list").
 */

import { liveStore, resolveSelection, selectionOf } from "@timetoalign/tilie-arranger";
import type { Address, Store } from "@timetoalign/tilie-core";
import { fontMetrics } from "@timetoalign/timetoshare";
import { flushSync, mount, unmount } from "svelte";
import { afterEach, describe, expect, it } from "vitest";
import PropertiesPanel from "../src/inspector/PropertiesPanel.svelte";
import { PropertyDrafts } from "../src/inspector/propertyDrafts.svelte.ts";
import { selectedBlock } from "../src/inspector/selection.ts";
import type { TimelineRow } from "../src/inspector/timelineList.ts";
import { timelineList } from "../src/inspector/timelineList.ts";
import { blockId, posting, providing, storeOf } from "./support.ts";

const A = blockId(0);
const BLOCK: Address = { block: A };
const card = (id: string): Address => ({ block: A, id, part: ["card"] });

const subjectsOf = (store: Store, ...addresses: Address[]) =>
  resolveSelection(store.view, selectionOf(addresses), null, fontMetrics);

const rowsOf = (store: Store, ...addresses: Address[]) =>
  timelineList(store.view, subjectsOf(store, ...addresses));

/** The rows as `[kind, id, name, checked]`, `null` checked for a row without Visible. */
const shape = (rows: readonly TimelineRow[] | null) =>
  rows?.map((row) => [row.kind, row.id, row.name, row.visible?.checked ?? null]) ?? null;

/** The row of `id`. */
function rowOf(store: Store, id: string): TimelineRow {
  const row = rowsOf(store, BLOCK)?.find((item) => item.id === id);
  if (row === undefined) throw new Error(`no row ${id}`);
  return row;
}

/** The `set` of the place of the item `id`. */
const placeSet = (id: string, place: object) => ({
  type: "set",
  changes: [{ target: { block: A, id }, values: { place } }],
});

const MEMBER_ROWS = [
  ["group", "performance", "Performance", null],
  ["timeline", "allegro", "Allegro", null],
  ["virtual_timeline", "allegro_by_hand", "Allegro, practice", false],
  ["virtual_timeline", "allegro_single", "Allegro, single", false],
];

describe("the selections listing timelines", () => {
  it("are the block alone", () => {
    const store = storeOf("groups/virtual_member");
    expect(shape(rowsOf(store, BLOCK))).toEqual(MEMBER_ROWS);
    expect(rowsOf(store)).toBeNull();
    expect(rowsOf(store, card("allegro"))).toBeNull();
    expect(rowsOf(store, BLOCK, card("allegro"))).toBeNull();
  });
});

describe("a virtual timeline's Visible", () => {
  it("states its default place to show its card", () => {
    const store = storeOf("flow/virtual_cards");
    const row = rowOf(store, "allegro_single");
    expect(row.visible?.checked).toBe(false);
    expect(row.visible?.command).toEqual(placeSet("allegro_single", { scale: 1 }));
    if (row.visible === null) throw new Error("no Visible");
    expect(store.dispatch(row.visible.command)).toBeNull();
    expect(store.view.blocks[A]?.places.allegro_single).toEqual({ scale: 1 });
    expect(rowOf(store, "allegro_single").visible?.checked).toBe(true);
  });

  it("unstates every member of its place to hide its card, as Delete does", () => {
    const store = storeOf("flow/virtual_cards");
    expect(store.dispatch(placeSet("allegro_by_hand", { x: 40, y: 300 }))).toBeNull();
    const row = rowOf(store, "allegro_by_hand");
    expect(row.visible?.checked).toBe(true);
    expect(row.visible?.command).toEqual(placeSet("allegro_by_hand", { x: null, y: null }));
    if (row.visible === null) throw new Error("no Visible");
    expect(store.dispatch(row.visible.command)).toBeNull();
    expect(Object.hasOwn(store.view.blocks[A]?.places ?? {}, "allegro_by_hand")).toBe(false);
    expect(rowOf(store, "allegro_by_hand").visible?.checked).toBe(false);
  });
});

describe("the timeline list in the Properties tab", () => {
  let app: ReturnType<typeof mount> | undefined;
  let informed: string[] = [];

  afterEach(() => {
    if (app !== undefined) unmount(app);
    app = undefined;
    document.body.innerHTML = "";
  });

  function show(store: Store, address: Address): void {
    const live = liveStore(store);
    const subjects = () => resolveSelection(live.view, selectionOf([address]), null, fontMetrics);
    informed = [];
    app = mount(providing(PropertiesPanel), {
      target: document.body,
      context: posting(informed),
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
      },
    });
    flushSync();
  }

  const table = () => document.querySelector<HTMLTableElement>('[data-testid="timeline-list"]');
  const box = (name: string) =>
    table()?.querySelector<HTMLInputElement>(`input[aria-label="${name} visible"]`);

  it("lists the bundle's cards, and journals one set for a change", () => {
    const store = storeOf("groups/virtual_member");
    show(store, BLOCK);
    expect(table()?.caption?.textContent).toBe("Timelines");
    expect([...(table()?.tHead?.querySelectorAll("th") ?? [])].map((th) => th.textContent)).toEqual(
      ["Card", "Visible"],
    );
    expect(
      [...(table()?.tBodies[0]?.rows ?? [])].map((row) => [
        row.cells[0]?.textContent,
        row.cells[1]?.textContent,
        row.querySelector("input")?.checked ?? null,
      ]),
    ).toEqual([
      ["Group Performance", "Always drawn", null],
      ["Timeline Allegro", "Always drawn", null],
      ["Virtual timeline Allegro, practice", "", false],
      ["Virtual timeline Allegro, single", "", false],
    ]);
    const note = document.getElementById(table()?.getAttribute("aria-describedby") ?? "");
    expect(note?.textContent?.replace(/\s+/g, " ").trim()).toBe(
      "A group's members, and the roots drawn behind its frame, are listed in the group's Properties: select its frame.",
    );
    const entries = store.listed.length;
    box("Allegro, single")?.click();
    flushSync();
    expect(store.listed.length).toBe(entries + 1);
    expect(store.listed.at(-1)?.entry).toMatchObject({
      command: placeSet("allegro_single", { scale: 1 }),
    });
    expect(box("Allegro, single")?.checked).toBe(true);
    expect(informed).toEqual([]);
  });

  it("shows none for a timeline's card", () => {
    show(storeOf("groups/virtual_member"), card("allegro"));
    expect(table()).toBeNull();
  });
});
