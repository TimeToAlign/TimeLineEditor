/**
 * Ancestor lines and the ancestor bands of a member that is a child timeline
 * (`docs/drawing.md` in TimeToShare, section 8.3).
 */

import {
  bandOrderOf,
  type ElementAddress,
  idAddress,
  partAddress,
  type TimelineManifest,
} from "@timetoalign/tilie-core";
import { elementKey } from "@timetoalign/tilie-core/drawing";
import { compareReal, type Real } from "@timetoalign/tilie-core/numbers";
import { bandSides, type Side } from "./bands.ts";
import type { AxisWedge } from "./boxes.ts";
import type { Style } from "./cascade.ts";
import type { LineElement, LineEnd, MarkerElement, TextElement } from "./elements.ts";
import { labelTiers, Rows } from "./fit.ts";
import { markLabelOffset, markReach, rotatedStyle } from "./markers.ts";
import { centredLabel, type NameItem, nameOf } from "./names.ts";
import { add, coordinateText, coordinateValue, lengthValue, negate, zero } from "./numbers.ts";
import { wedgeCorners } from "./rotation.ts";
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
  /** Its drawn marks with a drawn label. */
  readonly labelled: readonly AncestorMark[];
  /** The number of its label tiers. */
  readonly tiers: number;
  readonly tier: ReadonlyMap<AncestorMark, number>;
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
    };
  });
  return ancestors
    .filter((ancestor) => shown(ancestor.style))
    .map((ancestor) => {
      const marks = ancestor.marks.filter((mark) => shown(mark.style));
      const labelled = marks.filter((mark) => shown(mark.label.style));
      const tiers = new Rows();
      const tier = labelTiers(labelled, (mark) => L * mark.u, tiers);
      return { ...ancestor, marks, labelled, tiers: tiers.count, tier };
    });
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
      const size = maxSize(ancestor.labelled.map((mark) => mark.label));
      const marks = markReach(scope, ancestor.style["stroke-width"], ancestor.tiers, size);
      const reach = ancestor.marks.length === 0 ? q / 2 : Math.max(q / 2, marks);
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
 * The marks of the member's start and end on each ancestor line, on its side away from the
 * member, turned by the mark's `rotation`, 0 where unset (`markOn`).
 */
export function ancestorMarkElements(
  scope: Scope,
  ancestors: readonly AncestorLine[],
  bands: AncestorBands,
  x0: number,
  yRoot: number,
): MarkerElement[] {
  const { L } = scope;
  return ancestors.flatMap((ancestor, index) => {
    const y = ancestorY(bands, index, ancestor.side, yRoot);
    const w = ancestor.style["stroke-width"];
    return ancestor.marks.map((mark): MarkerElement => {
      const { yt, corners, style } = markOn(rotatedStyle(mark.style), y, w, ancestor.side);
      return { type: "wedge", address: mark.address, style, x: x0 + L * mark.u, yt, corners };
    });
  });
}

/** The marks' labels, each in its tier beyond its mark's base, on the side away from the member. */
export function ancestorLabelElements(
  scope: Scope,
  ancestors: readonly AncestorLine[],
  bands: AncestorBands,
  x0: number,
  yRoot: number,
): TextElement[] {
  const { L, a, d } = scope;
  return ancestors.flatMap((ancestor, index) => {
    const y = ancestorY(bands, index, ancestor.side, yRoot);
    const w = ancestor.style["stroke-width"];
    const size = maxSize(ancestor.labelled.map((mark) => mark.label));
    return ancestor.labelled.map((mark) => {
      const outwards = markLabelOffset(scope, w, known(ancestor.tier, mark), size);
      // The baseline beyond the tier's inner edge: its descent above the line, its ascent below.
      const baseline = ancestor.side === "above" ? y - outwards - d(size) : y + outwards + a(size);
      return centredLabel(mark.label, x0 + L * mark.u, baseline, mark, {
        unit: ancestor.timeline.unit,
        value: mark.value,
      });
    });
  });
}
