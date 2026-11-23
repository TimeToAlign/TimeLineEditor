// @vitest-environment jsdom
/**
 * The gesture of a gap's handles (README, "Elisions on the canvas", the
 * gesture): the strategy driven directly, its node actions recorded.
 */

import type { ElementAddress, View } from "@timetoalign/tilie-core";
import { apply, idAddress, inBlock, isCommandError } from "@timetoalign/tilie-core";
import { describe, expect, it } from "vitest";
import { LEVELS } from "../src/containers.ts";
import type { GapEdge, GapModes } from "../src/gaps.ts";
import { piecesOf } from "../src/gaps.ts";
import type { GapLive } from "../src/gestures/gap.ts";
import { gapGesture } from "../src/gestures/gap.ts";
import type { BlockNode } from "../src/node.ts";
import type { NodeActions } from "../src/nodeActions.ts";
import { project } from "../src/project.ts";
import { NOTHING_SELECTED } from "../src/selection.ts";
import type { Call } from "./dom.ts";
import { recordingActions } from "./dom.ts";
import { A, metrics, viewOf } from "./support.ts";

const STORED = viewOf({ id: A, fixture: "bundles/bundle_elisions_stored" });
const COORDINATES: GapModes = { coordinates: true, width: false };
const WIDTH: GapModes = { coordinates: false, width: true };
/** `score`'s line in its ancestor card. */
const LINE = 105.98828125;

function nodeOf(view: View): BlockNode {
  const [node] = project(view, NOTHING_SELECTED, [], metrics, null);
  if (node === undefined) throw new Error("no node");
  return node;
}

/** A gesture on the `edge` handle of the first stored piece of `address`, recorded. */
function gesture(
  view: View,
  address: ElementAddress,
  edge: GapEdge,
  modes: GapModes,
  { readonly = false }: { readonly?: boolean } = {},
) {
  const node = nodeOf(view);
  const piece = piecesOf(node.data.drawing, address).find(({ gap }) => gap.origin === "stored");
  if (piece === undefined) throw new Error("no piece");
  const recorded = recordingActions(view, {
    rules: readonly ? { ...LEVELS.arranger, resize: false } : LEVELS.arranger,
  });
  const actions: NodeActions = { ...recorded.actions, view: () => view };
  const flags: (GapLive | null)[] = [];
  const strategy = gapGesture(
    {
      actions,
      target: () => ({ node, piece }),
      viewport: () => ({ x: 0, y: 0, zoom: 1 }),
      granularity: () => view.settings.granularity,
      modes: () => modes,
      live: (live) => flags.push(live),
    },
    edge,
  );
  const at = (x: number) => ({ drawing: { x, y: 0 }, screen: { x, y: 0 } });
  const press = strategy.takes(new PointerEvent("pointerdown"), at(0));
  return { strategy, press, at, calls: recorded.calls, flags };
}

const kinds = (calls: readonly Call[]) => calls.map((call) => Object.keys(call)[0]);

describe("a gap's handle", () => {
  it("moves a stored elision's start under Coordinates and stores it", () => {
    const { strategy, press, at, calls, flags } = gesture(
      STORED,
      idAddress("elision_5"),
      "start",
      COORDINATES,
    );
    if (press === null) throw new Error("not taken");
    const value = strategy.value(press, at(-100));
    if (value === null) throw new Error("no value");
    strategy.preview(press, value);
    const command = strategy.command(press, value);
    expect(command).toEqual({
      type: "set",
      changes: [{ target: inBlock(A, idAddress("elision_5")), values: { start: [30, 1] } }],
    });
    expect(kinds(calls)).toEqual(["preview"]);
    const [flag] = flags;
    if (command === null) throw new Error("no command");
    const after = apply(STORED, command);
    if (isCommandError(after)) throw new Error(after.message);
    const moved = nodeOf(after);
    const piece = piecesOf(moved.data.drawing, idAddress("elision_5")).find(
      ({ gap }) => gap.origin === "stored",
    );
    expect([flag?.text, flag?.at]).toEqual([
      "Score, 30–48 ♩",
      { x: moved.position.x + (piece?.gap.x1 ?? Number.NaN), y: moved.position.y + LINE },
    ]);
  });

  it("widens a canvas width by the pointer's travel under Width", () => {
    const { strategy, press, at, flags } = gesture(STORED, idAddress("elision_6"), "end", WIDTH);
    if (press === null) throw new Error("not taken");
    const value = strategy.value(press, at(15));
    if (value === null) throw new Error("no value");
    strategy.preview(press, value);
    expect(strategy.command(press, value)).toEqual({
      type: "set",
      changes: [{ target: inBlock(A, idAddress("elision_6")), values: { width: { canvas: 45 } } }],
    });
    expect(flags[0]?.text).toBe("Score, 40–56 ♩, 45 canvas units wide");
  });

  it("takes no press on an edge the piece does not reach, nor on a read-only canvas", () => {
    expect(gesture(STORED, idAddress("elision_6"), "start", COORDINATES).press).toBeNull();
    expect(
      gesture(STORED, idAddress("elision_5"), "start", COORDINATES, { readonly: true }).press,
    ).toBeNull();
  });
});
