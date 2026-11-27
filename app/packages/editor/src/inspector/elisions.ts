/**
 * The Elisions tab (TimeToShare's drawing specification,
 * sections 2.4 and 8.9): the block of the root `R` under which the whole
 * selection lies, where `R`'s drawing carries elisions (an ancestor card of
 * `R`, or `R`'s card as an ungrouped root, a placed virtual timeline's card
 * included, the virtual timeline its own root, section 8.10); the block of
 * the group `G` whose
 * frame the selection lies in, or whose editor is open; and the form of one
 * selected elision. A root's mode, the one control of its cards, and its
 * settings are one rule on its card address; whether a frame draws its
 * group's elisions one rule on its address; what they resolve to, the
 * proportion, the depths and every gap are read from the exposure the
 * drawing gives of each card and frame (`Drawing.elisions`), never from a
 * drawing tried with a command applied, and no rule stated reads as the
 * cascade's initial value. Every action is one command, so one journal
 * entry. A selected stored elision is edited by its start, its end and what
 * it shows; its gap's width is set on the canvas, by its handles. A root
 * drawn once behind a row of groups side by side (section 8.8, Drawn
 * once) is read through the one ancestor card the drawing
 * records for it, whose `ancestor.groups` lists every group it lies behind.
 * That card reads no elision property but `elision-display`, so it offers
 * no mode: the gaps the arrangement cuts between two of its groups are
 * listed read-only, never edited (a seam leaves out nothing and is no gap,
 * so none is listed), and every stored card elision of the root is listed
 * as kept and not drawn while the row is side by side.
 * The tab shows each of the three as a block of its kind (a timeline's, a
 * group's, an elision's), collapsed to one line that says its essentials
 * (`blocksOf`), open without a click where it holds the selected elision,
 * and kept open once an action has been taken in it.
 */

import type { Subject } from "@timetoalign/tilie-arranger";
import {
  axisValueAt,
  cardAxisAt,
  defaultsRemoval,
  defaultsStored,
  exposureAt,
  piecesOf,
  stretchText,
  typedValue,
} from "@timetoalign/tilie-arranger";
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
  View,
} from "@timetoalign/tilie-core";
import {
  addressKey,
  canonicalText,
  copyValue,
  displayOrder,
  elisionsUnder,
  FlowMapError,
  findTimeline,
  groupElisions,
  groupsHolding,
  idAddress,
  inBlock,
  indexOf,
  prettyUnit,
  resolveFlowMap,
  sameAddress,
  samePlaceKey,
} from "@timetoalign/tilie-core";
import {
  anchorsOf,
  memberDrawings,
  reachOf,
  virtualDrawing,
} from "@timetoalign/tilie-core/drawing";
import type { CoordinateValue, Real } from "@timetoalign/tilie-core/numbers";
import {
  axisCoordinate,
  exactCoordinate,
  Rational,
  realOf,
  toFloat,
  toRational,
} from "@timetoalign/tilie-core/numbers";
import type { Drawing, DrawnBox, ElisionExposure, ExposedGap } from "@timetoalign/tilie-layout";
import type { Declaration, Selector } from "@timetoalign/timetoshare";
import { ELISION_DISPLAY } from "@timetoalign/timetoshare";
import type { Result } from "./problems.ts";
import { InspectorCode, refused } from "./problems.ts";
import { toggledDisplay } from "./stamps/commands.ts";

// --- Words ----------------------------------------------------------------------------------------

/** Which elisions a root's cards draw (drawing.md section 8.9, Modes), `auto` read as what it resolves to. */
export type RootMode = "full" | "proportional" | "custom";

/**
 * What a root's block reads its card to draw: a mode, or `once` for a root
 * drawn once behind a row of groups side by side, whose card reads no mode
 * (drawing.md section 8.8, Drawn once).
 */
export type RootDrawn = RootMode | "once";

/** The label of each mode, and of a card drawn once, as a block's summary names them. */
export const MODE_WORDS: { readonly [mode in RootDrawn]: string } = {
  full: "Full",
  proportional: "Proportional",
  custom: "Custom",
  once: "Drawn once",
};

/** The line a root's block shows for a card drawn once behind a row, in place of the modes. */
export const ONCE_LINE =
  "Drawn once behind the row: its elisions are not drawn while the bundle is arranged side by side.";

/** What a timeline's block summarises where its ancestor cards are hidden. */
export const HIDDEN_WORD = "Hidden";

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

/** The hint of a default elision's form. */
export const DEFAULT_HINT = "Choose Custom to edit";

/** The note of a stored card elision of a root drawn once behind a row, which its card does not draw (section 8.8). */
export const NOT_DRAWN_ARRANGED = "not drawn while arranged side by side";

/**
 * The note of a group elision the frame does not draw although it draws its
 * group's elisions: its timeline's line not drawn there, its gap hidden, or
 * the frame switched to a FlowMap (sections 8.9 and 8.10).
 */
export const NOT_DRAWN_FRAME = "not drawn in this frame";

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
  /** Why the card or frame does not draw it (`NOT_DRAWN_ARRANGED`, `NOT_DRAWN_FRAME`); `null` where it is drawn. */
  readonly note: string | null;
  /** Its `[×]`: one `remove`. */
  readonly remove: RemoveCommand;
}

/**
 * A gap a root drawn once behind a row cuts between two groups hanging on it
 * (section 8.8, Drawn once): read-only, no card elision.
 */
export interface ArrangedGap {
  /** The two groups' IDs, joined: the pair is one per root. */
  readonly key: string;
  /** `between "G1" and "G2"`, the groups by name, else by ID, left to right. */
  readonly between: string;
  /** Its elided stretch, `start–end` with the unit. */
  readonly stretch: string;
}

/** One depth of the root's Rows: the timelines at that depth, and whether it is chosen. */
export interface DepthRow {
  readonly depth: number;
  /** The names of the timelines at that depth, joined. */
  readonly names: string;
  readonly chosen: boolean;
}

/** A checkbox: whether it is ticked, and the one command its click sends. */
export interface Toggle {
  readonly checked: boolean;
  readonly command: StyleCommand;
}

/** The root's block, `Parent timeline "R"` or `Elisions of "R"`. */
export interface RootElisions {
  readonly block: string;
  readonly root: string;
  readonly title: string;
  /** The address of the root's rule, which the drafts of its Proportion belong to. */
  readonly address: Address;
  readonly manifest: Manifest;
  /**
   * The mode its cards draw by, `once` for a card drawn once behind a row; `null` where its
   * ancestor cards are hidden, which read none.
   */
  readonly mode: RootDrawn | null;
  /** Whether its ancestor cards are drawn (their `display`); `null` for an ungrouped card. */
  readonly shown: Toggle | null;
  /** Full, Proportional, Custom for an ancestor card; Full and Custom for an ungrouped root; none while hidden or drawn once. */
  readonly options: readonly ModeOption<RootMode>[];
  /** The gaps between the groups of a row it is drawn behind once, left to right; none elsewhere. */
  readonly arranged: readonly ArrangedGap[];
  /** What Proportional shows; `null` in any other mode. */
  readonly proportional: {
    /** Whether `elision-proportion` is `auto`. */
    readonly automatic: boolean;
    /** The proportion its default elisions take, as the field shows it: at most six decimals. */
    readonly proportion: string;
    /** That proportion exactly as the drawing takes it, which unticking Automatic states. */
    readonly value: number;
    readonly depthsAutomatic: boolean;
    /** Deepest first, as the rows lie in the card. */
    readonly depths: readonly DepthRow[];
    readonly display: readonly ElisionWord[];
  } | null;
  /**
   * What Custom shows, the stored card elisions the card draws; for a card
   * drawn once behind a row, every stored card elision of the root, each
   * kept and not drawn (`note`); `null` in any other mode.
   */
  readonly custom: {
    readonly rows: readonly ElisionRow[];
    /** One `add` of an elision at the middle of the subject's timeline; `null` where none fits. */
    readonly add: AddCommand | null;
    /** One `remove` of every card elision of `R`; `null` without one. */
    readonly removeAll: Command | null;
  } | null;
}

/** The group's block, `Elisions in group "G"`. */
export interface GroupElisions {
  readonly block: string;
  readonly group: string;
  readonly title: string;
  /** Whether the frame draws its group's elisions (its `elision-mode` resolves to `custom`). */
  readonly drawn: Toggle;
  /** "0 elisions", "1 elision", "2 elisions". */
  readonly count: string;
  /** Every stored elision of the group, drawn or not, one the frame does not draw with its note. */
  readonly rows: readonly ElisionRow[];
  readonly add: AddCommand | null;
  readonly removeAll: RemoveCommand | null;
}

/** The fields of a selected elision the form types into. */
export type ElisionField = "start" | "end";

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
  readonly display: readonly ElisionWord[];
  /** Across a frame, the other timelines it elides; `null` for a card elision. */
  readonly also: readonly AlsoElided[] | null;
}

/** What a typed field or a chosen form gives: the command, `null` where it changes nothing, or a refusal. */
export type ElisionEdit = Result<Command | null>;

// --- Reading the exposure -----------------------------------------------------------------------

/**
 * The gaps of the elision at `address` that `drawing` draws in the
 * container `exposure` records, from the left: the arranger's pieces of it
 * held by that container.
 */
function gapsIn(
  drawing: Drawing,
  exposure: ElisionExposure,
  address: ElementAddress,
): ExposedGap[] {
  return piecesOf(drawing, address)
    .filter((piece) => samePlaceKey(piece.exposure.key, exposure.key))
    .map((piece) => piece.gap);
}

// --- Values ---------------------------------------------------------------------------------------

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

/** A value of the axis of `timeline` as an exact coordinate value; `undefined` where it does not fit. */
function valueAt(value: Real, timeline: TimelineManifest): CoordinateValue | undefined {
  return exactCoordinate(value, timeline.unit, timeline.number_type)?.value;
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

/**
 * The timeline `resolved` names or lies on, a part through its owner, a
 * virtual timeline's card or band through the virtual timeline; `null` for
 * anything else.
 */
function timelineOf(resolved: ResolvedAddress): string | null {
  switch (resolved.kind) {
    case "timeline":
    case "card":
    case "elision":
      return resolved.at.timeline.id;
    case "virtual_timeline":
    case "virtual_card":
    case "virtual_band":
      return resolved.virtual.id;
    case "part":
      return timelineOf(resolved.owner);
    default:
      return null;
  }
}

/**
 * The timeline `id` names in `manifest`, a virtual timeline read as the
 * timeline its axis is (core's `virtualDrawing`, drawing.md section 8.10: a
 * root holding nothing, its played axis); `undefined` for an ID naming
 * neither.
 */
function timelineIn(manifest: Manifest, id: string): TimelineManifest | undefined {
  return findTimeline(manifest, id) ?? virtualDrawing(manifest, id)?.timeline;
}

/**
 * The groups of `manifest` holding the timeline or virtual timeline `id`
 * (core's `groupsHolding` over the manifest's index, in which a group
 * naming a virtual timeline holds it as any member).
 */
function holdingOf(manifest: Manifest, id: string): Manifest["groups"] {
  return groupsHolding(manifest, id, indexOf(manifest).ancestry);
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
  /**
   * The card's place key: `{item: G, member: R}` for an ancestor card, `{item: R}` for an
   * ungrouped card or a placed virtual card.
   */
  readonly key: PlaceKey;
  /**
   * The stretch of `R`'s axis its anchor covers: the member the ancestor card
   * is aligned to, from its start to its end; for a card drawn once behind a
   * row, the ancestor card behind the row's first group (section 8.8), that
   * group's anchor, where an elision added is drawn once the row is no longer
   * side by side; `null` for an ungrouped card.
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
 * can carry elisions (it has an ancestor card, or it is an ungrouped root,
 * or a virtual timeline no group holds, whose placed card draws its
 * elisions as an ungrouped root's card does, section 8.10); the card read
 * is the one behind the group the selection concerns, else the first; else
 * `null`.
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
  const root = timelineIn(manifest, id);
  if (root === undefined) return null;
  const only = concerns.length === 1 ? (concerns[0]?.timeline ?? null) : null;
  const drawings = memberDrawings(manifest);
  const cards = drawings.ancestorCards.filter((card) => card.root.timeline.id === id);
  const card =
    cards.find((each) => concerns.some(({ groups }) => groups.includes(each.group.id))) ?? cards[0];
  if (card !== undefined) {
    const drawn = drawnCardOf(drawing, id, card.group.id);
    const groups = drawn?.ancestor?.groups ?? [card.group.id];
    const key = drawn?.key ?? { item: card.group.id, member: id };
    const behind = cards.find((other) => other.group.id === key.item) ?? card;
    let from = Rational.of(0n);
    for (const { timeline, offset } of behind.member.ancestors) {
      from = toRational(realOf(axisCoordinate(offset, timeline))).add(from);
    }
    const to = toRational(extentOf(behind.member.timeline, manifest)).add(from);
    return { root, ancestor: true, key, protected: { from, to }, groups, subject: only };
  }
  const placeable =
    virtualDrawing(manifest, id) !== undefined && holdingOf(manifest, id).length === 0;
  if (placeable || drawings.ungrouped.some((drawn) => drawn.timeline.id === id)) {
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
    const timeline = stored && timelineIn(block.manifest, stored.timeline);
    if (stored === undefined || timeline === undefined) return [];
    return [
      {
        address,
        name: stored.name ?? "—",
        timeline: nameOf(timeline),
        stretch: pieces.map((gap) => stretchText(timeline, gap.start, gap.end)).join(", "),
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
    const timeline = timelineIn(block.manifest, elision.timeline);
    if (timeline === undefined) return [];
    const address = inBlock(block.id, idAddress(elision.id));
    const [start, end] = storedStretch(elision, timeline);
    return [
      {
        address,
        name: elision.name ?? "—",
        timeline: nameOf(timeline),
        stretch: stretchText(timeline, start, end),
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

/** The mode a root's exposure shows, `once` for a card drawn once; `null` where its card is not drawn. */
function rootModeOf(exposure: ElisionExposure | undefined, ancestor: boolean): RootDrawn | null {
  if (exposure === undefined) return null;
  if (!ancestor && exposure.drawn === "proportional") return "custom";
  return exposure.drawn;
}

/** The declarations of the rules of `graphical`, a named style read through its name. */
function declarationsOf(graphical: Manifest["graphical"] | View["graphical"] | undefined) {
  return (graphical?.rules ?? []).map((rule) => ({
    select: rule.select,
    set: typeof rule.set === "string" ? (graphical?.styles?.[rule.set] ?? {}) : rule.set,
  }));
}

/**
 * The `set` giving the rule of `select` the mode `custom`, the initial value
 * (drawing.md section 2.5): removing the rule's own `elision-mode` where it
 * states one and no other rule of the workspace or the manifest states any,
 * so that nothing but the initial value is left; else stating `custom`.
 */
function customSet(view: View, manifest: Manifest, select: Selector): StyleCommand["set"] {
  const key = canonicalText(select);
  const own = ownDeclaration(manifest, select)["elision-mode"] !== undefined;
  const states = (rule: { readonly set: Declaration }) => rule.set["elision-mode"] !== undefined;
  const others =
    declarationsOf(view.graphical).some(states) ||
    declarationsOf(manifest.graphical).some(
      (rule) => states(rule) && canonicalText(rule.select) !== key,
    );
  return own && !others ? { "elision-mode": null } : { "elision-mode": "custom" };
}

/**
 * The options of a root's mode (drawing.md section 8.9, Modes; one switch,
 * one entry): Full and Proportional state their mode; Custom gives the rule
 * the mode `custom` (`customSet`), first storing the elisions the card
 * derives where it draws Proportional (an `auto` the stored ones then turn
 * to `custom`), so that Custom starts from what was shown.
 */
function rootOptions(
  view: View,
  block: Block,
  drawing: Drawing,
  of: RootOf,
  mode: RootDrawn | null,
  exposure: ElisionExposure | undefined,
): ModeOption<RootMode>[] {
  if (mode === null || mode === "once") return [];
  const root = of.root.id;
  const select = rootSelector(root);
  const style = (set: StyleCommand["set"]) => styleCommand(block.id, select, set);
  const holding = holdingOf(block.manifest, root);
  const option = (
    target: RootMode,
    commands: readonly Command[],
    reason: string | null = null,
  ) => ({
    mode: target,
    commands: target === mode || reason !== null ? [] : commands,
    reason,
  });
  const persisted =
    mode === "proportional" && exposure !== undefined
      ? defaultsStored(view, block.id, drawing, of.key)
      : null;
  const defaults = persisted === null || "refused" in persisted ? null : persisted;
  const toCustom = style(customSet(view, block.manifest, select));
  const custom: Command[] =
    defaults === null ? [toCustom] : [defaults, ...(exposure?.mode === "auto" ? [] : [toCustom])];
  const [group] = holding;
  const customOption = option(
    "custom",
    custom,
    group === undefined ? null : `its elisions belong to group "${group.name ?? group.id}"`,
  );
  const full = option("full", [style({ "elision-mode": "full" })]);
  if (!of.ancestor) return [full, customOption];
  return [full, option("proportional", [style({ "elision-mode": "proportional" })]), customOption];
}

/**
 * Whether a root's ancestor cards are drawn, and the command of its
 * checkbox: hiding them states `display: none` on the root's rule, showing
 * them removes it.
 */
function shownToggle(block: Block, root: string, shown: boolean): Toggle {
  return {
    checked: shown,
    command: styleCommand(block.id, rootSelector(root), { display: shown ? "none" : null }),
  };
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
 * The stretches of `[from, to]` outside every stretch of `cuts`, from the
 * left, each with a length.
 */
function outsideOf(
  from: Rational,
  to: Rational,
  cuts: readonly (readonly [Rational, Rational])[],
): [Rational, Rational][] {
  const sorted = [...cuts].sort(([left], [right]) => left.compare(right));
  const left: [Rational, Rational][] = [];
  let at = from;
  for (const [a, b] of sorted) {
    if (a.compare(at) > 0) left.push([at, a.compare(to) < 0 ? a : to]);
    if (b.compare(at) > 0) at = b;
  }
  if (at.compare(to) < 0) left.push([at, to]);
  return left.filter(([a, b]) => a.compare(b) < 0);
}

/**
 * The run gaps of a placed virtual card (drawing.md section 8.10, Runs) on
 * its virtual timeline's axis: for every run of its FlowMap of two or more
 * entries, the stretch from its first entry's end to its last one's, where
 * the card draws it once (its axis draws no position inside it); none for
 * any other card or a virtual timeline whose map is no FlowMap.
 */
function runGapsOf(
  manifest: Manifest,
  drawing: Drawing,
  of: RootOf,
): (readonly [Rational, Rational])[] {
  const virtual = (manifest.virtual_timelines ?? []).find((item) => item.id === of.root.id);
  const axis = cardAxisAt(manifest, drawing, of.key);
  if (virtual === undefined || axis === null || of.ancestor) return [];
  let resolved: ReturnType<typeof resolveFlowMap>;
  try {
    resolved = resolveFlowMap(manifest, virtual.map);
  } catch (error) {
    if (error instanceof FlowMapError) return [];
    throw error;
  }
  return resolved.runs.flatMap(({ chunk, count }) => {
    const last = resolved.chunks[chunk.index + count - 1];
    if (count < 2 || last === undefined) return [];
    const a = toRational(realOf(chunk.played.end));
    const b = toRational(realOf(last.played.end));
    const middle = a.add(b).divide(Rational.of(2n));
    return axis.abscissaOf(of.root.id, middle) === null ? [[a, b] as const] : [];
  });
}

/**
 * The `add` of an elision on the subject's timeline `T` (or `R`) at the
 * middle third of the longest stretch of it the card draws: outside the
 * protected span and, on a placed virtual card, outside its run gaps, so
 * that the new elision is drawn where it lies; with the standard gap;
 * `null` where none fits.
 */
function addOnRoot(block: Block, of: RootOf, drawing: Drawing): AddCommand | null {
  const { manifest } = block;
  const lineage = of.subject === null ? undefined : indexOf(manifest).ancestry.get(of.subject);
  const inCard =
    of.subject !== null &&
    lineage?.[0] === of.root.id &&
    holdingOf(manifest, of.subject).length === 0;
  const timeline = (inCard && timelineIn(manifest, of.subject ?? "")) || of.root;
  const offset = offsetOnRoot(manifest, timeline.id);
  const from = offset;
  const to = offset.add(toRational(extentOf(timeline, manifest)));
  const cuts: (readonly [Rational, Rational])[] = runGapsOf(manifest, drawing, of);
  if (of.protected !== null) {
    cuts.push([toRational(of.protected.from), toRational(of.protected.to)]);
  }
  const longest = outsideOf(from, to, cuts).reduce<[Rational, Rational] | null>(
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
 * The gaps the arrangement cuts in a root's card drawn once behind a row
 * (exposure origin `arrangement`; a seam is none), left to right, each named
 * by the two groups whose anchors' stretches it separates on the root's
 * axis: the group whose anchor ends last at or before the gap's start, and
 * the one whose anchor starts first at or after its end, among the groups
 * the card lies behind. Pairing by stretch, never by position in the list,
 * keeps a gap with its groups where touching anchors (a seam) come before it.
 */
function arrangedGaps(
  manifest: Manifest,
  of: RootOf,
  exposure: ElisionExposure | undefined,
): ArrangedGap[] {
  const gaps = exposure?.gaps.filter((gap) => gap.origin === "arrangement") ?? [];
  if (gaps.length === 0) return [];
  const anchors = anchorsOf(manifest)
    .filter((anchor) => anchor.root === of.root.id && of.groups.includes(anchor.group))
    .map((anchor) => ({
      group: anchor.group,
      start: toRational(anchor.start),
      end: toRational(anchor.end),
    }));
  return gaps.flatMap((gap) => {
    const start = toRational(gap.start);
    const end = toRational(gap.end);
    let left: (typeof anchors)[number] | undefined;
    let right: (typeof anchors)[number] | undefined;
    for (const anchor of anchors) {
      if (
        anchor.end.compare(start) <= 0 &&
        (left === undefined || anchor.end.compare(left.end) > 0)
      ) {
        left = anchor;
      }
      if (
        anchor.start.compare(end) >= 0 &&
        (right === undefined || anchor.start.compare(right.start) < 0)
      ) {
        right = anchor;
      }
    }
    if (left === undefined || right === undefined) return [];
    return [
      {
        key: JSON.stringify([left.group, right.group]),
        between: `between "${groupName(manifest, left.group)}" and "${groupName(manifest, right.group)}"`,
        stretch: stretchText(of.root, gap.start, gap.end),
      },
    ];
  });
}

/**
 * The root's block of the inspected subjects, all in `block` and drawn as
 * `drawing`: offered where every subject is a timeline, a card, a part of
 * either or an elision, all under one root `R` that has an ancestor card or
 * is an ungrouped root, or is a virtual timeline whose card the block
 * places; `null` otherwise.
 */
export function rootElisionsOf(
  view: View,
  block: Block,
  subjects: readonly Subject[],
  drawing: Drawing,
): RootElisions | null {
  const of = rootOf(block, subjects, drawing);
  if (of === null) return null;
  const exposure = exposureAt(drawing, of.key);
  if (exposure === undefined && !of.ancestor) return null;
  const root = of.root.id;
  const { manifest } = block;
  const mode = rootModeOf(exposure, of.ancestor);
  const shown = of.ancestor ? shownToggle(block, root, exposure !== undefined) : null;
  const own = ownDeclaration(manifest, rootSelector(root));
  const depthsStated = own["elision-depths"];
  const proportional =
    mode === "proportional" && exposure !== undefined
      ? {
          automatic: exposure.automatic,
          proportion: proportionText(exposure.proportion ?? 1),
          value: exposure.proportion ?? 1,
          depthsAutomatic: depthsStated === undefined || depthsStated === "auto",
          depths: depthRows(manifest, exposure.chain, exposure.depths),
          display: exposure.display,
        }
      : null;
  const rows =
    exposure === undefined
      ? null
      : mode === "custom"
        ? exposedRows(
            block,
            exposure.gaps.filter((gap) => gap.origin === "stored"),
          )
        : mode === "once"
          ? storedRows(block, elisionsUnder(manifest, root), NOT_DRAWN_ARRANGED)
          : null;
  const custom =
    rows === null
      ? null
      : {
          rows,
          add: addOnRoot(block, of, drawing),
          removeAll: defaultsRemoval(view, block.id, root),
        };
  const name = nameOf(of.root);
  return {
    block: block.id,
    root,
    title: of.ancestor ? `Parent timeline "${name}"` : `Elisions of "${name}"`,
    address: inBlock(block.id, { id: root, part: ["card"] }),
    manifest,
    mode,
    shown,
    options: rootOptions(view, block, drawing, of, mode, exposure),
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
 * to its initial `auto`; unticked, the proportion the drawing takes stated
 * exactly (never the field's rounded text), so no derived gap moves.
 */
export function proportionAutomaticCommand(section: RootElisions): StyleCommand | null {
  const shown = section.proportional;
  if (shown === null) return null;
  return rootStyle(section, {
    "elision-proportion": shown.automatic ? shown.value : null,
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
  const holding = holdingOf(manifest, timeline).map((group) => group.id);
  const framed = box === null || box.ancestor !== undefined ? [] : groupsBehind(box);
  const held = holding.find((id) => framed.includes(id));
  if (held !== undefined) return held;
  return holding[0] ?? null;
}

/**
 * The member `T` an Add of the group's block lies on: the
 * subject's timeline where it lies in `G`, else the member whose card holds
 * the selection, else `G`'s first member in display order.
 */
function addOnGroup(block: Block, group: string, subjects: readonly Subject[]): AddCommand | null {
  const { manifest } = block;
  const [subject, ...others] = subjects;
  let id: string | undefined;
  if (subject !== undefined && others.length === 0) {
    const timeline = timelineOf(subject.resolved);
    if (timeline !== null && holdingOf(manifest, timeline).some((each) => each.id === group)) {
      id = timeline;
    } else if (subject.box?.key?.member !== undefined && subject.box.ancestor === undefined) {
      id = subject.box.key.member;
    }
  }
  id ??= displayOrder(manifest, group)[0];
  const timeline = id === undefined ? undefined : timelineIn(manifest, id);
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
  view: View,
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
  const exposure = exposureAt(drawing, { item: group });
  const found = manifest.groups.find((each) => each.id === group);
  if (exposure === undefined || found === undefined) return null;
  const drawn = exposure.drawn === "custom";
  const drawnIds = new Set(
    exposure.gaps.filter((gap) => gap.origin === "stored").map((gap) => gap.address.id),
  );
  const select = frameSelector(group);
  const elisions = groupElisions(manifest, group);
  return {
    block: block.id,
    group,
    title: `Elisions in group "${found.name ?? found.id}"`,
    drawn: {
      checked: drawn,
      command: styleCommand(
        block.id,
        select,
        drawn ? { "elision-mode": "full" } : customSet(view, manifest, select),
      ),
    },
    count: counted(elisions.length),
    rows: elisions.flatMap((elision) =>
      storedRows(block, [elision], drawn && !drawnIds.has(elision.id) ? NOT_DRAWN_FRAME : null),
    ),
    add: addOnGroup(block, group, subjects),
    removeAll: removalOf(block.id, elisions),
  };
}

// --- A selected elision ---------------------------------------------------------------------------

/**
 * The other timelines a stored group elision `elision` elides, as the frame
 * its subject's box lies in draws it (else the first group its timeline lies
 * in): each with its elided coordinates (layout's `members`); `null` for a
 * card elision.
 */
function alsoElided(
  block: Block,
  subject: Subject,
  elision: Elision,
  drawing: Drawing,
): AlsoElided[] | null {
  const { manifest } = block;
  const holding = holdingOf(manifest, elision.timeline);
  if (holding.length === 0) return null;
  const framed = groupsBehind(subject.box);
  const group = holding.find((each) => framed.includes(each.id)) ?? holding[0];
  const exposure = group === undefined ? undefined : exposureAt(drawing, { item: group.id });
  const [gap] = exposure === undefined ? [] : gapsIn(drawing, exposure, idAddress(elision.id));
  return (gap?.members ?? [])
    .filter((each) => each.timeline !== elision.timeline)
    .flatMap((each) => {
      const on = timelineIn(manifest, each.timeline);
      if (on === undefined) return [];
      const stretch =
        each.start === null || each.end === null ? "—" : stretchText(on, each.start, each.end);
      return [{ timeline: nameOf(on), stretch }];
    });
}

/**
 * The form of the one selected elision: a stored one (`{block, id: E}`),
 * read from the manifest, what it also elides from the gap the drawing
 * draws of it; a default one (`{block, id: T, part: [elision]}`),
 * read-only, from the first of its gaps in the card the root block reads;
 * `null` for any other selection or a default elision the card does not
 * draw.
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
      display: elision.display,
      also: alsoElided(block, subject, elision, drawing),
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
  const exposure = of === null ? undefined : exposureAt(drawing, of.key);
  // A gap the arrangement cuts has a default elision's address, but no form: it is read-only.
  const [gap] =
    exposure === undefined
      ? []
      : gapsIn(drawing, exposure, { id: resolved.owner.at.timeline.id, part: ["elision"] }).filter(
          (each) => each.origin === "default",
        );
  const timeline = resolved.owner.at.timeline;
  if (exposure === undefined || gap === undefined) return null;
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
    display: exposure.display,
    also: null,
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
  if (form.stored === null || trimmed === form[field]) return { ok: true, value: null };
  const value = typedValue(trimmed, form.timeline);
  if (typeof value === "string") return refused(InspectorCode.invalidValue, value, path);
  return { ok: true, value: setOf(form, { [field]: value }) };
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

// --- The tab's blocks -----------------------------------------------------------------------------

/** What a block of the Elisions tab configures: a timeline (the root's block), a group, one elision. */
export type BlockKind = "timeline" | "group" | "elision";

/** The kind word heading each block, which tells a timeline's block from a group's. */
export const KIND_WORDS: { readonly [kind in BlockKind]: string } = {
  timeline: "Timeline",
  group: "Group",
  elision: "Elision",
};

/** What the Elisions tab says with nothing to show. */
export const ELISIONS_HINT = "Select one timeline, card or group frame to edit its elisions.";

/** One block as its collapsed line shows it, and the open state it reads. */
export interface ElisionBlock {
  readonly kind: BlockKind;
  readonly title: string;
  /** The essentials after the title: the mode and the number of elisions, or the stretch. */
  readonly summary: string;
  /** The key its open state is kept under: its own, or its own with the selected elision it holds. */
  readonly key: string;
  /**
   * The key an action taken in it opens, so that it stays open once the
   * selection leaves it: its own, which a timeline's or a group's
   * disclosure button writes too, so that a close holds there as well; the
   * form's, that of the block holding its elision, since the form goes with
   * the selection.
   */
  readonly keeps: string;
  /** Whether it is open before any click: only where it holds the selected elision. */
  readonly opened: boolean;
}

/** The three blocks of the tab, each `null` where its part is. */
export interface ElisionBlocks {
  readonly root: ElisionBlock | null;
  readonly group: ElisionBlock | null;
  readonly form: ElisionBlock | null;
}

/**
 * The key of the block of `address`: `address`'s key while it holds no
 * selected elision, else the pair of that key and the selected elision's,
 * so that the state chosen for a block holding one selection is not the
 * state of the block holding nothing or another.
 */
function blockKey(address: Address, held: Address | null): string {
  return held === null
    ? addressKey(address)
    : JSON.stringify([addressKey(address), addressKey(held)]);
}

/** A stretch with its unit, as a form's From and To show it. */
const stretchOf = (form: ElisionForm): string =>
  `${form.start}–${form.end}${form.unit === "" ? "" : ` ${form.unit}`}`;

/**
 * The blocks of `root`, `group` and `form` as the tab shows them. The
 * selected elision of `form` is held by the group's block where the group
 * lists it, else by the root's (a card elision of the root, or a default
 * one); the block holding it and the form's own block are open without a
 * click, every other block is collapsed. An action taken in a block opens
 * it under its own key (`keeps`), so that it stays open once the selection
 * leaves it.
 */
export function blocksOf(
  root: RootElisions | null,
  group: GroupElisions | null,
  form: ElisionForm | null,
): ElisionBlocks {
  const selected = form?.address ?? null;
  const inGroup =
    selected !== null && (group?.rows.some((row) => sameAddress(row.address, selected)) ?? false);
  const inRoot = selected !== null && !inGroup && root !== null;
  const custom = root?.custom ?? null;
  const rootCount = custom === null ? "" : `, ${counted(custom.rows.length)}`;
  const rootOwn = root === null ? "" : addressKey(root.address);
  const frame = group === null ? null : inBlock(group.block, idAddress(group.group));
  const groupOwn = frame === null ? "" : addressKey(frame);
  return {
    root:
      root === null
        ? null
        : {
            kind: "timeline",
            title: root.title,
            summary: root.mode === null ? HIDDEN_WORD : `${MODE_WORDS[root.mode]}${rootCount}`,
            key: blockKey(root.address, inRoot ? selected : null),
            keeps: rootOwn,
            opened: inRoot,
          },
    group:
      group === null || frame === null
        ? null
        : {
            kind: "group",
            title: group.title,
            summary: `${group.drawn.checked ? MODE_WORDS.custom : MODE_WORDS.full}, ${group.count}`,
            key: blockKey(frame, inGroup ? selected : null),
            keeps: groupOwn,
            opened: inGroup,
          },
    form:
      form === null
        ? null
        : {
            kind: "elision",
            title: form.title,
            summary: form.stored === null ? `${stretchOf(form)}, automatic` : stretchOf(form),
            key: addressKey(form.address),
            keeps: inGroup ? groupOwn : inRoot ? rootOwn : addressKey(form.address),
            opened: true,
          },
  };
}
