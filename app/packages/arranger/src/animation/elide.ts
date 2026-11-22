/**
 * A card's elisions moving (decision record 0034, applied sideways): the
 * canvas's reading of layout's records into the pure motion of `unfold.ts`.
 * An ancestor card or an ungrouped root's card keeps its rows whatever its
 * strips: turning Elided or Full, a strip changed and a changed proportion
 * move every element of the card sideways only, from where the drawing
 * before drew its positions to where the drawing after draws them. An
 * ancestor card shown or hidden also unfolds out of its member card or
 * folds back into it: its rows travel as a raise's (`raise.ts`) while
 * everything left and right of the member's span opens out of the member
 * card's ends.
 */

import type { Manifest } from "@timetoalign/tilie-core";
import { ancestorMembers, placeKeyText, samePlaceKey } from "@timetoalign/tilie-core";
import { toFloat, toRational } from "@timetoalign/tilie-core/numbers";
import type { Drawing, DrawnBox, DrawnElement, TextMeasure } from "@timetoalign/tilie-layout";
import { boundsOf, lineAxes } from "@timetoalign/tilie-layout";
import type { Descriptor } from "@timetoalign/tilie-writers";
import { attributeText } from "@timetoalign/tilie-writers";
import { keyedBox } from "../boxes.ts";
import { raiseUnfold } from "./raise.ts";
import { type Knot, type Motion, type Placed, placedAt, positionAt, startOf } from "./unfold.ts";

/** A drawing with what it was drawn from and what draws it. */
export interface Drawn {
  readonly manifest: Manifest;
  readonly drawing: Drawing;
  readonly descriptors: readonly Descriptor[];
}

/** How the elements of one card of the drawing after a change move: each of its range by `motionOf`. */
export interface CardMotion {
  /** The card's place key text (`placeKeyText`). */
  readonly key: string;
  readonly start: number;
  readonly end: number;
  motionOf(element: number): Motion;
}

/**
 * A card the drawing after a change no longer draws, folding back into its
 * member card: its descriptors in the drawing before, each placed at a
 * progress by `placedAt` (at rest at 0, folded at 1), on the canvas of the
 * drawing after.
 */
export interface LeavingCard {
  readonly key: string;
  readonly descriptors: readonly Descriptor[];
  placedAt(descriptor: Descriptor, t: number): Placed;
}

/** What moves when a block's drawing changes: the cards that stay or appear, and those that leave. */
export interface BlockMotion {
  readonly cards: readonly CardMotion[];
  readonly leaving: readonly LeavingCard[];
}

/**
 * The horizontal extent an element moves by: a line's, a map's, a
 * region's or a strip's two ends, a rectangle's two sides, a jump's start
 * and tip; one abscissa for an element moving without stretching, its
 * mark's or its text's middle.
 */
function extentOf(element: DrawnElement, measure: TextMeasure): readonly [number, number] {
  switch (element.type) {
    case "timeline":
    case "child":
    case "ancestor":
    case "map":
      return [element.xs, element.xe];
    case "region":
    case "elision":
      return [element.x1, element.x2];
    case "block":
      return [0, element.width];
    case "frame":
    case "card":
    case "ancestor_card":
      return [element.x, element.x + element.width];
    case "jump_from": {
      const [a, b] = [element.start[0], element.tip[0]];
      return [Math.min(a, b), Math.max(a, b)];
    }
    case "wedge":
    case "flow_marker":
    case "boundary":
    case "cross_section":
      return [element.x, element.x];
    case "name":
    case "label":
    case "alignment_anchor": {
      const { left, right } = boundsOf(element, measure);
      const middle = (left + right) / 2;
      return [middle, middle];
    }
  }
}

/** A coordinate value as a float, for a motion on the canvas. */
const float = (value: Parameters<typeof toRational>[0]): number => toFloat(toRational(value));

/** The zero of each timeline on its root's axis, as a float, read once per manifest. */
const zeros = new WeakMap<Manifest, Map<string, number>>();

function zeroOf(manifest: Manifest, timeline: string): number {
  let known = zeros.get(manifest);
  if (known === undefined) {
    known = new Map();
    zeros.set(manifest, known);
  }
  const found = known.get(timeline);
  if (found !== undefined) return found;
  const root = ancestorMembers(manifest, timeline).at(-1);
  const zero = root === undefined ? 0 : -float(root.offset);
  known.set(timeline, zero);
  return zero;
}

/** A strip of a card: its abscissas and the stretch it elides on the card's root's axis. */
interface StripPlace {
  readonly x1: number;
  readonly x2: number;
  readonly start: number;
  readonly end: number;
}

/** The strips the card `card` of `drawing` draws, in drawing order. */
function stripsOf(manifest: Manifest, drawing: Drawing, card: DrawnBox): StripPlace[] {
  const strips: StripPlace[] = [];
  for (let index = card.range.start; index < card.range.end; index += 1) {
    const element = drawing.elements[index];
    if (element?.type !== "elision") continue;
    const zero = zeroOf(manifest, element.elided.timeline);
    strips.push({
      x1: element.x1,
      x2: element.x2,
      start: zero + float(element.elided.start),
      end: zero + float(element.elided.end),
    });
  }
  return strips;
}

/**
 * The knots of the card `card` of `drawing`: both ends of every line layout
 * records in it (`lineAxes`, one per full run of an elided line) and of
 * every strip it draws, each at the position it draws on the card's root,
 * sorted by abscissa.
 */
export function cardKnots(manifest: Manifest, drawing: Drawing, card: DrawnBox): Knot[] {
  const knots: Knot[] = [];
  if (card.key !== null) {
    for (const axis of lineAxes(drawing).values()) {
      if (!samePlaceKey(axis.card, card.key)) continue;
      const at = zeroOf(manifest, axis.timeline) + float(axis.start);
      knots.push({ x: axis.xStart, at }, { x: axis.xEnd, at: at + float(axis.drawnLength) });
    }
  }
  for (const strip of stripsOf(manifest, drawing, card)) {
    knots.push({ x: strip.x1, at: strip.start }, { x: strip.x2, at: strip.end });
  }
  return knots.sort((a, b) => a.x - b.x || a.at - b.at);
}

/**
 * What a card's elisions are, to tell whether a change moved them: each
 * strip's stretch and drawn width, in drawing order; empty for a card
 * drawn whole.
 */
export function elisionsText(manifest: Manifest, drawing: Drawing, card: DrawnBox): string {
  return stripsOf(manifest, drawing, card)
    .map((strip) => `${strip.start} ${strip.end} ${strip.x2 - strip.x1}`)
    .join(";");
}

/** The position `x` draws among `knots`, NaN without knots (so it lies in no stretch). */
const positionOr = (knots: readonly Knot[], x: number): number =>
  positionAt(knots, x) ?? Number.NaN;

/** Whether `low` to `high` lies in one of `stretches` and reaches into its inside. */
function within(stretches: readonly (readonly [number, number])[], low: number, high: number) {
  return stretches.some(([a, b]) => low >= a && high <= b && low < b && high > a);
}

/**
 * How the card `card` of the drawing `after` moves from the card under the
 * same place key `before` draws (`was`): rows kept, each element starting
 * where `before` draws the positions its extent draws (`startOf` over both
 * cards' knots, the move of the place origin added) and shifted down by
 * the move of the card's top. An element whose extent lies inside a strip
 * of `after` (a strip and its labels), or whose positions lie inside a
 * stretch `before` elided (what a strip hid), enters.
 */
export function sidewaysMotion(
  before: Drawn,
  was: DrawnBox,
  after: Drawn,
  card: DrawnBox,
  measure: TextMeasure,
): CardMotion {
  const from = cardKnots(before.manifest, before.drawing, was);
  const to = cardKnots(after.manifest, after.drawing, card);
  const offset = after.drawing.origin.x - before.drawing.origin.x;
  const dy = was.y - before.drawing.origin.y - (card.y - after.drawing.origin.y);
  const hidden = stripsOf(before.manifest, before.drawing, was).map(
    (strip) => [strip.start, strip.end] as const,
  );
  const strips = stripsOf(after.manifest, after.drawing, card).map(
    (strip) => [strip.x1, strip.x2] as const,
  );
  return cardMotion(after.drawing, card, measure, ([left, right]) => ({
    across: {
      left,
      right,
      fromLeft: startOf(from, to, offset, left),
      fromRight: startOf(from, to, offset, right),
    },
    dy,
    enters:
      within(strips, left, right) || within(hidden, positionOr(to, left), positionOr(to, right)),
  }));
}

/**
 * How the ancestor card `card` of `drawn` unfolds out of the member card it
 * is aligned to when it is shown: each element travels down as a raise
 * moves it (`raiseUnfold`: its row's shift, entering where its row does or
 * it has none, and where it lies in a strip, a strip's labels) and sideways from the member's line in the member card,
 * which draws the member's span at the card's own abscissas: what lies
 * left or right of that span starts at the member line's start or end and
 * opens out of it.
 */
export function unfoldingMotion(drawn: Drawn, card: DrawnBox, measure: TextMeasure): CardMotion {
  const { manifest, drawing } = drawn;
  const rows = raiseUnfold(manifest, drawing, card, measure);
  const to = cardKnots(manifest, drawing, card);
  const from: Knot[] = [];
  const { ancestor } = card;
  if (ancestor !== undefined) {
    const member = { item: ancestor.group, member: ancestor.member };
    for (const axis of lineAxes(drawing).values()) {
      if (axis.ancestor !== undefined || axis.timeline !== ancestor.member) continue;
      if (!samePlaceKey(axis.card, member)) continue;
      const at = zeroOf(manifest, axis.timeline) + float(axis.start);
      from.push({ x: axis.xStart, at }, { x: axis.xEnd, at: at + float(axis.drawnLength) });
      break;
    }
  }
  const strips = stripsOf(manifest, drawing, card).map((strip) => [strip.x1, strip.x2] as const);
  return cardMotion(drawing, card, measure, ([left, right], index) => {
    const row = rows.motionOf(index);
    return {
      across: {
        left,
        right,
        fromLeft: startOf(from, to, 0, left),
        fromRight: startOf(from, to, 0, right),
      },
      dy: row?.shift ?? 0,
      enters: row === null || row.enters || within(strips, left, right),
    };
  });
}

/** The motion of the card `card` of `drawing`, each element of its range moving by `motion`. */
function cardMotion(
  drawing: Drawing,
  card: DrawnBox,
  measure: TextMeasure,
  motion: (extent: readonly [number, number], index: number) => Motion,
): CardMotion {
  const motions: Motion[] = [];
  for (let index = card.range.start; index < card.range.end; index += 1) {
    const element = drawing.elements[index];
    motions.push(
      element === undefined
        ? { across: null, dy: 0, enters: false }
        : motion(extentOf(element, measure), index),
    );
  }
  return {
    key: card.key === null ? "" : placeKeyText(card.key),
    start: card.range.start,
    end: card.range.end,
    motionOf: (element) =>
      motions[element - card.range.start] ?? { across: null, dy: 0, enters: false },
  };
}

/** The cards of `drawing` that may draw strips, by place key text: ancestor cards and the cards the block holds. */
function elidableCards(drawing: Drawing): Map<string, DrawnBox> {
  const cards = new Map<string, DrawnBox>();
  for (const box of drawing.boxes) {
    if (box.kind !== "card" || box.key === null) continue;
    if (box.ancestor === undefined && box.key.member !== undefined) continue;
    cards.set(placeKeyText(box.key), box);
  }
  return cards;
}

/** Whether `drawing` draws the member card an ancestor card `card` is aligned to. */
function drawsMember(drawing: Drawing, card: DrawnBox): boolean {
  const { ancestor } = card;
  return (
    ancestor !== undefined &&
    keyedBox(drawing, { item: ancestor.group, member: ancestor.member }) !== undefined
  );
}

/**
 * What moves when a block is drawn `after` instead of `before`: each card
 * both draw whose elisions changed moves sideways (`sidewaysMotion`); each
 * ancestor card only `after` draws, whose member card `before` drew,
 * unfolds out of it (`unfoldingMotion`); each ancestor card only `before`
 * draws, whose member card `after` draws, folds back into it, read in
 * `before` and moved by the change of the place origin. Nothing else moves.
 */
export function blockMotion(before: Drawn, after: Drawn, measure: TextMeasure): BlockMotion {
  const was = elidableCards(before.drawing);
  const now = elidableCards(after.drawing);
  const cards: CardMotion[] = [];
  for (const [key, card] of now) {
    const old = was.get(key);
    if (old !== undefined) {
      const changed =
        elisionsText(before.manifest, before.drawing, old) !==
        elisionsText(after.manifest, after.drawing, card);
      if (changed) cards.push(sidewaysMotion(before, old, after, card, measure));
    } else if (card.ancestor !== undefined && drawsMember(before.drawing, card)) {
      cards.push(unfoldingMotion(after, card, measure));
    }
  }
  const leaving: LeavingCard[] = [];
  const dx = after.drawing.origin.x - before.drawing.origin.x;
  const dy = after.drawing.origin.y - before.drawing.origin.y;
  for (const [key, card] of was) {
    if (now.has(key) || card.ancestor === undefined || !drawsMember(after.drawing, card)) continue;
    const motion = unfoldingMotion(before, card, measure);
    const descriptors = before.descriptors.filter(
      ({ source }) => source.element >= card.range.start && source.element < card.range.end,
    );
    leaving.push({
      key,
      descriptors,
      placedAt(descriptor, t) {
        const placed = placedAt(motion.motionOf(descriptor.source.element), 1 - t);
        return { ...placed, dx: placed.dx + dx, dy: placed.dy + dy };
      },
    });
  }
  return { cards, leaving };
}

/**
 * The attributes an element drawn at `placed` adds to its own: the map as
 * a `transform` (`matrix`, or `translate` without stretching) and its
 * opacity `own` times the placed one; nothing at rest.
 */
export function placedAttributes(placed: Placed, own: number): Record<string, string> {
  const { sx, dx, dy, opacity } = placed;
  const text = (values: readonly number[]) => values.map(attributeText).join(" ");
  const transform =
    sx !== 1
      ? `matrix(${text([sx, 0, 0, 1, dx, dy])})`
      : dx !== 0 || dy !== 0
        ? `translate(${text([dx, dy])})`
        : null;
  return {
    ...(transform === null ? {} : { transform }),
    ...(opacity === 1 ? {} : { opacity: attributeText(own * opacity) }),
  };
}
