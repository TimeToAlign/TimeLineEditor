/**
 * Addresses (`docs/drawing.md` in TimeToShare, section 2.2): their syntax,
 * their three builders, and the one resolver that decides what an address
 * names. Every reader of an address reads `resolveAddress` (or, within one
 * manifest, `resolveElement`); nothing else splits an address.
 *
 * A workspace address is `workspace`, a block id, or `<block id>/<element
 * address>`. An element address is a group's, a timeline's or a measure
 * map's bare id (`G`, `T`, `M`), a card (`G/T/card` for a member's in the
 * frame of `G`, `T/card` for an ungrouped root's), a timeline's band
 * (`T/regions_1`), an entry of a root's tree (`r/R`), the manifest's title
 * (`name`), or any of these but a measure map and a card followed by part
 * words (`T/end/label`).
 */

import type { CommandError, Problem } from "../errors.ts";
import { ErrorCode, problem } from "../errors.ts";
import type { BandKind } from "../manifest/bands.ts";
import { BAND_KINDS, bandAddress, bandId } from "../manifest/bands.ts";
import type { ContainerRef, Containers } from "../manifest/containers.ts";
import { containersOf } from "../manifest/containers.ts";
import type { ElementKey } from "../manifest/elements.ts";
import { manifestElements, timelineAncestry } from "../manifest/elements.ts";
import type { EntryKind, ListedElement } from "../manifest/files.ts";
import {
  CARD_WORD,
  cardAddress,
  cardKey,
  ENTRY_KINDS,
  elementAddress,
  entriesOf,
  isNamed,
  isReservedId,
  PART_WORDS,
  partAddress,
  TITLE_ADDRESS,
} from "../manifest/files.ts";
import type { Located } from "../manifest/tree.ts";
import type { Group, Manifest, MeasureMap, TimelineManifest } from "../manifest/types.ts";
import type { Block, BlockId } from "./blocks.ts";
import { BLOCK_ID } from "./blocks.ts";
import type { View } from "./view.ts";

/** The workspace-wide name of a workspace, block, element or element part. */
export type Address = string;

/** The address of the workspace itself. */
export const WORKSPACE = "workspace";

/** A word that addresses a named part of an element. */
export type PartWord = (typeof PART_WORDS)[number];

/** The syntactic split of an address into its optional block and following segments. */
export interface AddressSyntax {
  readonly block: BlockId | null;
  readonly segments: readonly string[];
}

/**
 * Split an address at its slashes: `workspace` has no block and no
 * segments, a block id no segments, `<block id>/<element address>` the
 * element address's segments. A first segment that is no block id, and a
 * block id followed by an empty element address, are `invalid_address`.
 */
export function parseAddressSyntax(text: string): AddressSyntax | Problem {
  if (text === WORKSPACE) return { block: null, segments: [] };
  const [block = "", ...segments] = text.split("/");
  if (!BLOCK_ID.test(block)) {
    return problem(ErrorCode.invalidAddress, "an address is workspace or starts with a block id", [
      text,
    ]);
  }
  if (segments.length === 1 && segments[0] === "") {
    return problem(ErrorCode.invalidAddress, "an address element cannot be empty", [text]);
  }
  return { block, segments };
}

/** The element address an address holds after its block; `null` for the workspace or a block. */
export function elementIn(syntax: AddressSyntax): string | null {
  return syntax.segments.length === 0 ? null : syntax.segments.join("/");
}

/** Qualify a manifest element address with the block that holds its manifest. */
export function qualify(block: BlockId, element: string): Address {
  return `${block}/${element}`;
}

/**
 * The address builders of a manifest's elements, `<root>/<id>`,
 * `[<group>/]<timeline>/card` and `<owner>/<part word>`, and the `places`
 * key of a card, `[<group>/]<timeline>`.
 */
export { cardAddress, cardKey, elementAddress, partAddress };

/** What a valid workspace address resolves to in a view. */
export type ResolvedAddress =
  | { readonly kind: "workspace" }
  | { readonly kind: "block"; readonly block: Block }
  | { readonly kind: "title"; readonly block: Block }
  | {
      readonly kind: "frame";
      readonly block: Block;
      readonly group: Group;
      readonly container: ContainerRef;
    }
  | {
      readonly kind: "timeline";
      readonly block: Block;
      readonly at: Located;
      /**
       * The timeline's cards in drawing order: one per group that has it as a
       * member, or its one card as an ungrouped root; none for a timeline
       * drawn in no card.
       */
      readonly cards: readonly ContainerRef[];
    }
  | {
      readonly kind: "card";
      readonly block: Block;
      readonly at: Located;
      readonly container: ContainerRef;
    }
  | {
      readonly kind: "band";
      readonly block: Block;
      readonly at: Located;
      readonly band: BandKind;
      /** Every drawing of the band, one per card drawing its timeline, in drawing order. */
      readonly containers: readonly ContainerRef[];
    }
  | {
      readonly kind: "entry";
      readonly block: Block;
      /** The timeline holding the entry. */
      readonly at: Located;
      readonly entry: EntryKind;
      /** Its index in its timeline's list of entries of its kind. */
      readonly index: number;
      readonly element: ListedElement;
    }
  | {
      readonly kind: "measure_map";
      readonly block: Block;
      readonly map: MeasureMap;
      /** Its index in the manifest's `measure_maps`. */
      readonly index: number;
    }
  | {
      readonly kind: "part";
      readonly block: Block;
      readonly owner: ResolvedAddress;
      readonly word: PartWord;
    };

/** A resolved element address without the block that holds its manifest. */
export type ResolvedElement =
  | { readonly kind: "title" }
  | { readonly kind: "frame"; readonly group: Group; readonly container: ContainerRef }
  | { readonly kind: "timeline"; readonly at: Located; readonly cards: readonly ContainerRef[] }
  | { readonly kind: "card"; readonly at: Located; readonly container: ContainerRef }
  | {
      readonly kind: "band";
      readonly at: Located;
      readonly band: BandKind;
      readonly containers: readonly ContainerRef[];
    }
  | {
      readonly kind: "entry";
      readonly at: Located;
      readonly entry: EntryKind;
      readonly index: number;
      readonly element: ListedElement;
    }
  | { readonly kind: "measure_map"; readonly map: MeasureMap; readonly index: number }
  | { readonly kind: "part"; readonly owner: ResolvedElement; readonly word: PartWord };

/** An entry located in its manifest: the timeline holding it, its kind, its index. */
interface LocatedEntry {
  readonly at: Located;
  readonly kind: EntryKind;
  readonly index: number;
}

/** Every timeline of a manifest by id, and every entry by its element address. */
interface Catalogue {
  readonly timelines: ReadonlyMap<string, Located>;
  readonly entries: ReadonlyMap<string, LocatedEntry>;
}

const catalogues = new WeakMap<Manifest, Catalogue>();

/** The catalogue of a manifest, built in one walk of its trees and memoised by identity. */
function catalogueOf(manifest: Manifest): Catalogue {
  const known = catalogues.get(manifest);
  if (known !== undefined) return known;
  const timelines = new Map<string, Located>();
  const entries = new Map<string, LocatedEntry>();
  const visit = (at: Located, root: string) => {
    if (!timelines.has(at.timeline.id)) timelines.set(at.timeline.id, at);
    for (const kind of ENTRY_KINDS) {
      entriesOf(at.timeline, kind).forEach((entry, index) => {
        const address = elementAddress(root, entry.id);
        if (!entries.has(address)) entries.set(address, { at, kind, index });
      });
    }
    at.timeline.children.forEach((timeline: TimelineManifest, index) => {
      visit({ timeline, path: [...at.path, "children", index], parent: at }, root);
    });
  };
  manifest.timelines.forEach((timeline, index) => {
    visit({ timeline, path: ["timelines", index], parent: undefined }, timeline.id);
  });
  const catalogue = { timelines, entries };
  catalogues.set(manifest, catalogue);
  return catalogue;
}

/** The band a segment names when it is a band's id (`<kind>_1`). */
function bandNamed(segment: string): BandKind | undefined {
  return BAND_KINDS.find((kind) => bandId(kind) === segment);
}

/** The part word a segment is, if it is one. */
function partWord(segment: string): PartWord | undefined {
  return PART_WORDS.find((word) => word === segment);
}

/** The part words each resolved element has. */
function partsOf(owner: ResolvedElement): readonly PartWord[] {
  switch (owner.kind) {
    case "timeline":
      return PART_WORDS;
    case "entry":
      return ["name", "label"];
    case "frame":
      return ["name"];
    case "part":
      return owner.word === "start" || owner.word === "end" ? ["label"] : [];
    default:
      return [];
  }
}

/**
 * The card under the `places` key of `timeline`'s card in the frame of
 * `group` (null: on the box), with the timeline; `undefined` when the
 * drawing has no such card.
 */
function cardOf(
  manifest: Manifest,
  timeline: string,
  group: string | null,
): ResolvedElement | undefined {
  const container = containersOf(manifest).byKey.get(cardKey(timeline, group));
  const at = catalogueOf(manifest).timelines.get(timeline);
  return container?.kind !== "card" || at === undefined
    ? undefined
    : { kind: "card", at, container };
}

/**
 * The element the first one to three segments name, and how many they are:
 * a group's frame, a member's card in it (`G/T/card`), a measure map, a
 * timeline, an ungrouped root's card (`T/card`) or one of a timeline's
 * bands, or an entry of a root's tree; `undefined` when they name nothing.
 * A member's card is named by its group only: `T/card` names nothing for a
 * timeline that no box-held card draws.
 */
function baseOf(
  manifest: Manifest,
  segments: readonly string[],
): readonly [ResolvedElement, number] | undefined {
  const [first = "", second, third] = segments;
  const containers = containersOf(manifest);
  const group = manifest.groups.find((item) => item.id === first);
  if (group !== undefined) {
    if (second !== undefined && third === CARD_WORD) {
      const card = cardOf(manifest, second, first);
      return card === undefined ? undefined : [card, 3];
    }
    const [container] = containers.byAddress.get(first) ?? [];
    return container === undefined ? undefined : [{ kind: "frame", group, container }, 1];
  }
  const index = manifest.measure_maps.findIndex((item) => item.id === first);
  const map = manifest.measure_maps[index];
  if (map !== undefined) return [{ kind: "measure_map", map, index }, 1];
  const { timelines, entries } = catalogueOf(manifest);
  const at = timelines.get(first);
  if (at === undefined) return undefined;
  const timeline: ResolvedElement = {
    kind: "timeline",
    at,
    cards: containers.cards.get(first) ?? [],
  };
  if (second === undefined || partWord(second) !== undefined) return [timeline, 1];
  if (second === CARD_WORD) {
    const card = cardOf(manifest, first, null);
    return card === undefined ? undefined : [card, 2];
  }
  const band = bandNamed(second);
  if (band !== undefined) {
    const drawn = containers.byAddress.get(bandAddress(first, band));
    return drawn === undefined ? undefined : [{ kind: "band", at, band, containers: drawn }, 2];
  }
  if (at.parent !== undefined || isReservedId(second)) return undefined;
  const found = entries.get(elementAddress(first, second));
  if (found === undefined) return undefined;
  const element = entriesOf(found.at.timeline, found.kind)[found.index];
  if (element === undefined) return undefined;
  return [{ kind: "entry", at: found.at, entry: found.kind, index: found.index, element }, 2];
}

/**
 * Resolve an element address against a manifest: the title (of a named
 * manifest), a frame, a measure map, a timeline, a card, a band (of a
 * timeline drawn in a card), an entry, or a part of one of them; `undefined`
 * for anything else. A measure map is not drawn and a card has no part; any
 * other part is one of the part words its owner has: a timeline's `start`,
 * `end`, `name` and `label`, an entry's `name` and `label`, a frame's
 * `name`, the `label` of a `start` or an `end`.
 */
export function resolveElement(manifest: Manifest, element: string): ResolvedElement | undefined {
  const segments = element.split("/");
  if (segments.length === 1 && segments[0] === TITLE_ADDRESS) {
    // A title exists only for a named manifest: an anonymous bundle draws none.
    return isNamed(manifest) ? { kind: "title" } : undefined;
  }
  const base = baseOf(manifest, segments);
  if (base === undefined) return undefined;
  let [resolved] = base;
  for (const segment of segments.slice(base[1])) {
    const word = partWord(segment);
    if (word === undefined || !partsOf(resolved).includes(word)) return undefined;
    resolved = { kind: "part", owner: resolved, word };
  }
  return resolved;
}

/** A resolved element as an address of the block holding its manifest. */
function inBlock(element: ResolvedElement, block: Block): ResolvedAddress {
  if (element.kind === "part") {
    return { kind: "part", block, owner: inBlock(element.owner, block), word: element.word };
  }
  return { ...element, block };
}

/**
 * Resolve an address once against its workspace view: the workspace, a
 * block, or an element of a block's manifest (`resolveElement`). The
 * manifest's own id names the block as its bare id does (`<block id>/<manifest
 * id>`). A malformed address is `invalid_address`; one naming nothing,
 * `unknown_target` (`<address> names nothing`), both at `[address]`.
 */
export function resolveAddress(view: View, address: Address): ResolvedAddress | CommandError {
  const syntax = parseAddressSyntax(address);
  if ("code" in syntax) return syntax;
  if (syntax.block === null) return { kind: "workspace" };
  const unknown = problem(ErrorCode.unknownTarget, `${address} names nothing`, [address]);
  const block = view.blocks[syntax.block];
  if (block === undefined) return unknown;
  const element = elementIn(syntax);
  if (element === null || element === block.manifest.id) return { kind: "block", block };
  const resolved = resolveElement(block.manifest, element);
  return resolved === undefined ? unknown : inBlock(resolved, block);
}

/**
 * The element an element address names with its parts and bands folded
 * away: the timeline of a card in a group's frame (`<group>/<timeline>/card`);
 * `<root>/<id>` when it starts with a root's id followed by an id that is not
 * reserved (`isReservedId`); its first segment otherwise. So
 * `score/end/label` and `score/regions_1` name `score`, as `score/card` and
 * `group_1/score/card` do, and `score/region_1/label` names
 * `score/region_1`. The manifest's title is `name` itself. It reads the
 * syntax only: what it names need not exist.
 */
export function elementOf(manifest: Manifest, element: string): string {
  const [first = "", second, third] = element.split("/");
  if (second === undefined) return first;
  if (third === CARD_WORD && manifest.groups.some((group) => group.id === first)) return second;
  const root = manifest.timelines.some((timeline) => timeline.id === first);
  return root && !isReservedId(second) ? elementAddress(first, second) : first;
}

/**
 * The timeline of a band address `<timeline>/<kind>_1` and its kind, read
 * from the syntax; `null` for any other address.
 */
export function parseBand(
  element: string,
): { readonly timeline: string; readonly kind: BandKind } | null {
  const segments = element.split("/");
  const [timeline = "", id = ""] = segments;
  const kind = segments.length === 2 && timeline !== "" ? bandNamed(id) : undefined;
  return kind === undefined ? null : { timeline, kind };
}

/** What a manifest's readers need once per manifest, memoised by identity. */
export interface ManifestIndex {
  readonly containers: Containers;
  readonly ancestry: ReadonlyMap<string, readonly string[]>;
  /** Every timeline's id and every entry's element address, mapped to the timeline it belongs to. */
  readonly owners: ReadonlyMap<string, string>;
  /** Every element of the manifest's drawing (`manifestElements`). */
  readonly elements: readonly ElementKey[];
}

const indexes = new WeakMap<Manifest, ManifestIndex>();

/**
 * The index of a manifest, memoised by identity; each member is computed on
 * its first read, so a reader of containment never builds the elements.
 */
export function indexOf(manifest: Manifest): ManifestIndex {
  const known = indexes.get(manifest);
  if (known !== undefined) return known;
  let ancestry: ReadonlyMap<string, readonly string[]> | undefined;
  let owners: ReadonlyMap<string, string> | undefined;
  let elements: readonly ElementKey[] | undefined;
  const index: ManifestIndex = {
    get containers() {
      return containersOf(manifest);
    },
    get ancestry() {
      ancestry ??= timelineAncestry(manifest);
      return ancestry;
    },
    get owners() {
      owners ??= ownersOf(manifest);
      return owners;
    },
    get elements() {
      elements ??= manifestElements(manifest);
      return elements;
    },
  };
  indexes.set(manifest, index);
  return index;
}

/** Every timeline mapped to itself and every entry's address to the timeline holding it. */
function ownersOf(manifest: Manifest): ReadonlyMap<string, string> {
  const { timelines, entries } = catalogueOf(manifest);
  const owners = new Map<string, string>();
  for (const id of timelines.keys()) owners.set(id, id);
  for (const [address, { at }] of entries) owners.set(address, at.timeline.id);
  return owners;
}
