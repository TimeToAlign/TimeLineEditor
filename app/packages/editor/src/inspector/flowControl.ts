/**
 * The Flow control tab of a root's flow-control editor: the flow-control
 * elements of the root's tree, each a row that selects it on the canvas,
 * and the adding of flow control. Every kind (`FLOW_KINDS`) is written as a
 * loader writes it, over the five roles core admits (Jump, JumpTarget,
 * Break, SectionBreak, Barline) and the words of the manifestation
 * vocabulary: a sign or a barline alone, a jump with its destinations, or a
 * set of elements that only together are what a source notates: a dal
 * segno and the segno it goes to, an al fine and its Fine, an al coda with
 * its To Coda and its coda, a first and a second ending. A destination is
 * chosen among the elements of the timeline that a destination may name
 * (`slotOptions`), or created with the jump at a position of its own; the
 * elements go into a timeline of the tree, the jump at a position typed on
 * that timeline's axis, proposed from the selection (`proposedPosition`).
 * IDs are core's to give: each element is one `add`, the IDs the earlier
 * ones were given read through the result (`addFlowElements`), and the
 * elements added are selected at once; the Properties tab edits each
 * one's name, label and belief. Whether an element holds with the others
 * (one Jump at one position of the tree, a destination inside the
 * timeline) is the store's check.
 */

import { typedValue } from "@timetoalign/tilie-arranger";
import type {
  AddCommand,
  Address,
  AxisValue,
  Block,
  ElementAddress,
  FlowControlElement,
  Manifest,
  OpenEditor,
  ResolvedElement,
  Store,
  TimelineManifest,
  View,
} from "@timetoalign/tilie-core";
import {
  addressKey,
  apply,
  assertNever,
  copyValue,
  elementAddressOf,
  entryWord,
  findTimeline,
  idAddress,
  inBlock,
  isCommandError,
  isElementAddress,
  prettyUnit,
  resolveElement,
} from "@timetoalign/tilie-core";
import { axisCoordinate } from "@timetoalign/tilie-core/numbers";
import type { Result } from "./problems.ts";
import { InspectorCode, refused } from "./problems.ts";

/**
 * A place a kind asks for beside the jump's own position: an element a
 * destination names, chosen or created (`ChoiceSlot`), or the position of
 * a second element the kind writes (`PositionSlot`).
 */
export type FlowSlotKey =
  | "repeat_start"
  | "segno"
  | "coda"
  | "fine"
  | "ossia"
  | "follows"
  | "to_coda"
  | "second_ending";

/** One element a choice offers: its ID and its words, its name (else its ID) and where it lies. */
export interface FlowCandidate {
  readonly id: string;
  readonly label: string;
}

/**
 * An element of the timeline a kind's destination names (or, for a Fine,
 * that ends the flow after the jump): one of `candidates`, a new one at a
 * position of its own where the slot `creates`, or none where the slot
 * offers `none` (its words).
 */
interface ChoiceSlot {
  readonly kind: "choice";
  readonly key: FlowSlotKey;
  /** The select's label. */
  readonly label: string;
  /** The element's noun, in the option "New …" and in a refusal. */
  readonly noun: string;
  /** The elements of `timeline` it may name. */
  readonly candidates: (timeline: TimelineManifest) => readonly TimelineElement[];
  readonly creates: boolean;
  readonly none?: string;
}

/** The position of a second element the kind writes (a To Coda, a second ending). */
interface PositionSlot {
  readonly kind: "position";
  readonly key: FlowSlotKey;
  /** The field's label. */
  readonly label: string;
  /** The element's noun, in a refusal. */
  readonly noun: string;
}

/** A slot of a kind. */
export type FlowSlot = ChoiceSlot | PositionSlot;

/** An element of a timeline a choice offers: a flow-control element or a child timeline. */
type TimelineElement = FlowControlElement | TimelineManifest;

/** The flow-control elements of `timeline` of `role`, of the manifestation `word`. */
function signs(role: FlowControlElement["role"], word: string) {
  return (timeline: TimelineManifest): readonly TimelineElement[] =>
    timeline.flow_control.filter((item) => item.role === role && item.manifestation === word);
}

/** The words of an al coda destination, which a To Coda follows. */
const AL_CODA = ["da_capo_al_coda", "dal_segno_al_coda"];

/** The slots, by key. */
export const FLOW_SLOTS: { readonly [key in FlowSlotKey]: FlowSlot } = {
  repeat_start: {
    kind: "choice",
    key: "repeat_start",
    label: "Back to",
    noun: "repeat start",
    candidates: signs("jump_target", "repeat_start"),
    creates: true,
    none: "Start of the section",
  },
  segno: {
    kind: "choice",
    key: "segno",
    label: "Segno",
    noun: "segno",
    candidates: signs("jump_target", "segno"),
    creates: true,
  },
  coda: {
    kind: "choice",
    key: "coda",
    label: "Coda",
    noun: "coda",
    candidates: signs("jump_target", "coda"),
    creates: true,
  },
  fine: {
    kind: "choice",
    key: "fine",
    label: "Fine",
    noun: "Fine",
    candidates: signs("break", "fine"),
    creates: true,
  },
  ossia: {
    kind: "choice",
    key: "ossia",
    label: "Ossia",
    noun: "ossia sign",
    candidates: (timeline) => [...signs("jump_target", "ossia")(timeline), ...timeline.children],
    creates: true,
  },
  follows: {
    kind: "choice",
    key: "follows",
    label: "After",
    noun: "al coda",
    candidates: (timeline) =>
      timeline.flow_control.filter(
        (item) =>
          item.role === "jump" &&
          (item.targets ?? []).some((target) => AL_CODA.includes(target.manifestation ?? "")),
      ),
    creates: false,
  },
  to_coda: { kind: "position", key: "to_coda", label: "To Coda at", noun: "To Coda" },
  second_ending: {
    kind: "position",
    key: "second_ending",
    label: "Second ending at",
    noun: "second ending",
  },
};

/** A kind of flow control the tab adds: its key, its word, its group in the list and the slots it asks for. */
export interface FlowKind {
  /** The kind's key, the value of its option. */
  readonly key: FlowKindKey;
  /** Its word in the list, capitalised. */
  readonly label: string;
  /** The group of the list it stands in. */
  readonly group: string;
  /** The label of the jump's (or the element's) position. */
  readonly at: string;
  /** What it asks for beside that position, in the form's order. */
  readonly slots: readonly FlowSlotKey[];
}

/** The keys of the kinds, in the list's order. */
export type FlowKindKey =
  | "repeat_start"
  | "repeat_end"
  | "volta_set"
  | "volta"
  | "volta_break"
  | "da_capo"
  | "da_capo_al_fine"
  | "da_capo_al_coda"
  | "dal_segno"
  | "dal_segno_al_fine"
  | "dal_segno_al_coda"
  | "to_coda"
  | "ossia_jump"
  | "segno"
  | "coda"
  | "fine"
  | "ossia"
  | "section_break"
  | "double_barline"
  | "final_barline"
  | "jump"
  | "jump_target"
  | "break"
  | "barline";

const REPEATS = "Repeats and endings";
const JUMPS = "Jumps";
const SIGNS = "Signs";
const BARLINES = "Sections and barlines";
const PLAIN = "Elements without a word";
const AT = "Position";

/**
 * The kinds, in the list's order: every word of the manifestation
 * vocabulary a source notates, each written with what it needs to hold
 * (`flowSteps`), then a plain element of each role.
 */
export const FLOW_KINDS: readonly FlowKind[] = [
  { key: "repeat_start", label: "Repeat start", group: REPEATS, at: AT, slots: [] },
  { key: "repeat_end", label: "Repeat end", group: REPEATS, at: AT, slots: ["repeat_start"] },
  {
    key: "volta_set",
    label: "First and second ending",
    group: REPEATS,
    at: "First ending at",
    slots: ["second_ending", "repeat_start"],
  },
  { key: "volta", label: "Volta bracket start", group: REPEATS, at: AT, slots: [] },
  { key: "volta_break", label: "Break between volta brackets", group: REPEATS, at: AT, slots: [] },
  { key: "da_capo", label: "Da capo", group: JUMPS, at: AT, slots: [] },
  { key: "da_capo_al_fine", label: "Da capo al fine", group: JUMPS, at: AT, slots: ["fine"] },
  {
    key: "da_capo_al_coda",
    label: "Da capo al coda",
    group: JUMPS,
    at: AT,
    slots: ["to_coda", "coda"],
  },
  { key: "dal_segno", label: "Dal segno", group: JUMPS, at: AT, slots: ["segno"] },
  {
    key: "dal_segno_al_fine",
    label: "Dal segno al fine",
    group: JUMPS,
    at: AT,
    slots: ["segno", "fine"],
  },
  {
    key: "dal_segno_al_coda",
    label: "Dal segno al coda",
    group: JUMPS,
    at: AT,
    slots: ["segno", "to_coda", "coda"],
  },
  { key: "to_coda", label: "To coda", group: JUMPS, at: AT, slots: ["follows", "coda"] },
  { key: "ossia_jump", label: "Ossia fork", group: JUMPS, at: AT, slots: ["ossia"] },
  { key: "segno", label: "Segno", group: SIGNS, at: AT, slots: [] },
  { key: "coda", label: "Coda", group: SIGNS, at: AT, slots: [] },
  { key: "fine", label: "Fine", group: SIGNS, at: AT, slots: [] },
  { key: "ossia", label: "Ossia sign", group: SIGNS, at: AT, slots: [] },
  { key: "section_break", label: "Section break", group: BARLINES, at: AT, slots: [] },
  { key: "double_barline", label: "Double barline", group: BARLINES, at: AT, slots: [] },
  { key: "final_barline", label: "Final barline", group: BARLINES, at: AT, slots: [] },
  { key: "jump", label: "Jump", group: PLAIN, at: AT, slots: [] },
  { key: "jump_target", label: "Jump target", group: PLAIN, at: AT, slots: [] },
  { key: "break", label: "Break", group: PLAIN, at: AT, slots: [] },
  { key: "barline", label: "Barline", group: PLAIN, at: AT, slots: [] },
];

/** The kinds by group, the groups in the list's order. */
export const FLOW_GROUPS: readonly {
  readonly group: string;
  readonly kinds: readonly FlowKind[];
}[] = [...new Set(FLOW_KINDS.map((kind) => kind.group))].map((group) => ({
  group,
  kinds: FLOW_KINDS.filter((kind) => kind.group === group),
}));

/** One timeline of the edited root's tree, as the tab offers it: its ID and its words. */
export interface FlowTimeline {
  readonly id: string;
  /** Its name, else its ID. */
  readonly label: string;
  /** Its axis's pretty unit. */
  readonly unit: string;
}

/** One flow-control element of the tree, as its row shows it. */
export interface FlowRow {
  readonly id: string;
  /** Its address in its block, which its row selects. */
  readonly address: Address;
  /** The word of its role (`jump`, `jump target`, …), capitalised, with its manifestation. */
  readonly words: string;
  /** Its name, else its label, else its ID. */
  readonly name: string;
  /** Its coordinate as Copy writes it, and the unit of the timeline holding it. */
  readonly position: string;
  readonly unit: string;
  /** The timeline holding it: its name, else its ID. */
  readonly timeline: string;
}

/** What the Flow control tab shows of the flow-control editor of a root. */
export interface FlowControlShown {
  readonly block: Block;
  readonly root: TimelineManifest;
  /** The root and its descendants, in pre-order. */
  readonly timelines: readonly FlowTimeline[];
  /** Every flow-control element of the tree, by timeline in pre-order, then in the manifest's order. */
  readonly rows: readonly FlowRow[];
}

/** Every timeline of `root`'s tree, `root` first, in pre-order. */
function treeOf(root: TimelineManifest): TimelineManifest[] {
  return [root, ...root.children.flatMap(treeOf)];
}

/** A value of `timeline`'s axis as Copy writes it. */
function axisText(value: unknown, timeline: TimelineManifest): string {
  return copyValue(axisCoordinate(value, timeline).value, timeline.number_type);
}

/** The words of `element`: its role's, capitalised, and its manifestation (or its destinations'). */
function rowWords(element: FlowControlElement): string {
  const word = entryWord("flow_control", element);
  const shown =
    element.manifestation ??
    (element.targets ?? [])
      .flatMap((target) => (target.manifestation === undefined ? [] : [target.manifestation]))
      .join(", ");
  const capital = `${word.charAt(0).toUpperCase()}${word.slice(1)}`;
  return shown === "" ? capital : `${capital} (${shown.replaceAll("_", " ")})`;
}

/**
 * What the Flow control tab shows under `innermost`, the innermost open
 * editor: for a flow-control editor of a root held by `view`, the root's
 * tree and its flow-control elements; `null` at every other level.
 */
export function flowControlOf(
  view: View,
  innermost: OpenEditor | undefined,
): FlowControlShown | null {
  if (innermost?.kind !== "flow") return null;
  const { block: id, id: rootId } = innermost.target;
  const block = id === undefined ? undefined : view.blocks[id];
  const root =
    block === undefined || rootId === undefined
      ? undefined
      : block.manifest.timelines.find((item) => item.id === rootId);
  if (block === undefined || root === undefined) return null;
  const tree = treeOf(root);
  return {
    block,
    root,
    timelines: tree.map((timeline) => ({
      id: timeline.id,
      label: timeline.name ?? timeline.id,
      unit: prettyUnit(timeline.unit),
    })),
    rows: tree.flatMap((timeline) =>
      timeline.flow_control.map((element) => ({
        id: element.id,
        address: inBlock(block.id, idAddress(element.id)),
        words: rowWords(element),
        name: element.name ?? element.label ?? element.id,
        position: axisText(element.coordinate, timeline),
        unit: prettyUnit(timeline.unit),
        timeline: timeline.name ?? timeline.id,
      })),
    ),
  };
}

/** Where a new element goes: a timeline of the tree and a position on its axis, as Copy writes it. */
export interface Position {
  readonly timeline: string;
  readonly text: string;
}

/**
 * The position `resolved`, an element of `manifest`, stands at on the
 * timeline holding it: a flow-control element's coordinate, a region's
 * start (its end for its `end` part), a timeline's start (0) or its end
 * (its length, where known) for its `start` and `end` parts; any other
 * part its owner's; `null` for anything else.
 */
function standsAt(resolved: ResolvedElement, manifest: Manifest): Position | null {
  switch (resolved.kind) {
    case "entry": {
      const timeline = resolved.at.timeline;
      const { element } = resolved;
      if (resolved.entry === "flow_control" && "coordinate" in element) {
        return { timeline: timeline.id, text: axisText(element.coordinate, timeline) };
      }
      if (resolved.entry === "region" && "start" in element) {
        return { timeline: timeline.id, text: axisText(element.start, timeline) };
      }
      return null;
    }
    case "part": {
      const { owner, word } = resolved;
      if (owner.kind === "entry" && owner.entry === "region" && word === "end") {
        const { element } = owner;
        if ("end" in element) {
          return { timeline: owner.at.timeline.id, text: axisText(element.end, owner.at.timeline) };
        }
      }
      if (owner.kind === "timeline" && (word === "start" || word === "end")) {
        const { timeline } = owner.at;
        if (word === "start") return { timeline: timeline.id, text: axisText(0, timeline) };
        return timeline.length === null
          ? { timeline: timeline.id, text: "" }
          : { timeline: timeline.id, text: axisText(timeline.length, timeline) };
      }
      return standsAt(owner, manifest);
    }
    case "timeline":
    case "card":
    case "band":
      return { timeline: resolved.at.timeline.id, text: "" };
    case "title":
    case "frame":
    case "measure_map":
    case "timestamp":
    case "elision":
    case "matchstamp":
    case "anchor":
    case "flow_map":
    case "virtual_timeline":
    case "virtual_card":
    case "virtual_band":
    case "chunk":
      return null;
    default:
      return assertNever(resolved);
  }
}

/**
 * The position the tab proposes for a new element of `shown`'s tree, from
 * the selection `addresses`: where they are exactly one element of the
 * edited block inside the tree, the timeline holding it and where it stands
 * (`standsAt`: a flow-control element's coordinate, a region's start, a
 * timeline's start or end mark; an empty position for a timeline, its card
 * or a band); else the root, the position empty.
 */
export function proposedPosition(shown: FlowControlShown, addresses: readonly Address[]): Position {
  const none = { timeline: shown.root.id, text: "" };
  const [only, ...others] = addresses;
  if (only === undefined || others.length > 0 || only.block !== shown.block.id) return none;
  if (!isElementAddress(only)) return none;
  const { manifest } = shown.block;
  const element: ElementAddress = elementAddressOf(only);
  const resolved = resolveElement(manifest, element);
  const at = resolved === undefined ? null : standsAt(resolved, manifest);
  return at !== null && shown.timelines.some((item) => item.id === at.timeline) ? at : none;
}

/** The value of the option choosing a new element, and of the one choosing none. */
export const PICK_NEW = "new";
export const PICK_NONE = "none";

/** The value of the option choosing the element `id`. */
export function pickOf(id: string): string {
  return `id:${id}`;
}

/** One option of a choice: its value (`PICK_NEW`, `PICK_NONE` or `pickOf(id)`) and its words. */
export interface SlotOption {
  readonly value: string;
  readonly label: string;
}

/** The timeline `id` of `shown`'s tree; `undefined` for any other. */
function treeTimeline(shown: FlowControlShown, id: string): TimelineManifest | undefined {
  return shown.timelines.some((item) => item.id === id)
    ? findTimeline(shown.block.manifest, id)
    : undefined;
}

/** The words of `element` of `timeline`: a flow-control element's name, label or ID and where it lies; a child's name or ID. */
function candidateWords(element: TimelineElement, timeline: TimelineManifest): string {
  if (!("role" in element)) return `${element.name ?? element.id} (timeline)`;
  const name = element.name ?? element.label ?? element.id;
  return `${name} at ${axisText(element.coordinate, timeline)} ${prettyUnit(timeline.unit)}`;
}

/**
 * The options of the choice `key` in timeline `timeline` of `shown`'s
 * tree: its none (where it offers one), the elements of that timeline it
 * may name, in the manifest's order, then a new one (where it creates);
 * nothing for a position slot or a timeline outside the tree.
 */
export function slotOptions(
  shown: FlowControlShown,
  timeline: string,
  key: FlowSlotKey,
): readonly SlotOption[] {
  const slot = FLOW_SLOTS[key];
  const held = treeTimeline(shown, timeline);
  if (slot.kind === "position" || held === undefined) return [];
  return [
    ...(slot.none === undefined ? [] : [{ value: PICK_NONE, label: slot.none }]),
    ...slot.candidates(held).map((element) => ({
      value: pickOf(element.id),
      label: candidateWords(element, held),
    })),
    ...(slot.creates ? [{ value: PICK_NEW, label: `New ${slot.noun}` }] : []),
  ];
}

/** The option a choice holds until another is chosen: its first element, else its first option. */
export function defaultPick(options: readonly SlotOption[]): string {
  return (
    options.find((option) => option.value.startsWith("id:"))?.value ?? options[0]?.value ?? PICK_NEW
  );
}

/** What the form holds for a slot: the option chosen (the default where absent) and the position typed. */
export interface SlotInput {
  readonly pick?: string;
  readonly text?: string;
}

/** What the form holds: the kind, the timeline, the jump's position, and each slot's input. */
export interface FlowInput {
  readonly kind: string;
  readonly timeline: string;
  readonly text: string;
  readonly slots?: { readonly [key in FlowSlotKey]?: SlotInput };
}

/** A flow-control element as an `add` carries it, without its ID. */
type ElementValue = { readonly [key: string]: unknown };

/** The IDs core gave the elements of the earlier steps, by the steps' names. */
type GivenIds = ReadonlyMap<string, string>;

/**
 * One `add` of a plan: the name later steps know its element by, and the
 * element, which may name the elements of earlier steps by their IDs.
 */
export interface FlowStep {
  readonly name: string;
  readonly element: (ids: GivenIds) => ElementValue;
}

/** The elements of one kind, added in order into one timeline of the tree. */
export interface FlowPlan {
  readonly timeline: string;
  readonly steps: readonly FlowStep[];
}

/** What a choice names: an element of the timeline, a new one at a position, or none. */
type Picked =
  | { readonly kind: "existing"; readonly id: string }
  | { readonly kind: "new"; readonly at: AxisValue }
  | { readonly kind: "none" };

/** The ID of the element the step `name` added. */
function idOf(ids: GivenIds, name: string): string {
  const id = ids.get(name);
  if (id === undefined) throw new Error(`no earlier step adds '${name}'`);
  return id;
}

/** The place of a destination naming what `picked` names (the element step `name` creates where new); none, no place. */
function placed(picked: Picked, name: string, ids: GivenIds): ElementValue {
  switch (picked.kind) {
    case "existing":
      return { to: picked.id };
    case "new":
      return { to: idOf(ids, name) };
    case "none":
      return {};
    default:
      return assertNever(picked);
  }
}

/** The step `name` writing a jump target of `manifestation` where `picked` is new; none else. */
function created(picked: Picked, name: string, manifestation: string): FlowStep[] {
  if (picked.kind !== "new") return [];
  const { at } = picked;
  return [{ name, element: () => ({ role: "jump_target", coordinate: at, manifestation }) }];
}

/** The step `name` writing a Jump at `coordinate` with the destinations `targets` gives. */
function jump(
  name: string,
  coordinate: AxisValue,
  targets: (ids: GivenIds) => readonly ElementValue[],
): FlowStep {
  return { name, element: (ids) => ({ role: "jump", coordinate, targets: targets(ids) }) };
}

/**
 * A da capo's or dal segno's destination, `manifestation` at `place`,
 * taken once without the repeats played again, as a loader writes it.
 */
function leap(manifestation: string, place: ElementValue): ElementValue {
  return { ...place, manifestation, repeat_count: 1, reset: false };
}

/** The step of a new Fine at `picked`, ending the flow once the Jump of step `jump` is taken; none for a Fine there. */
function fineSteps(picked: Picked): FlowStep[] {
  if (picked.kind !== "new") return [];
  const { at } = picked;
  return [
    {
      name: "fine",
      element: (ids) => ({
        role: "break",
        coordinate: at,
        manifestation: "fine",
        ends: { after: { jump: idOf(ids, "jump") } },
      }),
    },
  ];
}

/** The To Coda Jump at `at`, to the coda `coda`, held once the destination `after` names was taken. */
function toCoda(at: AxisValue, coda: Picked, after: (ids: GivenIds) => ElementValue): FlowStep {
  return jump("to_coda", at, (ids) => [
    { ...placed(coda, "coda", ids), manifestation: "to_coda", after: after(ids) },
  ]);
}

/**
 * The reference to the al coda destination of the Jump `id` of `timeline`
 * (a To Coda follows it): the jump's ID and that destination's place.
 */
function alCodaReference(timeline: TimelineManifest, id: string): ElementValue {
  const element = timeline.flow_control.find((item) => item.id === id);
  const destination = (element?.targets ?? []).find((target) =>
    AL_CODA.includes(target.manifestation ?? ""),
  );
  if (destination === undefined) throw new Error(`'${id}' holds no al coda destination`);
  return {
    jump: id,
    ...(destination.to === undefined ? {} : { to: destination.to }),
    ...(destination.by === undefined ? {} : { by: destination.by }),
  };
}

/** What the slots of a kind hold, read: each choice's pick and each position. */
interface SlotValues {
  choice(key: FlowSlotKey): Picked;
  position(key: FlowSlotKey): AxisValue;
}

/**
 * The steps writing the kind `key` at `at` into `timeline`, `zero` the
 * axis's 0: the elements a destination names that are new first, then the
 * jump, then what names the jump (a Fine, a To Coda). Each element is
 * written as a loader writes it: a repeat end and a plain Jump with one
 * destination taken once (`repeat_count` 1), at the repeat start chosen or
 * at the start of the section; a da capo `to` its timeline and a dal segno
 * `to` its segno, taken once without the repeats played again (`reset`
 * false); an al fine with the Fine it plays until, which ends the flow once
 * the jump is taken where it is new; an al coda with its To Coda, taken
 * once the al coda was; a first and a second ending as a fork at the first
 * ending's start (going on, `by` 0, on the first pass, to the second
 * ending on the second), and at the second ending's start a volta break,
 * the repeat end and the second ending's jump target; a Fine alone ends the
 * flow from its second arrival on; an ossia fork goes on, or to the ossia
 * on a choice nobody can check (`determined` false).
 */
function flowSteps(
  key: FlowKindKey,
  timeline: TimelineManifest,
  at: AxisValue,
  zero: AxisValue,
  slots: SlotValues,
): FlowStep[] {
  const element = (value: ElementValue): FlowStep[] => [
    { name: "element", element: () => ({ coordinate: at, ...value }) },
  ];
  switch (key) {
    case "repeat_start":
    case "segno":
    case "coda":
    case "ossia":
      return element({ role: "jump_target", manifestation: key });
    case "volta":
      return element({ role: "jump_target", manifestation: "volta" });
    case "volta_break":
      return element({ role: "break", manifestation: "volta" });
    case "fine":
      return element({ role: "break", manifestation: "fine", ends: { passes: { from: 2 } } });
    case "double_barline":
    case "final_barline":
      return element({ role: "barline", manifestation: key });
    case "section_break":
    case "jump_target":
    case "break":
    case "barline":
      return element({ role: key });
    case "jump":
      return [jump("element", at, () => [{ repeat_count: 1 }])];
    case "repeat_end": {
      const back = slots.choice("repeat_start");
      return [
        ...created(back, "repeat_start", "repeat_start"),
        jump("jump", at, (ids) => [
          { ...placed(back, "repeat_start", ids), manifestation: "repeat_end", repeat_count: 1 },
        ]),
      ];
    }
    case "volta_set": {
      const back = slots.choice("repeat_start");
      const second = slots.position("second_ending");
      return [
        ...created(back, "repeat_start", "repeat_start"),
        {
          name: "second_ending",
          element: () => ({ role: "jump_target", coordinate: second, manifestation: "volta" }),
        },
        jump("first_ending", at, (ids) => [
          { by: zero, manifestation: "volta", passes: [1] },
          { to: idOf(ids, "second_ending"), manifestation: "volta", passes: [2] },
        ]),
        {
          name: "volta_break",
          element: () => ({ role: "break", coordinate: second, manifestation: "volta" }),
        },
        jump("repeat_end", second, (ids) => [
          { ...placed(back, "repeat_start", ids), manifestation: "repeat_end", repeat_count: 1 },
        ]),
      ];
    }
    case "da_capo":
      return [jump("jump", at, () => [leap("da_capo", { to: timeline.id })])];
    case "da_capo_al_fine":
      return [
        jump("jump", at, () => [leap("da_capo_al_fine", { to: timeline.id })]),
        ...fineSteps(slots.choice("fine")),
      ];
    case "da_capo_al_coda": {
      const coda = slots.choice("coda");
      return [
        ...created(coda, "coda", "coda"),
        jump("jump", at, () => [leap("da_capo_al_coda", { to: timeline.id })]),
        toCoda(slots.position("to_coda"), coda, (ids) => ({ jump: idOf(ids, "jump") })),
      ];
    }
    case "dal_segno": {
      const segno = slots.choice("segno");
      return [
        ...created(segno, "segno", "segno"),
        jump("jump", at, (ids) => [leap("dal_segno", placed(segno, "segno", ids))]),
      ];
    }
    case "dal_segno_al_fine": {
      const segno = slots.choice("segno");
      return [
        ...created(segno, "segno", "segno"),
        jump("jump", at, (ids) => [leap("dal_segno_al_fine", placed(segno, "segno", ids))]),
        ...fineSteps(slots.choice("fine")),
      ];
    }
    case "dal_segno_al_coda": {
      const segno = slots.choice("segno");
      const coda = slots.choice("coda");
      return [
        ...created(segno, "segno", "segno"),
        ...created(coda, "coda", "coda"),
        jump("jump", at, (ids) => [leap("dal_segno_al_coda", placed(segno, "segno", ids))]),
        toCoda(slots.position("to_coda"), coda, (ids) => ({ jump: idOf(ids, "jump") })),
      ];
    }
    case "to_coda": {
      const follows = slots.choice("follows");
      if (follows.kind !== "existing") throw new Error("a To Coda follows a jump of its timeline");
      const coda = slots.choice("coda");
      const after = alCodaReference(timeline, follows.id);
      return [...created(coda, "coda", "coda"), toCoda(at, coda, () => after)];
    }
    case "ossia_jump": {
      const ossia = slots.choice("ossia");
      return [
        ...created(ossia, "ossia", "ossia"),
        jump("jump", at, (ids) => [
          { by: zero },
          { ...placed(ossia, "ossia", ids), determined: false, manifestation: "ossia" },
        ]),
      ];
    }
    default:
      return assertNever(key);
  }
}

/**
 * The plan adding the kind `input.kind` into the timeline `input.timeline`
 * of `shown`'s tree (`flowSteps`), the jump at `input.text` and every new
 * element at its slot's text, each read exactly on that timeline's axis,
 * every choice its pick or, where none is given, its default
 * (`defaultPick`). Refused before dispatch, at `[<timeline's address key>,
 * "coordinate"]` or `[…, <slot key>]`: an unknown kind or timeline, an
 * empty position or one that spells no value of the axis, a pick that is
 * none of the slot's options, a To Coda in a timeline without an al coda.
 */
export function flowPlan(shown: FlowControlShown, input: FlowInput): Result<FlowPlan> {
  const into = addressKey(inBlock(shown.block.id, idAddress(input.timeline)));
  const kind = FLOW_KINDS.find((item) => item.key === input.kind);
  const timeline = treeTimeline(shown, input.timeline);
  if (kind === undefined || timeline === undefined) {
    return refused(InspectorCode.invalidValue, "choose an element and a timeline of the tree", [
      into,
      "coordinate",
    ]);
  }
  const typed = (text: string | undefined, noun: string, path: string): Result<AxisValue> => {
    const trimmed = (text ?? "").trim();
    if (trimmed === "") {
      return refused(InspectorCode.invalidValue, `type the position of the new ${noun}`, [
        into,
        path,
      ]);
    }
    const value = typedValue(trimmed, timeline);
    return typeof value === "string"
      ? refused(InspectorCode.invalidValue, value, [into, path])
      : { ok: true, value };
  };
  const at = typed(input.text, kind.slots.length === 0 ? "element" : "jump", "coordinate");
  if (!at.ok) return at;
  const choices = new Map<FlowSlotKey, Picked>();
  const positions = new Map<FlowSlotKey, AxisValue>();
  for (const key of kind.slots) {
    const slot = FLOW_SLOTS[key];
    const given = input.slots?.[key];
    if (slot.kind === "position") {
      const value = typed(given?.text, slot.noun, key);
      if (!value.ok) return value;
      positions.set(key, value.value);
      continue;
    }
    const options = slotOptions(shown, timeline.id, key);
    if (key === "follows" && options.length === 0) {
      return refused(
        InspectorCode.invalidValue,
        `'${timeline.id}' holds no da capo al coda or dal segno al coda for a To Coda to follow`,
        [into, key],
      );
    }
    const pick = given?.pick ?? defaultPick(options);
    if (!options.some((option) => option.value === pick)) {
      return refused(InspectorCode.invalidValue, `choose the ${slot.noun}`, [into, key]);
    }
    if (pick === PICK_NONE) choices.set(key, { kind: "none" });
    else if (pick === PICK_NEW) {
      const value = typed(given?.text, slot.noun, key);
      if (!value.ok) return value;
      choices.set(key, { kind: "new", at: value.value });
    } else choices.set(key, { kind: "existing", id: pick.slice("id:".length) });
  }
  const zero = typedValue("0", timeline);
  if (typeof zero === "string") throw new Error(`0 lies on the axis of '${timeline.id}'`);
  const slots: SlotValues = {
    choice: (key) => {
      const picked = choices.get(key);
      if (picked === undefined) throw new Error(`the kind asks for no ${key}`);
      return picked;
    },
    position: (key) => {
      const value = positions.get(key);
      if (value === undefined) throw new Error(`the kind asks for no ${key}`);
      return value;
    },
  };
  return {
    ok: true,
    value: { timeline: timeline.id, steps: flowSteps(kind.key, timeline, at.value, zero, slots) },
  };
}

/** The IDs of the flow-control elements of `timeline` of block `block` in `view`. */
function flowIds(view: View, block: string, timeline: string): readonly string[] {
  const manifest = view.blocks[block]?.manifest;
  const held = manifest === undefined ? undefined : findTimeline(manifest, timeline);
  return (held?.flow_control ?? []).map(({ id }) => id);
}

/**
 * Add the elements of `plan` into block `block` of `store`: one `add` each,
 * in order, each element's ID core's, read through the result and given to
 * the later steps that name it. Every `add` is first applied in turn with a
 * copy of the store's minter (`apply`), which gives the IDs the dispatches
 * store, so a refused one (the store's message, at `[<timeline's address
 * key>, "flow_control"]`) leaves the store as it was; one the store refuses
 * all the same (the open editor's guard) undoes those dispatched before
 * it. The value: the addresses of the elements added, in the manifest's
 * order.
 */
export function addFlowElements(
  store: Store,
  block: string,
  plan: FlowPlan,
): Result<readonly Address[]> {
  const into = inBlock(block, idAddress(plan.timeline));
  const path = [addressKey(into), "flow_control"];
  const minter = store.minter();
  const ids = new Map<string, string>();
  const commands: AddCommand[] = [];
  let view = store.view;
  for (const { name, element } of plan.steps) {
    const command: AddCommand = { type: "add", into, flow_control: element(ids) };
    const next = apply(view, command, minter);
    if (isCommandError(next)) return refused(InspectorCode.invalidValue, next.message, path);
    const known = new Set(flowIds(view, block, plan.timeline));
    const [id, ...others] = flowIds(next, block, plan.timeline).filter((item) => !known.has(item));
    if (id === undefined || others.length > 0) throw new Error("an add adds one element");
    ids.set(name, id);
    commands.push(command);
    view = next;
  }
  const before = new Set(flowIds(store.view, block, plan.timeline));
  for (const [index, command] of commands.entries()) {
    const refusal = store.dispatch(command);
    if (refusal === null) continue;
    for (let undone = 0; undone < index; undone += 1) store.undo();
    return refused(InspectorCode.invalidValue, refusal.message, path);
  }
  const added = flowIds(store.view, block, plan.timeline).filter((id) => !before.has(id));
  return { ok: true, value: added.map((id) => inBlock(block, idAddress(id))) };
}
