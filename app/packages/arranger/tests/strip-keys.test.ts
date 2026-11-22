// @vitest-environment jsdom
/**
 * The keys on a selected strip of an elision (README, "Elisions on the
 * canvas"): Delete, the bracket held with the arrows moving an edge, Shift
 * with the arrows changing the width.
 */

import type { Address, Command, View } from "@timetoalign/tilie-core";
import { DEFAULT_GRANULARITY, idAddress, inBlock, partAddress } from "@timetoalign/tilie-core";
import { describe, expect, it } from "vitest";
import { rulesOf } from "../src/containers.ts";
import { handleKey, type KeyContext } from "../src/keys.ts";
import { type Selection, selectionOf } from "../src/selection.ts";
import type { StripEdge } from "../src/strips.ts";
import { A, blockIn, metrics, storeOf, viewOf, withGrid } from "./support.ts";

const STORED = "bundles/bundle_elisions_stored";
const GRANDCHILD = "groups/group_grandchild";

/** What a key did: the refusals shown, the commands sent, the selection after, the view after. */
interface Pressed {
  readonly taken: boolean;
  readonly refused: string[];
  readonly dispatched: Command[];
  readonly selection: Selection;
  readonly view: View;
}

/** `key` pressed (with `shift`, the bracket `held`) on `view` with `addresses` selected. */
function press(
  view: View,
  addresses: readonly Address[],
  key: string,
  {
    shift = false,
    held = null,
    readonly = false,
    code = "",
  }: {
    shift?: boolean;
    held?: StripEdge | null;
    readonly?: boolean;
    code?: string;
  } = {},
): Pressed {
  const store = storeOf(view);
  const refused: string[] = [];
  const dispatched: Command[] = [];
  let selection: Selection = selectionOf(addresses);
  const context: KeyContext = {
    view: store.view,
    selection,
    editing: null,
    rules: rulesOf(null, { locked: false, readonly }),
    metrics,
    granularity: DEFAULT_GRANULARITY,
    heldEdge: () => held,
    editors: 0,
    select: (next) => {
      selection = next;
    },
    dispatch: (command) => {
      dispatched.push(command);
      return store.dispatch(command) === null;
    },
    refuse: (message) => refused.push(message),
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
  const event = new KeyboardEvent("keydown", { key, code, shiftKey: shift });
  const taken = handleKey(context, event);
  return { taken, refused, dispatched, selection, view: store.view };
}

const stored = (id: string) => inBlock(A, idAddress(id));
const automatic = (id: string) => inBlock(A, partAddress(idAddress(id), "elision"));

describe("Delete on strips", () => {
  it("removes a stored elision", () => {
    const pressed = press(viewOf({ id: A, fixture: STORED }), [stored("elision_5")], "Delete");
    expect(pressed.dispatched).toEqual([{ type: "remove", targets: [stored("elision_5")] }]);
    const ids = blockIn(pressed.view, A).manifest.graphical?.elisions?.map(({ id }) => id);
    expect(ids?.includes("elision_5")).toBe(false);
    expect(ids?.filter((id) => ["elision_2", "elision_4", "elision_6"].includes(id))).toEqual([
      "elision_2",
      "elision_4",
      "elision_6",
    ]);
  });

  it("removes a default one by storing the other defaults of its card", () => {
    const pressed = press(
      viewOf({ id: A, fixture: GRANDCHILD }),
      [automatic("movement")],
      "Delete",
    );
    expect(pressed.dispatched).toEqual([
      {
        type: "add",
        into: { block: A },
        elision: [
          { timeline: "score", start: [0, 1], end: [16, 1] },
          { timeline: "score", start: [32, 1], end: [64, 1] },
        ],
      },
    ]);
    expect(pressed.selection.size).toBe(0);
  });

  it("refuses to delete the last defaults of a card, or defaults with anything else", () => {
    const view = viewOf({ id: A, fixture: GRANDCHILD });
    const both = press(view, [automatic("score"), automatic("movement")], "Delete");
    expect([both.refused, both.dispatched]).toEqual([
      ["The last automatic elisions of a card are not deleted: choose Full to draw it whole."],
      [],
    ]);
    const mixed = press(view, [automatic("movement"), { block: A }], "Delete");
    expect([mixed.refused, mixed.dispatched]).toEqual([
      ["Delete automatic elisions on their own, those of one block at a time."],
      [],
    ]);
  });
});

describe("the arrows on a strip", () => {
  const coarse = () => withGrid(viewOf({ id: A, fixture: STORED }), 50, true);

  it("moves the held edge by one grid step", () => {
    const start = press(coarse(), [stored("elision_5")], "ArrowLeft", { held: "start" });
    expect(start.dispatched).toEqual([
      { type: "set", changes: [{ target: stored("elision_5"), values: { start: [31, 1] } }] },
    ]);
    const end = press(coarse(), [stored("elision_5")], "ArrowRight", { held: "end" });
    expect(end.dispatched).toEqual([
      { type: "set", changes: [{ target: stored("elision_5"), values: { end: [49, 1] } }] },
    ]);
  });

  it("takes a bracket while a strip is selected, and only then", () => {
    const taken = press(coarse(), [stored("elision_5")], "[", { code: "BracketLeft" });
    expect([taken.taken, taken.dispatched]).toEqual([true, []]);
    expect(press(coarse(), [{ block: A }], "[", { code: "BracketLeft" }).taken).toBe(false);
  });

  it("widens and narrows with Shift, in the elision's form", () => {
    const wider = press(coarse(), [stored("elision_4")], "ArrowRight", { shift: true });
    expect(wider.dispatched).toEqual([
      {
        type: "set",
        changes: [{ target: stored("elision_4"), values: { width: { ratio: 0.5625 } } }],
      },
    ]);
    const narrower = press(
      viewOf({ id: A, fixture: GRANDCHILD }),
      [automatic("movement")],
      "ArrowLeft",
      {
        shift: true,
      },
    );
    expect(narrower.dispatched).toEqual([
      {
        type: "add",
        into: { block: A },
        elision: [
          { timeline: "score", start: [0, 1], end: [16, 1] },
          { timeline: "movement", start: [0, 1], end: [8, 1], width: { ratio: 0.1229 } },
          { timeline: "score", start: [32, 1], end: [64, 1] },
        ],
      },
    ]);
    expect([...narrower.selection.values()]).toEqual([stored("elision_2")]);
  });

  it("leaves a plain arrow, and every arrow on a read-only canvas, without a command", () => {
    const plain = press(coarse(), [stored("elision_5")], "ArrowLeft");
    expect([plain.taken, plain.dispatched]).toEqual([false, []]);
    const readonly = press(coarse(), [stored("elision_5")], "ArrowLeft", {
      held: "start",
      readonly: true,
    });
    expect(readonly.dispatched).toEqual([]);
  });
});
