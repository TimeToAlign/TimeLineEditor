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
import { assertNever, ErrorCode, problem } from "../errors.ts";
import type { PathSegment } from "../json.ts";
import { compareCodePoints, isJsonObject } from "../json.ts";
import type { ElementAddress, Facet, Part, PartItem } from "../manifest/address.ts";
import { addressKey, isFacet, isPart } from "../manifest/address.ts";
import type { ContainerRef, Containers } from "../manifest/containers.ts";
import { containersOf } from "../manifest/containers.ts";
import type { ElementKey } from "../manifest/elements.ts";
import { manifestElements } from "../manifest/elements.ts";
import { defaultElisionTimelines } from "../manifest/elisions.ts";
import type { EntryKind, ListedElement } from "../manifest/files.ts";
import { ENTRY_KINDS, ENTRY_LISTS, entriesOf, locateVirtual } from "../manifest/files.ts";
import { switchOf } from "../manifest/switched.ts";
import type { Located } from "../manifest/tree.ts";
import { memberAncestry, timelinesInOrder } from "../manifest/tree.ts";
import type {
  AlignmentAnchor,
  ConversionMap,
  Elision,
  FlowControlElement,
  FlowMap,
  Group,
  Manifest,
  MeasureMap,
  NamedMatchStamp,
  NamedTimestamp,
  VirtualTimeline,
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
export function isId(value: unknown): value is string {
  if (typeof value !== "string" || value === "") return false;
  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) < 0x20) return false;
  }
  return true;
}

/**
 * `value` read as an address, or `invalid_address` at `path`: an object of
 * only `block`, `id`, `facet` and `part`; `block` a block id; `id` an ID;
 * `facet` one of the five facets, standing with an `id`, and with a `part`
 * only where the part holds a chunk index; `part` a non-empty array of part
 * words and chunk indices (integers from 0), as the schema's `Address`
 * reads it; and any of `id`, `facet` and `part` only with a `block`.
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
  let words: PartItem[] | undefined;
  if (part !== undefined) {
    if (!Array.isArray(part) || part.length === 0 || !part.every(isPartItem)) {
      return invalid("an address's part is a non-empty array of part words and chunk indices");
    }
    words = part;
  }
  if (facet !== undefined && id === undefined) return invalid("a facet stands with an id");
  if (facet !== undefined && words?.every(isPart)) {
    return invalid("a facet stands with a part only where the part holds a chunk index");
  }
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

/** Whether `value` is a part word or a chunk index, an integer from 0. */
function isPartItem(value: unknown): value is PartItem {
  return isPart(value) || (typeof value === "number" && Number.isSafeInteger(value) && value >= 0);
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
      readonly kind: "timestamp";
      readonly block: Block;
      /** The timeline the timestamp lies on. */
      readonly at: Located;
      /** Its index in the manifest's `graphical.timestamps`. */
      readonly index: number;
      readonly timestamp: NamedTimestamp;
    }
  | ({ readonly kind: "elision"; readonly block: Block } & ElisionFound)
  | ({ readonly kind: "matchstamp"; readonly block: Block } & MatchStampFound)
  | ({ readonly kind: "anchor"; readonly block: Block } & AnchorFound)
  | ({ readonly kind: "flow_map"; readonly block: Block } & FlowMapFound)
  | ({ readonly kind: "virtual_timeline"; readonly block: Block } & VirtualFound)
  | ({ readonly kind: "virtual_card"; readonly block: Block } & VirtualFound)
  | ({ readonly kind: "virtual_band"; readonly block: Block } & VirtualBandFound)
  | ({ readonly kind: "chunk"; readonly block: Block } & ChunkFound)
  | ({ readonly kind: "chunk_band"; readonly block: Block } & ChunkBandFound)
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
  | {
      readonly kind: "timestamp";
      readonly at: Located;
      readonly index: number;
      readonly timestamp: NamedTimestamp;
    }
  | ({ readonly kind: "elision" } & ElisionFound)
  | ({ readonly kind: "matchstamp" } & MatchStampFound)
  | ({ readonly kind: "anchor" } & AnchorFound)
  | ({ readonly kind: "flow_map" } & FlowMapFound)
  | ({ readonly kind: "virtual_timeline" } & VirtualFound)
  | ({ readonly kind: "virtual_card" } & VirtualFound)
  | ({ readonly kind: "virtual_band" } & VirtualBandFound)
  | ({ readonly kind: "chunk" } & ChunkFound)
  | ({ readonly kind: "chunk_band" } & ChunkBandFound)
  | { readonly kind: "part"; readonly owner: ResolvedElement; readonly word: Part };

/** A stored elision, found in a manifest's `graphical.elisions` with the timeline it lies on. */
export interface ElisionFound {
  /** The timeline it lies on, a virtual timeline located as its axis (`locateVirtual`). */
  readonly at: Located;
  /** Its index in the manifest's `graphical.elisions`. */
  readonly index: number;
  readonly elision: Elision;
}

/** A named MatchStamp, found in a manifest's `graphical.matchstamps`. */
export interface MatchStampFound {
  /** Its index in the manifest's `graphical.matchstamps`. */
  readonly index: number;
  readonly matchstamp: NamedMatchStamp;
}

/** A FlowMap, found in a manifest's `flow_maps`. */
export interface FlowMapFound {
  /** Its index in the manifest's `flow_maps`. */
  readonly index: number;
  readonly flowMap: FlowMap;
}

/**
 * A virtual timeline, found in a manifest's `virtual_timelines`, with its
 * cards in drawing order: one in the frame of each group that has it as a
 * member, or its one block-held card in no group (`containersOf`). The
 * address `{id: V}` names the virtual timeline, `{id: V, part: ["card"]}`
 * its cards (`virtual_card`) and `{id: V, facet}` the drawings of one of its
 * five bands (`virtual_band`).
 */
export interface VirtualFound {
  /** Its index in the manifest's `virtual_timelines`. */
  readonly index: number;
  readonly virtual: VirtualTimeline;
  readonly cards: readonly ContainerRef[];
}

/** A band of a virtual timeline's cards: its facet and every drawing of it, in drawing order. */
export interface VirtualBandFound extends VirtualFound {
  readonly facet: Facet;
  readonly containers: readonly ContainerRef[];
}

/**
 * A chunk: an entry of the FlowMap drawn on the line of a virtual timeline
 * or of a timeline whose card is switched (`docs/drawing.md` section 8.10),
 * a segment of that line, a gap's included; addressed `{id, part: [k]}` by
 * the ID of that line, its label `[k, "label"]`, its leader `[k, "leader"]`
 * and its boundary `[k, "start"]` its parts.
 */
export interface ChunkFound {
  /** The entry's index in the FlowMap's `chunks`, from 0. */
  readonly chunk: number;
  /** The FlowMap drawn, and its index in the manifest's `flow_maps`. */
  readonly flowMap: FlowMapFound;
  /** The line it is drawn on: the virtual timeline, or the switched card's timeline. */
  readonly line: ChunkLine;
}

/**
 * A band of the window of a chunk of a virtual timeline `V` (section 8.10,
 * Windows), `{id: V, facet, part: [k]}`: the chunk and the band's facet.
 */
export interface ChunkBandFound extends ChunkFound {
  readonly facet: Facet;
}

/** The line a chunk is drawn on: a virtual timeline, or a timeline whose card is switched. */
export type ChunkLine = Extract<
  ResolvedElement,
  { readonly kind: "virtual_timeline" | "timeline" }
>;

/** An alignment anchor of a named MatchStamp, found with the MatchStamp holding it. */
export interface AnchorFound extends MatchStampFound {
  /** Its index in the MatchStamp's `alignment_anchors`. */
  readonly position: number;
  readonly anchor: AlignmentAnchor;
}

/**
 * What an ID of a manifest names, located in the manifest: a timeline, an
 * entry of a timeline's list, a conversion map another map holds (at
 * `path`, which nothing draws or addresses), a group, a MeasureMap, a
 * named timestamp or an elision (with the timeline it lies on), a named
 * MatchStamp, an alignment anchor (with its MatchStamp), a FlowMap, a
 * virtual timeline, or a resource (which nothing draws or addresses).
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
  | { readonly kind: "resource" }
  | ({ readonly kind: "flow_map" } & FlowMapFound)
  | { readonly kind: "virtual_timeline"; readonly index: number; readonly virtual: VirtualTimeline }
  | ({ readonly kind: "elision" } & ElisionFound)
  | ({ readonly kind: "matchstamp" } & MatchStampFound)
  | ({ readonly kind: "anchor" } & AnchorFound)
  | { readonly kind: "group"; readonly group: Group }
  | { readonly kind: "measure_map"; readonly map: MeasureMap; readonly index: number }
  | {
      readonly kind: "timestamp";
      readonly at: Located;
      readonly index: number;
      readonly timestamp: NamedTimestamp;
    };

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
 * Every ID of a manifest with what it names, built once over its located
 * timelines (`timelinesInOrder`) and memoised by identity: per timeline in
 * pre-order its own, its entries' and, after each conversion map, the maps
 * it holds at any depth; then the groups', the MeasureMaps', the
 * resources', the FlowMaps', the virtual timelines', the named timestamps', the elisions' and the named
 * MatchStamps', each followed by its alignment anchors'. A named timestamp
 * or an elision on a virtual timeline lies on it as on a root
 * (`locateVirtual`). An ID repeated in a manifest the schema refuses keeps
 * its first finding, and a timestamp or an elision on neither a timeline
 * nor a virtual timeline, which the schema refuses too, is passed over.
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
  for (const at of timelinesInOrder(manifest)) {
    note(at.timeline.id, { kind: "timeline", at });
    for (const entry of ENTRY_KINDS) {
      entriesOf(at.timeline, entry).forEach((item, index) => {
        note(item.id, { kind: "entry", at, entry, index });
      });
    }
    at.timeline.conversion_maps.forEach((map, index) => {
      hold(map, [...at.path, "conversion_maps", index]);
    });
  }
  for (const group of manifest.groups) note(group.id, { kind: "group", group });
  manifest.measure_maps.forEach((map, index) => {
    note(map.id, { kind: "measure_map", map, index });
  });
  for (const resource of manifest.resources) note(resource.id, { kind: "resource" });
  (manifest.flow_maps ?? []).forEach((flowMap, index) => {
    note(flowMap.id, { kind: "flow_map", index, flowMap });
  });
  (manifest.virtual_timelines ?? []).forEach((virtual, index) => {
    note(virtual.id, { kind: "virtual_timeline", index, virtual });
  });
  /** Where an element lying on the timeline or virtual timeline `id` lies. */
  const lying = (id: string) => {
    const on = found.get(id);
    if (on?.kind === "timeline") return on.at;
    return on?.kind === "virtual_timeline" ? locateVirtual(manifest, on.virtual.id) : undefined;
  };
  (manifest.graphical?.timestamps ?? []).forEach((timestamp, index) => {
    const at = lying(timestamp.timeline);
    if (at !== undefined) note(timestamp.id, { kind: "timestamp", at, index, timestamp });
  });
  (manifest.graphical?.elisions ?? []).forEach((elision, index) => {
    const at = lying(elision.timeline);
    if (at !== undefined) note(elision.id, { kind: "elision", at, index, elision });
  });
  (manifest.graphical?.matchstamps ?? []).forEach((matchstamp, index) => {
    note(matchstamp.id, { kind: "matchstamp", index, matchstamp });
    matchstamp.alignment_anchors.forEach((anchor, position) => {
      note(anchor.id, { kind: "anchor", index, matchstamp, position, anchor });
    });
  });
  catalogues.set(manifest, found);
  return found;
}

/**
 * Every ID a manifest holds, each unique across the manifest: the IDs of
 * its catalogue (its timelines at any depth, their conversion maps at any
 * depth, regions and flow-control elements, its groups, MeasureMaps,
 * resources, FlowMaps, virtual timelines, named timestamps, elisions, named MatchStamps and their
 * alignment anchors) and the manifest's own, which is neither drawn nor addressed.
 */
export function manifestIds(manifest: Manifest): Set<string> {
  const ids = new Set(catalogueOf(manifest).keys());
  if (manifest.id !== undefined) ids.add(manifest.id);
  return ids;
}

/**
 * Where an ID of a manifest's tree of timelines lies in the manifest, its
 * `id` member: a timeline's, an entry's or a held conversion map's;
 * `undefined` for any other ID and an ID the manifest lacks.
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
    case undefined:
    case "resource":
    case "flow_map":
    case "virtual_timeline":
    case "elision":
    case "matchstamp":
    case "anchor":
    case "group":
    case "measure_map":
    case "timestamp":
      return undefined;
    default:
      return assertNever(found);
  }
}

/**
 * Where a resolved address lies in its block's manifest, as a path from the
 * manifest's top (bare IDs; `idFormPath` leads it into the file form): the
 * manifest's title its `name`; a frame its group in `groups`; a timeline
 * and its cards the timeline; a band the list of its facet in the timeline
 * (`children`, `conversion_maps`, `regions`, `flow_control`), the markers
 * band, which no list of the timeline holds, the timeline; an entry its
 * place in its timeline's list; a measure map, a named timestamp, a stored
 * elision and a named MatchStamp their places in `measure_maps` and in
 * `graphical`; an alignment anchor its place in its MatchStamp; a part the
 * place of what it belongs to (a derived elision's, its timeline's).
 * `null` for the workspace and a block, which lie in no manifest's place.
 */
export function resolvedPath(resolved: ResolvedAddress): readonly PathSegment[] | null {
  switch (resolved.kind) {
    case "workspace":
    case "block":
      return null;
    case "title":
      return ["name"];
    case "frame":
      return ["groups", resolved.block.manifest.groups.indexOf(resolved.group)];
    case "timeline":
    case "card":
      return resolved.at.path;
    case "band":
      return resolved.facet === "markers"
        ? resolved.at.path
        : [...resolved.at.path, resolved.facet];
    case "entry":
      return [...resolved.at.path, ...ENTRY_LISTS[resolved.entry].path, resolved.index];
    case "measure_map":
      return ["measure_maps", resolved.index];
    case "timestamp":
      return ["graphical", "timestamps", resolved.index];
    case "elision":
      return ["graphical", "elisions", resolved.index];
    case "matchstamp":
      return ["graphical", "matchstamps", resolved.index];
    case "anchor":
      return ["graphical", "matchstamps", resolved.index, "alignment_anchors", resolved.position];
    case "flow_map":
      return ["flow_maps", resolved.index];
    case "virtual_timeline":
    case "virtual_card":
    case "virtual_band":
      return ["virtual_timelines", resolved.index];
    case "chunk":
    case "chunk_band":
      return ["flow_maps", resolved.flowMap.index, "chunks", resolved.chunk];
    case "part":
      return resolvedPath(resolved.owner);
    default:
      return assertNever(resolved);
  }
}

/**
 * The element an ID names with what its address adds: a group's frame, a
 * measure map, a timeline, its cards (`part` beginning with `card`) or one
 * of its bands (`facet`), an entry, a named timestamp, a stored elision, a
 * named MatchStamp, an alignment anchor or a FlowMap; with the part words
 * that address left to read, or `undefined` when it names nothing. A band
 * or a card exists only for a timeline drawn in a card; a map another map
 * holds and a resource are neither drawn nor addressed, a virtual timeline
 * is resolved apart (`virtualOf`), and a MatchStamp, which is drawn by its
 * anchors, and a FlowMap, which is drawn as the virtual timelines applying
 * it, have no part.
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
    case "resource":
    case "virtual_timeline":
      return undefined;
    case "matchstamp":
    case "flow_map":
      return part.length > 0 ? undefined : [{ ...found }, []];
    case "anchor":
      return [{ ...found }, part];
    case "group": {
      const container = containers.frames.get(id);
      if (container === undefined) throw new Error(`group ${id} draws no frame`);
      return [{ kind: "frame", group: found.group, container }, part];
    }
    case "measure_map":
      return part.length > 0 ? undefined : [{ ...found }, []];
    case "timestamp":
    case "elision":
      return [{ ...found }, part];
    case "entry": {
      const element = entriesOf(found.at.timeline, found.entry)[found.index];
      if (element === undefined) return undefined;
      return [{ ...found, element }, part];
    }
    default:
      return assertNever(found);
  }
}

/**
 * Resolve an element address against a manifest: a frame, a measure map, a
 * timeline, a timeline's cards, a band (of a timeline drawn in a card), an
 * entry, or a part that the manifest's drawing draws (`ManifestIndex.drawn`,
 * `docs/drawing.md` section 2.2): the manifest's title (of a named
 * manifest), a group's title, the name of a timeline drawn with one, the
 * wedges of a member drawing's named timestamps with their labels, a
 * segment's boundary (of every segment but the first) and label, the label
 * of a region, a break, a section break, a barline or a jump, a named timestamp's label
 * and cross-section line (`line`), a stored elision's ellipsis and labels,
 * and the cards. A named timestamp and a stored elision themselves resolve
 * with the timeline they lie on, drawn or not; a named MatchStamp and an
 * alignment anchor, which belong to no timeline, resolve by their IDs, the
 * anchor with the MatchStamp holding it. A derived elision, which the
 * drawing derives and which has no ID, resolves as the part `elision` of
 * the timeline `T` it lies on (`{id: T, part: ["elision"]}`, its ellipsis
 * `["elision", "ellipsis"]`, its labels `["elision", "name"]` and
 * `["elision", "coordinate"]`) wherever `T` may carry one
 * (`defaultElisionTimelines`), never as an invented ID. `undefined` for
 * anything else, the bundle's address `{}` included (the workspace resolver
 * reads it as the block).
 */
export function resolveElement(
  manifest: Manifest,
  element: ElementAddress,
): ResolvedElement | undefined {
  const { id, facet, part = [] } = element;
  const virtual = id === undefined ? undefined : catalogueOf(manifest).get(id);
  if (virtual?.kind === "virtual_timeline") return virtualOf(manifest, virtual, element);
  if (
    part.length > 0 &&
    !indexOf(manifest).drawn.has(addressKey(element)) &&
    !namesDefaultElision(manifest, element)
  ) {
    return undefined;
  }
  if (id === undefined) return part.length > 0 ? { kind: "title" } : undefined;
  // A chunk, whose part begins with its chunk index, lies on a virtual timeline's line
  // (`virtualOf`) or on the line of a switched card's timeline.
  if (!part.every(isPart)) return switchedChunkOf(manifest, id, facet, part);
  const base = baseOf(manifest, id, facet, part);
  if (base === undefined) return undefined;
  let [resolved] = base;
  for (const word of base[1]) resolved = { kind: "part", owner: resolved, word };
  return resolved;
}

/**
 * The entry `part[0]` of the FlowMap the card of the timeline `id` is
 * switched to (`switchOf`), drawn on its line (section 8.10), as
 * `chunkOf` reads it; `undefined` where `id` names no timeline with a
 * switched card.
 */
function switchedChunkOf(
  manifest: Manifest,
  id: string,
  facet: Facet | undefined,
  part: readonly PartItem[],
): ResolvedElement | undefined {
  const found = catalogueOf(manifest).get(id);
  const flowMap = switchOf(manifest, id)?.flowMap;
  // A switched card's chunks have no window, so no band.
  if (found?.kind !== "timeline" || facet !== undefined || flowMap === undefined) return undefined;
  const cards = containersOf(manifest).cards.get(id) ?? [];
  return chunkOf(manifest, { kind: "timeline", at: found.at, cards }, flowMap, facet, part);
}

/**
 * What an address of a virtual timeline names: the virtual timeline
 * itself (`{id: V}`) and its parts (its name), its cards (`{id: V, part:
 * ["card"]}`), one of their
 * bands (`{id: V, facet}`, where a card holds it), an entry of its FlowMap
 * (`{id: V, part: [k]}`, a `chunk`), the parts of one (`[k, "label"]`, `[k,
 * "leader"]`, `[k, "start"]`) and the bands of its window (`{id: V, facet,
 * part: [k]}`, a `chunk_band`); a part only where the manifest's drawing
 * lists it (`ManifestIndex.drawn`), as every part. `undefined` for any other
 * part or facet.
 */
function virtualOf(
  manifest: Manifest,
  found: { readonly index: number; readonly virtual: VirtualTimeline },
  element: ElementAddress,
): ResolvedElement | undefined {
  const { index, virtual } = found;
  const { facet, part = [] } = element;
  const containers = containersOf(manifest);
  const cards = containers.cards.get(virtual.id) ?? [];
  if (part.length > 0 && !indexOf(manifest).drawn.has(addressKey(element))) return undefined;
  if (typeof part[0] === "number") {
    const line: ChunkLine = { kind: "virtual_timeline", index, virtual, cards };
    return chunkOf(manifest, line, virtual.map, facet, part);
  }
  if (facet !== undefined) {
    if (part.length > 0) return undefined;
    const drawn = containers.bands.get(virtual.id)?.get(facet);
    if (drawn === undefined) return undefined;
    return { kind: "virtual_band", index, virtual, cards, facet, containers: drawn };
  }
  const own: VirtualFound = { index, virtual, cards };
  const card = part[0] === "card";
  let resolved: ResolvedElement = { kind: card ? "virtual_card" : "virtual_timeline", ...own };
  for (const word of card ? part.slice(1) : part) {
    if (!isPart(word)) return undefined;
    resolved = { kind: "part", owner: resolved, word };
  }
  return resolved;
}

/**
 * The entry `part[0]` of the FlowMap `flowMap` drawn on `line`, with the
 * part word that follows it, if any, read as its part; with `facet` and no
 * word, the band of that facet of its window.
 */
function chunkOf(
  manifest: Manifest,
  line: ChunkLine,
  flowMap: string,
  facet: Facet | undefined,
  part: readonly PartItem[],
): ResolvedElement | undefined {
  const [chunk, word, ...more] = part;
  if (typeof chunk !== "number" || more.length > 0) return undefined;
  if (word !== undefined && (facet !== undefined || !isPart(word))) return undefined;
  const flowMaps = manifest.flow_maps ?? [];
  const index = flowMaps.findIndex((item) => item.id === flowMap);
  const found = flowMaps[index];
  if (found === undefined) return undefined;
  const resolved: ResolvedElement = {
    kind: "chunk",
    chunk,
    flowMap: { index, flowMap: found },
    line,
  };
  if (facet !== undefined) return { ...resolved, kind: "chunk_band", facet };
  return word === undefined ? resolved : { kind: "part", owner: resolved, word };
}

/**
 * The words below `elision` in the address of a derived elision's parts:
 * its ellipsis and its labels but the ID, which it does not have.
 */
const DERIVED_ELISION_PARTS: readonly Part[] = ["ellipsis", "name", "coordinate"];

/**
 * Whether `element` addresses a derived elision or one of its parts on a
 * timeline that may carry one (`defaultElisionTimelines`): `{id: T, part:
 * ["elision"]}`, `["elision", "ellipsis"]`, `["elision", "name"]` or
 * `["elision", "coordinate"]`.
 */
function namesDefaultElision(manifest: Manifest, { id, facet, part = [] }: ElementAddress) {
  if (id === undefined || facet !== undefined || part[0] !== "elision" || part.length > 2) {
    return false;
  }
  const [, word] = part;
  if (word !== undefined && (!isPart(word) || !DERIVED_ELISION_PARTS.includes(word))) return false;
  return defaultElisionTimelines(manifest).has(id);
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

/** The word of a flow-control element of each role. */
const FLOW_WORDS: { readonly [role in FlowControlElement["role"]]: string } = {
  jump: "jump",
  jump_target: "jump target",
  break: "break",
  section_break: "section break",
  barline: "barline",
};

/** The word of each other kind of element a timeline holds in a list. */
const ENTRY_WORDS: { readonly [kind in Exclude<EntryKind, "flow_control">]: string } = {
  map: "conversion map",
  region: "region",
};

/**
 * The word of an element a timeline holds in a list, lowercase: `conversion
 * map`, `region`, or a flow-control element's by its role (`jump`, `jump
 * target`, `break`, `section break`, `barline`).
 */
export function entryWord(kind: EntryKind, element: ListedElement): string {
  if (kind !== "flow_control") return ENTRY_WORDS[kind];
  if (!("role" in element)) throw new Error("a flow-control entry is a flow-control element");
  return FLOW_WORDS[element.role];
}

/** A name or an ID as a phrase quotes it. */
const quoted = (text: string): string => `'${text}'`;

/**
 * A bundle by its manifest's `name`, else its `id`, else as the anonymous
 * bundle. Takes the two members alone, so a manifest not yet held by a block
 * (the one an `add` carries) is worded the same way.
 */
export function bundleWords(manifest: {
  readonly name?: string | null;
  readonly id?: string | null;
}): string {
  const name = manifest.name ?? manifest.id;
  return name === null || name === undefined ? "the anonymous bundle" : `bundle ${quoted(name)}`;
}

/** The block `block` by its bundle, or by its ID when the view does not hold it. */
function blockWords(view: View, block: BlockId): string {
  const held = view.blocks[block];
  return held === undefined ? `block ${quoted(block)}` : bundleWords(held.manifest);
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
      return { words: bundleWords(resolved.block.manifest), bundled: true };
    case "title":
      return { words: `the title of ${bundleWords(resolved.block.manifest)}`, bundled: true };
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
    case "timestamp": {
      const { name, id } = resolved.timestamp;
      return { words: `timestamp ${quoted(name ?? id)}`, bundled: false };
    }
    case "elision": {
      const { name, id } = resolved.elision;
      return { words: `elision ${quoted(name ?? id)}`, bundled: false };
    }
    case "matchstamp":
      return { words: `MatchStamp ${quoted(resolved.matchstamp.name)}`, bundled: false };
    case "anchor":
      return { words: `alignment anchor ${quoted(resolved.anchor.id)}`, bundled: false };
    case "flow_map": {
      const { name, id } = resolved.flowMap;
      return { words: `FlowMap ${quoted(name ?? id)}`, bundled: false };
    }
    case "virtual_timeline":
    case "virtual_card":
    case "virtual_band": {
      const { name, id } = resolved.virtual;
      const virtual = `virtual timeline ${quoted(name ?? id)}`;
      if (resolved.kind === "virtual_timeline") return { words: virtual, bundled: false };
      const part = resolved.kind === "virtual_card" ? "card" : `${facetWord(resolved.facet)} band`;
      return { words: `the ${part} of ${virtual}`, bundled: false };
    }
    case "chunk": {
      const line = elementWords({ ...resolved.line, block: resolved.block });
      return { words: `chunk ${resolved.chunk + 1} of ${line.words}`, bundled: false };
    }
    case "chunk_band": {
      const line = elementWords({ ...resolved.line, block: resolved.block });
      const chunk = `chunk ${resolved.chunk + 1} of ${line.words}`;
      return { words: `the ${facetWord(resolved.facet)} band of ${chunk}`, bundled: false };
    }
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
 * coordinate of timestamp 'Downbeat'`, a bundle's or a group's name its
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
  /**
   * Every timeline's ID mapped to the IDs from its root down to itself; a
   * virtual timeline's to itself alone.
   */
  readonly ancestry: ReadonlyMap<string, readonly string[]>;
  /**
   * Every timeline's, virtual timeline's, entry's, named timestamp's and stored elision's ID,
   * mapped to the timeline it belongs to.
   */
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
      ancestry ??= memberAncestry(manifest);
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

/**
 * Every timeline's and virtual timeline's ID mapped to itself, every
 * entry's ID to the timeline holding it and every named timestamp's and
 * stored elision's to the timeline it lies on.
 */
function ownersOf(manifest: Manifest): ReadonlyMap<string, string> {
  const owners = new Map<string, string>();
  for (const [id, found] of catalogueOf(manifest)) {
    if (
      found.kind === "timeline" ||
      found.kind === "entry" ||
      found.kind === "timestamp" ||
      found.kind === "elision"
    ) {
      owners.set(id, found.at.timeline.id);
    } else if (found.kind === "virtual_timeline") owners.set(id, id);
  }
  return owners;
}
