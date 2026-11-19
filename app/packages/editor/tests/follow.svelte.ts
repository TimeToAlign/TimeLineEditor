/** Follow a reactive reading outside a component, as a `$derived` in one would. */

/** The values `read` gives, its first and then one per change Svelte propagates; `stop` ends following. */
export function follow<T>(read: () => T): { readonly values: T[]; stop(): void } {
  const values: T[] = [];
  const stop = $effect.root(() => {
    const value = $derived(read());
    $effect(() => {
      values[values.length] = value;
    });
  });
  return { values, stop };
}
