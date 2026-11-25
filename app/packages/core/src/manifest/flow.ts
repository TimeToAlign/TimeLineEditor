/**
 * Flow control as a manifest holds it, beyond its lists: which roles the
 * drawing draws as lines, whether an element is rejected, and the belief an
 * actor records in one. A flow-control element is never removed or changed
 * in place: a repair rejects it (a belief `false` in its `provenance`) and
 * adds another.
 */

import type { Belief } from "@timetoalign/timetoshare";
import { actorIri } from "../matches/beliefs.ts";
import type { FlowControlElement, FlowRole } from "./types.ts";

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
