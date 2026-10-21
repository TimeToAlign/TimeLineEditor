/**
 * The view follows the store's editing path: opening an editor moves the
 * view to the edited element, closing it moves the view back to where its
 * level was entered from, and a canvas that changes size with an editor
 * open centres the edited element again.
 */

import type { Address, OpenEditor, Store } from "@timetoalign/tilie-core";
import type { FontMetrics } from "@timetoalign/timetoshare";
import { tick, untrack } from "svelte";
import type { Viewport } from "./focus.ts";
import { FOCUS_DURATION, focusViewport, targetBounds } from "./focus.ts";
import type { BlockNode } from "./project.ts";
import { blockOf } from "./selection.ts";

/** What the focus reads from the canvas and does through it. */
export interface FocusHost {
  store(): Store;
  viewport(): Viewport;
  /** Show `next`, over `duration` milliseconds (at once without one). */
  show(next: Viewport, duration?: number): void;
  /** The projected nodes by block id. */
  nodes(): ReadonlyMap<string, BlockNode>;
  metrics(): FontMetrics;
  /** The canvas's element, measured for the area an edited element is centred in. */
  root(): HTMLElement | undefined;
  reducedMotion(): boolean;
}

/** The editor focus of one canvas. Made while the canvas initialises: it follows the store from then on. */
export class EditorFocus {
  readonly #host: FocusHost;
  /**
   * The viewport each open editor was entered from, outermost first: closing
   * an editor moves the view back to where its level was.
   */
  #returns: Viewport[] = [];
  /** Counts the moves to an editor, so a move asked for earlier never lands after a later one. */
  #focusing = 0;
  /** Where a smooth move of the view is heading while it is under way; `null` otherwise. */
  #heading: Viewport | null = null;
  /** The editing path last followed, and the store it belongs to. */
  #followed: { readonly store: Store; readonly editing: readonly OpenEditor[] } | null = null;
  /** The canvas's size in screen pixels when the view last moved to an edited element. */
  #focusedAt: { readonly width: number; readonly height: number } | null = null;

  constructor(host: FocusHost) {
    this.#host = host;
    // The store is external: its changes are followed through its subscription, never
    // through state an effect writes.
    $effect(() => {
      const store = host.store();
      untrack(() => this.follow(store, store.editing));
      return store.subscribe(() => this.follow(store, store.editing));
    });
  }

  /** The view was set from outside (a toolbar, a test): no smooth move is under way any more. */
  moved(): void {
    this.#heading = null;
  }

  /** Move the view to `next`, smoothly unless the reader prefers reduced motion. */
  moveTo(next: Viewport): void {
    const duration = this.#host.reducedMotion() ? 0 : FOCUS_DURATION;
    this.#heading = duration === 0 ? null : next;
    this.#host.show(next, duration);
    if (this.#heading !== null) {
      setTimeout(() => {
        if (this.#heading === next) this.#heading = null;
      }, duration);
    }
  }

  /**
   * Follow the editing path `next` of `store`: an editor opening pushes the
   * viewport and moves the view to the edited element; an editor
   * closing pops the viewport its level was entered from and moves the
   * view back there. A level entered while the view is still moving to the
   * level below returns to where that move was heading, which is where the
   * level below is shown. A store of its own starts with no viewports to go
   * back to.
   */
  follow(store: Store, next: readonly OpenEditor[]): void {
    const followed = this.#followed;
    const before = followed?.store === store ? followed.editing.length : null;
    this.#followed = { store, editing: next };
    if (before === null) {
      this.#returns = [];
      this.#focusing += 1;
      this.#heading = null;
    } else if (next.length > before) {
      const { x, y, zoom } = this.#heading ?? this.#host.viewport();
      for (let level = before; level < next.length; level += 1) this.#returns.push({ x, y, zoom });
      const innermost = next.at(-1);
      if (innermost !== undefined) void this.focusOn(innermost.target);
    } else if (next.length < before) {
      this.#focusing += 1;
      const [back] = this.#returns.splice(next.length);
      if (back !== undefined) this.moveTo(back);
    }
  }

  /**
   * Centre the edited element `target` in the canvas, once the page has
   * settled: the inspector may open with the editor, and the canvas, which
   * lies left of it, is measured after it has. Its width is therefore the
   * area left of the drawer, and no drawer width is taken off. A target that
   * is not drawn (a hidden element) leaves the view where it is.
   */
  async focusOn(target: Address): Promise<void> {
    const asked = ++this.#focusing;
    await tick();
    const node = this.#host.nodes().get(blockOf(target));
    const root = this.#host.root();
    if (asked !== this.#focusing || node === undefined || root === undefined) return;
    let bounds: ReturnType<typeof targetBounds>;
    try {
      bounds = targetBounds(node, target, this.#host.metrics());
    } catch (error) {
      if (error instanceof RangeError) return;
      throw error;
    }
    this.#focusedAt = { width: root.clientWidth, height: root.clientHeight };
    this.moveTo(focusViewport(bounds, this.#focusedAt, 0));
  }

  /**
   * The canvas has changed size (the inspector drawer opening or closing
   * beside it, the window resized): with an editor open, its element is
   * centred again to fill the new area, as on entering. A size the view was
   * already focused at moves nothing, so the measurement that follows an
   * editor's opening (and the drawer opening with it) does not move the view
   * a second time. The viewport an editor returns to on Done stays the one it
   * was entered from.
   */
  resized(): void {
    const innermost = this.#host.store().editing.at(-1);
    const root = this.#host.root();
    if (innermost === undefined || root === undefined) return;
    const at = this.#focusedAt;
    if (at?.width === root.clientWidth && at.height === root.clientHeight) return;
    void this.focusOn(innermost.target);
  }
}
