/// <reference types="node" />
/**
 * What the editor names beside the inspector's heading, for every kind of
 * element; the expected values are derived in `README.md` ("Words").
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { liveStore } from "@timetoalign/tilie-arranger";
import type { Store, View } from "@timetoalign/tilie-core";
import { createStore, isLoadError, readWorkspace } from "@timetoalign/tilie-core";
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
    changes: [{ target: block, values: { manifest } }],
  });
  if (error !== null) throw new Error(error.message);
  return store.view;
}

const named = (words: string, name: string) => ({ words, name, id: null });
const unnamed = (words: string, id: string) => ({ words, name: null, id });
const bare = (words: string) => ({ words, name: null, id: null });

describe("inspectedSubject", () => {
  const bundles = viewOf("bundles");
  const groups = viewOf("groups");
  const small = viewOf("small");

  it.each([
    ["bmixed0000", named("Bundle", "Mixed")],
    ["bmixed0000/name", named("Title of bundle", "Mixed")],
    ["bmixed0000/group_1", named("Group", "Performance")],
    ["bmixed0000/group_1/name", named("Title of group", "Performance")],
    ["bmixed0000/score", named("Timeline", "Score")],
    ["bmixed0000/score/card", named("Card of timeline", "Score")],
    ["bmixed0000/score/start", named("Start of timeline", "Score")],
    ["bmixed0000/score/end", named("End of timeline", "Score")],
    ["bmixed0000/score/name", named("Name of timeline", "Score")],
    ["bmixed0000/score/end/label", named("Label of end of timeline", "Score")],
    ["bmixed0000/excerpt", named("Timeline", "Excerpt")],
    ["bungroup00/pages", named("Timeline", "Pages")],
    ["bungroup00/page_1", named("Timeline", "Page 1")],
    ["bungroup00/page_2/label", named("Label of timeline", "Page 2")],
  ])("names %s in a named bundle", (address, subject) => {
    expect(inspectedSubject(bundles, [address])).toEqual(subject);
  });

  it.each([
    ["gchild0000", bare("Anonymous bundle")],
    ["gchild0000/group_1", named("Group", "Second half")],
    ["gchild0000/second-half", named("Timeline", "Second half")],
  ])("names %s in an anonymous bundle", (address, subject) => {
    expect(inspectedSubject(groups, [address])).toEqual(subject);
  });

  it.each([
    ["gchild0000", unnamed("Bundle", "takes")],
    ["gchild0000/takes", unnamed("Bundle", "takes")],
    ["gchild0000/name", unnamed("Title of bundle", "takes")],
  ])("names %s in a bundle with an id and no name by its id", (address, subject) => {
    expect(inspectedSubject(withManifestId("groups", "gchild0000", "takes"), [address])).toEqual(
      subject,
    );
  });

  it("names a bundle with an id and a name by its name", () => {
    const view = withManifestId("bundles", "bmixed0000", "mixed");
    expect(inspectedSubject(view, ["bmixed0000"])).toEqual(named("Bundle", "Mixed"));
  });

  it.each([
    ["map0000000/melody/tempo", named("Conversion map", "Tempo")],
    ["map0000000/melody/ticks", named("Conversion map", "Ticks")],
    ["flow000000/flow:quarters/break_1", named("Flow marker", "fine")],
    ["flow000000/flow:quarters/break_1/label", named("Label of flow marker", "fine")],
    ["flow000000/flow:quarters/jump_1", unnamed("Jump origin", "jump_1")],
    ["flow000000/flow:quarters/marker_1", named("Jump target", "repeat-start")],
    ["styled0000/score/intro", named("Region", "intro")],
    ["styled0000/score/intro/label", named("Label of region", "intro")],
    ["styled0000/score/da-capo", unnamed("Jump origin", "da-capo")],
    ["styled0000/a", unnamed("Timeline", "a")],
    ["styled0000/a/card", unnamed("Card of timeline", "a")],
  ])("names %s, an element of a timeline", (address, subject) => {
    expect(inspectedSubject(small, [address])).toEqual(subject);
  });

  it("names a measure map by its kind and its name or id", () => {
    const store = storeOf("small");
    const error = store.dispatch({
      type: "add",
      into: "map0000000",
      measure_map: { id: "bars", rows: [{ count: 1, qstamp: [0, 1] }] },
    });
    if (error !== null) throw new Error(error.message);
    expect(inspectedSubject(store.view, ["map0000000/bars"])).toEqual(
      unnamed("Measure map", "bars"),
    );
  });

  it.each([
    ["map0000000/melody/conversion_maps_1", named("Conversion maps band of timeline", "Melody")],
    ["map0000000/phrase/conversion_maps_1", named("Conversion maps band of timeline", "Phrase")],
    ["styled0000/score/markers_1", named("Markers band of timeline", "Score")],
    ["styled0000/score/regions_1", named("Regions band of timeline", "Score")],
    [
      "flow000000/flow:quarters/flow_control_1",
      named("Flow control band of timeline", "Flow control"),
    ],
    ["styled0000/a/children_1", unnamed("Children band of timeline", "a")],
  ])("names %s, a band of a timeline", (address, subject) => {
    expect(inspectedSubject(small, [address])).toEqual(subject);
  });

  it("names a band of a segment without a line of its own", () => {
    expect(inspectedSubject(bundles, ["bungroup00/page_1/regions_1"])).toEqual(
      named("Regions band of timeline", "Page 1"),
    );
  });

  it("counts several selected elements", () => {
    expect(inspectedSubject(bundles, ["bmixed0000", "bmixed0000/score"])).toEqual(
      bare("2 selected"),
    );
    expect(
      inspectedSubject(bundles, ["bmixed0000", "bmixed0000/score", "bmixed0000/group_1"]),
    ).toEqual(bare("3 selected"));
    expect(inspectedSubject(bundles, ["bmixed0000/score/markers_1", "bmixed0000/score"])).toEqual(
      bare("2 selected"),
    );
  });

  it.each([
    ["no selection", []],
    ["an address naming nothing", ["bmixed0000/nothing"]],
    ["a part no element has", ["bmixed0000/score/x"]],
    ["an entry that does not exist", ["bmixed0000/score/region_x"]],
    ["a block that does not exist", ["0000000009"]],
    ["a band numbered 2", ["bmixed0000/score/regions_2"]],
    ["a part of a band", ["bmixed0000/score/regions_1/label"]],
    ["a band after a part", ["bmixed0000/score/card/regions_1"]],
    ["a band of a group", ["bmixed0000/group_1/regions_1"]],
    ["a band of a jump", ["bmixed0000/score/jump_1/flow_control_1"]],
  ])("gives null for %s", (_case, selection) => {
    expect(inspectedSubject(bundles, selection)).toBe(null);
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
  function drawer(name: string, store = storeOf(name)): { value: ReadonlySet<string> } {
    if (app !== undefined) unmount(app);
    const selection = holder<ReadonlySet<string>>(new Set());
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
  function shown(selection: { value: ReadonlySet<string> }, addresses: string[]) {
    selection.value = new Set(addresses);
    flushSync();
    const subject = document.querySelector('[data-testid="inspector-subject"]');
    return [subject?.textContent?.trim(), subject?.querySelector("code")?.textContent ?? null];
  }

  it("names a bundle, a group, a timeline and its card, and nothing without a selection", () => {
    let selection = drawer("bundles");
    expect(shown(selection, ["bmixed0000"])).toEqual(["Bundle Mixed", null]);
    const aside = document.querySelector('[data-testid="inspector"]');
    const heading = document.querySelector("h2");
    const subject = document.querySelector('[data-testid="inspector-subject"]');
    expect(subject?.parentElement).toBe(heading?.parentElement);
    expect(aside?.getAttribute("aria-describedby")).toBe(subject?.id);
    expect(heading?.textContent).toBe("Inspector");
    expect(shown(selection, ["bmixed0000/group_1"])).toEqual(["Group Performance", null]);
    expect(shown(selection, ["bmixed0000/score"])).toEqual(["Timeline Score", null]);
    expect(shown(selection, ["bmixed0000/score/card"])).toEqual(["Card of timeline Score", null]);

    selection = drawer("groups");
    expect(shown(selection, ["gchild0000"])).toEqual(["Anonymous bundle", null]);

    selection = drawer("small");
    expect(shown(selection, ["styled0000/a"])).toEqual(["Timeline a", "a"]);
    expect(shown(selection, ["styled0000/score/flow_control_1"])).toEqual([
      "Flow control band of timeline Score",
      null,
    ]);
    expect(shown(selection, ["styled0000/a/children_1"])).toEqual([
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
    expect(shown(selection, ["bmixed0000/score"])).toEqual(["Timeline Score", null]);
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
