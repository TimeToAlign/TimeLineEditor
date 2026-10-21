/** What removing a selection takes away besides the selection itself. */

import type { ElementAddress, Manifest } from "@timetoalign/tilie-core";
import { addressKey, idAddress, removedBy } from "@timetoalign/tilie-core";
import { manifestElements } from "@timetoalign/tilie-core/drawing";

/**
 * The addresses a drawing of `manifest` may draw, as core's
 * `manifestElements` lists them: every element and part but its bands,
 * which draw nothing.
 */
function drawnAddresses(manifest: Manifest): ElementAddress[] {
  return manifestElements(manifest).flatMap(({ address, type }) =>
    type === "band" ? [] : [address],
  );
}

/**
 * The keys (`addressKey`) of the addresses that removing the selected
 * elements of `manifest` would also take away (core's `removedBy`): every
 * timeline below a selected one, every map, region and flow-control element
 * those timelines and the selected elements own, every conversion map
 * naming a removed timeline, and the parts of all of them. A selected part
 * or card stands for the element whose ID it carries, so everything a
 * selected card holds is affected. `selected` maps the selected element
 * addresses by their keys; they, and the parts of a selected element, are
 * left out: they show as selected. A band is never removed, so a selected
 * band takes nothing away, and draws nothing, so no band is affected.
 * Neither is the element an open editor edits, `edited` (its ID in
 * `manifest`, `null` for none): Delete never removes it, so selecting it, or
 * a part of it, takes nothing away.
 */
export function affectedBy(
  manifest: Manifest,
  selected: ReadonlyMap<string, ElementAddress>,
  edited: string | null,
): ReadonlySet<string> {
  const owners = [...selected.values()].flatMap(({ id, facet }) =>
    id === undefined || facet !== undefined || id === edited ? [] : [id],
  );
  const removed = removedBy(manifest, owners);
  if (removed.size === 0) return new Set();
  const addresses = [...drawnAddresses(manifest), ...[...removed].map(idAddress)];
  return new Set(
    addresses.flatMap((address) => {
      const owner = address.id;
      if (owner === undefined || !removed.has(owner)) return [];
      const key = addressKey(address);
      return selected.has(key) || selected.has(addressKey(idAddress(owner))) ? [] : [key];
    }),
  );
}
