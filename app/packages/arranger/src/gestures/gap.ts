/**
 * Dragging a handle on an edge of a selected stored elision's gap: under
 * the canvas's modes it moves the elision's start or end, the gap's drawn
 * width, or both (`gaps.ts`).
 */

import type { Granularity, View } from "@timetoalign/tilie-core";
import { findTimeline, samePlaceKey } from "@timetoalign/tilie-core";
import type { Real } from "@timetoalign/tilie-core/numbers";
import type { Drawing } from "@timetoalign/tilie-layout";
import { lineAxes } from "@timetoalign/tilie-layout";
import { HIT_TOLERANCE } from "../coordinates.ts";
import { drawingOf, nodePosition } from "../drawing.ts";
import type { Viewport } from "../focus.ts";
import type { GapChange, GapContext, GapEdge, GapModes, GapPiece, GapSubject } from "../gaps.ts";
import { gapCommand, gapDrag, piecesOf, stretchText, subjectOf } from "../gaps.ts";
import type { GestureStrategy, Point } from "../gesture.ts";
import type { BlockNode } from "../node.ts";
import type { NodeActions } from "../nodeActions.ts";
import { previewCommand, previewed } from "./host.ts";

/** What a dragged handle shows while the pointer holds it: where it lies and what it sets. */
export interface GapLive {
  readonly edge: GapEdge;
  /** The handle's place on the canvas as the preview draws the gap, in canvas units. */
  readonly at: Point;
  /** The top of the gap there, in canvas units: the flag's pole rises above it. */
  readonly top: number;
  /** What the flag says: the timeline, the stretch and the width set. */
  readonly text: string;
}

/** The handles' side of a drag. */
export interface GapHost {
  readonly actions: NodeActions;
  /** The node the gap lies in, as stored, and the piece whose handle is pressed. */
  target(): { readonly node: BlockNode; readonly piece: GapPiece } | undefined;
  viewport(): Viewport;
  granularity(): Granularity;
  /** What a drag changes: the coordinates, the width or both. */
  modes(): GapModes;
  /** Hears the dragged handle's place and value while it moves; `null` once the drag ends. */
  live(live: GapLive | null): void;
}

/** What a press on a handle holds. */
export interface GapPress {
  /** The view as stored at the press, which the command is built on. */
  readonly view: View;
  readonly node: BlockNode;
  readonly subject: GapSubject;
  readonly context: GapContext;
  readonly modes: GapModes;
  /** The pointer's client point at the press, and the viewport's pan then. */
  readonly screen: Point;
  readonly pan: Point;
}

/** A stored width as the flag says it. */
function widthText(change: GapChange, subject: GapSubject): string | null {
  const { width } = change;
  if (width === undefined) return null;
  if (width === null) return "the standard gap";
  if ("ratio" in width) return `${width.ratio} of its stretch`;
  if ("canvas" in width) return `${width.canvas} canvas units wide`;
  const span: Real = width.span;
  return `as wide as ${stretchText(subject.timeline, span, span).split("–")[1] ?? ""}`;
}

/** What the flag of a drag says: the timeline's name, the stretch, then the width set. */
export function liveText(subject: GapSubject, change: GapChange): string {
  const { timeline } = subject;
  const stretch = stretchText(timeline, change.start ?? subject.start, change.end ?? subject.end);
  const width = widthText(change, subject);
  return [timeline.name ?? timeline.id, stretch, ...(width === null ? [] : [width])].join(", ");
}

/**
 * The ordinate of a handle of `piece` in `drawing` (block-local units): the
 * line of the elision's timeline in the card drawing it, in a frame in its
 * member's card; the gap's middle where that line is not drawn.
 */
export function handleOrdinate(drawing: Drawing, piece: GapPiece, timeline: string): number {
  const { exposure, element } = piece;
  for (const axis of lineAxes(drawing).values()) {
    if (axis.timeline !== timeline) continue;
    const drawn =
      exposure.kind === "frame"
        ? axis.ancestor === undefined &&
          axis.card.item === exposure.key.item &&
          axis.card.member !== undefined
        : samePlaceKey(axis.card, exposure.key) &&
          (exposure.kind === "ancestor_card") === (axis.ancestor !== undefined);
    if (drawn) return axis.y;
  }
  return (element.yt + element.yb) / 2;
}

/**
 * The drag of the `edge` handle of a selected stored elision's gap: the
 * pointer's travel in the block's drawing units (its screen travel less the
 * viewport's pan since the press, over the zoom and the block's scale)
 * moves the edge under the modes pressed at the press (`gapDrag`: a
 * snapping value within `HIT_TOLERANCE` screen pixels, else the simplest
 * value within half a pixel). Each value is previewed as its `set` leaves
 * the block, the flag following the handle on the previewed gap; the
 * release stores it.
 */
export function gapGesture(host: GapHost, edge: GapEdge): GestureStrategy<GapPress, GapChange> {
  const { actions } = host;
  /** The pointer's travel since the press in the block's drawing units. */
  function travel(press: GapPress, screen: Point): number {
    const { x, zoom } = host.viewport();
    return (screen.x - press.screen.x - (x - press.pan.x)) / zoom / press.node.data.block.scale;
  }
  /** Block-local units per screen pixel. */
  function pixel(press: GapPress): number {
    return 1 / (host.viewport().zoom * press.node.data.block.scale);
  }
  /** Where the dragged handle lies in `view` (the preview), for the flag. */
  function placed(press: GapPress, view: View, change: GapChange): GapLive | null {
    const block = view.blocks[press.node.id];
    if (block === undefined) return null;
    const { subject } = press;
    const drawing = drawingOf(block, view.graphical, actions.metrics, undefined, actions.pane());
    const key = subject.piece.exposure.key;
    const piece =
      piecesOf(drawing, subject.piece.element.address).find(
        ({ exposure }) =>
          exposure.key.item === key.item &&
          exposure.key.member === key.member &&
          exposure.kind === subject.piece.exposure.kind,
      ) ?? null;
    if (piece === null) return null;
    const origin = nodePosition(block, drawing);
    const x = edge === "start" ? piece.gap.x1 : piece.gap.x2;
    const y = handleOrdinate(drawing, piece, subject.timeline.id);
    return {
      edge,
      at: { x: origin.x + x * block.scale, y: origin.y + y * block.scale },
      top: origin.y + piece.element.yt * block.scale,
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
      const subject = subjectOf(manifest, node.data.drawing, piece);
      if (subject === null || !subject.edges.includes(edge)) return null;
      if (findTimeline(manifest, subject.timeline.id) === undefined) return null;
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
        modes: host.modes(),
        screen: at.screen,
        pan: { x, y },
      };
    },
    value(press, at) {
      const dx = travel(press, at.screen);
      const unit = pixel(press);
      return gapDrag(
        press.context,
        press.subject,
        edge,
        dx,
        press.modes,
        HIT_TOLERANCE * unit,
        unit / 2,
      );
    },
    preview(press, change) {
      const id = press.node.id;
      if (change === null) {
        actions.preview(id, null);
        host.live(null);
        return;
      }
      const command = gapCommand(press.view, id, press.subject, change);
      previewCommand(actions, id, press.view, command);
      const shown =
        command === null ? press.view : previewed(press.view, command, actions.minter());
      host.live(placed(press, shown, change));
    },
    command(press, change) {
      return gapCommand(press.view, press.node.id, press.subject, change);
    },
  };
}
