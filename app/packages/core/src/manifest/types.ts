/**
 * One TimeToShare manifest of the current schema version, held losslessly
 * in its complete form: every key with a default is present, its default
 * written out, so a reader never supplies one. Unknown keys are kept as they
 * were read; every copy spreads the value it changes.
 *
 * Every type here is a read-only view of the complete form the schema
 * package generates (`CompleteManifest`, `CompleteTimeline`, …), so a
 * change of the schema reaches core's types without a second statement of
 * which keys have defaults.
 */

import type {
  CompleteConversionMap,
  CompleteFlowControlElement,
  CompleteGroup,
  CompleteManifest,
  CompleteMeasureMap,
  CompleteRegion,
  CompleteTimeline,
  CompleteTimestamp,
  Graphical,
  JsonFloat,
  Lossless,
  Number as SchemaNumber,
} from "@timetoalign/timetoshare";

/**
 * `T` with every object member, every list and every pair read-only, at
 * every depth; a `JsonFloat` is a number, kept as the reader returns it.
 */
type ReadonlyView<T> = unknown extends T
  ? T
  : T extends JsonFloat | bigint | number | string | boolean | null | undefined
    ? T
    : { readonly [K in keyof T]: ReadonlyView<T[K]> };

/**
 * A value on its timeline's own axis (a length, an offset, a region's start
 * and end, a flow-control element's coordinate): a JSON integer, a JSON number
 * or a `[numerator, denominator]` pair, as the axis's number type selects,
 * each number as the reader returns it (an integral float in a pair is a
 * `JsonFloat`): the read-only view of the schema's `Number` read losslessly.
 */
export type AxisValue = ReadonlyView<Lossless<SchemaNumber>>;

export type Region = ReadonlyView<CompleteRegion>;

/**
 * The property–value pairs an element (the manifest, a timeline, a region)
 * states about the thing it stands for: `type` and property IRIs as keys,
 * each with its non-empty list of values, as the reader returns them.
 */
export type Statements = NonNullable<TimelineManifest["statements"]>;

/**
 * One annotation of an element's pairs: who stated a pair, when, how, on
 * what basis, and its status (`confirmed`, `proposed`, `rejected`).
 */
export type ProvenanceEntry = NonNullable<TimelineManifest["provenance"]>[number];

/**
 * One element of a timeline's flow control, discriminated by its `type`: a
 * `jump_from` (a jump origin, naming the `jump_to` it leads to as `target`,
 * or the timeline's start without one), a `jump_to` (a jump target) or a
 * `flow_marker`.
 */
export type FlowControlElement = ReadonlyView<CompleteFlowControlElement>;

/** A conversion map, discriminated by its `type`: an abstract function of a position on its timeline's axis. */
export type ConversionMap = ReadonlyView<CompleteConversionMap>;

/**
 * A measure map of the manifest: compressed Measure Map rows in quarters,
 * named by its id, which the measure views among the conversion maps
 * name. It belongs to no timeline and is not drawn.
 */
export type MeasureMap = ReadonlyView<CompleteMeasureMap>;

/**
 * A timeline: its length on its own axis, or null when the length is not
 * known; a child's offset on its parent's axis (a root's, when present,
 * places the root's origin on its own axis and may be negative); its
 * children in offset order, ties by id.
 */
export type TimelineManifest = ReadonlyView<CompleteTimeline>;

/** A child timeline: a timeline whose offset, on its parent's axis, is always stated. */
export type ChildTimeline = TimelineManifest & { readonly offset: AxisValue };

/** A timeline group: the timelines of the manifest it names, roots or descendants. */
export type Group = ReadonlyView<CompleteGroup>;

/**
 * A named timestamp of a manifest, `{id, timeline, coordinate, name,
 * display}`: its coordinate a bare value on the own axis of the timeline it
 * names, as the reader returns it (an integral float on a float axis a
 * `JsonFloat`, an integer beyond 2^53 a `bigint`), like every other own-axis
 * value; its `display` always stated, in the schema package's canonical
 * order (`TIMESTAMP_DISPLAY`).
 */
export type NamedTimestamp = ReadonlyView<CompleteTimestamp>;

/** A word of a named timestamp's `display`: a part of it that is drawn. */
export type TimestampDisplay = NamedTimestamp["display"][number];

/**
 * A manifest's styling, its display and band orders and its named
 * timestamps, owned by the manifest, never by a canvas. The numbers of its
 * declarations are plain doubles: the schema boundary (`normalizeManifest`)
 * reads a declaration's integral float as the double it equals; a named
 * timestamp's coordinate is an own-axis value and stays as read.
 */
export type ManifestGraphical = Omit<Graphical, "timestamps"> & {
  timestamps?: readonly NamedTimestamp[];
};

/**
 * A TimeToShare manifest: its root timelines, optionally grouped. With an
 * `id` or a `name` it is named, without both an anonymous bundle.
 */
export type Manifest = ReadonlyView<Omit<CompleteManifest, "graphical">> & {
  readonly graphical?: ManifestGraphical;
};
