/**
 * Switched cards (`docs/drawing.md` in TimeToShare, section 8.10): which
 * card of a manifest's drawing is switched to a FlowMap by the `flow` its
 * own rules give it, and how a card is unfolded onto that FlowMap's
 * virtual axis, every position of its root's axis drawn once in every
 * stretch piece holding it and every extent once in every piece it reaches
 * into; a frame's other members carried there through the group. The one
 * source of these rules: layout draws by them, core lists the elements a
 * rule may select by them, the arranger reads the switch from them.
 */

import { Rational } from "../number/rational.ts";
import type { Real } from "../number/real.ts";
import { addReal, compareReal, realOf, subtractReal, toFloat } from "../number/real.ts";
import type { ElementAddress } from "./address.ts";
import { FlowMapError, resolveFlowMap } from "./flowmaps.ts";
import type { Manifest } from "./types.ts";

/**
 * Whether a rule's `select` names `addresses` alone, each the address
 * `{id: T, part: ["card"]}` of the cards of a timeline: the one selector a
 * rule setting `flow` may have (section 2.4).
 */
function selectsCards(select: { readonly addresses?: readonly ElementAddress[] }): boolean {
  const { addresses } = select;
  if (addresses === undefined || Object.keys(select).length !== 1) return false;
  return addresses.every(
    (address) =>
      Object.keys(address).length === 2 &&
      address.id !== undefined &&
      address.part?.length === 1 &&
      address.part[0] === "card",
  );
}

/**
 * The `flow` the cards of the timeline `timeline` cascade to (section 2.4):
 * the value of the last rule of the manifest's own `graphical` layer, the
 * one layer `flow` is read from, that selects `{id: timeline, part:
 * ["card"]}` by `addresses` alone and sets `flow` (directly or through a
 * named style of the layer); null, "As written", where none does.
 */
export function cardFlow(manifest: Manifest, timeline: string): string | null {
  const layer = manifest.graphical;
  let flow: string | null = null;
  for (const rule of layer?.rules ?? []) {
    const set =
      typeof rule.set === "string"
        ? layer?.styles !== undefined && Object.hasOwn(layer.styles, rule.set)
          ? layer.styles[rule.set]
          : undefined
        : rule.set;
    if (set?.flow === undefined || !selectsCards(rule.select)) continue;
    if (rule.select.addresses?.some((address) => address.id === timeline)) flow = set.flow;
  }
  return flow;
}

/** What a switched card is switched to: the FlowMap it unfolds and what `flow` names. */
export interface Switch {
  /** The FlowMap's ID. */
  readonly flowMap: string;
  /** The ID `flow` names: the FlowMap's, or a virtual timeline's applying it. */
  readonly named: string;
  /** The name of what `flow` names (section 5.3): its `name`, else its whole ID. */
  readonly name: string;
}

/**
 * What the card of the timeline `timeline` is switched to (section 8.10):
 * its cascaded `flow` (`cardFlow`) naming a FlowMap of `timeline` that
 * resolves, or a virtual timeline applying one to `timeline` without
 * `through`; null, drawn as written, otherwise.
 */
export function switchOf(manifest: Manifest, timeline: string): Switch | null {
  const flow = cardFlow(manifest, timeline);
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
 * How a card is unfolded onto a FlowMap's virtual axis: the FlowMap's
 * stretch pieces in their order, its played length `Λ`, and how a position
 * on the card's root's axis is carried to `T`'s axis and back (the identity
 * on `T`'s own card).
 */
export interface Unfolding {
  readonly pieces: readonly Piece[];
  readonly length: Real;
  carry(value: Real): Real;
  uncarry(value: Real): Real;
}

/**
 * A span `[s, e]` of a card's root's axis drawn in one piece: its played
 * ends, and whether each was cut at the piece's end (the drawing then keeps
 * no mark there).
 */
export interface PlayedSpan {
  readonly start: Real;
  readonly end: Real;
  readonly startCut: boolean;
  readonly endCut: boolean;
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
 * The unfolding of the card of `T` onto its FlowMap `flowMap`, which
 * resolves, or, where `carriedFrom` gives `T`'s and a member `M`'s lengths
 * (or reaches), of `M`'s card in `T`'s switched frame, carried through the
 * group (section 8.10): `t = (m × λT) / λM`.
 */
export function unfoldingOf(
  manifest: Manifest,
  flowMap: string,
  carriedFrom?: { readonly lambdaT: Real; readonly lambdaM: Real },
): Unfolding {
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
  const length = realOf(resolved.length);
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
 * The played position of the position `value` of the card's root's axis
 * in `piece` (section 8.10): `t`, its carry to `T`'s axis, lies in the
 * piece where `a ≤ t < b`, or `t = b` in a closed piece, and is played at
 * `P + (t − a)`; undefined where it lies elsewhere.
 */
export function playedAt(unfolding: Unfolding, piece: Piece, value: Real): Real | undefined {
  const t = unfolding.carry(value);
  const before = compareReal(t, piece.a) < 0;
  const end = compareReal(t, piece.b);
  if (before || end > 0 || (end === 0 && !piece.closed)) return undefined;
  return addReal(piece.P, subtractReal(t, piece.a));
}

/**
 * The span `[s, e]` of the card's root's axis drawn in `piece` (section
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
    start: addReal(piece.P, subtractReal(low, piece.a)),
    end: addReal(piece.P, subtractReal(high, piece.a)),
    startCut,
    endCut,
  };
}

/** How many pieces of `unfolding` draw the position `value` (`playedAt`). */
export function piecesHolding(unfolding: Unfolding, value: Real): number {
  return unfolding.pieces.filter((piece) => playedAt(unfolding, piece, value) !== undefined).length;
}

/** How many pieces of `unfolding` the extent `[start, end]` reaches into (`playedSpan`). */
export function piecesReached(unfolding: Unfolding, start: Real, end: Real): number {
  return unfolding.pieces.filter((piece) => playedSpan(unfolding, piece, start, end) !== undefined)
    .length;
}
