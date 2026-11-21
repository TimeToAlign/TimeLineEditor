/**
 * A pinned timestamp as the Timestamp tab shows, copies and edits it: its
 * rows grouped by the timeline they belong to, each number written exactly
 * (its copy text, never rounded) beside its pretty unit, and copied as the
 * value, the raw text and the pretty text; the pin of a named timestamp
 * read anew from the view; its text in a format; and the commands the tab
 * sends. Nothing here computes a value: the rows, the values, whether a row
 * can be edited, the position an edit gives and the JSON are core's, the pin
 * of a named timestamp the arranger's.
 */

import type { KnotsOf } from "@timetoalign/tilie-arranger";
import { drawingOf, namedPin } from "@timetoalign/tilie-arranger";
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
  TimestampDisplay,
  TimestampPart,
  TimestampRow,
  View,
} from "@timetoalign/tilie-core";
import {
  copyValue,
  groupstampByDefault,
  isGroupMember,
  measureText,
  prettyText,
  prettyUnit,
  rawText,
  timestampJson,
  timestampRows,
} from "@timetoalign/tilie-core";
import { toAxisValue } from "@timetoalign/tilie-core/numbers";
import type { FontMetrics, NumberType } from "@timetoalign/timetoshare";
import { DEFAULTS, isJsonObject, TIMESTAMP_DISPLAY } from "@timetoalign/timetoshare";
import type { Format, Text } from "./formats.svelte.ts";
import { writeText } from "./formats.svelte.ts";
import type { Result } from "./problems.ts";

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

/** The rows of one timeline the timestamp crosses: its coordinate's, then its maps'. */
export interface TimelineRows {
  /** Unique among the groups of one timestamp or MatchStamp. */
  readonly key: string;
  readonly timeline: string;
  /** The timeline's name, else its ID. */
  readonly name: string;
  readonly rows: readonly ValueRow[];
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

/** The rows of `pin`'s timestamp (core's `timestampRows`), grouped by timeline in their order. */
export function timelineRows(pin: Pin): TimelineRows[] {
  const groups: TimelineRows[] = [];
  for (const item of timestampRows(pin)) {
    const last = groups.at(-1);
    if (item.row.map === null || last === undefined || last.timeline !== item.timeline) {
      groups.push({
        key: item.timeline,
        timeline: item.timeline,
        name: item.label,
        rows: rowsOf(item),
      });
    } else {
      groups[groups.length - 1] = { ...last, rows: [...last.rows, ...rowsOf(item)] };
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
 * rows `knotsOf` gives for its block's manifest (no server without it);
 * `null` where `address` names none.
 */
export function namedPinOf(
  view: View,
  address: Address,
  metrics: FontMetrics,
  knotsOf?: KnotsOf,
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

/**
 * The `set` of the `display` of the named timestamp at `target`, `shown`
 * now, with `word` toggled, in the canonical order: the one display toggle
 * of a timestamp, in the Timestamp tab and in a MatchStamp's lines.
 */
export function timestampDisplayCommand(
  target: Address,
  shown: readonly TimestampDisplay[],
  word: TimestampDisplay,
): Command {
  const display = shown.includes(word)
    ? shown.filter((item) => item !== word)
    : TIMESTAMP_DISPLAY.filter((item) => item === word || shown.includes(item));
  return { type: "set", changes: [{ target, values: { display } }] };
}

/** The `set` of the named timestamp's `display` with `word` toggled, in the canonical order. */
export function displayCommand(pin: Pin, word: TimestampDisplay): Command {
  return timestampDisplayCommand(named(pin), displayOf(pin), word);
}

/**
 * Whether the Timestamp tab offers the GroupStamp toggle for `pin`, a
 * timestamp of `manifest`: on a timeline that is a member of a group
 * (core's `isGroupMember`), never for a match timestamp.
 */
export function offersGroupstamp(manifest: Manifest, pin: Pin): boolean {
  return isGroupMember(manifest, pin.timestamp.timeline) && !(pin.named?.matchstamp ?? false);
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

/** The names (else the IDs) of the groups of `manifest` listing `timeline` among their members. */
export function groupsOf(manifest: Manifest, timeline: string): string[] {
  return manifest.groups
    .filter((group) => group.members.includes(timeline))
    .map((group) => group.name ?? group.id);
}

/** The `set` making the named timestamp `pin` shows a groupstamp, or an ordinary timestamp. */
export function groupstampCommand(pin: Pin, groupstamp: boolean): Command {
  return { type: "set", changes: [{ target: named(pin), values: { groupstamp } }] };
}
