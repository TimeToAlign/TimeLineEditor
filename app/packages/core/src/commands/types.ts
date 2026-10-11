/** Every serializable command understood by the workspace reducer. */

import type {
  Colour,
  NumberType,
  StyleRules,
  TimelineClass,
  TimeUnit,
} from "@timetoalign/timeskeleton";
import type { JsonObject } from "../json.ts";
import type { Break, ConversionMap, Jump, Manifest } from "../manifest/types.ts";
import type { CoordinateDict } from "../number/coordinate.ts";
import type { Margins, NameColumn, RecordId } from "../workspace/records.ts";
import type { WorkspaceSettings } from "../workspace/view.ts";

export type NewTimeline = {
  readonly id: string;
  readonly class: TimelineClass;
  readonly unit: TimeUnit;
  readonly number_type: NumberType;
  readonly length: CoordinateDict;
  readonly name?: string | null;
};

interface InBlock {
  readonly block: RecordId;
}

export type SetName = InBlock & {
  readonly type: "setName";
  readonly id: string;
  readonly name: string | null;
};
export type SetLength = InBlock & {
  readonly type: "setLength";
  readonly id: string;
  readonly length: CoordinateDict;
};
export type AddChild = InBlock & {
  readonly type: "addChild";
  readonly parent: string;
  readonly offset: CoordinateDict;
  readonly child: NewTimeline;
};
export type SetChildOffset = InBlock & {
  readonly type: "setChildOffset";
  readonly id: string;
  readonly offset: CoordinateDict;
};
export type RemoveChild = InBlock & { readonly type: "removeChild"; readonly id: string };
export type AddRegion = InBlock & {
  readonly type: "addRegion";
  readonly timeline: string;
  readonly name: string;
  readonly start: CoordinateDict;
  readonly end: CoordinateDict;
  readonly meta?: JsonObject;
};
export type SetRegion = InBlock & {
  readonly type: "setRegion";
  readonly timeline: string;
  readonly name: string;
  readonly start?: CoordinateDict;
  readonly end?: CoordinateDict;
  readonly meta?: JsonObject;
};
export type RemoveRegion = InBlock & {
  readonly type: "removeRegion";
  readonly timeline: string;
  readonly name: string;
};
export type AddBreak = InBlock & {
  readonly type: "addBreak";
  readonly timeline: string;
  readonly break: Break;
};
export type RemoveBreak = InBlock & {
  readonly type: "removeBreak";
  readonly timeline: string;
  readonly break: Break;
};
export type AddJump = InBlock & {
  readonly type: "addJump";
  readonly timeline: string;
  readonly jump: Jump;
};
export type RemoveJump = InBlock & {
  readonly type: "removeJump";
  readonly timeline: string;
  readonly jump: Jump;
};
export type SetMarker = InBlock & {
  readonly type: "setMarker";
  readonly timeline: string;
  readonly name: string;
  readonly coordinate: CoordinateDict;
};
export type RemoveMarker = InBlock & {
  readonly type: "removeMarker";
  readonly timeline: string;
  readonly name: string;
};
export type AddConversionMap = InBlock & {
  readonly type: "addConversionMap";
  readonly timeline: string;
  readonly map: ConversionMap;
};
export type RemoveConversionMap = InBlock & {
  readonly type: "removeConversionMap";
  readonly timeline: string;
  readonly map_id: string;
};

export type ManifestCommand =
  | SetName
  | SetLength
  | AddChild
  | SetChildOffset
  | RemoveChild
  | AddRegion
  | SetRegion
  | RemoveRegion
  | AddBreak
  | RemoveBreak
  | AddJump
  | RemoveJump
  | SetMarker
  | RemoveMarker
  | AddConversionMap
  | RemoveConversionMap;

export type CreateBlock = {
  readonly type: "createBlock";
  readonly id: RecordId;
  readonly manifest: Manifest;
  readonly x: number;
  readonly y: number;
  readonly scale?: number;
  readonly zoom?: number;
};
export type MoveRecords = {
  readonly type: "moveRecords";
  readonly moves: readonly { readonly id: RecordId; readonly x: number; readonly y: number }[];
};
export type ResizeRecord = {
  readonly type: "resizeRecord";
  readonly id: RecordId;
  readonly scale: number;
};
export type SetRecordProperties = {
  readonly type: "setRecordProperties";
  readonly id: RecordId;
  readonly properties: {
    readonly zoom?: number;
    readonly margins?: Margins;
    readonly background?: Colour | null;
    readonly nameColumn?: NameColumn;
    readonly overrides?: StyleRules;
  };
};
export type SetIndex = {
  readonly type: "setIndex";
  readonly id: RecordId;
  readonly index: string;
};
export type DeleteRecords = {
  readonly type: "deleteRecords";
  readonly ids: readonly RecordId[];
};
export type SetSettings = {
  readonly type: "setSettings";
  readonly settings: {
    readonly styles?: StyleRules;
    readonly blockDefaults?: Partial<WorkspaceSettings["blockDefaults"]>;
    readonly grid?: Partial<WorkspaceSettings["grid"]>;
  };
};
export type SetBlockManifest = {
  readonly type: "setBlockManifest";
  readonly block: RecordId;
  readonly manifest: Manifest;
};

export type RecordCommand =
  | CreateBlock
  | MoveRecords
  | ResizeRecord
  | SetRecordProperties
  | SetIndex
  | DeleteRecords
  | SetSettings
  | SetBlockManifest;

export type Command = RecordCommand | ManifestCommand;
export type CommandType = Command["type"];

export const RECORD_COMMAND_TYPES = [
  "createBlock",
  "moveRecords",
  "resizeRecord",
  "setRecordProperties",
  "setIndex",
  "deleteRecords",
  "setSettings",
  "setBlockManifest",
] as const satisfies readonly RecordCommand["type"][];

export const MANIFEST_COMMAND_TYPES = [
  "setName",
  "setLength",
  "addChild",
  "setChildOffset",
  "removeChild",
  "addRegion",
  "setRegion",
  "removeRegion",
  "addBreak",
  "removeBreak",
  "addJump",
  "removeJump",
  "setMarker",
  "removeMarker",
  "addConversionMap",
  "removeConversionMap",
] as const satisfies readonly ManifestCommand["type"][];

export const COMMAND_TYPES = [
  ...RECORD_COMMAND_TYPES,
  ...MANIFEST_COMMAND_TYPES,
] as const satisfies readonly CommandType[];

export type BlockProperties = SetRecordProperties["properties"];
