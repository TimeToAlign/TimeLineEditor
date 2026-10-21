/**
 * The framework-free TiLiE core has three distinct layers: a workspace view
 * holds blocks, a block adds canvas placement to its own manifest, and the
 * manifest is one TimeSkeleton manifest (root timelines, optionally grouped)
 * without canvas knowledge. The workspace changes only through the four
 * commands `add`, `set`, `remove` and `style`, journalled by the store.
 *
 * This entry point holds what a host and the packages above core use: manifest
 * and workspace I/O, the commands, the store, the address resolver, the
 * container registry, the band and order helpers and the domain types. The
 * drawing's own primitives are `@timetoalign/tilie-core/drawing`; exact-number
 * arithmetic is `@timetoalign/tilie-core/numbers`.
 */

export const name = "@timetoalign/tilie-core" as const;

/** The keys of a manifest its schema does not declare, kept and written back, shown as warnings. */
export { type UnknownKey, unknownKeys } from "@timetoalign/timeskeleton";
export { apply } from "./commands/apply.ts";
export { preview } from "./commands/preview.ts";
export type {
  AddCommand,
  Change,
  Command,
  RemoveCommand,
  SetCommand,
  StyleCommand,
} from "./commands/types.ts";
export { ADD_KINDS } from "./commands/types.ts";
export type { CommandError, LoadError, Problem } from "./errors.ts";
export {
  ErrorCode,
  InvalidManifestError,
  isCommandError,
  isLoadError,
  JournalMismatchError,
} from "./errors.ts";
export type { Json, PathSegment } from "./json.ts";
export type { BandKind } from "./manifest/bands.ts";
export { BAND_KINDS, bandAddress } from "./manifest/bands.ts";
export type {
  CardPlace,
  ContainerDescriptor,
  ContainerKind,
  ContainerLevel,
  ContainerRef,
  Containers,
  Holding,
  ItemPlace,
} from "./manifest/containers.ts";
export {
  CARD_PLACE_MEMBERS,
  CONTAINER_KINDS,
  CONTAINER_LEVELS,
  CONTAINERS,
  containersOf,
  holdingOf,
  ITEM_PLACE_MEMBERS,
  placedElement,
  placeMembersOf,
} from "./manifest/containers.ts";
export { contains } from "./manifest/contains.ts";
export type { EntryKind, ListedElement } from "./manifest/files.ts";
export { isNamed, TITLE_ADDRESS } from "./manifest/files.ts";
export type { SaveOptions } from "./manifest/io.ts";
export { loadManifest, normalizeManifest, saveManifest } from "./manifest/io.ts";
export {
  bandOrderOf,
  defaultBandOrder,
  displayOrder,
  inheritedBandOrder,
} from "./manifest/order.ts";
export { removedBy } from "./manifest/remove.ts";
export type { Gap, GapOption, GapSide, GapVerb } from "./manifest/segments.ts";
export { GAPS } from "./manifest/segments.ts";
export { findTimeline, isSegment } from "./manifest/tree.ts";
export type {
  AxisValue,
  ChildTimeline,
  ConversionMap,
  FlowControlElement,
  Group,
  Manifest,
  ManifestGraphical,
  MeasureMap,
  Region,
  TimelineManifest,
} from "./manifest/types.ts";
export type { Coordinate } from "./number/coordinate.ts";
export type { Real } from "./number/real.ts";
export type {
  Address,
  AddressSyntax,
  ManifestIndex,
  PartWord,
  ResolvedAddress,
  ResolvedElement,
} from "./workspace/address.ts";
export {
  cardAddress,
  cardKey,
  elementAddress,
  elementOf,
  indexOf,
  parseAddressSyntax,
  parseBand,
  partAddress,
  qualify,
  resolveAddress,
  resolveElement,
  WORKSPACE,
} from "./workspace/address.ts";
export type { Block, BlockId } from "./workspace/blocks.ts";
export { emptyWorkspace, readWorkspace, writeWorkspace } from "./workspace/file.ts";
export { manifestIds, mintBlockId } from "./workspace/ids.ts";
export { indexBetween, indicesBetween, isIndex } from "./workspace/order.ts";
export type {
  CommandEntry,
  EditorKind,
  Entry,
  ListedEntry,
  OpenEditor,
  Session,
} from "./workspace/sessions.ts";
export { editorKindOf, isSessionEntry, listEntries } from "./workspace/sessions.ts";
export type { Store, StoreOptions, Workspace } from "./workspace/store.ts";
export { createStore } from "./workspace/store.ts";
export type { View, WorkspaceSettings } from "./workspace/view.ts";
export { createView, UNTITLED_WORKSPACE } from "./workspace/view.ts";
