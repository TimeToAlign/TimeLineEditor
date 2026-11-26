/**
 * One selected flow-control element in the Properties tab: its read-only
 * rows, its provenance and the user's belief; the expected values are
 * derived in `README.md` ("A flow-control element").
 */

import type { Selection } from "@timetoalign/tilie-arranger";
import { liveStore, resolveSelection, selectionOf } from "@timetoalign/tilie-arranger";
import type {
  Address,
  BeliefState,
  Block,
  ElementAddress,
  FlowControlElement,
  Store,
} from "@timetoalign/tilie-core";
import { DEFAULT_USER, isRejected, statedBy } from "@timetoalign/tilie-core";
import { defaultCatalogue, fontMetrics } from "@timetoalign/timetoshare";
import { flushSync, mount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  beliefCommand,
  destinationRows,
  flowOf,
  flowProvenance,
  flowRows,
  readingOf,
} from "../src/inspector/flow.ts";
import PropertiesPanel from "../src/inspector/PropertiesPanel.svelte";
import { PropertyDrafts } from "../src/inspector/propertyDrafts.svelte.ts";
import { selectedBlock } from "../src/inspector/selection.ts";
import { iriNames } from "../src/iris.ts";
import { holder } from "./holder.svelte.ts";
import { blockId, posting, providing, regionNamed, storeOf } from "./support.ts";

const A = blockId(0);
const EDITOR = "https://example.org/people/editor";

/** The selection of `elements` of the one block. */
const selected = (...elements: ElementAddress[]): Selection =>
  selectionOf(elements.map((element) => ({ block: A, ...element })));

/** The flow-control element the selection of `elements` names in a store of `fixture`. */
function flowIn(store: Store, ...elements: ElementAddress[]) {
  return flowOf(resolveSelection(store.view, selected(...elements), null, fontMetrics));
}

/** The rows of the element `id` of `fixture`, label to value, for the default user; under `kept`, the block's belief filter. */
function rows(fixture: string, id: string, kept?: readonly BeliefState[]): [string, string][] {
  const store = storeOf(fixture);
  if (kept !== undefined) {
    expect(
      store.configure({ matchClaimFilters: { [A]: { timelines: null, beliefs: kept } } }),
    ).toBeNull();
  }
  const flow = flowIn(store, { id });
  if (flow === null) throw new Error(`${fixture} holds no flow-control element ${id}`);
  const reading = readingOf(store.view, flow.block, DEFAULT_USER);
  return flowRows(flow, reading).map((row) => [row.label, row.value]);
}

function elementIn(store: Store, id: string): FlowControlElement {
  const found = store.view.blocks[A]?.manifest.timelines[0]?.flow_control.find(
    (item) => item.id === id,
  );
  if (found === undefined) throw new Error(`no flow-control element ${id}`);
  return found;
}

describe("the flow-control element a selection names", () => {
  it("is the one element selected, itself or by its label", () => {
    const store = storeOf("flow/sonata_exposition");
    const target = { block: A, id: "jump_1" };
    expect(flowIn(store, { id: "jump_1" })?.target).toEqual(target);
    // A label is drawn, and so selected, where the element states one: the D.C. al Fine's.
    const sections = storeOf("flow/sections");
    const labelled = { id: "jump_1", part: ["label" as const] };
    expect(flowIn(sections, labelled)?.target).toEqual(target);
    expect(flowIn(sections, { id: "jump_1" }, labelled)?.target).toEqual(target);
    expect(flowIn(store, { id: "jump_target_1" })?.element.role).toBe("jump_target");
    expect(flowIn(store, { id: "jump_1" })?.timeline.id).toBe("score");
  });

  it("is none for nothing, for anything else and for several", () => {
    const store = storeOf("flow/sonata_exposition");
    const section = regionNamed("flow/sonata_exposition", "A");
    expect(flowIn(store)).toBeNull();
    expect(flowIn(store, { id: "score" })).toBeNull();
    expect(flowIn(store, { id: section })).toBeNull();
    expect(flowIn(store, { id: "score", facet: "flow_control" })).toBeNull();
    expect(flowIn(store, { id: "jump_1" }, { id: "jump_2" })).toBeNull();
    expect(flowIn(store, { id: "jump_1" }, { id: "score" })).toBeNull();
    expect(flowIn(store, { id: "jump_1" }, { id: section })).toBeNull();
  });

  it("is the jump selected with what its destinations mark, in either order", () => {
    const sonata = storeOf("flow/sonata_exposition");
    const jump = { block: A, id: "jump_1" };
    expect(flowIn(sonata, { id: "jump_1" }, { id: "jump_target_1" })?.target).toEqual(jump);
    expect(flowIn(sonata, { id: "jump_target_1" }, { id: "jump_1" })?.target).toEqual(jump);
    expect(
      flowIn(storeOf("flow/sections"), { id: "jump_2" }, { id: "section_break_1" })?.target,
    ).toEqual({ block: A, id: "jump_2" });
    expect(flowIn(storeOf("flow/ossia"), { id: "jump_1" }, { id: "ossia" })?.target).toEqual(jump);
  });
});

describe("the rows of a flow-control element", () => {
  it("give a jump's role and coordinate, its destinations being rows of their own", () => {
    expect(rows("flow/sonata_exposition", "jump_1")).toEqual([
      ["Role", "jump"],
      ["Coordinate", "12 ♩"],
    ]);
    expect(rows("flow/loop", "jump_1")).toEqual([
      ["Role", "jump"],
      ["Coordinate", "6″"],
    ]);
  });

  it("word the other roles: how they are notated, and when a break ends the flow", () => {
    expect(rows("flow/sonata_exposition", "break_1")).toEqual([
      ["Role", "break"],
      ["Coordinate", "16 ♩"],
      ["Manifestation", "volta"],
    ]);
    expect(rows("flow/sections", "break_1")).toEqual([
      ["Role", "break"],
      ["Coordinate", "8 ♩"],
      ["Manifestation", "fine"],
      ["Ends the flow", "after jump 'jump_1' took its destination"],
    ]);
    expect(rows("flow/sections", "section_break_1")).toEqual([
      ["Role", "section break"],
      ["Coordinate", "16 ♩"],
    ]);
    expect(rows("flow/repairs", "barline_1")).toEqual([
      ["Role", "barline"],
      ["Coordinate", "8 ♩"],
      ["Manifestation", "double_barline"],
    ]);
    expect(rows("flow/repairs", "jump_target_1")).toEqual([
      ["Role", "jump target"],
      ["Coordinate", "8 ♩"],
      ["Manifestation", "repeat_start"],
    ]);
  });

  it("say whether the user's flows read the element", () => {
    expect(rows("flow/repairs", "jump_1")).toEqual([
      ["Role", "jump"],
      ["Coordinate", "16 ♩"],
      ["Status", "rejected by another actor: your flows read it"],
    ]);
    expect(rows("flow/repairs", "jump_2").map(([label]) => label)).toEqual(["Role", "Coordinate"]);
    const leftOut = ["Status", "left out by the belief filter: no flow reads it"];
    expect(rows("flow/repairs", "barline_1", ["true"]).at(-1)).toEqual(leftOut);
    expect(rows("flow/repairs", "jump_2", ["true"]).at(-1)).toEqual(leftOut);
  });

  it("read for the user under the block's belief filter", () => {
    const store = storeOf("flow/repairs");
    const block = store.view.blocks[A] as Block;
    expect(readingOf(store.view, block, DEFAULT_USER)).toEqual({
      believer: statedBy(DEFAULT_USER),
      beliefs: ["true", "undecided", "unlikely"],
    });
  });
});

describe("the destinations of a jump", () => {
  /** The destinations of the jump `id` in `store`: place, name, ID, at, conditions, notation, marked IDs. */
  function destinations(store: Store, id: string) {
    const flow = flowIn(store, { id });
    if (flow === null) throw new Error(`no flow-control element ${id}`);
    return destinationRows(flow).map((row) => [
      row.place,
      row.name,
      row.id,
      row.at,
      row.conditions,
      row.notation,
      row.marks.map((address) => {
        expect(address.block).toBe(A);
        return address.id;
      }),
    ]);
  }

  it("lead to the jump target, by a distance, or to the start of the section", () => {
    const sonata = storeOf("flow/sonata_exposition");
    expect(destinations(sonata, "jump_1")).toEqual([
      ["by 0 ♩", null, null, "12 ♩", "on pass 1", "notated as volta", ["jump_1"]],
      [
        "jump target",
        null,
        "jump_target_1",
        "16 ♩",
        "on pass 2",
        "notated as volta",
        ["jump_1", "jump_target_1"],
      ],
    ]);
    expect(destinations(sonata, "jump_2")).toEqual([
      [
        "start of its section",
        null,
        null,
        "0 ♩",
        "at most once",
        "notated as repeat_end",
        ["jump_2"],
      ],
    ]);
    expect(destinations(storeOf("flow/sections"), "jump_2")).toEqual([
      [
        "start of its section",
        null,
        "section_break_1",
        "16 ♩",
        "at most once; without restoring what it goes back over",
        "notated as da_capo",
        ["jump_2", "section_break_1"],
      ],
    ]);
    expect(destinations(storeOf("flow/sonata_exposition"), "break_1")).toEqual([]);
  });

  it("word every condition and how each is notated", () => {
    expect(destinations(storeOf("flow/repeat_end_and_dal_segno"), "jump_1")).toEqual([
      [
        "jump target",
        null,
        "jump_target_1",
        "4 ♩",
        "at most once",
        "notated as repeat_end",
        ["jump_1", "jump_target_1"],
      ],
      [
        "jump target",
        null,
        "jump_target_2",
        "8 ♩",
        "at most once; without restoring what it goes back over",
        "notated as dal_segno; labelled 'D.S.'",
        ["jump_1", "jump_target_2"],
      ],
    ]);
    const coda = storeOf("flow/dal_segno_al_coda");
    const toCoda = [
      "jump target",
      null,
      "jump_target_2",
      "24 ♩",
      "after jump 'jump_2' took its destination",
      "notated as to_coda",
      ["jump_1", "jump_target_2"],
    ];
    expect(destinations(coda, "jump_1")).toEqual([toCoda]);
    const naming = { target: { block: A, id: "jump_target_2" }, values: { name: "Coda" } };
    expect(coda.dispatch({ type: "set", changes: [naming] })).toBeNull();
    expect(destinations(coda, "jump_1")).toEqual([toCoda.with(1, "Coda")]);
    expect(destinations(storeOf("flow/ossia"), "jump_1")).toEqual([
      ["by 0 ♩", null, null, "4 ♩", "", "", ["jump_1"]],
      [
        "child timeline",
        "Ossia",
        "ossia",
        "16 ♩",
        "not determined by the source",
        "notated as ossia",
        ["jump_1", "ossia"],
      ],
    ]);
    expect(destinations(storeOf("flow/volta_passes"), "jump_1")[0]?.[4]).toBe("on passes 1 and 3");
    expect(destinations(storeOf("flow/loop"), "jump_1")).toEqual([
      [
        "jump target",
        null,
        "jump_target_1",
        "2″",
        "at most 127 times",
        "",
        ["jump_1", "jump_target_1"],
      ],
    ]);
  });

  it("name a region and the timeline itself", () => {
    const store = storeOf("flow/sonata_exposition");
    const section = regionNamed("flow/sonata_exposition", "B");
    const jump = {
      id: "jump_3",
      role: "jump",
      coordinate: [20, 1],
      targets: [{ to: section }, { to: "score" }],
    };
    expect(
      store.dispatch({ type: "add", into: { block: A, id: "score" }, flow_control: jump }),
    ).toBeNull();
    expect(destinations(store, "jump_3").map((row) => row.slice(0, 4))).toEqual([
      ["region", "B", section, "12 ♩"],
      ["timeline", "Score", "score", "0 ♩"],
    ]);
  });
});

describe("the provenance of a flow-control element", () => {
  const provenanceOf = (store: Store, id: string, user = DEFAULT_USER) => {
    const flow = flowIn(store, { id });
    if (flow === null) throw new Error(`no flow-control element ${id}`);
    const names = iriNames(defaultCatalogue(), store.view.blocks[A]?.manifest["@context"]);
    return flowProvenance(flow, user, names);
  };

  it("is one line per entry and the beliefs of all of them", () => {
    const store = storeOf("flow/repairs");
    const rejected = provenanceOf(store, "jump_1");
    expect(rejected.entries.map((line) => [line.method, line.date, line.beliefs.length])).toEqual([
      ["imported", null, 1],
    ]);
    expect(rejected.beliefs?.beliefs).toEqual([
      {
        actor: EDITOR,
        iri: EDITOR,
        who: EDITOR,
        belief: "false",
        date: "2026-11-25",
        note: "The repeat begins at the double barline.",
      },
    ]);
    expect(rejected.mine).toBeNull();
    const added = provenanceOf(store, "jump_2");
    expect(added.entries.map((line) => [line.method, line.date])).toEqual([
      ["manual", "2026-11-25"],
    ]);
    expect(added.entries[0]?.statedBy.map((item) => item.text)).toEqual([EDITOR]);
    expect(provenanceOf(store, "barline_1")).toMatchObject({
      entries: [{ method: "imported", beliefs: [] }],
      beliefs: { beliefs: [] },
      mine: null,
    });
  });

  it("is none for an element that states none", () => {
    expect(provenanceOf(storeOf("flow/sections"), "jump_1")).toEqual({
      entries: [],
      beliefs: null,
      mine: null,
    });
  });

  it("finds the user's own belief by the IRI the user states as", () => {
    const store = storeOf("flow/repairs");
    const flow = flowIn(store, { id: "jump_2" });
    if (flow === null) throw new Error("flow/repairs holds jump_2");
    expect(store.dispatch(beliefCommand(flow, DEFAULT_USER, "unlikely", "2026-11-26"))).toBeNull();
    expect(provenanceOf(store, "jump_2").mine).toBe("unlikely");
    expect(elementIn(store, "jump_2").provenance).toEqual([
      {
        beliefs: [
          { actor: EDITOR, belief: "true", date: "2026-11-25" },
          { actor: statedBy(DEFAULT_USER), belief: "unlikely", date: "2026-11-26" },
        ],
        date: "2026-11-25",
        method: "manual",
        stated_by: [EDITOR],
      },
    ]);
  });
});

describe("the Properties tab on a flow-control element", () => {
  let app: ReturnType<typeof mount> | undefined;
  let informed: string[] = [];

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-26T12:00:00Z"));
  });

  afterEach(() => {
    if (app !== undefined) unmount(app);
    app = undefined;
    document.body.innerHTML = "";
    vi.useRealTimers();
  });

  /** The selection the panel shows, which choosing a destination replaces. */
  let selection = holder<Selection>(selected());
  /** What the panel asked the canvas to select, each call's addresses. */
  let chosen: (readonly Address[])[] = [];

  /** Mount the panel on `store` with `elements` of its block selected. */
  function show(store: Store, ...elements: ElementAddress[]): void {
    const live = liveStore(store);
    selection = holder(selected(...elements));
    chosen = [];
    const subjects = () => resolveSelection(live.view, selection.value, null, fontMetrics);
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
        onselect: (addresses: readonly Address[]) => {
          chosen.push(addresses);
          selection.value = selectionOf(addresses);
        },
      },
    });
    flushSync();
  }

  const texts = (selector: string): string[] =>
    [...document.querySelectorAll(selector)].map((item) => item.textContent?.trim() ?? "");

  /** The texts of `selector`, each with its runs of white space read as one space. */
  const spoken = (selector: string): string[] =>
    texts(selector).map((text) => text.replace(/\s+/g, " "));

  /** The belief button `word`. */
  function button(word: "True" | "Unlikely" | "False"): HTMLButtonElement {
    const found = [...document.querySelectorAll<HTMLButtonElement>(".belief button")].find(
      (item) => item.textContent?.trim() === word,
    );
    if (found === undefined) throw new Error(`no belief button ${word}`);
    return found;
  }

  const pressed = (): string[] => texts('.belief button[aria-pressed="true"]');

  it("shows the name, the rows and the provenance, and no field that changes the element", () => {
    const store = storeOf("flow/repairs");
    show(store, { id: "jump_1" });
    expect(document.querySelector<HTMLInputElement>('input[name="name"]')?.value).toBe("");
    expect(texts('[data-testid="flow-rows"] dt')).toEqual(["Role", "Coordinate", "Status"]);
    expect(texts('[data-testid="flow-rows"] dd')).toEqual([
      "jump",
      "16 ♩",
      "rejected by another actor: your flows read it",
    ]);
    expect(spoken('[data-testid="flow-destinations"] li button .place')).toEqual([
      "start of its section at 0 ♩",
    ]);
    expect([...document.querySelectorAll("input")].map((input) => input.name)).toEqual(["name"]);
    expect(texts('[data-testid="metadata-paradata"] dt')).toEqual(["method"]);
    expect(texts('[data-testid="metadata-paradata"] dd')).toEqual(["imported"]);
    expect(texts('[data-testid="metadata-beliefs"] li')).toEqual([
      `${EDITOR} believes it false (2026-11-25): The repeat begins at the double barline.`,
    ]);
    expect(texts(".belief button")).toEqual(["True", "Unlikely", "False"]);
    expect(pressed()).toEqual([]);
    expect(
      document.querySelector('[data-testid="flow-provenance"] [role="group"]')?.ariaLabel,
    ).toBe("Your belief in jump 'jump_1'");
  });

  it("shows the label of an element as the element", () => {
    show(storeOf("flow/sections"), { id: "break_1", part: ["label"] });
    expect(texts('[data-testid="flow-rows"] dd')).toEqual([
      "break",
      "8 ♩",
      "fine",
      "after jump 'jump_1' took its destination",
    ]);
    expect(texts('[data-testid="flow-provenance"] .no-provenance')).toEqual([
      "No provenance entry: the manifest states it.",
    ]);
    expect(texts('[data-testid="metadata-beliefs"]')).toEqual(["No one has stated a belief."]);
  });

  it("records a belief as one set of the element's belief, and rejects by the belief false", () => {
    const store = storeOf("flow/repairs");
    const me = statedBy(DEFAULT_USER);
    show(store, { id: "jump_2" });
    expect(isRejected(elementIn(store, "jump_2"))).toBe(false);
    const entries = store.listed.length;
    button("False").click();
    flushSync();
    expect(informed).toEqual([]);
    expect(store.listed.length).toBe(entries + 1);
    expect(store.listed.at(-1)?.entry).toMatchObject({
      command: {
        type: "set",
        changes: [
          {
            target: { block: A, id: "jump_2" },
            values: { belief: { actor: me, belief: "false", date: "2026-11-26" } },
          },
        ],
      },
    });
    // The entry keeps how the element was made and the editor's belief; the user's joins it.
    expect(elementIn(store, "jump_2").provenance).toEqual([
      {
        beliefs: [
          { actor: EDITOR, belief: "true", date: "2026-11-25" },
          { actor: me, belief: "false", date: "2026-11-26" },
        ],
        date: "2026-11-25",
        method: "manual",
        stated_by: [EDITOR],
      },
    ]);
    expect(isRejected(elementIn(store, "jump_2"))).toBe(true);
    expect(pressed()).toEqual(["False"]);
    expect(texts('[data-testid="flow-rows"] dd').at(-1)).toBe("rejected by you: no flow reads it");
    // The belief held already is left as it is: no command, no message.
    button("False").click();
    flushSync();
    expect(store.listed.length).toBe(entries + 1);
    // Another belief replaces it in place, and the element is read again.
    button("True").click();
    flushSync();
    expect(store.listed.length).toBe(entries + 2);
    expect(elementIn(store, "jump_2").provenance?.[0]?.beliefs).toEqual([
      { actor: EDITOR, belief: "true", date: "2026-11-25" },
      { actor: me, belief: "true", date: "2026-11-26" },
    ]);
    expect(isRejected(elementIn(store, "jump_2"))).toBe(false);
    expect(pressed()).toEqual(["True"]);
  });

  it("posts the store's refusal of a belief that leaves the flow control invalid", () => {
    const store = storeOf("flow/sections");
    show(store, { id: "jump_1" });
    const entries = store.listed.length;
    // The Fine's `ends` names this jump: rejecting it would leave the Fine dangling.
    button("False").click();
    flushSync();
    expect(store.listed.length).toBe(entries);
    expect(informed).toEqual(["'jump_1' names no jump of this timeline"]);
    expect(isRejected(elementIn(store, "jump_1"))).toBe(false);
    expect(pressed()).toEqual([]);
  });

  it("selects the jump with what a chosen destination leads to, and keeps showing the jump", () => {
    show(storeOf("flow/repeat_end_and_dal_segno"), { id: "jump_1" });
    const destination = (index: number) => {
      const found = document.querySelectorAll<HTMLButtonElement>(
        '[data-testid="flow-destinations"] li button',
      )[index];
      if (found === undefined) throw new Error(`no destination ${index}`);
      return found;
    };
    const chosenRows = () =>
      [...document.querySelectorAll('[data-testid="flow-destinations"] li button')].map((item) =>
        item.getAttribute("aria-pressed"),
      );
    expect(spoken('[data-testid="flow-destinations"] li button .place')).toEqual([
      "jump target jump_target_1 at 4 ♩",
      "jump target jump_target_2 at 8 ♩",
    ]);
    expect(texts('[data-testid="flow-destinations"] li:first-child .conditions')).toEqual([
      "at most once",
    ]);
    expect(texts('[data-testid="flow-destinations"] li:first-child .notation')).toEqual([
      "notated as repeat_end",
    ]);
    expect(chosenRows()).toEqual(["false", "false"]);
    destination(1).click();
    flushSync();
    expect(chosen).toEqual([
      [
        { block: A, id: "jump_1" },
        { block: A, id: "jump_target_2" },
      ],
    ]);
    // The jump is still inspected: its name field and rows stay, the second destination is chosen.
    expect(document.querySelector<HTMLInputElement>('input[name="name"]')?.value).toBe("");
    expect(texts('[data-testid="flow-rows"] dd')).toEqual(["jump", "16 ♩"]);
    expect(chosenRows()).toEqual(["false", "true"]);
    // Another selection chooses none.
    selection.value = selected({ id: "jump_1" });
    flushSync();
    expect(chosenRows()).toEqual(["false", "false"]);
  });

  it("selects the jump alone for a destination where nothing stands", () => {
    show(storeOf("flow/sonata_exposition"), { id: "jump_2" });
    document.querySelector<HTMLButtonElement>('[data-testid="flow-destinations"] button')?.click();
    flushSync();
    expect(chosen).toEqual([[{ block: A, id: "jump_2" }]]);
  });
});
