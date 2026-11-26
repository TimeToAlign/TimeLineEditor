/**
 * Elisions (`docs/drawing.md` in TimeToShare, sections 2, 3.2, 6.4, 6.6 and
 * 8.9): which elisions a card or a frame draws, their pieces and widths, the
 * middle a derived elision leaves out, the elided axis their gaps make,
 * linear run by run, and the gaps drawn with their ellipses, continuations
 * and labels.
 */

import {
  expressAs,
  groupsHolding,
  idAddress,
  indexOf,
  type ManifestGraphical,
  type OwnerAddress,
  partAddress,
  type TimelineManifest,
} from "@timetoalign/tilie-core";
import { elementKey } from "@timetoalign/tilie-core/drawing";
import {
  compareReal,
  fromFloat,
  Rational,
  type Real,
  toFloat,
  toRational,
} from "@timetoalign/tilie-core/numbers";
import type { NumberType } from "@timetoalign/timetoshare";
import { isJsonFloat } from "@timetoalign/timetoshare";
import type { ExposedGap, Run } from "./boxes.ts";
import type { Style } from "./cascade.ts";
import {
  ELLIPSIS_GAP,
  ELLIPSIS_RADIUS,
  ELLIPSIS_SPACING,
  K,
  LABEL_GAP,
  MARKER_HEIGHT,
  STANDARD_GAP,
} from "./constants.ts";
import type { DrawnElement, EllipsisElement, TextElement, View } from "./elements.ts";
import { cleanText } from "./metrics.ts";
import { cutText, nameOf } from "./names.ts";
import {
  add,
  coordinateText,
  coordinateValue,
  lengthValue,
  negate,
  proportion,
  times,
  zero,
} from "./numbers.ts";
import { tiersOf } from "./stacks.ts";
import {
  type CardAxis,
  type Entry,
  type Gap,
  type GapLabel,
  type GapSource,
  type Holder,
  nth,
  type Scope,
  shown,
} from "./traversal.ts";

/** The words of an elision's `display`, in their canonical order (section 2). */
export const ELISION_WORDS = ["ellipsis", "name", "id", "coordinate", "continuation"] as const;

/** One word of an elision's `display`. */
export type ElisionWord = (typeof ELISION_WORDS)[number];

type LabelWord = GapLabel["word"];

/** The three labels of an elision, in the order of their stack (section 5.3). */
const LABEL_WORDS: readonly LabelWord[] = ["name", "id", "coordinate"];

/** `Z`, the double nearest 5/7: the zoom at which a row of the default pitch 14 lies 10 from the next. */
const LEGIBLE_ZOOM = 5 / 7;

/** A stored elision as the manifest holds it. */
export type StoredElision = NonNullable<ManifestGraphical["elisions"]>[number];

/** A stretch `[a, b]` of an axis, `a < b`. */
export type Stretch = readonly [Real, Real];

/** An elision's `width` (section 2), each number read as the form states it. */
export type ElisionWidth =
  | { readonly ratio: number }
  | { readonly span: Real }
  | { readonly canvas: number };

/** The words of `display` in canonical order, each once; a word that is no elision word left out. */
export function elisionWords(display: readonly string[]): ElisionWord[] {
  return ELISION_WORDS.filter((word) => display.includes(word));
}

/**
 * The `display` of the elisions a card derives (section 8.9): the words of its
 * `elision-display`, `none` none, their order and repetition meaning nothing.
 */
export function derivedDisplay(style: Style): ElisionWord[] {
  const value = style["elision-display"];
  return value === "none" ? [] : elisionWords(value.split(" "));
}

/** The depths of `elision-depths`: `auto`, or its positive integers ascending, each once. */
export function depthsOf(style: Style): "auto" | number[] {
  const value = style["elision-depths"];
  if (value === "auto") return "auto";
  return [...new Set(value.split(" ").map(Number))].sort((left, right) => left - right);
}

/** A JSON number of the manifest as a double. */
function jsonNumber(value: unknown): number {
  return isJsonFloat(value) ? value.value : Number(value);
}

const difference = (left: Real, right: Real): Real => add(left, negate(right));

/** The stretch `[a, b]` no further than `[start, end]`, ends compared exactly. */
function clipped(a: Real, b: Real, [start, end]: Stretch): Stretch {
  return [compareReal(a, start) < 0 ? start : a, compareReal(b, end) > 0 ? end : b];
}

/**
 * What of the stretch `[a, b]` lies outside every one of `covered`: none,
 * one or several stretches, from the left, each with a length; ends compare
 * exactly, and each end is one of the given values.
 */
export function outside<T extends Real>(
  a: T,
  b: T,
  covered: readonly (readonly [T, T])[],
): [T, T][] {
  let left: [T, T][] = compareReal(a, b) < 0 ? [[a, b]] : [];
  for (const [c, d] of covered) {
    left = left.flatMap(([p, q]): [T, T][] => {
      if (compareReal(d, p) <= 0 || compareReal(q, c) <= 0) return [[p, q]];
      const kept: [T, T][] = [];
      if (compareReal(p, c) < 0) kept.push([p, c]);
      if (compareReal(d, q) < 0) kept.push([d, q]);
      return kept;
    });
  }
  return left.sort(([p], [q]) => compareReal(p, q));
}

/**
 * The position at the proportion `p` of `lambda`, exact where `lambda` is (the
 * double `p` at its exact binary value), as a groupstamp's coordinates are
 * read (section 2).
 */
export function atProportion(p: number, lambda: Real): Real {
  return typeof lambda === "number" ? p * lambda : fromFloat(p).multiply(lambda);
}

/**
 * The exact quotient `t / λ` (section 8.9, Carried gaps), each operand at its
 * exact value (a float's exact binary value); 0 when `λ` is 0, as section 3.2
 * forms a proportion.
 */
function exactQuotient(t: Real, lambda: Real): Rational {
  const length = toRational(lambda);
  return length.numerator === 0n ? Rational.of(0n) : toRational(t).divide(length);
}

/** An exact proportion clipped to `[0, 1]`. */
function clippedToUnit(value: Rational): Rational {
  const zeroValue = Rational.of(0n);
  const one = Rational.of(1n);
  if (compareReal(value, zeroValue) < 0) return zeroValue;
  return compareReal(value, one) > 0 ? one : value;
}

/** A value as a double: a float as it is, an exact value as the double nearest it. */
const asFloat = (value: Real): number => (typeof value === "number" ? value : toFloat(value));

/**
 * An exact value written in `numberType` as a coordinate on a timeline of it
 * is (section 2, core's `expressAs`): the exact value on a `fraction` axis,
 * the integer nearest it on an `int` axis (ties to even), held as an
 * integral exact value, the double nearest it on a `float` axis.
 */
function writtenIn(value: Rational, numberType: NumberType): Real {
  const written = expressAs(value, numberType);
  // `expressAs` refuses only an infinite float, which an exact value never is.
  if (written === undefined) throw new Error("an exact value is written in every number type");
  return typeof written === "bigint" ? Rational.fromParts(written, 1n) : written;
}

/** A gap to place on an axis: its stretch, its widths, what it draws. */
interface Placing {
  readonly source: GapSource;
  readonly a: Real;
  readonly b: Real;
  readonly ua: number;
  readonly ub: number;
  readonly exact?: readonly [Rational, Rational];
  readonly n: number;
  readonly g: number;
  readonly entry: Entry | undefined;
}

/** How positions compare with gaps on an axis: exactly on a card, by proportion on a frame. */
interface Comparing {
  /** The position lies in the gap, its ends excluded. */
  readonly inside: (gap: Placing, value: Real) => boolean;
  /** The gap ends at or before the position. */
  readonly before: (gap: Placing, value: Real) => boolean;
  /** A row from `start` to `end` holds the whole gap. */
  readonly holds: (gap: Placing, start: Real, end: Real | null) => boolean;
}

/**
 * A seam of an ancestor card's axis (section 8.8, step 2): at the position `at` of the root's axis,
 * at the proportion `u`, the axis jumps right by `width`, leaving nothing out. A position at `at`
 * lies right of the jump where `inclusive` (the seam at the protected span's start) and left of
 * it otherwise (the seam at its end), so on the side facing the protected span.
 */
export interface Seam {
  readonly at: Real;
  readonly u: number;
  readonly width: number;
  readonly inclusive: boolean;
}

/**
 * The axis of `placing` and `seams`, sorted from the left, at the graphical length `L` and
 * proportions `u`; a seam before a gap starting where it lies.
 */
function axisOf(
  L: number,
  u: (value: Real) => number,
  placing: readonly Placing[],
  comparing: Comparing,
  seams: readonly Seam[] = [],
): CardAxis {
  const events = [
    ...placing.map((gap) => ({ ua: gap.ua, ub: gap.ub, gap, seam: undefined })),
    ...seams.map((seam) => ({ ua: seam.u, ub: seam.u, gap: undefined, seam })),
  ].sort((left, right) => left.ua - right.ua || left.ub - right.ub);
  const gaps: Gap[] = [];
  const runs: Run[] = [];
  let D = 0;
  let from = 0;
  for (const { gap, seam } of events) {
    if (seam !== undefined) {
      runs.push({ u0: from, u1: seam.u, L, D });
      D = D - seam.width;
      from = seam.u;
      continue;
    }
    if (gap === undefined) continue;
    runs.push({ u0: from, u1: gap.ua, L, D });
    const shrink = gap.n - gap.g;
    const left = L * gap.ua - D;
    D = D + shrink;
    gaps.push({ ...gap, shrink, left, right: L * gap.ub - D });
    from = gap.ub;
  }
  runs.push({ u0: from, u1: 1, L, D });
  // The widths of the seams a position lies right of, `side` deciding at a seam itself.
  const seamsBefore = (value: Real, side: "before" | "after" | "facing"): number => {
    let width = 0;
    for (const seam of seams) {
      const order = compareReal(seam.at, value);
      const right =
        order < 0 || (order === 0 && (side === "after" || (side === "facing" && seam.inclusive)));
      if (right) width = width + seam.width;
    }
    return width;
  };
  const gapsBefore = (value: Real): number => {
    let before = 0;
    gaps.forEach((gap) => {
      if (comparing.before(gap, value)) before = before + gap.shrink;
    });
    return before;
  };
  const shrinkBefore = (value: Real): number => gapsBefore(value) - seamsBefore(value, "facing");
  // `D` again, from the left, leaving out a seam at `value` that a position there lies left of.
  const endAt = (value: Real): number => {
    let shrink = 0;
    for (const { gap, seam } of events) {
      if (seam !== undefined) {
        if (seam.inclusive || compareReal(seam.at, value) !== 0) shrink = shrink - seam.width;
      } else if (gap !== undefined) {
        shrink = shrink + (gap.n - gap.g);
      }
    }
    return L - shrink;
  };
  return {
    gaps,
    seams: seams.map((seam) => seam.at),
    runs,
    total: D,
    endAt,
    relative: (value) => L * u(value) - shrinkBefore(value),
    relativeAt: (value, side) => L * u(value) - (gapsBefore(value) - seamsBefore(value, side)),
    startAt: (value) => L * u(value) - shrinkBefore(value),
    gapOf: (value) => gaps.find((gap) => comparing.inside(gap, value)),
    runGaps: [],
    runGapOf: () => undefined,
    shrinkBefore,
    crosses: (gap, start, end) => comparing.holds(gap, start, end),
  };
}

/** A gap whose edges its caller places: its stretch, its widths and its edges' distances from `x0`. */
export interface PlacedGap {
  readonly source: GapSource;
  readonly a: Real;
  readonly b: Real;
  readonly n: number;
  readonly g: number;
  readonly left: number;
  readonly right: number;
  readonly entry: Entry | undefined;
}

/**
 * A seam whose sides its caller places (section 8.8, Drawn once): its position, whether a
 * position at it lies right of it (`inclusive`), and whether the start of a line, of a region and
 * a jump's target there lie right of it (`startsRight`).
 */
export interface PlacedSeam {
  readonly at: Real;
  readonly inclusive: boolean;
  readonly startsRight: boolean;
}

/**
 * The axis of a card whose runs each have their own scale (section 8.8, Drawn
 * once): `at(value, after)` the distance of a position from `x0`, on the run
 * right of a seam where `after`; `gaps` from the left, each with its edges;
 * `seams` where the axis jumps and leaves nothing out, a position at one lying
 * right of it where it is `inclusive`. Each run between two gaps or seams is
 * linear, and `runs` states it as `L × u − D` at its two ends; `shrinkBefore`
 * is `L × u` less the distance, so `relative` keeps its meaning `L × u − D`.
 */
export function placedAxis(
  scope: Pick<Scope, "L" | "u" | "lambda" | "rootEntry">,
  gaps: readonly PlacedGap[],
  seams: readonly PlacedSeam[],
  at: (value: Real, after: boolean) => number,
): CardAxis {
  const { L, u, lambda } = scope;
  const start = zero(scope.rootEntry.manifest.number_type);
  const placed: Gap[] = gaps.map((gap) => ({
    ...gap,
    ua: u(gap.a),
    ub: u(gap.b),
    shrink: gap.n - gap.g,
  }));
  // The cuts of the axis from the left, a seam before a gap starting where it lies.
  const cuts = [
    ...placed.map((gap): Stretch => [gap.a, gap.b]),
    ...seams.map((seam): Stretch => [seam.at, seam.at]),
  ].sort(([a1, b1], [a2, b2]) => compareReal(a1, a2) || compareReal(b1, b2));
  const runs: Run[] = [];
  const run = (from: Real | null, to: Real) => {
    const u0 = from === null ? 0 : u(from);
    const u1 = u(to);
    const x0 = from === null ? at(start, false) : at(from, true);
    const x1 = at(to, false);
    const scale = u1 === u0 ? L : (x1 - x0) / (u1 - u0);
    runs.push({ u0, u1, L: scale, D: scale * u0 - x0 });
  };
  let from: Real | null = null;
  for (const [a, b] of cuts) {
    run(from, a);
    from = b;
  }
  run(from, lambda);
  const inclusiveAt = (value: Real) =>
    seams.some((seam) => seam.inclusive && compareReal(seam.at, value) === 0);
  const relative = (value: Real) => at(value, inclusiveAt(value));
  // How far short of `L` a position lies: the axis's `D` there.
  const shortOfL = (value: Real) => L - relative(value);
  return {
    gaps: placed,
    seams: cuts.flatMap(([a, b]) => (compareReal(a, b) === 0 ? [a] : [])),
    runs,
    total: shortOfL(lambda),
    endAt: (value) => L - shortOfL(value),
    relative,
    relativeAt: (value, side) => at(value, side === "after"),
    startAt: (value) =>
      seams.some((seam) => seam.startsRight && compareReal(seam.at, value) === 0)
        ? at(value, true)
        : relative(value),
    gapOf: (value) => placed.find((gap) => EXACT.inside(gap, value)),
    runGaps: [],
    runGapOf: () => undefined,
    shrinkBefore: (value) => L * u(value) - relative(value),
    crosses: (gap, start, end) => EXACT.holds(gap, start, end),
  };
}

/** Comparisons on a card's root axis: exact. */
const EXACT: Comparing = {
  inside: (gap, value) => compareReal(gap.a, value) < 0 && compareReal(value, gap.b) < 0,
  before: (gap, value) => compareReal(gap.b, value) <= 0,
  holds: (gap, start, end) =>
    compareReal(start, gap.a) <= 0 && (end === null || compareReal(end, gap.b) >= 0),
};

/** The words of a gap's labels with their texts, in stack order. */
type LabelTexts = Readonly<Partial<Record<LabelWord, string>>>;

/**
 * What a gap of the elision at `address` lying on `entry` draws, held by
 * `holder` (the line of `entry`, or a frame), its words `display`: its style,
 * its ellipses' where `display` lists `ellipsis` and they are displayed, its
 * labels in stack order where listed and displayed, each cut to its
 * `max-width` (section 6.6).
 */
function sourceOf(
  scope: Pick<Scope, "cascade" | "measure">,
  timeline: TimelineManifest,
  address: OwnerAddress,
  holder: Holder,
  display: readonly ElisionWord[],
  texts: LabelTexts,
  rest: Pick<GapSource, "origin" | "start" | "end" | "um" | "framed">,
): GapSource {
  const { cascade, measure } = scope;
  const key = elementKey("elision", address, timeline, holder.key);
  const style = cascade.resolve(key, holder.style);
  const ellipsisStyle = cascade.resolve(
    elementKey("ellipsis", partAddress(address, "ellipsis"), timeline, key),
    style,
  );
  const labels = LABEL_WORDS.flatMap((word): GapLabel[] => {
    const text = texts[word];
    if (!display.includes(word) || text === undefined) return [];
    const at = partAddress(address, word);
    const labelStyle = cascade.resolve(elementKey("label", at, timeline, key), style);
    if (!shown(labelStyle)) return [];
    const size = labelStyle["font-size"];
    const cut = cutText(measure, cleanText(text), size, labelStyle["max-width"]);
    return [{ word, address: at, style: labelStyle, text: cut.text, width: cut.width }];
  });
  return {
    ...rest,
    address,
    key,
    style,
    ellipsis: display.includes("ellipsis") && shown(ellipsisStyle) ? ellipsisStyle : null,
    continuation: display.includes("continuation"),
    labels,
    timeline,
  };
}

/**
 * The coordinate label of a gap (section 5.3): the pretty text of the start
 * of its elided coordinates without its pretty unit (with it in seconds,
 * where both are clocks), `–`, and the pretty text of its end.
 */
function stretchText(timeline: TimelineManifest, start: Real, end: Real): string {
  const { number_type: numberType, unit } = timeline;
  return `${coordinateText(start, numberType, unit === "seconds" ? unit : null)}–${coordinateText(end, numberType, unit)}`;
}

/** The texts of a stored elision's labels: its name, else its timeline's; its ID; its stretch. */
function storedTexts(
  elision: StoredElision,
  timeline: TimelineManifest,
  start: Real,
  end: Real,
): LabelTexts {
  return {
    name: elision.name ?? nameOf(timeline),
    id: elision.id,
    coordinate: stretchText(timeline, start, end),
  };
}

/** An elision's `width` read on the axis of the timeline it lies on; null for the standard gap. */
function widthOf(elision: StoredElision, timeline: TimelineManifest): ElisionWidth | null {
  const { width } = elision;
  if (width === undefined) return null;
  if (width.ratio !== undefined) return { ratio: jsonNumber(width.ratio) };
  if (width.canvas !== undefined) return { canvas: jsonNumber(width.canvas) };
  if (width.span !== undefined) return { span: coordinateValue(width.span, timeline.number_type) };
  return null;
}

/**
 * A stored gap's drawn width (section 8.9): the standard gap 32 without a
 * `width`, `q × n` for a ratio, `L × uv` for a span `v` (`uv = v / λ`), `c`
 * for a canvas width; `n` where it is larger than `n`.
 */
function drawnWidth(width: ElisionWidth | null, n: number, L: number, lambda: Real): number {
  const wanted =
    width === null
      ? STANDARD_GAP
      : "ratio" in width
        ? width.ratio * n
        : "span" in width
          ? L * proportion(width.span, lambda)
          : width.canvas;
  return wanted > n ? n : wanted;
}

/** The mode a card or frame draws by: `auto` read as `custom` where it has stored ones (section 8.9). */
export type DrawnMode = "full" | "proportional" | "custom";

/** A stored card elision of a root's tree: the elision, its timeline's entry, its stretch on the root's axis. */
export interface CardElision {
  readonly elision: StoredElision;
  readonly entry: Entry;
  readonly a: Real;
  readonly b: Real;
}

/**
 * The stored card elisions of the root of `scope` (section 8.9, Where): those
 * lying on the root or a descendant of it that lies in no group, displayed or
 * not, in canonical order, each with its stretch carried to the root's axis
 * and clipped to the root's start and end.
 */
export function cardElisionsOf(scope: Scope): CardElision[] {
  const { manifest, entries, rootEntry, lambda } = scope;
  const byId = new Map(entries.map((entry) => [entry.manifest.id, entry]));
  const { ancestry } = indexOf(manifest);
  const root: Stretch = [zero(rootEntry.manifest.number_type), lambda];
  return (manifest.graphical?.elisions ?? []).flatMap((elision) => {
    const entry = byId.get(elision.timeline);
    if (entry === undefined) return [];
    if ((groupsHolding(manifest, elision.timeline, ancestry) ?? []).length > 0) return [];
    const own = (value: StoredElision["start"]) =>
      add(entry.start, coordinateValue(value, entry.manifest.number_type));
    const [a, b] = clipped(own(elision.start), own(elision.end), root);
    return [{ elision, entry, a, b }];
  });
}

/** `auto` read as `custom` where the root has stored card elisions, else as `proportional`. */
export function drawnMode(style: Style, stored: boolean): DrawnMode {
  const mode = style["elision-mode"];
  if (mode === "auto") return stored ? "custom" : "proportional";
  return mode;
}

/** A piece of a card's gap before it is placed on the axis. */
interface CardPiece {
  readonly source: GapSource;
  readonly a: Real;
  readonly b: Real;
  /** Its drawn width from its natural one. */
  readonly width: (n: number) => number;
  readonly entry: Entry | undefined;
}

/**
 * The pieces of the stored card elisions a card draws under `custom` (section
 * 8.9, Pieces), in canonical order: each drawn where its gap is displayed and
 * its timeline is drawn, what of its stretch lies outside the protected span
 * `protect` and outside every piece drawn before it, each at the width its
 * `width` sets as if whole. An elision that is not drawn takes nothing from
 * the elisions after it.
 */
function storedPieces(
  scope: Scope,
  stored: readonly CardElision[],
  protect: Stretch | null,
): CardPiece[] {
  const { L, lambda } = scope;
  const taken: Stretch[] = protect === null ? [] : [protect];
  const pieces: CardPiece[] = [];
  for (const { elision, entry, a: from, b: to } of stored) {
    const timeline = entry.manifest;
    const own = (value: Real) => difference(value, entry.start);
    const width = widthOf(elision, timeline);
    for (const [a, b] of outside(from, to, taken)) {
      const start = own(a);
      const end = own(b);
      const source = sourceOf(
        scope,
        timeline,
        idAddress(elision.id),
        entry,
        elisionWords(elision.display),
        storedTexts(elision, timeline, start, end),
        { origin: "stored", start, end, um: scope.u(midpointOf(a, b)), framed: false },
      );
      // A piece that is not drawn takes nothing from the pieces after it.
      if (!entry.drawn || !shown(source.style)) continue;
      taken.push([a, b]);
      pieces.push({ source, a, b, width: (n) => drawnWidth(width, n, L, lambda), entry });
    }
  }
  return pieces;
}

/** `(a + b) / 2` in the tower (section 3.1). */
function midpointOf(a: Real, b: Real): Real {
  const sum = add(a, b);
  return typeof sum === "number" ? sum / 2 : sum.multiply(Rational.of([1n, 2n]));
}

/**
 * The card's axis of `pieces`, the carried gaps `carried` and the seams `seams`, exact on its
 * root's axis.
 */
function cardAxisOf(
  scope: Scope,
  pieces: readonly CardPiece[],
  carried: readonly Placing[],
  seams: readonly Seam[] = [],
): CardAxis {
  const { L, u } = scope;
  const placing = pieces.map((piece): Placing => {
    const ua = u(piece.a);
    const ub = u(piece.b);
    const n = L * ub - L * ua;
    return { ...piece, ua, ub, n, g: piece.width(n) };
  });
  return axisOf(L, u, [...placing, ...carried], EXACT, seams);
}

/**
 * The axis of an ungrouped root's card (section 8.9): under `custom`, its
 * stored card elisions; none otherwise, its card having no protected span
 * and deriving nothing. Undefined where it draws no gap.
 */
export function ungroupedAxis(scope: Scope, mode: DrawnMode): CardAxis | undefined {
  if (mode !== "custom") return undefined;
  const pieces = storedPieces(scope, cardElisionsOf(scope), null);
  return pieces.length === 0 ? undefined : cardAxisOf(scope, pieces, []);
}

/** A stretch of a timeline at one depth, before it is drawn with its middle left out. */
interface DerivedPiece {
  readonly entry: Entry;
  readonly a: Real;
  readonly b: Real;
}

/**
 * The pieces an ancestor card derives (section 8.9, Derived elisions): for
 * the member's ancestors `chain` (`A1` the root to `Ak`, by ID), depth `j`
 * holds `Aj` and every other child of `A(j − 1)` the card draws, depth 1 the
 * root alone; from the deepest of `depths` up, within a depth in traversal
 * order, each stretch of a timeline's span outside the protected span
 * `protect`, the spans of the deeper chosen depths and every piece found
 * before.
 */
function derivedPieces(
  scope: Scope,
  protect: Stretch,
  chain: readonly string[],
  depths: readonly number[],
): DerivedPiece[] {
  const { rootEntry, lambda, index } = scope;
  const root: Stretch = [zero(rootEntry.manifest.number_type), lambda];
  const atDepth = (j: number): readonly Entry[] => {
    if (j === 1) return rootEntry.drawn ? [rootEntry] : [];
    const parent = scope.entries.find((entry) => entry.manifest.id === chain[j - 2]);
    if (parent === undefined) return [];
    return (index.childrenByParent.get(parent) ?? []).filter((entry) => entry.drawn);
  };
  const covered: Stretch[] = [protect];
  const found: DerivedPiece[] = [];
  for (const j of [...depths].reverse()) {
    const timelines = atDepth(j);
    const pieces: DerivedPiece[] = [];
    for (const entry of timelines) {
      const [start, end] = clipped(entry.start, entry.end, root);
      for (const [a, b] of outside(start, end, [
        ...covered,
        ...pieces.map((p) => [p.a, p.b] as const),
      ])) {
        pieces.push({ entry, a, b });
      }
    }
    found.push(...pieces);
    for (const entry of timelines) {
      const [start, end] = clipped(entry.start, entry.end, root);
      if (compareReal(start, end) < 0) covered.push([start, end]);
    }
  }
  return found;
}

/** An integer as a value of `numberType`: the integer, the double equal to it, or `[n, 1]`. */
export function wholeUnit(value: bigint, numberType: NumberType): Real {
  return numberType === "float" ? Number(value) : Rational.fromParts(value, 1n);
}

/** `⌊value⌋` or `⌈value⌉` of a value of the tower, as an integer. */
export function rounded(value: Real, up: boolean): bigint {
  if (typeof value === "number") return BigInt(up ? Math.ceil(value) : Math.floor(value));
  const { numerator, denominator } = value;
  const quotient = numerator / denominator;
  const exact = quotient * denominator === numerator;
  if (exact) return quotient;
  // BigInt division truncates towards zero.
  if (numerator < 0n) return up ? quotient : quotient - 1n;
  return up ? quotient + 1n : quotient;
}

/**
 * A derived piece over `[a, b]` of its timeline's own axis (`[aR, bR]` on the
 * root's), natural width `n`, drawn `W = r × n` wide with its middle left out
 * (section 8.9): `h = (W − min(32, W)) / 2`, `k = n / (b − a)`; its elided
 * coordinates `start = max(a, ⌊a + h / k⌋)` and `end = min(b, ⌈b − h / k⌉)`,
 * whole units of its timeline; its visible ends at their natural widths `e1`
 * and `e2`, its gap `g = W − e1 − e2`.
 */
function middleOf(
  scope: Scope,
  piece: DerivedPiece,
  r: number,
): {
  readonly start: Real;
  readonly end: Real;
  readonly a: Real;
  readonly b: Real;
  readonly g: number;
} {
  const { L, u } = scope;
  const { entry } = piece;
  const numberType = entry.manifest.number_type;
  const own = (value: Real) => difference(value, entry.start);
  const a = own(piece.a);
  const b = own(piece.b);
  const n = L * u(piece.b) - L * u(piece.a);
  const W = r * n;
  const h = (W - Math.min(STANDARD_GAP, W)) / 2;
  const span = difference(b, a);
  const k = n / (typeof span === "number" ? span : toFloat(span));
  // `h / k` on the timeline's axis; 0 where nothing is left out (`h = 0`), which a card of length
  // 0 (`n = 0`, so `k = 0`) would otherwise make `0 / 0`.
  const shift = h === 0 ? 0 : h / k;
  const lower = wholeUnit(rounded(add(a, shift), false), numberType);
  const upper = wholeUnit(rounded(add(b, -shift), true), numberType);
  const start = compareReal(lower, a) > 0 ? lower : a;
  const end = compareReal(upper, b) < 0 ? upper : b;
  const startR = add(entry.start, start);
  const endR = add(entry.start, end);
  const e1 = L * u(startR) - L * u(piece.a);
  const e2 = L * u(piece.b) - L * u(endR);
  return { start, end, a: startR, b: endR, g: W - e1 - e2 };
}

/** A frame's gap carried into an ancestor card behind it: its stretch there and the frame's widths. */
export interface CarriedGap {
  readonly gap: Gap;
  readonly a: Real;
  readonly b: Real;
}

/** What an ancestor card decides of its elisions (section 8.9). */
export interface AncestorElisions {
  readonly mode: DrawnMode;
  readonly proportion: number;
  readonly automatic: boolean;
  readonly depths: readonly number[];
  readonly display: readonly ElisionWord[];
  readonly axis: CardAxis | undefined;
}

/**
 * The room an ancestor card leaves under its frame on either side of its protected span (section
 * 8.8, step 2): `left` from the frame's left edge to the start `x0` of its member drawings, `right`
 * from the end `x0 + L'` of its members' drawn length to its right edge, in its item coordinates.
 */
export interface FrameRoom {
  readonly left: number;
  readonly right: number;
}

/**
 * The elisions of the ancestor card of the root of `scope` aligned to a
 * member whose ancestors are `chain` (section 8.9): its protected span
 * `protect`; the gaps `carried` from its frame, drawn in every mode; under
 * `custom` its stored card elisions, under `proportional` the elisions it
 * derives at the proportion `r` (`proportionOf`, called only where it is
 * read) while `r < 1`, each clipped around the protected span; and the seams
 * at the protected span's ends as wide as the room `room` its frame leaves
 * there (section 8.8, step 2), so that what lies outside the span lies
 * outside the frame.
 */
export function ancestorElisions(
  scope: Scope,
  style: Style,
  protect: Stretch,
  chain: readonly string[],
  carried: readonly CarriedGap[],
  room: FrameRoom,
  proportionOf: () => number,
): AncestorElisions {
  const stored = cardElisionsOf(scope);
  const mode = drawnMode(style, stored.length > 0);
  const display = derivedDisplay(style);
  const asked = depthsOf(style);
  const depths =
    asked === "auto"
      ? chain.map((_, index) => index + 1)
      : asked.filter((depth) => depth >= 1 && depth <= chain.length);
  const stated = style["elision-proportion"];
  const automatic = stated === "auto";
  let pieces: CardPiece[] = [];
  let r = 1;
  if (mode === "custom") pieces = storedPieces(scope, stored, protect);
  if (mode === "proportional") {
    r = automatic ? proportionOf() : stated;
    if (r < 1)
      pieces = derivedGaps(scope, derivedPieces(scope, protect, chain, depths), r, display);
  }
  // The seams lie on the root's axis in its number type: exact on an exact axis, though `λ` be a
  // float, binary64 on a float one.
  const onRoot = (value: Real): Real =>
    scope.rootEntry.manifest.number_type === "float" ? asFloat(value) : toRational(value);
  const start = onRoot(protect[0]);
  const end = onRoot(protect[1]);
  const seams: Seam[] = [
    { at: start, u: scope.u(start), width: room.left, inclusive: true },
    { at: end, u: scope.u(end), width: room.right, inclusive: false },
  ];
  const axis = ancestorAxis(scope, pieces, carried, seams);
  return { mode, proportion: r, automatic, depths, display, axis };
}

/**
 * The axis of an ancestor card's own pieces, its carried gaps and its seams; undefined without
 * any.
 */
function ancestorAxis(
  scope: Scope,
  pieces: readonly CardPiece[],
  carried: readonly CarriedGap[],
  seams: readonly Seam[],
): CardAxis | undefined {
  if (pieces.length === 0 && carried.length === 0 && seams.length === 0) return undefined;
  const placedCarried = carried.map(
    ({ gap, a, b }): Placing => ({
      source: gap.source,
      a,
      b,
      ua: scope.u(a),
      ub: scope.u(b),
      n: gap.n,
      g: gap.g,
      entry: undefined,
    }),
  );
  return cardAxisOf(scope, pieces, placedCarried, seams);
}

/** The gaps of derived pieces at the proportion `r`, each with its middle left out. */
function derivedGaps(
  scope: Scope,
  pieces: readonly DerivedPiece[],
  r: number,
  display: readonly ElisionWord[],
): CardPiece[] {
  return pieces.flatMap((piece): CardPiece[] => {
    const { entry } = piece;
    const timeline = entry.manifest;
    const middle = middleOf(scope, piece, r);
    const source = sourceOf(
      scope,
      timeline,
      partAddress(idAddress(timeline.id), "elision"),
      entry,
      display,
      { name: nameOf(timeline), coordinate: stretchText(timeline, middle.start, middle.end) },
      {
        origin: "default",
        start: middle.start,
        end: middle.end,
        um: scope.u(midpointOf(piece.a, piece.b)),
        framed: false,
      },
    );
    if (!shown(source.style) || compareReal(middle.a, middle.b) >= 0) return [];
    return [{ source, a: middle.a, b: middle.b, width: () => middle.g, entry }];
  });
}

/**
 * What a gap between two anchors of the root of `scope` drawn once behind a
 * row draws (section 8.8, Drawn once): an elision the card derives on its
 * root, `{id: R, part: ["elision"]}`, eliding `start` to `end`, its label
 * stack centred at the proportion `um`, by the card's `elision-display` (its
 * style `style`), as every derived gap. Where the two anchors leave no room for
 * a gap the card's axis has a seam, which draws nothing.
 */
export function arrangementSource(
  scope: Scope,
  style: Style,
  start: Real,
  end: Real,
  um: number,
): GapSource {
  const { rootEntry } = scope;
  const timeline = rootEntry.manifest;
  return sourceOf(
    scope,
    timeline,
    partAddress(idAddress(timeline.id), "elision"),
    rootEntry,
    derivedDisplay(style),
    { name: nameOf(timeline), coordinate: stretchText(timeline, start, end) },
    { origin: "arrangement", start, end, um, framed: false },
  );
}

/** What the proportion of an ancestor card reads (section 8.9), in its frame's item coordinates. */
export interface ProportionInputs {
  /** The view's width `VW` and height `VH`. */
  readonly view: View;
  /** The frame's scale `sG`, graphical length `L` and its members' drawn length `L'`. */
  readonly scale: number;
  readonly L: number;
  readonly drawnLength: number;
  /** The frame's width `Fw` and height `Fh` as drawn, its requests included, its left edge at 0. */
  readonly width: number;
  readonly height: number;
  /** `σ = K + N' + G'` of the root's drawing alone. */
  readonly sigma: number;
  /** The member's length `λ`, or its reach, and the root's stretches `EL` and `ER` left and right of it. */
  readonly lambda: Real;
  readonly EL: Real;
  readonly ER: Real;
}

const isZero = (value: Real): boolean => compareReal(value, 0) === 0;

/**
 * The proportion `r` of an ancestor card under `elision-proportion: auto`
 * (section 8.9): `min(1, λ / E × (L' / L), (B − dl) / (L × uL), (B − dr) /
 * (L × uR))`, a term left out where its stretch is 0 or, for a side, where
 * `B` is no larger than that side's reach: `dl = c + σ` and `dr = (Fw + K) −
 * c`, the card's line leaving the frame at its edges (section 8.8, step 2).
 */
export function ancestorProportion(inputs: ProportionInputs): number {
  const { view, scale, L, drawnLength, width, height, sigma, lambda, EL, ER } = inputs;
  const wide = times(4n, 5n, view.width);
  const high = times(4n, 5n, view.height);
  const zG = Math.min(4, wide / (scale * width), high / (scale * height));
  const zb = Math.min(zG, LEGIBLE_ZOOM);
  const B = wide / (2 * zb * scale);
  // The card's line leaves the frame at its left and right edges (section 8.8, step 2).
  const c = width / 2;
  const dl = c + sigma;
  const dr = width + K - c;
  const terms = [1];
  const E = add(EL, ER);
  if (!isZero(E)) terms.push(proportion(lambda, E) * (drawnLength / L));
  if (!isZero(EL) && B > dl) terms.push((B - dl) / (L * proportion(EL, lambda)));
  if (!isZero(ER) && B > dr) terms.push((B - dr) / (L * proportion(ER, lambda)));
  return Math.min(...terms);
}

/** One member of a frame as its elisions read it. */
export interface FrameMember {
  readonly scope: Scope;
}

/** A frame's group elisions laid out (section 8.9, Group elisions). */
export interface FrameElisions {
  readonly mode: DrawnMode;
  /** Its gaps from the left, over proportions of the frame; `a` and `b` the proportions as doubles. */
  readonly gaps: readonly Gap[];
  readonly runs: readonly Run[];
  /** `DG`, the sum of every shrink. */
  readonly total: number;
  /**
   * The frame's axis read by the member drawn in `scope`, each gap over its stretch on the
   * member's axis at its exact proportions (`Gap.exact`): exact on an exact axis, `p × λ` in
   * binary64 on a float one.
   */
  viewOf(scope: Scope): CardAxis;
  /**
   * The elided coordinates of each gap at its exact proportions (`Gap.exact`) on every timeline the
   * member cards draw (`ExposedGap.members`), card by card in display order (`elidedOnCard`).
   */
  membersOf(gap: Gap): ExposedGap["members"];
}

/**
 * The elided coordinates of a frame's gap at the exact proportions `p` and
 * `q` on the timelines the card of the member drawn in `scope` draws
 * (section 8.9, Group elisions): the member, then the other timelines of its
 * tree drawn in the card in traversal order, then its displayed ancestor
 * lines from its parent up to its root. On the member they are the exact
 * products of `p` and `q` and its length, a float at its exact binary value;
 * on another timeline those positions less its start on the member's axis.
 * Each is written in its timeline's number type as a groupstamp's coordinate
 * there is (section 2). A timeline other than the member is listed where its
 * span, its ends included, holds both, as a row crossing the gap does
 * (section 6.6); an ancestor of unknown length has no end. Without a value
 * (`valueless`: the member's length or that of the member holding the
 * elision is not known), every listed timeline has none.
 */
function elidedOnCard(
  scope: Scope,
  p: Rational,
  q: Rational,
  valueless: boolean,
): ExposedGap["members"] {
  const { member, rootEntry, entries, cascade } = scope;
  const length = toRational(scope.lambda);
  const from = p.multiply(length);
  const to = q.multiply(length);
  const holds = (start: Rational, end: Rational | null) =>
    compareReal(start, from) <= 0 && (end === null || compareReal(to, end) <= 0);
  const listed = (timeline: TimelineManifest, start: Rational) => ({
    timeline: timeline.id,
    start: valueless ? null : writtenIn(from.subtract(start), timeline.number_type),
    end: valueless ? null : writtenIn(to.subtract(start), timeline.number_type),
  });
  const tree = entries.flatMap((entry) => {
    const start = toRational(entry.start);
    if (entry === rootEntry) return [listed(entry.manifest, start)];
    return entry.drawn && holds(start, toRational(entry.end))
      ? [listed(entry.manifest, start)]
      : [];
  });
  // Each ancestor's start on the member's axis: the offsets from it down to the member, negated.
  let below = Rational.of(0n);
  const ancestors = [...member.ancestors].reverse().flatMap(({ timeline, offset }) => {
    below = below.add(toRational(coordinateValue(offset, timeline.number_type)));
    const start = Rational.of(0n).subtract(below);
    const own = lengthValue(timeline);
    const end = own === null ? null : start.add(toRational(own));
    const key = elementKey("ancestor", idAddress(timeline.id), timeline, rootEntry.key);
    const shownLine = rootEntry.drawn && shown(cascade.resolve(key, rootEntry.style));
    return shownLine && holds(start, end) ? [listed(timeline, start)] : [];
  });
  return [...tree, ...ancestors];
}

/**
 * The group elisions of the frame `holder` of the group `group` (section 8.9):
 * the stored elisions whose timelines lie in the group, in canonical order,
 * each where its gap is displayed and its timeline's line is drawn in the
 * frame, while the frame's `elision-mode` is `auto` or `custom`. Each
 * elision's stretch, carried to the axis of the member `M` it lies under,
 * becomes the exact proportions `[P, Q]` of `M`'s length or reach (the
 * exact quotients, a float at its exact binary value), clipped to `[0, 1]`;
 * each draws what of its stretch lies outside every piece drawn before it,
 * compared exactly, so an end where an earlier piece cut it is that piece's
 * exact end (`Gap.exact`) and the gaps carried into an ancestor card meet
 * exactly where the frame's meet. The doubles `p` and `q` nearest them place
 * the gap, at the natural width `n = L × q − L × p` and the drawn width its
 * `width` sets (`span` read with `M`'s length); an elision that is not drawn
 * takes nothing from the elisions after it. A piece's elided coordinates on
 * its timeline are the elision's own `start` and `end` where it is the whole
 * stretch; a cut piece's, on an exact axis, the exact positions at `P` and
 * `Q` less the timeline's start, written in its number type, and on a float
 * axis `p × λ` less that start in binary64. Undefined where it draws no gap.
 */
export function frameElisions(
  members: readonly FrameMember[],
  group: string,
  holder: Holder,
  L: number,
): FrameElisions | undefined {
  const first = members[0]?.scope;
  if (first === undefined) return undefined;
  const { manifest } = first;
  const mode = drawnMode(holder.style, true);
  if (mode !== "custom") return undefined;
  const { ancestry } = indexOf(manifest);
  // The pieces drawn so far, by their exact proportions.
  const taken: (readonly [Rational, Rational])[] = [];
  // Each piece with the member it lies under and its timeline there.
  const placing: (Placing & { readonly owner: Scope; readonly entry: Entry })[] = [];
  for (const elision of manifest.graphical?.elisions ?? []) {
    const holding = groupsHolding(manifest, elision.timeline, ancestry) ?? [];
    if (!holding.some((each) => each.id === group)) continue;
    const owner = members.find(({ scope }) =>
      scope.entries.some((entry) => entry.manifest.id === elision.timeline),
    )?.scope;
    const entry = owner?.entries.find((each) => each.manifest.id === elision.timeline);
    if (owner === undefined || entry === undefined) continue;
    const timeline = entry.manifest;
    const own = (value: StoredElision["start"]) =>
      add(entry.start, coordinateValue(value, timeline.number_type));
    const from = exactQuotient(own(elision.start), owner.lambda);
    const to = exactQuotient(own(elision.end), owner.lambda);
    const width = widthOf(elision, timeline);
    // A cut end on the timeline's own axis: exact on an exact axis, binary64 on a float one.
    const onTimeline = (P: Rational): Real =>
      timeline.number_type === "float"
        ? difference(atProportion(toFloat(P), owner.lambda), entry.start)
        : writtenIn(
            P.multiply(toRational(owner.lambda)).subtract(toRational(entry.start)),
            timeline.number_type,
          );
    for (const [P, Q] of outside(clippedToUnit(from), clippedToUnit(to), taken)) {
      const p = toFloat(P);
      const q = toFloat(Q);
      const whole = compareReal(P, from) === 0 && compareReal(Q, to) === 0;
      const start = whole ? coordinateValue(elision.start, timeline.number_type) : onTimeline(P);
      const end = whole ? coordinateValue(elision.end, timeline.number_type) : onTimeline(Q);
      const source = sourceOf(
        first,
        timeline,
        idAddress(elision.id),
        holder,
        elisionWords(elision.display),
        storedTexts(elision, timeline, start, end),
        { origin: "stored", start, end, um: (p + q) / 2, framed: true },
      );
      // A piece that is not drawn takes nothing from the pieces after it.
      if (!entry.drawn || !shown(source.style)) continue;
      taken.push([P, Q]);
      const n = L * q - L * p;
      const wanted =
        width === null
          ? STANDARD_GAP
          : "ratio" in width
            ? width.ratio * n
            : "span" in width
              ? L * proportion(width.span, owner.lambda)
              : width.canvas;
      placing.push({
        source,
        a: p,
        b: q,
        ua: p,
        ub: q,
        exact: [P, Q],
        n,
        g: wanted > n ? n : wanted,
        owner,
        entry,
      });
    }
  }
  if (placing.length === 0) return undefined;
  const byProportion: Comparing = {
    inside: (gap, value) => gap.ua < (value as number) && (value as number) < gap.ub,
    before: (gap, value) => gap.ub <= (value as number),
    holds: (gap, start, end) =>
      (start as number) <= gap.ua && (end === null || (end as number) >= gap.ub),
  };
  const frame = axisOf(L, (value) => value as number, placing, byProportion);
  const viewOf = (scope: Scope): CardAxis => {
    const { u, lambda, rootEntry } = scope;
    // A gap's stretch on the member's axis at its exact proportions: exact on an exact axis, `p ×
    // λ` in binary64 on a float one, by the member's number type, never by the kind of `λ`.
    const exactAxis = rootEntry.manifest.number_type !== "float";
    const at = (P: Rational): Real =>
      exactAxis ? P.multiply(toRational(lambda)) : atProportion(toFloat(P), lambda);
    const viewed = frame.gaps.map((gap): Placing => {
      const placed = placing.find((each) => each.source === gap.source);
      const labelled = placed?.owner === scope ? placed.entry : undefined;
      if (gap.exact === undefined) throw new Error("a frame's gap holds its exact proportions");
      const [P, Q] = gap.exact;
      return {
        source: gap.source,
        a: at(P),
        b: at(Q),
        ua: gap.ua,
        ub: gap.ub,
        n: gap.n,
        g: gap.g,
        entry: labelled,
      };
    });
    const proportionOfEnd = (end: Real | null) =>
      end === null ? null : rootEntry.open && compareReal(end, lambda) === 0 ? 1 : u(end);
    return axisOf(scope.L, u, viewed, {
      inside: (gap, value) => gap.ua < u(value) && u(value) < gap.ub,
      before: (gap, value) => gap.ub <= u(value),
      holds: (gap, start, end) => {
        const to = proportionOfEnd(end);
        return u(start) <= gap.ua && (to === null || to >= gap.ub);
      },
    });
  };
  const membersOf = (gap: Gap): ExposedGap["members"] => {
    if (gap.exact === undefined) throw new Error("a frame's gap holds its exact proportions");
    const placed = placing.find((each) => each.source === gap.source);
    const [p, q] = gap.exact;
    const valueless = placed === undefined || placed.owner.rootEntry.open;
    return members.flatMap(({ scope }) =>
      elidedOnCard(scope, p, q, valueless || scope.rootEntry.open),
    );
  };
  return {
    mode,
    gaps: frame.gaps,
    runs: frame.runs,
    total: frame.total,
    viewOf,
    membersOf,
  };
}

/**
 * The gaps of the frame `frame` carried into the ancestor card of a root of
 * number type `numberType` that starts at `ts` on the axis of the member it
 * is aligned to, of length or reach `lambda` (section 8.9, Carried gaps):
 * each over the root's stretch `−ts + p × λ` to `−ts + q × λ`, `p` and `q`
 * the exact proportions of the frame's gap, with the frame's widths. The
 * root's number type decides, never the kind of `λ` or `ts`: on an exact
 * axis the stretch is exact, `λ` and `ts` read at their exact values (a
 * float at its exact binary value); on a float axis it is combined as
 * section 3.1 combines values, a double.
 */
export function carriedGaps(
  frame: FrameElisions | undefined,
  ts: Real,
  lambda: Real,
  numberType: NumberType,
): CarriedGap[] {
  if (frame === undefined) return [];
  const at = (p: Rational): Real =>
    numberType === "float"
      ? asFloat(
          add(negate(ts), typeof lambda === "number" ? toFloat(p) * lambda : p.multiply(lambda)),
        )
      : p.multiply(toRational(lambda)).subtract(toRational(ts));
  return frame.gaps.map((gap) => {
    if (gap.exact === undefined) throw new Error("a frame's gap holds its exact proportions");
    const [p, q] = gap.exact;
    return {
      gap: { ...gap, source: { ...gap.source, origin: "carried", labels: [], framed: false } },
      a: at(p),
      b: at(q),
    };
  });
}

/** A row of a card that a gap may cross (section 6.6): its ordinate and its span. */
export interface CrossingRow {
  readonly y: number;
  readonly start: Real;
  /** Its end; null where it is open to the right. */
  readonly end: Real | null;
}

/**
 * The ordinates of the rows among `rows` (in the order of section 8.5) that
 * cross `gap` on `axis`.
 */
export function crossingRows(axis: CardAxis, gap: Gap, rows: readonly CrossingRow[]): number[] {
  return rows.filter((row) => axis.crosses(gap, row.start, row.end)).map((row) => row.y);
}

/**
 * A label of a gap's stack (section 6.6): drawn centred on the gap's middle
 * just below its ellipsis, its baseline `below` under the ellipsis's
 * ordinate `ym`, which the card or frame drawing the gap gives.
 */
export type StackLabel = Omit<TextElement, "x" | "baseline"> & { readonly below: number };

/**
 * The elements of one drawing of a gap (sections 6.6, 7.2 and 8.5): its
 * rectangle from `x1` to `x2` and `yt` to `yb` with its continuations on the
 * rows `rows`, where listed; its one ellipsis at the gap's middle `xm` and
 * the middle `ym = (yt + yb) / 2` of its height, where the gap is at least 20
 * wide; then its labels `labels`, centred on `xm` just below `ym`, whether or
 * not the ellipsis is drawn.
 */
export function gapElements(
  gap: Gap,
  x1: number,
  x2: number,
  yt: number,
  yb: number,
  rows: readonly number[],
  labels: readonly StackLabel[],
): DrawnElement[] {
  const { source } = gap;
  const xm = (x1 + x2) / 2;
  const ym = (yt + yb) / 2;
  const ellipses: EllipsisElement[] =
    source.ellipsis === null || x2 - x1 < ELLIPSIS_GAP
      ? []
      : [
          {
            type: "ellipsis",
            address: partAddress(source.address, "ellipsis"),
            style: source.ellipsis,
            x: xm,
            y: ym,
            r: ELLIPSIS_RADIUS,
            spacing: ELLIPSIS_SPACING,
          },
        ];
  return [
    {
      type: "elision",
      address: source.address,
      style: source.style,
      x1,
      x2,
      yt,
      yb,
      continuations: source.continuation ? [...rows] : [],
      elided: { timeline: source.timeline.id, start: source.start, end: source.end },
      origin: source.origin,
    },
    ...ellipses,
    ...labels.map(
      ({ below, ...label }): TextElement => ({ ...label, x: xm, baseline: ym + below }),
    ),
  ];
}

/**
 * The distance of the baseline of a label of a gap's stack on line `n`, from
 * 1, below its ellipsis's ordinate (section 6.6): the dot radius, the label
 * gap, `n − 1` lines `h` high and the ascent `a`, of the font size of the
 * markers band that takes the stack's room.
 */
export const stackLabelBelow = (n: number, h: number, a: number): number =>
  ELLIPSIS_RADIUS + LABEL_GAP + (n - 1) * h + a;

/** The first line of each drawn gap stack of an axis, by the axis. */
const stackLinesOf = new WeakMap<CardAxis, ReadonlyMap<Gap, number>>();

/**
 * The line, from 1, on which the label stack of each gap of `axis` drawing one
 * starts below its ellipsis (section 6.6): one first fit (section 6.3) of the
 * stacks, in the order of the gaps from the left, into tiers counted in lines,
 * each stack one item as many lines high as it has labels, its extent that of
 * one label as wide as its widest label centred on the gap's middle `xm`, `L ×
 * u − D` standing for `xm − x0`. A tier is as many lines high as its highest
 * stack, and a stack starts on its tier's first line: so a stack that would
 * cover a neighbouring gap's drawn below the same ellipses moves to the next
 * level, and no gap widens for it. A gap draws its stack where it is displayed
 * and lists a label, a frame's gap across its frame and a card's gap where its
 * timeline's markers band takes the stack's room (`Gap.entry`). Memoised by the
 * axis.
 */
export function stackLines(axis: CardAxis): ReadonlyMap<Gap, number> {
  const known = stackLinesOf.get(axis);
  if (known !== undefined) return known;
  const stacked = axis.gaps.filter(
    ({ source, entry }) =>
      source.labels.length > 0 && shown(source.style) && (source.framed || entry !== undefined),
  );
  const tiers = tiersOf(
    stacked.map(({ source, left, right }) => ({
      x: (left + right) / 2,
      lines: source.labels.length,
      width: Math.max(...source.labels.map((label) => label.width)),
    })),
  );
  const lines = new Map(stacked.map((gap, index) => [gap, nth(tiers.first, index)]));
  stackLinesOf.set(axis, lines);
  return lines;
}

/**
 * The label stack of a gap in a markers band, at its unturned place (section
 * 6.4, Markers): line `n` of the band's tiers starting `tip + 13 + 2 + (n −
 * 1) × h` out from the line, `tip = c + w / 2`.
 */
export const stackLineStart = (tip: number, n: number, h: number): number =>
  tip + MARKER_HEIGHT + LABEL_GAP + (n - 1) * h;

/** The exposed form of a gap drawn from `x1` to `x2` in block coordinates. */
export function exposedGap(
  gap: Gap,
  x1: number,
  x2: number,
  members: ExposedGap["members"],
): ExposedGap {
  const { source } = gap;
  return {
    address: source.address,
    origin: source.origin,
    timeline: source.timeline.id,
    start: source.start,
    end: source.end,
    natural: gap.n,
    drawn: gap.g,
    x1,
    x2,
    members,
  };
}

/** The forms an elision's `width` takes (section 2): absent for the standard gap, or one of three. */
export type WidthForm = "standard" | "ratio" | "span" | "canvas";

/** What an elision's `width` stores, as a manifest writes it; `null` for the standard gap. */
export type StoredWidth =
  | { readonly ratio: number }
  | { readonly span: Real }
  | { readonly canvas: number }
  | null;

/**
 * The stored `width` of the form `form` that draws the gap `gap` as wide as
 * it is drawn (section 8.9, Widths), in the item coordinates of its card or
 * frame of graphical length `L`, `lambda` the length or reach a `span` is
 * read with (the root's in a card, the member's in a frame) and
 * `numberType` the number type of the elision's timeline: `null` for the
 * standard gap; `{ratio: g / n}`; `{span: g × λ / L}`, exact on an exact axis
 * (the doubles at their exact binary values), the nearest integer on an
 * `int` axis, ties to even, a double on a `float` axis; `{canvas: g}`.
 */
export function widthAs(
  form: WidthForm,
  gap: ExposedGap,
  L: number,
  lambda: Real,
  numberType: NumberType,
): StoredWidth {
  switch (form) {
    case "standard":
      return null;
    case "ratio":
      return { ratio: gap.drawn / gap.natural };
    case "canvas":
      return { canvas: gap.drawn };
    case "span": {
      if (numberType === "float" || typeof lambda === "number") {
        const length = typeof lambda === "number" ? lambda : toFloat(lambda);
        return { span: (gap.drawn * length) / L };
      }
      return {
        span: writtenIn(fromFloat(gap.drawn).multiply(lambda).divide(fromFloat(L)), numberType),
      };
    }
  }
}
