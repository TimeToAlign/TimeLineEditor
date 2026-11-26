/**
 * The one map between the abscissas of a card or a frame on the canvas and
 * the coordinates of the timelines it draws (`docs/drawing.md` in
 * TimeToShare, sections 3.2 and 8.9): layout records, per container that
 * may draw gaps, its run list (`ElisionExposure.runs`), each run the
 * proportions `u0` to `u1` of the container's axis drawn at
 * `x = place.x + place.scale × (x0 + L × u − D)` with its own scale `L` and
 * shrink `D`; a position of a timeline is the proportion `(zero + value) /
 * λ` of the axis it lies on: the root's in a card, its member's in a frame,
 * `λ` that timeline's length, or its reach where its length is not known.
 *
 * Floats: an abscissa places a pointer or a handle, never a stored value.
 * Each run has its own scale, so a handle moving a gap's edge reads the run
 * beside that edge (`edgeScale`), never one scale of the card.
 */

import type { Manifest, PlaceKey } from "@timetoalign/tilie-core";
import { ancestorMembers, findTimeline, placeKeyText, samePlaceKey } from "@timetoalign/tilie-core";
import { virtualDrawing } from "@timetoalign/tilie-core/drawing";
import {
  axisCoordinate,
  Rational,
  type Real,
  realOf,
  toFloat,
  toRational,
} from "@timetoalign/tilie-core/numbers";
import type { Drawing, ElisionExposure, ExposedGap, Run } from "@timetoalign/tilie-layout";
import { lineAxes } from "@timetoalign/tilie-layout";

/** An edge of a gap: the start of its elided coordinates (its left edge) or their end (its right one). */
export type GapEdge = "start" | "end";

/**
 * Where a timeline lies on a container's axis: the timeline whose
 * proportions the axis reads (the card's root, or the frame's member
 * holding it), the timeline's zero on that timeline's own axis, exact, and
 * that timeline's length or reach `λ`.
 */
export interface AxisBase {
  readonly base: string;
  readonly zero: Rational;
  readonly lambda: Real;
}

/** The map of one container's axis (`cardAxisOf`). */
export interface CardAxis {
  /** What layout records of the container: its kind, key, mode, gaps and runs. */
  readonly exposure: ElisionExposure;
  /** Where `timeline` lies on this axis; `null` for a timeline the container does not draw. */
  baseOf(timeline: string): AxisBase | null;
  /** The proportion of the axis at `value` of `timeline`'s own axis; `null` where it is not on it. */
  proportionOf(timeline: string, value: Real): number | null;
  /** The run drawing the proportion `u`, its ends included (the first where two meet); `null` inside a gap. */
  runAt(u: number): Run | null;
  /** The abscissa, in block coordinates, of the proportion `u`; `null` inside a gap. */
  abscissaAt(u: number): number | null;
  /** The proportion drawn at the abscissa `x` (block coordinates); `null` inside a gap or beyond the axis. */
  proportionAt(x: number): number | null;
  /** The abscissa of `value` of `timeline`; `null` inside a gap or off the axis. */
  abscissaOf(timeline: string, value: Real): number | null;
  /** The value of `timeline`'s own axis drawn at the abscissa `x`, as a float; `null` where none is. */
  valueAt(timeline: string, x: number): number | null;
  /** Block units per unit of `timeline`'s axis at full scale on `run`; `null` off the axis or for `λ` 0. */
  unitScale(run: Run, timeline: string): number | null;
  /** The run beside a gap's edge: the run ending at its start, or the run starting at its end. */
  runBeside(gap: ExposedGap, edge: GapEdge): Run | null;
  /** Block units per unit of the gap's timeline on the run beside its edge `edge` (`unitScale`). */
  edgeScale(gap: ExposedGap, edge: GapEdge): number | null;
}

const ZERO = Rational.fromParts(0n, 1n);

/** A coordinate value as a float, for the canvas. */
const float = (value: Real): number => toFloat(toRational(value));

/** Where the zero of the timeline `id` of `manifest` lies on its root's axis, exact: the sum of the offsets down to it. */
export function zeroOf(manifest: Manifest, id: string): Rational {
  const root = ancestorMembers(manifest, id).at(-1);
  return root === undefined ? ZERO : ZERO.subtract(toRational(root.offset));
}

/**
 * The zero of `timeline` on the axis of its ancestor `base` (itself
 * included: 0), exact; `null` where `base` is not one of its ancestors.
 */
function zeroOn(manifest: Manifest, timeline: string, base: string): Rational | null {
  if (timeline === base) return ZERO;
  const found = ancestorMembers(manifest, timeline).find((member) => member.timeline === base);
  return found === undefined ? null : ZERO.subtract(toRational(found.offset));
}

/**
 * The length of `base` (a virtual timeline's that of the axis it is drawn
 * on, section 8.10), or where it is not known the coordinate its line
 * reaches in the card `card` of `drawing` (the start plus the drawn length
 * of its last run, section 3.2); `null` where it has no length and no line.
 */
function lambdaOf(manifest: Manifest, drawing: Drawing, base: string, card: PlaceKey): Real | null {
  const timeline = findTimeline(manifest, base) ?? virtualDrawing(manifest, base)?.timeline;
  if (timeline === undefined) return null;
  if (timeline.length !== null) return realOf(axisCoordinate(timeline.length, timeline));
  let last: { readonly x: number; readonly end: Rational } | null = null;
  for (const axis of lineAxes(drawing).values()) {
    if (axis.timeline !== base || !samePlaceKey(axis.card, card)) continue;
    if (last === null || axis.xEnd > last.x) {
      last = { x: axis.xEnd, end: toRational(axis.start).add(toRational(axis.drawnLength)) };
    }
  }
  return last?.end ?? null;
}

/**
 * The bases of a container: for a card its root (`{item: R}` an ungrouped
 * root's card, `{item: G, member: R}` an ancestor card), for a frame each
 * member of its group, with the card that draws its line.
 */
function basesOf(
  manifest: Manifest,
  exposure: ElisionExposure,
): readonly { readonly base: string; readonly card: PlaceKey }[] {
  const { key, kind } = exposure;
  if (kind === "card") return [{ base: key.item, card: key }];
  if (kind === "ancestor_card") {
    return key.member === undefined ? [] : [{ base: key.member, card: key }];
  }
  const group = manifest.groups?.find(({ id }) => id === key.item);
  return (group?.members ?? []).map((member) => ({
    base: member,
    card: { item: key.item, member },
  }));
}

const axesByDrawing = new WeakMap<Drawing, Map<ElisionExposure, CardAxis>>();

/**
 * The map of the axis of the container `exposure` records in `drawing` of
 * `manifest`, once per drawing and container.
 */
export function cardAxisOf(
  manifest: Manifest,
  drawing: Drawing,
  exposure: ElisionExposure,
): CardAxis {
  let known = axesByDrawing.get(drawing);
  if (known === undefined) {
    known = new Map();
    axesByDrawing.set(drawing, known);
  }
  let found = known.get(exposure);
  if (found === undefined) {
    found = makeAxis(manifest, drawing, exposure);
    known.set(exposure, found);
  }
  return found;
}

/** The container `drawing` records under the place key `key`; `undefined` where none draws gaps there. */
export function exposureAt(drawing: Drawing, key: PlaceKey): ElisionExposure | undefined {
  const text = placeKeyText(key);
  return drawing.elisions.find((exposure) => placeKeyText(exposure.key) === text);
}

/** The map of the axis of the container under `key` in `drawing`; `null` where none is recorded. */
export function cardAxisAt(manifest: Manifest, drawing: Drawing, key: PlaceKey): CardAxis | null {
  const exposure = exposureAt(drawing, key);
  return exposure === undefined ? null : cardAxisOf(manifest, drawing, exposure);
}

function makeAxis(manifest: Manifest, drawing: Drawing, exposure: ElisionExposure): CardAxis {
  const { runs, x0, place } = exposure;
  const bases = basesOf(manifest, exposure);
  const lambdas = new Map<string, Real | null>();
  const lambdaFor = (base: string, card: PlaceKey): Real | null => {
    if (!lambdas.has(base)) lambdas.set(base, lambdaOf(manifest, drawing, base, card));
    return lambdas.get(base) ?? null;
  };
  const based = new Map<string, AxisBase | null>();
  const baseOf = (timeline: string): AxisBase | null => {
    if (based.has(timeline)) return based.get(timeline) ?? null;
    let found: AxisBase | null = null;
    for (const { base, card } of bases) {
      const zero = zeroOn(manifest, timeline, base);
      const lambda = zero === null ? null : lambdaFor(base, card);
      if (zero !== null && lambda !== null) {
        found = { base, zero, lambda };
        break;
      }
    }
    based.set(timeline, found);
    return found;
  };
  const xOf = (run: Run, u: number) => place.x + place.scale * (x0 + (run.L * u - run.D));
  const runAt = (u: number): Run | null => runs.find((run) => run.u0 <= u && u <= run.u1) ?? null;
  const proportionOf = (timeline: string, value: Real): number | null => {
    const base = baseOf(timeline);
    if (base === null) return null;
    const lambda = float(base.lambda);
    return lambda === 0 ? 0 : (float(base.zero) + float(value)) / lambda;
  };
  const abscissaAt = (u: number): number | null => {
    const run = runAt(u);
    return run === null ? null : xOf(run, u);
  };
  const proportionAt = (x: number): number | null => {
    for (const run of runs) {
      const left = xOf(run, run.u0);
      const right = xOf(run, run.u1);
      if (left <= x && x <= right) {
        return right === left ? run.u0 : run.u0 + ((x - left) / (right - left)) * (run.u1 - run.u0);
      }
    }
    return null;
  };
  const unitScale = (run: Run, timeline: string): number | null => {
    const base = baseOf(timeline);
    if (base === null) return null;
    const lambda = float(base.lambda);
    return lambda > 0 ? (place.scale * run.L) / lambda : null;
  };
  const runBeside = (gap: ExposedGap, edge: GapEdge): Run | null => {
    const u = proportionOf(gap.timeline, edge === "start" ? gap.start : gap.end);
    if (u === null) return null;
    // The run ending at the gap's start lies left of it, the run starting at its end right of it.
    const beside = (run: Run) => (edge === "start" ? run.u1 : run.u0);
    let nearest: Run | null = null;
    for (const run of runs) {
      if (nearest === null || Math.abs(beside(run) - u) < Math.abs(beside(nearest) - u)) {
        nearest = run;
      }
    }
    return nearest;
  };
  return {
    exposure,
    baseOf,
    proportionOf,
    runAt,
    abscissaAt,
    proportionAt,
    abscissaOf(timeline, value) {
      const u = proportionOf(timeline, value);
      return u === null ? null : abscissaAt(u);
    },
    valueAt(timeline, x) {
      const base = baseOf(timeline);
      const u = proportionAt(x);
      if (base === null || u === null) return null;
      return u * float(base.lambda) - float(base.zero);
    },
    unitScale,
    runBeside,
    edgeScale(gap, edge) {
      const run = runBeside(gap, edge);
      return run === null ? null : unitScale(run, gap.timeline);
    },
  };
}
