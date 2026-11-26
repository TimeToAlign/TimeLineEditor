/**
 * Switched cards and switched frames (`docs/drawing.md` in TimeToShare,
 * section 8.10): a card whose cascaded `flow` names a FlowMap of its
 * timeline `T` that resolves, or a virtual timeline applying one, is laid
 * out on the FlowMap's virtual axis, every element of `T`'s tree drawn at
 * each of its played positions; a frame with exactly one such card carries
 * every member through the group onto that axis.
 */

import {
  FlowMapError,
  type Manifest,
  resolveFlowMap,
  type TimelineManifest,
} from "@timetoalign/tilie-core";
import { compareReal, Rational, type Real, realOf, toFloat } from "@timetoalign/tilie-core/numbers";
import { add, negate } from "./numbers.ts";

/**
 * One stretch piece of a FlowMap's resolution (section 8.10, Resolution):
 * the stretch `[a, b]` of its root `T`'s axis it plays, from `P` on the
 * virtual axis, and whether `t = b` lies in it, as it does where it is the
 * last piece or a gap or a stretch not starting at `b` follows it.
 */
export interface Piece {
  readonly a: Real;
  readonly b: Real;
  readonly P: Real;
  readonly closed: boolean;
}

/**
 * How a member drawing is unfolded onto a FlowMap's virtual axis: the
 * FlowMap's stretch pieces in their order, its played length `Λ`, and how a
 * position on the member's root's axis is carried to `T`'s axis and back
 * (the identity on `T`'s own card).
 */
export interface Unfolding {
  readonly pieces: readonly Piece[];
  readonly length: Real;
  carry(value: Real): Real;
  uncarry(value: Real): Real;
}

/**
 * A span `[s, e]` of a member's root's axis drawn in one piece: its played
 * ends, and whether each was cut at the piece's end (the drawing then keeps
 * no mark there).
 */
export interface PlayedSpan {
  readonly start: Real;
  readonly end: Real;
  readonly startCut: boolean;
  readonly endCut: boolean;
}

/** What a switched card is switched to: the FlowMap it unfolds and the name its card adds. */
export interface Switch {
  /** The FlowMap's ID. */
  readonly flowMap: string;
  /** The ID `flow` names: the FlowMap's, or a virtual timeline's applying it. */
  readonly named: string;
  /** The name of what `flow` names (section 5.3): its `name`, else its whole ID. */
  readonly name: string;
}

/** `x − y` in the tower. */
const minus = (left: Real, right: Real): Real => add(left, negate(right));

/**
 * What the card of the timeline `timeline` is switched to where its cascaded
 * `flow` is `flow` (section 8.10): a FlowMap of `timeline` that resolves, or
 * a virtual timeline applying one to `timeline` without `through`; null,
 * drawn as written, otherwise.
 */
export function switchOf(manifest: Manifest, timeline: string, flow: string | null): Switch | null {
  if (flow === null) return null;
  const maps = manifest.flow_maps ?? [];
  const direct = maps.find((item) => item.id === flow);
  const virtual = (manifest.virtual_timelines ?? []).find((item) => item.id === flow);
  const named = direct ?? virtual;
  if (named === undefined) return null;
  const flowMap =
    direct ??
    (virtual === undefined || virtual.through !== undefined || virtual.timeline !== timeline
      ? undefined
      : maps.find((item) => item.id === virtual.map));
  if (flowMap === undefined || flowMap.timeline !== timeline) return null;
  try {
    resolveFlowMap(manifest, flowMap.id);
  } catch (error) {
    if (error instanceof FlowMapError) return null;
    throw error;
  }
  return { flowMap: flowMap.id, named: flow, name: named.name ?? named.id };
}

/**
 * The stretch pieces of the FlowMap `flowMap` of `manifest`, which resolves,
 * and its played length (section 8.10, Resolution).
 */
function piecesOf(
  manifest: Manifest,
  flowMap: string,
): { readonly pieces: Piece[]; readonly length: Real } {
  const resolved = resolveFlowMap(manifest, flowMap);
  const { stretches } = resolved;
  const pieces = stretches.flatMap((stretch, index): Piece[] => {
    const { written } = stretch;
    if (written === null) return [];
    const b = realOf(written.end);
    const next = stretches[index + 1]?.written;
    const closed = next === undefined || next === null || compareReal(realOf(next.start), b) !== 0;
    return [{ a: realOf(written.start), b, P: realOf(stretch.played.start), closed }];
  });
  return { pieces, length: realOf(resolved.length) };
}

/** A float operand of a carry: an exact value's nearest double. */
const double = (value: Real): number => (value instanceof Rational ? toFloat(value) : value);

/**
 * `m × λT / λM` (section 8.10, Switched frames): exact where all three are
 * exact, else in binary64, each exact operand its nearest double, the
 * product formed first.
 */
function carried(value: Real, to: Real, from: Real): Real {
  if (value instanceof Rational && to instanceof Rational && from instanceof Rational) {
    return value.multiply(to).divide(from);
  }
  return (double(value) * double(to)) / double(from);
}

/**
 * The unfolding of the card of `T`, switched to the FlowMap `flowMap`, or,
 * where `member` and its length or reach `lambdaM` are given, of a member
 * `M` of `T`'s switched frame, carried through the group (section 8.10):
 * `t = (m × λT) / λM`, `λT` the length or reach `lambdaT` of `T`.
 */
export function unfoldingOf(
  manifest: Manifest,
  flowMap: string,
  carriedFrom?: { readonly lambdaT: Real; readonly lambdaM: Real },
): Unfolding {
  const { pieces, length } = piecesOf(manifest, flowMap);
  if (carriedFrom === undefined) {
    return { pieces, length, carry: (value) => value, uncarry: (value) => value };
  }
  const { lambdaT, lambdaM } = carriedFrom;
  return {
    pieces,
    length,
    carry: (value) => carried(value, lambdaT, lambdaM),
    uncarry: (value) => carried(value, lambdaM, lambdaT),
  };
}

/**
 * The played position of the position `value` of the member's root's axis
 * in `piece` (section 8.10): `t`, its carry to `T`'s axis, lies in the
 * piece where `a ≤ t < b`, or `t = b` in a closed piece, and is played at
 * `P + (t − a)`; undefined where it lies elsewhere.
 */
export function playedAt(unfolding: Unfolding, piece: Piece, value: Real): Real | undefined {
  const t = unfolding.carry(value);
  const before = compareReal(t, piece.a) < 0;
  const end = compareReal(t, piece.b);
  if (before || end > 0 || (end === 0 && !piece.closed)) return undefined;
  return add(piece.P, minus(t, piece.a));
}

/**
 * The span `[s, e]` of the member's root's axis drawn in `piece` (section
 * 8.10): where `max(s, a) < min(e, b)` on `T`'s axis, over the played
 * positions of those two ends, each cut where it is the piece's and not the
 * span's own; undefined where the span does not reach into the piece.
 */
export function playedSpan(
  unfolding: Unfolding,
  piece: Piece,
  start: Real,
  end: Real,
): PlayedSpan | undefined {
  const s = unfolding.carry(start);
  const e = unfolding.carry(end);
  const startCut = compareReal(s, piece.a) < 0;
  const endCut = compareReal(e, piece.b) > 0;
  const low = startCut ? piece.a : s;
  const high = endCut ? piece.b : e;
  if (compareReal(low, high) >= 0) return undefined;
  return {
    start: add(piece.P, minus(low, piece.a)),
    end: add(piece.P, minus(high, piece.a)),
    startCut,
    endCut,
  };
}

/**
 * The timeline a switched card draws as its root (section 8.10): `T` holding
 * nothing, since every element of its tree is drawn in the pieces, named
 * `name` where it is given (`T`'s own card: `T`'s name, ` · ` and what
 * `flow` names), locked, so that the line of the card switched to the
 * FlowMap ends in an end circle.
 */
export function unfoldedRoot(timeline: TimelineManifest, name: string | null): TimelineManifest {
  return {
    ...timeline,
    ...(name === null ? {} : { name, locked: true }),
    is_segment_line: false,
    children: [],
    conversion_maps: [],
    regions: [],
    flow_control: [],
  };
}
