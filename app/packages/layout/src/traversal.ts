/**
 * One timeline drawn as a root: its timelines in traversal order, its axis
 * and the measures its bands share (`docs/drawing.md` in timeskeleton,
 * sections 3.2, 5 and 6.1).
 */

import {
  type ConversionMap,
  type ElementKey,
  elementAddress,
  elementKey,
  type MemberDrawing,
  orderedChildren,
  type Real,
  type TimelineManifest,
  textKey,
} from "@timetoalign/tilie-core";
import type { ElementType } from "@timetoalign/timeskeleton";
import type { Cascade, Side, Style } from "./cascade.ts";
import type { LineEnd, Placement } from "./elements.ts";
import { cleanText, type TextMeasure } from "./metrics.ts";
import { add, coordinateValue, proportion, zero } from "./numbers.ts";

export interface Styled {
  readonly address: string;
  readonly style: Style;
}

/** An element of the tree whose children inherit from it: its key and its cascaded style. */
export interface Holder {
  readonly key: ElementKey;
  readonly style: Style;
}

export interface Entry extends Holder {
  readonly manifest: TimelineManifest;
  readonly parent: Entry | undefined;
  readonly start: Real;
  readonly end: Real;
  /** Its name: drawn for the root and a child, counted for a segment line among segments. */
  readonly name: Styled;
  /** A child of a segment line: it has a boundary unless it is the first, and a label. */
  readonly segment: boolean;
  /** The first segment of its segment line, in canonical order. */
  readonly first: boolean;
  /** Drawn as a line of its own: the root, a child, a segment that is a segment line. */
  readonly line: boolean;
  /** The line it lies on: itself when it has a line, else its segment line's. */
  holder: Entry;
}

/** An element a timeline owns: a map, a region, a break, a jump or a wedge. */
export interface Owned extends Styled {
  readonly entry: Entry;
  readonly side: Side;
  readonly label: Styled;
}

export interface Measured {
  readonly clean: string;
  readonly width: number;
}

/** What every member drawing of one manifest shares. */
export interface Context {
  readonly placement: Placement;
  readonly cascade: Cascade;
  readonly measure: TextMeasure;
}

/** One timeline drawn as a root, traversed, with the measures of its axis and its texts. */
export interface Scope extends Context {
  readonly member: MemberDrawing;
  /** The timeline drawn as the root. */
  readonly root: TimelineManifest;
  /** Every timeline of its tree in traversal order, the root first. */
  readonly entries: readonly Entry[];
  readonly rootEntry: Entry;
  /** The root's length `λ`. */
  readonly lambda: Real;
  /** The graphical length `L`. */
  readonly L: number;
  /** The vertical stretch `v`. */
  readonly v: number;
  /** The proportion `u` of an exact position on the root's axis (section 3.2). */
  readonly u: (value: Real) => number;
  /** `L × u`: an exact position's distance from the root's start. */
  readonly relativeX: (value: Real) => number;
  readonly h: (size: number) => number;
  readonly a: (size: number) => number;
  readonly d: (size: number) => number;
  readonly address: (id: string) => string;
  readonly styled: (key: ElementKey, parent: Style) => Styled;
  readonly textOf: (owner: Holder, kind: "name" | "label") => Styled;
  readonly measured: (owner: Styled, text: string) => Measured;
  readonly owned: (
    type: ElementType,
    at: string,
    entry: Entry,
    map?: ConversionMap,
  ) => Owned & Holder;
}

export const opposite = (side: Side): Side => (side === "above" ? "below" : "above");
export const shown = (style: Style): boolean => style.display === "inline";

export const maxSize = (items: readonly Styled[], fallback = 9): number =>
  items.length === 0 ? fallback : Math.max(...items.map((item) => item.style["font-size"]));

/** The pitch `max(14v, h(size))` of a row whose name has font size `size`. */
export const rowPitch = (scope: Scope, size: number): number =>
  Math.max(14 * scope.v, scope.h(size));

/** How a timeline drawn up to its end ends (section 6.6). */
export function endOf(timeline: TimelineManifest, topLevel: boolean): LineEnd {
  if (!topLevel) return "diamond";
  if (timeline.locked) return "circle";
  return timeline.is_segment_line ? "open" : "arrowhead";
}

/**
 * Traverse one timeline drawn as a root (section 6.1), its line held by
 * `holder`, the block or its group's frame.
 */
export function traverse(context: Context, member: MemberDrawing, holder: Holder): Scope {
  const { placement, cascade, measure } = context;
  const root = member.timeline;
  const L = placement.length;
  const v = placement.spacing;
  const h = (size: number) => measure.lineHeight(size);
  const a = (size: number) => measure.ascent(size);
  const d = (size: number) => measure.descent(size);
  const address = (id: string) => elementAddress(member.root, id);

  const styled = (key: ElementKey, parent: Style): Styled => ({
    address: key.address as string,
    style: cascade.resolve(key, parent),
  });
  const textOf = (owner: Holder, kind: "name" | "label"): Styled =>
    styled(textKey(owner.key, kind), owner.style);
  const measured = (owner: Styled, text: string): Measured => {
    const clean = cleanText(text);
    return { clean, width: measure.width(clean, owner.style["font-size"]) };
  };

  const entries: Entry[] = [];
  const visit = (
    timeline: TimelineManifest,
    parent: Entry | undefined,
    start: Real,
    segment: boolean,
    first: boolean,
  ) => {
    const line = !segment || timeline.is_segment_line;
    const type = parent === undefined ? "timeline" : line ? "child" : null;
    const outer = parent ?? holder;
    const key = elementKey(type, timeline.id, timeline, outer.key);
    const style = cascade.resolve(key, outer.style);
    const entry: Entry = {
      manifest: timeline,
      parent,
      start,
      end: add(start, coordinateValue(timeline.length)),
      key,
      style,
      name: textOf({ key, style }, "name"),
      segment,
      first,
      line,
      holder: undefined as unknown as Entry,
    };
    entry.holder = line ? entry : (parent as Entry).holder;
    entries.push(entry);
    orderedChildren(timeline).forEach((child, index) => {
      const offset = add(start, coordinateValue(child.offset));
      visit(child.timeline, entry, offset, timeline.is_segment_line, index === 0);
    });
  };
  visit(root, undefined, zero(root.number_type), false, false);
  const rootEntry = entries[0] as Entry;
  const lambda = coordinateValue(root.length);
  const u = (value: Real) => proportion(value, lambda);
  const relativeX = (value: Real) => L * u(value);

  const owned = (
    type: ElementType,
    at: string,
    entry: Entry,
    map?: ConversionMap,
  ): Owned & Holder => {
    const key = elementKey(type, at, entry.manifest, entry.key, map);
    const style = cascade.resolve(key, entry.style);
    return {
      key,
      address: at,
      style,
      entry,
      side: style.side,
      label: textOf({ key, style }, "label"),
    };
  };

  return {
    placement,
    cascade,
    measure,
    member,
    root,
    entries,
    rootEntry,
    lambda,
    L,
    v,
    u,
    relativeX,
    h,
    a,
    d,
    address,
    styled,
    textOf,
    measured,
    owned,
  };
}
