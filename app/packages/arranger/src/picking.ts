/**
 * What a press picks while the canvas is asked to pick an element (the
 * Canvas's `picking`): a timeline or a region, read from what the press hit,
 * as the inspector reads a selected address for its statements. A gap of
 * an elision, stored or default, its ellipses and its labels pick nothing alike, as a
 * named timestamp's parts do: an elision is no timeline or region of its
 * own, though a default one is addressed as a part of its timeline.
 */

import type { Address, Manifest, ResolvedElement } from "@timetoalign/tilie-core";
import { assertNever, resolveElement } from "@timetoalign/tilie-core";
import type { Hit } from "./boxes.ts";
import { addressParts } from "./editing.ts";
import { gapOf } from "./gaps.ts";

/** The ID of the timeline or region a resolved element stands for, or `null`. */
function pickedId(resolved: ResolvedElement | undefined): string | null {
  switch (resolved?.kind) {
    case "timeline":
    case "card":
    case "band":
      return resolved.at.timeline.id;
    case "entry":
      return resolved.entry === "region" ? resolved.element.id : null;
    case "part":
      return pickedId(resolved.owner);
    case undefined:
    case "title":
    case "frame":
    case "measure_map":
    case "timestamp":
    case "matchstamp":
    case "anchor":
    case "elision":
    case "flow_map":
    case "virtual_timeline":
    case "virtual_card":
    case "virtual_band":
    case "chunk":
      return null;
    default:
      return assertNever(resolved);
  }
}

/**
 * The timeline or region a press on `hit` picks, as `{block, id}`: the
 * timeline of a line, a card or a band, the region of a region, the owner
 * of a part of either (a timeline's name or marks, a region's label);
 * `null` for the gap of an elision, its ellipses and its labels, stored
 * (`{id: E}`) and default (`{id: T, part: ["elision"]}`) alike (`gapOf`),
 * for the block itself, a frame, a group's or the manifest's title,
 * a named timestamp, a map, a flow-control element and anything else.
 * `manifest` is the manifest of the hit's block.
 */
export function pickable(hit: Hit, manifest: Manifest): Address | null {
  const { element } = addressParts(hit.address);
  if (element === null || gapOf(manifest, element) !== null) return null;
  const id = pickedId(resolveElement(manifest, element));
  return id === null ? null : { block: hit.block, id };
}
