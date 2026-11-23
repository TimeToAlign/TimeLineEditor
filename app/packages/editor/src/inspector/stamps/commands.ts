/**
 * The commands the stamp tabs and the Elisions tab share: the one toggle
 * of a `display` (a named timestamp's, an alignment anchor's, an elision's),
 * and how the Matchstamp tab's sections send a command: an editor changes
 * nothing outside what it edits, so a MatchStamp command of block `block`
 * first closes every group and timeline editor, and a bundle editor of
 * another block, then dispatches.
 */

import type { LiveStore } from "@timetoalign/tilie-arranger";
import type { Address, Command, Problem } from "@timetoalign/tilie-core";

/**
 * The words `shown` with `word` toggled: taken out where shown, else put in
 * its place in `order`, the words' canonical order.
 */
export function toggledDisplay<Word extends string>(
  order: readonly Word[],
  shown: readonly Word[],
  word: Word,
): Word[] {
  return shown.includes(word)
    ? shown.filter((item) => item !== word)
    : order.filter((item) => item === word || shown.includes(item));
}

/**
 * The `set` of the `display` of the element at `target`, `shown` now, with
 * `word` toggled (`toggledDisplay`): the one display toggle of a named
 * timestamp, an alignment anchor and a stored elision.
 */
export function displayCommand<Word extends string>(
  target: Address,
  order: readonly Word[],
  shown: readonly Word[],
  word: Word,
): Command {
  return {
    type: "set",
    changes: [{ target, values: { display: toggledDisplay(order, shown, word) } }],
  };
}

/** Close the editors a MatchStamp command of block `block` cannot run in, then dispatch `command`. */
export function dispatchMatchStamp(
  live: LiveStore,
  block: string,
  command: Command,
): Problem | null {
  const { store } = live;
  for (let open = store.editing.at(-1); open !== undefined; open = store.editing.at(-1)) {
    if (open.kind === "bundle" && open.target.block === block) break;
    store.done();
  }
  return store.dispatch(command);
}
