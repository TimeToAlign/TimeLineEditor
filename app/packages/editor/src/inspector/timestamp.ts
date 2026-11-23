/**
 * A pinned timestamp as the Timestamp tab shows, copies and edits it: its
 * rows grouped by the timeline they belong to, each number written exactly
 * (its copy text, never rounded) beside its pretty unit, and copied as the
 * value, the raw text and the pretty text; the pin of a named timestamp
 * read anew from the view; its text in a format; the rotation of its
 * wedge; and the commands the tab sends. Nothing here computes a value: the
 * rows, the values, whether a row can be edited, the position an edit gives
 * and the JSON are core's, the pin of a named timestamp the arranger's, the
 * rotation a wedge is drawn with layout's.
 */

import type { Editing, KnotsOf } from "@timetoalign/tilie-arranger";
import {
  drawingOf,
  namedPin,
  raisedRoot,
  readsGroup,
  rereadPin,
  timelinePin,
} from "@timetoalign/tilie-arranger";
import type {
  Address,
  AxisValue,
  Command,
  EditorKind,
  Expressed,
  ExpressedNumber,
  Json,
  Manifest,
  NamedTimestamp,
  Pin,
  Row,
  StyleCommand,
  TimestampDisplay,
  TimestampPart,
  TimestampRow,
  View,
} from "@timetoalign/tilie-core";
import {
  canonicalText,
  copyValue,
  findTimeline,
  groupsHolding,
  groupstampByDefault,
  isGroupMember,
  measureText,
  prettyText,
  prettyUnit,
  rawText,
  sameAddress,
  timestampJson,
  timestampRows,
} from "@timetoalign/tilie-core";
import {
  axisCoordinate,
  Rational,
  realOf,
  toAxisValue,
  toRational,
} from "@timetoalign/tilie-core/numbers";
import type { FontMetrics, NumberType, Selector } from "@timetoalign/timetoshare";
import { DEFAULTS, isJsonObject, TIMESTAMP_DISPLAY } from "@timetoalign/timetoshare";
import type { Format, Text } from "./formats.svelte.ts";
import { writeText } from "./formats.svelte.ts";
import type { Result } from "./problems.ts";
import { displayCommand as displayToggle } from "./stamps/commands.ts";

/**
 * What the Copy buttons of one value write, `null` where there is no such
 * Copy: the value (`copyValue`, a text as it is), the raw text with its unit
 * written out (`rawText`; none without a unit) and the pretty text
 * (`prettyText`, exact; none where it is the value's text, as a float
 * without a unit is).
 */
export interface Copies {
  readonly value: string;
  readonly raw: string | null;
  readonly pretty: string | null;
}

/**
 * One value as the tab shows it: its label, its exact text and pretty unit,
 * what its Copy buttons write (`null`: none, a missing value), and whether
 * an edit of it moves the timestamp. A number's `numberType` is the type
 * its text is read in; a text (a label, a measure, a missing value) has
 * none and is never edited.
 */
export interface ValueRow {
  /** Unique among the rows of one timestamp. */
  readonly key: string;
  /** The row of core's cross-section an edit of the value is read on. */
  readonly row: Row;
  readonly label: string;
  readonly text: string;
  readonly unit: string | null;
  readonly numberType: NumberType | null;
  readonly copies: Copies | null;
  readonly editable: boolean;
}

/** The rows of one timeline the timestamp crosses: its coordinate's and its maps', top to bottom as drawn. */
export interface TimelineRows {
  /** Unique among the groups of one timestamp or MatchStamp. */
  readonly key: string;
  readonly timeline: string;
  /** The timeline's name, else its ID. */
  readonly name: string;
  readonly rows: readonly ValueRow[];
  /**
   * Present, `true`, on the group holding the timestamp's primary coordinate (its anchor's
   * coordinate row), which the tab highlights.
   */
  readonly primary?: true;
}

/** A row's label in the tab: a timeline's coordinate is "coordinate", its timeline's name heading the rows. */
const COORDINATE = "coordinate";

/** A text row: shown and copied as it is, never edited. */
function textRow(key: string, row: Row, label: string, text: string, copied: boolean): ValueRow {
  return {
    key,
    row,
    label,
    text,
    unit: null,
    numberType: null,
    copies: copied ? { value: text, raw: null, pretty: null } : null,
    editable: false,
  };
}

function valueRows(
  key: string,
  row: Row,
  label: string,
  value: Expressed,
  editable: boolean,
): ValueRow[] {
  if (typeof value === "string") return [textRow(key, row, label, value, true)];
  if ("record" in value) return [textRow(key, row, label, measureText(value.record), true)];
  if ("outputs" in value) {
    return Object.entries(value.outputs).flatMap(([output, inner]) =>
      valueRows(JSON.stringify([key, output]), row, `${label} · ${output}`, inner, false),
    );
  }
  const { unit, numberType } = value;
  const text = copyValue(value.value, numberType);
  const pretty = prettyText(value.value, numberType, unit);
  return [
    {
      key,
      row,
      label,
      text,
      unit: unit === null ? null : prettyUnit(unit),
      numberType,
      copies: {
        value: text,
        raw: unit === null ? null : rawText(value.value, numberType, unit),
        pretty: pretty === text ? null : pretty,
      },
      editable,
    },
  ];
}

function rowsOf(item: TimestampRow): ValueRow[] {
  const { row } = item;
  const key = JSON.stringify([row.timeline, row.map]);
  const label = row.map === null ? COORDINATE : item.label;
  if (item.value === null) return [textRow(key, row, label, item.missing ?? "", false)];
  return valueRows(key, row, label, item.value, item.editable);
}

/**
 * The rows of `pin`'s timestamp (core's `timestampRows`), grouped by
 * timeline in their order: each group the consecutive rows of one timeline,
 * top to bottom as they are drawn, named by its coordinate row's label; the
 * group holding the primary coordinate (the anchor's coordinate row) marked
 * `primary`. They are what the coordinate flag lists for the pin.
 */
export function timelineRows(pin: Pin): TimelineRows[] {
  const anchor = pin.spec.anchor.timeline;
  const groups: TimelineRows[] = [];
  for (const item of timestampRows(pin)) {
    const primary =
      item.timeline === anchor && item.row.map === null ? { primary: true as const } : {};
    const last = groups.at(-1);
    if (last === undefined || last.timeline !== item.timeline) {
      groups.push({
        key: item.timeline,
        timeline: item.timeline,
        name: item.label,
        rows: rowsOf(item),
        ...primary,
      });
    } else {
      const name = item.row.map === null ? item.label : last.name;
      groups[groups.length - 1] = {
        ...last,
        name,
        rows: [...last.rows, ...rowsOf(item)],
        ...primary,
      };
    }
  }
  return groups;
}

/**
 * The group of one coordinate on its own timeline, as a MatchStamp's
 * timestamp is shown: one row "coordinate" (`value` a number in its unit and
 * number type, else a text), copied as a timestamp's is, never edited.
 * `key` is unique among the groups shown together, and so are the row keys
 * derived from it.
 */
export function coordinateGroup(
  key: string,
  timeline: string,
  name: string,
  value: ExpressedNumber | string,
): TimelineRows {
  const row: Row = { timeline, map: null };
  return { key, timeline, name, rows: valueRows(key, row, COORDINATE, value, false) };
}

/** `value` with every object member whose value is null left out, at any depth; array items stay. */
function withoutNullMembers(value: Json): Json {
  if (Array.isArray(value)) return value.map(withoutNullMembers);
  if (!isJsonObject(value)) return value;
  return Object.fromEntries(
    Object.entries(value as { readonly [key: string]: Json })
      .filter(([, item]) => item !== null)
      .map(([key, item]) => [key, withoutNullMembers(item)]),
  );
}

/**
 * `pin`'s timestamp as text in `format`: core's `timestampJson` written by
 * the inspector's codec. The text is a readout, not a manifest, so the
 * manifest's null rule does not apply to it: in TOML, which has no null,
 * every member whose value is null (a map without a value at the position,
 * a measure's missing number or length) is left out; JSON and YAML keep it.
 *
 * @throws {Error} when the format's codec has not been loaded (`loadCodec`).
 */
export function timestampText(format: Format, pin: Pin): Result<Text> {
  const value = timestampJson(pin);
  return writeText(format, format === "toml" ? withoutNullMembers(value) : value);
}

/** The address of the named timestamp `pin` shows; `null` for an unnamed pin. */
export function namedAddress(pin: Pin): Address | null {
  return pin.named === null ? null : { block: pin.spec.block, id: pin.named.id };
}

/**
 * The pin of the named timestamp at `address`, read from `view` (its block
 * drawn with `metrics`, under the view's granularity) with the MeasureMap
 * rows `knotsOf` gives for its block's manifest (no server without it), on
 * the lines the canvas shows while `editing`, the innermost open editor, is
 * open (the arranger's `raisedRoot`: an ancestor card it raises is read
 * where the frames cover it), on the line keyed `line` (the line of the
 * canvas it was named from) while that line is one of its places, else at
 * its first place; `null` where `address` names none.
 */
export function namedPinOf(
  view: View,
  address: Address,
  metrics: FontMetrics,
  knotsOf?: KnotsOf,
  editing: Editing | null = null,
  line: string | null = null,
): Pin | null {
  const block = address.block === undefined ? undefined : view.blocks[address.block];
  if (block === undefined || address.id === undefined) return null;
  return namedPin(
    block.manifest,
    block.id,
    drawingOf(block, view.graphical, metrics),
    address.id,
    view.settings.granularity,
    knotsOf?.(block.manifest) ?? "no_server",
    raisedRoot(block, editing),
    line,
  );
}

/**
 * The root whose ancestor cards the block of `pin` shows raised while
 * `editing` is open (the arranger's `raisedRoot`); `null` for none or a
 * block `view` does not hold.
 */
export function raisedOf(view: View, pin: Pin, editing: Editing | null): string | null {
  const block = view.blocks[pin.spec.block];
  return block === undefined ? null : raisedRoot(block, editing);
}

/** Where a held unnamed pin was read: the line of the canvas (`null` where unknown) and the root raised then. */
export interface ReadOn {
  readonly line: string | null;
  readonly raised: string | null;
}

const rereadByPin = new WeakMap<
  Pin,
  {
    readonly manifest: Manifest;
    readonly raised: string | null;
    readonly group: boolean;
    readonly line: string | null;
    readonly pin: Pin;
  }
>();

/**
 * The unnamed pin `pin`, held since it was read as `readOn` says, as
 * shown while `editing` is open: itself while its block raises the same
 * root (`raisedOf`) and it reads a group exactly where a fresh reading
 * reads one (`readsGroup` against `groupstampOf`: by the group where naming
 * it would store a groupstamp, never inside a timeline editor), else read
 * again at its anchor's timeline and position as a fresh reading at its
 * mark reads it under the root raised now and by that group reading, so
 * its rows, the GroupStamp toggle and the tab after naming agree whichever
 * editors were open when it was read (the arranger's `rereadPin`, on its
 * line while that line is still a place), its block drawn with `metrics`,
 * once per pin, manifest, root, group reading and line, so a change of the
 * view elsewhere shows the same pin. Itself where its block or its
 * timeline is gone.
 */
export function heldPinOf(
  view: View,
  pin: Pin,
  metrics: FontMetrics,
  editing: Editing | null,
  readOn: ReadOn,
): Pin {
  const block = view.blocks[pin.spec.block];
  if (block === undefined) return pin;
  const { manifest } = block;
  const raised = raisedRoot(block, editing);
  const group = groupstampOf(manifest, pin, editing?.kind ?? null);
  if (raised === readOn.raised && readsGroup(pin) === group) return pin;
  const known = rereadByPin.get(pin);
  if (
    known?.manifest === manifest &&
    known.raised === raised &&
    known.group === group &&
    known.line === readOn.line
  ) {
    return known.pin;
  }
  const drawing = drawingOf(block, view.graphical, metrics);
  const read = rereadPin(manifest, drawing, pin, group, raised, readOn.line) ?? pin;
  rereadByPin.set(pin, { manifest, raised, group, line: readOn.line, pin: read });
  return read;
}

/**
 * The pin of the position a timeline's start or end mark stands for, when
 * `address` names exactly such a mark, `{block, id: T, part: ["start"]}` or
 * `["end"]` (a member's marks on its ancestor lines, a segment's boundary):
 * unnamed, of the timeline `T` of the block's manifest at the zero of its
 * number type or at its length, read as any position on `T` is (the
 * arranger's `timelinePin`: its ancestors and the timelines its line
 * crosses), the block drawn with `metrics` under the view's granularity and
 * with the MeasureMap rows `knotsOf` gives (no server without it), on the
 * lines the canvas shows while `editing` is open, as `namedPinOf` reads, and
 * by the group where a fresh reading there reads one (core's
 * `groupstampByDefault`: a group member's above a timeline editor), so the
 * pin reads alike whichever editors were open before.
 * `null` for any other address, a timeline the manifest does not hold, and
 * the end of a timeline whose length is not known.
 */
export function boundaryPinOf(
  view: View,
  address: Address,
  metrics: FontMetrics,
  knotsOf?: KnotsOf,
  editing: Editing | null = null,
): Pin | null {
  const block = address.block === undefined ? undefined : view.blocks[address.block];
  const [word, ...rest] = address.part ?? [];
  if (block === undefined || address.id === undefined || address.facet !== undefined) return null;
  if (rest.length > 0 || (word !== "start" && word !== "end")) return null;
  const timeline = findTimeline(block.manifest, address.id);
  if (timeline === undefined) return null;
  let position = Rational.fromParts(0n, 1n);
  if (word === "end") {
    if (timeline.length === null) return null;
    position = toRational(realOf(axisCoordinate(timeline.length, timeline)));
  }
  return timelinePin(
    block.manifest,
    block.id,
    drawingOf(block, view.graphical, metrics),
    timeline.id,
    position,
    view.settings.granularity,
    knotsOf?.(block.manifest) ?? "no_server",
    groupstampByDefault(block.manifest, timeline.id, editing?.kind ?? null),
    raisedRoot(block, editing),
    null,
  );
}

/** The named timestamp of block `block` that `after` holds and `before` does not; `null` for none. */
export function addedTimestamp(before: View, after: View, block: string): NamedTimestamp | null {
  const known = new Set(
    (before.blocks[block]?.manifest.graphical?.timestamps ?? []).map((item) => item.id),
  );
  const timestamps = after.blocks[block]?.manifest.graphical?.timestamps ?? [];
  return timestamps.find((item) => !known.has(item.id)) ?? null;
}

/** The part of `pin`'s anchor: the timeline it is pinned on, or the named timestamp's. */
function anchorOf(pin: Pin): TimestampPart {
  const [anchor] = pin.timestamp.parts;
  if (anchor === undefined) throw new Error("a timestamp has its anchor's part");
  return anchor;
}

/** The coordinate of `pin`'s timestamp on its anchor's own axis, as a bare value. */
function anchorCoordinate(pin: Pin): AxisValue {
  const { unit, numberType, position } = anchorOf(pin);
  return toAxisValue({ unit, numberType, value: position });
}

/** The address of `pin`'s named timestamp; throws for an unnamed pin. */
function named(pin: Pin): Address {
  const address = namedAddress(pin);
  if (address === null) throw new Error("the pin shows no named timestamp");
  return address;
}

/**
 * The command naming `pin` `name`: for an unnamed pin the `add` storing a
 * timestamp `name` at its anchor's coordinate, into its anchor's timeline
 * (the default `display`), a groupstamp where `groupstamp` (what
 * `groupstampOf` gives it: the command states `groupstamp` only then, `add`
 * taking `false` without it); for a named one the `set` of its name.
 */
export function nameCommand(pin: Pin, name: string, groupstamp = false): Command {
  if (pin.named !== null) {
    return { type: "set", changes: [{ target: named(pin), values: { name } }] };
  }
  const stored = { name, coordinate: anchorCoordinate(pin) };
  return {
    type: "add",
    into: { block: pin.spec.block, id: pin.timestamp.timeline },
    timestamp: groupstamp ? { ...stored, groupstamp } : stored,
  };
}

/**
 * The `set` moving the named timestamp `pin` shows to `moved`, its pin
 * moved (`pinAt`): the coordinate of `moved`'s anchor, the named
 * timestamp's own timeline; `null` when that is its coordinate already.
 */
export function moveCommand(pin: Pin, moved: Pin): Command | null {
  const part = anchorOf(pin);
  const next = anchorOf(moved);
  if (copyValue(part.position, part.numberType) === copyValue(next.position, next.numberType)) {
    return null;
  }
  return {
    type: "set",
    changes: [{ target: named(pin), values: { coordinate: anchorCoordinate(moved) } }],
  };
}

/** The `remove` deleting the named timestamp `pin` shows. */
export function removeCommand(pin: Pin): Command {
  return { type: "remove", targets: [named(pin)] };
}

/** What each word of `display` is called on its toggle. */
export const DISPLAY_LABELS: { readonly [word in TimestampDisplay]: string } = {
  wedge: "Wedge",
  name: "Name",
  id: "ID",
  coordinate: "Coordinate",
  cross_section: "Line",
};

/** The words of `display`, each with its toggle's label, in the canonical order. */
export const DISPLAY_WORDS: readonly { readonly word: TimestampDisplay; readonly label: string }[] =
  TIMESTAMP_DISPLAY.map((word) => ({ word, label: DISPLAY_LABELS[word] }));

/** What `pin` displays: its named timestamp's `display`; an unnamed pin's naming would give the default. */
export function displayOf(pin: Pin): readonly TimestampDisplay[] {
  return pin.named?.display ?? DEFAULTS.timestamp.display;
}

/** The `set` of the named timestamp's `display` with `word` toggled, in the canonical order. */
export function displayCommand(pin: Pin, word: TimestampDisplay): Command {
  return displayToggle(named(pin), TIMESTAMP_DISPLAY, displayOf(pin), word);
}

/**
 * Whether the Timestamp tab offers the GroupStamp toggle for `pin`, a
 * timestamp of `manifest`: on a timeline that is a member of a group
 * (core's `isGroupMember`), a match timestamp's included.
 */
export function offersGroupstamp(manifest: Manifest, pin: Pin): boolean {
  return isGroupMember(manifest, pin.timestamp.timeline);
}

/**
 * Whether `pin`'s timestamp is a groupstamp: a named one as stored; an
 * unnamed one as naming it would store it, a groupstamp on a group member
 * unless `editor`, the innermost editor open (`null` for none), is a
 * timeline editor (core's `groupstampByDefault`).
 */
export function groupstampOf(manifest: Manifest, pin: Pin, editor: EditorKind | null): boolean {
  return pin.named?.groupstamp ?? groupstampByDefault(manifest, pin.timestamp.timeline, editor);
}

/**
 * The names (else the IDs) of the groups of `manifest` holding `timeline`:
 * those listing it or one of its ancestors among their members (core's
 * `groupsHolding`), as the GroupStamp hint names them.
 */
export function holdingGroupNames(manifest: Manifest, timeline: string): string[] {
  return groupsHolding(manifest, timeline).map((group) => group.name ?? group.id);
}

/** The GroupStamp toggle of both stamp tabs: one word. */
export const GROUPSTAMP_WORDS: readonly { readonly word: "groupstamp"; readonly label: string }[] =
  [{ word: "groupstamp", label: "GroupStamp" }];

/**
 * What a GroupStamp in the groups named `groups` (`holdingGroupNames` of
 * its timeline) crosses, in words, the hint of its toggle in both stamp
 * tabs: "A GroupStamp's line crosses every member of 'Performance'."
 */
export function groupstampHint(groups: readonly string[]): string {
  return `A GroupStamp's line crosses every member of ${groups.map((name) => `'${name}'`).join(", ")}.`;
}

/**
 * The `set` making the named timestamp at `target` a groupstamp, or an
 * ordinary timestamp: the GroupStamp toggle of both stamp tabs (the
 * Timestamp tab passes its named timestamp's address, the Matchstamp tab
 * a match timestamp's).
 */
export function groupstampCommand(target: Address, groupstamp: boolean): Command {
  return { type: "set", changes: [{ target, values: { groupstamp } }] };
}

/**
 * The stops of a wedge's rotation in degrees, ascending: the slider's ticks
 * and the buttons under it.
 */
export const ROTATION_STOPS: readonly number[] = [-180, -135, -45, 0, 45, 135, 180];

/** `degrees` as the tab writes it, a negative number with a minus sign (U+2212): "−45", "0", "135". */
export function degreesText(degrees: number): string {
  return degrees < 0 ? `\u2212${-degrees}` : String(degrees);
}

/** The rotation of a timestamp's wedge as the Timestamp tab shows it. */
export interface WedgeRotation {
  /** The degrees the wedge is turned: as drawn, else as a rule states it, else its initial value. */
  readonly value: number;
  /** Whether a rule addressed to the wedge alone sets its `rotation` (`rotationCommand`'s rule). */
  readonly stated: boolean;
}

/** The selector of the wedge of the named timestamp `id`, and nothing else. */
function wedgeOf(id: string): Selector {
  return { element: "wedge", addresses: [{ id }] };
}

/**
 * The `style` turning the wedge of the named timestamp `pin` shows by
 * `rotation` degrees, an integer from -180 to 180, through one rule of its
 * block's manifest addressed to that wedge alone; `null` removes the
 * property from the rule (the rule with it when nothing else is left), so
 * the wedge takes its initial value again.
 */
export function rotationCommand(pin: Pin, rotation: number | null): StyleCommand {
  if (pin.named === null) throw new Error("the pin shows no named timestamp");
  return {
    type: "style",
    select: wedgeOf(pin.named.id),
    set: { rotation },
    blocks: [pin.spec.block],
  };
}

/** The `rotation` the rule of `rotationCommand` states for the wedge of `id`; `undefined` for none. */
function statedRotation(manifest: Manifest, id: string): number | undefined {
  const key = canonicalText(wedgeOf(id));
  const rule = manifest.graphical?.rules?.find((item) => canonicalText(item.select) === key);
  if (rule === undefined) return undefined;
  const declaration =
    typeof rule.set === "string" ? manifest.graphical?.styles?.[rule.set] : rule.set;
  return declaration?.rotation;
}

/**
 * The rotation of the wedge of `pin`'s timestamp in `view` (its block drawn
 * with `metrics`): a named one's as its first drawn wedge carries it, in
 * drawing order (a rule scoped to a band or card can turn one address
 * differently in each drawing), whichever rule sets it; while its wedge
 * is not drawn, as its rule states it, else the initial value 0, the
 * rotation of every wedge of a primary coordinate, a groupstamp's included.
 * An unnamed one's 0, as naming would draw it.
 */
export function wedgeRotationOf(view: View, pin: Pin, metrics: FontMetrics): WedgeRotation {
  const block = view.blocks[pin.spec.block];
  if (block === undefined) return { value: 0, stated: false };
  const { manifest } = block;
  if (pin.named === null) return { value: 0, stated: false };
  const address = { id: pin.named.id };
  const stated = statedRotation(manifest, pin.named.id);
  const drawn = drawingOf(block, view.graphical, metrics).elements.find(
    (element) => element.type === "wedge" && sameAddress(element.address, address),
  );
  return {
    value: drawn?.style.rotation ?? stated ?? 0,
    stated: stated !== undefined,
  };
}
