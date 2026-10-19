/**
 * One TimeSkeleton manifest of the current schema version, held losslessly
 * in its complete form: every key with a default is present, its default
 * written out, so a reader never supplies one. Unknown keys are kept as they
 * were read; every copy spreads the value it changes.
 *
 * Every type here is a read-only view of the complete form the schema
 * package generates (`CompleteTimeSkeleton`, `CompleteTimeline`, …), so a
 * change of the schema reaches core's types without a second statement of
 * which keys have defaults.
 */

import type {
  CompleteBreak,
  CompleteConversionMap,
  CompleteFlowControl,
  CompleteGroup,
  CompleteJump,
  CompleteMarker,
  CompleteRegion,
  CompleteTimeline,
  CompleteTimeSkeleton,
  Graphical,
  JsonFloat,
  Lossless,
  Number as SchemaNumber,
} from "@timetoalign/timeskeleton";

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
 * and end, a break, jump or marker coordinate): a JSON integer, a JSON number
 * or a `[numerator, denominator]` pair, as the axis's number type selects,
 * each number as the reader returns it (an integral float in a pair is a
 * `JsonFloat`): the read-only view of the schema's `Number` read losslessly.
 */
export type AxisValue = ReadonlyView<Lossless<SchemaNumber>>;

export type Region = ReadonlyView<CompleteRegion>;

export type Break = ReadonlyView<CompleteBreak>;

export type Jump = ReadonlyView<CompleteJump>;

export type Marker = ReadonlyView<CompleteMarker>;

export type FlowControl = ReadonlyView<CompleteFlowControl>;

/** A conversion map, discriminated by its `type`; positions on another axis are coordinate dicts. */
export type ConversionMap = ReadonlyView<CompleteConversionMap>;

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
 * A TimeSkeleton manifest: its root timelines, optionally grouped. With an
 * `id` or a `name` it is named, without both an anonymous bundle.
 */
export type Manifest = ReadonlyView<Omit<CompleteTimeSkeleton, "graphical">> & {
  readonly graphical?: ManifestGraphical;
};
