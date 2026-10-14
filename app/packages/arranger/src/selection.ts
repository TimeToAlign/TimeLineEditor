/** The selection: a set of addresses, and the click that changes it. */

import type { BlockId, View } from "@timetoalign/tilie-core";
import { elementOf, isCommandError, manifestIds, parseAddress } from "@timetoalign/tilie-core";

/**
 * Block ids and element addresses: `<block>/<element address>`, the element
 * address being an element's or a part's (drawing.md section 2.2, so in a
 * group or bundle block `<block>/<root>/<id>/<part>` at most).
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

const CARD = "/card";

/**
 * What a press on `address` selects: a timeline's card (`<block>/T/card`,
 * and its shadow, which carries the same address) selects the timeline
 * `<block>/T`; every other address itself.
 */
function pressed(address: string): string {
  const element = address.slice(blockOf(address).length + 1);
  return element.includes("/") && element.endsWith(CARD) ? address.slice(0, -CARD.length) : address;
}

/**
 * The selection after a click on `address`: what it selects alone, or, when
 * `additive`, the selection with that toggled. A click on an element
 * selects the element only, never its block; a click on a timeline's card
 * selects the timeline.
 */
export function click(selection: Selection, address: string, additive: boolean): Selection {
  const target = pressed(address);
  if (!additive) return new Set([target]);
  const next = new Set(selection);
  if (next.has(target)) next.delete(target);
  else next.add(target);
  return next;
}

/**
 * The addresses of `selection` that still name something in `view`: a block
 * that exists, or an element (or a part of one, read with core's
 * `elementOf`) whose block holds it. The selection itself when nothing is
 * gone, so an unchanged selection keeps its identity.
 */
export function existing(view: View, selection: Selection): Selection {
  const kept = [...selection].filter((address) => {
    const block = view.blocks[blockOf(address)];
    if (block === undefined) return false;
    return (
      address === block.id ||
      manifestIds(block.manifest).has(elementOf(block.manifest, address.slice(block.id.length + 1)))
    );
  });
  return kept.length === selection.size ? selection : new Set(kept);
}
