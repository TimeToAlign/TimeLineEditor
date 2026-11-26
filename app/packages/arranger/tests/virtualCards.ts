/**
 * The views of the virtual cards' tests (README, "Virtual cards, ribbons,
 * the flow flag and the flow switch"), built from TimeToShare's fixtures
 * through core's commands.
 */

import type { ElementAddress, View } from "@timetoalign/tilie-core";
import { idAddress, inBlock } from "@timetoalign/tilie-core";
import type { Drawing, LineAxis } from "@timetoalign/tilie-layout";
import { lineAxes } from "@timetoalign/tilie-layout";
import { drawingOf } from "../src/drawing.ts";
import { A, blockIn, changed, metrics, viewOf } from "./support.ts";

export const ROOT = "allegro";
export const DEFAULT = "allegro_default";
export const BY_HAND = "allegro_by_hand";

/** `view` with the virtual timeline `id` of block A placed at `(x, y)` by one `set` of its place. */
export function placedVirtual(view: View, id: string, x: number, y: number): View {
  return changed(view, {
    type: "set",
    changes: [{ target: inBlock(A, idAddress(id)), values: { place: { x, y } } }],
  });
}

/** Block A holding `flow/virtual_cards`, `allegro_default` placed at (0, 200), `allegro_by_hand` at (0, 400). */
export function virtualView(): View {
  const view = viewOf({ id: A, fixture: "flow/virtual_cards", x: 40, y: 80 });
  return placedVirtual(placedVirtual(view, DEFAULT, 0, 200), BY_HAND, 0, 400);
}

/** Block A's drawing in `view`. */
export function drawingIn(view: View): Drawing {
  return drawingOf(blockIn(view, A), view.graphical, metrics);
}

/** The address of chunk `index`'s brace of the virtual timeline `id`. */
export function brace(id: string, index: number): ElementAddress {
  return { id, facet: "regions", part: [index] };
}

/** The one drawn line of `timeline` in `drawing`, with its key. */
export function lineOf(drawing: Drawing, timeline: string): [string, LineAxis] {
  const lines = [...lineAxes(drawing)].filter(([, axis]) => axis.timeline === timeline);
  const [one] = lines;
  if (one === undefined || lines.length !== 1)
    throw new Error(`${timeline} has ${lines.length} lines`);
  return one;
}

/** The drawn brace element of chunk `index` of `id`: its ends. */
export function braceEnds(drawing: Drawing, id: string, index: number): { x1: number; x2: number } {
  const found = drawing.elements.find(
    (element) =>
      element.type === "region" &&
      element.address.id === id &&
      element.address.part?.length === 1 &&
      element.address.part[0] === index,
  );
  if (found?.type !== "region") throw new Error(`no brace ${index} of ${id}`);
  return { x1: found.x1, x2: found.x2 };
}
