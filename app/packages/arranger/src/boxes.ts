/**
 * The boxes of a block's drawing and what the pointer does with them. The
 * drawing's containers (`docs/drawing.md` in timeskeleton, section 8) are
 * the block's own box, a group's frame, a timeline's card (an item of the
 * box for an ungrouped root, held by its group's frame for a member) and,
 * in a timeline's editor, the bands of its timeline (section 6.4), which
 * the drawing records and never draws. Layout records every one of them,
 * the box first, as `Drawing.boxes`; this module is the one reader of that
 * list and of the descriptors' sources, and derives nothing from where
 * elements lie or from the order of descriptors.
 *
 * It decides what a press hits, what it selects, what the pointer
 * highlights, and which boxes hold part of the selection, by what each box
 * draws, never by where it lies. While an editor is open, only what lies
 * inside the edited element is selected and highlighted. The editor a
 * double-click on a hit opens is `editorTargetOf`'s (`editors.ts`).
 */

import type { Address, BlockId, ContainerKind } from "@timetoalign/tilie-core";
import { parseBand, qualify } from "@timetoalign/tilie-core";
import type { Drawing, DrawnBox, DrawnElement } from "@timetoalign/tilie-layout";
import type { Descriptor, DescriptorSource } from "@timetoalign/tilie-writers";
import type { Editing } from "./editing.ts";
import { addressParts, bandTimelineOf } from "./editing.ts";

/** A frame or a box-held card: a box placed freely in the block's box. */
export type ItemBox = DrawnBox & {
  readonly key: string;
  readonly address: string;
  readonly item: NonNullable<DrawnBox["item"]>;
};

/** Any card, an item of the box or held by a frame. */
export type CardBox = DrawnBox & {
  readonly kind: "card";
  readonly key: string;
  readonly address: string;
  readonly card: NonNullable<DrawnBox["card"]>;
};

/** A band of a timeline drawn with a line of its own. */
export type BandBox = DrawnBox & {
  readonly kind: "band";
  readonly address: string;
  readonly band: NonNullable<DrawnBox["band"]>;
};

/** Whether `box` is an item: a frame, or a card the box holds. */
export function isItem(box: DrawnBox): box is ItemBox {
  return box.item !== undefined && box.key !== null && box.address !== null;
}

/** Whether `box` is a card. */
export function isCard(box: DrawnBox): box is CardBox {
  return box.kind === "card" && box.card !== undefined && box.key !== null && box.address !== null;
}

/** Whether `box` is a card held by a frame, a group member's: a card that is no item. */
export function isHeld(box: DrawnBox): box is CardBox {
  return isCard(box) && box.item === undefined;
}

/** Whether `box` is a band. */
export function isBand(box: DrawnBox): box is BandBox {
  return box.kind === "band" && box.band !== undefined && box.address !== null;
}

/** A point in a drawing's own units. */
export interface DrawingPoint {
  readonly x: number;
  readonly y: number;
}

/** What a descriptor draws, as the pointer and the marks read it. */
export type Role = ContainerKind | "shadow" | "boundary" | "element";

/** What a pointer target hits in block `block`. */
export interface Hit {
  readonly block: BlockId;
  /** A container's kind, or `"element"` for anything else drawn. */
  readonly kind: ContainerKind | "element";
  /**
   * Block-qualified: the block id for the block's own box, else
   * `<block>/<element address>`, a band's being `<block>/<timeline>/<kind>_1`.
   */
  readonly address: Address;
  /** The container hit: the block's box, a frame, a card or a band; `null` for an element. */
  readonly box: DrawnBox | null;
  /** Whether the target is a segment's boundary line. */
  readonly boundary: boolean;
  /**
   * The displayed frame or card on top at the point (`boxAt`); `null`
   * outside every one, or when no point was given.
   */
  readonly within: DrawnBox | null;
}

/** What the pointer highlights in a block, by element address. */
export interface Hover {
  /** A card or a frame. The block's own box is never marked: its node shows it. */
  readonly box: string | null;
  readonly boundary: string | null;
  /** A band of the edited timeline, `<timeline>/<kind>_1`. */
  readonly band: string | null;
}

export const NO_HOVER: Hover = { box: null, boundary: null, band: null };

/** The boxes holding part of a selection: the block's own box, and its frames and cards by address. */
export interface Holding {
  readonly block: boolean;
  readonly boxes: ReadonlySet<string>;
}

interface Index {
  /** The first record of every container with an address. */
  readonly byAddress: ReadonlyMap<string, DrawnBox>;
  /** The frames and cards by their key of `places`. */
  readonly byKey: ReadonlyMap<string, ItemBox | CardBox>;
  /** The first element drawn with each address. */
  readonly drawn: ReadonlyMap<string, DrawnElement>;
  /**
   * Every drawn address, with the displayed frames and cards it is drawn as
   * part of, by their addresses; a box is not part of itself.
   */
  readonly holders: ReadonlyMap<string, ReadonlySet<string>>;
}

const indices = new WeakMap<Drawing, Index>();

function indexOf(drawing: Drawing): Index {
  let found = indices.get(drawing);
  if (found === undefined) {
    const byAddress = new Map<string, DrawnBox>();
    const byKey = new Map<string, ItemBox | CardBox>();
    const drawn = new Map<string, DrawnElement>();
    const holders = new Map<string, Set<string>>();
    for (const element of drawing.elements) {
      if (element.address === null || drawn.has(element.address)) continue;
      drawn.set(element.address, element);
      holders.set(element.address, new Set());
    }
    for (const box of drawing.boxes) {
      if (box.address !== null && !byAddress.has(box.address)) byAddress.set(box.address, box);
      if (isItem(box) || isCard(box)) byKey.set(box.key, box);
      if (box.kind !== "frame" && box.kind !== "card") continue;
      if (box.address === null || !isDisplayed(box)) continue;
      for (const { address: part } of drawing.elements.slice(box.range.start, box.range.end)) {
        if (part !== null && part !== box.address) holders.get(part)?.add(box.address);
      }
    }
    found = { byAddress, byKey, drawn, holders };
    indices.set(drawing, found);
  }
  return found;
}

/**
 * Whether `box` is drawn: a frame or a card is when its own rectangle is
 * (`DrawnBox.displayed`; one that is not displayed keeps its record and the
 * range of what it still draws, section 2.4); the block's own box and a band,
 * which draws nothing, always count as drawn.
 */
export function isDisplayed(box: DrawnBox): boolean {
  return box.kind === "band" || box.displayed;
}

/**
 * The container of `drawing` at the element address `address`, its first
 * record (a timeline drawn at two lines has two records of each band); the
 * block's own box for `null`; `undefined` where no container has it.
 */
export function boxOf(drawing: Drawing, address: string | null): DrawnBox | undefined {
  return address === null ? drawing.boxes[0] : indexOf(drawing).byAddress.get(address);
}

/** The frame or card of `drawing` that the key `key` of `places` names: a group id, a timeline id. */
export function keyedBox(drawing: Drawing, key: string): ItemBox | CardBox | undefined {
  return indexOf(drawing).byKey.get(key);
}

/** The item `key` of `drawing`, a group's frame or an ungrouped root's card. */
export function itemOf(drawing: Drawing, key: string): ItemBox {
  const box = keyedBox(drawing, key);
  if (box === undefined || !isItem(box)) throw new RangeError(`${key} is no item of the drawing`);
  return box;
}

/** The item holding `box`: the box itself when it is an item, its frame when it is a held card. */
export function itemHolding(drawing: Drawing, box: DrawnBox): ItemBox {
  if (isItem(box)) return box;
  const holder = isHeld(box) ? boxOf(drawing, box.holder) : undefined;
  if (holder === undefined || !isItem(holder)) {
    throw new RangeError(`${box.address ?? "the box"} is no frame or card of the drawing`);
  }
  return holder;
}

function holds(box: DrawnBox, { x, y }: DrawingPoint): boolean {
  return box.x <= x && x <= box.x + box.width && box.y <= y && y <= box.y + box.height;
}

/**
 * The last displayed container of `kinds` (frames and cards unless named)
 * whose rectangle holds `point`, edges included: the one drawn on top, since
 * a frame is drawn before its cards and items that overlap are drawn in item
 * order; `null` where none does. A frame or card that is not displayed holds
 * no point.
 */
export function boxAt(
  drawing: Drawing,
  point: DrawingPoint,
  kinds: readonly ContainerKind[] = ["frame", "card"],
): DrawnBox | null {
  return (
    drawing.boxes.findLast(
      (box) => kinds.includes(box.kind) && holds(box, point) && isDisplayed(box),
    ) ?? null
  );
}

/**
 * What a descriptor draws, read from its source: the block's own box, a
 * frame, a card's own rectangle, a card's shadow, a segment's boundary line,
 * else an element.
 */
export function roleOf(descriptor: Descriptor): Role {
  const { type, role } = descriptor.source;
  switch (type) {
    case "block":
      return "box";
    case "group":
      return "frame";
    case "card":
      return role === "shadow" ? "shadow" : "card";
    case "boundary":
      return "boundary";
    default:
      return "element";
  }
}

const offered = new WeakMap<Drawing, Map<string, readonly BandBox[]>>();

/**
 * The bands the drawing records for `timeline`, in drawing order: the bands
 * its timeline editor offers. Every recorded band is present; whether an
 * editor offers them at all (the timeline editor of `timeline`, the
 * innermost open editor of its block) is the caller's test. Memoized by the
 * drawing.
 */
export function offeredBands(drawing: Drawing, timeline: string): readonly BandBox[] {
  let byTimeline = offered.get(drawing);
  if (byTimeline === undefined) {
    byTimeline = new Map();
    offered.set(drawing, byTimeline);
  }
  let found = byTimeline.get(timeline);
  if (found === undefined) {
    found = drawing.boxes.filter(
      (box): box is BandBox => isBand(box) && box.band.timeline === timeline,
    );
    byTimeline.set(timeline, found);
  }
  return found;
}

/**
 * The offered band of `timeline` whose rectangle, its edges included, holds
 * `point` (in the drawing's units), the first in drawing order, else `null`.
 * A band 0 high holds the points of its edge only. A drawn element is hit
 * before any band: the caller asks only where the press hit no element.
 */
export function bandAt(drawing: Drawing, timeline: string, point: DrawingPoint): BandBox | null {
  const { x, y } = point;
  return (
    offeredBands(drawing, timeline).find(
      (band) => band.x <= x && x <= band.x + band.width && band.y <= y && y <= band.y + band.height,
    ) ?? null
  );
}

/**
 * What the descriptor of source `source` hits in block `block`, drawn as
 * `drawing`: the frame or card it draws (its rectangle, or a card's shadow),
 * else the element it draws, classified by the drawing's containers; the
 * block's own box where nothing carrying an address is hit (`source` null,
 * or the block's background). With `point` (in the drawing's units), also
 * the displayed frame or card on top under it (`boxAt`).
 *
 * A band is hit only in the timeline editor of its timeline, when `editing`,
 * the innermost open editor, is that editor in this block
 * (`bandTimelineOf`): where the hit is a container (the block's own box, a
 * frame, a card), the band of the edited timeline whose rectangle holds
 * `point` (`bandAt`) is hit instead, so a drawn element is always hit before
 * a band.
 */
export function hitOf(
  block: BlockId,
  drawing: Drawing,
  source: DescriptorSource | null,
  point?: DrawingPoint,
  editing: Editing | null = null,
): Hit {
  const within = point === undefined ? null : boxAt(drawing, point);
  const element = source?.address ?? null;
  const box =
    element === null
      ? (boxOf(drawing, null) ?? null)
      : source?.type === "group" || source?.type === "card"
        ? (boxOf(drawing, element) ?? null)
        : null;
  const timeline = bandTimelineOf(block, editing);
  const band =
    box === null || point === undefined || timeline === null
      ? null
      : bandAt(drawing, timeline, point);
  if (band !== null) {
    return {
      block,
      kind: "band",
      address: qualify(block, band.address),
      box: band,
      boundary: false,
      within,
    };
  }
  if (element === null) return { block, kind: "box", address: block, box, boundary: false, within };
  return {
    block,
    kind: box?.kind ?? "element",
    address: qualify(block, element),
    box,
    // A wedge may carry a boundary's `S/start` form, but it is no boundary line.
    boundary: source?.type === "boundary",
    within,
  };
}

/**
 * The hit of the selected `address` of block `block` as Enter reads it,
 * from the drawing alone, with no point: the block's own box for the block,
 * a displayed frame or card for its address, else the first element drawn
 * with that address; `null` when nothing draws it (another block's address,
 * a band, a box that is not displayed, an element not drawn).
 */
export function hitForAddress(block: BlockId, drawing: Drawing, address: Address): Hit | null {
  const parts = addressParts(address);
  if (parts.block !== block) return null;
  const { element } = parts;
  if (element === null) {
    return {
      block,
      kind: "box",
      address,
      box: boxOf(drawing, null) ?? null,
      boundary: false,
      within: null,
    };
  }
  const box = boxOf(drawing, element);
  if (box !== undefined) {
    if (box.kind === "band" || !isDisplayed(box)) return null;
    return { block, kind: box.kind, address, box, boundary: false, within: null };
  }
  const drawn = indexOf(drawing).drawn.get(element);
  if (drawn === undefined) return null;
  return {
    block,
    kind: "element",
    address,
    box: null,
    boundary: drawn.type === "boundary",
    within: null,
  };
}

/**
 * What a press selects: what it hit, when it lies inside the edited element,
 * else nothing (`null`). A card selects the card (its shadow does the same),
 * a frame its group, any other element that element, each when `inside`
 * (the drawn addresses inside the edited element, `BlockNodeData.inside`)
 * holds its element address; the block's own box selects the block on the
 * arranger (`editing` null) and in the block's own bundle editor, never in
 * another editor. A band selects itself: only a band of the edited timeline
 * is hit.
 */
export function selectionOf(
  hit: Hit,
  editing: Editing | null,
  inside: ReadonlySet<string>,
): string | null {
  if (hit.kind === "band") return hit.address;
  if (hit.kind === "box") {
    return editing === null || editing.target === hit.block ? hit.address : null;
  }
  const { element } = addressParts(hit.address);
  return element !== null && inside.has(element) ? hit.address : null;
}

/**
 * What the pointer highlights: the box under it (a card or a frame), the
 * boundary it is on, and the band it is on.
 */
export function hoverOf(hit: Hit): Hover {
  const { element } = addressParts(hit.address);
  return {
    box: hit.within?.address ?? null,
    boundary: hit.boundary ? element : null,
    band: hit.kind === "band" ? element : null,
  };
}

/**
 * The boxes of `drawing` holding part of the selection `selected` (element
 * addresses, as the descriptors carry them): a displayed frame or card holds
 * the selection when an element of its range (`DrawnBox.range`) carries a
 * selected address, the box itself excepted. A card holds its member
 * drawing, its timeline and everything drawn with it; a frame its title, its
 * members' cards and what they hold; the block's own box every drawn
 * element. Where a box lies plays no part, so items that overlap change
 * nothing. So a selected card marks its frame and the block but not itself;
 * a line marks its card, that card's frame and the block; and an address
 * drawn in several cards, such as an ancestor line, marks each of them. An
 * address that is not drawn marks nothing. A band, which draws nothing,
 * counts as its timeline's line.
 */
export function holdingOf(drawing: Drawing, selected: ReadonlySet<string>): Holding {
  const held = new Set<string>();
  let block = false;
  if (selected.size === 0) return { block, boxes: held };
  const { holders } = indexOf(drawing);
  for (const address of selected) {
    const holding = holders.get(parseBand(address)?.timeline ?? address);
    if (holding === undefined) continue;
    block = true;
    for (const box of holding) held.add(box);
  }
  return { block, boxes: held };
}

/**
 * Whether a descriptor shows the selection: it carries a selected address
 * and is not a card's shadow, so a selected card glows on its own rectangle.
 */
export function showsSelection(
  role: Role,
  address: string | null,
  selected: ReadonlySet<string>,
): boolean {
  return address !== null && role !== "shadow" && selected.has(address);
}

/**
 * Whether a descriptor shows that its box holds part of the selection: a
 * card's or a frame's own rectangle whose address is among `holding`
 * (`holdingOf`), never a card's shadow.
 */
export function showsContainedSelection(
  role: Role,
  address: string | null,
  holding: ReadonlySet<string>,
): boolean {
  return (role === "card" || role === "frame") && address !== null && holding.has(address);
}
