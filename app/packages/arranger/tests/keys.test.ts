// @vitest-environment jsdom
/**
 * The Delete key inside an editor: the edited element, or a part standing
 * for it, is never removed; the rest of a selection is. Derived in
 * `README.md` ("Deleting").
 */

import type { Command, Store } from "@timetoalign/tilie-core";
import { findTimeline } from "@timetoalign/tilie-core";
import { describe, expect, it } from "vitest";
import { rulesOf } from "../src/containers.ts";
import type { Editing } from "../src/editing.ts";
import { handleKey, type KeyContext } from "../src/keys.ts";
import type { Selection } from "../src/selection.ts";
import { A, blockIn, metrics, mixedView, storeOf } from "./support.ts";

const REFUSED = "Close its editor to delete the edited element.";

/** What a Delete did: the refusals shown, the commands sent, the selection after. */
interface Pressed {
  readonly refused: string[];
  readonly dispatched: Command[];
  readonly selection: Selection;
}

/** The store of `mixed` with the editor of `target` open, or none. */
function storeIn(target: string | null): Store {
  const store = storeOf(mixedView());
  if (target !== null) {
    const refusal = store.open(target);
    if (refusal !== null) throw new Error(refusal.message);
  }
  return store;
}

/** Delete pressed on the canvas of `store` with `addresses` selected. */
function deleteIn(store: Store, ...addresses: string[]): Pressed {
  const innermost = store.editing.at(-1);
  const editing: Editing | null =
    innermost === undefined ? null : { target: innermost.target, kind: innermost.kind };
  const pressed = { refused: [] as string[], dispatched: [] as Command[] };
  let selection: Selection = new Set(addresses);
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
  it.each([
    [A, [A]],
    [`${A}/group_1`, [`${A}/group_1`]],
    [`${A}/group_1`, [`${A}/group_1/name`]],
    [`${A}/score`, [`${A}/score/card`]],
    [`${A}/score`, [`${A}/score/name`]],
  ])("in the editor of %s refuses to delete %j, the edited element", (target, addresses) => {
    const store = storeIn(target);
    const [view, entries] = [store.view, store.journal.length];
    const pressed = deleteIn(store, ...addresses);
    expect(pressed).toEqual({ refused: [REFUSED], dispatched: [], selection: new Set(addresses) });
    expect(store.view).toBe(view);
    expect(store.journal).toHaveLength(entries);
  });

  it("removes the rest of a selection that holds the edited element", () => {
    const store = storeIn(`${A}/excerpt`);
    const pressed = deleteIn(store, `${A}/excerpt/card`, `${A}/dlt_1`);
    expect(pressed).toEqual({
      refused: [],
      dispatched: [{ type: "remove", targets: [`${A}/dlt_1`] }],
      selection: new Set(),
    });
    const { manifest } = blockIn(store.view, A);
    expect(findTimeline(manifest, "dlt_1")).toBeUndefined();
    expect(findTimeline(manifest, "excerpt")?.children).toEqual([]);
  });

  it("removes the block on the arranger", () => {
    const store = storeIn(null);
    const pressed = deleteIn(store, A);
    expect(pressed).toEqual({
      refused: [],
      dispatched: [{ type: "remove", targets: [A] }],
      selection: new Set(),
    });
    expect(Object.keys(store.view.blocks)).toEqual([]);
  });
});
