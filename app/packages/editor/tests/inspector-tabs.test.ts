/** The inspector's tabs and panels; the expected values are derived in `README.md` ("The tabs and panels"). */

import { liveStore } from "@timetoalign/tilie-arranger";
import type { Entry, OpenEditor, Store, View } from "@timetoalign/tilie-core";
import { listEntries } from "@timetoalign/tilie-core";
import { flushSync, mount, unmount } from "svelte";
import { afterEach, describe, expect, it } from "vitest";
import Inspector from "../src/inspector/Inspector.svelte";
import type { JournalSource } from "../src/inspector/journal.ts";
import type { Tab } from "../src/inspector/tabs.ts";
import { initialPick, nextTab, shownTab, TABS, tabsOf } from "../src/inspector/tabs.ts";
import { holder } from "./holder.svelte.ts";
import { MIXED, mixedStore } from "./mixed.ts";

const { A } = MIXED;
const HINT = "Select a block to inspect its manifest.";

/**
 * A store whose levels (`editing`, `listed`, `sessions`) the test sets, announced
 * through `subscribe` as the store announces its own changes, and which counts an
 * opening whenever the staged editing path grows; everything else is `inner`'s.
 */
function staged(inner: Store): { store: Store; stage(levels: Partial<JournalSource>): void } {
  let levels: Partial<JournalSource> = {};
  let openings = 0;
  const listeners = new Set<(view: View) => void>();
  const store = Object.create(inner, {
    openings: { get: () => openings },
    editing: { get: () => levels.editing ?? inner.editing },
    listed: { get: () => levels.listed ?? inner.listed },
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
      if ((next.editing?.length ?? 0) > (levels.editing?.length ?? 0)) openings += 1;
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

/** The tab named `name`. */
function tabNamed(name: string): HTMLElement {
  const found = [...document.querySelectorAll<HTMLElement>('[role="tab"]')].find(
    (tab) => tab.textContent?.trim() === name,
  );
  if (found === undefined) throw new Error(`no tab ${name}`);
  return found;
}

/** The panel the tab `name` controls; `null` without that tab. */
function panelOf(name: string): HTMLElement | null {
  const tab = [...document.querySelectorAll<HTMLElement>('[role="tab"]')].find(
    (item) => item.textContent?.trim() === name,
  );
  const id = tab?.getAttribute("aria-controls");
  return id === null || id === undefined ? null : document.getElementById(id);
}

/** Every tab as [text, aria-selected, tabindex]. */
function tabs(): unknown[] {
  return [...document.querySelectorAll<HTMLElement>('[role="tab"]')].map((tab) => [
    tab.textContent?.trim(),
    tab.getAttribute("aria-selected"),
    tab.getAttribute("tabindex"),
  ]);
}

/** Every panel as [the text of the tab labelling it, hidden]. */
function panels(): unknown[] {
  return [...document.querySelectorAll<HTMLElement>('[role="tabpanel"]')].map((panel) => [
    document.getElementById(panel.getAttribute("aria-labelledby") ?? "")?.textContent?.trim(),
    panel.hidden,
  ]);
}

const on = (name: string) => [name, "true", "0"];
const off = (name: string) => [name, "false", "-1"];

function click(name: string): void {
  tabNamed(name).click();
  flushSync();
}

function editorText(): string | undefined {
  return panelOf("Editor")?.textContent?.trim();
}

describe("the tab rule", () => {
  it("offers Editor only while an editor is open", () => {
    expect([tabsOf(0), tabsOf(1), tabsOf(2)]).toEqual([
      ["properties", "manifest", "journal"],
      TABS,
      TABS,
    ]);
    expect([initialPick(0, 3), initialPick(1, 3)]).toEqual([
      { tab: "properties", openings: 3 },
      { tab: "editor", openings: 3 },
    ]);
  });

  it("shows Editor after an opening, the chosen tab otherwise, never Editor without an editor", () => {
    const cases: [Tab, number, number, number, Tab][] = [
      // [chosen, openings when chosen, openings now, depth, shown]
      ["properties", 0, 0, 0, "properties"],
      ["journal", 0, 1, 1, "editor"],
      ["journal", 1, 1, 1, "journal"],
      ["journal", 1, 2, 2, "editor"],
      ["editor", 1, 1, 0, "properties"],
      ["manifest", 1, 1, 0, "manifest"],
      ["manifest", 1, 2, 0, "properties"],
    ];
    expect(
      cases.map(([tab, chosenAt, openings, depth]) =>
        shownTab({ tab, openings: chosenAt }, openings, depth),
      ),
    ).toEqual(cases.map(([, , , , shown]) => shown));
  });

  it("moves with the arrows, Home and End, wrapping, and leaves a modified key to the browser", () => {
    const all = tabsOf(1);
    const key = (name: string, held: Partial<KeyboardEvent> = {}) => ({
      key: name,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      ...held,
    });
    expect([
      nextTab(all, "editor", key("ArrowRight")),
      nextTab(all, "journal", key("ArrowRight")),
      nextTab(all, "editor", key("ArrowLeft")),
      nextTab(all, "manifest", key("Home")),
      nextTab(all, "manifest", key("End")),
      nextTab(all, "manifest", key("ArrowDown")),
      nextTab(all, "manifest", key("ArrowRight", { altKey: true })),
      nextTab(all, "manifest", key("ArrowRight", { ctrlKey: true })),
      nextTab(all, "manifest", key("ArrowRight", { metaKey: true })),
    ]).toEqual([
      "properties",
      "editor",
      "journal",
      "editor",
      "journal",
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
  });
});

describe("the tab set", () => {
  it("shows Properties, Manifest and Journal without an editor, each tab naming its panel", () => {
    show(mixedStore());
    expect(tabs()).toEqual([on("Properties"), off("Manifest"), off("Journal")]);
    expect(panelOf("Editor")).toBe(null);
    const pairs = [...document.querySelectorAll<HTMLElement>('[role="tab"]')].map((tab) => {
      const panel = document.getElementById(tab.getAttribute("aria-controls") ?? "");
      return [panel?.getAttribute("role"), panel?.getAttribute("aria-labelledby") === tab.id];
    });
    expect(pairs).toEqual([
      ["tabpanel", true],
      ["tabpanel", true],
      ["tabpanel", true],
    ]);
    const ids = [...document.querySelectorAll("[id]")].map((element) => element.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("renders only the panel shown", () => {
    show(mixedStore());
    expect(panels()).toEqual([
      ["Properties", false],
      ["Manifest", true],
      ["Journal", true],
    ]);
    expect([panelOf("Manifest")?.childElementCount, panelOf("Journal")?.childElementCount]).toEqual(
      [0, 0],
    );
    click("Journal");
    expect([panelOf("Properties")?.childElementCount, panelOf("Journal")?.hidden]).toEqual([
      0,
      false,
    ]);
  });

  it("keeps the tab list with nothing selected", () => {
    show(mixedStore(), []);
    expect(tabs()).toEqual([on("Properties"), off("Manifest"), off("Journal")]);
    expect(panelOf("Properties")?.textContent?.trim()).toBe(HINT);
    click("Manifest");
    expect(panelOf("Manifest")?.textContent?.trim()).toBe(HINT);
    click("Journal");
    expect(panels()).toEqual([
      ["Properties", true],
      ["Manifest", true],
      ["Journal", false],
    ]);
    expect(panelOf("Journal")?.querySelectorAll("li")).toHaveLength(3);
  });

  it("selects Editor on every opening and Properties when the last editor closes", () => {
    const { store, stage } = staged(mixedStore());
    show(store);
    stage({ editing: [GROUP] });
    expect(tabs()).toEqual([on("Editor"), off("Properties"), off("Manifest"), off("Journal")]);
    expect(panels()).toEqual([
      ["Editor", false],
      ["Properties", true],
      ["Manifest", true],
      ["Journal", true],
    ]);
    expect(editorText()).toBe("Group editor: Performance");

    click("Journal");
    stage({ editing: [GROUP, TIMELINE] });
    expect(tabs()).toEqual([on("Editor"), off("Properties"), off("Manifest"), off("Journal")]);
    expect(editorText()).toBe("Timeline editor: Score");

    stage({ editing: [GROUP] });
    expect(tabs()).toEqual([on("Editor"), off("Properties"), off("Manifest"), off("Journal")]);
    expect(editorText()).toBe("Group editor: Performance");

    stage({ editing: [] });
    expect(tabs()).toEqual([on("Properties"), off("Manifest"), off("Journal")]);
    expect(panelOf("Editor")).toBe(null);
    expect(panelOf("Properties")?.hidden).toBe(false);
  });

  it("keeps another tab when the last editor closes", () => {
    const { store, stage } = staged(mixedStore());
    show(store);
    stage({ editing: [GROUP] });
    click("Manifest");
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
    click("Journal");
    expect(
      [...(panelOf("Journal")?.querySelectorAll(".text") ?? [])].map((item) => item.textContent),
    ).toEqual([
      "Edited group Performance (1 change)",
      "Added block 0000000002 to workspace",
      "Added block 0000000001 to workspace",
      "Added block 0000000000 to workspace",
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

  const ALL = ["x", "y", "length", "scale", "spacing", "width", "height"];
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
    /** The fields after the editing path `editing`, read on the Properties tab. */
    const after = (editing: OpenEditor[]) => {
      stage({ editing });
      click("Properties");
      return fields();
    };
    expect(fields()).toEqual(enabled);
    expect(after([editor(A, "bundle")])).toEqual(enabled);
    expect(after([GROUP])).toEqual(blockFieldsOff);
    expect(after([GROUP, TIMELINE])).toEqual(blockFieldsOff);
    expect(after([])).toEqual(enabled);
  });
});

describe("the keys", () => {
  function steps(from: string, keys: string[]): string[] {
    tabNamed(from).focus();
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
    expect(steps("Properties", ["ArrowLeft", "ArrowRight", "End", "Home"])).toEqual([
      "Journal",
      "Properties",
      "Journal",
      "Properties",
    ]);
    stage({ editing: [GROUP] });
    expect(
      steps("Editor", [
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
    return [...(panelOf("Journal") as HTMLElement).querySelectorAll("li")].map((item) => [
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
  /** The three `add`s, newest first. */
  const ADDS = [
    [T, G, "Added block 0000000002 to workspace", false, false, null],
    [T, G, "Added block 0000000001 to workspace", false, false, null],
    [T, G, "Added block 0000000000 to workspace", false, false, null],
  ];

  it("lists the rows, the undone one grey with a hidden word, and follows the store", () => {
    const store = mixedStore({ clock: () => new Date("2026-10-17T08:05:09.123Z") });
    show(store);
    click("Journal");
    expect(panelOf("Journal")?.querySelector("ol")?.getAttribute("aria-label")).toBe("Journal");
    store.dispatch({ type: "set", changes: [{ target: A, values: { x: 25 } }] });
    store.undo();
    flushSync();
    expect(items()).toEqual([[T, G, `Set x of ${A}`, true, false, "undone"], ...ADDS]);
    store.dispatch({ type: "set", changes: [{ target: A, values: { y: 7 } }] });
    flushSync();
    expect(items()).toEqual([[T, G, `Set y of ${A}`, false, false, null], ...ADDS]);
  });

  it("lists the earlier session last, keeping the items per entry", () => {
    const inner = mixedStore({ clock: () => new Date("2026-10-17T08:05:09.123Z") });
    const { store, stage } = staged(inner);
    show(store);
    stage({ editing: [GROUP], listed: inner.listed });
    click("Journal");
    const before = [...(panelOf("Journal") as HTMLElement).querySelectorAll("li")];
    expect(before).toHaveLength(3);
    const earlier: Entry = {
      command: { type: "set", changes: [{ target: GROUP.target, values: { order: null } }] },
      author: "Ada",
      time: "2026-10-17T07:00:01.000Z",
    };
    stage({
      editing: [{ ...GROUP, earlier: "s0" }],
      listed: inner.listed,
      sessions: { s0: { target: GROUP.target, entries: [earlier] } },
    });
    expect(items()).toEqual([
      ...ADDS,
      ["07:00:01", "Ada", `Set order of ${GROUP.target}`, false, true, null],
    ]);
    const after = [...(panelOf("Journal") as HTMLElement).querySelectorAll("li")];
    expect(after.slice(0, 3).map((item, index) => item === before[index])).toEqual([
      true,
      true,
      true,
    ]);
    const fourth: Entry = {
      command: { type: "set", changes: [{ target: A, values: { x: 1 } }] },
      author: G,
      time: "2026-10-17T08:05:09.123Z",
    };
    stage({
      editing: [{ ...GROUP, earlier: "s0" }],
      listed: listEntries([...inner.journal, fourth], inner.sessions),
      sessions: { s0: { target: GROUP.target, entries: [earlier] } },
    });
    const later = [...(panelOf("Journal") as HTMLElement).querySelectorAll("li")];
    expect(later.slice(1, 4).map((item, index) => item === before[index])).toEqual([
      true,
      true,
      true,
    ]);
  });

  it("says when a level has no changes yet", () => {
    const { store, stage } = staged(mixedStore());
    show(store);
    stage({ editing: [GROUP], listed: [] });
    click("Journal");
    const panel = panelOf("Journal") as HTMLElement;
    expect(panel.textContent?.trim()).toBe("No changes yet.");
    expect(panel.querySelector("ol")).toBe(null);
    const one: Entry = {
      command: { type: "set", changes: [{ target: A, values: { x: 1 } }] },
      author: G,
      time: "2026-10-17T08:05:09.123Z",
    };
    stage({ editing: [GROUP], listed: listEntries([one], {}) });
    expect(items()).toEqual([[T, G, `Set x of ${A}`, false, false, null]]);
    expect(panel.textContent).not.toContain("No changes yet.");
  });

  it("discloses a session's changes with a button, newest first, a run greyed at once", () => {
    const store = mixedStore({ clock: () => new Date("2026-10-17T08:05:09.123Z") });
    const rename = (id: string, name: string) => ({
      type: "set",
      changes: [{ target: `${A}/${id}`, values: { name } }],
    });
    expect(store.open(A)).toBe(null);
    expect(store.open(`${A}/group_1`)).toBe(null);
    expect(store.dispatch(rename("performance", "P"))).toBe(null);
    expect(store.open(`${A}/score`)).toBe(null);
    expect(store.dispatch(rename("score", "S"))).toBe(null);
    expect(store.dispatch(rename("score", "T"))).toBe(null);
    store.done();
    store.done();
    store.done();
    // One undo reverts the timeline session's run: both of its changes.
    store.undo();
    show(store);
    click("Journal");
    const panel = panelOf("Journal") as HTMLElement;
    const first = panel.querySelector(":scope > ol > li") as HTMLElement;
    const button = () => first.querySelector(":scope > .row > button") as HTMLButtonElement;
    const text = first.querySelector(":scope > .row > .text") as HTMLElement;
    expect(text.textContent).toBe("Edited bundle Mixed (3 changes, 2 undone)");
    expect(button().getAttribute("type")).toBe("button");
    expect(button().nextElementSibling?.className).toContain("time");
    expect([
      button().getAttribute("aria-expanded"),
      button().getAttribute("aria-controls"),
      button().getAttribute("aria-labelledby"),
    ]).toEqual(["false", null, text.id]);
    expect(first.querySelector("ol")).toBe(null);
    expect(panel.querySelectorAll("button")).toHaveLength(1);
    const { journal, listed } = store;
    button().click();
    flushSync();
    expect(button().getAttribute("aria-expanded")).toBe("true");
    const nested = first.querySelector(":scope > ol") as HTMLElement;
    expect(nested.id).toBe(button().getAttribute("aria-controls"));
    const inner = nested.querySelector(":scope > li") as HTMLElement;
    expect(nested.querySelectorAll(":scope > li")).toHaveLength(1);
    expect(inner.querySelector(".text")?.textContent).toBe(
      "Edited group Performance (3 changes, 2 undone)",
    );
    const innerButton = inner.querySelector("button") as HTMLButtonElement;
    expect(innerButton.getAttribute("aria-expanded")).toBe("false");
    innerButton.click();
    flushSync();
    /** Each item directly in `list` as [text, data-undone, its hidden word, whether its row has a button]. */
    const rows = (list: Element) =>
      [...list.querySelectorAll(":scope > ol > li")].map((item) => [
        item.querySelector(":scope > .row > .text")?.textContent,
        item.hasAttribute("data-undone"),
        item.querySelector(":scope > .row .visually-hidden")?.textContent ?? null,
        item.querySelector(":scope > .row > button") !== null,
      ]);
    expect(rows(inner)).toEqual([
      ["Edited timeline Score (2 changes)", true, "undone", true],
      [`Set name of ${A}/performance`, false, null, false],
    ]);
    const timeline = inner.querySelector(":scope > ol > li") as HTMLElement;
    (timeline.querySelector(":scope > .row > button") as HTMLButtonElement).click();
    flushSync();
    expect(rows(timeline)).toEqual([
      [`Set name of ${A}/score`, true, "undone", false],
      [`Set name of ${A}/score`, true, "undone", false],
    ]);
    button().click();
    flushSync();
    expect(button().getAttribute("aria-expanded")).toBe("false");
    expect(first.querySelector("ol")).toBe(null);
    expect([store.journal, store.listed]).toEqual([journal, listed]);
    expect(store.journal).toBe(journal);
    expect(store.listed).toBe(listed);
  });
});
