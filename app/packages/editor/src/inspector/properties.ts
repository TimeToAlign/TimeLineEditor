/**
 * The Properties form: the geometry the selection names, the fields it
 * offers, the values they show and the one `set` an edit dispatches. A block
 * edits its placement; an item (a group's frame or an ungrouped root's card)
 * the place its block states for it; a group member's card its group's
 * shared scale and length and its own card size and vertical stretch. Values are read from the
 * block's drawing, the one the canvas shows (`drawingOf`, memoized per
 * block, or during a gesture the drawing the gesture shows), so a field shows
 * what is drawn where nothing is stated. An edit of a place follows the rule
 * of the canvas's gestures at the same level (`keepsItems`), a typed length or
 * spacing writing what a Stretch to it writes (`stretchChanges`), and a field
 * is offered only where the level edits it (`offered`). A band selected alone
 * shows read-only rows instead (`bandRows`).
 */

import type { Level, LivePlacement, PlaceValues, ResizedItem } from "@timetoalign/tilie-arranger";
import {
  drawingOf,
  keepsItems,
  placeCommand,
  placesWith,
  selectedBand,
  stretchChanges,
} from "@timetoalign/tilie-arranger";
import type { Block, Place, SetCommand, View, WorkspaceSettings } from "@timetoalign/tilie-core";
import { bandAddress, elementOf, isCommandError, parseAddress } from "@timetoalign/tilie-core";
import type { Drawing } from "@timetoalign/tilie-layout";
import { fontMetrics } from "@timetoalign/timeskeleton";
import { BAND_WORDS, withoutBands } from "./edit.ts";
import type { Result } from "./problems.ts";
import { InspectorCode, refused } from "./problems.ts";

/** Every property a form edits, in order. */
export const PROPERTIES = ["x", "y", "scale", "length", "spacing", "width", "height"] as const;
export type Property = (typeof PROPERTIES)[number];

/**
 * What the form edits: a block's placement, the place of an item (a group's
 * frame or an ungrouped root's card), or a group member's card.
 */
export type GeometryKind = "block" | "item" | "card";

/** The fields of an item: every member of its place. */
const ITEM_FIELDS = [
  "x",
  "y",
  "scale",
  "length",
  "spacing",
  "width",
  "height",
] as const satisfies readonly (keyof Place & Property)[];

/** The fields each kind offers, in order. */
export const FIELDS: { readonly [kind in GeometryKind]: readonly Property[] } = {
  block: PROPERTIES,
  item: ITEM_FIELDS,
  card: ["scale", "length", "spacing", "width", "height"],
};

/** The fields of a member's card that edit its group's place: the members share them. */
const SHARED: ReadonlySet<Property> = new Set(["scale", "length"]);

/** Whether a Stretch sets `property`: a typed value then writes what a Stretch to it writes. */
function stretched(property: Property): property is "length" | "spacing" {
  return property === "length" || property === "spacing";
}

/** The block's own fields, which a group or timeline editor refuses to change (a side effect). */
const BLOCK_FIELDS: ReadonlySet<Property> = new Set(["scale", "length", "spacing"]);

/** An item's position: items are moved in the bundle editor only. */
const POSITION: ReadonlySet<Property> = new Set(["x", "y"]);

/** The step of each property's spin buttons, stepping keys and wheel. */
export const STEPS: { readonly [property in Property]: number } = {
  x: 1,
  y: 1,
  scale: 0.1,
  length: 1,
  spacing: 0.1,
  width: 1,
  height: 1,
};

/** Properties that take an empty field as null: a block's own size, or an unstated size. */
const NULLABLE: ReadonlySet<Property> = new Set(["width", "height"]);

/** One selected element the form edits. */
export interface Edited {
  /** The block id for the block; else `<block>/<key>`, the target of its own place. */
  readonly target: string;
  /** For a member's card, `<block>/<group>`, the target of its group's place; else `null`. */
  readonly group: string | null;
  /** The exact value of each field its kind offers: stated, else drawn. */
  readonly values: { readonly [property in Property]?: number | null };
}

/** What the form edits: elements of one kind, all in one block. */
export interface Geometry {
  readonly kind: GeometryKind;
  readonly block: Block;
  /** The workspace's settings, which the block is drawn with. */
  readonly settings: WorkspaceSettings;
  /** The block's drawing as stored, which places every item an edit keeps where it is. */
  readonly drawing: Drawing;
  /** The level of the canvas the form edits at: the arranger, or the innermost editor's kind. */
  readonly level: Level;
  /** The form's accessible name. */
  readonly label: string;
  /** Each element once, in selection order. */
  readonly elements: readonly Edited[];
}

/** One selected element with its kind and the words naming its kind in the form's label. */
interface Classified extends Edited {
  readonly kind: GeometryKind;
  readonly noun: "Block" | "Frame" | "Card";
}

/**
 * The geometry the selection names: every address in one block and of one
 * kind, read through core's `parseAddress` and `elementOf` and classified by
 * the block's drawing (`drawing.items` and `drawing.cards`), never by the
 * form of the address. The block id names the block; a group, its title or
 * its frame names the frame; a timeline drawn in a card, by its line, its
 * card or any other part, names that card. `null` for no selection,
 * addresses in several blocks, elements of different kinds, or an element
 * with no geometry of its own (a child drawn in no card of its own, a
 * region, a map, the title). Bands are left out (`withoutBands`). While
 * `placement`, a canvas gesture, shows the block, the values of its items
 * and cards are read from the drawing the gesture shows; `level` decides
 * what an edit states besides its values.
 */
export function geometryOf(
  view: View,
  selection: Iterable<string>,
  level: Level = "arranger",
  placement: LivePlacement | null = null,
): Geometry | null {
  let block: Block | undefined;
  const found = new Map<string, Classified>();
  for (const address of withoutBands(selection)) {
    const parsed = parseAddress(address);
    if (isCommandError(parsed) || parsed.block === null) return null;
    if (block !== undefined && block.id !== parsed.block) return null;
    block = view.blocks[parsed.block];
    if (block === undefined) return null;
    const element = classify(block, shownDrawing(view, block, placement), parsed.element);
    if (element === undefined) return null;
    found.set(element.target, element);
  }
  const elements = [...found.values()];
  const [first] = elements;
  if (block === undefined || first === undefined) return null;
  if (elements.some((element) => element.kind !== first.kind)) return null;
  const nouns = new Set(elements.map((element) => element.noun));
  const label = nouns.size === 1 ? `${first.noun} properties` : "Frame and card properties";
  return {
    kind: first.kind,
    block,
    settings: view.settings,
    drawing: drawingOf(block, view.settings, fontMetrics),
    level,
    label,
    elements: elements.map(({ target, group, values }) => ({ target, group, values })),
  };
}

/** The drawing the canvas shows for `block`: `placement`'s during a gesture on it, else the stored one. */
function shownDrawing(view: View, block: Block, placement: LivePlacement | null): Drawing {
  return placement?.id === block.id
    ? placement.drawing
    : drawingOf(block, view.settings, fontMetrics);
}

/** One read-only row of the Properties tab: what it names and the value it shows. */
export interface PropertyRow {
  readonly label: string;
  readonly value: string;
}

/**
 * The read-only rows of the band the selection names when it is exactly one
 * band (arranger's `selectedBand`) whose block's drawing records it, read
 * from the drawing the canvas shows as `geometryOf` reads it: "Band", its
 * kind's word (`BAND_WORDS`); "Level", signed, a negative one written with
 * U+2212 MINUS SIGN; "Elements", the displayed elements it holds directly.
 * A timeline drawn with two lines in one drawing has two records under one
 * address; the first, in drawing order, is shown. `null` for any other
 * selection: a band among other addresses is left out (`geometryOf`).
 */
export function bandRows(
  view: View,
  selection: Iterable<string>,
  placement: LivePlacement | null = null,
): readonly PropertyRow[] | null {
  const [address, ...others] = selection;
  const band = address === undefined || others.length > 0 ? null : selectedBand(address);
  const block = band === null ? undefined : view.blocks[band.block];
  if (band === null || block === undefined) return null;
  const drawn = shownDrawing(view, block, placement).bands.find(
    (record) => record.address === bandAddress(band.timeline, band.kind),
  );
  if (drawn === undefined) return null;
  const { level, elements } = drawn;
  return [
    { label: "Band", value: BAND_WORDS[band.kind] },
    { label: "Level", value: level < 0 ? `−${-level}` : String(level) },
    { label: "Elements", value: String(elements) },
  ];
}

/** What `element` (an element address, `null` for the block itself) names in `block`, drawn as `drawing`. */
function classify(block: Block, drawing: Drawing, element: string | null): Classified | undefined {
  if (element === null) {
    const { x, y, scale, length, spacing, width, height } = block;
    return {
      kind: "block",
      noun: "Block",
      target: block.id,
      group: null,
      values: { x, y, scale, length, spacing, width, height },
    };
  }
  const key = elementOf(block.manifest, element);
  const item = drawing.items.find((drawn) => drawn.key === key);
  if (item !== undefined) {
    const values: { [property in Property]?: number } = {};
    for (const property of ITEM_FIELDS)
      values[property] = item.stated[property] ?? item.place[property];
    return {
      kind: "item",
      noun: item.kind === "group" ? "Frame" : "Card",
      target: `${block.id}/${key}`,
      group: null,
      values,
    };
  }
  const card = drawing.cards.find((drawn) => drawn.key === key);
  const frame = drawing.items.find((drawn) => drawn.key === card?.group);
  if (card === undefined || frame === undefined) return undefined;
  return {
    kind: "card",
    noun: "Card",
    target: `${block.id}/${key}`,
    group: `${block.id}/${card.group}`,
    values: {
      scale: frame.stated.scale ?? frame.place.scale,
      length: frame.stated.length ?? frame.place.length,
      spacing: card.spacing,
      width: card.stated.width ?? card.size.width,
      height: card.stated.height ?? card.size.height,
    },
  };
}

/**
 * Whether the form offers `property` of `geometry` at its level: a block's
 * own `scale`, `length` and `spacing` not inside a group or timeline editor,
 * which refuse to change them; an item's `x` and `y` only in the bundle
 * editor, the one level that moves items. Every field is offered without a
 * geometry.
 */
export function offered(geometry: Geometry | null, property: Property): boolean {
  if (geometry === null) return true;
  const { kind, level } = geometry;
  if (kind === "block") {
    return level === "arranger" || level === "bundle" || !BLOCK_FIELDS.has(property);
  }
  return kind !== "item" || level === "bundle" || !POSITION.has(property);
}

/** A field's label: a member's card names the fields its group holds as the group's. */
export function fieldLabel(kind: GeometryKind, property: Property): string {
  return kind === "card" && SHARED.has(property) ? `group ${property}` : property;
}

/**
 * The value every element shows for `property`; `undefined` when they
 * differ (the field then shows none). Exact: only shown through `shownValue`.
 */
export function commonValue(geometry: Geometry, property: Property): number | null | undefined {
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

/**
 * The one `set` giving `property` of every element the value `valueFor`
 * gives it: a block's own property, else a member of a place (`place:
 * {[property]: value}`), on the group's place for the scale and length of a
 * member's card and on the card's own place for its size and spacing.
 * Elements sharing a target (two cards of one group) change it once, with
 * the first one's value. A place edit follows the canvas's gestures at the
 * geometry's level (`placeCommand`): on the arranger and in the bundle
 * editor the same `set` states, once, the drawn `x`, `y` of every other item
 * that states none, so nothing else moves. A `length` or `spacing` writes
 * what a Stretch to that value writes (`stretchChanges`): every stated width
 * or height it changes the content of keeps its proportion to it, and in the
 * group editor, where the frame does not adapt, a `length` is capped and the
 * frame's width pinned. Each element's stretch starts from the places the
 * ones before it wrote.
 */
export function geometryCommand(
  geometry: Geometry,
  property: Property,
  valueFor: (element: Edited) => number | null,
): SetCommand {
  const { block, kind } = geometry;
  if (kind === "block") {
    return {
      type: "set",
      changes: geometry.elements.map((element) => ({
        target: element.target,
        values: { [property]: valueFor(element) },
      })),
    };
  }
  const places = new Map<string, PlaceValues>();
  const written = new Set<string>();
  let edited = block;
  for (const element of geometry.elements) {
    const key = keyIn(block, placeTarget(kind, element, property));
    if (written.has(key)) continue;
    written.add(key);
    const value = valueFor(element);
    const changes =
      stretched(property) && value !== null
        ? stretchChanges(
            edited,
            geometry.settings,
            fontMetrics,
            geometry.level,
            resizedOf(geometry, element),
            property,
            value,
          )
        : new Map([[key, { [property]: value }]]);
    for (const [changed, values] of changes) {
      places.set(changed, { ...places.get(changed), ...values });
      edited = { ...edited, places: placesWith(edited.places, changed, values) };
    }
  }
  return placeCommand(block.id, geometry.drawing, places, keepsItems(geometry.level));
}

/** The target whose place an edit of `property` sets: a member card's group for its shared fields. */
function placeTarget(kind: GeometryKind, element: Edited, property: Property): string {
  const shared = kind === "card" && SHARED.has(property);
  return shared && element.group !== null ? element.group : element.target;
}

/** The key of `places` that `target`, `<block>/<key>`, names. */
function keyIn(block: Block, target: string): string {
  return target.slice(block.id.length + 1);
}

/**
 * What `element` stores for `property`: the block's own member for the
 * block, else the member of the place an edit of it sets, `null` where that
 * place states none. A drawn value the form shows is not stored.
 */
function storedValue(geometry: Geometry, element: Edited, property: Property): number | null {
  const { block, kind } = geometry;
  if (kind === "block") return block[property];
  return block.places[keyIn(block, placeTarget(kind, element, property))]?.[property] ?? null;
}

/** The box of the drawing that `element` names, as the canvas's resize gestures name it. */
function resizedOf(geometry: Geometry, element: Edited): ResizedItem {
  const key = keyIn(geometry.block, element.target);
  if (element.group !== null) {
    return { kind: "member", key, item: keyIn(geometry.block, element.group) };
  }
  const grouped = geometry.drawing.items.some((item) => item.key === key && item.kind === "group");
  return { kind: grouped ? "frame" : "card", key, item: key };
}

/**
 * The command setting one property of every element from the field's text:
 * a number, or null for an empty `width` or `height` (a block's size left
 * to its content, a place's size unstated); anything else is refused before
 * dispatch, at `[<first target>, property]`. `null` when every element
 * stores that value already (compared exactly, as `commonValue` compares):
 * the commit changes nothing, and the store refuses a `set` that changes
 * nothing. The store's checks decide everything else.
 */
export function propertyCommand(
  geometry: Geometry,
  property: Property,
  input: string,
): Result<SetCommand | null> {
  const path = [geometry.elements[0]?.target ?? geometry.block.id, property];
  const trimmed = input.trim();
  let value: number | null;
  if (trimmed === "") {
    if (!NULLABLE.has(property)) {
      return refused(InspectorCode.invalidValue, `${property} needs a number`, path);
    }
    value = null;
  } else {
    value = Number(trimmed);
    if (!Number.isFinite(value)) {
      return refused(InspectorCode.invalidValue, `${trimmed} is not a number`, path);
    }
  }
  if (geometry.elements.every((element) => storedValue(geometry, element, property) === value)) {
    return { ok: true, value: null };
  }
  return { ok: true, value: geometryCommand(geometry, property, () => value) };
}

/**
 * The command stepping `property` of every element one step of `STEPS`
 * (`direction` ±1) from its own exact value (never from the rounded text the
 * field shows; null counts as 0), so elements of different values each step
 * from theirs.
 */
export function stepCommand(geometry: Geometry, property: Property, direction: 1 | -1): SetCommand {
  return geometryCommand(geometry, property, (element) =>
    stepValue(element.values[property] ?? null, direction, STEPS[property]),
  );
}
