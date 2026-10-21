/// <reference types="node" />
/**
 * What the editor names beside the inspector's heading, for every kind of
 * element; the expected values are derived in `README.md` ("Words").
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import type { Selection } from "@timetoalign/tilie-arranger";
import { liveStore, NOTHING_SELECTED, selectionOf } from "@timetoalign/tilie-arranger";
import type { Address, ElementAddress, Store, View } from "@timetoalign/tilie-core";
import { addressKey, createStore, isLoadError, readWorkspace } from "@timetoalign/tilie-core";
import { flushSync, mount, unmount } from "svelte";
import { afterEach, describe, expect, it } from "vitest";
import InspectorDrawer from "../src/InspectorDrawer.svelte";
import { inspectedSubject } from "../src/inspector/words.ts";
import { holder } from "./holder.svelte.ts";

/** The end-to-end workspaces, the generator's output. */
const E2E_FIXTURES = path.join(import.meta.dirname, "..", "..", "..", "e2e", "fixtures");

function workspaceText(name: string): string {
  return readFileSync(path.join(E2E_FIXTURES, `${name}.tle.json`), "utf8");
}

function storeOf(name: string): Store {
  const read = readWorkspace(workspaceText(name));
  if (isLoadError(read)) throw new Error(`${name}.tle.json is refused`);
  return createStore(read);
}

function viewOf(name: string): View {
  return storeOf(name).view;
}

/** `name`'s view with block `block`'s manifest given the id `id` by one `set`. */
function withManifestId(name: string, block: string, id: string): View {
  const store = storeOf(name);
  const manifest = { ...(store.view.blocks[block]?.manifest ?? {}), id };
  const error = store.dispatch({
    type: "set",
    changes: [{ target: { block }, values: { manifest } }],
  });
  if (error !== null) throw new Error(error.message);
  return store.view;
}

const named = (words: string, name: string) => ({ words, name, id: null });
const unnamed = (words: string, id: string) => ({ words, name: null, id });
const bare = (words: string) => ({ words, name: null, id: null });

/** The address of `element` in block `block`; the block itself without an element. */
function at(block: string, element: ElementAddress = {}): Address {
  return { block, ...element };
}

type Subject = ReturnType<typeof inspectedSubject>;

/** `cases` with each address's key first, the name a test case goes by. */
function keyed(cases: readonly (readonly [Address, Subject])[]): [string, Address, Subject][] {
  return cases.map(([address, expected]) => [addressKey(address), address, expected]);
}

/** A selection of `addresses`. */
function selected(...addresses: Address[]): Selection {
  return selectionOf(addresses);
}

describe("inspectedSubject", () => {
  const bundles = viewOf("bundles");
  const groups = viewOf("groups");
  const small = viewOf("small");
  const MIXED = "bmixed0000";
  const UNGROUPED = "bungroup00";

  it.each(
    keyed([
      [at(MIXED), named("Bundle", "Mixed")],
      [at(MIXED, { part: ["name"] }), named("Title of bundle", "Mixed")],
      [at(MIXED, { id: "group_1" }), named("Group", "Performance")],
      [at(MIXED, { id: "group_1", part: ["name"] }), named("Title of group", "Performance")],
      [at(MIXED, { id: "score" }), named("Timeline", "Score")],
      [at(MIXED, { id: "score", part: ["card"] }), named("Card of timeline", "Score")],
      [at(MIXED, { id: "score", part: ["start"] }), named("Start of timeline", "Score")],
      [at(MIXED, { id: "score", part: ["end"] }), named("End of timeline", "Score")],
      [at(MIXED, { id: "score", part: ["name"] }), named("Name of timeline", "Score")],
      [
        at(MIXED, { id: "score", part: ["end", "label"] }),
        named("Label of end of timeline", "Score"),
      ],
      [at(MIXED, { id: "excerpt" }), named("Timeline", "Excerpt")],
      [at(UNGROUPED, { id: "pages" }), named("Timeline", "Pages")],
      [at(UNGROUPED, { id: "page_1" }), named("Timeline", "Page 1")],
      [at(UNGROUPED, { id: "page_2", part: ["label"] }), named("Label of timeline", "Page 2")],
    ]),
  )("names %s in a named bundle", (_key, address, subject) => {
    expect(inspectedSubject(bundles, selected(address))).toEqual(subject);
  });

  it.each(
    keyed([
      [at("gchild0000"), bare("Anonymous bundle")],
      [at("gchild0000", { id: "group_1" }), named("Group", "Second half")],
      [at("gchild0000", { id: "second-half" }), named("Timeline", "Second half")],
    ]),
  )("names %s in an anonymous bundle", (_key, address, subject) => {
    expect(inspectedSubject(groups, selected(address))).toEqual(subject);
  });

  it.each(
    keyed([
      [at("gchild0000"), unnamed("Bundle", "takes")],
      [at("gchild0000", { part: ["name"] }), unnamed("Title of bundle", "takes")],
      [at("gchild0000", { id: "takes" }), null],
    ]),
  )(
    "names %s in a bundle with an id and no name by its id, the id itself nothing",
    (_key, address, subject) => {
      const view = withManifestId("groups", "gchild0000", "takes");
      expect(inspectedSubject(view, selected(address))).toEqual(subject);
    },
  );

  it("names a bundle with an id and a name by its name", () => {
    const view = withManifestId("bundles", MIXED, "mixed");
    expect(inspectedSubject(view, selected(at(MIXED)))).toEqual(named("Bundle", "Mixed"));
  });

  it.each(
    keyed([
      [at("map0000000", { id: "tempo" }), named("Conversion map", "Tempo")],
      [at("map0000000", { id: "ticks" }), named("Conversion map", "Ticks")],
      [at("flow000000", { id: "flow_marker_1" }), named("Flow marker", "fine")],
      [
        at("flow000000", { id: "flow_marker_1", part: ["label"] }),
        named("Label of flow marker", "fine"),
      ],
      [at("flow000000", { id: "jump_from_1" }), unnamed("Jump origin", "jump_from_1")],
      [at("flow000000", { id: "jump_to_1" }), named("Jump target", "repeat-start")],
      [at("styled0000", { id: "intro" }), named("Region", "intro")],
      [at("styled0000", { id: "intro", part: ["label"] }), named("Label of region", "intro")],
      [at("styled0000", { id: "da-capo" }), unnamed("Jump origin", "da-capo")],
      [at("styled0000", { id: "a" }), unnamed("Timeline", "a")],
    ]),
  )("names %s, an element of a timeline", (_key, address, subject) => {
    expect(inspectedSubject(small, selected(address))).toEqual(subject);
  });

  it("names a measure map by its kind and its name or id", () => {
    const store = storeOf("small");
    const error = store.dispatch({
      type: "add",
      into: at("map0000000"),
      measure_map: { id: "bars", rows: [{ count: 1, qstamp: [0, 1] }] },
    });
    if (error !== null) throw new Error(error.message);
    expect(inspectedSubject(store.view, selected(at("map0000000", { id: "bars" })))).toEqual(
      unnamed("Measure map", "bars"),
    );
  });

  it.each(
    keyed([
      [
        at("map0000000", { id: "melody", facet: "conversion_maps" }),
        named("Conversion maps band of timeline", "Melody"),
      ],
      [
        at("map0000000", { id: "phrase", facet: "conversion_maps" }),
        named("Conversion maps band of timeline", "Phrase"),
      ],
      [
        at("styled0000", { id: "score", facet: "markers" }),
        named("Markers band of timeline", "Score"),
      ],
      [
        at("styled0000", { id: "score", facet: "regions" }),
        named("Regions band of timeline", "Score"),
      ],
      [
        at("flow000000", { id: "flow:quarters", facet: "flow_control" }),
        named("Flow control band of timeline", "Flow control"),
      ],
      [at("styled0000", { id: "a", facet: "children" }), unnamed("Children band of timeline", "a")],
    ]),
  )("names %s, a band of a timeline", (_key, address, subject) => {
    expect(inspectedSubject(small, selected(address))).toEqual(subject);
  });

  it("names a band of a segment without a line of its own", () => {
    expect(
      inspectedSubject(bundles, selected(at(UNGROUPED, { id: "page_1", facet: "regions" }))),
    ).toEqual(named("Regions band of timeline", "Page 1"));
  });

  it("counts several selected elements", () => {
    const score = at(MIXED, { id: "score" });
    expect(inspectedSubject(bundles, selected(at(MIXED), score))).toEqual(bare("2 selected"));
    expect(
      inspectedSubject(bundles, selected(at(MIXED), score, at(MIXED, { id: "group_1" }))),
    ).toEqual(bare("3 selected"));
    expect(
      inspectedSubject(bundles, selected(at(MIXED, { id: "score", facet: "markers" }), score)),
    ).toEqual(bare("2 selected"));
  });

  it.each([
    ["no selection", []],
    ["an address naming nothing", [at(MIXED, { id: "nothing" })]],
    ["a part its element does not have", [at(MIXED, { id: "region_1", part: ["start"] })]],
    ["a part of a card", [at(MIXED, { id: "score", part: ["card", "name"] })]],
    ["a block that does not exist", [at("0000000009")]],
    ["a band with a part", [at(MIXED, { id: "score", facet: "regions", part: ["label"] })]],
    ["the card of a timeline drawn in none", [at("styled0000", { id: "a", part: ["card"] })]],
    ["a band of a group", [at(MIXED, { id: "group_1", facet: "regions" })]],
    ["a band of a jump", [at(MIXED, { id: "jump_from_1", facet: "flow_control" })]],
  ] as const)("gives null for %s", (_case, addresses) => {
    expect(inspectedSubject(bundles, selected(...addresses))).toBe(null);
  });
});

describe("the subject beside the inspector's heading", () => {
  let app: ReturnType<typeof mount> | undefined;

  afterEach(() => {
    if (app !== undefined) unmount(app);
    app = undefined;
    document.body.innerHTML = "";
  });

  /** Mount the drawer on `name`'s workspace; the selection it gets back can be changed. */
  function drawer(name: string, store = storeOf(name)): { value: Selection } {
    if (app !== undefined) unmount(app);
    const selection = holder<Selection>(NOTHING_SELECTED);
    app = mount(InspectorDrawer, {
      target: document.body,
      props: {
        live: liveStore(store),
        get selection() {
          return selection.value;
        },
        placement: null,
        storageKey: null,
      },
    });
    flushSync();
    return selection;
  }

  /** The subject's text and its `code` (the id shown for an unnamed element), after selecting `addresses`. */
  function shown(selection: { value: Selection }, addresses: Address[]) {
    selection.value = selectionOf(addresses);
    flushSync();
    const subject = document.querySelector('[data-testid="inspector-subject"]');
    return [subject?.textContent?.trim(), subject?.querySelector("code")?.textContent ?? null];
  }

  it("names a bundle, a group, a timeline and its card, and nothing without a selection", () => {
    let selection = drawer("bundles");
    expect(shown(selection, [{ block: "bmixed0000" }])).toEqual(["Bundle Mixed", null]);
    const aside = document.querySelector('[data-testid="inspector"]');
    const heading = document.querySelector("h2");
    const subject = document.querySelector('[data-testid="inspector-subject"]');
    expect(subject?.parentElement).toBe(heading?.parentElement);
    expect(aside?.getAttribute("aria-describedby")).toBe(subject?.id);
    expect(heading?.textContent).toBe("Inspector");
    expect(shown(selection, [{ block: "bmixed0000", id: "group_1" }])).toEqual([
      "Group Performance",
      null,
    ]);
    expect(shown(selection, [{ block: "bmixed0000", id: "score" }])).toEqual([
      "Timeline Score",
      null,
    ]);
    expect(shown(selection, [{ block: "bmixed0000", id: "score", part: ["card"] }])).toEqual([
      "Card of timeline Score",
      null,
    ]);

    selection = drawer("groups");
    expect(shown(selection, [{ block: "gchild0000" }])).toEqual(["Anonymous bundle", null]);

    selection = drawer("small");
    expect(shown(selection, [{ block: "styled0000", id: "a" }])).toEqual(["Timeline a", "a"]);
    expect(shown(selection, [{ block: "styled0000", id: "score", facet: "flow_control" }])).toEqual(
      ["Flow control band of timeline Score", null],
    );
    expect(shown(selection, [{ block: "styled0000", id: "a", facet: "children" }])).toEqual([
      "Children band of timeline a",
      "a",
    ]);

    expect(shown(selection, [])).toEqual([undefined, null]);
    expect(
      document.querySelector('[data-testid="inspector"]')?.hasAttribute("aria-describedby"),
    ).toBe(false);
  });

  it("follows an applied manifest without a change of selection", () => {
    const selection = drawer("bundles");
    expect(shown(selection, [{ block: "bmixed0000", id: "score" }])).toEqual([
      "Timeline Score",
      null,
    ]);
    // The inspector is rendered only in an open drawer.
    document.querySelector<HTMLButtonElement>('button[aria-label="Open inspector"]')?.click();
    flushSync();
    const tabs = [...document.querySelectorAll<HTMLElement>('[role="tab"]')];
    tabs.find((tab) => tab.textContent === "Manifest")?.click();
    flushSync();
    const area = document.querySelector("textarea") as HTMLTextAreaElement;
    area.value = area.value.replace('"name": "Score"', '"name": "Scores"');
    area.dispatchEvent(new Event("input", { bubbles: true }));
    flushSync();
    const apply = [...document.querySelectorAll("button")].find(
      (item) => item.textContent?.trim() === "Apply",
    ) as HTMLButtonElement;
    apply.click();
    flushSync();
    expect(document.querySelector('[data-testid="inspector-subject"]')?.textContent?.trim()).toBe(
      "Timeline Scores",
    );
  });
});
