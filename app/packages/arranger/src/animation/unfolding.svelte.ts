/**
 * The progress of a raise (decision record 0034): which root's ancestor
 * cards a block shows raised, and how far they have unfolded, from 0 (the
 * member card's places) to 1 (the drawing at rest). What it draws at a
 * progress is `unfold.ts`'s.
 */

import { untrack } from "svelte";
import { Progress } from "./progress.svelte.ts";
import { durationOf } from "./unfold.ts";

/**
 * Follows `raised`, the root the open editor raises (`raisedRoot`, else
 * `null`): a newly raised root unfolds from 0 to 1; a root no longer raised
 * folds back from where its motion stands to 0 and is shown raised until it
 * gets there; raising it again on the way reverses from there. Each motion
 * takes the part of `UNFOLD_DURATION` its distance is (`durationOf`), none
 * while `reduced()`, so the raise is then a plain switch. A root raised
 * when the binding is made shows unfolded at once. Made while a component
 * is initialised: its effects are the component's, and its motion stops
 * when the component is destroyed.
 */
export class Unfolding {
  readonly #raised: () => string | null;
  readonly #progress: Progress;
  /** The root raised last: the one shown while its cards fold back. Read where `raised()` is read, so no state. */
  #held: string | null;

  constructor(raised: () => string | null, reduced: () => boolean) {
    const initial = untrack(raised);
    this.#raised = raised;
    this.#held = initial;
    this.#progress = new Progress(initial === null ? 0 : 1);
    $effect.pre(() => {
      const root = raised();
      untrack(() => this.#follow(root, reduced()));
    });
    $effect(() => () => this.#progress.stop());
  }

  /** Move the progress towards what the raised root `root` asks. */
  #follow(root: string | null, reduced: boolean): void {
    const progress = this.#progress;
    if (root !== null && root !== this.#held) {
      this.#held = root;
      progress.to(0, 0);
    }
    const target = root === null ? 0 : 1;
    if (progress.target === target && progress.current === target) return;
    progress.to(target, durationOf(progress.current, target, reduced));
  }

  /** The root whose ancestor cards are shown raised: the raised one, else the one folding back, else `null`. */
  get root(): string | null {
    const raised = this.#raised();
    if (raised !== null) return raised;
    return this.#progress.current > 0 ? this.#held : null;
  }

  /** How far the shown root's cards have unfolded, eased: 0 at the member card's places, 1 at rest. */
  get progress(): number {
    return this.#progress.current;
  }

  /** Whether the shown root's cards are moving: shown and not at rest. */
  get moving(): boolean {
    return this.root !== null && this.#progress.current < 1;
  }
}
