// @vitest-environment jsdom
/**
 * The keys on a selected elision (README, "Elisions on the canvas", items
 * 17 and 18): Delete, `[` and `]` choosing the edge, the arrows moving it
 * under the gap modes, `1` and `2` toggling the modes.
 */

import type { Address, Command, View } from "@timetoalign/tilie-core";
import { DEFAULT_GRANULARITY, idAddress, inBlock, partAddress } from "@timetoalign/tilie-core";
import { describe, expect, it } from "vitest";
import { rulesOf } from "../src/containers.ts";
import type { GapEdge, GapModes } from "../src/gaps.ts";
import { DEFAULT_GAP_MODES } from "../src/gaps.ts";
import { handleKey, type KeyContext } from "../src/keys.ts";
import { type Selection, selectionOf } from "../src/selection.ts";
import { A, metrics, storeOf, viewOf, withGrid } from "./support.ts";

const STORED = withGrid(viewOf({ id: A, fixture: "bundles/bundle_elisions_stored" }), 50, false);
const INSIDE = viewOf({ id: A, fixture: "groups/group_elided_inside" });

/** What the keys did: whether each was taken, the refusals, the commands, the modes and edge after. */
interface Pressed {
  readonly taken: boolean[];
  readonly refused: string[];
  readonly dispatched: Command[];
  readonly modes: GapModes;
  readonly edge: GapEdge;
  readonly mode: string | null;
}

/** `keys` pressed in turn on `view` with `addresses` selected, one canvas, one store. */
function press(
  view: View,
  addresses: readonly Address[],
  keys: readonly string[],
  { readonly = false }: { readonly?: boolean } = {},
): Pressed {
  const store = storeOf(view);
  const refused: string[] = [];
  const dispatched: Command[] = [];
  let selection: Selection = selectionOf(addresses);
  let modes = DEFAULT_GAP_MODES;
  let edge: GapEdge = "end";
  let mode: string | null = null;
  const taken = keys.map((key) => {
    const context: KeyContext = {
      view: store.view,
      selection,
      editing: null,
      rules: rulesOf(null, { locked: false, readonly }),
      metrics,
      pane: undefined,
      granularity: DEFAULT_GRANULARITY,
      gapModes: modes,
      toggleGapMode: (chosen) => {
        const next = { ...modes, [chosen]: !modes[chosen] };
        if (next.coordinates || next.width) modes = next;
      },
      gapEdge: edge,
      chooseGapEdge: (next) => {
        edge = next;
      },
      editors: 0,
      select: (next) => {
        selection = next;
      },
      dispatch: (command) => {
        dispatched.push(command);
        return store.dispatch(command) === null;
      },
      refuse: (message) => refused.push(message),
      setMode: (next) => {
        mode = next;
      },
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
    return handleKey(context, new KeyboardEvent("keydown", { key }));
  });
  return { taken, refused, dispatched, modes, edge, mode };
}

const stored = (id: string) => inBlock(A, idAddress(id));
const automatic = (id: string) => inBlock(A, partAddress(idAddress(id), "elision"));
const set = (id: string, values: object) => ({
  type: "set",
  changes: [{ target: stored(id), values }],
});

describe("Delete on gaps", () => {
  it("removes a stored elision", () => {
    expect(press(STORED, [stored("elision_5")], ["Delete"]).dispatched).toEqual([
      { type: "remove", targets: [stored("elision_5")] },
    ]);
  });

  it("refuses a default one", () => {
    const pressed = press(INSIDE, [automatic("first")], ["Delete"]);
    expect([pressed.taken, pressed.refused, pressed.dispatched]).toEqual([
      [true],
      ["Automatic elisions are not deleted one by one: choose Custom to edit them."],
      [],
    ]);
  });
});

describe("moving an edge", () => {
  it("moves the chosen edge one grid step", () => {
    expect(press(STORED, [stored("elision_5")], ["]", "ArrowRight"]).dispatched).toEqual([
      set("elision_5", { end: [49, 1] }),
    ]);
    expect(press(STORED, [stored("elision_5")], ["[", "ArrowLeft"]).dispatched).toEqual([
      set("elision_5", { start: [31, 1] }),
    ]);
  });

  it("chooses the edge by the character typed, and only on a selected elision", () => {
    const chosen = press(STORED, [stored("elision_5")], ["["]);
    expect([chosen.taken, chosen.edge, chosen.dispatched]).toEqual([[true], "start", []]);
    expect(press(STORED, [], ["["]).taken).toEqual([false]);
  });

  it("toggles the gap modes on a selected elision, the resize modes elsewhere", () => {
    const toggled = press(STORED, [stored("elision_6")], ["2", "ArrowRight"]);
    expect([toggled.modes, toggled.mode, toggled.dispatched]).toEqual([
      { coordinates: true, width: true },
      null,
      [set("elision_6", { end: [57, 1], width: { canvas: 80 } })],
    ]);
    const alone = press(STORED, [stored("elision_6")], ["2", "1", "ArrowRight"]);
    expect([alone.modes, alone.dispatched]).toEqual([
      { coordinates: false, width: true },
      [set("elision_6", { width: { canvas: 80 } })],
    ]);
    expect(press(STORED, [stored("elision_6")], ["1"]).modes).toEqual(DEFAULT_GAP_MODES);
    expect(press(STORED, [], ["2"]).mode).toBe("box");
  });

  it("takes a plain arrow on a default gap and changes nothing; read-only, nothing", () => {
    const pressed = press(INSIDE, [automatic("first")], ["ArrowLeft"]);
    expect([pressed.taken, pressed.dispatched]).toEqual([[true], []]);
    expect(
      press(STORED, [stored("elision_5")], ["]", "ArrowRight"], { readonly: true }).dispatched,
    ).toEqual([]);
  });
});
