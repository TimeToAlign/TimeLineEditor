/** What removing a selection takes away besides the selection itself. */

import type { Manifest } from "@timetoalign/tilie-core";
import { elementOf, parseBand, removedBy } from "@timetoalign/tilie-core";
import { manifestElements } from "@timetoalign/tilie-core/drawing";

/**
 * The addresses a drawing of `manifest` may draw, as core's
 * `manifestElements` lists them: every element and part but its bands,
 * which draw nothing.
 */
function drawnAddresses(manifest: Manifest): string[] {
  return manifestElements(manifest).flatMap(({ address, type }) =>
    address === null || type === "band" ? [] : [address],
  );
}

/**
 * The addresses that removing the selected elements of `manifest` would
 * also take away (core's `removedBy`): every timeline below a selected one,
 * every map, region, break, jump and marker those timelines and the selected
 * elements own, every conversion map naming a removed timeline, and the
 * parts of all of them. A selected part stands for its element (core's
 * `elementOf`), a selected card `T/card` for its timeline `T`, so everything
 * the card holds is affected. The selected addresses, and the parts of a
 * selected element, are left out: they show as selected. A band is never
 * removed, so a selected band takes nothing away, and draws nothing, so no
 * band is affected. Neither is the element an open editor edits, `edited`
 * (its id in `manifest`, `null` for none): Delete never removes it, so
 * selecting it, or a part of it, takes nothing away.
 */
export function affectedBy(
  manifest: Manifest,
  selectedElementIds: ReadonlySet<string>,
  edited: string | null,
): ReadonlySet<string> {
  const owners = [...selectedElementIds]
    .filter((id) => parseBand(id) === null)
    .map((id) => elementOf(manifest, id))
    .filter((owner) => owner !== edited);
  const removed = removedBy(manifest, owners);
  if (removed.size === 0) return new Set();
  const addresses = [...drawnAddresses(manifest), ...removed];
  return new Set(
    addresses.filter((address) => {
      const owner = elementOf(manifest, address);
      return (
        removed.has(owner) && !selectedElementIds.has(address) && !selectedElementIds.has(owner)
      );
    }),
  );
}
