/**
 * The ribbons of a virtual card's chunk (TimeToShare's `docs/drawing.md`,
 * section 8.10, Overlays): an overlay of the editor, never part of the
 * drawing or its exports. Hovering or selecting a chunk of a virtual
 * timeline draws one translucent ribbon from every drawn span of that chunk
 * to every stretch it plays on every line of its source timeline drawn in
 * the block (the source's own card, its ancestor cards, its member cards),
 * and lights the spans of the other chunks of the same source on every
 * virtual card drawn. Everything is read from the drawing: a chunk's drawn
 * span from its line, its boundary and the next chunk's (`drawnChunks`), a
 * written stretch's ends from where the drawn line places them. A chunk is
 * hovered on its stretch of the virtual line, its label and the space
 * between, and on its written stretch of a source line, where every chunk
 * playing it is hovered at once (`chunkZones`, `chunksAt`).
 */

import type { ElementAddress, Manifest, PlaceKey, PlayedStretch } from "@timetoalign/tilie-core";
import {
  addressKey,
  FlowMapError,
  placeKeyText,
  resolveVirtualTimeline,
} from "@timetoalign/tilie-core";
import type { Real } from "@timetoalign/tilie-core/numbers";
import { addReal, compareReal, realOf, toFloat, toRational } from "@timetoalign/tilie-core/numbers";
import type { Drawing, LineAxis, LineElement } from "@timetoalign/tilie-layout";
import { abscissaOf, lineAxes } from "@timetoalign/tilie-layout";

/** A chunk of a virtual timeline: the virtual timeline's ID and the chunk's index in its FlowMap. */
export interface ChunkRef {
  readonly timeline: string;
  readonly index: number;
}

/** One end of a ribbon: from `x1` to `x2` on the line at the ordinate `y`, in block-local canvas units. */
export interface RibbonEnd {
  readonly x1: number;
  readonly x2: number;
  readonly y: number;
}

/**
 * One ribbon: from a stretch of a chunk's segment on its virtual card's line
 * (`from`) to that stretch as written on a line of the source (`to`), and its
 * path, the two ends joined by cubic curves leaving each line upright.
 */
export interface Ribbon {
  /** Unique within a block: the chunk, the card, the stretch and the source line. */
  readonly key: string;
  readonly from: RibbonEnd;
  readonly to: RibbonEnd;
  readonly d: string;
}

/** What a hovered or selected chunk shows: its ribbons, and the other chunks of its source it lights. */
export interface ChunkLights {
  readonly ribbons: readonly Ribbon[];
  /** The addresses of the chunks lit (`{id: W, part: [j]}`), each drawn once at least. */
  readonly lit: readonly ElementAddress[];
}

/** A drawn span of a lit chunk as a block node draws it: a line over the span, without an address. */
export interface LitChunk {
  /** Unique within a block: the chunk's address key and its card's place key. */
  readonly key: string;
  readonly tag: string;
  readonly attributes: Readonly<Record<string, string>>;
}

/** Every drawn span (`drawnChunks`) of the chunks `lit`, a line over it, in drawing order. */
export function litSpans(drawing: Drawing, lit: readonly ElementAddress[]): readonly LitChunk[] {
  if (lit.length === 0) return [];
  const keys = new Set(lit.map(addressKey));
  return drawnChunks(drawing).flatMap((chunk) => {
    const own = addressKey(chunkAddress({ timeline: chunk.timeline, index: chunk.index }));
    if (!keys.has(own)) return [];
    const y = String(chunk.y);
    return [
      {
        key: `${own}#${placeKeyText(chunk.card)}`,
        tag: "line",
        attributes: { x1: String(chunk.x1), y1: y, x2: String(chunk.x2), y2: y },
      },
    ];
  });
}

/**
 * Every chunk's lights together: the ribbons of each in turn, each key
 * prefixed by its chunk's address key, and the chunks they light, each once,
 * none of them one of `chunks`.
 */
export function allLights(
  manifest: Manifest,
  drawing: Drawing,
  chunks: readonly ChunkRef[],
): ChunkLights {
  if (chunks.length === 0) return NO_LIGHTS;
  const own = new Set(chunks.map((chunk) => addressKey(chunkAddress(chunk))));
  const ribbons: Ribbon[] = [];
  const lit = new Map<string, ElementAddress>();
  for (const chunk of chunks) {
    const lights = chunkLights(manifest, drawing, chunk);
    const prefix = addressKey(chunkAddress(chunk));
    ribbons.push(
      ...lights.ribbons.map((ribbon) => ({ ...ribbon, key: `${prefix}#${ribbon.key}` })),
    );
    for (const address of lights.lit) {
      const key = addressKey(address);
      if (!own.has(key)) lit.set(key, address);
    }
  }
  return { ribbons, lit: [...lit.values()] };
}

/** Nothing shown: no chunk hovered or selected. */
export const NO_LIGHTS: ChunkLights = { ribbons: [], lit: [] };

/**
 * Where the pointer shows the chunk `chunk`: on the line at the ordinate
 * `line`, from `x1` (held) to `x2` (left out), and from `top` to `bottom`:
 * on a virtual card the line and the chunk's label above it, on a source's
 * line that line and its regions band, the line's ordinate alone where
 * neither is drawn.
 */
export interface ChunkZone {
  readonly chunk: ChunkRef;
  readonly x1: number;
  readonly x2: number;
  readonly line: number;
  readonly top: number;
  readonly bottom: number;
}

/**
 * Where the pointer shows a chunk in `drawing`, the drawing of `manifest`,
 * in drawing order of the chunks: for every drawn span of a chunk that is no
 * gap (`drawnChunks`), of a virtual timeline resolving through a FlowMap of
 * its own root, a zone on its card's line of that virtual timeline over the
 * span, up to its label; and, once per chunk, a zone on every line of the
 * source root drawn in a card that is not switched, over the written
 * stretches it plays clipped to what that line draws, out to the root's
 * regions band on that line. Read once per drawing; a pointer reads them
 * with `chunksAt`.
 */
export function chunkZones(manifest: Manifest, drawing: Drawing): readonly ChunkZone[] {
  const virtuals = new Set((manifest.virtual_timelines ?? []).map((item) => item.id));
  if (virtuals.size === 0) return [];
  const lines = [...lineAxes(drawing)];
  const bands = drawing.boxes.flatMap((box) =>
    box.kind === "band" && box.band?.facet === "regions"
      ? [
          {
            timeline: box.band.timeline,
            line: box.band.line,
            top: box.y,
            bottom: box.y + box.height,
          },
        ]
      : [],
  );
  const zoneOn = (
    chunk: ChunkRef,
    timeline: string,
    axis: LineAxis,
    x1: number,
    x2: number,
  ): ChunkZone => {
    const band = bands.find((one) => one.timeline === timeline && one.line === axis.y);
    return {
      chunk,
      x1,
      x2,
      line: axis.y,
      top: Math.min(axis.y, band?.top ?? axis.y),
      bottom: Math.max(axis.y, band?.bottom ?? axis.y),
    };
  };
  const resolved = new Map<string, ReturnType<typeof stretchesOf>>();
  const sourceLines = new Map<string, readonly LineAxis[]>();
  const placed = new Set<string>();
  const zones: ChunkZone[] = [];
  for (const span of drawnChunks(drawing)) {
    const { timeline: id, index: at } = span;
    if (!virtuals.has(id)) continue;
    if (!resolved.has(id)) resolved.set(id, stretchesOf(manifest, id));
    const flow = resolved.get(id);
    const source = flow?.sources[at];
    if (flow === null || flow === undefined || source === null || source === undefined) continue;
    const chunk: ChunkRef = { timeline: id, index: at };
    zones.push({ chunk, x1: span.x1, x2: span.x2, line: span.y, top: span.top, bottom: span.y });
    const key = `${id}#${at}`;
    if (placed.has(key)) continue;
    placed.add(key);
    let axes = sourceLines.get(flow.source);
    if (axes === undefined) {
      const switched = new Set(switchedCards(drawing, flow.source));
      axes = lines
        .map(([, axis]) => axis)
        .filter((axis) => axis.timeline === flow.source && !switched.has(placeKeyText(axis.card)));
      sourceLines.set(flow.source, axes);
    }
    for (const stretch of flow.flow) {
      if (stretch.chunk !== at || stretch.written === null) continue;
      const start = realOf(stretch.written.start);
      const end = realOf(stretch.written.end);
      for (const axis of axes) {
        const ends = clippedOn(axis, start, end);
        if (ends !== null) zones.push(zoneOn(chunk, flow.source, axis, ends[0], ends[1]));
      }
    }
  }
  return zones;
}

/**
 * One drawn span of a chunk of a line (section 8.10, Chunks): the line's
 * timeline (a virtual timeline, or a switched card's timeline), the chunk's
 * index, the card drawing it, its span on the line from `x1` to `x2` at the
 * line's ordinate `y`, the top of what it draws above the line (its label
 * and leader, else the line), and the indices of its elements in the
 * drawing: its label, its leader and its boundary.
 */
export interface DrawnChunk {
  readonly timeline: string;
  readonly index: number;
  readonly card: PlaceKey;
  readonly x1: number;
  readonly x2: number;
  readonly y: number;
  readonly top: number;
  readonly elements: readonly number[];
}

/**
 * The chunks `drawing` draws, card by card and line by line in drawing
 * order, each chunk once on each line, in the order of its index. A chunk
 * draws nothing of its own (section 8.10): its span runs on its line from
 * its boundary, the line's start for the first chunk drawn, to the next
 * drawn chunk's boundary, the line's end for the last; the chunks drawn are
 * those whose label or boundary the card draws (`{id, part: [k, …]}`, no
 * facet). The line is the card's `timeline` element of that ID, from the
 * smallest start of its pieces to the largest end.
 */
export function drawnChunks(drawing: Drawing): readonly DrawnChunk[] {
  type Line = { card: PlaceKey; timeline: string; line?: LineElement; parts: number[] };
  const byLine = new Map<string, Line>();
  drawing.elements.forEach((element, index) => {
    const { id, facet, part } = element.address;
    const chunkPart = facet === undefined && typeof part?.[0] === "number";
    const ownLine = element.type === "timeline" && part === undefined && facet === undefined;
    if (id === undefined || (!chunkPart && !ownLine)) return;
    const card = cardHolding(drawing, index);
    if (card === null) return;
    const key = `${placeKeyText(card)} ${id}`;
    const entry = byLine.get(key) ?? { card, timeline: id, parts: [] };
    if (chunkPart) entry.parts.push(index);
    else if (element.type === "timeline") {
      const known = entry.line;
      entry.line =
        known === undefined
          ? element
          : { ...known, xs: Math.min(known.xs, element.xs), xe: Math.max(known.xe, element.xe) };
    }
    byLine.set(key, entry);
  });
  return [...byLine.values()].flatMap(({ card, timeline, line, parts }) => {
    if (line === undefined || parts.length === 0) return [];
    const byIndex = new Map<number, { start?: number; top: number; elements: number[] }>();
    for (const index of parts) {
      const element = drawing.elements[index];
      const k = element?.address.part?.[0];
      if (element === undefined || typeof k !== "number") continue;
      const own = byIndex.get(k) ?? { top: line.y, elements: [] };
      own.elements.push(index);
      if (element.type === "boundary") own.start = element.x;
      if (element.type === "label") {
        own.top = Math.min(own.top, element.baseline - element.style["font-size"]);
      }
      if (element.type === "leader") own.top = Math.min(own.top, element.y1, element.y2);
      byIndex.set(k, own);
    }
    const indices = [...byIndex.keys()].sort((left, right) => left - right);
    return indices.flatMap((k, at): DrawnChunk[] => {
      const own = byIndex.get(k);
      if (own === undefined) return [];
      const next = indices[at + 1];
      const x1 = at === 0 ? line.xs : (own.start ?? line.xs);
      const x2 = next === undefined ? line.xe : (byIndex.get(next)?.start ?? line.xe);
      return [
        { timeline, index: k, card, x1, x2, y: line.y, top: own.top, elements: own.elements },
      ];
    });
  });
}

/**
 * The chunks the pointer at `point` (in the drawing's units) shows: the
 * chunk of every zone of `zones` whose span holds its abscissa and that
 * holds its ordinate, the zone's line widened by `reach` either way, each
 * chunk once, in the zones' order.
 */
export function chunksAt(
  zones: readonly ChunkZone[],
  point: { readonly x: number; readonly y: number },
  reach: number,
): readonly ChunkRef[] {
  const found: ChunkRef[] = [];
  for (const zone of zones) {
    if (point.x < zone.x1 || point.x >= zone.x2) continue;
    const top = Math.min(zone.top, zone.line - reach);
    const bottom = Math.max(zone.bottom, zone.line + reach);
    if (point.y < top || point.y > bottom) continue;
    const { chunk } = zone;
    if (!found.some((one) => one.timeline === chunk.timeline && one.index === chunk.index)) {
      found.push(chunk);
    }
  }
  return found;
}

/**
 * The chunk `address` names of a virtual timeline `V`: `{id: V, part: [k, …]}`,
 * the chunk or a part of it, or `{id: V, facet, part: [k]}`, a band of its
 * window; else `null`.
 */
export function chunkOf(manifest: Manifest, address: ElementAddress): ChunkRef | null {
  const { id, part } = address;
  const index = part?.[0];
  if (id === undefined || typeof index !== "number") return null;
  const virtual = (manifest.virtual_timelines ?? []).some((item) => item.id === id);
  return virtual ? { timeline: id, index } : null;
}

/** The address of a chunk, `{id: V, part: [k]}`. */
export function chunkAddress(chunk: ChunkRef): ElementAddress {
  return { id: chunk.timeline, part: [chunk.index] };
}

/** The stretches of a resolved FlowMap, keyed by the virtual timeline applying it; `null` where it does not resolve. */
function stretchesOf(
  manifest: Manifest,
  virtual: string,
): {
  readonly source: string;
  readonly flow: readonly PlayedStretch[];
  readonly sources: readonly (string | null)[];
} | null {
  try {
    const resolved = resolveVirtualTimeline(manifest, virtual);
    if (resolved.kind !== "flow_map" || resolved.through !== null) return null;
    const { flow } = resolved;
    return {
      source: flow.timeline,
      flow: flow.stretches,
      sources: flow.chunks.map((chunk) => chunk.source),
    };
  } catch (error) {
    if (error instanceof FlowMapError) return null;
    throw error;
  }
}

/** The card drawing the element at `index`: the innermost card box whose range holds it. */
export function cardHolding(drawing: Drawing, index: number): PlaceKey | null {
  let found: { key: PlaceKey; size: number } | null = null;
  for (const box of drawing.boxes) {
    if (box.kind !== "card" || box.key === null) continue;
    const { start, end } = box.range;
    if (start <= index && index < end && (found === null || end - start < found.size)) {
      found = { key: box.key, size: end - start };
    }
  }
  return found?.key ?? null;
}

/** The lines of `timeline` in `drawing`, each with its key. */
function linesOf(drawing: Drawing, timeline: string): [string, LineAxis][] {
  return [...lineAxes(drawing)].filter(([, axis]) => axis.timeline === timeline);
}

/**
 * The cards drawing the line of `timeline` on a virtual axis (a switched card,
 * section 8.10): those drawing a chunk of a line addressed with its ID. Its
 * line there places played positions, so no written stretch is read off it.
 */
function switchedCards(drawing: Drawing, timeline: string): readonly string[] {
  const keys = new Set<string>();
  for (const chunk of drawnChunks(drawing)) {
    if (chunk.timeline === timeline) keys.add(placeKeyText(chunk.card));
  }
  return [...keys];
}

/**
 * The abscissas of `[start, end]` on the line `axis`, clipped to what it draws
 * (from its `start` over its length, or its drawn length where the end is not
 * known); `null` where nothing of it is drawn there.
 */
export function clippedOn(
  axis: LineAxis,
  start: Real,
  end: Real,
): readonly [number, number] | null {
  const last = addReal(axis.start, axis.length ?? axis.drawnLength);
  const low = compareReal(start, axis.start) < 0 ? axis.start : start;
  const high = compareReal(end, last) > 0 ? last : end;
  if (compareReal(low, high) >= 0) return null;
  return [abscissaOf(axis, low), abscissaOf(axis, high)];
}

/** The share of `value` across `[start, end]`, each read as a double. */
function shareOf(value: Real, start: Real, end: Real): number {
  const length = toFloat(toRational(end)) - toFloat(toRational(start));
  return length === 0 ? 0 : (toFloat(toRational(value)) - toFloat(toRational(start))) / length;
}

/**
 * The path of a ribbon from `from` to `to`: along `from`'s line from `x1` to
 * `x2`, a cubic curve to `to`'s `x2`, along its line back to its `x1`, and a
 * cubic curve home, each curve's control points at the ordinate halfway
 * between the two lines, straight above or below its ends.
 */
export function ribbonPath(from: RibbonEnd, to: RibbonEnd): string {
  const middle = (from.y + to.y) / 2;
  return [
    `M ${from.x1} ${from.y}`,
    `L ${from.x2} ${from.y}`,
    `C ${from.x2} ${middle} ${to.x2} ${middle} ${to.x2} ${to.y}`,
    `L ${to.x1} ${to.y}`,
    `C ${to.x1} ${middle} ${from.x1} ${middle} ${from.x1} ${from.y}`,
    "Z",
  ].join(" ");
}

/**
 * The ribbons of `chunk` in `drawing`, the drawing of `manifest`, and the
 * chunks it lights; nothing where its virtual timeline does not resolve
 * through a FlowMap of its own root (`resolveVirtualTimeline`), or where the
 * chunk is a gap.
 *
 * For every drawn span of the chunk (`drawnChunks`, one per card drawing its
 * virtual timeline: a run drawn once draws only its first entry, section
 * 8.10) and every stretch the chunk plays (one, or a virtual timeline's
 * several), the ribbon leaves the card's line of the virtual timeline over
 * the stretch's share of the span, `x1 + share × (x2 − x1)` at the played
 * start and end, the chunk's span from its first stretch's played start to
 * its last's played end; and reaches every line of the source root drawn in
 * a card that is not switched, over the written stretch clipped to what
 * that line draws (`abscissaOf`). Ribbons come in the order of the spans,
 * then the stretches, then the source's lines.
 *
 * It lights every other chunk, of any virtual timeline drawn, that names the
 * same source.
 */
export function chunkLights(manifest: Manifest, drawing: Drawing, chunk: ChunkRef): ChunkLights {
  const resolved = stretchesOf(manifest, chunk.timeline);
  const source = resolved?.sources[chunk.index];
  if (resolved === null || source === null || source === undefined) return NO_LIGHTS;
  const played = resolved.flow.filter((stretch) => stretch.chunk === chunk.index);
  const [first] = played;
  const last = played.at(-1);
  if (first === undefined || last === undefined) return NO_LIGHTS;
  const spanStart = realOf(first.played.start);
  const spanEnd = realOf(last.played.end);
  const switched = new Set(switchedCards(drawing, resolved.source));
  const sourceLines = linesOf(drawing, resolved.source).filter(
    ([, axis]) => !switched.has(placeKeyText(axis.card)),
  );
  const ribbons: Ribbon[] = [];
  for (const span of drawnChunks(drawing)) {
    if (span.timeline !== chunk.timeline || span.index !== chunk.index) continue;
    const { card, y } = span;
    played.forEach((stretch, at) => {
      if (stretch.written === null) return;
      const width = span.x2 - span.x1;
      const from: RibbonEnd = {
        x1: span.x1 + shareOf(realOf(stretch.played.start), spanStart, spanEnd) * width,
        x2: span.x1 + shareOf(realOf(stretch.played.end), spanStart, spanEnd) * width,
        y,
      };
      const written = { start: realOf(stretch.written.start), end: realOf(stretch.written.end) };
      for (const [key, axis] of sourceLines) {
        const ends = clippedOn(axis, written.start, written.end);
        if (ends === null) continue;
        const to: RibbonEnd = { x1: ends[0], x2: ends[1], y: axis.y };
        ribbons.push({
          key: `${placeKeyText(card)}#${at}#${key}`,
          from,
          to,
          d: ribbonPath(from, to),
        });
      }
    });
  }
  return { ribbons, lit: litChunks(manifest, drawing, chunk, source) };
}

/** The chunks drawn but `chunk` naming `source`, by their labels, each address once, in drawing order. */
function litChunks(
  manifest: Manifest,
  drawing: Drawing,
  chunk: ChunkRef,
  source: string,
): ElementAddress[] {
  const sources = new Map<string, readonly (string | null)[] | null>();
  const lit = new Map<string, ElementAddress>();
  for (const element of drawing.elements) {
    if (element.type !== "label") continue;
    const other = chunkOf(manifest, element.address);
    if (other === null || (other.timeline === chunk.timeline && other.index === chunk.index)) {
      continue;
    }
    if (!sources.has(other.timeline)) {
      sources.set(other.timeline, stretchesOf(manifest, other.timeline)?.sources ?? null);
    }
    if (sources.get(other.timeline)?.[other.index] !== source) continue;
    const address = chunkAddress(other);
    lit.set(addressKey(address), address);
  }
  return [...lit.values()];
}
