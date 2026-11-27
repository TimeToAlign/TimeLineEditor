/**
 * The views of the virtual cards' tests (README, "Virtual cards, ribbons,
 * the flow flag and the flow switch"), built from TimeToShare's fixtures
 * through core's commands.
 */

import type { ElementAddress, View } from "@timetoalign/tilie-core";
import { idAddress, inBlock } from "@timetoalign/tilie-core";
import { toFloat, toRational } from "@timetoalign/tilie-core/numbers";
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

/** The address of chunk `index` of the virtual timeline `id`, `{id, part: [index]}`. */
export function chunkAt(id: string, index: number): ElementAddress {
  return { id, part: [index] };
}

/**
 * The drawn line of `timeline` in `drawing`, with its key: its one axis, or,
 * where `at` is given, the first of its axes (one per run, a line drawn with
 * a run once having several) whose span holds the position `at`.
 */
export function lineOf(drawing: Drawing, timeline: string, at?: number): [string, LineAxis] {
  const lines = [...lineAxes(drawing)].filter(([, axis]) => axis.timeline === timeline);
  const holds = ([, axis]: [string, LineAxis]) => {
    const start = toFloat(toRational(axis.start));
    return at !== undefined && start <= at && at <= start + toFloat(toRational(axis.drawnLength));
  };
  const [one] = at === undefined ? lines : lines.filter(holds);
  if (one === undefined || (at === undefined && lines.length !== 1))
    throw new Error(`${timeline} has ${lines.length} lines`);
  return one;
}

/**
 * The drawn span of chunk `index` of `id` (section 8.10, Chunks), read off
 * the drawing as the specification places it: from its boundary `[index,
 * "start"]`, the line's start for chunk 0, to the boundary of the next
 * chunk the line draws, the line's end after the last; with the top of its
 * label (its baseline less its font size) above the line.
 */
export function chunkSpan(
  drawing: Drawing,
  id: string,
  index: number,
): { x1: number; x2: number; y: number; top: number } {
  const own = drawing.elements.filter(
    (element) => element.address.id === id && element.address.facet === undefined,
  );
  const line = own.find((element) => element.type === "timeline");
  if (line?.type !== "timeline") throw new Error(`${id} draws no line`);
  const starts = own.flatMap((element) => {
    const [k, word] = element.address.part ?? [];
    return element.type === "boundary" && typeof k === "number" && word === "start"
      ? [[k, element.x] as const]
      : [];
  });
  const label = own.find(
    (element) => element.address.part?.[0] === index && element.address.part[1] === "label",
  );
  if (label?.type !== "label") throw new Error(`no label of chunk ${index} of ${id}`);
  const x1 = index === 0 ? line.xs : starts.find(([k]) => k === index)?.[1];
  const after = starts.filter(([k]) => k > index).sort(([a], [b]) => a - b)[0];
  if (x1 === undefined) throw new Error(`no boundary of chunk ${index} of ${id}`);
  return {
    x1,
    x2: after === undefined ? line.xe : after[1],
    y: line.y,
    top: label.baseline - label.style["font-size"],
  };
}
