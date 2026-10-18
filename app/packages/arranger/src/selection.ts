/** The selection: a set of addresses, and the click that changes it. */

import type { Address, BandKind, BlockId, EditorKind, View } from "@timetoalign/tilie-core";
import {
  elementOf,
  findTimeline,
  isCommandError,
  isNamed,
  manifestIds,
  parseAddress,
  parseBand,
  TITLE_ADDRESS,
} from "@timetoalign/tilie-core";
import { bandTimelineOf } from "./boxes.ts";

/**
 * Block ids and element addresses: `<block>/<element address>`, the element
 * address being an element's, a part's or a band's (drawing.md section 2.2,
 * so `<block>/<root>/<id>/<part>` at most, and `<block>/<timeline>/<kind>_1`
 * for a band).
 */
export type Selection = ReadonlySet<string>;

/** The block an address lies in. */
export function blockOf(address: string): BlockId {
  const parsed = parseAddress(address);
  if (isCommandError(parsed) || parsed.block === null) {
    throw new RangeError(`${address} is not the address of a block or an element`);
  }
  return parsed.block;
}

/**
 * The selection after a click that selects `address` (what a press hit
 * selects is `boxes.ts`'s `selectionOf`): that address alone, or, when
 * `additive`, the selection with that address toggled. A click on an element
 * selects the element only, never its block.
 */
export function click(selection: Selection, address: string, additive: boolean): Selection {
  if (!additive) return new Set([address]);
  const next = new Set(selection);
  if (next.has(address)) next.delete(address);
  else next.add(address);
  return next;
}

/** A selected band: its block, its timeline and its kind. */
export interface SelectedBand {
  readonly block: BlockId;
  readonly timeline: string;
  readonly kind: BandKind;
}

/** The band a selected address names, its block, timeline and kind; `null` for any other. */
export function selectedBand(address: string): SelectedBand | null {
  const block = blockOf(address);
  const band = address === block ? null : parseBand(address.slice(block.length + 1));
  return band === null ? null : { block, ...band };
}

/**
 * Whether `view` under `editing`, the innermost open editor (`null` on the
 * arranger), offers the selected `band`: its timeline exists in its block
 * and is the one whose bands that block offers (`bandTimelineOf`). The one
 * rule for keeping a selected band, whether the selection is pruned
 * (`existing`, and the canvas when an editor opens) or a band is stepped.
 */
export function offersBand(
  view: View,
  band: SelectedBand,
  editing: { readonly target: Address; readonly kind: EditorKind } | null,
): boolean {
  const block = view.blocks[band.block];
  return (
    block !== undefined &&
    bandTimelineOf(band.block, editing) === band.timeline &&
    findTimeline(block.manifest, band.timeline) !== undefined
  );
}

/**
 * The addresses of `selection` that still name something in `view` under
 * `editing`, the innermost open editor (`null` on the arranger): a block
 * that exists, an element (or a part of one, read with core's `elementOf`)
 * whose block holds it, the title of a named manifest, or a band the view
 * offers under `editing` (`offersBand`). So opening an editor, or
 * closing one, drops every band but those of the timeline then edited. The
 * selection itself when nothing is gone, so an unchanged selection keeps its
 * identity.
 */
export function existing(
  view: View,
  selection: Selection,
  editing: { readonly target: Address; readonly kind: EditorKind } | null,
): Selection {
  const kept = [...selection].filter((address) => {
    const block = view.blocks[blockOf(address)];
    if (block === undefined) return false;
    if (address === block.id) return true;
    const band = selectedBand(address);
    if (band !== null) return offersBand(view, band, editing);
    const element = elementOf(block.manifest, address.slice(block.id.length + 1));
    if (element === TITLE_ADDRESS) return isNamed(block.manifest);
    return manifestIds(block.manifest).has(element);
  });
  return kept.length === selection.size ? selection : new Set(kept);
}
