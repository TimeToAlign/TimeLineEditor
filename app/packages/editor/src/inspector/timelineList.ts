/**
 * The timeline list of a selected bundle in the Properties tab: the cards
 * its block holds, in drawing order (TimeToShare's `docs/drawing.md`,
 * section 8.1): each group's frame, each ungrouped root's card, then each
 * virtual timeline no group names (section 8.10), drawn in a card of its
 * own only while the block's `places` holds its ID. A group's members, and
 * the roots drawn behind its frame, are reached through the group.
 *
 * A row's Visible checkbox stands only where the card can be hidden and
 * shown again: a virtual timeline's card, hidden as Delete hides it on the
 * canvas (every member of its stated place unstated, the virtual timeline
 * kept) and shown again by stating its place's default scale, so that it
 * lies at its default position, below the items drawn before it (section
 * 8.6). A frame and a root's card are drawn while their group or timeline
 * exists, so their rows offer none.
 */

import type { Subject } from "@timetoalign/tilie-arranger";
import { placeChange } from "@timetoalign/tilie-arranger";
import type { Block, SetCommand, View } from "@timetoalign/tilie-core";
import { compareCodePoints } from "@timetoalign/tilie-core";
import { memberDrawings } from "@timetoalign/tilie-core/drawing";

/** What a row of the list is: a group's frame, a root's card, a virtual timeline's card. */
export type TimelineRowKind = "group" | "timeline" | "virtual_timeline";

/** The Visible checkbox of a row: whether the card is drawn, and the `set` its change sends. */
export interface Visibility {
  readonly checked: boolean;
  readonly command: SetCommand;
}

/** One row of a bundle's timeline list. */
export interface TimelineRow {
  /** The ID of the group, timeline or virtual timeline. */
  readonly id: string;
  readonly kind: TimelineRowKind;
  /** Its name, else its ID. */
  readonly name: string;
  /** Its Visible checkbox; `null` for a card drawn while its group or timeline exists. */
  readonly visible: Visibility | null;
}

/** The `set` of the place of `block`'s item `id`: its members `values`. */
function placeSet(
  block: Block,
  id: string,
  values: { readonly [member: string]: number | null },
): SetCommand {
  return { type: "set", changes: [placeChange(block, { item: id }, values)] };
}

/**
 * The Visible checkbox of the virtual timeline `id`'s card in `block`:
 * checked while `places` holds its ID; unchecking it unstates every member
 * of its place, checking it states `scale` 1.
 */
function virtualVisibility(block: Block, id: string): Visibility {
  const place = Object.hasOwn(block.places, id) ? block.places[id] : undefined;
  if (place === undefined) return { checked: false, command: placeSet(block, id, { scale: 1 }) };
  const members = Object.fromEntries(Object.keys(place).map((member) => [member, null] as const));
  return { checked: true, command: placeSet(block, id, members) };
}

/**
 * The timeline list of the one bundle the subjects name, in `view`: its
 * groups' frames, its ungrouped roots and its virtual timelines no group
 * names, in that order (frames and roots in core's canonical order, virtual
 * timelines by ID). `null` unless the subjects are exactly one block.
 */
export function timelineList(view: View, subjects: readonly Subject[]): TimelineRow[] | null {
  const [subject, ...others] = subjects;
  if (subject === undefined || others.length > 0 || subject.resolved.kind !== "block") return null;
  const block = view.blocks[subject.resolved.block.id];
  if (block === undefined) return null;
  const { manifest } = block;
  const { frames, ungrouped } = memberDrawings(manifest);
  const grouped = new Set(manifest.groups.flatMap((group) => group.members));
  const virtual = (manifest.virtual_timelines ?? [])
    .filter((item) => !grouped.has(item.id))
    .sort((left, right) => compareCodePoints(left.id, right.id));
  return [
    ...frames.map(
      ({ group }): TimelineRow => ({
        id: group.id,
        kind: "group",
        name: group.name ?? group.id,
        visible: null,
      }),
    ),
    ...ungrouped.map(
      ({ timeline }): TimelineRow => ({
        id: timeline.id,
        kind: "timeline",
        name: timeline.name ?? timeline.id,
        visible: null,
      }),
    ),
    ...virtual.map(
      (item): TimelineRow => ({
        id: item.id,
        kind: "virtual_timeline",
        name: item.name ?? item.id,
        visible: virtualVisibility(block, item.id),
      }),
    ),
  ];
}
