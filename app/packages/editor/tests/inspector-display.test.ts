/**
 * The display toggles of a selected band or flow-control element: what
 * the cascade shows and the one `style` a press journals; the expected
 * values are derived in `README.md` ("Display toggles").
 */

import { liveStore, resolveSelection, selectionOf } from "@timetoalign/tilie-arranger";
import type { Address, ElementAddress, Store } from "@timetoalign/tilie-core";
import { fontMetrics } from "@timetoalign/timetoshare";
import { flushSync, mount, unmount } from "svelte";
import { afterEach, describe, expect, it } from "vitest";
import type { ToggleGroup } from "../src/inspector/display.ts";
import { bandToggles, elementToggles, toggleCommand } from "../src/inspector/display.ts";
import { flowOf } from "../src/inspector/flow.ts";
import PropertiesPanel from "../src/inspector/PropertiesPanel.svelte";
import { PropertyDrafts } from "../src/inspector/propertyDrafts.svelte.ts";
import { selectedBlock } from "../src/inspector/selection.ts";
import { blockId, posting, providing, storeOf } from "./support.ts";

const A = blockId(0);

/** The rule of the manifest showing every arc, whatever the defaults say. */
const ARCS_SHOWN = {
  type: "style",
  select: { element: "jump" },
  set: { display: "inline" },
  blocks: [A],
} as const;

/** A store of `fixture` in block `A`, its manifest given `ARCS_SHOWN`. */
function shownStore(fixture: string): Store {
  const store = storeOf(fixture);
  if (store.dispatch(ARCS_SHOWN) !== null) throw new Error("the arcs are not shown");
  return store;
}

const subjectsOf = (store: Store, ...elements: ElementAddress[]) =>
  resolveSelection(
    store.view,
    selectionOf(elements.map((element): Address => ({ block: A, ...element }))),
    null,
    fontMetrics,
  );

/** The groups as `[key, [word, label, pressed][]]`. */
const shape = (groups: readonly ToggleGroup[] | null) =>
  groups?.map((group) => [
    group.key,
    group.toggles.map((toggle) => [toggle.word, toggle.label, toggle.pressed]),
  ]) ?? null;

/** The toggles of the band of `facet` of `score`. */
const bandOf = (store: Store, facet: "flow_control" | "regions" | "markers") =>
  bandToggles(store.view, subjectsOf(store, { id: "score", facet }));

/** The toggles of the flow-control element `id`. */
function elementOf(store: Store, id: string): ToggleGroup[] {
  const flow = flowOf(subjectsOf(store, { id }));
  if (flow === null) throw new Error(`no flow-control element ${id}`);
  return elementToggles(store.view, flow);
}

/** Whether the toggle `word` of `groups` is pressed. */
function isPressed(groups: readonly ToggleGroup[] | null, word: string): boolean {
  const toggle = groups?.flatMap((group) => group.toggles).find((item) => item.word === word);
  if (toggle === undefined) throw new Error(`no toggle ${word}`);
  return toggle.pressed;
}

/** The words of the Labels group of `groups` that are pressed. */
const labelsOf = (groups: readonly ToggleGroup[] | null) =>
  groups
    ?.find((group) => group.key === "Labels")
    ?.toggles.filter((toggle) => toggle.pressed)
    .map((toggle) => toggle.word) ?? null;

/** Press `toggle`'s button in `store`: the command it journals, which the store must accept. */
function press(store: Store, groups: readonly ToggleGroup[] | null, word: string) {
  const toggle = groups?.flatMap((group) => group.toggles).find((item) => item.word === word);
  const block = store.view.blocks[A];
  if (toggle === undefined || block === undefined) throw new Error(`no toggle ${word}`);
  const command = toggleCommand(store.view, block, toggle);
  expect(store.dispatch(command)).toBeNull();
  return command;
}

const style = (select: object, display: string | null) => ({
  type: "style",
  select,
  set: { display },
  blocks: [A],
});

const labelStyle = (select: object, value: string | null) => ({
  type: "style",
  select,
  set: { "label-display": value },
  blocks: [A],
});

/** The Labels group: Name, ID and Label, the first `pressed` of them pressed. */
const LABELS = (...pressed: string[]) => [
  "Labels",
  [
    ["name", "Name", pressed.includes("name")],
    ["id", "ID", pressed.includes("id")],
    ["label", "Label", pressed.includes("label")],
  ],
];

describe("the toggles offered", () => {
  it("are a flow control band's drawing, labels and atomic sections, a regions band's atomic sections", () => {
    const sonata = shownStore("flow/sonata_exposition");
    expect(shape(bandOf(sonata, "flow_control"))).toEqual([
      [
        "Display",
        [
          ["jump", "Arcs", true],
          ["symbol", "Symbols", true],
          ["fork", "Forks", true],
        ],
      ],
      LABELS("name", "label"),
      ["Regions", [["atomic_sections", "Atomic sections", false]]],
    ]);
    expect(shape(bandOf(sonata, "regions"))).toEqual([
      ["Regions", [["atomic_sections", "Atomic sections", false]]],
    ]);
    const sections = shownStore("flow/sections");
    expect(shape(bandOf(sections, "flow_control"))).toEqual([
      [
        "Display",
        [
          ["jump", "Arcs", true],
          ["symbol", "Symbols", true],
        ],
      ],
      LABELS("name", "label"),
    ]);
    expect(shape(bandOf(sections, "regions"))).toEqual([]);
    expect(shape(bandOf(sections, "markers"))).toEqual([]);
    expect(bandToggles(sections.view, subjectsOf(sections, { id: "jump_1" }))).toBeNull();
  });

  it("are an element's own drawing where it is drawn, and its labels", () => {
    const sections = shownStore("flow/sections");
    expect(shape(elementOf(sections, "jump_2"))).toEqual([
      [
        "Display",
        [
          ["jump", "Arcs", true],
          ["symbol", "Symbol", true],
        ],
      ],
      LABELS("name", "label"),
    ]);
    expect(shape(elementOf(sections, "break_1"))).toEqual([
      [
        "Display",
        [
          ["break", "Line", true],
          ["symbol", "Symbol", true],
        ],
      ],
      LABELS("name", "label"),
    ]);
    const sonata = shownStore("flow/sonata_exposition");
    expect(shape(elementOf(sonata, "jump_1"))).toEqual([
      [
        "Display",
        [
          ["jump", "Arcs", true],
          ["fork", "Fork", true],
        ],
      ],
      LABELS("name", "label"),
    ]);
    expect(shape(elementOf(sonata, "jump_target_1"))).toEqual([]);
  });
});

describe("a press", () => {
  it("writes the band's rule or the element's, or removes it where the rest gives what is asked", () => {
    const store = shownStore("flow/sections");
    const band = { element: "jump", within: "score" };
    const ownOf = (id: string) => ({ element: "jump", addresses: [{ id }] });
    const pressed = () => [
      isPressed(bandOf(store, "flow_control"), "jump"),
      isPressed(elementOf(store, "jump_1"), "jump"),
      isPressed(elementOf(store, "jump_2"), "jump"),
    ];

    expect(press(store, bandOf(store, "flow_control"), "jump")).toEqual(style(band, "none"));
    expect(pressed()).toEqual([false, false, false]);

    expect(press(store, elementOf(store, "jump_1"), "jump")).toEqual(
      style(ownOf("jump_1"), "inline"),
    );
    // The band reads no rule naming an address.
    expect(pressed()).toEqual([false, true, false]);

    expect(press(store, bandOf(store, "flow_control"), "jump")).toEqual(style(band, null));
    const selectors = () =>
      (store.view.blocks[A]?.manifest.graphical?.rules ?? []).map((rule) => rule.select);
    expect(selectors()).toEqual([{ element: "jump" }, ownOf("jump_1")]);
    expect(pressed()).toEqual([true, true, true]);

    expect(press(store, elementOf(store, "jump_1"), "jump")).toEqual(
      style(ownOf("jump_1"), "none"),
    );
    expect(pressed()).toEqual([true, false, true]);
  });

  it("hides a flow line by its own rule, and removes the rule to show it again", () => {
    const store = shownStore("flow/sections");
    const own = { element: "break", addresses: [{ id: "break_1" }] };
    expect(press(store, elementOf(store, "break_1"), "break")).toEqual(style(own, "none"));
    expect(isPressed(elementOf(store, "break_1"), "break")).toBe(false);
    expect(press(store, elementOf(store, "break_1"), "break")).toEqual(style(own, null));
    expect(isPressed(elementOf(store, "break_1"), "break")).toBe(true);
  });

  it("hides the symbols of a band's tree", () => {
    const store = shownStore("flow/sections");
    expect(press(store, bandOf(store, "flow_control"), "symbol")).toEqual(
      style({ element: "symbol", within: "score" }, "none"),
    );
    expect(isPressed(bandOf(store, "flow_control"), "symbol")).toBe(false);
    expect(isPressed(elementOf(store, "jump_2"), "symbol")).toBe(false);
  });

  it("composes the labels of a band's elements and of one element", () => {
    const store = storeOf("flow/sections");
    const band = { within: "score" };
    const own = { element: "jump", addresses: [{ id: "jump_1" }] };
    const labels = () => [
      labelsOf(bandOf(store, "flow_control")),
      labelsOf(elementOf(store, "jump_1")),
    ];
    expect(labels()).toEqual([
      ["name", "label"],
      ["name", "label"],
    ]);

    expect(press(store, bandOf(store, "flow_control"), "name")).toEqual(labelStyle(band, "label"));
    expect(labels()).toEqual([["label"], ["label"]]);

    expect(press(store, elementOf(store, "jump_1"), "name")).toEqual(labelStyle(own, "name label"));
    expect(labels()).toEqual([["label"], ["name", "label"]]);

    expect(press(store, bandOf(store, "flow_control"), "name")).toEqual(labelStyle(band, null));
    expect(labels()).toEqual([
      ["name", "label"],
      ["name", "label"],
    ]);

    expect(press(store, elementOf(store, "jump_1"), "name")).toEqual(labelStyle(own, "label"));
    expect(labels()).toEqual([["name", "label"], ["label"]]);

    expect(press(store, elementOf(store, "jump_1"), "label")).toEqual(labelStyle(own, "none"));
    expect(labels()).toEqual([["name", "label"], []]);
  });

  it("writes and removes the rule showing the atomic sections", () => {
    const store = storeOf("flow/sonata_exposition");
    const atomic = { element: "region", class: "tts:AtomicSection" };
    expect(press(store, bandOf(store, "regions"), "atomic_sections")).toEqual(
      style(atomic, "inline"),
    );
    expect(isPressed(bandOf(store, "regions"), "atomic_sections")).toBe(true);
    expect(isPressed(bandOf(store, "flow_control"), "atomic_sections")).toBe(true);
    expect(press(store, bandOf(store, "flow_control"), "atomic_sections")).toEqual(
      style(atomic, null),
    );
    expect(store.view.blocks[A]?.manifest.graphical?.rules ?? []).toEqual([]);
    expect(isPressed(bandOf(store, "regions"), "atomic_sections")).toBe(false);
  });
});

describe("the toggles in the Properties tab", () => {
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

  const toggles = () => document.querySelector('[data-testid="display-toggles"]');
  const buttons = () => [...(toggles()?.querySelectorAll("button") ?? [])];

  it("shows a band's toggles below its rows, and journals one style for a press", () => {
    const store = shownStore("flow/sections");
    show(store, { id: "score", facet: "flow_control" });
    expect(document.querySelector("dl")?.compareDocumentPosition(toggles() as Node)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    const groups = [...(toggles()?.querySelectorAll('[role="group"]') ?? [])];
    expect(
      groups.map((group) => [
        document.getElementById(group.getAttribute("aria-labelledby") ?? "")?.textContent,
        [...group.querySelectorAll("button")].map((button) => [
          button.textContent,
          button.ariaPressed,
        ]),
      ]),
    ).toEqual([
      [
        "Display",
        [
          ["Arcs", "true"],
          ["Symbols", "true"],
        ],
      ],
      [
        "Labels",
        [
          ["Name", "true"],
          ["ID", "false"],
          ["Label", "true"],
        ],
      ],
    ]);
    const entries = store.listed.length;
    buttons()[0]?.click();
    flushSync();
    expect(store.listed.length).toBe(entries + 1);
    expect(store.listed.at(-1)?.entry).toMatchObject({
      command: style({ element: "jump", within: "score" }, "none"),
    });
    expect(buttons()[0]?.ariaPressed).toBe("false");
    expect(informed).toEqual([]);
  });

  it("shows an element's toggles", () => {
    show(shownStore("flow/sections"), { id: "jump_2" });
    expect([...(toggles()?.querySelectorAll(".key") ?? [])].map((key) => key.textContent)).toEqual([
      "Display",
      "Labels",
    ]);
    expect(buttons().map((button) => button.textContent)).toEqual([
      "Arcs",
      "Symbol",
      "Name",
      "ID",
      "Label",
    ]);
  });
});
