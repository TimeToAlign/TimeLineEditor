/**
 * A selected band shows three read-only rows, and the form leaves bands
 * out; a selected region shows its start, end and length; the expected
 * values are derived in `README.md` ("The Properties form", "A selected
 * band", "A selected region").
 */

import type { LivePlacement } from "@timetoalign/tilie-arranger";
import {
  deleteQuestion,
  drawingOf,
  liveStore,
  resolveSelection,
  rootDisplayCommand,
  rootHidden,
  selectionOf,
} from "@timetoalign/tilie-arranger";
import type { Address, Block, ElementAddress, Facet, Store, View } from "@timetoalign/tilie-core";
import { addressKey } from "@timetoalign/tilie-core";
import type { DrawnBox } from "@timetoalign/tilie-layout";
import { fontMetrics } from "@timetoalign/timetoshare";
import { flushSync, mount, unmount } from "svelte";
import { afterEach, describe, expect, it } from "vitest";
import type { Ask } from "../src/ConfirmDialog.svelte";
import { provideAsk } from "../src/ConfirmDialog.svelte";
import Inspector from "../src/inspector/Inspector.svelte";
import { manifestOf, manifestText } from "../src/inspector/manifestText.ts";
import type { Shown } from "../src/inspector/properties.ts";
import {
  askDeletion,
  bandRows,
  geometryOf,
  regionRows,
  virtualDeletionOf,
} from "../src/inspector/properties.ts";
import { selectedBlock } from "../src/inspector/selection.ts";
import { posting, regionNamed, storeOf as storeOfFixtures } from "./support.ts";

/** `map`. */
const A = "0000000000";
/** `map_child_band_order`. */
const B = "0000000001";

const GEOMETRY_HINT = "Select a block, a frame or a card to edit its geometry.";

/** The store of the two blocks, each written by one `add`. */
function storeOf(): Store {
  return storeOfFixtures("map", "map_child_band_order");
}

function blockOf(view: View, id: string): Block {
  const block = view.blocks[id];
  if (block === undefined) throw new Error(`no block ${id}`);
  return block;
}

/** What the canvas shows of `id` without a gesture. */
function stored(view: View, id: string): Shown {
  const block = blockOf(view, id);
  return { ...block, drawing: drawingOf(block, view.graphical, fontMetrics) };
}

/** The address of `element` in block `block`; the block itself without an element. */
function at(block: string, element: ElementAddress = {}): Address {
  return { block, ...element };
}

/** The address of the band of `facet` of `timeline` in block `block`. */
function bandOf(block: string, timeline: string, facet: Facet): Address {
  return at(block, { id: timeline, facet });
}

function subjectsOf(view: View, selection: readonly Address[]) {
  return resolveSelection(view, selectionOf(selection), null, fontMetrics);
}

/** The rows of `selection` as `[label, value]` pairs, shown as `shown` (its block stored by default); `null` when it has none. */
function rows(view: View, selection: readonly Address[], shown?: Shown): [string, string][] | null {
  const subjects = subjectsOf(view, selection);
  const found = bandRows(subjects, shown ?? stored(view, subjects[0]?.block ?? A));
  return found?.map(({ label, value }) => [label, value]) ?? null;
}

/** The three rows of a band. */
const band = (word: string, level: string, elements: string): [string, string][] => [
  ["Band", word],
  ["Level", level],
  ["Elements", elements],
];

/** A band's record written for the test; the rows read only its address, level and elements. */
function record(timeline: string, facet: Facet, level: number, elements: number): DrawnBox {
  return {
    kind: "band",
    key: null,
    address: { id: timeline, facet },
    holder: { item: timeline },
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    range: { start: 0, end: 0 },
    displayed: false,
    band: { timeline, facet, level, elements, line: 0 },
  };
}

/** A placement of `id` at its stored values, showing its stored drawing with `bands` instead of its own. */
function placementOf(view: View, id: string, bands: readonly DrawnBox[]): LivePlacement {
  const { drawing, x, y, scale, length, spacing, margin, width, height } = stored(view, id);
  const boxes = [...drawing.boxes.filter((box) => box.kind !== "band"), ...bands];
  return {
    id,
    x,
    y,
    scale,
    length,
    spacing,
    margin,
    width,
    height,
    drawing: { ...drawing, boxes },
  };
}

describe("bandRows", () => {
  it.each(
    [
      [bandOf(A, "melody", "conversion_maps"), band("Conversion maps", "1", "1")],
      [bandOf(A, "melody", "children"), band("Children", "2", "1")],
      // The markers band holds the wedge and the coordinate label of `origin` and of `length`.
      [bandOf(A, "melody", "markers"), band("Markers", "−1", "4")],
      [bandOf(A, "phrase", "conversion_maps"), band("Conversion maps", "1", "1")],
      [bandOf(B, "phrase", "conversion_maps"), band("Conversion maps", "−1", "1")],
    ].map(([address, expected]) => [addressKey(address as Address), address, expected] as const),
  )("gives the word, signed level and element count of %s", (_key, address, expected) => {
    expect(rows(storeOf().view, [address as Address])).toEqual(expected);
  });

  it.each([
    ["no selection", []],
    ["a block", [at(A)]],
    ["a map", [at(A, { id: "tempo" })]],
    ["a card", [at(A, { id: "melody", part: ["card"] })]],
    ["an absent band of a root", [bandOf(A, "melody", "regions")]],
    ["an absent band of a child", [bandOf(A, "phrase", "markers")]],
    ["two bands", [bandOf(A, "melody", "markers"), bandOf(A, "melody", "conversion_maps")]],
    [
      "a band with an element",
      [bandOf(A, "melody", "markers"), at(A, { id: "melody", part: ["card"] })],
    ],
    ["a band of a block the workspace does not hold", [bandOf("0000000009", "melody", "markers")]],
  ] as const)("gives null for %s", (_case, selection) => {
    expect(rows(storeOf().view, selection)).toBe(null);
  });

  it("reads the drawing a gesture shows", () => {
    const { view } = storeOf();
    const shown = placementOf(view, A, [
      record("melody", "markers", 1, 3),
      record("melody", "regions", -2, 4),
      record("melody", "flow_control", -12, 1),
    ]);
    expect(rows(view, [bandOf(A, "melody", "markers")], shown)).toEqual(band("Markers", "1", "3"));
    expect(rows(view, [bandOf(A, "melody", "regions")], shown)).toEqual(band("Regions", "−2", "4"));
    expect(rows(view, [bandOf(A, "melody", "flow_control")], shown)).toEqual(
      band("Flow control", "−12", "1"),
    );
  });
});

describe("regionRows", () => {
  const sonata = () => storeOfFixtures("flow/sonata_exposition");
  /** The sonata's sections A and B, computed from its flow control: their IDs are minted. */
  const [SECTION_A, SECTION_B] = ["A", "B"].map((name) =>
    regionNamed("flow/sonata_exposition", name),
  ) as [string, string];
  const regionRowsOf = (store: Store, selection: readonly Address[]) =>
    regionRows(subjectsOf(store.view, selection))?.map(({ label, value }) => [label, value]) ??
    null;

  it("gives a region's start, end and length on its timeline's axis, itself or by its label", () => {
    const store = sonata();
    const expected = [
      ["Start", "12 ♩"],
      ["End", "16 ♩"],
      ["Length", "4 ♩"],
    ];
    expect(regionRowsOf(store, [at(A, { id: SECTION_B })])).toEqual(expected);
    expect(regionRowsOf(store, [at(A, { id: SECTION_B, part: ["label"] })])).toEqual(expected);
    expect(
      regionRowsOf(store, [at(A, { id: SECTION_B }), at(A, { id: SECTION_B, part: ["label"] })]),
    ).toEqual(expected);
  });

  it("gives none for two regions, a region with its timeline, or a flow-control element", () => {
    const store = sonata();
    expect(regionRowsOf(store, [at(A, { id: SECTION_A }), at(A, { id: SECTION_B })])).toBeNull();
    expect(regionRowsOf(store, [at(A, { id: SECTION_A }), at(A, { id: "score" })])).toBeNull();
    expect(regionRowsOf(store, [at(A, { id: "jump_1" })])).toBeNull();
    expect(regionRowsOf(store, [])).toBeNull();
  });
});

/** `flow/virtual_cards` in block A, `allegro_default` placed at (0, 200) by one `set` of its place. */
function virtualCards(): Store {
  const store = storeOfFixtures("flow/virtual_cards");
  const refused = store.dispatch({
    type: "set",
    changes: [{ target: at(A, { id: "allegro_default" }), values: { place: { x: 0, y: 200 } } }],
  });
  if (refused !== null) throw new Error(refused.message);
  return store;
}

describe("virtualDeletionOf", () => {
  const removal = { type: "remove", targets: [at(A, { id: "allegro_default" })] };
  const deletion = (store: Store, selection: readonly Address[]) =>
    virtualDeletionOf(subjectsOf(store.view, selection));

  it("removes the one virtual timeline selected, by its address or by its card", () => {
    const store = virtualCards();
    expect(deletion(store, [at(A, { id: "allegro_default" })])).toEqual(removal);
    expect(deletion(store, [at(A, { id: "allegro_default", part: ["card"] })])).toEqual(removal);
  });

  it("gives none for anything else", () => {
    const store = virtualCards();
    for (const selection of [
      [at(A, { id: "allegro_default" }), at(A, { id: "allegro_by_hand" })],
      [at(A, { id: "allegro_default" }), at(A, { id: "allegro" })],
      [at(A, { id: "allegro_default", facet: "regions", part: [0] })],
      [at(A, { id: "default" })],
      [at(A, { id: "allegro" })],
      [],
    ]) {
      expect(deletion(store, selection)).toBeNull();
    }
  });
});

describe("askDeletion", () => {
  const id = (element: string) => at(A, { id: element });
  /** `virtualCards()` with `again`, made from `allegro_default` through the FlowMap `single`. */
  function withAgain(): Store {
    const store = virtualCards();
    const refused = store.dispatch({
      type: "add",
      into: { block: A },
      virtual_timeline: { map: "single", timeline: "allegro_default" },
      ids: ["again"],
    });
    if (refused !== null) throw new Error(refused.message);
    return store;
  }
  /** The question of deleting the card of `allegro_default` selected. */
  function question(store: Store) {
    const command = virtualDeletionOf(
      subjectsOf(store.view, [at(A, { id: "allegro_default", part: ["card"] })]),
    );
    if (command === null) throw new Error("no deletion");
    const asked = deleteQuestion(store.view, command);
    if (asked === null) throw new Error("no question");
    return asked;
  }
  /** A stand-in for the dialog answering `answer`, and what it was asked. */
  function dialog(answer: string | null) {
    const asked: [string, readonly string[], string][] = [];
    const ask = async (text: string, choices: readonly string[], focused: string) => {
      asked.push([text, choices, focused]);
      return answer;
    };
    return { ask, asked };
  }
  const virtualIds = (store: Store) =>
    (store.view.blocks[A]?.manifest.virtual_timelines ?? []).map((item) => item.id);

  it("asks the question with its three answers and hides on Hide instead", async () => {
    const store = withAgain();
    const { ask, asked } = dialog("Hide instead");
    const chosen = await askDeletion(ask, question(store));
    expect(asked).toEqual([
      [
        "Deleting virtual timeline 'Allegro, default' also deletes what is made from it: virtual timeline 'again'. Delete all, or hide its card instead?",
        ["Delete all", "Hide instead", "Cancel"],
        "Cancel",
      ],
    ]);
    expect(chosen).toEqual({
      type: "set",
      changes: [{ target: id("allegro_default"), values: { place: { x: null, y: null } } }],
    });
    if (chosen === null) throw new Error("nothing chosen");
    expect(store.dispatch(chosen)).toBeNull();
    expect(virtualIds(store)).toEqual([
      "again",
      "allegro_by_hand",
      "allegro_default",
      "allegro_single",
    ]);
  });

  it("deletes all on Delete all, and nothing on Cancel or a dismissed dialog", async () => {
    const store = withAgain();
    const chosen = await askDeletion(dialog("Delete all").ask, question(store));
    expect(chosen).toEqual({ type: "remove", targets: [id("allegro_default"), id("again")] });
    expect(await askDeletion(dialog("Cancel").ask, question(store))).toBeNull();
    expect(await askDeletion(dialog(null).ask, question(store))).toBeNull();
    if (chosen === null) throw new Error("nothing chosen");
    expect(store.dispatch(chosen)).toBeNull();
    expect(virtualIds(store)).toEqual(["allegro_by_hand", "allegro_single"]);
  });

  it("hides a root instead by its one rule", async () => {
    const store = virtualCards();
    const asked = deleteQuestion(store.view, { type: "remove", targets: [id("allegro")] });
    if (asked === null) throw new Error("no question");
    const { ask, asked: questions } = dialog("Hide instead");
    const chosen = await askDeletion(ask, asked);
    expect(questions.map(([, choices, focused]) => [choices, focused])).toEqual([
      [["Delete all", "Hide instead", "Cancel"], "Cancel"],
    ]);
    expect(chosen).toEqual(rootDisplayCommand(A, "allegro", true));
    if (chosen === null) throw new Error("nothing chosen");
    expect(store.dispatch(chosen)).toBeNull();
    const manifest = store.view.blocks[A]?.manifest;
    expect(manifest?.timelines.map((timeline) => timeline.id)).toEqual(["allegro"]);
    expect(manifest === undefined ? null : rootHidden(manifest, "allegro")).toBe(true);
  });

  /** `store` with `loop`, one more FlowMap of `allegro`, its one chunk `again`. */
  function withLoop(store: Store): Store {
    const refused = store.dispatch({
      type: "add",
      into: id("allegro"),
      flow_map: { chunks: ["again"] },
      ids: ["loop"],
    });
    if (refused !== null) throw new Error(refused.message);
    return store;
  }
  const refusedQuestion =
    "Deleting virtual timeline 'Allegro, default' also deletes what is made from it: virtual timeline 'again'. They cannot all be deleted. Virtual timeline 'again' is still named: the FlowMap 'loop' names it as a chunk.";

  it("offers no Delete all where core refuses it, only Hide instead and Cancel", async () => {
    const store = withLoop(withAgain());
    const { ask, asked } = dialog("Hide instead");
    const chosen = await askDeletion(ask, question(store));
    expect(asked).toEqual([
      [`${refusedQuestion} Hide its card instead?`, ["Hide instead", "Cancel"], "Cancel"],
    ]);
    expect(chosen).toEqual({
      type: "set",
      changes: [{ target: id("allegro_default"), values: { place: { x: null, y: null } } }],
    });
    if (chosen === null) throw new Error("nothing chosen");
    expect(store.dispatch(chosen)).toBeNull();
  });

  it("offers Cancel alone where core refuses Delete all and nothing can be hidden", async () => {
    const store = storeOfFixtures("groups/virtual_member");
    const added = store.dispatch({
      type: "add",
      into: { block: A },
      virtual_timeline: { map: "printed", timeline: "allegro_default" },
      ids: ["again"],
    });
    if (added !== null) throw new Error(added.message);
    const asked = deleteQuestion(withLoop(store).view, {
      type: "remove",
      targets: [id("allegro_default")],
    });
    if (asked === null) throw new Error("no question");
    const { ask, asked: questions } = dialog("Cancel");
    expect(await askDeletion(ask, asked)).toBeNull();
    expect(questions).toEqual([[refusedQuestion, ["Cancel"], "Cancel"]]);
  });
});

describe("the other readers of the selection", () => {
  const markers = bandOf(A, "melody", "markers");
  const card = at(A, { id: "melody", part: ["card"] });

  function geometry(view: View, selection: readonly Address[]) {
    return geometryOf(blockOf(view, A), subjectsOf(view, selection), stored(view, A), null);
  }

  it("leave a band alone without geometry, in its block", () => {
    const { view } = storeOf();
    expect(geometry(view, [markers])).toBe(null);
    expect(selectedBlock(view, subjectsOf(view, [markers]))).toBe(view.blocks[A]);
  });

  it("read a mixed selection as the selection without its bands", () => {
    const { view } = storeOf();
    const withCard = geometry(view, [markers, card]);
    expect(withCard?.label).toBe("Card properties");
    expect(withCard).toEqual(geometry(view, [card]));
    const withBlock = geometry(view, [markers, at(A)]);
    expect(withBlock?.label).toBe("Block properties");
    expect(withBlock).toEqual(geometry(view, [at(A)]));
    expect(selectedBlock(view, subjectsOf(view, [markers, at(B, { id: "melody" })]))).toBe(null);
  });
});
describe("the Properties panel of a band", () => {
  let app: ReturnType<typeof mount> | undefined;

  afterEach(() => {
    if (app !== undefined) unmount(app);
    app = undefined;
    document.body.innerHTML = "";
  });

  function show(store: Store, selection: readonly Address[]): void {
    app = mount(Inspector, {
      target: document.body,
      context: posting(),
      props: { live: liveStore(store), selection: selectionOf(selection) },
    });
    flushSync();
  }

  function hide(): void {
    if (app !== undefined) unmount(app);
    app = undefined;
    document.body.innerHTML = "";
  }

  function panel(): HTMLElement {
    const tab = document.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
    return document.getElementById(tab?.getAttribute("aria-controls") ?? "") as HTMLElement;
  }

  function texts(selector: string): string[] {
    return [...panel().querySelectorAll(selector)].map((element) => element.textContent ?? "");
  }

  function openTab(name: string): void {
    const tabs = [...document.querySelectorAll<HTMLElement>('[role="tab"]')];
    tabs.find((tab) => tab.textContent === name)?.click();
    flushSync();
  }

  /** Choose JSON on the Manifest tab, the format these tests read (YAML is shown first). */
  function chooseJson(): void {
    document.querySelector<HTMLInputElement>('input[value="json"]')?.click();
    flushSync();
  }

  it("shows the three rows of a band and nothing to edit but its card's band list", () => {
    const store = storeOf();
    show(store, [bandOf(A, "melody", "markers")]);
    expect(panel().querySelectorAll("dl")).toHaveLength(1);
    expect(texts("dt")).toEqual(["Band", "Level", "Elements"]);
    expect(texts("dd")).toEqual(["Markers", "−1", "4"]);
    // The one button is the Edit button, opening the band's timeline as a double-click does.
    expect(
      [...panel().querySelectorAll("form, select, textarea, button")].map(
        (element) => element.getAttribute("data-testid") ?? element.tagName,
      ),
    ).toEqual(["edit-button"]);
    expect(
      [...panel().querySelectorAll("input")].map((input) =>
        input.closest("[data-testid]")?.getAttribute("data-testid"),
      ),
    ).toEqual(Array.from({ length: 10 }, () => "band-list"));
    expect(panel().querySelector(".hint")).toBe(null);

    openTab("Manifest");
    chooseJson();
    // A block without a manifest file of its own is shown as a new manifest: minimal, styled.
    const expected = manifestText(manifestOf(blockOf(store.view, A)), "json", {
      includeStyling: true,
      minimal: true,
    });
    if (!expected.ok) throw new Error("the manifest is not written");
    expect(document.querySelector("textarea")?.value).toBe(expected.value.text);
  });

  it("shows for a band with a card the card's geometry, without its name and lock", () => {
    const geometry = () =>
      [...panel().querySelectorAll<HTMLInputElement>("form input[type=number]")].map((input) => [
        input.name,
        input.value,
        input.disabled,
      ]);
    show(storeOf(), [at(A, { id: "melody", part: ["card"] })]);
    const alone = geometry();
    expect(
      panel().querySelectorAll(
        'input[name="name"], input[type=checkbox]:not([name^="band-visible"])',
      ),
    ).toHaveLength(2);
    hide();

    show(storeOf(), [bandOf(A, "melody", "markers"), at(A, { id: "melody", part: ["card"] })]);
    expect(geometry()).toEqual(alone);
    expect(panel().querySelector('input[name="name"]')).toBe(null);
    expect(
      [...panel().querySelectorAll("form")].map((form) => form.getAttribute("aria-label")),
    ).toEqual(["Card properties"]);
    expect(
      [...panel().querySelectorAll<HTMLInputElement>("input[type=number]")].map(
        (input) => input.name,
      ),
    ).toEqual(["x", "y", "length", "scale", "spacing", "margin", "width", "height"]);
    expect(
      panel().querySelectorAll('input[type=checkbox]:not([name^="band-visible"])'),
    ).toHaveLength(0);
    expect(panel().querySelector("dl")).toBe(null);
  });

  it("shows only the geometry hint and the card's band list for two bands", () => {
    show(storeOf(), [bandOf(A, "melody", "markers"), bandOf(A, "melody", "conversion_maps")]);
    expect(panel().querySelector(".hint")?.textContent).toBe(GEOMETRY_HINT);
    expect(panel().querySelector('[data-testid="band-list"]')).not.toBe(null);
    expect(panel().querySelector("form")).toBe(null);
    expect(panel().querySelector("dl")).toBe(null);
  });

  it("lists the store's refusal of a map given an ID the manifest holds", () => {
    const store = storeOf();
    show(store, [at(A)]);
    openTab("Manifest");
    chooseJson();
    const textarea = document.querySelector("textarea") as HTMLTextAreaElement;
    const edited = textarea.value.replace('"id": "#tempo"', '"id": "#phrase"');
    expect(edited).not.toBe(textarea.value);
    textarea.value = edited;
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    flushSync();
    const apply = [...document.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Apply",
    ) as HTMLButtonElement;
    apply.click();
    flushSync();

    const items = [...document.querySelectorAll('ul[aria-label="Problems"] li')];
    expect(items.map((item) => item.textContent?.replace(/\s+/g, " ").trim())).toEqual([
      "schema_violation 'phrase' is not unique in the manifest, first at #/timelines/0/conversion_maps/0/id at /timelines/0/children/0/id",
    ]);
    expect([...(items[0]?.querySelectorAll("code") ?? [])].map((item) => item.textContent)).toEqual(
      ["schema_violation", "/timelines/0/children/0/id"],
    );
    expect(textarea.value).toBe(edited);
    expect(store.journal).toHaveLength(2);
  });

  it("shows a region's name, then its start, end and length, and no geometry hint", () => {
    const section = regionNamed("flow/sonata_exposition", "B");
    show(storeOfFixtures("flow/sonata_exposition"), [at(A, { id: section })]);
    expect(panel().querySelector<HTMLInputElement>('input[name="name"]')?.value).toBe("B");
    expect(texts('[data-testid="region-rows"] dt')).toEqual(["Start", "End", "Length"]);
    expect(texts('[data-testid="region-rows"] dd')).toEqual(["12 ♩", "16 ♩", "4 ♩"]);
    expect(panel().querySelector(".hint")).toBe(null);
    expect([...panel().querySelectorAll("input")].map((input) => input.name)).toEqual(["name"]);
  });
});

describe("the Properties panel of a virtual timeline", () => {
  let app: ReturnType<typeof mount> | undefined;

  afterEach(() => {
    if (app !== undefined) unmount(app);
    app = undefined;
    document.body.innerHTML = "";
  });

  function deleteButtons(
    store: Store,
    selection: readonly Address[],
    ask: Ask | null = null,
  ): HTMLButtonElement[] {
    const asking = ((...args: Parameters<typeof Inspector>) => {
      if (ask !== null) provideAsk(ask);
      return Reflect.apply(Inspector, undefined, args);
    }) as typeof Inspector;
    app = mount(asking, {
      target: document.body,
      context: posting(),
      props: { live: liveStore(store), selection: selectionOf(selection) },
    });
    flushSync();
    return [...document.querySelectorAll("button")].filter(
      (button) => button.textContent?.trim() === "Delete virtual timeline",
    );
  }

  it("deletes the selected card's virtual timeline, its FlowMap kept", () => {
    const store = virtualCards();
    const [button, ...others] = deleteButtons(store, [
      at(A, { id: "allegro_default", part: ["card"] }),
    ]);
    if (button === undefined) throw new Error("no Delete virtual timeline");
    expect(others).toEqual([]);
    const journal = store.journal.length;
    button.click();
    flushSync();
    expect(store.journal.length).toBe(journal + 1);
    const last = store.journal.at(-1);
    expect(last !== undefined && "command" in last ? last.command : null).toEqual({
      type: "remove",
      targets: [at(A, { id: "allegro_default" })],
    });
    const { manifest, places } = blockOf(store.view, A);
    expect((manifest.virtual_timelines ?? []).map((item) => item.id)).toEqual([
      "allegro_by_hand",
      "allegro_single",
    ]);
    expect(Object.hasOwn(places, "allegro_default")).toBe(false);
    expect((manifest.flow_maps ?? []).map((item) => item.id)).toContain("default");
  });

  it("offers nothing on the root", () => {
    expect(deleteButtons(virtualCards(), [at(A, { id: "allegro" })])).toEqual([]);
  });

  it.each([
    [
      "Delete all",
      [{ type: "remove", targets: [at(A, { id: "allegro_default" }), at(A, { id: "again" })] }],
    ],
    ["Cancel", []],
  ] as const)(
    "asks the deletion dialog first, then stores what %s chooses",
    async (answer, stored) => {
      const store = virtualCards();
      expect(
        store.dispatch({
          type: "add",
          into: { block: A },
          virtual_timeline: { map: "single", timeline: "allegro_default" },
          ids: ["again"],
        }),
      ).toBeNull();
      const asked: string[] = [];
      let answerNow: (chosen: string | null) => void = () => {};
      const answered = new Promise<string | null>((resolve) => {
        answerNow = resolve;
      });
      const [button] = deleteButtons(
        store,
        [at(A, { id: "allegro_default", part: ["card"] })],
        (text) => {
          asked.push(text);
          return answered;
        },
      );
      if (button === undefined) throw new Error("no Delete virtual timeline");
      const journal = store.journal.length;
      button.click();
      flushSync();
      expect([asked, store.journal.length]).toEqual([
        [
          "Deleting virtual timeline 'Allegro, default' also deletes what is made from it: virtual timeline 'again'. Delete all, or hide its card instead?",
        ],
        journal,
      ]);
      answerNow(answer);
      // The answer reaches the store through the dialog's and the button's awaits.
      for (let tick = 0; tick < 10; tick += 1) await Promise.resolve();
      expect(
        store.journal.slice(journal).map((entry) => ("command" in entry ? entry.command : null)),
      ).toEqual(stored);
    },
  );
});
