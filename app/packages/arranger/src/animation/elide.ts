/**
 * Elisions moving (decision record 0034, applied sideways): the canvas's
 * reading of layout's records into the pure motion of `unfold.ts`. A card
 * keeps its rows whatever its gaps: a mode switched, a gap changed, added or
 * removed, or a changed proportion moves every element of the card
 * sideways only, from where the drawing before drew its positions to where
 * the drawing after draws them; an ellipsis or a label inside a gap that
 * stays travels with the gap, one inside a new gap enters. A frame's group
 * elisions move its member cards so (each by its own lines), and the frame
 * itself, its rectangle, title and gaps, by the proportions of its axis, its
 * right border with them. An ancestor card shown or hidden also unfolds out
 * of its member card or folds back into it: its rows travel as a raise's
 * (`raise.ts`) while everything left and right of the member's span opens
 * out of the member card's ends. An item whose place changes (an arranged
 * block's items reordered, or switched to another arrangement) travels
 * whole from its old place to its new one; when a block's items start or
 * stop standing side by side, the ancestor cards that are no longer drawn
 * fade out and those drawn again fade in, a root drawn once moving
 * sideways from the card of its first group.
 */

import type { Manifest } from "@timetoalign/tilie-core";
import {
  addressKey,
  idAddress,
  indexOf,
  partAddress,
  placeKeyText,
  samePlaceKey,
} from "@timetoalign/tilie-core";
import { toFloat, toRational } from "@timetoalign/tilie-core/numbers";
import type {
  Drawing,
  DrawnBox,
  DrawnElement,
  ElisionExposure,
  ExposedGap,
  Run,
  TextMeasure,
} from "@timetoalign/tilie-layout";
import { boundsOf, lineAxes } from "@timetoalign/tilie-layout";
import type { Descriptor } from "@timetoalign/tilie-writers";
import { attributeText } from "@timetoalign/tilie-writers";
import { isItem, keyedBox } from "../boxes.ts";
import { zeroOf } from "../cardAxis.ts";
import { holdsAt } from "../coordinates.ts";
import { raiseUnfold } from "./raise.ts";
import {
  type Knot,
  type Motion,
  type Placed,
  pairRows,
  placedAt,
  positionAt,
  type Row,
  startOf,
} from "./unfold.ts";

/** A drawing with what it was drawn from and what draws it. */
export interface Drawn {
  readonly manifest: Manifest;
  readonly drawing: Drawing;
  readonly descriptors: readonly Descriptor[];
}

/**
 * How the elements of one container of the drawing after a change move: a
 * card's, or a frame's own (its rectangle, title and gaps), each element it
 * holds by `motionOf`.
 */
export interface CardMotion {
  /** The container's place key text (`placeKeyText`). */
  readonly key: string;
  /** Whether the element at `element` is one this motion moves. */
  holds(element: number): boolean;
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

/** What moves when a block's drawing changes: the containers that stay or appear, and the cards that leave. */
export interface BlockMotion {
  readonly cards: readonly CardMotion[];
  readonly leaving: readonly LeavingCard[];
}

/** No motion of an element. */
const STILL: Motion = { across: null, dy: 0, enters: false };

/**
 * The horizontal extent an element moves by: a line's, a map's, a
 * region's or a gap's two ends, a rectangle's two sides, a jump's start
 * and tip; one abscissa for an element moving without stretching, its
 * mark's, an ellipsis', a fork's branch point or its text's middle.
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
    case "jump": {
      const [a, b] = [element.start[0], element.tip[0]];
      return [Math.min(a, b), Math.max(a, b)];
    }
    case "wedge":
    case "break":
    case "section_break":
    case "barline":
    case "boundary":
    case "cross_section":
    case "ellipsis":
      return [element.x, element.x];
    case "fork":
      return [element.point[0], element.point[0]];
    case "name":
    case "label":
    case "symbol":
    case "alignment_anchor":
    case "leader": {
      const { left, right } = boundsOf(element, measure);
      const middle = (left + right) / 2;
      return [middle, middle];
    }
  }
}

/** A coordinate value as a float, for a motion on the canvas. */
const float = (value: Parameters<typeof toRational>[0]): number => toFloat(toRational(value));

/**
 * The record deciding the gaps of `card`: its own (an ungrouped root's card,
 * an ancestor card), else, for a member card, its frame's.
 */
function exposureOf(drawing: Drawing, card: DrawnBox): ElisionExposure | undefined {
  const { key } = card;
  if (key === null) return undefined;
  const own = drawing.elisions.find(
    (exposure) => exposure.kind !== "frame" && samePlaceKey(exposure.key, key),
  );
  if (own !== undefined || card.ancestor !== undefined || key.member === undefined) return own;
  return drawing.elisions.find(
    (exposure) => exposure.kind === "frame" && exposure.key.item === key.item,
  );
}

/**
 * The knots of the card `card` of `drawing`: both ends of every line layout
 * records in it (`lineAxes`, one per run of an elided line), an end at a
 * seam whose position lies on the other run marked `across` (`holdsAt`),
 * and both edges of every gap of its own (not a carried one, whose
 * coordinates lie on another tree), an edge at a position a run holds at
 * another abscissa marked `across` too (a gap ending at a seam, the row
 * crossing it whole), each at the position it draws on the card's root,
 * sorted by abscissa.
 */
export function cardKnots(manifest: Manifest, drawing: Drawing, card: DrawnBox): Knot[] {
  const knots: Knot[] = [];
  if (card.key !== null) {
    for (const axis of lineAxes(drawing).values()) {
      if (!samePlaceKey(axis.card, card.key)) continue;
      const at = float(zeroOf(manifest, axis.timeline)) + float(axis.start);
      const start = toRational(axis.start);
      const end = start.add(toRational(axis.drawnLength));
      const across = (position: typeof start) =>
        holdsAt(drawing, axis, position) ? {} : { across: true as const };
      knots.push(
        { x: axis.xStart, at, ...across(start) },
        { x: axis.xEnd, at: at + float(axis.drawnLength), ...across(end) },
      );
    }
  }
  // Where a line's run holds a position, a gap's edge there at another abscissa (on a seam's
  // other side) is across it too.
  const held = new Map<number, number>();
  for (const knot of knots) if (knot.across !== true) held.set(knot.at, knot.x);
  const edge = (x: number, at: number): Knot => {
    const x0 = held.get(at);
    return x0 === undefined || x0 === x ? { x, at } : { x, at, across: true };
  };
  const exposure = exposureOf(drawing, card);
  if (exposure !== undefined && exposure.kind !== "frame") {
    for (const gap of exposure.gaps) {
      if (gap.origin === "carried") continue;
      const zero = float(zeroOf(manifest, gap.timeline));
      knots.push(edge(gap.x1, zero + float(gap.start)), edge(gap.x2, zero + float(gap.end)));
    }
  }
  return knots.sort((a, b) => a.x - b.x || a.at - b.at);
}

/** The abscissa, in block coordinates, of the proportion `u` on `run` of `exposure`. */
function runX(exposure: ElisionExposure, run: Run, u: number): number {
  const { place, x0 } = exposure;
  return place.x + place.scale * (x0 + (run.L * u - run.D));
}

/** The knots of a frame's own axis: both ends of every run, at their proportions. */
export function frameKnots(exposure: ElisionExposure): Knot[] {
  return exposure.runs
    .flatMap((run) => [
      { x: runX(exposure, run, run.u0), at: run.u0 },
      { x: runX(exposure, run, run.u1), at: run.u1 },
    ])
    .sort((a, b) => a.x - b.x || a.at - b.at);
}

/**
 * What a container's elisions are, to tell whether a change moved them: its
 * drawn mode and the words its derived gaps show, then each gap's address,
 * elided coordinates and widths, in order; empty for a container recording
 * none.
 */
export function elisionsText(exposure: ElisionExposure | undefined): string {
  if (exposure === undefined) return "";
  const gaps = exposure.gaps.map(
    (gap) =>
      `${addressKey(gap.address)} ${float(gap.start)} ${float(gap.end)} ${gap.natural} ${gap.drawn}`,
  );
  return [exposure.drawn, exposure.display.join(" "), ...gaps].join(";");
}

/** Whether `low` to `high` lies in one of `stretches` and reaches into its inside. */
function within(stretches: readonly (readonly [number, number])[], low: number, high: number) {
  return stretches.some(([a, b]) => low >= a && high <= b && low < b && high > a);
}

/** The gap of `gaps` whose abscissas hold `low` to `high`, reaching inside it. */
function gapHolding(
  gaps: readonly ExposedGap[],
  low: number,
  high: number,
): ExposedGap | undefined {
  return gaps.find(({ x1, x2 }) => low >= x1 && high <= x2 && low < x2 && high > x1);
}

/**
 * How an element of extent `left` to `right` (block coordinates of the
 * drawing after) moves when its container reads `to` after and `from`
 * before (`startOf`, the place origin's move `offset` added), shifted down
 * by `dyOf` its index: inside a gap the drawing before drew too (one at its address in
 * the same container), it travels with that gap; inside a new gap, or at
 * positions a gap before left out, it enters.
 */
function sideways(
  from: readonly Knot[],
  to: readonly Knot[],
  offset: number,
  dyOf: (index: number) => number,
  gaps: { readonly after: readonly ExposedGap[]; readonly before: readonly ExposedGap[] },
  hidden: readonly (readonly [number, number])[],
): (extent: readonly [number, number], index: number) => Motion {
  return ([left, right], index) => {
    const dy = dyOf(index);
    const inside = gapHolding(gaps.after, left, right);
    if (inside !== undefined) {
      const key = addressKey(inside.address);
      const was = gaps.before
        .filter((gap) => addressKey(gap.address) === key)
        .sort((a, b) => Math.abs(a.x1 - inside.x1) - Math.abs(b.x1 - inside.x1))[0];
      if (was === undefined) {
        return { across: { left, right, fromLeft: left, fromRight: right }, dy, enters: true };
      }
      const share = (x: number) =>
        inside.x2 > inside.x1 ? (x - inside.x1) / (inside.x2 - inside.x1) : 0.5;
      const back = (x: number) => was.x1 + share(x) * (was.x2 - was.x1) + offset;
      return {
        across: { left, right, fromLeft: back(left), fromRight: back(right) },
        dy,
        enters: false,
      };
    }
    const low = positionAt(to, left) ?? Number.NaN;
    const high = positionAt(to, right) ?? Number.NaN;
    return {
      across: {
        left,
        right,
        fromLeft: startOf(from, to, offset, left),
        fromRight: startOf(from, to, offset, right),
      },
      dy,
      enters: within(hidden, low, high),
    };
  };
}

/** The stretches of positions `exposure`'s gaps leave out, read through `knots`. */
function hiddenBy(exposure: ElisionExposure | undefined, knots: readonly Knot[]) {
  return (exposure?.gaps ?? []).flatMap((gap): (readonly [number, number])[] => {
    const a = positionAt(knots, gap.x1);
    const b = positionAt(knots, gap.x2);
    return a === null || b === null || !(b > a) ? [] : [[a, b]];
  });
}

/**
 * The rows of a card in two drawings (its lines' ordinates, each relative to
 * its drawing's place origin), paired by timeline (`pairRows`): how far
 * down each row of `card` starts from where `was` drew it. A row moves only
 * where elision labels shown or hidden change its band (section 2.1).
 */
function rowShifts(before: Drawn, was: DrawnBox, after: Drawn, card: DrawnBox) {
  const rowsOf = ({ drawing }: Drawn, box: DrawnBox): Row[] => {
    const rows: Row[] = [];
    if (box.key === null) return rows;
    for (const axis of lineAxes(drawing).values()) {
      if (samePlaceKey(axis.card, box.key)) {
        rows.push({ key: axis.timeline, y: axis.y - drawing.origin.y });
      }
    }
    return rows;
  };
  return pairRows(rowsOf(before, was), rowsOf(after, card));
}

/**
 * How the card `card` of the drawing `after` moves from the card under the
 * same place key `before` draws (`was`): rows kept but where elision labels
 * shown or hidden move them (`rowShifts`, the card top's move for an element
 * of no row), each element starting
 * where `before` draws the positions its extent draws (`startOf` over both
 * cards' knots, the move of the place origin added) and shifted down by
 * the move of the card's top (`sideways`).
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
  const rows = rowShifts(before, was, after, card);
  const { owners } = indexOf(after.manifest);
  const dyOf = (index: number): number => {
    const id = after.drawing.elements[index]?.address.id;
    const timeline = id === undefined ? undefined : owners.get(id);
    return (timeline === undefined ? undefined : rows.get(timeline)?.shift) ?? dy;
  };
  const old = exposureOf(before.drawing, was);
  const now = exposureOf(after.drawing, card);
  const motion = sideways(
    from,
    to,
    offset,
    dyOf,
    { after: now?.gaps ?? [], before: old?.gaps ?? [] },
    hiddenBy(old, from),
  );
  return rangeMotion(after.drawing, card, measure, motion);
}

/**
 * How the frame `frame` of the drawing `after` moves from the frame under
 * the same key `before` draws (`was`): its own elements (its rectangle and
 * title, every element its range holds outside its member cards) and its
 * gaps with their ellipses and labels (written after every item), by the
 * proportions of the frame's axis before and after (`frameKnots`), its
 * right border with them.
 */
export function frameMotion(
  before: Drawn,
  was: ElisionExposure,
  after: Drawn,
  now: ElisionExposure,
  measure: TextMeasure,
): CardMotion {
  const { drawing } = after;
  const from = frameKnots(was);
  const to = frameKnots(now);
  const offset = drawing.origin.x - before.drawing.origin.x;
  const motion = sideways(
    from,
    to,
    offset,
    () => 0,
    { after: now.gaps, before: was.gaps },
    hiddenBy(was, from),
  );
  const frame = keyedBox(drawing, now.key);
  const cards = drawing.boxes.filter((box) => box.kind === "card");
  const inCard = (index: number) =>
    cards.some(({ range }) => range.start <= index && index < range.end);
  const keys = new Set(now.gaps.map((gap) => addressKey(gap.address)));
  const owned = new Set<number>();
  if (frame !== undefined) {
    for (let index = frame.range.start; index < frame.range.end; index += 1) {
      if (!inCard(index)) owned.add(index);
    }
  }
  // A frame's gaps and their parts are written after every item, outside every card.
  drawing.elements.forEach((element, index) => {
    if (inCard(index) || element.address.id === undefined) return;
    const { id, part = [] } = element.address;
    const gap =
      part[0] === "elision"
        ? partAddress(idAddress(id), "elision")
        : part.length <= 1
          ? idAddress(id)
          : undefined;
    if (gap !== undefined && keys.has(addressKey(gap))) owned.add(index);
  });
  const motions = new Map<number, Motion>();
  for (const index of owned) {
    const element = drawing.elements[index];
    if (element !== undefined) motions.set(index, motion(extentOf(element, measure), index));
  }
  return {
    key: placeKeyText(now.key),
    holds: (index) => motions.has(index),
    motionOf: (index) => motions.get(index) ?? STILL,
  };
}

/**
 * How the ancestor card `card` of `drawn` unfolds out of the member card it
 * is aligned to when it is shown: each element travels down as a raise
 * moves it (`raiseUnfold`: its row's shift, entering where its row does or
 * it has none, and where it lies in a gap: a gap's ellipses and labels)
 * and sideways from the member's line in the member card, which draws the
 * member's span at the card's own abscissas: what lies left or right of
 * that span starts at the member line's start or end and opens out of it.
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
      const at = float(zeroOf(manifest, axis.timeline)) + float(axis.start);
      from.push({ x: axis.xStart, at }, { x: axis.xEnd, at: at + float(axis.drawnLength) });
      break;
    }
  }
  const gaps = (exposureOf(drawing, card)?.gaps ?? []).map((gap) => [gap.x1, gap.x2] as const);
  return rangeMotion(drawing, card, measure, ([left, right], index) => {
    const row = rows.motionOf(index);
    return {
      across: {
        left,
        right,
        fromLeft: startOf(from, to, 0, left),
        fromRight: startOf(from, to, 0, right),
      },
      dy: row?.shift ?? 0,
      enters: row === null || row.enters || within(gaps, left, right),
    };
  });
}

/** The motion of the card `card` of `drawing`, each element of its range moving by `motion`. */
function rangeMotion(
  drawing: Drawing,
  card: DrawnBox,
  measure: TextMeasure,
  motion: (extent: readonly [number, number], index: number) => Motion,
): CardMotion {
  const { start, end } = card.range;
  const motions: Motion[] = [];
  for (let index = start; index < end; index += 1) {
    const element = drawing.elements[index];
    motions.push(element === undefined ? STILL : motion(extentOf(element, measure), index));
  }
  return {
    key: card.key === null ? "" : placeKeyText(card.key),
    holds: (index) => index >= start && index < end,
    motionOf: (index) => motions[index - start] ?? STILL,
  };
}

/** Every card of `drawing` by place key text: ancestor cards, the block's cards and members' cards. */
function cardsOf(drawing: Drawing): Map<string, DrawnBox> {
  const cards = new Map<string, DrawnBox>();
  for (const box of drawing.boxes) {
    if (box.kind === "card" && box.key !== null) cards.set(placeKeyText(box.key), box);
  }
  return cards;
}

/** Every frame's record in `drawing` by place key text. */
function framesOf(drawing: Drawing): Map<string, ElisionExposure> {
  const frames = new Map<string, ElisionExposure>();
  for (const exposure of drawing.elisions) {
    if (exposure.kind === "frame") frames.set(placeKeyText(exposure.key), exposure);
  }
  return frames;
}

/** Whether `drawing` draws the member card an ancestor card `card` is aligned to. */
function drawsMember(drawing: Drawing, card: DrawnBox): boolean {
  const { ancestor } = card;
  return (
    ancestor !== undefined &&
    keyedBox(drawing, { item: ancestor.group, member: ancestor.member }) !== undefined
  );
}

/** Whether `drawing` draws its items side by side, the roots they hang on drawn once. */
function sideBySide(drawing: Drawing): boolean {
  const { arrangement } = drawing;
  return arrangement?.direction === "horizontal" && arrangement.refused === undefined;
}

/** An element blending in where it is drawn, or (read backwards) fading out where it was. */
const FADES: Motion = { across: null, dy: 0, enters: true };

/**
 * How every item of `after` (a group's frame, an ungrouped root's card)
 * whose place on the canvas `before` drew elsewhere moves, and with it every
 * ancestor card lying behind one frame alone, which moves with its frame
 * (a root drawn once behind a row lies behind several and moves by
 * `blockMotion`): each element of its range translated, from where `before`
 * drew it (its place less the place origin's, so a moved origin is no move)
 * to where `after` draws it; one drawn at the same place moves nothing.
 */
export function itemMotions(before: Drawing, after: Drawing): CardMotion[] {
  return after.boxes.flatMap((box): CardMotion[] => {
    const { key } = box;
    if (key === null) return [];
    const behindOne = box.ancestor !== undefined && box.ancestor.groups.length === 1;
    if (!isItem(box) && !behindOne) return [];
    const was = behindOne
      ? before.boxes.find(
          (other) =>
            other.ancestor !== undefined && other.key !== null && samePlaceKey(other.key, key),
        )
      : keyedBox(before, key);
    if (was === undefined) return [];
    const dx = box.x - after.origin.x - (was.x - before.origin.x);
    const dy = box.y - after.origin.y - (was.y - before.origin.y);
    if (dx === 0 && dy === 0) return [];
    const motion: Motion = {
      across: { left: 0, right: 0, fromLeft: -dx, fromRight: -dx },
      dy: -dy,
      enters: false,
    };
    const { start, end } = box.range;
    return [
      {
        key: placeKeyText(key),
        holds: (index) => index >= start && index < end,
        motionOf: () => motion,
      },
    ];
  });
}

/**
 * What moves when a block is drawn `after` instead of `before`: first every
 * item whose place changed travels whole (`itemMotions`), its contents taking
 * no motion of their own; then each card
 * both draw whose elisions changed (its own, or its frame's for a member
 * card) moves sideways (`sidewaysMotion`), each frame whose group elisions
 * changed with it (`frameMotion`); each ancestor card only `after` draws,
 * whose member card `before` drew, unfolds out of it (`unfoldingMotion`);
 * each ancestor card only `before` draws, whose member card `after` draws,
 * folds back into it, read in `before` and moved by the change of the place
 * origin. Where the items start or stop standing side by side, an ancestor
 * card drawn only `after` fades in and one drawn only `before` fades out
 * instead. Nothing else moves.
 */
export function blockMotion(before: Drawn, after: Drawn, measure: TextMeasure): BlockMotion {
  const was = cardsOf(before.drawing);
  const now = cardsOf(after.drawing);
  const switched = sideBySide(before.drawing) !== sideBySide(after.drawing);
  const cards: CardMotion[] = itemMotions(before.drawing, after.drawing);
  for (const [key, card] of now) {
    const old = was.get(key);
    if (old !== undefined) {
      const changed =
        elisionsText(exposureOf(before.drawing, old)) !==
        elisionsText(exposureOf(after.drawing, card));
      if (changed) cards.push(sidewaysMotion(before, old, after, card, measure));
    } else if (card.ancestor !== undefined && switched) {
      cards.push(rangeMotion(after.drawing, card, measure, () => FADES));
    } else if (card.ancestor !== undefined && drawsMember(before.drawing, card)) {
      cards.push(unfoldingMotion(after, card, measure));
    }
  }
  const frames = framesOf(before.drawing);
  for (const [key, exposure] of framesOf(after.drawing)) {
    const old = frames.get(key);
    if (old !== undefined && elisionsText(old) !== elisionsText(exposure)) {
      cards.push(frameMotion(before, old, after, exposure, measure));
    }
  }
  const leaving: LeavingCard[] = [];
  const dx = after.drawing.origin.x - before.drawing.origin.x;
  const dy = after.drawing.origin.y - before.drawing.origin.y;
  for (const [key, card] of was) {
    if (now.has(key) || card.ancestor === undefined) continue;
    if (!switched && !drawsMember(after.drawing, card)) continue;
    const motion = switched
      ? rangeMotion(before.drawing, card, measure, () => FADES)
      : unfoldingMotion(before, card, measure);
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
