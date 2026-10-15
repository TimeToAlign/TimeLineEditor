/** What removing a selection takes away besides the selection itself, and what it moves. */

import type { Gap, Manifest } from "@timetoalign/tilie-core";
import { elementOfIn, manifestElements, movedBy, removedBy } from "@timetoalign/tilie-core";

/**
 * The addresses that removing the selected elements of `manifest` would
 * also take away (core's `removedBy`): every timeline below a selected one,
 * every map, region, break, jump and marker those timelines and the selected
 * elements own, every conversion map naming a removed timeline, and the
 * parts of all of them. A selected part stands for its element (core's
 * `elementOf`). The selected addresses, and the parts of a selected element,
 * are left out: they show as selected.
 */
export function affectedBy(
  manifest: Manifest,
  selectedElementIds: ReadonlySet<string>,
): ReadonlySet<string> {
  const element = elementOfIn(manifest);
  const removed = removedBy(manifest, [...selectedElementIds].map(element));
  if (removed.size === 0) return new Set();
  const addresses = [
    ...manifestElements(manifest).flatMap((key) => (key.address === null ? [] : [key.address])),
    ...removed,
  ];
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
 * and their parts.
 */
export function movedByGap(manifest: Manifest, id: string, gap: Gap): ReadonlySet<string> {
  const moved = movedBy(manifest, id, gap);
  if (moved.size === 0) return moved;
  const element = elementOfIn(manifest);
  return new Set(
    manifestElements(manifest).flatMap((key) =>
      key.address !== null && moved.has(element(key.address)) ? [key.address] : [],
    ),
  );
}
