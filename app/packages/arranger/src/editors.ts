/** The editors of the canvas: the bundle, group and timeline editors on one element. */

import type { Address, BlockId, EditorKind, View } from "@timetoalign/tilie-core";
import { contains, findTimeline, memberDrawings } from "@timetoalign/tilie-core";
import type { Hit } from "./boxes.ts";
import { blockOf } from "./selection.ts";

/** The innermost open editor, as the canvas draws it: its target and its kind. */
export interface Editing {
  readonly target: Address;
  readonly kind: EditorKind;
}

/** Whether two editors are the same editor, or both absent. */
export function sameEditing(left: Editing | null, right: Editing | null): boolean {
  if (left === null || right === null) return left === right;
  return left.target === right.target && left.kind === right.kind;
}

/**
 * The block an editor's target lies in and the target's element address
 * within it: `null` for the block itself, the bundle editor's target.
 */
export function editedElement(target: Address): { block: BlockId; element: string | null } {
  const block = blockOf(target);
  return { block, element: target === block ? null : target.slice(block.length + 1) };
}

/**
 * The editor target a double-click, a double tap or Enter on `hit` opens, by
 * the box that is hit, never by what it holds: the block's own box opens the
 * block (the bundle editor), a frame its group (the group editor), a card its
 * timeline, and a timeline's line, wherever it is drawn, that timeline (the
 * timeline editor), so a root's line opens the root and a child's line the
 * child. Anything else drawn (a name, a label, a region, a boundary) opens
 * the innermost card or frame holding it (`hit.within`), and nothing
 * (`null`) when none holds it. With an editor open, only a
 * target inside the edited element opens, never the edited element itself:
 * any target of its block in the bundle editor, else one the edited group or
 * timeline contains (core's `contains`).
 */
export function editorTargetOf(view: View, hit: Hit, editing: Editing | null): Address | null {
  const block = view.blocks[hit.block];
  if (block === undefined) return null;
  const target = openedBy(hit, (id) => findTimeline(block.manifest, id) !== undefined);
  if (target === null || editing === null) return target;
  const edited = editedElement(editing.target);
  if (edited.block !== block.id || target === editing.target || target === block.id) return null;
  if (edited.element === null) return target;
  return contains(block.manifest, edited.element, target.slice(block.id.length + 1))
    ? target
    : null;
}

function openedBy(hit: Hit, isTimeline: (id: string) => boolean): Address | null {
  switch (hit.kind) {
    case "block":
    case "group":
      return hit.address;
    case "card":
      return hit.address.slice(0, -"/card".length);
    case "element": {
      if (isTimeline(hit.address.slice(hit.block.length + 1))) return hit.address;
      if (hit.within === null) return null;
      const box = hit.within.endsWith("/card") ? hit.within.slice(0, -"/card".length) : hit.within;
      return `${hit.block}/${box}`;
    }
  }
}

/** The gestures a level of the canvas offers: the arranger, or an editor of one kind. */
export interface Gestures {
  /** Drag and nudge blocks. */
  readonly moveBlocks: boolean;
  /** Scale, box and stretch blocks. */
  readonly resizeBlocks: boolean;
  /** Drag a group's frame or an ungrouped root's card freely inside the box. */
  readonly moveItems: boolean;
  /** Box and stretch a group's frame or an ungrouped root's card. */
  readonly resizeItems: boolean;
  /** Drag and drop a group's member cards into another order. */
  readonly reorderMembers: boolean;
  /** Stretch the members' common length, never past their frame. */
  readonly stretchMembers: boolean;
  /** Box the edited group's frame. */
  readonly resizeFrame: boolean;
  /** Stretch the edited timeline's card, the bundle box adapting. */
  readonly stretchCard: boolean;
  /** What a marquee selects: whole blocks, or the elements inside the edited element. */
  readonly marquee: "blocks" | "elements";
}

const NONE = {
  moveBlocks: false,
  resizeBlocks: false,
  moveItems: false,
  resizeItems: false,
  reorderMembers: false,
  stretchMembers: false,
  resizeFrame: false,
  stretchCard: false,
} as const;

/**
 * What each level allows, one row per level, so a later editor adds a row and
 * never a branch. The timeline editor's `stretchCard` holds only for an
 * ungrouped root's card (`gesturesOf`): a member's length would change its
 * siblings, which that editor does not show.
 */
export const GESTURES: { readonly [level in "arranger" | EditorKind]: Gestures } = {
  arranger: { ...NONE, moveBlocks: true, resizeBlocks: true, marquee: "blocks" },
  bundle: { ...NONE, moveItems: true, resizeItems: true, marquee: "elements" },
  group: {
    ...NONE,
    reorderMembers: true,
    stretchMembers: true,
    resizeFrame: true,
    marquee: "elements",
  },
  timeline: { ...NONE, stretchCard: true, marquee: "elements" },
};

const FIXED_TIMELINE: Gestures = { ...GESTURES.timeline, stretchCard: false };

/**
 * The gestures the canvas offers under the innermost open editor `editing`:
 * its kind's row of `GESTURES`, the arranger's without an editor, and in a
 * timeline editor no `stretchCard` unless the timeline is an ungrouped root.
 */
export function gesturesOf(view: View, editing: Editing | null): Gestures {
  if (editing === null) return GESTURES.arranger;
  if (editing.kind !== "timeline") return GESTURES[editing.kind];
  const { block, element } = editedElement(editing.target);
  const manifest = view.blocks[block]?.manifest;
  if (manifest === undefined) return FIXED_TIMELINE;
  const ungrouped = memberDrawings(manifest).ungrouped.some(
    (drawn) => drawn.timeline.id === element,
  );
  return ungrouped ? GESTURES.timeline : FIXED_TIMELINE;
}
