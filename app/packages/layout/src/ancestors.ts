/**
 * Ancestor lines and the ancestor bands of a member that is a child timeline
 * (`docs/drawing.md` in TimeToShare, section 8.3).
 */

import {
  bandOrderOf,
  type ElementAddress,
  idAddress,
  type NamedTimestamp,
  partAddress,
  type TimelineManifest,
} from "@timetoalign/tilie-core";
import { cardStamps, type ElementKey, elementKey } from "@timetoalign/tilie-core/drawing";
import { compareReal, type Real } from "@timetoalign/tilie-core/numbers";
import { bandSides, type Centred, opposite, type Side } from "./bands.ts";
import type { AxisTimestamp, AxisWedge } from "./boxes.ts";
import type { Style } from "./cascade.ts";
import type {
  LineElement,
  LineEnd,
  MarkerElement,
  TextElement,
  VerticalLineElement,
} from "./elements.ts";
import {
  crossSectionElement,
  fadedStyle,
  markReach,
  rotatedStyle,
  type StampLabel,
  stampLabels,
} from "./markers.ts";
import { centredLabel, type NameItem, nameOf } from "./names.ts";
import { add, coordinateValue, lengthValue, negate, zero } from "./numbers.ts";
import { wedgeCorners } from "./rotation.ts";
import { type Carried, carried, cut, gapOf, type Span, tiersOf } from "./stacks.ts";
import {
  endOf,
  known,
  maxSize,
  nth,
  rowPitch,
  type Scope,
  type Styled,
  shown,
} from "./traversal.ts";

/**
 * A stack on an ancestor line (section 8.3): a named timestamp's coordinate
 * there, its primary one when the timestamp is the ancestor's own, else a
 * secondary one; with its wedge where drawn, its `rotation`, its drawn
 * labels and, for a primary coordinate, its cross-section line where drawn.
 */
interface AncestorStack {
  /** The timestamp's ID. */
  readonly id: string;
  /** It marks the ancestor's own timestamp's primary coordinate. */
  readonly primary: boolean;
  /** Its position on the member's axis. */
  readonly at: Real;
  /** Its abscissa from the member's start `x0` at full scale, unturned: `L × u`, which its first fit reads. */
  readonly x: number;
  readonly wedge: Styled | undefined;
  readonly rotation: number;
  readonly labels: readonly StampLabel[];
  readonly line: Styled | undefined;
}

/**
 * An ancestor drawn as a line beside the member, on the side opposite to where its own band order
 * puts its children band.
 */
interface AncestorLine {
  readonly timeline: TimelineManifest;
  /** The side of the member's line it lies on: opposite to its own children band's side. */
  readonly side: Side;
  readonly address: ElementAddress;
  readonly style: Style;
  /**
   * The style of a wedge held by it that no named timestamp holds (`Cascade.resolveUnaddressed`),
   * its `rotation` read: the mark an editor shows at a position on it.
   */
  readonly unnamed: Style;
  readonly name: Styled;
  /** It runs on to the left: `ts < 0`. */
  readonly left: boolean;
  /** It runs on to the right: its length or the member's is not known, or `te > λ`. */
  readonly right: boolean;
  /** Its end `te` on the member's axis where it does not run on. */
  readonly te: Real;
  /** How it ends where it does not run on. */
  readonly end: LineEnd;
  /** Its key, which holds its timestamps and their cross-section lines. */
  readonly key: ElementKey;
  /** Its start `ts` and its end `te` on the member's axis, null where its length is not known. */
  readonly start: Real;
  readonly finish: Real | null;
  /**
   * Its stacks in the order of its first fit (section 8.3): its own named timestamps within the
   * member's span, in canonical order, then the
   * secondary coordinates on it, in canonical order of their timestamps; each drawing a wedge or
   * a label.
   */
  readonly stacks: readonly AncestorStack[];
  /** The first line of each of `stacks` holding a label, by stack. */
  readonly first: ReadonlyMap<AncestorStack, number>;
  /** The lines its tiers hold together. */
  readonly lines: number;
  /** The largest font size of its stacks' labels, 9 without one. */
  readonly size: number;
}

/** The drawn ancestor lines, from the root A1 down to the parent Ak, at the member's scale. */
export function ancestorLines(scope: Scope): AncestorLine[] {
  const { manifest, member, root, rootEntry, lambda, cascade, textOf, measured } = scope;
  const ancestors = member.ancestors.map((ancestor, index) => {
    const timeline = ancestor.timeline;
    let below: Real = coordinateValue(ancestor.offset, timeline.number_type);
    for (const next of member.ancestors.slice(index + 1)) {
      below = add(below, coordinateValue(next.offset, next.timeline.number_type));
    }
    const start = negate(below);
    const length = lengthValue(timeline);
    const end = length === null ? null : add(start, length);
    const key = elementKey("ancestor", idAddress(timeline.id), timeline, rootEntry.key);
    const style = cascade.resolve(key, rootEntry.style);
    const line = { key, style };
    const unnamedKey = elementKey("wedge", idAddress(timeline.id), timeline, key);
    // Its children band's side in its own completed band order (core's `bandOrderOf`).
    const children = bandSides(bandOrderOf(manifest, timeline.id)).children;
    return {
      timeline,
      side: children === "above" ? ("below" as const) : ("above" as const),
      address: idAddress(timeline.id),
      style,
      unnamed: rotatedStyle(cascade.resolveUnaddressed(unnamedKey, style)),
      name: textOf(line, "name"),
      left: compareReal(start, zero(root.number_type)) < 0,
      // Where either end is not known, the line never claims the ancestor ends with the member.
      right: end === null || rootEntry.open || compareReal(end, lambda) > 0,
      te: end ?? lambda,
      end: endOf(timeline, index === 0),
      key,
      start,
      finish: end,
    };
  });
  const card = cardStamps(manifest, member, scope.frame);
  const origin = negate(card.window[0]);
  return ancestors
    .filter((ancestor) => shown(ancestor.style))
    .map((ancestor) => {
      const { timeline, start, key, style } = ancestor;
      // A label of a stack of `timestamp` at `at` on the member's axis, read on the ancestor's: a
      // secondary coordinate's `secondary.value`, as core's `cardStamps` writes it in the
      // ancestor's number type; one without a value (section 6.6) draws no coordinate label and
      // its wedge faded.
      const stampStack = (
        timestamp: NamedTimestamp,
        at: Real,
        secondary: { readonly value: Real | null } | undefined,
      ) => {
        const primary = secondary === undefined;
        const address = idAddress(timestamp.id);
        const coordinates = primary ? ("primary" as const) : ("secondary" as const);
        const lists = (word: (typeof timestamp.display)[number]) =>
          timestamp.display.includes(word);
        const keyed = (type: "wedge" | "label", where: ElementAddress) => ({
          ...elementKey(type, where, timeline, key),
          coordinates,
        });
        const own = secondary === undefined ? add(at, negate(start)) : secondary.value;
        const labels = stampLabels(
          timestamp,
          timeline,
          own,
          (word) => scope.styled(keyed("label", partAddress(address, word)), style),
          measured,
        );
        const wedge = scope.styled(keyed("wedge", address), style);
        const rotated = rotatedStyle(wedge.style);
        const turned = { ...wedge, style: own === null ? fadedStyle(rotated) : rotated };
        const line = scope.styled(
          elementKey("cross_section", partAddress(address, "line"), timeline, key),
          style,
        );
        return {
          id: timestamp.id,
          primary,
          at,
          x: scope.relativeX(at),
          wedge: lists("wedge") && shown(wedge.style) ? turned : undefined,
          rotation: turned.style.rotation ?? 0,
          labels,
          line: primary && lists("cross_section") && shown(line.style) ? line : undefined,
        };
      };
      const own = card.stamps
        .filter(
          ({ timestamp, source }) => source === "ancestor" && timestamp.timeline === timeline.id,
        )
        .map(({ timestamp, position }) => stampStack(timestamp, add(position, origin), undefined));
      // A hidden secondary coordinate takes no room.
      const secondary = (card.secondaries.get(timeline.id) ?? [])
        .map(({ timestamp, position, value }) =>
          stampStack(timestamp, add(position, origin), { value }),
        )
        .filter((stack) => stack.wedge !== undefined || stack.labels.length > 0);
      const stacks = [...own, ...secondary];
      const labelled = stacks.filter((stack) => stack.labels.length > 0);
      const widest = (stack: AncestorStack) =>
        Math.max(...stack.labels.map((label) => label.width));
      const tiers = tiersOf(
        labelled.map((stack) => ({ x: stack.x, lines: stack.labels.length, width: widest(stack) })),
      );
      const size = maxSize(labelled.flatMap((stack) => stack.labels));
      return {
        ...ancestor,
        stacks,
        first: new Map(labelled.map((stack, index) => [stack, nth(tiers.first, index)])),
        lines: tiers.lines,
        size,
      };
    });
}

/** Where the wedge of `stack` carries its labels on an ancestor line of stroke width `w`, `c` 0. */
function carriedOn(ancestor: AncestorLine, stack: AncestorStack, h: number): Carried | undefined {
  const n1 = ancestor.first.get(stack);
  if (n1 === undefined) return undefined;
  const W = Math.max(...stack.labels.map((label) => label.width));
  const w = ancestor.style["stroke-width"];
  return carried(stack.rotation, w / 2, n1, stack.labels.length, W, h);
}

/** The drawn centred labels of the ancestor lines (section 6.7), each with its carry. */
export function ancestorCentred(scope: Scope, ancestors: readonly AncestorLine[]): Centred[] {
  return ancestors.flatMap((ancestor) =>
    ancestor.stacks.flatMap((stack) => {
      const x = scope.drawnX(stack.at);
      if (x === undefined) return [];
      const v = carriedOn(ancestor, stack, scope.h(ancestor.size))?.vx ?? 0;
      return stack.labels.map((label) => ({ width: label.width, x, v }));
    }),
  );
}

/** The ancestor bands laid out: where each ancestor's line lies, and each side's outer edge. */
export interface AncestorBands {
  /** The distance of each drawn ancestor's line from the root's line, outwards on its side, from A1. */
  readonly distances: readonly number[];
  /**
   * The outer edge of each side: the outer edge of its ancestor band where it has one, else the
   * outer edge `Ea` or `Eb` of the root's side.
   */
  readonly edges: Readonly<Record<Side, number>>;
  /** The distance of the outermost ancestor line on each side that has an ancestor band. */
  readonly outermost: Readonly<Partial<Record<Side, number>>>;
  /** The number of ancestor bands: 0, 1 or 2. */
  readonly count: number;
}

/**
 * The ancestor bands (section 8.3), one on each side holding an ancestor line, each the outermost
 * band of its side. On a side whose outer edge is `E` (`Ea` above, `Eb` below), the band starts at
 * `c0 = max(p0 / 2, max(E, wm / 2) + S)`, `S` the card spacing and `wm` the stroke width of the
 * member's line, or 0 when that line is not displayed (section 6.5), and holds one row per drawn
 * ancestor line of that side, the nearest first, each with the pitch `q` of its name's font size,
 * an inner half `q / 2` and an outer half the larger of `q / 2` and the reach of the wedges and
 * labels of its named timestamps, on the side of its line away from the member. Row 1 lies at `c0
 * + i1`, row `r + 1` the distance `Δr = or + i(r + 1)` beyond row `r`; on the side of the root's
 * ancestor line where its ancestor card is drawn, `Δr = max(dr, or + i(r + 1))`, `dr` the
 * distance of the two rows' ancestors' lines in the root's drawing alone, `aligned` holding their
 * ordinates there by timeline ID. The band is `i1 + Δ1 + … + Δ(C − 1) + oC` wide. A side without
 * a drawn ancestor line has no band, and its edge stays `E`.
 */
export function ancestorBands(
  scope: Scope,
  ancestors: readonly AncestorLine[],
  p0: number,
  edges: Readonly<Record<Side, number>>,
  aligned: ReadonlyMap<string, number> | undefined,
): AncestorBands {
  const { rootEntry, S } = scope;
  const wm = rootEntry.drawn ? rootEntry.style["stroke-width"] : 0;
  const distances = new Map<AncestorLine, number>();
  const rootSide = ancestors.find(
    (ancestor) => ancestor.timeline.id === scope.member.ancestors[0]?.timeline.id,
  )?.side;
  const side = (which: Side): { edge: number; outermost: number | undefined } => {
    const E = edges[which];
    // One row per drawn ancestor line of the side, the nearest first.
    const nearestFirst = ancestors.filter((ancestor) => ancestor.side === which).reverse();
    if (nearestFirst.length === 0) return { edge: E, outermost: undefined };
    const rows = nearestFirst.map((ancestor) => {
      const q = rowPitch(scope, ancestor.name.style["font-size"]);
      const marks = markReach(scope, ancestor.style["stroke-width"], ancestor.lines, ancestor.size);
      const drawing = ancestor.stacks.some(
        (stack) => stack.wedge !== undefined || stack.labels.length > 0,
      );
      const reach = drawing ? Math.max(q / 2, marks) : q / 2;
      return { inner: q / 2, outer: reach };
    });
    const ordinates = which === rootSide ? aligned : undefined;
    const c0 = Math.max(p0 / 2, Math.max(E, wm / 2) + S);
    const first = nth(rows, 0);
    let width = first.inner;
    let line = c0 + first.inner;
    distances.set(nth(nearestFirst, 0), line);
    for (let index = 1; index < rows.length; index += 1) {
      const own = nth(rows, index - 1).outer + nth(rows, index).inner;
      const near = ordinates?.get(nth(nearestFirst, index - 1).timeline.id);
      const far = ordinates?.get(nth(nearestFirst, index).timeline.id);
      const delta =
        near === undefined || far === undefined
          ? own
          : Math.max(Math.max(near, far) - Math.min(near, far), own);
      width = width + delta;
      line = line + delta;
      distances.set(nth(nearestFirst, index), line);
    }
    width = width + nth(rows, rows.length - 1).outer;
    return { edge: c0 + width, outermost: line };
  };
  const above = side("above");
  const below = side("below");
  return {
    distances: ancestors.map((ancestor) => known(distances, ancestor)),
    edges: { above: above.edge, below: below.edge },
    outermost: {
      ...(above.outermost === undefined ? {} : { above: above.outermost }),
      ...(below.outermost === undefined ? {} : { below: below.outermost }),
    },
    count: (above.outermost === undefined ? 0 : 1) + (below.outermost === undefined ? 0 : 1),
  };
}

/** The ancestors' names, from A1 to Ak, each its own row of the name column. */
export const ancestorNames = (ancestors: readonly AncestorLine[]): NameItem[] =>
  ancestors.map((ancestor) => ({ name: ancestor.name, text: nameOf(ancestor.timeline) }));

/** The ordinate of drawn ancestor `index` (from A1) lying on `side`, `yRoot` the root's line. */
export const ancestorY = (
  bands: AncestorBands,
  index: number,
  side: Side,
  yRoot: number,
): number =>
  side === "above" ? yRoot - nth(bands.distances, index) : yRoot + nth(bands.distances, index);

/** The stroke widths of the drawn ancestor lines that run on to the left. */
export const chevrons = (ancestors: readonly AncestorLine[]): number[] =>
  ancestors.filter((ancestor) => ancestor.left).map((ancestor) => ancestor.style["stroke-width"]);

/**
 * The ancestor lines, from A1 to Ak, each running on in chevrons or ending at the member's ends,
 * `x0 + L'` with `L' = L − DG` the drawn length of its frame's members (section 8.2); on the
 * frame's elided axis, an end short of the member's lying in a gap ends at the gap's left edge
 * without its mark, and each is cut at every gap it crosses (section 6.6, Elisions).
 */
export function ancestorLineElements(
  scope: Scope,
  ancestors: readonly AncestorLine[],
  bands: AncestorBands,
  x0: number,
  yRoot: number,
): LineElement[] {
  const { L, lambda, axis } = scope;
  const drawn = L - (axis?.total ?? 0);
  return ancestors.map((ancestor, index) => {
    const w = ancestor.style["stroke-width"];
    // Short of the member's end (`te < λ`), the line ends at `x(te)` with its own end.
    const short = compareReal(ancestor.te, lambda) < 0;
    const inGap = short ? axis?.gapOf(ancestor.te) : undefined;
    const end =
      inGap !== undefined
        ? x0 + inGap.left
        : short
          ? x0 + (axis === undefined ? scope.relativeX(ancestor.te) : axis.relative(ancestor.te))
          : x0 + drawn;
    const y = ancestorY(bands, index, ancestor.side, yRoot);
    return {
      type: "ancestor",
      address: ancestor.address,
      style: ancestor.style,
      xs: ancestor.left ? x0 - 4 * w : x0 + L * 0,
      xe: ancestor.right ? x0 + drawn + 4 * w : end,
      y,
      start: ancestor.left ? "chevrons" : "circle",
      end: ancestor.right ? "chevrons" : inGap !== undefined ? "none" : ancestor.end,
      cuts: (axis?.gaps ?? [])
        .filter((gap) => axis?.crosses(gap, ancestor.start, ancestor.right ? null : ancestor.te))
        .map((gap) => [x0 + gap.left, x0 + gap.right] as const),
    };
  });
}

/**
 * A mark at the abscissa 0 of an ancestor line at `y` of stroke width `w`, in the style `style`
 * whose `rotation` is read: on the side `outwards` of the line away from the member, its tip on the
 * line's edge `w / 2` from it, each corner of the base at its offset across and its distance beyond
 * the tip, that distance added to `w / 2` before it becomes an ordinate, turned by `rotation` as a
 * wedge on that side of its line is (section 6.6).
 */
function markOn(style: Style, y: number, w: number, outwards: Side): AxisWedge {
  const at = (distance: number) => (outwards === "above" ? y - distance : y + distance);
  const [first, second] = wedgeCorners(style.rotation ?? 0);
  return {
    yt: at(w / 2),
    corners: [
      { dx: first.dx, y: at(w / 2 + first.out) },
      { dx: second.dx, y: at(w / 2 + second.out) },
    ],
    style,
  };
}

/**
 * The mark an editor shows at a position on each drawn ancestor line, `lines` the elements of
 * `ancestors` in their order (`ancestorLineElements`): drawn as a named timestamp's wedge on it is
 * (`ancestorWedgeElements`), in the style of a wedge held by the line that no named timestamp
 * holds, so that no rule naming an address changes it; by its line's element.
 */
export function ancestorLineMarks(
  ancestors: readonly AncestorLine[],
  lines: readonly LineElement[],
): Map<LineElement, AxisWedge> {
  return new Map(
    ancestors.map((ancestor, index) => {
      const line = nth(lines, index);
      return [
        line,
        markOn(ancestor.unnamed, line.y, ancestor.style["stroke-width"], ancestor.side),
      ];
    }),
  );
}

/**
 * The wedges of each ancestor line, from A1 to Ak, each's in the order of its first fit (its
 * timestamps' coordinates), on its side away from the member, turned by each one's `rotation`
 * (`markOn`); none at a position in a gap (section 6.6, Elisions).
 */
export function ancestorWedgeElements(
  scope: Scope,
  ancestors: readonly AncestorLine[],
  bands: AncestorBands,
  x0: number,
  yRoot: number,
): MarkerElement[] {
  return ancestors.flatMap((ancestor, index) => {
    const y = ancestorY(bands, index, ancestor.side, yRoot);
    const w = ancestor.style["stroke-width"];
    return ancestor.stacks.flatMap((stack): MarkerElement[] => {
      const x = scope.drawnX(stack.at);
      if (stack.wedge === undefined || x === undefined) return [];
      const { yt, corners, style } = markOn(stack.wedge.style, y, w, ancestor.side);
      return [{ type: "wedge", address: stack.wedge.address, style, x: x0 + x, yt, corners }];
    });
  });
}

/**
 * The labels of each ancestor line's stacks, in the same order, each stack in its tier beyond its
 * wedge's base on the side away from the member, carried by a turned wedge (section 6.6).
 */
export function ancestorLabelElements(
  scope: Scope,
  ancestors: readonly AncestorLine[],
  bands: AncestorBands,
  x0: number,
  yRoot: number,
): TextElement[] {
  const { a, d, h } = scope;
  return ancestors.flatMap((ancestor, index) => {
    const y = ancestorY(bands, index, ancestor.side, yRoot);
    const size = ancestor.size;
    return ancestor.stacks.flatMap((stack) => {
      const placed = carriedOn(ancestor, stack, h(size));
      const x = scope.drawnX(stack.at);
      if (placed === undefined || x === undefined) return [];
      const towards = placed.inwards ? opposite(ancestor.side) : ancestor.side;
      return stack.labels.map((label, line) => {
        const start = nth(placed.starts, line);
        const from = ancestor.side === "above" ? y - start : y + start;
        // The baseline beyond the line's start: its descent above it, its ascent below.
        const baseline = towards === "above" ? from - d(size) : from + a(size);
        return centredLabel(label, x0 + x + placed.vx, baseline, label, label.coordinate);
      });
    });
  });
}

/**
 * The gap of the cross-section line of the timestamp of `stack` on an ancestor line at `y`
 * (section 6.6), measured from the line on its outer side with `c` 0, as ordinates; null for none.
 */
function ancestorGap(
  scope: Scope,
  ancestor: AncestorLine,
  stack: AncestorStack,
  x: number,
  y: number,
): Span | null {
  const w = ancestor.style["stroke-width"];
  const placed = carriedOn(ancestor, stack, scope.h(ancestor.size));
  const distances = gapOf(
    x,
    stack.rotation,
    w / 2,
    stack.wedge !== undefined,
    placed === undefined
      ? null
      : { carried: placed, width: Math.max(...stack.labels.map((label) => label.width)) },
  );
  if (distances === null) return null;
  const [first, second] = distances.map((distance) =>
    ancestor.side === "above" ? y - distance : y + distance,
  );
  return [Math.min(first ?? 0, second ?? 0), Math.max(first ?? 0, second ?? 0)];
}

/**
 * The cross-section lines of the ancestors' own timestamps drawn in the member's card, from A1 to
 * Ak, each's in canonical order: across the card's span `span` less each one's gap.
 */
export function ancestorCrossSections(
  scope: Scope,
  ancestors: readonly AncestorLine[],
  bands: AncestorBands,
  x0: number,
  yRoot: number,
  span: Span,
): VerticalLineElement[] {
  return ancestors.flatMap((ancestor, index) => {
    const y = ancestorY(bands, index, ancestor.side, yRoot);
    return ancestor.stacks.flatMap((stack) => {
      const line = stack.line;
      const drawn = scope.drawnX(stack.at);
      if (line === undefined || drawn === undefined) return [];
      const x = x0 + drawn;
      return cut(span, ancestorGap(scope, ancestor, stack, x, y)).map((piece) =>
        crossSectionElement(line.address, line.style, x, piece),
      );
    });
  });
}

/**
 * The named timestamps each ancestor line holds (`DrawnAxis.timestamps`), from A1 to Ak; none at
 * a position in a gap, which has no abscissa.
 */
export function ancestorTimestamps(
  scope: Scope,
  ancestors: readonly AncestorLine[],
  x0: number,
  span: Span,
): AxisTimestamp[][] {
  return ancestors.map((ancestor) =>
    ancestor.stacks.flatMap((stack) => {
      const x = scope.drawnX(stack.at);
      if (!stack.primary || x === undefined) return [];
      return [
        {
          id: stack.id,
          x: x0 + x,
          line: stack.line?.style ?? null,
          segment: { y1: span[0], y2: span[1] },
        },
      ];
    }),
  );
}
