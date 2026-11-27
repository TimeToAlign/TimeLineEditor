/**
 * Virtual timelines drawn as cards (`docs/drawing.md` in TimeToShare, section
 * 8.10): each placed virtual timeline in a card of its own, each virtual
 * member in its groups' frames, and the chunks of the FlowMap it applies
 * laid end to end on its axis, its line a segment line of them: their
 * labels above it, their boundaries and the gap lines of its gaps on it,
 * each chunk's window showing its sources.
 *
 * A virtual timeline holds no children, conversion maps, regions or flow
 * control, so it is drawn as the root that holds none core reads it as
 * (`virtualDrawing`), in the frames core orders (`withVirtualMembers`),
 * named as its card names it, and the chunks of its FlowMap carried beside
 * it with what their windows show (core's `windowsOf`). In a card that is an
 * item of the block, runs are drawn once and gap entries widened
 * (`withRuns`).
 */

import type { Places } from "@timetoalign/tilie-core";
import {
  cardAddress,
  FlowMapError,
  idAddress,
  type Manifest,
  placeAt,
  type Region,
  resolveFlowMap,
  type TimelineManifest,
} from "@timetoalign/tilie-core";
import {
  elementKey,
  type GroupFrame,
  type MemberDrawing,
  memberDrawings,
  ungroupedVirtuals,
  virtualDrawing,
  windowsOf,
  withVirtualMembers,
} from "@timetoalign/tilie-core/drawing";
import { compareReal, type Real, realOf } from "@timetoalign/tilie-core/numbers";
import type { Run } from "./boxes.ts";
import { STANDARD_GAP } from "./constants.ts";
import { cardElisionsOf, drawnMode } from "./elisions.ts";
import { nameOf } from "./names.ts";
import { add, coordinateText, coordinateValue, negate, proportion } from "./numbers.ts";
import {
  type CardAxis,
  type DrawnChunk,
  type DrawnFlow,
  rootPieces,
  type Scope,
  shown,
  traverse,
  withAxis,
} from "./traversal.ts";

/** A virtual timeline of a manifest, as the manifest states it. */
type VirtualTimeline = NonNullable<Manifest["virtual_timelines"]>[number];

/**
 * What the block draws as roots (section 8.1): core's member drawings with
 * the virtual members of each group in their frames, in display order, and
 * the placed virtual timelines, those no group names whose ID `places`
 * holds, in canonical order.
 */
export interface DrawnRoots {
  readonly frames: readonly GroupFrame[];
  readonly ungrouped: readonly MemberDrawing[];
  readonly placed: readonly MemberDrawing[];
}

/** The virtual timelines drawn as roots, by manifest: one member drawing each, made once. */
const drawnVirtual = new WeakMap<Manifest, Map<string, MemberDrawing>>();

/** The virtual timeline `id` of `manifest`, or undefined. */
export function virtualTimelineOf(manifest: Manifest, id: string): VirtualTimeline | undefined {
  return (manifest.virtual_timelines ?? []).find((item) => item.id === id);
}

/**
 * The name of a timeline or virtual timeline of `manifest` (section 5.3): its
 * `name`, or its whole ID where that is null; the ID itself where neither
 * holds it.
 */
function nameIn(manifest: Manifest, id: string): string {
  const timeline = timelineIn(manifest, id);
  if (timeline !== undefined) return nameOf(timeline);
  return virtualTimelineOf(manifest, id)?.name ?? id;
}

/** The timeline `id` at any depth of `manifest`'s trees, or undefined. */
function timelineIn(manifest: Manifest, id: string): TimelineManifest | undefined {
  const pending = [...manifest.timelines];
  for (let timeline = pending.pop(); timeline !== undefined; timeline = pending.pop()) {
    if (timeline.id === id) return timeline;
    pending.push(...timeline.children);
  }
  return undefined;
}

/** The region `id` at any depth of `manifest`'s trees, or undefined. */
function regionIn(manifest: Manifest, id: string): Region | undefined {
  const pending = [...manifest.timelines];
  for (let timeline = pending.pop(); timeline !== undefined; timeline = pending.pop()) {
    const region = timeline.regions.find((item) => item.id === id);
    if (region !== undefined) return region;
    pending.push(...timeline.children);
  }
  return undefined;
}

/**
 * The text of the card name of the virtual timeline `virtual` (section
 * 8.10): its name, then ` · unfolded from ` and the name of its `timeline`
 * where its `map` is a FlowMap, ` · converted from ` and that name where it
 * is a conversion map, `·` being U+00B7.
 */
function cardName(manifest: Manifest, virtual: VirtualTimeline): string {
  const own = virtual.name ?? virtual.id;
  const from = nameIn(manifest, virtual.timeline);
  if ((manifest.flow_maps ?? []).some((item) => item.id === virtual.map)) {
    return `${own} · unfolded from ${from}`;
  }
  const converted = manifest.timelines.some(function holds(timeline): boolean {
    return (
      timeline.conversion_maps.some((map) => map.id === virtual.map) ||
      timeline.children.some(holds)
    );
  });
  return converted ? `${own} · converted from ${from}` : own;
}

/**
 * The member drawing of the virtual timeline `virtual`: core's
 * (`virtualDrawing`), its timeline named with its card's name; one object
 * per manifest and ID, so every pass reads the same.
 */
function virtualMember(manifest: Manifest, virtual: VirtualTimeline): MemberDrawing {
  let known = drawnVirtual.get(manifest);
  if (known === undefined) {
    known = new Map();
    drawnVirtual.set(manifest, known);
  }
  const found = known.get(virtual.id);
  if (found !== undefined) return found;
  const core = virtualDrawing(manifest, virtual.id);
  if (core === undefined) throw new Error(`'${virtual.id}' is a virtual timeline`);
  const member: MemberDrawing = {
    ...core,
    timeline: { ...core.timeline, name: cardName(manifest, virtual) },
  };
  known.set(virtual.id, member);
  return member;
}

/** Whether `member` draws a virtual timeline of `manifest`. */
export function isVirtualMember(manifest: Manifest, member: MemberDrawing): boolean {
  return drawnVirtual.get(manifest)?.get(member.timeline.id) === member;
}

/**
 * What the block of `manifest` draws as roots (section 8.1), `places` its
 * placement's places: every group's frame with its members, virtual ones
 * included, in display order; the ungrouped roots; and the placed virtual
 * timelines; each in core's name order (`compareByName`).
 */
export function drawnRoots(manifest: Manifest, places: Places): DrawnRoots {
  const core = memberDrawings(manifest);
  const virtual = manifest.virtual_timelines ?? [];
  if (virtual.length === 0) return { frames: core.frames, ungrouped: core.ungrouped, placed: [] };
  const byId = new Map(virtual.map((item) => [item.id, item]));
  const frames = core.frames.map((frame): GroupFrame => {
    const ordered = withVirtualMembers(manifest, frame);
    if (ordered === frame) return frame;
    return {
      group: frame.group,
      members: ordered.members.map((member) => {
        const item = byId.get(member.timeline.id);
        return item === undefined ? member : virtualMember(manifest, item);
      }),
    };
  });
  const placed = ungroupedVirtuals(manifest)
    .filter((item) => placeAt(places, { item: item.id }) !== undefined)
    .map((item) => virtualMember(manifest, item));
  return { frames, ungrouped: core.ungrouped, placed };
}

/**
 * The chunks the line of the virtual timeline drawn by `member` draws
 * (section 8.10), its runs drawn once where `once` (a card that is an item of
 * the block), with what their windows show: null where `member` draws no
 * virtual timeline or it does not resolve, its `map` no FlowMap that
 * resolves, its `timeline` not that FlowMap's or a `through` stated.
 */
export function virtualFlow(
  manifest: Manifest,
  member: MemberDrawing,
  once: boolean,
): DrawnFlow | null {
  if (!isVirtualMember(manifest, member)) return null;
  const virtual = virtualTimelineOf(manifest, member.timeline.id);
  if (virtual === undefined || virtual.through !== undefined) return null;
  const flowMap = (manifest.flow_maps ?? []).find((item) => item.id === virtual.map);
  if (flowMap === undefined || flowMap.timeline !== virtual.timeline) return null;
  const flow = flowOf(manifest, flowMap.id, virtual.id, once);
  return flow === null ? null : { ...flow, windows: windowsOf(manifest, flowMap.id) };
}

/** A stretch `[a, b]` of a card's axis. */
type Stretch = readonly [Real, Real];

/** Whether the stretch `[a', b']` reaches into `[a, b]`: `a' < b` and `a < b'`, compared exactly. */
const reaches = ([from, to]: Stretch, [a, b]: Stretch): boolean =>
  compareReal(from, b) < 0 && compareReal(a, to) < 0;

/**
 * The chunks of the FlowMap `flowMapId` of `manifest` as a line whose chunk
 * addresses carry `timeline` draws them (section 8.10), its runs drawn once
 * and its gap entries widened where `once`, but a run whose run gap and a
 * gap entry that one of the stretches `cuts` reaches into (those of the
 * stored elisions the card draws); null where the FlowMap does not resolve.
 * Every entry lies at its span: a gap's label is the pretty text of its
 * length on its root's axis, every other entry's the name of its source (a
 * region's `name`, else its whole ID; a timeline's or virtual timeline's
 * name), a run drawn once labelled by its first entry's text, a space, `×`
 * (U+00D7), a space and its count, a run being one of `ResolvedFlowMap.runs`
 * of two or more entries. It shows no window (`virtualFlow` adds them).
 */
export function flowOf(
  manifest: Manifest,
  flowMapId: string,
  timeline: string,
  once: boolean,
  cuts: readonly Stretch[] = [],
): DrawnFlow | null {
  let resolved: ReturnType<typeof resolveFlowMap>;
  try {
    resolved = resolveFlowMap(manifest, flowMapId);
  } catch (error) {
    if (error instanceof FlowMapError) return null;
    throw error;
  }
  const root = timelineIn(manifest, resolved.timeline);
  const entries = (manifest.flow_maps ?? []).find((item) => item.id === flowMapId)?.chunks ?? [];
  const textOf = (index: number, source: string | null): string => {
    const entry = entries[index];
    if (source === null) {
      if (root === undefined || entry === undefined || typeof entry === "string") {
        throw new Error("a resolved FlowMap's gap lies on its root's axis");
      }
      return coordinateText(
        coordinateValue(entry.gap, root.number_type),
        root.number_type,
        root.unit,
      );
    }
    const region = regionIn(manifest, source);
    if (region !== undefined) return region.name ?? region.id;
    return nameIn(manifest, source);
  };
  const { chunks, runs } = resolved;
  const reached = (stretch: Stretch) => cuts.some((cut) => reaches(cut, stretch));
  // The length of each run drawn once, at its first entry; 0 at every later entry of such a
  // run, 1 elsewhere. A run a cut reaches into is drawn entry by entry (section 8.10, Runs).
  const counts = chunks.map(() => 1);
  const runGaps: Stretch[] = [];
  for (const run of runs) {
    const first = run.chunk.index;
    const last = chunks[first + run.count - 1];
    if (!once || run.count < 2 || last === undefined) continue;
    const gap: Stretch = [realOf(run.chunk.played.end), realOf(last.played.end)];
    if (reached(gap)) continue;
    runGaps.push(gap);
    counts[first] = run.count;
    for (let later = first + 1; later < first + run.count; later += 1) counts[later] = 0;
  }
  const drawn: DrawnChunk[] = [];
  const widened: Stretch[] = [];
  chunks.forEach((chunk, index) => {
    const start = realOf(chunk.played.start);
    const end = realOf(chunk.played.end);
    const count = counts[index] ?? 1;
    const own = textOf(index, chunk.source);
    const gap = chunk.source === null;
    if (once && gap && !reached([start, end])) widened.push([start, end]);
    drawn.push({
      index,
      gap,
      start,
      end,
      text: count >= 2 ? `${own} × ${count}` : own,
      drawn: count !== 0,
      boundary: index >= 1 && count !== 0,
    });
  });
  return { flowMap: flowMapId, timeline, once, chunks: drawn, runGaps, widened, windows: null };
}

/**
 * The stretches of the stored card elisions the card of `scope` draws
 * (section 8.9, Where; section 8.10, Elisions of a virtual timeline), on the
 * placed card of a virtual timeline alone: under its drawn `elision-mode`
 * `custom` (`drawnMode`), each lying on its virtual timeline, its gap
 * displayed and its timeline drawn; none on any other card.
 */
function drawnElisions(scope: Scope): Stretch[] {
  const { cascade, holder, root, frame, manifest, member } = scope;
  if (frame !== null || !isVirtualMember(manifest, member)) return [];
  const stored = cardElisionsOf(scope);
  const card = cascade.resolve(
    elementKey("card", cardAddress(root.id), root, holder.key),
    holder.style,
  );
  if (drawnMode(card, stored.length > 0) !== "custom") return [];
  return stored.flatMap(({ elision, entry, a, b }) => {
    const key = elementKey("elision", idAddress(elision.id), entry.manifest, entry.key);
    return entry.drawn && shown(cascade.resolve(key, entry.style)) ? [[a, b] as const] : [];
  });
}

/**
 * `scope` on the axis of its runs drawn once and its widened gaps (section
 * 8.10, Runs and Widened gaps), in a card that is an item of the block. Its
 * flow is first drawn again where a stored elision the card draws reaches
 * into a run gap or a gap entry (`flowOf`'s `cuts`), the card traversed
 * again so that every chunk drawn shows its window. Each run gap is a gap of
 * section 3.2 over `[a, b]` whose drawn width is 0, its natural width `L × ub
 * − L × ua` all its shrink; each gap entry over `[a, b]` whose natural width
 * `n` is less than `Gm` (the standard gap, 32) a widened gap of the drawn
 * width `Gm` and the shrink `n − Gm`. A position `t` before the first run gap
 * lies at `L × u − D`; one at or after the end `b` of a run gap, and before
 * the next one's start, at `x(a) + (L × u − L × ub − D)`, `x(a)` that gap's
 * start's, the two products formed first and `D` the shrinks of the widened
 * gaps from `b` up to `t` (`b ≤ a'` and `b' ≤ t` for one over `[a', b']`),
 * summed from the left, so that `t = b` lies exactly at `x(a)`; a position
 * inside a widened gap at `x(a') + Gm × v`, `v = (t − a') / (b' − a')`; a
 * position inside a run gap is not drawn. Neither kind has an address,
 * draws anything or cuts a row; every first fit of the card measures the
 * drawn x. `scope` itself where it draws neither.
 */
export function withRuns(scope: Scope): Scope {
  const { flow } = scope;
  if (flow === null || !flow.once) return scope;
  const cuts = drawnElisions(scope);
  const cut =
    cuts.length === 0 ? null : flowOf(scope.manifest, flow.flowMap, flow.timeline, true, cuts);
  const redrawn =
    cut === null
      ? scope
      : traverse(
          scope,
          scope.member,
          scope.holder,
          scope.S,
          scope.V,
          scope.frame,
          { ...cut, windows: flow.windows },
          null,
        );
  const drawnFlow = redrawn.flow ?? flow;
  const axis = flowAxis(redrawn, drawnFlow.runGaps, drawnFlow.widened);
  if (axis === undefined) return redrawn;
  return {
    ...withAxis(redrawn, axis),
    relativeX: axis.relative,
    relativeEnd: (entry) => (entry.rootEnd ? axis.endAt(entry.end) : axis.relative(entry.end)),
  };
}

/**
 * The axis of `scope` with the run gaps `runGaps` and the gap entries
 * `entries` that are widened where narrower than `Gm` (`withRuns`);
 * undefined where it has no run gap and no widened gap.
 */
function flowAxis(
  scope: Scope,
  runGaps: readonly Stretch[],
  entries: readonly Stretch[],
): CardAxis | undefined {
  const { L, u, lambda } = scope;
  const widened = entries
    .map(([a, b]) => {
      const ua = u(a);
      const ub = u(b);
      const n = L * ub - L * ua;
      return { a, b, ua, ub, shrink: n - STANDARD_GAP, n };
    })
    .filter((gap) => gap.n < STANDARD_GAP);
  if (runGaps.length === 0 && widened.length === 0) return undefined;
  // The shrinks of the widened gaps lying from `from` (the start where null) up to `to`.
  const shrinks = (from: Real | null, to: Real): number => {
    let D = 0;
    for (const gap of widened) {
      const after = from === null || compareReal(from, gap.a) <= 0;
      if (after && compareReal(gap.b, to) <= 0) D = D + gap.shrink;
    }
    return D;
  };
  // Each run gap with its edge `x(a)` less `x0`, found from the left.
  const placed: {
    readonly a: Real;
    readonly b: Real;
    readonly ua: number;
    readonly ub: number;
    left: number;
  }[] = [];
  const along = (value: Real, count: number): number => {
    let last: (typeof placed)[number] | undefined;
    for (const gap of placed.slice(0, count)) if (compareReal(gap.b, value) <= 0) last = gap;
    return last === undefined
      ? L * u(value) - shrinks(null, value)
      : last.left + (L * u(value) - L * last.ub - shrinks(last.b, value));
  };
  for (const [a, b] of runGaps) {
    placed.push({ a, b, ua: u(a), ub: u(b), left: along(a, placed.length) });
  }
  const relative = (value: Real): number => {
    const inside = widened.find(
      ({ a, b }) => compareReal(a, value) < 0 && compareReal(value, b) < 0,
    );
    if (inside === undefined) return along(value, placed.length);
    const v = proportion(add(value, negate(inside.a)), add(inside.b, negate(inside.a)));
    return along(inside.a, placed.length) + STANDARD_GAP * v;
  };
  const end = relative(lambda);
  // Each run as an application reads it, `x0 + (L × u − D)`, between the run gaps and the
  // widened gaps; a widened gap a run of its own scale `Gm / (ub − ua)`.
  const cuts = [
    ...placed.map((gap) => ({ ...gap, width: 0 })),
    ...widened.map((gap) => ({ ...gap, width: STANDARD_GAP })),
  ].sort((left, right) => compareReal(left.a, right.a));
  const runs: Run[] = [];
  let from: { u: number; at: Real | null } = { u: 0, at: null };
  // A run between two cuts that meet is empty, and none is listed.
  const runTo = (u1: number) => {
    if (u1 <= from.u) return;
    const left = from.at === null ? 0 : relative(from.at);
    runs.push({ u0: from.u, u1, L, D: L * from.u - left });
  };
  for (const gap of cuts) {
    runTo(gap.ua);
    if (gap.width > 0) {
      const scale = gap.width / (gap.ub - gap.ua);
      runs.push({ u0: gap.ua, u1: gap.ub, L: scale, D: scale * gap.ua - relative(gap.a) });
    }
    from = { u: gap.ub, at: gap.b };
  }
  runTo(1);
  return {
    gaps: [],
    seams: widened.flatMap(({ a, b }) => [a, b]),
    runs,
    total: L - end,
    endAt: () => end,
    relative,
    relativeAt: relative,
    startAt: relative,
    gapOf: () => undefined,
    runGaps,
    runGapOf: (value) => {
      const gap = placed.find(({ a, b }) => compareReal(a, value) < 0 && compareReal(value, b) < 0);
      return gap === undefined ? undefined : gap.left;
    },
    shrinkBefore: (value) => L * u(value) - relative(value),
    crosses: () => false,
  };
}

/** A chunk of a line's FlowMap as its line draws it: the chunk and its drawn span. */
export interface ChunkSpan {
  readonly chunk: DrawnChunk;
  readonly start: Real;
  readonly end: Real;
}

/**
 * The drawn chunks of the FlowMap the root's line of `scope` draws (section
 * 8.10), each over its span; on a card carried through a switched frame,
 * a virtual member's, each once in every piece it reaches into, over its
 * played stretch there, piece after piece. None where the line draws none.
 */
export function chunkSpans(scope: Scope): ChunkSpan[] {
  const { flow } = scope;
  if (flow === null) return [];
  const drawn = flow.chunks.filter((chunk) => chunk.drawn);
  if (!scope.carried) return drawn.map((chunk) => ({ chunk, start: chunk.start, end: chunk.end }));
  return rootPieces(scope).flatMap((piece) =>
    drawn.flatMap((chunk) => {
      const span = scope.over(piece, chunk.start, chunk.end);
      return span === undefined ? [] : [{ chunk, start: span.start, end: span.end }];
    }),
  );
}

/**
 * The positions of the boundaries at the drawn starts of the chunks of
 * `scope`'s FlowMap (section 8.10), each with its chunk; on a carried card
 * at each played position of the start, piece after piece.
 */
export function chunkStarts(scope: Scope): { readonly chunk: DrawnChunk; readonly at: Real }[] {
  const { flow } = scope;
  if (flow === null) return [];
  const bounded = flow.chunks.filter((chunk) => chunk.boundary);
  if (!scope.carried) return bounded.map((chunk) => ({ chunk, at: chunk.start }));
  return rootPieces(scope).flatMap((piece) =>
    bounded.flatMap((chunk) => {
      const at = scope.at(piece, chunk.start);
      return at === undefined ? [] : [{ chunk, at }];
    }),
  );
}
