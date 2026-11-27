/**
 * A block arranged side by side (`docs/drawing.md` in TimeToShare, sections
 * 8.6 and 8.8, Drawn once): its items in one row, packed from the left by
 * their row extents, and every shared root, one that two or more groups hang
 * on, drawn once behind the row on a line, several roots side by side on one
 * line where their extents leave room, each group standing where its anchor's
 * stretch lies on its roots. A root that one group hangs on keeps its
 * ancestor card behind that group's frame, as in a block not arranged. The
 * row, the shared roots and the anchors are core's (`rowOf`); this module
 * places them.
 */

import {
  cardAddress,
  idAddress,
  type PlaceKey,
  placeKeyText,
  type Real,
} from "@timetoalign/tilie-core";
import type { Anchor, Row } from "@timetoalign/tilie-core/drawing";
import { compareReal } from "@timetoalign/tilie-core/numbers";
import type { NumberType } from "@timetoalign/timetoshare";
import { packed } from "../arrangement.ts";
import type { DrawnAxis } from "../boxes.ts";
import { CARD_SPACING, K, P, SHADOW_OFFSET, STANDARD_GAP } from "../constants.ts";
import type { DrawnElement } from "../elements.ts";
import {
  arrangementSource,
  carriedGaps,
  derivedDisplay,
  type ElisionWord,
  exposedGap,
  type PlacedGap,
  type PlacedSeam,
  placedAxis,
  rounded,
  wholeUnit,
} from "../elisions.ts";
import { layoutScope, type MemberLayout } from "../member.ts";
import type { TextMeasure } from "../metrics.ts";
import { add, negate, proportion } from "../numbers.ts";
import { type CardAxis, type Context, type Holder, known, nth, withAxis } from "../traversal.ts";
import {
  alignedRows,
  alone,
  ancestorCards,
  type Behind,
  behind,
  elidedRoots,
  frameBoxes,
  frameRoom,
  type LaidAncestorCard,
  lineAt,
  protectedSpan,
} from "./ancestors.ts";
import { axesOf } from "./axes.ts";
import { columnsOf, contentRight, type Horizontal, horizontalOf } from "./horizontal.ts";
import { type ItemDrawing, type LaidItem, type LaidOut, laidOut } from "./items.ts";
import { type Item, placeItems } from "./places.ts";

/** The half of the standard gap a gap or seam between two anchors keeps on either side of `c`. */
const HALF_GAP = STANDARD_GAP / 2;

/** The row gap's least value: the standard gap and 8 on either side of it (section 8.6). */
const LEAST_ROW_GAP = 48;

/** How far beyond its outer frame's edge a shared root's start or end gap may begin (section 8.8). */
const OUTER_REACH = 8;

/** A block laid out side by side: its items at their places, laid out, and its ancestor cards. */
export interface RowLayout {
  readonly items: readonly Item[];
  readonly drawings: readonly ItemDrawing[];
  readonly horizontal: Horizontal;
  readonly laid: readonly LaidItem[];
  /**
   * The ancestor cards in the order they are written (section 8.5): the once cards of the shared
   * roots line by line from the top and on each line from the left, then the ancestor cards of the
   * roots one group hangs on, frame by frame in the row.
   */
  readonly ancestors: readonly LaidAncestorCard[];
  /** The shared roots line by line from the top and on each line from the left (section 1). */
  readonly roots: readonly string[];
}

/** One anchor of a group on a root, with the ancestor card behind that group aligned to it. */
interface Anchored {
  readonly anchor: Anchor;
  readonly at: Behind;
  /** `R` laid out alone behind the group, at that card's `LA` (section 8.8, step 1). */
  readonly first: MemberLayout;
}

/** A shared root drawn once along the row, before its ordinates are known. */
interface OnceCard {
  readonly anchors: readonly Anchored[];
  readonly layout: MemberLayout;
  readonly axis: CardAxis;
  /** The `display` of the gaps the arrangement cuts in it: its `elision-display`. */
  readonly display: readonly ElisionWord[];
  /** The start `s0'` and name column `n'` of `R` laid out alone. */
  readonly s0: number;
  readonly n: number;
  /** Its right edge `Ri' + K`, in its own coordinates. */
  readonly right: number;
  /** The ordinate `yR` of `R`'s line in its layout, its height `Hm`; null where its line is not drawn. */
  readonly yR: number | null;
  readonly height: number;
  /** Its first group's scale `s1`, its left edge in place coordinates. */
  readonly scale: number;
  readonly left: number;
  /** It is displayed and its root's line is drawn; it is drawn where the line it is aligned to is too. */
  readonly drawn: boolean;
}

/** How far a frame's displayed ancestor cards of roots one group hangs on reach beyond it. */
interface Overhang {
  readonly left: number;
  readonly right: number;
}

/**
 * The block of `context` arranged side by side in the row `row` (sections
 * 8.6 and 8.8): its items in the row's order, each item's row extent (its
 * drawn width and the ancestor cards of roots one group hangs on that lie
 * beyond it) the row gap `max(S, 48)` right of the previous one's; the once
 * card of each shared root behind the row, drawn in runs at its anchors'
 * scales, with a gap or a seam between two anchors and a start or an end gap
 * where it runs on past its outer frames; the shared roots on lines, one
 * under another and side by side where their extents lie `S` apart, the
 * groups' cards padded so that every anchor lies on its root's line; the
 * tops so that the highest frame, card, once card or ancestor card lies at
 * the first item's default `y`, `top`; the row packed again further right
 * where a once card would lie left of `P`.
 */
export function rowLayout(
  context: Context,
  block: Holder,
  top: number,
  row: Row,
  measure: TextMeasure,
): RowLayout {
  const { placement } = context;
  const order = row.row;
  const shared = new Set(row.roots);
  // The once cards are found on the items as first laid out: what they read of the row, its
  // frames' places, widths and heights and the block's columns, no ancestor row moves.
  const placed = placeItems(context, block, top, new Map(), [], { order });
  const before = laidOut(context, placed, measure);
  const { horizontal } = before;
  const frames = before.laid.map(({ boxes }) => boxes[0] ?? { x: 0, width: 0, height: 0 });

  // A root that one group hangs on keeps its ancestor card behind that group's frame, laid out as
  // in a block not arranged; its abscissas widen the frame's row extent.
  const elided = elidedRoots(context, block, frameBoxes(before.laid), horizontal.s0);
  const ownRoot = (at: Behind) =>
    shared.has(at.ancestor.root.timeline.id) ? undefined : elided(at);
  const ownCards = (laid: LaidOut) =>
    ancestorCards(context, block, laid.items, laid.drawings, laid.horizontal, measure, ownRoot);
  const overhangs = overhangsOf(before, ownCards(before));
  const gap = Math.max(placement.spacing, LEAST_ROW_GAP);
  const extents = before.laid.map(({ item }, index) => {
    const { left, right } = nth(overhangs, index);
    return { width: left + item.scale * nth(frames, index).width + right, height: 0 };
  });
  const lefts = (start: number) =>
    packed(extents, { direction: "horizontal", gap, start: { x: start, y: 0 } }).map(
      (offset, index) => offset.x + nth(overhangs, index).left,
    );

  const ats = new Map(
    behind(context, block, placed, horizontal.s0).map((at) => [placeKeyText(at.key), at] as const),
  );
  const anchored = (anchor: Anchor): Anchored | undefined => {
    const key: PlaceKey = { item: anchor.group, member: anchor.root };
    const at = ats.get(placeKeyText(key));
    if (at === undefined) return undefined;
    return { anchor, at, first: alone(context, block, at) };
  };
  const byRoot = row.roots.map((root) =>
    row.anchors
      .filter((anchor) => anchor.root === root)
      .flatMap((anchor) => anchored(anchor) ?? []),
  );
  const onceAt = (start: number) => {
    const xs = lefts(start);
    return byRoot.map((anchors) => onceCard(anchors, xs, frames, horizontal, measure));
  };
  let xs = lefts(P);
  let once = onceAt(P);
  const leftmost = Math.min(...once.map((card) => card.left));
  if (leftmost < P) {
    const start = P + (P - leftmost);
    xs = lefts(start);
    once = onceAt(start);
  }

  // The once card of each shared root is the ancestor card behind the first group of the row
  // hanging on it; it aligns its frame's rows on its own rows (section 8.3), every label stack it
  // draws counted, and an ancestor card of a root one group hangs on aligns its frame's as in a
  // block not arranged.
  const onceRows = new Map(
    once.map((card) => [placeKeyText(nth(card.anchors, 0).at.key), card.layout] as const),
  );
  const aligned = alignedRows(
    context,
    block,
    placed,
    horizontal,
    (at) => onceRows.get(placeKeyText(at.key)) ?? ownRoot(at)?.layout,
  );
  const items =
    aligned.size === 0 ? placed : placeItems(context, block, top, aligned, placed, { order });
  const first = aligned.size === 0 ? before : laidOut(context, items, measure);

  // The anchors' lines in their cards, and each group's anchors on shared roots in display order.
  const yM = new Map<Anchored, number>();
  for (const anchors of byRoot) {
    for (const each of anchors) {
      const line = anchorLine(first.drawings, each);
      if (line !== undefined) yM.set(each, line);
    }
  }
  const inGroup = (group: string) =>
    byRoot
      .flat()
      .filter((each) => each.anchor.group === group && yM.has(each))
      .sort((left, right) => row.anchors.indexOf(left.anchor) - row.anchors.indexOf(right.anchor));
  const spacing = placement.spacing;

  // The lines (section 8.8, Vertically, step 1): each shared root in its order takes the highest
  // line below the lines of the roots above it on which its extent overlaps none already there.
  const extentOf = (card: OnceCard) => ({
    left: card.left,
    right: card.left + card.scale * (card.right + SHADOW_OFFSET),
  });
  const lineOf = new Map<string, number>();
  const lines: number[][] = [];
  row.roots.forEach((root, index) => {
    const mine = extentOf(nth(once, index));
    let line = 0;
    for (const [upper, lower] of row.above) {
      if (lower === root) line = Math.max(line, known(lineOf, upper) + 1);
    }
    const apart = (other: number) => {
      const theirs = extentOf(nth(once, other));
      return mine.right + spacing <= theirs.left || theirs.right + spacing <= mine.left;
    };
    while (line < lines.length && !nth(lines, line).every(apart)) line++;
    if (line === lines.length) lines.push([]);
    nth(lines, line).push(index);
    lineOf.set(root, line);
  });

  // The ordinates of the lines (step 2): the first at 0, each further one below the cards of the
  // line above and as low as each group lying on both needs.
  const lineY: number[] = [];
  const ordinate = new Map<string, number>();
  lines.forEach((indices, line) => {
    if (line === 0) {
      lineY.push(0);
    } else {
      const above = nth(lines, line - 1);
      const candidates = [
        nth(lineY, line - 1) +
          Math.max(...above.map((index) => extentBelow(nth(once, index)))) +
          spacing +
          Math.max(...indices.map((index) => extentAbove(nth(once, index)))),
      ];
      for (const index of indices) {
        for (const each of nth(byRoot, index)) {
          const own = inGroup(each.anchor.group);
          const at = own.indexOf(each);
          const previous = at > 0 ? own[at - 1] : undefined;
          if (previous === undefined) continue;
          const Q = ordinate.get(previous.anchor.root);
          if (Q === undefined) continue;
          candidates.push(Q + each.at.item.scale * (known(yM, each) - known(yM, previous)));
        }
      }
      lineY.push(Math.max(...candidates));
    }
    for (const index of indices) ordinate.set(nth(row.roots, index), nth(lineY, line));
  });

  // Padding (step 3): each later anchor's card lies lower by what its root's line asks beyond the
  // group's own distance, the gap above it grown so.
  const padding = new Map<string, number>();
  const groups = [...new Set(row.anchors.map((anchor) => anchor.group))];
  for (const group of groups) {
    const own = inGroup(group);
    own.forEach((each, index) => {
      const previous = index > 0 ? own[index - 1] : undefined;
      if (previous === undefined) return;
      const sG = each.at.item.scale;
      const delta =
        (known(ordinate, each.anchor.root) - known(ordinate, previous.anchor.root)) / sG -
        (known(yM, each) - known(yM, previous));
      if (delta !== 0)
        padding.set(placeKeyText({ item: group, member: each.anchor.member }), delta);
    });
  }
  const padded =
    padding.size === 0
      ? items
      : placeItems(context, block, top, aligned, items, { order, padding });
  const paddedLaid = padding.size === 0 ? first : laidOut(context, padded, measure);

  // The tops (step 4): a group at its first anchor's on a shared root, a once card at its line less
  // its reach above it, every item hanging on no shared root at the highest of them, the row's
  // top, or 0 where there is none; then all moved so that the highest frame, card, once card or
  // ancestor card of a root one group hangs on lies at `top`.
  const tops = new Map<string, number>();
  for (const group of groups) {
    const [head] = inGroup(group);
    if (head === undefined) continue;
    tops.set(group, known(ordinate, head.anchor.root) - head.at.item.scale * known(yM, head));
  }
  const onceTops = once.map(
    (card, index) => known(ordinate, nth(row.roots, index)) - extentAbove(card),
  );
  const highest = [...tops.values(), ...onceTops];
  const T0 = highest.length === 0 ? 0 : Math.min(...highest);
  const itemTop = (item: Item) => tops.get(item.key.item) ?? T0;
  const own = ownCards(paddedLaid);
  const ownTops = own.map((card) => {
    const item = padded.find((each) => each.key.item === card.group);
    return item === undefined ? T0 : itemTop(item) + item.scale * card.y;
  });
  const T = Math.min(...onceTops, ...ownTops, ...padded.map(itemTop));
  const shift = top - T;
  const final = padded.map(
    (item, index): Item => ({ ...item, x: nth(xs, index), y: itemTop(item) + shift }),
  );
  const result = laidOut(context, final, measure);
  // The ancestor cards of roots one group hangs on move with their frames.
  const ownPlaced = own.map((card): LaidAncestorCard => {
    const item = final.find((each) => each.key.item === card.group);
    if (item === undefined) return card;
    const place = { x: item.x, y: item.y, scale: item.scale };
    return { ...card, place, exposure: { ...card.exposure, place } };
  });
  // The once cards, line by line from the top and on each line from the left.
  const written = lines.flatMap((indices) =>
    [...indices].sort((left, right) => nth(once, left).left - nth(once, right).left),
  );
  return {
    ...result,
    ancestors: [
      ...written.flatMap((index) => {
        const card = nth(once, index);
        return yM.has(nth(card.anchors, 0))
          ? laidOnce(
              context,
              card,
              nth(onceTops, index) + shift,
              groupsOn(row, nth(row.roots, index)),
            )
          : [];
      }),
      ...ownPlaced,
    ],
    roots: written.map((index) => nth(row.roots, index)),
  };
}

/**
 * How far the displayed ancestor cards `cards` of roots one group hangs on reach beyond the frames
 * of `laid`, by item index, after the item's scale, shadows not counted: `left` past its left
 * edge, `right` past its right edge, 0 where none does.
 */
function overhangsOf(laid: LaidOut, cards: readonly LaidAncestorCard[]): Overhang[] {
  return laid.laid.map(({ item, boxes }) => {
    const width = boxes[0]?.width ?? 0;
    let left = 0;
    let right = 0;
    for (const card of cards) {
      if (card.group !== item.key.item) continue;
      left = Math.max(left, -item.scale * card.x);
      right = Math.max(right, item.scale * (card.x + card.width - width));
    }
    return { left, right };
  });
}

/** Every group hanging on `root`, in the row's order. */
function groupsOn(row: Row, root: string): string[] {
  return [...new Set(row.anchors.filter((anchor) => anchor.root === root).map((a) => a.group))];
}

/**
 * The ordinate `yM`, in its group's item coordinates, of the root's ancestor line in the anchor's
 * card, or of the anchor's own line where that ancestor line is not displayed; undefined where
 * neither is drawn.
 */
function anchorLine(drawings: readonly ItemDrawing[], { at }: Anchored): number | undefined {
  const drawn = drawings[at.frameAt]?.drawn[at.cardAt];
  if (drawn === undefined) return undefined;
  return (
    lineAt(drawn.elements, "ancestor", idAddress(at.ancestor.root.timeline.id)) ??
    lineAt(drawn.elements, "timeline", idAddress(at.ancestor.member.timeline.id))
  );
}

/** `aR`, how far a once card reaches above its root's line: `s1 × yR`. */
const extentAbove = (card: OnceCard): number => (card.yR === null ? 0 : card.scale * card.yR);

/** `bR`, how far a once card reaches below its root's line: `s1 × (Hm − yR)`. */
const extentBelow = (card: OnceCard): number =>
  card.yR === null ? 0 : card.scale * (card.height - card.yR);

/** Where a shared root is cut beyond its outer stretches: from `s` to `e` on its own axis. */
interface OuterGap {
  readonly s: Real;
  readonly e: Real;
}

/**
 * The once card of a shared root along the row, its items' left edges `xs`
 * and their laid boxes `frames` (section 8.8, Drawn once, The axis of a once
 * card): `R`'s line in runs, the run of an anchor `M` of a group `G` at
 * `(xG, sG)` giving `t` the x `XM(t) = xG + sG × (x0 + (L × u − D))`; between
 * two anchors next to each other a gap from the largest whole unit `s` no
 * less than the first's end with `XA(s) ≤ c − 16` to the smallest `e` no
 * more than the second's start with `XB(e) ≥ c + 16`, or a seam at
 * `max(b, min(a, s))` where `s` is not below `e`; the gaps carried from each
 * anchor's frame in its run; left of the first stretch and right of the last
 * `R` running on outwards from the outer frames' edges (`XO`), cut by a
 * start gap or an end gap 32 wide where more than 32 of it lies beyond the
 * whole unit within 8 of that edge, so that it ends at most 40 beyond the
 * outer frames. It draws no card elision and derives none, whatever its
 * mode. `R` is laid out alone behind its first group, at that card's `LA`,
 * on that axis.
 */
function onceCard(
  anchors: readonly Anchored[],
  xs: readonly number[],
  frames: readonly { readonly x: number; readonly width: number; readonly height: number }[],
  horizontal: Horizontal,
  measure: TextMeasure,
): OnceCard {
  const head = nth(anchors, 0);
  const last = nth(anchors, anchors.length - 1);
  const { first } = head;
  const scope = first.scope;
  const R = scope.rootEntry.manifest;
  const numberType = R.number_type;
  const s0 = horizontal.s0;
  const s1 = head.at.item.scale;
  // `XM(t)` of each anchor's run: where `R`'s ancestor line in `M`'s card puts `t`, continued.
  const runOf = ({ at }: Anchored) => {
    const { item } = at;
    const xG = nth(xs, at.frameAt);
    const frameGaps = item.elisions?.gaps ?? [];
    return (t: Real): number => {
      const u = proportion(add(t, negate(at.below)), at.lambda);
      let D = 0;
      for (const gap of frameGaps) if (gap.ub <= u) D = D + gap.shrink;
      return xG + item.scale * (s0 + (item.length * u - D));
    };
  };
  const runs = anchors.map(runOf);
  // The room right of each anchor's frame: the mean of its right edge and the next item's left.
  const between = anchors.slice(1).map((after, index) => {
    const before = nth(anchors, index);
    const XA = nth(runs, index);
    const XB = nth(runs, index + 1);
    const frameAt = before.at.frameAt;
    const right = nth(xs, frameAt) + before.at.item.scale * nth(frames, frameAt).width;
    const next = xs[frameAt + 1] ?? right;
    const c = (right + next) / 2;
    const b = before.anchor.end;
    const a = after.anchor.start;
    const s = largestWhole(b, numberType, (t) => XA(t) <= c - HALF_GAP) ?? b;
    const e = smallestWhole(a, numberType, (t) => XB(t) >= c + HALF_GAP) ?? a;
    if (compareReal(s, e) < 0) return { start: s, end: e, XA, XB };
    const lower = compareReal(a, s) < 0 ? a : s;
    const m = compareReal(b, lower) > 0 ? b : lower;
    return { start: m, end: m, XA, XB };
  });

  const [protectedStart] = protectedSpan(head.at);
  const [, protectedEnd] = protectedSpan(last.at);
  const sN = last.at.item.scale;
  // The room the first and the last group's frames leave left and right of their member drawings
  // (section 8.8, step 2), the widths of the card's seams at the ends of its stretches.
  const roomOf = ({ at }: Anchored) =>
    frameRoom(nth(frames, at.frameAt), s0, at.item.length - at.item.DG);
  const OL = s1 * roomOf(head).left;
  const OR = sN * roomOf(last).right;
  const XM1 = nth(runs, 0);
  const XN = nth(runs, runs.length - 1);
  // `XO(t)`: left of the first stretch `R` runs on outwards from the first frame's left edge `xl`,
  // right of the last from the last frame's right edge `xr`, at their scales; a position at the
  // first stretch's start or the last one's end lies on the seam's outer side there.
  const XO = (t: Real): number => (compareReal(t, protectedStart) <= 0 ? XM1(t) - OL : XN(t) + OR);
  const xl = XO(protectedStart);
  const xr = XO(protectedEnd);
  const start = zeroOf(scope);
  const end = add(start, scope.lambda);
  // The start gap and the end gap: where more than the standard gap of `R` lies beyond the whole
  // unit within 8 of the outer frame's edge, it is cut there, the gap 32 wide.
  let startGap: OuterGap | undefined;
  if (compareReal(start, protectedStart) < 0) {
    const e =
      smallestWhole(protectedStart, numberType, (t) => XO(t) >= xl - OUTER_REACH) ?? protectedStart;
    if (compareReal(start, e) < 0 && XO(e) - XO(start) > STANDARD_GAP) startGap = { s: start, e };
  }
  let endGap: OuterGap | undefined;
  if (compareReal(protectedEnd, end) < 0) {
    const s =
      largestWhole(protectedEnd, numberType, (t) => XO(t) <= xr + OUTER_REACH) ?? protectedEnd;
    if (compareReal(s, end) < 0 && XO(end) - XO(s) > STANDARD_GAP) endGap = { s, e: end };
  }
  // A position inside an outer gap lies on the gap's drawn width in proportion.
  const within = ({ s, e }: OuterGap, t: Real) =>
    (scope.u(t) - scope.u(s)) / (scope.u(e) - scope.u(s));
  const X = (t: Real, after: boolean): number => {
    if (startGap !== undefined && compareReal(t, startGap.e) < 0) {
      const right = XO(startGap.e);
      return right - STANDARD_GAP + STANDARD_GAP * within(startGap, t);
    }
    if (endGap !== undefined && compareReal(t, endGap.s) > 0) {
      return XO(endGap.s) + STANDARD_GAP * within(endGap, t);
    }
    let index = 0;
    while (index < between.length) {
      const { start: from, end: to } = nth(between, index);
      const seam = compareReal(from, to) === 0;
      const compared = compareReal(t, from);
      if (compared < 0 || (compared === 0 && !(seam && after))) break;
      index++;
    }
    const value = nth(runs, index)(t);
    const toStart = compareReal(t, protectedStart);
    if (index === 0 && (toStart < 0 || (toStart === 0 && !after))) return value - OL;
    const toEnd = compareReal(t, protectedEnd);
    if (index === runs.length - 1 && (toEnd > 0 || (toEnd === 0 && after))) return value + OR;
    return value;
  };
  const X0 = X(start, false);
  const local = (t: Real, after: boolean) => (X(t, after) - X0) / s1;
  const outer = (gap: OuterGap, left: number): PlacedGap => ({
    source: arrangementSource(
      scope,
      head.at.style,
      gap.s,
      gap.e,
      (scope.u(gap.s) + scope.u(gap.e)) / 2,
    ),
    a: gap.s,
    b: gap.e,
    n: (XO(gap.e) - XO(gap.s)) / s1,
    g: STANDARD_GAP / s1,
    left: (left - X0) / s1,
    right: (left + STANDARD_GAP - X0) / s1,
    entry: scope.rootEntry,
  });
  const gaps: PlacedGap[] =
    startGap === undefined ? [] : [outer(startGap, XO(startGap.e) - STANDARD_GAP)];
  const seams: PlacedSeam[] = [];
  anchors.forEach((each, index) => {
    const { at } = each;
    const scale = at.item.scale;
    for (const carried of carriedGaps(at.item.elisions, at.ts, at.lambda, numberType)) {
      gaps.push({
        source: carried.gap.source,
        a: carried.a,
        b: carried.b,
        n: (carried.gap.n * scale) / s1,
        g: (carried.gap.g * scale) / s1,
        left: local(carried.a, false),
        right: local(carried.b, false),
        entry: undefined,
      });
    }
    const room = between[index];
    if (room === undefined) return;
    const { start: from, end: to, XA, XB } = room;
    if (compareReal(from, to) === 0) {
      seams.push({ at: from, inclusive: false, startsRight: true });
      return;
    }
    gaps.push({
      source: arrangementSource(scope, head.at.style, from, to, (scope.u(from) + scope.u(to)) / 2),
      a: from,
      b: to,
      n: (XA(to) - XA(from)) / s1,
      g: (XB(to) - XA(from)) / s1,
      left: local(from, false),
      right: local(to, true),
      entry: scope.rootEntry,
    });
  });
  if (endGap !== undefined) gaps.push(outer(endGap, XO(endGap.s)));
  seams.push(
    { at: protectedStart, inclusive: true, startsRight: false },
    { at: protectedEnd, inclusive: false, startsRight: false },
  );
  const axis = placedAxis(scope, gaps, seams, local);
  const layout = layoutScope(withAxis(scope, axis), head.at.key, undefined);
  const columns = columnsOf([aloneItem(head, layout)]);
  const own = layout.drawAt(columns.s0, columns.n, 0, layout.height);
  const right =
    contentRight(
      horizontalOf(
        columns,
        [aloneItem(head, layout)],
        [{ elements: own.elements, L: head.at.LA }],
        measure,
      ),
      head.at.LA,
    ) + K;
  const yR = lineAt(own.elements, "timeline", idAddress(R.id)) ?? null;
  return {
    anchors,
    layout,
    axis,
    display: derivedDisplay(head.at.style),
    s0: columns.s0,
    n: columns.n,
    right,
    yR,
    height: layout.height,
    scale: s1,
    left: X0 - s1 * columns.s0,
    drawn: head.at.displayed && yR !== null,
  };
}

/** The zero of the root of `scope` on its own axis. */
function zeroOf(scope: MemberLayout["scope"]): Real {
  return scope.rootEntry.start;
}

/** `R` laid out alone as an item of one card, for the columns and the right edge of its card. */
function aloneItem({ at }: Anchored, layout: MemberLayout): Item {
  return {
    key: at.key,
    frame: null,
    stated: {},
    x: 0,
    y: 0,
    length: at.LA,
    scale: 1,
    spacing: CARD_SPACING,
    margin: 0,
    height: layout.height,
    cards: [
      {
        member: at.ancestor.root,
        ref: at.ref,
        address: cardAddress(at.ancestor.root.timeline.id),
        style: at.style,
        stated: {},
        spacing: CARD_SPACING,
        margin: 0,
        top: 0,
        height: layout.height,
        layout,
        mode: null,
      },
    ],
    content: layout.height,
    elisions: undefined,
    DG: 0,
  };
}

/**
 * The once card `card` drawn with its top at `top` (section 8.8, Drawing a
 * once card): its rectangle and its root's member drawing in its own
 * coordinates, placed at `X(start) − s1 × s0'` and `top` with its first
 * group's scale, its lines' axes, and its elisions; nothing where it is not
 * drawn, though it keeps its place.
 */
function laidOnce(
  context: Context,
  card: OnceCard,
  top: number,
  groups: readonly string[],
): LaidAncestorCard[] {
  if (!card.drawn) return [];
  const head = nth(card.anchors, 0);
  const { at } = head;
  const { ancestor, ref, style, key } = at;
  const root = ancestor.root;
  const address = cardAddress(root.timeline.id);
  const { layout, axis } = card;
  const own = layout.drawAt(card.s0, card.n, 0, layout.height);
  const rectangle: DrawnElement = {
    type: "ancestor_card",
    address,
    style,
    x: 0,
    y: 0,
    width: card.right,
    height: layout.height,
    shadowOffset: SHADOW_OFFSET,
  };
  const shadow = style.shadow === "none" ? 0 : SHADOW_OFFSET;
  const marked = { group: at.key.item, member: ancestor.member.timeline.id };
  const axes = axesOf(context.manifest, root, key, own, card.s0, at.LA, axis).map(
    (each): DrawnAxis => ({ ...each, ancestor: marked }),
  );
  const place = { x: card.left, y: top, scale: card.scale };
  return [
    {
      ref,
      group: marked.group,
      member: marked.member,
      groups,
      place,
      elements: [rectangle, ...own.elements],
      axes,
      x: 0,
      y: 0,
      width: card.right,
      height: layout.height,
      contentCount: layout.contentCount,
      rights: [card.right + shadow],
      bottoms: [layout.height + shadow],
      exposure: {
        kind: "ancestor_card",
        key,
        address,
        // A once card reads no elision property but `elision-display`: it draws no card elision
        // and derives none (section 8.8, Drawn once), as `full` would.
        mode: style["elision-mode"],
        drawn: "full",
        proportion: 1,
        automatic: false,
        chain: ancestor.member.ancestors.map((each) => each.timeline.id),
        depths: [],
        display: card.display,
        gaps: axis.gaps.map((gap) => exposedGap(gap, card.s0 + gap.left, card.s0 + gap.right, [])),
        runs: axis.runs,
        x0: card.s0,
        place,
      },
    },
  ];
}

/**
 * The largest whole unit of an axis of `numberType` no less than `from` for
 * which `fits` holds, `fits` holding up to some point and failing beyond it;
 * undefined where it fails at the first.
 */
function largestWhole(
  from: Real,
  numberType: NumberType,
  fits: (value: Real) => boolean,
): Real | undefined {
  const at = (k: bigint) => wholeUnit(k, numberType);
  let low = rounded(from, true);
  if (!fits(at(low))) return undefined;
  let step = 1n;
  while (fits(at(low + step))) {
    low = low + step;
    step = step * 2n;
  }
  // `low` fits, `low + step` does not.
  let high = low + step;
  while (high - low > 1n) {
    const middle = (low + high) / 2n;
    if (fits(at(middle))) low = middle;
    else high = middle;
  }
  return at(low);
}

/**
 * The smallest whole unit no more than `from` for which `fits` holds, `fits`
 * holding down to some point and failing below it; undefined where it fails
 * at the first.
 */
function smallestWhole(
  from: Real,
  numberType: NumberType,
  fits: (value: Real) => boolean,
): Real | undefined {
  const at = (k: bigint) => wholeUnit(k, numberType);
  let high = rounded(from, false);
  if (!fits(at(high))) return undefined;
  let step = 1n;
  while (fits(at(high - step))) {
    high = high - step;
    step = step * 2n;
  }
  let low = high - step;
  while (high - low > 1n) {
    const middle = (low + high) / 2n;
    if (fits(at(middle))) high = middle;
    else low = middle;
  }
  return at(high);
}
