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
  CompleteElision,
  CompleteFlowControlElement,
  CompleteGraphical,
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
 * One annotation of an element's pairs: who stated a pair, when, how and on
 * what basis, and who believes it (`beliefs`).
 */
export type ProvenanceEntry = NonNullable<TimelineManifest["provenance"]>[number];

/**
 * One element of a timeline's flow control, discriminated by its `role`: a
 * `jump` (holding its destinations as `targets`), a `jump_target`, a
 * `break` (which may state when it ends the flow, `ends`), a
 * `section_break` or a `barline`. Each may carry `provenance`, whose
 * entries are about the element itself.
 */
export type FlowControlElement = ReadonlyView<CompleteFlowControlElement>;

/** The role of a flow-control element. */
export type FlowRole = FlowControlElement["role"];

/**
 * One destination of a jump: its place (`to` an element, `by` a signed
 * distance from the jump, or neither: the start of the jump's section) and
 * the conditions under which it is taken.
 */
export type JumpDestination = NonNullable<FlowControlElement["targets"]>[number];

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
 * A named timestamp of a manifest, `{id, timeline, coordinate, name?,
 * display, matchstamp}`: its coordinate a bare value on the own axis of the
 * timeline it names, as the reader returns it (an integral float on a float
 * axis a `JsonFloat`, an integer beyond 2^53 a `bigint`), like every other
 * own-axis value; its `display` always stated, in the schema package's
 * canonical order (`TIMESTAMP_DISPLAY`). A match timestamp (`matchstamp:
 * true`) is one of the named MatchStamps' and may have no name.
 */
export type NamedTimestamp = ReadonlyView<CompleteTimestamp>;

/**
 * A named MatchStamp, `{id, name, alignment_anchors, match_claims}`: its
 * alignment anchors, each joining two match timestamps, and the IDs of the
 * MatchClaims behind it when it was named or last updated.
 */
export type NamedMatchStamp = ReadonlyView<CompleteGraphical["matchstamps"][number]>;

/**
 * An alignment anchor of a named MatchStamp, `{id, timestamps, display}`:
 * the IDs of its two match timestamps and what of it is drawn, always
 * stated, in the schema package's canonical order (`ANCHOR_DISPLAY`).
 */
export type AlignmentAnchor = NamedMatchStamp["alignment_anchors"][number];

/** A word of an alignment anchor's `display`: `line` or `name`. */
export type AnchorDisplay = AlignmentAnchor["display"][number];

/** A word of a named timestamp's `display`: a part of it that is drawn. */
export type TimestampDisplay = NamedTimestamp["display"][number];

/**
 * An elision of a manifest, `{id, timeline, start, end, name?, width?,
 * display}`: a stretch of the timeline it names, its `start` and `end` (and
 * a `width`'s `span`) bare values on that timeline's own axis as the reader
 * returns them, its `display` always stated, in the schema package's
 * canonical order (`ELISION_DISPLAY`). It is carried through unchanged; the
 * drawing leaves its stretch out (`docs/drawing.md` sections 2 and 8.9).
 */
export type Elision = ReadonlyView<CompleteElision>;

/**
 * A manifest's styling, its display and band orders, its named timestamps,
 * its named MatchStamps and its elisions, owned by the manifest, never by a
 * canvas. The numbers of its declarations are plain doubles: the schema
 * boundary (`normalizeManifest`) reads a declaration's integral float as the
 * double it equals; a named timestamp's coordinate and an elision's values
 * are own-axis values and stay as read.
 */
export type ManifestGraphical = Omit<Graphical, "timestamps" | "matchstamps" | "elisions"> & {
  timestamps?: readonly NamedTimestamp[];
  matchstamps?: readonly NamedMatchStamp[];
  elisions?: readonly Elision[];
};

/**
 * A TimeToShare manifest: its root timelines, optionally grouped. With an
 * `id` or a `name` it is named, without both an anonymous bundle.
 */
export type Manifest = ReadonlyView<Omit<CompleteManifest, "graphical">> & {
  readonly graphical?: ManifestGraphical;
};
