/**
 * The open editor, the block an address lies in, the frame worked in, and
 * the change of a place's `set`. This module imports no other module of the package, so
 * every module may import it.
 */

import type {
  Address,
  Block,
  BlockId,
  Change,
  EditorKind,
  ElementAddress,
  ItemPlace,
  PlaceKey,
} from "@timetoalign/tilie-core";
import {
  addressKey,
  elementAddressOf,
  idAddress,
  inBlock,
  isElementAddress,
  placedContainer,
  placeKeyText,
  sameAddress,
} from "@timetoalign/tilie-core";

/** The innermost open editor, as the canvas draws it: its target and its kind. */
export interface Editing {
  readonly target: Address;
  readonly kind: EditorKind;
}

/** Whether two editors are the same editor, or both absent. */
export function sameEditing(left: Editing | null, right: Editing | null): boolean {
  if (left === null || right === null) return left === right;
  return sameAddress(left.target, right.target) && left.kind === right.kind;
}

/**
 * The block an address lies in and the element address it names there,
 * `null` for the block itself: the one rule every module reads an address
 * by. The workspace's address names no block and throws.
 */
export function addressParts(address: Address): {
  readonly block: BlockId;
  readonly element: ElementAddress | null;
} {
  const { block } = address;
  if (block === undefined) {
    throw new RangeError(`${addressKey(address)} is not the address of a block or an element`);
  }
  return { block, element: isElementAddress(address) ? elementAddressOf(address) : null };
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
  return editedIn(block, editing, "timeline");
}

/**
 * The group whose frame block `block` is worked in under `editing`, the
 * innermost open editor: the edited group when `editing` is a group editor
 * in this block, else `null`. A card address covers every card of its
 * timeline; inside a frame it names the card that frame holds.
 */
export function frameGroupOf(block: BlockId, editing: Editing | null): string | null {
  return editedIn(block, editing, "group");
}

/** The ID of the element `editing` edits when it is an editor of `kind` in block `block`, else `null`. */
function editedIn(block: BlockId, editing: Editing | null, kind: EditorKind): string | null {
  if (editing?.kind !== kind) return null;
  const { target } = editing;
  return target.block === block ? (target.id ?? null) : null;
}

/**
 * The change of a `set` stating `place` (a place's members, each a value or
 * null to unstate it) under `key` of `block`'s `places`: a frame's on its
 * group, a member's card through its group (`cards`, by the member's ID),
 * an ungrouped root's card on its timeline. A key naming no frame and no
 * card of its drawing throws.
 */
export function placeChange(
  block: Block,
  key: PlaceKey,
  place: { readonly [member in keyof ItemPlace]?: number | null },
): Change {
  if (placedContainer(block.manifest, key) === undefined) {
    throw new RangeError(`${placeKeyText(key)} names no frame or card of ${block.id}`);
  }
  if (key.member !== undefined) {
    return {
      target: inBlock(block.id, idAddress(key.item)),
      values: { cards: { [key.member]: place } },
    };
  }
  return { target: inBlock(block.id, idAddress(key.item)), values: { place } };
}

/**
 * The place key a `change` of `placeChange` states a place under: the
 * inverse of `placeChange`; `null` for a change of anything else (the
 * block's own members, an element's).
 */
export function changedPlace(change: Change): PlaceKey | null {
  const { target, values } = change;
  if (target.id === undefined || target.facet !== undefined) return null;
  const cards = values.cards;
  if (cards !== undefined && cards !== null && typeof cards === "object") {
    const [member, ...others] = Object.keys(cards);
    return member === undefined || others.length > 0 ? null : { item: target.id, member };
  }
  return values.place === undefined ? null : { item: target.id };
}
