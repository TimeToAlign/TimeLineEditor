/**
 * Picking an element on the canvas for a panel: a panel asks (`start`), the
 * canvas, given `take` while the picking is `active`, answers with the
 * timeline or region a press picks, and Escape, wherever the focus is,
 * cancels. One picking at a time: a new one cancels the last.
 */

import type { Address } from "@timetoalign/tilie-core";
import { createContext } from "svelte";
import { on } from "svelte/events";

export class Picking {
  /** Whether a pick is awaited: the canvas then picks instead of selecting. */
  active = $state(false);
  #answer: ((address: Address | null) => void) | null = null;
  #unlisten: (() => void) | null = null;

  /** Await the address the canvas picks, `null` when cancelled; a pick awaited before is cancelled. */
  start = (): Promise<Address | null> => {
    this.cancel();
    this.active = true;
    // Window capture runs before any element's handler, so Escape reaches nothing else.
    this.#unlisten = on(
      window,
      "keydown",
      (event: KeyboardEvent) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        this.cancel();
      },
      { capture: true },
    );
    return new Promise((resolve) => {
      this.#answer = resolve;
    });
  };

  /** The canvas's answer: the picked timeline or region. */
  take = (address: Address): void => {
    this.#settle(address);
  };

  /** End the awaited pick, if any, with `null`. */
  cancel = (): void => {
    this.#settle(null);
  };

  #settle(address: Address | null): void {
    const answer = this.#answer;
    this.#answer = null;
    this.#unlisten?.();
    this.#unlisten = null;
    this.active = false;
    answer?.(address);
  }
}

/**
 * The editor's picking. Panels mounted without a canvas (alone, in tests)
 * have none, and `hasPicking` says so.
 */
export const [pickingOf, providePicking, hasPicking] = createContext<Picking>();
