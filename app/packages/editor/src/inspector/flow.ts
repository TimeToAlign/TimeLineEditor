/**
 * What the Properties tab shows of one selected flow-control element: its
 * read-only rows (its role, its coordinate, how it is notated, when a
 * break ends the flow), the destinations of a jump, one row each with the
 * place it leads to, its conditions and the addresses that mark it, the
 * entries of its provenance as both other tabs show an entry (`lineOf`),
 * and the one `set` recording the user's belief in it. The editor never
 * changes a flow-control element beyond its name: an element is rejected
 * by a belief `false`, and the drawing fades it. Which elements the flows
 * read is the user's reading (`readingOf`).
 */

import type { Subject } from "@timetoalign/tilie-arranger";
import type {
  Address,
  Block,
  ElementBelief,
  FlowControlElement,
  FlowReading,
  JumpDestination,
  ResolvedAddress,
  SetCommand,
  TimelineManifest,
  User,
  View,
} from "@timetoalign/tilie-core";
import {
  addressKey,
  assertNever,
  beliefStateOf,
  destinationPlace,
  entryWord,
  flowReading,
  idAddress,
  inBlock,
  isRead,
  isRejected,
  matchClaimFilterOf,
  prettyText,
  statedBy,
} from "@timetoalign/tilie-core";
import type { Coordinate } from "@timetoalign/tilie-core/numbers";
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
  /** The selected subject naming the element, itself or by its label. */
  readonly subject: Subject;
  /** The timeline listing it, on whose axis its coordinate and every `by` lie. */
  readonly timeline: TimelineManifest;
  readonly element: FlowControlElement;
}

/** The flow-control element `subject` names: itself, or the element a part (its label) belongs to. */
function flowIn(
  subject: Subject,
  resolved: ResolvedAddress = subject.resolved,
): FlowSubject | null {
  if (resolved.kind === "part") return flowIn(subject, resolved.owner);
  if (resolved.kind !== "entry" || resolved.entry !== "flow_control") return null;
  const { block, at, element } = resolved;
  if (!("role" in element)) return null;
  return {
    block,
    target: inBlock(block.id, idAddress(element.id)),
    subject,
    timeline: at.timeline,
    element,
  };
}

/**
 * The flow-control element the selection names: one element every subject
 * names, itself or by its label, where the others are only what its
 * destinations mark (`destinationRows`: the jump target, region, timeline or
 * section break a destination leads to), as choosing a destination selects
 * them; the first such element in selection order. `null` for no selection,
 * for anything else, and for several elements.
 */
export function flowOf(subjects: readonly Subject[]): FlowSubject | null {
  for (const subject of subjects) {
    const flow = flowIn(subject);
    if (flow === null) continue;
    const marked = new Set(
      destinationRows(flow).flatMap((row) => row.marks.slice(1).map(addressKey)),
    );
    const names = (other: Subject) => {
      const named = flowIn(other);
      if (named?.block.id === flow.block.id && named.element.id === flow.element.id) return true;
      return marked.has(addressKey(other.address));
    };
    if (subjects.every(names)) return flow;
  }
  return null;
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

/** One destination of a jump as the Properties tab lists it. */
export interface DestinationRow {
  /** Its position in the jump's `targets`. */
  readonly index: number;
  /** What its place is: `jump target`, `region`, `timeline`, `child timeline`, `start of its section`, `by 4 ♩`, or `'X', which names no place`. */
  readonly place: string;
  /** The name of the element it leads to; `null` where that has none, or for no element. */
  readonly name: string | null;
  /** The ID of the element it leads to; `null` for no element. */
  readonly id: string | null;
  /** The coordinate it reaches on the jump's timeline, in its pretty text; `null` for no place. */
  readonly at: string | null;
  /** Its conditions and effects in words, joined by `; `; empty for none. */
  readonly conditions: string;
  /** How it is notated: its manifestation and its label in words, joined by `; `; empty for neither. */
  readonly notation: string;
  /**
   * The addresses choosing it selects: the jump, whose arcs it marks, then
   * the element it leads to, where one stands there (`destinationPlace`):
   * the jump target, the region, the timeline or child, the section break
   * starting its section, of whichever timeline of the tree lists it.
   */
  readonly marks: readonly Address[];
}

/** A coordinate on the timeline's axis in its pretty text. */
function coordinateText(coordinate: Coordinate, timeline: TimelineManifest): string {
  return prettyText(coordinate.value, timeline.number_type, timeline.unit);
}

/**
 * The destinations of the jump `flow` names, one row each in the order of
 * its `targets` (none for any other role): where its place leads
 * (`destinationPlace`), the element standing there by its kind, name and
 * ID, the coordinate it reaches; then its conditions and effects, in the
 * order passes, `repeat_count`, `after`, `determined` false, `reset` false;
 * then its manifestation and its label.
 */
export function destinationRows(flow: FlowSubject): DestinationRow[] {
  const { block, element, timeline, target } = flow;
  return (element.targets ?? []).map((destination, index) => {
    const { passes, repeat_count: count, after, manifestation, label } = destination;
    const conditions = [
      ...(passes === undefined ? [] : [passesWords(passes)]),
      ...(count === undefined ? [] : [count === 1 ? "at most once" : `at most ${count} times`]),
      ...(after === undefined ? [] : [afterWords(after, timeline)]),
      ...(destination.determined ? [] : ["not determined by the source"]),
      ...(destination.reset ? [] : ["without restoring what it goes back over"]),
    ].join("; ");
    const notation = [
      ...(manifestation === undefined ? [] : [`notated as ${manifestation}`]),
      ...(label === null ? [] : [`labelled '${label}'`]),
    ].join("; ");
    const row = (
      place: string,
      named: { readonly id: string; readonly name: string | null } | null,
      at: Coordinate | null,
    ): DestinationRow => ({
      index,
      place,
      name: named?.name ?? null,
      id: named?.id ?? null,
      at: at === null ? null : coordinateText(at, timeline),
      conditions,
      notation,
      marks: named === null ? [target] : [target, inBlock(block.id, idAddress(named.id))],
    });
    const place = destinationPlace(block.manifest, timeline, element, destination);
    switch (place.kind) {
      case "by":
        return row(`by ${axisText(destination.by, timeline)}`, null, place.at);
      case "jump_target":
        return row("jump target", place.element, place.at);
      case "region":
        return row("region", place.region, place.at);
      case "timeline":
        return row("timeline", place.timeline, place.at);
      case "child":
        return row("child timeline", place.child, place.at);
      case "section":
        return row("start of its section", place.start, place.at);
      case "nowhere":
        return row(`'${place.to}', which names no place`, null, null);
      default:
        return assertNever(place);
    }
  });
}

/**
 * Which flow-control elements of `block` the flows played for `user` read
 * (core's `flowReading`): the user's belief where they recorded one, else
 * the block's belief filter, its MatchClaim filter's belief states. The
 * one reading the editor derives, which the Properties tab's status shows
 * and the client's flow routes take.
 */
export function readingOf(view: View, block: Block, user: User): FlowReading {
  return flowReading(statedBy(user), matchClaimFilterOf(view.settings, block.id).beliefs);
}

/**
 * The status of a flow-control element under `reading`: not read where
 * the user rejects it or, holding no belief in it, the belief filter
 * leaves it out; read although another actor rejects it (the editor's
 * drawing, under the same reading, does not fade it); `null` for an element read
 * and rejected by no one.
 */
function statusOf({ element, block }: FlowSubject, reading: FlowReading): string | null {
  const context = block.manifest["@context"];
  if (!isRead(element, reading, context)) {
    return beliefStateOf(element, reading.believer, context) === "false"
      ? "rejected by you: no flow reads it"
      : "left out by the belief filter: no flow reads it";
  }
  return isRejected(element) ? "rejected by another actor: your flows read it" : null;
}

/**
 * The read-only rows of a flow-control element, in order: its role, its
 * coordinate, its manifestation where it states one, when a break ends the
 * flow where it states that (`ends`), and its status under `reading`
 * (`readingOf`) where it is not read or rejected by someone. A jump's
 * destinations are rows of their own (`destinationRows`).
 */
export function flowRows(flow: FlowSubject, reading: FlowReading): FlowRow[] {
  const { element, timeline } = flow;
  const status = statusOf(flow, reading);
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
    ...(status === null ? [] : [{ label: "Status", value: status }]),
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
