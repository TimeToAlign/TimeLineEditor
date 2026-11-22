/**
 * Elisions (`docs/drawing.md` in TimeToShare, sections 2, 3.2, 6.6 and
 * 8.9): the pieces of the elisions a card draws, stored or default, their
 * widths, the elided axis they make, linear piece by piece, and their strips
 * with their labels.
 */

import {
  idAddress,
  type ManifestGraphical,
  type OwnerAddress,
  partAddress,
  type TimelineManifest,
} from "@timetoalign/tilie-core";
import { type ElementKey, elementKey } from "@timetoalign/tilie-core/drawing";
import { compareReal, type Real } from "@timetoalign/tilie-core/numbers";
import { isJsonFloat } from "@timetoalign/timetoshare";
import type { Style } from "./cascade.ts";
import { K, LABEL_GAP } from "./constants.ts";
import type { ElisionElement, TextElement, View } from "./elements.ts";
import { cleanText } from "./metrics.ts";
import { cutText, nameOf } from "./names.ts";
import {
  add,
  coordinateText,
  coordinateValue,
  negate,
  proportion,
  times,
  zero,
} from "./numbers.ts";
import { type Entry, type Scope, shown } from "./traversal.ts";

/** The words an elision's `display` lists: its strip and its two labels (section 2). */
export type ElisionWord = "strip" | "name" | "coordinate";

const EVERY_WORD: readonly ElisionWord[] = ["strip", "name", "coordinate"];

/** `Z`, the double nearest 5/7: the zoom at which a row of the default pitch 14 lies 10 from the next. */
const LEGIBLE_ZOOM = 5 / 7;

/** A stretch `[a, b]` of the root's axis, `a < b`. */
export type Stretch = readonly [Real, Real];

/** An elision's `width` (section 2), each number read as the form states it. */
export type ElisionWidth =
  | { readonly ratio: number }
  | { readonly span: Real }
  | { readonly canvas: number };

/**
 * One piece of an elision a card draws (section 8.9): a stretch `[a, b]` of
 * the card's root axis lying on the timeline `entry`, drawn as one strip.
 */
export interface Piece {
  readonly entry: Entry;
  /** Its address: `{id: E}` for a stored elision `E`, `{id: T, part: ["elision"]}` for a default one. */
  readonly address: OwnerAddress;
  /** The elision's key, held by the line of `entry` (its node, for a segment without a line). */
  readonly key: ElementKey;
  readonly style: Style;
  readonly a: Real;
  readonly b: Real;
  /** Its elision's `width`; null for none, a default elision's included. */
  readonly width: ElisionWidth | null;
  readonly display: readonly ElisionWord[];
}

/** A piece with its widths (sections 3.2 and 8.9). */
export interface Strip extends Piece {
  /** Its natural width `n = L × ub − L × ua`. */
  readonly n: number;
  /** Its drawn width `w`, at most `n`. */
  readonly w: number;
  /** Its shrink `n − w`. */
  readonly shrink: number;
  /** `L × u − D` at its start and its end: its edges from the root's start. */
  readonly left: number;
  readonly right: number;
}

/** A strip's edges `x(a)` and `x(b)` in item coordinates. */
export interface StripEdges {
  readonly left: number;
  readonly right: number;
}

/**
 * The elided axis of a card (section 3.2): its strips from the left, and the
 * distance `L × u − D` of a position from the root's start, `D` the shrinks
 * of the strips ending at or before it, summed from the left.
 */
export interface ElidedAxis {
  readonly strips: readonly Strip[];
  /** `L × u − D` of a position in no strip. */
  relative(value: Real): number;
  /** The strip a position lies in, its ends excluded; undefined for a position in no strip. */
  stripOf(value: Real): Strip | undefined;
  /** The sum of every shrink, `D` at the root's end. */
  readonly total: number;
  /** `D` at a position: the shrinks of the strips ending at or before it, summed from the left. */
  shrinkBefore(value: Real): number;
}

/** What a card's elisions are, before its default proportion is known. */
export interface CardElisions {
  /**
   * A stored elision, displayed or not, lies on the card's root or on a descendant of it: the
   * card then draws no default elisions (section 8.9, Defaults).
   */
  readonly stored: boolean;
  /**
   * The pieces of the stored elisions the card draws, in canonical order, each clipped to the
   * root, to what lies outside `protect` (an ancestor card's protected span) and outside every
   * piece taken before it.
   */
  storedPieces(protect: Stretch | null): readonly Piece[];
  /**
   * The default elisions of an ancestor card whose member's ancestors are `chain` (`A1` the
   * root to `Ak` the member's parent, by ID), outside the protected span `protect`, generation
   * by generation from `k` up to 1 (section 8.9, Defaults).
   */
  defaultPieces(protect: Stretch, chain: readonly string[]): readonly Piece[];
  /** The elided axis of `pieces`, the pieces without `width` drawn at `r` times their natural width. */
  axis(pieces: readonly Piece[], r: number): ElidedAxis;
  /**
   * The default proportion of an ungrouped root's card drawing `pieces` (section 8.9): `min(1,
   * Rf / E)`, `E` the summed lengths of its pieces and `Rf` what remains of the root; 1 when
   * either is 0.
   */
  ungroupedProportion(pieces: readonly Piece[]): number;
}

/** A JSON number of the manifest as a double. */
function jsonNumber(value: unknown): number {
  return isJsonFloat(value) ? value.value : Number(value);
}

const isZero = (value: Real): boolean => compareReal(value, 0) === 0;

/** The stretch `[a, b]` no further than the root's start and end `root`, ends compared exactly. */
function clipped(a: Real, b: Real, [start, end]: Stretch): Stretch {
  return [compareReal(a, start) < 0 ? start : a, compareReal(b, end) > 0 ? end : b];
}
const difference = (left: Real, right: Real): Real => add(left, negate(right));

/**
 * What of the stretch `[a, b]` lies outside every one of `covered`: none,
 * one or several stretches, from the left, each with a length; ends compare
 * exactly.
 */
export function outside(a: Real, b: Real, covered: readonly Stretch[]): Stretch[] {
  let left: Stretch[] = compareReal(a, b) < 0 ? [[a, b]] : [];
  for (const [c, d] of covered) {
    left = left.flatMap(([p, q]): Stretch[] => {
      if (compareReal(d, p) <= 0 || compareReal(q, c) <= 0) return [[p, q]];
      const kept: Stretch[] = [];
      if (compareReal(p, c) < 0) kept.push([p, c]);
      if (compareReal(d, q) < 0) kept.push([d, q]);
      return kept;
    });
  }
  return left.sort(([p], [q]) => compareReal(p, q));
}

/**
 * The elisions of the card drawing the member drawing `scope` (section 8.9),
 * an ungrouped root's card or an ancestor card.
 */
export function cardElisions(scope: Scope): CardElisions {
  const { manifest, entries, rootEntry, lambda, L, u, cascade } = scope;
  const byId = new Map(entries.map((entry) => [entry.manifest.id, entry]));
  const elisions = (manifest.graphical?.elisions ?? []).filter((elision) =>
    byId.has(elision.timeline),
  );
  const root: Stretch = [zero(rootEntry.manifest.number_type), lambda];
  const styleOf = (entry: Entry, address: OwnerAddress) => {
    const key = elementKey("elision", address, entry.manifest, entry.key);
    return { address, key, style: cascade.resolve(key, entry.style) };
  };
  // A piece is drawn where its timeline is drawn and it is displayed with its strip.
  const drawn = (entry: Entry, style: Style, display: readonly ElisionWord[]) =>
    entry.drawn && shown(style) && display.includes("strip");

  const storedPieces = (protect: Stretch | null): Piece[] => {
    const taken: Stretch[] = protect === null ? [] : [protect];
    const pieces: Piece[] = [];
    for (const elision of elisions) {
      const entry = byId.get(elision.timeline);
      if (entry === undefined) continue;
      const display = EVERY_WORD.filter((word) => elision.display.includes(word));
      const { address, key, style } = styleOf(entry, idAddress(elision.id));
      if (!drawn(entry, style, display)) continue;
      const own = (value: Parameters<typeof coordinateValue>[0]) =>
        add(entry.start, coordinateValue(value, entry.manifest.number_type));
      const [from, to] = clipped(own(elision.start), own(elision.end), root);
      const width = widthOf(elision.width, entry.manifest);
      for (const [a, b] of outside(from, to, taken)) {
        pieces.push({ entry, address, key, style, a, b, width, display });
        taken.push([a, b]);
      }
    }
    return pieces;
  };

  const defaultPieces = (protect: Stretch, chain: readonly string[]): Piece[] => {
    // Generation 1 holds the root; generation j the drawn children of `A(j − 1)`, `Aj` among them.
    const generations: Entry[][] = [
      rootEntry.drawn ? [rootEntry] : [],
      ...chain
        .slice(0, -1)
        .map((parent) =>
          (scope.index.childrenByParent.get(parent) ?? []).filter((entry) => entry.drawn),
        ),
    ];
    const covered: Stretch[] = [protect];
    const found: Piece[] = [];
    for (const generation of generations.toReversed()) {
      for (const entry of generation) {
        const [start, end] = clipped(entry.start, entry.end, root);
        const address = partAddress(idAddress(entry.manifest.id), "elision");
        const { key, style } = styleOf(entry, address);
        for (const [a, b] of outside(start, end, covered)) {
          found.push({ entry, address, key, style, a, b, width: null, display: EVERY_WORD });
          covered.push([a, b]);
        }
      }
    }
    return found.filter((piece) => drawn(piece.entry, piece.style, piece.display));
  };

  const axis = (pieces: readonly Piece[], r: number): ElidedAxis => {
    const ordered = [...pieces].sort((left, right) => compareReal(left.a, right.a));
    const strips: Strip[] = [];
    let D = 0;
    for (const piece of ordered) {
      const n = L * u(piece.b) - L * u(piece.a);
      const wanted = drawnWidth(piece.width, n, r, L, lambda);
      const w = wanted > n ? n : wanted;
      const shrink = n - w;
      const left = L * u(piece.a) - D;
      D = D + shrink;
      strips.push({ ...piece, n, w, shrink, left, right: L * u(piece.b) - D });
    }
    const shrinkBefore = (value: Real): number => {
      let before = 0;
      strips.forEach((strip) => {
        if (compareReal(strip.b, value) <= 0) before = before + strip.shrink;
      });
      return before;
    };
    return {
      strips,
      relative: (value) => L * u(value) - shrinkBefore(value),
      stripOf: (value) =>
        strips.find((strip) => compareReal(strip.a, value) < 0 && compareReal(value, strip.b) < 0),
      total: D,
      shrinkBefore,
    };
  };

  const ungroupedProportion = (pieces: readonly Piece[]): number => {
    const ordered = [...pieces].sort((left, right) => compareReal(left.a, right.a));
    let E: Real | undefined;
    for (const piece of ordered) {
      const length = difference(piece.b, piece.a);
      E = E === undefined ? length : add(E, length);
    }
    if (E === undefined || isZero(E)) return 1;
    const Rf = difference(lambda, E);
    if (isZero(Rf)) return 1;
    return Math.min(1, proportion(Rf, E));
  };

  return {
    stored: elisions.length > 0,
    storedPieces,
    defaultPieces,
    axis,
    ungroupedProportion,
  };
}

/** An elision's `width` read on the axis of the timeline it lies on; null without one. */
function widthOf(width: StoredWidth, timeline: TimelineManifest): ElisionWidth | null {
  if (width === undefined) return null;
  if (width.ratio !== undefined) return { ratio: jsonNumber(width.ratio) };
  if (width.canvas !== undefined) return { canvas: jsonNumber(width.canvas) };
  if (width.span !== undefined) return { span: coordinateValue(width.span, timeline.number_type) };
  return null;
}

/** A stored elision's `width`, as the manifest holds it. */
type StoredWidth = NonNullable<ManifestGraphical["elisions"]>[number]["width"];

/**
 * A strip's drawn width before it is capped at its natural width `n`
 * (section 8.9): `r × n` without a `width`, `q × n` for a ratio, `L × uv`
 * for a span `v` (`uv = v / λR`), `c` for a canvas width.
 */
function drawnWidth(
  width: ElisionWidth | null,
  n: number,
  r: number,
  L: number,
  lambda: Real,
): number {
  if (width === null) return r * n;
  if ("ratio" in width) return width.ratio * n;
  if ("span" in width) return L * proportion(width.span, lambda);
  return width.canvas;
}

/** The line a strip's labels stand on: its timeline's own, or its segment line's. */
export interface LabelLine {
  readonly y: number;
  readonly w: number;
}

/**
 * The strips of `axis` drawn in a card from `yt` to `yb`, their member
 * drawing started at `x0` (sections 6.6, 7.2 and 8.5): every strip's element
 * from the left, each with its rule where it starts at the end of the strip
 * before it and its continuations, the lines `lines` whose span holds its
 * whole stretch, at their ordinates, in their order; then their labels,
 * strip by strip, the name label before the coordinate label, each on the
 * line `lineOf` gives its timeline, cut to the strip less 2 on either side
 * and left out where not even `…` fits.
 */
export function stripElements(
  scope: Scope,
  axis: ElidedAxis,
  x0: number,
  yt: number,
  yb: number,
  lines: readonly { readonly entry: Entry; readonly y: number }[],
  lineOf: (entry: Entry) => LabelLine | undefined,
): { readonly strips: ElisionElement[]; readonly labels: TextElement[] } {
  const strips: ElisionElement[] = [];
  const labels: TextElement[] = [];
  axis.strips.forEach((strip, index) => {
    const before = axis.strips[index - 1];
    const x1 = x0 + strip.left;
    const x2 = x0 + strip.right;
    const timeline = strip.entry.manifest;
    const start = difference(strip.a, strip.entry.start);
    const end = difference(strip.b, strip.entry.start);
    strips.push({
      type: "elision",
      address: strip.address,
      style: strip.style,
      x1,
      x2,
      yt,
      yb,
      rule: before !== undefined && compareReal(before.b, strip.a) === 0,
      continuations: lines
        .filter(
          ({ entry }) =>
            compareReal(entry.start, strip.a) <= 0 && compareReal(strip.b, entry.end) <= 0,
        )
        .map(({ y }) => y),
      elided: { timeline: timeline.id, start, end },
    });
    const line = lineOf(strip.entry);
    if (line === undefined) return;
    const available = x2 - x1 - 2 * LABEL_GAP;
    const xm = (x1 + x2) / 2;
    const outwards = line.w / 2 + LABEL_GAP;
    const label = (word: "name" | "coordinate", text: string) => {
      if (!strip.display.includes(word)) return;
      const key = elementKey("label", partAddress(strip.address, word), timeline, strip.key);
      const style = scope.cascade.resolve(key, strip.style);
      if (!shown(style)) return;
      const size = style["font-size"];
      const cut = cutText(scope.measure, cleanText(text), size, available);
      if (cut.width > available) return;
      labels.push({
        type: "label",
        address: key.address,
        style,
        x: xm,
        baseline:
          word === "name" ? line.y - outwards - scope.d(size) : line.y + outwards + scope.a(size),
        anchor: "middle",
        text: cut.text,
      });
    };
    const { number_type: numberType, unit } = timeline;
    label("name", nameOf(timeline));
    label(
      "coordinate",
      `${coordinateText(start, numberType, unit === "seconds" ? unit : null)}–${coordinateText(end, numberType, unit)}`,
    );
  });
  return { strips, labels };
}

/** What the default proportion of an ancestor card reads (section 8.9), in its frame's item coordinates. */
export interface ProportionInputs {
  /** The view's width `VW` and height `VH`. */
  readonly view: View;
  /** The frame's scale `sG`, graphical length `L` and member drawings' start `x0`. */
  readonly scale: number;
  readonly L: number;
  readonly x0: number;
  /** The frame's width `Fw` and height `Fh`, its requests included. */
  readonly width: number;
  readonly height: number;
  /** `σ = K + N' + G'` of the root's drawing alone. */
  readonly sigma: number;
  /** The member's length `λ`, or its reach, and the root's stretches `EL` and `ER` left and right of it. */
  readonly lambda: Real;
  readonly EL: Real;
  readonly ER: Real;
}

/**
 * The default proportion `r` of an ancestor card (section 8.9): the largest
 * at which its strips are together no wider than the member's line and, with
 * the view centred on the frame at the zoom `zb`, the elided card lies
 * within the view: `min(1, λ / E, (B − dl) / (L × uL), (B − dr) / (L ×
 * uR))`, a term left out where its stretch is 0 or, for a side, where `B` is
 * no larger than that side's reach.
 */
export function ancestorProportion(inputs: ProportionInputs): number {
  const { view, scale, L, x0, width, height, sigma, lambda, EL, ER } = inputs;
  const wide = times(4n, 5n, view.width);
  const high = times(4n, 5n, view.height);
  const zG = Math.min(4, wide / (scale * width), high / (scale * height));
  const zb = Math.min(zG, LEGIBLE_ZOOM);
  const B = wide / (2 * zb * scale);
  const c = width / 2;
  const dl = c - x0 + sigma;
  const dr = x0 + L + K - c;
  const terms = [1];
  const E = add(EL, ER);
  if (!isZero(E)) terms.push(proportion(lambda, E));
  if (!isZero(EL) && B > dl) terms.push((B - dl) / (L * proportion(EL, lambda)));
  if (!isZero(ER) && B > dr) terms.push((B - dr) / (L * proportion(ER, lambda)));
  return Math.min(...terms);
}
