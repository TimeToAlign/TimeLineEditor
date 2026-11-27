/**
 * The band list of a selected timeline: which selection lists bands, its
 * rows in the band order, the `style`s a press of a row's own box or of its
 * tree's box journals, the mixed tree, the hint of a box showing nothing
 * now, which never disables it, and a virtual timeline's switch "From the
 * sources"; the expected values are derived in `README.md` ("The band
 * list").
 */

import { liveStore, resolveSelection, selectionOf } from "@timetoalign/tilie-arranger";
import type { Address, ElementAddress, Store } from "@timetoalign/tilie-core";
import { fontMetrics } from "@timetoalign/timetoshare";
import { flushSync, mount, unmount } from "svelte";
import { afterEach, describe, expect, it } from "vitest";
import type { BandRow } from "../src/inspector/display.ts";
import { bandCommands, bandList, controlCommand } from "../src/inspector/display.ts";
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

/** The rows of the selection as `[label, hint]`; `null` without a list. */
const hintsOf = (store: Store, ...elements: ElementAddress[]) =>
  bandList(store.view, subjectsOf(store, ...elements))?.map((row) => [
    row.control.label,
    row.control.hint,
  ]) ?? null;

/** The row of `facet` in the band list of the timeline `timeline`. */
function rowOf(store: Store, timeline: string, facet: string): BandRow {
  const row = bandList(store.view, subjectsOf(store, { id: timeline }))?.find(
    (item: BandRow) => item.facet === facet,
  );
  if (row === undefined) throw new Error(`no band ${facet} of ${timeline}`);
  return row;
}

/** The own box (`[pressed, mixed]`) and the tree's (`null` without one) of `facet` of `timeline`. */
function boxesOf(store: Store, timeline: string, facet: string) {
  const { control, tree } = rowOf(store, timeline, facet);
  return {
    own: [control.pressed, control.mixed],
    tree: tree === null ? null : [tree.pressed, tree.mixed],
  };
}

/** Press the box of `reach` of `facet` of `timeline`: the commands it sends, each of which the store must accept. */
function press(store: Store, timeline: string, facet: string, reach: "own" | "tree" = "own") {
  const row = rowOf(store, timeline, facet);
  const control = reach === "own" ? row.control : row.tree;
  const block = store.view.blocks[A];
  if (control === null || block === undefined) throw new Error(`no ${reach} box of ${facet}`);
  const commands = bandCommands(store.view, block, control);
  for (const command of commands) expect(store.dispatch(command)).toBeNull();
  return commands;
}

/** A `style` of block `A` writing `display` in the rule `select`. */
const style = (select: object, display: string | null) => ({
  type: "style",
  select,
  set: { display },
  blocks: [A],
});

/** The full IRI of the class of an atomic section, which every manifest expands to itself. */
const ATOMIC = "https://timetoalign.github.io/timetoshare/ns#AtomicSection";

/** `unknown_length_child` with `movement`'s region `region_1` made an atomic section, as Op. 106's movements hold theirs. */
function atomicMovement(): Store {
  const store = storeOf("unknown_length_child");
  const made = store.dispatch({
    type: "set",
    changes: [{ target: { block: A, id: "region_1" }, values: { statements: { type: [ATOMIC] } } }],
  });
  expect(made).toBeNull();
  return store;
}

const card = (id: string): ElementAddress => ({ id, part: ["card"] });

/** The `style` of the band `facet` of `score`'s own `display`. */
const bandStyle = (facet: string, display: string | null) => ({
  type: "style",
  select: { element: "band", addresses: [{ id: "score", facet }] },
  set: { display },
  blocks: [A],
});

/** Change the own checkbox of `facet` of `score`: the one command it journals, which the store must accept. */
function change(store: Store, facet: string) {
  const [command, ...others] = press(store, "score", facet);
  expect(others).toEqual([]);
  return command;
}

const ALL_SHOWN = [
  ["Children", true],
  ["Markers", true],
  ["Conversion maps", true],
  ["Flow control", true],
  ["Regions", true],
];

/**
 * The rows of a child of `score` in `styled_score_flow_inner` holding nothing: every band
 * displayed, each absent but its flow control band, which its root's lays out.
 */
const EMPTY_CHILD = [
  ["Children", false],
  ["Markers", false],
  ["Conversion maps", false],
  ["Flow control", true],
  ["Regions", false],
];

describe("the selections listing bands", () => {
  it("are a timeline's card, its line or one of its bands, a child's and a virtual timeline's alike", () => {
    const store = storeOf("styled_score_flow_inner");
    expect(rowsOf(store, card("score"))).toEqual(ALL_SHOWN);
    expect(rowsOf(store, { id: "score" })).toEqual(ALL_SHOWN);
    expect(rowsOf(store, { id: "score", facet: "regions" })).toEqual(ALL_SHOWN);
    expect(rowsOf(store, card("score"), { id: "score" })).toEqual(ALL_SHOWN);
    expect(rowsOf(store, { id: "b" })).toEqual(EMPTY_CHILD);
    // A virtual timeline has the five bands of every timeline (drawing.md section 8.10).
    const virtual = storeOf("flow/virtual_cards");
    // In the default band order, every one displayed and empty, so absent.
    const bands = ["Children", "Conversion maps", "Markers", "Regions", "Flow control"].map(
      (band) => [band, false],
    );
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
    // Each holds its named timestamps alone; a child's flow control band is its root's.
    expect(rowsOf(store, card("recording"))).toEqual([
      ["Children", false],
      ["Conversion maps", false],
      ["Markers", true],
      ["Regions", false],
      ["Flow control", false],
    ]);
    expect(rowsOf(store, card("second-half"))).toEqual([
      ["Children", false],
      ["Conversion maps", false],
      ["Markers", true],
      ["Regions", false],
      ["Flow control", true],
    ]);
  });
});

describe("a change", () => {
  it("writes the band's own rule, and removes it where the cascade then displays the band", () => {
    const store = storeOf("styled_score_flow_inner");
    const rules = store.view.blocks[A]?.manifest.graphical?.rules ?? [];
    expect(change(store, "regions")).toEqual(bandStyle("regions", "none"));
    expect(rowsOf(store, card("score"))).toEqual([
      ["Children", true],
      ["Markers", true],
      ["Conversion maps", true],
      ["Flow control", true],
      ["Regions", false],
    ]);
    expect(change(store, "regions")).toEqual(bandStyle("regions", null));
    expect(store.view.blocks[A]?.manifest.graphical?.rules ?? []).toEqual(rules);
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

describe("showing a band", () => {
  it("shows its regions where none is displayed, and hiding it drops that rule", () => {
    const store = storeOf("flow/sonata_exposition");
    const regions = () => rowOf(store, "score", "regions").control;
    expect([regions().pressed, regions().inert, regions().hint]).toEqual([
      false,
      null,
      "None of the regions it holds is displayed.",
    ]);
    const shown = style({ element: "region", within: "score" }, "inline");
    expect(press(store, "score", "regions")).toEqual([shown]);
    expect([regions().pressed, regions().hint]).toEqual([true, null]);
    expect(press(store, "score", "regions")).toEqual([
      bandStyle("regions", "none"),
      style({ element: "region", within: "score" }, null),
    ]);
    expect(store.view.blocks[A]?.manifest.graphical?.rules).toEqual([
      {
        select: { element: "band", addresses: [{ id: "score", facet: "regions" }] },
        set: { display: "none" },
      },
    ]);
  });
});

describe("the tree's box", () => {
  const TREE = { element: "band", facet: "regions", within: "score" };
  const OWN = { element: "band", addresses: [{ id: "score", facet: "regions" }] };

  it("is offered where the timeline has descendants", () => {
    const store = storeOf("unknown_length_child");
    expect(
      bandList(store.view, subjectsOf(store, { id: "score" }))?.map((row) => row.tree !== null),
    ).toEqual([true, true, true, true, true]);
    expect(
      bandList(store.view, subjectsOf(store, { id: "movement" }))?.map((row) => row.tree),
    ).toEqual([null, null, null, null, null]);
    const regions = rowOf(store, "score", "regions");
    expect([regions.control.pressed, regions.control.hint]).toEqual([
      false,
      "Timeline 'score' holds no regions; its descendants hold some.",
    ]);
    expect([regions.tree?.pressed, regions.tree?.mixed, regions.tree?.hint]).toEqual([
      false,
      true,
      null,
    ]);
  });

  it("shows an empty band explicitly, its own box writing the band's rule", () => {
    const store = storeOf("unknown_length_child");
    expect(press(store, "score", "regions")).toEqual([style(OWN, "inline")]);
    expect(boxesOf(store, "score", "regions")).toEqual({ own: [true, false], tree: [true, false] });
    expect(press(store, "score", "regions")).toEqual([style(OWN, "none")]);
    expect(boxesOf(store, "score", "regions")).toEqual({
      own: [false, false],
      tree: [false, true],
    });
    expect(press(store, "score", "regions")).toEqual([style(OWN, "inline")]);
    expect(store.view.blocks[A]?.manifest.graphical?.rules).toEqual([
      { select: OWN, set: { display: "inline" } },
    ]);
  });

  it("writes the rule within the timeline, mixed while a band's own rule outranks it", () => {
    const store = storeOf("unknown_length_child");
    expect(press(store, "score", "regions", "tree")).toEqual([style(TREE, "inline")]);
    expect(boxesOf(store, "score", "regions")).toEqual({ own: [true, false], tree: [true, false] });
    expect(press(store, "score", "regions", "tree")).toEqual([style(TREE, "none")]);
    expect(boxesOf(store, "score", "regions")).toEqual({
      own: [false, false],
      tree: [false, false],
    });
    expect(boxesOf(store, "movement", "regions").own).toEqual([false, false]);
    expect(press(store, "score", "regions")).toEqual([style(OWN, "inline")]);
    expect(boxesOf(store, "score", "regions")).toEqual({ own: [true, false], tree: [false, true] });
    expect(press(store, "score", "regions", "tree")).toEqual([style(TREE, null)]);
    expect(boxesOf(store, "score", "regions")).toEqual({ own: [true, false], tree: [true, false] });
    expect(boxesOf(store, "movement", "regions").own).toEqual([true, false]);
  });

  it("shows the descendants' atomic sections with one press, and hides them with the next", () => {
    const store = atomicMovement();
    const movement = rowOf(store, "movement", "regions").control;
    expect([movement.pressed, movement.hint]).toEqual([
      false,
      "None of the regions it holds is displayed.",
    ]);
    expect(boxesOf(store, "score", "regions").tree).toEqual([false, false]);
    const regions = { element: "region", within: "score" };
    expect(press(store, "score", "regions", "tree")).toEqual([
      style(TREE, "inline"),
      style(regions, "inline"),
    ]);
    expect(boxesOf(store, "score", "regions").tree).toEqual([true, false]);
    expect(boxesOf(store, "movement", "regions").own).toEqual([true, false]);
    expect(press(store, "score", "regions", "tree")).toEqual([
      style(TREE, "none"),
      style(regions, null),
    ]);
    expect(boxesOf(store, "score", "regions").tree).toEqual([false, false]);
  });

  it("leaves a child's own box showing its own regions alone", () => {
    const store = atomicMovement();
    expect(press(store, "movement", "regions")).toEqual([
      style({ element: "region", within: "movement" }, "inline"),
    ]);
    expect(boxesOf(store, "movement", "regions").own).toEqual([true, false]);
  });

  it("hints where neither the timeline nor a descendant holds anything of the band", () => {
    const flow = rowOf(storeOf("unknown_length_child"), "score", "flow_control");
    expect([flow.control.hint, flow.tree?.hint]).toEqual([
      "Timeline 'score' holds no flow-control elements.",
      "Neither timeline 'score' nor its descendants hold flow-control elements.",
    ]);
    expect([flow.control.inert, flow.tree?.inert]).toEqual([null, null]);
  });
});

describe("a hint", () => {
  it("is every band of a timeline whose line is hidden", () => {
    const hidden = "Timeline 'a' is hidden.";
    expect(hintsOf(storeOf("styled_score_flow_inner"), { id: "a" })).toEqual([
      ["Children", hidden],
      ["Markers", hidden],
      ["Conversion maps", hidden],
      ["Flow control", hidden],
      ["Regions", hidden],
    ]);
    expect(rowsOf(storeOf("styled_score_flow_inner"), { id: "a" })).toEqual(EMPTY_CHILD);
  });

  it("is a virtual timeline's band holding nothing", () => {
    const store = storeOf("flow/virtual_cards");
    // Its own bands hold nothing but its named timestamps; its chunks' windows are no part of
    // them, and no box is disabled for it.
    const holds = (what: string) => `Virtual timeline 'Allegro, practice' holds no ${what}.`;
    expect(hintsOf(store, { id: "allegro_by_hand" })).toEqual([
      ["Children", holds("children")],
      ["Conversion maps", holds("conversion maps")],
      ["Markers", holds("named timestamps")],
      ["Regions", holds("regions")],
      ["Flow control", holds("flow-control elements")],
    ]);
    expect(rowOf(store, "allegro_by_hand", "markers").tree).toBeNull();
  });

  it("is none of a timeline holding and showing all of its facets", () => {
    expect(
      hintsOf(storeOf("styled_score_flow_inner"), card("score"))?.map(([, hint]) => hint),
    ).toEqual([null, null, null, null, null]);
  });
});

/** `flow/virtual_cards` with `allegro_default` placed at (0, 200) and the region `motto` [100, 200] in `allegro`. */
function windowed(): Store {
  const store = storeOf("flow/virtual_cards");
  for (const command of [
    {
      type: "set",
      changes: [
        { target: { block: A, id: "allegro_default" }, values: { place: { x: 0, y: 200 } } },
      ],
    },
    {
      type: "add",
      into: { block: A, id: "allegro" },
      region: { id: "motto", name: "Motto", start: [100, 1], end: [200, 1] },
    },
  ]) {
    expect(store.dispatch(command)).toBeNull();
  }
  return store;
}

/** The rule of the switch "From the sources" of `facet` of `allegro_default`. */
const SOURCES = (facet: string) => ({ facet, inside: "chunk", within: "allegro_default" });

describe("the switch From the sources", () => {
  /** Press the switch of `facet` of `timeline`: the one command it sends, which the store must accept. */
  function pressSources(store: Store, timeline: string, facet: string) {
    const control = rowOf(store, timeline, facet).sources;
    const block = store.view.blocks[A];
    if (control === null || block === undefined) throw new Error(`no switch of ${facet}`);
    const command = controlCommand(store.view, block, control);
    expect(store.dispatch(command)).toBeNull();
    return command;
  }
  const switches = (store: Store, timeline: string) =>
    bandList(store.view, subjectsOf(store, { id: timeline }))?.map((row) =>
      row.sources === null
        ? null
        : [row.sources.label, row.sources.pressed, row.sources.mixed, row.sources.hint],
    );

  it("is none for a timeline, and every band's for a virtual timeline placed or not", () => {
    expect(switches(windowed(), "allegro")).toEqual([null, null, null, null, null]);
    expect(switches(storeOf("flow/virtual_cards"), "allegro_by_hand")).toEqual([
      ["Children", false, false, "The chunks' sources hold no children."],
      ["Conversion maps", false, false, "The chunks' sources hold no conversion maps."],
      ["Markers", false, false, "The chunks' sources hold no named timestamps."],
      ["Regions", false, false, "The chunks' sources hold no regions."],
      ["Flow control", false, false, null],
    ]);
  });

  it("is one per band of a placed virtual timeline, off, hinted where the sources hold nothing", () => {
    expect(switches(windowed(), "allegro_default")).toEqual([
      ["Children", false, false, "The chunks' sources hold no children."],
      ["Conversion maps", false, false, "The chunks' sources hold no conversion maps."],
      ["Markers", false, false, "The chunks' sources hold no named timestamps."],
      ["Regions", false, false, null],
      ["Flow control", false, false, null],
    ]);
  });

  it("writes and removes its one rule, the same for every chunk", () => {
    const store = windowed();
    const rules = store.view.blocks[A]?.manifest.graphical?.rules ?? [];
    expect(pressSources(store, "allegro_default", "regions")).toEqual(
      style(SOURCES("regions"), "inline"),
    );
    expect(rowOf(store, "allegro_default", "regions").sources?.pressed).toBe(true);
    expect(pressSources(store, "allegro_default", "regions")).toEqual(
      style(SOURCES("regions"), null),
    );
    expect(rowOf(store, "allegro_default", "regions").sources?.pressed).toBe(false);
    expect(store.view.blocks[A]?.manifest.graphical?.rules ?? []).toEqual(rules);
  });

  it("is hinted, never disabled, while its virtual timeline's band is hidden", () => {
    const store = windowed();
    const own = { element: "band", addresses: [{ id: "allegro_default", facet: "regions" }] };
    // Empty, the band is absent: the first press shows it explicitly, the second hides it.
    expect(press(store, "allegro_default", "regions")).toEqual([style(own, "inline")]);
    expect(press(store, "allegro_default", "regions")).toEqual([style(own, "none")]);
    const { sources } = rowOf(store, "allegro_default", "regions");
    expect([sources?.hint, sources?.inert]).toEqual([
      "The regions band of virtual timeline 'Allegro, default' is hidden.",
      null,
    ]);
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
  const boxes = () => [
    ...(table()?.querySelectorAll<HTMLInputElement>('input[name="band-visible"]') ?? []),
  ];
  const trees = () => [
    ...(table()?.querySelectorAll<HTMLInputElement>('input[name="band-visible-tree"]') ?? []),
  ];

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
    expect(
      trees().map((box) => [
        box.getAttribute("aria-label"),
        box.checked,
        box.indeterminate,
        box.disabled,
      ]),
    ).toEqual([
      // The bands of `a` and `b`, empty, are absent; their flow control bands are `score`'s.
      ["Children with its descendants visible", false, true, false],
      ["Markers with its descendants visible", false, true, false],
      ["Conversion maps with its descendants visible", false, true, false],
      ["Flow control with its descendants visible", true, false, false],
      ["Regions with its descendants visible", false, true, false],
    ]);
    const rules = store.view.blocks[A]?.manifest.graphical?.rules ?? [];
    const entries = store.listed.length;
    boxes()[4]?.click();
    flushSync();
    expect(store.listed.length).toBe(entries + 1);
    expect(store.listed.at(-1)?.entry).toMatchObject({ command: bandStyle("regions", "none") });
    expect(boxes()[4]?.checked).toBe(false);
    expect([trees()[4]?.checked, trees()[4]?.indeterminate]).toEqual([false, false]);
    trees()[4]?.click();
    flushSync();
    expect(store.listed.length).toBe(entries + 2);
    expect(store.listed.at(-1)?.changes).toBe(2);
    expect(store.view.blocks[A]?.manifest.graphical?.rules).toEqual([
      ...rules,
      {
        select: { element: "band", facet: "regions", within: "score" },
        set: { display: "inline" },
      },
    ]);
    expect([trees()[4]?.checked, trees()[4]?.indeterminate, boxes()[4]?.checked]).toEqual([
      true,
      false,
      true,
    ]);
    expect(informed).toEqual([]);
  });

  it("never disables a row, its hint beside its word", () => {
    show(storeOf("unknown_length_child"), { id: "score" });
    const hint = "Timeline 'score' holds no regions; its descendants hold some.";
    const regions = boxes().find((box) => box.value === "regions");
    expect(regions?.disabled).toBe(false);
    expect(regions?.title).toBe(hint);
    const described = document.getElementById(regions?.getAttribute("aria-describedby") ?? "");
    expect(described?.textContent).toBe(hint);
    expect(described?.closest("tr")?.contains(regions ?? null)).toBe(true);
    expect([...boxes(), ...trees()].some((box) => box.disabled)).toBe(false);
  });

  it("journals the commands of one press as one entry", () => {
    const store = atomicMovement();
    show(store, { id: "score" });
    const tree = () => trees().find((box) => box.value === "regions");
    const entries = store.listed.length;
    tree()?.click();
    flushSync();
    expect(store.listed.length).toBe(entries + 1);
    expect(tree()?.checked).toBe(true);
    tree()?.click();
    flushSync();
    expect(store.listed.length).toBe(entries + 2);
    expect(tree()?.checked).toBe(false);
    expect(informed).toEqual([]);
  });

  it.each([
    ["timeline editor of the timeline", { block: A, id: "score" }],
    ["bundle editor of its block", { block: A }],
  ] as const)("journals one press as one step inside the %s", (_, editor) => {
    const store = atomicMovement();
    expect(store.open(editor)).toBeNull();
    show(store, { id: "score" });
    const tree = () => trees().find((box) => box.value === "regions");
    tree()?.click();
    flushSync();
    expect(tree()?.checked).toBe(true);
    const entries = store.listed.length;
    const before = store.view;
    tree()?.click();
    flushSync();
    expect(store.listed.length).toBe(entries + 1);
    expect(store.listed.at(-1)?.changes).toBe(2);
    expect(tree()?.checked).toBe(false);
    store.undo();
    flushSync();
    expect(store.view).toBe(before);
    expect(tree()?.checked).toBe(true);
    expect(informed).toEqual([]);
  });

  it("shows a virtual timeline's switches From the sources, a change journaling its rule", () => {
    const store = windowed();
    show(store, { id: "allegro_default" });
    expect([...(table()?.tHead?.querySelectorAll("th") ?? [])].map((th) => th.textContent)).toEqual(
      ["Band", "Visible", "From the sources"],
    );
    const sources = () => [
      ...(table()?.querySelectorAll<HTMLInputElement>('input[name="band-sources"]') ?? []),
    ];
    expect(
      sources().map((box) => [box.getAttribute("aria-label"), box.checked, box.disabled]),
    ).toEqual([
      ["Children from the sources visible", false, false],
      ["Conversion maps from the sources visible", false, false],
      ["Markers from the sources visible", false, false],
      ["Regions from the sources visible", false, false],
      ["Flow control from the sources visible", false, false],
    ]);
    const entries = store.listed.length;
    sources()[3]?.click();
    flushSync();
    expect(store.listed.length).toBe(entries + 1);
    expect(store.listed.at(-1)?.entry).toMatchObject({
      command: style(SOURCES("regions"), "inline"),
    });
    expect(sources()[3]?.checked).toBe(true);
    expect(informed).toEqual([]);
  });

  it("shows none for a region", () => {
    show(storeOf("styled_score_flow_inner"), { id: "intro" });
    expect(table()).toBeNull();
  });
});
