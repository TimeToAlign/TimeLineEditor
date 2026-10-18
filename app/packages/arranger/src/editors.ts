/** The editors of the canvas: the bundle, group and timeline editors on one element. */

import type { Address, BlockId, EditorKind, View } from "@timetoalign/tilie-core";
import { contains, findTimeline } from "@timetoalign/tilie-core";
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

/** A level of the canvas: the arranger, or an editor of one kind. */
export type Level = "arranger" | EditorKind;

/** The gestures a level of the canvas offers besides resizing (`RESIZING`). */
export interface Gestures {
  /** Drag and nudge blocks. */
  readonly moveBlocks: boolean;
  /** Drag a group's frame or an ungrouped root's card freely inside the box. */
  readonly moveItems: boolean;
  /** Drag and drop a group's member cards into another order. */
  readonly reorderMembers: boolean;
  /** What a marquee selects: whole blocks, or the elements inside the edited element. */
  readonly marquee: "blocks" | "elements";
}

const NONE = { moveBlocks: false, moveItems: false, reorderMembers: false } as const;

/** What each level allows, one row per level, so a later editor adds a row and never a branch. */
export const GESTURES: { readonly [level in Level]: Gestures } = {
  arranger: { ...NONE, moveBlocks: true, marquee: "blocks" },
  bundle: { ...NONE, moveItems: true, marquee: "elements" },
  group: { ...NONE, reorderMembers: true, marquee: "elements" },
  timeline: { ...NONE, marquee: "elements" },
};

/** The gestures the canvas offers under the innermost open editor `editing`; the arranger's without one. */
export function gesturesOf(editing: Editing | null): Gestures {
  return GESTURES[editing === null ? "arranger" : editing.kind];
}

/**
 * The boxes a resize acts on: a block, a group's frame, an ungrouped root's
 * card, and a group member's card.
 */
export type ResizedKind = "block" | "frame" | "card" | "member";

/**
 * Which boxes of a kind resize at a level: every one inside the level's
 * edited element (on the arranger, every one), or only the edited element's
 * own box.
 */
export type Reach = "inside" | "edited";

/**
 * What a resize mode changes: the block's own placement, the place of the
 * item holding the box (the group, for a member's card), or the member's
 * own card size.
 */
export type Written = "block" | "item" | "card";

/** How a kind of box resizes: the levels where it does, and what each mode changes. */
export interface Resizing {
  readonly levels: { readonly [level in Level]?: Reach };
  /** By resize mode (`ResizeMode` of `resize.ts`). */
  readonly writes: { readonly scale: Written; readonly box: Written; readonly stretch: Written };
}

const ITEM: Resizing["writes"] = { scale: "item", box: "item", stretch: "item" };

/**
 * How every kind of box resizes, one row per kind, so a later editor adds a
 * level to the rows and never a branch. Every box resizes in all three modes
 * wherever it resizes. The members of a group share its length and scale, so
 * a member's card scales and stretches its group and sizes only its own box.
 */
export const RESIZING: { readonly [kind in ResizedKind]: Resizing } = {
  block: {
    levels: { arranger: "inside", bundle: "edited" },
    writes: { scale: "block", box: "block", stretch: "block" },
  },
  frame: { levels: { arranger: "inside", bundle: "inside", group: "edited" }, writes: ITEM },
  card: { levels: { arranger: "inside", bundle: "inside", timeline: "edited" }, writes: ITEM },
  member: {
    levels: { arranger: "inside", bundle: "inside", group: "inside", timeline: "edited" },
    writes: { scale: "item", box: "card", stretch: "item" },
  },
};

/**
 * Whether a box of `kind` that lies inside the edited element resizes at
 * `level`; `own` says whether it is the edited element's own box (the block
 * in its bundle editor, the frame in its group editor, the card in its
 * timeline editor).
 */
export function resizes(kind: ResizedKind, level: Level, own: boolean): boolean {
  const reach = RESIZING[kind].levels[level];
  return reach === "inside" || (reach === "edited" && own);
}
