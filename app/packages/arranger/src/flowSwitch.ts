/**
 * The flow switch (TimeToShare's `docs/drawing.md`, sections 2.4 and 8.10):
 * the list beside the resize modes of a selected card choosing how the card
 * draws its timeline, as written or on the virtual axis of one FlowMap of
 * its root, the property `flow` of the manifest's own layer on the card's
 * address. A frame offers no list: each of its cards chooses its own.
 *
 * And the switch's motion: where a card becomes switched, each of its
 * chunks moves from the stretch it plays as written on the card's line to
 * its place on the virtual axis.
 */

import type {
  BlockId,
  Coordinate,
  Manifest,
  PlayedStretch,
  StyleCommand,
} from "@timetoalign/tilie-core";
import {
  cardFlow,
  FlowMapError,
  placeKeyText,
  resolveFlowMap,
  resolveVirtualTimeline,
  samePlaceKey,
} from "@timetoalign/tilie-core";
import { switchOf } from "@timetoalign/tilie-core/drawing";
import { realOf } from "@timetoalign/tilie-core/numbers";
import type { Drawing, DrawnBox } from "@timetoalign/tilie-layout";
import { lineAxes } from "@timetoalign/tilie-layout";
import { isAncestorCard } from "./boxes.ts";
import { clippedOn, drawnChunks } from "./ribbons.ts";

/** One entry of the list: a FlowMap `flow` of the card's root, or "As written" (`null`). */
export interface FlowChoice {
  readonly flow: string | null;
  readonly label: string;
}

/**
 * The width of the switch's list, the same whatever the names it lists: a
 * name longer than it is cut with an ellipsis and shown whole on hover.
 */
export const SWITCH_WIDTH = "11rem";

/** The list's first entry. */
export const AS_WRITTEN: FlowChoice = { flow: null, label: "As written" };

/**
 * The FlowMaps a card of `timeline` may switch to (section 2.4, the
 * validators' `flow_rule`): where it is a root, each FlowMap of it once, in
 * the manifest's order, labelled by its `name`, else its ID; none for any
 * other timeline. A virtual timeline applying one of them is no entry of
 * its own: switching to it draws the card as its FlowMap does.
 */
function flowsOf(manifest: Manifest, timeline: string): FlowChoice[] {
  if (!manifest.timelines.some((root) => root.id === timeline)) return [];
  return (manifest.flow_maps ?? [])
    .filter((map) => map.timeline === timeline)
    .map((map) => ({ flow: map.id, label: map.name ?? map.id }));
}

/** The timeline whose cards `box` switches: a card's own; none for an ancestor card, a frame, the block and a band. */
function switchedBy(box: DrawnBox): string | null {
  const { id, part } = box.address;
  if (id === undefined || box.kind !== "card" || isAncestorCard(box)) return null;
  return part?.[0] === "card" ? id : null;
}

/**
 * The list of the switch beside the resize modes of `box`: "As written"
 * (`AS_WRITTEN`), then the FlowMaps of the card's root (`flowsOf`); `null`
 * where there is none to choose, so no switch is shown.
 */
export function flowChoices(manifest: Manifest, box: DrawnBox): FlowChoice[] | null {
  const timeline = switchedBy(box);
  const choices = timeline === null ? [] : flowsOf(manifest, timeline);
  return choices.length === 0 ? null : [AS_WRITTEN, ...choices];
}

/**
 * The entry the switch of `box` shows chosen: the FlowMap its card is
 * switched to (core's `switchOf`: its `flow` naming a FlowMap of the card's
 * root that resolves, or a virtual timeline applying one without
 * `through`); "As written" otherwise, as the card is then drawn.
 */
export function chosenFlow(manifest: Manifest, box: DrawnBox): FlowChoice {
  const timeline = switchedBy(box);
  const flowMap = timeline === null ? undefined : switchOf(manifest, timeline)?.flowMap;
  if (timeline === null || flowMap === undefined) return AS_WRITTEN;
  return flowsOf(manifest, timeline).find((choice) => choice.flow === flowMap) ?? AS_WRITTEN;
}

/**
 * The commands choosing `choice` on the switch of `box` of block `block`:
 * one `style` command setting `flow` on the cards of the card's timeline to
 * the chosen FlowMap's ID, removing it for "As written"; none where
 * `choice` is what the card shows already (`chosenFlow`; for "As written",
 * where the cards set no `flow`).
 */
export function flowCommands(
  block: BlockId,
  manifest: Manifest,
  box: DrawnBox,
  choice: FlowChoice,
): StyleCommand[] {
  const timeline = switchedBy(box);
  if (timeline === null) return [];
  const stays =
    choice.flow === null
      ? cardFlow(manifest, timeline) === null
      : chosenFlow(manifest, box).flow === choice.flow;
  if (stays) return [];
  return [
    {
      type: "style",
      select: { addresses: [{ id: timeline, part: ["card"] }] },
      set: { flow: choice.flow },
      blocks: [block],
    },
  ];
}

/** An abscissa span `[x1, x2]` in block-local canvas units. */
export interface Span {
  readonly x1: number;
  readonly x2: number;
}

/**
 * The motion of one chunk of a card that became switched: its elements
 * (indices of the drawing after), from the stretch it plays as written on
 * the card's line before (`from`) to its brace on the virtual axis (`to`).
 */
export interface ChunkMorph {
  readonly elements: readonly number[];
  readonly from: Span;
  readonly to: Span;
}

/** A chunk's written stretch: from its first stretch's written start to its last's written end. */
interface Written {
  readonly start: Coordinate;
  readonly end: Coordinate;
}

/** The written stretches, on its root's axis, of each chunk of the flow `flow`, by chunk index. */
function writtenOf(manifest: Manifest, flow: string): ReadonlyMap<number, Written> {
  const found = new Map<number, Written>();
  let stretches: readonly PlayedStretch[];
  try {
    const isMap = (manifest.flow_maps ?? []).some((item) => item.id === flow);
    if (isMap) stretches = resolveFlowMap(manifest, flow).stretches;
    else {
      const resolved = resolveVirtualTimeline(manifest, flow);
      if (resolved.kind !== "flow_map") return found;
      stretches = resolved.flow.stretches;
    }
  } catch (error) {
    if (error instanceof FlowMapError) return found;
    throw error;
  }
  for (const stretch of stretches) {
    if (stretch.written === null) continue;
    const known = found.get(stretch.chunk);
    found.set(stretch.chunk, {
      start: known?.start ?? stretch.written.start,
      end: stretch.written.end,
    });
  }
  return found;
}

/**
 * The chunks moving where a card became switched between the drawing
 * `before` and the drawing `after` of `manifest` (section 8.10): for every
 * card of `after` drawing chunks on a line of a timeline `T` of the manifest
 * (`drawnChunks`, a switched card's; a virtual card's carry a virtual
 * timeline's ID) whose card of the same place key in `before` drew none,
 * each chunk `k` with a written stretch drawn on `T`'s line in that card of
 * `before`: its elements in that card of `after` (its label, leader and
 * boundary), from that stretch's abscissas there (the first of `T`'s lines
 * drawing any of it, clipped to what it draws) to its drawn span.
 */
export function switchMorphs(manifest: Manifest, before: Drawing, after: Drawing): ChunkMorph[] {
  const virtual = new Set((manifest.virtual_timelines ?? []).map((item) => item.id));
  const switchedOf = (drawing: Drawing) =>
    drawnChunks(drawing).filter((chunk) => !virtual.has(chunk.timeline));
  const was = new Set(
    switchedOf(before).map((chunk) => `${placeKeyText(chunk.card)} ${chunk.timeline}`),
  );
  const lines = [...lineAxes(before).values()];
  const morphs: ChunkMorph[] = [];
  for (const chunk of switchedOf(after)) {
    const { card, timeline } = chunk;
    if (was.has(`${placeKeyText(card)} ${timeline}`)) continue;
    const flow = cardFlow(manifest, timeline);
    if (flow === null) continue;
    const stretch = writtenOf(manifest, flow).get(chunk.index);
    if (stretch === undefined) continue;
    const own = lines.filter((axis) => axis.timeline === timeline && samePlaceKey(axis.card, card));
    const from = own
      .map((axis) => clippedOn(axis, realOf(stretch.start), realOf(stretch.end)))
      .find((ends) => ends !== null);
    if (from === undefined || from === null) continue;
    morphs.push({
      elements: chunk.elements,
      from: { x1: from[0], x2: from[1] },
      to: { x1: chunk.x1, x2: chunk.x2 },
    });
  }
  return morphs;
}

/** A span at the progress `t` from `from` (0) to `to` (1), each end moving straight. */
export function spanAt(from: Span, to: Span, t: number): Span {
  return { x1: from.x1 + (to.x1 - from.x1) * t, x2: from.x2 + (to.x2 - from.x2) * t };
}

/**
 * The `transform` an element of a moving chunk takes at the progress `t`
 * (`null` at rest, `t ≥ 1`), drawn where the chunk lies at `to`: a text is
 * moved by its span's middle, `translate(m(t) − m(to) 0)`; anything else is
 * stretched along x onto the span at `t`, `matrix(s 0 0 1 x1(t) − x1(to) × s
 * 0)`, `s` the span's width at `t` over its width at `to` (1 where that is 0).
 */
export function morphTransform(morph: ChunkMorph, text: boolean, t: number): string | null {
  if (t >= 1) return null;
  const { to } = morph;
  const now = spanAt(morph.from, to, t);
  if (text) return `translate(${(now.x1 + now.x2) / 2 - (to.x1 + to.x2) / 2} 0)`;
  const width = to.x2 - to.x1;
  const s = width === 0 ? 1 : (now.x2 - now.x1) / width;
  return `matrix(${s} 0 0 1 ${now.x1 - to.x1 * s} 0)`;
}
