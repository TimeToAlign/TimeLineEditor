/**
 * What a press, a click, a double-click and Enter on the canvas do, as pure
 * functions of what was pressed (a `Pressed`: the node, the descriptor and
 * the drawing point, read from the event once by the canvas), the view, the
 * selection and the innermost open editor. Nothing here reads the DOM.
 */

import type { Address, ElementAddress, Manifest, View } from "@timetoalign/tilie-core";
import {
  addressKey,
  BUNDLE_ADDRESS,
  idAddress,
  inBlock,
  placedElement,
  resolveElement,
  sameAddress,
} from "@timetoalign/tilie-core";
import type { Drawing, DrawnBox } from "@timetoalign/tilie-layout";
import type { CanvasSource, Hit } from "./boxes.ts";
import {
  boxOf,
  hitForAddress,
  hitOf,
  isBand,
  pressSelection,
  raisedRoot,
  workedBox,
} from "./boxes.ts";
import type { Level } from "./containers.ts";
import { resizes } from "./containers.ts";
import type { Editing } from "./editing.ts";
import { addressParts } from "./editing.ts";
import type { EditorChoice } from "./editors.ts";
import { editorsUnder, editorTargetOf } from "./editors.ts";
import { gapOf } from "./gaps.ts";
import type { Point } from "./gesture.ts";
import type { BlockNode } from "./node.ts";
import { insideOf } from "./project.ts";
import type { Selection } from "./selection.ts";
import { blockOf, click, NOTHING_SELECTED } from "./selection.ts";

/** What a pointer or key target on the canvas is, read once from its event. */
export interface Pressed {
  /** The block node it lies in; `undefined` off every block. */
  readonly node: BlockNode | undefined;
  /**
   * What it draws, a descriptor or an affordance; `null` for anything else
   * (the node, the drawing's `<svg>`).
   */
  readonly source: CanvasSource | null;
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
 * What a drawn element stands for when it draws part of something else: a
 * named timestamp (its wedge, its labels, its cross-section line) or a
 * named MatchStamp (an alignment anchor's line and its name label).
 */
export interface Owner {
  readonly address: ElementAddress;
  readonly kind: "timestamp" | "matchstamp";
  /** Whether it belongs to a MatchStamp: a MatchStamp itself, or a match timestamp. */
  readonly match: boolean;
  /**
   * What a press on it selects: the owner, but for a match timestamp's line
   * the MatchStamp holding it (`holdingMatchStamp`), whose selection the
   * line shows too.
   */
  readonly selects: ElementAddress;
}

const holdersByManifest = new WeakMap<Manifest, ReadonlyMap<string, string>>();

/**
 * The named MatchStamp a press on the line of match timestamp `timestamp`
 * of `manifest` selects, `undefined` where none holds it: of the
 * MatchStamps one of whose alignment anchors joins it, the first in the
 * manifest's order whose anchor joining it shows the MatchStamp's name
 * (`display` lists `name`), else the first. Read once per manifest.
 */
export function holdingMatchStamp(manifest: Manifest, timestamp: string): string | undefined {
  let holders = holdersByManifest.get(manifest);
  if (holders === undefined) {
    const first = new Map<string, string>();
    const named = new Map<string, string>();
    for (const matchstamp of manifest.graphical?.matchstamps ?? []) {
      for (const anchor of matchstamp.alignment_anchors) {
        for (const id of anchor.timestamps) {
          if (!first.has(id)) first.set(id, matchstamp.id);
          if (anchor.display.includes("name") && !named.has(id)) named.set(id, matchstamp.id);
        }
      }
    }
    holders = new Map([...first, ...named]);
    holdersByManifest.set(manifest, holders);
  }
  return holders.get(timestamp);
}

/**
 * What `element` of `manifest` draws part of (core's `resolveElement`, a
 * part read up to its owner): a named timestamp's own address `{id}` for
 * its wedge, its labels and its line; the address of the MatchStamp holding
 * an alignment anchor for the anchor's line and its name label; `null` for
 * any other element. A press on a match timestamp's line selects its
 * MatchStamp (`holdingMatchStamp`), a press on anything else its owner.
 */
export function ownerOf(manifest: Manifest, element: ElementAddress): Owner | null {
  let resolved = resolveElement(manifest, element);
  while (resolved?.kind === "part") resolved = resolved.owner;
  if (resolved?.kind === "timestamp" && element.id !== undefined) {
    const address = idAddress(element.id);
    const match = resolved.timestamp.matchstamp === true;
    const holder =
      match && element.part?.length === 1 && element.part[0] === "line"
        ? holdingMatchStamp(manifest, element.id)
        : undefined;
    const selects = holder === undefined ? address : idAddress(holder);
    return { address, kind: "timestamp", match, selects };
  }
  if (resolved?.kind === "anchor") {
    const address = idAddress(resolved.matchstamp.id);
    return { address, kind: "matchstamp", match: true, selects: address };
  }
  return null;
}

/**
 * What a press on `pressed` selects (`pressSelection`): the card, the frame,
 * the band or the element it hit, a named timestamp for any of its parts
 * but a match timestamp's line, and a named MatchStamp for that line and
 * for any alignment anchor's line or label (`ownerOf`), the gap of an
 * elision for itself, its ellipses and its labels (`gapOf`: `{id: E}`
 * stored, `{id: T, part: ["elision"]}` default), a timestamp for its affordance, whose source carries the
 * timestamp's own address, or the block where it hit the block itself; `null`
 * off every block and outside the edited element, where a press changes
 * nothing. A band is hit only with a drawing point: a key selects none.
 */
export function pressedIn(pressed: Pressed, editing: Editing | null): Address | null {
  const hit = hitAt(pressed, editing);
  const { node } = pressed;
  const address =
    hit === null || node === undefined ? null : pressSelection(hit, editing, node.data.inside);
  if (address === null || node === undefined) return null;
  const { element } = addressParts(address);
  if (element === null) return address;
  const { manifest } = node.data.block;
  const owner = ownerOf(manifest, element);
  if (owner !== null) return inBlock(node.id, owner.selects);
  const gap = gapOf(manifest, element);
  return gap === null ? address : inBlock(node.id, gap);
}

/**
 * The editor target a double-click or a double tap on `pressed` opens
 * (`editorTargetOf`): `null` off every block, outside the edited element
 * and on the edited element itself. A pointer gives its drawing point, so
 * that the band under it (`bandUnder`) opens its timeline's editor, a
 * root's flow control band the root's flow-control editor, and text or a
 * region the last drawn card or frame under it, the innermost where none
 * overlap.
 */
export function openableAt(view: View, pressed: Pressed, editing: Editing | null): Address | null {
  const hit = hitAt(pressed, editing);
  const { node, point } = pressed;
  const at =
    node === undefined || point === null ? undefined : { drawing: node.data.drawing, point };
  return hit === null ? null : editorTargetOf(view, hit, editing, at);
}

/**
 * The editors a long press on `pressed` offers (`editorsUnder`): none off
 * every block or without a drawing point.
 */
export function editorsAt(
  view: View,
  pressed: Pressed,
  editing: Editing | null,
): readonly EditorChoice[] {
  const hit = hitAt(pressed, editing);
  const { node, point } = pressed;
  if (hit === null || node === undefined || point === null) return [];
  return editorsUnder(view, hit, editing, { drawing: node.data.drawing, point });
}

/**
 * The editor Enter and the inspector's Edit button open: that of the
 * single selected address, as a double-click on it would, its hit read
 * from its block's drawing (`drawingOf`, `hitForAddress`), never from the
 * DOM, so a block outside the view opens as one in it; a selected band (in
 * its timeline's editor) opens as a press on it would. `null` when the
 * selection is not one openable address.
 */
export function openable(
  view: View,
  selection: Selection,
  drawingOf: (block: string) => Drawing | undefined,
  editing: Editing | null,
): Address | null {
  if (selection.size !== 1) return null;
  const [address] = selection.values();
  if (address === undefined) return null;
  const block = blockOf(address);
  const drawing = drawingOf(block);
  if (drawing === undefined) return null;
  const hit = hitForAddress(block, drawing, address, editing) ?? bandHitOf(drawing, address);
  return hit === null ? null : editorTargetOf(view, hit, editing);
}

/** The hit of the selected band `address` in `drawing`: its first record; `null` for anything else. */
function bandHitOf(drawing: Drawing, address: Address): Hit | null {
  const { block, element } = addressParts(address);
  const box = element === null ? undefined : boxOf(drawing, element);
  if (box === undefined || !isBand(box)) return null;
  return { block, kind: "band", address, box, boundary: false, within: null };
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

/** What a double-click on the edited element does: centre the view on it again, as opening does. */
export const RECENTRE = Symbol("recentre");

/** What a double-click or a double tap does: open an editor, close the innermost, or centre the view. */
export type DoubleClick = Address | typeof DONE | typeof RECENTRE;

/**
 * What a double-click or a double tap on `pressed` does: outside the edited
 * element it closes the innermost editor (`DONE`); else it opens the editor
 * `openableAt` names; else, on a block inside the edited element (the
 * edited element itself, or anything in it that opens no editor), it
 * centres the view on the edited element again (`RECENTRE`); else nothing
 * (`null`, on the arranger).
 */
export function doubleClickAt(
  view: View,
  pressed: Pressed,
  editing: Editing | null,
): DoubleClick | null {
  if (isOutside(pressed, editing)) return DONE;
  const target = openableAt(view, pressed, editing);
  if (target !== null) return target;
  return editing !== null && pressed.node !== undefined ? RECENTRE : null;
}

/** What a click on the empty pane is, read without its event: no block, no descriptor, no point. */
export const ON_PANE: Pressed = { node: undefined, source: null, point: null, pane: true };

/**
 * The selection after a click on `pressed`: what the press selects
 * (`pressedIn`), alone, or, when `additive` (Shift, or the marquee toggle),
 * toggled in the selection (`click`). A click on the empty canvas, and in an
 * editor a click outside the edited element (`isOutside`: on its group, on
 * anything else faded, on another block), clears the selection in every
 * mode, the marquee mode included; with Shift it leaves it. Anything else
 * (a control of the canvas) leaves it.
 */
export function clickedAt(
  selection: Selection,
  pressed: Pressed,
  editing: Editing | null,
  { shift, additive }: { readonly shift: boolean; readonly additive: boolean },
): Selection {
  const address = pressedIn(pressed, editing);
  if (address !== null) return click(selection, address, additive);
  if (!pressed.pane && !isOutside(pressed, editing)) return selection;
  return shift ? selection : NOTHING_SELECTED;
}

/** The box the resize toolbar acts on, in the block holding it. */
export interface Resizable {
  readonly block: string;
  readonly box: DrawnBox;
}

/**
 * What the resize toolbar acts on: the single selected box `level` resizes
 * (`resizes`), the block itself, a group's frame or a card (for the cards
 * of a member of several groups the one in the frame worked in,
 * `workedBox`, and none where no frame is); on the arranger any of them, in
 * an editor one inside the edited element, the edited element's own box
 * included where the level resizes it.
 */
export function resizableOf(
  selection: Selection,
  nodes: ReadonlyMap<string, BlockNode>,
  editing: Editing | null,
  level: Level,
): Resizable | undefined {
  const [address] = selection.values();
  if (selection.size !== 1 || address === undefined) return undefined;
  const { block: id, element } = addressParts(address);
  const node = nodes.get(id);
  const edited = editing === null ? null : addressParts(editing.target);
  if (node === undefined || (edited !== null && edited.block !== id)) return undefined;
  const within = edited === null ? null : (edited.element?.id ?? null);
  const { block, drawing } = node.data;
  const box = workedBox(drawing, id, element ?? BUNDLE_ADDRESS, editing);
  if (box === undefined || box.kind === "band") return undefined;
  if (
    element !== null &&
    !insideOf(block.manifest, drawing, within, raisedRoot(block, editing)).has(addressKey(element))
  ) {
    return undefined;
  }
  // A frame stands for its group, a card for its timeline (core's `placedElement`).
  const standsFor = box.key === null ? undefined : placedElement(block.manifest, box.key);
  const own = element === null ? edited !== null && within === null : standsFor === within;
  return resizes(box, level, own) ? { box, block: id } : undefined;
}

/** A touch released within the click distance of its press: where, when, and what it would do. */
export interface Tap {
  readonly x: number;
  readonly y: number;
  readonly time: number;
  readonly action: DoubleClick;
}

/** Two taps act as a double-click when the second follows the first within this many milliseconds… */
export const DOUBLE_TAP_MS = 300;
/** …and this many screen pixels, where a double-click would do the same. */
export const DOUBLE_TAP_DISTANCE = 10;

/** Whether two double-click actions are the same: the same symbol, or equal addresses. */
function sameAction(left: DoubleClick, right: DoubleClick): boolean {
  if (typeof left === "symbol" || typeof right === "symbol") return left === right;
  return sameAddress(left, right);
}

/**
 * Whether `tap` completes a double tap begun by `previous`: within
 * `DOUBLE_TAP_MS` and `DOUBLE_TAP_DISTANCE` of it, where a double-click
 * would do the same (open the same editor, or close the innermost).
 */
export function doubleTap(previous: Tap | null, tap: Tap): boolean {
  return (
    previous !== null &&
    sameAction(previous.action, tap.action) &&
    tap.time - previous.time <= DOUBLE_TAP_MS &&
    Math.hypot(tap.x - previous.x, tap.y - previous.y) <= DOUBLE_TAP_DISTANCE
  );
}
