/** The selection: a set of addresses, and the click that changes it. */

import type { BlockId, View } from "@timetoalign/tilie-core";
import { isCommandError, manifestIds, parseAddress } from "@timetoalign/tilie-core";
import { ownerOf } from "./affected.ts";

/** Block ids and `<block>/<element id>` addresses. */
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
 * The selection after a click on `address`: that address alone, or, when
 * `additive`, the selection with `address` toggled. A click on an element
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
 * that exists, or an element (or a part of one) whose block holds it. The
 * selection itself when nothing is gone, so an unchanged selection keeps its
 * identity.
 */
export function existing(view: View, selection: Selection): Selection {
  const kept = [...selection].filter((address) => {
    const block = view.blocks[blockOf(address)];
    if (block === undefined) return false;
    return (
      address === block.id ||
      manifestIds(block.manifest).has(ownerOf(address.slice(block.id.length + 1)))
    );
  });
  return kept.length === selection.size ? selection : new Set(kept);
}
