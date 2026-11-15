/**
 * A timestamp as the Timestamp tab shows, copies and edits it: one section
 * per part, one row per value, each in the texts core gives for it, floats
 * with the granularity's places; the whole as a value of coordinate dicts;
 * and the commands the tab sends for a named timestamp. Nothing here
 * computes a value: the values, the positions an edit gives and whether a
 * map can be solved for a position are core's, the pin of a named
 * timestamp the arranger's, the cascaded display of its cross-section line
 * layout's.
 */

import type { KnotsOf } from "@timetoalign/tilie-arranger";
import { drawingOf, namedPin, selectionOf, styleLayers } from "@timetoalign/tilie-arranger";
import type {
  Address,
  Block,
  Command,
  ConversionMap,
  Expressed,
  Json,
  NamedTimestamp,
  Pin,
  PinRow,
  TimestampPart,
  View,
} from "@timetoalign/tilie-core";
import {
  addressKey,
  coordinateDict,
  copyValue,
  copyValueWithUnit,
  displayValue,
  idAddress,
  inBlock,
  invertible,
  isCommandError,
  measureText,
  missingValueText,
  partAddress,
  preview,
  resolveAddress,
  unitSymbol,
} from "@timetoalign/tilie-core";
import type { ElementKey } from "@timetoalign/tilie-core/drawing";
import { manifestElements, timelineAncestry } from "@timetoalign/tilie-core/drawing";
import type { CoordinateValue } from "@timetoalign/tilie-core/numbers";
import { jsonFloat, jsonInteger, Rational, toAxisValue } from "@timetoalign/tilie-core/numbers";
import { Cascade } from "@timetoalign/tilie-layout";
import type { FontMetrics, NumberType, Selector } from "@timetoalign/timetoshare";
import type { NamedPinning } from "./tabs.ts";
import { inspectedSubject } from "./words.ts";

/**
 * One shown value: its label, its text and unit symbol, what each Copy
 * writes (`null`: no such Copy), and the row an edit of it moves (`null`:
 * read-only). A number's `numberType` is the type its text is read in; a
 * text (a label, a measure, a missing value) has none.
 */
export interface TimestampRow {
  /** Unique among the rows of one timestamp. */
  readonly key: string;
  readonly label: string;
  readonly shown: string;
  readonly unit: string | null;
  readonly numberType: NumberType | null;
  readonly copied: string | null;
  readonly copiedWithUnit: string | null;
  readonly edit: PinRow | null;
  /** A number of a map that cannot be solved for a position: shown, never edited. */
  readonly locked: boolean;
}

/** One part of a timestamp: its heading, then its coordinate's row and its maps' rows. */
export interface TimestampSection {
  readonly heading: string;
  /** The part's name. */
  readonly name: string;
  readonly rows: readonly TimestampRow[];
}

/** The map `id` of a part, as its pin's spec holds it, and whether core can solve it for a position. */
function solvable(pin: Pin, part: TimestampPart, id: string): boolean {
  const { spec, knots } = pin;
  const timeline = part.segment
    ? spec.segments.find((item) => item.timeline === part.timeline)
    : spec.line;
  const map: ConversionMap | undefined = timeline?.maps.find((item) => item.id === id);
  if (timeline === undefined || map === undefined) return false;
  return invertible(map, {
    ...(typeof knots === "string" ? {} : { knots }),
    span: { start: Rational.fromParts(0n, 1n), end: timeline.length },
  });
}

/** A text row: shown and copied as it is, never edited. */
function textRow(key: string, label: string, text: string, copied: string | null): TimestampRow {
  return {
    key,
    label,
    shown: text,
    unit: null,
    numberType: null,
    copied,
    copiedWithUnit: null,
    edit: null,
    locked: false,
  };
}

function valueRows(
  key: string,
  label: string,
  value: Expressed,
  decimals: number,
  edit: PinRow | null,
): TimestampRow[] {
  if (typeof value === "string") return [textRow(key, label, value, value)];
  if ("record" in value) {
    const text = measureText(value.record);
    return [textRow(key, label, text, text)];
  }
  if ("outputs" in value) {
    return Object.entries(value.outputs).flatMap(([output, inner]) =>
      valueRows(`${key}/${output}`, `${label} · ${output}`, inner, decimals, null),
    );
  }
  const { unit, numberType } = value;
  return [
    {
      key,
      label,
      shown: displayValue(value.value, numberType, decimals),
      unit: unit === null ? null : unitSymbol(unit),
      numberType,
      copied: copyValue(value.value, numberType),
      copiedWithUnit: unit === null ? null : copyValueWithUnit(value.value, numberType, unit),
      edit,
      locked: edit === null,
    },
  ];
}

function sectionOf(pin: Pin, part: TimestampPart): TimestampSection {
  const { decimals } = pin.timestamp.granularity;
  const which: PinRow["part"] = part.segment ? "segment" : "line";
  const { position, numberType, unit } = part;
  return {
    heading: part.segment ? `${part.name} · segment` : part.name,
    name: part.name,
    rows: [
      {
        key: which,
        label: "coordinate",
        shown: displayValue(position, numberType, decimals),
        unit: unitSymbol(unit),
        numberType,
        copied: copyValue(position, numberType),
        copiedWithUnit: copyValueWithUnit(position, numberType, unit),
        edit: { part: which, map: null },
        locked: false,
      },
      ...part.maps.flatMap((map) => {
        const label = map.name ?? map.id;
        const key = `${which}/${map.id}`;
        if (map.value === null) return [textRow(key, label, missingValueText(map), null)];
        const edit = solvable(pin, part, map.id) ? { part: which, map: map.id } : null;
        return valueRows(key, label, map.value, decimals, edit);
      }),
    ],
  };
}

/** The sections of a pinned timestamp, its line's first. */
export function timestampSections(pin: Pin): TimestampSection[] {
  return pin.timestamp.parts.map((part) => sectionOf(pin, part));
}

/** A number without a unit as a manifest writes a bare value: an integer, a float, a Fraction pair. */
function bareValue(value: CoordinateValue): Json {
  if (value instanceof Rational) {
    return [jsonInteger(value.numerator), jsonInteger(value.denominator)];
  }
  return typeof value === "bigint" ? jsonInteger(value) : jsonFloat(value);
}

function jsonOf(value: Expressed | null): Json {
  if (value === null || typeof value === "string") return value;
  if ("record" in value) return { ...value.record };
  if ("outputs" in value) {
    const outputs: { [output: string]: Json } = {};
    for (const [output, inner] of Object.entries(value.outputs)) outputs[output] = jsonOf(inner);
    return outputs;
  }
  return value.unit === null
    ? { number_type: value.numberType, value: bareValue(value.value) }
    : { ...coordinateDict(value.value, value.unit, value.numberType) };
}

/**
 * A pinned timestamp as one value: `{id, name}` of a named timestamp
 * (`named` its stored form), then `parts`, each `{timeline, segment,
 * coordinate, maps}`, every number with a unit a coordinate dict, one
 * without `{number_type, value}`, a map without a value `null`, the maps
 * keyed by ID.
 */
export function timestampValue(pin: Pin, named: NamedTimestamp | null): Json {
  const parts = pin.timestamp.parts.map((part) => {
    const maps: { [id: string]: Json } = {};
    for (const map of part.maps) maps[map.id] = jsonOf(map.value);
    return {
      timeline: part.timeline,
      segment: part.segment,
      coordinate: { ...coordinateDict(part.position, part.unit, part.numberType) },
      maps,
    };
  });
  return named === null ? { parts } : { id: named.id, name: named.name, parts };
}

/** The named timestamp `address` names in `view`; `null` where it names none. */
export function namedTimestampOf(view: View, address: Address): NamedTimestamp | null {
  const resolved = resolveAddress(view, address);
  return "kind" in resolved && resolved.kind === "timestamp" ? resolved.timestamp : null;
}

/**
 * The pin of the named timestamp `pinning` holds, read anew from `view`
 * (its block drawn with `metrics`, its granularity the view's) with the
 * MeasureMap rows `knotsOf` gives for its block's manifest (no server
 * without it); `null` where it is gone.
 */
export function namedPinOf(
  view: View,
  pinning: NamedPinning,
  metrics: FontMetrics,
  knotsOf?: KnotsOf,
): Pin | null {
  const { block: id, id: timestamp } = pinning.named;
  const block = id === undefined ? undefined : view.blocks[id];
  if (block === undefined || timestamp === undefined) return null;
  const drawing = drawingOf(block, view.graphical, metrics);
  return namedPin(
    block.manifest,
    block.id,
    drawing,
    timestamp,
    view.settings.granularity,
    knotsOf?.(block.manifest) ?? "no_server",
  );
}

/**
 * The checkbox "Show cross-section line" of a named timestamp: checked
 * while the line's own cascaded `display` is not `none`; `blocked` names
 * why the box cannot change whether the line is drawn (`null`: it can).
 */
export interface LineToggle {
  readonly checked: boolean;
  readonly blocked: string | null;
}

const BROADER =
  "A style statement selecting more than this line hides it; change it in the Manifest tab.";
const HOLDER_HIDDEN = "An element holding this line is hidden, and the line with it.";

/** An address as a selector names it: a `part`, where it has one, never empty. */
type SelectedAddress = NonNullable<Selector["addresses"]>[number];

/** The address of the cross-section line of the named timestamp `id`, as a selector names it. */
function lineAddress(id: string): SelectedAddress {
  const { part = [], ...owner } = partAddress(idAddress(id), "line");
  const [word, ...more] = part;
  if (word === undefined) throw new Error("a part's address has a part");
  return { ...owner, part: [word, ...more] };
}

/**
 * The elements holding the element `keys[index]`, innermost first: going
 * back through the tree's pre-order list, each the nearest earlier element
 * whose own holder chain, ended by its type, is the chain still sought. A
 * segment without a type adds nothing to a chain and is never found.
 */
function holdersOf(keys: readonly ElementKey[], index: number): ElementKey[] {
  const holders: ElementKey[] = [];
  let chain = keys[index]?.inside ?? [];
  for (let at = index - 1; at >= 0 && chain.length > 0; at -= 1) {
    const key = keys[at];
    if (key === undefined || key.type === null || key.inside.length + 1 !== chain.length) continue;
    const own = [...key.inside, key.type];
    if (own.every((type, n) => type === chain[n])) {
      holders.push(key);
      chain = key.inside;
    }
  }
  return holders;
}

/** The line `id` in block `block` of `view`: whether its own display shows it, whether it is drawn, and a hidden element holding it. */
interface LineState {
  readonly own: boolean;
  readonly drawn: boolean;
  readonly hiddenHolder: ElementKey | null;
}

/**
 * The state of the cross-section line of the named timestamp `id` in
 * `block`. Its own display is layout's cascade of the layers the block is
 * drawn with, resolved for each drawing of the line in the manifest's tree;
 * `display` is not inherited, so no holder's style takes part. It is drawn
 * when the block's drawing holds it.
 */
function lineState(view: View, block: Block, id: string, metrics: FontMetrics): LineState {
  const { manifest } = block;
  const cascade = new Cascade(styleLayers(view.graphical, manifest), timelineAncestry(manifest));
  const shows = (key: ElementKey) => cascade.resolve(key, undefined).display !== "none";
  const line = addressKey(lineAddress(id));
  const keys = manifestElements(manifest);
  const drawings = keys.flatMap((key, index) =>
    key.type === "cross_section" && addressKey(key.address) === line ? [index] : [],
  );
  const own = drawings.some((index) => {
    const key = keys[index];
    return key !== undefined && shows(key);
  });
  const drawn = drawingOf(block, view.graphical, metrics).elements.some(
    (element) => element.type === "cross_section" && addressKey(element.address) === line,
  );
  const hiddenHolder =
    drawings.flatMap((index) => holdersOf(keys, index)).find((holder) => !shows(holder)) ?? null;
  return { own, drawn, hiddenHolder };
}

/** Why the line is not drawn although its own display shows it: the hidden element holding it, named. */
function hiddenWith(view: View, block: string, state: LineState): string {
  if (state.hiddenHolder === null) return HOLDER_HIDDEN;
  const subject = inspectedSubject(view, selectionOf([inBlock(block, state.hiddenHolder.address)]));
  if (subject === null) return HOLDER_HIDDEN;
  const named = [subject.words, subject.name ?? subject.id].filter((word) => word !== null);
  return `${named.join(" ")} is hidden, and the line with it.`;
}

/**
 * The checkbox of the cross-section line of the named timestamp `address`
 * (its block drawn with `metrics`). Checked while the line's own display
 * shows it. A checked box is blocked while the line is not drawn all the
 * same (an element holding it is hidden); an unchecked one while the
 * line's own statement unset (`showLine`'s `display: null`, previewed)
 * would leave it hidden: by a statement selecting more than the line, or
 * by a hidden element holding it.
 */
export function lineToggle(view: View, address: Address, metrics: FontMetrics): LineToggle {
  const block = address.block === undefined ? undefined : view.blocks[address.block];
  const { id } = address;
  if (block === undefined || id === undefined) return { checked: false, blocked: null };
  const now = lineState(view, block, id, metrics);
  if (now.own) {
    return { checked: true, blocked: now.drawn ? null : hiddenWith(view, block.id, now) };
  }
  const shown = preview(view, lineStyle(block.id, id, true));
  const after = isCommandError(shown) ? undefined : shown.blocks[block.id];
  if (isCommandError(shown) || after === undefined) {
    return { checked: false, blocked: isCommandError(shown) ? shown.message : null };
  }
  const state = lineState(shown, after, id, metrics);
  if (!state.own) return { checked: false, blocked: BROADER };
  return { checked: false, blocked: state.drawn ? null : hiddenWith(shown, block.id, state) };
}

/** The line's part of `pin`'s timestamp as a bare value on its own axis. */
function coordinateOf(pin: Pin): Json {
  const [line] = pin.timestamp.parts;
  if (line === undefined) throw new Error("a timestamp has its line's part");
  return toAxisValue({ unit: line.unit, numberType: line.numberType, value: line.position });
}

/** The address of `pin`'s named timestamp. */
function namedAddress(pin: Pin): Address {
  if (pin.named === null) throw new Error("the pin shows no named timestamp");
  return { block: pin.spec.block, id: pin.named };
}

/** The `add` naming the unnamed `pin`: a timestamp `name` at its line's coordinate, into its line's timeline. */
export function addTimestamp(pin: Pin, name: string): Command {
  return {
    type: "add",
    into: { block: pin.spec.block, id: pin.spec.line.timeline },
    timestamp: { name, coordinate: coordinateOf(pin) },
  };
}

/** The `set` renaming the named timestamp `pin` shows. */
export function renameTimestamp(pin: Pin, name: string): Command {
  return { type: "set", changes: [{ target: namedAddress(pin), values: { name } }] };
}

/** The `set` moving the named timestamp to the coordinate of `moved`, its pin moved (`pinAt`). */
export function moveTimestamp(moved: Pin): Command {
  return {
    type: "set",
    changes: [{ target: namedAddress(moved), values: { coordinate: coordinateOf(moved) } }],
  };
}

/** The `style` showing (`display` unstated) or hiding (`none`) the cross-section line of the named timestamp `id` of `block`. */
function lineStyle(block: string, id: string, shown: boolean): Command {
  return {
    type: "style",
    select: { addresses: [lineAddress(id)] },
    set: { display: shown ? null : "none" },
    blocks: [block],
  };
}

/** The `style` showing (`display` unstated) or hiding (`none`) the named timestamp's cross-section line. */
export function showLine(pin: Pin, shown: boolean): Command {
  const { block, id } = namedAddress(pin);
  if (block === undefined || id === undefined) throw new Error("a named timestamp has an address");
  return lineStyle(block, id, shown);
}

/** The `remove` deleting the named timestamp `pin` shows. */
export function removeTimestamp(pin: Pin): Command {
  return { type: "remove", targets: [namedAddress(pin)] };
}

/** The ID of the timestamp of block `block` that `after` holds and `before` does not; `null` for none. */
export function addedTimestamp(before: View, after: View, block: string): string | null {
  const ids = (view: View) =>
    (view.blocks[block]?.manifest.graphical?.timestamps ?? []).map((item) => item.id);
  const known = new Set(ids(before));
  return ids(after).find((id) => !known.has(id)) ?? null;
}
