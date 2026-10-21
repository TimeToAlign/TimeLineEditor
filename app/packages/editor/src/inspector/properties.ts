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
 * Above them, the name of the inspected thing (`nameOf`), and beside the
 * container size the stored lock of the inspected timelines (`lockOf`).
 */

import type {
  Editing,
  Level,
  LivePlacement,
  PlaceField,
  PlaceProperty,
  Subject,
} from "@timetoalign/tilie-arranger";
import {
  boxOf,
  drawingOf,
  editedSelection,
  fieldsOf,
  isHeld,
  isItem,
  placeEdit,
  placeTarget,
  shownValues,
} from "@timetoalign/tilie-arranger";
import type {
  Address,
  Block,
  CommandError,
  ContainerKind,
  Holding,
  Manifest,
  ResolvedAddress,
  SetCommand,
  View,
} from "@timetoalign/tilie-core";
import {
  elementAddress,
  isCommandError,
  qualify,
  resolveAddress,
  WORKSPACE,
} from "@timetoalign/tilie-core";
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
  spacing: 1,
  width: 1,
  height: 1,
};

/** Properties that take an empty field as null: a block's own size, or an unstated size. */
const NULLABLE: ReadonlySet<PlaceProperty> = new Set(["width", "height"]);

/** The words of the container's size, wherever a field, a refusal, a notice or a journal row names it. */
const SIZE_WORDS: { readonly [property in "width" | "height"]: string } = {
  width: "container width",
  height: "container height",
};

/** Whether `property` is the container's size, which stands in one row with the Locked checkbox. */
export function isSize(property: string): property is "width" | "height" {
  return property === "width" || property === "height";
}

/** The word naming `property`, a member a `set` gives, for the viewer. */
export function propertyWord(property: string): string {
  return isSize(property) ? SIZE_WORDS[property] : property;
}

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
  /** The address of its drawn box, `null` for the block's own. */
  readonly box: string | null;
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
    const at = box.kind === "box" ? null : box.address;
    found.set(box.address, { kind: box.kind, holder, address: subject.address, box: at, values });
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
 * one drawing, or in the cards of several groups, has several records under
 * one address; the first, in drawing order, is shown. `null` for any other selection.
 */
export function bandRows(
  subjects: readonly Subject[],
  shown: Shown,
): readonly PropertyRow[] | null {
  const [subject, ...others] = subjects;
  if (subject === undefined || others.length > 0 || subject.resolved.kind !== "band") return null;
  const [drawn] = subject.resolved.containers;
  const band = drawn?.address == null ? undefined : boxOf(shown.drawing, drawn.address)?.band;
  if (band === undefined) return null;
  const { kind, level, elements } = band;
  return [
    { label: "Band", value: bandWord(kind) },
    { label: "Level", value: level < 0 ? `−${-level}` : String(level) },
    { label: "Elements", value: String(elements) },
  ];
}

/**
 * A field's label: the size is the container's ("container width",
 * "container height"); a held card names the fields its frame's place holds
 * as the group's.
 */
export function fieldLabel(role: Role, { property, written }: PlaceField): string {
  return role === "held" && written === "item" ? `group ${property}` : propertyWord(property);
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

/**
 * What an edit gives: the one `set` (`null` when it changes nothing) with
 * what the status line says of it (`null` for nothing), or why it was
 * refused.
 */
export type Edit = Result<{ readonly command: SetCommand | null; readonly notice: string | null }>;

/**
 * The smallest `property` (`width` or `height`) an element takes: its
 * content's own extent, the size it is drawn with when it states none, read
 * from the stored block drawn without that request.
 */
function minimumOf(view: View, block: Block, element: Edited, property: "width" | "height") {
  const stored = view.blocks[block.id] ?? block;
  if (element.box === null) {
    return drawingOf(stored, view.settings, fontMetrics, { [property]: null })[property];
  }
  const box = boxOf(drawingOf(stored, view.settings, fontMetrics), element.box);
  if (box === undefined || box.key === null || !(isItem(box) || isHeld(box))) {
    throw new Error(`${element.box} is drawn as a frame or a card`);
  }
  const { [property]: _request, ...place } = stored.places[box.key] ?? {};
  const places = { ...stored.places, [box.key]: place };
  const drawing = drawingOf(stored, view.settings, fontMetrics, { places });
  const content = boxOf(drawing, element.box);
  if (content === undefined || !(isItem(content) || isHeld(content))) {
    throw new Error(`${element.box} is drawn without its request`);
  }
  return shownValues(drawing, content)[property] ?? 0;
}

/** What the status line says when a size below its minimum is replaced by it. */
export function belowMinimum(property: "width" | "height", minimum: number): string {
  return `To decrease the ${property} below ${shownValue(minimum)} px, decrease the size of the contained elements first.`;
}

/** A value, or what it gives an element's own value (stated, else drawn). */
type Given = number | null | ((current: number | null) => number | null);

/** `command` as an edit saying `notice`, or its refusal. */
function editOf(command: SetCommand | null | CommandError, notice: string | null): Edit {
  return isCommandError(command)
    ? { ok: false, problems: [command] }
    : { ok: true, value: { command, notice } };
}

/**
 * The arranger's edit of `property` of every element to `value`, or to
 * what `value` gives each element's own value (stated, else drawn), as the
 * gestures at the geometry's level write it; a size is held to each
 * element's minimum (`sizeEdit`).
 */
function edit(view: View, geometry: Geometry, property: PlaceProperty, value: Given): Edit {
  if (isSize(property)) return sizeEdit(view, geometry, property, value);
  const addresses = new Set(geometry.elements.map((element) => element.address));
  return editOf(placeEdit(view, addresses, property, value, geometry.level, fontMetrics), null);
}

/**
 * The edit of a size, each element held to its own minimum (`minimumOf`):
 * a value above it is written as given; at or below it, a frame or a card
 * states no size and is drawn at its content's own extent, the minimum, as
 * the Box gesture leaves it, while the block, whose size left unstated
 * shows no number, is given its minimum. One `set` of every element's own
 * edit (`joined`); the notice names the largest minimum a value below it
 * was replaced by.
 */
function sizeEdit(
  view: View,
  geometry: Geometry,
  property: "width" | "height",
  value: Given,
): Edit {
  const given = (current: number | null) => (typeof value === "function" ? value(current) : value);
  let raised: number | null = null;
  const edits: Own[] = [];
  for (const element of geometry.elements) {
    const minimum = minimumOf(view, geometry.block, element, property);
    const own = (current: number | null) => {
      const next = given(current);
      if (next === null || next > minimum) return next;
      if (next < minimum) raised = Math.max(raised ?? minimum, minimum);
      return element.box === null ? minimum : null;
    };
    const addresses = new Set([element.address]);
    const command = placeEdit(view, addresses, property, own, geometry.level, fontMetrics);
    if (isCommandError(command)) return editOf(command, null);
    if (command !== null) edits.push({ element, command });
  }
  const notice = raised === null ? null : belowMinimum(property, raised);
  return editOf(joined(view, geometry, edits), notice);
}

/** The `set` editing one element alone. */
interface Own {
  readonly element: Edited;
  readonly command: SetCommand;
}

/**
 * The `set` of every element's own edit, as one `placeEdit` of them all
 * gives it: each element's change of its own place, then the positions the
 * first edit states of the items it does not edit (where the level's items
 * lie freely, so that none of them moves), less those of every element,
 * edited or already holding its value, and of the frame holding a selected
 * card; `null` for no edit.
 */
function joined(view: View, geometry: Geometry, edits: readonly Own[]): SetCommand | null {
  const [first] = edits;
  if (first === undefined || geometry.elements.length === 1) return first?.command ?? null;
  const { id } = geometry.block;
  const block = view.blocks[id] ?? geometry.block;
  const drawing = drawingOf(block, view.settings, fontMetrics);
  const keyOf = (address: string | null) => {
    const key = address === null ? null : (boxOf(drawing, address)?.key ?? null);
    return key === null ? null : placeTarget(block, key);
  };
  const edited = new Set<string | null>();
  for (const element of geometry.elements) {
    const box = element.box === null ? undefined : boxOf(drawing, element.box);
    edited.add(keyOf(element.box));
    if (box !== undefined && isHeld(box)) edited.add(keyOf(box.holder));
  }
  const changes = edits.map(({ element, command }) => {
    const target = keyOf(element.box);
    const change = command.changes.find((item) => item.target === target);
    if (change === undefined) throw new Error(`the edit of ${element.address} names no own place`);
    return change;
  });
  const others = first.command.changes.filter((change) => !edited.has(change.target));
  return { type: "set", changes: [...changes, ...others] };
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
      : refused(InspectorCode.invalidValue, `${propertyWord(property)} needs a number`, path);
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

/** The name field of the Properties tab: whose name it edits, and the name stored. */
export interface NameField {
  /** The target of the `set` naming it: `workspace`, a block (its manifest), or an element. */
  readonly target: Address;
  readonly name: string | null;
  /** Whether an empty text unstates the name (`null`); the workspace's name is never empty. */
  readonly nullable: boolean;
  /** The manifest the name lies in; `null` for the workspace's. */
  readonly manifest: Manifest | null;
}

/** Where a timeline lies in its manifest, as the resolver locates it. */
type At = Extract<ResolvedAddress, { kind: "entry" }>["at"];

/** The id of the root whose tree holds the timeline at `at`. */
function rootId(at: At): string {
  return at.parent === undefined ? at.timeline.id : rootId(at.parent);
}

/** The name field of what `resolved` names, a part standing for its owner; `null` where the schema gives no name. */
function namedBy(resolved: ResolvedAddress): NameField | null {
  switch (resolved.kind) {
    case "workspace":
    case "band":
      return null;
    case "block":
    case "title": {
      const { manifest } = resolved.block;
      return { target: resolved.block.id, name: manifest.name, nullable: true, manifest };
    }
    case "frame": {
      const { block, group } = resolved;
      const target = qualify(block.id, group.id);
      return { target, name: group.name, nullable: true, manifest: block.manifest };
    }
    case "timeline":
    case "card": {
      const { block, at } = resolved;
      const target = qualify(block.id, at.timeline.id);
      return { target, name: at.timeline.name, nullable: true, manifest: block.manifest };
    }
    case "entry": {
      const { block, at, element } = resolved;
      const target = qualify(block.id, elementAddress(rootId(at), element.id));
      return { target, name: element.name, nullable: true, manifest: block.manifest };
    }
    case "measure_map": {
      const { block, map } = resolved;
      const target = qualify(block.id, map.id);
      return { target, name: map.name, nullable: true, manifest: block.manifest };
    }
    case "part":
      return namedBy(resolved.owner);
  }
}

/**
 * The name the Properties tab shows first: with nothing selected, the
 * workspace's at the top level, and in an editor the edited element's (the
 * address its opening selects, `editedSelection`); else the one inspected
 * thing's. Each wherever the schema gives it a name (the block's manifest, a
 * group, a measure map, a timeline or its card, a conversion map, a region,
 * a flow-control element; a part names its element's); `null` for a band or
 * several things.
 */
export function nameOf(
  view: View,
  subjects: readonly Subject[],
  editing: Editing | null,
): NameField | null {
  const [subject, ...others] = subjects;
  if (subject !== undefined) return others.length > 0 ? null : namedBy(subject.resolved);
  if (editing === null) {
    return { target: WORKSPACE, name: view.name, nullable: false, manifest: null };
  }
  const [edited] = editedSelection(view, editing);
  const resolved = edited === undefined ? undefined : resolveAddress(view, edited);
  return resolved === undefined || isCommandError(resolved) ? null : namedBy(resolved);
}

/**
 * The `set` naming `field`'s target `text`: an empty text unstates a
 * nullable name; `null` when the target holds that name already. The store
 * refuses an empty name for the workspace.
 */
export function nameCommand(field: NameField, text: string): SetCommand | null {
  const name = text === "" && field.nullable ? null : text;
  if (name === field.name) return null;
  return { type: "set", changes: [{ target: field.target, values: { name } }] };
}

/** What the Locked checkbox shows: the inspected timelines' stored `locked`, or "mixed". */
export interface LockShown {
  readonly checked: boolean;
  /** The timelines differ: the checkbox is indeterminate. */
  readonly mixed: boolean;
}

/** The timeline `resolved` names: itself, its card, or a part of either. */
function timelineOf(
  resolved: ResolvedAddress,
): { readonly id: string; readonly locked: boolean } | null {
  switch (resolved.kind) {
    case "timeline":
    case "card":
      return resolved.at.timeline;
    case "part":
      return timelineOf(resolved.owner);
    default:
      return null;
  }
}

/**
 * The lock of the inspected timelines, each read from the store once:
 * `null` unless every subject is a timeline, its card or a part of either
 * (only a timeline has `locked`).
 */
export function lockOf(subjects: readonly Subject[]): LockShown | null {
  const locks = new Map<string, boolean>();
  for (const subject of subjects) {
    const timeline = timelineOf(subject.resolved);
    if (timeline === null) return null;
    locks.set(`${subject.block}/${timeline.id}`, timeline.locked);
  }
  const values = new Set(locks.values());
  if (values.size === 0) return null;
  const mixed = values.size > 1;
  return { checked: !mixed && values.has(true), mixed };
}
