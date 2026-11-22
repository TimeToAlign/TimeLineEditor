/**
 * The elision section of the Properties tab (TimeToShare's drawing
 * specification, sections 2.4 and 8.9): what it offers for the root `R`
 * under which the whole selection lies, where `R`'s drawing can carry
 * elisions (an ancestor card of `R`, or `R`'s card as an ungrouped root),
 * and the form of one selected elision. Every value is read from the
 * manifest and from the drawing the canvas shows: the default elisions are
 * its strips, a strip's drawn width its edges, the full scale its full
 * runs, so nothing here lays anything out. What a mode or a command gives
 * is tried first, as the drawing draws it with the command applied (core's
 * `preview`), once per manifest and workspace layer.
 */

import type { Subject } from "@timetoalign/tilie-arranger";
import { drawingOf } from "@timetoalign/tilie-arranger";
import type {
  AddCommand,
  Address,
  AxisValue,
  Block,
  Command,
  Elision,
  RemoveCommand,
  ResolvedAddress,
  SetCommand,
  StyleCommand,
  TimelineManifest,
  View,
} from "@timetoalign/tilie-core";
import {
  addressKey,
  canonicalText,
  copyValue,
  elisionsUnder,
  findTimeline,
  idAddress,
  inBlock,
  indexOf,
  isCommandError,
  parseAxisValue,
  prettyText,
  prettyUnit,
  preview,
  sameAddress,
} from "@timetoalign/tilie-core";
import { memberDrawings, reachOf } from "@timetoalign/tilie-core/drawing";
import type { CoordinateValue, Real } from "@timetoalign/tilie-core/numbers";
import {
  addReal,
  axisCoordinate,
  compareReal,
  exactCoordinate,
  Rational,
  realOf,
  toAxisValue,
  toFloat,
} from "@timetoalign/tilie-core/numbers";
import type { Drawing, DrawnBox, ElisionElement } from "@timetoalign/tilie-layout";
import type { Selector } from "@timetoalign/timetoshare";
import { ELISION_DISPLAY, fontMetrics, isJsonFloat } from "@timetoalign/timetoshare";
import type { Result } from "./problems.ts";
import { InspectorCode, refused } from "./problems.ts";

/** How the root's cards are drawn: with their elisions, whole, or not at all. */
export type ElisionMode = "elided" | "full" | "hidden";

/** The words of the modes, as the radio group shows them. */
export const MODE_WORDS: { readonly [mode in ElisionMode]: string } = {
  elided: "Elided",
  full: "Full",
  hidden: "Hidden",
};

/** Why an option is disabled: another rule keeps the drawing as it is. */
export const HELD_WORDS = {
  shown: "Shown by another style rule",
  hidden: "Hidden by another style rule",
  elided: "Elided by another style rule",
  whole: "Drawn whole by another style rule",
} as const;

/** One option of the mode's radio group. */
export interface ModeOption {
  readonly mode: ElisionMode;
  /**
   * The `style` commands choosing it, sent in order: none for the mode shown, one where one
   * rule changes, two where the card's rule and the elisions' rule both change; `null` where
   * another rule keeps the drawing as it is, the option then disabled with `reason`.
   */
  readonly commands: readonly StyleCommand[] | null;
  readonly reason: string | null;
}

/** One row of the section's list: one elision drawn in the card, by its address. */
export interface ElisionRow {
  /** Its address in the block: `{block, id: E}` stored, `{block, id: T, part: [elision]}` default. */
  readonly address: Address;
  /** The name of the timeline it lies on, else that timeline's ID. */
  readonly timeline: string;
  /** Its stretches on that timeline's axis, each `start–end` with the unit. */
  readonly stretch: string;
  /** "automatic", or its stored width: "0.5 of its length", "as wide as 4 ♩", "30 px". */
  readonly width: string;
  /**
   * What its `[×]` sends: a `remove` of a stored one, the card's other defaults stored for a
   * default one; `null` for the card's only default, which no stored list can leave out.
   */
  readonly remove: Command | null;
}

/** The section the Properties tab shows directly under the name. */
export interface ElisionSection {
  readonly block: string;
  /** The root it acts on. */
  readonly root: string;
  /** `Parent timeline "R"` for an ancestor card, `Elisions of "R"` for an ungrouped root. */
  readonly title: string;
  readonly mode: ElisionMode;
  /** Elided, Full and Hidden for an ancestor card; Elided and Full for an ungrouped root. */
  readonly options: readonly ModeOption[];
  /** "automatic, 0.0170 of their length", "automatic: drawn whole", "4 stored elisions", "none". */
  readonly status: string;
  readonly rows: readonly ElisionRow[];
  /** Two elisions on `R`, left and right of the protected span, one `add`; `null` where none fits. */
  readonly rootLeftRight: AddCommand | null;
  /** One `remove` of every stored elision on `R` or a descendant; `null` without one. */
  readonly reset: RemoveCommand | null;
}

/** The four forms of an elision's width in the form, Automatic its `width` left out. */
export type WidthForm = "automatic" | "ratio" | "span" | "canvas";

export const WIDTH_FORMS: readonly WidthForm[] = ["automatic", "ratio", "span", "canvas"];

/** The fields of a selected elision the form types into. */
export type ElisionField = "start" | "end" | "ratio" | "span" | "canvas";

/** One selected elision as the form shows and edits it. */
export interface ElisionForm {
  readonly block: Block;
  /** The selected address. */
  readonly address: Address;
  /** `Elision of "T"`. */
  readonly title: string;
  readonly timeline: TimelineManifest;
  /** The unit's pretty word after From, To and As wide as. */
  readonly unit: string;
  /** The stored elision; `null` for a default one. */
  readonly stored: Elision | null;
  /** Its start and end on its timeline's own axis, the text a field shows. */
  readonly start: string;
  readonly end: string;
  /** Its share of the timeline, read-only: "0 % … 100 % of Menuet". */
  readonly share: string;
  readonly form: WidthForm;
  /** The text each width field shows: the stored value of its form, else the value converted. */
  readonly widths: { readonly [form in Exclude<WidthForm, "automatic">]: string };
  /** The card's default proportion to four places, where the drawing shows it; else `null`. */
  readonly proportion: string | null;
  readonly display: readonly string[];
  /** The card's default elisions, every one stored with the change when this one is default. */
  readonly defaults: readonly DefaultPiece[];
}

/** An elision as an `add` into a block lists it. */
interface ElisionEntry {
  readonly timeline: string;
  readonly start: AxisValue;
  readonly end: AxisValue;
  readonly width?: { readonly [form: string]: unknown };
  readonly display?: readonly string[];
}

/** A default elision drawn in the card: its address and what storing it writes. */
interface DefaultPiece {
  readonly address: Address;
  readonly entry: ElisionEntry;
}

/** The root an elision section acts on, and whether it is drawn behind a frame. */
interface RootOf {
  readonly root: TimelineManifest;
  readonly ancestor: boolean;
  /** The group whose frame the selection concerns; `null` for none. */
  readonly group: string | null;
}

/** What a subject is to the section: the timeline it lies on or names, and the group it concerns. */
interface Concern {
  readonly timeline: string;
  readonly group: string | null;
}

/** The timeline `resolved` names or lies on, a part through its owner; `null` for anything else. */
function timelineOf(resolved: ResolvedAddress): string | null {
  switch (resolved.kind) {
    case "timeline":
    case "card":
    case "elision":
      return resolved.at.timeline.id;
    case "part":
      return timelineOf(resolved.owner);
    default:
      return null;
  }
}

/** The group a subject's drawn box lies in: a frame's, a member card's, an ancestor card's. */
function groupOf(box: DrawnBox | null): string | null {
  if (box === null) return null;
  if (box.ancestor !== undefined) return box.ancestor.group;
  if (box.kind === "frame") return box.key?.item ?? null;
  return box.key?.member !== undefined ? box.key.item : (box.holder?.item ?? null);
}

/**
 * The root the section acts on: every subject a timeline, a card, a part of
 * either or an elision, all in `block` and under one root `R` whose drawing
 * can carry elisions (it has an ancestor card, or it is an ungrouped root);
 * else `null`.
 */
function rootOf(block: Block, subjects: readonly Subject[]): RootOf | null {
  const { ancestry } = indexOf(block.manifest);
  const concerns: Concern[] = [];
  for (const subject of subjects) {
    const timeline = subject.block === block.id ? timelineOf(subject.resolved) : null;
    if (timeline === null) return null;
    concerns.push({ timeline, group: groupOf(subject.box) });
  }
  const roots = new Set(concerns.map(({ timeline }) => ancestry.get(timeline)?.[0]));
  const [id, ...others] = roots;
  if (id === undefined || others.length > 0) return null;
  const root = findTimeline(block.manifest, id);
  if (root === undefined) return null;
  const drawings = memberDrawings(block.manifest);
  const cards = drawings.ancestorCards.filter((card) => card.root.timeline.id === id);
  const group = concerns.find(({ group }) => cards.some((card) => card.group.id === group));
  if (cards.length > 0) return { root, ancestor: true, group: group?.group ?? null };
  if (drawings.ungrouped.some((drawn) => drawn.timeline.id === id)) {
    return { root, ancestor: false, group: null };
  }
  return null;
}

/** The selector of the root's card rule (drawing.md section 8.8). */
function cardSelector(root: string): Selector {
  return { element: "ancestor_card", addresses: [{ id: root, part: ["card"] }] };
}

/** The selector of the root's elisions rule (drawing.md section 8.9, Elided and full). */
function withinSelector(root: string): Selector {
  return { element: "elision", within: root };
}

type Display = "none" | "inline" | null;

function styleCommand(block: string, select: Selector, display: Display): StyleCommand {
  return { type: "style", select, set: { display }, blocks: [block] };
}

/** The `display` the manifest's own rule of `select` states, if it states one. */
function ownDisplay(block: Block, select: Selector): "none" | "inline" | undefined {
  const graphical = block.manifest.graphical;
  const key = canonicalText(select);
  const own = (graphical?.rules ?? []).find((rule) => canonicalText(rule.select) === key);
  const set = typeof own?.set === "string" ? graphical?.styles?.[own.set] : own?.set;
  const display = set?.display;
  return display === "none" || display === "inline" ? display : undefined;
}

/** The cards drawing `root` whole outside a frame in `drawing`, in drawing order. */
function rootCards(drawing: Drawing, root: string, ancestor: boolean): DrawnBox[] {
  return drawing.boxes.filter((box) =>
    ancestor
      ? box.ancestor !== undefined && box.address.id === root
      : box.kind === "card" && box.key?.item === root && box.key.member === undefined,
  );
}

/** The strips a card's range holds, in drawing order. */
function stripsIn(drawing: Drawing, box: DrawnBox): ElisionElement[] {
  return drawing.elements
    .slice(box.range.start, box.range.end)
    .filter((element): element is ElisionElement => element.type === "elision");
}

/**
 * What the outcome of each trial is, by the block's manifest, then the
 * workspace's `graphical`, then the commands: the drawing of the block with
 * them applied, `null` where the store refuses one. A command of a block
 * changes its manifest alone, so a store change replacing neither draws
 * nothing again.
 */
const trials = new WeakMap<object, WeakMap<object, Map<string, Drawing | null>>>();

/** The block's drawing with `commands` applied in order (core's `preview`); `null` where one is refused. */
function trial(view: View, block: Block, commands: readonly StyleCommand[]): Drawing | null {
  let layers = trials.get(block.manifest);
  if (layers === undefined) {
    layers = new WeakMap();
    trials.set(block.manifest, layers);
  }
  let outcomes = layers.get(view.graphical);
  if (outcomes === undefined) {
    outcomes = new Map();
    layers.set(view.graphical, outcomes);
  }
  const key = canonicalText(commands);
  const known = outcomes.get(key);
  if (known !== undefined) return known;
  let shown: View = view;
  let drawing: Drawing | null = null;
  for (const command of commands) {
    const next = preview(shown, command);
    if (isCommandError(next)) {
      shown = view;
      break;
    }
    shown = next;
  }
  const drawn = shown.blocks[block.id];
  if (shown !== view || commands.length === 0) {
    drawing = drawn === undefined ? null : drawingOf(drawn, shown.graphical, fontMetrics);
  }
  outcomes.set(key, drawing);
  return drawing;
}

/** The facts the mode is read from in one drawing. */
function factsOf(drawing: Drawing | null, root: string, ancestor: boolean) {
  const cards = drawing === null ? [] : rootCards(drawing, root, ancestor);
  const strips =
    drawing === null ? 0 : cards.reduce((sum, card) => sum + stripsIn(drawing, card).length, 0);
  return { card: cards.length > 0, strips: strips > 0 };
}

/**
 * The `style` commands that make the elisions of `root` shown (`elided`) or
 * not (`full`) after `base`, read from the drawing with them applied: none
 * where they already are; `null` where no command of the root's own rule
 * does it. Where the drawing has no strip to show either way (no stored
 * elision and `r = 1`), the own rule alone says which mode holds.
 */
function elisionCommands(
  view: View,
  block: Block,
  root: string,
  ancestor: boolean,
  base: readonly StyleCommand[],
  target: "elided" | "full",
): readonly StyleCommand[] | null {
  const own = ownDisplay(block, withinSelector(root));
  const command = (display: Display) => styleCommand(block.id, withinSelector(root), display);
  const shows = (commands: readonly StyleCommand[]) =>
    factsOf(trial(view, block, [...base, ...commands]), root, ancestor).strips;
  const visible = shows([]);
  const forced = shows([command("inline")]);
  if (!forced && !visible) {
    // Nothing to draw: the mode is the own rule's.
    if (target === "full") return own === "none" ? [] : [command("none")];
    return own === "none" ? [command(null)] : [];
  }
  if (target === "elided") {
    if (visible) return [];
    const offered: Display[] = [...(own === "none" ? [null] : []), "inline"];
    const found = offered.find((display) => shows([command(display)]));
    return found === undefined ? null : [command(found)];
  }
  if (!visible) return [];
  return shows([command("none")]) ? null : [command("none")];
}

/** The mode the drawing shows: hidden without a card, else elided or full as the elisions are. */
function modeOf(view: View, block: Block, root: string, ancestor: boolean): ElisionMode {
  if (ancestor && !factsOf(trial(view, block, []), root, ancestor).card) return "hidden";
  return elisionCommands(view, block, root, ancestor, [], "elided")?.length === 0
    ? "elided"
    : "full";
}

/** The options of the radio group, each tried as the drawing draws it. */
function optionsOf(view: View, block: Block, of: RootOf, mode: ElisionMode): ModeOption[] {
  const root = of.root.id;
  const { ancestor } = of;
  const card = (display: Display) => styleCommand(block.id, cardSelector(root), display);
  const option = (
    target: ElisionMode,
    commands: readonly StyleCommand[] | null,
    reason: string,
  ): ModeOption => ({ mode: target, commands, reason: commands === null ? reason : null });
  if (mode === "hidden") {
    const own = ownDisplay(block, cardSelector(root));
    const offered: Display[] = [...(own === "none" ? [null] : []), "inline"];
    const shown = offered
      .map((display) => [card(display)])
      .find((commands) => factsOf(trial(view, block, commands), root, ancestor).card);
    const after = (target: "elided" | "full") => {
      if (shown === undefined) return null;
      const rest = elisionCommands(view, block, root, ancestor, shown, target);
      return rest === null ? null : [...shown, ...rest];
    };
    return [
      option("elided", after("elided"), shown === undefined ? HELD_WORDS.hidden : HELD_WORDS.whole),
      option("full", after("full"), shown === undefined ? HELD_WORDS.hidden : HELD_WORDS.elided),
      option("hidden", [], HELD_WORDS.shown),
    ];
  }
  const options = [
    option("elided", elisionCommands(view, block, root, ancestor, [], "elided"), HELD_WORDS.whole),
    option("full", elisionCommands(view, block, root, ancestor, [], "full"), HELD_WORDS.elided),
  ];
  if (!ancestor) return options;
  const hides = !factsOf(trial(view, block, [card("none")]), root, ancestor).card;
  return [...options, option("hidden", hides ? [card("none")] : null, HELD_WORDS.shown)];
}

/** A JSON number of the manifest (an integral float wrapped, a large integer a bigint) as a double. */
function jsonNumber(value: unknown): number {
  return isJsonFloat(value) ? value.value : Number(value);
}

/** A real as a double. */
function double(value: Real): number {
  return typeof value === "number" ? value : toFloat(value);
}

/** A timeline's length on its own axis, or its reach where its length is not known. */
function extentOf(timeline: TimelineManifest, block: Block): Real {
  return timeline.length === null
    ? reachOf(timeline, block.manifest)
    : realOf(axisCoordinate(timeline.length, timeline));
}

/** A value of the axis of `timeline` as the manifest writes it there; `undefined` where it does not fit. */
function axisValueAt(value: Real, timeline: TimelineManifest): AxisValue | undefined {
  const exact = exactCoordinate(value, timeline.unit, timeline.number_type);
  return exact === undefined ? undefined : toAxisValue(exact);
}

/** A value of the axis of `timeline` as an exact coordinate value; `undefined` where it does not fit. */
function valueAt(value: Real, timeline: TimelineManifest): CoordinateValue | undefined {
  return exactCoordinate(value, timeline.unit, timeline.number_type)?.value;
}

/** The pretty text `start–end` of a stretch on `timeline`'s axis, as the strip's label writes it. */
function stretchText(start: Real, end: Real, timeline: TimelineManifest): string {
  const { number_type: numberType, unit } = timeline;
  const from = valueAt(start, timeline);
  const to = valueAt(end, timeline);
  if (from === undefined || to === undefined) return "";
  return `${prettyText(from, numberType, unit === "seconds" ? unit : null)}–${prettyText(to, numberType, unit)}`;
}

/** The card the section reads in `drawing`: the one behind the group the selection concerns, else the first. */
function cardOf(drawing: Drawing, of: RootOf): DrawnBox | undefined {
  const cards = rootCards(drawing, of.root.id, of.ancestor);
  return cards.find((card) => card.ancestor?.group === of.group) ?? cards[0];
}

/** What a card shows of its elisions: its strips, its full scale and its item's scale. */
interface CardView {
  readonly strips: readonly ElisionElement[];
  /** Drawn units per unit of the root's axis on a full run; `null` where the card has none. */
  readonly scale: number | null;
  /** The scale of the item it is drawn at. */
  readonly item: number;
}

function cardView(drawing: Drawing, card: DrawnBox, of: RootOf): CardView {
  const axes = drawing.axes.filter((axis) =>
    card.ancestor === undefined
      ? axis.ancestor === undefined &&
        axis.card.item === of.root.id &&
        axis.card.member === undefined
      : axis.ancestor?.group === card.ancestor.group &&
        axis.ancestor.member === card.ancestor.member,
  );
  let scale: number | null = null;
  for (const axis of axes) {
    const units = double(axis.drawnEnd) - double(axis.start);
    if (units > 0 && axis.xEnd > axis.xStart) {
      scale = (axis.xEnd - axis.xStart) / units;
      break;
    }
  }
  const holder =
    card.ancestor === undefined
      ? card
      : drawing.boxes.find(
          (box) =>
            box.kind === "frame" &&
            box.key !== null &&
            box.key.item === card.ancestor?.group &&
            box.key.member === undefined,
        );
  return { strips: stripsIn(drawing, card), scale, item: holder?.item?.place.scale ?? 1 };
}

/** Whether `strip` is a default elision: its address names its timeline's elision part. */
function isDefault(strip: ElisionElement): boolean {
  return strip.address.part?.[0] === "elision";
}

/** The stored elision of the manifest a strip draws; `undefined` for a default one. */
function storedOf(block: Block, strip: ElisionElement): Elision | undefined {
  if (isDefault(strip)) return undefined;
  return block.manifest.graphical?.elisions?.find((elision) => elision.id === strip.address.id);
}

/** A strip's natural width: its stretch at the card's full scale. */
function naturalOf(strip: ElisionElement, scale: number): number {
  return scale * (double(strip.elided.end) - double(strip.elided.start));
}

/** The card's default proportion, read from a strip drawn at it; `null` where none is drawn. */
function proportionOf(block: Block, view: CardView): number | null {
  if (view.scale === null) return null;
  for (const strip of view.strips) {
    if (storedOf(block, strip)?.width !== undefined) continue;
    const natural = naturalOf(strip, view.scale);
    if (natural > 0) return (strip.x2 - strip.x1) / natural;
  }
  return null;
}

/** The text of the default proportion: four places. */
function proportionText(proportion: number): string {
  return proportion.toFixed(4);
}

/** The card's default elisions as an `add` of a block stores them: each without `width`. */
function defaultsOf(block: Block, view: CardView): DefaultPiece[] {
  return view.strips.filter(isDefault).flatMap((strip) => {
    const timeline = findTimeline(block.manifest, strip.elided.timeline);
    if (timeline === undefined) return [];
    const start = axisValueAt(strip.elided.start, timeline);
    const end = axisValueAt(strip.elided.end, timeline);
    if (start === undefined || end === undefined) return [];
    const entry = { timeline: timeline.id, start, end };
    return [{ address: inBlock(block.id, strip.address), entry }];
  });
}

/** The `add` storing the card's defaults, `change` given each entry; `null` for an empty list. */
function storedDefaults(
  block: Block,
  defaults: readonly DefaultPiece[],
  change: (piece: DefaultPiece, index: number) => ElisionEntry | null,
): AddCommand | null {
  const elision = defaults.flatMap((piece, index) => {
    const entry = change(piece, index);
    return entry === null ? [] : [entry];
  });
  return elision.length === 0 ? null : { type: "add", into: { block: block.id }, elision };
}

/** The width an elision's row states. */
function widthText(elision: Elision | undefined, timeline: TimelineManifest): string {
  const width = elision?.width;
  if (width === undefined) return "automatic";
  if (width.ratio !== undefined) return `${jsonNumber(width.ratio)} of its length`;
  if (width.canvas !== undefined) return `${jsonNumber(width.canvas)} px`;
  if (width.span !== undefined) {
    const { value } = axisCoordinate(width.span, timeline);
    return `as wide as ${prettyText(value, timeline.number_type, timeline.unit)}`;
  }
  return "automatic";
}

/** The rows of the card's strips, one per address, in drawing order. */
function rowsOf(block: Block, view: CardView, defaults: readonly DefaultPiece[]): ElisionRow[] {
  const rows = new Map<string, { address: Address; strips: ElisionElement[] }>();
  for (const strip of view.strips) {
    const address = inBlock(block.id, strip.address);
    const key = addressKey(address);
    const row = rows.get(key);
    if (row === undefined) rows.set(key, { address, strips: [strip] });
    else row.strips.push(strip);
  }
  return [...rows.values()].flatMap(({ address, strips }) => {
    const [first] = strips;
    const timeline = first && findTimeline(block.manifest, first.elided.timeline);
    if (first === undefined || timeline === undefined) return [];
    const stored = storedOf(block, first);
    const remove: Command | null =
      stored === undefined
        ? storedDefaults(block, defaults, (piece) =>
            sameAddress(piece.address, address) ? null : piece.entry,
          )
        : { type: "remove", targets: [address] };
    return [
      {
        address,
        timeline: timeline.name ?? timeline.id,
        stretch: strips
          .map((strip) => stretchText(strip.elided.start, strip.elided.end, timeline))
          .join(", "),
        width: widthText(stored, timeline),
        remove,
      },
    ];
  });
}

/** The elisions on `R` left and right of the protected span of the card behind `group`, one `add`. */
function rootLeftRightOf(block: Block, of: RootOf): AddCommand | null {
  if (!of.ancestor) return null;
  const cards = memberDrawings(block.manifest).ancestorCards.filter(
    (card) => card.root.timeline.id === of.root.id,
  );
  const card = cards.find((each) => each.group.id === of.group) ?? cards[0];
  if (card === undefined) return null;
  let below: Real = Rational.of(0n);
  for (const { timeline, offset } of card.member.ancestors) {
    below = addReal(below, realOf(axisCoordinate(offset, timeline)));
  }
  const above = addReal(below, extentOf(card.member.timeline, block));
  const zero = Rational.of(0n);
  const end = extentOf(of.root, block);
  const stretches: [Real, Real][] = [
    [zero, below],
    [above, end],
  ];
  const elision = stretches.flatMap(([from, to]) => {
    if (compareReal(from, to) >= 0) return [];
    const start = axisValueAt(from, of.root);
    const stop = axisValueAt(to, of.root);
    return start === undefined || stop === undefined
      ? []
      : [{ timeline: of.root.id, start, end: stop }];
  });
  return elision.length === 0 ? null : { type: "add", into: { block: block.id }, elision };
}

/** The status line. */
function statusOf(of: RootOf, stored: number, proportion: number | null): string {
  if (stored > 0) return stored === 1 ? "1 stored elision" : `${stored} stored elisions`;
  if (!of.ancestor) return "none";
  return proportion === null || proportion >= 1
    ? "automatic: drawn whole"
    : `automatic, ${proportionText(proportion)} of their length`;
}

/**
 * The elision section of the inspected subjects, all in `block` of `view`,
 * drawn as `drawing`: offered where every subject is a timeline, a card, a
 * part of either or an elision, all under one root `R` that has an ancestor
 * card or is an ungrouped root; `null` otherwise. The mode, its options and
 * the list are read from the drawing; the status and the proportion from
 * the drawing of the Elided option where the drawing shows no elision.
 */
export function elisionSectionOf(
  view: View,
  block: Block,
  subjects: readonly Subject[],
  drawing: Drawing,
): ElisionSection | null {
  const of = rootOf(block, subjects);
  if (of === null) return null;
  const root = of.root.id;
  const mode = modeOf(view, block, root, of.ancestor);
  const options = optionsOf(view, block, of, mode);
  const card = cardOf(drawing, of);
  const shown = card === undefined ? null : cardView(drawing, card, of);
  const elided = options.find((option) => option.mode === "elided")?.commands;
  const read = mode === "elided" ? drawing : elided ? trial(view, block, elided) : null;
  const readCard = read === null ? undefined : cardOf(read, of);
  const proportion =
    read === null || readCard === undefined
      ? null
      : proportionOf(block, cardView(read, readCard, of));
  const stored = elisionsUnder(block.manifest, root);
  const defaults = shown === null ? [] : defaultsOf(block, shown);
  const name = of.root.name ?? root;
  return {
    block: block.id,
    root,
    title: of.ancestor ? `Parent timeline "${name}"` : `Elisions of "${name}"`,
    mode,
    options,
    status: statusOf(of, stored.length, proportion),
    rows: shown === null ? [] : rowsOf(block, shown, defaults),
    rootLeftRight: rootLeftRightOf(block, of),
    reset:
      stored.length === 0
        ? null
        : {
            type: "remove",
            targets: stored.map((elision) => inBlock(block.id, idAddress(elision.id))),
          },
  };
}

/** A percentage of a share, to at most one decimal. */
function percent(share: number): string {
  return `${Number((100 * share).toFixed(1))} %`;
}

/** The text a field shows of an exact value: as Copy writes it, so that typing it back gives it. */
function fieldText(value: Real, timeline: TimelineManifest): string {
  const exact = valueAt(value, timeline);
  return exact === undefined ? String(double(value)) : copyValue(exact, timeline.number_type);
}

/** The value of `span` units as a field shows it, to four decimals on an axis that is not `int`. */
function spanText(units: number, timeline: TimelineManifest): string {
  if (timeline.number_type === "int") return String(Math.max(1, Math.round(units)));
  return String(Number(units.toFixed(4)));
}

/**
 * The form of the one selected elision, stored (`{block, id: E}`) or default
 * (`{block, id: T, part: [elision]}`, the first of its strips in the card),
 * read from the strip `drawing` draws of it in the card the section reads;
 * `null` for any other selection or an elision the card does not draw.
 */
export function elisionFormOf(
  block: Block,
  subjects: readonly Subject[],
  drawing: Drawing,
): ElisionForm | null {
  const [subject, ...others] = subjects;
  if (subject === undefined || others.length > 0) return null;
  const { resolved } = subject;
  const isElision =
    resolved.kind === "elision" ||
    (resolved.kind === "part" && resolved.word === "elision" && resolved.owner.kind === "timeline");
  if (!isElision) return null;
  const of = rootOf(block, subjects);
  const card = of === null ? undefined : cardOf(drawing, of);
  if (of === null || card === undefined) return null;
  const shown = cardView(drawing, card, of);
  const { address } = subject;
  const strip = shown.strips.find((each) => sameAddress(inBlock(block.id, each.address), address));
  if (strip === undefined) return null;
  const timeline = findTimeline(block.manifest, strip.elided.timeline);
  if (timeline === undefined) return null;
  const stored = storedOf(block, strip) ?? null;
  const start: Real =
    stored === null ? strip.elided.start : realOf(axisCoordinate(stored.start, timeline));
  const end: Real =
    stored === null ? strip.elided.end : realOf(axisCoordinate(stored.end, timeline));
  const extent = double(extentOf(timeline, block));
  const name = timeline.name ?? timeline.id;
  const drawn = strip.x2 - strip.x1;
  const natural = shown.scale === null ? null : naturalOf(strip, shown.scale);
  const proportion = proportionOf(block, shown);
  const width = stored?.width;
  const form: WidthForm =
    width?.ratio !== undefined
      ? "ratio"
      : width?.span !== undefined
        ? "span"
        : width?.canvas !== undefined
          ? "canvas"
          : "automatic";
  const converted = {
    ratio: natural === null || natural === 0 ? "" : String(Number((drawn / natural).toFixed(4))),
    span: shown.scale === null ? "" : spanText(drawn / shown.scale, timeline),
    canvas: String(Number((drawn / shown.item).toFixed(2))),
  };
  const widths = {
    ratio: width?.ratio !== undefined ? String(jsonNumber(width.ratio)) : converted.ratio,
    span:
      width?.span !== undefined
        ? copyValue(axisCoordinate(width.span, timeline).value, timeline.number_type)
        : converted.span,
    canvas: width?.canvas !== undefined ? String(jsonNumber(width.canvas)) : converted.canvas,
  };
  const defaults = defaultsOf(block, shown);
  const own = defaults.find((piece) => sameAddress(piece.address, address));
  if (stored === null && own === undefined) return null;
  return {
    block,
    address,
    title: `Elision of "${name}"`,
    timeline,
    unit: prettyUnit(timeline.unit),
    stored,
    start: fieldText(start, timeline),
    end: fieldText(end, timeline),
    share: `${percent(double(start) / extent)} … ${percent(double(end) / extent)} of ${name}`,
    form,
    widths,
    proportion: proportion === null ? null : proportionText(proportion),
    display: stored?.display ?? ELISION_DISPLAY,
    defaults,
  };
}

/** What a change of the form gives: the command, `null` where it changes nothing, or why it was refused. */
export type ElisionEdit = Result<Command | null>;

/**
 * The command applying `values` to the selected elision: one `set` of a
 * stored one; for a default one, one `add` storing every default of the card,
 * this one with `values` (a `null` value left out), the others as they are.
 */
function changeOf(form: ElisionForm, values: { readonly [property: string]: unknown }): Command {
  if (form.stored !== null) {
    const command: SetCommand = { type: "set", changes: [{ target: form.address, values }] };
    return command;
  }
  let applied = false;
  const add = storedDefaults(form.block, form.defaults, (piece) => {
    if (applied || !sameAddress(piece.address, form.address)) return piece.entry;
    applied = true;
    const entry: { [key: string]: unknown } = { ...piece.entry };
    for (const [property, value] of Object.entries(values)) {
      if (value === null) delete entry[property];
      else entry[property] = value;
    }
    return entry as unknown as ElisionEntry;
  });
  return add ?? { type: "set", changes: [] };
}

/** A value typed for the timeline's axis, exact (`parseAxisValue`), as the manifest writes it. */
function typedValue(text: string, timeline: TimelineManifest): AxisValue | string {
  const parsed = parseAxisValue(text, timeline.number_type);
  if (!(parsed instanceof Rational)) return parsed.message;
  if (timeline.number_type === "float") return toFloat(parsed);
  if (timeline.number_type === "int") {
    if (parsed.denominator !== 1n) return `${text.trim()} is no int value; write an integer`;
    return Number(parsed.numerator);
  }
  return [Number(parsed.numerator), Number(parsed.denominator)];
}

/** Decimal text a ratio or a canvas width takes: digits with an optional point, an optional exponent. */
const DECIMAL = /^[+]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;

/** The command `text` typed into `field` gives; `null` where it changes nothing. */
export function fieldCommand(form: ElisionForm, field: ElisionField, text: string): ElisionEdit {
  const path = [addressKey(form.address), field];
  const trimmed = text.trim();
  if (field === "start" || field === "end") {
    if (trimmed === form[field]) return { ok: true, value: null };
    const value = typedValue(trimmed, form.timeline);
    if (typeof value === "string") return refused(InspectorCode.invalidValue, value, path);
    return { ok: true, value: changeOf(form, { [field]: value }) };
  }
  if (form.form === field && trimmed === form.widths[field]) return { ok: true, value: null };
  if (field === "span") {
    const value = typedValue(trimmed, form.timeline);
    if (typeof value === "string") return refused(InspectorCode.invalidValue, value, path);
    return { ok: true, value: changeOf(form, { width: { span: value } }) };
  }
  if (!DECIMAL.test(trimmed)) {
    return refused(InspectorCode.invalidValue, `${trimmed} is not a number`, path);
  }
  return { ok: true, value: changeOf(form, { width: { [field]: Number(trimmed) } }) };
}

/**
 * The command choosing the width form `next`, its value converted from the
 * width drawn so that it does not jump: Automatic leaves `width` out; the
 * others take their field's text. `null` for the form already stored.
 */
export function formCommand(form: ElisionForm, next: WidthForm): ElisionEdit {
  if (next === form.form) return { ok: true, value: null };
  if (next === "automatic") return { ok: true, value: changeOf(form, { width: null }) };
  return fieldCommand({ ...form, form: "automatic" }, next, form.widths[next]);
}

/** The command showing or hiding one word of the elision's `display`, in its canonical order. */
export function displayCommand(form: ElisionForm, word: string, shown: boolean): Command {
  const display = ELISION_DISPLAY.filter((each) =>
    each === word ? shown : form.display.includes(each),
  );
  return changeOf(form, { display });
}

/**
 * The command deleting the selected elision: a `remove` of a stored one, the
 * card's other defaults stored for a default one; `null` for the card's only
 * default.
 */
export function deleteCommand(form: ElisionForm): Command | null {
  if (form.stored !== null) return { type: "remove", targets: [form.address] };
  return storedDefaults(form.block, form.defaults, (piece) =>
    sameAddress(piece.address, form.address) ? null : piece.entry,
  );
}
