/**
 * The motion of a block's cards when its drawing changes (decision record
 * 0034, applied to elisions): an elided card turning whole or back, its
 * strips changed or its proportion moving sideways, an ancestor card shown
 * or hidden unfolding out of its member card or folding back into it. What
 * moves is `elide.ts`'s `blockMotion` between the drawing before a change
 * and the drawing after it; the progress is the raise's (`Progress`).
 */

import type { TextMeasure } from "@timetoalign/tilie-layout";
import { untrack } from "svelte";
import type { BlockMotion, Drawn, LeavingCard } from "./elide.ts";
import { blockMotion } from "./elide.ts";
import { Progress } from "./progress.svelte.ts";
import type { Placed } from "./unfold.ts";
import { durationOf, placedAt } from "./unfold.ts";

/** No motion: what is shown when nothing moves. */
const STILL: BlockMotion = { cards: [], leaving: [] };

/**
 * Follows a block's drawing (`drawn`): each new drawing moves its cards
 * from the drawing before (`blockMotion`) over `UNFOLD_DURATION`, a new
 * change starting its own motion from the drawing it replaces. A drawing
 * that comes while `still()` (a gesture's or a control's preview, which
 * must lie where the pointer puts it) or while `reduced()` moves nothing,
 * nor does the first drawing. Made while a component is initialised: its
 * effects are the component's, and its motion stops when the component is
 * destroyed. The canvas reads the drawing at rest: the pointer never waits
 * for a motion.
 */
export class CardMotions {
  readonly #measure: TextMeasure;
  readonly #progress = new Progress(1);
  /** The drawing last followed: the one a change moves from. Read only where the drawing changes, so no state. */
  #previous: Drawn;
  /** What moves towards the drawing shown, set where the drawing changes (as `Unfolding` sets its progress). */
  #motion: BlockMotion = $state.raw(STILL);

  constructor(
    drawn: () => Drawn,
    measure: TextMeasure,
    reduced: () => boolean,
    still: () => boolean,
  ) {
    this.#measure = measure;
    this.#previous = untrack(drawn);
    $effect.pre(() => {
      const next = drawn();
      untrack(() => this.#follow(next, reduced() || still()));
    });
    $effect(() => () => this.#progress.stop());
  }

  /** Move from the drawing followed last to `next`, at once while `instant`. */
  #follow(next: Drawn, instant: boolean): void {
    const before = this.#previous;
    if (before.drawing === next.drawing) return;
    this.#previous = next;
    const motion = instant ? STILL : blockMotion(before, next, this.#measure);
    const moves = motion.cards.length > 0 || motion.leaving.length > 0;
    this.#motion = moves ? motion : STILL;
    this.#progress.to(moves ? 0 : 1, 0);
    if (moves) this.#progress.to(1, durationOf(0, 1, false));
  }

  /** Whether anything is moving: a motion is under way and not at rest. */
  get moving(): boolean {
    return this.#motion !== STILL && this.#progress.current < 1;
  }

  /** The progress of the motion under way, eased: 0 where it starts, 1 at rest. */
  get progress(): number {
    return this.#progress.current;
  }

  /**
   * Where the element at `element` of the drawing shown lies now, `null`
   * where it lies at rest: no motion under way, or none moving it.
   */
  placedOf(element: number): Placed | null {
    const t = this.#progress.current;
    if (t >= 1) return null;
    for (const card of this.#motion.cards) {
      if (element >= card.start && element < card.end) return placedAt(card.motionOf(element), t);
    }
    return null;
  }

  /** The cards the drawing shown no longer draws while they fold back; none at rest. */
  get leaving(): readonly LeavingCard[] {
    return this.#progress.current < 1 ? this.#motion.leaving : [];
  }
}
