/**
 * Flow control as a manifest holds it, beyond its lists: which roles the
 * drawing draws as lines, the symbol each manifestation draws and the
 * passes a volta fork prints, whether an element is rejected, the belief
 * an actor records in one, and what the place of a jump's destination names.
 * A flow-control element is never removed or changed
 * in place: a repair rejects it (a belief `false` in its `provenance`) and
 * adds another.
 */

import type { Belief } from "@timetoalign/timetoshare";
import { expressAs } from "../maps/express.ts";
import { actorIri, BELIEF_STATES, type BeliefState } from "../matches/beliefs.ts";
import type { Coordinate } from "../number/coordinate.ts";
import { addCoordinates, axisCoordinate } from "../number/coordinate.ts";
import { Rational } from "../number/rational.ts";
import { toRational } from "../number/real.ts";
import { locateTimeline, type Roots } from "./tree.ts";
import type {
  ChildTimeline,
  FlowControlElement,
  FlowRole,
  JumpDestination,
  Region,
  TimelineManifest,
} from "./types.ts";

/** The roles drawn as a vertical line at the element's coordinate, in no order of their own. */
export const FLOW_LINE_ROLES = [
  "break",
  "section_break",
  "barline",
] as const satisfies readonly FlowRole[];

/** A role drawn as a vertical line. */
export type FlowLineRole = (typeof FLOW_LINE_ROLES)[number];

/** The `provenance` of a flow-control element: its entries, each about the element itself. */
export type ElementProvenance = NonNullable<FlowControlElement["provenance"]>;

/** One entry of a flow-control element's `provenance`. */
export type ElementProvenanceEntry = ElementProvenance[number];

/** One actor's belief in an element, as an entry's `beliefs` hold it. */
type HeldBelief = NonNullable<ElementProvenanceEntry["beliefs"]>[number];

/**
 * Whether a flow-control element is rejected, as TimeToShare reads it: an
 * entry of its `provenance` holds a belief `false`, whoever holds it. A
 * rejected element is left out of every flow and is drawn faded.
 */
export function isRejected(element: Pick<FlowControlElement, "provenance">): boolean {
  return (element.provenance ?? []).some((entry) =>
    (entry.beliefs ?? []).some((held) => held.belief === "false"),
  );
}

/**
 * Whose beliefs decide which flow-control elements are read: the
 * `believer`'s state in each element (`believer`'s belief, the most
 * critical of several, `undecided` where the believer holds none) is read
 * when it is one of `beliefs`, as timetoalign's flow engine reads the
 * elements for a believer and the states it keeps.
 */
export interface FlowReading {
  readonly believer: string;
  /** The states read, each once, in the order of `BELIEF_STATES`. */
  readonly beliefs: readonly BeliefState[];
}

/** The states of a belief recorded that read an element: every belief but `false`. */
const READ_WHERE_RECORDED: readonly BeliefState[] = ["true", "unlikely"];

/**
 * The reading of the flow-control elements for the user `believer` under
 * the belief filter `kept` (the states a block's MatchClaim filter keeps):
 * where the user recorded a belief in an element, that belief decides, so
 * the element is read unless it is `false`; where they recorded none, the
 * filter decides as it does for a MatchClaim the user holds no belief in,
 * so the element is read when the filter keeps `undecided`.
 */
export function flowReading(believer: string, kept: readonly BeliefState[]): FlowReading {
  const read = (state: BeliefState) =>
    READ_WHERE_RECORDED.includes(state) || (state === "undecided" && kept.includes(state));
  return { believer, beliefs: BELIEF_STATES.filter(read) };
}

/** The beliefs from the most critical on: `false`, then `unlikely`, then `true`. */
const CRITICAL_FIRST: readonly Belief[] = ["false", "unlikely", "true"];

/**
 * The state of `believer` in a flow-control element: their belief, the
 * most critical where they hold several (two entries, or two actors that
 * stand for their IRI under `context`, the manifest's `@context`);
 * `undecided` where they hold none.
 */
export function beliefStateOf(
  element: Pick<FlowControlElement, "provenance">,
  believer: string,
  context: unknown,
): BeliefState {
  const wanted = actorIri(context, believer);
  const held = new Set(
    (element.provenance ?? []).flatMap((entry) =>
      (entry.beliefs ?? [])
        .filter((belief) => actorIri(context, belief.actor) === wanted)
        .map((belief) => belief.belief),
    ),
  );
  return CRITICAL_FIRST.find((belief) => held.has(belief)) ?? "undecided";
}

/**
 * Whether a flow played under `reading` reads the element: without a
 * reading, unless it is rejected (`isRejected`); with one, when the
 * believer's state in it (`beliefStateOf`) is one of the reading's states.
 */
export function isRead(
  element: Pick<FlowControlElement, "provenance">,
  reading: FlowReading | null,
  context: unknown,
): boolean {
  if (reading === null) return !isRejected(element);
  return reading.beliefs.includes(beliefStateOf(element, reading.believer, context));
}

/** An actor's belief to record: who, what, and the day (`YYYY-MM-DD`). */
export interface ElementBelief {
  readonly actor: string;
  readonly belief: Belief;
  readonly date: string;
}

/**
 * The `provenance` of a flow-control element with `actor`'s belief recorded:
 * every belief an entry holds of the actor (actors compared as the IRIs they
 * stand for under `context`, the manifest's `@context`) is replaced in
 * place, its note dropped with it; where no entry holds one, the belief is
 * appended to the first entry's; an element without provenance gains one
 * entry holding the belief alone. Every other entry and every other actor's
 * belief stays as it is.
 */
export function withElementBelief(
  provenance: FlowControlElement["provenance"],
  context: unknown,
  { actor, belief, date }: ElementBelief,
): ElementProvenance {
  const held: HeldBelief = { actor, belief, date };
  const [first, ...more] = provenance ?? [];
  if (first === undefined) return [{ beliefs: [held] }];
  const wanted = actorIri(context, actor);
  const mine = (earlier: HeldBelief) => actorIri(context, earlier.actor) === wanted;
  const holds = (entry: ElementProvenanceEntry) => (entry.beliefs ?? []).some(mine);
  const stated = [first, ...more].some(holds);
  const recorded = (entry: ElementProvenanceEntry, at: number): ElementProvenanceEntry => {
    if (stated ? !holds(entry) : at > 0) return entry;
    const earlier = entry.beliefs ?? [];
    const [one, ...others] = stated
      ? earlier.map((item) => (mine(item) ? held : item))
      : [...earlier, held];
    return one === undefined ? entry : { ...entry, beliefs: [one, ...others] };
  };
  return [recorded(first, 0), ...more.map((entry, index) => recorded(entry, index + 1))];
}

/** The symbols of the elements that are no jump, by role and manifestation (section 6.6, Symbols). */
const ELEMENT_SYMBOLS: Readonly<Partial<Record<string, Readonly<Record<string, string>>>>> = {
  jump_target: { repeat_start: "\u{1D106}", segno: "\u{1D10B}", coda: "\u{1D10C}" },
  break: { fine: "Fine" },
  barline: { double_barline: "\u{1D101}", final_barline: "\u{1D102}" },
};

/** The symbol of a jump's destination, by its manifestation (section 6.6, Symbols). */
const DESTINATION_SYMBOLS: Readonly<Record<string, string>> = {
  repeat_end: "\u{1D107}",
  dal_segno: "\u{1D109}",
  dal_segno_al_fine: "\u{1D109}",
  dal_segno_al_coda: "\u{1D109}",
  da_capo: "\u{1D10A}",
  da_capo_al_fine: "\u{1D10A}",
  da_capo_al_coda: "\u{1D10A}",
  to_coda: "\u{1D10C}",
};

/** The final barline a section break draws at the flow row, whatever its manifestation. */
const SECTION_BREAK_SYMBOL = "\u{1D102}";

/**
 * The symbols a flow-control element draws on the flow row (section 6.6,
 * Symbols): a jump one per destination whose manifestation has one, in the
 * order of its `targets`; a section break the final barline 𝄂; any other
 * element the symbol of its manifestation, or none where it has no
 * manifestation or one without a symbol.
 */
export function flowSymbols(element: FlowControlElement): readonly string[] {
  if (element.role === "section_break") return [SECTION_BREAK_SYMBOL];
  if (element.role === "jump") {
    return (element.targets ?? []).flatMap((destination) => {
      const symbol = destinationSymbol(destination);
      return symbol === undefined ? [] : [symbol];
    });
  }
  const word = element.manifestation;
  const symbols = ELEMENT_SYMBOLS[element.role];
  if (word === undefined || word === null || symbols === undefined) return [];
  const text = Object.hasOwn(symbols, word) ? symbols[word] : undefined;
  return text === undefined ? [] : [text];
}

/** The symbol of one destination of a jump, by its manifestation; undefined for none. */
function destinationSymbol(destination: JumpDestination): string | undefined {
  const word = destination.manifestation;
  if (word === undefined || word === null || !Object.hasOwn(DESTINATION_SYMBOLS, word)) {
    return undefined;
  }
  return DESTINATION_SYMBOLS[word];
}

/**
 * The text of a branch of a volta fork (section 6.4, Forks): its passes as
 * printed, each number followed by a full stop and the numbers joined by a
 * comma and a space (`1.`, `1., 3.`); `{from: n}` as `n.–`.
 */
export function passesText(passes: NonNullable<JumpDestination["passes"]>): string {
  if ("from" in passes) return `${String(passes.from)}.–`;
  return passes
    .map((pass) => String(pass))
    .sort((left, right) => Number(left) - Number(right))
    .map((pass) => `${pass}.`)
    .join(", ");
}

/**
 * What the place of a destination of a jump names, on the own axis of the
 * timeline listing the jump, with `at` the coordinate it reaches there:
 * `by`, that distance from the jump's coordinate; `to`, the jump target
 * (rejected or not: a rejected target is still what the destination names),
 * the region (its start), the timeline itself (0) or the child timeline (its
 * offset) with that ID; neither, the start of the jump's section
 * (`sectionStart`): the nearest section break before the jump that the
 * reading in force reads (`isRead`), among those of the root's whole tree, never before the start of the
 * timeline listing the jump (`start`, held by `holder`), else that start, 0,
 * with `start` and `holder` null. `nowhere` for a `to` naming none of these,
 * which a valid manifest never holds.
 */
export type DestinationPlace =
  | { readonly kind: "by"; readonly at: Coordinate }
  | { readonly kind: "jump_target"; readonly element: FlowControlElement; readonly at: Coordinate }
  | { readonly kind: "region"; readonly region: Region; readonly at: Coordinate }
  | { readonly kind: "timeline"; readonly timeline: TimelineManifest; readonly at: Coordinate }
  | { readonly kind: "child"; readonly child: ChildTimeline; readonly at: Coordinate }
  | {
      readonly kind: "section";
      readonly start: FlowControlElement | null;
      readonly holder: TimelineManifest | null;
      readonly at: Coordinate;
    }
  | { readonly kind: "nowhere"; readonly to: string };

/** 0 on the own axis of `timeline`, in its number type. */
function originOf(timeline: TimelineManifest): Coordinate {
  const { unit, number_type: numberType } = timeline;
  const value = numberType === "int" ? 0n : numberType === "float" ? 0 : Rational.of(0n);
  return { unit, numberType, value };
}

/**
 * The start of the section of the jump `jump`, listed by `timeline` of
 * `manifest` (TimeToShare's README, "Destinations"): the timeline played is
 * the root of `timelines` whose tree holds `timeline`, and on its axis, with
 * `S` the start of `timeline` and `J` the jump's position, each its
 * coordinate plus the offsets of its ancestors summed exactly (a float as
 * its exact binary value), the nearest section break `p` with `S ≤ p < J`
 * that is not rejected, of that root or of any of its descendants, the
 * first in the tree's order (each timeline's elements in the order of its
 * `flow_control` before its children's, in `children` order) where two lie
 * at one position; else `S`, which counts as a section boundary for it.
 * "Not rejected" is the reading `reading` under `context`, the manifest's
 * `@context` (`isRead`; `null`, no actor believes it `false`). The
 * coordinate it reaches is `p − S` on the own axis of `timeline`, written in
 * its number type, 0 for `S`.
 */
function sectionStart(
  manifest: Roots,
  timeline: TimelineManifest,
  jump: FlowControlElement,
  reading: FlowReading | null,
  context: unknown,
): DestinationPlace {
  const exact = (raw: unknown, on: TimelineManifest) => toRational(axisCoordinate(raw, on).value);
  // The root above `timeline` and the start of `timeline` on the root's axis.
  let located = locateTimeline(manifest, timeline.id);
  let start = Rational.of(0n);
  let root = timeline;
  while (located?.parent !== undefined) {
    const child = located.parent.timeline.children.find((item) => item.id === located?.timeline.id);
    if (child === undefined) break;
    start = start.add(exact(child.offset, located.parent.timeline));
    root = located.parent.timeline;
    located = located.parent;
  }
  const end = start.add(exact(jump.coordinate, timeline));
  let found: { start: FlowControlElement; holder: TimelineManifest; at: Rational } | null = null;
  // The tree in pre-order, each timeline with its start on the root's axis.
  const pending: [TimelineManifest, Rational][] = [[root, Rational.of(0n)]];
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    const [each, from] = next;
    for (const item of each.flow_control) {
      if (item.role !== "section_break" || !isRead(item, reading, context)) continue;
      const at = from.add(exact(item.coordinate, each));
      if (at.compare(start) < 0 || at.compare(end) >= 0) continue;
      if (found === null || at.compare(found.at) > 0) found = { start: item, holder: each, at };
    }
    for (const child of each.children.toReversed()) {
      pending.push([child, from.add(exact(child.offset, each))]);
    }
  }
  if (found === null) return { kind: "section", start: null, holder: null, at: originOf(timeline) };
  const value = expressAs(found.at.subtract(start), timeline.number_type);
  if (value === undefined) throw new Error("an exact value is never an infinite float");
  return {
    kind: "section",
    start: found.start,
    holder: found.holder,
    at: { unit: timeline.unit, numberType: timeline.number_type, value },
  };
}

/**
 * The place the destination `destination` of the jump `jump`, listed by
 * `timeline` of `manifest`, names (`DestinationPlace`), a destination
 * without a place landing at a section break that `reading` reads under
 * `context`, the manifest's `@context` (`isRead`; without a reading, one
 * no actor believes `false`).
 */
export function destinationPlace(
  manifest: Roots,
  timeline: TimelineManifest,
  jump: FlowControlElement,
  destination: JumpDestination,
  reading: FlowReading | null = null,
  context: unknown = undefined,
): DestinationPlace {
  const from = axisCoordinate(jump.coordinate, timeline);
  if (destination.by !== undefined) {
    return { kind: "by", at: addCoordinates(from, axisCoordinate(destination.by, timeline)) };
  }
  const { to } = destination;
  if (to === undefined) return sectionStart(manifest, timeline, jump, reading, context);
  if (to === timeline.id) return { kind: "timeline", timeline, at: originOf(timeline) };
  const element = timeline.flow_control.find(
    (item) => item.role === "jump_target" && item.id === to,
  );
  if (element !== undefined) {
    return { kind: "jump_target", element, at: axisCoordinate(element.coordinate, timeline) };
  }
  const region = timeline.regions.find((item) => item.id === to);
  if (region !== undefined) {
    return { kind: "region", region, at: axisCoordinate(region.start, timeline) };
  }
  const child = timeline.children.find((item) => item.id === to);
  if (child !== undefined) {
    return { kind: "child", child, at: axisCoordinate(child.offset, timeline) };
  }
  return { kind: "nowhere", to };
}
