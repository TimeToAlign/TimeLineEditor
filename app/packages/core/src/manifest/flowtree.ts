/**
 * Flow control over a root's whole tree (`docs/drawing.md` in TimeToShare,
 * sections 6.4 and 6.6): an element holds for its own timeline and every
 * descendant, so a root's flow control band draws the elements of its whole
 * tree at their positions on the root's axis, and the card of a member that
 * is a child timeline draws those of its root's tree lying on its stretch.
 * Also what a flow-control element draws besides its line or arcs: its
 * symbols, by manifestation, and the pass numbers of a volta bracket.
 */

import { Rational } from "../number/rational.ts";
import { axisCoordinate } from "../number/coordinate.ts";
import { addReal, compareReal, type Real, realOf } from "../number/real.ts";
import { orderedChildren, reachOf } from "./elements.ts";
import type { MemberDrawing } from "./files.ts";
import type { FlowControlElement, JumpDestination, Manifest, TimelineManifest } from "./types.ts";

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
  const symbol = word === undefined || word === null ? undefined : ELEMENT_SYMBOLS[element.role];
  const text = symbol === undefined || word === undefined || word === null ? undefined : symbol[word];
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

/** A flow-control element of a tree with the timeline stating it and its position on an axis. */
export interface PlacedFlow {
  readonly element: FlowControlElement;
  readonly timeline: TimelineManifest;
  /** Where the timeline starts on the axis. */
  readonly start: Real;
  /** Where the element lies on the axis: the timeline's start plus its coordinate. */
  readonly at: Real;
}

/**
 * The flow-control elements the card of a member that is a child timeline
 * draws (section 6.4, Flow control): those of every timeline of its root's
 * tree, the member's own and its descendants' included, each at its
 * position on the member's axis (offset arithmetic from the root down),
 * kept where that position lies on `[0, λ]`, `λ` the member's length or,
 * where that is not known, its reach (section 3.4); in the root's traversal
 * order (section 6.1, children by offset, then ID), each timeline's in the
 * order of its `flow_control`. None for a root, whose card draws its own
 * tree's.
 */
export function memberFlow(manifest: Manifest, member: MemberDrawing): readonly PlacedFlow[] {
  const [top] = member.ancestors;
  if (top === undefined) return [];
  const own = member.timeline;
  // The member's start on the root's axis, summed from the root down.
  let memberStart: Real = zeroOf(top.timeline);
  for (const { timeline, offset } of member.ancestors) {
    memberStart = addReal(memberStart, axisValue(offset, timeline));
  }
  const lambda = own.length === null ? reachOf(own, manifest) : axisValue(own.length, own);
  const back = negate(memberStart);
  const placed: PlacedFlow[] = [];
  const visit = (timeline: TimelineManifest, start: Real) => {
    const relative = addReal(start, back);
    for (const element of timeline.flow_control) {
      const at = addReal(relative, axisValue(element.coordinate, timeline));
      if (compareReal(at, zeroOf(own)) >= 0 && compareReal(at, lambda) <= 0) {
        placed.push({ element, timeline, start: relative, at });
      }
    }
    for (const child of orderedChildren(timeline)) {
      visit(child, addReal(start, axisValue(child.offset, timeline)));
    }
  };
  visit(top.timeline, zeroOf(top.timeline));
  return placed;
}

/** A bare value on the own axis of `timeline`, read as its number type selects. */
const axisValue = (raw: unknown, timeline: TimelineManifest): Real =>
  realOf(axisCoordinate(raw, timeline));

/** Zero in a timeline's number type: an exact 0, or the float 0. */
const zeroOf = (timeline: TimelineManifest): Real =>
  timeline.number_type === "float" ? 0 : Rational.of(0n);

/** `−value`: exact for an exact value, a float's negation for a float. */
const negate = (value: Real): Real =>
  typeof value === "number" ? -value : Rational.of(0n).subtract(value);
