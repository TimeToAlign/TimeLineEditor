/**
 * The handles of a selected region: one on each end of every brace drawn
 * of it, dragging its start or its end along its timeline's axis.
 *
 * A region `R` of the timeline `T` is drawn as a brace, the `region`
 * element addressed `{id: R}` (`docs/drawing.md` in TimeToShare, section
 * 6.6, Regions), in every card drawing `T`'s line (an ungrouped root's card,
 * an ancestor card, a member card in a frame). The container recording that
 * card's axis (`cardAxis.ts`: the card itself, or the frame holding a member
 * card) maps an abscissa to a value of `T`, and on a virtual card the axis
 * as the window drawing the brace shows its source (`windowed`), so a
 * brace a window draws takes handles where its ends are the region's; a
 * brace whose ends that axis does not read back as `R`'s start and end
 * (drawn over another axis, as a switched card's played stretch, or cut at
 * a window's border) takes no handle at those ends.
 */

import type {
  BlockId,
  Command,
  ElementAddress,
  Granularity,
  Manifest,
  PlaceKey,
  Region,
  TimelineManifest,
  View,
} from "@timetoalign/tilie-core";
import {
  addressKey,
  contains,
  idAddress,
  inBlock,
  isAtomicSection,
  placeKeyText,
  samePlaceKey,
} from "@timetoalign/tilie-core";
import { windowsOf } from "@timetoalign/tilie-core/drawing";
import { Rational, toFloat, toRational } from "@timetoalign/tilie-core/numbers";
import type { Drawing, RegionElement } from "@timetoalign/tilie-layout";
import type { CardAxis, GapEdge } from "../cardAxis.ts";
import { cardAxisOf, windowAxis, zeroOf } from "../cardAxis.ts";
import { HIT_TOLERANCE } from "../coordinates.ts";
import { drawingOf, nodePosition } from "../drawing.ts";
import { axisValue, exactOn, max, min, snappedOn, timelineTargets } from "../edgeValues.ts";
import type { Viewport } from "../focus.ts";
import { stretchText } from "../gaps.ts";
import type { GestureStrategy, Point } from "../gesture.ts";
import type { BlockNode } from "../node.ts";
import type { NodeActions } from "../nodeActions.ts";
import { previewCommand, previewed } from "./host.ts";
import type { HandlePress } from "./travel.ts";
import { pixelOf, travelOf } from "./travel.ts";

const ZERO = Rational.of(0n);

/** An end of a region: its start (the brace's left end) or its end (its right one). */
export type RegionEdge = GapEdge;

/** A region of a manifest and the timeline holding it. */
export interface Held {
  readonly timeline: TimelineManifest;
  readonly region: Region;
}

/** The region `id` of `manifest` and its timeline; `undefined` where no timeline holds one. */
export function regionOf(manifest: Manifest, id: string): Held | undefined {
  const search = (timelines: readonly TimelineManifest[]): Held | undefined => {
    for (const timeline of timelines) {
      const region = timeline.regions.find((each) => each.id === id);
      if (region !== undefined) return { timeline, region };
      const found = search(timeline.children);
      if (found !== undefined) return found;
    }
    return undefined;
  };
  return search(manifest.timelines);
}

/** One brace of a region drawn, with the card drawing it and the map of that card's axis. */
export interface RegionPiece {
  /** Its index in `drawing.elements`. */
  readonly index: number;
  readonly element: RegionElement;
  /** The place key of the card drawing it. */
  readonly card: PlaceKey;
  /** How many braces of the same region the same card draws before it. */
  readonly nth: number;
  readonly axis: CardAxis;
}

/** What the handles of one brace act on. */
export interface RegionSubject extends Held {
  readonly piece: RegionPiece;
  /** The region's start and end on its timeline's own axis, exact. */
  readonly start: Rational;
  readonly end: Rational;
  /** The ends of the brace its card's axis reads back as the region's own: those taking a handle. */
  readonly edges: readonly RegionEdge[];
}

/**
 * The map of the axis of the card `card` of `drawing`: the card's own
 * record (an ungrouped root's card, an ancestor card), else the record of
 * the frame holding it (a member card); `null` where none is recorded.
 */
function axisOfCard(manifest: Manifest, drawing: Drawing, card: PlaceKey): CardAxis | null {
  const exposure =
    drawing.elisions.find((each) => each.kind !== "frame" && samePlaceKey(each.key, card)) ??
    (card.member === undefined
      ? undefined
      : drawing.elisions.find((each) => each.kind === "frame" && each.key.item === card.item));
  return exposure === undefined ? null : cardAxisOf(manifest, drawing, exposure);
}

/**
 * The map of the virtual card `card`'s axis `axis` as the window drawing
 * the brace `element` of a region of `timeline` reads it (`windowAxis`,
 * section 8.10, Windows): the stretch piece of the virtual timeline's
 * FlowMap whose played span holds the brace's middle and whose source is
 * `timeline` or one of its ancestors; `axis` itself where the card is no
 * virtual card, `null` where no such piece is.
 */
function windowed(
  manifest: Manifest,
  card: PlaceKey,
  axis: CardAxis,
  timeline: string,
  element: RegionElement,
): CardAxis | null {
  const virtual = (manifest.virtual_timelines ?? []).find((item) => item.id === card.item);
  if (virtual === undefined || card.member !== undefined) return axis;
  const own = axis.baseOf(virtual.id);
  const middle = axis.valueAt(virtual.id, (element.x1 + element.x2) / 2);
  if (own === null || middle === null) return null;
  for (const pieces of windowsOf(manifest, virtual.map).chunks.values()) {
    for (const { piece, source } of pieces) {
      const holds = source.id === timeline || contains(manifest, source.id, idAddress(timeline));
      const start = toFloat(toRational(piece.P));
      const end = start + toFloat(toRational(piece.b)) - toFloat(toRational(piece.a));
      if (!holds || middle < start || middle > end) continue;
      const zero = toRational(piece.P)
        .subtract(toRational(piece.a))
        .add(zeroOf(manifest, timeline));
      return windowAxis(axis, timeline, { base: virtual.id, zero, lambda: own.lambda });
    }
  }
  return null;
}

/** Whether `axis` reads `value` of `timeline` at the abscissa `x`, up to a float's error. */
function readsAt(axis: CardAxis, timeline: string, x: number, value: Rational): boolean {
  const read = axis.valueAt(timeline, x);
  const lambda = axis.baseOf(timeline)?.lambda;
  if (read === null || lambda === undefined) return false;
  const exact = toFloat(value);
  return Math.abs(read - exact) <= 1e-9 * Math.max(1, Math.abs(toFloat(toRational(lambda))));
}

/**
 * What the handles of the region `address` of `manifest` act on in
 * `drawing`: one subject per brace drawn of it, in drawing order, with the
 * ends taking a handle; none for an atomic section (read only), an address
 * naming no region, or a brace in no recorded card.
 */
export function regionSubjectsOf(
  manifest: Manifest,
  drawing: Drawing,
  address: ElementAddress,
): readonly RegionSubject[] {
  const { id, facet, part } = address;
  if (id === undefined || facet !== undefined || part !== undefined) return [];
  const held = regionOf(manifest, id);
  if (held === undefined || isAtomicSection(manifest, held.region)) return [];
  const { timeline, region } = held;
  const key = addressKey(idAddress(id));
  const start = exactOn(region.start, timeline);
  const end = exactOn(region.end, timeline);
  const cards = drawing.boxes.filter((box) => box.kind === "card");
  const counted = new Map<string, number>();
  return drawing.elements.flatMap((element, index): RegionSubject[] => {
    if (element.type !== "region" || addressKey(element.address) !== key) return [];
    const card = cards.findLast(({ range }) => range.start <= index && index < range.end)?.key;
    if (card == null) return [];
    const cardAxis = axisOfCard(manifest, drawing, card);
    const axis =
      cardAxis === null ? null : windowed(manifest, card, cardAxis, timeline.id, element);
    if (axis === null) return [];
    const cardText = placeKeyText(card);
    const nth = counted.get(cardText) ?? 0;
    counted.set(cardText, nth + 1);
    const edges: RegionEdge[] = [];
    if (readsAt(axis, timeline.id, element.x1, start)) edges.push("start");
    if (readsAt(axis, timeline.id, element.x2, end)) edges.push("end");
    return [{ timeline, region, start, end, edges, piece: { index, element, card, nth, axis } }];
  });
}

/** Where a drag reads its snapping: the block and how finely a value is picked. */
export interface RegionContext {
  readonly block: BlockId;
  readonly granularity: Granularity;
}

/**
 * The values an end of `subject` snaps to, on its timeline's own axis: its
 * timeline's start and known end, its children's starts and known ends, and
 * the start and the end of each other region of the timeline.
 */
function targetsOf(subject: RegionSubject): Rational[] {
  const { timeline, region } = subject;
  const targets = timelineTargets(timeline);
  for (const other of timeline.regions) {
    if (other.id === region.id) continue;
    targets.push(exactOn(other.start, timeline), exactOn(other.end, timeline));
  }
  return targets;
}

/**
 * Where the `edge` of `subject` may lie: the start from the timeline's
 * start up to the region's end, the end from the region's start up to the
 * timeline's known end; `value` held there.
 */
function heldEdge(subject: RegionSubject, edge: RegionEdge, value: Rational): Rational {
  if (edge === "start") return min(max(value, ZERO), subject.end);
  const { timeline } = subject;
  const held = max(value, subject.start);
  return timeline.length === null ? held : min(held, exactOn(timeline.length, timeline));
}

/**
 * The value the `edge` of `subject` takes when its handle is dragged `dx`
 * block units: the value of the region's timeline the card's axis reads at
 * the end's abscissa moved by `dx` (beyond the axis or inside a gap, the end
 * moved by `dx / k`, `k` the block units per unit of the timeline on the run
 * the end lies on), snapped to a value of `targetsOf` within `tolerance`
 * block units, else to the simplest value of its number type within `reach`
 * block units (core's `snapOnRow`), held where the end may lie: never past
 * the region's other end, nor before its timeline's start or after its known
 * end. `null` where the axis has no scale there.
 */
export function regionDrag(
  context: RegionContext,
  subject: RegionSubject,
  edge: RegionEdge,
  dx: number,
  tolerance: number,
  reach: number,
): Rational | null {
  const { piece, timeline } = subject;
  const { axis } = piece;
  const current = edge === "start" ? subject.start : subject.end;
  const u = axis.proportionOf(timeline.id, current);
  const run = u === null ? null : axis.runAt(u);
  const k = run === null ? null : axis.unitScale(run, timeline.id);
  if (k === null || !Number.isFinite(dx)) return null;
  const x = (edge === "start" ? piece.element.x1 : piece.element.x2) + dx;
  const wanted = axis.valueAt(timeline.id, x) ?? toFloat(current) + dx / k;
  let best: { readonly value: Rational; readonly distance: number } | null = null;
  for (const target of targetsOf(subject)) {
    const distance = Math.abs(toFloat(target) - wanted) * k;
    if (distance <= tolerance && (best === null || distance < best.distance)) {
      best = { value: target, distance };
    }
  }
  const found =
    best?.value ?? snappedOn(context.block, timeline, wanted, reach / k, context.granularity);
  return found === null ? null : heldEdge(subject, edge, found);
}

/**
 * The command storing `value` as the `edge` of `subject`'s region in block
 * `block` of `view`: one `set` of that end on `{block, id: R}`, written in
 * the timeline's number type; `null` where it is the stored value, the
 * block is gone or the number type cannot hold it.
 */
export function regionCommand(
  view: View,
  block: BlockId,
  subject: RegionSubject,
  edge: RegionEdge,
  value: Rational,
): Command | null {
  if (view.blocks[block] === undefined) return null;
  if (value.equals(edge === "start" ? subject.start : subject.end)) return null;
  const written = axisValue(value, subject.timeline);
  if (written === undefined) return null;
  const target = inBlock(block, idAddress(subject.region.id));
  return { type: "set", changes: [{ target, values: { [edge]: written } }] };
}

/** Where a dragged handle lies on the canvas as the preview draws its brace, in canvas units. */
export interface RegionLive {
  readonly edge: RegionEdge;
  readonly at: Point;
  /** The top of the brace there, in canvas units: the flag's pole rises above it. */
  readonly top: number;
  /** What the flag says: the region and its stretch with the dragged end at `value`. */
  readonly text: string;
}

/**
 * What the flag of a dragged region handle says: the region's name (its
 * ID without one) and its stretch with the `edge` at `value`, written as a
 * gap's flag writes a stretch: "B, 12–18 ♩".
 */
export function regionText(subject: RegionSubject, edge: RegionEdge, value: Rational): string {
  const { region, timeline } = subject;
  const start = edge === "start" ? value : subject.start;
  const end = edge === "end" ? value : subject.end;
  return `${region.name ?? region.id}, ${stretchText(timeline, start, end)}`;
}

/** The handles' side of a drag. */
export interface RegionHost {
  readonly actions: NodeActions;
  /** The node the region lies in, as stored, and the brace whose handle is pressed. */
  target(): { readonly node: BlockNode; readonly subject: RegionSubject } | undefined;
  viewport(): Viewport;
  granularity(): Granularity;
  /** Hears the dragged handle's place and value while it moves; `null` once the drag ends. */
  live(live: RegionLive | null): void;
}

/** What a press on a handle holds. */
export interface RegionPress extends HandlePress {
  /** The view as stored at the press, which the command is built on. */
  readonly view: View;
  readonly subject: RegionSubject;
  readonly context: RegionContext;
}

/** The handle's place on a brace: its end, at the ordinate of its arms. */
export function handlePoint(element: RegionElement, edge: RegionEdge): Point {
  return { x: edge === "start" ? element.x1 : element.x2, y: element.yb };
}

/**
 * The drag of the `edge` handle of a selected region's brace: the
 * pointer's travel in the block's drawing units moves that end
 * (`regionDrag`: a snapping value within `HIT_TOLERANCE` screen pixels,
 * else the simplest value within half a pixel). Each value is previewed as
 * its `set` leaves the block, the handle following its brace there; the
 * release stores it, one `set`.
 */
export function regionGesture(
  host: RegionHost,
  edge: RegionEdge,
): GestureStrategy<RegionPress, Rational> {
  const { actions } = host;
  /** Where the dragged handle lies in `view` (the preview): the same card's same brace. */
  function placed(press: RegionPress, view: View, value: Rational): RegionLive | null {
    const block = view.blocks[press.node.id];
    if (block === undefined) return null;
    const drawing = drawingOf(block, view.graphical, actions.metrics, undefined, actions.pane());
    const { piece, region } = press.subject;
    const found = regionSubjectsOf(block.manifest, drawing, idAddress(region.id)).find(
      (each) => samePlaceKey(each.piece.card, piece.card) && each.piece.nth === piece.nth,
    );
    if (found === undefined) return null;
    const origin = nodePosition(block, drawing);
    const { element } = found.piece;
    const at = handlePoint(element, edge);
    return {
      edge,
      at: { x: origin.x + at.x * block.scale, y: origin.y + at.y * block.scale },
      top: origin.y + Math.min(element.ya, element.yb) * block.scale,
      text: regionText(press.subject, edge, value),
    };
  }
  return {
    takes(_event, at) {
      if (!actions.rules().resize) return null;
      const target = host.target();
      if (target === undefined || !target.subject.edges.includes(edge)) return null;
      const { node, subject } = target;
      const { x, y } = host.viewport();
      return {
        view: actions.view(),
        node,
        subject,
        context: { block: node.id, granularity: host.granularity() },
        screen: at.screen,
        pan: { x, y },
      };
    },
    value(press, at) {
      const viewport = host.viewport();
      const unit = pixelOf(press, viewport);
      const dx = travelOf(press, viewport, at.screen);
      return regionDrag(press.context, press.subject, edge, dx, HIT_TOLERANCE * unit, unit / 2);
    },
    preview(press, value) {
      const id = press.node.id;
      if (value === null) {
        actions.preview(id, null);
        host.live(null);
        return;
      }
      const command = regionCommand(press.view, id, press.subject, edge, value);
      previewCommand(actions, id, press.view, command);
      const shown =
        command === null ? press.view : previewed(press.view, command, actions.minter());
      host.live(placed(press, shown, value));
    },
    command(press, value) {
      return regionCommand(press.view, press.node.id, press.subject, edge, value);
    },
  };
}
