/**
 * Virtual timelines drawn as cards (`docs/drawing.md` in TimeToShare,
 * section 8.10): each placed virtual timeline in a card of its own, each
 * virtual member in its groups' frames, and the chunks of the FlowMap it
 * applies laid end to end on its axis, its regions band drawing them as
 * braces and its line their gaps and boundaries.
 *
 * A virtual timeline has no children, conversion maps, regions or flow
 * control, so it is drawn as a root that holds none: a timeline of its ID,
 * unit, number type and length, locked (its end is fixed by its map), named
 * as its card names it, and the chunks of its FlowMap carried beside it.
 */

import type { Places } from "@timetoalign/tilie-core";
import {
  compareCodePoints,
  displayOrder,
  FlowMapError,
  type Manifest,
  placeAt,
  type Region,
  resolveFlowMap,
  type TimelineManifest,
} from "@timetoalign/tilie-core";
import {
  type GroupFrame,
  type MemberDrawing,
  memberDrawings,
} from "@timetoalign/tilie-core/drawing";
import { compareReal, type Real, realOf } from "@timetoalign/tilie-core/numbers";
import type { Run } from "./boxes.ts";
import { nameOf } from "./names.ts";
import { coordinateText, coordinateValue } from "./numbers.ts";
import {
  type CardAxis,
  type DrawnChunk,
  type DrawnFlow,
  type Entry,
  type Scope,
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
 * The member drawing of the virtual timeline `virtual`: a root of its ID,
 * unit, number type and length, locked and holding nothing, named with its
 * card's name; one object per manifest and ID, so every pass reads the same.
 */
function virtualMember(manifest: Manifest, virtual: VirtualTimeline): MemberDrawing {
  let known = drawnVirtual.get(manifest);
  if (known === undefined) {
    known = new Map();
    drawnVirtual.set(manifest, known);
  }
  const found = known.get(virtual.id);
  if (found !== undefined) return found;
  const timeline: TimelineManifest = {
    id: virtual.id,
    name: cardName(manifest, virtual),
    unit: virtual.unit,
    number_type: virtual.number_type,
    length: virtual.length,
    locked: true,
    is_segment_line: false,
    meta: {},
    children: [],
    conversion_maps: [],
    regions: [],
    flow_control: [],
  };
  const member: MemberDrawing = { timeline, ancestors: [] };
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
 * timelines, in canonical order.
 */
export function drawnRoots(manifest: Manifest, places: Places): DrawnRoots {
  const core = memberDrawings(manifest);
  const virtual = manifest.virtual_timelines ?? [];
  if (virtual.length === 0) return { frames: core.frames, ungrouped: core.ungrouped, placed: [] };
  const byId = new Map(virtual.map((item) => [item.id, item]));
  const frames = core.frames.map(({ group, members }): GroupFrame => {
    if (!group.members.some((id) => byId.has(id))) return { group, members };
    const real = new Map(members.map((member) => [member.timeline.id, member]));
    return {
      group,
      members: displayOrder(manifest, group.id).flatMap((id) => {
        const member = real.get(id);
        if (member !== undefined) return [member];
        const item = byId.get(id);
        return item === undefined ? [] : [virtualMember(manifest, item)];
      }),
    };
  });
  const grouped = new Set(manifest.groups.flatMap((group) => group.members));
  const placed = [...virtual]
    .filter((item) => !grouped.has(item.id) && placeAt(places, { item: item.id }) !== undefined)
    .sort((left, right) => compareCodePoints(left.id, right.id))
    .map((item) => virtualMember(manifest, item));
  return { frames, ungrouped: core.ungrouped, placed };
}

/**
 * The chunks the line of the virtual timeline drawn by `member` draws
 * (section 8.10), its runs drawn once where `once` (a card that is an item of
 * the block): null where `member` draws no virtual timeline or it does not
 * resolve, its `map` no FlowMap that resolves, its `timeline` not that
 * FlowMap's or a `through` stated.
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
  return flowOf(manifest, flowMap.id, virtual.id, once);
}

/**
 * The chunks of the FlowMap `flowMapId` of `manifest` as a line whose chunk
 * addresses carry `timeline` draws them (section 8.10), its runs drawn once
 * where `once`; null where the FlowMap does not resolve. Every entry lies at
 * its span: a gap's label is the pretty text of its length on its root's
 * axis, every other entry's the name of its source (a region's `name`, else
 * its whole ID; a timeline's or virtual timeline's name), a run drawn once
 * labelled by its first entry's text, a space, `×` (U+00D7), a space and its
 * count. A run is a longest sequence of two or more consecutive entries
 * naming one ID; gaps form none.
 */
export function flowOf(
  manifest: Manifest,
  flowMapId: string,
  timeline: string,
  once: boolean,
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
  // The length of each run, at its first entry; 0 at every later entry of a run.
  const { chunks } = resolved;
  const counts = chunks.map(() => 1);
  for (let index = 0; index < chunks.length; ) {
    const source = chunks[index]?.source ?? null;
    let end = index + 1;
    while (source !== null && end < chunks.length && chunks[end]?.source === source) end += 1;
    counts[index] = end - index;
    for (let later = index + 1; later < end; later += 1) counts[later] = 0;
    index = end;
  }
  const drawn: DrawnChunk[] = [];
  const runGaps: (readonly [Real, Real])[] = [];
  chunks.forEach((chunk, index) => {
    const start = realOf(chunk.played.start);
    const end = realOf(chunk.played.end);
    const count = counts[index] ?? 1;
    const later = count === 0 && once;
    const own = textOf(index, chunk.source);
    if (once && count >= 2) {
      const last = chunks[index + count - 1];
      if (last === undefined) throw new Error("a run ends at an entry of its FlowMap");
      runGaps.push([end, realOf(last.played.end)]);
    }
    drawn.push({
      index,
      gap: chunk.source === null,
      start,
      end,
      text: once && count >= 2 ? `${own} × ${count}` : own,
      drawn: !later,
      boundary: index >= 1 && !later,
    });
  });
  return { timeline, chunks: drawn, runGaps };
}

/**
 * `scope` on the axis of its runs drawn once (section 8.10, Runs), where its
 * flow has run gaps: each a gap of section 3.2 over `[a, b]` whose drawn
 * width is 0, its natural width `L × ub − L × ua` all its shrink. A position
 * `t` before the first run gap lies at `L × u`; one at or after the end `b`
 * of a run gap, and before the next one's start, at `x(a) + (L × u − L ×
 * ub)`, `x(a)` that gap's start's, the two products formed first, so that `t
 * = b` lies exactly at `x(a)`; a position inside one is not drawn. A run gap
 * has no address, draws nothing and cuts no row; every first fit of the card
 * measures the drawn x, `D` at a position being `L × u` less it. `scope`
 * itself where it has none.
 */
export function withRuns(scope: Scope): Scope {
  const gaps = scope.flow?.runGaps ?? [];
  if (gaps.length === 0) return scope;
  const { L, u } = scope;
  // Each run gap with its edge `x(a)` less `x0`, found from the left.
  const placed: { a: Real; b: Real; ua: number; ub: number; left: number }[] = [];
  const after = (value: Real, count: number): number => {
    let last: (typeof placed)[number] | undefined;
    for (const gap of placed.slice(0, count)) if (compareReal(gap.b, value) <= 0) last = gap;
    return last === undefined ? L * u(value) : last.left + (L * u(value) - L * last.ub);
  };
  for (const [a, b] of gaps) {
    const [ua, ub] = [u(a), u(b)];
    placed.push({ a, b, ua, ub, left: after(a, placed.length) });
  }
  const relative = (value: Real): number => after(value, placed.length);
  const last = placed.at(-1);
  const end = last === undefined ? L : last.left + (L - L * last.ub);
  // Each run as an application reads it: `x0 + (L × u − D)`, `D` what puts its start at its x.
  const runs: Run[] = [];
  let from = 0;
  let D = 0;
  for (const gap of placed) {
    runs.push({ u0: from, u1: gap.ua, L, D });
    D = L * gap.ub - gap.left;
    from = gap.ub;
  }
  runs.push({ u0: from, u1: 1, L, D });
  const axis: CardAxis = {
    gaps: [],
    seams: [],
    runs,
    total: L - end,
    endAt: () => end,
    relative,
    relativeAt: relative,
    startAt: relative,
    gapOf: () => undefined,
    runGapOf: (value) => {
      const gap = placed.find(({ a, b }) => compareReal(a, value) < 0 && compareReal(value, b) < 0);
      return gap === undefined ? undefined : gap.left;
    },
    shrinkBefore: (value) => L * u(value) - relative(value),
    crosses: () => false,
  };
  return {
    ...withAxis(scope, axis),
    relativeX: relative,
    relativeEnd: (entry) => (entry.rootEnd ? end : relative(entry.end)),
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
  return piecesOf(scope).flatMap((piece) =>
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
  return piecesOf(scope).flatMap((piece) =>
    bounded.flatMap((chunk) => {
      const at = scope.at(piece, chunk.start);
      return at === undefined ? [] : [{ chunk, at }];
    }),
  );
}

/** The pieces of the root of `scope`, in their order. */
function piecesOf(scope: Scope): Entry[] {
  return (scope.index.sourcesByLine.get(scope.rootEntry) ?? []).filter(
    (entry) => entry.piece !== null,
  );
}
