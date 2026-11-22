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
import {
  cardStamps,
  type ElementKey,
  elementKey,
  TIMESTAMP_LABELS,
  type TimestampLabel,
} from "@timetoalign/tilie-core/drawing";
import { compareReal, type Real } from "@timetoalign/tilie-core/numbers";
import { bandSides, type Centred, opposite, type Side } from "./bands.ts";
import type { AxisTimestamp, AxisWedge } from "./boxes.ts";
import type { Style } from "./cascade.ts";
import type {
  LineElement,
  LineEnd,
  MarkerElement,
  ShownCoordinate,
  TextElement,
  VerticalLineElement,
} from "./elements.ts";
import { crossSectionElement, markReach, rotatedStyle } from "./markers.ts";
import { centredLabel, type NameItem, nameOf } from "./names.ts";
import { add, coordinateText, coordinateValue, lengthValue, negate, zero } from "./numbers.ts";
import { wedgeCorners } from "./rotation.ts";
import { type Carried, carried, cut, gapOf, type Span, tiersOf } from "./stacks.ts";
import {
  endOf,
  known,
  type Measured,
  maxSize,
  nth,
  rowPitch,
  type Scope,
  type Styled,
  shown,
} from "./traversal.ts";

/** A label of a stack on an ancestor line: its element, its text measured, a coordinate it shows. */
interface StackLabel extends Styled, Measured {
  readonly coordinate: ShownCoordinate;
}

/**
 * A stack on an ancestor line (section 8.3): a mark of the member's start or
 * end with its label, or a named timestamp's coordinate there, its primary
 * one when the timestamp is the ancestor's own, else a secondary one; with
 * its wedge where drawn, its `rotation`, its drawn labels and, for a
 * primary coordinate, its cross-section line where drawn.
 */
interface AncestorStack {
  /** The timestamp's ID; none for a mark. */
  readonly id: string | undefined;
  /** It marks the ancestor's own timestamp's primary coordinate. */
  readonly primary: boolean;
  /** Its abscissa from the member's start `x0`, unturned: `L × u`. */
  readonly x: number;
  /** The proportion it is centred on. */
  readonly u: number;
  readonly wedge: Styled | undefined;
  readonly rotation: number;
  readonly labels: readonly StackLabel[];
  readonly line: Styled | undefined;
}

/** A mark of the member's start or end on an ancestor's axis. */
interface AncestorMark extends Measured {
  readonly address: ElementAddress;
  readonly style: Style;
  readonly label: Styled;
  /** The proportion the mark is centred on: 0 at the member's start, 1 at its end. */
  readonly u: number;
  /** The coordinate it marks in the ancestor's unit. */
  readonly value: Real;
}

/**
 * An ancestor drawn as a line beside the member, on the side opposite to where its own band order
 * puts its children band, with its marks of the member's start and end.
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
  /** Its drawn marks, start before end. */
  readonly marks: readonly AncestorMark[];
  /** Its key, which holds its marks, its timestamps and their cross-section lines. */
  readonly key: ElementKey;
  /** Its start `ts` and its end `te` on the member's axis, null where its length is not known. */
  readonly start: Real;
  readonly finish: Real | null;
  /**
   * Its stacks in the order of its first fit (section 8.3): its marks of the member's start and
   * end, then its own named timestamps within the member's span, in canonical order, then the
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
  const { manifest, member, root, rootEntry, lambda, L, cascade, textOf, measured } = scope;
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
    // A member whose end is not known has no end to mark.
    const parts = rootEntry.open ? (["start"] as const) : (["start", "end"] as const);
    const marks = parts.map((part) => {
      const address = partAddress(idAddress(root.id), part);
      const markKey = elementKey("wedge", address, root, key);
      const markStyle = cascade.resolve(markKey, style);
      const label = textOf({ key: markKey, style: markStyle }, "label");
      // The member's start and end on the ancestor's axis: −ts and −ts + λ.
      const value = part === "start" ? negate(start) : add(negate(start), lambda);
      return {
        address,
        style: markStyle,
        label,
        u: part === "start" ? 0 : 1,
        value,
        ...measured(label, coordinateText(value, timeline.number_type, timeline.unit)),
      };
    });
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
      marks,
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
      const marks = ancestor.marks.filter((mark) => shown(mark.style));
      // A label of a stack of `timestamp` at `at` on the member's axis, read on the ancestor's.
      const stampStack = (timestamp: NamedTimestamp, at: Real, primary: boolean) => {
        const address = idAddress(timestamp.id);
        const coordinates = primary ? ("primary" as const) : ("secondary" as const);
        const lists = (word: (typeof timestamp.display)[number]) =>
          timestamp.display.includes(word);
        const keyed = (type: "wedge" | "label", where: ElementAddress) => ({
          ...elementKey(type, where, timeline, key),
          coordinates,
        });
        const own = add(at, negate(start));
        const texts: Readonly<Record<TimestampLabel, string | undefined>> = {
          name: timestamp.name,
          id: timestamp.id,
          coordinate: coordinateText(own, timeline.number_type, timeline.unit),
        };
        const labels = TIMESTAMP_LABELS.filter(lists).flatMap((word): StackLabel[] => {
          const text = texts[word];
          if (text === undefined) return [];
          const label = scope.styled(keyed("label", partAddress(address, word)), style);
          if (!shown(label.style)) return [];
          return [
            {
              ...label,
              ...measured(label, text),
              coordinate: { unit: timeline.unit, value: own },
            },
          ];
        });
        const wedge = scope.styled(keyed("wedge", address), style);
        const turned = { ...wedge, style: rotatedStyle(wedge.style) };
        const line = scope.styled(
          elementKey("cross_section", partAddress(address, "line"), timeline, key),
          style,
        );
        return {
          id: timestamp.id,
          primary,
          x: scope.relativeX(at),
          u: scope.u(at),
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
        .map(({ timestamp, position }) => stampStack(timestamp, add(position, origin), true));
      // A hidden secondary coordinate takes no room.
      const secondary = (card.secondaries.get(timeline.id) ?? [])
        .map(({ timestamp, position }) => stampStack(timestamp, add(position, origin), false))
        .filter((stack) => stack.wedge !== undefined || stack.labels.length > 0);
      const markStacks: AncestorStack[] = marks.map((mark) => ({
        id: undefined,
        primary: false,
        x: L * mark.u,
        u: mark.u,
        wedge: { address: mark.address, style: rotatedStyle(mark.style) },
        rotation: rotatedStyle(mark.style).rotation ?? 0,
        labels: shown(mark.label.style)
          ? [
              {
                ...mark.label,
                clean: mark.clean,
                width: mark.width,
                coordinate: { unit: timeline.unit, value: mark.value },
              },
            ]
          : [],
        line: undefined,
      }));
      const stacks = [...markStacks, ...own, ...secondary];
      const labelled = stacks.filter((stack) => stack.labels.length > 0);
      const widest = (stack: AncestorStack) =>
        Math.max(...stack.labels.map((label) => label.width));
      const tiers = tiersOf(
        labelled.map((stack) => ({ x: stack.x, lines: stack.labels.length, width: widest(stack) })),
      );
      const size = maxSize(labelled.flatMap((stack) => stack.labels));
      return {
        ...ancestor,
        marks,
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

/** The centred labels of the ancestor lines (section 6.7), each with its carry. */
export function ancestorCentred(scope: Scope, ancestors: readonly AncestorLine[]): Centred[] {
  return ancestors.flatMap((ancestor) =>
    ancestor.stacks.flatMap((stack) => {
      const v = carriedOn(ancestor, stack, scope.h(ancestor.size))?.vx ?? 0;
      return stack.labels.map((label) => ({ width: label.width, u: stack.u, v }));
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
 * `max(p0 / 2, max(E, wm / 2) + S)`, `S` the card spacing and `wm` the stroke width of the member's
 * line, or 0 when that line is not displayed (section 6.5), and holds one row per drawn ancestor
 * line of that side, the nearest first, each with the pitch `qj` of its name's font size, an inner
 * half `qj / 2` and an outer half the larger of `qj / 2` and its marks' reach, its marks lying on
 * the side of its line away from the member. A side without a drawn ancestor line has no band,
 * and its edge stays `E`.
 */
export function ancestorBands(
  scope: Scope,
  ancestors: readonly AncestorLine[],
  p0: number,
  edges: Readonly<Record<Side, number>>,
): AncestorBands {
  const { rootEntry, S } = scope;
  const wm = rootEntry.drawn ? rootEntry.style["stroke-width"] : 0;
  const distances = new Map<AncestorLine, number>();
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
    const c0 = Math.max(p0 / 2, Math.max(E, wm / 2) + S);
    let width = 0;
    for (const row of rows) width = width + row.inner + row.outer;
    let line = c0 + nth(rows, 0).inner;
    distances.set(nth(nearestFirst, 0), line);
    for (let index = 1; index < rows.length; index += 1) {
      line = line + (nth(rows, index - 1).outer + nth(rows, index).inner);
      distances.set(nth(nearestFirst, index), line);
    }
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

/** The ancestor lines, from A1 to Ak, each running on in chevrons or ending at the member's ends. */
export function ancestorLineElements(
  scope: Scope,
  ancestors: readonly AncestorLine[],
  bands: AncestorBands,
  x0: number,
  yRoot: number,
): LineElement[] {
  const { L, lambda, relativeX } = scope;
  const x = (value: Real) => x0 + relativeX(value);
  return ancestors.map((ancestor, index) => {
    const w = ancestor.style["stroke-width"];
    // Short of the member's end (`te < λ`), the line ends at `x(te)` with its own end.
    const end = compareReal(ancestor.te, lambda) < 0 ? x(ancestor.te) : x0 + L * 1;
    return {
      type: "ancestor",
      address: ancestor.address,
      style: ancestor.style,
      xs: ancestor.left ? x0 - 4 * w : x0 + L * 0,
      xe: ancestor.right ? x0 + L + 4 * w : end,
      y: ancestorY(bands, index, ancestor.side, yRoot),
      start: ancestor.left ? "chevrons" : "circle",
      end: ancestor.right ? "chevrons" : ancestor.end,
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
 * `ancestors` in their order (`ancestorLineElements`): drawn as the marks of the member's start
 * and end are (`ancestorMarkElements`), in the style of a wedge held by the line that no named
 * timestamp holds, so that no rule on those marks changes it; by its line's element.
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
 * marks of the member's start and end, then its timestamps' coordinates), on its side away from
 * the member, turned by each one's `rotation` (`markOn`).
 */
export function ancestorMarkElements(
  ancestors: readonly AncestorLine[],
  bands: AncestorBands,
  x0: number,
  yRoot: number,
): MarkerElement[] {
  return ancestors.flatMap((ancestor, index) => {
    const y = ancestorY(bands, index, ancestor.side, yRoot);
    const w = ancestor.style["stroke-width"];
    return ancestor.stacks.flatMap((stack): MarkerElement[] => {
      if (stack.wedge === undefined) return [];
      const { yt, corners, style } = markOn(stack.wedge.style, y, w, ancestor.side);
      return [{ type: "wedge", address: stack.wedge.address, style, x: x0 + stack.x, yt, corners }];
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
      if (placed === undefined) return [];
      const towards = placed.inwards ? opposite(ancestor.side) : ancestor.side;
      return stack.labels.map((label, line) => {
        const start = nth(placed.starts, line);
        const from = ancestor.side === "above" ? y - start : y + start;
        // The baseline beyond the line's start: its descent above it, its ascent below.
        const baseline = towards === "above" ? from - d(size) : from + a(size);
        return centredLabel(label, x0 + stack.x + placed.vx, baseline, label, label.coordinate);
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
      if (line === undefined) return [];
      const x = x0 + stack.x;
      return cut(span, ancestorGap(scope, ancestor, stack, x, y)).map((piece) =>
        crossSectionElement(line.address, line.style, x, piece),
      );
    });
  });
}

/** The named timestamps each ancestor line holds (`DrawnAxis.timestamps`), from A1 to Ak. */
export function ancestorTimestamps(
  ancestors: readonly AncestorLine[],
  x0: number,
  span: Span,
): AxisTimestamp[][] {
  return ancestors.map((ancestor) =>
    ancestor.stacks.flatMap((stack) => {
      if (stack.id === undefined || !stack.primary) return [];
      return [
        {
          id: stack.id,
          x: x0 + stack.x,
          line: stack.line?.style ?? null,
          segment: { y1: span[0], y2: span[1] },
        },
      ];
    }),
  );
}
