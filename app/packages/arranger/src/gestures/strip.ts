/**
 * Dragging a handle of a selected elision's strip: an extent handle moves
 * the elision's start or end, the width grip its drawn width (`strips.ts`).
 */

import type { Address, Granularity, View } from "@timetoalign/tilie-core";
import { axisCoordinate, type Rational, realOf, toRational } from "@timetoalign/tilie-core/numbers";
import { HIT_TOLERANCE } from "../coordinates.ts";
import { drawingOf, nodePosition } from "../drawing.ts";
import { addressParts } from "../editing.ts";
import type { Viewport } from "../focus.ts";
import type { GestureStrategy, Point } from "../gesture.ts";
import type { BlockNode } from "../node.ts";
import type { NodeActions } from "../nodeActions.ts";
import type { EdgeContext, StoredEntry, StripChange, StripPiece, StripSubject } from "../strips.ts";
import {
  edgeAt,
  piecesOf,
  storedAs,
  stripCommand,
  subjectOf,
  valueText,
  widthFor,
  widthsOf,
} from "../strips.ts";
import { previewCommand, previewed } from "./host.ts";

/** A handle of a strip: its start's or its end's extent handle, or its width grip. */
export type StripHandle = "start" | "end" | "width";

/** What a dragged handle shows while the pointer holds it: where it lies and what it sets. */
export interface StripLive {
  readonly handle: StripHandle;
  /** The handle's place on the canvas as the preview draws the strip, in canvas units. */
  readonly at: Point;
  /** The top of the strip there, in canvas units: the flag's pole rises above it. */
  readonly top: number;
  /** What the flag says: the timeline and the value set. */
  readonly text: string;
}

/** The handles' side of a drag. */
export interface StripHost {
  readonly actions: NodeActions;
  /** The node the strip lies in, as stored, and the piece whose handle is pressed. */
  target(): { readonly node: BlockNode; readonly piece: StripPiece } | undefined;
  viewport(): Viewport;
  granularity(): Granularity;
  /** Hears the dragged handle's place and value while it moves; `null` once the drag ends. */
  live(live: StripLive | null): void;
}

/** What a press on a handle holds. */
export interface StripPress {
  /** The view as stored at the press, which the command is built on. */
  readonly view: View;
  readonly node: BlockNode;
  readonly subject: StripSubject;
  readonly context: EdgeContext;
  /** The pointer's client point at the press, and the viewport's pan then. */
  readonly screen: Point;
  readonly pan: Point;
  /** The default piece the last preview stores, found again once released; `null` for a stored elision. */
  stores: StoredEntry | null;
}

/** A value on the subject's timeline as the flag shows it, exact, with the unit's name where `unit`. */
function shownValue(subject: StripSubject, value: Rational, unit: boolean): string {
  const text = valueText(value, subject.timeline);
  return unit ? `${text} ${subject.timeline.unit}` : text;
}

/** What the flag of a drag says: the timeline's name, then the stretch, or the width set. */
function liveText(subject: StripSubject, change: StripChange): string {
  const name = subject.timeline.name ?? subject.timeline.id;
  const { width } = change;
  if (width === undefined) {
    const start = shownValue(subject, change.start ?? subject.start, false);
    return `${name}, ${start}–${shownValue(subject, change.end ?? subject.end, true)}`;
  }
  if ("ratio" in width) return `${name}, ${width.ratio} of its length`;
  if ("canvas" in width) return `${name}, ${width.canvas} canvas units wide`;
  const span = toRational(realOf(axisCoordinate(width.span, subject.timeline)));
  return `${name}, as wide as ${shownValue(subject, span, true)}`;
}

/**
 * The drag of `handle` of a strip: the pointer's travel in canvas units
 * (its screen travel less the viewport's pan since the press, over the
 * zoom) moves the handle across the block's drawing, read on the drawing
 * at the press. An extent handle takes the value there (`edgeAt`: a
 * snapping value within `HIT_TOLERANCE` screen pixels, else the simplest
 * value within half a pixel, held where the edge may lie); the width grip
 * the drawn width there in the elision's form (`widthFor`). Each value is
 * previewed as its command leaves the block (`stripCommand`: a stored
 * elision's `set`, a default piece's `add` of its card's defaults), the
 * flag following the handle; the release stores it, and a default piece
 * stored so is selected as the elision it became.
 */
export function stripGesture(
  host: StripHost,
  handle: StripHandle,
): GestureStrategy<StripPress, StripChange> {
  const { actions } = host;
  /** The pointer's travel since the press in the block's drawing units. */
  function travel(press: StripPress, screen: Point): number {
    const { x, zoom } = host.viewport();
    return (screen.x - press.screen.x - (x - press.pan.x)) / zoom / press.node.data.block.scale;
  }
  /** Canvas units per screen pixel in the block's drawing. */
  function pixel(press: StripPress): number {
    return 1 / (host.viewport().zoom * press.node.data.block.scale);
  }
  /**
   * Where the dragged handle lies in `view` (the preview), for the flag: on
   * the piece of the elision changed (a default piece by the elision it is
   * stored as) reaching the value set, else on its first piece.
   */
  function placed(press: StripPress, view: View, change: StripChange): StripLive | null {
    const block = view.blocks[press.node.id];
    if (block === undefined) return null;
    const { subject } = press;
    const stored = press.stores === null ? null : storedAs(view, block.id, press.stores);
    const address = stored === null ? subject.piece.element.address : addressParts(stored).element;
    if (address === null) return null;
    const drawing = drawingOf(block, view.graphical, actions.metrics);
    const pieces = piecesOf(drawing, address);
    const start = change.start ?? subject.start;
    const end = change.end ?? subject.end;
    const reaches = ({ element }: StripPiece) =>
      handle === "start"
        ? toRational(element.elided.start).equals(start)
        : toRational(element.elided.end).equals(end);
    const piece = pieces.find(reaches) ?? pieces[0];
    if (piece === undefined) return null;
    const origin = nodePosition(block, drawing);
    const { x1, x2, yt, yb } = piece.element;
    const x = handle === "start" ? x1 : x2;
    const y = handle === "width" ? yb : yt;
    return {
      handle,
      at: { x: origin.x + x * block.scale, y: origin.y + y * block.scale },
      top: origin.y + yt * block.scale,
      text: liveText(subject, change),
    };
  }
  return {
    takes(_event, at) {
      if (!actions.rules().resize) return null;
      const target = host.target();
      if (target === undefined) return null;
      const { node, piece } = target;
      const { manifest } = node.data.block;
      const subject = subjectOf(manifest, piece);
      if (subject === null) return null;
      if (handle !== "width" && !subject.edges.includes(handle)) return null;
      const { x, y } = host.viewport();
      return {
        view: actions.view(),
        node,
        subject,
        context: {
          block: node.id,
          manifest,
          drawing: node.data.drawing,
          granularity: host.granularity(),
        },
        screen: at.screen,
        pan: { x, y },
        stores: null,
      };
    },
    value(press, at) {
      const { subject, context } = press;
      const dx = travel(press, at.screen);
      const reach = pixel(press) / 2;
      if (handle === "width") {
        const widths = widthsOf(context.manifest, context.drawing, subject.piece);
        if (widths === null) return null;
        const width = widthFor(context, subject, widths.drawn + dx, reach);
        return width === null ? null : { width };
      }
      const { x1, x2 } = subject.piece.element;
      const x = (handle === "start" ? x1 : x2) + dx;
      const value = edgeAt(context, subject, handle, x, HIT_TOLERANCE * pixel(press), reach);
      return value === null ? null : { [handle]: value };
    },
    preview(press, change) {
      const id = press.node.id;
      if (change === null) {
        actions.preview(id, null);
        host.live(null);
        const now = actions.view();
        if (press.stores !== null && now !== press.view) {
          const stored: Address | null = storedAs(now, id, press.stores);
          if (stored !== null) actions.select(stored);
        }
        return;
      }
      const result = stripCommand(press.view, id, press.context.drawing, press.subject, change);
      press.stores = result?.stores ?? null;
      previewCommand(actions, id, press.view, result?.command ?? null);
      const shown = result === null ? press.view : previewed(press.view, result.command);
      host.live(placed(press, shown, change));
    },
    command(press, change) {
      return (
        stripCommand(press.view, press.node.id, press.context.drawing, press.subject, change)
          ?.command ?? null
      );
    },
  };
}
