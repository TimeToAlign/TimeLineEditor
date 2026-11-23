/**
 * The axis of every line a member drawing draws (`docs/drawing.md` in
 * TimeToShare, sections 3 and 8.3): where on the drawing its timeline's
 * own coordinates lie.
 */

import type { Manifest, PlaceKey, Real, TimelineManifest } from "@timetoalign/tilie-core";
import { type MemberDrawing, orderedChildren, reachOf } from "@timetoalign/tilie-core/drawing";
import { compareReal } from "@timetoalign/tilie-core/numbers";
import type { AxisMap, AxisSegment, DrawnAxis } from "../boxes.ts";
import type { LineElement } from "../elements.ts";
import { type CardAxis, outside, type Stretch } from "../elisions.ts";
import type { MemberDrawn } from "../member.ts";
import { add, coordinateValue, lengthValue, negate, proportion, zero } from "../numbers.ts";

/**
 * The full runs of a line spanning `start` to `end` on its root's axis, the
 * stretches of the gaps of `axis` elided and the span cut at its seams: what
 * `outside` leaves of the span, or, for a line of drawn length 0, the point
 * itself where no gap holds it (`CardAxis.gapOf`), and nothing where one does.
 */
function runsOf(start: Real, end: Real, axis: CardAxis | undefined): Stretch[] {
  if (axis === undefined) return [[start, end]];
  if (compareReal(start, end) === 0) return axis.gapOf(start) === undefined ? [[start, end]] : [];
  const stretches = [
    ...axis.gaps.map((gap): Stretch => [gap.a, gap.b]),
    ...axis.seams.map((seam): Stretch => [seam, seam]),
  ];
  return outside(start, end, stretches);
}

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
function spansOf(manifest: Manifest, root: TimelineManifest, lambda: Real): Map<string, Span> {
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
            : { end: add(start, reachOf(timeline, manifest)), open: true, rootEnd: false };
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
 * The axes of the lines `drawn` draws for `member` of `manifest`, started at
 * `x0` and `L` long, in item coordinates and in the order of their elements,
 * each timeline's or child's line with where a coordinate marker of it lies
 * (`MemberDrawn.markers`), each ancestor line with its mark (`MemberDrawn.marks`).
 *
 * A timeline's or a child's line runs from `Xs`, its own axis's zero, to
 * `Xe`, its end: its length, or the end the next segment or its segment
 * line gives it (section 3.4), on its own axis; where its end is open, `Xe`
 * is its reach's and the end is not known. An ancestor line (section 8.3)
 * is clipped to the member: from `x0`, the member's start on the ancestor's
 * axis, to the ancestor's own end where that lies short of the member's
 * end, else to `x0 + L`, the member's end, not known where the member's end
 * is open. An axis names the card `card` that draws it, lists the segments
 * of its timeline when it is a segment line, each with its offset and its
 * length (section 3.4), and the maps drawn at its line, its own and those of
 * its segments without a line (section 6.4, Segments without a line), in
 * the order they are drawn, each with the timeline it spans.
 *
 * On the elided axis `elided` of a card drawing gaps (sections 3.2 and
 * 8.9), a line is drawn in full runs between its gaps, and has one axis
 * per run, each linear, from the run's start to its end at their elided x
 * (a run starting at a seam at the start of the run right of it),
 * with the coordinates there, every one with the timeline's address (`run`
 * telling them apart from the second on) and the named timestamps whose
 * cross-section lines lie on it.
 */
export function axesOf(
  manifest: Manifest,
  member: MemberDrawing,
  card: PlaceKey,
  drawn: MemberDrawn,
  x0: number,
  L: number,
  elided: CardAxis | undefined,
): DrawnAxis[] {
  const root = member.timeline;
  // The root's length `λ`, or its reach when its length is not known (section 3.2).
  const lambda = lengthValue(root) ?? reachOf(root, manifest);
  const relativeX = (value: Real) =>
    elided === undefined ? L * proportion(value, lambda) : elided.relative(value);
  // A run's start and end: at a seam on its right and its left side.
  const runX = (value: Real, side: "before" | "after") =>
    elided === undefined ? L * proportion(value, lambda) : elided.relativeAt(value, side);
  // `Xe` of a span's end: `x0 + L` at the root's open end, less every shrink on an elided axis.
  const endX = (span: Pick<Span, "rootEnd" | "end">) =>
    x0 + (span.rootEnd ? (elided === undefined ? L : L - elided.total) : relativeX(span.end));
  const spans = spansOf(manifest, root, lambda);
  const rootOpen = spans.get(root.id)?.open === true;
  // The timeline each map spans, by the map's ID, and the line each timeline's maps are drawn
  // at: its own, or its segment line's for a segment without a line.
  const owners = new Map<string, string>();
  const lineOf = new Map<string, string>();
  const visit = (timeline: TimelineManifest, parent: TimelineManifest | undefined) => {
    for (const map of timeline.conversion_maps) owners.set(map.id, timeline.id);
    const joins = parent?.is_segment_line === true && !timeline.is_segment_line;
    lineOf.set(timeline.id, joins && parent !== undefined ? parent.id : timeline.id);
    for (const child of timeline.children) visit(child, timeline);
  };
  visit(root, undefined);
  // The maps drawn, each at the line its owner's maps are drawn at: a map's address is `{id}`.
  const drawnMaps = drawn.elements.flatMap((element) => {
    const { id } = element.address;
    const owner = id === undefined ? undefined : owners.get(id);
    if (element.type !== "map" || id === undefined || owner === undefined) return [];
    const map: AxisMap = { id, owner, xs: element.xs, xe: element.xe, yc: element.yc };
    return [{ line: lineOf.get(owner), map }];
  });
  const segmentsOf = (timeline: TimelineManifest): AxisSegment[] =>
    !timeline.is_segment_line
      ? []
      : orderedChildren(timeline).flatMap((child) => {
          const span = spans.get(child.id);
          if (span === undefined) return [];
          return [
            {
              id: child.id,
              offset: coordinateValue(child.offset, timeline.number_type),
              length: add(span.end, negate(span.start)),
            },
          ];
        });
  const ancestorIndex = new Map(
    member.ancestors.map(({ timeline }, index) => [timeline.id, index]),
  );

  const lineAxes = (element: LineElement): DrawnAxis[] => {
    const span = element.address.id === undefined ? undefined : spans.get(element.address.id);
    if (span === undefined) return [];
    const { timeline } = span;
    const length = lengthValue(timeline);
    const drawnEnd = length ?? add(span.end, negate(span.start));
    const whole: DrawnAxis = {
      address: element.address,
      card,
      line: element.y,
      xStart: element.xs,
      xEnd: endX(span),
      unit: timeline.unit,
      numberType: timeline.number_type,
      start: zero(timeline.number_type),
      end: span.open ? null : drawnEnd,
      drawnEnd,
      segments: segmentsOf(timeline),
      maps: drawnMaps.flatMap((item) => (item.line === timeline.id ? [item.map] : [])),
      marker: drawn.markers.get(element) ?? null,
      mark: null,
      timestamps: drawn.timestamps.get(element) ?? [],
    };
    const runs = runsOf(span.start, span.end, elided);
    const [first] = runs;
    if (
      runs.length === 1 &&
      first !== undefined &&
      compareReal(first[0], span.start) === 0 &&
      compareReal(first[1], span.end) === 0
    ) {
      return [whole];
    }
    return runs.map(([from, to], index): DrawnAxis => {
      const opening = compareReal(from, span.start) === 0;
      const closing = compareReal(to, span.end) === 0;
      const own = (value: Real) => add(value, negate(span.start));
      const xStart = opening ? element.xs : x0 + runX(from, "after");
      const xEnd = closing ? whole.xEnd : x0 + runX(to, "before");
      return {
        ...whole,
        xStart,
        xEnd,
        start: opening ? whole.start : own(from),
        end: closing ? whole.end : own(to),
        drawnEnd: closing ? whole.drawnEnd : own(to),
        timestamps: whole.timestamps.filter(({ x }) => xStart <= x && x <= xEnd),
        ...(index === 0 ? {} : { run: index }),
      };
    });
  };
  const ancestorAxes = (element: LineElement): DrawnAxis[] => {
    const { id } = element.address;
    const index = (id === undefined ? undefined : ancestorIndex.get(id)) ?? member.ancestors.length;
    const [ancestor, ...lower] = member.ancestors.slice(index);
    if (ancestor === undefined) return [];
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
    const whole: DrawnAxis = {
      address: element.address,
      card,
      line: element.y,
      xStart: x0,
      xEnd: short && te !== null ? x0 + relativeX(te) : endX({ rootEnd: true, end: lambda }),
      unit: timeline.unit,
      numberType: timeline.number_type,
      start,
      // Clipped at the member's end, the coordinate there; at its own end short of it, its length.
      end: short ? length : rootOpen ? null : add(start, lambda),
      drawnEnd: short && length !== null ? length : add(start, lambda),
      segments: [],
      maps: [],
      marker: null,
      mark: drawn.marks.get(element) ?? null,
      timestamps: drawn.timestamps.get(element) ?? [],
    };
    // On its frame's elided axis, one axis per full run, as a line's (section 3.2).
    const reach = short && te !== null ? te : lambda;
    const runs = runsOf(zero(root.number_type), reach, elided);
    if (elided === undefined || runs.length <= 1) return [whole];
    return runs.map(([from, to], run): DrawnAxis => {
      const opening = compareReal(from, 0) === 0;
      const closing = compareReal(to, reach) === 0;
      const xStart = opening ? whole.xStart : x0 + runX(from, "after");
      const xEnd = closing ? whole.xEnd : x0 + runX(to, "before");
      return {
        ...whole,
        xStart,
        xEnd,
        start: opening ? whole.start : add(start, from),
        end: closing ? whole.end : add(start, to),
        drawnEnd: closing ? whole.drawnEnd : add(start, to),
        timestamps: whole.timestamps.filter(({ x }) => xStart <= x && x <= xEnd),
        ...(run === 0 ? {} : { run }),
      };
    });
  };
  return drawn.elements.flatMap((element) => {
    if (element.type !== "timeline" && element.type !== "child" && element.type !== "ancestor") {
      return [];
    }
    if (element.type !== "ancestor") return lineAxes(element);
    return ancestorAxes(element);
  });
}
