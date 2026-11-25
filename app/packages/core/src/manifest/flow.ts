/**
 * Flow control as a manifest holds it, beyond its lists: which roles the
 * drawing draws as lines, the symbol each manifestation draws and the
 * passes a volta bracket prints, whether an element is rejected, and the
 * belief an actor records in one. A flow-control element is never removed or changed
 * in place: a repair rejects it (a belief `false` in its `provenance`) and
 * adds another.
 */

import type { Belief } from "@timetoalign/timetoshare";
import { actorIri } from "../matches/beliefs.ts";
import type { FlowControlElement, FlowRole, JumpDestination } from "./types.ts";

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
 * The text of a volta bracket (section 6.6, Volta brackets): its passes as
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
