/**
 * The ribbons of a virtual card's chunk (TimeToShare's `docs/drawing.md`,
 * section 8.10, Overlays): an overlay of the editor, never part of the
 * drawing or its exports. Hovering or selecting a chunk of a virtual
 * timeline draws one translucent ribbon from every drawn brace of that
 * chunk to every stretch it plays on every line of its source timeline
 * drawn in the block (the source's own card, its ancestor cards, its member
 * cards), and lights the other chunks of the same source on every virtual
 * card drawn. Everything is read from the drawing: a brace's ends are its
 * element's, a written stretch's ends are where the drawn line places them.
 * A chunk is hovered on its stretch of the virtual line, its brace and the
 * space between, and on its written stretch of a source line, where every
 * chunk playing it is hovered at once (`chunkZones`, `chunksAt`).
 */

import type { ElementAddress, Manifest, PlaceKey, PlayedStretch } from "@timetoalign/tilie-core";
import {
  addressKey,
  FlowMapError,
  placeKeyText,
  resolveVirtualTimeline,
  samePlaceKey,
} from "@timetoalign/tilie-core";
import type { Real } from "@timetoalign/tilie-core/numbers";
import { addReal, compareReal, realOf, toFloat, toRational } from "@timetoalign/tilie-core/numbers";
import type { Drawing, LineAxis, RegionElement } from "@timetoalign/tilie-layout";
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
 * One ribbon: from a stretch of a chunk's brace on its virtual card's line
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
  /** The addresses of the braces lit (`{id: W, facet: "regions", part: [j]}`), each drawn once at least. */
  readonly lit: readonly ElementAddress[];
}

/** A lit brace as a block node draws it: a copy of its descriptor's shape, its address left out. */
export interface LitBrace {
  /** Its descriptor's key in the node. */
  readonly key: string;
  readonly tag: string;
  readonly attributes: Readonly<Record<string, string>>;
}

/**
 * Every chunk's lights together: the ribbons of each in turn, each key
 * prefixed by its chunk's address key, and the braces they light, each once,
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
 * `line`, from `x1` (held) to `x2` (left out), and from `top` to `bottom`,
 * the line and the regions band drawn on it, the line's ordinate alone
 * where none is.
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
 * in drawing order of the braces: for every drawn brace of a chunk that is
 * no gap, of a virtual timeline resolving through a FlowMap of its own root,
 * a zone on its card's line of that virtual timeline over the brace's ends,
 * out to that line's regions band; and, once per chunk, a zone on every line
 * of the source root drawn in a card that is not switched, over the written
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
  drawing.elements.forEach((element, index) => {
    if (element.type !== "region") return;
    const { id, facet, part } = element.address;
    const at = part?.[0];
    if (id === undefined || !virtuals.has(id) || facet !== "regions") return;
    if (part?.length !== 1 || typeof at !== "number") return;
    if (!resolved.has(id)) resolved.set(id, stretchesOf(manifest, id));
    const flow = resolved.get(id);
    const source = flow?.sources[at];
    if (flow === null || flow === undefined || source === null || source === undefined) return;
    const chunk: ChunkRef = { timeline: id, index: at };
    const card = cardHolding(drawing, index);
    const line = lines.find(
      ([, axis]) => axis.timeline === id && card !== null && samePlaceKey(axis.card, card),
    );
    if (line !== undefined) zones.push(zoneOn(chunk, id, line[1], element.x1, element.x2));
    const key = `${id}#${at}`;
    if (placed.has(key)) return;
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
  });
  return zones;
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

/** The chunk `address` names: `{id: V, facet: "regions", part: [k, ...]}` of a virtual timeline `V`; else `null`. */
export function chunkOf(manifest: Manifest, address: ElementAddress): ChunkRef | null {
  const { id, facet, part } = address;
  const index = part?.[0];
  if (id === undefined || facet !== "regions" || typeof index !== "number") return null;
  const virtual = (manifest.virtual_timelines ?? []).some((item) => item.id === id);
  return virtual ? { timeline: id, index } : null;
}

/** The address of a chunk's brace. */
export function chunkAddress(chunk: ChunkRef): ElementAddress {
  return { id: chunk.timeline, facet: "regions", part: [chunk.index] };
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

/** Whether a drawn element is the brace of the chunk `chunk`. */
function isBraceOf(
  element: { readonly type: string; readonly address: ElementAddress },
  chunk: ChunkRef,
): boolean {
  const { id, facet, part } = element.address;
  return (
    element.type === "region" &&
    id === chunk.timeline &&
    facet === "regions" &&
    part?.length === 1 &&
    part[0] === chunk.index
  );
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
 * section 8.10): those holding a chunk brace addressed with its ID. Its line
 * there places played positions, so no written stretch is read off it.
 */
function switchedCards(drawing: Drawing, timeline: string): readonly string[] {
  const keys = new Set<string>();
  drawing.elements.forEach((element, index) => {
    const { id, facet, part } = element.address;
    if (element.type !== "region" || id !== timeline || facet !== "regions") return;
    if (typeof part?.[0] !== "number") return;
    const card = cardHolding(drawing, index);
    if (card !== null) keys.add(placeKeyText(card));
  });
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
 * For every brace of the chunk drawn (one per card drawing its virtual
 * timeline: a run drawn once draws only its first entry's, section 8.10)
 * and every stretch the chunk plays (one, or a virtual timeline's several),
 * the ribbon leaves the card's line of the virtual timeline over the
 * stretch's share of the brace, `x1 + share × (x2 − x1)` at the played
 * start and end, the chunk's span from its first stretch's played start to
 * its last's played end; and reaches every line of the source root drawn in
 * a card that is not switched, over the written stretch clipped to what
 * that line draws (`abscissaOf`). Ribbons come in the order of the braces,
 * then the stretches, then the source's lines.
 *
 * It lights the brace of every other chunk, of any virtual timeline drawn,
 * that names the same source.
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
  const virtualLines = linesOf(drawing, chunk.timeline);
  const ribbons: Ribbon[] = [];
  drawing.elements.forEach((element, index) => {
    if (!isBraceOf(element, chunk)) return;
    const brace = element as RegionElement;
    const card = cardHolding(drawing, index);
    const line = virtualLines.find(([, axis]) => card !== null && samePlaceKey(axis.card, card));
    if (card === null || line === undefined) return;
    const y = line[1].y;
    played.forEach((stretch, at) => {
      if (stretch.written === null) return;
      const width = brace.x2 - brace.x1;
      const from: RibbonEnd = {
        x1: brace.x1 + shareOf(realOf(stretch.played.start), spanStart, spanEnd) * width,
        x2: brace.x1 + shareOf(realOf(stretch.played.end), spanStart, spanEnd) * width,
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
  });
  return { ribbons, lit: litChunks(manifest, drawing, chunk, source) };
}

/** The braces drawn of every chunk but `chunk` naming `source`, each address once, in drawing order. */
function litChunks(
  manifest: Manifest,
  drawing: Drawing,
  chunk: ChunkRef,
  source: string,
): ElementAddress[] {
  const sources = new Map<string, readonly (string | null)[] | null>();
  const lit = new Map<string, ElementAddress>();
  for (const element of drawing.elements) {
    if (element.type !== "region") continue;
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
