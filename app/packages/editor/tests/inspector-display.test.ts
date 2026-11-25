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

/** The one toggle of the first group of `groups`, pressed or not. */
function only(groups: readonly ToggleGroup[] | null) {
  const toggle = groups?.[0]?.toggles[0];
  if (toggle === undefined) throw new Error("no toggle");
  return toggle;
}

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

describe("the toggles offered", () => {
  it("are a flow control band's arcs and atomic sections, and a regions band's atomic sections", () => {
    const sonata = shownStore("flow/sonata_exposition");
    expect(shape(bandOf(sonata, "flow_control"))).toEqual([
      ["Display", [["jump", "Arcs", true]]],
      ["Regions", [["atomic_sections", "Atomic sections", false]]],
    ]);
    expect(shape(bandOf(sonata, "regions"))).toEqual([
      ["Regions", [["atomic_sections", "Atomic sections", false]]],
    ]);
    const sections = shownStore("flow/sections");
    expect(shape(bandOf(sections, "flow_control"))).toEqual([
      ["Display", [["jump", "Arcs", true]]],
    ]);
    expect(shape(bandOf(sections, "regions"))).toEqual([]);
    expect(shape(bandOf(sections, "markers"))).toEqual([]);
    expect(bandToggles(sections.view, subjectsOf(sections, { id: "jump_1" }))).toBeNull();
  });

  it("are an element's own: a jump's arcs, a flow line's line, none for a jump target", () => {
    const sections = shownStore("flow/sections");
    expect(shape(elementOf(sections, "jump_1"))).toEqual([["Display", [["jump", "Arcs", true]]]]);
    expect(shape(elementOf(sections, "break_1"))).toEqual([["Display", [["break", "Line", true]]]]);
    expect(shape(elementOf(sections, "section_break_1"))).toEqual([
      ["Display", [["section_break", "Line", true]]],
    ]);
    expect(shape(elementOf(storeOf("flow/sonata_exposition"), "jump_target_1"))).toEqual([]);
  });
});

describe("a press", () => {
  it("writes the band's rule or the element's, or removes it where the rest gives what is asked", () => {
    const store = shownStore("flow/sections");
    const band = { element: "jump", within: "score" };
    const ownOf = (id: string) => ({ element: "jump", addresses: [{ id }] });
    const pressed = () => [
      only(bandOf(store, "flow_control")).pressed,
      only(elementOf(store, "jump_1")).pressed,
      only(elementOf(store, "jump_2")).pressed,
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
    expect(only(elementOf(store, "break_1")).pressed).toBe(false);
    expect(press(store, elementOf(store, "break_1"), "break")).toEqual(style(own, null));
    expect(only(elementOf(store, "break_1")).pressed).toBe(true);
  });

  it("writes and removes the rule showing the atomic sections", () => {
    const store = storeOf("flow/sonata_exposition");
    const atomic = { element: "region", class: "tts:AtomicSection" };
    expect(press(store, bandOf(store, "regions"), "atomic_sections")).toEqual(
      style(atomic, "inline"),
    );
    expect(only(bandOf(store, "regions")).pressed).toBe(true);
    expect(bandOf(store, "flow_control")?.[1]?.toggles[0]?.pressed).toBe(true);
    expect(press(store, bandOf(store, "flow_control"), "atomic_sections")).toEqual(
      style(atomic, null),
    );
    expect(store.view.blocks[A]?.manifest.graphical?.rules ?? []).toEqual([]);
    expect(only(bandOf(store, "regions")).pressed).toBe(false);
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
    expect(toggles()?.querySelector(".key")?.textContent).toBe("Display");
    const group = toggles()?.querySelector('[role="group"]');
    expect(document.getElementById(group?.getAttribute("aria-labelledby") ?? "")?.textContent).toBe(
      "Display",
    );
    expect(buttons().map((button) => [button.textContent, button.ariaPressed])).toEqual([
      ["Arcs", "true"],
    ]);
    const entries = store.listed.length;
    buttons()[0]?.click();
    flushSync();
    expect(store.listed.length).toBe(entries + 1);
    expect(store.listed.at(-1)?.entry).toMatchObject({
      command: style({ element: "jump", within: "score" }, "none"),
    });
    expect(buttons().map((button) => button.ariaPressed)).toEqual(["false"]);
    expect(informed).toEqual([]);
  });

  it("shows an element's toggles", () => {
    show(shownStore("flow/sections"), { id: "jump_1" });
    expect(buttons().map((button) => [button.textContent, button.ariaPressed])).toEqual([
      ["Arcs", "true"],
    ]);
  });
});
