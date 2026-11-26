/**
 * The address of an element of a manifest's drawing (`docs/drawing.md` in
 * TimeToShare, section 2.2): an object `{id?, facet?, part?}`, compared as a
 * whole object and never a string composed from IDs. `addressKey` is the one
 * way an address becomes a string: a map key, a Svelte key, an attribute
 * TiLiE draws for itself.
 */

import type { Facet, Id, Part } from "@timetoalign/timetoshare";
import { compareCodePoints } from "../json.ts";
import { DEFAULT_BAND_ORDER, LINE } from "./order.ts";

export type { Facet, Part };

/** Whether a value is one of the five facets. */
export function isFacet(value: unknown): value is Facet {
  return value !== LINE && DEFAULT_BAND_ORDER.some((entry) => entry === value);
}

/**
 * The five facets of every timeline, in the order its bands are listed:
 * the default band order without `line` (children, conversion maps,
 * markers, regions, flow control).
 */
export const FACETS: readonly Facet[] = DEFAULT_BAND_ORDER.filter(isFacet);

/** The part words, in the schema's order. */
export const PART_WORDS = [
  "start",
  "end",
  "name",
  "label",
  "card",
  "line",
  "id",
  "coordinate",
  "elision",
  "ellipsis",
  "symbol",
  "fork",
  "leader",
] as const satisfies readonly Part[];

/** Whether a value is one of the part words. */
export function isPart(value: unknown): value is Part {
  return PART_WORDS.some((word) => word === value);
}

/**
 * A chunk index: an integer from 0 at the head of an address's `part`,
 * naming the chunk at that index of the FlowMap drawn on a line, in that
 * line's regions band (`docs/drawing.md`, sections 2.2 and 8.10).
 */
export type ChunkIndex = number;

/** A member of an address's `part`: a part word, or, at its head, a chunk index. */
export type PartItem = Part | ChunkIndex;

/**
 * The address of an element of one manifest's drawing, the read-only view of
 * the schema's `Address`: `{}` the bundle (the block draws it), `{part:
 * ["name"]}` the manifest's title, `{id}` an element, `{id, facet}` a band,
 * `{id, part}` a part of an element, `{id, facet: "regions", part: [k,
 * …]}` a chunk drawn in a regions band and its parts; a `facet` stands only
 * with an `id`, and with a `part` only where the part begins with a chunk
 * index.
 */
export interface ElementAddress {
  readonly id?: Id;
  readonly facet?: Facet;
  readonly part?: readonly PartItem[];
}

/** The address of anything but a band, which alone has parts: a band's address states no `facet`. */
export type OwnerAddress = ElementAddress & { readonly facet?: never };

/** The address of the bundle, which the block draws. */
export const BUNDLE_ADDRESS: OwnerAddress = {};

/** The address of the manifest's title. */
export const TITLE_ADDRESS: OwnerAddress = { part: ["name"] };

/** The address of the element with ID `id`: a timeline, group, map, region or flow-control element. */
export function idAddress(id: string): OwnerAddress {
  return { id };
}

/** The address of the band drawing the facet `facet` of the timeline `timeline`. */
export function bandAddress(timeline: string, facet: Facet): ElementAddress {
  return { id: timeline, facet };
}

/** The address of every card of the timeline `timeline`. */
export function cardAddress(timeline: string): OwnerAddress {
  return { id: timeline, part: ["card"] };
}

/**
 * `owner`'s address with `word` appended to its `part`: a name, a label, a
 * mark, a mark's label. A band has no part, so a band's address is no owner.
 */
export function partAddress<A extends OwnerAddress>(owner: A, word: Part): A {
  return { ...owner, part: [...(owner.part ?? []), word] };
}

/** The members of any address, an element's or a workspace's, which `addressKey` writes. */
interface AddressMembers {
  readonly block?: string;
  readonly id?: string;
  readonly facet?: Facet;
  readonly part?: readonly PartItem[];
}

/**
 * The one string form of an address: its JSON with the members it states in
 * code-point order of their names (`block`, `facet`, `id`, `part`), so equal
 * addresses give equal keys and different addresses different keys.
 */
export function addressKey(address: AddressMembers): string {
  const members = Object.entries(address)
    .filter(([, value]) => value !== undefined)
    .sort(([left], [right]) => compareCodePoints(left, right));
  return JSON.stringify(Object.fromEntries(members));
}

/** Whether two addresses are equal as whole objects. */
export function sameAddress(left: AddressMembers, right: AddressMembers): boolean {
  return addressKey(left) === addressKey(right);
}
