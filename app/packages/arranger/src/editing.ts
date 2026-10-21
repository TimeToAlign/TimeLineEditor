/**
 * The open editor, the one split of a block-qualified address that it and
 * every module of the canvas read, and the target of a place's `set`. This module imports no other module
 * of the package, so every module may import it.
 */

import type { Address, Block, BlockId, EditorKind } from "@timetoalign/tilie-core";
import {
  isCommandError,
  parseAddressSyntax,
  placedElement,
  qualify,
} from "@timetoalign/tilie-core";

/** The innermost open editor, as the canvas draws it: its target and its kind. */
export interface Editing {
  readonly target: Address;
  readonly kind: EditorKind;
}

/** Whether two editors are the same editor, or both absent. */
export function sameEditing(left: Editing | null, right: Editing | null): boolean {
  if (left === null || right === null) return left === right;
  return left.target === right.target && left.kind === right.kind;
}

/**
 * The block an address lies in and the element address it names there,
 * `null` for the block itself, read with core's address syntax: the one rule
 * every module splits an address by. The workspace and a malformed address
 * name no block and throw.
 */
export function addressParts(address: Address): {
  readonly block: BlockId;
  readonly element: string | null;
} {
  const parsed = parseAddressSyntax(address);
  if (isCommandError(parsed) || parsed.block === null) {
    throw new RangeError(`${address} is not the address of a block or an element`);
  }
  return {
    block: parsed.block,
    element: parsed.segments.length === 0 ? null : parsed.segments.join("/"),
  };
}

/**
 * The timeline whose bands block `block` offers under `editing`, the
 * innermost open editor: the edited timeline when `editing` is a timeline
 * editor in this block, else `null` (on the arranger, in a bundle or group
 * editor, and in another block's editor). Hitting a band, marking it,
 * dragging it, stepping it by key and keeping it selected all ask this one
 * rule.
 */
export function bandTimelineOf(block: BlockId, editing: Editing | null): string | null {
  if (editing?.kind !== "timeline") return null;
  const edited = addressParts(editing.target);
  return edited.block === block ? edited.element : null;
}

/**
 * The address a `set` of `place` aims at to state the place under `key` of
 * `block`'s `places` (core's `placedElement`): a frame's group, a card's
 * timeline. A key naming no frame and no card of its drawing throws.
 */
export function placeTarget(block: Block, key: string): Address {
  const element = placedElement(block.manifest, key);
  if (element === undefined) throw new RangeError(`${key} names no frame or card of ${block.id}`);
  return qualify(block.id, element);
}
