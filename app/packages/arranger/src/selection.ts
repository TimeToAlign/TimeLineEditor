/** The selection: a set of addresses, and the click that changes it. */

import type { BlockId, View } from "@timetoalign/tilie-core";
import {
  elementOf,
  isCommandError,
  isNamed,
  manifestIds,
  parseAddress,
  TITLE_ADDRESS,
} from "@timetoalign/tilie-core";

/**
 * Block ids and element addresses: `<block>/<element address>`, the element
 * address being an element's or a part's (drawing.md section 2.2, so
 * `<block>/<root>/<id>/<part>` at most).
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

/**
 * The addresses of `selection` that still name something in `view`: a block
 * that exists, an element (or a part of one, read with core's `elementOf`)
 * whose block holds it, or the title of a named manifest. The selection
 * itself when nothing is gone, so an unchanged selection keeps its identity.
 */
export function existing(view: View, selection: Selection): Selection {
  const kept = [...selection].filter((address) => {
    const block = view.blocks[blockOf(address)];
    if (block === undefined) return false;
    if (address === block.id) return true;
    const element = elementOf(block.manifest, address.slice(block.id.length + 1));
    if (element === TITLE_ADDRESS) return isNamed(block.manifest);
    return manifestIds(block.manifest).has(element);
  });
  return kept.length === selection.size ? selection : new Set(kept);
}
