/**
 * Switched cards (`docs/drawing.md` in TimeToShare, section 8.10): which
 * card of a manifest's drawing is switched to a FlowMap by the `flow` its
 * own rules give it, and how often an element of a switched or carried
 * card is drawn, once in every stretch piece of the FlowMap that reaches
 * it. What the drawing lays out of them is layout's; core reads the
 * manifest only, as the elements a rule may select are listed from it.
 */

import { Rational } from "../number/rational.ts";
import type { Real } from "../number/real.ts";
import { compareReal, realOf, toFloat } from "../number/real.ts";
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

/**
 * The FlowMap the card of the timeline `timeline` is switched to (section
 * 8.10): its cascaded `flow` (`cardFlow`) naming a FlowMap of `timeline`
 * that resolves, or a virtual timeline applying one to `timeline` without
 * `through`; null, drawn as written, otherwise.
 */
export function switchedFlowMap(manifest: Manifest, timeline: string): string | null {
  const flow = cardFlow(manifest, timeline);
  if (flow === null) return null;
  const maps = manifest.flow_maps ?? [];
  const direct = maps.find((item) => item.id === flow);
  const virtual = (manifest.virtual_timelines ?? []).find((item) => item.id === flow);
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
  return flowMap.id;
}

/**
 * One stretch piece of a FlowMap (section 8.10, Resolution): the stretch
 * `[a, b]` of its root's axis it plays, and whether `t = b` lies in it, as
 * it does where it is the last piece or a gap or a stretch not starting at
 * `b` follows it.
 */
interface Piece {
  readonly a: Real;
  readonly b: Real;
  readonly closed: boolean;
}

/** The stretch pieces of the FlowMap `flowMap` of `manifest`, which resolves, in their order. */
function piecesOf(manifest: Manifest, flowMap: string): readonly Piece[] {
  const { stretches } = resolveFlowMap(manifest, flowMap);
  return stretches.flatMap((stretch, index): Piece[] => {
    const { written } = stretch;
    if (written === null) return [];
    const b = realOf(written.end);
    const next = stretches[index + 1]?.written;
    const closed = next === undefined || next === null || compareReal(realOf(next.start), b) !== 0;
    return [{ a: realOf(written.start), b, closed }];
  });
}

/**
 * How often a card unfolded onto a FlowMap's virtual axis draws what lies on
 * its root's axis (section 8.10): a position once in every piece holding
 * it, an extent once in every piece it reaches into.
 */
export interface Unfold {
  /** The pieces holding the position `t`, carried to the FlowMap's root: `a ≤ t < b`, or `t = b` closed. */
  point(value: Real): number;
  /** The pieces the extent `[s, e]`, carried, reaches into: `max(s, a) < min(e, b)`. */
  span(start: Real, end: Real): number;
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
 * The unfolding onto the FlowMap `flowMap` of the card of its root `T`, or,
 * where `carriedFrom` gives `T`'s and the member's lengths (or reaches),
 * of another member of `T`'s switched frame, carried through the group:
 * `t = (m × λT) / λM`.
 */
export function unfoldOf(
  manifest: Manifest,
  flowMap: string,
  carriedFrom?: { readonly lambdaT: Real; readonly lambdaM: Real },
): Unfold {
  const pieces = piecesOf(manifest, flowMap);
  const carry = (value: Real) =>
    carriedFrom === undefined ? value : carried(value, carriedFrom.lambdaT, carriedFrom.lambdaM);
  return {
    point: (value) => {
      const t = carry(value);
      return pieces.filter((piece) => {
        const end = compareReal(t, piece.b);
        return compareReal(t, piece.a) >= 0 && (end < 0 || (end === 0 && piece.closed));
      }).length;
    },
    span: (start, end) => {
      const [s, e] = [carry(start), carry(end)];
      return pieces.filter((piece) => {
        const low = compareReal(s, piece.a) < 0 ? piece.a : s;
        const high = compareReal(e, piece.b) > 0 ? piece.b : e;
        return compareReal(low, high) < 0;
      }).length;
    },
  };
}
