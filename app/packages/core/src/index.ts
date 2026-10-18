/**
 * The framework-free TiLiE core has three distinct layers: a workspace view
 * holds blocks, a block adds canvas placement to its own manifest, and the
 * manifest is one TimeSkeleton manifest (root timelines, optionally grouped)
 * without canvas knowledge. The
 * workspace changes only through the four commands `add`, `set`, `remove` and
 * `style`, journalled by the store.
 */

export const name = "@timetoalign/tilie-core" as const;

/** The keys of a manifest its schema does not declare, kept and written back, shown as warnings. */
export { type UnknownKey, unknownKeys } from "@timetoalign/timeskeleton";
export { apply, applyParsed, embedStatement } from "./commands/apply.ts";
export { parseCommand } from "./commands/parse.ts";
export type {
  AddCommand,
  AddKind,
  Change,
  Command,
  CommandType,
  RemoveCommand,
  SetCommand,
  StyleCommand,
} from "./commands/types.ts";
export { ADD_KINDS, COMMAND_TYPES } from "./commands/types.ts";
export type { CommandError, LoadError, Problem } from "./errors.ts";
export { ErrorCode, InvalidManifestError, isCommandError, isLoadError } from "./errors.ts";
export type { Json, JsonArray, JsonObject, PathSegment } from "./json.ts";
export { contains } from "./manifest/contains.ts";
export type { Domain, ElementKey, Modality, TimelineClass } from "./manifest/elements.ts";
export {
  BLOCK_KEY,
  elementKey,
  manifestElements,
  orderedChildren,
  selectorMatches,
  textKey,
  timelineAncestry,
  timelineClass,
  unitDomain,
  unownedKey,
} from "./manifest/elements.ts";
export type {
  Ancestor,
  EntryKind,
  GroupFrame,
  ListedElement,
  MemberDrawing,
  MemberDrawings,
  RootPath,
} from "./manifest/files.ts";
export {
  elementAddress,
  elementOf,
  elementOfIn,
  findEntry,
  findTimeline,
  isNamed,
  memberDrawings,
  PART_WORDS,
  rootPaths,
  TITLE_ADDRESS,
} from "./manifest/files.ts";
export {
  allowedNumberTypes,
  axisProblems,
  checkManifest,
  childEnd,
  contentEnd,
  isProblem,
  lengthOf,
  readOnAxis,
} from "./manifest/invariants.ts";
export type { SaveOptions } from "./manifest/io.ts";
export {
  loadManifest,
  manifestProblems,
  readManifestValue,
  saveManifest,
  schemaProblems,
} from "./manifest/io.ts";
export type { Gap, GapOption, GapSide, GapVerb } from "./manifest/remove.ts";
export {
  GAP_SIDES,
  GAP_VERBS,
  GAPS,
  isSegment,
  movedBy,
  removedBy,
  segmentGaps,
  withoutElements,
  withoutSegment,
} from "./manifest/remove.ts";
export type {
  AxisValue,
  Break,
  ConversionMap,
  FlowControl,
  Group,
  Jump,
  Manifest,
  ManifestGraphical,
  Marker,
  Region,
  TimelineManifest,
} from "./manifest/types.ts";
export type { Coordinate, CoordinateValue } from "./number/coordinate.ts";
export {
  AxisMismatchError,
  addCoordinates,
  axisCoordinate,
  CoordinateError,
  compareCoordinates,
  coordinatesEqual,
  readAxisValue,
  subtractCoordinates,
  toAxisValue,
} from "./number/coordinate.ts";
export type { IntegerInput, RationalInput } from "./number/rational.ts";
export { Rational } from "./number/rational.ts";
export type { Real } from "./number/real.ts";
export { addReal, compareReal, fromFloat, realOf, toFloat } from "./number/real.ts";
export { isBandOrder } from "./values.ts";
export type {
  BandGroup,
  BandOrder,
  Block,
  BlockId,
  BlockPlacement,
  Place,
} from "./workspace/blocks.ts";
export {
  BAND_GROUPS,
  BLOCK_ID,
  CARD_MEMBERS,
  cardKeys,
  itemKeys,
  PLACE_MEMBERS,
} from "./workspace/blocks.ts";
export { readWorkspace, writeWorkspace } from "./workspace/file.ts";
export { sideEffect } from "./workspace/guard.ts";
export type { Address, ParsedAddress, TimelinePrefix } from "./workspace/ids.ts";
export {
  formatAddress,
  manifestIds,
  mintBlockId,
  nextId,
  parseAddress,
  TIMELINE_PREFIX,
  WORKSPACE,
} from "./workspace/ids.ts";
export { indexBetween, indicesBetween, isIndex } from "./workspace/order.ts";
export type {
  CommandEntry,
  EditorKind,
  Entry,
  ListedEntry,
  OpenEditor,
  Session,
  SessionEntry,
  SessionId,
} from "./workspace/sessions.ts";
export {
  editorKindOf,
  isSessionEntry,
  listEntries,
  mintSessionId,
} from "./workspace/sessions.ts";
export type { Store, StoreOptions, Workspace } from "./workspace/store.ts";
export { createStore, DEFAULT_AUTHOR, replay } from "./workspace/store.ts";
export type { View, WorkspaceMeta, WorkspaceSettings } from "./workspace/view.ts";
export {
  checkWorkspace,
  createView,
  DEFAULT_SETTINGS,
  WORKSPACE_META,
} from "./workspace/view.ts";
