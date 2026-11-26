/**
 * The flow switch (TimeToShare's `docs/drawing.md`, sections 2.4 and 8.10):
 * the list above a selected card choosing how the card draws its timeline,
 * as written or on the virtual axis of one FlowMap of its root, the
 * property `flow` of the manifest's own layer on the card's address. In a
 * frame the choice switches the frame: the member whose FlowMap is chosen
 * is switched, every other member drawn through the group; a frame with
 * two switched members is drawn as written, so a choice there leaves one.
 *
 * And the switch's motion: where a card becomes switched, each of its
 * chunks moves from the stretch it plays as written on the card's line to
 * its place on the virtual axis.
 */

import type {
  BlockId,
  Coordinate,
  Manifest,
  PlaceKey,
  PlayedStretch,
  StyleCommand,
} from "@timetoalign/tilie-core";
import {
  cardFlow,
  displayOrder,
  FlowMapError,
  placeKeyText,
  resolveFlowMap,
  resolveVirtualTimeline,
  samePlaceKey,
} from "@timetoalign/tilie-core";
import { realOf } from "@timetoalign/tilie-core/numbers";
import type { Drawing, DrawnBox } from "@timetoalign/tilie-layout";
import { lineAxes } from "@timetoalign/tilie-layout";
import { isAncestorCard } from "./boxes.ts";
import { cardHolding, clippedOn } from "./ribbons.ts";

/** One entry of the list: a FlowMap or virtual timeline `flow` of the root `timeline`, or "As written" (both `null`). */
export interface FlowChoice {
  readonly timeline: string | null;
  readonly flow: string | null;
  readonly label: string;
}

/**
 * How far above a box, in screen pixels, the canvas's menus stand: Svelte
 * Flow's `NodeToolbar` default, which the mode menu keeps too.
 */
export const MENU_GAP = 10;

/** The gap, in screen pixels, between the flow switch and the mode menu below it. */
export const SWITCH_GAP = 4;

/**
 * How far above its box the flow switch stands: clear of the mode menu,
 * `menu` screen pixels high, where one is shown; `MENU_GAP` where none is.
 */
export function switchOffset(menu: number | null): number {
  return menu === null ? MENU_GAP : MENU_GAP + menu + SWITCH_GAP;
}

/**
 * The width of the switch's list, the same whatever the names it lists: a
 * name longer than it is cut with an ellipsis and shown whole on hover.
 */
export const SWITCH_WIDTH = "11rem";

/** The list's first entry. */
export const AS_WRITTEN: FlowChoice = { timeline: null, flow: null, label: "As written" };

/**
 * The FlowMaps and virtual timelines a card of `timeline` may switch to
 * (section 2.4, the validators' `flow_rule`): where it is a root, each
 * FlowMap of it, then each virtual timeline applying one of those to it
 * without `through`, in the manifest's order, labelled by its `name`, else
 * its ID; none for any other timeline.
 */
export function flowsOf(manifest: Manifest, timeline: string): FlowChoice[] {
  if (!manifest.timelines.some((root) => root.id === timeline)) return [];
  const maps = (manifest.flow_maps ?? []).filter((map) => map.timeline === timeline);
  const ids = new Set(maps.map((map) => map.id));
  const virtual = (manifest.virtual_timelines ?? []).filter(
    (item) => ids.has(item.map) && item.timeline === timeline && item.through === undefined,
  );
  return [...maps, ...virtual].map((item) => ({
    timeline,
    flow: item.id,
    label: item.name ?? item.id,
  }));
}

/**
 * The timelines whose cards `box` switches: a card's own timeline, a
 * frame's members in display order; none for an ancestor card, the block
 * and a band.
 */
function switchedBy(manifest: Manifest, box: DrawnBox): readonly string[] {
  const { id, part } = box.address;
  if (id === undefined) return [];
  if (box.kind === "card" && !isAncestorCard(box) && part?.[0] === "card") return [id];
  return box.kind === "frame" ? displayOrder(manifest, id) : [];
}

/**
 * The list of the switch above `box`: "As written" (`AS_WRITTEN`), then the
 * flows of every timeline it switches (`flowsOf`), a frame's member by
 * member; `null` where there is none to choose, so no switch is shown.
 */
export function flowChoices(manifest: Manifest, box: DrawnBox): FlowChoice[] | null {
  const choices = switchedBy(manifest, box).flatMap((timeline) => flowsOf(manifest, timeline));
  return choices.length === 0 ? null : [AS_WRITTEN, ...choices];
}

/**
 * The entry the switch above `box` shows chosen: the one flow its
 * timelines' cards are switched to where exactly one is (core's `cardFlow`), else
 * "As written", as the drawing draws a frame with two switched members.
 */
export function chosenFlow(manifest: Manifest, box: DrawnBox): FlowChoice {
  const switched = switchedBy(manifest, box).flatMap((timeline) => {
    const flow = cardFlow(manifest, timeline);
    return flow === null ? [] : [{ timeline, flow }];
  });
  const [one] = switched;
  if (one === undefined || switched.length > 1) return AS_WRITTEN;
  return flowsOf(manifest, one.timeline).find((choice) => choice.flow === one.flow) ?? AS_WRITTEN;
}

/** The `style` command of block `block` setting `flow` on the cards of `timeline`, `null` removing it. */
function flowCommand(block: BlockId, timeline: string, flow: string | null): StyleCommand {
  return {
    type: "style",
    select: { addresses: [{ id: timeline, part: ["card"] }] },
    set: { flow },
    blocks: [block],
  };
}

/**
 * The commands choosing `choice` on the switch above `box` of block
 * `block`: first one removing `flow` from the cards of every other timeline
 * the box switches that sets one (`cardFlow`; "As written" removes it from
 * all), then, for a FlowMap or virtual timeline, one setting it on its
 * timeline's cards where they set another or none; none where `choice` is
 * what the cards show already.
 */
export function flowCommands(
  block: BlockId,
  manifest: Manifest,
  box: DrawnBox,
  choice: FlowChoice,
): StyleCommand[] {
  const commands: StyleCommand[] = [];
  for (const timeline of switchedBy(manifest, box)) {
    const flow = cardFlow(manifest, timeline);
    if (flow !== null && timeline !== choice.timeline) {
      commands.push(flowCommand(block, timeline, null));
    }
  }
  if (choice.timeline !== null && cardFlow(manifest, choice.timeline) !== choice.flow) {
    commands.push(flowCommand(block, choice.timeline, choice.flow));
  }
  return commands;
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
 * card of `after` holding chunk braces addressed with a timeline `T` of the
 * manifest (`{id: T, facet: "regions", part: [k]}`, a switched card's; a
 * virtual card's carry a virtual timeline's ID) whose card of the same
 * place key in `before` held none, each chunk `k` with a written stretch
 * drawn on `T`'s line in that card of `before`: its elements in that card of
 * `after` (its brace, label, leader and boundary), from that stretch's
 * abscissas there (the first of `T`'s lines drawing any of it, clipped to
 * what it draws) to its brace's `x1` and `x2`.
 */
export function switchMorphs(manifest: Manifest, before: Drawing, after: Drawing): ChunkMorph[] {
  const virtual = new Set((manifest.virtual_timelines ?? []).map((item) => item.id));
  const chunked = (
    drawing: Drawing,
  ): Map<string, { card: PlaceKey; timeline: string; indices: number[] }> => {
    const cards = new Map<string, { card: PlaceKey; timeline: string; indices: number[] }>();
    drawing.elements.forEach((element, index) => {
      const { id, facet, part } = element.address;
      if (id === undefined || virtual.has(id) || facet !== "regions") return;
      if (typeof part?.[0] !== "number") return;
      const card = cardHolding(drawing, index);
      if (card === null) return;
      const key = `${placeKeyText(card)} ${id}`;
      const entry = cards.get(key) ?? { card, timeline: id, indices: [] };
      entry.indices.push(index);
      cards.set(key, entry);
    });
    return cards;
  };
  const was = chunked(before);
  const lines = [...lineAxes(before).values()];
  const morphs: ChunkMorph[] = [];
  for (const [key, { card, timeline, indices }] of chunked(after)) {
    if (was.has(key)) continue;
    const flow = cardFlow(manifest, timeline);
    if (flow === null) continue;
    const written = writtenOf(manifest, flow);
    const own = lines.filter((axis) => axis.timeline === timeline && samePlaceKey(axis.card, card));
    const byChunk = new Map<number, number[]>();
    for (const index of indices) {
      const chunk = after.elements[index]?.address.part?.[0];
      if (typeof chunk !== "number") continue;
      byChunk.set(chunk, [...(byChunk.get(chunk) ?? []), index]);
    }
    for (const [chunk, elements] of byChunk) {
      const brace = elements
        .map((index) => after.elements[index])
        .find((element) => element?.type === "region" && element.address.part?.length === 1);
      const stretch = written.get(chunk);
      if (brace?.type !== "region" || stretch === undefined) continue;
      const from = own
        .map((axis) => clippedOn(axis, realOf(stretch.start), realOf(stretch.end)))
        .find((ends) => ends !== null);
      if (from === undefined || from === null) continue;
      morphs.push({
        elements,
        from: { x1: from[0], x2: from[1] },
        to: { x1: brace.x1, x2: brace.x2 },
      });
    }
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
