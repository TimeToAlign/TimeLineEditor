/**
 * The orders a manifest's `graphical.order` states (`docs/drawing.md` in
 * TimeToShare, sections 6.4 and 8.1): a group's display order, which stacks
 * its members' cards in its frame, and a timeline's band order, which stacks
 * its own line (`line`) and the bands of its five facets, top to bottom; a
 * stated band order may leave facets out, which then keep their places from
 * the order the timeline would follow without it.
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
 * `stated`, an entry of `graphical.order` listing `line` and any of the five
 * facets, completed against `inherited`, the order the timeline follows
 * without an entry (TimeToShare's README, "Groups and the `graphical`
 * block"): the stated entries keep their order; every facet `stated` leaves
 * out keeps the side of `line` it has in `inherited` and lies beyond the
 * stated entries on that side, in `inherited`'s sequence, so the omitted
 * facets above the line come before the stated entries and the omitted
 * facets below it after them. A stated order listing every facet is
 * returned as it is.
 */
function completedBandOrder(
  stated: readonly string[],
  inherited: readonly string[],
): readonly string[] {
  const omitted = inherited.filter((entry) => !stated.includes(entry));
  if (omitted.length === 0) return stated;
  const line = inherited.indexOf(LINE);
  const above = omitted.filter((entry) => inherited.indexOf(entry) < line);
  const below = omitted.filter((entry) => inherited.indexOf(entry) > line);
  return [...above, ...stated, ...below];
}

/**
 * The band order the timeline `timelineId` follows without an entry of its
 * own in `graphical.order`: a root the default band order, every other
 * timeline its parent's band order (`bandOrderOf`), completed. A member that
 * is a child timeline follows its parent so too. An ID no timeline carries
 * gets the default band order, as a root would.
 */
export function inheritedBandOrder(manifest: Manifest, timelineId: string): readonly string[] {
  const at = locateTimeline(manifest, timelineId);
  return at === undefined ? DEFAULT_BAND_ORDER : inheritedAt(manifest, at);
}

/** `inheritedBandOrder` of a located timeline, folded down its `parent` chain. */
function inheritedAt(manifest: Manifest, at: Located): readonly string[] {
  const { parent } = at;
  return parent === undefined ? DEFAULT_BAND_ORDER : orderAt(manifest, parent);
}

/** `bandOrderOf` of a located timeline. */
function orderAt(manifest: Manifest, at: Located): readonly string[] {
  const inherited = inheritedAt(manifest, at);
  const own = ownOrder(manifest, at.timeline.id);
  return own === undefined ? inherited : completedBandOrder(own, inherited);
}

/**
 * The band order the timeline `timelineId` is drawn with, `line` and all
 * five facets: its own entry in `graphical.order` completed against the
 * order it inherits (`inheritedBandOrder`), else that order. A virtual
 * timeline, which lies in no tree, completes its own entry against the
 * default band order, as a root does (drawing.md section 8.10). Any other
 * ID gets the default band order.
 */
export function bandOrderOf(manifest: Manifest, timelineId: string): readonly string[] {
  const at = locateTimeline(manifest, timelineId);
  if (at !== undefined) return orderAt(manifest, at);
  const own = (manifest.virtual_timelines ?? []).some((item) => item.id === timelineId)
    ? ownOrder(manifest, timelineId)
    : undefined;
  return own === undefined ? DEFAULT_BAND_ORDER : completedBandOrder(own, DEFAULT_BAND_ORDER);
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
 * 3. an ID no timeline and no virtual timeline carries (a group's ID is a
 *    display order's key, never asked here): `'<id>' names no group,
 *    timeline or virtual timeline of this manifest`;
 * 4. the first entry that is neither `line` nor a facet: `'<entry>' is not
 *    'line' or a facet, in the band order of '<id>'`;
 * 5. a value without `line`: `'line' is missing from the band order of
 *    '<id>'`. A facet the value leaves out is no problem: it takes its place
 *    from the order the timeline follows without an entry (`bandOrderOf`).
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
  const virtual = (manifest.virtual_timelines ?? []).some((item) => item.id === timelineId);
  if (locateTimeline(manifest, timelineId) === undefined && !virtual) {
    return `${id} names no group, timeline or virtual timeline of this manifest`;
  }
  const expected: readonly string[] = DEFAULT_BAND_ORDER;
  const stranger = entries.find((entry) => !expected.includes(entry));
  if (stranger !== undefined) {
    return `'${stranger}' is not 'line' or a facet, in the band order of ${id}`;
  }
  if (!entries.includes(LINE)) return `'${LINE}' is missing from the band order of ${id}`;
  return null;
}
