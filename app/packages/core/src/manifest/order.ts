/**
 * The orders a manifest's `graphical.order` states (`docs/drawing.md` in
 * timeskeleton, sections 6.4 and 8.1): a group's display order, which stacks
 * its members' cards in its frame, and a timeline's band order, which stacks
 * its bands and its own line, top to bottom.
 */

import type { BandKind } from "./bands.ts";
import { BAND_KINDS, bandAddress } from "./bands.ts";
import type { Located } from "./tree.ts";
import { locateTimeline } from "./tree.ts";
import type { Manifest } from "./types.ts";

/** The entry of `graphical.order` under `key`, a group's or a timeline's id, if it has one. */
function ownOrder(manifest: Manifest, key: string): readonly string[] | undefined {
  const order = manifest.graphical?.order;
  return order !== undefined && Object.hasOwn(order, key) ? order[key] : undefined;
}

/**
 * The display order of the group `group`: its entry in `graphical.order`,
 * else its `members`; empty for an id no group carries.
 */
export function displayOrder(manifest: Manifest, group: string): readonly string[] {
  return (
    ownOrder(manifest, group) ?? manifest.groups.find((item) => item.id === group)?.members ?? []
  );
}

/** The kinds of band above a timeline's line in the default band order; the others lie below. */
const ABOVE: readonly BandKind[] = ["children", "conversion_maps"];

/**
 * The default band order of the timeline `id`, which a root without an entry
 * in `graphical.order` follows: its children and conversion maps above its
 * line, its markers, regions and flow control below.
 */
export function defaultBandOrder(id: string): readonly string[] {
  const band = (kind: BandKind) => bandAddress(id, kind);
  return [...ABOVE.map(band), id, ...BAND_KINDS.filter((kind) => !ABOVE.includes(kind)).map(band)];
}

/** A parent's band order as its child follows it: the parent's id and bands replaced by the child's. */
function followed(order: readonly string[], parent: string, child: string): readonly string[] {
  const renamed = new Map<string, string>([
    [parent, child],
    ...BAND_KINDS.map((kind): [string, string] => [
      bandAddress(parent, kind),
      bandAddress(child, kind),
    ]),
  ]);
  return order.map((entry) => renamed.get(entry) ?? entry);
}

/**
 * The band order the timeline `timelineId` follows without an entry of its
 * own in `graphical.order`: a root the default band order, every other
 * timeline its parent's band order, band by band id (the parent's
 * `P/regions_1` becomes its own `T/regions_1`, `P` itself `T`). A member
 * that is a child timeline follows its parent so too. An id no timeline
 * carries gets the default band order, as a root would.
 */
export function inheritedBandOrder(manifest: Manifest, timelineId: string): readonly string[] {
  const at = locateTimeline(manifest, timelineId);
  return at === undefined ? defaultBandOrder(timelineId) : inheritedAt(manifest, at);
}

/** `inheritedBandOrder` of a located timeline, folded down its `parent` chain. */
function inheritedAt(manifest: Manifest, at: Located): readonly string[] {
  const { parent } = at;
  if (parent === undefined) return defaultBandOrder(at.timeline.id);
  const order = ownOrder(manifest, parent.timeline.id) ?? inheritedAt(manifest, parent);
  return followed(order, parent.timeline.id, at.timeline.id);
}

/**
 * The band order the timeline `timelineId` is drawn with: its own entry in
 * `graphical.order`, else the order it inherits (`inheritedBandOrder`).
 */
export function bandOrderOf(manifest: Manifest, timelineId: string): readonly string[] {
  return ownOrder(manifest, timelineId) ?? inheritedBandOrder(manifest, timelineId);
}

/**
 * The first problem of `value` as the band order of the timeline
 * `timelineId`, its entry in `graphical.order`, in the terms and the order
 * of timeskeleton's README and validators, ids quoted as JSON; `null` for a
 * band order. The schema's problems about the value's shape and its repeats
 * come first, then the identity rules':
 *
 * 1. a value that is not an array of strings: `the band order of "<id>" is
 *    not an array of strings`;
 * 2. an entry repeating an earlier one: `"<entry>" is repeated in the band
 *    order of "<id>"`;
 * 3. an id no timeline carries (a group's id is a display order's key,
 *    never asked here): `"<id>" names no group or timeline of this
 *    manifest`;
 * 4. the first entry that is neither the timeline's id nor one of its five
 *    bands: `"<entry>" is not "<id>" or one of its bands`. An entry the
 *    schema's pattern refuses (`score/foo`, `score/regions_0`,
 *    `score/start`) is reported as such a stranger, where the validators
 *    report the pattern at the entry: both refuse it, so core and the
 *    validators refuse the same values;
 * 5. the first of the id and the bands, in the default band order's order,
 *    that the value lacks: `"<address>" is missing from the band order of
 *    "<id>"`.
 */
export function bandOrderProblem(
  manifest: Manifest,
  timelineId: string,
  value: unknown,
): string | null {
  const id = JSON.stringify(timelineId);
  if (!Array.isArray(value)) return `the band order of ${id} is not an array of strings`;
  const entries: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") return `the band order of ${id} is not an array of strings`;
    entries.push(entry);
  }
  const repeated = entries.find((entry, index) => entries.indexOf(entry) !== index);
  if (repeated !== undefined) {
    return `${JSON.stringify(repeated)} is repeated in the band order of ${id}`;
  }
  if (locateTimeline(manifest, timelineId) === undefined) {
    return `${id} names no group or timeline of this manifest`;
  }
  const expected = defaultBandOrder(timelineId);
  const stranger = entries.find((entry) => !expected.includes(entry));
  if (stranger !== undefined) return `${JSON.stringify(stranger)} is not ${id} or one of its bands`;
  const missing = expected.find((address) => !entries.includes(address));
  if (missing !== undefined) {
    return `${JSON.stringify(missing)} is missing from the band order of ${id}`;
  }
  return null;
}
