/**
 * How promises settled, read as Svelte state: a component reading
 * `of(promise)` renders once more when the promise settles and keeps its
 * DOM, where an `{#await}` block would replace one branch by another (and
 * with it, say, a region the user opened).
 */

import { SvelteMap } from "svelte/reactivity";

/** How a promise settled: fulfilled with `value`, or rejected with `failure`. */
export type Settlement<T> =
  | { readonly fulfilled: true; readonly value: T }
  | { readonly fulfilled: false; readonly failure: unknown };

/** The settlements of the promises asked for, held as long as the instance. */
export class Settlements<T> {
  readonly #settled = new SvelteMap<Promise<T>, Settlement<T>>();
  readonly #watched = new WeakSet<Promise<T>>();

  /** How `promise` settled; `undefined` while it is pending. */
  of(promise: Promise<T>): Settlement<T> | undefined {
    if (!this.#watched.has(promise)) {
      this.#watched.add(promise);
      promise.then(
        (value) => this.#settled.set(promise, { fulfilled: true, value }),
        (failure: unknown) => this.#settled.set(promise, { fulfilled: false, failure }),
      );
    }
    return this.#settled.get(promise);
  }
}
