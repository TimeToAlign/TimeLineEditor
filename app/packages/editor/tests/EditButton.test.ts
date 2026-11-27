/** The Edit button; the expected values are derived in `README.md` ("Editing", The Edit button). */

import type { Editing } from "@timetoalign/tilie-arranger";
import { resolveSelection, selectionOf } from "@timetoalign/tilie-arranger";
import type { Address, Store } from "@timetoalign/tilie-core";
import { fontMetrics } from "@timetoalign/timetoshare";
import { flushSync, mount, unmount } from "svelte";
import { afterEach, describe, expect, it } from "vitest";
import EditButton from "../src/inspector/EditButton.svelte";
import { posting, storeOf } from "./support.ts";

const A = "0000000000";
const SCORE_CARD: Address = { block: A, id: "score", part: ["card"] };
const SCORE: Address = { block: A, id: "score" };
const GROUP: Address = { block: A, id: "group_1" };

let app: ReturnType<typeof mount> | undefined;

afterEach(() => {
  if (app !== undefined) unmount(app);
  app = undefined;
  document.body.innerHTML = "";
});

/**
 * The button for `selected` on `store` under `editing`, on a canvas opening
 * editors or not, mounted; what it asks to select is pushed to `chosen`.
 */
function show(
  store: Store,
  selected: readonly Address[],
  editing: Editing | null = null,
  opens = true,
  chosen: (readonly Address[])[] = [],
): void {
  const subjects = resolveSelection(store.view, selectionOf(selected), editing, fontMetrics);
  const onselect = (addresses: readonly Address[]) => {
    chosen.push(addresses);
  };
  app = mount(EditButton, {
    target: document.body,
    context: posting(),
    props: { view: store.view, store, subjects, editing, opens, onselect },
  });
  flushSync();
}

/** `flow/virtual_cards` with the virtual timeline `allegro_default` placed at (0, 200), so its card is drawn. */
function placedVirtual(): Store {
  const store = storeOf("flow/virtual_cards");
  const place = {
    target: { block: A, id: "allegro_default" },
    values: { place: { x: 0, y: 200 } },
  };
  expect(store.dispatch({ type: "set", changes: [place] })).toBeNull();
  return store;
}

function button(): HTMLButtonElement | null {
  return document.querySelector<HTMLButtonElement>('[data-testid="edit-button"]');
}

function path(store: Store) {
  return store.editing.map(({ target, kind }) => ({ target, kind }));
}

describe("the Edit button", () => {
  it("opens the editor a double-click on the selection would open", () => {
    const store = storeOf("bundles/bundle_mixed");
    const chosen: (readonly Address[])[] = [];
    show(store, [SCORE_CARD], null, true, chosen);
    expect(button()?.textContent).toBe("Edit");
    expect(button()?.title).toBe("Open the editor of Score");
    button()?.click();
    expect(path(store)).toEqual([{ target: SCORE, kind: "timeline" }]);
    expect(chosen).toEqual([]);
  });

  it("opens a frame's group editor", () => {
    const store = storeOf("bundles/bundle_mixed");
    show(store, [GROUP]);
    button()?.click();
    expect(path(store)).toEqual([{ target: GROUP, kind: "group" }]);
  });

  it("shows nothing for several addresses, none, or the edited element", () => {
    const store = storeOf("bundles/bundle_mixed");
    show(store, [SCORE_CARD, GROUP]);
    expect(button()).toBeNull();
    if (app !== undefined) unmount(app);
    show(store, []);
    expect(button()).toBeNull();
    if (app !== undefined) unmount(app);
    const error = store.open(SCORE);
    if (error !== null) throw new Error(error.message);
    show(store, [SCORE_CARD], { target: SCORE, kind: "timeline" });
    expect(button()).toBeNull();
  });

  it("shows nothing where the canvas opens no editor", () => {
    const store = storeOf("bundles/bundle_mixed");
    show(store, [SCORE_CARD], null, false);
    expect(button()).toBeNull();
    expect(path(store)).toEqual([]);
  });

  it("opens a chunk's flow-control editor and selects nothing more", () => {
    const store = placedVirtual();
    const chosen: (readonly Address[])[] = [];
    show(store, [{ block: A, id: "allegro_default", part: [1, "label"] }], null, true, chosen);
    button()?.click();
    expect(path(store)).toEqual([{ target: { block: A, id: "allegro" }, kind: "flow" }]);
    expect(chosen).toEqual([]);
  });
});
