/**
 * What each level of the canvas permits, how each container resizes, the
 * place members each level edits on a container, and the selection
 * resolved to the containers it names. One row per level (`LEVELS`) and one
 * per kind of container (`RESIZING`), so a later editor or container adds a
 * row and never a branch.
 */

import type {
  Address,
  BlockId,
  ContainerKind,
  EditorKind,
  ResolvedAddress,
  View,
} from "@timetoalign/tilie-core";
import { ITEM_PLACE_MEMBERS, isCommandError, resolveAddress } from "@timetoalign/tilie-core";
import type { Drawing, DrawnBox } from "@timetoalign/tilie-layout";
import type { FontMetrics } from "@timetoalign/timeskeleton";
import { boxOf, isHeld, isItem } from "./boxes.ts";
import { drawingOf } from "./drawing.ts";
import type { Editing } from "./editing.ts";
import type { ResizeMode } from "./resize.ts";
import type { Selection } from "./selection.ts";

/** A level of the canvas: the arranger, or an editor of one kind. */
export type Level = "arranger" | EditorKind;

/** What a level of the canvas permits. */
export interface LevelRules {
  /** Drag what the level places freely: blocks on the arranger, items in the bundle editor. */
  readonly move: boolean;
  /** Step the selected blocks by key, by a pixel or by a large step. */
  readonly nudge: boolean;
  /** Drag a group's member cards into another display order. */
  readonly reorder: boolean;
  /** Drag a band of the edited timeline elsewhere in its band order, or step it there by key. */
  readonly bands: boolean;
  /** What a marquee selects: whole blocks, or the elements inside the edited element. */
  readonly marquee: "blocks" | "elements";
  /**
   * Whether items lie freely in their box, so an edit of one item's place
   * also states the drawn position of every other item that states none and
   * nothing else moves; otherwise an item below follows the edited one down.
   */
  readonly itemsFree: boolean;
  /** Whether a frame keeps its drawn width while its content, stretched along time, fits in it. */
  readonly frameWidthPinned: boolean;
  /** Delete the selection. */
  readonly remove: boolean;
  /** Raise and lower blocks among their siblings. */
  readonly order: boolean;
  /** Open an editor. */
  readonly open: boolean;
  /** Toggle the canvas's lock. */
  readonly lock: boolean;
  /** Resize the selected container: choose a mode and drag its handles. */
  readonly resize: boolean;
}

const NONE = {
  move: false,
  nudge: false,
  reorder: false,
  bands: false,
  itemsFree: false,
  frameWidthPinned: false,
  remove: true,
  order: false,
  open: true,
  lock: true,
  resize: true,
} as const;

/** What the arranger and each editor level permit. */
export const LEVELS: { readonly [level in Level]: LevelRules } = {
  arranger: { ...NONE, move: true, nudge: true, marquee: "blocks", itemsFree: true, order: true },
  bundle: { ...NONE, move: true, marquee: "elements", itemsFree: true },
  group: { ...NONE, reorder: true, marquee: "elements", frameWidthPinned: true },
  timeline: { ...NONE, bands: true, marquee: "elements" },
};

/**
 * What the canvas permits under `editing`, the innermost open editor (the
 * arranger's rules without one): a locked canvas changes no placement, so it
 * moves and nudges nothing, moves no band and resizes nothing; a read-only canvas
 * writes nothing, so it also reorders, removes, raises or lowers nothing,
 * opens no editor (an opened editor is journalled) and offers no lock. Selecting, the marquee,
 * panning and zooming stay. The one answer to "may this run".
 */
export function rulesOf(
  editing: Editing | null,
  mode: { readonly locked: boolean; readonly readonly: boolean },
): LevelRules {
  const rules = LEVELS[editing === null ? "arranger" : editing.kind];
  if (mode.readonly) {
    return {
      ...rules,
      move: false,
      nudge: false,
      reorder: false,
      bands: false,
      remove: false,
      order: false,
      open: false,
      lock: false,
      resize: false,
    };
  }
  return mode.locked ? { ...rules, move: false, nudge: false, bands: false, resize: false } : rules;
}

/**
 * The storage owner of a resize value: the block's own placement, the place
 * of the item holding the container (a held card's frame), or the
 * container's own place (a held card's).
 */
export type Written = "block" | "item" | "own";

/** How a container resizes: the levels where it does, and what each mode writes. */
export interface Resizing {
  /**
   * Which containers resize at a level: every one inside the level's edited
   * element (on the arranger, every one), or only the edited element's own.
   */
  readonly levels: { readonly [level in Level]?: "inside" | "edited" };
  /**
   * By resize mode (`ResizeMode` of `resize.ts`), a stretch by its axis:
   * `length` along time, `spacing` vertically.
   */
  readonly writes: {
    readonly scale: Written;
    readonly box: Written;
    readonly length: Written;
    readonly spacing: Written;
  };
}

const ITEM: Resizing["writes"] = { scale: "item", box: "item", length: "item", spacing: "item" };

/**
 * How every container resizes, one row per kind and a held card's row
 * beside the card's. Every container resizes in all three modes wherever it
 * resizes. The members of a group share its length and scale, so a held
 * card scales its group and stretches it along time, and sizes and
 * stretches vertically only its own card. A band never resizes.
 */
const RESIZING: { readonly [kind in ContainerKind | "held"]: Resizing } = {
  box: {
    levels: { arranger: "inside", bundle: "edited" },
    writes: { scale: "block", box: "block", length: "block", spacing: "block" },
  },
  frame: { levels: { arranger: "inside", bundle: "inside", group: "edited" }, writes: ITEM },
  card: { levels: { arranger: "inside", bundle: "inside", timeline: "edited" }, writes: ITEM },
  held: {
    levels: { arranger: "inside", bundle: "inside", group: "inside", timeline: "edited" },
    writes: { scale: "item", box: "own", length: "item", spacing: "own" },
  },
  band: { levels: {}, writes: ITEM },
};

/** How `box` resizes: by its kind, and for a card by whether a frame holds it. */
export function resizingOf(box: DrawnBox): Resizing {
  return RESIZING[isHeld(box) ? "held" : box.kind];
}

/**
 * Whether `box`, lying inside the edited element, resizes at `level`; `own`
 * says whether it is the edited element's own container (the block in its
 * bundle editor, the frame in its group editor, the card in its timeline
 * editor).
 */
export function resizes(box: DrawnBox, level: Level, own: boolean): boolean {
  const reach = resizingOf(box).levels[level];
  return reach === "inside" || (reach === "edited" && own);
}

const MODES: readonly ResizeMode[] = ["scale", "box", "stretch"];

/** A member of a place, as the inspector and `placeEdit` edit it, in core's order of a place. */
export type PlaceProperty = (typeof ITEM_PLACE_MEMBERS)[number];

/**
 * What changes each place member: its entry of `Resizing.writes` (a stretch
 * by its axis, a width or height the box mode); `null` for a position,
 * which moving changes.
 */
export const RESIZED_BY: {
  readonly [property in PlaceProperty]: keyof Resizing["writes"] | null;
} = {
  x: null,
  y: null,
  length: "length",
  scale: "scale",
  spacing: "spacing",
  width: "box",
  height: "box",
};

/** A place member of one container as a level edits it. */
export interface PlaceField {
  readonly property: PlaceProperty;
  /** Whether the level edits it; a member it does not edit is shown, never changed. */
  readonly offered: boolean;
  /** Whose value it is: the block's, the item's holding the container, or the container's own. */
  readonly written: Written;
}

/**
 * The place members of `box` at `level`, in core's order of a place, each
 * with whether the level edits it and whose value it is (`RESIZING`). A
 * member a resize changes is edited where the container resizes
 * (`resizingOf`), and the block's own size wherever its block is edited,
 * since every editor's box adapts it. A position is the block's or an
 * item's: the block's is edited at every level, an item's in an editor
 * whose level moves what it places (`LEVELS`, the bundle editor); a card a
 * frame holds has none, its frame placing it. A band has no place: none.
 */
export function fieldsOf(box: DrawnBox, level: Level): readonly PlaceField[] {
  if (box.kind === "band") return [];
  const { levels, writes } = resizingOf(box);
  const resizes = levels[level] !== undefined;
  const block = box.kind === "box";
  return ITEM_PLACE_MEMBERS.flatMap((property): PlaceField[] => {
    const by = RESIZED_BY[property];
    if (by === null) {
      if (!block && !isItem(box)) return [];
      const moves = block || (level !== "arranger" && LEVELS[level].move);
      return [{ property, offered: moves, written: block ? "block" : "item" }];
    }
    return [{ property, offered: resizes || (block && by === "box"), written: writes[by] }];
  });
}

/**
 * The resize modes the toolbar offers for `box` at `level`, in the toolbar's
 * order: all three wherever it resizes, none elsewhere.
 */
export function resizeModes(box: DrawnBox, level: Level): readonly ResizeMode[] {
  return resizingOf(box).levels[level] === undefined ? [] : MODES;
}

/** One selected address resolved to its block, the container it names and its drawn box. */
export interface Subject {
  readonly address: Address;
  readonly block: BlockId;
  /** The container the address names directly, or `"element"` for anything else. */
  readonly kind: ContainerKind | "element";
  /**
   * The drawn container the address names: the block's box, a frame, a card,
   * a band (its first record); for a timeline, or a part of a timeline or a
   * group, the card or frame drawn for it; `null` otherwise.
   */
  readonly box: DrawnBox | null;
  readonly resolved: ResolvedAddress;
}

const KINDS: { readonly [kind in ResolvedAddress["kind"]]?: ContainerKind } = {
  block: "box",
  frame: "frame",
  card: "card",
  band: "band",
};

/** The drawn container `resolved` names or stands for in `drawing`. */
function boxFor(drawing: Drawing, resolved: ResolvedAddress): DrawnBox | null {
  switch (resolved.kind) {
    case "block":
      return boxOf(drawing, null) ?? null;
    case "frame":
    case "card":
    case "band":
      return boxOf(drawing, resolved.container.address) ?? null;
    case "timeline":
      return resolved.container === null
        ? null
        : (boxOf(drawing, resolved.container.address) ?? null);
    case "part":
      return boxFor(drawing, resolved.owner);
    default:
      return null;
  }
}

/**
 * The selection resolved through core's `resolveAddress`, one subject per
 * address that names something in `view`, in selection order; an address
 * that names nothing (or the workspace) is left out. Each subject's box is
 * read from its block's drawing (`drawingOf` with `metrics`).
 */
export function resolveSelection(
  view: View,
  selection: Selection,
  metrics: FontMetrics,
): Subject[] {
  const subjects: Subject[] = [];
  for (const address of selection) {
    const resolved = resolveAddress(view, address);
    if (isCommandError(resolved) || resolved.kind === "workspace") continue;
    const { block } = resolved;
    subjects.push({
      address,
      block: block.id,
      kind: KINDS[resolved.kind] ?? "element",
      box: boxFor(drawingOf(block, view.settings, metrics), resolved),
      resolved,
    });
  }
  return subjects;
}
