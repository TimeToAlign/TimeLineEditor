/**
 * The five bands of every timeline (`docs/drawing.md` in timeskeleton,
 * sections 2.1, 2.2, 4 and 6.4): their kinds, their addresses, the ids they
 * reserve, and the band order that stacks them and the timeline's own line,
 * top to bottom.
 */

import type { Located } from "./tree.ts";
import { locateTimeline } from "./tree.ts";
import type { Manifest } from "./types.ts";

/** The kinds of a timeline's bands, in the order of the default band order. */
export const BAND_KINDS = [
  "children",
  "conversion_maps",
  "markers",
  "regions",
  "flow_control",
] as const;

/** What a band holds of its timeline: its children, maps, markers, regions or flow control. */
export type BandKind = (typeof BAND_KINDS)[number];

/**
 * The ids reserved for bands: a kind, `_` and a number from 1 without a
 * leading zero. No id of a manifest matches it, whatever its number; every
 * band is numbered 1.
 */
export const BAND_ID_PATTERN = new RegExp(`^(${BAND_KINDS.join("|")})_[1-9][0-9]*$`);

/** The address of the band of `kind` of the timeline `timeline`: `<timeline>/<kind>_1`. */
export function bandAddress(timeline: string, kind: BandKind): string {
  return `${timeline}/${kind}_1`;
}

/** The timeline and kind of a band address `<timeline>/<kind>_1`; `null` for any other address. */
export function parseBand(
  address: string,
): { readonly timeline: string; readonly kind: BandKind } | null {
  const slash = address.indexOf("/");
  if (slash <= 0) return null;
  const id = address.slice(slash + 1);
  const kind = BAND_KINDS.find((item) => id === `${item}_1`);
  return kind === undefined ? null : { timeline: address.slice(0, slash), kind };
}

/**
 * The default band order of the timeline `id`, which a root without an entry
 * in `graphical.order` follows: its children and conversion maps above its
 * line, its markers, regions and flow control below.
 */
export function defaultBandOrder(id: string): readonly string[] {
  return [
    bandAddress(id, "children"),
    bandAddress(id, "conversion_maps"),
    id,
    bandAddress(id, "markers"),
    bandAddress(id, "regions"),
    bandAddress(id, "flow_control"),
  ];
}

/** The timeline `id`'s own band order, its entry in `graphical.order`, if it has one. */
function ownBandOrder(manifest: Manifest, id: string): readonly string[] | undefined {
  const order = manifest.graphical?.order;
  return order !== undefined && Object.hasOwn(order, id) ? order[id] : undefined;
}

/** A parent's band order as its child follows it: the parent's id and bands replaced by the child's. */
function followed(order: readonly string[], parent: string, child: string): readonly string[] {
  return order.map((entry) => {
    if (entry === parent) return child;
    const band = parseBand(entry);
    return band?.timeline === parent ? bandAddress(child, band.kind) : entry;
  });
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
  const order = ownBandOrder(manifest, parent.timeline.id) ?? inheritedAt(manifest, parent);
  return followed(order, parent.timeline.id, at.timeline.id);
}

/**
 * The band order the timeline `timelineId` is drawn with: its own entry in
 * `graphical.order`, else the order it inherits (`inheritedBandOrder`).
 */
export function bandOrderOf(manifest: Manifest, timelineId: string): readonly string[] {
  return ownBandOrder(manifest, timelineId) ?? inheritedBandOrder(manifest, timelineId);
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
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) {
    return `the band order of ${id} is not an array of strings`;
  }
  const entries = value as readonly string[];
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
