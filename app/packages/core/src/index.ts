/**
 * The framework-free TiLiE core has three distinct layers: a workspace view
 * holds blocks, a block adds canvas placement to its own manifest, and the
 * manifest is one TimeToShare manifest (root timelines, optionally grouped)
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

export type { ManifestWarning, UnknownKey } from "@timetoalign/timetoshare";
export { apply } from "./commands/apply.ts";
export type { AnchorValue } from "./commands/matchstamps.ts";
export { matchStampSpec, namedAsGroupstamp } from "./commands/matchstamps.ts";
export { preview } from "./commands/preview.ts";
export {
  groupstampByDefault,
  importedManifest,
  isGroupMember,
} from "./commands/timestamps.ts";
export type {
  AddCommand,
  AddKind,
  Change,
  Command,
  RemoveCommand,
  SetCommand,
  StyleCommand,
} from "./commands/types.ts";
export { ADD_KINDS } from "./commands/types.ts";
export type { CommandError, LoadError, Problem } from "./errors.ts";
export {
  assertNever,
  ErrorCode,
  InvalidManifestError,
  isCommandError,
  isLoadError,
  JournalMismatchError,
} from "./errors.ts";
export type { Json, PathSegment } from "./json.ts";
export { canonicalText, compareCodePoints } from "./json.ts";
export type { ElementAddress, Facet, OwnerAddress, Part } from "./manifest/address.ts";
export {
  addressKey,
  BUNDLE_ADDRESS,
  bandAddress,
  cardAddress,
  FACETS,
  idAddress,
  isFacet,
  partAddress,
  sameAddress,
  TITLE_ADDRESS,
} from "./manifest/address.ts";
export type {
  AncestorCardRef,
  CardPlace,
  ContainerDescriptor,
  ContainerKind,
  ContainerLevel,
  ContainerRef,
  Containers,
  Holding,
  ItemPlace,
  Place,
  PlaceKey,
  Places,
} from "./manifest/containers.ts";
export {
  CARD_PLACE_MEMBERS,
  CONTAINERS,
  containersOf,
  holdingOf,
  ITEM_PLACE_MEMBERS,
  placeAt,
  placedContainer,
  placedElement,
  placeEntries,
  placeKeyText,
  placeMembersOf,
  samePlaceKey,
  withPlaceAt,
} from "./manifest/containers.ts";
export { contains } from "./manifest/contains.ts";
export { groupsHolding } from "./manifest/elements.ts";
export type { EntryKind, ListedElement } from "./manifest/files.ts";
export { isNamed } from "./manifest/files.ts";
export type { ReadManifestFile } from "./manifest/io.ts";
export {
  idFormPath,
  loadManifest,
  manifestFileValue,
  manifestWarnings,
  NEW_MANIFEST_FILE,
  normalizeManifest,
  readManifestFile,
  saveManifest,
  unknownKeys,
  withHeldIds,
} from "./manifest/io.ts";
export type { BandOrderEntry } from "./manifest/order.ts";
export {
  bandOrderOf,
  DEFAULT_BAND_ORDER,
  displayOrder,
  inheritedBandOrder,
  LINE,
} from "./manifest/order.ts";
export { removedBy } from "./manifest/remove.ts";
export type { Gap, GapOption, GapSide, GapVerb } from "./manifest/segments.ts";
export { GAPS } from "./manifest/segments.ts";
export type {
  HolderKind,
  Skeleton,
  SkeletonRegion,
  SkeletonTimeline,
  StatementHolder,
} from "./manifest/statements.ts";
export {
  skeletonOf,
  statementHolder,
  statementHolders,
  withoutReferencesTo,
  withStatementContext,
} from "./manifest/statements.ts";
export { findTimeline } from "./manifest/tree.ts";
export type {
  AlignmentAnchor,
  AnchorDisplay,
  AxisValue,
  ChildTimeline,
  ConversionMap,
  FlowControlElement,
  Group,
  Manifest,
  ManifestGraphical,
  MeasureMap,
  NamedMatchStamp,
  NamedTimestamp,
  ProvenanceEntry,
  Region,
  Statements,
  TimelineManifest,
  TimestampDisplay,
} from "./manifest/types.ts";
export type { CompileContext, MapEvaluator } from "./maps/compile.ts";
export { compileMap } from "./maps/compile.ts";
export type { Expressed, ExpressedNumber, ExpressedOutputs } from "./maps/express.ts";
export { express } from "./maps/express.ts";
export type { InversionContext } from "./maps/invert.ts";
export { invert, invertible } from "./maps/invert.ts";
export type {
  CrossSectionMember,
  CrossSectionSpec,
  Knots,
  KnotsAbsence,
  Pin,
  Row,
  TimelineAxis,
  Timestamp,
  TimestampMap,
  TimestampPart,
  TimestampRow,
} from "./maps/timestamp.ts";
export {
  ancestorMembers,
  measureText,
  pinAt,
  positionFor,
  snapOnRow,
  timelineAxisOf,
  timestampAt,
  timestampJson,
  timestampRows,
} from "./maps/timestamp.ts";
export type {
  MapInput,
  MapOutputs,
  MapResult,
  MapValue,
  MeasureKnot,
  MeasureKnots,
  MeasureRecord,
  QuarterPair,
} from "./maps/values.ts";
export type {
  AnchorIndex,
  Anchors,
  Coordinates,
  MatchedSpans,
  Neighbours,
  PotentialMatchStamps,
  Segments,
} from "./matches/anchors.ts";
export {
  anchorIndexOf,
  claimRowsOf,
  coordinateNear,
  coordinateOf,
  coordinatesWithin,
  coordinateValue,
  matchStampAnchors,
  matchStampMembers,
  segmentsOf,
} from "./matches/anchors.ts";
export type { AnchorBelief, BeliefState, ClaimBeliefs } from "./matches/beliefs.ts";
export {
  ANCHOR_BELIEFS,
  actorIri,
  anchorBelief,
  BELIEF_STATES,
  BELIEFS,
  beliefMask,
  believedBy,
  DEFAULT_BELIEFS,
} from "./matches/beliefs.ts";
export type {
  ClaimSide,
  ClaimTimeline,
  ClaimValues,
  MatchClaimColumns,
  ValueColumn,
} from "./matches/columns.ts";
export { checkColumns, claimRowOf, matchClaimColumns } from "./matches/columns.ts";
export type {
  MatchStampCheck,
  MatchStampUpdate,
  NamedAnchor,
  NamedCoordinate,
  NamedMatchStampSpec,
} from "./matches/compare.ts";
export { checkMatchStamp } from "./matches/compare.ts";
export type { Coordinate } from "./number/coordinate.ts";
export type { CoordinateDict } from "./number/display.ts";
export {
  coordinateDict,
  copyValue,
  prettyText,
  prettyUnit,
  rawText,
} from "./number/display.ts";
export { parseAxisValue } from "./number/parse.ts";
export type { Real } from "./number/real.ts";
export type {
  Address,
  ManifestIndex,
  ResolvedAddress,
  ResolvedElement,
} from "./workspace/address.ts";
export {
  addressWords,
  bundleWords,
  elementAddressOf,
  entryWord,
  facetWord,
  inBlock,
  indexOf,
  isElementAddress,
  manifestIds,
  readAddress,
  resolveAddress,
  resolveElement,
  WORKSPACE,
} from "./workspace/address.ts";
export type { Block, BlockId } from "./workspace/blocks.ts";
export { emptyWorkspace, readWorkspace, writeWorkspace } from "./workspace/file.ts";
export { mintBlockId, nextId } from "./workspace/ids.ts";
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
export type { SettingsChange, Store, StoreOptions, Workspace } from "./workspace/store.ts";
export { createStore } from "./workspace/store.ts";
export type { User } from "./workspace/user.ts";
export { DEFAULT_USER, readOrcid, statedBy, TILIE_AGENT, USER_TAG } from "./workspace/user.ts";
export type {
  Granularity,
  ManifestFile,
  MatchClaimFilter,
  View,
  WorkspaceSettings,
} from "./workspace/view.ts";
export {
  createView,
  DEFAULT_GRANULARITY,
  DEFAULT_MATCH_CLAIM_FILTER,
  isRelativeLocation,
  manifestFileOf,
  matchClaimFilterOf,
  UNTITLED_WORKSPACE,
} from "./workspace/view.ts";
