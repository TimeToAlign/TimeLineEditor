/**
 * The elisions of the Properties tab (TimeToShare's drawing specification,
 * sections 2.4 and 8.9): the block of the root `R` under which the whole
 * selection lies, where `R`'s drawing carries elisions (an ancestor card of
 * `R`, or `R`'s card as an ungrouped root); the block of the group `G` whose
 * frame the selection lies in, or whose editor is open; and the form of one
 * selected elision. A root's mode and its settings are one rule on its card
 * address, a frame's mode one rule on its address; what they resolve to,
 * the proportion, the depths and every gap are read from the exposure the
 * drawing gives of each card and frame (`Drawing.elisions`), never from a
 * drawing tried with a command applied. Every action is one command, so one
 * journal entry. A root drawn once behind a row of groups side by side
 * (section 8.8, Drawn once) is read through the one ancestor card the drawing
 * records for it, whose `ancestor.groups` lists every group it lies behind;
 * the gaps and seams the arrangement cuts between two of them are listed
 * read-only, never edited.
 */

import type { Subject } from "@timetoalign/tilie-arranger";
import type {
  AddCommand,
  Address,
  AxisValue,
  Block,
  Command,
  ElementAddress,
  Elision,
  Manifest,
  PlaceKey,
  RemoveCommand,
  ResolvedAddress,
  SetCommand,
  StyleCommand,
  TimelineManifest,
} from "@timetoalign/tilie-core";
import {
  addressKey,
  canonicalText,
  copyValue,
  displayOrder,
  elisionsUnder,
  findTimeline,
  groupElisions,
  groupsHolding,
  idAddress,
  inBlock,
  indexOf,
  parseAxisValue,
  prettyText,
  prettyUnit,
  sameAddress,
  samePlaceKey,
} from "@timetoalign/tilie-core";
import { memberDrawings, reachOf } from "@timetoalign/tilie-core/drawing";
import type { CoordinateValue, Real } from "@timetoalign/tilie-core/numbers";
import {
  axisCoordinate,
  exactCoordinate,
  Rational,
  realOf,
  toAxisValue,
  toFloat,
  toRational,
} from "@timetoalign/tilie-core/numbers";
import type {
  Drawing,
  DrawnBox,
  ElisionExposure,
  ExposedGap,
  StoredWidth,
  WidthForm,
} from "@timetoalign/tilie-layout";
import { widthAs } from "@timetoalign/tilie-layout";
import type { Declaration, Selector } from "@timetoalign/timetoshare";
import { ELISION_DISPLAY, isJsonFloat } from "@timetoalign/timetoshare";
import type { Result } from "./problems.ts";
import { InspectorCode, refused } from "./problems.ts";
import { toggledDisplay } from "./stamps/commands.ts";

// --- Words ----------------------------------------------------------------------------------------

/** How a root's cards are drawn (drawing.md section 8.9, Modes), Hidden its card rule's `display: none`. */
export type RootMode = "hidden" | "full" | "proportional" | "custom";

/** How a frame draws the elisions of its group: none, or the stored ones. */
export type FrameMode = "full" | "custom";

export const MODE_WORDS: { readonly [mode in RootMode]: string } = {
  hidden: "Hidden",
  full: "Full",
  proportional: "Proportional",
  custom: "Custom",
};

/** A word of an elision's `display`. */
export type ElisionWord = (typeof ELISION_DISPLAY)[number];

/** The words of the Show toggles, each with its label. */
export const DISPLAY_LABELS: { readonly [word in ElisionWord]: string } = {
  ellipsis: "Ellipsis",
  name: "Name",
  id: "ID",
  coordinate: "Coordinate",
  continuation: "Lines",
};

/** The Show toggles of a stored elision: every word. */
export const STORED_WORDS: readonly { readonly word: ElisionWord; readonly label: string }[] =
  ELISION_DISPLAY.map((word) => ({ word, label: DISPLAY_LABELS[word] }));

/** The Show toggles of a root's default elisions: every word but `id`, which a default has not. */
export const DEFAULT_WORDS: readonly { readonly word: ElisionWord; readonly label: string }[] =
  STORED_WORDS.filter(({ word }) => word !== "id");

/** The words of a gap's width forms. */
export const FORM_WORDS: { readonly [form in WidthForm]: string } = {
  standard: "Standard (32)",
  ratio: "Proportional",
  span: "As wide as",
  canvas: "Fixed",
};

export const WIDTH_FORMS: readonly WidthForm[] = ["standard", "ratio", "span", "canvas"];

/** The hint of a default elision's form. */
export const DEFAULT_HINT = "Choose Custom to edit";

/** The note of a stored elision lying between two groups of a row, which the root's card does not draw (section 8.8). */
export const NOT_DRAWN_ARRANGED = "not drawn while arranged side by side";

// --- Shapes ---------------------------------------------------------------------------------------

/** One option of a mode's radio group. */
export interface ModeOption<Mode extends string> {
  readonly mode: Mode;
  /** The commands choosing it, sent in order: none for the mode shown. */
  readonly commands: readonly Command[];
  /** Why it cannot be chosen; `null` where it can. */
  readonly reason: string | null;
}

/** One stored elision in a list: its address, its name, its timeline's name and its stretch. */
export interface ElisionRow {
  readonly address: Address;
  /** Its `name`, else "—". */
  readonly name: string;
  /** The name of the timeline it lies on, else that timeline's ID. */
  readonly timeline: string;
  /** Its elided coordinates on that timeline's axis, `start–end` with the unit; pieces joined. */
  readonly stretch: string;
  /** Why the card does not draw it (`NOT_DRAWN_ARRANGED`); `null` where it is drawn or not listed for it. */
  readonly note: string | null;
  /** Its `[×]`: one `remove`. */
  readonly remove: RemoveCommand;
}

/**
 * A gap or a seam a root drawn once behind a row cuts between two groups
 * hanging on it (section 8.8, Drawn once): read-only, no card elision.
 */
export interface ArrangedGap {
  /** The two groups' IDs, joined: the pair is one per root. */
  readonly key: string;
  /** `between "G1" and "G2"`, the groups by name, else by ID, left to right. */
  readonly between: string;
  /** `start–end` with the unit for a gap; `seam at t` for a seam, which leaves out nothing. */
  readonly stretch: string;
}

/** One depth of the root's Rows: the timelines at that depth, and whether it is chosen. */
export interface DepthRow {
  readonly depth: number;
  /** The names of the timelines at that depth, joined. */
  readonly names: string;
  readonly chosen: boolean;
}

/** The root's block, `Parent timeline "R"` or `Elisions of "R"`. */
export interface RootElisions {
  readonly block: string;
  readonly root: string;
  readonly title: string;
  /** The address of the root's rule, which the drafts of its Proportion belong to. */
  readonly address: Address;
  readonly manifest: Manifest;
  readonly mode: RootMode;
  /** Hidden, Full, Proportional, Custom for an ancestor card; Full and Custom for an ungrouped root. */
  readonly options: readonly ModeOption<RootMode>[];
  /** The gaps and seams between the groups of a row it is drawn behind once, left to right; none elsewhere. */
  readonly arranged: readonly ArrangedGap[];
  /** What Proportional shows; `null` in any other mode. */
  readonly proportional: {
    /** Whether `elision-proportion` is `auto`. */
    readonly automatic: boolean;
    /** The proportion its default elisions take, as the field shows it. */
    readonly proportion: string;
    readonly depthsAutomatic: boolean;
    /** Deepest first, as the rows lie in the card. */
    readonly depths: readonly DepthRow[];
    readonly display: readonly ElisionWord[];
  } | null;
  /**
   * What Custom shows: the stored card elisions the card draws, then, drawn
   * once behind a row, those lying between its first and last group, which
   * it keeps undrawn (`note`); `null` in any other mode.
   */
  readonly custom: {
    readonly rows: readonly ElisionRow[];
    /** One `add` of an elision at the middle of the subject's timeline; `null` where none fits. */
    readonly add: AddCommand | null;
    /** One `remove` of every card elision of `R`; `null` without one. */
    readonly removeAll: RemoveCommand | null;
  } | null;
}

/** The group's block, `Elisions in group "G"`. */
export interface GroupElisions {
  readonly block: string;
  readonly group: string;
  readonly title: string;
  readonly mode: FrameMode;
  readonly options: readonly ModeOption<FrameMode>[];
  /** "0 elisions", "1 elision", "2 elisions". */
  readonly count: string;
  /** Every stored elision of the group, drawn or not. */
  readonly rows: readonly ElisionRow[];
  readonly add: AddCommand | null;
  readonly removeAll: RemoveCommand | null;
}

/** The fields of a selected elision the form types into. */
export type ElisionField = "start" | "end" | "ratio" | "span" | "canvas";

/** One other timeline a group elision elides, with its elided coordinates; "—" without a value. */
export interface AlsoElided {
  readonly timeline: string;
  readonly stretch: string;
}

/** One selected elision as the form shows and edits it. */
export interface ElisionForm {
  readonly block: Block;
  readonly address: Address;
  readonly manifest: Manifest;
  /** `Elision on "T"`. */
  readonly title: string;
  readonly timeline: TimelineManifest;
  /** The unit's pretty word after From, To and As wide as. */
  readonly unit: string;
  /** The stored elision; `null` for a default one, which the form shows read-only. */
  readonly stored: Elision | null;
  readonly start: string;
  readonly end: string;
  readonly form: WidthForm;
  /** The text of each width field: the stored value of its form, else the drawn width converted. */
  readonly widths: { readonly [form in Exclude<WidthForm, "standard">]: string };
  readonly display: readonly ElisionWord[];
  /** Across a frame, the other timelines it elides; `null` for a card elision. */
  readonly also: readonly AlsoElided[] | null;
  /** The gap it is drawn as and what its width is read with; `null` where it is not drawn. */
  readonly gap: {
    readonly gap: ExposedGap;
    readonly L: number;
    readonly lambda: Real;
  } | null;
}

/** What a typed field or a chosen form gives: the command, `null` where it changes nothing, or a refusal. */
export type ElisionEdit = Result<Command | null>;

// --- Reading the exposure (the arranger's gap readers replace these after the merge) --------------

/** The exposure of the container at `key` in `drawing`: a card's, an ancestor card's or a frame's. */
export function exposureOf(drawing: Drawing, key: PlaceKey): ElisionExposure | undefined {
  return drawing.elisions.find((exposure) => samePlaceKey(exposure.key, key));
}

/** The gaps at `address` an exposure draws, from the left: the pieces of one elision. */
export function gapsOf(exposure: ElisionExposure, address: ElementAddress): ExposedGap[] {
  return exposure.gaps.filter((gap) => sameAddress(gap.address, address));
}

/** The graphical length `L` a card's or frame's gaps are read with: its full runs' scale. */
export function lengthOf(exposure: ElisionExposure): number {
  return exposure.runs[0]?.L ?? 0;
}

// --- Values ---------------------------------------------------------------------------------------

/** A JSON number of the manifest (an integral float wrapped) as a double. */
function jsonNumber(value: unknown): number {
  return isJsonFloat(value) ? value.value : Number(value);
}

/** A real as a double. */
function double(value: Real): number {
  return typeof value === "number" ? value : toFloat(value);
}

/** A timeline's length on its own axis, or its reach where its length is not known. */
function extentOf(timeline: TimelineManifest, manifest: Manifest): Real {
  return timeline.length === null
    ? reachOf(timeline, manifest)
    : realOf(axisCoordinate(timeline.length, timeline));
}

/** A value of the axis of `timeline` as the manifest writes it; `undefined` where it does not fit. */
function axisValueAt(value: Real, timeline: TimelineManifest): AxisValue | undefined {
  const exact = exactCoordinate(value, timeline.unit, timeline.number_type);
  return exact === undefined ? undefined : toAxisValue(exact);
}

/** A value of the axis of `timeline` as an exact coordinate value; `undefined` where it does not fit. */
function valueAt(value: Real, timeline: TimelineManifest): CoordinateValue | undefined {
  return exactCoordinate(value, timeline.unit, timeline.number_type)?.value;
}

/** The pretty text `start–end` of a stretch on `timeline`'s axis, the unit after the end. */
function stretchText(start: Real, end: Real, timeline: TimelineManifest): string {
  const { number_type: numberType, unit } = timeline;
  const from = valueAt(start, timeline);
  const to = valueAt(end, timeline);
  if (from === undefined || to === undefined) return "";
  return `${prettyText(from, numberType, unit === "seconds" ? unit : null)}–${prettyText(to, numberType, unit)}`;
}

/** The text a field shows of an exact value: as Copy writes it, so that typing it back gives it. */
function fieldText(value: Real, timeline: TimelineManifest): string {
  const exact = valueAt(value, timeline);
  return exact === undefined ? String(double(value)) : copyValue(exact, timeline.number_type);
}

/** A stored elision's start and end on its timeline's axis. */
function storedStretch(elision: Elision, timeline: TimelineManifest): [Real, Real] {
  return [
    realOf(axisCoordinate(elision.start, timeline)),
    realOf(axisCoordinate(elision.end, timeline)),
  ];
}

/** The name of a timeline, else its ID. */
const nameOf = (timeline: TimelineManifest): string => timeline.name ?? timeline.id;

/** "1 elision", "2 elisions". */
const counted = (n: number): string => (n === 1 ? "1 elision" : `${n} elisions`);

/**
 * The value typed into a field of `timeline`'s axis, exact (`parseAxisValue`),
 * as the manifest writes it there: a decimal on a fraction axis is the value it
 * denotes, on a float axis the nearest double; a message where none fits.
 */
function typedValue(text: string, timeline: TimelineManifest): AxisValue | string {
  const parsed = parseAxisValue(text, timeline.number_type);
  if (!(parsed instanceof Rational)) return parsed.message;
  const value = axisValueAt(timeline.number_type === "float" ? toFloat(parsed) : parsed, timeline);
  return value ?? `${text.trim()} is no ${timeline.number_type} value of '${timeline.id}'`;
}

/**
 * The middle third of the stretch `[from, to]` of `timeline`'s own axis, as
 * the manifest writes it: exact on a fraction axis, whole units inside it on
 * an int axis (the whole stretch where no whole unit lies inside), doubles on
 * a float axis; `null` for an empty stretch.
 */
function middleThird(
  from: Real,
  to: Real,
  timeline: TimelineManifest,
): [AxisValue, AxisValue] | null {
  const a = toRational(from);
  const b = toRational(to);
  if (a.compare(b) >= 0) return null;
  const third = b.subtract(a).divide(Rational.of(3n));
  let start: Real = a.add(third);
  let end: Real = b.subtract(third);
  if (timeline.number_type === "int") {
    const up = (x: Rational) => -Rational.of(0n).subtract(x).floor();
    let first = up(start);
    let last = end.floor();
    if (first >= last) {
      first = up(a);
      last = b.floor();
    }
    if (first >= last) return null;
    start = Rational.of(first);
    end = Rational.of(last);
  } else if (timeline.number_type === "float") {
    start = toFloat(start);
    end = toFloat(end);
  }
  const written = [axisValueAt(start, timeline), axisValueAt(end, timeline)] as const;
  const [s, e] = written;
  return s === undefined || e === undefined ? null : [s, e];
}

// --- Rules ----------------------------------------------------------------------------------------

/** The selector of a root's rule: every card of `R` (drawing.md section 8.9, Modes). */
function rootSelector(root: string): Selector {
  return { addresses: [{ id: root, part: ["card"] }] };
}

/** The selector of a frame's rule. */
function frameSelector(group: string): Selector {
  return { addresses: [{ id: group }] };
}

/** The declaration of the manifest's own rule of `select`; empty where it has none. */
function ownDeclaration(manifest: Manifest, select: Selector): Declaration {
  const graphical = manifest.graphical;
  const key = canonicalText(select);
  const own = (graphical?.rules ?? []).find((rule) => canonicalText(rule.select) === key);
  if (own === undefined) return {};
  return typeof own.set === "string" ? (graphical?.styles?.[own.set] ?? {}) : own.set;
}

function styleCommand(block: string, select: Selector, set: StyleCommand["set"]): StyleCommand {
  return { type: "style", select, set, blocks: [block] };
}

// --- Where the selection lies ---------------------------------------------------------------------

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

/**
 * The groups a subject's box concerns: the groups whose frames an ancestor
 * card lies behind (`ancestor.groups`, every group of a row for a root drawn
 * once), else the group whose frame it is or holds it; none for neither.
 */
function groupsBehind(box: DrawnBox | null): readonly string[] {
  if (box === null) return [];
  if (box.ancestor !== undefined) return box.ancestor.groups;
  const group =
    box.kind === "frame" || box.key?.member !== undefined
      ? (box.key?.item ?? null)
      : (box.holder?.item ?? null);
  return group === null ? [] : [group];
}

/**
 * The ancestor card of `root` the drawing records behind the frame of
 * `group`: the one whose `ancestor.groups` lists it (a root drawn once behind
 * a row lies behind every group hanging on it, under the first one's key);
 * `undefined` where none is recorded (hidden).
 */
function drawnCardOf(drawing: Drawing, root: string, group: string): DrawnBox | undefined {
  return drawing.boxes.find(
    (box) => box.ancestor?.groups.includes(group) === true && box.key?.member === root,
  );
}

/** The root a block acts on, the card it reads, and whether that is an ancestor card. */
interface RootOf {
  readonly root: TimelineManifest;
  readonly ancestor: boolean;
  /** The card's place key: `{item: G, member: R}` for an ancestor card, `{item: R}` for an ungrouped card. */
  readonly key: PlaceKey;
  /**
   * The stretch of `R`'s axis its anchors cover: the member the ancestor card
   * is aligned to, from its start to its end; behind a row, from the first
   * group's anchor's start to the last one's end; `null` for an ungrouped card.
   */
  readonly protected: { readonly from: Real; readonly to: Real } | null;
  /** The groups the card lies behind, left to right (`ancestor.groups`); none for an ungrouped card. */
  readonly groups: readonly string[];
  /** The timeline of the one subject; `null` for several. */
  readonly subject: string | null;
}

/**
 * The root a block acts on: every subject a timeline, a card, a part of
 * either or an elision, all in `block` and under one root `R` whose drawing
 * can carry elisions (it has an ancestor card, or it is an ungrouped root);
 * the card read is the one behind the group the selection concerns, else the
 * first; else `null`.
 */
function rootOf(block: Block, subjects: readonly Subject[], drawing: Drawing): RootOf | null {
  const { manifest } = block;
  const { ancestry } = indexOf(manifest);
  const concerns: { timeline: string; groups: readonly string[] }[] = [];
  for (const subject of subjects) {
    const timeline = subject.block === block.id ? timelineOf(subject.resolved) : null;
    if (timeline === null) return null;
    concerns.push({ timeline, groups: groupsBehind(subject.box) });
  }
  const roots = new Set(concerns.map(({ timeline }) => ancestry.get(timeline)?.[0]));
  const [id, ...others] = roots;
  if (id === undefined || others.length > 0) return null;
  const root = findTimeline(manifest, id);
  if (root === undefined) return null;
  const only = concerns.length === 1 ? (concerns[0]?.timeline ?? null) : null;
  const drawings = memberDrawings(manifest);
  const cards = drawings.ancestorCards.filter((card) => card.root.timeline.id === id);
  const card =
    cards.find((each) => concerns.some(({ groups }) => groups.includes(each.group.id))) ?? cards[0];
  if (card !== undefined) {
    const drawn = drawnCardOf(drawing, id, card.group.id);
    const groups = drawn?.ancestor?.groups ?? [card.group.id];
    let from: Rational | null = null;
    let to: Rational | null = null;
    for (const each of cards.filter((other) => groups.includes(other.group.id))) {
      let start = Rational.of(0n);
      for (const { timeline, offset } of each.member.ancestors) {
        start = toRational(realOf(axisCoordinate(offset, timeline))).add(start);
      }
      const end = toRational(extentOf(each.member.timeline, manifest)).add(start);
      if (from === null || start.compare(from) < 0) from = start;
      if (to === null || end.compare(to) > 0) to = end;
    }
    return {
      root,
      ancestor: true,
      key: drawn?.key ?? { item: card.group.id, member: id },
      protected: from === null || to === null ? null : { from, to },
      groups,
      subject: only,
    };
  }
  if (drawings.ungrouped.some((drawn) => drawn.timeline.id === id)) {
    return { root, ancestor: false, key: { item: id }, protected: null, groups: [], subject: only };
  }
  return null;
}

/** A timeline's offset from its root's zero, on the root's axis. */
function offsetOnRoot(manifest: Manifest, timeline: string): Rational {
  const lineage = indexOf(manifest).ancestry.get(timeline) ?? [];
  let offset = Rational.of(0n);
  for (const id of lineage.slice(1)) {
    const found = findTimeline(manifest, id);
    if (found?.offset !== undefined && found.offset !== null) {
      offset = offset.add(toRational(realOf(axisCoordinate(found.offset, found))));
    }
  }
  return offset;
}

// --- The root's block -----------------------------------------------------------------------------

/** The stored elisions of `exposure`'s gaps, one row per address, in drawing order. */
function exposedRows(block: Block, gaps: readonly ExposedGap[]): ElisionRow[] {
  const rows = new Map<string, { address: Address; gaps: ExposedGap[] }>();
  for (const gap of gaps) {
    const address = inBlock(block.id, gap.address);
    const key = addressKey(address);
    const row = rows.get(key);
    if (row === undefined) rows.set(key, { address, gaps: [gap] });
    else row.gaps.push(gap);
  }
  const elisions = block.manifest.graphical?.elisions ?? [];
  return [...rows.values()].flatMap(({ address, gaps: pieces }) => {
    const stored = elisions.find((elision) => elision.id === address.id);
    const timeline = stored && findTimeline(block.manifest, stored.timeline);
    if (stored === undefined || timeline === undefined) return [];
    return [
      {
        address,
        name: stored.name ?? "—",
        timeline: nameOf(timeline),
        stretch: pieces.map((gap) => stretchText(gap.start, gap.end, timeline)).join(", "),
        note: null,
        remove: { type: "remove", targets: [address] },
      },
    ];
  });
}

/** One row per stored elision, as the manifest stores it, each with `note`. */
function storedRows(
  block: Block,
  elisions: readonly Elision[],
  note: string | null = null,
): ElisionRow[] {
  return elisions.flatMap((elision) => {
    const timeline = findTimeline(block.manifest, elision.timeline);
    if (timeline === undefined) return [];
    const address = inBlock(block.id, idAddress(elision.id));
    const [start, end] = storedStretch(elision, timeline);
    return [
      {
        address,
        name: elision.name ?? "—",
        timeline: nameOf(timeline),
        stretch: stretchText(start, end, timeline),
        note,
        remove: { type: "remove", targets: [address] },
      },
    ];
  });
}

/** One `remove` of `elisions`; `null` for none. */
function removalOf(block: string, elisions: readonly Elision[]): RemoveCommand | null {
  if (elisions.length === 0) return null;
  return {
    type: "remove",
    targets: elisions.map((elision) => inBlock(block, idAddress(elision.id))),
  };
}

/**
 * The `add` storing the default elisions an ancestor card draws, as drawn
 * (drawing.md section 8.9, Modes; the switch from Proportional to Custom):
 * one entry per gap, its elided coordinates exact, `{canvas: g}` where its
 * drawn width is not the standard 32, the card's `elision-display`, no name;
 * `null` where the card draws none.
 */
export function defaultsStored(block: Block, exposure: ElisionExposure): AddCommand | null {
  const elision = exposure.gaps.flatMap((gap) => {
    if (gap.origin !== "default") return [];
    const timeline = findTimeline(block.manifest, gap.timeline);
    const start = timeline && axisValueAt(gap.start, timeline);
    const end = timeline && axisValueAt(gap.end, timeline);
    if (start === undefined || end === undefined) return [];
    return [
      {
        timeline: gap.timeline,
        start,
        end,
        ...(gap.drawn === 32 ? {} : { width: { canvas: gap.drawn } }),
        display: [...exposure.display],
      },
    ];
  });
  return elision.length === 0 ? null : { type: "add", into: { block: block.id }, elision };
}

/** The mode a root's exposure shows; Hidden where its card is not drawn. */
function rootModeOf(exposure: ElisionExposure | undefined, ancestor: boolean): RootMode {
  if (exposure === undefined) return "hidden";
  if (!ancestor && exposure.drawn === "proportional") return "custom";
  return exposure.drawn;
}

/** The options of a root's radio group (drawing.md section 8.9, Modes; one switch, one entry). */
function rootOptions(
  block: Block,
  of: RootOf,
  mode: RootMode,
  exposure: ElisionExposure | undefined,
): ModeOption<RootMode>[] {
  const root = of.root.id;
  const style = (set: StyleCommand["set"]) => styleCommand(block.id, rootSelector(root), set);
  const stored = elisionsUnder(block.manifest, root).length > 0;
  const holding = groupsHolding(block.manifest, root);
  const option = (
    target: RootMode,
    commands: readonly Command[],
    reason: string | null = null,
  ) => ({
    mode: target,
    commands: target === mode || reason !== null ? [] : commands,
    reason,
  });
  const defaults =
    mode === "proportional" && exposure !== undefined ? defaultsStored(block, exposure) : null;
  const custom: Command[] = stored
    ? [style({ "elision-mode": null, display: null })]
    : defaults !== null
      ? [defaults, ...(exposure?.mode === "auto" ? [] : [style({ "elision-mode": null })])]
      : [style({ "elision-mode": "custom", display: null })];
  const [group] = holding;
  const customOption = option(
    "custom",
    custom,
    group === undefined ? null : `its elisions belong to group "${group.name ?? group.id}"`,
  );
  const full = option("full", [style({ "elision-mode": "full", display: null })]);
  if (!of.ancestor) return [full, customOption];
  return [
    option("hidden", [style({ display: "none" })]),
    full,
    option("proportional", [
      style({ "elision-mode": stored ? "proportional" : null, display: null }),
    ]),
    customOption,
  ];
}

/** The text a proportion field shows: at most six decimals. */
function proportionText(proportion: number): string {
  return String(Number(proportion.toFixed(6)));
}

/** The depths of the chain `A1 … Ak`, deepest first: `Aj` and the other children of `A(j−1)`. */
function depthRows(
  manifest: Manifest,
  chain: readonly string[],
  chosen: readonly number[],
): DepthRow[] {
  return chain
    .map((id, index): DepthRow => {
      const depth = index + 1;
      const parent = index === 0 ? undefined : findTimeline(manifest, chain[index - 1] ?? "");
      const own = findTimeline(manifest, id);
      const timelines = parent === undefined ? (own === undefined ? [] : [own]) : parent.children;
      return { depth, names: timelines.map(nameOf).join(", "), chosen: chosen.includes(depth) };
    })
    .reverse();
}

/**
 * The `add` of an elision on the subject's timeline `T` (or `R`) at the
 * middle third of the longest stretch of it outside the protected span,
 * with the standard gap; `null` where none fits.
 */
function addOnRoot(block: Block, of: RootOf): AddCommand | null {
  const { manifest } = block;
  const lineage = of.subject === null ? undefined : indexOf(manifest).ancestry.get(of.subject);
  const inCard =
    of.subject !== null &&
    lineage?.[0] === of.root.id &&
    groupsHolding(manifest, of.subject).length === 0;
  const timeline = (inCard && findTimeline(manifest, of.subject ?? "")) || of.root;
  const offset = offsetOnRoot(manifest, timeline.id);
  const from = offset;
  const to = offset.add(toRational(extentOf(timeline, manifest)));
  const stretches: [Rational, Rational][] = [];
  if (of.protected === null) stretches.push([from, to]);
  else {
    const left = toRational(of.protected.from);
    const right = toRational(of.protected.to);
    stretches.push([from, left.compare(to) < 0 ? left : to]);
    stretches.push([right.compare(from) > 0 ? right : from, to]);
  }
  const longest = stretches
    .filter(([a, b]) => a.compare(b) < 0)
    .reduce<[Rational, Rational] | null>(
      (best, each) =>
        best === null || each[1].subtract(each[0]).compare(best[1].subtract(best[0])) > 0
          ? each
          : best,
      null,
    );
  if (longest === null) return null;
  const stretch = middleThird(longest[0].subtract(offset), longest[1].subtract(offset), timeline);
  if (stretch === null) return null;
  return {
    type: "add",
    into: inBlock(block.id, idAddress(timeline.id)),
    elision: { start: stretch[0], end: stretch[1] },
  };
}

/** The name of a group, else its ID. */
function groupName(manifest: Manifest, id: string): string {
  return manifest.groups.find((group) => group.id === id)?.name ?? id;
}

/**
 * The gaps and seams the arrangement cuts in a root's card drawn once behind
 * a row (exposure origin `arrangement`), left to right: the `k`-th lies
 * between the `k`-th and the next group the card lies behind, which are in
 * the row's order, as the anchors whose stretches it separates.
 */
function arrangedGaps(
  manifest: Manifest,
  of: RootOf,
  exposure: ElisionExposure | undefined,
): ArrangedGap[] {
  const gaps = exposure?.gaps.filter((gap) => gap.origin === "arrangement") ?? [];
  return gaps.flatMap((gap, index) => {
    const left = of.groups[index];
    const right = of.groups[index + 1];
    if (left === undefined || right === undefined) return [];
    const seam = toRational(gap.start).compare(toRational(gap.end)) === 0;
    const at = valueAt(gap.start, of.root);
    const point = at === undefined ? "" : prettyText(at, of.root.number_type, of.root.unit);
    return [
      {
        key: JSON.stringify([left, right]),
        between: `between "${groupName(manifest, left)}" and "${groupName(manifest, right)}"`,
        stretch: seam ? `seam at ${point}` : stretchText(gap.start, gap.end, of.root),
      },
    ];
  });
}

/**
 * The stored card elisions of a root drawn once behind a row that its card
 * does not draw and that lie, on its axis, between its first group's anchor
 * and its last one's (section 8.8, Drawn once: the stretch between two anchors
 * is the arrangement's gap or seam whatever the mode); none for a card behind
 * one group.
 */
function undrawnBetween(manifest: Manifest, of: RootOf, exposure: ElisionExposure): Elision[] {
  const span = of.protected;
  if (of.groups.length < 2 || span === null) return [];
  const from = toRational(span.from);
  const to = toRational(span.to);
  const drawn = new Set(
    exposure.gaps.filter((gap) => gap.origin === "stored").map((gap) => gap.address.id),
  );
  return elisionsUnder(manifest, of.root.id).filter((elision) => {
    const timeline = findTimeline(manifest, elision.timeline);
    if (drawn.has(elision.id) || timeline === undefined) return false;
    const offset = offsetOnRoot(manifest, timeline.id);
    const [start, end] = storedStretch(elision, timeline);
    return (
      toRational(start).add(offset).compare(to) < 0 && toRational(end).add(offset).compare(from) > 0
    );
  });
}

/**
 * The root's block of the inspected subjects, all in `block` and drawn as
 * `drawing`: offered where every subject is a timeline, a card, a part of
 * either or an elision, all under one root `R` that has an ancestor card or
 * is an ungrouped root; `null` otherwise.
 */
export function rootElisionsOf(
  block: Block,
  subjects: readonly Subject[],
  drawing: Drawing,
): RootElisions | null {
  const of = rootOf(block, subjects, drawing);
  if (of === null) return null;
  const exposure = exposureOf(drawing, of.key);
  if (exposure === undefined && !of.ancestor) return null;
  const root = of.root.id;
  const { manifest } = block;
  const mode = rootModeOf(exposure, of.ancestor);
  const own = ownDeclaration(manifest, rootSelector(root));
  const depthsStated = own["elision-depths"];
  const proportional =
    mode === "proportional" && exposure !== undefined
      ? {
          automatic: exposure.automatic,
          proportion: proportionText(exposure.proportion ?? 1),
          depthsAutomatic: depthsStated === undefined || depthsStated === "auto",
          depths: depthRows(manifest, exposure.chain, exposure.depths),
          display: exposure.display,
        }
      : null;
  const custom =
    mode === "custom" && exposure !== undefined
      ? {
          rows: [
            ...exposedRows(
              block,
              exposure.gaps.filter((gap) => gap.origin === "stored"),
            ),
            ...storedRows(block, undrawnBetween(manifest, of, exposure), NOT_DRAWN_ARRANGED),
          ],
          add: addOnRoot(block, of),
          removeAll: removalOf(block.id, elisionsUnder(manifest, root)),
        }
      : null;
  const name = nameOf(of.root);
  return {
    block: block.id,
    root,
    title: of.ancestor ? `Parent timeline "${name}"` : `Elisions of "${name}"`,
    address: inBlock(block.id, { id: root, part: ["card"] }),
    manifest,
    mode,
    options: rootOptions(block, of, mode, exposure),
    arranged: arrangedGaps(manifest, of, exposure),
    proportional,
    custom,
  };
}

/** The `style` of the root's rule with `set`. */
function rootStyle(section: RootElisions, set: StyleCommand["set"]): StyleCommand {
  return styleCommand(section.block, rootSelector(section.root), set);
}

/**
 * The command of Proportion's Automatic: ticked, `elision-proportion` back
 * to its initial `auto`; unticked, the shown proportion stated.
 */
export function proportionAutomaticCommand(section: RootElisions): StyleCommand | null {
  const shown = section.proportional;
  if (shown === null) return null;
  return rootStyle(section, {
    "elision-proportion": shown.automatic ? Number(shown.proportion) : null,
  });
}

/** Decimal text a proportion or a width takes: digits with an optional point, an optional exponent. */
const DECIMAL = /^[+]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;

/** The command a typed proportion gives: a number in (0, 1]; `null` where it changes nothing. */
export function proportionCommand(section: RootElisions, text: string): ElisionEdit {
  const path = [addressKey(section.address), "elision-proportion"];
  const trimmed = text.trim();
  if (trimmed === section.proportional?.proportion) return { ok: true, value: null };
  const value = Number(trimmed);
  if (!DECIMAL.test(trimmed) || !(value > 0 && value <= 1)) {
    return refused(
      InspectorCode.invalidValue,
      `${trimmed} is no proportion: write a number above 0 and at most 1`,
      path,
    );
  }
  return { ok: true, value: rootStyle(section, { "elision-proportion": value }) };
}

/** The command of Rows' Automatic: ticked, `elision-depths` back to `auto`; unticked, the depths chosen now. */
export function depthsAutomaticCommand(section: RootElisions): StyleCommand | null {
  const shown = section.proportional;
  if (shown === null) return null;
  if (!shown.depthsAutomatic) return rootStyle(section, { "elision-depths": null });
  const chosen = shown.depths.filter((row) => row.chosen).map((row) => row.depth);
  return rootStyle(section, { "elision-depths": [...chosen].sort((a, b) => a - b).join(" ") });
}

/** The command toggling depth `depth` of the Rows; `null` for the last one chosen, which stays. */
export function depthCommand(section: RootElisions, depth: number): StyleCommand | null {
  const shown = section.proportional;
  if (shown === null) return null;
  const chosen = new Set(shown.depths.filter((row) => row.chosen).map((row) => row.depth));
  if (chosen.has(depth)) chosen.delete(depth);
  else chosen.add(depth);
  if (chosen.size === 0) return null;
  return rootStyle(section, { "elision-depths": [...chosen].sort((a, b) => a - b).join(" ") });
}

/** The command toggling `word` of the root's `elision-display`, every default elision at once. */
export function defaultsDisplayCommand(
  section: RootElisions,
  word: ElisionWord,
): StyleCommand | null {
  const shown = section.proportional;
  if (shown === null) return null;
  const display = toggledDisplay(ELISION_DISPLAY, shown.display, word);
  return rootStyle(section, {
    "elision-display": display.length === 0 ? "none" : display.join(" "),
  });
}

// --- The group's block ----------------------------------------------------------------------------

/** The group a subject lies in: its frame, a member card's frame, or the groups its timeline lies in. */
function groupConcerned(manifest: Manifest, subject: Subject): string | null {
  const { resolved, box } = subject;
  const owner = resolved.kind === "part" ? resolved.owner : resolved;
  if (owner.kind === "frame") return owner.group.id;
  const timeline = timelineOf(resolved);
  if (timeline === null) return null;
  const holding = groupsHolding(manifest, timeline).map((group) => group.id);
  const framed = box === null || box.ancestor !== undefined ? [] : groupsBehind(box);
  const held = holding.find((id) => framed.includes(id));
  if (held !== undefined) return held;
  return holding[0] ?? null;
}

/**
 * The member `T` an Add of the group's block lies on (section 5.6): the
 * subject's timeline where it lies in `G`, else the member whose card holds
 * the selection, else `G`'s first member in display order.
 */
function addOnGroup(block: Block, group: string, subjects: readonly Subject[]): AddCommand | null {
  const { manifest } = block;
  const [subject, ...others] = subjects;
  let id: string | undefined;
  if (subject !== undefined && others.length === 0) {
    const timeline = timelineOf(subject.resolved);
    if (timeline !== null && groupsHolding(manifest, timeline).some((each) => each.id === group)) {
      id = timeline;
    } else if (subject.box?.key?.member !== undefined && subject.box.ancestor === undefined) {
      id = subject.box.key.member;
    }
  }
  id ??= displayOrder(manifest, group)[0];
  const timeline = id === undefined ? undefined : findTimeline(manifest, id);
  if (timeline === undefined) return null;
  const stretch = middleThird(Rational.of(0n), extentOf(timeline, manifest), timeline);
  if (stretch === null) return null;
  return {
    type: "add",
    into: inBlock(block.id, idAddress(timeline.id)),
    elision: { start: stretch[0], end: stretch[1] },
  };
}

/**
 * The group's block: offered wherever every subject lies in one group `G`'s
 * frame (the frame or its title, a member card, a timeline drawn in it, a
 * group elision), and in `G`'s group editor with nothing selected, where
 * the drawing draws `G`'s frame; `null` otherwise.
 */
export function groupElisionsOf(
  block: Block,
  subjects: readonly Subject[],
  drawing: Drawing,
  edited: string | null,
): GroupElisions | null {
  const { manifest } = block;
  let group: string | null = subjects.length === 0 ? edited : null;
  for (const subject of subjects) {
    const concerned = subject.block === block.id ? groupConcerned(manifest, subject) : null;
    if (concerned === null || (group !== null && concerned !== group)) return null;
    group = concerned;
  }
  if (group === null) return null;
  const exposure = exposureOf(drawing, { item: group });
  const found = manifest.groups.find((each) => each.id === group);
  if (exposure === undefined || found === undefined) return null;
  const mode: FrameMode = exposure.drawn === "custom" ? "custom" : "full";
  const style = (set: StyleCommand["set"]) => styleCommand(block.id, frameSelector(group), set);
  const option = (target: FrameMode, command: StyleCommand) => ({
    mode: target,
    commands: target === mode ? [] : [command],
    reason: null,
  });
  const elisions = groupElisions(manifest, group);
  return {
    block: block.id,
    group,
    title: `Elisions in group "${found.name ?? found.id}"`,
    mode,
    options: [
      option("full", style({ "elision-mode": "full" })),
      option("custom", style({ "elision-mode": null })),
    ],
    count: counted(elisions.length),
    rows: storedRows(block, elisions),
    add: addOnGroup(block, group, subjects),
    removeAll: removalOf(block.id, elisions),
  };
}

// --- A selected elision ---------------------------------------------------------------------------

/** The width form a stored `width` has. */
function formOfWidth(width: Elision["width"] | undefined): WidthForm {
  if (width?.ratio !== undefined) return "ratio";
  if (width?.span !== undefined) return "span";
  if (width?.canvas !== undefined) return "canvas";
  return "standard";
}

/** The stored width `form` gives the drawn gap, as the manifest writes it; `undefined` where it does not fit. */
function storedWidth(
  form: WidthForm,
  shown: NonNullable<ElisionForm["gap"]>,
  timeline: TimelineManifest,
): { readonly [form: string]: unknown } | null | undefined {
  const width: StoredWidth = widthAs(form, shown.gap, shown.L, shown.lambda, timeline.number_type);
  if (width === null) return null;
  if ("span" in width) {
    const span = axisValueAt(width.span, timeline);
    return span === undefined ? undefined : { span };
  }
  return width;
}

/** The text of each width field: the stored value of its form, else the drawn width converted. */
function widthTexts(
  width: Elision["width"] | undefined,
  shown: ElisionForm["gap"],
  timeline: TimelineManifest,
): ElisionForm["widths"] {
  const converted = (form: Exclude<WidthForm, "standard">): string => {
    if (shown === null) return "";
    const value = widthAs(form, shown.gap, shown.L, shown.lambda, timeline.number_type);
    if (value === null) return "";
    if ("span" in value) return fieldText(value.span, timeline);
    return String("ratio" in value ? value.ratio : value.canvas);
  };
  return {
    ratio: width?.ratio !== undefined ? String(jsonNumber(width.ratio)) : converted("ratio"),
    span:
      width?.span !== undefined
        ? copyValue(axisCoordinate(width.span, timeline).value, timeline.number_type)
        : converted("span"),
    canvas: width?.canvas !== undefined ? String(jsonNumber(width.canvas)) : converted("canvas"),
  };
}

/**
 * Where a stored elision `elision` on `timeline` is drawn for the subject:
 * a group elision across the frame of the group its subject's box lies in,
 * else the first group its timeline lies in, its span read with that
 * member's length; a card elision in the card the root block reads, its
 * span read with the root's length.
 */
function storedGap(
  block: Block,
  subject: Subject,
  elision: Elision,
  drawing: Drawing,
): { gap: NonNullable<ElisionForm["gap"]> | null; also: AlsoElided[] | null } {
  const { manifest } = block;
  const holding = groupsHolding(manifest, elision.timeline);
  const address = idAddress(elision.id);
  if (holding.length > 0) {
    const framed = groupsBehind(subject.box);
    const group = holding.find((each) => framed.includes(each.id)) ?? holding[0];
    const exposure = group === undefined ? undefined : exposureOf(drawing, { item: group.id });
    const lineage = indexOf(manifest).ancestry.get(elision.timeline) ?? [];
    const member = lineage.find((id) => group?.members.includes(id));
    const holder = member === undefined ? undefined : findTimeline(manifest, member);
    const [gap] = exposure === undefined ? [] : gapsOf(exposure, address);
    const also = (gap?.members ?? [])
      .filter((each) => each.timeline !== elision.timeline)
      .flatMap((each) => {
        const on = findTimeline(manifest, each.timeline);
        if (on === undefined) return [];
        const stretch =
          each.start === null || each.end === null ? "—" : stretchText(each.start, each.end, on);
        return [{ timeline: nameOf(on), stretch }];
      });
    if (exposure === undefined || gap === undefined || holder === undefined) {
      return { gap: null, also };
    }
    return {
      gap: { gap, L: lengthOf(exposure), lambda: extentOf(holder, manifest) },
      also,
    };
  }
  const of = rootOf(block, [subject], drawing);
  const exposure = of === null ? undefined : exposureOf(drawing, of.key);
  const [gap] = exposure === undefined ? [] : gapsOf(exposure, address);
  if (of === null || exposure === undefined || gap === undefined) return { gap: null, also: null };
  return {
    gap: { gap, L: lengthOf(exposure), lambda: extentOf(of.root, manifest) },
    also: null,
  };
}

/**
 * The form of the one selected elision: a stored one (`{block, id: E}`),
 * read from the manifest and from the gap the drawing draws of it; a
 * default one (`{block, id: T, part: [elision]}`), read-only, from the first
 * of its gaps in the card the root block reads; `null` for any other
 * selection or a default elision the card does not draw.
 */
export function elisionFormOf(
  block: Block,
  subjects: readonly Subject[],
  drawing: Drawing,
): ElisionForm | null {
  const [subject, ...others] = subjects;
  if (subject === undefined || others.length > 0 || subject.block !== block.id) return null;
  const { resolved, address } = subject;
  const { manifest } = block;
  if (resolved.kind === "elision") {
    const { elision } = resolved;
    const timeline = resolved.at.timeline;
    const [start, end] = storedStretch(elision, timeline);
    const { gap, also } = storedGap(block, subject, elision, drawing);
    return {
      block,
      address,
      manifest,
      title: `Elision on "${nameOf(timeline)}"`,
      timeline,
      unit: prettyUnit(timeline.unit),
      stored: elision,
      start: fieldText(start, timeline),
      end: fieldText(end, timeline),
      form: formOfWidth(elision.width),
      widths: widthTexts(elision.width, gap, timeline),
      display: elision.display,
      also,
      gap,
    };
  }
  if (
    resolved.kind !== "part" ||
    resolved.word !== "elision" ||
    resolved.owner.kind !== "timeline"
  ) {
    return null;
  }
  const of = rootOf(block, subjects, drawing);
  const exposure = of === null ? undefined : exposureOf(drawing, of.key);
  // A gap or seam the arrangement cuts has a default elision's address, but no form: it is read-only.
  const [gap] =
    exposure === undefined
      ? []
      : gapsOf(exposure, { id: resolved.owner.at.timeline.id, part: ["elision"] }).filter(
          (each) => each.origin === "default",
        );
  const timeline = resolved.owner.at.timeline;
  if (of === null || exposure === undefined || gap === undefined) return null;
  const shown = { gap, L: lengthOf(exposure), lambda: extentOf(of.root, manifest) };
  return {
    block,
    address,
    manifest,
    title: `Elision on "${nameOf(timeline)}"`,
    timeline,
    unit: prettyUnit(timeline.unit),
    stored: null,
    start: fieldText(gap.start, timeline),
    end: fieldText(gap.end, timeline),
    form: gap.drawn === 32 ? "standard" : "canvas",
    widths: widthTexts(undefined, shown, timeline),
    display: exposure.display,
    also: null,
    gap: shown,
  };
}

/** The `set` of `values` on the selected stored elision. */
function setOf(form: ElisionForm, values: { readonly [property: string]: unknown }): SetCommand {
  return { type: "set", changes: [{ target: form.address, values }] };
}

/** The command `text` typed into `field` gives (one `set`); `null` where it changes nothing. */
export function fieldCommand(form: ElisionForm, field: ElisionField, text: string): ElisionEdit {
  const path = [addressKey(form.address), field];
  const trimmed = text.trim();
  if (form.stored === null) return { ok: true, value: null };
  if (field === "start" || field === "end") {
    if (trimmed === form[field]) return { ok: true, value: null };
    const value = typedValue(trimmed, form.timeline);
    if (typeof value === "string") return refused(InspectorCode.invalidValue, value, path);
    return { ok: true, value: setOf(form, { [field]: value }) };
  }
  if (form.form === field && trimmed === form.widths[field]) return { ok: true, value: null };
  if (field === "span") {
    const value = typedValue(trimmed, form.timeline);
    if (typeof value === "string") return refused(InspectorCode.invalidValue, value, path);
    return { ok: true, value: setOf(form, { width: { span: value } }) };
  }
  if (!DECIMAL.test(trimmed)) {
    return refused(InspectorCode.invalidValue, `${trimmed} is not a number`, path);
  }
  return { ok: true, value: setOf(form, { width: { [field]: Number(trimmed) } }) };
}

/**
 * The command choosing the width form `next`, converted from the gap as
 * drawn (layout's `widthAs`) so that it does not jump: Standard leaves
 * `width` out. `null` for the form stored; refused where the gap is not
 * drawn and the form needs its width.
 */
export function formCommand(form: ElisionForm, next: WidthForm): ElisionEdit {
  if (next === form.form || form.stored === null) return { ok: true, value: null };
  if (next === "standard") return { ok: true, value: setOf(form, { width: null }) };
  const path = [addressKey(form.address), next];
  const width = form.gap === null ? undefined : storedWidth(next, form.gap, form.timeline);
  if (width === undefined || width === null) {
    return refused(
      InspectorCode.invalidValue,
      "the elision is not drawn here, so its width cannot be converted: type a value",
      path,
    );
  }
  return { ok: true, value: setOf(form, { width }) };
}

/** The command showing or hiding one word of the stored elision's `display`. */
export function elisionDisplayCommand(form: ElisionForm, word: ElisionWord): SetCommand | null {
  if (form.stored === null) return null;
  return setOf(form, { display: toggledDisplay(ELISION_DISPLAY, form.display, word) });
}

/** The command deleting the selected stored elision; `null` for a default one. */
export function deleteCommand(form: ElisionForm): RemoveCommand | null {
  return form.stored === null ? null : { type: "remove", targets: [form.address] };
}
