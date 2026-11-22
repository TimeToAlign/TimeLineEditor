/**
 * The strips of a drawing's elisions on the canvas (`docs/drawing.md` in
 * TimeToShare, sections 2.2, 3.2, 6.6 and 8.9): where each piece is drawn,
 * what a press on a strip or on its labels selects, what the pointer reads
 * over one, and the commands its handles and keys store.
 *
 * A stored elision `E` is addressed `{id: E}`, a default one lying on `T`
 * `{id: T, part: ["elision"]}`; both are drawn as pieces, one strip each,
 * and a press on a piece or on one of its labels selects its address. An
 * edge of a piece moves on the axis of the timeline the elision lies on;
 * a stored elision's edges are its `start` and `end` (only a piece reaching
 * one shows it), a default piece's its own stretch. A default piece is
 * never edited alone: a change first stores every default piece of its
 * card, the changed one with its new values, in one `add`.
 */

import type {
  Address,
  BlockId,
  Command,
  ElementAddress,
  Elision,
  Granularity,
  Manifest,
  TimelineManifest,
  View,
} from "@timetoalign/tilie-core";
import {
  addressKey,
  ancestorMembers,
  findTimeline,
  idAddress,
  inBlock,
  partAddress,
  prettyText,
  samePlaceKey,
  snapOnRow,
  timelineAxisOf,
} from "@timetoalign/tilie-core";
import {
  axisCoordinate,
  axisValueOf,
  exactCoordinate,
  Rational,
  type Real,
  realOf,
  toFloat,
  toRational,
} from "@timetoalign/tilie-core/numbers";
import type { Drawing, DrawnBox, ElisionElement } from "@timetoalign/tilie-layout";
import { lineAxes } from "@timetoalign/tilie-layout";
import type { DrawingPoint, Stacking } from "./boxes.ts";
import { isAncestorCard, raisedRoot, stackingOf } from "./boxes.ts";
import type { BlockNode } from "./node.ts";

/** One piece of an elision a drawing draws: its element, where it lies among the elements, and the card drawing it. */
export interface StripPiece {
  /** Its index in `drawing.elements`. */
  readonly index: number;
  readonly element: ElisionElement;
  /** The card whose range holds it: an ancestor card or an ungrouped root's card. */
  readonly card: DrawnBox;
}

/** An edge of an elision: its start or its end on the timeline it lies on. */
export type StripEdge = "start" | "end";

/** A change of an elision: a new start, end or `width` (the form as a command writes it). */
export interface StripChange {
  readonly start?: Rational;
  readonly end?: Rational;
  readonly width?: StripWidth;
}

/** An elision's `width` as a command writes it: exactly one form. */
export type StripWidth =
  | { readonly ratio: number }
  | { readonly span: ReturnType<typeof axisValueOf> }
  | { readonly canvas: number };

/** What a piece's handles and keys act on. */
export interface StripSubject {
  readonly piece: StripPiece;
  /** The timeline the elision lies on. */
  readonly timeline: TimelineManifest;
  /** Where that timeline's zero lies on its root's axis, exact. */
  readonly zero: Rational;
  /** The stored elision the piece draws; `null` for a default one. */
  readonly stored: Elision | null;
  /** The stretch its edges move, on the timeline's own axis: the stored elision's, else the piece's. */
  readonly start: Rational;
  readonly end: Rational;
  /** The edges this piece moves: a stored elision's edge only on the piece reaching it. */
  readonly edges: readonly StripEdge[];
}

/** What a command over strips stores, and the elision a default piece becomes. */
export interface StripCommand {
  readonly command: Command;
  /**
   * The elision the changed default piece is stored as, by its values (no
   * ID is known before the store mints one): `storedAs` finds it after;
   * `null` for a stored elision.
   */
  readonly stores: StoredEntry | null;
}

/** An elision given to `add`, by its timeline and stretch. */
export interface StoredEntry {
  readonly timeline: string;
  readonly start: Rational;
  readonly end: Rational;
}

const NO_PIECES: readonly StripPiece[] = [];
const ZERO = Rational.fromParts(0n, 1n);

/** Where the zero of the timeline `id` of `manifest` lies on its root's axis, exact: the sum of the offsets down to it. */
export function zeroOf(manifest: Manifest, id: string): Rational {
  const root = ancestorMembers(manifest, id).at(-1);
  return root === undefined ? ZERO : ZERO.subtract(toRational(root.offset));
}

const piecesByDrawing = new WeakMap<Drawing, readonly StripPiece[]>();

/** Every strip `drawing` draws, in drawing order, each with the card holding it; once per drawing. */
export function stripsOf(drawing: Drawing): readonly StripPiece[] {
  let found = piecesByDrawing.get(drawing);
  if (found === undefined) {
    const cards = drawing.boxes.filter((box) => box.kind === "card");
    found = drawing.elements.flatMap((element, index): StripPiece[] => {
      if (element.type !== "elision") return [];
      const card = cards.findLast(({ range }) => range.start <= index && index < range.end);
      return card === undefined ? [] : [{ index, element, card }];
    });
    piecesByDrawing.set(drawing, found.length === 0 ? NO_PIECES : found);
  }
  return found;
}

/** The pieces of `drawing` drawing the strip `address`, in drawing order. */
export function piecesOf(drawing: Drawing, address: ElementAddress): readonly StripPiece[] {
  const key = addressKey(address);
  return stripsOf(drawing).filter(({ element }) => addressKey(element.address) === key);
}

/** Whether `address` is a default elision's, `{id: T, part: ["elision"]}`. */
export function isDefaultStrip(address: ElementAddress): boolean {
  return (
    address.id !== undefined &&
    address.facet === undefined &&
    address.part?.length === 1 &&
    address.part[0] === "elision"
  );
}

/** The stored elision `id` of `manifest`; `undefined` where none has that ID. */
export function storedElision(manifest: Manifest, id: string): Elision | undefined {
  return manifest.graphical?.elisions?.find((elision) => elision.id === id);
}

/**
 * The strip `element` of `manifest` is or labels: a stored elision's
 * `{id: E}` for itself and its labels `{id: E, part: [name | coordinate]}`,
 * a default one's `{id: T, part: ["elision"]}` for itself and its labels
 * `{id: T, part: ["elision", name | coordinate]}`; `null` for any other
 * address.
 */
export function stripOf(manifest: Manifest, element: ElementAddress): ElementAddress | null {
  const { id, facet, part = [] } = element;
  if (id === undefined || facet !== undefined) return null;
  const label = (word: string | undefined) => word === "name" || word === "coordinate";
  if (part[0] === "elision") {
    return part.length === 1 || (part.length === 2 && label(part[1]))
      ? partAddress(idAddress(id), "elision")
      : null;
  }
  if (storedElision(manifest, id) === undefined) return null;
  return part.length === 0 || (part.length === 1 && label(part[0])) ? idAddress(id) : null;
}

/** Whether `element` of `manifest` is a strip's own address, stored or default. */
export function isStrip(manifest: Manifest, element: ElementAddress): boolean {
  const strip = stripOf(manifest, element);
  return strip !== null && addressKey(strip) === addressKey(element);
}

/**
 * The strip under `point` (block-local canvas units) in `drawing`: the last
 * drawn whose rectangle holds it, its left and right edges excluded (an
 * edge is where a run of the line ends, and what lies exactly there is
 * drawn, section 6.6; its top and bottom included) and that no frame or card
 * stacked above its card covers there (`stacking`); `null` for none.
 */
export function stripAt(
  drawing: Drawing,
  point: DrawingPoint,
  stacking: Stacking,
): StripPiece | null {
  return (
    stripsOf(drawing).findLast(({ index, element }) => {
      const { x1, x2, yt, yb } = element;
      return (
        x1 < point.x &&
        point.x < x2 &&
        yt <= point.y &&
        point.y <= yb &&
        !stacking.coveredElement(index, point)
      );
    }) ?? null
  );
}

/** A strip the pointer rests on: its block, its piece, and where the pointer is on the canvas. */
export interface StripHover {
  readonly block: BlockId;
  readonly piece: StripPiece;
  /** The pointer's abscissa and the strip's top, in canvas units. */
  readonly x: number;
  readonly top: number;
  /** What the strip says (`stripText`). */
  readonly text: string;
}

/**
 * The strip under the canvas point `point` (canvas units) among `nodes`,
 * the last node holding one (`stripAt`, as each node stacks its drawing
 * for its editor); `null` for none.
 */
export function stripHoverAt(nodes: readonly BlockNode[], point: DrawingPoint): StripHover | null {
  for (const node of nodes.toReversed()) {
    const { block, drawing, editing } = node.data;
    const local = {
      x: (point.x - node.position.x) / block.scale,
      y: (point.y - node.position.y) / block.scale,
    };
    const piece = stripAt(drawing, local, stackingOf(drawing, raisedRoot(block, editing)));
    if (piece === null) continue;
    return {
      block: block.id,
      piece,
      x: point.x,
      top: node.position.y + piece.element.yt * block.scale,
      text: stripText(block.manifest, piece),
    };
  }
  return null;
}

/** A value on `timeline`'s own axis as the canvas shows a coordinate, exact, without a unit. */
export function valueText(value: Real, timeline: TimelineManifest): string {
  const coordinate = exactCoordinate(value, timeline.unit, timeline.number_type);
  if (coordinate === undefined) return String(toFloat(toRational(value)));
  return prettyText(coordinate.value, coordinate.numberType, null);
}

/**
 * What a strip says when the pointer rests on it (Show coordinates): the
 * name of the timeline it lies on (its ID without one), the stretch it
 * elides there, `start–end` with the unit's name, and "elided":
 * "Menuet, 0–312 quarters, elided".
 */
export function stripText(manifest: Manifest, piece: StripPiece): string {
  const { timeline: id, start, end } = piece.element.elided;
  const timeline = findTimeline(manifest, id);
  if (timeline === undefined) return `${id}, elided`;
  const name = timeline.name ?? id;
  return `${name}, ${valueText(start, timeline)}–${valueText(end, timeline)} ${timeline.unit}, elided`;
}

/** A value on `timeline`'s own axis read exact. */
function exactOn(value: Elision["start"], timeline: TimelineManifest): Rational {
  return toRational(realOf(axisCoordinate(value, timeline)));
}

/** What the handles of `piece` (in a drawing of `manifest`) act on; `null` where its timeline is gone. */
export function subjectOf(manifest: Manifest, piece: StripPiece): StripSubject | null {
  const { address, elided } = piece.element;
  const timeline = findTimeline(manifest, elided.timeline);
  if (timeline === undefined) return null;
  const zero = zeroOf(manifest, timeline.id);
  const own = { start: toRational(elided.start), end: toRational(elided.end) };
  if (isDefaultStrip(address)) {
    return { piece, timeline, zero, stored: null, ...own, edges: ["start", "end"] };
  }
  const stored = address.id === undefined ? undefined : storedElision(manifest, address.id);
  if (stored === undefined) return null;
  const start = exactOn(stored.start, timeline);
  const end = exactOn(stored.end, timeline);
  const edges: StripEdge[] = [];
  if (own.start.equals(start)) edges.push("start");
  if (own.end.equals(end)) edges.push("end");
  return { piece, timeline, zero, stored, start, end, edges };
}

/** A stretch of a card's x-axis and the stretch of its root's axis it draws, linear between. */
interface Span {
  readonly x1: number;
  readonly x2: number;
  readonly r1: number;
  readonly r2: number;
  /** Whether a line draws it, at the card's full scale; else a strip. */
  readonly line: boolean;
}

const spansByDrawing = new WeakMap<Drawing, Map<string, readonly Span[]>>();

/**
 * The stretches of the x-axis of `card` in `drawing` (of `manifest`) and
 * the coordinates of its root's axis each draws: every run of a line the
 * card draws (`lineAxes`) and every strip it draws, from the left; once per
 * drawing and card. Floats: they place a pointer, never a stored value.
 */
function spansOf(manifest: Manifest, drawing: Drawing, card: DrawnBox): readonly Span[] {
  let byCard = spansByDrawing.get(drawing);
  if (byCard === undefined) {
    byCard = new Map();
    spansByDrawing.set(drawing, byCard);
  }
  const key = card.key === null ? "" : JSON.stringify(card.key);
  let found = byCard.get(key);
  if (found === undefined) {
    const zero = (id: string) => toFloat(zeroOf(manifest, id));
    const lines = [...lineAxes(drawing).values()].flatMap((axis): Span[] => {
      if (card.key === null || !samePlaceKey(axis.card, card.key)) return [];
      const length = toFloat(toRational(axis.drawnLength));
      if (!(axis.xEnd > axis.xStart) || !(length > 0)) return [];
      const r1 = zero(axis.timeline) + toFloat(toRational(axis.start));
      return [{ x1: axis.xStart, x2: axis.xEnd, r1, r2: r1 + length, line: true }];
    });
    const strips = stripsOf(drawing).flatMap(({ element, card: holder }): Span[] => {
      if (holder !== card) return [];
      const { timeline, start, end } = element.elided;
      const at = zero(timeline);
      const r1 = at + toFloat(toRational(start));
      return [
        { x1: element.x1, x2: element.x2, r1, r2: at + toFloat(toRational(end)), line: false },
      ];
    });
    found = [...lines, ...strips].sort((left, right) => left.x1 - right.x1);
    byCard.set(key, found);
  }
  return found;
}

/** The coordinate of the root's axis at the abscissa `x` of a card's spans: the span holding it, else the nearest end. */
function rootAt(spans: readonly Span[], x: number): number | null {
  let nearest: { readonly distance: number; readonly r: number } | null = null;
  for (const span of spans) {
    if (span.x1 <= x && x <= span.x2) {
      const width = span.x2 - span.x1;
      return width === 0 ? span.r1 : span.r1 + ((x - span.x1) / width) * (span.r2 - span.r1);
    }
    for (const [ex, r] of [
      [span.x1, span.r1],
      [span.x2, span.r2],
    ] as const) {
      const distance = Math.abs(ex - x);
      if (nearest === null || distance < nearest.distance) nearest = { distance, r };
    }
  }
  return nearest?.r ?? null;
}

/** The abscissa of the root's coordinate `r` on a card's spans, a line's before a strip's; `null` where none draws it. */
function abscissaAt(spans: readonly Span[], r: number): number | null {
  const holding = spans.filter((span) => span.r1 <= r && r <= span.r2);
  const span = holding.find(({ line }) => line) ?? holding[0];
  if (span === undefined) return null;
  const length = span.r2 - span.r1;
  return length === 0 ? span.x1 : span.x1 + ((r - span.r1) / length) * (span.x2 - span.x1);
}

/** The card's full scale: canvas units per unit of its root's axis, read off its first line; `null` without one. */
function scaleOf(spans: readonly Span[]): number | null {
  const line = spans.find((span) => span.line);
  return line === undefined ? null : (line.x2 - line.x1) / (line.r2 - line.r1);
}

/**
 * The protected span of `card` (section 8.8) on its root's axis, exact: in
 * an ancestor card, the stretch over the member it is aligned to, from that
 * member's zero for its drawn length; `null` for any other card.
 */
function protectedOf(
  manifest: Manifest,
  drawing: Drawing,
  card: DrawnBox,
): [Rational, Rational] | null {
  if (!isAncestorCard(card) || card.ancestor === undefined) return null;
  const { group, member } = card.ancestor;
  const line = [...lineAxes(drawing).values()].find(
    (axis) =>
      axis.timeline === member &&
      axis.ancestor === undefined &&
      samePlaceKey(axis.card, { item: group, member }),
  );
  if (line === undefined) return null;
  const zero = zeroOf(manifest, member);
  return [zero, zero.add(toRational(line.drawnLength))];
}

/** `value` read as `Rational`. */
const exact = (value: Real | bigint): Rational => toRational(value);

/**
 * Where the edges of `subject` may lie, on its timeline's own axis: from
 * its timeline's start to its known end, never across the protected span of
 * its card (`protect`, on the root's axis) from the side its piece lies on,
 * and the start before the end. `value` held to them; `null` where it
 * cannot lie there.
 */
function heldEdge(
  subject: StripSubject,
  protect: [Rational, Rational] | null,
  edge: StripEdge,
  value: Rational,
): Rational | null {
  const { timeline, zero, piece } = subject;
  const own = protect === null ? null : protect.map((at) => at.subtract(zero));
  const pieceStart = exact(piece.element.elided.start);
  const pieceEnd = exact(piece.element.elided.end);
  const left = own !== null && own[0] !== undefined && pieceEnd.compare(own[0]) <= 0;
  const right = own !== null && own[1] !== undefined && pieceStart.compare(own[1]) >= 0;
  const max = (a: Rational, b: Rational) => (a.compare(b) >= 0 ? a : b);
  const min = (a: Rational, b: Rational) => (a.compare(b) <= 0 ? a : b);
  let held = value;
  if (edge === "start") {
    held = max(held, ZERO);
    if (right && own?.[1] !== undefined) held = max(held, own[1]);
    if (left && own?.[0] !== undefined) held = min(held, own[0]);
    return held.compare(subject.end) < 0 ? held : null;
  }
  if (timeline.length !== null) held = min(held, exactOn(timeline.length, timeline));
  if (left && own?.[0] !== undefined) held = min(held, own[0]);
  if (right && own?.[1] !== undefined) held = max(held, own[1]);
  return held.compare(subject.start) > 0 ? held : null;
}

/**
 * The values an edge of `subject` snaps to, on its timeline's own axis: its
 * timeline's start and known end, the start and the known end of each of its
 * children, and the edges of the protected span `protect`.
 */
function targetsOf(subject: StripSubject, protect: [Rational, Rational] | null): Rational[] {
  const { timeline, zero } = subject;
  const targets = [ZERO];
  if (timeline.length !== null) targets.push(exactOn(timeline.length, timeline));
  for (const child of timeline.children) {
    const offset = exactOn(child.offset, timeline);
    targets.push(offset);
    if (child.length !== null) targets.push(offset.add(exactOn(child.length, timeline)));
  }
  if (protect !== null) targets.push(...protect.map((at) => at.subtract(zero)));
  return targets;
}

/**
 * The simplest value of `timeline`'s number type within `reach` of `p` on
 * its own axis (core's `snapOnRow` on a spec of that timeline alone: an int
 * axis the nearest integer), held to its span.
 */
function snapped(
  block: BlockId,
  timeline: TimelineManifest,
  p: number,
  reach: number,
  granularity: Granularity,
): Rational | null {
  if (!Number.isFinite(p) || !(reach > 0) || !Number.isFinite(reach)) return null;
  const spec = { block, granularity, anchor: timelineAxisOf(timeline, []), members: [] };
  return snapOnRow(spec, { timeline: timeline.id, map: null }, p, reach, "no_server");
}

/** What a pointer or a key moving an edge reads besides the piece: its drawing and how finely it snaps. */
export interface EdgeContext {
  readonly block: BlockId;
  readonly manifest: Manifest;
  /** The drawing the piece was found in: the one the pointer reads, before any change. */
  readonly drawing: Drawing;
  readonly granularity: Granularity;
}

/**
 * The value the `edge` of `subject` takes for a pointer at the abscissa `x`
 * of its card (block-local canvas units, in `context.drawing`): the
 * snapping value (`targetsOf`) whose abscissa lies within `tolerance`
 * canvas units, the nearest; else the coordinate under the pointer, its
 * root's coordinate read off the card's lines and strips, made the simplest
 * value within `reach` canvas units (`snapped`); held where the edge may
 * lie (`heldEdge`). `null` where no value is read or it may not lie there.
 */
export function edgeAt(
  context: EdgeContext,
  subject: StripSubject,
  edge: StripEdge,
  x: number,
  tolerance: number,
  reach: number,
): Rational | null {
  const { manifest, drawing } = context;
  const { card } = subject.piece;
  const spans = spansOf(manifest, drawing, card);
  const protect = protectedOf(manifest, drawing, card);
  const zero = toFloat(subject.zero);
  let best: { readonly value: Rational; readonly distance: number } | null = null;
  for (const target of targetsOf(subject, protect)) {
    const at = abscissaAt(spans, zero + toFloat(target));
    const distance = at === null ? Number.POSITIVE_INFINITY : Math.abs(at - x);
    if (distance <= tolerance && (best === null || distance < best.distance)) {
      best = { value: target, distance };
    }
  }
  if (best !== null) return heldEdge(subject, protect, edge, best.value);
  const r = rootAt(spans, x);
  const scale = scaleOf(spans);
  if (r === null || scale === null) return null;
  const value = snapped(
    context.block,
    subject.timeline,
    r - zero,
    reach / scale,
    context.granularity,
  );
  return value === null ? null : heldEdge(subject, protect, edge, value);
}

/**
 * The value the `edge` of `subject` takes one step of `step` canvas units
 * in `direction` (−1 left, 1 right) at its card's full scale: the simplest
 * value within half a step of the moved one (`snapped`), or the nearest
 * snapping value lying on the way; held where the edge may lie. `null`
 * where nothing changes.
 */
export function edgeStep(
  context: EdgeContext,
  subject: StripSubject,
  edge: StripEdge,
  direction: -1 | 1,
  step: number,
): Rational | null {
  const { manifest, drawing } = context;
  const { card } = subject.piece;
  const scale = scaleOf(spansOf(manifest, drawing, card));
  if (scale === null || !(step > 0)) return null;
  const protect = protectedOf(manifest, drawing, card);
  const current = edge === "start" ? subject.start : subject.end;
  const units = step / scale;
  const moved = snapped(
    context.block,
    subject.timeline,
    toFloat(current) + direction * units,
    units / 2,
    context.granularity,
  );
  if (moved === null) return null;
  const between = (value: Rational) =>
    direction * value.compare(current) > 0 && direction * moved.compare(value) > 0;
  const passed = targetsOf(subject, protect)
    .filter(between)
    .sort((left, right) => direction * left.compare(right))[0];
  const value = heldEdge(subject, protect, edge, passed ?? moved);
  return value === null || value.equals(current) ? null : value;
}

/** The drawn width of `piece` and its natural width at its card's full scale; `null` without a scale. */
export function widthsOf(
  manifest: Manifest,
  drawing: Drawing,
  piece: StripPiece,
): { readonly drawn: number; readonly natural: number; readonly scale: number } | null {
  const scale = scaleOf(spansOf(manifest, drawing, piece.card));
  if (scale === null) return null;
  const { x1, x2, elided } = piece.element;
  const natural = toFloat(exact(elided.end).subtract(exact(elided.start))) * scale;
  return { drawn: x2 - x1, natural, scale };
}

/** How many decimals a ratio and a canvas width are written with. */
const RATIO_DECIMALS = 4;
const CANVAS_DECIMALS = 2;

const rounded = (value: number, decimals: number) =>
  Math.round(value * 10 ** decimals) / 10 ** decimals;

/**
 * The `width` drawing `subject` `drawn` canvas units wide, in the form its
 * elision states (a default one, or one without `width`, is Automatic and
 * becomes Proportional): `{ratio}` the drawn width over the natural one, to
 * four decimals, at least 0.0001 and at most 1; `{span}` the units of its
 * timeline it is as wide as at full scale, the simplest value within
 * `reach` canvas units; `{canvas}` the canvas units, to two decimals. A
 * width is never wider than the piece's natural width. `null` where no
 * positive width is read.
 */
export function widthFor(
  context: EdgeContext,
  subject: StripSubject,
  drawn: number,
  reach: number,
): StripWidth | null {
  const widths = widthsOf(context.manifest, context.drawing, subject.piece);
  if (widths === null || !(widths.natural > 0) || !Number.isFinite(drawn)) return null;
  const width = Math.min(Math.max(drawn, 0), widths.natural);
  const form = subject.stored?.width ?? null;
  if (form !== null && "canvas" in form) {
    const canvas = rounded(width, CANVAS_DECIMALS);
    return canvas > 0 ? { canvas } : null;
  }
  if (form !== null && "span" in form) {
    const units = width / widths.scale;
    const span = snapped(
      context.block,
      subject.timeline,
      units,
      reach / widths.scale,
      context.granularity,
    );
    if (span === null || span.compare(ZERO) <= 0) return null;
    const value = exactCoordinate(span, subject.timeline.unit, subject.timeline.number_type);
    return value === undefined ? null : { span: axisValueOf(value.value) };
  }
  const ratio = rounded(width / widths.natural, RATIO_DECIMALS);
  return { ratio: Math.min(Math.max(ratio, 10 ** -RATIO_DECIMALS), 1) };
}

/** An exact value on `timeline`'s own axis as a command writes it; `undefined` where its number type cannot hold it. */
function axisValue(value: Rational, timeline: TimelineManifest) {
  const coordinate = exactCoordinate(value, timeline.unit, timeline.number_type);
  return coordinate === undefined ? undefined : axisValueOf(coordinate.value);
}

/** The default pieces `card` draws in `drawing`, in drawing order. */
function defaultsIn(drawing: Drawing, card: DrawnBox): readonly StripPiece[] {
  return stripsOf(drawing).filter(
    (piece) => piece.card === card && isDefaultStrip(piece.element.address),
  );
}

/** A default piece as `add` takes it: its timeline and its own stretch, no `width`. */
function entryOf(piece: StripPiece): StoredEntry {
  const { timeline, start, end } = piece.element.elided;
  return { timeline, start: exact(start), end: exact(end) };
}

/** `entry` as `add` writes it on the timeline of `manifest` it names; `undefined` where it is not written there. */
function written(manifest: Manifest, entry: StoredEntry, width?: StripWidth) {
  const timeline = findTimeline(manifest, entry.timeline);
  if (timeline === undefined) return undefined;
  const start = axisValue(entry.start, timeline);
  const end = axisValue(entry.end, timeline);
  if (start === undefined || end === undefined) return undefined;
  return { timeline: entry.timeline, start, end, ...(width === undefined ? {} : { width }) };
}

/**
 * The command storing `change` of `subject` in block `block` of `view`
 * (drawn as `drawing`): a stored elision's one `set` of the members that
 * change; for a default piece one `add` into the block of every default
 * piece of its card in drawing order, without `width`, the changed one
 * with its new values (core mints the IDs). `null` where nothing changes
 * or a value cannot be written.
 */
export function stripCommand(
  view: View,
  block: BlockId,
  drawing: Drawing,
  subject: StripSubject,
  change: StripChange,
): StripCommand | null {
  const manifest = view.blocks[block]?.manifest;
  if (manifest === undefined) return null;
  const { timeline, stored } = subject;
  const start = change.start ?? subject.start;
  const end = change.end ?? subject.end;
  const moved = !start.equals(subject.start) || !end.equals(subject.end);
  if (stored !== null) {
    const values: Record<string, unknown> = {};
    if (!start.equals(subject.start)) values.start = axisValue(start, timeline);
    if (!end.equals(subject.end)) values.end = axisValue(end, timeline);
    if (
      change.width !== undefined &&
      JSON.stringify(change.width) !== JSON.stringify(stored.width)
    ) {
      values.width = change.width;
    }
    if (Object.keys(values).length === 0 || Object.values(values).includes(undefined)) return null;
    const target = inBlock(block, idAddress(stored.id));
    return { command: { type: "set", changes: [{ target, values }] }, stores: null };
  }
  if (!moved && change.width === undefined) return null;
  const changed: StoredEntry = { timeline: timeline.id, start, end };
  const elision = defaultsIn(drawing, subject.piece.card).map((piece) =>
    piece === subject.piece
      ? written(manifest, changed, change.width)
      : written(manifest, entryOf(piece)),
  );
  if (elision.length === 0 || elision.includes(undefined)) return null;
  return { command: { type: "add", into: { block }, elision }, stores: changed };
}

/**
 * The command deleting the default strips `removed` (addresses `{id: T,
 * part: ["elision"]}`) of block `block` of `view`, drawn as `drawing`: one
 * `add` into the block of every other default piece of the card the first
 * of them is drawn in, so that only they are gone; refused where none
 * would be left (the card is then drawn whole by its Full mode, never by
 * deleting) or none is drawn.
 */
export function defaultsRemoval(
  view: View,
  block: BlockId,
  drawing: Drawing,
  removed: readonly ElementAddress[],
): Command | { readonly refused: string } {
  const manifest = view.blocks[block]?.manifest;
  const keys = new Set(removed.map(addressKey));
  const first = stripsOf(drawing).find(({ element }) => keys.has(addressKey(element.address)));
  if (manifest === undefined || first === undefined) {
    return { refused: "The automatic elision is not drawn." };
  }
  const kept = defaultsIn(drawing, first.card).filter(
    ({ element }) => !keys.has(addressKey(element.address)),
  );
  if (kept.length === 0) {
    return {
      refused:
        "The last automatic elisions of a card are not deleted: choose Full to draw it whole.",
    };
  }
  const elision = kept.map((piece) => written(manifest, entryOf(piece)));
  if (elision.includes(undefined)) return { refused: "The automatic elisions cannot be stored." };
  return { type: "add", into: { block }, elision };
}

/**
 * The address of the elision `entry` was stored as in block `block` of
 * `view`, found by its values: the stored elision lying on its timeline
 * with its start and end; `null` where none does.
 */
export function storedAs(view: View, block: BlockId, entry: StoredEntry): Address | null {
  const manifest = view.blocks[block]?.manifest;
  const timeline = manifest === undefined ? undefined : findTimeline(manifest, entry.timeline);
  if (manifest === undefined || timeline === undefined) return null;
  const found = manifest.graphical?.elisions?.find(
    (elision) =>
      elision.timeline === entry.timeline &&
      exactOn(elision.start, timeline).equals(entry.start) &&
      exactOn(elision.end, timeline).equals(entry.end),
  );
  return found === undefined ? null : inBlock(block, idAddress(found.id));
}
