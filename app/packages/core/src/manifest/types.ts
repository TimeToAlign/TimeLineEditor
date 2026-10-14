/**
 * One TimeSkeleton manifest of the latest schema version, held losslessly
 * member by member: a timeline file, a group file or a bundle file.
 */

import type {
  Bundle,
  BundleGraphical,
  Graphical,
  Group,
  GroupGraphical,
  JsonNumber,
  NumberType,
  TimelineClass,
  TimeUnit,
} from "@timetoalign/timeskeleton";
import type { JsonObject } from "../json.ts";
import type { CoordinateDict } from "../number/coordinate.ts";

export type Region = {
  readonly id: string;
  readonly name: string | null;
  readonly start: CoordinateDict;
  readonly end: CoordinateDict;
  readonly meta: JsonObject;
};

export type Break = {
  readonly id: string;
  readonly coordinate: CoordinateDict;
  readonly control_type: string;
  readonly condition: string;
  readonly repeat_count: JsonNumber;
  readonly label: string | null;
  readonly name: string | null;
  readonly meta: JsonObject;
};

export type Jump = {
  readonly id: string;
  readonly from_coordinate: CoordinateDict;
  readonly to_coordinate: CoordinateDict;
  readonly control_type: string;
  readonly condition: string;
  readonly repeat_count: JsonNumber;
  /** The id of a marker of the same timeline, or null. */
  readonly target: string | null;
  readonly label: string | null;
  readonly meta: JsonObject;
};

export type Marker = {
  readonly id: string;
  readonly name: string | null;
  readonly coordinate: CoordinateDict;
};

export type FlowControl = {
  readonly breaks: readonly Break[];
  readonly jumps: readonly Jump[];
  readonly markers: readonly Marker[];
};

/** A conversion map payload, carried verbatim. */
export type ConversionMap = JsonObject & {
  readonly type: string;
  readonly id: string;
  readonly source_unit: TimeUnit | null;
};

export type ChildEntry = {
  readonly offset: CoordinateDict;
  readonly timeline: TimelineManifest;
};

export type TimelineManifest = {
  readonly id: string;
  readonly name: string | null;
  readonly class: TimelineClass;
  readonly unit: TimeUnit;
  readonly number_type: NumberType;
  readonly length: CoordinateDict;
  readonly locked: boolean;
  /** Whether its children are contiguous segments, drawn on its own line. */
  readonly is_segment_line: boolean;
  readonly meta: JsonObject;
  readonly children: { readonly [id: string]: ChildEntry };
  readonly conversion_maps: readonly ConversionMap[];
  readonly regions: readonly Region[];
  readonly flow_control: FlowControl;
  readonly measure_map: readonly JsonObject[] | null;
  readonly metric_hierarchy: JsonObject | null;
};

export type ManifestMeta = {
  readonly schema_version: string;
  readonly generator?: string;
};

/** A timeline file: one timeline with all its descendants. */
export type TimelineFile = {
  readonly meta: ManifestMeta;
  readonly timeline: TimelineManifest;
  /** Styling owned by this manifest's elements, never by the canvas. */
  readonly graphical?: Graphical;
};

/** A group file: one timeline group and the root timelines holding its members. */
export type GroupFile = {
  readonly meta: ManifestMeta;
  /** The root timelines, sorted by id; each is a member or contains one. */
  readonly timelines: readonly TimelineManifest[];
  readonly group: Group;
  /** The members' display order and the styling of the file's elements. */
  readonly graphical?: GroupGraphical;
};

/** A bundle file: one alignment bundle, its groups and every root timeline. */
export type BundleFile = {
  readonly meta: ManifestMeta;
  /** Every root timeline of the bundle, sorted by id. */
  readonly timelines: readonly TimelineManifest[];
  readonly bundle: Bundle;
  /** Each group's display order and the styling of the file's elements. */
  readonly graphical?: BundleGraphical;
};

/** A manifest of any of the three file kinds; `manifestKind` tells which. */
export type Manifest = TimelineFile | GroupFile | BundleFile;
