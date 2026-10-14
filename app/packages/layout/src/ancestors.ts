/**
 * Ancestor lines and the ancestor band of a member that is a child timeline
 * (`docs/drawing.md` in timeskeleton, section 8.3).
 */

import { compareReal, elementKey, type Real, type TimelineManifest } from "@timetoalign/tilie-core";
import type { Band, Position } from "./canvas.ts";
import type { Style } from "./cascade.ts";
import { MARKER_HEIGHT } from "./constants.ts";
import type { LineElement, LineEnd, MarkerElement, TextElement } from "./elements.ts";
import { labelTiers, Rows } from "./fit.ts";
import { type AncestorName, centredLabel, nameOf } from "./names.ts";
import { add, coordinateText, coordinateValue, negate, zero } from "./numbers.ts";
import { markLabelOffset, markReach } from "./root.ts";
import {
  endOf,
  type Measured,
  maxSize,
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
  /** It runs on to the right: `te > λ`. */
  readonly right: boolean;
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
    let below: Real = coordinateValue(ancestor.offset);
    for (const next of member.ancestors.slice(index + 1)) {
      below = add(below, coordinateValue(next.offset));
    }
    const start = negate(below);
    const end = add(start, coordinateValue(timeline.length));
    const key = elementKey("ancestor", timeline.id, timeline, rootEntry.key);
    const style = cascade.resolve(key, rootEntry.style);
    const line = { key, style };
    const marks = (["start", "end"] as const).map((part) => {
      const markKey = elementKey("wedge", `${root.id}/${part}`, root, key);
      const markStyle = cascade.resolve(markKey, style);
      const label = textOf({ key: markKey, style: markStyle }, "label");
      // The member's start and end on the ancestor's axis: −ts and −ts + λ.
      const value = part === "start" ? negate(start) : add(negate(start), lambda);
      return {
        address: markKey.address as string,
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
      right: compareReal(end, lambda) > 0,
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
      const tier = labelTiers(
        labelled,
        (mark) => L * mark.u,
        () => tiers,
      );
      return { ...ancestor, marks, labelled, tiers: tiers.count, tier };
    });
}

/**
 * The ancestor band, the outermost of the above side, starting no nearer
 * than `p0 / 2`: the distance of each ancestor row's line from the root's
 * line, the nearest ancestor's first.
 */
export function ancestorBand(
  scope: Scope,
  ancestors: readonly AncestorLine[],
  p0: number,
): Band<number[]> | undefined {
  if (ancestors.length === 0) return undefined;
  // One row per drawn ancestor line, the nearest first.
  const rows = [...ancestors].reverse().map((ancestor) => {
    const q = rowPitch(scope, ancestor.name.style["font-size"]);
    const size = maxSize(ancestor.labelled.map((mark) => mark.label));
    const marks = markReach(scope, ancestor.style["stroke-width"], ancestor.tiers, size);
    const reach = ancestor.marks.length === 0 ? q / 2 : Math.max(q / 2, marks);
    return { inner: q / 2, outer: reach };
  });
  let width = 0;
  for (const row of rows) width = width + row.inner + row.outer;
  return {
    width,
    minimum: p0 / 2,
    at: (c0) => {
      const distances: number[] = [];
      let line = c0 + (rows[0] as { inner: number }).inner;
      distances.push(line);
      for (let index = 1; index < rows.length; index += 1) {
        line = line + ((rows[index - 1]?.outer as number) + (rows[index]?.inner as number));
        distances.push(line);
      }
      return distances;
    },
  };
}

/** The ancestors' rows of the name column, from A1 to Ak, given the band's distances (nearest first). */
export function ancestorNames(
  ancestors: readonly AncestorLine[],
  distances: readonly number[],
): AncestorName[] {
  return ancestors.map((ancestor, index) => ({
    name: ancestor.name,
    text: nameOf(ancestor.timeline),
    distance: distances[ancestors.length - 1 - index] as number,
  }));
}

/** The stroke widths of the drawn ancestor lines that run on to the left. */
export const chevrons = (ancestors: readonly AncestorLine[]): number[] =>
  ancestors.filter((ancestor) => ancestor.left).map((ancestor) => ancestor.style["stroke-width"]);

/** The ordinate of ancestor `index` (from A1), given the band's distances (nearest first). */
const ancestorY = (
  ancestors: readonly AncestorLine[],
  distances: readonly number[],
  placed: Position,
  index: number,
) => placed.yAt("above", distances[ancestors.length - 1 - index] as number);

/** The ancestor lines, from A1 to Ak, each running on in chevrons or ending at the member's ends. */
export function ancestorLineElements(
  scope: Scope,
  ancestors: readonly AncestorLine[],
  distances: readonly number[],
  placed: Position,
): LineElement[] {
  const { L } = scope;
  const { x0 } = placed;
  return ancestors.map((ancestor, index) => {
    const w = ancestor.style["stroke-width"];
    return {
      type: "ancestor",
      address: ancestor.address,
      style: ancestor.style,
      xs: ancestor.left ? x0 - 4 * w : x0 + L * 0,
      xe: ancestor.right ? x0 + L + 4 * w : x0 + L * 1,
      y: ancestorY(ancestors, distances, placed, index),
      start: ancestor.left ? "chevrons" : "circle",
      end: ancestor.right ? "chevrons" : ancestor.end,
    };
  });
}

/** The marks of the member's start and end on each ancestor line, always above it. */
export function ancestorMarkElements(
  scope: Scope,
  ancestors: readonly AncestorLine[],
  distances: readonly number[],
  placed: Position,
): MarkerElement[] {
  const { L } = scope;
  const { x0 } = placed;
  return ancestors.flatMap((ancestor, index) => {
    const y = ancestorY(ancestors, distances, placed, index);
    const w = ancestor.style["stroke-width"];
    return ancestor.marks.map((mark) => ({
      type: "wedge" as const,
      address: mark.address,
      style: mark.style,
      x: x0 + L * mark.u,
      yt: y - w / 2,
      yb: y - (w / 2 + MARKER_HEIGHT),
    }));
  });
}

/** The marks' labels, each in its tier above its mark's base. */
export function ancestorLabelElements(
  scope: Scope,
  ancestors: readonly AncestorLine[],
  distances: readonly number[],
  placed: Position,
): TextElement[] {
  const { L, d } = scope;
  const { x0 } = placed;
  return ancestors.flatMap((ancestor, index) => {
    const y = ancestorY(ancestors, distances, placed, index);
    const w = ancestor.style["stroke-width"];
    const size = maxSize(ancestor.labelled.map((mark) => mark.label));
    return ancestor.labelled.map((mark) => {
      const outwards = markLabelOffset(scope, w, ancestor.tier.get(mark) as number, size);
      return centredLabel(mark.label, x0 + L * mark.u, y - outwards - d(size), mark, {
        unit: ancestor.timeline.unit,
        value: mark.value,
      });
    });
  });
}
