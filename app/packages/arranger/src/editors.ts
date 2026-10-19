/** The editors of the canvas: the bundle, group and timeline editors on one element. */

import type { Address, View } from "@timetoalign/tilie-core";
import { contains, findTimeline, qualify } from "@timetoalign/tilie-core";
import type { Hit } from "./boxes.ts";
import type { Editing } from "./editing.ts";
import { addressParts } from "./editing.ts";

/**
 * The editor target a double-click, a double tap or Enter on `hit` opens, by
 * the container that is hit, never by what it holds: the block's own box
 * opens the block (the bundle editor), a frame its group (the group editor),
 * a card its timeline, and a timeline's line, wherever it is drawn, that
 * timeline (the timeline editor), so a root's line opens the root and a
 * child's line the child. A band opens nothing. Anything else drawn (a name,
 * a label, a region, a boundary) opens what the last drawn card or frame
 * holding it stands for, the innermost where none overlap (`hit.within`),
 * and nothing (`null`) when none holds it. With an editor open, only a
 * target inside the edited element opens, never the edited element itself:
 * any target of its block in the bundle editor, else one the edited group or
 * timeline contains (core's `contains`).
 */
export function editorTargetOf(view: View, hit: Hit, editing: Editing | null): Address | null {
  const block = view.blocks[hit.block];
  if (block === undefined) return null;
  const opened = openedBy(hit, (id) => findTimeline(block.manifest, id) !== undefined);
  if (opened === undefined) return null;
  const target = opened === null ? block.id : qualify(block.id, opened);
  if (editing === null) return target;
  const edited = addressParts(editing.target);
  if (edited.block !== block.id || target === editing.target || opened === null) return null;
  if (edited.element === null) return target;
  return contains(block.manifest, edited.element, opened) ? target : null;
}

/**
 * The element `hit` opens: its group's or timeline's id, `null` for the
 * block itself, `undefined` for nothing. A frame's or a card's key is the
 * group or timeline it stands for.
 */
function openedBy(hit: Hit, isTimeline: (id: string) => boolean): string | null | undefined {
  switch (hit.kind) {
    case "box":
      return null;
    case "frame":
    case "card":
      return hit.box?.key ?? undefined;
    case "band":
      return undefined;
    case "element": {
      const { element } = addressParts(hit.address);
      if (element !== null && isTimeline(element)) return element;
      return hit.within?.key ?? undefined;
    }
  }
}
