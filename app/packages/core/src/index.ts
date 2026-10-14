/**
 * The framework-free TiLiE core has three distinct layers: a workspace view
 * holds blocks, a block adds canvas placement to its own manifest, and the
 * manifest is one TimeSkeleton file (a timeline, group or bundle file)
 * without canvas knowledge. The
 * workspace changes only through the four commands `add`, `set`, `remove` and
 * `style`, journalled by the store.
 */

export const name = "@timetoalign/tilie-core" as const;

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
export type { Domain, ElementKey, Modality } from "./manifest/elements.ts";
export {
  BLOCK_KEY,
  classDomain,
  elementKey,
  manifestElements,
  orderedChildren,
  selectorMatches,
  textKey,
  timelineAncestry,
  unitDomain,
  unownedKey,
} from "./manifest/elements.ts";
export type { Ancestor, GroupFrame, MemberDrawing, MemberDrawings } from "./manifest/files.ts";
export {
  elementAddress,
  elementOf,
  elementOfIn,
  isRemovable,
  isRemovableIn,
  manifestGroups,
  manifestKind,
  manifestRoots,
  memberDrawings,
  PART_WORDS,
} from "./manifest/files.ts";
export {
  allowedNumberTypes,
  axisProblems,
  CLASS_UNITS,
  checkManifest,
  childEnd,
  contentEnd,
  isProblem,
  readOnAxis,
} from "./manifest/invariants.ts";
export {
  loadManifest,
  manifestProblems,
  readManifestValue,
  saveManifest,
  schemaProblems,
} from "./manifest/io.ts";
export type {
  Break,
  BundleFile,
  ChildEntry,
  ConversionMap,
  FlowControl,
  GroupFile,
  Jump,
  Manifest,
  ManifestMeta,
  Region,
  TimelineFile,
  TimelineManifest,
} from "./manifest/types.ts";
export type { Coordinate, CoordinateDict, CoordinateValue } from "./number/coordinate.ts";
export {
  AxisMismatchError,
  addCoordinates,
  CoordinateError,
  compareCoordinates,
  coordinateFromDict,
  coordinatesEqual,
  coordinateToDict,
  subtractCoordinates,
} from "./number/coordinate.ts";
export type { IntegerInput, RationalInput } from "./number/rational.ts";
export { Rational } from "./number/rational.ts";
export type { Real } from "./number/real.ts";
export { addReal, compareReal, fromFloat, realOf, toFloat } from "./number/real.ts";
export { isBandOrder } from "./values.ts";
export type { BandGroup, Block, BlockId, BlockKind, BlockPlacement } from "./workspace/blocks.ts";
export { BAND_GROUPS, BLOCK_ID } from "./workspace/blocks.ts";
export { readWorkspace, writeWorkspace } from "./workspace/file.ts";
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
export type { Entry, Store, StoreOptions, Workspace } from "./workspace/store.ts";
export { createStore, DEFAULT_AUTHOR, replay } from "./workspace/store.ts";
export type { View, WorkspaceMeta, WorkspaceSettings } from "./workspace/view.ts";
export {
  checkWorkspace,
  createView,
  DEFAULT_SETTINGS,
  WORKSPACE_META,
} from "./workspace/view.ts";
