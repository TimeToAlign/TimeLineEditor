/**
 * Conversion maps run backwards: the position at which a map gives a value.
 *
 * A map is invertible over a span of positions when it is strictly
 * monotone there, decided exactly on its own parameters: a LinearMap whose
 * scalar is not 0; a `linear` TableMap whose anchors rise or fall strictly
 * over every interval the span reaches (an extrapolation reached that is
 * `constant` is flat, one that is `none` gives nothing and is passed over);
 * a PiecewiseMap whose pieces reached are all invertible in one direction,
 * never stepping back at a break; a ChainMap whose links are all
 * invertible, each over the span the links before it give. A `previous`
 * TableMap, a ConstantMap, a CombinationMap and the four measure views are
 * never invertible. The inverse follows Python's numeric tower as the
 * evaluator does: exact where the value and every parameter it reads are
 * exact, a float as soon as a float takes part.
 */

import type { ConversionMap } from "../manifest/types.ts";
import { Rational } from "../number/rational.ts";
import type { Real } from "../number/real.ts";
import { compareReal, toRational } from "../number/real.ts";
import type { CompileContext } from "./compile.ts";
import { compileMap, increasing, readFloat, readValue } from "./compile.ts";
import type { MapValue, MeasureKnots } from "./values.ts";
import { floatOf, isMapValue } from "./values.ts";

/** What a map is inverted with: the compile context and the span of positions it is read over. */
export interface InversionContext extends CompileContext {
  /** The first and last position of the span; `end` is `null` where the line's length is unknown. */
  readonly span: { readonly start: Real; readonly end: Real | null };
}

/** A span of positions; a `null` bound is unbounded. */
interface Span {
  readonly low: Real | null;
  readonly high: Real | null;
}

/** +1 for a strictly rising map, −1 for a strictly falling one. */
type Direction = 1 | -1;

const ZERO = Rational.fromParts(0n, 1n);

/** A map value as a `Real`: an int as its exact value. */
function realOf(value: MapValue): Real {
  return typeof value === "bigint" ? Rational.fromParts(value, 1n) : value;
}

function signOf(value: MapValue): -1 | 0 | 1 {
  return compareReal(realOf(value), ZERO);
}

/** Whether the open interval `(from, to)` meets the span. */
function meets(span: Span, from: Real, to: Real): boolean {
  return (
    (span.low === null || compareReal(span.low, to) < 0) &&
    (span.high === null || compareReal(span.high, from) > 0)
  );
}

/** `(y − offset) / scalar`, exact when all three are, else on doubles. */
function linearInverse(scalar: MapValue, offset: MapValue, y: MapValue): MapValue {
  if (typeof scalar === "number" || typeof offset === "number" || typeof y === "number") {
    return (floatOf(y) - floatOf(offset)) / floatOf(scalar);
  }
  return toRational(y).subtract(toRational(offset)).divide(toRational(scalar));
}

/** The one direction of `directions`, `null` when there is none or they differ. */
function oneDirection(directions: readonly (Direction | null)[]): Direction | null {
  const [first] = directions;
  if (first === undefined || first === null) return null;
  return directions.every((direction) => direction === first) ? first : null;
}

/** A TableMap's anchors, and the intervals a span reaches: an index `i` for `[x_i, x_{i+1}]`, extrapolations by their end interval. */
interface TableReach {
  readonly xs: readonly MapValue[];
  readonly ys: readonly MapValue[];
  readonly reached: readonly number[];
  /** Whether the span reaches a linear extrapolation before the first anchor, after the last. */
  readonly before: boolean;
  readonly after: boolean;
}

function tableReach(
  map: Extract<ConversionMap, { readonly type: "TableMap" }>,
  span: Span,
): TableReach | null {
  const count = map.x_values.length;
  if (map.kind !== "linear" || count < 2 || map.y_values.length !== count) return null;
  if (!increasing(Float64Array.from(map.x_values, readFloat))) return null;
  const xs = map.x_values.map(readValue);
  const ys = map.y_values.map(readValue);
  const x = (i: number) => realOf(xs[i] as MapValue);
  const last = count - 1;
  const reached: number[] = [];
  const outside = [
    span.low === null || compareReal(span.low, x(0)) < 0,
    span.high === null || compareReal(span.high, x(last)) > 0,
  ];
  if (map.extrapolate === "constant" && outside.some(Boolean)) return null;
  const [before, after] = outside.map((reaches) => reaches && map.extrapolate === "linear") as [
    boolean,
    boolean,
  ];
  for (let i = 0; i < last; i += 1) {
    if (meets(span, x(i), x(i + 1)) || (i === 0 && before) || (i === last - 1 && after)) {
      reached.push(i);
    }
  }
  return { xs, ys, reached, before, after };
}

function tableDirection(reach: TableReach): Direction | null {
  return oneDirection(
    reach.reached.map((i) => {
      const step = compareReal(
        realOf(reach.ys[i + 1] as MapValue),
        realOf(reach.ys[i] as MapValue),
      );
      return step === 0 ? null : step;
    }),
  );
}

/** The position on interval `i` (or its continuation) where the table gives `y`. */
function tableInverse(reach: TableReach, i: number, y: MapValue, exact: boolean): MapValue {
  const [x0, x1, y0, y1] = [reach.xs[i], reach.xs[i + 1], reach.ys[i], reach.ys[i + 1]].map(
    (value) => value as MapValue,
  ) as [MapValue, MapValue, MapValue, MapValue];
  if (exact && typeof y !== "number") {
    const [a, b, c, d] = [x0, x1, y0, y1].map((value) => toRational(realOf(value)));
    return (a as Rational).add(
      toRational(y)
        .subtract(c as Rational)
        .multiply((b as Rational).subtract(a as Rational))
        .divide((d as Rational).subtract(c as Rational)),
    );
  }
  const [a, b, c, d] = [x0, x1, y0, y1].map(floatOf) as [number, number, number, number];
  return a + ((floatOf(y) - c) * (b - a)) / (d - c);
}

/** Whether `y` lies between `from` and `to`, both included. */
function between(y: MapValue, from: MapValue, to: MapValue): boolean {
  const [low, high] = compareReal(realOf(from), realOf(to)) <= 0 ? [from, to] : [to, from];
  return compareReal(realOf(low), realOf(y)) <= 0 && compareReal(realOf(y), realOf(high)) <= 0;
}

function tableAt(reach: TableReach, y: MapValue, direction: Direction): MapValue | undefined {
  const exact = [...reach.xs, ...reach.ys].every((value) => typeof value !== "number");
  const last = reach.xs.length - 1;
  for (const i of reach.reached) {
    const y0 = reach.ys[i] as MapValue;
    const y1 = reach.ys[i + 1] as MapValue;
    const below = compareReal(realOf(y), realOf(y0)) * direction < 0;
    const above = compareReal(realOf(y), realOf(y1)) * direction > 0;
    const continued =
      (i === 0 && reach.before && below) || (i === last - 1 && reach.after && above);
    if (between(y, y0, y1) || continued) {
      return tableInverse(reach, i, y, exact);
    }
  }
  return undefined;
}

/** A PiecewiseMap's breaks and the pieces a span reaches, each with its part of the span. */
interface PiecewiseReach {
  readonly breaks: readonly MapValue[];
  readonly floats: Float64Array;
  readonly pieces: readonly { readonly index: number; readonly span: Span }[];
}

function piecewiseReach(
  map: Extract<ConversionMap, { readonly type: "PiecewiseMap" }>,
  span: Span,
): PiecewiseReach | null {
  const floats = Float64Array.from(map.breaks, readFloat);
  if (floats.length < 2 || map.maps.length !== floats.length - 1 || !increasing(floats)) {
    return null;
  }
  const breaks = map.breaks.map(readValue);
  const pieces: { index: number; span: Span }[] = [];
  for (let i = 0; i < map.maps.length; i += 1) {
    const from = realOf(breaks[i] as MapValue);
    const to = realOf(breaks[i + 1] as MapValue);
    if (!meets(span, from, to)) continue;
    pieces.push({
      index: i,
      span: {
        low: span.low === null || compareReal(span.low, from) < 0 ? from : span.low,
        high: span.high === null || compareReal(span.high, to) > 0 ? to : span.high,
      },
    });
  }
  return { breaks, floats, pieces };
}

/** A map's raw value at `x`, `undefined` where it gives no number. */
function valueAt(map: ConversionMap, x: MapValue, context: CompileContext): MapValue | undefined {
  const result = compileMap(map, context).evaluate(x);
  return result !== undefined && isMapValue(result) ? result : undefined;
}

/** The span a strictly monotone map gives over `span`; a bound it gives no number at is unbounded. */
function image(
  map: ConversionMap,
  span: Span,
  direction: Direction,
  context: CompileContext,
): Span {
  const at = (bound: Real | null) => {
    if (bound === null) return null;
    const value = valueAt(map, bound, context);
    return value === undefined ? null : realOf(value);
  };
  const [low, high] = [at(span.low), at(span.high)];
  return direction === 1 ? { low, high } : { low: high, high: low };
}

/** The spans each link of a chain is read over, `null` where a link is not invertible. */
function chainSpans(
  maps: readonly ConversionMap[],
  span: Span,
  context: CompileContext,
): { readonly spans: readonly Span[]; readonly direction: Direction } | null {
  const spans: Span[] = [];
  let current = span;
  let product: Direction = 1;
  for (const link of maps) {
    const direction = directionOf(link, current, context);
    if (direction === null) return null;
    spans.push(current);
    product = (product * direction) as Direction;
    current = image(link, current, direction, context);
  }
  return maps.length === 0 ? null : { spans, direction: product };
}

/** The direction in which `map` is strictly monotone over `span`, `null` where it is not. */
function directionOf(map: ConversionMap, span: Span, context: CompileContext): Direction | null {
  switch (map.type) {
    case "LinearMap": {
      const sign = signOf(readValue(map.scalar));
      return sign === 0 ? null : sign;
    }
    case "TableMap": {
      const reach = tableReach(map, span);
      return reach === null ? null : tableDirection(reach);
    }
    case "PiecewiseMap": {
      const reach = piecewiseReach(map, span);
      if (reach === null) return null;
      const direction = oneDirection(
        reach.pieces.map((piece) =>
          directionOf(map.maps[piece.index] as ConversionMap, piece.span, context),
        ),
      );
      if (direction === null) return null;
      for (let k = 1; k < reach.pieces.length; k += 1) {
        const i = (reach.pieces[k] as { index: number }).index;
        const at = reach.breaks[i] as MapValue;
        const left = valueAt(map.maps[i - 1] as ConversionMap, at, context);
        const right = valueAt(map.maps[i] as ConversionMap, at, context);
        if (left === undefined || right === undefined) return null;
        if (compareReal(realOf(left), realOf(right)) * direction > 0) return null;
      }
      return direction;
    }
    case "ChainMap":
      return chainSpans(map.maps, span, context)?.direction ?? null;
    default:
      return null;
  }
}

const NO_KNOTS: readonly MeasureKnots[] = Object.freeze([]);
/** The direction of each map object over each span it was asked for, by the rows list it read. */
const directions = new WeakMap<
  ConversionMap,
  WeakMap<readonly MeasureKnots[], Map<string, Direction | null>>
>();

/** A bound of a span as a text: equal texts for equal values of one kind, a float's apart from an exact value's. */
function boundText(bound: Real | null): string {
  if (bound === null) return "none";
  return typeof bound === "number" ? `float ${bound}` : `exact ${bound}`;
}

/**
 * `directionOf(map, span, context)`, decided once per map object, rows
 * list and span: the same objects and an equal span give the same answer
 * (as `compileMap` compiles once per map object), so a map read again at
 * every pointer move is not decided again over all its pieces.
 */
function directionOver(map: ConversionMap, span: Span, context: CompileContext): Direction | null {
  const knots = context.knots ?? NO_KNOTS;
  let byKnots = directions.get(map);
  if (byKnots === undefined) {
    byKnots = new WeakMap();
    directions.set(map, byKnots);
  }
  let bySpan = byKnots.get(knots);
  if (bySpan === undefined) {
    bySpan = new Map();
    byKnots.set(knots, bySpan);
  }
  const key = `${boundText(span.low)} ${boundText(span.high)}`;
  const known = bySpan.get(key);
  if (known !== undefined) return known;
  const direction = directionOf(map, span, context);
  bySpan.set(key, direction);
  return direction;
}

/** The position where `map`, strictly monotone over `span`, gives `y`; `undefined` where none does. */
function inverseOf(
  map: ConversionMap,
  y: MapValue,
  span: Span,
  context: CompileContext,
): MapValue | undefined {
  switch (map.type) {
    case "LinearMap": {
      const scalar = readValue(map.scalar);
      return signOf(scalar) === 0 ? undefined : linearInverse(scalar, readValue(map.offset), y);
    }
    case "TableMap": {
      const reach = tableReach(map, span);
      const direction = reach === null ? null : tableDirection(reach);
      return reach === null || direction === null ? undefined : tableAt(reach, y, direction);
    }
    case "PiecewiseMap": {
      const reach = piecewiseReach(map, span);
      if (reach === null || directionOver(map, span, context) === null) return undefined;
      for (const piece of reach.pieces) {
        const x = inverseOf(map.maps[piece.index] as ConversionMap, y, piece.span, context);
        if (x === undefined) continue;
        const float = floatOf(x);
        const from = reach.floats[piece.index] as number;
        const to = reach.floats[piece.index + 1] as number;
        if (from <= float && float < to) return x;
      }
      return undefined;
    }
    case "ChainMap": {
      const chain = chainSpans(map.maps, span, context);
      if (chain === null) return undefined;
      let value: MapValue | undefined = y;
      for (let k = map.maps.length - 1; k >= 0 && value !== undefined; k -= 1) {
        value = inverseOf(map.maps[k] as ConversionMap, value, chain.spans[k] as Span, context);
      }
      return value;
    }
    default:
      return undefined;
  }
}

function spanOf(context: InversionContext): Span {
  return { low: context.span.start, high: context.span.end };
}

/** Whether `map` is strictly monotone, so invertible, over the context's span. */
export function invertible(map: ConversionMap, context: InversionContext): boolean {
  return directionOver(map, spanOf(context), context) !== null;
}

/**
 * The position at which `map` gives `value`, read over the context's span:
 * exact (a `Rational`) when the value and every parameter the inverse reads
 * are exact, else a float; `null` when the map is not invertible there or
 * no position of the intervals it reaches gives the value. The position may
 * lie outside the span (a LinearMap reaches every value); whether it is
 * allowed is the caller's to say.
 */
export function invert(
  map: ConversionMap,
  value: MapValue,
  context: InversionContext,
): Real | null {
  const span = spanOf(context);
  if (directionOver(map, span, context) === null) return null;
  const x = inverseOf(map, value, span, context);
  return x === undefined || (typeof x === "number" && !Number.isFinite(x)) ? null : realOf(x);
}
