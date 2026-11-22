/**
 * The pane a drawing is fitted to: the canvas's size in screen pixels, left
 * of the inspector drawer at its current width (`Placement.view`, read by
 * the default proportion of an ancestor card's elisions, `docs/drawing.md`
 * in TimeToShare, section 8.9). One per page: every drawing of a block, the
 * canvas's and the inspector's alike, is drawn at the pane the canvas last
 * settled at, so both read the same strips. Until a canvas settles (and in
 * a test without one) no pane is given, and a drawing takes layout's
 * default view.
 */

import type { View } from "@timetoalign/tilie-layout";
import { createSubscriber } from "svelte/reactivity";

let settled: View | undefined;
/** The canvas that settled the pane last: only it withdraws the pane. */
let holder: object | null = null;
/** The reactions reading the pane, told when it changes. */
const readers = new Set<() => void>();
const subscribe = createSubscriber((update) => {
  readers.add(update);
  return () => readers.delete(update);
});

/** Make `next` the pane and tell every reaction reading it. */
function show(next: View | undefined): void {
  settled = next;
  for (const update of [...readers]) update();
}

/**
 * The pane drawings are fitted to now; `undefined` before a canvas settles
 * one. Read in a reaction (a `$derived`, a template), it is read again when
 * the pane changes; read anywhere else, it is a plain value.
 */
export function paneView(): View | undefined {
  subscribe();
  return settled;
}

/**
 * The canvas `owner` measures `width` × `height` screen pixels: the pane
 * becomes that size, so every drawing is drawn again for it. A size that is
 * not positive and finite (a canvas not laid out yet, a collapsed one) is
 * skipped, and the pane stays as it was.
 */
export function settlePane(owner: object, width: number, height: number): void {
  if (!(Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0)) return;
  holder = owner;
  if (settled?.width === width && settled.height === height) return;
  show({ width, height });
}

/** The canvas `owner` is gone: the pane it settled is withdrawn, one another canvas settled kept. */
export function releasePane(owner: object): void {
  if (holder !== owner) return;
  holder = null;
  show(undefined);
}
