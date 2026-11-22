// @vitest-environment jsdom
/**
 * The gesture of a strip's handles (README, "Elisions on the canvas"): the
 * strategy driven directly, its node actions recorded.
 */

import type { ElementAddress, View } from "@timetoalign/tilie-core";
import { apply, idAddress, inBlock, isCommandError, partAddress } from "@timetoalign/tilie-core";
import { describe, expect, it } from "vitest";
import { LEVELS } from "../src/containers.ts";
import type { StripHandle, StripLive } from "../src/gestures/strip.ts";
import { stripGesture } from "../src/gestures/strip.ts";
import type { BlockNode } from "../src/node.ts";
import type { NodeActions } from "../src/nodeActions.ts";
import { project } from "../src/project.ts";
import { NOTHING_SELECTED } from "../src/selection.ts";
import { piecesOf } from "../src/strips.ts";
import type { Call } from "./dom.ts";
import { recordingActions } from "./dom.ts";
import { A, metrics, viewOf } from "./support.ts";

const STORED = viewOf({ id: A, fixture: "bundles/bundle_elisions_stored" });
const GRANDCHILD = viewOf({ id: A, fixture: "groups/group_grandchild" });

function nodeOf(view: View): BlockNode {
  const [node] = project(view, NOTHING_SELECTED, [], metrics, null);
  if (node === undefined) throw new Error("no node");
  return node;
}

/** A gesture on `handle` of the first piece of `address`, its actions and flags recorded. */
function gesture(
  view: View,
  address: ElementAddress,
  handle: StripHandle,
  { readonly = false }: { readonly?: boolean } = {},
) {
  const node = nodeOf(view);
  const [piece] = piecesOf(node.data.drawing, address);
  if (piece === undefined) throw new Error("no piece");
  const recorded = recordingActions(view, {
    rules: readonly ? { ...LEVELS.arranger, resize: false } : LEVELS.arranger,
  });
  let now = view;
  const actions: NodeActions = { ...recorded.actions, view: () => now };
  const flags: (StripLive | null)[] = [];
  const strategy = stripGesture(
    {
      actions,
      target: () => ({ node, piece }),
      viewport: () => ({ x: 0, y: 0, zoom: 1 }),
      granularity: () => view.settings.granularity,
      live: (live) => flags.push(live),
    },
    handle,
  );
  const at = (x: number) => ({ drawing: { x, y: 0 }, screen: { x, y: 0 } });
  const press = strategy.takes(new PointerEvent("pointerdown"), at(0));
  return {
    strategy,
    press,
    at,
    calls: recorded.calls,
    flags,
    store: (next: View) => {
      now = next;
    },
  };
}

const kinds = (calls: readonly Call[]) => calls.map((call) => Object.keys(call)[0]);

describe("a strip's handle", () => {
  it("moves a stored elision's start and stores it", () => {
    const { strategy, press, at, calls, flags } = gesture(STORED, idAddress("elision_5"), "start");
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
    expect(flag?.text).toBe("Score, 30–48 quarters");
    if (command === null) throw new Error("no command");
    const after = apply(STORED, command);
    if (isCommandError(after)) throw new Error(after.message);
    const [moved] = piecesOf(nodeOf(after).data.drawing, idAddress("elision_5"));
    expect(flag?.at.x).toBe(nodeOf(after).position.x + (moved?.element.x1 ?? Number.NaN));
  });

  it("widens a canvas width by the pointer's travel", () => {
    const { strategy, press, at } = gesture(STORED, idAddress("elision_6"), "width");
    if (press === null) throw new Error("not taken");
    const value = strategy.value(press, at(15));
    expect(value === null ? null : strategy.command(press, value)).toEqual({
      type: "set",
      changes: [{ target: inBlock(A, idAddress("elision_6")), values: { width: { canvas: 45 } } }],
    });
  });

  it("takes no press on an edge the piece does not show, nor on a read-only canvas", () => {
    expect(gesture(STORED, idAddress("elision_6"), "start").press).toBeNull();
    expect(gesture(STORED, idAddress("elision_5"), "start", { readonly: true }).press).toBeNull();
  });

  it("stores a default piece with its card's defaults and selects what it became", () => {
    const address = partAddress(idAddress("movement"), "elision");
    const { strategy, press, at, calls, store } = gesture(GRANDCHILD, address, "end");
    if (press === null) throw new Error("not taken");
    const value = strategy.value(press, at(-10));
    if (value === null) throw new Error("no value");
    strategy.preview(press, value);
    const command = strategy.command(press, value);
    expect(command).toEqual({
      type: "add",
      into: { block: A },
      elision: [
        { timeline: "score", start: [0, 1], end: [16, 1] },
        { timeline: "movement", start: [0, 1], end: [33, 5] },
        { timeline: "score", start: [32, 1], end: [64, 1] },
      ],
    });
    if (command === null) throw new Error("no command");
    const after = apply(GRANDCHILD, command);
    if (isCommandError(after)) throw new Error(after.message);
    store(after);
    strategy.preview(press, null);
    expect(calls.at(-1)).toEqual({ select: inBlock(A, idAddress("elision_2")) });
  });

  it("selects nothing when the gesture ends without a change", () => {
    const address = partAddress(idAddress("movement"), "elision");
    const { strategy, press, at, calls } = gesture(GRANDCHILD, address, "end");
    if (press === null) throw new Error("not taken");
    const value = strategy.value(press, at(-10));
    if (value === null) throw new Error("no value");
    strategy.preview(press, value);
    strategy.preview(press, null);
    expect(kinds(calls)).toEqual(["preview", "preview"]);
  });
});
