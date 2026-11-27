/**
 * The Properties form: the containers the selected subjects name, the
 * fields they offer, the values the fields show and the one `set` an edit
 * dispatches. The block (its whole drawing) edits the block's placement;
 * an item, a frame or a card held by the block, edits the place its block
 * states for it; a card held by a frame edits its frame's shared
 * scale and length and its own card place. Values are read from the
 * drawing the canvas shows, so a field shows what is drawn where nothing
 * is stated. The command is the arranger's `placeEdit`, the edit a gesture
 * at the same level makes; a field is offered only where the level edits
 * it. A band selected alone shows read-only rows instead (`bandRows`), and
 * so does a region (`regionRows`).
 * Above them, the name of the inspected thing (`nameOf`), and beside the
 * container size the stored lock of the inspected timelines (`lockOf`).
 */

import type {
  DeleteQuestion,
  Editing,
  LivePlacement,
  Pane,
  PlaceField,
  PlaceProperty,
  Subject,
} from "@timetoalign/tilie-arranger";
import {
  blockBox,
  boxOf,
  changedPlace,
  drawingOf,
  editedSelection,
  fieldsOf,
  isHeld,
  isItem,
  keyedBox,
  levelOf,
  placeEdit,
  selectionOf,
  shownValues,
} from "@timetoalign/tilie-arranger";
import type {
  Address,
  Block,
  Change,
  CommandError,
  ContainerKind,
  Holding,
  Manifest,
  PlaceKey,
  RemoveCommand,
  ResolvedAddress,
  SetCommand,
  StyleCommand,
  View,
} from "@timetoalign/tilie-core";
import {
  addressKey,
  addressWords,
  assertNever,
  bandAddress,
  FlowMapError,
  idAddress,
  inBlock,
  isCommandError,
  isComputedFlowMap,
  placeAt,
  placeKeyText,
  prettyText,
  resolveAddress,
  resolveFlowMap,
  WORKSPACE,
  withPlaceAt,
} from "@timetoalign/tilie-core";
import type { Coordinate } from "@timetoalign/tilie-core/numbers";
import { axisCoordinate, subtractCoordinates } from "@timetoalign/tilie-core/numbers";
import { fontMetrics } from "@timetoalign/timetoshare";
import type { Ask } from "../ConfirmDialog.svelte";
import type { Result } from "./problems.ts";
import { InspectorCode, refused } from "./problems.ts";
import { bandWord } from "./words.ts";

/**
 * What a selected container is to the form: the block, whose placement is
 * its own; an item, a frame or a card held by the block, placed freely in
 * the block; or a card held by a frame. Containers of one role are edited
 * together.
 */
export type Role = "block" | "item" | "held";

/** The step of each property's spin buttons, stepping keys and wheel. */
export const STEPS: { readonly [property in PlaceProperty]: number } = {
  x: 1,
  y: 1,
  scale: 0.1,
  length: 1,
  spacing: 1,
  margin: 1,
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
  block: "Block",
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
  readonly address: Address;
  /** The place key of its drawn box, `null` for the block. */
  readonly box: PlaceKey | null;
  readonly values: Values;
}

/** What the form edits: containers of one role, all in one block. */
export interface Geometry {
  readonly role: Role;
  readonly block: Block;
  /** The innermost open editor the form edits in, `null` on the arranger: its level and its frame. */
  readonly editing: Editing | null;
  /** The fields the form shows, in order, and which of them the level edits (`fieldsOf`). */
  readonly fields: readonly PlaceField[];
  /** The form's accessible name. */
  readonly label: string;
  /** Each container once, in selection order. */
  readonly elements: readonly Edited[];
  /** The canvas's pane, which every drawing an edit reads is drawn at; `undefined` for layout's default view. */
  readonly pane: Pane | undefined;
}

/** What the canvas shows of a block: its placement and its drawing, a gesture's while one runs. */
export type Shown = Omit<LivePlacement, "id">;

/**
 * What the canvas shows of `block` in `view`: `placement` while a gesture
 * shows it for the block, else the stored placement drawn at `pane`.
 */
export function shownOf(
  view: View,
  block: Block,
  placement: LivePlacement | null,
  pane: Pane | undefined,
): Shown {
  if (placement?.id === block.id) return placement;
  return { ...block, drawing: drawingOf(block, view.graphical, fontMetrics, undefined, pane) };
}

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
  editing: Editing | null,
  pane?: Pane,
): Geometry | null {
  const level = levelOf(editing);
  const found = new Map<string | null, Edited>();
  let role: Role | null = null;
  let fields: readonly PlaceField[] = [];
  for (const subject of subjects) {
    if (subject.kind === "band") continue;
    if (subject.block !== block.id || subject.box === null) return null;
    // The same container as the shown drawing records it, a gesture's while one runs.
    const { key } = subject.box;
    const box = key === null ? blockBox(shown.drawing) : keyedBox(shown.drawing, key);
    if (box === undefined) return null;
    const own: Role | null =
      box.kind === "block" ? "block" : isItem(box) ? "item" : isHeld(box) ? "held" : null;
    if (own === null || (role !== null && own !== role)) return null;
    role = own;
    fields = fieldsOf(box, level);
    const text = box.key === null ? null : placeKeyText(box.key);
    if (found.has(text)) continue;
    const values: Values =
      isItem(box) || isHeld(box) ? shownValues(shown.drawing, box) : placementOf(shown);
    const holder = box.kind !== "card" ? null : own === "held" ? "frame" : "block";
    found.set(text, { kind: box.kind, holder, address: subject.address, box: box.key, values });
  }
  const elements = [...found.values()];
  const [first] = elements;
  if (role === null || first === undefined) return null;
  const nouns = new Set(elements.map((element) => NOUNS[element.kind]));
  return {
    role,
    block,
    editing,
    fields,
    label: nouns.size === 1 ? `${NOUNS[first.kind]} properties` : "Frame and card properties",
    elements,
    pane,
  };
}

/** The block's placement as `shown` shows it: the values of the block. */
function placementOf(shown: Shown): Values {
  const { x, y, scale, length, spacing, margin, width, height } = shown;
  return { x, y, scale, length, spacing, margin, width, height };
}

/** One read-only row of the Properties tab: what it names and the value it shows. */
interface PropertyRow {
  readonly label: string;
  readonly value: string;
}

/**
 * The read-only rows of the band the subjects name when they are exactly
 * one band, read as `shown` draws it: "Band", its facet's word; "Level",
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
  const { at, facet } = subject.resolved;
  const band = boxOf(shown.drawing, bandAddress(at.timeline.id, facet))?.band;
  if (band === undefined) return null;
  const { level, elements } = band;
  return [
    { label: "Band", value: bandWord(facet) },
    { label: "Level", value: level < 0 ? `−${-level}` : String(level) },
    { label: "Elements", value: String(elements) },
  ];
}

/** The region `resolved` names: itself, or the region a part (its label) belongs to. */
function regionIn(
  resolved: ResolvedAddress,
): { readonly id: string; readonly rows: readonly PropertyRow[] } | null {
  if (resolved.kind === "part") return regionIn(resolved.owner);
  if (resolved.kind !== "entry" || resolved.entry !== "region") return null;
  const { at, element } = resolved;
  const { timeline } = at;
  if (!("start" in element)) return null;
  const start = axisCoordinate(element.start, timeline);
  const end = axisCoordinate(element.end, timeline);
  const text = (coordinate: Coordinate) =>
    prettyText(coordinate.value, timeline.number_type, timeline.unit);
  return {
    id: element.id,
    rows: [
      { label: "Start", value: text(start) },
      { label: "End", value: text(end) },
      { label: "Length", value: text(subtractCoordinates(end, start)) },
    ],
  };
}

/**
 * The read-only rows of the one region the subjects name, itself or by its
 * label, on its timeline's axis in pretty text: "Start", "End" and
 * "Length", the end less the start, exact in the axis's number type.
 * `null` for any other selection, two regions included.
 */
export function regionRows(subjects: readonly Subject[]): readonly PropertyRow[] | null {
  const [first, ...others] = subjects.map((subject) => regionIn(subject.resolved));
  if (first === undefined || first === null) return null;
  return others.every((other) => other?.id === first.id) ? first.rows : null;
}

/** The chunk `resolved` names: itself, or the chunk a part (its label, leader or boundary) belongs to. */
function chunkIn(
  resolved: ResolvedAddress,
): Extract<ResolvedAddress, { readonly kind: "chunk" }> | null {
  if (resolved.kind === "part") return chunkIn(resolved.owner);
  return resolved.kind === "chunk" ? resolved : null;
}

/** The pretty text of a stretch of an axis, `start – end` (U+2013 EN DASH). */
function stretchText({ start, end }: { readonly start: Coordinate; readonly end: Coordinate }) {
  const text = (coordinate: Coordinate) =>
    prettyText(coordinate.value, coordinate.numberType, coordinate.unit);
  return `${text(start)} – ${text(end)}`;
}

/**
 * The facts of the chunk `chunk` (TimeToShare's `docs/drawing.md`, section
 * 8.10), read-only: which entry of its FlowMap it plays ("Entry", `k + 1`
 * of the entries, as the Journal counts chunks), the FlowMap, the entry's
 * source in words ("Gap" for a gap), the stretch it plays as written
 * ("Written", on the FlowMap's root's axis, a virtual timeline's on its
 * own), where it lies on the played axis ("Played") and, for an entry with
 * a source, which of the entries naming that source it is ("Occurrence").
 * Only the first two where the FlowMap does not resolve.
 */
function chunkFacts(
  view: View,
  chunk: Extract<ResolvedAddress, { readonly kind: "chunk" }>,
): readonly PropertyRow[] {
  const { block, flowMap } = chunk;
  const map = flowMap.flowMap;
  const rows: PropertyRow[] = [
    { label: "Entry", value: `${chunk.chunk + 1} of ${map.chunks.length}` },
    { label: "FlowMap", value: map.name ?? map.id },
  ];
  let resolved: ReturnType<typeof resolveFlowMap>;
  try {
    resolved = resolveFlowMap(block.manifest, map.id);
  } catch (error) {
    if (error instanceof FlowMapError) return rows;
    throw error;
  }
  const entry = resolved.chunks[chunk.chunk];
  if (entry === undefined) return rows;
  const { source, written } = entry;
  const words = source === null ? "Gap" : addressWords(view, inBlock(block.id, idAddress(source)));
  rows.push({ label: "Source", value: words.charAt(0).toUpperCase() + words.slice(1) });
  if (written !== null) rows.push({ label: "Written", value: stretchText(written) });
  rows.push({ label: "Played", value: stretchText(entry.played) });
  if (source !== null) {
    const same = resolved.chunks.filter(
      (item) => item.source === source && item.kind === entry.kind,
    );
    const at = same.findIndex((item) => item.index === entry.index);
    rows.push({ label: "Occurrence", value: `${at + 1} of ${same.length}` });
  }
  return rows;
}

/**
 * The read-only facts of the one chunk the subjects name, itself or by its
 * label, leader or boundary (`chunkFacts`); `null` for any other selection,
 * two chunks included. A chunk offers no display switch of its own: the
 * sources are turned on per band, for every chunk, in its virtual
 * timeline's band list.
 */
export function chunkRows(view: View, subjects: readonly Subject[]): readonly PropertyRow[] | null {
  const [first, ...others] = subjects.map((subject) => chunkIn(subject.resolved));
  if (first === undefined || first === null) return null;
  const key = chunkKeyOf(first);
  return others.every((other) => other !== null && chunkKeyOf(other) === key)
    ? chunkFacts(view, first)
    : null;
}

/** The address key of `chunk`, `{block, id: V, part: [k]}`, `V` the line it is drawn on. */
function chunkKeyOf(chunk: Extract<ResolvedAddress, { readonly kind: "chunk" }>): string {
  const { line } = chunk;
  const id = line.kind === "timeline" ? line.at.timeline.id : line.virtual.id;
  return addressKey(inBlock(chunk.block.id, { id, part: [chunk.chunk] }));
}

/**
 * The `remove` deleting the one virtual timeline the subjects name, by its
 * own address or by its card's: its statement withdrawn, its FlowMap kept
 * (the Properties tab's "Delete virtual timeline"; Delete on the canvas
 * only hides a virtual card). Where other virtual timelines are made from
 * it, the arranger's `deleteQuestion` asks first (`askDeletion`). `null`
 * for any other selection.
 */
export function virtualDeletionOf(subjects: readonly Subject[]): RemoveCommand | null {
  const [subject, ...others] = subjects;
  if (subject === undefined || others.length > 0) return null;
  const { resolved } = subject;
  if (resolved.kind !== "virtual_timeline" && resolved.kind !== "virtual_card") return null;
  return { type: "remove", targets: [inBlock(resolved.block.id, idAddress(resolved.virtual.id))] };
}

/** The answers of the deletion dialog (`askDeletion`), in the order shown. */
const DELETE_ALL = "Delete all";
const HIDE_INSTEAD = "Hide instead";
const CANCEL = "Cancel";

/**
 * Ask `question` through `ask`, the focus on Cancel: "Delete all", offered
 * only where its `remove` is not `null` (core would refuse it otherwise,
 * and the question says why), gives that `remove`; "Hide instead", offered
 * only where its `hide` is not `null`, that command (a virtual card's
 * `set`, a root's `style`); Cancel or a dismissed dialog `null`, storing
 * nothing. The one dialog of a deletion that also deletes virtual
 * timelines, on the canvas and in the Properties tab alike.
 */
export async function askDeletion(
  ask: Ask,
  { question, remove, hide }: DeleteQuestion,
): Promise<RemoveCommand | SetCommand | StyleCommand | null> {
  const choices = [
    ...(remove === null ? [] : [DELETE_ALL]),
    ...(hide === null ? [] : [HIDE_INSTEAD]),
    CANCEL,
  ];
  const answer = await ask(question, choices, CANCEL);
  if (answer === DELETE_ALL) return remove;
  return answer === HIDE_INSTEAD ? hide : null;
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
 * the notice the message bar shows of it (`null` for none), or why it was
 * refused.
 */
export type Edit = Result<{ readonly command: SetCommand | null; readonly notice: string | null }>;

/**
 * The smallest `property` (`width` or `height`) an element takes: its
 * content's own extent, the size it is drawn with when it states none, read
 * from the stored block drawn without that request.
 */
function minimumOf(
  view: View,
  block: Block,
  element: Edited,
  property: "width" | "height",
  pane: Pane | undefined,
) {
  const stored = view.blocks[block.id] ?? block;
  if (element.box === null) {
    return drawingOf(stored, view.graphical, fontMetrics, { [property]: null }, pane)[property];
  }
  const box = keyedBox(
    drawingOf(stored, view.graphical, fontMetrics, undefined, pane),
    element.box,
  );
  if (box === undefined || !(isItem(box) || isHeld(box))) {
    throw new Error(`${placeKeyText(element.box)} is drawn as a frame or a card`);
  }
  const { [property]: _request, ...place } = placeAt(stored.places, box.key) ?? {};
  const places = withPlaceAt(stored.places, box.key, place);
  const drawing = drawingOf(stored, view.graphical, fontMetrics, { places }, pane);
  const content = keyedBox(drawing, element.box);
  if (content === undefined || !(isItem(content) || isHeld(content))) {
    throw new Error(`${placeKeyText(element.box)} is drawn without its request`);
  }
  return shownValues(drawing, content)[property] ?? 0;
}

/** The notice the message bar shows when a size below its minimum is replaced by it. */
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
  const addresses = selectionOf(geometry.elements.map((element) => element.address));
  return editOf(
    placeEdit(view, addresses, property, value, geometry.editing, fontMetrics, geometry.pane),
    null,
  );
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
    const minimum = minimumOf(view, geometry.block, element, property, geometry.pane);
    const own = (current: number | null) => {
      const next = given(current);
      if (next === null || next > minimum) return next;
      if (next < minimum) raised = Math.max(raised ?? minimum, minimum);
      return element.box === null ? minimum : null;
    };
    const addresses = selectionOf([element.address]);
    const command = placeEdit(
      view,
      addresses,
      property,
      own,
      geometry.editing,
      fontMetrics,
      geometry.pane,
    );
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
  const drawing = drawingOf(block, view.graphical, fontMetrics, undefined, geometry.pane);
  // The place a change states (`changedPlace`), by its key; `null` for the block's own members.
  const placeOf = (change: Change): string | null => {
    const key = changedPlace(change);
    return key === null ? null : placeKeyText(key);
  };
  const keyText = (key: PlaceKey | null): string | null =>
    key === null ? null : placeKeyText(key);
  const edited = new Set<string | null>();
  for (const element of geometry.elements) {
    const box = element.box === null ? undefined : keyedBox(drawing, element.box);
    edited.add(keyText(element.box));
    if (box !== undefined && isHeld(box)) edited.add(keyText(box.holder));
  }
  const changes = edits.map(({ element, command }) => {
    const own = keyText(element.box);
    const change = command.changes.find((item) => placeOf(item) === own);
    if (change === undefined) {
      throw new Error(`the edit of ${addressKey(element.address)} names no own place`);
    }
    return change;
  });
  const others = first.command.changes.filter((change) => !edited.has(placeOf(change)));
  return { type: "set", changes: [...changes, ...others] };
}

/**
 * The command setting one property of every element from the field's text:
 * a decimal number, or null for an empty `width` or `height` (a block's
 * size left to its content, a place's size unstated); anything else is
 * refused before dispatch, at `[<first address's key>, property]`. `null` when
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
  const path = [
    addressKey(geometry.elements[0]?.address ?? { block: geometry.block.id }),
    property,
  ];
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
  /** The target of the `set` naming it: the workspace, a block (its manifest), or an element. */
  readonly target: Address;
  readonly name: string | null;
  /** Whether an empty text unstates the name (`null`); the workspace's name is never empty. */
  readonly nullable: boolean;
  /** The manifest the name lies in; `null` for the workspace's. */
  readonly manifest: Manifest | null;
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
      return {
        target: { block: resolved.block.id },
        name: manifest.name,
        nullable: true,
        manifest,
      };
    }
    case "frame": {
      const { block, group } = resolved;
      const target = inBlock(block.id, idAddress(group.id));
      return { target, name: group.name, nullable: true, manifest: block.manifest };
    }
    case "timeline":
    case "card": {
      const { block, at } = resolved;
      const target = inBlock(block.id, idAddress(at.timeline.id));
      return { target, name: at.timeline.name, nullable: true, manifest: block.manifest };
    }
    case "entry": {
      const { block, element } = resolved;
      const target = inBlock(block.id, idAddress(element.id));
      return { target, name: element.name, nullable: true, manifest: block.manifest };
    }
    case "measure_map": {
      const { block, map } = resolved;
      const target = inBlock(block.id, idAddress(map.id));
      return { target, name: map.name, nullable: true, manifest: block.manifest };
    }
    case "timestamp": {
      const { block, timestamp } = resolved;
      const target = inBlock(block.id, idAddress(timestamp.id));
      return {
        target,
        name: timestamp.name ?? null,
        nullable: timestamp.matchstamp,
        manifest: block.manifest,
      };
    }
    case "matchstamp": {
      const { block, matchstamp } = resolved;
      const target = inBlock(block.id, idAddress(matchstamp.id));
      return { target, name: matchstamp.name, nullable: false, manifest: block.manifest };
    }
    case "elision": {
      const { block, elision } = resolved;
      const target = inBlock(block.id, idAddress(elision.id));
      return { target, name: elision.name ?? null, nullable: true, manifest: block.manifest };
    }
    case "flow_map": {
      // A computed FlowMap refuses every change, its name included.
      const { block, flowMap } = resolved;
      if (isComputedFlowMap(flowMap)) return null;
      const target = inBlock(block.id, idAddress(flowMap.id));
      return { target, name: flowMap.name ?? null, nullable: true, manifest: block.manifest };
    }
    case "virtual_timeline":
    case "virtual_card": {
      const { block, virtual } = resolved;
      const target = inBlock(block.id, idAddress(virtual.id));
      return { target, name: virtual.name ?? null, nullable: true, manifest: block.manifest };
    }
    case "anchor":
    case "virtual_band":
    case "chunk":
    case "chunk_band":
      return null;
    case "part":
      // A default elision is a part of its timeline, and has no name of its own.
      return resolved.word === "elision" ? null : namedBy(resolved.owner);
  }
}

/**
 * The name the Properties tab shows first: with nothing selected, the
 * workspace's at the top level, and in an editor the edited element's (the
 * address its opening selects, `editedSelection`); else the one inspected
 * thing's. Each wherever the schema gives it a name (the block's manifest, a
 * group, a measure map, a timeline or its card, a conversion map, a region,
 * a flow-control element, a named timestamp, a MatchStamp, a stored elision,
 * a FlowMap made by hand, a virtual timeline or its card;
 * a part names its element's, a default elision none); a match timestamp's
 * and an elision's name may be emptied, a named timestamp's and a
 * MatchStamp's not; `null` for a band, an alignment anchor, a computed
 * FlowMap (which refuses every change), a chunk or several things.
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
  const [edited] = editedSelection(view, editing).values();
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
    case "workspace":
    case "block":
    case "title":
    case "frame":
    case "band":
    case "entry":
    case "measure_map":
    case "timestamp":
    case "matchstamp":
    case "anchor":
    case "elision":
    case "flow_map":
    case "virtual_timeline":
    case "virtual_card":
    case "virtual_band":
    case "chunk":
    case "chunk_band":
      return null;
    default:
      return assertNever(resolved);
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
    locks.set(addressKey(inBlock(subject.block, idAddress(timeline.id))), timeline.locked);
  }
  const values = new Set(locks.values());
  if (values.size === 0) return null;
  const mixed = values.size > 1;
  return { checked: !mixed && values.has(true), mixed };
}
