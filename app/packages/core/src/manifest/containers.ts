/**
 * The containers of a manifest's drawing (`docs/drawing.md` in timeskeleton,
 * sections 2.1, 6.4 and 8): the box, which every manifest is drawn as; a
 * group's frame; the card of every timeline drawn as a root (a member, held
 * by its group's frame, or an ungrouped root, held by the box); and the five
 * bands of every timeline drawn in a card. One table (`CONTAINERS`) states
 * what each kind is styled as and which place members it may state; one
 * listing (`containersOf`) names every container of a manifest with its
 * holder, so a rule about containers reads the table and the listing and
 * never re-derives either.
 */

import type { ElementType } from "@timetoalign/timeskeleton";
import type { BandKind } from "./bands.ts";
import { BAND_KINDS, bandAddress } from "./bands.ts";
import { orderedChildren } from "./elements.ts";
import { cardAddress, memberDrawings } from "./files.ts";
import type { Manifest, TimelineManifest } from "./types.ts";

/** The kinds of container in a drawing, from the outer box to a feature band. */
export const CONTAINER_KINDS = ["box", "frame", "card", "band"] as const;

/** A kind of container in a drawing. */
export type ContainerKind = (typeof CONTAINER_KINDS)[number];

/** The semantic level a container kind stands for: the selectors' future words. */
export const CONTAINER_LEVELS = {
  box: "bundle",
  frame: "group",
  card: "timeline",
  band: "feature",
} as const satisfies Record<ContainerKind, string>;

/** The semantic level represented by a container kind. */
export type ContainerLevel = (typeof CONTAINER_LEVELS)[ContainerKind];

/** How a card is held: by the box (an ungrouped root) or by a frame (a group member). */
export type Holding = "box" | "frame";

/** The stated placement members of a freely placed frame or box-held card. */
export interface ItemPlace {
  readonly x?: number;
  readonly y?: number;
  readonly length?: number;
  readonly scale?: number;
  /** A frame's gap between its cards; a box-held card's between its rows and its bands. */
  readonly spacing?: number;
  readonly width?: number;
  readonly height?: number;
}

/** The stated size and spacing (the gap between its rows and its bands) of a frame-held card. */
export interface CardPlace {
  readonly width?: number;
  readonly height?: number;
  readonly spacing?: number;
}

/** The members of an item place, in the order a place is written. */
export const ITEM_PLACE_MEMBERS = [
  "x",
  "y",
  "length",
  "scale",
  "spacing",
  "width",
  "height",
] as const satisfies readonly (keyof ItemPlace)[];

/** The members of a frame-held card place, in the order a place is written. */
export const CARD_PLACE_MEMBERS = [
  "width",
  "height",
  "spacing",
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
    readonly box: readonly (keyof ItemPlace)[];
    readonly frame: readonly (keyof ItemPlace)[];
  } | null;
}

/** The registry of drawing container kinds and their semantic and placement properties. */
export const CONTAINERS: { readonly [kind in ContainerKind]: ContainerDescriptor } = {
  box: { kind: "box", level: CONTAINER_LEVELS.box, element: "block", place: null },
  frame: {
    kind: "frame",
    level: CONTAINER_LEVELS.frame,
    element: "group",
    place: { box: ITEM_PLACE_MEMBERS, frame: [] },
  },
  card: {
    kind: "card",
    level: CONTAINER_LEVELS.card,
    element: "card",
    place: { box: ITEM_PLACE_MEMBERS, frame: CARD_PLACE_MEMBERS },
  },
  band: { kind: "band", level: CONTAINER_LEVELS.band, element: "band", place: null },
};

/** One container of a manifest. */
export interface ContainerRef {
  readonly kind: ContainerKind;
  /** The `places` key: a group id, a timeline id; null for the box and for a band. */
  readonly key: string | null;
  /** The element address: `G`, `T/card`, `T/<kind>_1`; null for the box. */
  readonly address: string | null;
  /** The container directly holding this one, or null for the box. */
  readonly holder: ContainerRef | null;
  /** The timeline of a card or band, or null for another kind. */
  readonly timeline: string | null;
  /** The feature kind of a band, or null for another kind. */
  readonly band: BandKind | null;
}

/** Every container of a manifest, indexed by its element address and place key. */
export interface Containers {
  readonly box: ContainerRef;
  readonly byAddress: ReadonlyMap<string, ContainerRef>;
  readonly byKey: ReadonlyMap<string, ContainerRef>;
}

const listed = new WeakMap<Manifest, Containers>();

/** The box of every manifest: it has no key, no address and no holder. */
const BOX: ContainerRef = {
  kind: "box",
  key: null,
  address: null,
  holder: null,
  timeline: null,
  band: null,
};

/**
 * List every container of `manifest`, memoised by manifest identity, in
 * drawing order: per group in canonical order its frame, then per member in
 * display order the member's card followed by the bands of the timelines the
 * card holds; then the same for every ungrouped root's card. A card holds
 * the bands of its timeline and of every descendant down to, not into, a
 * descendant drawn in a card of its own (a member of another group); each
 * timeline's five bands follow in `BAND_KINDS` order, the timelines in
 * pre-order, children by offset then id. A timeline drawn in no card (a root that holds
 * a member, and the descendants of such a root that hold none) has no
 * bands here: nothing draws them.
 */
export function containersOf(manifest: Manifest): Containers {
  const known = listed.get(manifest);
  if (known !== undefined) return known;
  const byAddress = new Map<string, ContainerRef>();
  const byKey = new Map<string, ContainerRef>();
  const { frames, ungrouped } = memberDrawings(manifest);
  const carded = new Set([
    ...frames.flatMap((frame) => frame.members.map((member) => member.timeline.id)),
    ...ungrouped.map((member) => member.timeline.id),
  ]);
  const add = (ref: ContainerRef, address: string) => {
    byAddress.set(address, ref);
    if (ref.key !== null) byKey.set(ref.key, ref);
  };
  const bands = (card: ContainerRef, timeline: TimelineManifest) => {
    for (const band of BAND_KINDS) {
      const address = bandAddress(timeline.id, band);
      add({ kind: "band", key: null, address, holder: card, timeline: timeline.id, band }, address);
    }
    for (const child of orderedChildren(timeline)) if (!carded.has(child.id)) bands(card, child);
  };
  const card = (timeline: TimelineManifest, holder: ContainerRef) => {
    const address = cardAddress(timeline.id);
    const ref: ContainerRef = {
      kind: "card",
      key: timeline.id,
      address,
      holder,
      timeline: timeline.id,
      band: null,
    };
    add(ref, address);
    bands(ref, timeline);
  };
  for (const { group, members } of frames) {
    const frame: ContainerRef = {
      kind: "frame",
      key: group.id,
      address: group.id,
      holder: BOX,
      timeline: null,
      band: null,
    };
    add(frame, group.id);
    for (const member of members) card(member.timeline, frame);
  }
  for (const member of ungrouped) card(member.timeline, BOX);
  const containers: Containers = { box: BOX, byAddress, byKey };
  listed.set(manifest, containers);
  return containers;
}

/**
 * How `ref` is held when it is a frame or a card: by a frame (a member's
 * card) or by the box (a frame, or an ungrouped root's card); `null` for the
 * box and a band, which have no place.
 */
export function holdingOf(ref: ContainerRef): Holding | null {
  if (ref.kind !== "frame" && ref.kind !== "card") return null;
  return ref.holder?.kind === "frame" ? "frame" : "box";
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
 * A timeline that becomes a group member so keeps its card's requested size
 * and spacing, and loses its position, length and scale.
 */
export function keptPlace(ref: ContainerRef, place: ItemPlace): ItemPlace | CardPlace | undefined {
  const members: readonly string[] = placeMembersOf(ref);
  const kept = Object.entries(place).filter(([member]) => members.includes(member));
  if (kept.length === 0) return undefined;
  return kept.length === Object.keys(place).length ? place : Object.fromEntries(kept);
}

/** Whether the timeline `id` is a group member: its card is held by a frame. */
export function isMember(manifest: Manifest, id: string): boolean {
  const ref = containersOf(manifest).byKey.get(id);
  return ref?.kind === "card" && holdingOf(ref) === "frame";
}
