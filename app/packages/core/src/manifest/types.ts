/**
 * One TimeSkeleton manifest of the current schema version, held losslessly
 * in its complete form: every key with a default is present, its default
 * written out, so a reader never supplies one. Unknown keys are kept as they
 * were read; every copy spreads the value it changes.
 */

import type {
  Break as BreakValue,
  ConversionMap as ConversionMapValue,
  Graphical,
  Group as GroupValue,
  JsonNumber,
  Jump as JumpValue,
  Lossless,
  Marker as MarkerValue,
  Region as RegionValue,
  Timeline,
  TimeSkeleton,
  TimeUnit,
} from "@timetoalign/timeskeleton";
import type { JsonObject } from "../json.ts";

/** `T` read losslessly, with the keys `K`, which have defaults, present: its complete form. */
type Complete<T, K extends keyof T> = Readonly<Omit<T, K>> & {
  readonly [P in K]-?: Exclude<T[P], undefined>;
};

/**
 * A value on its timeline's own axis (a length, an offset, a region's start
 * and end, a break, jump or marker coordinate): a JSON integer, a JSON number
 * or a `[numerator, denominator]` pair, as the axis's number type selects.
 */
export type AxisValue = JsonNumber | readonly [number | bigint, number | bigint];

export type Region = Complete<Omit<Lossless<RegionValue>, "start" | "end">, "name" | "meta"> & {
  readonly start: AxisValue;
  readonly end: AxisValue;
};

export type Break = Complete<
  Omit<Lossless<BreakValue>, "coordinate">,
  "control_type" | "condition" | "repeat_count" | "label" | "name" | "meta"
> & { readonly coordinate: AxisValue };

export type Jump = Complete<
  Omit<Lossless<JumpValue>, "from_coordinate" | "to_coordinate">,
  "control_type" | "condition" | "repeat_count" | "target" | "label" | "meta"
> & { readonly from_coordinate: AxisValue; readonly to_coordinate: AxisValue };

export type Marker = Complete<Omit<Lossless<MarkerValue>, "coordinate">, "name"> & {
  readonly coordinate: AxisValue;
};

export type FlowControl = {
  readonly breaks: readonly Break[];
  readonly jumps: readonly Jump[];
  readonly markers: readonly Marker[];
};

/** A conversion map payload, carried verbatim; its coordinates are coordinate dicts. */
export type ConversionMap = JsonObject & {
  readonly type: ConversionMapValue["type"];
  readonly id: string;
  readonly name: string | null;
  readonly source_unit?: TimeUnit | null;
  readonly target_unit?: TimeUnit | null;
  /** The timeline a map between two timelines maps from, and to. */
  readonly source_id?: string;
  readonly target_id?: string;
};

export type TimelineManifest = Complete<
  Omit<
    Lossless<Timeline>,
    "length" | "offset" | "children" | "conversion_maps" | "regions" | "flow_control"
  >,
  | "name"
  | "number_type"
  | "locked"
  | "is_segment_line"
  | "meta"
  | "measure_map"
  | "metric_hierarchy"
> & {
  /** Its length on its own axis, or null when the length is not known. */
  readonly length: AxisValue | null;
  /**
   * A child's offset on its parent's axis; a root's, when present, places
   * the root's origin on its own axis and may be negative.
   */
  readonly offset?: AxisValue;
  /** Its child timelines, each carrying its offset, in offset order, ties by id. */
  readonly children: readonly TimelineManifest[];
  readonly conversion_maps: readonly ConversionMap[];
  readonly regions: readonly Region[];
  readonly flow_control: FlowControl;
};

/** A timeline group: the timelines of the manifest it names, roots or descendants. */
export type Group = Complete<Lossless<GroupValue>, "name" | "meta">;

/** A manifest's styling and its groups' display order, owned by the manifest, never by a canvas. */
export type ManifestGraphical = Graphical;

/**
 * A TimeSkeleton manifest: its root timelines, optionally grouped. With an
 * `id` or a `name` it is named, without both anonymous.
 */
export type Manifest = Complete<
  Omit<Lossless<TimeSkeleton>, "timelines" | "groups" | "graphical">,
  "name" | "meta"
> & {
  readonly timelines: readonly TimelineManifest[];
  readonly groups: readonly Group[];
  readonly graphical?: ManifestGraphical;
};
