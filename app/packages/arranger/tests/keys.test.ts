// @vitest-environment jsdom
/**
 * The Delete key inside an editor: the edited element, or a part standing
 * for it, is never removed; the rest of a selection is. A deletion taking
 * virtual timelines along asks first. Derived in `README.md` ("Deleting").
 */

import type { Address, Command, Store } from "@timetoalign/tilie-core";
import {
  cardAddress,
  DEFAULT_GRANULARITY,
  findTimeline,
  idAddress,
  inBlock,
  partAddress,
} from "@timetoalign/tilie-core";
import { describe, expect, it } from "vitest";
import { deleteQuestion, rootHidden } from "../src/commands.ts";
import { rulesOf } from "../src/containers.ts";
import type { Editing } from "../src/editing.ts";
import { DEFAULT_GAP_MODES } from "../src/gaps.ts";
import { handleKey, type KeyContext } from "../src/keys.ts";
import { NOTHING_SELECTED, type Selection, selectionOf } from "../src/selection.ts";
import { A, blockIn, metrics, mixedView, storeOf } from "./support.ts";
import { virtualView } from "./virtualCards.ts";

const REFUSED = "Close its editor to delete the edited element.";

/** What a Delete did: the refusals shown, the commands sent, the selection after. */
interface Pressed {
  readonly refused: string[];
  readonly dispatched: Command[];
  readonly selection: Selection;
}

/** The store of `mixed` with the editor of `target` open, or none. */
function storeIn(target: Address | null): Store {
  const store = storeOf(mixedView());
  if (target !== null) {
    const refusal = store.open(target);
    if (refusal !== null) throw new Error(refusal.message);
  }
  return store;
}

/** A host asked no deletion question: asking one fails the test. */
const NO_QUESTION: KeyContext["confirmDelete"] = () => {
  throw new Error("no deletion question expected");
};

/** Delete pressed on the canvas of `store` with `addresses` selected, `confirm` its host's question. */
function deleteWith(
  confirm: KeyContext["confirmDelete"],
  store: Store,
  ...addresses: Address[]
): Pressed & { readonly selected: () => Selection } {
  const innermost = store.editing.at(-1);
  const editing: Editing | null =
    innermost === undefined ? null : { target: innermost.target, kind: innermost.kind };
  const pressed = { refused: [] as string[], dispatched: [] as Command[] };
  let selection: Selection = selectionOf(addresses);
  const context: KeyContext = {
    view: store.view,
    selection,
    editing,
    rules: rulesOf(editing, { locked: false, readonly: false }),
    metrics,
    pane: undefined,
    granularity: DEFAULT_GRANULARITY,
    gapModes: DEFAULT_GAP_MODES,
    toggleGapMode: () => {},
    gapEdge: "end",
    chooseGapEdge: () => {},
    editors: store.editing.length,
    select: (next) => {
      selection = next;
    },
    dispatch: (command) => {
      pressed.dispatched.push(command);
      return store.dispatch(command) === null;
    },
    refuse: (message) => pressed.refused.push(message),
    confirmDelete: confirm,
    setMode: () => {},
    toggleLock: () => {},
    toggleCoordinates: () => {},
    toggleMatches: () => {},
    zoomIn: () => {},
    zoomOut: () => {},
    fit: () => {},
    abortGesture: () => false,
    done: () => {},
    open: () => {},
    openable: () => null,
    pressed: () => null,
  };
  const taken = handleKey(context, new KeyboardEvent("keydown", { key: "Delete" }));
  expect(taken).toBe(true);
  return { ...pressed, selection, selected: () => selection };
}

/** Delete pressed on the canvas of `store` with `addresses` selected, asking nothing. */
function deleteIn(store: Store, ...addresses: Address[]): Pressed {
  const { selected: _, ...pressed } = deleteWith(NO_QUESTION, store, ...addresses);
  return pressed;
}

describe("Delete inside an editor", () => {
  const group = inBlock(A, idAddress("group_1"));
  const score = inBlock(A, idAddress("score"));
  it.each([
    [{ block: A }, [{ block: A }]],
    [group, [group]],
    [group, [inBlock(A, partAddress(idAddress("group_1"), "name"))]],
    [score, [inBlock(A, cardAddress("score"))]],
    [score, [inBlock(A, partAddress(idAddress("score"), "name"))]],
  ])("in the editor of %j refuses to delete %j, the edited element", (target, addresses) => {
    const store = storeIn(target);
    const [view, entries] = [store.view, store.journal.length];
    const pressed = deleteIn(store, ...addresses);
    expect(pressed).toEqual({
      refused: [REFUSED],
      dispatched: [],
      selection: selectionOf(addresses),
    });
    expect(store.view).toBe(view);
    expect(store.journal).toHaveLength(entries);
  });

  it("removes the rest of a selection that holds the edited element", () => {
    const store = storeIn(inBlock(A, idAddress("excerpt")));
    const dlt = inBlock(A, idAddress("dlt_1"));
    const pressed = deleteIn(store, inBlock(A, cardAddress("excerpt")), dlt);
    expect(pressed).toEqual({
      refused: [],
      dispatched: [{ type: "remove", targets: [dlt] }],
      selection: NOTHING_SELECTED,
    });
    const { manifest } = blockIn(store.view, A);
    expect(findTimeline(manifest, "dlt_1")).toBeUndefined();
    expect(findTimeline(manifest, "excerpt")?.children).toEqual([]);
  });

  it("leaves an ancestor card alone, and removes the rest of the selection", () => {
    // `recording` holds the member `excerpt`: its one card is its ancestor card behind `group_2`.
    const card = inBlock(A, cardAddress("recording"));
    const store = storeIn(null);
    const view = store.view;
    expect(deleteIn(store, card)).toEqual({
      refused: [],
      dispatched: [],
      selection: selectionOf([card]),
    });
    expect(store.view).toBe(view);
    const dlt = inBlock(A, idAddress("dlt_1"));
    expect(deleteIn(store, card, dlt)).toEqual({
      refused: [],
      dispatched: [{ type: "remove", targets: [dlt] }],
      selection: NOTHING_SELECTED,
    });
    const alone = storeIn(null);
    deleteIn(alone, dlt);
    expect(blockIn(store.view, A).manifest).toEqual(blockIn(alone.view, A).manifest);
  });

  it("removes the block on the arranger", () => {
    const store = storeIn(null);
    const pressed = deleteIn(store, { block: A });
    expect(pressed).toEqual({
      refused: [],
      dispatched: [{ type: "remove", targets: [{ block: A }] }],
      selection: NOTHING_SELECTED,
    });
    expect(Object.keys(store.view.blocks)).toEqual([]);
  });
});

describe("Delete taking virtual timelines along", () => {
  const allegro = inBlock(A, idAddress("allegro"));
  const question = (store: Store) => {
    const asked = deleteQuestion(store.view, { type: "remove", targets: [allegro] });
    if (asked === null || asked.hide === null) throw new Error("no question");
    return asked;
  };

  it.each([
    ["Delete all", "remove"],
    ["Hide instead", "hide"],
  ] as const)("asks first, then stores %s", async (_, answer) => {
    const store = storeOf(virtualView());
    const expected = question(store);
    const asked: unknown[] = [];
    let answerNow = () => {};
    const chosen = new Promise<void>((resolve) => {
      answerNow = resolve;
    });
    const card = inBlock(A, cardAddress("allegro"));
    const pressed = deleteWith(
      (shown) => {
        asked.push(shown);
        return chosen.then(() => shown[answer]);
      },
      store,
      card,
    );
    expect([asked, pressed.dispatched, pressed.selected()]).toEqual([
      [expected],
      [],
      selectionOf([card]),
    ]);
    answerNow();
    await chosen;
    await Promise.resolve();
    expect([pressed.dispatched, pressed.selected()]).toEqual([
      [expected[answer]],
      NOTHING_SELECTED,
    ]);
    const { manifest } = blockIn(store.view, A);
    expect(manifest.timelines.map((timeline) => timeline.id)).toEqual(
      answer === "remove" ? [] : ["allegro"],
    );
    expect(rootHidden(manifest, "allegro")).toBe(answer === "hide");
  });

  it("stores nothing on Cancel", async () => {
    const store = storeOf(virtualView());
    const card = inBlock(A, cardAddress("allegro"));
    const answered = Promise.resolve(null);
    const pressed = deleteWith(() => answered, store, card);
    await answered;
    await Promise.resolve();
    expect([pressed.dispatched, pressed.selected()]).toEqual([[], selectionOf([card])]);
    expect(blockIn(store.view, A).manifest.timelines.map((timeline) => timeline.id)).toEqual([
      "allegro",
    ]);
  });

  it("asks nothing where the block goes whole", () => {
    const store = storeOf(virtualView());
    expect(deleteIn(store, { block: A })).toEqual({
      refused: [],
      dispatched: [{ type: "remove", targets: [{ block: A }] }],
      selection: NOTHING_SELECTED,
    });
  });
});
