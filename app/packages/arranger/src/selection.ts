/** The selection: a set of addresses, the click that changes it, and the addresses that still exist. */

import type { Address, BlockId, Facet, ResolvedAddress, View } from "@timetoalign/tilie-core";
import {
  addressKey,
  cardAddress,
  contains,
  findTimeline,
  inBlock,
  isCommandError,
  resolveAddress,
} from "@timetoalign/tilie-core";
import type { Editing } from "./editing.ts";
import { addressParts, bandTimelineOf } from "./editing.ts";

/**
 * The selected addresses of blocks and of their elements, parts and bands
 * (drawing.md section 2.2), each under its key (`addressKey`): an address
 * is selected once, however its object was built.
 */
export type Selection = ReadonlyMap<string, Address>;

/** The selection holding `addresses`, each once. */
export function selectionOf(addresses: Iterable<Address>): Selection {
  return new Map([...addresses].map((address) => [addressKey(address), address]));
}

/** The empty selection. */
export const NOTHING_SELECTED: Selection = new Map();

/** Whether `selection` holds `address`. */
export function isSelected(selection: Selection, address: Address): boolean {
  return selection.has(addressKey(address));
}

/** The block an address lies in. */
export function blockOf(address: Address): BlockId {
  return addressParts(address).block;
}

/**
 * The selection after a click that selects `address` (what a press hit
 * selects is `boxes.ts`'s `pressSelection`): that address alone, or, when
 * `additive`, the selection with that address toggled. A click on an element
 * selects the element only, never its block.
 */
export function click(selection: Selection, address: Address, additive: boolean): Selection {
  if (!additive) return selectionOf([address]);
  const key = addressKey(address);
  const next = new Map(selection);
  if (next.has(key)) next.delete(key);
  else next.set(key, address);
  return next;
}

/** A selected band: its block, its timeline and its facet. */
export interface SelectedBand {
  readonly block: BlockId;
  readonly timeline: string;
  readonly facet: Facet;
}

/** The band `resolved` names, its block, timeline and facet; `null` for anything else. */
function bandOf(resolved: ResolvedAddress): SelectedBand | null {
  return resolved.kind === "band"
    ? { block: resolved.block.id, timeline: resolved.at.timeline.id, facet: resolved.facet }
    : null;
}

/**
 * The band the selected `address` names in `view` (core's `resolveAddress`),
 * its block, timeline and facet; `null` for any other address, and for one
 * that names nothing.
 */
export function selectedBand(view: View, address: Address): SelectedBand | null {
  const resolved = resolveAddress(view, address);
  return isCommandError(resolved) ? null : bandOf(resolved);
}

/**
 * Whether `view` under `editing`, the innermost open editor (`null` on the
 * arranger), offers the selected `band`: its timeline exists in its block
 * and is the one whose bands that block offers (`bandTimelineOf`). The one
 * rule for keeping a selected band, whether the selection is pruned
 * (`existing`) or a band is stepped.
 */
export function offersBand(view: View, band: SelectedBand, editing: Editing | null): boolean {
  const block = view.blocks[band.block];
  return (
    block !== undefined &&
    bandTimelineOf(band.block, editing) === band.timeline &&
    findTimeline(block.manifest, band.timeline) !== undefined
  );
}

/**
 * The addresses of `selection` that `view` keeps under `editing`, the
 * innermost open editor (`null` on the arranger): each must name something
 * (core's `resolveAddress`; the title only of a named manifest, the one
 * whose title is drawn), a band only where the view offers it
 * (`offersBand`), and, in an editor, lie inside the edited element: in the
 * bundle editor its block or anything of it, in a group or timeline editor
 * what that group or timeline contains (core's `contains`), the edited
 * element itself and its cards included, never another block. The one rule
 * for what a selection keeps, after a change, an undo or a redo and when an
 * editor closes, so a change keeps every address that still names something
 * inside the edited element, and closing an editor drops every band but
 * those of the timeline then edited. The selection itself when nothing is
 * gone, so an unchanged selection keeps its identity.
 */
export function existing(view: View, selection: Selection, editing: Editing | null): Selection {
  const edited = editing === null ? null : addressParts(editing.target);
  const kept = [...selection.values()].filter((address) => {
    const resolved = resolveAddress(view, address);
    if (isCommandError(resolved) || resolved.kind === "workspace") return false;
    const band = bandOf(resolved);
    if (band !== null) return offersBand(view, band, editing);
    if (edited === null) return true;
    const { block, element } = addressParts(address);
    if (block !== edited.block) return false;
    if (edited.element?.id === undefined) return true;
    return element !== null && contains(resolved.block.manifest, edited.element.id, element);
  });
  return kept.length === selection.size ? selection : selectionOf(kept);
}

/**
 * What the selection holds once `editing` has opened in `view`: the edited
 * element, by the address a click on its box selects: the block for the
 * bundle editor, the group for the group editor (a press on its frame
 * selects the group), and for the timeline editor the timeline's cards
 * where it is drawn in a card (every card of a member of several groups
 * shares one address), else the timeline (a child, which has no card, is
 * selected by its line).
 */
export function editedSelection(view: View, editing: Editing): Selection {
  const { target } = editing;
  if (editing.kind !== "timeline" || target.id === undefined) return selectionOf([target]);
  const resolved = resolveAddress(view, target);
  const carded =
    !isCommandError(resolved) && resolved.kind === "timeline" && resolved.cards.length > 0;
  return selectionOf([carded ? inBlock(blockOf(target), cardAddress(target.id)) : target]);
}
