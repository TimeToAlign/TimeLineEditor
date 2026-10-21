// @vitest-environment jsdom
/**
 * The Delete key inside an editor: the edited element, or a part standing
 * for it, is never removed; the rest of a selection is. Derived in
 * `README.md` ("Deleting").
 */

import type { Address, Command, Store } from "@timetoalign/tilie-core";
import {
  cardAddress,
  findTimeline,
  idAddress,
  inBlock,
  partAddress,
} from "@timetoalign/tilie-core";
import { describe, expect, it } from "vitest";
import { rulesOf } from "../src/containers.ts";
import type { Editing } from "../src/editing.ts";
import { handleKey, type KeyContext } from "../src/keys.ts";
import { NOTHING_SELECTED, type Selection, selectionOf } from "../src/selection.ts";
import { A, blockIn, metrics, mixedView, storeOf } from "./support.ts";

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

/** Delete pressed on the canvas of `store` with `addresses` selected. */
function deleteIn(store: Store, ...addresses: Address[]): Pressed {
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
    editors: store.editing.length,
    select: (next) => {
      selection = next;
    },
    dispatch: (command) => {
      pressed.dispatched.push(command);
      return store.dispatch(command) === null;
    },
    refuse: (message) => pressed.refused.push(message),
    setMode: () => {},
    toggleLock: () => {},
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
  return { ...pressed, selection };
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
