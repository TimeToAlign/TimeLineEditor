/**
 * What the Properties tab shows of one selected flow-control element: its
 * read-only rows (its role, its coordinate, how it is notated, when a
 * break ends the flow, and each destination of a jump with its
 * conditions), the entries of its provenance as both other tabs show an
 * entry (`lineOf`), and the one `set` recording the user's belief in it.
 * The editor never changes a flow-control element beyond its name: an
 * element is rejected by a belief `false`, and the drawing fades it.
 */

import type { Subject } from "@timetoalign/tilie-arranger";
import type {
  Address,
  Block,
  ElementBelief,
  FlowControlElement,
  JumpDestination,
  ResolvedAddress,
  SetCommand,
  TimelineManifest,
  User,
} from "@timetoalign/tilie-core";
import {
  entryWord,
  idAddress,
  inBlock,
  isRejected,
  prettyText,
  statedBy,
} from "@timetoalign/tilie-core";
import { axisCoordinate } from "@timetoalign/tilie-core/numbers";
import type { Belief } from "@timetoalign/timetoshare";
import type { IriNames } from "../iris.ts";
import type { BeliefLine, EntryLine } from "./provenance.ts";
import { beliefOf, lineOf } from "./provenance.ts";

/** The one flow-control element a selection names. */
export interface FlowSubject {
  readonly block: Block;
  /** The element's own address in its block. */
  readonly target: Address;
  /** The timeline listing it, on whose axis its coordinate and every `by` lie. */
  readonly timeline: TimelineManifest;
  readonly element: FlowControlElement;
}

/** The flow-control element `resolved` names: itself, or the element a part (its label) belongs to. */
function flowIn(resolved: ResolvedAddress): FlowSubject | null {
  if (resolved.kind === "part") return flowIn(resolved.owner);
  if (resolved.kind !== "entry" || resolved.entry !== "flow_control") return null;
  const { block, at, element } = resolved;
  if (!("role" in element)) return null;
  return {
    block,
    target: inBlock(block.id, idAddress(element.id)),
    timeline: at.timeline,
    element,
  };
}

/**
 * The flow-control element the selection names: the one element every
 * subject names, itself or by its label; `null` for no selection, for
 * anything else, and for several elements.
 */
export function flowOf(subjects: readonly Subject[]): FlowSubject | null {
  const [first, ...more] = subjects.map((subject) => flowIn(subject.resolved));
  if (first === undefined || first === null) return null;
  const same = (other: FlowSubject | null) =>
    other !== null && other.block.id === first.block.id && other.element.id === first.element.id;
  return more.every(same) ? first : null;
}

/** One read-only row of a flow-control element. */
export interface FlowRow {
  readonly label: string;
  readonly value: string;
}

type Passes = NonNullable<JumpDestination["passes"]>;
type Reference = NonNullable<JumpDestination["after"]>;

/** `1`, `1 and 3`, `1, 2 and 4`. */
function listed(items: readonly string[]): string {
  const last = items.at(-1) ?? "";
  return items.length < 2 ? last : `${items.slice(0, -1).join(", ")} and ${last}`;
}

/** The passes a condition names: `on pass 2`, `on passes 1 and 3`, `from pass 2 on`. */
function passesWords(passes: Passes): string {
  if ("from" in passes) return `from pass ${passes.from} on`;
  return `on ${passes.length === 1 ? "pass" : "passes"} ${listed(passes.map(String))}`;
}

/** A value on the timeline's own axis, a coordinate or a distance, in its pretty text. */
function axisText(value: unknown, timeline: TimelineManifest): string {
  return prettyText(axisCoordinate(value, timeline).value, timeline.number_type, timeline.unit);
}

/** The place a destination or a reference to one states: `to 'X'`, `by 4 ♩`, or neither (`null`). */
function placeWords(
  place: Pick<JumpDestination, "to" | "by">,
  timeline: TimelineManifest,
): string | null {
  if (place.to !== undefined) return `to '${place.to}'`;
  if (place.by !== undefined) return `by ${axisText(place.by, timeline)}`;
  return null;
}

/** The destination an `after` names, by its jump and its place. */
function afterWords(after: Reference, timeline: TimelineManifest): string {
  const place = placeWords(after, timeline);
  return `after jump '${after.jump}' took its destination${place === null ? "" : ` ${place}`}`;
}

/**
 * One destination of a jump in words, its members separated by `; `: its
 * place (`to 'X'`, `by 4 ♩`, or `to the start of its section` without
 * either), then each condition and effect it states, in the order passes,
 * `repeat_count`, `after`, `determined` false, `reset` false, then its
 * manifestation and its label.
 */
export function destinationWords(destination: JumpDestination, timeline: TimelineManifest): string {
  const { passes, repeat_count: count, after, manifestation, label } = destination;
  return [
    placeWords(destination, timeline) ?? "to the start of its section",
    ...(passes === undefined ? [] : [passesWords(passes)]),
    ...(count === undefined ? [] : [count === 1 ? "at most once" : `at most ${count} times`]),
    ...(after === undefined ? [] : [afterWords(after, timeline)]),
    ...(destination.determined ? [] : ["not determined by the source"]),
    ...(destination.reset ? [] : ["without restoring what it goes back over"]),
    ...(manifestation === undefined ? [] : [`notated as ${manifestation}`]),
    ...(label === null ? [] : [`labelled '${label}'`]),
  ].join("; ");
}

/**
 * The read-only rows of a flow-control element, in order: its role, its
 * coordinate, its manifestation where it states one, when a break ends the
 * flow where it states that (`ends`), one row per destination of a jump in
 * the order of its `targets` (`destinationWords`), and its status where it
 * is rejected.
 */
export function flowRows({ element, timeline }: FlowSubject): FlowRow[] {
  const role = entryWord("flow_control", element);
  const { ends } = element;
  const conditions =
    ends === undefined
      ? []
      : [
          ...(ends.passes === undefined ? [] : [passesWords(ends.passes)]),
          ...(ends.after === undefined ? [] : [afterWords(ends.after, timeline)]),
        ];
  return [
    { label: "Role", value: role },
    { label: "Coordinate", value: axisText(element.coordinate, timeline) },
    ...(element.manifestation === undefined
      ? []
      : [{ label: "Manifestation", value: element.manifestation }]),
    ...(ends === undefined ? [] : [{ label: "Ends the flow", value: conditions.join("; ") }]),
    ...(element.targets ?? []).map((destination, index) => ({
      label: `Destination ${index + 1}`,
      value: destinationWords(destination, timeline),
    })),
    ...(isRejected(element) ? [{ label: "Status", value: "rejected: no flow reads it" }] : []),
  ];
}

/** The provenance of a flow-control element as the tab shows it. */
export interface FlowProvenance {
  /** One line per entry, in the element's order: how the element was made. */
  readonly entries: readonly EntryLine[];
  /**
   * The beliefs of every entry together, in their order, each actor once
   * (an actor's first belief): the line the belief buttons stand under;
   * `null` for an element without provenance.
   */
  readonly beliefs: EntryLine | null;
  /** The user's own belief; `null` for none. */
  readonly mine: Belief | null;
}

/** The entries of an element's provenance as lines (`lineOf`), and the beliefs they hold together. */
export function flowProvenance(
  { element }: FlowSubject,
  user: User,
  names: IriNames,
): FlowProvenance {
  const entries = (element.provenance ?? []).map((entry) => lineOf(entry, user, names));
  const [first] = entries;
  if (first === undefined) return { entries, beliefs: null, mine: null };
  const held = new Map<string, BeliefLine>();
  for (const belief of entries.flatMap((entry) => entry.beliefs)) {
    if (!held.has(belief.actor)) held.set(belief.actor, belief);
  }
  const beliefs: EntryLine = {
    method: null,
    statedBy: [],
    date: null,
    service: null,
    basis: [],
    match: null,
    note: null,
    beliefs: [...held.values()],
  };
  return { entries, beliefs, mine: beliefOf(beliefs, user) };
}

/**
 * The `set` recording `user`'s belief in the element on `day`
 * (`YYYY-MM-DD`): the element's `belief`, the user named as in every
 * statement (`statedBy`). Core puts it into the element's provenance, in
 * place of the user's earlier one, and changes nothing else of it. A belief
 * `false` rejects the element; another one believes it again.
 */
export function beliefCommand(
  { target }: FlowSubject,
  user: User,
  belief: Belief,
  day: string,
): SetCommand {
  const recorded: ElementBelief = { actor: statedBy(user), belief, date: day };
  return { type: "set", changes: [{ target, values: { belief: recorded } }] };
}
