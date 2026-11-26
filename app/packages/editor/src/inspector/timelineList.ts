/**
 * The timeline list of a selected bundle in the Properties tab: the cards
 * its block holds, in drawing order (TimeToShare's `docs/drawing.md`,
 * section 8.1): each group's frame, each ungrouped root's card, then each
 * virtual timeline no group names (section 8.10), drawn in a card of its
 * own only while the block's `places` holds its ID. A group's members, and
 * the roots drawn behind its frame, are reached through the group.
 *
 * A row's Visible checkbox stands where the card can be hidden and shown
 * again. A virtual timeline's card is hidden as Delete hides it on the
 * canvas (the arranger's `hideCommand`: every member of its stated place
 * unstated, the virtual timeline kept) and shown again by stating its
 * place's default scale, so that it lies at its default position, below
 * the items drawn before it (section 8.6). A root's card is hidden by the
 * one rule the deletion dialog's "Hide instead" writes for a root (the
 * arranger's `rootDisplayCommand`, `display: none` on its card, its line
 * and its bands), and shown again by removing that rule. A frame is drawn
 * while its group exists, so its row offers none.
 */

import type { Subject } from "@timetoalign/tilie-arranger";
import {
  hideCommand,
  placeChange,
  rootDisplayCommand,
  rootHidden,
} from "@timetoalign/tilie-arranger";
import type { Block, SetCommand, StyleCommand, View } from "@timetoalign/tilie-core";
import { compareCodePoints, idAddress, inBlock } from "@timetoalign/tilie-core";
import { memberDrawings } from "@timetoalign/tilie-core/drawing";

/** What a row of the list is: a group's frame, a root's card, a virtual timeline's card. */
export type TimelineRowKind = "group" | "timeline" | "virtual_timeline";

/** The Visible checkbox of a row: whether the card is drawn, and the command its change sends. */
export interface Visibility {
  readonly checked: boolean;
  readonly command: SetCommand | StyleCommand;
}

/** One row of a bundle's timeline list. */
export interface TimelineRow {
  /** The ID of the group, timeline or virtual timeline. */
  readonly id: string;
  readonly kind: TimelineRowKind;
  /** Its name, else its ID. */
  readonly name: string;
  /** Its Visible checkbox; `null` for a frame, drawn while its group exists. */
  readonly visible: Visibility | null;
}

/**
 * The Visible checkbox of the virtual timeline `id`'s card in `block`:
 * checked while `places` holds its ID; unchecking it hides the card as
 * Delete does (`hideCommand`), checking it states `scale` 1.
 */
function virtualVisibility(view: View, block: Block, id: string): Visibility {
  if (!Object.hasOwn(block.places, id)) {
    return {
      checked: false,
      command: { type: "set", changes: [placeChange(block, { item: id }, { scale: 1 })] },
    };
  }
  return { checked: true, command: hideCommand(view, [inBlock(block.id, idAddress(id))]) };
}

/**
 * The Visible checkbox of the root `id`'s card in `block`: checked unless
 * the manifest holds the rule hiding it (`rootHidden`); a change writes or
 * removes that rule (`rootDisplayCommand`).
 */
function rootVisibility(block: Block, id: string): Visibility {
  const hidden = rootHidden(block.manifest, id);
  return { checked: !hidden, command: rootDisplayCommand(block.id, id, !hidden) };
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
        visible: rootVisibility(block, timeline.id),
      }),
    ),
    ...virtual.map(
      (item): TimelineRow => ({
        id: item.id,
        kind: "virtual_timeline",
        name: item.name ?? item.id,
        visible: virtualVisibility(view, block, item.id),
      }),
    ),
  ];
}
