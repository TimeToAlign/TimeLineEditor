/**
 * Ancestor lines and the ancestor band of a member that is a child timeline
 * (`docs/drawing.md` in timeskeleton, section 8.3).
 */

import { partAddress, type TimelineManifest } from "@timetoalign/tilie-core";
import { elementKey } from "@timetoalign/tilie-core/drawing";
import { compareReal, type Real } from "@timetoalign/tilie-core/numbers";
import type { Style } from "./cascade.ts";
import { MARKER_BASE, MARKER_HEIGHT } from "./constants.ts";
import type { LineElement, LineEnd, MarkerElement, TextElement } from "./elements.ts";
import { labelTiers, Rows } from "./fit.ts";
import { markLabelOffset, markReach } from "./markers.ts";
import { centredLabel, type NameItem, nameOf } from "./names.ts";
import { add, coordinateText, coordinateValue, lengthValue, negate, zero } from "./numbers.ts";
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
  readonly address: string;
  readonly style: Style;
  readonly label: Styled;
  /** The proportion the mark is centred on: 0 at the member's start, 1 at its end. */
  readonly u: number;
  /** The coordinate it marks in the ancestor's unit. */
  readonly value: Real;
}

/** An ancestor drawn as a line above the member, with its marks of the member's start and end. */
interface AncestorLine {
  readonly timeline: TimelineManifest;
  readonly address: string;
  readonly style: Style;
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
  const { member, root, rootEntry, lambda, L, cascade, textOf, measured } = scope;
  const ancestors = member.ancestors.map((ancestor, index) => {
    const timeline = ancestor.timeline;
    let below: Real = coordinateValue(ancestor.offset, timeline.number_type);
    for (const next of member.ancestors.slice(index + 1)) {
      below = add(below, coordinateValue(next.offset, next.timeline.number_type));
    }
    const start = negate(below);
    const length = lengthValue(timeline);
    const end = length === null ? null : add(start, length);
    const key = elementKey("ancestor", timeline.id, timeline, rootEntry.key);
    const style = cascade.resolve(key, rootEntry.style);
    const line = { key, style };
    // A member whose end is not known has no end to mark.
    const parts = rootEntry.open ? (["start"] as const) : (["start", "end"] as const);
    const marks = parts.map((part) => {
      const address = partAddress(root.id, part);
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
        ...measured(label, coordinateText(value, timeline.unit)),
      };
    });
    return {
      timeline,
      address: timeline.id,
      style,
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

/** The ancestor band laid out: where each ancestor's line lies, and the band's outer edge. */
export interface AncestorBand {
  /** The distance of each ancestor row's line from the root's line, the nearest ancestor's first. */
  readonly distances: readonly number[];
  /** Its outer edge: its start plus its width, the outer edge of the member drawing's above side. */
  readonly edge: number;
}

/**
 * The ancestor band (section 8.3), the outermost band of the above side,
 * `Ea` the outer edge of the root's above side: it starts at `max(p0 / 2,
 * max(Ea, wm / 2) + B)`, `wm` the stroke width of the member's line, or 0
 * when that line is not displayed (section 6.5), and holds one row per
 * drawn ancestor line, the nearest first, each with the pitch `qj` of its
 * name's font size, an inner half `qj / 2` and an outer half the larger of
 * `qj / 2` and its marks' reach. Without a drawn ancestor line there is no
 * band, and the above side's edge stays `Ea`.
 */
export function ancestorBand(
  scope: Scope,
  ancestors: readonly AncestorLine[],
  p0: number,
  Ea: number,
): AncestorBand {
  if (ancestors.length === 0) return { distances: [], edge: Ea };
  // One row per drawn ancestor line, the nearest first.
  const rows = [...ancestors].reverse().map((ancestor) => {
    const q = rowPitch(scope, ancestor.name.style["font-size"]);
    const size = maxSize(ancestor.labelled.map((mark) => mark.label));
    const marks = markReach(scope, ancestor.style["stroke-width"], ancestor.tiers, size);
    const reach = ancestor.marks.length === 0 ? q / 2 : Math.max(q / 2, marks);
    return { inner: q / 2, outer: reach };
  });
  const { rootEntry, v } = scope;
  const wm = rootEntry.drawn ? rootEntry.style["stroke-width"] : 0;
  const c0 = Math.max(p0 / 2, Math.max(Ea, wm / 2) + 4 * v);
  let width = 0;
  for (const row of rows) width = width + row.inner + row.outer;
  const distances: number[] = [];
  let line = c0 + nth(rows, 0).inner;
  distances.push(line);
  for (let index = 1; index < rows.length; index += 1) {
    line = line + (nth(rows, index - 1).outer + nth(rows, index).inner);
    distances.push(line);
  }
  return { distances, edge: c0 + width };
}

/** The ancestors' names, from A1 to Ak, each its own row of the name column. */
export const ancestorNames = (ancestors: readonly AncestorLine[]): NameItem[] =>
  ancestors.map((ancestor) => ({ name: ancestor.name, text: nameOf(ancestor.timeline) }));

/** The ordinate of ancestor `index` (from A1), `yRoot` the root's line. */
export const ancestorY = (band: AncestorBand, index: number, yRoot: number): number =>
  yRoot - nth(band.distances, band.distances.length - 1 - index);

/** The stroke widths of the drawn ancestor lines that run on to the left. */
export const chevrons = (ancestors: readonly AncestorLine[]): number[] =>
  ancestors.filter((ancestor) => ancestor.left).map((ancestor) => ancestor.style["stroke-width"]);

/** The ancestor lines, from A1 to Ak, each running on in chevrons or ending at the member's ends. */
export function ancestorLineElements(
  scope: Scope,
  ancestors: readonly AncestorLine[],
  band: AncestorBand,
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
      y: ancestorY(band, index, yRoot),
      start: ancestor.left ? "chevrons" : "circle",
      end: ancestor.right ? "chevrons" : ancestor.end,
    };
  });
}

/** The marks of the member's start and end on each ancestor line, always above it. */
export function ancestorMarkElements(
  scope: Scope,
  ancestors: readonly AncestorLine[],
  band: AncestorBand,
  x0: number,
  yRoot: number,
): MarkerElement[] {
  const { L } = scope;
  return ancestors.flatMap((ancestor, index) => {
    const y = ancestorY(band, index, yRoot);
    const w = ancestor.style["stroke-width"];
    return ancestor.marks.map((mark) => ({
      type: "wedge" as const,
      address: mark.address,
      style: mark.style,
      x: x0 + L * mark.u,
      yt: y - w / 2,
      yb: y - (w / 2 + MARKER_HEIGHT),
      base: MARKER_BASE,
    }));
  });
}

/** The marks' labels, each in its tier above its mark's base. */
export function ancestorLabelElements(
  scope: Scope,
  ancestors: readonly AncestorLine[],
  band: AncestorBand,
  x0: number,
  yRoot: number,
): TextElement[] {
  const { L, d } = scope;
  return ancestors.flatMap((ancestor, index) => {
    const y = ancestorY(band, index, yRoot);
    const w = ancestor.style["stroke-width"];
    const size = maxSize(ancestor.labelled.map((mark) => mark.label));
    return ancestor.labelled.map((mark) => {
      const outwards = markLabelOffset(scope, w, known(ancestor.tier, mark), size);
      return centredLabel(mark.label, x0 + L * mark.u, y - outwards - d(size), mark, {
        unit: ancestor.timeline.unit,
        value: mark.value,
      });
    });
  });
}
