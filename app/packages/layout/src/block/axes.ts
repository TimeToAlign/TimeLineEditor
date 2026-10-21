/**
 * The axis of every line a member drawing draws (`docs/drawing.md` in
 * TimeToShare, sections 3 and 8.3): where on the drawing its timeline's
 * own coordinates lie.
 */

import type { Real, TimelineManifest } from "@timetoalign/tilie-core";
import { type MemberDrawing, orderedChildren } from "@timetoalign/tilie-core/drawing";
import { compareReal } from "@timetoalign/tilie-core/numbers";
import type { DrawnAxis } from "../boxes.ts";
import type { LineElement } from "../elements.ts";
import type { MemberDrawn } from "../member.ts";
import {
  add,
  coordinateValue,
  lengthValue,
  negate,
  proportion,
  reachOf,
  zero,
} from "../numbers.ts";

/** Where a timeline of a member drawing lies on its root's axis (sections 3.1 and 3.4). */
interface Span {
  readonly timeline: TimelineManifest;
  readonly start: Real;
  readonly end: Real;
  /** Its end is open: no length and nothing else fixes it. */
  readonly open: boolean;
  /** Its end is the root's open end, drawn at `x0 + L` whatever the reach. */
  readonly rootEnd: boolean;
}

/**
 * The span of every timeline of the tree of `root`, by id: a child of a
 * timeline starting at `s` with offset `o` starts at `s + o`, and each ends
 * by the first rule of section 3.4 that applies: its length; the root's
 * reach `lambda`, open; the next segment's start; its segment line's end;
 * else its own reach, open.
 */
function spansOf(root: TimelineManifest, lambda: Real): Map<string, Span> {
  const spans = new Map<string, Span>();
  const visit = (
    timeline: TimelineManifest,
    parent: Span | undefined,
    start: Real,
    next?: Real,
  ) => {
    const length = lengthValue(timeline);
    const known = { open: false, rootEnd: false };
    const ending =
      length !== null
        ? { end: add(start, length), ...known }
        : parent === undefined
          ? { end: lambda, open: true, rootEnd: true }
          : parent.timeline.is_segment_line
            ? next !== undefined
              ? { end: next, ...known }
              : { end: parent.end, open: parent.open, rootEnd: parent.rootEnd }
            : { end: add(start, reachOf(timeline)), open: true, rootEnd: false };
    const span: Span = { timeline, start, ...ending };
    spans.set(timeline.id, span);
    const starts = orderedChildren(timeline).map((child) => ({
      child,
      start: add(start, coordinateValue(child.offset, timeline.number_type)),
    }));
    starts.forEach(({ child, start: from }, index) => {
      visit(child, span, from, starts[index + 1]?.start);
    });
  };
  visit(root, undefined, zero(root.number_type));
  return spans;
}

/**
 * The axes of the lines `drawn` draws for `member`, started at `x0` and `L`
 * long, in item coordinates and in the order of their elements.
 *
 * A timeline's or a child's line runs from `Xs`, its own axis's zero, to
 * `Xe`, its end: its length, or the end the next segment or its segment
 * line gives it (section 3.4), on its own axis; where its end is open, `Xe`
 * is its reach's and the end is not known. An ancestor line (section 8.3)
 * is clipped to the member: from `x0`, the member's start on the ancestor's
 * axis, to the ancestor's own end where that lies short of the member's
 * end, else to `x0 + L`, the member's end, not known where the member's end
 * is open. An axis lists the maps of its timeline that the member drawing
 * displays.
 */
export function axesOf(
  member: MemberDrawing,
  drawn: MemberDrawn,
  x0: number,
  L: number,
): DrawnAxis[] {
  const root = member.timeline;
  // The root's length `λ`, or its reach when its length is not known (section 3.2).
  const lambda = lengthValue(root) ?? reachOf(root);
  const relativeX = (value: Real) => L * proportion(value, lambda);
  const spans = spansOf(root, lambda);
  const rootOpen = spans.get(root.id)?.open === true;
  // The IDs of the displayed maps: a map's address is `{id}`.
  const shownMaps = new Set(
    drawn.elements.flatMap((element) => (element.type === "map" ? [element.address.id] : [])),
  );
  const ancestorIndex = new Map(
    member.ancestors.map(({ timeline }, index) => [timeline.id, index]),
  );

  const lineAxis = (element: LineElement): DrawnAxis | undefined => {
    const span = element.address.id === undefined ? undefined : spans.get(element.address.id);
    if (span === undefined) return undefined;
    const { timeline } = span;
    const length = lengthValue(timeline);
    return {
      address: element.address,
      line: element.y,
      xStart: element.xs,
      xEnd: x0 + (span.rootEnd ? L : relativeX(span.end)),
      unit: timeline.unit,
      numberType: timeline.number_type,
      start: zero(timeline.number_type),
      end: span.open ? null : (length ?? add(span.end, negate(span.start))),
      maps: timeline.conversion_maps.filter((map) => shownMaps.has(map.id)),
    };
  };
  const ancestorAxis = (element: LineElement): DrawnAxis | undefined => {
    const { id } = element.address;
    const index = (id === undefined ? undefined : ancestorIndex.get(id)) ?? member.ancestors.length;
    const [ancestor, ...lower] = member.ancestors.slice(index);
    if (ancestor === undefined) return undefined;
    const { timeline } = ancestor;
    // The member's start on the ancestor's axis: the offsets from the ancestor down, summed.
    let start = coordinateValue(ancestor.offset, timeline.number_type);
    for (const next of lower) {
      start = add(start, coordinateValue(next.offset, next.timeline.number_type));
    }
    const length = lengthValue(timeline);
    // Where it does not run on, its end `te` on the member's axis lies at or short of `λ`.
    const te = element.end === "chevrons" || length === null ? null : add(negate(start), length);
    const short = te !== null && compareReal(te, lambda) < 0;
    return {
      address: element.address,
      line: element.y,
      xStart: x0,
      xEnd: short && te !== null ? x0 + relativeX(te) : x0 + L,
      unit: timeline.unit,
      numberType: timeline.number_type,
      start,
      // Clipped at the member's end, the coordinate there; at its own end short of it, its length.
      end: short ? length : rootOpen ? null : add(start, lambda),
      maps: [],
    };
  };
  return drawn.elements.flatMap((element) => {
    if (element.type !== "timeline" && element.type !== "child" && element.type !== "ancestor") {
      return [];
    }
    const axis = element.type === "ancestor" ? ancestorAxis(element) : lineAxis(element);
    return axis === undefined ? [] : [axis];
  });
}
