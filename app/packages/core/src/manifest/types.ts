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
 * A manifest's styling and its groups' display order, owned by the manifest,
 * never by a canvas. Its numbers are plain doubles: the schema boundary
 * (`normalizeManifest`) reads a declaration's integral float as the double it
 * equals.
 */
export type ManifestGraphical = Graphical;

/**
 * A TimeToShare manifest: its root timelines, optionally grouped. With an
 * `id` or a `name` it is named, without both an anonymous bundle.
 */
export type Manifest = ReadonlyView<Omit<CompleteManifest, "graphical">> & {
  readonly graphical?: ManifestGraphical;
};
