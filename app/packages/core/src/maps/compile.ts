/**
 * Conversion maps compiled into exact functions, one per map object.
 *
 * `compileMap` reads a map's parameters once and returns a closure over
 * them; evaluating it computes the result anew every time, so nothing but
 * the map's own parameters is kept. Every map evaluates as timetoalign
 * evaluates it, on Python's numeric tower (`values.ts`): exact where the
 * position and the parameters are exact, a float as soon as a float takes
 * part. Where timetoalign decides on doubles (a TableMap off its exact path,
 * a PiecewiseMap's interval, a measure view's measure), so does the
 * evaluator, through a `Float64Array` of the map's own parameters searched
 * by bisection. A measure view reads the expanded rows of its MeasureMap,
 * which the server's measure-maps route answers; without them it gives
 * nothing and says so (`missingKnots`).
 */

import type { TimeUnit } from "@timetoalign/timetoshare";
import { JsonFloat, jsonInteger } from "@timetoalign/timetoshare";
import type { ConversionMap } from "../manifest/types.ts";
import { Rational } from "../number/rational.ts";
import { fromFloat, toFloat, toRational } from "../number/real.ts";
import type {
  MapInput,
  MapResult,
  MapValue,
  MeasureKnot,
  MeasureKnots,
  QuarterPair,
} from "./values.ts";
import { addValues, floatOf, isMapValue, multiplyValues } from "./values.ts";

/** What a map is compiled with: the expanded rows of the manifest's MeasureMaps, when known. */
export interface CompileContext {
  readonly knots?: readonly MeasureKnots[];
}

/** One map, compiled. */
export interface MapEvaluator {
  readonly map: ConversionMap;
  /** The unit the results lie on, `null` where the map names none. */
  readonly targetUnit: TimeUnit | null;
  /** Whether the map reads a MeasureMap whose expanded rows the context lacks; it then gives nothing. */
  readonly missingKnots: boolean;
  /** A `CombinationMap`'s evaluator of each output, in the map's key order; `null` for every other map. */
  readonly outputs: ReadonlyMap<string, MapEvaluator> | null;
  /** The raw result at `x`, as timetoalign computes it; `undefined` where timetoalign raises. */
  evaluate(x: MapInput): MapResult | undefined;
}

type Evaluate = (x: MapInput) => MapResult | undefined;

const NOTHING: Evaluate = () => undefined;
const NO_KNOTS: readonly MeasureKnots[] = Object.freeze([]);
const compiled = new WeakMap<ConversionMap, WeakMap<readonly MeasureKnots[], MapEvaluator>>();

/** An integer of a manifest: a JSON integer, or an integral float in a Fraction pair (`jsonInteger`). */
function readInteger(value: unknown): bigint {
  const integer = jsonInteger(value);
  if (integer === null) throw new TypeError(`${String(value)} is not an integer`);
  return integer;
}

/** A map parameter read by its JSON form: an integer an int, any other number a float, a pair a Fraction. */
export function readValue(value: unknown): MapValue {
  if (Array.isArray(value) && value.length === 2) {
    return Rational.fromParts(readInteger(value[0]), readInteger(value[1]));
  }
  if (typeof value === "bigint") return value;
  if (value instanceof JsonFloat) return value.value;
  if (typeof value === "number" && Number.isFinite(value)) {
    return Number.isInteger(value) && !Object.is(value, -0) ? BigInt(value) : value;
  }
  throw new TypeError(`${String(value)} is not a Number`);
}

/** `float(value)` of a map parameter, read without building an exact value where none is needed. */
export function readFloat(value: unknown): number {
  if (typeof value === "number") return value;
  if (value instanceof JsonFloat) return value.value;
  return floatOf(readValue(value));
}

/** The index of the first item above `x`, as Python's `bisect_right`. */
function bisectRight(items: Float64Array, x: number): number {
  let low = 0;
  let high = items.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (x < (items[middle] as number)) high = middle;
    else low = middle + 1;
  }
  return low;
}

/** `bisect_right` over exact items: a bisection of their doubles, corrected exactly. */
function bisectRightExact(items: readonly Rational[], floats: Float64Array, x: Rational): number {
  let index = bisectRight(floats, toFloat(x));
  while (index < items.length && (items[index] as Rational).compare(x) <= 0) index += 1;
  while (index > 0 && (items[index - 1] as Rational).compare(x) > 0) index -= 1;
  return index;
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(value, high));
}

/** Whether the doubles increase strictly, as timetoalign requires of anchors and breaks. */
export function increasing(values: Float64Array): boolean {
  for (let i = 1; i < values.length; i += 1) {
    if (!((values[i - 1] as number) < (values[i] as number))) return false;
  }
  return true;
}

/** The `i`th item of a list known to hold it. */
function nth<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new RangeError(`no item ${index}`);
  return item;
}

function float(items: Float64Array, index: number): number {
  const item = items[index];
  if (item === undefined) throw new RangeError(`no item ${index}`);
  return item;
}

/** Whether a map reads a MeasureMap whose expanded rows `knots` lacks. */
function readsMissingKnots(map: ConversionMap, knots: readonly MeasureKnots[]): boolean {
  switch (map.type) {
    case "MeasureRecordMap":
    case "MeasureNumberMap":
    case "MeasureBeatMap":
    case "FloatingMeasureMap":
      return !knots.some((entry) => entry.id === map.measure_map);
    case "ChainMap":
    case "PiecewiseMap":
      return map.maps.some((inner) => readsMissingKnots(inner, knots));
    case "CombinationMap":
      return Object.values(map.maps).some((inner) => readsMissingKnots(inner, knots));
    default:
      return false;
  }
}

function linearMap(scalarValue: unknown, offsetValue: unknown): Evaluate {
  const scalar = readValue(scalarValue);
  const offset = readValue(offsetValue);
  return (x) => addValues(multiplyValues(scalar, x), offset);
}

interface Table {
  readonly x_values: readonly unknown[];
  readonly y_values: readonly unknown[];
  readonly kind: "linear" | "previous";
  readonly extrapolate: "none" | "constant" | "linear";
}

/**
 * A TableMap: exact `linear` interpolation (and linear extrapolation) when
 * the position and every anchor are exact; otherwise numpy's `interp` on
 * doubles, the stored anchor value for `previous` and `constant`.
 */
function tableMap(map: Table): Evaluate {
  const count = map.x_values.length;
  if (count < 2 || map.y_values.length !== count) return NOTHING;
  const xs = Float64Array.from(map.x_values, readFloat);
  if (!increasing(xs)) return NOTHING;
  const ys = Float64Array.from(map.y_values, readFloat);
  const stored = map.y_values.map(readValue);
  const last = count - 1;
  const exactAnchors = [...map.x_values.map(readValue), ...stored].every(
    (value) => typeof value !== "number",
  );
  let exact: { readonly xs: readonly Rational[]; readonly ys: readonly Rational[] } | undefined;
  const exactAt = (x: Rational): Rational | undefined => {
    exact ??= {
      xs: map.x_values.map((value) => toRational(readValue(value))),
      ys: stored.map(toRational),
    };
    const inside = nth(exact.xs, 0).compare(x) <= 0 && x.compare(nth(exact.xs, last)) <= 0;
    if (map.kind !== "linear" || (!inside && map.extrapolate !== "linear")) return undefined;
    const i = clamp(bisectRightExact(exact.xs, xs, x) - 1, 0, count - 2);
    const [x0, x1, y0, y1] = [
      nth(exact.xs, i),
      nth(exact.xs, i + 1),
      nth(exact.ys, i),
      nth(exact.ys, i + 1),
    ];
    return y0.add(x.subtract(x0).multiply(y1.subtract(y0)).divide(x1.subtract(x0)));
  };
  /** The first or the last segment continued, on doubles. */
  const extrapolated = (x: number): number => {
    const at = x < float(xs, 0) ? 0 : last;
    const [i, j] = at === 0 ? [0, 1] : [last - 1, last];
    const slope = (float(ys, j) - float(ys, i)) / (float(xs, j) - float(xs, i));
    return float(ys, at) + slope * (x - float(xs, at));
  };
  return (value) => {
    if (exactAnchors && typeof value !== "number") {
      const result = exactAt(toRational(value));
      if (result !== undefined) return result;
    }
    const x = floatOf(value);
    if (x < float(xs, 0) || x > float(xs, last)) {
      if (map.extrapolate === "none") return undefined;
      if (map.extrapolate === "constant") return nth(stored, x < float(xs, 0) ? 0 : last);
      return extrapolated(x);
    }
    const j = bisectRight(xs, x) - 1;
    if (map.kind === "previous") return nth(stored, clamp(j, 0, last));
    if (j === last || float(xs, j) === x) return float(ys, j);
    const slope = (float(ys, j + 1) - float(ys, j)) / (float(xs, j + 1) - float(xs, j));
    let result = slope * (x - float(xs, j)) + float(ys, j);
    if (Number.isNaN(result)) {
      result = slope * (x - float(xs, j + 1)) + float(ys, j + 1);
      if (Number.isNaN(result) && float(ys, j) === float(ys, j + 1)) result = float(ys, j);
    }
    return result;
  };
}

/**
 * A PiecewiseMap: the interval `[breaks[i], breaks[i + 1])` holding the
 * position's double, then that interval's map on the position as given.
 * Each piece is compiled when first reached.
 */
function piecewiseMap(
  breakValues: readonly unknown[],
  maps: readonly ConversionMap[],
  context: CompileContext,
): Evaluate {
  const breaks = Float64Array.from(breakValues, readFloat);
  if (breaks.length < 2 || maps.length !== breaks.length - 1 || !increasing(breaks)) {
    return NOTHING;
  }
  const pieces: (MapEvaluator | undefined)[] = new Array(maps.length);
  const first = float(breaks, 0);
  const end = float(breaks, breaks.length - 1);
  return (value) => {
    const x = floatOf(value);
    if (x < first || x >= end) return undefined;
    const i = clamp(bisectRight(breaks, x) - 1, 0, maps.length - 1);
    const piece = pieces[i] ?? compileMap(nth(maps, i), context);
    pieces[i] = piece;
    return piece.evaluate(value);
  };
}

function chainMap(steps: readonly MapEvaluator[]): Evaluate {
  return (x) => {
    let result: MapResult | undefined = x;
    for (const step of steps) {
      if (result === undefined || !isMapValue(result)) return undefined;
      result = step.evaluate(result);
    }
    return result;
  };
}

function combinationMap(outputs: ReadonlyMap<string, MapEvaluator>): Evaluate {
  return (x) => {
    const results: { [name: string]: MapResult } = {};
    for (const [name, output] of outputs) {
      const result = output.evaluate(x);
      if (result === undefined) return undefined;
      results[name] = result;
    }
    return { outputs: results };
  };
}

function exactPair(pair: QuarterPair): Rational {
  return Rational.of(pair);
}

/** The measure view of `type` over the expanded rows of its MeasureMap. */
function measureView(type: ConversionMap["type"], rows: readonly MeasureKnot[]): Evaluate {
  if (rows.length === 0) return NOTHING;
  if (type === "FloatingMeasureMap") return floatingMeasures(rows);
  const qstamps: Rational[] = [];
  for (const row of rows) {
    if (row.qstamp === null) return NOTHING;
    qstamps.push(exactPair(row.qstamp));
  }
  const starts = Float64Array.from(qstamps, toFloat);
  const indexOf = (x: MapInput) => clamp(bisectRight(starts, floatOf(x)) - 1, 0, rows.length - 1);
  const numberOf = (row: MeasureKnot) => BigInt(row.number ?? row.count);
  switch (type) {
    case "MeasureRecordMap":
      return (x) => ({ record: nth(rows, indexOf(x)) });
    case "MeasureNumberMap":
      return (x) => numberOf(nth(rows, indexOf(x)));
    default:
      return (x) => {
        const i = indexOf(x);
        const exact = x instanceof Rational ? x : fromFloat(floatOf(x));
        const beat = exact.subtract(nth(qstamps, i)).add(Rational.of(1));
        return { outputs: { number: numberOf(nth(rows, i)), beat } };
      };
  }
}

/** The passes a row's volta bracket names, `null` under no bracket. */
function passesOf(row: MeasureKnot): readonly number[] | null {
  if (row.volta === null) return null;
  return typeof row.volta === "number" ? [row.volta] : row.volta;
}

/** Whether two rows state volta brackets naming different passes. */
function differentVoltas(row: MeasureKnot, following: MeasureKnot): boolean {
  const passes = passesOf(row);
  const followingPasses = passesOf(following);
  if (passes === null || followingPasses === null) return false;
  return (
    passes.length !== followingPasses.length ||
    passes.some((pass, i) => pass !== followingPasses[i])
  );
}

/** Whether two rows state the same nominal length (both none counts as the same). */
function sameNominal(row: MeasureKnot, following: MeasureKnot): boolean {
  const nominal = row.nominal_length;
  const followingNominal = following.nominal_length;
  if (nominal === null || followingNominal === null) return nominal === followingNominal;
  return exactPair(nominal).equals(exactPair(followingNominal));
}

/**
 * Whether `following`, the row after the run `run`, continues its floating
 * measure: it has the number of the run's last row, the two do not state
 * different voltas, and either that row's next names it (across a metre
 * change too: one number is one notated bar), or it has that row's nominal
 * length and its offset within the measure is where the run ends in the
 * notated bar (the first row's offset plus the rows' actual lengths).
 */
function continues(run: readonly MeasureKnot[], following: MeasureKnot): boolean {
  const row = nth(run, run.length - 1);
  if (row.number === null || row.number !== following.number) return false;
  if (differentVoltas(row, following)) return false;
  if (row.next.includes(following.count)) return true;
  if (!sameNominal(row, following)) return false;
  let end = exactPair(nth(run, 0).offset_within_measure);
  for (const part of run) {
    if (part.actual_length === null) return false;
    end = end.add(exactPair(part.actual_length));
  }
  return exactPair(following.offset_within_measure).equals(end);
}

/**
 * Floating measures. A floating measure is a run of consecutive rows that
 * represent one notated bar (a single row is a run of one; see `continues`),
 * so the rows of a split bar read as that one bar. One knot per run at its
 * first row's nominal downbeat (its qstamp minus its offset within the
 * measure) carrying the run's ordinal, and one at the end of the last row;
 * the first run is ordinal 0 when it is an anacrusis. Linear between and
 * beyond the knots in exact arithmetic, truncated to three decimals; knots
 * that do not increase give no floating measures.
 */
function floatingMeasures(rows: readonly MeasureKnot[]): Evaluate {
  const runs: MeasureKnot[][] = [];
  const xs: Rational[] = [];
  let firstExtent = Rational.of(0);
  for (const row of rows) {
    if (row.qstamp === null || row.actual_length === null) return NOTHING;
    const run = runs.at(-1);
    if (run !== undefined && continues(run, row)) {
      run.push(row);
    } else {
      runs.push([row]);
      xs.push(exactPair(row.qstamp).subtract(exactPair(row.offset_within_measure)));
    }
    if (runs.length === 1) firstExtent = firstExtent.add(exactPair(row.actual_length));
  }
  const first = nth(rows, 0);
  const anacrusis =
    exactPair(first.offset_within_measure).compare(Rational.of(0)) > 0 &&
    first.nominal_length !== null &&
    firstExtent.compare(exactPair(first.nominal_length)) < 0;
  const last = nth(rows, rows.length - 1);
  if (last.qstamp === null || last.actual_length === null) return NOTHING;
  xs.push(exactPair(last.qstamp).add(exactPair(last.actual_length)));
  const firstOrdinal = anacrusis ? 0n : 1n;
  const ys = xs.map((_, i) => Rational.fromParts(firstOrdinal + BigInt(i), 1n));
  for (let i = 1; i < xs.length; i += 1) {
    if (nth(xs, i).compare(nth(xs, i - 1)) <= 0) return NOTHING;
  }
  const floats = Float64Array.from(xs, toFloat);
  if (!increasing(floats)) return NOTHING;
  const thousand = Rational.of(1000);
  return (value) => {
    const x = toRational(value);
    const i = clamp(bisectRightExact(xs, floats, x) - 1, 0, xs.length - 2);
    const slope = nth(ys, i + 1)
      .subtract(nth(ys, i))
      .divide(nth(xs, i + 1).subtract(nth(xs, i)));
    const reading = nth(ys, i).add(slope.multiply(x.subtract(nth(xs, i))));
    return toFloat(Rational.fromParts(reading.multiply(thousand).floor(), 1000n));
  };
}

function evaluateOf(
  map: ConversionMap,
  context: CompileContext,
  knots: readonly MeasureKnots[],
  outputs: ReadonlyMap<string, MapEvaluator> | null,
): Evaluate {
  switch (map.type) {
    case "LinearMap":
      return linearMap(map.scalar, map.offset);
    case "ConstantMap": {
      const value = typeof map.value === "string" ? map.value : readValue(map.value);
      return () => value;
    }
    case "TableMap":
      return tableMap(map);
    case "PiecewiseMap":
      return piecewiseMap(map.breaks, map.maps, context);
    case "ChainMap":
      return chainMap(map.maps.map((inner) => compileMap(inner, context)));
    case "CombinationMap":
      return outputs === null ? NOTHING : combinationMap(outputs);
    default: {
      const entry = knots.find((item) => item.id === map.measure_map);
      return entry === undefined ? NOTHING : measureView(map.type, entry.rows);
    }
  }
}

/**
 * The evaluator of `map`, compiled once per map object and rows list: the
 * same objects give the same evaluator, a map equal in value but another
 * object is compiled anew.
 */
export function compileMap(map: ConversionMap, context: CompileContext = {}): MapEvaluator {
  const knots = context.knots ?? NO_KNOTS;
  let byKnots = compiled.get(map);
  if (byKnots === undefined) {
    byKnots = new WeakMap();
    compiled.set(map, byKnots);
  }
  const known = byKnots.get(knots);
  if (known !== undefined) return known;
  const inner: CompileContext = { knots };
  const outputs =
    map.type === "CombinationMap"
      ? new Map(Object.entries(map.maps).map(([name, output]) => [name, compileMap(output, inner)]))
      : null;
  const evaluator: MapEvaluator = {
    map,
    targetUnit: map.target_unit ?? null,
    missingKnots: readsMissingKnots(map, knots),
    outputs,
    evaluate: evaluateOf(map, inner, knots, outputs),
  };
  byKnots.set(knots, evaluator);
  return evaluator;
}
