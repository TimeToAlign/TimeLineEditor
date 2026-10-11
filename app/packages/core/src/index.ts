/**
 * The framework-free TiLiE core has three distinct layers: a workspace view
 * holds records, a block record adds canvas placement and properties, and its
 * manifest holds one TimeSkeleton timeline without canvas knowledge.
 */

export const name = "@timetoalign/tilie-core" as const;

export { applyToManifest } from "./commands/apply.ts";
export { parseCommand } from "./commands/parse.ts";
export type {
  AddBreak,
  AddChild,
  AddConversionMap,
  AddJump,
  AddRegion,
  BlockProperties,
  Command,
  CommandType,
  CreateBlock,
  DeleteRecords,
  ManifestCommand,
  MoveRecords,
  NewTimeline,
  RecordCommand,
  RemoveBreak,
  RemoveChild,
  RemoveConversionMap,
  RemoveJump,
  RemoveMarker,
  RemoveRegion,
  ResizeRecord,
  SetBlockManifest,
  SetChildOffset,
  SetIndex,
  SetLength,
  SetMarker,
  SetName,
  SetRecordProperties,
  SetRegion,
  SetSettings,
} from "./commands/types.ts";
export {
  COMMAND_TYPES,
  MANIFEST_COMMAND_TYPES,
  RECORD_COMMAND_TYPES,
} from "./commands/types.ts";
export type { CommandError, LoadError, Problem } from "./errors.ts";
export { ErrorCode, InvalidManifestError, isCommandError, isLoadError } from "./errors.ts";
export type { Json, JsonArray, JsonObject, PathSegment } from "./json.ts";
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
  saveManifest,
  schemaProblems,
} from "./manifest/io.ts";
export type {
  Break,
  ChildEntry,
  ConversionMap,
  FlowControl,
  Jump,
  Manifest,
  ManifestMeta,
  Region,
  TimelineManifest,
} from "./manifest/types.ts";
export { TIMELINE_KEYS } from "./manifest/types.ts";
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
export { apply } from "./workspace/commands.ts";
export type { Address, TimelinePrefix } from "./workspace/ids.ts";
export {
  formatAddress,
  mintRecordId,
  mintTimelineId,
  parseAddress,
  RECORD_ID,
  TIMELINE_PREFIX,
} from "./workspace/ids.ts";
export { indexBetween, indicesBetween, isIndex } from "./workspace/order.ts";
export type {
  BlockRecord,
  CanvasStyle,
  ConnectorEnd,
  ConnectorRecord,
  GroupRecord,
  ImageRecord,
  LockEnd,
  LockRecord,
  Margins,
  NameColumn,
  RecordBase,
  RecordId,
  RecordKind,
  ShapeRecord,
  TextRecord,
  WorkspaceRecord,
} from "./workspace/records.ts";
export type {
  BlockDefaults,
  View,
  WorkspaceMeta,
  WorkspaceSettings,
} from "./workspace/view.ts";
export { checkWorkspace, createView, DEFAULT_SETTINGS } from "./workspace/view.ts";
