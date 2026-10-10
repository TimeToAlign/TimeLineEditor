/**
 * The command vocabulary: every edit of a document is one of these plain
 * JSON objects, discriminated by `type`. A timeline is addressed by its id,
 * a region or marker by its name, a conversion map by its id, a break or a
 * jump by its full value; never by an array index.
 */

import type { NumberType, TimelineClass, TimeUnit } from "@timetoalign/timeskeleton";
import type { Break, ConversionMap, Jump } from "../document/types.ts";
import type { JsonObject } from "../json.ts";
import type { CoordinateDict } from "../number/coordinate.ts";

/** A timeline to create. Its class, unit and number type never change afterwards. */
export type NewTimeline = {
  readonly id: string;
  readonly class: TimelineClass;
  readonly unit: TimeUnit;
  readonly number_type: NumberType;
  readonly length: CoordinateDict;
  readonly name?: string | null;
};

export type CreateTimeline = { readonly type: "createTimeline" } & NewTimeline;
/** Remove a root timeline and everything nested in it. */
export type RemoveTimeline = { readonly type: "removeTimeline"; readonly id: string };
export type SetName = {
  readonly type: "setName";
  readonly id: string;
  readonly name: string | null;
};
export type SetLength = {
  readonly type: "setLength";
  readonly id: string;
  readonly length: CoordinateDict;
};
/**
 * Nest a timeline under `parent` at `offset`: a new one, or an existing root
 * named by its id. The child is locked, as timetoalign locks it.
 */
export type AddChild = {
  readonly type: "addChild";
  readonly parent: string;
  readonly offset: CoordinateDict;
  readonly child: string | NewTimeline;
};
export type SetChildOffset = {
  readonly type: "setChildOffset";
  readonly id: string;
  readonly offset: CoordinateDict;
};
/** Remove a nested timeline and everything nested in it. */
export type RemoveChild = { readonly type: "removeChild"; readonly id: string };
export type AddRegion = {
  readonly type: "addRegion";
  readonly timeline: string;
  readonly name: string;
  readonly start: CoordinateDict;
  readonly end: CoordinateDict;
  readonly meta?: JsonObject;
};
/** Change a region's start, end or meta; at least one is given. */
export type SetRegion = {
  readonly type: "setRegion";
  readonly timeline: string;
  readonly name: string;
  readonly start?: CoordinateDict;
  readonly end?: CoordinateDict;
  readonly meta?: JsonObject;
};
export type RemoveRegion = {
  readonly type: "removeRegion";
  readonly timeline: string;
  readonly name: string;
};
export type AddBreak = {
  readonly type: "addBreak";
  readonly timeline: string;
  readonly break: Break;
};
/** Remove the first break equal to `break`, in canonical order. */
export type RemoveBreak = {
  readonly type: "removeBreak";
  readonly timeline: string;
  readonly break: Break;
};
export type AddJump = { readonly type: "addJump"; readonly timeline: string; readonly jump: Jump };
/** Remove the first jump equal to `jump`, in canonical order. */
export type RemoveJump = {
  readonly type: "removeJump";
  readonly timeline: string;
  readonly jump: Jump;
};
/** Add a marker, or move an existing one. */
export type SetMarker = {
  readonly type: "setMarker";
  readonly timeline: string;
  readonly name: string;
  readonly coordinate: CoordinateDict;
};
export type RemoveMarker = {
  readonly type: "removeMarker";
  readonly timeline: string;
  readonly name: string;
};
/** Attach a conversion map; the payload is carried verbatim. */
export type AddConversionMap = {
  readonly type: "addConversionMap";
  readonly timeline: string;
  readonly map: ConversionMap;
};
export type RemoveConversionMap = {
  readonly type: "removeConversionMap";
  readonly timeline: string;
  readonly map_id: string;
};

export type Command =
  | CreateTimeline
  | RemoveTimeline
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

export type CommandType = Command["type"];

/** Every command type, in the order of the vocabulary. */
export const COMMAND_TYPES = [
  "createTimeline",
  "removeTimeline",
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
] as const satisfies readonly CommandType[];
