/**
 * How the Matchstamp tab's sections send a command: an editor changes
 * nothing outside what it edits, so a MatchStamp command of block `block`
 * first closes every group and timeline editor, and a bundle editor of
 * another block, then dispatches.
 */

import type { LiveStore } from "@timetoalign/tilie-arranger";
import type { Command, Problem } from "@timetoalign/tilie-core";

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
