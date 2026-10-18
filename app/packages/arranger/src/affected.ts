/** What removing a selection takes away besides the selection itself, and what it moves. */

import type { Gap, Manifest } from "@timetoalign/tilie-core";
import {
  elementOfIn,
  manifestElements,
  movedBy,
  parseBand,
  removedBy,
} from "@timetoalign/tilie-core";

/**
 * The addresses a drawing of `manifest` may draw, as core's
 * `manifestElements` lists them: every element and part but its bands,
 * which draw nothing.
 */
function drawnAddresses(manifest: Manifest): string[] {
  return manifestElements(manifest).flatMap(({ address }) =>
    address === null || parseBand(address) !== null ? [] : [address],
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
 * band is affected.
 */
export function affectedBy(
  manifest: Manifest,
  selectedElementIds: ReadonlySet<string>,
): ReadonlySet<string> {
  const element = elementOfIn(manifest);
  const owners = [...selectedElementIds].filter((id) => parseBand(id) === null).map(element);
  const removed = removedBy(manifest, owners);
  if (removed.size === 0) return new Set();
  const addresses = [...drawnAddresses(manifest), ...removed];
  return new Set(
    addresses.filter(
      (address) =>
        removed.has(element(address)) &&
        !selectedElementIds.has(address) &&
        !selectedElementIds.has(element(address)),
    ),
  );
}

/**
 * The addresses that closing the gap of segment `id` as `gap` moves or
 * resizes (core's `movedBy`): the timelines whose place or length changes,
 * and their parts, bands left out.
 */
export function movedByGap(manifest: Manifest, id: string, gap: Gap): ReadonlySet<string> {
  const moved = movedBy(manifest, id, gap);
  if (moved.size === 0) return moved;
  const element = elementOfIn(manifest);
  return new Set(drawnAddresses(manifest).filter((address) => moved.has(element(address))));
}
