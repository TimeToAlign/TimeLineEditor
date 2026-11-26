/**
 * The band list of a selected timeline card: which selection lists bands,
 * its rows in the band order, and the one `style` a change journals; the
 * expected values are derived in `README.md` ("The band list").
 */

import { liveStore, resolveSelection, selectionOf } from "@timetoalign/tilie-arranger";
import type { Address, ElementAddress, Store } from "@timetoalign/tilie-core";
import { fontMetrics } from "@timetoalign/timetoshare";
import { flushSync, mount, unmount } from "svelte";
import { afterEach, describe, expect, it } from "vitest";
import type { BandRow } from "../src/inspector/display.ts";
import { bandList, toggleCommand } from "../src/inspector/display.ts";
import PropertiesPanel from "../src/inspector/PropertiesPanel.svelte";
import { PropertyDrafts } from "../src/inspector/propertyDrafts.svelte.ts";
import { selectedBlock } from "../src/inspector/selection.ts";
import { blockId, posting, providing, storeOf } from "./support.ts";

const A = blockId(0);

const subjectsOf = (store: Store, ...elements: ElementAddress[]) =>
  resolveSelection(
    store.view,
    selectionOf(elements.map((element): Address => ({ block: A, ...element }))),
    null,
    fontMetrics,
  );

/** The rows of the selection as `[label, checked]`; `null` without a list. */
const rowsOf = (store: Store, ...elements: ElementAddress[]) =>
  bandList(store.view, subjectsOf(store, ...elements))?.map((row) => [
    row.toggle.label,
    row.toggle.pressed,
  ]) ?? null;

const card = (id: string): ElementAddress => ({ id, part: ["card"] });

/** The `style` of the band `facet` of `score`'s own `display`. */
const bandStyle = (facet: string, display: string | null) => ({
  type: "style",
  select: { element: "band", addresses: [{ id: "score", facet }] },
  set: { display },
  blocks: [A],
});

/** Change the checkbox of `facet` of `score`'s card: the command it journals, which the store must accept. */
function change(store: Store, facet: string) {
  const row = bandList(store.view, subjectsOf(store, card("score")))?.find(
    (item: BandRow) => item.facet === facet,
  );
  const block = store.view.blocks[A];
  if (row === undefined || block === undefined) throw new Error(`no band ${facet}`);
  const command = toggleCommand(store.view, block, row.toggle);
  expect(store.dispatch(command)).toBeNull();
  return command;
}

const ALL_SHOWN = [
  ["Children", true],
  ["Markers", true],
  ["Conversion maps", true],
  ["Flow control", true],
  ["Regions", true],
];

describe("the selections listing bands", () => {
  it("are a timeline's card, its line or one of its bands, the timeline drawn in a card", () => {
    const store = storeOf("styled_score_flow_inner");
    expect(rowsOf(store, card("score"))).toEqual(ALL_SHOWN);
    expect(rowsOf(store, { id: "score" })).toEqual(ALL_SHOWN);
    expect(rowsOf(store, { id: "score", facet: "regions" })).toEqual(ALL_SHOWN);
    expect(rowsOf(store, card("score"), { id: "score" })).toEqual(ALL_SHOWN);
  });

  it("are no other", () => {
    const store = storeOf("styled_score_flow_inner");
    expect(bandList(store.view, [])).toBeNull();
    expect(
      bandList(
        store.view,
        resolveSelection(store.view, selectionOf([{ block: A }]), null, fontMetrics),
      ),
    ).toBeNull();
    expect(rowsOf(store, { id: "b" })).toBeNull();
    expect(rowsOf(store, { id: "score", facet: "regions" }, { id: "intro" })).toBeNull();
    expect(rowsOf(store, { id: "intro" })).toBeNull();
    expect(rowsOf(store, { id: "score" }, { id: "b" })).toBeNull();
  });

  it("list a root's bands and a child member's but its flow control, in the band order", () => {
    const store = storeOf("groups/group_child_member");
    expect(rowsOf(store, card("recording"))).toEqual([
      ["Children", true],
      ["Conversion maps", true],
      ["Markers", true],
      ["Regions", true],
      ["Flow control", true],
    ]);
    expect(rowsOf(store, card("second-half"))).toEqual([
      ["Children", true],
      ["Conversion maps", true],
      ["Markers", true],
      ["Regions", true],
    ]);
  });
});

describe("a change", () => {
  it("writes the band's own rule, and removes it where the cascade then displays the band", () => {
    const store = storeOf("styled_score_flow_inner");
    const rules = store.view.blocks[A]?.manifest.graphical?.rules;
    expect(change(store, "regions")).toEqual(bandStyle("regions", "none"));
    expect(rowsOf(store, card("score"))).toEqual([
      ["Children", true],
      ["Markers", true],
      ["Conversion maps", true],
      ["Flow control", true],
      ["Regions", false],
    ]);
    expect(change(store, "regions")).toEqual(bandStyle("regions", null));
    expect(store.view.blocks[A]?.manifest.graphical?.rules).toEqual(rules);
    expect(rowsOf(store, card("score"))).toEqual(ALL_SHOWN);
  });

  it("states the band's own display over a rule hiding every regions band", () => {
    const store = storeOf("styled_score_flow_inner");
    const hidden = {
      type: "style",
      select: { facet: "regions" },
      set: { display: "none" },
      blocks: [A],
    } as const;
    expect(store.dispatch(hidden)).toBeNull();
    expect(rowsOf(store, card("score"))?.at(-1)).toEqual(["Regions", false]);
    expect(change(store, "regions")).toEqual(bandStyle("regions", "inline"));
    expect(rowsOf(store, card("score"))?.at(-1)).toEqual(["Regions", true]);
    expect(change(store, "regions")).toEqual(bandStyle("regions", null));
    expect(rowsOf(store, card("score"))?.at(-1)).toEqual(["Regions", false]);
  });
});

describe("the band list in the Properties tab", () => {
  let app: ReturnType<typeof mount> | undefined;
  let informed: string[] = [];

  afterEach(() => {
    if (app !== undefined) unmount(app);
    app = undefined;
    document.body.innerHTML = "";
  });

  function show(store: Store, element: ElementAddress): void {
    const live = liveStore(store);
    const subjects = () =>
      resolveSelection(live.view, selectionOf([{ block: A, ...element }]), null, fontMetrics);
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

  const table = () => document.querySelector<HTMLTableElement>('[data-testid="band-list"]');
  const boxes = () => [...(table()?.querySelectorAll<HTMLInputElement>("input") ?? [])];

  it("shows the bands below the form, and journals one style for a change", () => {
    const store = storeOf("styled_score_flow_inner");
    show(store, card("score"));
    expect(document.querySelector("form")?.compareDocumentPosition(table() as Node)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(table()?.caption?.textContent).toBe("Bands");
    expect([...(table()?.tHead?.querySelectorAll("th") ?? [])].map((th) => th.textContent)).toEqual(
      ["Band", "Visible"],
    );
    expect(
      [...(table()?.tBodies[0]?.rows ?? [])].map((row) => [
        row.cells[0]?.textContent,
        row.querySelector("input")?.getAttribute("aria-label"),
        row.querySelector("input")?.checked,
      ]),
    ).toEqual([
      ["Children", "Children visible", true],
      ["Markers", "Markers visible", true],
      ["Conversion maps", "Conversion maps visible", true],
      ["Flow control", "Flow control visible", true],
      ["Regions", "Regions visible", true],
    ]);
    const entries = store.listed.length;
    boxes()[4]?.click();
    flushSync();
    expect(store.listed.length).toBe(entries + 1);
    expect(store.listed.at(-1)?.entry).toMatchObject({ command: bandStyle("regions", "none") });
    expect(boxes()[4]?.checked).toBe(false);
    expect(informed).toEqual([]);
  });

  it("shows none for a region", () => {
    show(storeOf("styled_score_flow_inner"), { id: "intro" });
    expect(table()).toBeNull();
  });
});
