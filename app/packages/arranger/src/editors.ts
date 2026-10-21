/** The editors of the canvas: the bundle, group and timeline editors on one element. */

import type { Address, Manifest, View } from "@timetoalign/tilie-core";
import { contains, findTimeline, placedElement, qualify } from "@timetoalign/tilie-core";
import type { DrawnBox } from "@timetoalign/tilie-layout";
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
  const opened = openedBy(hit, block.manifest);
  if (opened === undefined) return null;
  const target = opened === null ? block.id : qualify(block.id, opened);
  if (editing === null) return target;
  const edited = addressParts(editing.target);
  if (edited.block !== block.id || target === editing.target || opened === null) return null;
  if (edited.element === null) return target;
  return contains(block.manifest, edited.element, opened) ? target : null;
}

/**
 * The element `hit` in the drawing of `manifest` opens: its group's or
 * timeline's id, `null` for the block itself, `undefined` for nothing. A
 * frame stands for its group and a card for its timeline (core's
 * `placedElement` of its `places` key).
 */
function openedBy(hit: Hit, manifest: Manifest): string | null | undefined {
  const standsFor = (box: DrawnBox | null) =>
    box?.key == null ? undefined : placedElement(manifest, box.key);
  switch (hit.kind) {
    case "box":
      return null;
    case "frame":
    case "card":
      return standsFor(hit.box);
    case "band":
      return undefined;
    case "element": {
      const { element } = addressParts(hit.address);
      if (element !== null && findTimeline(manifest, element) !== undefined) return element;
      return standsFor(hit.within);
    }
  }
}
