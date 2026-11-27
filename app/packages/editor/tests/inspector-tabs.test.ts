/** The inspector's tabs and panels; the expected values are derived in `README.md` ("The tabs and panels"). */

import type { Selection } from "@timetoalign/tilie-arranger";
import { liveStore, selectionOf } from "@timetoalign/tilie-arranger";
import type { Address, Entry, OpenEditor, Part, Store, View } from "@timetoalign/tilie-core";
import { listEntries } from "@timetoalign/tilie-core";
import { flushSync, mount, unmount } from "svelte";
import { afterEach, describe, expect, it } from "vitest";
import InspectorDrawer from "../src/InspectorDrawer.svelte";
import Inspector from "../src/inspector/Inspector.svelte";
import type { JournalSource } from "../src/inspector/journal.ts";
import type { Held, HeldMatch, Shown, Tab } from "../src/inspector/tabs.ts";
import {
  elisionSelected,
  entered,
  initialPick,
  matchPinned,
  namesElision,
  nextTab,
  pinned,
  TABS,
  tabLabel,
  toggled,
} from "../src/inspector/tabs.ts";
import { addStylesOf, fadingsOf } from "./dom.ts";
import { holder } from "./holder.svelte.ts";
import { MIXED, mixedStore } from "./mixed.ts";
import { blockId, noMatchClaims, posting, providing, storeOf, withElisionMode } from "./support.ts";

const { A } = MIXED;
/** The address of block `A`. */
const BLOCK: Address = { block: A };
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

function editor(target: Address, kind: OpenEditor["kind"], session = "s1"): OpenEditor {
  return { session, target, kind, earlier: null };
}

const GROUP = editor({ block: A, id: "group_1" }, "group", "s1");
const TIMELINE = editor({ block: A, id: "score" }, "timeline", "s2");

let app: ReturnType<typeof mount> | undefined;

afterEach(() => {
  if (app !== undefined) unmount(app);
  app = undefined;
  document.body.innerHTML = "";
});

function show(store: Store, selection: Address[] = [BLOCK]): void {
  const selected = holder<Selection>(selectionOf(selection));
  app = mount(providing(Inspector), {
    target: document.body,
    context: posting(),
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

/** The level panel's title line as [the word, the name], its whole text, and how many elements the panel holds. */
function titleLine(name: string): unknown[] {
  const panel = panelOf(name);
  const line = panel?.querySelector('[data-testid="level-title"]');
  return [
    line?.querySelector(".word")?.textContent,
    line?.querySelector(".name")?.textContent,
    line?.textContent?.replace(/\s+/g, " ").trim(),
    panel?.childElementCount,
  ];
}

/** How many elements a level's panel holds: the title line, then its settings' areas. */
const CONTENTS: { readonly [word: string]: number } = {
  Arranger: 2,
  Bundle: 3,
  Group: 1,
  Timeline: 1,
};

/** The title line `word name`, as `titleLine` reads it. */
const titled = (word: string, name: string) => [word, name, `${word} ${name}`, CONTENTS[word]];

describe("the tab rule", () => {
  it("has the nine tabs, the level tab first and named by its level", () => {
    expect(TABS).toEqual([
      "level",
      "properties",
      "regions",
      "metadata",
      "manifest",
      "journal",
      "timestamp",
      "matchstamp",
      "elisions",
    ]);
    const OTHERS = [
      "Properties",
      "Regions",
      "Metadata",
      "Manifest",
      "Journal",
      "Timestamp",
      "Matchstamp",
      "Elisions",
    ];
    expect(
      (["arranger", "bundle", "group", "timeline", "children", "flow"] as const).map((level) =>
        TABS.map((tab) => tabLabel(tab, level)),
      ),
    ).toEqual([
      ["Arranger", ...OTHERS],
      ["Bundle", ...OTHERS],
      ["Group", ...OTHERS],
      ["Timeline", ...OTHERS],
      ["Children", ...OTHERS],
      ["Flow control", ...OTHERS],
    ]);
    expect([initialPick(0, 3), initialPick(1, 3), initialPick(2, 0)]).toEqual([
      { tab: "properties", openings: 3 },
      { tab: "level", openings: 3 },
      { tab: "level", openings: 0 },
    ]);
  });

  it("shows the level tab after an opening while hidden, the chosen tab otherwise", () => {
    const cases: [Tab, number, number, boolean, Tab, number][] = [
      // [chosen, openings recorded, openings now, shown, tab after, openings after]
      ["properties", 0, 0, true, "properties", 0],
      ["journal", 0, 1, true, "level", 1],
      ["journal", 2, 5, true, "level", 5],
      ["manifest", 3, 0, true, "level", 0],
      ["level", 1, 2, true, "level", 2],
      ["journal", 1, 1, true, "journal", 1],
      ["journal", 1, 4, false, "journal", 4],
      ["level", 0, 0, false, "level", 0],
      ["properties", 0, 2, false, "properties", 2],
    ];
    expect(
      cases.map(([tab, recorded, openings, shown]) =>
        toggled({ tab, openings: recorded }, openings, shown),
      ),
    ).toEqual(cases.map(([, , , , tab, openings]) => ({ tab, openings })));
  });

  it("shows the level tab on entering a children or flow-control editor, else keeps the pick", () => {
    const journal = { tab: "journal", openings: 1 } as const;
    expect([entered(journal, "children", 2), entered(journal, "flow", 2)]).toEqual([
      { tab: "level", openings: 2 },
      { tab: "level", openings: 2 },
    ]);
    for (const kind of ["bundle", "group", "timeline"] as const) {
      expect(entered(journal, kind, 2)).toBe(journal);
    }
  });

  it("keeps the chosen tab over editors opened while shown: hiding records them", () => {
    // Journal chosen at 0 openings; two editors opened while shown; hidden; shown again.
    const hidden = toggled({ tab: "journal", openings: 0 }, 2, false);
    expect([hidden, toggled(hidden, 2, true), toggled(hidden, 3, true)]).toEqual([
      { tab: "journal", openings: 2 },
      { tab: "journal", openings: 2 },
      { tab: "level", openings: 3 },
    ]);
  });

  it("moves with the arrows, Home and End, wrapping, and leaves a modified key to the browser", () => {
    const key = (name: string, held: Partial<KeyboardEvent> = {}) => ({
      key: name,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      ...held,
    });
    expect([
      nextTab("level", key("ArrowRight")),
      nextTab("properties", key("ArrowRight")),
      nextTab("regions", key("ArrowRight")),
      nextTab("metadata", key("ArrowRight")),
      nextTab("manifest", key("ArrowRight")),
      nextTab("journal", key("ArrowRight")),
      nextTab("timestamp", key("ArrowRight")),
      nextTab("matchstamp", key("ArrowRight")),
      nextTab("elisions", key("ArrowRight")),
      nextTab("level", key("ArrowLeft")),
      nextTab("properties", key("ArrowLeft")),
      nextTab("journal", key("ArrowLeft")),
      nextTab("manifest", key("ArrowLeft")),
      nextTab("manifest", key("Home")),
      nextTab("manifest", key("End")),
      nextTab("level", key("Home")),
      nextTab("journal", key("End")),
      nextTab("manifest", key("ArrowDown")),
      nextTab("manifest", key("ArrowRight", { altKey: true })),
      nextTab("manifest", key("ArrowRight", { ctrlKey: true })),
      nextTab("manifest", key("ArrowRight", { metaKey: true })),
    ]).toEqual([
      "properties",
      "regions",
      "metadata",
      "manifest",
      "journal",
      "timestamp",
      "matchstamp",
      "elisions",
      "level",
      "elisions",
      "level",
      "manifest",
      "metadata",
      "level",
      "elisions",
      "level",
      "elisions",
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
  });
});

describe("the tab set", () => {
  it("shows the nine tabs without an editor, each naming its panel", () => {
    show(mixedStore());
    expect(tabs()).toEqual([
      off("Arranger"),
      on("Properties"),
      off("Regions"),
      off("Metadata"),
      off("Manifest"),
      off("Journal"),
      off("Timestamp"),
      off("Matchstamp"),
      off("Elisions"),
    ]);
    const pairs = [...document.querySelectorAll<HTMLElement>('[role="tab"]')].map((tab) => {
      const panel = document.getElementById(tab.getAttribute("aria-controls") ?? "");
      return [panel?.getAttribute("role"), panel?.getAttribute("aria-labelledby") === tab.id];
    });
    expect(pairs).toEqual([
      ["tabpanel", true],
      ["tabpanel", true],
      ["tabpanel", true],
      ["tabpanel", true],
      ["tabpanel", true],
      ["tabpanel", true],
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
      ["Arranger", true],
      ["Properties", false],
      ["Regions", true],
      ["Metadata", true],
      ["Manifest", true],
      ["Journal", true],
      ["Timestamp", true],
      ["Matchstamp", true],
      ["Elisions", true],
    ]);
    expect(
      [
        "Arranger",
        "Regions",
        "Metadata",
        "Manifest",
        "Journal",
        "Timestamp",
        "Matchstamp",
        "Elisions",
      ].map((name) => panelOf(name)?.childElementCount),
    ).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    click("Journal");
    expect([panelOf("Properties")?.childElementCount, panelOf("Journal")?.hidden]).toEqual([
      0,
      false,
    ]);
  });

  it("names the workspace on the Arranger tab's title line", () => {
    show(mixedStore());
    click("Arranger");
    expect(titleLine("Arranger")).toEqual(titled("Arranger", "untitled"));
  });

  it("keeps the tab list with nothing selected, the hint on the Manifest tab only", () => {
    show(mixedStore(), []);
    expect(tabs()).toEqual([
      off("Arranger"),
      on("Properties"),
      off("Regions"),
      off("Metadata"),
      off("Manifest"),
      off("Journal"),
      off("Timestamp"),
      off("Matchstamp"),
      off("Elisions"),
    ]);
    const properties = panelOf("Properties") as HTMLElement;
    expect([properties.querySelector(".hint"), properties.textContent?.includes(HINT)]).toEqual([
      null,
      false,
    ]);
    const name = properties.querySelector<HTMLInputElement>("input");
    expect([name?.labels?.[0]?.textContent?.trim(), name?.value]).toEqual(["Name", "untitled"]);
    click("Manifest");
    expect(panelOf("Manifest")?.textContent?.trim()).toBe(HINT);
    click("Journal");
    expect(panels()).toEqual([
      ["Arranger", true],
      ["Properties", true],
      ["Regions", true],
      ["Metadata", true],
      ["Manifest", true],
      ["Journal", false],
      ["Timestamp", true],
      ["Matchstamp", true],
      ["Elisions", true],
    ]);
    expect(panelOf("Journal")?.querySelectorAll("li")).toHaveLength(3);
  });

  it("keeps the chosen tab while editors open and close, the level tab named by the innermost", () => {
    const { store, stage } = staged(mixedStore());
    show(store);
    stage({ editing: [GROUP] });
    expect(tabs()).toEqual([
      off("Group"),
      on("Properties"),
      off("Regions"),
      off("Metadata"),
      off("Manifest"),
      off("Journal"),
      off("Timestamp"),
      off("Matchstamp"),
      off("Elisions"),
    ]);
    click("Journal");
    stage({ editing: [GROUP, TIMELINE] });
    expect(tabs()).toEqual([
      off("Timeline"),
      off("Properties"),
      off("Regions"),
      off("Metadata"),
      off("Manifest"),
      on("Journal"),
      off("Timestamp"),
      off("Matchstamp"),
      off("Elisions"),
    ]);
    stage({ editing: [GROUP] });
    expect(tabs()).toEqual([
      off("Group"),
      off("Properties"),
      off("Regions"),
      off("Metadata"),
      off("Manifest"),
      on("Journal"),
      off("Timestamp"),
      off("Matchstamp"),
      off("Elisions"),
    ]);
    stage({ editing: [] });
    expect(tabs()).toEqual([
      off("Arranger"),
      off("Properties"),
      off("Regions"),
      off("Metadata"),
      off("Manifest"),
      on("Journal"),
      off("Timestamp"),
      off("Matchstamp"),
      off("Elisions"),
    ]);
  });

  it("keeps the level tab shown, its title line following the innermost editor", () => {
    const { store, stage } = staged(mixedStore());
    show(store);
    click("Arranger");
    const lines: unknown[] = [titleLine("Arranger")];
    stage({ editing: [GROUP] });
    expect(tabs()).toEqual([
      on("Group"),
      off("Properties"),
      off("Regions"),
      off("Metadata"),
      off("Manifest"),
      off("Journal"),
      off("Timestamp"),
      off("Matchstamp"),
      off("Elisions"),
    ]);
    lines.push(titleLine("Group"));
    stage({ editing: [GROUP, TIMELINE] });
    lines.push(titleLine("Timeline"));
    stage({ editing: [GROUP] });
    lines.push(titleLine("Group"));
    stage({ editing: [] });
    expect(tabs()).toEqual([
      on("Arranger"),
      off("Properties"),
      off("Regions"),
      off("Metadata"),
      off("Manifest"),
      off("Journal"),
      off("Timestamp"),
      off("Matchstamp"),
      off("Elisions"),
    ]);
    lines.push(titleLine("Arranger"));
    expect(lines).toEqual([
      titled("Arranger", "untitled"),
      titled("Group", "Performance"),
      titled("Timeline", "Score"),
      titled("Group", "Performance"),
      titled("Arranger", "untitled"),
    ]);
  });

  it("shows the level tab when mounted while an editor is open", () => {
    const { store, stage } = staged(mixedStore());
    stage({ editing: [editor(BLOCK, "bundle")] });
    show(store);
    expect(tabs()).toEqual([
      on("Bundle"),
      off("Properties"),
      off("Regions"),
      off("Metadata"),
      off("Manifest"),
      off("Journal"),
      off("Timestamp"),
      off("Matchstamp"),
      off("Elisions"),
    ]);
    expect(titleLine("Bundle")).toEqual(titled("Bundle", "Mixed"));
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
    expect(store.open({ block: A, id: "group_1" })).toBe(null);
    flushSync();
    expect(tabs()).toEqual([
      off("Group"),
      on("Properties"),
      off("Regions"),
      off("Metadata"),
      off("Manifest"),
      off("Journal"),
      off("Timestamp"),
      off("Matchstamp"),
      off("Elisions"),
    ]);
    store.dispatch({
      type: "set",
      changes: [{ target: { block: A, id: "score" }, values: { name: "S" } }],
    });
    store.done();
    flushSync();
    expect(tabs()).toEqual([
      off("Arranger"),
      on("Properties"),
      off("Regions"),
      off("Metadata"),
      off("Manifest"),
      off("Journal"),
      off("Timestamp"),
      off("Matchstamp"),
      off("Elisions"),
    ]);
    click("Journal");
    expect(
      [...(panelOf("Journal")?.querySelectorAll(".text") ?? [])].map((item) => item.textContent),
    ).toEqual([
      "Edited group Performance (1 change)",
      "Added the anonymous bundle",
      "Added bundle 'mixed'",
      "Added bundle 'Mixed'",
    ]);
  });
});

describe("in the drawer", () => {
  /** The drawer over `store`, closed; its `setOpen` opens and closes it as its buttons do. */
  function drawer(store: Store): { setOpen(open: boolean): void } {
    const shown = mount(providing(InspectorDrawer), {
      target: document.body,
      context: posting(),
      props: {
        live: liveStore(store),
        selection: selectionOf([BLOCK]),
        placement: null,
        storageKey: null,
        ...noMatchClaims(),
      },
    });
    app = shown;
    flushSync();
    return {
      setOpen(open) {
        shown.setOpen(open);
        flushSync();
      },
    };
  }

  it("shows the level tab for an editor opened while it was closed", () => {
    const store = mixedStore();
    const { setOpen } = drawer(store);
    setOpen(true);
    click("Journal");
    setOpen(false);
    expect(store.open({ block: A, id: "group_1" })).toBe(null);
    setOpen(true);
    expect(tabs()).toEqual([
      on("Group"),
      off("Properties"),
      off("Regions"),
      off("Metadata"),
      off("Manifest"),
      off("Journal"),
      off("Timestamp"),
      off("Matchstamp"),
      off("Elisions"),
    ]);
    expect(titleLine("Group")).toEqual(titled("Group", "Performance"));
  });

  it("keeps the chosen tab when no editor opened while it was closed", () => {
    const store = mixedStore();
    const { setOpen } = drawer(store);
    setOpen(true);
    click("Journal");
    setOpen(false);
    setOpen(true);
    expect(tabs()).toEqual([
      off("Arranger"),
      off("Properties"),
      off("Regions"),
      off("Metadata"),
      off("Manifest"),
      on("Journal"),
      off("Timestamp"),
      off("Matchstamp"),
      off("Elisions"),
    ]);
  });

  it("keeps the chosen tab over an editor opened while it was open, through closing and opening", () => {
    const store = mixedStore();
    const { setOpen } = drawer(store);
    setOpen(true);
    click("Journal");
    expect(store.open({ block: A, id: "group_1" })).toBe(null);
    flushSync();
    expect(tabs()).toEqual([
      off("Group"),
      off("Properties"),
      off("Regions"),
      off("Metadata"),
      off("Manifest"),
      on("Journal"),
      off("Timestamp"),
      off("Matchstamp"),
      off("Elisions"),
    ]);
    setOpen(true);
    expect(tabs()).toEqual([
      off("Group"),
      off("Properties"),
      off("Regions"),
      off("Metadata"),
      off("Manifest"),
      on("Journal"),
      off("Timestamp"),
      off("Matchstamp"),
      off("Elisions"),
    ]);
    setOpen(false);
    setOpen(true);
    expect(tabs()).toEqual([
      off("Group"),
      off("Properties"),
      off("Regions"),
      off("Metadata"),
      off("Manifest"),
      on("Journal"),
      off("Timestamp"),
      off("Matchstamp"),
      off("Elisions"),
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

  const ALL = ["x", "y", "length", "scale", "spacing", "margin", "width", "height"];
  const enabled = ALL.map((name) => [name, false]);
  const blockFieldsOff = ALL.map((name) => [
    name,
    name === "scale" || name === "length" || name === "spacing" || name === "margin",
  ]);

  it("are refused by the store inside a group editor", () => {
    const store = mixedStore();
    expect(store.open({ block: A, id: "group_1" })).toBe(null);
    expect(
      store.dispatch({ type: "set", changes: [{ target: BLOCK, values: { scale: 2 } }] })?.code,
    ).toBe("side_effect");
  });

  it("disables scale, length, spacing and margin in a group or timeline editor only", () => {
    const { store, stage } = staged(mixedStore());
    show(store);
    /** The fields after the editing path `editing`, read on the Properties tab. */
    const after = (editing: OpenEditor[]) => {
      stage({ editing });
      click("Properties");
      return fields();
    };
    expect(fields()).toEqual(enabled);
    expect(after([editor(BLOCK, "bundle")])).toEqual(enabled);
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

  it("move over the nine tabs, wrapping, at the top level and in an editor", () => {
    const { store, stage } = staged(mixedStore());
    show(store);
    expect(steps("Properties", ["ArrowLeft", "ArrowLeft", "ArrowRight", "End", "Home"])).toEqual([
      "Arranger",
      "Elisions",
      "Arranger",
      "Elisions",
      "Arranger",
    ]);
    stage({ editing: [GROUP] });
    expect(
      steps("Group", [
        "ArrowRight",
        "ArrowRight",
        "ArrowRight",
        "ArrowRight",
        "ArrowRight",
        "ArrowRight",
        "ArrowRight",
        "ArrowRight",
        "ArrowRight",
        "ArrowLeft",
        "Home",
        "End",
      ]),
    ).toEqual([
      "Properties",
      "Regions",
      "Metadata",
      "Manifest",
      "Journal",
      "Timestamp",
      "Matchstamp",
      "Elisions",
      "Group",
      "Elisions",
      "Group",
      "Elisions",
    ]);
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
    [T, G, "Added the anonymous bundle", false, false, null],
    [T, G, "Added bundle 'mixed'", false, false, null],
    [T, G, "Added bundle 'Mixed'", false, false, null],
  ];

  it("lists the rows, the undone one grey with a hidden word, and follows the store", () => {
    const store = mixedStore({ clock: () => new Date("2026-10-17T08:05:09.123Z") });
    show(store);
    click("Journal");
    expect(panelOf("Journal")?.querySelector("ol")?.getAttribute("aria-label")).toBe("Journal");
    store.dispatch({ type: "set", changes: [{ target: BLOCK, values: { x: 25 } }] });
    store.undo();
    flushSync();
    expect(items()).toEqual([[T, G, "Set x of bundle 'Mixed'", true, false, "undone"], ...ADDS]);
    store.dispatch({ type: "set", changes: [{ target: BLOCK, values: { y: 7 } }] });
    flushSync();
    expect(items()).toEqual([[T, G, "Set y of bundle 'Mixed'", false, false, null], ...ADDS]);
  });

  it("shows an undone row muted and its sentence struck through, never faded", () => {
    const style = addStylesOf("inspector/JournalPanel.svelte");
    try {
      const store = mixedStore({ clock: () => new Date("2026-10-17T08:05:09.123Z") });
      show(store);
      click("Journal");
      store.dispatch({ type: "set", changes: [{ target: BLOCK, values: { x: 25 } }] });
      store.undo();
      flushSync();
      /** Each part of the first item's row as [color, text-decoration, fadings applying]. */
      const looks = () => {
        const item = panelOf("Journal")?.querySelector("li");
        if (item === null || item === undefined) throw new Error("no journal item");
        return [".time", ".author", ".text"].map((part) => {
          const element = item.querySelector(`:scope > .row > ${part}`);
          if (element === null) throw new Error(`no ${part}`);
          const computed = getComputedStyle(element);
          return [computed.color, computed.textDecoration, fadingsOf(element)];
        });
      };
      const MUTED = "rgb(89, 89, 89)";
      expect(looks()).toEqual([
        [MUTED, "", []],
        [MUTED, "", []],
        [MUTED, "line-through", []],
      ]);
      store.dispatch({ type: "set", changes: [{ target: BLOCK, values: { y: 7 } }] });
      flushSync();
      expect(looks()).toEqual([
        [MUTED, "", []],
        [MUTED, "", []],
        // The text's own colour, inherited: jsdom's black, no page stylesheet being loaded.
        ["rgb(0, 0, 0)", "", []],
      ]);
    } finally {
      style.remove();
    }
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
      ["07:00:01", "Ada", "Set order of group 'Performance' in bundle 'Mixed'", false, true, null],
    ]);
    const after = [...(panelOf("Journal") as HTMLElement).querySelectorAll("li")];
    expect(after.slice(0, 3).map((item, index) => item === before[index])).toEqual([
      true,
      true,
      true,
    ]);
    const fourth: Entry = {
      command: { type: "set", changes: [{ target: BLOCK, values: { x: 1 } }] },
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
      command: { type: "set", changes: [{ target: BLOCK, values: { x: 1 } }] },
      author: G,
      time: "2026-10-17T08:05:09.123Z",
    };
    stage({ editing: [GROUP], listed: listEntries([one], {}) });
    expect(items()).toEqual([[T, G, "Set x of bundle 'Mixed'", false, false, null]]);
    expect(panel.textContent).not.toContain("No changes yet.");
  });

  it("discloses a session's changes with a button, newest first, a run greyed at once", () => {
    const store = mixedStore({ clock: () => new Date("2026-10-17T08:05:09.123Z") });
    const rename = (id: string, name: string) => ({
      type: "set",
      changes: [{ target: { block: A, id }, values: { name } }],
    });
    expect(store.open(BLOCK)).toBe(null);
    expect(store.open({ block: A, id: "group_1" })).toBe(null);
    expect(store.dispatch(rename("performance", "P"))).toBe(null);
    expect(store.open({ block: A, id: "score" })).toBe(null);
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
      ["Set name of timeline 'P' in bundle 'Mixed'", false, null, false],
    ]);
    const timeline = inner.querySelector(":scope > ol > li") as HTMLElement;
    (timeline.querySelector(":scope > .row > button") as HTMLButtonElement).click();
    flushSync();
    expect(rows(timeline)).toEqual([
      ["Set name of timeline 'Score' in bundle 'Mixed'", true, "undone", false],
      ["Set name of timeline 'Score' in bundle 'Mixed'", true, "undone", false],
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

describe("a selected elision", () => {
  const E = blockId(0);
  /** `bundle_elisions_stored`, one block: stored elisions `elision_3` (a group's) and `elision_5`. */
  const stored = () => storeOf("bundles/bundle_elisions_stored");
  const at = (id: string, part?: Part[]): Address =>
    part === undefined ? { block: E, id } : { block: E, id, part };
  const ELISION_5 = at("elision_5");
  const ELISION_3 = at("elision_3");
  /** The automatic elision of `score`, which its ancestor card may draw behind `theme`'s group. */
  const AUTOMATIC = at("score", ["elision"]);
  /** A pin as the rule holds it: carried, never read. */
  const HELD = { pin: { pinned: "carried" }, manifest: {} } as unknown as Held;
  const MATCH: HeldMatch = { kind: "named", block: E, id: "matchstamp_1" };

  describe("as a rule", () => {
    const journal: Shown = { picked: { tab: "journal", openings: 1 }, pin: null };

    it("names a stored or an automatic elision itself, never one of its parts", () => {
      const { view } = stored();
      expect(
        [
          ELISION_5,
          ELISION_3,
          AUTOMATIC,
          at("session", ["elision"]),
          at("score"),
          at("elision_5", ["ellipsis"]),
          at("score", ["elision", "ellipsis"]),
          at("score", ["elision", "name"]),
          at("recording", ["elision"]),
          at("theme", ["elision"]),
          { block: E },
          at("nothing"),
        ].map((address) => namesElision(view, address)),
      ).toEqual([true, true, true, true, false, false, false, false, false, false, false, false]);
    });

    it("selects the Elisions tab for exactly one elision, stored or automatic, as a choice of it", () => {
      const { view } = stored();
      expect(elisionSelected(journal, view, [ELISION_5], 3)).toEqual({
        picked: { tab: "elisions", openings: 3 },
        pin: null,
      });
      expect(elisionSelected(journal, view, [ELISION_3], 1)).toEqual({
        picked: { tab: "elisions", openings: 1 },
        pin: null,
      });
      expect(elisionSelected(journal, view, [AUTOMATIC], 2)).toEqual({
        picked: { tab: "elisions", openings: 2 },
        pin: null,
      });
    });

    it.each<[string, Address[]]>([
      ["nothing", []],
      ["a timeline", [at("score")]],
      ["the block", [{ block: E }]],
      ["two elisions", [ELISION_5, ELISION_3]],
      ["a stored and an automatic elision", [ELISION_5, AUTOMATIC]],
      ["an elision and its timeline", [ELISION_5, at("score")]],
      ["an elision's ellipsis", [at("elision_5", ["ellipsis"])]],
      ["an automatic elision's ellipsis", [at("score", ["elision", "ellipsis"])]],
    ])("changes nothing for %s", (_, addresses) => {
      expect(elisionSelected(journal, stored().view, addresses, 3)).toBe(journal);
    });

    it("clears a pin, so that nothing goes back to the tab shown before it", () => {
      const { view } = stored();
      const pinnedFirst = pinned(journal, HELD);
      const elided = elisionSelected(pinnedFirst, view, [ELISION_5], 1);
      expect([pinnedFirst.picked.tab, elided]).toEqual([
        "timestamp",
        { picked: { tab: "elisions", openings: 1 }, pin: null },
      ]);
      expect(pinned(elided, null)).toBe(elided);
    });

    it("is a choice made when the elision is selected, against an editor opened while hidden", () => {
      const { view } = stored();
      const hidden = toggled({ tab: "journal", openings: 1 }, 1, false);
      const afterEditor = elisionSelected({ picked: hidden, pin: null }, view, [AUTOMATIC], 2);
      const beforeEditor = elisionSelected({ picked: hidden, pin: null }, view, [ELISION_5], 1);
      expect([toggled(afterEditor.picked, 2, true), toggled(beforeEditor.picked, 2, true)]).toEqual(
        [
          { tab: "elisions", openings: 2 },
          { tab: "level", openings: 2 },
        ],
      );
    });

    it("leaves the tab to a pin or a MatchStamp arriving afterwards, which give it back", () => {
      const elided = elisionSelected(journal, stored().view, [ELISION_5], 1);
      const pinnedAfter = pinned(elided, HELD);
      const matched = matchPinned({ picked: elided.picked, match: null }, MATCH);
      expect([pinnedAfter, pinned(pinnedAfter, null)]).toEqual([
        { picked: { tab: "timestamp", openings: 1 }, pin: { ...HELD, before: "elisions" } },
        { picked: { tab: "elisions", openings: 1 }, pin: null },
      ]);
      expect([matched, matchPinned(matched, null)]).toEqual([
        { picked: { tab: "matchstamp", openings: 1 }, match: { ...MATCH, before: "elisions" } },
        { picked: { tab: "elisions", openings: 1 }, match: null },
      ]);
    });
  });

  describe("in the drawer", () => {
    /**
     * The drawer over `bundle_elisions_stored`, closed, `score` selected;
     * `select` changes the selection and tells the drawer, as the editor
     * does on every change of it.
     */
    function drawer() {
      const selection = holder<Selection>(selectionOf([at("score")]));
      const shown = mount(providing(InspectorDrawer), {
        target: document.body,
        context: posting(),
        props: {
          live: liveStore(stored()),
          get selection() {
            return selection.value;
          },
          placement: null,
          storageKey: null,
          ...noMatchClaims(),
        },
      });
      app = shown;
      flushSync();
      return {
        setOpen(open: boolean) {
          shown.setOpen(open);
          flushSync();
        },
        isOpen: () => shown.isOpen(),
        select(addresses: Address[]) {
          selection.value = selectionOf(addresses);
          shown.selected(addresses);
          flushSync();
        },
      };
    }

    /** The selected tab's text. */
    const current = () =>
      document.querySelector('[role="tab"][aria-selected="true"]')?.textContent?.trim();
    /** The disclosure state of the selected elision's form block; `null` without it. */
    const form = () =>
      document
        .querySelector('[data-testid="elision-form-expand"]')
        ?.getAttribute("aria-expanded") ?? null;

    it("shows the Elisions tab with the form open, and keeps a tab chosen afterwards", () => {
      const inspector = drawer();
      inspector.setOpen(true);
      click("Properties");
      inspector.select([ELISION_5]);
      expect([current(), form()]).toEqual(["Elisions", "true"]);
      click("Properties");
      expect(current()).toBe("Properties");
      inspector.select([ELISION_3]);
      expect([current(), form()]).toEqual(["Elisions", "true"]);
      inspector.select([]);
      expect([current(), form()]).toEqual(["Elisions", null]);
      inspector.select([ELISION_5, ELISION_3]);
      expect(current()).toBe("Elisions");
      click("Journal");
      inspector.select([ELISION_5, at("score")]);
      inspector.select([at("score")]);
      expect(current()).toBe("Journal");
    });

    it("leaves a closed drawer closed, the Elisions tab shown when it opens", () => {
      const inspector = drawer();
      inspector.setOpen(true);
      click("Journal");
      inspector.setOpen(false);
      inspector.select([ELISION_5]);
      expect([inspector.isOpen(), document.querySelector('[role="tab"]')]).toEqual([false, null]);
      inspector.select([at("score")]);
      inspector.setOpen(true);
      expect(current()).toBe("Elisions");
    });

    it("shows the Elisions tab with the form open for an automatic elision the drawing draws", () => {
      const selected: Address[] = [{ block: blockId(0), id: "score", part: ["elision"] }];
      const selection = holder<Selection>(selectionOf([]));
      const shown = mount(providing(InspectorDrawer), {
        target: document.body,
        context: posting(),
        props: {
          live: liveStore(withElisionMode(storeOf("groups/group_grandchild"), "auto")),
          get selection() {
            return selection.value;
          },
          placement: null,
          storageKey: null,
          ...noMatchClaims(),
        },
      });
      app = shown;
      shown.setOpen(true);
      flushSync();
      click("Properties");
      selection.value = selectionOf(selected);
      shown.selected(selected);
      flushSync();
      expect([current(), form()]).toEqual(["Elisions", "true"]);
    });
  });
});
