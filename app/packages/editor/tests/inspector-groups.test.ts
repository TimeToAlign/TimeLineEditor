/**
 * The group memberships of the Properties tab and its New group button;
 * the expected values are derived in `README.md` ("Group memberships").
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import type { Level, Selection } from "@timetoalign/tilie-arranger";
import { liveStore, resolveSelection, selectionOf } from "@timetoalign/tilie-arranger";
import type { CommandEntry, ElementAddress, SetCommand, Store } from "@timetoalign/tilie-core";
import { createStore, isLoadError, readWorkspace } from "@timetoalign/tilie-core";
import { fontMetrics } from "@timetoalign/timetoshare";
import { flushSync, mount, unmount } from "svelte";
import { afterEach, describe, expect, it } from "vitest";
import { groupsOf, membersOf, newGroupOf } from "../src/inspector/groups.ts";
import PropertiesPanel from "../src/inspector/PropertiesPanel.svelte";
import { PropertyDrafts } from "../src/inspector/propertyDrafts.svelte.ts";
import { selectedBlock } from "../src/inspector/selection.ts";
import { holder } from "./holder.svelte.ts";
import { editorAt } from "./support.ts";

const M = "bmixed0000";

/** Why `recording` cannot join `group_2`, which holds its child `excerpt`. */
const RECORDING_REFUSED =
  "'recording' and 'excerpt', a member of group 'group_2', would hold one another";

/** A store reading the end-to-end `bundles` workspace, the generator's output. */
function storeOf(): Store {
  const text = readFileSync(
    path.join(import.meta.dirname, "..", "..", "..", "e2e", "fixtures", "bundles.tle.json"),
    "utf8",
  );
  const read = readWorkspace(text);
  if (isLoadError(read)) throw new Error("bundles.tle.json is refused");
  return createStore(read);
}

/** The selection of `elements` of `M`; `{}` names the block. */
function addresses(...elements: ElementAddress[]): Selection {
  return selectionOf(elements.map((element) => ({ block: M, ...element })));
}

/** What `read` offers for `elements` of `M` at `level`. */
function offered<T>(
  read: typeof groupsOf | typeof membersOf | typeof newGroupOf,
  elements: ElementAddress[],
  level: Level = "arranger",
): T {
  const store = storeOf();
  const editing = editorAt(level, M);
  const subjects = resolveSelection(store.view, addresses(...elements), editing, fontMetrics);
  return read(store.view, subjects, editing) as T;
}

/** The `set` of each timeline's `groups`, in order. */
function groups(...changes: [string, string[]][]): SetCommand {
  return {
    type: "set",
    changes: changes.map(([id, list]) => ({ target: { block: M, id }, values: { groups: list } })),
  };
}

const CARD = (id: string): ElementAddress => ({ id, part: ["card"] });

describe("the groups of selected timelines", () => {
  it("lists every group with the membership of one timeline", () => {
    expect(offered(groupsOf, [CARD("score")])).toEqual({
      legend: "Groups",
      rows: [
        {
          id: "group_1",
          label: "Performance",
          depth: 0,
          checked: true,
          mixed: false,
          command: groups(["score", []]),
          refusal: null,
        },
        {
          id: "group_2",
          label: "Facsimile",
          depth: 0,
          checked: false,
          mixed: false,
          command: groups(["score", ["group_1", "group_2"]]),
          refusal: null,
        },
      ],
    });
  });

  it("shows a membership some of the timelines have as mixed", () => {
    const shown = offered<ReturnType<typeof groupsOf>>(groupsOf, [
      { id: "score" },
      { id: "annotations" },
    ]);
    expect(shown?.rows.map(({ checked, mixed, command }) => ({ checked, mixed, command }))).toEqual(
      [
        { checked: false, mixed: true, command: groups(["annotations", ["group_1"]]) },
        {
          checked: false,
          mixed: false,
          command: groups(["score", ["group_1", "group_2"]], ["annotations", ["group_2"]]),
        },
      ],
    );
  });

  it("disables a group the timeline cannot join, with core's reason", () => {
    const shown = offered<ReturnType<typeof groupsOf>>(groupsOf, [{ id: "recording" }]);
    expect(shown?.rows.map((row) => row.refusal)).toEqual([null, RECORDING_REFUSED]);
  });

  it("offers none in a manifest without groups", () => {
    const store = storeOf();
    const group = (id: string) => ({ block: M, id });
    expect(store.dispatch({ type: "remove", targets: [group("group_1"), group("group_2")] })).toBe(
      null,
    );
    const subjects = resolveSelection(store.view, addresses(CARD("score")), null, fontMetrics);
    expect(groupsOf(store.view, subjects, null)).toBe(null);
  });

  it("offers the same rows in the bundle editor", () => {
    expect(offered(groupsOf, [CARD("score")], "bundle")).toEqual(
      offered(groupsOf, [CARD("score")]),
    );
  });

  it.each<[ElementAddress[], Level]>([
    [[{}], "arranger"],
    [[{ id: "group_1" }], "arranger"],
    [[{ id: "performance", facet: "markers" }], "arranger"],
    [[{ id: "cmap_1" }], "arranger"],
    [[CARD("score")], "group"],
    [[CARD("score")], "timeline"],
  ])("offers none for %j at the level %s", (elements, level) => {
    expect(offered(groupsOf, elements, level)).toBe(null);
  });
});

describe("the members of a selected group", () => {
  it.each<[ElementAddress]>([[{ id: "group_1" }], [{ id: "group_1", part: ["name"] }]])(
    "lists every timeline of the manifest for %j",
    (element) => {
      const shown = offered<ReturnType<typeof membersOf>>(membersOf, [element]);
      expect(shown?.legend).toBe("Members");
      expect(
        shown?.rows.map(({ id, label, depth, checked }) => [id, label, depth, checked]),
      ).toEqual([
        ["annotations", "Annotations", 0, false],
        ["page", "Page", 0, false],
        ["performance", "Performance", 0, true],
        ["recording", "Recording", 0, false],
        ["excerpt", "Excerpt", 1, false],
        ["score", "Score", 0, true],
      ]);
      const command = (id: string) => shown?.rows.find((row) => row.id === id)?.command;
      expect(command("annotations")).toEqual(groups(["annotations", ["group_1"]]));
      expect(command("performance")).toEqual(groups(["performance", []]));
      expect(shown?.rows.every((row) => row.refusal === null && !row.mixed)).toBe(true);
    },
  );

  it("disables a timeline that cannot join, and keeps a member's other groups", () => {
    const shown = offered<ReturnType<typeof membersOf>>(membersOf, [{ id: "group_2" }]);
    const row = (id: string) => shown?.rows.find((item) => item.id === id);
    expect(row("recording")?.refusal).toBe(RECORDING_REFUSED);
    expect(row("score")?.command).toEqual(groups(["score", ["group_1", "group_2"]]));
  });

  it.each<[ElementAddress[], Level]>([
    [[{ id: "group_1" }, { id: "group_2" }], "arranger"],
    [[{ id: "score" }], "arranger"],
    [[{}], "arranger"],
    [[{ id: "group_1" }], "group"],
  ])("offers none for %j at the level %s", (elements, level) => {
    expect(offered(membersOf, elements, level)).toBe(null);
  });
});

describe("a new group", () => {
  it("adds an empty group to a selected block, its id the smallest free one", () => {
    expect(offered(newGroupOf, [{}])).toEqual({
      command: { type: "add", into: { block: M }, group: { id: "group_3", members: [] } },
      refusal: null,
    });
  });

  it("adds a group of the selected timelines, in selection order", () => {
    expect(offered(newGroupOf, [CARD("score"), { id: "annotations" }])).toEqual({
      command: {
        type: "add",
        into: { block: M },
        group: { id: "group_3", members: ["score", "annotations"] },
      },
      refusal: null,
    });
  });

  it("refuses a group of a timeline and its child, with core's reason", () => {
    const shown = offered<ReturnType<typeof newGroupOf>>(newGroupOf, [
      { id: "recording" },
      { id: "excerpt" },
    ]);
    expect(shown?.refusal).toBe(
      "'excerpt' and 'recording', a member of group 'group_3', would hold one another",
    );
  });

  it.each<[ElementAddress[], Level]>([
    [[{ id: "group_1" }], "arranger"],
    [[{}, { id: "score" }], "arranger"],
    [[], "arranger"],
    [[CARD("score")], "group"],
  ])("offers none for %j at the level %s", (elements, level) => {
    expect(offered(newGroupOf, elements, level)).toBe(null);
  });
});

describe("the mounted memberships", () => {
  let app: ReturnType<typeof mount> | undefined;

  afterEach(() => {
    if (app !== undefined) unmount(app);
    app = undefined;
    document.body.innerHTML = "";
  });

  /** Mount the panel on `store` at the arranger, its selection held so a test can change it. */
  function show(store: Store, elements: ElementAddress[]) {
    const live = liveStore(store);
    const selection = holder(addresses(...elements));
    const subjects = () => resolveSelection(live.view, selection.value, null, fontMetrics);
    app = mount(PropertiesPanel, {
      target: document.body,
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
    return selection;
  }

  /** The checkbox labelled `text` in the fieldset `legend`. */
  function box(legend: string, text: string): HTMLInputElement {
    const fieldset = [...document.querySelectorAll("fieldset")].find(
      (item) => item.querySelector("legend")?.textContent === legend,
    );
    const label = [...(fieldset?.querySelectorAll("label") ?? [])].find(
      (item) => item.textContent?.trim() === text,
    );
    const input = label?.querySelector("input");
    if (input === null || input === undefined) throw new Error(`no box ${text} in ${legend}`);
    return input;
  }

  function lastCommand(store: Store): unknown {
    return (store.journal.at(-1) as CommandEntry | undefined)?.command;
  }

  function click(element: HTMLElement): void {
    element.click();
    flushSync();
  }

  it("puts a timeline into a second group and takes it out of the first", () => {
    const store = storeOf();
    show(store, [CARD("score")]);
    expect(box("Groups", "Performance").checked).toBe(true);
    expect(box("Groups", "Facsimile").checked).toBe(false);
    const before = store.journal.length;
    click(box("Groups", "Facsimile"));
    expect(store.journal.length).toBe(before + 1);
    expect(lastCommand(store)).toEqual(groups(["score", ["group_1", "group_2"]]));
    expect(box("Groups", "Facsimile").checked).toBe(true);
    click(box("Groups", "Performance"));
    expect(store.journal.length).toBe(before + 2);
    expect(lastCommand(store)).toEqual(groups(["score", ["group_2"]]));
    expect(box("Groups", "Performance").checked).toBe(false);
  });

  it("disables a group the timeline cannot join, its reason the tooltip", () => {
    show(storeOf(), [{ id: "recording" }]);
    const refused = box("Groups", "Facsimile");
    expect(refused.disabled).toBe(true);
    expect(refused.closest("label")?.title).toBe(RECORDING_REFUSED);
    expect(box("Groups", "Performance").disabled).toBe(false);
  });

  it("lists a group's members, a child indented", () => {
    show(storeOf(), [{ id: "group_1" }]);
    const labels = [...document.querySelectorAll("fieldset label")];
    expect(labels.map((label) => label.textContent?.trim())).toEqual([
      "Annotations",
      "Page",
      "Performance",
      "Recording",
      "Excerpt",
      "Score",
    ]);
    expect((labels[4] as HTMLElement).style.paddingInlineStart).toBe("1.25rem");
    expect(box("Members", "Score").checked).toBe(true);
  });

  it("adds a new group to the selected block in one entry", () => {
    const store = storeOf();
    show(store, [{}]);
    const button = [...document.querySelectorAll("button")].find(
      (item) => item.textContent === "New group",
    );
    if (button === undefined) throw new Error("no New group button");
    const before = store.journal.length;
    click(button);
    expect(store.journal.length).toBe(before + 1);
    expect(lastCommand(store)).toEqual({
      type: "add",
      into: { block: M },
      group: { id: "group_3", members: [] },
    });
    expect(store.view.blocks[M]?.manifest.groups.map((group) => group.id)).toEqual([
      "group_1",
      "group_2",
      "group_3",
    ]);
  });

  it("shows the store's refusal until the selection changes", () => {
    const store = storeOf();
    expect(store.open({ block: M, id: "group_1" })).toBe(null);
    const selection = show(store, [CARD("score")]);
    const command = groups(["score", ["group_1", "group_2"]]);
    const before = store.journal.length;
    click(box("Groups", "Facsimile"));
    expect(store.journal.length).toBe(before);
    expect(box("Groups", "Facsimile").checked).toBe(false);
    const message = store.dispatch(command)?.message;
    expect(message).toBeDefined();
    const status = () => document.querySelector("p.problem[role=status]")?.textContent;
    expect(status()).toBe(message);
    selection.value = addresses(CARD("performance"));
    flushSync();
    expect(status()).toBe("");
  });
});
