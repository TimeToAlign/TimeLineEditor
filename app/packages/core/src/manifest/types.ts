/**
 * One schema-0.4.0 TimeSkeleton manifest, held losslessly member by member.
 */

import type {
  Graphical,
  JsonNumber,
  NumberType,
  TimelineClass,
  TimeUnit,
} from "@timetoalign/timeskeleton";
import type { JsonObject } from "../json.ts";
import type { CoordinateDict } from "../number/coordinate.ts";

export type Region = {
  readonly name: string;
  readonly start: CoordinateDict;
  readonly end: CoordinateDict;
  readonly meta: JsonObject;
};

export type Break = {
  readonly coordinate: CoordinateDict;
  readonly control_type: string;
  readonly condition: string;
  readonly repeat_count: JsonNumber;
  readonly label: string | null;
  readonly name: string | null;
  readonly meta: JsonObject;
};

export type Jump = {
  readonly from_coordinate: CoordinateDict;
  readonly to_coordinate: CoordinateDict;
  readonly control_type: string;
  readonly condition: string;
  readonly repeat_count: JsonNumber;
  readonly target_name: string | null;
  readonly label: string | null;
  readonly meta: JsonObject;
};

export type FlowControl = {
  readonly breaks: readonly Break[];
  readonly jumps: readonly Jump[];
  readonly markers: { readonly [name: string]: CoordinateDict };
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

export type Manifest = {
  readonly meta: ManifestMeta;
  readonly timeline: TimelineManifest;
  /** Styling owned by this manifest's elements, never by the canvas. */
  readonly graphical?: Graphical;
};

/** The members of a timeline manifest, in the order timetoalign writes them. */
export const TIMELINE_KEYS = [
  "id",
  "name",
  "class",
  "unit",
  "number_type",
  "length",
  "locked",
  "meta",
  "children",
  "conversion_maps",
  "regions",
  "flow_control",
  "measure_map",
  "metric_hierarchy",
] as const satisfies readonly (keyof TimelineManifest)[];
