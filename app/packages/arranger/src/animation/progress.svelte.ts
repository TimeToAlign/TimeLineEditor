/**
 * The one progress every motion of the canvas between two drawings runs on
 * (decision record 0034): a number from 0 to 1 moved over animation frames.
 */

import { UNFOLD_EASING } from "./unfold.ts";

/**
 * A number moving to a target over animation frames, eased by
 * `UNFOLD_EASING`, read reactively; set again while moving, it starts from
 * where it stands. `svelte/motion`'s `Tween` would do the same, but loading
 * that module makes its `prefersReducedMotion` query at once, before a test
 * can give the page a `matchMedia`, so the canvas loads no part of it.
 */
export class Progress {
  #current = $state(0);
  #target: number;
  #frame = 0;

  constructor(value: number) {
    this.#current = value;
    this.#target = value;
  }

  get current(): number {
    return this.#current;
  }

  get target(): number {
    return this.#target;
  }

  /** Move to `target` over `duration` milliseconds from the current value; at once for none. */
  to(target: number, duration: number): void {
    this.stop();
    this.#target = target;
    const from = this.#current;
    if (duration <= 0 || from === target) {
      this.#current = target;
      return;
    }
    const start = performance.now();
    const step = () => {
      const elapsed = performance.now() - start;
      if (elapsed >= duration) {
        this.#current = target;
        return;
      }
      this.#current = from + (target - from) * UNFOLD_EASING(elapsed / duration);
      this.#frame = requestAnimationFrame(step);
    };
    this.#frame = requestAnimationFrame(step);
  }

  /** Stop where it stands. */
  stop(): void {
    cancelAnimationFrame(this.#frame);
  }
}
