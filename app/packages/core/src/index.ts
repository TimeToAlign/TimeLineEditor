/**
 * @timetoalign/tilie-core: the editable TimeSkeleton document.
 *
 * Exact numbers, validated load and save, and the command vocabulary as
 * pure reducers. The Yjs binding is the separate entry point
 * `@timetoalign/tilie-core/yjs`; nothing here imports Yjs.
 */

export const name = "@timetoalign/tilie-core" as const;

export { apply } from "./commands/apply.ts";
export { parseCommand } from "./commands/parse.ts";
export type {
  AddBreak,
  AddChild,
  AddConversionMap,
  AddJump,
  AddRegion,
  Command,
  CommandType,
  CreateTimeline,
  NewTimeline,
  RemoveBreak,
  RemoveChild,
  RemoveConversionMap,
  RemoveJump,
  RemoveMarker,
  RemoveRegion,
  RemoveTimeline,
  SetChildOffset,
  SetLength,
  SetMarker,
  SetName,
  SetRegion,
} from "./commands/types.ts";
export { COMMAND_TYPES } from "./commands/types.ts";
export { checkDocument } from "./document/invariants.ts";
export { loadDocument, saveDocument } from "./document/io.ts";
export type {
  Break,
  ChildEntry,
  ConversionMap,
  Document,
  DocumentMeta,
  FlowControl,
  Jump,
  Region,
  TimelineManifest,
} from "./document/types.ts";
export type { CommandError, LoadError, Problem } from "./errors.ts";
export { ErrorCode, InvalidDocumentError, isCommandError, isLoadError } from "./errors.ts";
export type { Json, JsonArray, JsonObject, PathSegment } from "./json.ts";
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
