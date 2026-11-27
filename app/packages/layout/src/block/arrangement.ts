/**
 * A block arranged side by side (`docs/drawing.md` in TimeToShare, sections
 * 8.6 and 8.8, Drawn once): its items in one row, packed from the left, and
 * every root that groups hang on drawn once behind the row, the roots one
 * under another, each group standing where its anchor's stretch lies on its
 * roots. The row, the roots and the anchors are core's (`rowOf`); this module
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
  type AncestorElisions,
  arrangementSource,
  carriedGaps,
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
import {
  type CardAxis,
  type Context,
  type Gap,
  type Holder,
  known,
  nth,
  withAxis,
} from "../traversal.ts";
import {
  alignedRows,
  alone,
  type Behind,
  behind,
  elisionsBehind,
  frameRoom,
  type LaidAncestorCard,
  lineAt,
  protectedSpan,
} from "./ancestors.ts";
import { axesOf } from "./axes.ts";
import { columnsOf, contentRight, type Horizontal, horizontalOf } from "./horizontal.ts";
import { type ItemDrawing, type LaidItem, laidOut } from "./items.ts";
import { type Item, placeItems } from "./places.ts";

/** The half of the standard gap a gap or seam between two anchors keeps on either side of `c`. */
const HALF_GAP = STANDARD_GAP / 2;

/** The row gap's least value: the standard gap and 8 on either side of it (section 8.6). */
const LEAST_ROW_GAP = 48;

/** A block laid out side by side: its items at their places, laid out, and its once cards. */
export interface RowLayout {
  readonly items: readonly Item[];
  readonly drawings: readonly ItemDrawing[];
  readonly horizontal: Horizontal;
  readonly laid: readonly LaidItem[];
  readonly once: readonly LaidAncestorCard[];
}

/** One anchor of a group on a root, with the ancestor card behind that group aligned to it. */
interface Anchored {
  readonly anchor: Anchor;
  readonly at: Behind;
  /** `R` laid out alone behind the group, at that card's `LA` (section 8.8, step 1). */
  readonly first: MemberLayout;
}

/** A root drawn once along the row, before its ordinates are known. */
interface OnceCard {
  readonly anchors: readonly Anchored[];
  readonly layout: MemberLayout;
  readonly axis: CardAxis;
  /** Its own elisions' choices, as the card behind its first group makes them at the least proportion. */
  readonly elisions: AncestorElisions;
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

/**
 * The block of `context` arranged side by side in the row `row` (sections
 * 8.6 and 8.8): its items in the row's order, the first at `P` and each
 * further one the row gap `max(S, 48)` right of the previous one's drawn
 * width; the once card of each root behind the row, drawn in runs at its
 * anchors' scales, with a gap or a seam between two anchors; the roots' lines
 * one under another, the groups' cards padded so that every anchor lies on
 * its root's line; the tops so that the highest frame or once card lies at
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
  // The once cards are found on the items as first laid out: what they read of the row, its
  // frames' places, widths and heights and the block's columns, no ancestor row moves.
  const placed = placeItems(context, block, top, new Map(), [], { order });
  const before = laidOut(context, placed, measure);
  const { horizontal } = before;
  const widths = before.laid.map(({ item, boxes }) => ({
    width: item.scale * (boxes[0]?.width ?? 0),
    height: 0,
  }));
  const gap = Math.max(placement.spacing, LEAST_ROW_GAP);
  const lefts = (start: number) =>
    packed(widths, { direction: "horizontal", gap, start: { x: start, y: 0 } }).map(
      (offset) => offset.x,
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
  const frames = before.laid.map(({ boxes }) => boxes[0] ?? { x: 0, width: 0, height: 0 });
  // The least proportion of every ancestor card of a root (section 8.8): each as section 8.9 gives it.
  const proportions = byRoot.map((anchors) =>
    Math.min(
      ...anchors.map(
        ({ at, first: alone }) =>
          elisionsBehind(context, at, alone, nth(frames, at.frameAt), horizontal.s0).proportion,
      ),
    ),
  );
  const onceAt = (start: number) => {
    const xs = lefts(start);
    return byRoot.map((anchors, index) =>
      onceCard(context, anchors, xs, frames, horizontal, nth(proportions, index), measure),
    );
  };
  let xs = lefts(P);
  let once = onceAt(P);
  const leftmost = Math.min(...once.map((card) => card.left));
  if (leftmost < P) {
    const start = P + (P - leftmost);
    xs = lefts(start);
    once = onceAt(start);
  }

  // The once card of each root is the ancestor card behind the first group of the row hanging on
  // it; only it aligns its frame's rows, on its own rows (section 8.3), every label stack it draws
  // counted.
  const onceRows = new Map(
    once.map((card) => [placeKeyText(nth(card.anchors, 0).at.key), card.layout] as const),
  );
  const aligned = alignedRows(context, block, placed, horizontal, (at) =>
    onceRows.get(placeKeyText(at.key)),
  );
  const items =
    aligned.size === 0 ? placed : placeItems(context, block, top, aligned, placed, { order });
  const first = aligned.size === 0 ? before : laidOut(context, items, measure);

  // The lines of the roots, one under another (section 8.8, Vertically): the first at 0, each
  // further one below the card above and as low as each group lying on both needs.
  const ordinate = new Map<string, number>();
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
  row.roots.forEach((root, index) => {
    if (index === 0) {
      ordinate.set(root, 0);
      return;
    }
    const above = nth(once, index - 1);
    const here = nth(once, index);
    const upper = ordinate.get(nth(row.roots, index - 1)) ?? 0;
    const candidates = [upper + extentBelow(above) + spacing + extentAbove(here)];
    for (const each of nth(byRoot, index)) {
      const own = inGroup(each.anchor.group);
      const at = own.indexOf(each);
      const before = at > 0 ? own[at - 1] : undefined;
      if (before === undefined) continue;
      const Q = ordinate.get(before.anchor.root);
      if (Q === undefined) continue;
      candidates.push(Q + each.at.item.scale * (known(yM, each) - known(yM, before)));
    }
    ordinate.set(root, Math.max(...candidates));
  });

  // Padding: each later anchor's card lies lower by what its root's line asks beyond the group's
  // own distance, the gap above it grown so.
  const padding = new Map<string, number>();
  const groups = [...new Set(row.anchors.map((anchor) => anchor.group))];
  for (const group of groups) {
    const own = inGroup(group);
    own.forEach((each, index) => {
      const before = index > 0 ? own[index - 1] : undefined;
      if (before === undefined) return;
      const sG = each.at.item.scale;
      const delta =
        (known(ordinate, each.anchor.root) - known(ordinate, before.anchor.root)) / sG -
        (known(yM, each) - known(yM, before));
      if (delta !== 0)
        padding.set(placeKeyText({ item: group, member: each.anchor.member }), delta);
    });
  }
  const padded =
    padding.size === 0
      ? items
      : placeItems(context, block, top, aligned, items, { order, padding });

  // The tops: a group at its first anchor's, a once card at its line less its reach above it,
  // every item hanging on nothing at the highest of them; then all moved so that the highest lies
  // at `top`. Where no group hangs on a root there is no such top, and every item lies at `top`.
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
  const T0 = highest.length === 0 ? top : Math.min(...highest);
  const shift = top - T0;
  const final = padded.map((item, index): Item => {
    const id = item.key.item;
    return { ...item, x: nth(xs, index), y: (tops.get(id) ?? T0) + shift };
  });
  const result = laidOut(context, final, measure);
  return {
    ...result,
    once: once.flatMap((card, index) =>
      yM.has(nth(card.anchors, 0))
        ? laidOnce(
            context,
            card,
            nth(onceTops, index) + shift,
            groupsOn(row, nth(row.roots, index)),
          )
        : [],
    ),
  };
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

/**
 * The once card of a root along the row, its items' left edges `xs` and their
 * laid boxes `frames` (section 8.8, Drawn once, The axis of a once card):
 * `R`'s line in runs, the run of an anchor `M` of a group `G` at `(xG, sG)`
 * giving `t` the x `XM(t) = xG + sG × (x0 + (L × u − D))`; between two
 * anchors next to each other a gap from the largest whole unit `s` no less
 * than the first's end with `XA(s) ≤ c − 16` to the smallest `e` no more than
 * the second's start with `XB(e) ≥ c + 16`, or a seam at `max(b, min(a, s))`
 * where `s` is not below `e`; the gaps carried from each anchor's frame in its
 * run; left of the first stretch and right of the last the gaps that the
 * ancestor card behind the first and the last group draws there, at the least
 * proportion `r` of `R`'s ancestor cards, their widths multiplied by their
 * groups' scales. `R` is laid out alone behind its first group, at that
 * card's `LA`, on that axis.
 */
function onceCard(
  context: Context,
  anchors: readonly Anchored[],
  xs: readonly number[],
  frames: readonly { readonly x: number; readonly width: number; readonly height: number }[],
  horizontal: Horizontal,
  r: number,
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

  // The gaps the ancestor cards behind the first and the last group draw outside their stretches,
  // at the least proportion of every ancestor card of `R`.
  const elisionsAt = (each: Anchored) =>
    elisionsBehind(context, each.at, each.first, nth(frames, each.at.frameAt), s0, r);
  const elisions = elisionsAt(head);
  const lastElisions = last === head ? elisions : elisionsAt(last);
  const [protectedStart] = protectedSpan(head.at);
  const [, protectedEnd] = protectedSpan(last.at);
  const leftGaps = (elisions.axis?.gaps ?? []).filter(
    (gap) => compareReal(gap.b, protectedStart) <= 0,
  );
  const rightGaps = (lastElisions.axis?.gaps ?? []).filter(
    (gap) => compareReal(gap.a, protectedEnd) >= 0,
  );
  const sN = last.at.item.scale;
  // The room the first and the last group's frames leave left and right of their member drawings
  // (section 8.8, step 2), the widths of the card's seams at the ends of its stretches.
  const roomOf = ({ at }: Anchored) =>
    frameRoom(nth(frames, at.frameAt), s0, at.item.length - at.item.DG);
  const OL = s1 * roomOf(head).left;
  const OR = sN * roomOf(last).right;
  // A position left of the first stretch lies `s1 × DL` right of the first run less `s1 × OL`, one
  // right of the last stretch `sN × DR` left of the last run and `sN × OR` right of it; a position
  // at the first stretch's start lies on its run but as the end of what lies left of it, one at
  // the last stretch's end on its run but as the start of what lies right of it.
  const shrinks = (gaps: readonly Gap[], counted: (gap: Gap) => boolean) =>
    gaps.reduce((sum, gap) => (counted(gap) ? sum + gap.shrink : sum), 0);
  const X = (t: Real, after: boolean): number => {
    let index = 0;
    while (index < between.length) {
      const { start, end } = nth(between, index);
      const seam = compareReal(start, end) === 0;
      const compared = compareReal(t, start);
      if (compared < 0 || (compared === 0 && !(seam && after))) break;
      index++;
    }
    const value = nth(runs, index)(t);
    const toStart = compareReal(t, protectedStart);
    if (index === 0 && (toStart < 0 || (toStart === 0 && !after))) {
      return value + s1 * shrinks(leftGaps, (gap) => compareReal(gap.a, t) >= 0) - OL;
    }
    const toEnd = compareReal(t, protectedEnd);
    if (index === runs.length - 1 && (toEnd > 0 || (toEnd === 0 && after))) {
      return value - sN * shrinks(rightGaps, (gap) => compareReal(gap.b, t) <= 0) + OR;
    }
    return value;
  };
  const X0 = X(zeroOf(scope), false);
  const local = (t: Real, after: boolean) => (X(t, after) - X0) / s1;
  const entryOf = (gap: Gap) =>
    gap.entry === undefined
      ? undefined
      : scope.entries.find((entry) => entry.manifest.id === gap.entry?.manifest.id);
  const fromCard = (gap: Gap, scale: number): PlacedGap => ({
    source: gap.source,
    a: gap.a,
    b: gap.b,
    n: (gap.n * scale) / s1,
    g: (gap.g * scale) / s1,
    left: local(gap.a, false),
    right: local(gap.b, false),
    entry: entryOf(gap),
  });
  const gaps: PlacedGap[] = leftGaps.map((gap) => fromCard(gap, s1));
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
    const { start, end, XA, XB } = room;
    if (compareReal(start, end) === 0) {
      seams.push({ at: start, inclusive: false, startsRight: true });
      return;
    }
    const left = local(start, false);
    const right = local(end, true);
    gaps.push({
      source: arrangementSource(
        scope,
        head.at.style,
        start,
        end,
        (scope.u(start) + scope.u(end)) / 2,
      ),
      a: start,
      b: end,
      n: (XA(end) - XA(start)) / s1,
      g: (XB(end) - XA(start)) / s1,
      left,
      right,
      entry: scope.rootEntry,
    });
  });
  gaps.push(...rightGaps.map((gap) => fromCard(gap, sN)));
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
    elisions,
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
  const { layout, axis, elisions } = card;
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
        mode: style["elision-mode"],
        drawn: elisions.mode,
        proportion: elisions.proportion,
        automatic: elisions.automatic,
        chain: ancestor.member.ancestors.map((each) => each.timeline.id),
        depths: elisions.depths,
        display: elisions.display,
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
