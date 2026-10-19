/** Resizing a block, a frame or a card by one of the resize toolbar's handles. */

import type { Block, SetCommand, View } from "@timetoalign/tilie-core";
import type { DrawnBox } from "@timetoalign/tilie-layout";
import type { Level } from "../containers.ts";
import type { Viewport } from "../focus.ts";
import type { GestureStrategy, Point } from "../gesture.ts";
import { itemResizeCommand, itemResizeValues } from "../items.ts";
import type { NodeActions } from "../nodeActions.ts";
import type { Delta, Handle, ResizeMode } from "../resize.ts";
import { resize, resizeCommand } from "../resize.ts";
import { previewCommand } from "./host.ts";

/** The resize toolbar's side of a resize. */
export interface ResizeHost {
  readonly actions: NodeActions;
  /** The block resized, as stored, and the box of its drawing resized: its own box, a frame or a card. */
  target(): { readonly block: Block; readonly box: DrawnBox };
  /** The level the resize is made at. */
  level(): Level;
  /** The mode the toolbar shows; `undefined` where it offers none. */
  mode(): ResizeMode | undefined;
  /** Whether the toolbar takes no resize: the canvas is locked or read-only. */
  locked(): boolean;
  viewport(): Viewport;
  /**
   * Pan the canvas at Svelte Flow's auto-pan speed when the client point
   * `screen` lies in the pane's edge band; whether it panned.
   */
  autoPan(screen: Point): Promise<boolean>;
}

/** What a press on a handle holds. */
export interface ResizePress {
  /** The view as stored at the press, which the command is built on. */
  readonly view: View;
  readonly block: Block;
  readonly box: DrawnBox;
  readonly level: Level;
  readonly mode: ResizeMode;
  /** The pointer's client point at the press, and the viewport's pan then. */
  readonly screen: Point;
  readonly pan: Point;
  /** The pointer's last client point, which the auto-pan reads again after each pan. */
  last: Point;
  /** The animation frame of the auto-pan, while the resize is under way. */
  frame: number | null;
}

/**
 * The resize by `handle`: the pointer's travel in canvas units (its screen
 * travel less the viewport's pan since the press, over the zoom) is the
 * resize's delta. A block becomes new placement values (`resize`), a frame
 * or a card new places (`itemResizeValues`); the release stores them in one
 * `set`, nothing when every value is stored already. While the pointer
 * lies in the pane's edge band the canvas pans every frame, and the
 * preview follows the canvas point under the pointer, as Svelte Flow does
 * for a node drag.
 */
export function resizeGesture(
  host: ResizeHost,
  handle: Handle,
): GestureStrategy<ResizePress, Delta> {
  const { actions } = host;
  function deltaOf(press: ResizePress, screen: Point): Delta {
    const { x, y, zoom } = host.viewport();
    return {
      dx: (screen.x - press.screen.x - (x - press.pan.x)) / zoom,
      dy: (screen.y - press.screen.y - (y - press.pan.y)) / zoom,
    };
  }
  function command(press: ResizePress, delta: Delta): SetCommand | null {
    const { view, block, box, level, mode } = press;
    if (box.kind === "box") {
      const { values } = resize(block, view.settings, actions.metrics, mode, handle, delta);
      return resizeCommand(block, values);
    }
    const places = itemResizeValues(
      view,
      block.id,
      box,
      level,
      mode,
      handle,
      delta,
      actions.metrics,
    );
    return itemResizeCommand(view, block.id, places, level, actions.metrics);
  }
  function show(press: ResizePress, delta: Delta): void {
    previewCommand(actions, press.block.id, press.view, command(press, delta));
  }
  function autoPan(press: ResizePress): void {
    void host.autoPan(press.last).then((panned) => {
      if (panned && press.frame !== null) show(press, deltaOf(press, press.last));
    });
    press.frame = requestAnimationFrame(() => autoPan(press));
  }
  return {
    takes(_event, at) {
      const mode = host.mode();
      if (mode === undefined || host.locked()) return null;
      const { block, box } = host.target();
      const { x, y } = host.viewport();
      return {
        view: actions.view(),
        block,
        box,
        level: host.level(),
        mode,
        screen: at.screen,
        pan: { x, y },
        last: at.screen,
        frame: null,
      };
    },
    start(press) {
      press.frame = requestAnimationFrame(() => autoPan(press));
    },
    value(press, at) {
      press.last = at.screen;
      return deltaOf(press, at.screen);
    },
    preview(press, delta) {
      if (delta !== null) {
        show(press, delta);
        return;
      }
      if (press.frame !== null) cancelAnimationFrame(press.frame);
      press.frame = null;
      actions.preview(press.block.id, null);
    },
    command,
  };
}
