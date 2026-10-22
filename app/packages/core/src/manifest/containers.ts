/**
 * The containers of a manifest's drawing (`docs/drawing.md` in TimeToShare,
 * sections 2.1, 6.4 and 8), the four boxes: the block, which draws the
 * bundle; a group's frame; the cards of every timeline drawn as a root (a
 * member, one in the frame of each group that has it as a member, or an
 * ungrouped root, one held by the block); and the five bands of every
 * timeline drawn in a card, once in each card that draws it. One table
 * (`CONTAINERS`) states what each kind is styled as and which place members
 * it may state; one listing (`containersOf`) names every container of a
 * manifest with its holder, so a rule about containers reads the table and
 * the listing and never re-derives either.
 */

import type { ElementType } from "@timetoalign/timetoshare";
import type { ElementAddress, Facet } from "./address.ts";
import { BUNDLE_ADDRESS, bandAddress, cardAddress, FACETS, idAddress } from "./address.ts";
import { orderedChildren } from "./elements.ts";
import { memberDrawings } from "./files.ts";
import type { Manifest, TimelineManifest } from "./types.ts";

/** The kinds of container in a drawing, the boxes, from the block to a band. */
export const CONTAINER_KINDS = ["block", "frame", "card", "band"] as const;

/** A kind of container in a drawing. */
export type ContainerKind = (typeof CONTAINER_KINDS)[number];

/** The semantic level each container kind draws: bundle, group, timeline, facet. */
export const CONTAINER_LEVELS = {
  block: "bundle",
  frame: "group",
  card: "timeline",
  band: "facet",
} as const satisfies Record<ContainerKind, string>;

/** The semantic level represented by a container kind. */
export type ContainerLevel = (typeof CONTAINER_LEVELS)[ContainerKind];

/** How a card is held: by the block (an ungrouped root) or by a frame (a group member). */
export type Holding = "block" | "frame";

/** The stated placement members of a freely placed frame or block-held card. */
export interface ItemPlace {
  readonly x?: number;
  readonly y?: number;
  readonly length?: number;
  readonly scale?: number;
  /** A frame's gap between its cards; a block-held card's between its rows and its bands. */
  readonly spacing?: number;
  /** Empty space drawn above a frame's first card and below its last, or a block-held card's first and last row or band. */
  readonly margin?: number;
  readonly width?: number;
  readonly height?: number;
}

/**
 * The stated size, spacing (the gap between its rows and its bands) and
 * margin (the empty space above its first and below its last) of a
 * frame-held card.
 */
export interface CardPlace {
  readonly width?: number;
  readonly height?: number;
  readonly spacing?: number;
  readonly margin?: number;
}

/**
 * The entry of `places` under an item's ID: the item's place and, for a
 * group's frame, the places of its members' cards by member ID
 * (`places[G].cards[T]`, drawing.md section 8.6).
 */
export interface Place extends ItemPlace {
  readonly cards?: { readonly [member: string]: CardPlace };
}

/** A block's places: by the ID of a group (its frame) or of an ungrouped root (its card). */
export type Places = { readonly [item: string]: Place };

/**
 * Where the place of a frame or a card lies in `places`: under the ID of
 * the item (a group's frame, or an ungrouped root's card), and for a
 * member's card under the member's ID in that frame's `cards`.
 */
export interface PlaceKey {
  readonly item: string;
  readonly member?: string;
}

/** The one string form of a place key, a map key: its item and member as a JSON array. */
export function placeKeyText(key: PlaceKey): string {
  return JSON.stringify(key.member === undefined ? [key.item] : [key.item, key.member]);
}

/** Whether two place keys name the same place. */
export function samePlaceKey(left: PlaceKey, right: PlaceKey): boolean {
  return left.item === right.item && left.member === right.member;
}

/** The place stated under `key` in `places`: an item's without its `cards`, or a member's card's. */
export function placeAt(places: Places, key: PlaceKey): ItemPlace | CardPlace | undefined {
  const entry = Object.hasOwn(places, key.item) ? places[key.item] : undefined;
  if (key.member === undefined) {
    if (entry === undefined || entry.cards === undefined) return entry;
    const { cards: _, ...own } = entry;
    return Object.keys(own).length > 0 ? own : undefined;
  }
  const cards = entry?.cards;
  return cards !== undefined && Object.hasOwn(cards, key.member) ? cards[key.member] : undefined;
}

/**
 * `places` with the place under `key` replaced by `place`, or removed when
 * `place` is `undefined`; an item's `cards` are kept after its own members,
 * and an entry left with neither is removed.
 */
export function withPlaceAt(
  places: Places,
  key: PlaceKey,
  place: ItemPlace | CardPlace | undefined,
): Places {
  const entry = Object.hasOwn(places, key.item) ? places[key.item] : undefined;
  let cards = entry?.cards;
  let own: ItemPlace | undefined = placeAt(places, { item: key.item });
  if (key.member === undefined) own = place;
  else {
    const { [key.member]: _, ...others } = cards ?? {};
    cards = place === undefined ? others : { ...others, [key.member]: place };
  }
  const next: { -readonly [M in keyof Place]: Place[M] } = { ...own };
  if (cards !== undefined && Object.keys(cards).length > 0) next.cards = cards;
  const { [key.item]: _, ...rest } = places;
  return Object.keys(next).length === 0 ? rest : { ...rest, [key.item]: next };
}

/** Every place `places` states, with its key: each item's own, then its members' cards. */
export function placeEntries(
  places: Places,
): readonly (readonly [PlaceKey, ItemPlace | CardPlace])[] {
  return Object.keys(places).flatMap((item) => {
    const own = placeAt(places, { item });
    const cards = places[item]?.cards ?? {};
    return [
      ...(own === undefined ? [] : [[{ item }, own] as const]),
      ...Object.entries(cards).map(([member, card]) => [{ item, member }, card] as const),
    ];
  });
}

/** The members of an item place, in the order a place is written. */
export const ITEM_PLACE_MEMBERS = [
  "x",
  "y",
  "length",
  "scale",
  "spacing",
  "margin",
  "width",
  "height",
] as const satisfies readonly (keyof ItemPlace)[];

/** The members of a frame-held card place, in the order a place is written. */
export const CARD_PLACE_MEMBERS = [
  "width",
  "height",
  "spacing",
  "margin",
] as const satisfies readonly (keyof CardPlace)[];

/** The fixed properties of one kind of drawing container. */
export interface ContainerDescriptor {
  readonly kind: ContainerKind;
  readonly level: ContainerLevel;
  /** The schema element type the container is styled as. */
  readonly element: ElementType;
  /**
   * The place members a container of the kind may state, by how it is held
   * (a frame-held card's are a subset of an item's); null for none.
   */
  readonly place: {
    readonly block: readonly (keyof ItemPlace)[];
    readonly frame: readonly (keyof ItemPlace)[];
  } | null;
}

/** The registry of drawing container kinds and their semantic and placement properties. */
export const CONTAINERS: { readonly [kind in ContainerKind]: ContainerDescriptor } = {
  block: { kind: "block", level: CONTAINER_LEVELS.block, element: "block", place: null },
  frame: {
    kind: "frame",
    level: CONTAINER_LEVELS.frame,
    element: "frame",
    place: { block: ITEM_PLACE_MEMBERS, frame: [] },
  },
  card: {
    kind: "card",
    level: CONTAINER_LEVELS.card,
    element: "card",
    place: { block: ITEM_PLACE_MEMBERS, frame: CARD_PLACE_MEMBERS },
  },
  band: { kind: "band", level: CONTAINER_LEVELS.band, element: "band", place: null },
};

/**
 * One drawing of a container of a manifest. A frame is drawn once; a card
 * once per frame holding it, or once on the block; a band once in each card
 * that draws its timeline. Every drawing of a container carries its
 * container's address, so the cards of one timeline share theirs: the place
 * key tells them apart.
 */
export interface ContainerRef {
  readonly kind: ContainerKind;
  /** Where its place lies in `places`: a frame's and a card's; null for the block and a band. */
  readonly key: PlaceKey | null;
  /**
   * The element address: `{}` for the block, `{id: G}` for a frame,
   * `{id: T, part: ["card"]}` for every card of `T`, `{id: T, facet}` for a band.
   */
  readonly address: ElementAddress;
  /** The container directly holding this one, or null for the block. */
  readonly holder: ContainerRef | null;
  /** The timeline of a card or band, or null for another kind. */
  readonly timeline: string | null;
  /** The facet a band draws, or null for another kind. */
  readonly facet: Facet | null;
}

/** Every container of a manifest, indexed by its place key and its timeline. */
export interface Containers {
  readonly block: ContainerRef;
  /** Every frame and card, and every drawing of a band, in drawing order. */
  readonly all: readonly ContainerRef[];
  /** Every frame and card by its place key (`placeKeyText`). */
  readonly byKey: ReadonlyMap<string, ContainerRef>;
  /** Every frame by its group's ID. */
  readonly frames: ReadonlyMap<string, ContainerRef>;
  /** The cards of every timeline drawn in one, by timeline ID, in drawing order. */
  readonly cards: ReadonlyMap<string, readonly ContainerRef[]>;
  /** Every drawing of every band, by timeline ID and then facet, in drawing order. */
  readonly bands: ReadonlyMap<string, ReadonlyMap<Facet, readonly ContainerRef[]>>;
}

const listed = new WeakMap<Manifest, Containers>();

/** The block of every manifest: it has no key and no holder, and its address is the bundle's. */
const BLOCK: ContainerRef = {
  kind: "block",
  key: null,
  address: BUNDLE_ADDRESS,
  holder: null,
  timeline: null,
  facet: null,
};

/**
 * List every container of `manifest`, memoised by manifest identity, in
 * drawing order: per group in canonical order its frame, then per member in
 * display order the member's card followed by the bands of the timelines the
 * card holds; then the same for every ungrouped root's card. A timeline that
 * several groups have as a member has a card in each of their frames, each
 * followed by its own drawing of the same bands. A card holds
 * the bands of its timeline and of every descendant down to, not into, a
 * descendant drawn in a card of its own (a member of another group); each
 * timeline's five bands follow in `FACETS` order, the timelines in
 * pre-order, children by offset then ID. A timeline drawn in no card (a root that holds
 * a member, and the descendants of such a root that hold none) has no
 * bands here: nothing draws them.
 */
export function containersOf(manifest: Manifest): Containers {
  const known = listed.get(manifest);
  if (known !== undefined) return known;
  const all: ContainerRef[] = [];
  const byKey = new Map<string, ContainerRef>();
  const frames = new Map<string, ContainerRef>();
  const cards = new Map<string, ContainerRef[]>();
  const bands = new Map<string, Map<Facet, ContainerRef[]>>();
  const drawn = memberDrawings(manifest);
  const carded = new Set([
    ...drawn.frames.flatMap((frame) => frame.members.map((member) => member.timeline.id)),
    ...drawn.ungrouped.map((member) => member.timeline.id),
  ]);
  const listIn = <K, V>(map: Map<K, V[]>, key: K, value: V) => {
    const list = map.get(key);
    if (list === undefined) map.set(key, [value]);
    else list.push(value);
  };
  const add = (ref: ContainerRef) => {
    all.push(ref);
    if (ref.key !== null) byKey.set(placeKeyText(ref.key), ref);
  };
  const bandsOf = (card: ContainerRef, timeline: TimelineManifest) => {
    let own = bands.get(timeline.id);
    if (own === undefined) {
      own = new Map();
      bands.set(timeline.id, own);
    }
    for (const facet of FACETS) {
      const address = bandAddress(timeline.id, facet);
      const ref: ContainerRef = {
        kind: "band",
        key: null,
        address,
        holder: card,
        timeline: timeline.id,
        facet,
      };
      add(ref);
      listIn(own, facet, ref);
    }
    for (const child of orderedChildren(timeline)) if (!carded.has(child.id)) bandsOf(card, child);
  };
  const card = (timeline: TimelineManifest, holder: ContainerRef, key: PlaceKey) => {
    const ref: ContainerRef = {
      kind: "card",
      key,
      address: cardAddress(timeline.id),
      holder,
      timeline: timeline.id,
      facet: null,
    };
    add(ref);
    listIn(cards, timeline.id, ref);
    bandsOf(ref, timeline);
  };
  for (const { group, members } of drawn.frames) {
    const frame: ContainerRef = {
      kind: "frame",
      key: { item: group.id },
      address: idAddress(group.id),
      holder: BLOCK,
      timeline: null,
      facet: null,
    };
    add(frame);
    frames.set(group.id, frame);
    for (const member of members) {
      card(member.timeline, frame, { item: group.id, member: member.timeline.id });
    }
  }
  for (const member of drawn.ungrouped) {
    card(member.timeline, BLOCK, { item: member.timeline.id });
  }
  const containers: Containers = { block: BLOCK, all, byKey, frames, cards, bands };
  listed.set(manifest, containers);
  return containers;
}

/** The frame or card whose place lies under `key` in the drawing of `manifest`, if any. */
export function placedContainer(manifest: Manifest, key: PlaceKey): ContainerRef | undefined {
  return containersOf(manifest).byKey.get(placeKeyText(key));
}

/**
 * How `ref` is held when it is a frame or a card: by a frame (a member's
 * card) or by the block (a frame, or an ungrouped root's card); `null` for
 * the block and a band, which have no place.
 */
export function holdingOf(ref: ContainerRef): Holding | null {
  if (ref.kind !== "frame" && ref.kind !== "card") return null;
  return ref.holder?.kind === "frame" ? "frame" : "block";
}

/** The place members `ref` may state, as selected by its kind and holder. */
export function placeMembersOf(ref: ContainerRef): readonly (keyof ItemPlace)[] {
  const holding = holdingOf(ref);
  const place = CONTAINERS[ref.kind].place;
  return holding === null || place === null ? [] : place[holding];
}

/**
 * `place` with only the members `ref` may state (`placeMembersOf`): `place`
 * itself when it states no other, `undefined` when it states none of them.
 * A timeline that becomes a group member so keeps its card's requested size,
 * spacing and margin, and loses its position, length and scale.
 */
export function keptPlace(
  ref: ContainerRef,
  place: ItemPlace | CardPlace,
): ItemPlace | CardPlace | undefined {
  const members: readonly string[] = placeMembersOf(ref);
  const kept = Object.entries(place).filter(([member]) => members.includes(member));
  if (kept.length === 0) return undefined;
  return kept.length === Object.keys(place).length ? place : Object.fromEntries(kept);
}

/**
 * The element a `set` of `place` aims at to state the place under `key` in
 * the drawing of `manifest`: a frame's group, a card's timeline; `undefined`
 * for a key naming no frame and no card.
 */
export function placedElement(manifest: Manifest, key: PlaceKey): string | undefined {
  const ref = placedContainer(manifest, key);
  if (ref === undefined) return undefined;
  return ref.kind === "card" ? (ref.timeline ?? undefined) : key.item;
}

/** Whether the timeline `id` is a group member: a frame holds a card of it. */
export function isMember(manifest: Manifest, id: string): boolean {
  const cards = containersOf(manifest).cards.get(id) ?? [];
  return cards.some((ref) => holdingOf(ref) === "frame");
}
