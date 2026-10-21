/**
 * The canvas's own pointer: what a click, a marquee, a double-click and a
 * double tap on the canvas do. Each event's target is read once into a
 * `Pressed` (its node, its descriptor, the drawing point under the
 * pointer), and the selection rules (`selectionRules.ts`) decide; the
 * gestures inside a drawing and on the resize handles are the engine's
 * (`pointerGesture`) and take their presses before these handlers see a
 * click.
 */

import type { Address, View } from "@timetoalign/tilie-core";
import type { FontMetrics } from "@timetoalign/timetoshare";
import type { LevelRules } from "../containers.ts";
import type { Editing } from "../editing.ts";
import type { Point } from "../gesture.ts";
import { CLICK_DISTANCE, drawingPoint, sourceAt } from "../gesture.ts";
import { elementsInRect } from "../marquee.ts";
import type { CanvasNodes } from "../nodes.svelte.ts";
import type { BlockNode } from "../project.ts";
import type { Selection } from "../selection.ts";
import { blockOf, click, selectionOf } from "../selection.ts";
import type { DoubleClick, Pressed, Tap } from "../selectionRules.ts";
import { clickedAt, doubleClickAt, doubleTap, ON_PANE, pressedIn } from "../selectionRules.ts";

/** What the canvas's pointer reads from the canvas and does through it. */
export interface PointerHost {
  view(): View;
  metrics(): FontMetrics;
  readonly nodes: CanvasNodes;
  selection(): Selection;
  select(next: Selection): void;
  editing(): Editing | null;
  rules(): LevelRules;
  /** Whether the marquee toggle is on: dragging draws a marquee, clicks and marquees add. */
  marquee(): boolean;
  /** The canvas point under the client point `client`; `undefined` before the flow exists. */
  toCanvas(client: Point): Point | undefined;
  /**
   * Close the innermost editor (`DONE`), centre the view on the edited
   * element again (`RECENTRE`), or open the editor of an address.
   */
  act(action: DoubleClick): void;
}

/**
 * Where, on what and by which kind of pointer the last primary press on the
 * canvas landed, and the canvas point under it then (`at`), which stays put
 * when Svelte Flow pans during a marquee.
 */
interface Press extends Point {
  readonly at: Point | null;
  readonly target: EventTarget | null;
  readonly pointerType: string;
}

function isClick(from: Point, to: { clientX: number; clientY: number }): boolean {
  return Math.hypot(to.clientX - from.x, to.clientY - from.y) <= CLICK_DISTANCE;
}

/** The canvas's pointer handlers, each bound to the canvas it was made for. */
export class CanvasPointer {
  readonly #host: PointerHost;
  #press: Press | null = null;
  /** The last tap of a touch that could act as a double-click. */
  #tap: Tap | null = null;

  constructor(host: PointerHost) {
    this.#host = host;
  }

  /** What `target` is, read once from its event: its node, its descriptor, the drawing point at `client`. */
  pressedAt(target: EventTarget | null, client?: Point): Pressed {
    const id =
      target instanceof Element
        ? target.closest(".svelte-flow__node[data-id]")?.getAttribute("data-id")
        : undefined;
    return {
      node: id == null ? undefined : this.#host.nodes.byId.get(id),
      source: sourceAt(target),
      point: client === undefined ? null : drawingPoint(target, client),
      pane: target instanceof Element && target.classList.contains("svelte-flow__pane"),
    };
  }

  /** The selection after a click on `address`: Shift, or the marquee toggle, adds or removes. */
  clicked(address: Address | null, event: { shiftKey: boolean }): Selection {
    const selection = this.#host.selection();
    return address === null
      ? selection
      : click(selection, address, event.shiftKey || this.#host.marquee());
  }

  /** What a press on the target of `event` (a key's: the focused element) selects, as a click would. */
  pressedBy(event: KeyboardEvent): Selection | null {
    // The node itself carries no address, so the press hits the block itself.
    const pressed = this.pressedAt(event.target);
    return pressed.node === undefined
      ? null
      : this.clicked(pressedIn(pressed, this.#host.editing()), event);
  }

  /**
   * The selection decides which nodes are selected, never Svelte Flow, which
   * sets its nodes' `selected` flags itself on a click and writes them back
   * through `bind:nodes`; once its handling is over, the projection is shown
   * again, so the flags show the selection even when it did not change.
   */
  #reassert(): void {
    queueMicrotask(() => {
      this.#host.nodes.resync += 1;
    });
  }

  /**
   * The selection after a click on `pressed` (`clickedAt`): Shift, or the
   * marquee toggle, adds or removes; the pane and, in an editor, whatever lies
   * outside the edited element clear it.
   */
  #clickedOn(pressed: Pressed, event: { shiftKey: boolean }): Selection {
    const host = this.#host;
    return clickedAt(host.selection(), pressed, host.editing(), {
      shift: event.shiftKey,
      additive: event.shiftKey || host.marquee(),
    });
  }

  readonly nodeclick = ({ event }: { node: BlockNode; event: MouseEvent | TouchEvent }): void => {
    const client = "clientX" in event ? { x: event.clientX, y: event.clientY } : undefined;
    this.#host.select(this.#clickedOn(this.pressedAt(event.target, client), event));
    this.#reassert();
  };

  readonly paneclick = ({ event }: { event: MouseEvent }): void => {
    this.#host.select(this.#clickedOn(ON_PANE, event));
    this.#reassert();
  };

  /**
   * The marquee's result: on the arranger the blocks Svelte Flow marked; in an
   * editor the elements inside the edited element lying wholly in the
   * rectangle from the press to the release. A marquee ending within the
   * click distance is the click it was. Shift+drag replaces the selection;
   * with the marquee toggle on, the result is added to it.
   */
  readonly selectionend = (event: PointerEvent): void => {
    const host = this.#host;
    const press = this.#press;
    this.#reassert();
    if (press !== null && isClick(press, event)) {
      const pressed = this.pressedAt(press.target, press);
      host.select(this.#clickedOn(pressed.node === undefined ? ON_PANE : pressed, event));
      return;
    }
    const marked = host.rules().marquee === "blocks" ? this.#markedBlocks() : this.#marked(event);
    host.select(selectionOf(host.marquee() ? [...host.selection().values(), ...marked] : marked));
  };

  #markedBlocks(): Address[] {
    return this.#host.nodes.nodes
      .filter((node) => node.selected)
      .map((node) => ({ block: node.id }));
  }

  #marked(event: PointerEvent): Address[] {
    const host = this.#host;
    const editing = host.editing();
    const node = editing === null ? undefined : host.nodes.byId.get(blockOf(editing.target));
    const from = this.#press?.at;
    const to = host.toCanvas({ x: event.clientX, y: event.clientY });
    if (node === undefined || from == null || to === undefined) return [];
    const rect = {
      x: Math.min(from.x, to.x),
      y: Math.min(from.y, to.y),
      width: Math.abs(to.x - from.x),
      height: Math.abs(to.y - from.y),
    };
    return elementsInRect(node, rect, node.data.inside, host.metrics());
  }

  /** A double-click opens what it hit, or outside the edited element closes the innermost editor. */
  readonly dblclick = (event: MouseEvent): void => {
    // A touch's double tap is read from its taps (`pointerupcapture`), never twice.
    if (this.#press?.pointerType === "touch") return;
    const client = { x: event.clientX, y: event.clientY };
    const host = this.#host;
    const action = doubleClickAt(host.view(), this.pressedAt(event.target, client), host.editing());
    if (action !== null) host.act(action);
  };

  /** Two taps act as a double-click (`doubleTap`); a tap is a touch released as a click. */
  readonly pointerupcapture = (event: PointerEvent): void => {
    if (event.pointerType !== "touch" || !event.isPrimary) return;
    const host = this.#host;
    const client = { x: event.clientX, y: event.clientY };
    const press = this.#press;
    const action =
      press !== null && isClick(press, event)
        ? doubleClickAt(host.view(), this.pressedAt(event.target, client), host.editing())
        : null;
    const next: Tap | null = action === null ? null : { ...client, time: event.timeStamp, action };
    if (next !== null && doubleTap(this.#tap, next)) {
      this.#tap = null;
      host.act(next.action);
    } else {
      this.#tap = next;
    }
  };

  /** A primary press records itself. */
  readonly pointerdowncapture = (event: PointerEvent): void => {
    if (!event.isPrimary || event.button !== 0) return;
    const client = { x: event.clientX, y: event.clientY };
    this.#press = {
      ...client,
      at: this.#host.toCanvas(client) ?? null,
      target: event.target,
      pointerType: event.pointerType,
    };
  };
}
