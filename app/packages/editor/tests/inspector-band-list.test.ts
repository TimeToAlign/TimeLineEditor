/**
 * The band list of a selected timeline: which selection lists bands, its
 * rows in the band order, the one `style` a change journals, and why a row
 * changing nothing drawn is inert; the expected values are derived in
 * `README.md` ("The band list").
 */

import { liveStore, resolveSelection, selectionOf } from "@timetoalign/tilie-arranger";
import type { Address, ElementAddress, Store } from "@timetoalign/tilie-core";
import { fontMetrics } from "@timetoalign/timetoshare";
import { flushSync, mount, unmount } from "svelte";
import { afterEach, describe, expect, it } from "vitest";
import type { BandRow } from "../src/inspector/display.ts";
import { bandList, controlCommand } from "../src/inspector/display.ts";
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
    row.control.label,
    row.control.pressed,
  ]) ?? null;

/** The rows of the selection as `[label, inert]`; `null` without a list. */
const inertOf = (store: Store, ...elements: ElementAddress[]) =>
  bandList(store.view, subjectsOf(store, ...elements))?.map((row) => [
    row.control.label,
    row.control.inert,
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
  const command = controlCommand(store.view, block, row.control);
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
  it("are a timeline's card, its line or one of its bands, a child's and a virtual timeline's alike", () => {
    const store = storeOf("styled_score_flow_inner");
    expect(rowsOf(store, card("score"))).toEqual(ALL_SHOWN);
    expect(rowsOf(store, { id: "score" })).toEqual(ALL_SHOWN);
    expect(rowsOf(store, { id: "score", facet: "regions" })).toEqual(ALL_SHOWN);
    expect(rowsOf(store, card("score"), { id: "score" })).toEqual(ALL_SHOWN);
    expect(rowsOf(store, { id: "b" })).toEqual(ALL_SHOWN);
    const virtual = storeOf("flow/virtual_cards");
    const bands = [
      ["Markers", true],
      ["Regions", true],
    ];
    expect(rowsOf(virtual, { id: "allegro_by_hand" })).toEqual(bands);
    expect(rowsOf(virtual, card("allegro_by_hand"))).toEqual(bands);
    expect(rowsOf(virtual, { id: "allegro_by_hand", facet: "regions" })).toEqual(bands);
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
    expect(rowsOf(store, { id: "score", facet: "regions" }, { id: "intro" })).toBeNull();
    expect(rowsOf(store, { id: "intro" })).toBeNull();
    expect(rowsOf(store, { id: "score" }, { id: "b" })).toBeNull();
  });

  it("list a root's bands and a child member's, its flow control included, in the band order", () => {
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
      ["Flow control", true],
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

describe("an inert row", () => {
  it("is a band holding nothing of its facet, a child's regions lying in its own band", () => {
    const store = storeOf("unknown_length_child");
    const rows = Object.fromEntries(inertOf(store, { id: "score" }) ?? []);
    expect(rows.Regions).toBe(
      "Timeline 'score' holds no regions; those of its descendants lie in their own regions bands.",
    );
    expect(rows.Children).toBeNull();
    expect(rows["Flow control"]).toBe("Timeline 'score' holds no flow-control elements.");
    expect(Object.fromEntries(inertOf(store, { id: "movement" }) ?? []).Regions).toBeNull();
  });

  it("is a band whose elements are all hidden, until a rule shows them", () => {
    const store = storeOf("flow/sonata_exposition");
    const regions = () => Object.fromEntries(inertOf(store, { id: "score" }) ?? []).Regions;
    expect(regions()).toBe("None of the regions it holds is displayed.");
    const atomic = {
      type: "style",
      select: { element: "region", class: "tts:AtomicSection" },
      set: { display: "inline" },
      blocks: [A],
    } as const;
    expect(store.dispatch(atomic)).toBeNull();
    expect(regions()).toBeNull();
  });

  it("is every band of a timeline whose line is hidden", () => {
    const hidden = "Timeline 'a' is hidden.";
    expect(inertOf(storeOf("styled_score_flow_inner"), { id: "a" })).toEqual([
      ["Children", hidden],
      ["Markers", hidden],
      ["Conversion maps", hidden],
      ["Flow control", hidden],
      ["Regions", hidden],
    ]);
    expect(rowsOf(storeOf("styled_score_flow_inner"), { id: "a" })).toEqual(ALL_SHOWN);
  });

  it("is a virtual timeline's band holding nothing", () => {
    expect(inertOf(storeOf("flow/virtual_cards"), { id: "allegro_by_hand" })).toEqual([
      ["Markers", "Virtual timeline 'Allegro, practice' holds no named timestamps."],
      ["Regions", null],
    ]);
  });

  it("is none of a timeline holding and showing all of its facets", () => {
    expect(
      inertOf(storeOf("styled_score_flow_inner"), card("score"))?.map(([, inert]) => inert),
    ).toEqual([null, null, null, null, null]);
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
        row.cells[0]?.textContent?.trim(),
        row.querySelector("input")?.getAttribute("aria-label"),
        row.querySelector("input")?.checked,
        row.querySelector("input")?.disabled,
      ]),
    ).toEqual([
      ["Children", "Children visible", true, false],
      ["Markers", "Markers visible", true, false],
      ["Conversion maps", "Conversion maps visible", true, false],
      ["Flow control", "Flow control visible", true, false],
      ["Regions", "Regions visible", true, false],
    ]);
    const entries = store.listed.length;
    boxes()[4]?.click();
    flushSync();
    expect(store.listed.length).toBe(entries + 1);
    expect(store.listed.at(-1)?.entry).toMatchObject({ command: bandStyle("regions", "none") });
    expect(boxes()[4]?.checked).toBe(false);
    expect(informed).toEqual([]);
  });

  it("disables an inert row, its reason beside its word", () => {
    show(storeOf("unknown_length_child"), { id: "score" });
    const reason =
      "Timeline 'score' holds no regions; those of its descendants lie in their own regions bands.";
    const regions = boxes().find((box) => box.value === "regions");
    expect(regions?.disabled).toBe(true);
    expect(regions?.title).toBe(reason);
    const described = document.getElementById(regions?.getAttribute("aria-describedby") ?? "");
    expect(described?.textContent).toBe(reason);
    expect(described?.closest("tr")?.contains(regions ?? null)).toBe(true);
    expect(boxes().find((box) => box.value === "children")?.disabled).toBe(false);
  });

  it("shows none for a region", () => {
    show(storeOf("styled_score_flow_inner"), { id: "intro" });
    expect(table()).toBeNull();
  });
});
