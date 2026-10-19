/**
 * What a press, a click, a double-click and Enter on the canvas do, as pure
 * functions of what was pressed (a `Pressed`: the node, the descriptor and
 * the drawing point, read from the event once by the canvas), the view, the
 * selection and the innermost open editor. Nothing here reads the DOM.
 */

import type { Address, View } from "@timetoalign/tilie-core";
import type { DrawnBox } from "@timetoalign/tilie-layout";
import type { DescriptorSource } from "@timetoalign/tilie-writers";
import { nodeBox } from "./blockDrag.ts";
import type { Hit } from "./boxes.ts";
import { boxOf, hitForAddress, hitOf, selectionOf } from "./boxes.ts";
import type { Level } from "./containers.ts";
import { resizes } from "./containers.ts";
import type { Editing } from "./editing.ts";
import { addressParts } from "./editing.ts";
import { editorTargetOf } from "./editors.ts";
import type { Point } from "./gesture.ts";
import type { BlockNode } from "./project.ts";
import { insideOf } from "./project.ts";
import type { Selection } from "./selection.ts";
import { blockOf } from "./selection.ts";
import type { Box } from "./snap.ts";

/** What a pointer or key target on the canvas is, read once from its event. */
export interface Pressed {
  /** The block node it lies in; `undefined` off every block. */
  readonly node: BlockNode | undefined;
  /** The descriptor it draws; `null` for anything else (the node, the drawing's `<svg>`). */
  readonly source: DescriptorSource | null;
  /** The drawing point under the pointer; `null` without one (a key) or off a drawing. */
  readonly point: Point | null;
  /** Whether it is the empty pane. */
  readonly pane: boolean;
}

/** What a press on `pressed` hits (`hitOf`); `null` off every block. */
export function hitAt(pressed: Pressed, editing: Editing | null): Hit | null {
  const { node } = pressed;
  if (node === undefined) return null;
  return hitOf(node.id, node.data.drawing, pressed.source, pressed.point ?? undefined, editing);
}

/**
 * What a press on `pressed` selects (`selectionOf`): the card, the frame,
 * the band or the element it hit, or the block where it hit the block's own
 * box; `null` off every block and outside the edited element, where a press
 * changes nothing. A band is hit only with a drawing point: a key selects
 * none.
 */
export function pressedIn(pressed: Pressed, editing: Editing | null): string | null {
  const hit = hitAt(pressed, editing);
  return hit === null || pressed.node === undefined
    ? null
    : selectionOf(hit, editing, pressed.node.data.inside);
}

/**
 * The editor target a double-click or a double tap on `pressed` opens
 * (`editorTargetOf`): `null` off every block, outside the edited element, on
 * the edited element itself and on a band. A pointer gives its drawing
 * point, so that text or a region opens the last drawn card or frame under
 * it, the innermost where none overlap.
 */
export function openableAt(view: View, pressed: Pressed, editing: Editing | null): Address | null {
  const hit = hitAt(pressed, editing);
  return hit === null ? null : editorTargetOf(view, hit, editing);
}

/**
 * The editor Enter opens: that of the single selected address, as a
 * double-click on it would, its hit read from its block's drawing
 * (`hitForAddress`), never from the DOM, so a block outside the view opens
 * as one in it; `null` when the selection is not one openable address.
 */
export function openable(
  view: View,
  selection: Selection,
  nodes: ReadonlyMap<string, BlockNode>,
  editing: Editing | null,
): Address | null {
  if (selection.size !== 1) return null;
  const [address] = selection;
  const node = address === undefined ? undefined : nodes.get(blockOf(address));
  if (address === undefined || node === undefined) return null;
  const hit = hitForAddress(node.id, node.data.drawing, address);
  return hit === null ? null : editorTargetOf(view, hit, editing);
}

/**
 * Whether `pressed` lies outside the edited element: the empty pane (which a
 * faded block, taking no pointer, lets a press through to), or a part of a
 * block where a press selects nothing (`pressedIn`, the inside test that
 * also fades), so never an offered band. Nothing lies outside on
 * the arranger; the canvas's own controls (toolbars, handles) lie in no
 * block and are not the pane.
 */
export function isOutside(pressed: Pressed, editing: Editing | null): boolean {
  if (editing === null) return false;
  if (pressed.pane) return true;
  return pressed.node !== undefined && pressedIn(pressed, editing) === null;
}

/** What a double-click outside the edited element does: close the innermost editor, as Done does. */
export const DONE = Symbol("done");

/**
 * What a double-click or a double tap on `pressed` does: outside the edited
 * element it closes the innermost editor (`DONE`), else it opens the editor
 * `openableAt` names, or does nothing (`null`).
 */
export function doubleClickAt(
  view: View,
  pressed: Pressed,
  editing: Editing | null,
): Address | typeof DONE | null {
  return isOutside(pressed, editing) ? DONE : openableAt(view, pressed, editing);
}

/** Whether a block's box on the canvas holds the canvas point `at`, edges included. */
export function onBlock(nodes: Iterable<BlockNode>, at: Point): boolean {
  for (const node of nodes) {
    const box: Box = nodeBox(node);
    if (at.x >= box.x && at.x <= box.x + box.width && at.y >= box.y && at.y <= box.y + box.height) {
      return true;
    }
  }
  return false;
}

/**
 * The selection after a click on the empty canvas: cleared in every mode,
 * the marquee mode included, on the arranger and in an editor alike; with
 * Shift unchanged. In an editor a click on a faded block reaches the pane
 * too, since the block takes no pointer, and changes nothing: the selection
 * is cleared only where no block's box holds the click (`onBlock`).
 */
export function clearOnPane(
  selection: Selection,
  shift: boolean,
  editing: Editing | null,
  blockHolds: () => boolean,
): Selection {
  if (shift || (editing !== null && blockHolds())) return selection;
  return new Set();
}

/** The box the resize toolbar acts on, in the block holding it. */
export interface Resizable {
  readonly block: string;
  readonly box: DrawnBox;
}

/**
 * What the resize toolbar acts on: the single selected box `level` resizes
 * (`resizes`), the block's own box, a group's frame or a card; on the
 * arranger any of them, in an editor one inside the edited element, the
 * edited element's own box included where the level resizes it.
 */
export function resizableOf(
  selection: Selection,
  nodes: ReadonlyMap<string, BlockNode>,
  editing: Editing | null,
  level: Level,
): Resizable | undefined {
  const [address] = selection;
  if (selection.size !== 1 || address === undefined) return undefined;
  const { block: id, element } = addressParts(address);
  const node = nodes.get(id);
  const edited = editing === null ? null : addressParts(editing.target);
  if (node === undefined || (edited !== null && edited.block !== id)) return undefined;
  const within = edited === null ? null : edited.element;
  const { block, drawing } = node.data;
  const box = boxOf(drawing, element);
  if (box === undefined || box.kind === "band") return undefined;
  if (element !== null && !insideOf(block.manifest, drawing, within).has(element)) {
    return undefined;
  }
  const own = element === null ? edited !== null && within === null : box.key === within;
  return resizes(box, level, own) ? { box, block: id } : undefined;
}

/** A touch released within the click distance of its press: where, when, and what it would do. */
export interface Tap {
  readonly x: number;
  readonly y: number;
  readonly time: number;
  readonly action: Address | typeof DONE;
}

/** Two taps act as a double-click when the second follows the first within this many milliseconds… */
export const DOUBLE_TAP_MS = 300;
/** …and this many screen pixels, where a double-click would do the same. */
export const DOUBLE_TAP_DISTANCE = 10;

/**
 * Whether `tap` completes a double tap begun by `previous`: within
 * `DOUBLE_TAP_MS` and `DOUBLE_TAP_DISTANCE` of it, where a double-click
 * would do the same (open the same editor, or close the innermost).
 */
export function doubleTap(previous: Tap | null, tap: Tap): boolean {
  return (
    previous !== null &&
    previous.action === tap.action &&
    tap.time - previous.time <= DOUBLE_TAP_MS &&
    Math.hypot(tap.x - previous.x, tap.y - previous.y) <= DOUBLE_TAP_DISTANCE
  );
}
