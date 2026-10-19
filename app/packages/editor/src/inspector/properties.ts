/**
 * The Properties form: the containers the selected subjects name, the
 * fields they offer, the values the fields show and the one `set` an edit
 * dispatches. The box (the block's whole drawing) edits the block's
 * placement; an item, a frame or a card held by the box, edits the place
 * its block states for it; a card held by a frame edits its frame's shared
 * scale and length and its own card place. Values are read from the
 * drawing the canvas shows, so a field shows what is drawn where nothing
 * is stated. The command is the arranger's `placeEdit`, the edit a gesture
 * at the same level makes; a field is offered only where the level edits
 * it. A band selected alone shows read-only rows instead (`bandRows`).
 */

import type {
  Level,
  LivePlacement,
  PlaceField,
  PlaceProperty,
  Subject,
} from "@timetoalign/tilie-arranger";
import {
  boxOf,
  fieldsOf,
  isHeld,
  isItem,
  placeEdit,
  shownValues,
} from "@timetoalign/tilie-arranger";
import type { Block, ContainerKind, Holding, SetCommand, View } from "@timetoalign/tilie-core";
import { isCommandError } from "@timetoalign/tilie-core";
import { fontMetrics } from "@timetoalign/timeskeleton";
import type { Result } from "./problems.ts";
import { InspectorCode, refused } from "./problems.ts";
import { bandWord } from "./words.ts";

/**
 * What a selected container is to the form: the box, whose placement is
 * the block's; an item, a frame or a card held by the box, placed freely
 * in the box; or a card held by a frame. Containers of one role are edited
 * together.
 */
export type Role = "box" | "item" | "held";

/** The step of each property's spin buttons, stepping keys and wheel. */
export const STEPS: { readonly [property in PlaceProperty]: number } = {
  x: 1,
  y: 1,
  scale: 0.1,
  length: 1,
  spacing: 0.1,
  width: 1,
  height: 1,
};

/** Properties that take an empty field as null: a block's own size, or an unstated size. */
const NULLABLE: ReadonlySet<PlaceProperty> = new Set(["width", "height"]);

/** The words naming a container of each kind in the form's accessible name. */
const NOUNS: { readonly [kind in ContainerKind]: string } = {
  box: "Block",
  frame: "Frame",
  card: "Card",
  band: "Band",
};

/** The exact value of each field a container's role shows: stated, else drawn. */
type Values = { readonly [property in PlaceProperty]?: number | null };

/** One selected container the form edits. */
export interface Edited {
  readonly kind: ContainerKind;
  /** How a card is held; `null` for any other container. */
  readonly holder: Holding | null;
  /** The selected address naming it (the first, when several name it). */
  readonly address: string;
  readonly values: Values;
}

/** What the form edits: containers of one role, all in one block. */
export interface Geometry {
  readonly role: Role;
  readonly block: Block;
  /** The level of the canvas the form edits at: the arranger, or the innermost editor's kind. */
  readonly level: Level;
  /** The fields the form shows, in order, and which of them the level edits (`fieldsOf`). */
  readonly fields: readonly PlaceField[];
  /** The form's accessible name. */
  readonly label: string;
  /** Each container once, in selection order. */
  readonly elements: readonly Edited[];
}

/** What the canvas shows of a block: its placement and its drawing, a gesture's while one runs. */
export type Shown = Omit<LivePlacement, "id">;

/**
 * The geometry the subjects name: every subject a container with a box of
 * its own in one block, all of one role, each read as `shown` draws it. A
 * timeline, or a part of a timeline or a group, names the card or frame
 * drawn for it. `null` for no subject, subjects in several blocks, of
 * different roles, or one without a box (a child drawn in no card of its
 * own, a region, a map, the title). Bands are left out.
 */
export function geometryOf(
  block: Block,
  subjects: readonly Subject[],
  shown: Shown,
  level: Level,
): Geometry | null {
  const found = new Map<string | null, Edited>();
  let role: Role | null = null;
  let fields: readonly PlaceField[] = [];
  for (const subject of subjects) {
    if (subject.kind === "band") continue;
    if (subject.block !== block.id || subject.box === null) return null;
    // The same container as the shown drawing records it, a gesture's while one runs.
    const box = boxOf(shown.drawing, subject.box.address);
    if (box === undefined) return null;
    const own: Role | null =
      box.kind === "box" ? "box" : isItem(box) ? "item" : isHeld(box) ? "held" : null;
    if (own === null || (role !== null && own !== role)) return null;
    role = own;
    fields = fieldsOf(box, level);
    if (found.has(box.address)) continue;
    const values: Values =
      isItem(box) || isHeld(box) ? shownValues(shown.drawing, box) : placementOf(shown);
    const holder = box.kind !== "card" ? null : own === "held" ? "frame" : "box";
    found.set(box.address, { kind: box.kind, holder, address: subject.address, values });
  }
  const elements = [...found.values()];
  const [first] = elements;
  if (role === null || first === undefined) return null;
  const nouns = new Set(elements.map((element) => NOUNS[element.kind]));
  return {
    role,
    block,
    level,
    fields,
    label: nouns.size === 1 ? `${NOUNS[first.kind]} properties` : "Frame and card properties",
    elements,
  };
}

/** The block's placement as `shown` shows it: the values of the box. */
function placementOf(shown: Shown): Values {
  const { x, y, scale, length, spacing, width, height } = shown;
  return { x, y, scale, length, spacing, width, height };
}

/** One read-only row of the Properties tab: what it names and the value it shows. */
interface PropertyRow {
  readonly label: string;
  readonly value: string;
}

/**
 * The read-only rows of the band the subjects name when they are exactly
 * one band, read as `shown` draws it: "Band", its kind's word; "Level",
 * signed, a negative one written with U+2212 MINUS SIGN; "Elements", the
 * displayed elements it holds directly. A timeline drawn with two lines in
 * one drawing has two records under one address; the first, in drawing
 * order, is shown. `null` for any other selection.
 */
export function bandRows(
  subjects: readonly Subject[],
  shown: Shown,
): readonly PropertyRow[] | null {
  const [subject, ...others] = subjects;
  if (subject === undefined || others.length > 0 || subject.resolved.kind !== "band") return null;
  const { address } = subject.resolved.container;
  const band = boxOf(shown.drawing, address)?.band;
  if (band === undefined) return null;
  const { kind, level, elements } = band;
  return [
    { label: "Band", value: bandWord(kind) },
    { label: "Level", value: level < 0 ? `−${-level}` : String(level) },
    { label: "Elements", value: String(elements) },
  ];
}

/** A field's label: a held card names the fields its frame's place holds as the group's. */
export function fieldLabel(role: Role, { property, written }: PlaceField): string {
  return role === "held" && written === "item" ? `group ${property}` : property;
}

/**
 * The value every element shows for `property`; `undefined` when they
 * differ (the field then shows none). Exact: only shown through `shownValue`.
 */
export function commonValue(
  geometry: Geometry,
  property: PlaceProperty,
): number | null | undefined {
  const [first, ...others] = geometry.elements.map((element) => element.values[property] ?? null);
  if (first === undefined) return undefined;
  return others.every((value) => value === first) ? first : undefined;
}

/**
 * A property's value as the form shows it: rounded to at most two decimals
 * (the exact double, as `toFixed` rounds it), trailing zeros trimmed, an
 * empty text for null. Only shown: commands are built from stored values
 * and typed text, never from this.
 */
export function shownValue(value: number | null): string {
  if (value === null) return "";
  // `String` shows the negative zero of `Number("-0.00")` as "0".
  return String(Number(value.toFixed(2)));
}

/** The decimals of a number's shortest spelling (`1e-7` has 7). */
function decimals(value: number): number {
  const [mantissa = "", exponent = "0"] = String(Math.abs(value)).split("e");
  return Math.max(0, (mantissa.split(".")[1] ?? "").length - Number(exponent));
}

/**
 * The value `direction` steps of `step` from `value` (null counts as 0),
 * rounded to the decimals of the value and the step, so 1 − 0.1 is 0.9
 * and 0.7 + 0.1 is 0.8, never the neighbouring double plain arithmetic gives.
 */
export function stepValue(value: number | null, direction: 1 | -1, step: number): number {
  const base = value ?? 0;
  const places = Math.min(100, Math.max(decimals(base), decimals(step)));
  return Number((base + direction * step).toFixed(places));
}

/** Decimal text a field accepts: an optional sign, digits with an optional point, an optional exponent. */
const DECIMAL = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;

/** The number of a field's decimal text, or `null` for any other text (`0x10`, `Infinity`). */
export function decimalOf(text: string): number | null {
  const trimmed = text.trim();
  if (!DECIMAL.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

/** What an edit gives: the one `set`, `null` when it changes nothing, or why it was refused. */
export type Edit = Result<SetCommand | null>;

/**
 * The arranger's edit of `property` of every element to `value`, or to
 * what `value` gives each element's own value (stated, else drawn), as the
 * gestures at the geometry's level write it.
 */
function edit(
  view: View,
  geometry: Geometry,
  property: PlaceProperty,
  value: number | null | ((current: number | null) => number | null),
): Edit {
  const addresses = new Set(geometry.elements.map((element) => element.address));
  const command = placeEdit(view, addresses, property, value, geometry.level, fontMetrics);
  return isCommandError(command)
    ? { ok: false, problems: [command] }
    : { ok: true, value: command };
}

/**
 * The command setting one property of every element from the field's text:
 * a decimal number, or null for an empty `width` or `height` (a block's
 * size left to its content, a place's size unstated); anything else is
 * refused before dispatch, at `[<first address>, property]`. `null` when
 * every element stores that value already: the commit changes nothing, and
 * the store refuses a `set` that changes nothing. The store's checks
 * decide everything else.
 */
export function propertyCommand(
  view: View,
  geometry: Geometry,
  property: PlaceProperty,
  input: string,
): Edit {
  const path = [geometry.elements[0]?.address ?? geometry.block.id, property];
  const trimmed = input.trim();
  if (trimmed === "") {
    return NULLABLE.has(property)
      ? edit(view, geometry, property, null)
      : refused(InspectorCode.invalidValue, `${property} needs a number`, path);
  }
  const value = decimalOf(trimmed);
  return value === null
    ? refused(InspectorCode.invalidValue, `${trimmed} is not a number`, path)
    : edit(view, geometry, property, value);
}

/**
 * The command stepping `property` of every element one step of `STEPS`
 * (`direction` ±1) from its own exact value (never from the rounded text
 * the field shows; null counts as 0), so elements of different values each
 * step from theirs.
 */
export function stepCommand(
  view: View,
  geometry: Geometry,
  property: PlaceProperty,
  direction: 1 | -1,
): Edit {
  return edit(view, geometry, property, (current) =>
    stepValue(current, direction, STEPS[property]),
  );
}
