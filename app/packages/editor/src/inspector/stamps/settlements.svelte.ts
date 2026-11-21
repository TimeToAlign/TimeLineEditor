/**
 * How a promise settled, read as Svelte state: a component reading
 * `of(promise)` renders once more when the promise settles and keeps its
 * DOM, where an `{#await}` block would replace one branch by another (and
 * with it, say, a region the user opened).
 */

/** How a promise settled: fulfilled with `value`, or rejected with `failure`. */
export type Settlement<T> =
  | { readonly fulfilled: true; readonly value: T }
  | { readonly fulfilled: false; readonly failure: unknown };

/**
 * The settlement of the promise asked for last, and of no other: a
 * component asking for one read after another holds one promise and its
 * value at a time.
 */
export class Settlements<T> {
  /** The promise asked for last. */
  #asked: Promise<T> | null = null;
  /** Its settlement, once it settled. */
  #settled: Settlement<T> | null = null;
  /**
   * Counts the settlements taken, so a reader of `of` reads again when one
   * is. The two fields above are plain: `of` writes them, and it runs
   * inside deriveds, which may write no state.
   */
  #taken = $state(0);

  /**
   * How `promise` settled; `undefined` while it is pending. Asking for
   * another promise than the last lets the last one go: its settlement,
   * held or still to come, is no longer kept.
   */
  of(promise: Promise<T>): Settlement<T> | undefined {
    void this.#taken;
    if (promise !== this.#asked) {
      this.#asked = promise;
      this.#settled = null;
      promise.then(
        (value) => this.#settle(promise, { fulfilled: true, value }),
        (failure: unknown) => this.#settle(promise, { fulfilled: false, failure }),
      );
    }
    return this.#settled ?? undefined;
  }

  #settle(promise: Promise<T>, settlement: Settlement<T>): void {
    if (promise !== this.#asked || this.#settled !== null) return;
    this.#settled = settlement;
    this.#taken += 1;
  }
}
