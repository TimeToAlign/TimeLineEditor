/**
 * Workspace addresses and the one resolver that decides what an address
 * names. An address is an object, never a string composed from IDs: `{}`
 * the workspace, `{block}` a block (which draws its bundle), and `{block,
 * id?, facet?, part?}` an element of the block's manifest, its members
 * those of the manifest's own address (`docs/drawing.md` in TimeToShare,
 * section 2.2). Every reader of an address reads `resolveAddress` (or,
 * within one manifest, `resolveElement`); `addressKey` is its one string
 * form.
 */

import type { CommandError, Problem } from "../errors.ts";
import { ErrorCode, problem } from "../errors.ts";
import type { PathSegment } from "../json.ts";
import { compareCodePoints, isJsonObject } from "../json.ts";
import type { ElementAddress, Facet, Part } from "../manifest/address.ts";
import { addressKey, isFacet, isPart } from "../manifest/address.ts";
import type { ContainerRef, Containers } from "../manifest/containers.ts";
import { containersOf } from "../manifest/containers.ts";
import type { ElementKey } from "../manifest/elements.ts";
import { manifestElements, timelineAncestry } from "../manifest/elements.ts";
import type { EntryKind, ListedElement } from "../manifest/files.ts";
import { ENTRY_KINDS, ENTRY_LISTS, entriesOf } from "../manifest/files.ts";
import type { Located } from "../manifest/tree.ts";
import type {
  ConversionMap,
  FlowControlElement,
  Group,
  Manifest,
  MeasureMap,
  TimelineManifest,
} from "../manifest/types.ts";
import type { Block, BlockId } from "./blocks.ts";
import { BLOCK_ID } from "./blocks.ts";
import type { View } from "./view.ts";

/**
 * The workspace-wide address of the workspace (`{}`), a block (`{block}`),
 * or an element or part of a block's manifest (`{block, id?, facet?, part?}`).
 */
export interface Address extends ElementAddress {
  readonly block?: BlockId;
}

/** The address of the workspace itself. */
export const WORKSPACE: Address = {};

/** The members an address may state. */
const ADDRESS_MEMBERS = ["block", "id", "facet", "part"] as const;

/** Whether `value` is an ID as the schema allows it: a non-empty string without control characters. */
function isId(value: unknown): value is string {
  if (typeof value !== "string" || value === "") return false;
  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) < 0x20) return false;
  }
  return true;
}

/**
 * `value` read as an address, or `invalid_address` at `path`: an object of
 * only `block`, `id`, `facet` and `part`; `block` a block id; `id` an ID;
 * `facet` one of the five facets, standing with an `id` and never with a
 * `part`; `part` a non-empty array of part words; and any of `id`, `facet`
 * and `part` only with a `block`.
 */
export function readAddress(value: unknown, path: readonly PathSegment[]): Address | Problem {
  const invalid = (message: string) => problem(ErrorCode.invalidAddress, message, path);
  if (!isJsonObject(value)) return invalid("an address is an object");
  const extra = Object.keys(value).find(
    (member) => !ADDRESS_MEMBERS.some((known) => known === member),
  );
  if (extra !== undefined) return invalid(`an address has no member ${extra}`);
  const { block, id, facet, part } = value;
  if (block !== undefined && (typeof block !== "string" || !BLOCK_ID.test(block))) {
    return invalid("an address's block is a block id");
  }
  if (id !== undefined && !isId(id)) {
    return invalid("an address's id is a non-empty string without control characters");
  }
  if (facet !== undefined && !isFacet(facet)) return invalid("an address's facet is a facet");
  let words: Part[] | undefined;
  if (part !== undefined) {
    if (!Array.isArray(part) || part.length === 0 || !part.every(isPart)) {
      return invalid("an address's part is a non-empty array of part words");
    }
    words = part;
  }
  if (facet !== undefined && id === undefined) return invalid("a facet stands with an id");
  if (facet !== undefined && words !== undefined)
    return invalid("a facet never stands with a part");
  if (block === undefined && (id !== undefined || facet !== undefined || words !== undefined)) {
    return invalid("an element's address names its block");
  }
  return {
    ...(block === undefined ? {} : { block }),
    ...(id === undefined ? {} : { id }),
    ...(facet === undefined ? {} : { facet: facet as Facet }),
    ...(words === undefined ? {} : { part: words }),
  };
}

/** The address, in the block `block`, of the element of its manifest addressed `element`. */
export function inBlock(block: BlockId, element: ElementAddress): Address {
  return { block, ...element };
}

/** The element address an address holds without its block (`{}` for the workspace and a block). */
export function elementAddressOf(address: Address): ElementAddress {
  const { block: _, ...element } = address;
  return element;
}

/** Whether an address names an element or part of a block's manifest, not a block or the workspace. */
export function isElementAddress(address: Address): boolean {
  return address.id !== undefined || address.facet !== undefined || address.part !== undefined;
}

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
      /** Every card of the timeline, in drawing order; at least one. */
      readonly cards: readonly ContainerRef[];
    }
  | {
      readonly kind: "band";
      readonly block: Block;
      readonly at: Located;
      readonly facet: Facet;
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
      readonly word: Part;
    };

/** A resolved element address without the block that holds its manifest. */
export type ResolvedElement =
  | { readonly kind: "title" }
  | { readonly kind: "frame"; readonly group: Group; readonly container: ContainerRef }
  | { readonly kind: "timeline"; readonly at: Located; readonly cards: readonly ContainerRef[] }
  | { readonly kind: "card"; readonly at: Located; readonly cards: readonly ContainerRef[] }
  | {
      readonly kind: "band";
      readonly at: Located;
      readonly facet: Facet;
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
  | { readonly kind: "part"; readonly owner: ResolvedElement; readonly word: Part };

/**
 * What an ID of a manifest names, located in the manifest: a timeline, an
 * entry of a timeline's list, a conversion map another map holds (at
 * `path`, which nothing draws or addresses), a group or a MeasureMap.
 */
type Found =
  | { readonly kind: "timeline"; readonly at: Located }
  | {
      readonly kind: "entry";
      readonly at: Located;
      readonly entry: EntryKind;
      readonly index: number;
    }
  | { readonly kind: "held"; readonly path: readonly PathSegment[] }
  | { readonly kind: "group"; readonly group: Group }
  | { readonly kind: "measure_map"; readonly map: MeasureMap; readonly index: number };

const catalogues = new WeakMap<Manifest, ReadonlyMap<string, Found>>();

function isMapList(maps: unknown): maps is readonly ConversionMap[] {
  return Array.isArray(maps);
}

/** The maps `map` holds, with their keys in its `maps`: a list's indices, else names by code point. */
function heldMaps(map: ConversionMap): readonly (readonly [PathSegment, ConversionMap])[] {
  if (!("maps" in map)) return [];
  const { maps } = map;
  if (isMapList(maps)) return maps.map((item, index) => [index, item] as const);
  return Object.entries(maps).sort(([left], [right]) => compareCodePoints(left, right));
}

/**
 * Every ID of a manifest with what it names, built in one walk of its trees
 * and memoised by identity: per timeline in pre-order its own, its entries'
 * and, after each conversion map, the maps it holds at any depth; then the
 * groups' and the MeasureMaps'. An ID repeated in a manifest the schema
 * refuses keeps its first finding.
 */
function catalogueOf(manifest: Manifest): ReadonlyMap<string, Found> {
  const known = catalogues.get(manifest);
  if (known !== undefined) return known;
  const found = new Map<string, Found>();
  const note = (id: string, item: Found) => {
    if (!found.has(id)) found.set(id, item);
  };
  const hold = (map: ConversionMap, path: readonly PathSegment[]) => {
    for (const [key, item] of heldMaps(map)) {
      const at = [...path, "maps", key];
      note(item.id, { kind: "held", path: at });
      hold(item, at);
    }
  };
  const visit = (at: Located) => {
    note(at.timeline.id, { kind: "timeline", at });
    for (const entry of ENTRY_KINDS) {
      entriesOf(at.timeline, entry).forEach((item, index) => {
        note(item.id, { kind: "entry", at, entry, index });
      });
    }
    at.timeline.conversion_maps.forEach((map, index) => {
      hold(map, [...at.path, "conversion_maps", index]);
    });
    at.timeline.children.forEach((timeline: TimelineManifest, index) => {
      visit({ timeline, path: [...at.path, "children", index], parent: at });
    });
  };
  manifest.timelines.forEach((timeline, index) => {
    visit({ timeline, path: ["timelines", index], parent: undefined });
  });
  for (const group of manifest.groups) note(group.id, { kind: "group", group });
  manifest.measure_maps.forEach((map, index) => {
    note(map.id, { kind: "measure_map", map, index });
  });
  catalogues.set(manifest, found);
  return found;
}

/**
 * Every ID a manifest holds, each unique across the manifest: the IDs of
 * its catalogue (its timelines at any depth, their conversion maps at any
 * depth, regions and flow-control elements, its groups and MeasureMaps) and
 * the manifest's own.
 */
export function manifestIds(manifest: Manifest): Set<string> {
  const ids = new Set(catalogueOf(manifest).keys());
  if (manifest.id !== undefined) ids.add(manifest.id);
  return ids;
}

/**
 * Where an ID of a manifest's tree of timelines lies in the manifest, its
 * `id` member: a timeline's, an entry's or a held conversion map's;
 * `undefined` for a group's, a MeasureMap's and an ID the manifest lacks.
 */
export function idPath(manifest: Manifest, id: string): readonly PathSegment[] | undefined {
  const found = catalogueOf(manifest).get(id);
  switch (found?.kind) {
    case "timeline":
      return [...found.at.path, "id"];
    case "entry":
      return [...found.at.path, ...ENTRY_LISTS[found.entry].path, found.index, "id"];
    case "held":
      return [...found.path, "id"];
    default:
      return undefined;
  }
}

/**
 * The element an ID names with what its address adds: a group's frame, a
 * measure map, a timeline, its cards (`part` beginning with `card`) or one
 * of its bands (`facet`), or an entry; with the part words that address
 * left to read, or `undefined` when it names nothing. A band or a card
 * exists only for a timeline drawn in a card; a map another map holds is
 * neither drawn nor addressed.
 */
function baseOf(
  manifest: Manifest,
  id: string,
  facet: Facet | undefined,
  part: readonly Part[],
): readonly [ResolvedElement, readonly Part[]] | undefined {
  const found = catalogueOf(manifest).get(id);
  if (found === undefined) return undefined;
  const containers = containersOf(manifest);
  if (found.kind === "timeline") {
    const { at } = found;
    const cards = containers.cards.get(id) ?? [];
    if (facet !== undefined) {
      const drawn = containers.bands.get(id)?.get(facet);
      return drawn === undefined ? undefined : [{ kind: "band", at, facet, containers: drawn }, []];
    }
    if (part[0] === "card") {
      return cards.length === 0 ? undefined : [{ kind: "card", at, cards }, part.slice(1)];
    }
    return [{ kind: "timeline", at, cards }, part];
  }
  if (facet !== undefined) return undefined;
  switch (found.kind) {
    case "held":
      return undefined;
    case "group": {
      const container = containers.frames.get(id);
      if (container === undefined) throw new Error(`group ${id} draws no frame`);
      return [{ kind: "frame", group: found.group, container }, part];
    }
    case "measure_map":
      return part.length > 0 ? undefined : [{ ...found }, []];
    case "entry": {
      const element = entriesOf(found.at.timeline, found.entry)[found.index];
      if (element === undefined) return undefined;
      return [{ ...found, element }, part];
    }
  }
}

/**
 * Resolve an element address against a manifest: a frame, a measure map, a
 * timeline, a timeline's cards, a band (of a timeline drawn in a card), an
 * entry, or a part that the manifest's drawing draws (`ManifestIndex.drawn`,
 * `docs/drawing.md` section 2.2): the manifest's title (of a named
 * manifest), a group's title, the name of a timeline drawn with one, the
 * wedges and marks of a member drawing's root with their labels, a
 * segment's boundary (of every segment but the first) and label, the label
 * of a region, a flow marker or a jump origin, and the cards. `undefined`
 * for anything else, the bundle's address `{}` included (the workspace
 * resolver reads it as the block).
 */
export function resolveElement(
  manifest: Manifest,
  element: ElementAddress,
): ResolvedElement | undefined {
  const { id, facet, part = [] } = element;
  if (part.length > 0 && !indexOf(manifest).drawn.has(addressKey(element))) return undefined;
  if (id === undefined) return part.length > 0 ? { kind: "title" } : undefined;
  const base = baseOf(manifest, id, facet, part);
  if (base === undefined) return undefined;
  let [resolved] = base;
  for (const word of base[1]) resolved = { kind: "part", owner: resolved, word };
  return resolved;
}

/** A resolved element as an address of the block holding its manifest. */
function resolvedIn(element: ResolvedElement, block: Block): ResolvedAddress {
  if (element.kind === "part") {
    return { kind: "part", block, owner: resolvedIn(element.owner, block), word: element.word };
  }
  return { ...element, block };
}

/**
 * `unknown_target` for an address naming nothing in `view`: `<address words>
 * names nothing` (`addressWords`, worded from its members), at `[<address key>]`.
 */
export function namesNothing(view: View, address: Address): CommandError {
  return problem(ErrorCode.unknownTarget, `${unresolvedWords(view, address)} names nothing`, [
    addressKey(address),
  ]);
}

/**
 * Resolve an address once against its workspace view: the workspace, a
 * block, or an element of a block's manifest (`resolveElement`). A malformed
 * address is `invalid_address`, one naming nothing `unknown_target`, both at
 * `[<address key>]`. The manifest's own ID addresses nothing.
 */
export function resolveAddress(view: View, address: Address): ResolvedAddress | CommandError {
  const read = readAddress(address, [addressKey(address)]);
  if ("code" in read) return read;
  if (read.block === undefined) return { kind: "workspace" };
  const block = view.blocks[read.block];
  if (block === undefined) return namesNothing(view, address);
  if (!isElementAddress(read)) return { kind: "block", block };
  const resolved = resolveElement(block.manifest, elementAddressOf(read));
  return resolved === undefined ? namesNothing(view, address) : resolvedIn(resolved, block);
}

/** The word of each facet, lowercase: what its band is called. */
const FACET_WORDS: { readonly [facet in Facet]: string } = {
  markers: "markers",
  conversion_maps: "conversion maps",
  children: "children",
  regions: "regions",
  flow_control: "flow control",
};

/** The word of a facet, lowercase: `markers`, `conversion maps`, `children`, `regions`, `flow control`. */
export function facetWord(facet: Facet): string {
  return FACET_WORDS[facet];
}

/** The word of each type of flow-control element. */
const FLOW_WORDS: { readonly [type in FlowControlElement["type"]]: string } = {
  jump_from: "jump origin",
  jump_to: "jump target",
  flow_marker: "flow marker",
};

/** The word of each other kind of element a timeline holds in a list. */
const ENTRY_WORDS: { readonly [kind in Exclude<EntryKind, "flow_control">]: string } = {
  map: "conversion map",
  region: "region",
};

/**
 * The word of an element a timeline holds in a list, lowercase: `conversion
 * map`, `region`, or a flow-control element's by its type (`jump origin`,
 * `jump target`, `flow marker`).
 */
export function entryWord(kind: EntryKind, element: ListedElement): string {
  if (kind !== "flow_control") return ENTRY_WORDS[kind];
  if (!("manifestation" in element))
    throw new Error("a flow-control entry is a flow-control element");
  return FLOW_WORDS[element.type];
}

/** A name or an ID as a phrase quotes it. */
const quoted = (text: string): string => `'${text}'`;

/** A block's bundle by its manifest's `name`, else its `id`, else as the anonymous bundle. */
function bundleWords({ manifest }: Block): string {
  const name = manifest.name ?? manifest.id;
  return name === null || name === undefined ? "the anonymous bundle" : `bundle ${quoted(name)}`;
}

/** The block `block` by its bundle, or by its ID when the view does not hold it. */
function blockWords(view: View, block: BlockId): string {
  const held = view.blocks[block];
  return held === undefined ? `block ${quoted(block)}` : bundleWords(held);
}

/**
 * What a resolved element is called without its block, and whether the
 * words already name the bundle (a block's title and its parts).
 */
function elementWords(resolved: ResolvedAddress): {
  readonly words: string;
  readonly bundled: boolean;
} {
  switch (resolved.kind) {
    case "workspace":
      return { words: "the workspace", bundled: true };
    case "block":
      return { words: bundleWords(resolved.block), bundled: true };
    case "title":
      return { words: `the title of ${bundleWords(resolved.block)}`, bundled: true };
    case "frame":
      return { words: `group ${quoted(resolved.group.name ?? resolved.group.id)}`, bundled: false };
    case "timeline":
    case "card":
    case "band": {
      const { name, id } = resolved.at.timeline;
      const timeline = `timeline ${quoted(name ?? id)}`;
      if (resolved.kind === "timeline") return { words: timeline, bundled: false };
      const part = resolved.kind === "card" ? "card" : `${facetWord(resolved.facet)} band`;
      return { words: `the ${part} of ${timeline}`, bundled: false };
    }
    case "entry": {
      const { element } = resolved;
      const words = `${entryWord(resolved.entry, element)} ${quoted(element.name ?? element.id)}`;
      return { words, bundled: false };
    }
    case "measure_map":
      return {
        words: `measure map ${quoted(resolved.map.name ?? resolved.map.id)}`,
        bundled: false,
      };
    case "part": {
      const owner = elementWords(resolved.owner);
      const titled = resolved.owner.kind === "block" || resolved.owner.kind === "frame";
      const word = resolved.word === "name" && titled ? "title" : resolved.word;
      return { words: `the ${word} of ${owner.words}`, bundled: owner.bundled };
    }
  }
}

/**
 * The members of an address that names nothing, worded: its parts, innermost
 * first, and its facet's band, of its element by its kind where its ID names
 * one (`the regions band of timeline 'Recording'`), else of its ID quoted
 * (`'gone'`), or of its block's bundle without an ID (a bundle's name its
 * `title`).
 */
function memberWords(view: View, address: Address): string {
  const { block, id, facet, part = [] } = address;
  const owned = facet !== undefined || part.length > 0;
  const owner =
    owned && block !== undefined && id !== undefined ? resolveAddress(view, { block, id }) : null;
  let words: string;
  if (owner !== null && !("code" in owner)) words = elementWords(owner).words;
  else if (id !== undefined) words = quoted(id);
  else words = block === undefined ? "the workspace" : blockWords(view, block);
  if (facet !== undefined) words = `the ${facetWord(facet)} band of ${words}`;
  part.forEach((word, index) => {
    words = `the ${word === "name" && index === 0 && id === undefined ? "title" : word} of ${words}`;
  });
  return words;
}

/**
 * An address as a message names it to a reader: the workspace, a bundle by
 * its manifest's name or id (`bundle 'Mixed'`, `the anonymous bundle`), an
 * element by its kind and its name, else its ID (`timeline 'Score'`,
 * `region 'region_1'`), a band and a card by their timeline (`the regions
 * band of timeline 'Score'`), a part by its owner, innermost first (`the
 * label of the end of timeline 'Score'`, a bundle's or a group's name its
 * `title`). An element of a manifest is followed by its bundle (`in bundle
 * 'Mixed'`) unless the view holds that block alone. An address naming
 * nothing is worded from its members: its ID quoted (`'gone'`), its block
 * by its bundle, or by its ID (`block '0000000009'`) when the view does not
 * hold it. `addressKey`, not this, is an address's string form.
 */
export function addressWords(view: View, address: Address): string {
  const resolved = resolveAddress(view, address);
  if ("code" in resolved) return unresolvedWords(view, address);
  const { words, bundled } = elementWords(resolved);
  return bundled ? words : inBundle(view, address, words);
}

/** The words of an address naming nothing: its members (`memberWords`), an element's followed by its bundle. */
function unresolvedWords(view: View, address: Address): string {
  const words = memberWords(view, address);
  return address.id === undefined ? words : inBundle(view, address, words);
}

/** The words of an element of a manifest followed by its bundle, unless the view holds that block alone. */
function inBundle(view: View, { block }: Address, words: string): string {
  if (block === undefined) return words;
  const alone = Object.keys(view.blocks).length === 1 && view.blocks[block] !== undefined;
  return alone ? words : `${words} in ${blockWords(view, block)}`;
}

/** What a manifest's readers need once per manifest, memoised by identity. */
export interface ManifestIndex {
  readonly containers: Containers;
  readonly ancestry: ReadonlyMap<string, readonly string[]>;
  /** Every timeline's and every entry's ID, mapped to the timeline it belongs to. */
  readonly owners: ReadonlyMap<string, string>;
  /** Every element of the manifest's drawing (`manifestElements`). */
  readonly elements: readonly ElementKey[];
  /** The `addressKey` of every element's address in `elements`, once each. */
  readonly drawn: ReadonlySet<string>;
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
  let drawn: ReadonlySet<string> | undefined;
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
    get drawn() {
      drawn ??= new Set(index.elements.map((key) => addressKey(key.address)));
      return drawn;
    },
  };
  indexes.set(manifest, index);
  return index;
}

/** Every timeline's ID mapped to itself and every entry's ID to the timeline holding it. */
function ownersOf(manifest: Manifest): ReadonlyMap<string, string> {
  const owners = new Map<string, string>();
  for (const [id, found] of catalogueOf(manifest)) {
    if (found.kind === "timeline" || found.kind === "entry") owners.set(id, found.at.timeline.id);
  }
  return owners;
}
