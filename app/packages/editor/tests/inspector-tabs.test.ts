/** The inspector's Editor and Journal tabs; the expected values are derived in `README.md` ("The Editor and Journal tabs"). */

import { liveStore } from "@timetoalign/tilie-arranger";
import type { Entry, OpenEditor, Store, View } from "@timetoalign/tilie-core";
import { flushSync, mount, unmount } from "svelte";
import { afterEach, describe, expect, it } from "vitest";
import Inspector from "../src/inspector/Inspector.svelte";
import type { JournalSource } from "../src/inspector/journal.ts";
import { holder } from "./holder.svelte.ts";
import { MIXED, mixedStore } from "./mixed.ts";

const { A } = MIXED;
const HINT = "Select a block to inspect its manifest.";

/**
 * A store whose levels (`editing`, `entries`, `undone`, `sessions`) the test sets, announced
 * through `subscribe` as the store announces its own changes; everything else is `inner`'s.
 */
function staged(inner: Store): { store: Store; stage(levels: Partial<JournalSource>): void } {
  let levels: Partial<JournalSource> = {};
  const listeners = new Set<(view: View) => void>();
  const store = Object.create(inner, {
    editing: { get: () => levels.editing ?? inner.editing },
    entries: { get: () => levels.entries ?? inner.entries },
    undone: { get: () => levels.undone ?? inner.undone },
    sessions: { get: () => levels.sessions ?? inner.sessions },
    subscribe: {
      value: (listener: (view: View) => void) => {
        listeners.add(listener);
        const off = inner.subscribe(listener);
        return () => {
          listeners.delete(listener);
          off();
        };
      },
    },
  }) as Store;
  return {
    store,
    stage(next) {
      levels = next;
      for (const listener of [...listeners]) listener(inner.view);
      flushSync();
    },
  };
}

function editor(target: string, kind: OpenEditor["kind"], session = "s1"): OpenEditor {
  return { session, target, kind, earlier: null };
}

const GROUP = editor(`${A}/group_1`, "group", "s1");
const TIMELINE = editor(`${A}/score`, "timeline", "s2");

let app: ReturnType<typeof mount> | undefined;

afterEach(() => {
  if (app !== undefined) unmount(app);
  app = undefined;
  document.body.innerHTML = "";
});

function show(store: Store, selection: string[] = [A]): void {
  const selected = holder<ReadonlySet<string>>(new Set(selection));
  app = mount(Inspector, {
    target: document.body,
    props: {
      live: liveStore(store),
      get selection() {
        return selected.value;
      },
    },
  });
  flushSync();
}

/** Every tab as [id, text, aria-selected, tabindex]. */
function tabs(): unknown[] {
  return [...document.querySelectorAll<HTMLElement>('[role="tab"]')].map((tab) => [
    tab.id,
    tab.textContent?.trim(),
    tab.getAttribute("aria-selected"),
    tab.getAttribute("tabindex"),
  ]);
}

/** Every panel as [id, hidden]. */
function panels(): unknown[] {
  return [...document.querySelectorAll<HTMLElement>('[role="tabpanel"]')].map((panel) => [
    panel.id,
    panel.hidden,
  ]);
}

function tab(name: string): unknown[] {
  return [`inspector-tab-${name.toLowerCase()}`, name];
}

const on = (name: string) => [...tab(name), "true", "0"];
const off = (name: string) => [...tab(name), "false", "-1"];

function click(name: string): void {
  (document.getElementById(`inspector-tab-${name}`) as HTMLElement).click();
  flushSync();
}

function editorText(): string | undefined {
  return document.getElementById("inspector-panel-editor")?.textContent?.trim();
}

describe("the tab set", () => {
  it("shows Properties, Manifest and Journal without an editor", () => {
    show(mixedStore());
    expect(tabs()).toEqual([on("Properties"), off("Manifest"), off("Journal")]);
    expect(document.getElementById("inspector-tab-editor")).toBe(null);
    expect(document.getElementById("inspector-panel-editor")).toBe(null);
    expect(
      [...document.querySelectorAll('[role="tabpanel"]')].map((panel) => [
        panel.id,
        panel.getAttribute("aria-labelledby"),
      ]),
    ).toEqual([
      ["inspector-panel-properties", "inspector-tab-properties"],
      ["inspector-panel-manifest", "inspector-tab-manifest"],
      ["inspector-panel-journal", "inspector-tab-journal"],
    ]);
  });

  it("keeps the tab list with nothing selected", () => {
    show(mixedStore(), []);
    expect(tabs()).toEqual([on("Properties"), off("Manifest"), off("Journal")]);
    expect(
      ["properties", "manifest"].map((name) =>
        document.getElementById(`inspector-panel-${name}`)?.textContent?.trim(),
      ),
    ).toEqual([HINT, HINT]);
    click("journal");
    expect(panels()).toEqual([
      ["inspector-panel-properties", true],
      ["inspector-panel-manifest", true],
      ["inspector-panel-journal", false],
    ]);
    expect(document.querySelectorAll("#inspector-panel-journal li")).toHaveLength(3);
  });

  it("selects Editor on every opening and Properties when the last editor closes", () => {
    const { store, stage } = staged(mixedStore());
    show(store);
    stage({ editing: [GROUP] });
    expect(tabs()).toEqual([on("Editor"), off("Properties"), off("Manifest"), off("Journal")]);
    expect(panels()).toEqual([
      ["inspector-panel-editor", false],
      ["inspector-panel-properties", true],
      ["inspector-panel-manifest", true],
      ["inspector-panel-journal", true],
    ]);
    expect(document.getElementById("inspector-panel-editor")?.getAttribute("aria-labelledby")).toBe(
      "inspector-tab-editor",
    );
    expect(editorText()).toBe("Group editor: Performance");

    click("journal");
    stage({ editing: [GROUP, TIMELINE] });
    expect(tabs()).toEqual([on("Editor"), off("Properties"), off("Manifest"), off("Journal")]);
    expect(editorText()).toBe("Timeline editor: Score");

    stage({ editing: [GROUP] });
    expect(tabs()).toEqual([on("Editor"), off("Properties"), off("Manifest"), off("Journal")]);
    expect(editorText()).toBe("Group editor: Performance");

    stage({ editing: [] });
    expect(tabs()).toEqual([on("Properties"), off("Manifest"), off("Journal")]);
    expect(document.getElementById("inspector-panel-editor")).toBe(null);
    expect(document.getElementById("inspector-panel-properties")?.hidden).toBe(false);
  });

  it("keeps another tab when the last editor closes", () => {
    const { store, stage } = staged(mixedStore());
    show(store);
    stage({ editing: [GROUP] });
    click("manifest");
    stage({ editing: [] });
    expect(tabs()).toEqual([off("Properties"), on("Manifest"), off("Journal")]);
  });

  it("selects Editor when mounted while an editor is open", () => {
    const { store, stage } = staged(mixedStore());
    stage({ editing: [editor(A, "bundle")] });
    show(store);
    expect(tabs()).toEqual([on("Editor"), off("Properties"), off("Manifest"), off("Journal")]);
    expect(editorText()).toBe("Bundle editor: Mixed");
  });

  it("places the editing bar above the tabs while an editor is open", () => {
    const { store, stage } = staged(mixedStore());
    show(store);
    expect(document.querySelector('[role="group"][aria-label="Editing"]')).toBe(null);
    stage({ editing: [GROUP] });
    const bar = document.querySelector('[role="group"][aria-label="Editing"]') as Node;
    const list = document.querySelector('[role="tablist"]') as Node;
    expect(Boolean(bar.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(
      true,
    );
  });
});

describe("with the store's own editors", () => {
  it("follows open, Done and the folded session", () => {
    const store = mixedStore();
    show(store);
    expect(store.open(`${A}/group_1`)).toBe(null);
    flushSync();
    expect(tabs()).toEqual([on("Editor"), off("Properties"), off("Manifest"), off("Journal")]);
    expect(editorText()).toBe("Group editor: Performance");
    store.dispatch({ type: "set", changes: [{ target: `${A}/score`, values: { name: "S" } }] });
    store.done();
    flushSync();
    expect(tabs()).toEqual([on("Properties"), off("Manifest"), off("Journal")]);
    click("journal");
    expect(
      [...document.querySelectorAll("#inspector-panel-journal .text")].map(
        (item) => item.textContent,
      ),
    ).toEqual([
      "Added block 0000000000 to workspace",
      "Added block 0000000001 to workspace",
      "Added block 0000000002 to workspace",
      "Edited group Performance (1 change)",
    ]);
  });
});

describe("the block fields in an editor", () => {
  /** Every property field as [name, disabled], in form order. */
  function fields(): [string, boolean][] {
    return [
      ...document.querySelectorAll<HTMLInputElement>('form[aria-label="Block properties"] input'),
    ]
      .filter((input) => input.type === "number")
      .map((input) => [input.name, input.disabled]);
  }

  const ALL = ["x", "y", "scale", "length", "spacing", "width", "height"];
  const enabled = ALL.map((name) => [name, false]);
  const blockFieldsOff = ALL.map((name) => [
    name,
    name === "scale" || name === "length" || name === "spacing",
  ]);

  it("are refused by the store inside a group editor", () => {
    const store = mixedStore();
    expect(store.open(`${A}/group_1`)).toBe(null);
    expect(
      store.dispatch({ type: "set", changes: [{ target: A, values: { scale: 2 } }] })?.code,
    ).toBe("side_effect");
  });

  it("disables scale, length and spacing in a group or timeline editor only", () => {
    const { store, stage } = staged(mixedStore());
    show(store);
    expect(fields()).toEqual(enabled);
    stage({ editing: [editor(A, "bundle")] });
    expect(fields()).toEqual(enabled);
    stage({ editing: [GROUP] });
    expect(fields()).toEqual(blockFieldsOff);
    stage({ editing: [GROUP, TIMELINE] });
    expect(fields()).toEqual(blockFieldsOff);
    stage({ editing: [] });
    expect(fields()).toEqual(enabled);
  });
});

describe("the keys", () => {
  function steps(from: string, keys: string[]): string[] {
    (document.getElementById(`inspector-tab-${from}`) as HTMLElement).focus();
    return keys.map((key) => {
      (document.activeElement as HTMLElement).dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
      );
      flushSync();
      const selected = document.querySelector('[role="tab"][aria-selected="true"]');
      expect(document.activeElement).toBe(selected);
      return selected?.textContent?.trim() ?? "";
    });
  }

  it("move over the tabs present, wrapping", () => {
    const { store, stage } = staged(mixedStore());
    show(store);
    expect(steps("properties", ["ArrowLeft", "ArrowRight", "End", "Home"])).toEqual([
      "Journal",
      "Properties",
      "Journal",
      "Properties",
    ]);
    stage({ editing: [GROUP] });
    expect(
      steps("editor", [
        "ArrowRight",
        "ArrowRight",
        "ArrowRight",
        "ArrowRight",
        "ArrowLeft",
        "Home",
        "End",
      ]),
    ).toEqual(["Properties", "Manifest", "Journal", "Editor", "Journal", "Editor", "Journal"]);
  });
});

describe("the Journal panel", () => {
  /** Each item as [time, author, text, data-undone, data-earlier, its hidden word]. */
  function items(): unknown[] {
    return [...document.querySelectorAll("#inspector-panel-journal li")].map((item) => [
      item.querySelector(".time")?.textContent,
      item.querySelector(".author")?.textContent,
      item.querySelector(".text")?.textContent,
      item.hasAttribute("data-undone"),
      item.hasAttribute("data-earlier"),
      item.querySelector(".visually-hidden")?.textContent ?? null,
    ]);
  }

  const T = "08:05:09";
  const G = "Gerhardt";
  const ADDS = [
    [T, G, "Added block 0000000000 to workspace", false, false, null],
    [T, G, "Added block 0000000001 to workspace", false, false, null],
    [T, G, "Added block 0000000002 to workspace", false, false, null],
  ];

  it("lists the rows, the undone one grey with a hidden word, and follows the store", () => {
    const store = mixedStore({ clock: () => new Date("2026-10-17T08:05:09.123Z") });
    show(store);
    click("journal");
    expect(document.querySelector("#inspector-panel-journal ol")?.getAttribute("aria-label")).toBe(
      "Journal",
    );
    store.dispatch({ type: "set", changes: [{ target: A, values: { x: 25 } }] });
    store.undo();
    flushSync();
    expect(items()).toEqual([...ADDS, [T, G, `Set x of ${A}`, true, false, "undone"]]);
    store.dispatch({ type: "set", changes: [{ target: A, values: { y: 7 } }] });
    flushSync();
    expect(items()).toEqual([...ADDS, [T, G, `Set y of ${A}`, false, false, null]]);
  });

  it("lists the earlier session first", () => {
    const inner = mixedStore({ clock: () => new Date("2026-10-17T08:05:09.123Z") });
    const { store, stage } = staged(inner);
    show(store);
    stage({ editing: [GROUP], entries: inner.journal, undone: [] });
    click("journal");
    const before = [...document.querySelectorAll("#inspector-panel-journal li")];
    expect(before).toHaveLength(3);
    const earlier: Entry = {
      command: { type: "set", changes: [{ target: GROUP.target, values: { order: null } }] },
      author: "Ada",
      time: "2026-10-17T07:00:01.000Z",
    };
    stage({
      editing: [{ ...GROUP, earlier: "s0" }],
      entries: inner.journal,
      undone: [],
      sessions: { s0: { target: GROUP.target, entries: [earlier] } },
    });
    expect(items()).toEqual([
      ["07:00:01", "Ada", `Set order of ${GROUP.target}`, false, true, null],
      ...ADDS,
    ]);
    const after = [...document.querySelectorAll("#inspector-panel-journal li")];
    expect(after.slice(1).map((item, index) => item === before[index])).toEqual([true, true, true]);
  });

  it("says when a level has no changes yet", () => {
    const { store, stage } = staged(mixedStore());
    show(store);
    stage({ editing: [GROUP], entries: [], undone: [] });
    click("journal");
    const panel = document.getElementById("inspector-panel-journal") as HTMLElement;
    expect(panel.textContent?.trim()).toBe("No changes yet.");
    expect(panel.querySelector("ol")).toBe(null);
    const one: Entry = {
      command: { type: "set", changes: [{ target: A, values: { x: 1 } }] },
      author: G,
      time: "2026-10-17T08:05:09.123Z",
    };
    stage({ editing: [GROUP], entries: [one], undone: [] });
    expect(items()).toEqual([[T, G, `Set x of ${A}`, false, false, null]]);
    expect(panel.textContent).not.toContain("No changes yet.");
  });
});
