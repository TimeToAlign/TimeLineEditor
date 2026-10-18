/// <reference types="node" />
/**
 * What the inspector names beside its heading, for every kind of element;
 * the expected values are derived in `README.md` ("The inspector").
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import type { View } from "@timetoalign/tilie-core";
import { createStore, isLoadError, readWorkspace } from "@timetoalign/tilie-core";
import { flushSync, mount, unmount } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "../src/App.svelte";
import { inspectedSubject } from "../src/inspector/edit.ts";
import { stubEditor } from "./dom.ts";
import { flushAutosaves } from "./support.ts";

vi.mock("../src/autosave.ts", async (importOriginal) =>
  (await import("./support.ts")).recordAutosaves(await importOriginal()),
);

/** The end-to-end workspaces, the generator's output. */
const E2E_FIXTURES = path.join(import.meta.dirname, "..", "..", "..", "e2e", "fixtures");

function workspaceText(name: string): string {
  return readFileSync(path.join(E2E_FIXTURES, `${name}.tle.json`), "utf8");
}

function viewOf(name: string): View {
  const read = readWorkspace(workspaceText(name));
  if (isLoadError(read)) throw new Error(`${name}.tle.json is refused`);
  return read.view;
}

/** `name`'s view with block `block`'s manifest given the id `id` by one `set`. */
function withManifestId(name: string, block: string, id: string): View {
  const read = readWorkspace(workspaceText(name));
  if (isLoadError(read)) throw new Error(`${name}.tle.json is refused`);
  const store = createStore(read);
  const manifest = { ...(read.view.blocks[block]?.manifest ?? {}), id };
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
    ["gchild0000/name", bare("Title of anonymous bundle")],
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
    ["flow000000/flow:quarters/break_1", named("Break", "fine")],
    ["flow000000/flow:quarters/break_1/label", named("Label of break", "fine")],
    ["flow000000/flow:quarters/jump_1", unnamed("Jump", "jump_1")],
    ["flow000000/flow:quarters/marker_1", named("Marker", "repeat-start")],
    ["styled0000/score/intro", named("Region", "intro")],
    ["styled0000/score/intro/label", named("Label of region", "intro")],
    ["styled0000/score/da-capo", unnamed("Jump", "da-capo")],
    ["styled0000/a", unnamed("Timeline", "a")],
    ["styled0000/a/card", unnamed("Card of timeline", "a")],
  ])("names %s, an element of a timeline", (address, subject) => {
    expect(inspectedSubject(small, [address])).toEqual(subject);
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

  afterEach(async () => {
    if (app !== undefined) unmount(app);
    app = undefined;
    await flushAutosaves();
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
  });

  it("names a bundle, a group, a timeline and its card, and nothing without a selection", () => {
    window.history.replaceState({}, "", "/");
    stubEditor();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ name: "tilie-server", version: "0", timetoalign: "0" })),
    );
    app = mount(App, { target: document.body });
    flushSync();
    const hook = window.__tilie;
    if (hook === undefined) throw new Error("window.__tilie is not installed");
    const drawer = document.getElementById("inspector");
    const heading = document.getElementById("inspector-heading");
    const shown = (selection: string[]) => {
      hook.select(selection);
      flushSync();
      const subject = document.getElementById("inspector-subject");
      return [subject?.textContent, subject?.querySelector("code")?.textContent ?? null];
    };

    hook.load(workspaceText("bundles"));
    flushSync();
    expect(shown(["bmixed0000"])).toEqual(["Bundle Mixed", null]);
    const subject = document.getElementById("inspector-subject");
    expect(subject?.parentElement).toBe(heading?.parentElement);
    expect(drawer?.getAttribute("aria-describedby")).toBe("inspector-subject");
    expect(heading?.textContent).toBe("Inspector");
    expect(shown(["bmixed0000/group_1"])).toEqual(["Group Performance", null]);
    expect(shown(["bmixed0000/score"])).toEqual(["Timeline Score", null]);
    expect(shown(["bmixed0000/score/card"])).toEqual(["Card of timeline Score", null]);

    hook.load(workspaceText("groups"));
    flushSync();
    expect(shown(["gchild0000"])).toEqual(["Anonymous bundle", null]);

    hook.load(workspaceText("small"));
    flushSync();
    expect(shown(["styled0000/a"])).toEqual(["Timeline a", "a"]);
    expect(shown(["styled0000/score/flow_control_1"])).toEqual([
      "Flow control band of timeline Score",
      null,
    ]);
    expect(shown(["styled0000/a/children_1"])).toEqual(["Children band of timeline a", "a"]);

    expect(shown([])).toEqual([undefined, null]);
    expect(drawer?.hasAttribute("aria-describedby")).toBe(false);
  });

  it("follows an applied manifest without a change of selection", () => {
    window.history.replaceState({}, "", "/");
    stubEditor();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ name: "tilie-server", version: "0", timetoalign: "0" })),
    );
    app = mount(App, { target: document.body });
    flushSync();
    const hook = window.__tilie;
    if (hook === undefined) throw new Error("window.__tilie is not installed");
    hook.load(workspaceText("bundles"));
    flushSync();
    hook.select(["bmixed0000/score"]);
    flushSync();
    const subject = () => document.getElementById("inspector-subject")?.textContent;
    expect(subject()).toBe("Timeline Score");
    (document.getElementById("inspector-tab-manifest") as HTMLElement).click();
    flushSync();
    const area = document.querySelector("#inspector textarea") as HTMLTextAreaElement;
    area.value = area.value.replace('"name": "Score"', '"name": "Scores"');
    area.dispatchEvent(new Event("input", { bubbles: true }));
    flushSync();
    const apply = [...document.querySelectorAll("#inspector button")].find(
      (item) => item.textContent?.trim() === "Apply",
    ) as HTMLButtonElement;
    apply.click();
    flushSync();
    expect(subject()).toBe("Timeline Scores");
  });
});
