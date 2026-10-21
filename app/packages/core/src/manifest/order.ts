/**
 * The orders a manifest's `graphical.order` states (`docs/drawing.md` in
 * TimeToShare, sections 6.4 and 8.1): a group's display order, which stacks
 * its members' cards in its frame, and a timeline's band order, which stacks
 * its own line (`line`) and the bands of its five facets, top to bottom.
 */

import type { Facet } from "@timetoalign/timetoshare";
import type { Located } from "./tree.ts";
import { locateTimeline } from "./tree.ts";
import type { Manifest } from "./types.ts";

/** The entry of `graphical.order` under `key`, a group's or a timeline's ID, if it has one. */
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

/** A band order's entry for a timeline's own line, beside its five facets. */
export const LINE = "line";

/** An entry of a band order: a timeline's own line or one of its facets. */
export type BandOrderEntry = typeof LINE | Facet;

/**
 * The default band order (drawing.md section 4), which a root without an
 * entry in `graphical.order` follows: its children and conversion maps
 * above its line, its markers, regions and flow control below.
 */
export const DEFAULT_BAND_ORDER: readonly BandOrderEntry[] = [
  "children",
  "conversion_maps",
  LINE,
  "markers",
  "regions",
  "flow_control",
];

/**
 * The band order the timeline `timelineId` follows without an entry of its
 * own in `graphical.order`: a root the default band order, every other
 * timeline its parent's band order. A member that is a child timeline
 * follows its parent so too. An ID no timeline carries gets the default
 * band order, as a root would.
 */
export function inheritedBandOrder(manifest: Manifest, timelineId: string): readonly string[] {
  const at = locateTimeline(manifest, timelineId);
  return at === undefined ? DEFAULT_BAND_ORDER : inheritedAt(manifest, at);
}

/** `inheritedBandOrder` of a located timeline, folded down its `parent` chain. */
function inheritedAt(manifest: Manifest, at: Located): readonly string[] {
  const { parent } = at;
  if (parent === undefined) return DEFAULT_BAND_ORDER;
  return ownOrder(manifest, parent.timeline.id) ?? inheritedAt(manifest, parent);
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
 * of TimeToShare's README and validators, IDs and entries in single quotes;
 * `null` for a band order. The schema's problems about the value's shape
 * and its repeats come first, then the identity rules':
 *
 * 1. a value that is not an array of strings: `the band order of '<id>' is
 *    not an array of strings`;
 * 2. an entry repeating an earlier one: `'<entry>' is repeated in the band
 *    order of '<id>'`;
 * 3. an ID no timeline carries (a group's ID is a display order's key,
 *    never asked here): `'<id>' names no group or timeline of this
 *    manifest`;
 * 4. the first entry that is neither `line` nor a facet: `'<entry>' is not
 *    'line' or a facet, in the band order of '<id>'`;
 * 5. the first of `line` and the facets, in the default band order's order,
 *    that the value lacks: `'<entry>' is missing from the band order of
 *    '<id>'`.
 */
export function bandOrderProblem(
  manifest: Manifest,
  timelineId: string,
  value: unknown,
): string | null {
  const id = `'${timelineId}'`;
  if (!Array.isArray(value)) return `the band order of ${id} is not an array of strings`;
  const entries: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") return `the band order of ${id} is not an array of strings`;
    entries.push(entry);
  }
  const repeated = entries.find((entry, index) => entries.indexOf(entry) !== index);
  if (repeated !== undefined) return `'${repeated}' is repeated in the band order of ${id}`;
  if (locateTimeline(manifest, timelineId) === undefined) {
    return `${id} names no group or timeline of this manifest`;
  }
  const expected: readonly string[] = DEFAULT_BAND_ORDER;
  const stranger = entries.find((entry) => !expected.includes(entry));
  if (stranger !== undefined) {
    return `'${stranger}' is not 'line' or a facet, in the band order of ${id}`;
  }
  const missing = expected.find((entry) => !entries.includes(entry));
  if (missing !== undefined) return `'${missing}' is missing from the band order of ${id}`;
  return null;
}
